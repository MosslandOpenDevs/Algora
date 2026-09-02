import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { cacheMiddleware, globalLimiter } from './middleware';
import { pinoHttp } from 'pino-http';
import { logger } from './logger';

import { initDatabase } from './db';
import { seedAgents } from './agents/seed';
import { setupRoutes } from './routes';
import { setupSocketHandlers, getAgoraService } from './services/socket';
import { ActivityService } from './activity';
import { SchedulerService } from './scheduler';
import { ChatterService } from './services/chatter';
import { llmService } from './services/llm';
import { SignalCollectorService } from './services/collectors';
import { v4 as uuidv4 } from 'uuid';
import { IssueDetectionService } from './services/issue-detection';
import { GovernanceService } from './services/governance';
import { ProofOfOutcomeService } from './services/proof-of-outcome';
import { TokenIntegrationService } from './services/token';
import { GovernanceOSBridge } from './services/governance-os-bridge';
import { DisclosureService } from './services/disclosure';
import { ReportGeneratorService } from './services/report-generator';
import { PassiveConsensusService } from './services/passive-consensus';
import { RAGService } from './services/rag-service';
import { QualityGateService } from './services/quality-gate-service';
import { SignatureService } from './services/signature';

const PORT = process.env.PORT || 3201;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Resilience: a stray async error must not crash-loop this 24/7 service
// (2026-08-04: an unhandled SqliteError rejection from a session timer
// killed the process ~57x/day). Log rejections and keep serving. Uncaught
// synchronous exceptions still exit — state may be inconsistent — and pm2
// restarts us with a clear marker in the log.
process.on('unhandledRejection', reason => {
  console.error('[Process] Unhandled rejection:', reason);
});
process.on('uncaughtException', error => {
  console.error('[Process] Uncaught exception (exiting):', error);
  process.exit(1);
});

const app: ReturnType<typeof express> = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new SocketServer(httpServer, {
  cors: {
    origin:
      NODE_ENV === 'development'
        ? ['http://localhost:3200', 'http://127.0.0.1:3200']
        : process.env.CORS_ORIGIN?.split(',') || [],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Cap inbound payloads at 256KB — agora messages and vote envelopes are
  // well under that; the default 1MB invites DoS via giant emits.
  maxHttpBufferSize: 256 * 1024,
  // Disconnect clients that stop responding to pings within 60s.
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

// Middleware
// Helmet security headers. CSP stays off for the JSON API (no inline HTML
// served here; the Next.js app owns its own CSP), but we enable HSTS in
// production and standard defaults everywhere.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow Next.js dev server to fetch
    hsts:
      NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: 'no-referrer' },
  })
);
app.use(
  cors({
    origin:
      NODE_ENV === 'development'
        ? ['http://localhost:3200', 'http://127.0.0.1:3200']
        : process.env.CORS_ORIGIN?.split(',') || [],
    credentials: true,
  })
);

// HTTP Compression - reduces payload size by 70-85%
app.use(
  compression({
    level: 6, // Balanced compression level (1-9, higher = more compression but slower)
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      // Don't compress if client doesn't accept it
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Use default filter (compresses text-based responses)
      return compression.filter(req, res);
    },
  })
);

// HTTP Caching Headers - reduces redundant requests by 40%
app.use(cacheMiddleware);

// Structured request logging via pino-http. Adds a correlation id, logs
// method/status/latency, and warns on slow requests (>500ms). Also still
// emits the Server-Timing header for DevTools.
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res) => `${req.method} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${res.statusCode}`,
    serializers: {
      req: req => ({ method: req.method, url: req.url, id: req.id }),
      res: res => ({ statusCode: res.statusCode }),
    },
  })
);
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const originalEnd = res.end.bind(res);
  res.end = function (...args: Parameters<typeof originalEnd>) {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    res.setHeader(
      'Server-Timing',
      `total;dur=${durationMs.toFixed(1)};desc="Total"`
    );
    if (durationMs > 500) {
      (req as any).log?.warn(
        { durationMs, url: req.originalUrl },
        'slow-request'
      );
    }
    return originalEnd(...args);
  } as typeof res.end;
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Trust proxy (nginx/pm2) so rate limiter uses real client IP
app.set('trust proxy', 1);

