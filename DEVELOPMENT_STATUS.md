# Development Status - Algora

This file tracks the current development progress for continuity between sessions.

**Last Updated**: 2026-01-25
**Current Version**: 0.12.10
**Production URL**: https://algora.moss.land

---

## Current Phase: Algora v2.0 Upgrade - Agentic Governance OS

### v2.0 Upgrade Plan
See [docs/algora-v2-upgrade-plan.md](docs/algora-v2-upgrade-plan.md) for the complete upgrade plan.

### Phase 1: Safe Autonomy Foundation (COMPLETED)
- [x] `@algora/safe-autonomy` package created
- [x] Risk Classifier - Action risk taxonomy (LOW/MID/HIGH)
- [x] Lock Manager - LOCK/UNLOCK mechanism for dangerous actions
- [x] Approval Router - Human review routing with Director 3 priority
- [x] Passive Consensus - Opt-out approval model with auto-approve timeout
- [x] Retry Handler - Delay-retry with exponential backoff
- [x] Full TypeScript types for Safe Autonomy layer
- [x] In-memory storage implementations for development

### Phase 2: Orchestrator + State Machine (COMPLETED)
- [x] `@algora/orchestrator` package created
- [x] Primary Orchestrator class - Central coordinator for governance workflows
- [x] Workflow State Machine - 12 states (INTAKE → OUTCOME_PROOF)
- [x] TODO Manager - Persistent task continuation with exponential backoff
- [x] Specialist Manager - Subagent coordination with quality gates
- [x] Full TypeScript types for workflows, issues, specialists
- [x] Event system for workflow monitoring
- [x] In-memory storage implementations for development

### Phase 3: Document Registry (COMPLETED)
- [x] `@algora/document-registry` package created
- [x] Document Manager - CRUD operations for 15 official document types
- [x] Version Manager - Semantic versioning, diff tracking, branching
- [x] Provenance Manager - Origin tracking, agent contributions, integrity proofs
- [x] Audit Manager - Immutable audit trail, compliance reporting
- [x] Full TypeScript types for documents, versions, provenance, audit
- [x] Document state machine (draft → pending_review → in_review → approved → published)
- [x] In-memory storage implementations for development

### Phase 4: Model Router (COMPLETED)
- [x] `@algora/model-router` package created
- [x] Model Registry - Model management with health checks
- [x] Task Difficulty Classifier - 5 difficulty levels (trivial → critical)
- [x] Model Router - Intelligent task-to-model routing with fallback
- [x] Quality Gate - Output validation with custom validators
- [x] Embedding Service - Text embeddings for RAG with caching
- [x] Reranker Service - Document reranking for improved retrieval
- [x] Default model lineup for Tier 1 (local) and Tier 2 (external)
- [x] Budget management with daily limits and warnings

### Phase 5: Dual-House Governance (COMPLETED)
- [x] `@algora/dual-house` package created
- [x] House Manager - MossCoin House and OpenSource House definitions
- [x] Member Management - Token holders and contributor membership
- [x] Voting Power - Token-weighted (MOC) and contribution-weighted (OSS)
- [x] Dual-House Voting - Parallel voting with quorum and threshold checks
- [x] Vote Delegation - Proxy voting with scope options (all/category/proposal)
- [x] Reconciliation Manager - Conflict resolution when houses disagree
- [x] Director 3 Decision - Override, revote, veto, or conditional approval
- [x] High-Risk Approval - LOCK/UNLOCK for dangerous actions requiring dual approval
- [x] Full TypeScript types for governance, voting, reconciliation
- [x] Event system for governance monitoring
- [x] In-memory storage implementations for development

### Phase 6: Governance OS Integration (COMPLETED)
- [x] `@algora/governance-os` package created
- [x] Unified Integration Layer - GovernanceOS class integrating all v2.0 packages
- [x] Pipeline System - 9-stage governance pipeline (signal_intake → outcome_verification)
- [x] Subsystem Integration
  - [x] Safe Autonomy integration (LOCK/UNLOCK, risk classification)
  - [x] Orchestrator integration (workflow management)
  - [x] Document Registry integration (official document production)
  - [x] Model Router integration (LLM task routing)
  - [x] Dual-House integration (voting and approval)
- [x] Event System - Unified event propagation across all subsystems
- [x] Statistics Tracking - Pipeline metrics, LLM costs, voting sessions
- [x] Health Check API - Component status monitoring
- [x] Configuration System - GovernanceOSConfig and WorkflowConfigs
- [x] Factory Functions - createGovernanceOS, createDefaultGovernanceOS

### Phase 7: Workflow Implementation & API Integration (COMPLETED)

#### Step 1: API Integration (COMPLETED)
- [x] GovernanceOSBridge service for apps/api integration
- [x] REST API endpoints for Governance OS:
  - [x] Pipeline endpoints: `/governance-os/pipeline/run`, `/governance-os/pipeline/issue/:id`
  - [x] Document endpoints: `/governance-os/documents`, `/governance-os/documents/:id`, `/governance-os/documents/type/:type`
  - [x] Voting endpoints: `/governance-os/voting`, `/governance-os/voting/:id`, `/governance-os/voting/:id/vote`
  - [x] Approval endpoints: `/governance-os/approvals`, `/governance-os/approvals/:id/approve`
  - [x] Risk/Lock endpoints: `/governance-os/risk/classify`, `/governance-os/locks/:id`
  - [x] Model router endpoint: `/governance-os/model-router/execute`
  - [x] Stats/Health endpoints: `/governance-os/stats`, `/governance-os/health`, `/governance-os/config`

#### Step 2: Workflow Handlers (COMPLETED)
- [x] **Workflow A: Academic Activity** (`workflow-a.ts`)
  - [x] Types: AcademicSource, ResearchTopic, AcademicPaper, ResearchBrief
  - [x] Types: TechnologyAssessment, ResearchDigest, WorkflowAConfig
  - [x] WorkflowAHandler class with executeResearchPhase(), executeDeliberationPhase()
  - [x] generateResearchDigest() for weekly digest documents
  - [x] generateTechnologyAssessment() for formal assessments
  - [x] shouldGenerateAssessment() threshold detection
  - [x] Integration with Orchestrator (executeWorkflowA method)
  - [x] Tests: 12 test cases, all passing

