# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- WebSocket real-time updates for auto-sessions
- Advanced agent personality tuning

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