// Global rate limit (applies to all routes registered below).
// 300 req/min is generous for the dashboard; writes layer stricter limits.
app.use(globalLimiter);

// Server start time for uptime calculation
const serverStartTime = Date.now();

// Security event logging — forward LLM budget breaches to the structured
// log so they show up next to request/error lines in the log stream.
function setupSecurityEventLogging(): void {
  llmService.on('budget:exceeded', (event: { provider: string }) => {
    logger.warn(
      { event: 'budget:exceeded', provider: event.provider },
      'Tier 2 budget exceeded'
    );
  });
  llmService.on('thermal:fallback', event => {
    logger.info(
      { event: 'thermal:fallback', ...event },
      'LLM thermal fallback to Tier 2'
    );
  });
}

// Budget guard — hard stop for Tier 2 LLM calls when daily spend exceeds
// the per-provider limit. Cached for 10s to avoid a DB round-trip per request.
function setupBudgetGuard(db: ReturnType<typeof initDatabase>): void {
  type CacheEntry = { allowed: boolean; expiresAt: number };
  const cache = new Map<string, CacheEntry>();
  const TTL_MS = 10_000;

  llmService.setBudgetChecker(provider => {
    const now = Date.now();
    const cached = cache.get(provider);
    if (cached && cached.expiresAt > now) return cached.allowed;

    try {
      const today = new Date().toISOString().split('T')[0];
      const config = db
        .prepare(
          'SELECT daily_budget_usd, enabled FROM budget_config WHERE provider = ?'
        )
        .get(provider) as
        { daily_budget_usd: number; enabled: number } | undefined;

      // No config, or disabled → deny (fail-safe)
      if (!config || !config.enabled) {
        cache.set(provider, { allowed: false, expiresAt: now + TTL_MS });
        return false;
      }

      const usage = db
        .prepare(
          'SELECT SUM(estimated_cost_usd) as spent FROM budget_usage WHERE provider = ? AND date = ?'
        )
        .get(provider, today) as { spent: number | null } | undefined;

      const spent = usage?.spent ?? 0;
      const allowed = spent < config.daily_budget_usd;
      if (!allowed) {
        console.warn(
          `[Budget] Hard stop: ${provider} spent $${spent.toFixed(4)} >= $${config.daily_budget_usd}`
        );
      }
      cache.set(provider, { allowed, expiresAt: now + TTL_MS });
      return allowed;
    } catch (err) {
      console.error('[Budget] Guard query failed, denying:', err);
      return false;
    }
  });
  console.info('[Budget] Hard-stop guard installed for Tier 2 providers');
}

