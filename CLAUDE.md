# CLAUDE.md - AI Assistant Context for Algora

This file provides context for AI assistants (Claude, etc.) working on the Algora project.

## Project Overview

Algora is a **24/7 Live Agentic Governance Platform** for MOC (Moss Coin) holders. The system features dynamically scalable AI agents that engage in continuous discussion and deliberation, transparently visualizing all governance activities for token holders in real-time.

**Domain**: https://algora.moss.land

## Quick Reference

### Technology Stack
- **Monorepo**: pnpm workspaces + Turborepo
- **Backend**: Node.js + TypeScript + Express.js + Socket.IO
- **Frontend**: Next.js 14 + React 18 + TanStack Query + Tailwind CSS
- **Database**: SQLite (better-sqlite3) with WAL mode
- **LLM External**: Anthropic Claude / OpenAI GPT / Google Gemini (Tier 2)
- **LLM Local**: Ollama (Tier 1) - Llama 3.2, Qwen 2.5, Phi-4
- **i18n**: next-intl (English primary, Korean secondary)

### Project Structure
```
algora/
├── apps/
│   ├── api/          # Express REST API + Socket.IO backend
│   └── web/          # Next.js frontend with i18n
├── packages/
│   ├── core/         # Shared types, utilities
│   ├── reality-oracle/       # L0: Signal collection
│   ├── inference-mining/     # L1: Issue detection
│   ├── agentic-consensus/    # L2: Agent system
│   ├── human-governance/     # L3: Voting/Delegation
│   └── proof-of-outcome/     # L4: Result tracking
└── docs/             # Additional documentation
```

## Key Concepts

### 5-Layer Architecture
1. **L0 (Reality Oracle)**: Signal collection from RSS, GitHub, On-chain, Social
2. **L1 (Inference Mining)**: Anomaly detection, issue identification
3. **L2 (Agentic Consensus)**: 30 AI agents deliberate on issues
4. **L3 (Human Governance)**: MOC token holders vote on proposals
5. **L4 (Proof of Outcome)**: Execution tracking, KPI verification

### 3-Tier LLM System
- **Tier 0**: Free operations (RSS/GitHub collection, no LLM)
- **Tier 1**: Local LLM (Ollama) - Agent chatter, simple summaries
- **Tier 2**: External LLM (Claude/GPT) - Serious deliberation, Decision Packets

### Scalable AI Agents (Dynamic Persona Spectrum)
Current configuration: 38 agents in 11 clusters (architecture supports infinite scaling):
1. **Visionaries** (5): Future-oriented thinkers
2. **Builders** (5): Engineering guild
3. **Investors** (4): Market watchers
4. **Guardians** (4): Risk management
5. **Operatives** (5): Data collection specialists
6. **Moderators** (3): Discussion facilitators
7. **Advisors** (4): Domain experts
8. **Orchestrators** (2): Workflow coordinators (Nova Prime, Atlas)
9. **Archivists** (2): Document keepers (Archive Alpha, Trace Master)
10. **Red Team** (3): Devil's advocates (Contrarian Carl, Breach Tester, Base Questioner)
11. **Scouts** (1): Opportunity detectors (Horizon Seeker)

## Development Guidelines

### Code Standards
- **Language**: TypeScript for all code
- **Comments**: English only
- **Commit Messages**: English only
- **Linting**: ESLint + Prettier

### Documentation Requirements
All documentation files must have Korean translations:
- `README.md` / `README.ko.md`
- `ARCHITECTURE.md` / `ARCHITECTURE.ko.md`
- `CONTRIBUTING.md` / `CONTRIBUTING.ko.md`
- `ALGORA_PROJECT_SPEC.md` / `ALGORA_PROJECT_SPEC.ko.md`

**IMPORTANT**: Update ALL documentation (including Korean translations) with every commit.

### UI/UX Priority
UI/UX is critically important for this project:
- The system must feel "alive" and running 24/7
- Agent avatars must show status (idle/active/speaking)
- Activity feed must never pause more than 10 seconds
- Modern, clean design using Tailwind CSS
- Responsive design (mobile-first)