- [x] **Workflow B: Free Debate** (`workflow-b.ts`)
  - [x] Types: DebateSource, DebateCategory, DebatePhase, DebateTopic
  - [x] Types: DebateArgument, DebateThread, ConsensusAssessment, DebateSummary
  - [x] WorkflowBHandler class with initializeDebate(), executeDebatePhase()
  - [x] executeFullDeliberation() for complete 5-phase debates
  - [x] assessConsensus() for consensus calculation
  - [x] generateDebateSummary() for official summary documents
  - [x] Red Team challenge generation in rebuttals phase
  - [x] Integration with Orchestrator (executeWorkflowB method)
  - [x] Tests: 13 test cases, all passing

- [x] **Workflow C: Developer Support** (`workflow-c.ts`)
  - [x] Types: GrantStatus, GrantCategory, MilestoneStatus, RewardStatus
  - [x] Types: GrantApplication, GrantMilestone, DeveloperGrant, MilestoneReport
  - [x] Types: RetroactiveReward, GrantProposal, ApplicationEvaluation, MilestoneReview
  - [x] WorkflowCHandler class with processGrantApplication(), evaluateApplication()
  - [x] processMilestoneReport() for milestone tracking
  - [x] processRetroactiveReward() for retroactive reward nominations
  - [x] Dual-House approval integration (MossCoin + OpenSource)
  - [x] Director 3 approval for high-value grants (>$5,000)
  - [x] LOCK mechanism for fund disbursements
  - [x] Integration with Orchestrator (executeWorkflowC, processMilestoneReport, processRetroactiveReward)
  - [x] Tests: 19 test cases, all passing

- [x] **Workflow D: Ecosystem Expansion** (`workflow-d.ts`)
  - [x] Types: ExpansionOrigin, OpportunityCategory, OpportunityStatus, PartnershipStatus
  - [x] Types: ExpansionOpportunity, OpportunityAssessment, PartnershipProposal
  - [x] Types: PartnershipAgreement, EcosystemReport, DetectedSignal
  - [x] Types: AlwaysOnConfig, AntiAbuseConfig for intake management
  - [x] WorkflowDHandler class with processCallBasedOpportunity(), processAlwaysOnSignal()
  - [x] assessOpportunity() with SWOT analysis
  - [x] createPartnershipProposal() with approval requirements
  - [x] createPartnershipAgreement() with LOCK mechanism
  - [x] generateEcosystemReport() for periodic reporting
  - [x] Anti-spam guardrails (rate limiting, deduplication, quality filters)
  - [x] Dual-House approval for partnerships (>$1,000)
  - [x] Director 3 approval for high-value deals (>$10,000) or high-risk categories
  - [x] Tests: 21 test cases, all passing

- [x] **Workflow E: Working Groups** (`workflow-e.ts`)
  - [x] Types: WorkingGroupStatus, CharterDuration, WGDocumentType, WGProposalOrigin
  - [x] Types: WorkingGroupProposal, WorkingGroupCharter, WGPublishingRules
  - [x] Types: WorkingGroup, WGStatusReport, WGDissolutionRequest, IssuePattern
  - [x] WorkflowEHandler class with processWGProposal(), evaluateProposal()
  - [x] createCharter() for charter creation from approved proposals
  - [x] activateWorkingGroup() to activate WG from charter
  - [x] canPublishDocument() and recordPublication() for publishing authority
  - [x] generateStatusReport() for WG status reports
  - [x] processDissolulutionRequest() for WG dissolution
  - [x] detectPatterns() for auto-proposal issue pattern detection
  - [x] generateAutoProposal() for orchestrator-initiated WG proposals
  - [x] Dual-House approval for all WG formations
  - [x] Director 3 approval for high-budget WGs (>$5,000)
  - [x] Tests: 31 test cases, all passing

**Total Orchestrator Tests: 96 passing**

### Phase 8: Frontend UI Integration & v2.0 Completion (COMPLETED)
- [x] Governance OS API types in `apps/web/src/lib/api.ts`
  - [x] PipelineStage, PipelineStatus types
  - [x] DocumentType, DocumentState, GovernanceDocument types
  - [x] DualHouseVote, HouseType for voting
  - [x] LockedAction, RiskLevel for safe autonomy
  - [x] WorkflowStatus, GovernanceOSStats, GovernanceOSHealth
  - [x] API functions: fetchGovernanceOSStats, fetchDocuments, fetchDualHouseVotes, etc.
- [x] Governance OS components (`apps/web/src/components/governance/`)
  - [x] PipelineVisualization - 9-stage pipeline display with progress
  - [x] WorkflowCard - Workflow type cards (A-E) with stats
  - [x] DocumentCard - Official document cards with state badges
  - [x] DualHouseVoteCard - Dual-house voting progress and status
  - [x] LockedActionCard - Safe autonomy action cards with approval tracking
- [x] Governance OS page (`apps/web/src/app/[locale]/governance/page.tsx`)
  - [x] Dashboard overview with stats cards
  - [x] Tab navigation (Overview, Workflows, Documents, Voting, Approvals)
  - [x] Pipeline visualization
  - [x] TanStack Query integration for data fetching
- [x] Navigation updates
  - [x] Added "Governance OS" menu item to Sidebar with NEW badge
- [x] i18n translations (EN/KO)
  - [x] Governance section with all UI strings
  - [x] Pipeline stage names
  - [x] Document states
  - [x] Voting status
  - [x] Safe autonomy status
- [x] Backend API endpoints connection
  - [x] GovernanceOSBridge new methods (listAllDocuments, listAllVotings, listAllApprovals, getWorkflowStatuses)
  - [x] New REST endpoints: GET /documents, GET /voting, GET /approvals, GET /workflows
  - [x] Frontend API functions connected to real endpoints (mock data removed)
  - [x] WittyLoader/WittyMessage extended with 'governance' category
