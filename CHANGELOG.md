# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Full integration testing
- Performance optimization
- Security audit

---

## [0.12.5] - 2026-01-15

### Added
- **Voting Delegation UI** (`apps/web/src/components/delegation/`):
  - `DelegationCard` - Delegation item display with address, voting power, expiration, categories
  - `DelegationStats` - 4 stats cards grid (own/received/given/effective voting power)
  - `DelegationModal` - Multi-step delegation creation modal with:
    - Intro step explaining delegation
    - Input step with delegate address, category selection, expiration options
    - Confirm step showing delegation summary
    - Success/Error result states
  - `DelegationList` - Tabbed list component (given/received delegations)
  - Index barrel export for all delegation components

- **Delegation API Functions** (`apps/web/src/lib/api.ts`):
  - `Delegation` interface with id, delegator, delegate, categories, weight, expires_at, is_active
  - `DelegationResponse` interface for delegatedTo/delegatedFrom arrays
  - `fetchDelegations(address)` - Get delegations for address
  - `createDelegation(data)` - Create new delegation
  - `revokeDelegation(id)` - Revoke existing delegation

- **Profile Page Delegation Section** (`apps/web/src/app/[locale]/profile/page.tsx`):
  - DelegationStats component showing voting power breakdown
  - DelegationList with tabbed given/received views
  - "Delegate" button opening DelegationModal
  - Real-time delegation data with TanStack Query

- **Internationalization**:
  - 65+ new translation keys for delegation UI (EN/KO)
  - Stats labels, modal steps, error messages, empty states

### Changed
- Updated USER_GUIDE.md with detailed Treasury and Wallet & Profile sections
- Updated USER_GUIDE.ko.md with Korean translations
- Updated DEVELOPMENT_STATUS.md/ko.md with Phase 10 progress

---

## [0.12.4] - 2026-01-15

### Added
- **Automatic Report Generation System** (`apps/api/src/services/report-generator/`):
  - `ReportGeneratorService` for automated weekly and monthly report generation
  - `DataCollector` aggregates metrics from signals, issues, proposals, agents, sessions
  - `WeeklyReportGenerator` produces governance reports with LLM executive summary
  - `MonthlyReportGenerator` creates comprehensive reports with strategic insights
  - Scheduler integration: weekly (Monday 00:00 UTC), monthly (1st 00:00 UTC)
  - Manual generation API: `POST /api/disclosure/generate/weekly`, `POST /api/disclosure/generate/monthly`
  - Markdown rendering in DisclosureDetailModal with styled tables, headers, code blocks

- **Real-time Health Endpoint** (`apps/api/src/index.ts`):
  - `/health` now returns real data: budget status, scheduler info, agent counts
  - Budget: daily limit, spent today, remaining balance
  - Scheduler: isRunning, nextTier2 run time, queue length, scheduled hours
  - Uptime tracking from server start time

- **Budget Configuration via Environment** (`apps/api/src/db/index.ts`):
  - `ANTHROPIC_DAILY_BUDGET_USD`, `ANTHROPIC_HOURLY_LIMIT`
  - `OPENAI_DAILY_BUDGET_USD`, `OPENAI_HOURLY_LIMIT`
  - `GOOGLE_DAILY_BUDGET_USD`, `GOOGLE_HOURLY_LIMIT`
  - `OLLAMA_HOURLY_LIMIT`
  - Auto-seed budget_config table on first run from .env values

- **Admin API Key Protection** (`apps/api/src/routes/budget.ts`):
  - `ADMIN_API_KEY` environment variable for admin operations
  - `requireAdmin` middleware protects budget modification endpoints
  - `PATCH /api/budget/config/:provider` requires `X-Admin-Key` header

- **Tier Usage Statistics API** (`apps/api/src/routes/stats.ts`):
  - `GET /api/stats/tier-usage` returns tier 0/1/2 call counts for today

### Changed
- **Engine Room Page** (`apps/web/src/app/[locale]/engine/page.tsx`):
  - Now uses real API data instead of hardcoded mock values
  - SchedulerCard updated to handle nullable fields gracefully

### Fixed
- **Modal Portal Pattern** (all modal components):
  - All modals now use React Portal (`createPortal`) for proper z-index stacking
  - Fixed modal overlay issues on Governance and other pages
  - Uses `z-[99999]` for guaranteed top-level rendering

- **Translation Fixes** (`apps/web/src/i18n/messages/en.json`, `ko.json`):
  - Added `Engine.status.ok` key: "All systems operational" / "모든 시스템 정상 작동 중"

---

## [0.12.3] - 2026-01-13

### Added
- **Production Deployment** (`https://algora.moss.land`):
  - pm2 ecosystem configuration (`ecosystem.config.cjs`) for process management
  - nginx reverse proxy configuration for Lightsail server
  - SSL/TLS with Let's Encrypt for secure connections
  - WebSocket proxy support for Socket.IO real-time features
  - Static asset caching headers for performance

### Fixed
- **Next.js i18n Middleware** (`apps/web/src/middleware.ts`):
  - Fixed middleware matcher to exclude `_next` paths from locale processing
  - Resolved 500 errors on static assets (`/_next/static/...`)
  - Fixed `ERR_TOO_MANY_REDIRECTS` caused by locale prefix conflicts
  - Matcher now properly excludes: `_next`, `api`, `favicon.ico`, and file extensions