## Common Commands

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Initialize database
pnpm db:init
```

## Environment Variables

Key environment variables (see `.env.example` for full list):
- `ANTHROPIC_API_KEY`: For Claude API (Tier 2)
- `OPENAI_API_KEY`: For OpenAI GPT API (Tier 2)
- `GOOGLE_API_KEY`: For Google Gemini API (Tier 2)
- `LOCAL_LLM_ENDPOINT`: Ollama endpoint (default: http://localhost:11434)
- `LOCAL_LLM_MODEL_CHATTER`: Fast model for chatter (llama3.2:8b)
- `LOCAL_LLM_MODEL_ENHANCED`: Quality model (qwen2.5:32b)
- `ANTHROPIC_DAILY_BUDGET_USD`: Daily budget limit ($10 default)

## Local LLM Hardware

Target machine: Mac mini M4 Pro
- 14-core CPU, 20-core GPU, 16-core Neural Engine
- 64GB Unified Memory
- 2TB SSD

Recommended models:
- **Chatter**: Llama 3.2 8B, Phi-4 14B
- **Enhanced**: Qwen 2.5 32B, Mistral Small 3 24B
- **Fallback**: Qwen 2.5 72B-Q4 (when external budget exhausted)

## API Patterns

### REST API
- Base URL: `/api`
- Authentication: Bearer token (for protected endpoints)
- Response format: JSON with consistent structure

### WebSocket Events
- Namespace: Default
- Key events: `activity:event`, `agent:chatter`, `agora:message`
- Auto-reconnect: 5 attempts, 1-second interval

## Testing Approach

- Unit tests: Vitest
- Integration tests: Playwright
- API tests: Supertest
- Coverage target: 80%+

## Deployment

### Production
- **URL**: https://algora.moss.land
- **Architecture**: nginx (Lightsail) → pm2 (Local Machine)
- **Lightsail Server**: 13.209.131.190 (nginx reverse proxy + SSL)
- **Local Machine**: 211.196.73.206 (pm2 managed services)

### Local Development
- Frontend: http://localhost:3200
- Backend API: http://localhost:3201

### Production Commands
```bash
# Start with pm2
pm2 start ecosystem.config.cjs

# View status
pm2 status

# View logs
pm2 logs algora-api
pm2 logs algora-web

# Restart
pm2 restart all
```

### Database
- SQLite with WAL mode (single-server deployment)
- Path: `apps/api/data/algora.db`

## File Naming Conventions

- Components: PascalCase (`AgentAvatar.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- Types: PascalCase with `.types.ts` suffix
- Tests: Same name with `.test.ts` suffix

## Important Notes

1. **Human Sovereignty**: AI only recommends; humans make final decisions
2. **Auditability**: All outputs must include provenance metadata
3. **Cost Control**: Always check budget before Tier 2 operations
4. **Documentation Sync**: Korean translations must match English versions

---

## Continuing Development

When starting a new session, follow these steps:

1. **Read Status**: Check `DEVELOPMENT_STATUS.md` for current progress
2. **Check Git**: Run `git log --oneline -10` and `git status`
3. **Start Servers**: Run `pnpm dev` (or start api/web separately)
4. **Continue Work**: Follow the "Next Steps" in DEVELOPMENT_STATUS.md
5. **Update Docs**: After significant changes, update:
   - `DEVELOPMENT_STATUS.md` - Progress tracking
   - `CHANGELOG.md` - Version history
   - Korean translations if docs changed

---

## Recent Changes (v0.12.3)

### Production Deployment
- pm2 process management (`ecosystem.config.cjs`)
- nginx reverse proxy on Lightsail with SSL
- Fixed Next.js i18n middleware for static assets

### Governance OS (v2.0)
- **Location**: `apps/web/src/app/[locale]/governance/page.tsx`
- **Components**: `apps/web/src/components/governance/`
  - `PipelineVisualization.tsx` - 9-stage pipeline display
  - `WorkflowCard.tsx` - Workflow type cards (A-E)
  - `DocumentCard.tsx` - Official document cards
  - `DualHouseVoteCard.tsx` - Dual-house voting
  - `LockedActionCard.tsx` - Safe autonomy actions
- **API**: `/governance-os/*` endpoints

### v2.0 Packages
- `@algora/safe-autonomy` - LOCK/UNLOCK, Risk Classification
- `@algora/orchestrator` - Workflow State Machine, 5 Workflows (A-E)
- `@algora/document-registry` - 15 Document Types, Versioning
- `@algora/model-router` - LLM Routing, Ollama Provider
- `@algora/dual-house` - Dual-House Governance
- `@algora/governance-os` - Unified Integration Layer

### Live Showcase Page (`/live`)
- **Location**: `apps/web/src/app/[locale]/live/page.tsx`
- Real-time dashboard with WebSocket updates

### Key Technical Patterns
- **Hydration Safety**: Use deterministic initial values, randomize only after mount
- **API URL**: Use `NEXT_PUBLIC_API_URL` env var for API server URL
- **Socket Events**: `signals:collected`, `agent:chatter`, `activity:event`, `agora:message`
- **i18n Middleware**: Exclude `_next`, `api`, `favicon.ico` from locale processing

---

**Last Updated**: 2026-01-13
**Version**: 0.12.3