- [x] **Agent Clusters Expansion (30→38 agents)**
  - [x] Added new cluster types: 'orchestrators', 'archivists', 'red-team', 'scouts'
  - [x] 8 new agents: Nova Prime, Atlas (orchestrators), Archive Alpha, Trace Master (archivists),
        Contrarian Carl, Breach Tester, Base Questioner (red-team), Horizon Seeker (scouts)
  - [x] Updated i18n translations for new groups (EN/KO)
- [x] **Real-time Socket.IO for Governance Events**
  - [x] New broadcast functions in `apps/api/src/services/socket.ts`:
        - broadcastDocumentCreated, broadcastDocumentStateChanged
        - broadcastVotingCreated, broadcastVoteCast, broadcastVotingStatusChanged
        - broadcastActionLocked, broadcastActionUnlocked, broadcastDirector3Approval
        - broadcastPipelineProgress, broadcastWorkflowStateChanged, broadcastHealthUpdate
  - [x] New frontend hook in `apps/web/src/hooks/useSocket.ts`:
        - GovernanceEvent type with 11 event types
        - useGovernanceEvents hook for subscribing to multiple events
- [x] **Operational KPIs Instrumentation**
  - [x] New KPI module: `packages/governance-os/src/kpi.ts`
        - DecisionQualityMetrics (DP completeness, option diversity, red team coverage)
        - ExecutionSpeedMetrics (signal-to-issue, issue-to-DP, end-to-end timing)
        - SystemHealthMetrics (uptime, LLM availability, queue depth, error rate)
  - [x] KPICollector class with recordSample, recordHeartbeat, recordOperation, recordExecutionTiming
  - [x] 7 new API endpoints in `apps/api/src/routes/governance-os.ts`:
        - GET /kpi/dashboard, /kpi/decision-quality, /kpi/execution-speed
        - GET /kpi/system-health, /kpi/alerts, /kpi/targets, /kpi/export
- [x] **Security Spam Protection (Anti-Abuse Guard)**
  - [x] New module: `packages/safe-autonomy/src/anti-abuse.ts`
        - AntiAbuseGuard class with rate limiting, deduplication, quality filtering
        - Blacklist management, cooldown after rejection
        - Multiple source validation requirement
        - Topic hash generation for deduplication
- [x] **E2E Pipeline Tests**
  - [x] New test file: `packages/governance-os/src/__tests__/e2e-pipeline.test.ts`
        - Full Pipeline Execution tests (LOW/MID/HIGH risk)
        - Document Registry Integration tests
        - Dual-House Voting Integration tests
        - Model Router Integration tests
        - KPI Collector Integration tests
        - Health Monitoring tests
        - Pipeline Stage Verification (9 stages)
        - Workflow Type Coverage (A, B, C, D, E)
- [x] **Ollama Model Integration**
  - [x] New provider: `packages/model-router/src/providers/ollama.ts`
        - OllamaProvider class for local LLM inference
        - Chat and generate API support
        - Embedding support for RAG
        - Health checks and model listing
        - Pull model functionality
        - OLLAMA_INSTALL_COMMANDS and OLLAMA_HARDWARE_REQUIREMENTS constants
  - [x] OllamaLLMProvider adapter for ModelRouter
  - [x] Factory functions: createOllamaModelRoutingSystem, createOllamaModelRoutingSystemWithDefaults

### Phase 9: Production Deployment (COMPLETED)
- [x] **pm2 Process Management**
  - [x] `ecosystem.config.cjs` for managing both api and web apps
  - [x] Local machine deployment (211.196.73.206)
  - [x] api on port 3201, web on port 3200
  - [x] Auto-restart configuration with memory limits
- [x] **nginx Reverse Proxy**
  - [x] Lightsail server (13.209.131.190) with nginx
  - [x] SSL/TLS with Let's Encrypt
  - [x] WebSocket proxy for Socket.IO
  - [x] Static asset caching headers
- [x] **Next.js i18n Middleware Fix**
  - [x] Fixed middleware matcher to exclude `_next` paths
  - [x] Resolved static asset 500 errors and redirect loops
- [ ] Full integration testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Mainnet deployment preparation

### Phase 9.5: System Enhancement (COMPLETED)
- [x] **Automatic Report Generation System**
  - [x] `ReportGeneratorService` (`apps/api/src/services/report-generator/`)
  - [x] `DataCollector` - Aggregates metrics from all tables (signals, issues, proposals, agents, sessions)
  - [x] `WeeklyReportGenerator` - Weekly governance report with LLM executive summary
  - [x] `MonthlyReportGenerator` - Comprehensive monthly report with strategic insights
  - [x] Scheduler integration (weekly: Monday 00:00 UTC, monthly: 1st 00:00 UTC)
  - [x] Manual generation API: `POST /api/disclosure/generate/weekly`, `POST /api/disclosure/generate/monthly`
  - [x] Markdown content stored in disclosure_reports table
  - [x] Frontend markdown rendering with `react-markdown` + `remark-gfm`
  - [x] Custom styled components for tables, code blocks, headers
- [x] **Real-time Health Endpoint Enhancement**
  - [x] `/health` now returns real data: budget, scheduler, agents
  - [x] Budget: daily limit, spent, remaining (from budget_config + budget_usage)
  - [x] Scheduler: isRunning, nextTier2, queueLength, tier2Hours
  - [x] Agents: total, active count
  - [x] Uptime tracking from server start
- [x] **Budget Configuration via Environment**
  - [x] `ANTHROPIC_DAILY_BUDGET_USD`, `ANTHROPIC_HOURLY_LIMIT`
  - [x] `OPENAI_DAILY_BUDGET_USD`, `OPENAI_HOURLY_LIMIT`
  - [x] `GOOGLE_DAILY_BUDGET_USD`, `GOOGLE_HOURLY_LIMIT`
  - [x] `OLLAMA_HOURLY_LIMIT`
  - [x] Auto-seed budget_config on first run from .env