// LLM Cost Tracking - records all LLM generation events to budget_usage table
function setupLLMCostTracking(db: ReturnType<typeof initDatabase>): void {
  // Get pricing config from database
  const getConfig = db.prepare(
    'SELECT * FROM budget_config WHERE provider = ?'
  );

  llmService.on(
    'generation',
    (event: {
      tier: number;
      model: string;
      tokensUsed?: number;
      inputTokens?: number;
    }) => {
      const { tier, model, tokensUsed, inputTokens } = event;

      // Determine provider from tier and model
      let provider: string;
      if (tier === 1) {
        provider = 'ollama';
      } else if (model.includes('claude')) {
        provider = 'anthropic';
      } else if (model.includes('gpt')) {
        provider = 'openai';
      } else if (model.includes('gemini')) {
        provider = 'google';
      } else {
        provider = 'unknown';
      }

      const date = new Date().toISOString().split('T')[0];
      const hour = new Date().getHours();
      const outputTokens = tokensUsed || 0;

      // Get pricing for cost estimation. Input tokens dominate this workload
      // (measured 7.35:1 input:output on deliberation), so pricing output only
      // under-measured spend by 2.5-4x and made the daily ceiling meaningless.
      let estimatedCost = 0;
      if (tier === 2) {
        const config = getConfig.get(provider) as
          | { output_token_price: number; input_token_price?: number }
          | undefined;
        if (config) {
          estimatedCost =
            outputTokens * config.output_token_price +
            (inputTokens || 0) * (config.input_token_price ?? 0);
        }
      }

      // Upsert to budget_usage
      try {
        db.prepare(
          `
        INSERT INTO budget_usage (id, provider, tier, date, hour, output_tokens, estimated_cost_usd, call_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(provider, tier, date, hour) DO UPDATE SET
          output_tokens = output_tokens + excluded.output_tokens,
          estimated_cost_usd = estimated_cost_usd + excluded.estimated_cost_usd,
          call_count = call_count + 1
      `
        ).run(
          uuidv4(),
          provider,
          tier,
          date,
          hour,
          outputTokens,
          estimatedCost
        );

        console.log(
          `[LLM-TRACK] Tier ${tier} ${provider} - ${outputTokens} tokens, $${estimatedCost.toFixed(6)}`
        );
      } catch (error) {
        console.error('[LLM-TRACK] Failed to record usage:', error);
      }
    }
  );

  console.info('[LLM-TRACK] Cost tracking initialized');
}

