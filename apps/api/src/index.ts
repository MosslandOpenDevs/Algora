import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { cacheMiddleware } from './middleware';

import { initDatabase } from './db';
import { setupRoutes } from './routes';
import { setupSocketHandlers } from './services/socket';
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

const PORT = process.env.PORT || 3201;
const NODE_ENV = process.env.NODE_ENV || 'development';

const app: ReturnType<typeof express> = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new SocketServer(httpServer, {
  cors: {
    origin: NODE_ENV === 'development'
      ? ['http://localhost:3200', 'http://127.0.0.1:3200']
      : process.env.CORS_ORIGIN?.split(',') || [],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: NODE_ENV === 'development'
    ? ['http://localhost:3200', 'http://127.0.0.1:3200']
    : process.env.CORS_ORIGIN?.split(',') || [],
  credentials: true,
}));

// HTTP Compression - reduces payload size by 70-85%
app.use(compression({
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
}));

// HTTP Caching Headers - reduces redundant requests by 40%
app.use(cacheMiddleware);

// Server-Timing header for performance diagnostics
// View in Chrome DevTools Network tab -> Timing section
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    // Log slow requests (> 500ms)
    if (durationMs > 500) {
      console.warn(`[SLOW] ${req.method} ${req.originalUrl} took ${durationMs.toFixed(0)}ms`);
    }
  });
  // Add Server-Timing header
  const timing: string[] = [];
  const originalEnd = res.end.bind(res);
  res.end = function(...args: Parameters<typeof originalEnd>) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    timing.push(`total;dur=${durationMs.toFixed(1)};desc="Total"`);
    res.setHeader('Server-Timing', timing.join(', '));
    return originalEnd(...args);
  } as typeof res.end;
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Server start time for uptime calculation
const serverStartTime = Date.now();

// LLM Cost Tracking - records all LLM generation events to budget_usage table
function setupLLMCostTracking(db: ReturnType<typeof initDatabase>): void {
  // Get pricing config from database
  const getConfig = db.prepare('SELECT * FROM budget_config WHERE provider = ?');

  llmService.on('generation', (event: { tier: number; model: string; tokensUsed?: number }) => {
    const { tier, model, tokensUsed } = event;

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

    // Get pricing for cost estimation
    let estimatedCost = 0;
    if (tier === 2) {
      const config = getConfig.get(provider) as { output_token_price: number } | undefined;
      if (config) {
        estimatedCost = outputTokens * config.output_token_price;
      }
    }

    // Upsert to budget_usage
    try {
      db.prepare(`
        INSERT INTO budget_usage (id, provider, tier, date, hour, output_tokens, estimated_cost_usd, call_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(provider, tier, date, hour) DO UPDATE SET
          output_tokens = output_tokens + excluded.output_tokens,
          estimated_cost_usd = estimated_cost_usd + excluded.estimated_cost_usd,
          call_count = call_count + 1
      `).run(uuidv4(), provider, tier, date, hour, outputTokens, estimatedCost);

      console.log(`[LLM-TRACK] Tier ${tier} ${provider} - ${outputTokens} tokens, $${estimatedCost.toFixed(6)}`);
    } catch (error) {
      console.error('[LLM-TRACK] Failed to record usage:', error);
    }
  });

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
    const budgetConfigs = db.prepare(`
      SELECT provider, daily_budget_usd FROM budget_config WHERE enabled = 1 AND provider != 'ollama'
    `).all() as Array<{ provider: string; daily_budget_usd: number }>;

    const totalDailyBudget = budgetConfigs.reduce((sum, c) => sum + c.daily_budget_usd, 0);

    const usageResult = db.prepare(`
      SELECT SUM(estimated_cost_usd) as total_spent FROM budget_usage WHERE date = ?
    `).get(today) as { total_spent: number | null } | undefined;

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
      const queueResult = db.prepare(`
        SELECT COUNT(*) as count FROM scheduler_tasks WHERE status = 'pending'
      `).get() as { count: number } | undefined;

      schedulerStatus = {
        isRunning: status.isRunning,
        nextTier2: now.toISOString(),
        queueLength: queueResult?.count || 0,
        tier2Hours: tier2Hours,
      };
    }

    // Get agent counts
    const agentResult = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN s.status IN ('active', 'speaking', 'listening') THEN 1 ELSE 0 END) as active
      FROM agents a
      LEFT JOIN agent_states s ON a.id = s.agent_id
      WHERE a.is_active = 1
    `).get() as { total: number; active: number } | undefined;

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

    // Make db available to routes
    app.locals.db = db;
    app.locals.io = io;

    // Setup LLM cost tracking - record all generation events to budget_usage
    setupLLMCostTracking(db);

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

    // Initialize proof of outcome service
    const proofOfOutcome = new ProofOfOutcomeService(db, io);
    app.locals.proofOfOutcome = proofOfOutcome;

    // Initialize token integration service
    const tokenIntegration = new TokenIntegrationService(db, io);
    app.locals.tokenIntegration = tokenIntegration;

    // Initialize disclosure service
    const disclosure = new DisclosureService(db, io);
    app.locals.disclosure = disclosure;

    // Initialize report generator service
    const reportGenerator = new ReportGeneratorService(db, io);
    app.locals.reportGenerator = reportGenerator;
    schedulerService.setReportGenerator(reportGenerator);
    console.info('[ReportGenerator] Service initialized - automatic report generation enabled');

    // Initialize passive consensus service
    const passiveConsensusService = new PassiveConsensusService(db, io, activityService);
    app.locals.passiveConsensusService = passiveConsensusService;
    schedulerService.setPassiveConsensusService(passiveConsensusService);
    console.info('[PassiveConsensus] Service initialized - opt-out approval model active');

    // Initialize RAG service
    const ragService = new RAGService(db, io);
    app.locals.ragService = ragService;
    console.info('[RAG] Service initialized - semantic search for governance documents');

    // Log LLM availability
    console.info(`[LLM] Tier 1 (Ollama): ${llmService.isTier1Available() ? 'Available' : 'Not Available'}`);
    console.info(`[LLM] Tier 2 configured: ${llmService.getConfig().tier2.anthropic ? 'Anthropic' : ''} ${llmService.getConfig().tier2.openai ? 'OpenAI' : ''} ${llmService.getConfig().tier2.gemini ? 'Gemini' : ''}`.trim());

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