- [x] **Admin API Key Protection**
  - [x] `ADMIN_API_KEY` environment variable
  - [x] `requireAdmin` middleware for budget modification
  - [x] `PATCH /api/budget/config/:provider` requires X-Admin-Key header
- [x] **Engine Room Page Real Data**
  - [x] Uses real health API data instead of mock
  - [x] `/api/stats/tier-usage` endpoint for tier statistics
  - [x] SchedulerCard updated for nullable fields
- [x] **Modal Portal Pattern**
  - [x] All modals use React Portal (`createPortal`) for proper z-index
  - [x] z-[99999] for guaranteed top-level rendering
  - [x] Fixed modal stacking issues on all pages
- [x] **Translation Fixes**
  - [x] Added `Engine.status.ok` key for "All systems operational"

---

## Previous Phase: Token Integration (v0.8.0) - COMPLETED

### Completed Features

#### Infrastructure (100%)
- [x] Monorepo setup (pnpm workspaces + Turborepo)
- [x] TypeScript configuration
- [x] ESLint + Prettier configuration
- [x] Environment variables template (.env.example)
- [x] Git repository initialized

#### Backend - apps/api (100%)
- [x] Express.js server on port 3201
- [x] Socket.IO WebSocket integration
- [x] SQLite database with WAL mode
- [x] Database schema for all entities
- [x] 30 AI agents seeded with personas
- [x] REST API endpoints:
  - [x] GET /health - Health check
  - [x] GET /api/stats - Dashboard statistics
  - [x] GET /api/agents - List agents
  - [x] GET /api/activity - Activity feed
  - [x] GET /api/agora/sessions - Agora sessions
  - [x] GET /api/signals - Signals
  - [x] GET /api/issues - Issues
  - [x] GET /api/proposals - Proposals
  - [x] GET /api/budget - Budget info
- [x] ActivityService with heartbeat (60s interval)
- [x] SchedulerService for 3-tier LLM

#### Frontend - apps/web (100%)
- [x] Next.js 14 with App Router
- [x] next-intl for i18n (en/ko)
- [x] TanStack Query for data fetching
- [x] Tailwind CSS with custom Algora theme
- [x] Dashboard page with stats grid
- [x] Header with system status and language toggle
- [x] Sidebar navigation
- [x] ActivityFeed component (enhanced with severity badges, agent info, animations)
- [x] AgentLobbyPreview component
- [x] StatsCard component (clickable with variants and hover animations)
- [x] StatsDetailModal component (breakdown, activity list)
- [x] **Agents page** - Grid view, cluster filter, detail modal, summon/dismiss
- [x] **Agora page** - Live chat, session management, participant list
  - [x] Real-time message fetching from database
  - [x] Agent group display with color coding in participant list
  - [x] Auto-start discussion with random intervals (30s-2min)
- [x] **UI Animations** - Modal fade-in/scale-in, card hover effects, new item slide-in
- [x] **Detail Modals** - All modals have consistent animations (7 modal files)
- [x] **Disclosure page** - Transparency reports and governance disclosures
- [x] **Signals page** - Source filtering, priority indicators, stats
- [x] **Issues page** - Status workflow, priority filter, search
- [x] **Proposals page** - Voting progress, quorum tracking, filters
- [x] **Engine Room page** - Budget, tier usage, scheduler, system health
- [x] **Guide page** - System flow visualization
- [x] **Live Showcase page** (`/live`) - Real-time governance dashboard
  - [x] LiveHeader, SignalStream, SystemBlueprint, LiveMetrics
  - [x] ActivityLog, AgentChatter, AgoraPreview components
  - [x] TerminalBox, GlowText shared components
  - [x] Socket.io real-time updates
  - [x] LIVE badge in header, LIVE menu in sidebar
- [x] **UX Guide System**
  - [x] WelcomeTour component (multi-step guided tour)
  - [x] SystemFlowDiagram component (visual pipeline)
  - [x] HelpTooltip component (fixed positioning, z-index 9999)
  - [x] HelpMenu component (header quick access menu)
  - [x] localStorage persistence for tour completion

#### Agent System (100%)
- [x] LLM Service with 3-tier support (llm.ts)
  - [x] Tier 1: Ollama (local LLM)
  - [x] Tier 2: Anthropic, OpenAI, Gemini
  - [x] Automatic fallback between tiers
  - [x] Global LLM request queue (rate limiting)
  - [x] 10s minimum delay between concurrent calls
- [x] ChatterService - Agent idle message generation (chatter.ts)
- [x] SummoningService - Dynamic agent summoning (summoning.ts)
- [x] AgoraService - Session management with LLM responses (agora.ts)
  - [x] Auto-start discussion when session created with autoSummon
  - [x] Random intervals (30s-2min) for natural conversation pacing
  - [x] Auto-update summoned_agents when participants added
  - [x] LLM queue status monitoring (/api/agora/llm-queue)
- [x] Real-time WebSocket events for all services
- [x] API endpoints for chatter (/api/chatter)
- [x] Enhanced Agora API with automated discussions

#### Signal Collection (100%)
- [x] RSS Collector Service (rss.ts)
  - [x] Configurable RSS feed management
  - [x] Automatic severity detection
  - [x] 17 feeds across 5 categories: AI, Crypto, Finance, Security, Dev
- [x] GitHub Collector Service (github.ts)
  - [x] Repository events monitoring
  - [x] Issues and PRs tracking
  - [x] 41 repos: ethereum, Uniswap, Aave, OpenZeppelin, AI projects
  - [x] All 27 mossland public repos monitored
- [x] Blockchain Collector Service (blockchain.ts)
  - [x] Price monitoring (CoinGecko multi-coin)
  - [x] DeFi TVL tracking (DeFiLlama protocols, chains, stablecoins)
  - [x] Fear & Greed Index
  - [x] Optional: CoinMarketCap, Etherscan, OpenSea (API keys)
- [x] Signal Processor (index.ts)
  - [x] Unified collector management
  - [x] Statistics and reporting