// Health check with real data
app.get('/health', (req, res) => {
  const db = req.app.locals.db;
  const schedulerService = req.app.locals.schedulerService;

  // Calculate uptime in seconds
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);

  // Default response if services not initialized
  if (!db) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      uptime,
    });
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Get budget status
    const budgetConfigs = db
      .prepare(
        `
      SELECT provider, daily_budget_usd FROM budget_config WHERE enabled = 1 AND provider != 'ollama'
    `
      )
      .all() as Array<{ provider: string; daily_budget_usd: number }>;

    const totalDailyBudget = budgetConfigs.reduce(
      (sum, c) => sum + c.daily_budget_usd,
      0
    );

    const usageResult = db
      .prepare(
        `
      SELECT SUM(estimated_cost_usd) as total_spent FROM budget_usage WHERE date = ?
    `
      )
      .get(today) as { total_spent: number | null } | undefined;

    const todaySpent = usageResult?.total_spent || 0;
    const remaining = Math.max(0, totalDailyBudget - todaySpent);

    // Get scheduler status
    let schedulerStatus = null;
    if (schedulerService) {
      const status = schedulerService.getStatus();
      // Calculate next Tier2 run time based on scheduled hours
      const now = new Date();
      const currentHour = now.getHours();
      const tier2Hours = status.config.tier2ScheduledRuns || [6, 12, 18, 23];

      let nextHour = tier2Hours.find((h: number) => h > currentHour);
      if (!nextHour) {
        // Wrap to next day
        nextHour = tier2Hours[0];
        now.setDate(now.getDate() + 1);
      }
      now.setHours(nextHour, 0, 0, 0);

      // Get queue length (pending tasks)
      const queueResult = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM scheduler_tasks WHERE status = 'pending'
      `
        )
        .get() as { count: number } | undefined;

      schedulerStatus = {
        isRunning: status.isRunning,
        nextTier2: now.toISOString(),
        queueLength: queueResult?.count || 0,
        tier2Hours: tier2Hours,
      };
    }

    // Get agent counts
    const agentResult = db
      .prepare(
        `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN s.status IN ('active', 'speaking', 'listening') THEN 1 ELSE 0 END) as active
      FROM agents a
      LEFT JOIN agent_states s ON a.id = s.agent_id
      WHERE a.is_active = 1
    `
      )
      .get() as { total: number; active: number } | undefined;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      uptime,
      budget: {
        daily: totalDailyBudget,
        spent: todaySpent,
        remaining: remaining,
      },
      scheduler: schedulerStatus,
      agents: {
        total: agentResult?.total || 0,
        active: agentResult?.active || 0,
      },
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      uptime,
    });
  }
});

// Initialize services
async function bootstrap() {
  try {
    // Initialize database
    console.info('Initializing database...');
    const db = initDatabase();

    // Re-seed the agent roster on every boot (INSERT OR REPLACE — idempotent).
    // Seeding previously only ran on manual `pnpm db:init`, so roster changes
    // in code left stale rosters in prod; messages inserted under a missing
    // agent id then failed their FK and crash-looped the process.
    seedAgents(db);

    // Make db available to routes
    app.locals.db = db;
    app.locals.io = io;
    app.locals.llmService = llmService;

    // Setup LLM cost tracking - record all generation events to budget_usage
    setupLLMCostTracking(db);

    // Install budget hard-stop guard — must run after DB init, before routes
    // so the first Tier 2 call can't bypass it.
    setupBudgetGuard(db);
    setupSecurityEventLogging();

    // Setup routes
    setupRoutes(app);

    // Initialize GovernanceOS Bridge (v2.0 integration) - BEFORE socket handlers
    const governanceOSBridge = new GovernanceOSBridge(db, io);
    app.locals.governanceOSBridge = governanceOSBridge;
    console.info('[GovernanceOS] Bridge initialized - v2.0 packages connected');

    // Setup Socket.IO handlers with bridge
    setupSocketHandlers(io, db, governanceOSBridge);

    // Initialize activity service
    const activityService = new ActivityService(db, io);
    app.locals.activityService = activityService;

    // Initialize chatter service for agent idle messages
    const chatterService = new ChatterService(db, io);
    app.locals.chatterService = chatterService;

    // Initialize signal collector service
    const signalCollector = new SignalCollectorService(db, io);
    app.locals.signalCollector = signalCollector;

    // Initialize scheduler for Tier 0/1/2 operations
    const schedulerService = new SchedulerService(db, io, activityService);
    schedulerService.setGovernanceOSBridge(governanceOSBridge);
    app.locals.schedulerService = schedulerService;

    // Expose KPI service for route access
    app.locals.kpiService = schedulerService.getKPIPersistenceService();

    // Start heartbeat
    activityService.startHeartbeat();

    // Start chatter service (generates agent idle messages)
    chatterService.start();

    // Start signal collectors
    signalCollector.start();

    // Start scheduler (Tier 0/1/2 task processing)
    schedulerService.start();
    console.info('[Scheduler] Started - Tier 0/1/2 task processing active');

    // Initialize issue detection service
    const issueDetection = new IssueDetectionService(db, io);
    issueDetection.setGovernanceOSBridge(governanceOSBridge);
    app.locals.issueDetection = issueDetection;

    // Start issue detection (runs after signal collectors have initial data)
    setTimeout(() => issueDetection.start(), 60000); // Start after 1 minute

    // Initialize governance service
    const governance = new GovernanceService(db, io);
    governance.setGovernanceOSBridge(governanceOSBridge);
    app.locals.governance = governance;
    app.locals.proposalService = governance.proposals;

    // Connect proposal service to scheduler for auto-progress and voting resolution
    schedulerService.setProposalService(governance.proposals);

    // Connect Agora service for periodic stale-session cleanup
    const agoraSvc = getAgoraService();
    if (agoraSvc) {
      schedulerService.setAgoraService(agoraSvc);
      // The bridge needs it too: an extended-discussion escalation has to
      // create its follow-up deliberation through the orchestrator, or the
      // session never starts and the escalation never closes.
      governanceOSBridge.setAgoraService(agoraSvc);
    } else {
      console.error(
        '[Startup] Agora orchestrator unavailable — extended-discussion escalations cannot run'
      );
    }

    // Retire escalations left waiting on a session that could never start.
    // No-op once the deployment above has been through one cycle.
    const reconciled = governanceOSBridge.reconcileStrandedEscalations();
    if (reconciled.retired > 0) {
      console.warn(
        `[Startup] Retired ${reconciled.retired} stranded escalation(s)`
      );
    }

    // Initialize proof of outcome service
    const proofOfOutcome = new ProofOfOutcomeService(db, io);
    app.locals.proofOfOutcome = proofOfOutcome;

    // Initialize token integration service
    const tokenIntegration = new TokenIntegrationService(db, io);
    // Share the governance audit chain so treasury movements are recorded in the
    // same tamper-evident log as votes, rather than nowhere.
    tokenIntegration.treasury.setAuditService(governance.audit);
    schedulerService.setTokenVotingService(tokenIntegration.voting);
    app.locals.tokenIntegration = tokenIntegration;

    // Initialize disclosure service
    const disclosure = new DisclosureService(db, io);
    app.locals.disclosure = disclosure;

    // Initialize report generator service
    const reportGenerator = new ReportGeneratorService(db, io);
    app.locals.reportGenerator = reportGenerator;
    schedulerService.setReportGenerator(reportGenerator);
    console.info(
      '[ReportGenerator] Service initialized (scheduled generation: see scheduler)'
    );

    // Initialize passive consensus service
    const passiveConsensusService = new PassiveConsensusService(
      db,
      io,
      activityService
    );
    app.locals.passiveConsensusService = passiveConsensusService;
    schedulerService.setPassiveConsensusService(passiveConsensusService);
    console.info(
      '[PassiveConsensus] Service initialized - opt-out approval model active'
    );

    // Initialize RAG service
    const ragService = new RAGService(db, io);
    app.locals.ragService = ragService;
    console.info(
      '[RAG] Service initialized - semantic search for governance documents'
    );

    // Initialize Quality Gate service
    const qualityGateService = new QualityGateService(db, io);
    app.locals.qualityGateService = qualityGateService;
    console.info(
      '[QualityGate] Service initialized - LLM output validation active'
    );

    // Initialize Signature service — EIP-712 verification for votes.
    // Enforcement is opt-in via env var; default off so the pre-wallet
    // frontend keeps working, but signed votes are always verified.
    const sigEnforced = process.env.REQUIRE_VOTE_SIGNATURE === 'true';
    const signatureService = new SignatureService(db, sigEnforced);
    app.locals.signatureService = signatureService;
    console.info(`[Signature] Service initialized (enforced=${sigEnforced})`);

    // Log LLM availability
    console.info(
      `[LLM] Tier 1 (Ollama): ${llmService.isTier1Available() ? 'Available' : 'Not Available'}`
    );
    console.info(
      `[LLM] Tier 2 configured: ${llmService.getConfig().tier2.anthropic ? 'Anthropic' : ''} ${llmService.getConfig().tier2.openai ? 'OpenAI' : ''} ${llmService.getConfig().tier2.gemini ? 'Gemini' : ''}`.trim()
    );

    // Start server
    httpServer.listen(PORT, () => {
      console.info(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║     █████╗ ██╗      ██████╗  ██████╗ ██████╗  █████╗        ║
║    ██╔══██╗██║     ██╔════╝ ██╔═══██╗██╔══██╗██╔══██╗       ║
║    ███████║██║     ██║  ███╗██║   ██║██████╔╝███████║       ║
║    ██╔══██║██║     ██║   ██║██║   ██║██╔══██╗██╔══██║       ║
║    ██║  ██║███████╗╚██████╔╝╚██████╔╝██║  ██║██║  ██║       ║
║    ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝       ║
║                                                              ║
║    24/7 Live Agentic Governance Platform                     ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║    API Server running on: http://localhost:${PORT}             ║
║    Environment: ${NODE_ENV.padEnd(43)}║
║    Database: SQLite with WAL mode                            ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
function gracefulShutdown(signal: string) {
  console.info(`${signal} received, shutting down...`);

  // Stop services
  if (app.locals.schedulerService) {
    app.locals.schedulerService.stop();
  }
  if (app.locals.issueDetection) {
    app.locals.issueDetection.stop();
  }
  if (app.locals.signalCollector) {
    app.locals.signalCollector.stop();
  }
  if (app.locals.chatterService) {
    app.locals.chatterService.stop();
  }
  if (app.locals.activityService) {
    app.locals.activityService.stopHeartbeat();
  }

  httpServer.close(() => {
    console.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

bootstrap();

export { app, io };