### Changed
- Updated `apps/web/.env.local` with production API URL (`https://algora.moss.land`)
- DEVELOPMENT_STATUS.md updated with Phase 9 deployment completion

---

## [0.12.2] - 2026-01-13

### Added
- **Agent Clusters Expansion (30 → 38 agents)** (`@algora/core`, `@algora/api`):
  - New cluster types: 'orchestrators', 'archivists', 'red-team', 'scouts'
  - 8 new agents with unique personas:
    - Orchestrators: Nova Prime (methodical coordinator), Atlas (resilient backup)
    - Archivists: Archive Alpha (meticulous keeper), Trace Master (forensic auditor)
    - Red Team: Contrarian Carl (devil's advocate), Breach Tester (security attacker), Base Questioner (assumption challenger)
    - Scouts: Horizon Seeker (opportunity detector)
  - Updated i18n translations for new groups (EN/KO)

- **Real-time Socket.IO for Governance Events** (`@algora/api`, `@algora/web`):
  - 11 new broadcast functions for governance events:
    - `broadcastDocumentCreated`, `broadcastDocumentStateChanged`
    - `broadcastVotingCreated`, `broadcastVoteCast`, `broadcastVotingStatusChanged`
    - `broadcastActionLocked`, `broadcastActionUnlocked`, `broadcastDirector3Approval`
    - `broadcastPipelineProgress`, `broadcastWorkflowStateChanged`, `broadcastHealthUpdate`
  - New `useGovernanceEvents` hook for frontend real-time subscriptions
  - GovernanceEvent type with full event type definitions

- **Operational KPIs Instrumentation** (`@algora/governance-os`):
  - KPICollector class with comprehensive metric tracking:
    - Decision Quality: DP completeness, option diversity, red team coverage, evidence depth
    - Execution Speed: signal-to-issue, issue-to-DP, review queue, execution, end-to-end timing
    - System Health: uptime, heartbeat gaps, LLM availability, queue depth, error rate
  - 7 new API endpoints: `/kpi/dashboard`, `/kpi/decision-quality`, `/kpi/execution-speed`,
    `/kpi/system-health`, `/kpi/alerts`, `/kpi/targets`, `/kpi/export`
  - Alert generation for metrics below target thresholds
  - Prometheus-compatible metric export

- **Security Spam Protection** (`@algora/safe-autonomy`):
  - AntiAbuseGuard class with comprehensive protection:
    - Rate limiting (configurable signals per hour)
    - Deduplication with topic hash and similarity threshold
    - Quality filtering with minimum signal quality requirement
    - Blacklist management for domains and patterns
    - Cooldown periods after rejection
    - Multiple source validation requirement
  - DEFAULT_ANTI_ABUSE_CONFIG with sensible defaults

- **E2E Pipeline Tests** (`@algora/governance-os`):
  - Comprehensive test suite covering:
    - Full Pipeline Execution (LOW/MID/HIGH risk scenarios)
    - Document Registry Integration (create, publish, query)
    - Dual-House Voting Integration (create, start, cast votes)
    - Model Router Integration (task execution, statistics)
    - KPI Collector Integration (samples, heartbeats, operations)
    - Health Monitoring and Statistics
    - Pipeline Stage Verification (all 9 stages)
    - Workflow Type Coverage (A, B, C, D, E)

- **Ollama Model Integration** (`@algora/model-router`):
  - OllamaProvider class for local LLM inference:
    - Text generation via `/api/generate` and `/api/chat` endpoints
    - Embedding support via `/api/embed` endpoint
    - Health checks via `/api/tags` endpoint
    - Model pull functionality with progress callback
    - Automatic retry with exponential backoff
  - OllamaLLMProvider adapter for ModelRouter integration
  - OLLAMA_INSTALL_COMMANDS constant with install commands for all model categories
  - OLLAMA_HARDWARE_REQUIREMENTS constant with VRAM/RAM requirements per model
  - Factory functions: `createOllamaModelRoutingSystem`, `createOllamaModelRoutingSystemWithDefaults`

### Changed
- Package versions updated to reflect new features
- DEVELOPMENT_STATUS.md updated with Phase 8 completion details

---

## [0.12.1] - 2026-01-13

### Added
- **Backend API Endpoints for Governance OS** (`@algora/api`):
  - `GET /governance-os/documents` - List all documents with filters (type, state, limit, offset)
  - `GET /governance-os/voting` - List all voting sessions with filters (status, limit, offset)
  - `GET /governance-os/approvals` - List all high-risk approvals/locked actions
  - `GET /governance-os/approvals/:approvalId` - Get specific approval by ID
  - `GET /governance-os/workflows` - Get workflow statuses for all 5 workflow types (A-E)

- **GovernanceOSBridge Service Methods** (`apps/api/src/services/governance-os-bridge.ts`):
  - `listAllDocuments()` - Query documents from Document Registry
  - `listAllVotings()` - Query voting sessions from Dual-House
  - `listAllApprovals()` - Query high-risk approvals with lock status
  - `getApproval()` - Get specific approval by ID
  - `getWorkflowStatuses()` - Aggregate workflow statistics

- **WittyLoader/WittyMessage Enhancements** (`apps/web/src/components/ui/`, `apps/web/src/hooks/`):
  - New `'governance'` message category for loading states
  - New empty state types: `'workflows'`, `'documents'`, `'votes'`, `'approvals'`
  - Governance-specific loading messages from `governanceMessages`

### Changed
- **Frontend API Functions** (`apps/web/src/lib/api.ts`):
  - `fetchGovernanceOSStats()` - Now correctly handles `{ stats }` wrapper response
  - `fetchDocument()` - Now correctly handles `{ document }` wrapper response
  - `fetchDocuments()` - Now uses real `/governance-os/documents` endpoint
  - `fetchDualHouseVotes()` - Now uses real `/governance-os/voting` endpoint
  - `fetchLockedActions()` - Now uses real `/governance-os/approvals` endpoint
  - `fetchWorkflowStatuses()` - **Removed mock data**, now uses real `/governance-os/workflows` endpoint

### Removed
- Mock data from `fetchWorkflowStatuses()` function - now fetches from real API

---

## [0.12.0] - 2026-01-13

### Added
- **Governance OS Dashboard UI** (`@algora/web`):
  - New `/governance` page with comprehensive v2.0 dashboard
  - Pipeline visualization component showing 9-stage workflow:
    - signal_intake → issue_detection → triage → research → deliberation
    - decision_packet → voting → execution → outcome_verification
  - WorkflowCard component for 5 workflow types (A-E)
  - DocumentCard component for 15 official document types with state badges
  - DualHouseVoteCard component for MossCoin/OpenSource dual-house voting
  - LockedActionCard component for Safe Autonomy status with approval tracking

- **Governance OS API Types** (`apps/web/src/lib/api.ts`):
  - PipelineStage, PipelineStatus for workflow tracking
  - DocumentType (DP, GP, RM, RC, WGC, WGR, ER, PP, PA, DGP, DG, MR, RR, DR, AR, RD, TA)
  - DocumentState (draft, pending_review, in_review, approved, published, superseded, archived, rejected)
  - GovernanceDocument with version and state tracking
  - DualHouseVote for dual-house voting sessions
  - LockedAction, RiskLevel (LOW, MID, HIGH) for safe autonomy
  - WorkflowStatus, GovernanceOSStats, GovernanceOSHealth
  - API functions: fetchGovernanceOSStats, fetchGovernanceOSHealth, fetchPipelineStatus,
    fetchDocuments, fetchDocument, fetchDualHouseVotes, fetchLockedActions,
    fetchWorkflowStatuses, approveLockedAction, castDualHouseVote

- **Navigation Updates**:
  - Added "Governance OS" menu item to Sidebar
  - NEW badge for highlighting new feature

- **Internationalization**:
  - Complete English and Korean translations for Governance OS page
  - Pipeline stage names, document states, voting status, safe autonomy status

---

## [0.11.0] - 2026-01-13

### Added
- **Workflow C: Developer Support** (`@algora/orchestrator`):
  - Types: GrantStatus, GrantCategory, MilestoneStatus, RewardStatus
  - Types: GrantApplication, GrantMilestone, DeveloperGrant, MilestoneReport
  - Types: RetroactiveReward, GrantProposal, ApplicationEvaluation, MilestoneReview
  - WorkflowCHandler class implementation:
    - `processGrantApplication()` - Process applications and create proposals
    - `evaluateApplication()` - AI-powered evaluation with multi-dimensional scoring
    - `processMilestoneReport()` - Review milestone submissions
    - `processRetroactiveReward()` - Handle retroactive reward nominations
    - `requiresDualHouseApproval()` - Check dual-house requirements
    - `requiresDirector3Approval()` - Check Director 3 requirements
    - `calculateDisbursement()` - Calculate disbursement with LOCK status
  - Dual-House approval integration (MossCoin House + OpenSource House)
  - Director 3 approval for high-value grants (>$5,000)
  - LOCK mechanism for all fund disbursements
  - 19 comprehensive test cases, all passing

- **Workflow D: Ecosystem Expansion** (`@algora/orchestrator`):
  - Types: ExpansionOrigin, OpportunityCategory, OpportunityStatus, PartnershipStatus
  - Types: ExpansionOpportunity, OpportunityAssessment, PartnershipProposal
  - Types: PartnershipAgreement, EcosystemReport, DetectedSignal
  - Types: AlwaysOnConfig, AntiAbuseConfig, SignalSource
  - WorkflowDHandler class implementation:
    - `processCallBasedOpportunity()` - Process explicit proposals
    - `processAlwaysOnSignal()` - Process signals from always-on scanner
    - `assessOpportunity()` - AI-powered assessment with SWOT analysis
    - `createPartnershipProposal()` - Create proposals from qualified opportunities
    - `createPartnershipAgreement()` - Create agreements with LOCK mechanism
    - `generateEcosystemReport()` - Generate periodic ecosystem reports
    - `requiresDualHouseApproval()` - Check value-based approval requirements
    - `requiresDirector3Approval()` - Check high-value/high-risk requirements
  - Dual intake: call_based (explicit) and always_on (scanning)
  - Anti-spam guardrails (rate limiting, deduplication, quality filters, blocked domains)
  - Partnership agreement LOCK until all approvals received
  - 21 comprehensive test cases, all passing

- **Workflow E: Working Groups** (`@algora/orchestrator`):
  - Types: WorkingGroupStatus, CharterDuration, WGDocumentType, WGProposalOrigin
  - Types: WorkingGroupProposal, WorkingGroupCharter, WGPublishingRules
  - Types: WorkingGroup, WGStatusReport, WGDissolutionRequest, IssuePattern
  - Types: CharterAmendment, WGProposalEvaluation
  - WorkflowEHandler class implementation:
    - `processWGProposal()` - Process WG formation proposals
    - `evaluateProposal()` - AI-powered multi-dimensional evaluation
    - `createCharter()` - Create charter from approved proposal
    - `activateWorkingGroup()` - Activate WG from approved charter
    - `canPublishDocument()` - Check publishing authority
    - `recordPublication()` - Track WG document publications
    - `generateStatusReport()` - Generate WG status reports
    - `processDissolulutionRequest()` - Handle WG dissolution
    - `detectPatterns()` - Auto-detect issue patterns for WG proposals
    - `generateAutoProposal()` - Generate WG proposals from patterns
  - Publishing authority system with configurable rules
  - Charter management with duration options (3m, 6m, 1y, indefinite)
  - Auto-proposal from issue pattern detection
  - Dual-House approval for all WG formations
  - Director 3 approval for high-budget WGs (>$5,000)
  - 31 comprehensive test cases, all passing

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 7 completion
- Total orchestrator tests: 96 passing (A: 12, B: 13, C: 19, D: 21, E: 31)
- Phase 7 (Workflow Implementation & API Integration) now complete

---

## [0.10.0] - 2026-01-13

### Added
- **Phase 7 Step 1: API Integration**:
  - GovernanceOSBridge service for apps/api integration
  - REST API endpoints for Governance OS:
    - Pipeline endpoints: `/governance-os/pipeline/run`, `/pipeline/issue/:id`
    - Document endpoints: `/governance-os/documents`, `/documents/:id`, `/documents/type/:type`
    - Voting endpoints: `/governance-os/voting`, `/voting/:id`, `/voting/:id/vote`
    - Approval endpoints: `/governance-os/approvals`, `/approvals/:id/approve`
    - Risk/Lock endpoints: `/governance-os/risk/classify`, `/locks/:id`
    - Model router endpoint: `/governance-os/model-router/execute`
    - Stats/Health endpoints: `/governance-os/stats`, `/health`, `/config`

- **Workflow A: Academic Activity** (`@algora/orchestrator`):
  - Types: AcademicSource, ResearchTopic, AcademicPaper, ResearchBrief
  - Types: TechnologyAssessment, ResearchDigest, WorkflowAConfig
  - WorkflowAHandler class implementation:
    - `executeResearchPhase()` - Gather papers and create research brief
    - `executeDeliberationPhase()` - Collect agent opinions, calculate consensus
    - `generateResearchDigest()` - Weekly digest document generation
    - `generateTechnologyAssessment()` - Formal assessment generation
    - `shouldGenerateAssessment()` - Threshold detection
  - Integration with Orchestrator via `executeWorkflowA()` method
  - 12 comprehensive test cases, all passing

- **Workflow B: Free Debate** (`@algora/orchestrator`):
  - Types: DebateSource, DebateCategory, DebatePhase, DebateTopic
  - Types: DebateArgument, DebateThread, ConsensusAssessment, DebateSummary
  - WorkflowBHandler class implementation:
    - `initializeDebate()` - Create debate thread from topic
    - `executeDebatePhase()` - Run individual debate phases
    - `executeFullDeliberation()` - Complete 5-phase debate execution
    - `assessConsensus()` - Consensus calculation with scoring
    - `generateDebateSummary()` - Official summary document
    - `shouldContinueDebate()` - Debate state management
  - Multi-phase debate support (opening, arguments, rebuttals, synthesis, conclusion)
  - Red Team challenge generation in rebuttals phase
  - 5 diverse agent perspectives per debate
  - Integration with Orchestrator via `executeWorkflowB()` method
  - 13 comprehensive test cases, all passing

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 7 progress
- Orchestrator now supports workflow handler initialization
- Added `executeWorkflowA()` and `executeWorkflowB()` to Orchestrator class

---

## [0.9.0] - 2026-01-12

### Added
- **Phase 6: Governance OS Integration Package** (`@algora/governance-os`):
  - **Types** (`types.ts`):
    - GovernanceOSConfig for system-wide configuration
    - PipelineStage and PipelineContext for pipeline management
    - PipelineResult for pipeline completion status
    - WorkflowConfigs (A-E) for workflow-specific settings
    - GovernanceOSEvents for unified event system
    - GovernanceOSStats for system statistics
    - WORKFLOW_DOCUMENT_OUTPUTS mapping
    - DUAL_APPROVAL_DOCUMENTS and DIRECTOR3_REQUIRED_DOCUMENTS
    - ACTION_RISK_LEVELS for risk classification
    - SPECIALIST_DIFFICULTY_MAPPING for model routing
    - DOCUMENT_DIFFICULTY_MAPPING for document generation
  - **Pipeline** (`pipeline.ts`):
    - GovernancePipeline class with 9 stages
    - Stage handlers for signal_intake through outcome_verification
    - Event emission for pipeline progress
    - Retry logic with exponential backoff
    - Pipeline context management
    - PipelineServices interface for dependency injection
  - **Governance OS** (`governance-os.ts`):
    - GovernanceOS class integrating all v2.0 packages
    - Initialization of Safe Autonomy, Orchestrator, Document Registry, Model Router, Dual-House
    - Event wiring between subsystems
    - Pipeline execution API
    - Subsystem accessor methods
    - Statistics tracking (uptime, pipelines, documents, voting, LLM costs)
    - Health check API for component status
    - Configuration management
  - **Factory Functions** (`index.ts`):
    - `createGovernanceOS()` for custom configuration
    - `createDefaultGovernanceOS()` for default setup
    - Comprehensive re-exports from all v2.0 packages

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 6 completion

---

## [0.8.0] - 2026-01-12

### Added
- **Phase 5: Dual-House Governance Package** (`@algora/dual-house`):
  - **Types** (`types.ts`):
    - House types (MossCoin House, OpenSource House)
    - House configuration with quorum, threshold, focus areas
    - Member types (MossCoinMember, OpenSourceMember)
    - Vote types (for, against, abstain) with voting power
    - Dual-house voting status tracking
    - Reconciliation types for conflict resolution
    - Director 3 decision types (override, revote, veto, conditional)
    - High-risk approval types with LOCK/UNLOCK status
    - Vote delegation with scope options
    - Event types for governance monitoring
    - Statistics types for both houses
  - **House Manager** (`houses.ts`):
    - MossCoin House member registration
    - OpenSource House contributor registration
    - Token balance and contribution score tracking
    - Voting power calculation with role multipliers
    - Member status management (active, inactive, suspended)
    - Delegation support between members
    - House statistics calculation
    - Event emission for member changes
  - **Voting Manager** (`voting.ts`):
    - Dual-house voting session creation
    - Parallel voting in both houses
    - Vote casting with power calculation
    - Quorum and pass threshold checking
    - Tally calculation with participation rates
    - Early finalization when quorum reached
    - Vote delegation with scope (all, category, proposal)
    - Automatic status updates
    - Event emission for voting events
  - **Reconciliation Manager** (`reconciliation.ts`):
    - Reconciliation triggering when houses disagree
    - Conflict summary generation
    - Orchestrator analysis with recommendations
    - Director 3 decision submission
    - Decision application (override, revote, veto)
    - Expiration handling for pending memos
    - Deadline extension support
    - Event emission for reconciliation events
  - **High-Risk Approval Manager** (`high-risk-approval.ts`):
    - High-risk approval creation
    - House approval recording
    - Director 3 approval recording
    - LOCK/UNLOCK mechanism
    - Execution handler registration
    - Action execution with audit
    - Missing approval tracking
    - Event emission for approval events
  - **Factory Functions** (`index.ts`):
    - `createDualHouseGovernance()` for complete system
    - `createDualHouseGovernanceWithStorage()` for custom storage
    - Automatic event wiring between components
    - Comprehensive exports for all components

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 5 completion

---

## [0.7.0] - 2026-01-12

### Added
- **Phase 4: Model Router Package** (`@algora/model-router`):
  - **Types** (`types.ts`):
    - LLM tier system (Tier 0: Free, Tier 1: Local, Tier 2: External)
    - Model capabilities (text, code, vision, embedding, rerank, functions)
    - Task types with difficulty classification
    - 5 difficulty levels (trivial, simple, moderate, complex, critical)
    - Quality gate configuration
    - RAG types for embeddings and reranking
    - Default model lineup for all task types
  - **Model Registry** (`registry.ts`):
    - Model registration and management
    - Health check system with automatic monitoring
    - Model search by tier, provider, capabilities
    - Fallback chain generation
    - 14 pre-seeded default models (Ollama + Claude + GPT-4o)
  - **Task Difficulty Classifier** (`classifier.ts`):
    - Automatic task difficulty classification
    - Keyword-based difficulty detection
    - High-stakes and multi-step reasoning detection
    - Confidence scoring with reasoning
    - Batch classification support
  - **Model Router** (`router.ts`):
    - Intelligent task-to-model routing
    - Automatic fallback on failure
    - Budget management with daily limits
    - Statistics tracking (tokens, cost, latency)
    - Event emission for monitoring
  - **Quality Gate** (`quality-gate.ts`):
    - Output validation with multiple checks
    - Length, format, keyword, and safety checks
    - Built-in validators (coherence, completeness, JSON, decision packet)
    - Confidence scoring
    - Custom validator support
  - **Embedding Service** (`rag/embeddings.ts`):
    - Text embedding generation
    - Embedding caching with LRU eviction
    - Cosine similarity calculation
    - Semantic search (find similar)
    - Batch embedding support
    - 3 default embedding models
  - **Reranker Service** (`rag/reranker.ts`):
    - Document reranking by relevance
    - Reciprocal Rank Fusion (RRF)
    - Relevance threshold filtering
    - RAG pipeline combining embeddings + reranking
    - 2 default reranker models
  - **Factory Functions** (`index.ts`):
    - `createModelRoutingSystem()` for easy instantiation
    - `createModelRoutingSystemWithDefaults()` with pre-seeded models
    - Comprehensive exports for all components

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 4 completion

---

## [0.6.0] - 2026-01-12

### Added
- **Phase 3: Document Registry Package** (`@algora/document-registry`):
  - **Types** (`types.ts`):
    - 15 Official document types (DP, GP, RM, RC, WGC, WGR, ER, PP, PA, DGP, DG, MR, RR, DR, AR)
    - Document categories (decision, working_group, ecosystem, developer, transparency, research)
    - Document states (draft, pending_review, in_review, approved, published, superseded, archived, rejected)
    - Semantic versioning with major/minor/patch
    - Provenance types with agent contributions and review history
    - Audit action types (created, updated, state_changed, reviewed, approved, rejected, published, etc.)
    - Document ID generation utilities
  - **Document Manager** (`document.ts`):
    - Full CRUD operations for documents
    - State machine with valid transitions
    - Content hashing for integrity verification
    - Version increment logic
    - Publish, archive, and supersede workflows
    - Agent contribution tracking
    - Event emission for document changes
  - **Version Manager** (`versioning.ts`):
    - Document version storage and retrieval
    - Semantic version comparison
    - Diff generation between versions
    - Version tagging with optional metadata
    - Branch support for parallel versions
    - Version history traversal
  - **Provenance Manager** (`provenance.ts`):
    - Full provenance tracking from signal to outcome
    - Agent contribution recording with model/cost info
    - Review chain management
    - Integrity proof generation (SHA-256)
    - Provenance verification with issue detection
    - Provenance chain building for document lineage
  - **Audit Manager** (`audit.ts`):
    - Immutable audit trail for all document actions
    - Query support with filters (action, actor, date range)
    - Audit summary generation
    - Export to JSON/CSV formats
    - Retention policy with cleanup
    - Integrity verification of audit trail
    - Actor helpers (system, agent, human)
  - **Factory Function** (`index.ts`):
    - `createDocumentRegistry()` for easy instantiation
    - Comprehensive exports for all managers and types

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 3 completion

---

## [0.5.0] - 2026-01-12

### Added
- **Phase 2: Orchestrator Package** (`@algora/orchestrator`):
  - **Types** (`types.ts`):
    - Workflow types (A-E): Academic, Debate, Developer Support, Ecosystem, Working Groups
    - 12 Workflow states: INTAKE → OUTCOME_PROOF with valid transitions
    - Issue types with priority scoring (TopicCategory, ImpactFactors, etc.)
    - Specialist types (RES, ANA, DRA, REV, RED, SUM, TRN, ARC)
    - TODO and task management types
    - Decision packet and execution plan types
    - Event types for orchestrator monitoring
    - Configuration with default values
  - **State Machine** (`state-machine.ts`):
    - WorkflowStateMachine class with transition validation
    - Acceptance criteria enforcement per state
    - State history tracking with provenance
    - Terminal state detection and blocking state handling
    - Serialization/deserialization for persistence
    - Event subscription for state changes
  - **TODO Manager** (`todo-manager.ts`):
    - Persistent TODO list for task continuation
    - Task lifecycle (pending → in_progress → completed/failed/blocked)
    - Exponential backoff for failed tasks
    - Queue depth monitoring
    - Recovery on restart
  - **Specialist Manager** (`specialist-manager.ts`):
    - Specialist subagent coordination
    - System prompts for each specialist type
    - Quality gate validation for outputs
    - Task queue with priority ordering
    - LLM provider interface
    - Mock LLM provider for testing
  - **Orchestrator** (`orchestrator.ts`):
    - Primary coordinator for governance workflows
    - Issue intake and workflow dispatch
    - Priority score calculation
    - Dynamic agent summoning based on issue category
    - Decision packet generation
    - Event emission for monitoring
    - Heartbeat for system liveness

### Changed
- Updated `tsconfig.json` with `@algora/orchestrator` path mapping
- Dependencies on `@algora/safe-autonomy` for risk classification

---

## [0.4.0] - 2026-01-12

### Added
- **Algora v2.0 Upgrade Plan**:
  - Complete upgrade plan document (`docs/algora-v2-upgrade-plan.md`)
  - Korean translation (`docs/algora-v2-upgrade-plan.ko.md`)
  - 20 sections (A-T) covering all v2.0 components
  - Requirements Traceability Matrix and Coverage Checklist

- **Phase 1: Safe Autonomy Package** (`@algora/safe-autonomy`):
  - **Risk Classifier** (`risk-classifier.ts`):
    - Action risk taxonomy (LOW/MID/HIGH)
    - Risk penalty calculation
    - Automatic LOCK triggering for high-risk actions
  - **Lock Manager** (`lock-manager.ts`):
    - LOCK/UNLOCK mechanism for dangerous actions
    - Approval tracking with multi-party requirements
    - Execution gating (HIGH-risk cannot execute without Director 3 approval)
  - **Approval Router** (`approval-router.ts`):
    - Risk-based routing (LOW→auto, MID→any_reviewer, HIGH→director_3)
    - Reviewer registry and notification system
    - Escalation and reminder functionality
  - **Passive Consensus** (`passive-consensus.ts`):
    - Opt-out approval model
    - Auto-approve after timeout (24h LOW, 48h MID)
    - Veto and escalation support
    - "Unreviewed by Human" labeling
  - **Retry Handler** (`retry-handler.ts`):
    - Exponential backoff retry logic
    - Configurable max retries and delays
    - Escalation to human after exhaustion
  - **Full TypeScript Types** (`types.ts`):
    - Complete type definitions for Safe Autonomy layer
    - Default configuration with sensible defaults
  - **Factory Functions**:
    - `createSafeAutonomySystem()` - Bundle all components
    - Individual factory functions for each component

### Changed
- Updated `tsconfig.json` with `@algora/safe-autonomy` path mapping
- Updated `pnpm-workspace.yaml` auto-discovers new package

---

## [0.3.0] - 2026-01-10

### Added
- **Live Showcase Page** (`/live`):
  - Real-time dashboard showcasing 24/7 AI governance system
  - Terminal-style UI with light theme (matching site style)
  - Components:
    - `LiveHeader` - Status bar with version, uptime counter, live indicator
    - `SignalStream` - Real-time signal feed with source color coding
    - `SystemBlueprint` - Pipeline visualization (Signals → Analysis → Issues → Agora → Proposals → Execute)
    - `LiveMetrics` - Live statistics with sparkline graphs
    - `ActivityLog` - Terminal-style activity stream
    - `AgentChatter` - Agent idle messages preview
    - `AgoraPreview` - Active session preview with participants
    - `TerminalBox`, `GlowText` - Shared terminal UI components
  - Socket.io integration for real-time updates
  - LIVE badge in header with pulsing red indicator
  - LIVE menu item in sidebar navigation

### Fixed
- **Hydration Errors**:
  - `useWittyMessage` hook now uses deterministic initial value (first message in array)
  - Time/date formatting uses safe fallbacks to prevent server/client mismatch
  - All live components properly handle undefined timestamps
- **Agora System Messages**: System messages now display as "System" instead of "Unknown"
- **API Response Handling**: All live components correctly extract nested arrays from API responses

---

## [0.2.3] - 2026-01-10

### Added
- **UI Animations**:
  - New Tailwind animations: `slide-in-right`, `scale-in`, `highlight`, `glow`
  - Modal open/close animations (fade-in backdrop + scale-in content)
  - Card hover effects with scale and shadow transitions
- **StatsDetailModal**: New modal component for detailed statistics view
  - Current value with trend indicator
  - Breakdown visualization with progress bars
  - Related activity list filtered by type
- **Enhanced ActivityFeed**:
  - Severity badges with color coding (info/low/medium/high/critical)
  - Agent name display for agent-related activities
  - Metadata summary (uptime, memory, sessionId)
  - Slide-in animation for new items
  - Increased to 25 items with 10s polling interval

### Changed
- **Heartbeat interval**: 10 seconds → 60 seconds (reduced server load)
- **StatsCard component**:
  - Now clickable with `onClick` prop
  - Added variant styles (default, warning, success, primary)
  - Added subtitle prop for contextual hints
  - Enhanced hover animations
- **All modal components** now have consistent animations:
  - ActivityDetailModal, AgentDetailModal, SignalDetailModal
  - IssueDetailModal, SessionDetailModal, NewSessionModal
  - ProposalDetailModal

### Fixed
- Translation files updated with new keys for stats descriptions and detail modal

---

## [0.2.2] - 2026-01-10

### Added
- **Agora Enhancements**:
  - Real-time message fetching from database (replaced mock data)
  - Agent group display in participant list (Visionaries, Builders, etc.)
  - Group-based color coding for participants
  - Participant count in sidebar header
- **Auto Discussion Improvements**:
  - Auto-start discussion when session is created with `autoSummon`
  - Random intervals between 30 seconds to 2 minutes (more natural pacing)
  - First message after 5-10 second delay
- **LLM Rate Limiting**:
  - Global LLM request queue to prevent local LLM overload
  - Minimum 10 second delay between LLM calls
  - Queue status monitoring endpoint (`/api/agora/llm-queue`)
  - Sequential processing of concurrent requests from multiple sessions
- **Disclosure Page**: New transparency reports page with mock data

### Fixed
- **Tooltip z-index**: Fixed help tooltips being hidden behind sidebar by using fixed positioning with calculated coordinates (z-index 9999)
- **Documentation link**: Fixed HelpMenu docs link (`algoradao/algora` → `mossland/Algora/blob/main/USER_GUIDE.md`)
- **Agora Invalid Date**: Fixed `AgoraSession` interface to match API response (snake_case: `created_at`, `updated_at`, etc.)
- **Signals pagination**: Show "Showing X of Y" when displaying fewer signals than total
- **AutoSummon agents**: Fixed `summoned_agents` column not being updated when agents are added via `addParticipant()`
- **SQL syntax error**: Fixed double quotes to single quotes for SQLite string literals in SummoningService

### Changed
- `AgoraMessage` interface added to API types
- `fetchSessionWithMessages()` function added for fetching session with messages
- `startAutomatedDiscussion()` now uses setTimeout with random intervals instead of fixed setInterval

---

## [0.2.1] - 2026-01-09

### Added
- **UX Guide System**:
  - `WelcomeTour` component for first-time visitors
  - `SystemFlowDiagram` component for visual pipeline explanation
  - `HelpTooltip` component for contextual help on each page
  - `HelpMenu` component in header for quick access
  - `/guide` page with complete governance flow visualization
  - localStorage persistence for tour completion status
  - Full i18n support (English/Korean) for guide system
- **Automatic Agora Session Creation**:
  - Auto-create Agora sessions for Critical/High priority issues
  - Category-based agent auto-summoning (Security, Market, Governance, etc.)
  - Cooldown mechanism (30min for critical, 60min for high priority)
  - `AGORA_SESSION_AUTO_CREATED` activity type in ActivityFeed
- **User Documentation**:
  - `USER_GUIDE.md` - Complete English user guide
  - `USER_GUIDE.ko.md` - Complete Korean user guide

### Changed
- Updated `README.md` / `README.ko.md` with new features
- Updated `ARCHITECTURE.md` / `ARCHITECTURE.ko.md` with auto-session flow diagrams
- Updated `DEVELOPMENT_STATUS.md` with completed features
- Added `Zap` icon for auto-created session activity type

---

## [0.1.0] - 2026-01-09

### Added
- **Monorepo Structure**: pnpm workspaces + Turborepo configuration
- **Project Documentation**:
  - `README.md` / `README.ko.md` - Project overview
  - `ARCHITECTURE.md` / `ARCHITECTURE.ko.md` - System architecture
  - `CONTRIBUTING.md` / `CONTRIBUTING.ko.md` - Contribution guidelines
  - `ALGORA_PROJECT_SPEC.md` / `ALGORA_PROJECT_SPEC.ko.md` - Full specification
  - `CLAUDE.md` - AI assistant context
  - `CHANGELOG.md` - Version history
- **Backend (apps/api)**:
  - Express + Socket.IO server on port 3201
  - SQLite database with WAL mode
  - Full database schema (agents, sessions, signals, issues, proposals, etc.)
  - REST API endpoints for all entities
  - ActivityService for logging and heartbeat
  - SchedulerService for 3-tier LLM scheduling
  - 30 seed agents with personas across 7 clusters
- **Frontend (apps/web)**:
  - Next.js 14 with App Router
  - next-intl for i18n (English/Korean)
  - TanStack Query for data fetching
  - Tailwind CSS with custom Algora theme
  - Dashboard with stats and activity feed
  - Header with system status and language toggle
  - Sidebar navigation
  - AgentLobbyPreview component
- **Shared Types (packages/core)**:
  - TypeScript type definitions for all entities
  - API response types
  - WebSocket event type map
- Local LLM recommendations for Mac mini M4 Pro (64GB):
  - Tier 1 (Chatter): Llama 3.2 8B, Phi-4, Qwen 2.5
  - Tier 1+ (Enhanced): Mistral Small 3, Qwen 2.5 32B
  - Tier 2 Fallback: Qwen 2.5 72B-Q4
- External LLM support: Anthropic Claude, OpenAI GPT, Google Gemini
- Development ports: Frontend (3200), Backend (3201)

### Changed
- Updated project vision to emphasize scalability and transparency
  - Initial 30 AI agents with infinite scalability architecture
  - "Dynamic Persona Spectrum" for agent cluster naming
  - Focus on transparent visualization of governance activities

---

## Version History Format

### [X.Y.Z] - YYYY-MM-DD

#### Added
- New features

#### Changed
- Changes in existing functionality

#### Deprecated
- Soon-to-be removed features

#### Removed
- Removed features

#### Fixed
- Bug fixes

#### Security
- Vulnerability fixes

---

## Roadmap

### v0.1.0 - Foundation (Completed)
- [x] Monorepo structure setup
- [x] Database schema implementation
- [x] 30-agent roster definition
- [x] Basic Socket.IO setup
- [x] AgentLobby component

### v0.2.0 - Agora Core (Completed)
- [x] Dynamic summoning engine
- [x] Agora session management
- [x] Discussion arena UI
- [x] Human summoning interface

### v0.2.1 - UX & Auto-Sessions (Completed)
- [x] UX Guide System (Welcome Tour, Help Tooltips)
- [x] Automatic Agora session creation
- [x] User Guide documentation (EN/KO)
- [x] System flow visualization

### v0.3.0 - Signal Intelligence (Completed)
- [x] Signal collection adapters (RSS, GitHub, Blockchain)
- [x] Issue detection system
- [x] Signals/Issues pages

### v0.4.0 - System Operations (Completed)
- [x] Activity log service
- [x] StatusBar component
- [x] Engine room page
- [x] Budget manager

### v0.5.0 - Governance (Completed)
- [x] Proposal system
- [x] Voting mechanism
- [x] Delegation support
- [x] Disclosure reports

### v0.8.0 - Token Integration (Completed)
- [x] MOC token integration
- [x] Token-weighted voting
- [x] Treasury management
- [x] Wallet verification

### v1.0.0 - Production Release (Planned)
- [ ] Full responsive design
- [ ] Integration tests
- [ ] Performance optimization
- [ ] Security audit
- [ ] Mainnet deployment

---

**Note**: This changelog will be updated with every commit as per our documentation policy.