- [x] Collectors API endpoints (/api/collectors/*)

#### Issue Detection (100%)
- [x] IssueDetectionService (issue-detection.ts)
  - [x] Pattern-based detection (10 predefined patterns)
  - [x] Security, Market, Governance, DeFi, Mossland, AI categories
  - [x] Cooldown mechanism to prevent duplicates
- [x] Alert Thresholds
  - [x] Frequency-based alerts
  - [x] Critical signal surge detection
  - [x] Category-specific thresholds
- [x] Issue Lifecycle Management
  - [x] Status workflow: detected → confirmed → in_progress → resolved
  - [x] Signal-to-issue correlation
  - [x] Evidence tracking
- [x] LLM-Enhanced Analysis
  - [x] AI-powered signal analysis for high-priority items
  - [x] Suggested actions generation
- [x] Automatic Agora Session Creation
  - [x] Auto-create Agora sessions for Critical/High priority issues
  - [x] Category-based agent auto-summoning
  - [x] Cooldown mechanism (30min for critical, 60min for high)
  - [x] AGORA_SESSION_AUTO_CREATED activity type
- [x] API endpoints (/api/issues/detection/*)

#### Human Governance (100%)
- [x] GovernanceService (services/governance/index.ts)
  - [x] Unified service combining proposals, voting, and decision packets
  - [x] Convenience methods for common workflows
- [x] ProposalService (proposal.ts)
  - [x] Full proposal lifecycle management
  - [x] Status workflow: draft → pending_review → discussion → voting → passed/rejected → executed
  - [x] Create from issue functionality
  - [x] Comments and endorsements system
  - [x] Agent endorsement tracking
- [x] VotingService (voting.ts)
  - [x] Vote casting with validation
  - [x] Voting power calculation
  - [x] Tally calculation with quorum checking
  - [x] Delegation system (proxy voting)
  - [x] Auto-finalization when voting period ends
  - [x] Voter registry management
- [x] DecisionPacketService (decision-packet.ts)
  - [x] AI-generated decision summaries
  - [x] Options analysis with pros/cons
  - [x] Agent analysis aggregation
  - [x] Risk assessment generation
  - [x] Version management for regeneration
- [x] Comprehensive API endpoints (/api/proposals/*)
  - [x] CRUD operations for proposals
  - [x] Workflow transitions (submit, start-discussion, start-voting, cancel)
  - [x] Voting endpoints (vote, finalize, get votes)
  - [x] Comments and endorsements endpoints
  - [x] Decision packet endpoints (get, generate, versions)
  - [x] Delegation endpoints (create, revoke, get)

#### Proof of Outcome (100%)
- [x] ProofOfOutcomeService (services/proof-of-outcome/index.ts)
  - [x] Unified service combining outcomes, trust scoring, and analytics
  - [x] Convenience methods for processing proposal completions
- [x] OutcomeService (outcome.ts)
  - [x] Outcome creation from passed/rejected proposals
  - [x] Execution plan management with steps
  - [x] Execution lifecycle: pending → executing → completed/failed → verified
  - [x] Verification system with confidence scores
  - [x] Dispute handling for contested outcomes
- [x] TrustScoringService (trust-scoring.ts)
  - [x] Agent trust score tracking (0-100 scale)
  - [x] Prediction recording and resolution
  - [x] Endorsement accuracy tracking
  - [x] Participation rate monitoring
  - [x] Trust score history and updates
  - [x] Automatic score decay for inactive agents
- [x] AnalyticsService (analytics.ts)
  - [x] Governance metrics (pass rate, participation, votes)
  - [x] Time series data for proposals, voting, outcomes
  - [x] Agent performance ranking
  - [x] Signal-to-outcome correlation analysis
  - [x] Category analytics
  - [x] Exportable governance reports
- [x] Comprehensive API endpoints (/api/outcomes/*)
  - [x] Outcome CRUD and execution management
  - [x] Verification and dispute endpoints
  - [x] Trust scoring endpoints
  - [x] Analytics dashboard and metrics endpoints

#### Token Integration (100%)
- [x] TokenIntegrationService (services/token/index.ts)
  - [x] Unified service combining token, voting, and treasury
  - [x] Convenience methods for common workflows
- [x] TokenService (token.ts)
  - [x] MOC token holder verification
  - [x] Wallet signature verification with nonce
  - [x] Token balance checking (real + mock mode)
  - [x] Voting power calculation
  - [x] Snapshot creation for voting
  - [x] Holder registration and management
- [x] TokenVotingService (token-voting.ts)
  - [x] Token-weighted voting system
  - [x] Proposal voting initialization with snapshots
  - [x] Vote casting with voting power
  - [x] Quorum and pass threshold checking
  - [x] Vote tally calculation
  - [x] Voting finalization
- [x] TreasuryService (treasury.ts)
  - [x] Multi-token treasury balance tracking
  - [x] Budget allocations from proposals
  - [x] Allocation lifecycle: pending → approved → disbursed
  - [x] Transaction recording and confirmation
  - [x] Spending limits per category
  - [x] On-chain transaction support (mock + real)
- [x] Comprehensive API endpoints (/api/token/*)
  - [x] Token info and stats endpoints
  - [x] Wallet verification (request, confirm)
  - [x] Holder management endpoints
  - [x] Snapshot endpoints
  - [x] Token voting endpoints
  - [x] Treasury balance and allocation endpoints
  - [x] Transaction management endpoints
  - [x] Spending limits endpoints
  - [x] Dashboard endpoint

#### Shared Packages
- [x] packages/core - TypeScript types (38 agent clusters, 11 cluster types)
- [x] packages/safe-autonomy - LOCK/UNLOCK, Risk Classification, Approval Routing, Anti-Abuse Guard (v2.0)
- [x] packages/orchestrator - Workflow Orchestration, State Machine, TODO Manager (v2.0)
- [x] packages/document-registry - Official Document Storage, Versioning, Provenance (v2.0)
- [x] packages/model-router - LLM Difficulty-Based Routing, Quality Gates, RAG, Ollama Provider (v2.0)
- [x] packages/dual-house - Dual-House Governance, Voting, Reconciliation (v2.0)
- [x] packages/governance-os - Unified Integration Layer, KPI Collector, E2E Tests (v2.0)
- [ ] packages/reality-oracle - Signal collection
- [ ] packages/inference-mining - Issue detection
- [ ] packages/agentic-consensus - Agent system
- [ ] packages/human-governance - Voting
- [ ] packages/proof-of-outcome - Result tracking

#### Documentation (100%)
- [x] README.md / README.ko.md
- [x] ARCHITECTURE.md / ARCHITECTURE.ko.md
- [x] CONTRIBUTING.md / CONTRIBUTING.ko.md
- [x] ALGORA_PROJECT_SPEC.md / ALGORA_PROJECT_SPEC.ko.md
- [x] USER_GUIDE.md / USER_GUIDE.ko.md
- [x] CLAUDE.md
- [x] CHANGELOG.md
- [x] DEVELOPMENT_STATUS.md (this file)

---

### Phase 10: Token UI & Governance Features (IN PROGRESS)

#### Step 1: Wallet Connection UI (COMPLETED)
- [x] WalletConnect v2 modal with MetaMask/WalletConnect/Coinbase support
- [x] ConnectedWallet header component showing balance and address
- [x] Profile page with wallet verification flow
- [x] MOC token balance display with real-time updates
- [x] Voting power calculation from token balance
- [x] i18n translations (EN/KO) for wallet UI

#### Step 2: Treasury Dashboard Enhancement (COMPLETED)
- [x] Treasury visualization components (`apps/web/src/components/treasury/`)
  - [x] AllocationCard - Budget allocation items with status badges
  - [x] TransactionCard - Transaction history with type indicators
  - [x] HolderCard - Token holder cards with verification status
  - [x] BalanceDistributionChart - CSS conic-gradient donut chart
  - [x] AllocationStatusBreakdown - Stacked progress bar
  - [x] SpendingLimitsCard - Category-based spending limits
  - [x] AllocationDetailModal - Detail modal with status timeline
  - [x] TransactionDetailModal - Transaction detail with explorer links
- [x] Treasury API functions in `api.ts`
- [x] i18n translations (EN/KO) for treasury components

#### Step 3: Voting Delegation UI (COMPLETED)
- [x] Delegation components (`apps/web/src/components/delegation/`)
  - [x] DelegationCard - Delegation item display with address/power/expiration
  - [x] DelegationStats - 4 stats cards (own/received/given/effective power)
  - [x] DelegationModal - Multi-step modal (intro → input → confirm → success)
  - [x] DelegationList - Tabbed list (given/received delegations)
- [x] Delegation API functions (fetchDelegations, createDelegation, revokeDelegation)
- [x] Profile page integration with delegation section
- [x] Category-based delegation (treasury/technical/governance/community)
- [x] Expiration options (30/90/180 days or never)
- [x] i18n translations (EN/KO) for delegation UI

#### Step 4: Token-weighted Voting UI (PENDING)
- [ ] Proposal voting with connected wallet
- [ ] Vote confirmation with voting power display
- [ ] Delegated vote auto-application
- [ ] Vote history on profile page

---

### Phase 10.5: Performance Optimization (COMPLETED)

#### Mobile Responsiveness Fixes (COMPLETED)
- [x] Issue/Proposal/Treasury/Disclosure/Engine Room pages mobile UI
- [x] Modal layouts with proper scroll structure
- [x] Grid responsive breakpoints (grid-cols-1 sm:grid-cols-2)
- [x] Text truncation and overflow handling
- [x] Live page header overflow fix
- [x] Proposal modal proposer address and budget overflow fix
- [x] Treasury tabs horizontal scroll
- [x] Engine Room refresh button visual feedback

#### Initial Load Performance (RSC Migration) (COMPLETED)
- [x] **Dashboard RSC Conversion**
  - [x] `lib/server-api.ts` - Server-side fetch utilities with timeout
  - [x] `DashboardClient.tsx` - Client component for interactive features
  - [x] `page.tsx` converted to async Server Component
  - [x] `ActivityFeed` and `AgentLobbyPreview` accept `initialData` prop
  - [x] Data fetched on server, pre-rendered into HTML
  - [x] React Query handles real-time updates after hydration

#### TTFB Bottleneck Resolution (COMPLETED)
- [x] **Root Cause Analysis**: RSC was using external URL causing circular nginx requests
- [x] **Internal API Routing**: Server-side fetch uses `localhost:3201` directly
- [x] `API_INTERNAL_URL` environment variable in PM2 config
- [x] 3-second timeout with AbortController to prevent blocking
- [x] **Dynamic Icon Removal**: Deleted `icon.tsx` (ImageResponse), replaced with static `favicon.svg`
- [x] **Middleware Optimization**: Explicit exclusion of all static file paths
- [x] **Server-Timing Headers**: Added to API for performance diagnostics
- [x] **Slow Request Logging**: Console warning for requests > 500ms
- [x] `deploy/nginx.conf.example` - Example nginx config with proxy caching
- [x] `deploy/warmup.sh` - Cold start mitigation script

---

### Phase 10.6: Operational Data Analysis & Improvements (COMPLETED)

Based on 13 days of production data (2026-01-09 ~ 2026-01-21):

#### Data Analysis Results
- **activity_log**: 129,974 records (~10,000/day)
- **agent_chatter**: 32,900 records (~2,500/day)
- **agora_messages**: 21,983 records (~1,700/day)
- **signals**: 14,935 records (~1,150/day)
- **Database Size**: 141MB (estimated ~4GB/year without cleanup)

#### LLM Cost Tracking (P0) - COMPLETED
- [x] `generation` event listener in `apps/api/src/index.ts`
- [x] Records all LLM calls to `budget_usage` table
- [x] Tracks provider, tier, tokens, and estimated cost
- [x] Upsert pattern aggregates by provider/tier/date/hour

#### Ollama Timeout Optimization (P0) - COMPLETED
- [x] Increased timeout from 60s to 120s for large models like qwen2.5:32b
- [x] Hybrid model strategy verified:
  - Chatter uses `complexity: 'fast'` → `llama3.2:3b`
  - Agora uses `complexity: 'balanced'` → `qwen2.5:32b`

#### Data Retention Service (P1) - COMPLETED
- [x] New service: `apps/api/src/services/data-retention.ts`
- [x] Standard 30-day retention policy:
  - `activity_log`: 30 days (HEARTBEAT: 7 days)
  - `agent_chatter`: 90 days
  - `signals`: 90 days
  - `agora_messages`, `issues`, `proposals`, `votes`: **Permanent**
  - `budget_usage`: 365 days
- [x] Scheduler integration (daily at 03:00)
- [x] Manual cleanup trigger via `triggerDataCleanup()`

#### Monitoring API Extension (P2) - COMPLETED
- [x] `GET /api/stats/llm-usage` - LLM usage by tier/provider, Tier 1 ratio, costs
- [x] `GET /api/stats/data-growth` - Row counts, daily averages, growth trends
- [x] `GET /api/stats/system-health` - Health score, error counts, budget status

---

### Phase 10.7: System Enhancements (COMPLETED)

#### D5 - Passive Consensus (COMPLETED)
- [x] PassiveConsensusService (`apps/api/src/services/passive-consensus.ts`)
- [x] Auto-approval for LOW risk (24h), MID risk (48h)
- [x] "Unreviewed" label for auto-approved items
- [x] REST endpoints: `/api/passive-consensus/*`

#### D2 - Model Router RAG (COMPLETED)
- [x] RAGService (`apps/api/src/services/rag.ts`)
- [x] In-memory vector store with cosine similarity
- [x] Governance document indexing and search
- [x] REST endpoints: `/api/rag/*`

#### D3 - Quality Gate (COMPLETED)
- [x] QualityGateService (`apps/api/src/services/quality-gate.ts`)
- [x] 8 validators: format, length, safety, relevance, completeness, consistency, citation, confidence
- [x] REST endpoints: `/api/quality-gate/*`

#### E2 - Governance Timeline View (COMPLETED)
- [x] TimelineEvent types and API (`apps/api/src/routes/timeline.ts`)
- [x] GovernanceTimeline component (`apps/web/src/components/timeline/`)
- [x] 7-stage flow visualization (Signal → Execution)
- [x] Filtering by stage and date range
- [x] Timeline page (`apps/web/src/app/[locale]/timeline/`)

#### C3 - Log Rotation & Monitoring (COMPLETED)
- [x] pm2-logrotate setup script (`scripts/setup-logrotate.sh`)
- [x] LogMonitorService (`apps/api/src/services/log-monitor.ts`)
- [x] REST endpoints: `/api/logs/*`

#### E5 - Multilingual Expansion (COMPLETED)
- [x] Japanese translations (`apps/web/src/i18n/messages/ja.json`)
- [x] Chinese translations (`apps/web/src/i18n/messages/zh.json`)
- [x] Updated middleware and request.ts for 4 locales (en, ko, ja, zh)

#### C4 - API Caching Layer (COMPLETED)
- [x] In-memory cache integration (`apps/api/src/lib/cache.ts`)
- [x] Cache for `/api/stats` (15s TTL)
- [x] Cache for `/api/stats/tier-usage` (30s TTL)
- [x] Cache for `/api/timeline/stats` (30s TTL)
- [x] Cache monitoring endpoints: `/api/stats/cache`, `/api/stats/cache/clear`

#### B6 - Accessibility Improvements (COMPLETED)
- [x] AccessibleModal component (focus trap, escape key, scroll lock)
- [x] AccessibleDropdown component (keyboard navigation, type-ahead search)
- [x] Header ARIA enhancements (role="banner", aria-live for status)
- [x] Translations for all 4 languages

#### LLM Thermal Throttling (COMPLETED)
- [x] Cooldown between Tier 1 calls (default 5s, was 2s)
- [x] Rate limiting (max 8 calls/minute, was 15)
- [x] Dynamic cooldown under heavy load (max 30s, was 10s)
- [x] Automatic Tier 2 fallback when cooldown too long
- [x] REST endpoints: `/api/stats/thermal`, `/api/stats/thermal/config`
- [x] Environment config: `LLM_MIN_COOLDOWN_MS`, `LLM_MAX_CALLS_PER_MINUTE`, `LLM_MAX_COOLDOWN_MS`

#### i18n Admin Page Translations (COMPLETED)
- [x] Added Navigation keys: `admin`, `timeline`, `profile` (4 languages)
- [x] Added Admin section: `title`, `subtitle`, `refresh`, `systemHealth`, `llmUsage`, `dataGrowth`, `kpiTrends`
- [x] Updated: en.json, ko.json, ja.json, zh.json

---

### Phase 10.8: Pipeline Health Monitoring (COMPLETED)

Full pipeline inspection with 4 gap fixes and monitoring dashboard.

#### Gap 1: Signal Collector Auto-Recovery (COMPLETED)
- [x] `CollectorHealth` interface for tracking health state per collector
- [x] Health check interval (30 seconds default)
- [x] Auto-restart with exponential backoff for 3+ consecutive failures
- [x] Stale detection (5 minute threshold triggers restart)
- [x] Health state persisted to `collector_health` DB table
- [x] WebSocket events: `collectors:health`, `collectors:restarted`

#### Gap 2: Low-Consensus Session Escalation (COMPLETED)
- [x] `EscalationType` and `EscalatedSession` types
- [x] Escalation routing based on consensus score:
  - 50-70%: `extended_discussion` (additional rounds)
  - 30-50%: `working_group` (focused working group)
  - <30%: `human_review` (governance committee)
- [x] `escalateLowConsensusSession()` auto-triggers for completed sessions
- [x] `getPendingEscalations()` and `resolveEscalation()` methods
- [x] WebSocket event: `governance:session:escalated`
- [x] `escalated_sessions` DB table

#### Gap 3: Pipeline Failure Retry Queue (COMPLETED)
- [x] `InMemoryQueue` for pipeline retries with 3 max attempts
- [x] Exponential backoff between retries
- [x] Auto-queue when `runTier2Tasks` fails
- [x] Status marked `needs_manual_review` after exhausting retries
- [x] `getPipelineRetryStats()` for monitoring
- [x] `queuePipelineRetry()` for manual retry trigger
- [x] `pipeline_retry_queue` DB table

#### Gap 4: Scheduled Proposal Backfill (COMPLETED)
- [x] `scheduleProposalBackfill()` runs at 02:00 and 14:00 UTC daily
- [x] `triggerProposalBackfill()` for manual trigger
- [x] WebSocket event: `governance:backfill:scheduled`

#### Pipeline Health API (COMPLETED)
- [x] New route: `apps/api/src/routes/pipeline-health.ts`
- [x] Endpoints:
  - `GET /api/pipeline/health` - Overall health score (0-100)
  - `GET /api/pipeline/metrics` - 24h throughput/latency metrics
  - `GET /api/pipeline/alerts` - Active alerts (critical/warning/info)
  - `GET /api/pipeline/stages` - Stage-by-stage health details
  - `GET /api/pipeline/collectors` - Collector health status
  - `GET /api/pipeline/escalations` - Pending escalations
  - `POST /api/pipeline/retry/:issueId` - Manual retry trigger
  - `POST /api/pipeline/escalations/:id/resolve` - Resolve escalation
  - `POST /api/pipeline/backfill` - Manual proposal backfill

#### Pipeline Health Dashboard (COMPLETED)
- [x] `PipelineHealthDashboard` component (`apps/web/src/components/admin/`)
- [x] Visual pipeline flow with 6 stages
- [x] Real-time health score display
- [x] Stage-by-stage status cards
- [x] Throughput metrics (signals, issues, sessions, proposals)
- [x] Retry queue status
- [x] Active alerts panel
- [x] Integrated into Admin page

#### Activity Types (COMPLETED)
- [x] Added: `COLLECTOR_HEALTH`, `PIPELINE_RETRY`, `PROPOSAL_BACKFILL`, `SESSION_ESCALATED`, `HUMAN_REVIEW_REQUIRED`

---

## Next Steps (Priority Order)

### Phase 10 Remaining
1. Token-weighted voting UI in proposals
2. Real-time WebSocket integration for token events

### Phase 11: Production Hardening
1. Mainnet contract integration
2. Security audit
3. Performance optimization
4. Monitoring and alerting (pm2 monit, log rotation)

### Phase 12: Advanced Features
1. packages/reality-oracle - Signal collection refactoring
2. packages/inference-mining - Issue detection refactoring
3. packages/agentic-consensus - Agent system refactoring
4. packages/human-governance - Voting refactoring
5. packages/proof-of-outcome - Result tracking refactoring

---

## Running the Project

### Development Mode
```bash
# Install dependencies
pnpm install

# Start both frontend and backend
pnpm dev

# Or start individually:
cd apps/api && pnpm dev   # Backend on :3201
cd apps/web && pnpm dev   # Frontend on :3200
```

### Production Mode (pm2)
```bash
# Build all packages
pnpm build

# Start with pm2
pm2 start ecosystem.config.cjs

# Management commands
pm2 status              # View status
pm2 logs algora-api     # API logs
pm2 logs algora-web     # Web logs
pm2 restart all         # Restart all
pm2 stop all            # Stop all

# Auto-start on reboot
pm2 save
pm2 startup
```

### Production URLs
- **Production**: https://algora.moss.land
- **Local Dev**: http://localhost:3200 (web), http://localhost:3201 (api)

---

## Git Commit History (Recent)

```
8683cef chore: Fix ESLint warnings across 23 files
109a766 feat: Add pipeline health monitoring with auto-recovery and dashboard
4b40edd feat: Add LLM thermal throttling to prevent server overheating
574e3b9 feat: Add accessibility improvements with ARIA labels and reusable components
81f655e feat: Integrate in-memory caching for high-traffic API endpoints
1877e89 feat: Add Japanese and Chinese language support
c4f3394 feat: Add log rotation and monitoring system
4b1cb88 feat: Add Governance Timeline View showing signal-to-execution flow
a8d31b7 feat: Add Quality Gate service for LLM output validation
1a514e8 feat: Add RAG service for semantic search in governance documents
8166984 feat: Add passive consensus system for opt-out approval model
9e7e410 feat: Add KPI persistent storage and history visualization
```

---

## Known Issues

1. Next.js 14.1.0 is outdated (minor warning)
2. Agent states not being persisted on server restart (need initialization)
3. Database requires re-initialization after schema changes (delete algora.db and run db:init)
4. Localhost CORS issues when connecting to production API (expected behavior)

---

## Environment Setup Notes

- Node.js v20.19.6
- pnpm (for monorepo)
- SQLite database stored in `apps/api/data/algora.db`
- Database auto-initializes on first run
- Ollama required for Tier 1 LLM (http://localhost:11434)

---

## For AI Assistants

When continuing development:
1. Read this file first to understand current status
2. Check CLAUDE.md for project context and guidelines
3. Run `git log --oneline -10` to see recent changes
4. Run `pnpm dev` to start the development servers (or `pm2 start ecosystem.config.cjs` for production)
5. Update this file and CHANGELOG.md after significant changes
6. Update Korean translations (*.ko.md) when documentation changes

### Key Files to Know
- `ecosystem.config.cjs` - pm2 configuration
- `apps/web/src/middleware.ts` - Next.js i18n middleware (exclude `_next` paths)
- `apps/web/.env.local` - Frontend environment (NEXT_PUBLIC_API_URL)
- `apps/api/.env` - Backend environment

### Current Architecture
```
Internet → algora.moss.land (DNS)
        → Lightsail 13.209.131.190 (nginx + SSL)
        → Local 211.196.73.206 (pm2: api:3201, web:3200)
```
