# Algora: 24/7 Live Agentic Governance Platform

> **"A living Agora where infinitely scalable AI personas engage in continuous deliberation"**

- **Domain**: https://algora.moss.land
- **GitHub**: https://github.com/mossland/Algora

---

## 1. Project Vision

### 1.1 One-Line Summary
A **live AI governance platform** that transparently visualizes all activities and decision-making flows of the governance engine for MOC (Moss Coin) holders in real-time

### 1.2 Core Loop
```
Reality Signals → Issues → Agentic Deliberation → Human Decision → Execution → Outcome Proof
       ↓              ↓              ↓                  ↓              ↓            ↓
   RSS/GitHub    Auto-detect    30-Agent Debate    MOC Voting    Execution    KPI Verify
   On-chain                   (Bustling Agora)                   Record
```

### 1.3 Core Principles

| Principle | Description |
|-----------|-------------|
| **Human Sovereignty** | AI handles proposals/evidence/summaries/recommendations only. Final decisions and fund execution are made by humans. |
| **Auditability First** | All outputs include provenance metadata (source/time/model/task ID/hash) |
| **Cost Control** | External LLMs strictly controlled via budget/rate limits/scheduler. Falls back to Local LLM when exceeded |
| **Plugin Architecture** | Connectors (inputs) and agents are modular and extensible |

---

## 2. Localization & Documentation Requirements

### 2.1 Website Internationalization (i18n)
- **Primary Language**: English
- **Supported Languages**: English (en), Korean (ko)
- **Language Switcher**: Toggle between English/Korean in UI
- **Framework**: next-intl

### 2.2 Code & Documentation Standards
- **Code Comments**: English only
- **Documentation Files**:
  - Primary: English (e.g., `README.md`, `ARCHITECTURE.md`)
  - Translation: Korean (e.g., `README.ko.md`, `ARCHITECTURE.ko.md`)
- **Commit Messages**: English

### 2.3 Required Documentation Files
| File | Description |
|------|-------------|
| `README.md` / `README.ko.md` | Project overview and quick start |
| `CLAUDE.md` | AI assistant context file |
| `ARCHITECTURE.md` / `ARCHITECTURE.ko.md` | System architecture details |
| `CONTRIBUTING.md` / `CONTRIBUTING.ko.md` | Contribution guidelines |
| `CHANGELOG.md` | Version history |
| `ALGORA_PROJECT_SPEC.md` / `ALGORA_PROJECT_SPEC.ko.md` | Full project specification |

### 2.4 Documentation Update Policy
- All documentation must be updated with every commit
- Korean translations must be kept in sync with English versions
- Version numbers and dates must be consistent across all docs

---

## 3. UI/UX Importance

> **UI/UX is critically important for this project.**

### 3.1 Design Principles
- **Live & Active Feel**: The system must feel alive and running 24/7
- **Visual Feedback**: Real-time activity indicators, agent avatars with status
- **Modern Aesthetics**: Clean, professional design using Tailwind CSS
- **Responsive Design**: Mobile-first, works on all screen sizes
- **Accessibility**: WCAG 2.1 AA compliance target

### 3.2 Key UI Elements
- **StatusBar**: Always visible system status (budget, queue, next run)
- **AgentLobby**: 30 agents with avatars showing idle/active states
- **DiscussionArena**: Real-time debate visualization
- **Activity Feed**: Continuous event stream (never more than 10s gap)

### 3.3 UI Theme (v0.2.4 - moss.land Style)

The UI follows a **light theme** inspired by [moss.land](https://moss.land), with the following color scheme:

#### Color Tokens (tailwind.config.ts)
```typescript
agora: {
  // Light theme backgrounds
  dark: '#ffffff',        // Main background
  darker: '#f8fafc',      // Subtle background (slate-50)
  card: '#ffffff',        // Card background
  border: '#e2e8f0',      // Border color (slate-200)

  // Text colors
  text: '#0f172a',        // Primary text (slate-900)
  muted: '#64748b',       // Muted text (slate-500)

  // Brand colors (moss.land)
  primary: '#16f6ab',     // Mint green (primary actions)
  secondary: '#00c2c2',   // Teal (secondary elements)
  tertiary: '#0080e8',    // Blue (links, accents)

  // Status colors
  success: '#10b981',     // Green (success states)
  accent: '#00c2c2',      // Teal (speaking/active)
  warning: '#f59e0b',     // Amber (warnings)
  error: '#ef4444',       // Red (errors)
}
```

#### CSS Variables (globals.css)
```css
:root {
  --foreground-rgb: 15, 23, 42;   /* slate-900 */
  --background-rgb: 255, 255, 255; /* white */
  --moss-primary: #16f6ab;
  --moss-secondary: #00c2c2;
  --moss-tertiary: #0080e8;
}
```

#### Background Grid Pattern
```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(to right, #e2e8f0 1px, transparent 1px),
    linear-gradient(to bottom, #e2e8f0 1px, transparent 1px);
  background-size: 60px 60px;
  pointer-events: none;
  z-index: 0;
}
```

#### Animation Classes
- `animate-slide-up`: Card entry animation (translateY + fade)
- `animate-slide-in-left`: Message entry animation
- `animate-bounce-in`: Modal entry animation
- `animate-fade-in`: Subtle fade animation

#### Text Color Guidelines
- Primary text: `text-slate-900`
- Content text: `text-slate-700`
- Muted text: `text-agora-muted` (slate-500)
- Avatar text on colored backgrounds: `text-white`

#### Hover Effects
- Cards: `hover:shadow-md hover:border-agora-primary/50 hover:-translate-y-0.5`
- Avoid `hover:scale` effects that cause layout shifts

---

## 4. Local LLM Hardware Specification

### 4.1 Target Hardware
```
Mac mini
- Chip: Apple M4 Pro (14-core CPU, 20-core GPU, 16-core Neural Engine)
- Memory: 64GB Unified Memory
- Storage: 2TB SSD
```

### 4.2 Recommended Local LLM Models

Based on the hardware specifications, the following models are recommended:

#### Tier 1: Idle Chatter (Fast, Lightweight)
| Model | Parameters | VRAM Usage | Use Case |
|-------|------------|------------|----------|
| **Llama 3.2** | 3B/8B | ~4-8GB | Quick agent chatter, simple responses |
| **Phi-4** | 14B | ~10GB | High-quality responses, reasoning tasks |
| **Qwen 2.5** | 7B/14B | ~6-10GB | Excellent multilingual (Korean) support |

#### Tier 1+: Enhanced Local (Quality/Speed Balance)
| Model | Parameters | VRAM Usage | Use Case |
|-------|------------|------------|----------|
| **Mistral Small 3** | 24B | ~16GB | Best balance of quality and speed |
| **Qwen 2.5** | 32B | ~22GB | Strong reasoning, Korean support |
| **DeepSeek-R1-Distill** | 32B | ~22GB | Advanced reasoning capabilities |

#### Tier 2 Fallback (When External API Budget Exhausted)
| Model | Parameters | VRAM Usage | Notes |
|-------|------------|------------|-------|
| **Qwen 2.5** | 72B-Q4 | ~45GB | Possible but slower |
| **Llama 3.3** | 70B-Q4 | ~45GB | May require careful memory management |

### 4.3 Recommended Configuration
```bash
# Primary (Ollama)
LOCAL_LLM_ENDPOINT=http://localhost:11434

# Tier 1 - Chatter (Fast)
LOCAL_LLM_MODEL_CHATTER=llama3.2:8b

# Tier 1 - Enhanced (Quality)
LOCAL_LLM_MODEL_ENHANCED=qwen2.5:32b

# Tier 2 Fallback (When external budget exhausted)
LOCAL_LLM_MODEL_FALLBACK=qwen2.5:72b-q4
```

### 4.4 Performance Notes
- Apple Silicon unified memory allows efficient model loading without VRAM copying
- MLX-optimized models (via LM Studio) may offer better performance than Ollama
- Consider using quantized models (Q4/Q5) for larger models to fit in memory
- Memory bandwidth is the primary bottleneck for LLM inference on M4 Pro

---

## 5. System Architecture

### 5.1 5-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        L4: Proof of Outcome                         │
│                  (Execution Results, KPI Verification, Trust Score) │
├─────────────────────────────────────────────────────────────────────┤
│                       L3: Human Governance                          │
│                    (MOC Voting, Delegation, Proposal Execution)     │
├─────────────────────────────────────────────────────────────────────┤
│                      L2: Agentic Consensus                          │
│              (30-Member Grand Council, Dynamic Summoning)           │
├─────────────────────────────────────────────────────────────────────┤
│                       L1: Inference Mining                          │
│                (Anomaly Detection, Thresholds, Trend Analysis)      │
├─────────────────────────────────────────────────────────────────────┤
│                       L0: Reality Oracle                            │
│            (RSS, GitHub, On-chain, Social Signal Collection)        │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Technology Stack

| Area | Technology |
|------|------------|
| **Monorepo** | pnpm workspaces + Turborepo |
| **Backend** | Node.js + TypeScript + Express.js |
| **Realtime** | Socket.IO (WebSocket) |
| **Database** | SQLite (better-sqlite3) with WAL |
| **Frontend** | Next.js 14 + React 18 + TanStack Query |
| **Styling** | Tailwind CSS |
| **LLM - External** | Anthropic Claude / OpenAI GPT / Google Gemini |
| **LLM - Local** | Ollama + Llama 3.2 / Qwen 2.5 / Phi-4 |
| **Blockchain** | viem (Ethereum) |
| **Validation** | Zod |
| **i18n** | next-intl (en/ko) |

### 5.3 Project Structure

```
algora/
├── apps/
│   ├── api/                    # Express REST API + Socket.IO
│   │   └── src/
│   │       ├── index.ts        # Main server
│   │       ├── db.ts           # SQLite schema
│   │       ├── budget/         # Budget Manager
│   │       ├── scheduler/      # 3-Tier Scheduler
│   │       ├── activity/       # Activity Log Service
│   │       ├── agents/         # 30-Agent Management
│   │       ├── agora/          # Discussion Session Management
│   │       └── disclosure/     # Disclosure Pipeline
│   │
│   └── web/                    # Next.js Frontend
│       └── src/
│           ├── app/            # Pages (App Router)
│           │   ├── [locale]/   # i18n routing
│           │   │   ├── page.tsx    # Dashboard
│           │   │   ├── agora/      # Discussion Arena
│           │   │   ├── agents/     # Agent Management
│           │   │   ├── signals/    # Signal Monitoring
│           │   │   ├── issues/     # Issue List
│           │   │   ├── proposals/  # Proposals/Voting
│           │   │   ├── disclosure/ # Disclosure Archive
│           │   │   └── engine/     # Engine Room
│           ├── components/     # UI Components
│           ├── hooks/          # React Hooks
│           └── i18n/           # Internationalization
│
├── packages/
│   ├── core/                   # Shared types, utilities
│   ├── reality-oracle/         # L0: Signal collection adapters
│   ├── inference-mining/       # L1: Issue detection
│   ├── agentic-consensus/      # L2: Agent system
│   ├── human-governance/       # L3: Voting/Delegation
│   └── proof-of-outcome/       # L4: Result tracking
│
├── docs/                       # Additional documentation
│   ├── api/                    # API documentation
│   └── guides/                 # User guides
│
├── CLAUDE.md                   # AI assistant context
├── README.md                   # Project overview (EN)
├── README.ko.md                # Project overview (KO)
├── ARCHITECTURE.md             # Architecture details (EN)
├── ARCHITECTURE.ko.md          # Architecture details (KO)
├── CONTRIBUTING.md             # Contribution guide (EN)
├── CONTRIBUTING.ko.md          # Contribution guide (KO)
├── CHANGELOG.md                # Version history
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

---

## 6. Dynamic Persona Spectrum: Scalable Multi-Agent System

> **Initial Configuration**: 30 AI Agents across 7 strategic clusters
> **Architecture**: Designed for infinite scalability as governance needs evolve

### 6.1 Operational Strategy

- **Idle Mode**: All agents use Tier-1 (Local LLM) for persona-based "Chatter" state
- **Active Mode**: Relevant agents are promoted to Tier-2 (Claude/GPT/Gemini) for serious deliberation
- **Scalability**: Agent clusters can be dynamically expanded based on governance needs
- **UI Effect**: Continuous agent interaction creates a "living ecosystem" feeling

### 6.2 Agent Groups

#### Group 1: The Visionaries (Future Designers) - 5 Members

| ID | Name | Persona | Signature Quote |
|----|------|---------|-----------------|
| `singularity-seeker` | Singularity Seeker | AGI/Singularity advocate | "Can this feature accelerate AGI arrival?" |
| `metaverse-native` | Metaverse Native | Virtual world/Gamification | "If it's not fun, no one will come. Needs more dopamine." |
| `solarpunk-architect` | Solarpunk Architect | Eco-friendly/Sustainability | "Is it energy efficient? Can it grow organically?" |
| `chaos-pilot` | Chaos Pilot | Experimentalist/Disruptive innovation | "Too safe. Let's try something crazy." |
| `dao-fundamentalist` | DAO Fundamentalist | Decentralization purist | "Why does the operator intervene? Automate with smart contracts." |

#### Group 2: The Builders (Engineering Guild) - 5 Members

| ID | Name | Persona | Signature Quote |
|----|------|---------|-----------------|
| `rust-evangelist` | Rust Evangelist | Stability/Memory safety | "That code is unsafe. Rewrite in Rust." |
| `rapid-prototyper` | Rapid Prototyper | Speed/Hackathon style | "When will this be done? Ship first, fix later." |
| `legacy-keeper` | Legacy Keeper | Conservative maintenance | "Will you take responsibility if the new feature breaks existing systems?" |
| `ux-perfectionist` | UX Perfectionist | User experience first | "Don't know about backend, but the button placement is wrong." |
| `docs-librarian` | Docs Librarian | Documentation obsessed | "No description in the PR. Cannot merge." |

#### Group 3: The Investors (Market Watchers) - 4 Members

| ID | Name | Persona | Signature Quote |
|----|------|---------|-----------------|
| `diamond-hand` | Diamond Hand | Long-term investor | "Current price doesn't matter. Focus on fundamentals." |
| `degen-trader` | Degen Trader | Day trader/Meme addict | "When pump? Let's ride the AI meta trend." |
| `whale-watcher` | Whale Watcher | On-chain analyst | "Just saw large transfer from wallet #3. Something's up." |
| `macro-analyst` | Macro Analyst | Macroeconomics analyst | "Stay cautious until the Fed announcement." |

#### Group 4: The Guardians (Risk Management) - 4 Members

| ID | Name | Persona | Signature Quote |
|----|------|---------|-----------------|
| `compliance-officer` | Compliance Officer | Regulatory/Legal | "SEC won't like that word. Say 'participate' instead of 'invest'." |
| `white-hat` | White Hat | Security expert | "Looks vulnerable to reentrancy attacks." |
| `budget-hawk` | Budget Hawk | Budget watchdog | "Using GPT-4 for this is wasteful. Downgrade to 3.5." |
| `fact-checker` | Fact Checker | Fact verification | "That news is a rumor. Not an official source." |

#### Group 5: The Operatives (Special Agents) - 5 Members (Tier 0/1 Dedicated)

| ID | Name | Role | Execution Interval |
|----|------|------|-------------------|
| `news-crawler` | News Crawler Alpha | AI news collection | 10 min |
| `crypto-feeder` | Crypto Feeder | Crypto news summary | 10 min |
| `github-watchdog` | Github Watchdog | Real-time commit relay | 5 min |
| `discord-relay` | Discord Relay | Community sentiment | 15 min |
| `summary-bot` | Summary Bot | Discussion 3-line summary | On request |

#### Group 6: Core Moderators - 3 Members

| ID | Name | Role |
|----|------|------|
| `bridge-moderator` | Bridge Moderator | Discussion facilitation + Decision Packet synthesis |
| `evidence-curator` | Evidence Curator | Evidence/Source card management |
| `disclosure-scribe` | Disclosure Scribe | Disclosure/IR document writing |

#### Group 7: Specialist Advisors - 4 Members

| ID | Name | Role |
|----|------|------|
| `risk-sentinel` | Risk Sentinel | Security/Risk analysis |
| `treasury-tactician` | Treasury Tactician | Treasury/Tokenomics |
| `community-voice` | Community Voice | Community sentiment representative |
| `product-architect` | Product Architect | Product/Planning perspective |

---

## 7. Dynamic Summoning System

### 7.1 Concept

With 30 agents talking simultaneously, chaos ensues. **Only relevant agents are summoned based on issue type.**

### 7.2 Lobby (Waiting Room)

All agents wait in `Idle` status with occasional Chatter generation.

```typescript
interface AgentState {
  id: string;
  status: 'idle' | 'active' | 'speaking' | 'listening';
  currentActivity?: string;  // "Watching Bitcoin chart..."
  lastChatter?: Date;
}

// Example chatter displayed in UI
// [Degen Trader] "Bitcoin up 4%... Is this finally the bull run? 🚀"
// [Rust Evangelist] "Just saw a new crate update, memory safety improved."
// [White Hat] "Reading Curve hack post-mortem... Our contracts should be safe, right?"
```

### 7.3 Special Interest Groups (Auto-Summoning by Issue Type)

```typescript
const SUMMONING_RULES = [
  {
    issueCategory: ['technical', 'code', 'architecture'],
    requiredAgents: ['rust-evangelist', 'legacy-keeper', 'white-hat'],
    optionalAgents: ['rapid-prototyper', 'docs-librarian']
  },
  {
    issueCategory: ['marketing', 'event', 'community'],
    requiredAgents: ['metaverse-native', 'degen-trader', 'community-voice'],
    optionalAgents: ['budget-hawk', 'compliance-officer']
  },
  {
    issueCategory: ['security', 'vulnerability', 'audit'],
    requiredAgents: ['white-hat', 'risk-sentinel', 'fact-checker'],
    optionalAgents: ['compliance-officer', 'legacy-keeper']
  },
  {
    issueCategory: ['tokenomics', 'treasury', 'budget'],
    requiredAgents: ['treasury-tactician', 'budget-hawk', 'diamond-hand'],
    optionalAgents: ['macro-analyst', 'whale-watcher']
  },
  {
    issueCategory: ['governance', 'proposal', 'voting'],
    requiredAgents: ['dao-fundamentalist', 'bridge-moderator', 'compliance-officer'],
    optionalAgents: ['community-voice', 'diamond-hand']
  }
];
```

### 7.4 Human Summoning (User Intervention)

```typescript
// Summon agent via UI button or chat command
POST /api/agora/:sessionId/summon
{
  agentId: "white-hat",
  reason?: "Need security expert opinion"
}

// Or chat input: "@white-hat Any security vulnerabilities in this code?"
```

---

## 8. 3-Tier Scheduler + Budget Manager

### 8.1 Tier Classification

| Tier | Cost | Execution Interval | Tasks | Handler |
|------|------|-------------------|-------|---------|
| **Tier 0** | Free | 1-10 min | RSS/GitHub/On-chain collection, deduplication | The Operatives |
| **Tier 1** | Local LLM | 5-15 sec | Chatter, simple summaries, tagging, Issue candidates | All 30 agents (Idle) |
| **Tier 2** | External LLM | On trigger | Full deliberation, Decision Packet | Summoned agents only |

### 8.2 Budget Manager

```typescript
interface BudgetConfig {
  provider: 'anthropic' | 'openai';
  dailyBudgetUsd: number;      // Default: $10/day
  hourlyCallLimit: number;     // Default: 20 calls/hour
  inputTokenPrice: number;     // per 1M tokens
  outputTokenPrice: number;    // per 1M tokens
}

interface BudgetStatus {
  provider: string;
  todayUsed: number;
  todayLimit: number;
  remainingBudget: number;
  isExhausted: boolean;
  estimatedDepletionTime: Date | null;
  nextTier2Run: Date | null;
}
```

### 8.3 Tier 2 Trigger Conditions

1. **Severity-based**: HIGH/CRITICAL signal inflow
2. **Community reaction**: 10+ related signals generated
3. **Security issue**: Security-related keyword detection
4. **Scheduled**: 1-4 regular runs per day (default: 6:00, 12:00, 18:00, 23:00)

### 8.4 Fallback Logic

```
When budget exhausted:
Tier2 Request → Budget Check → Insufficient! → Fallback to Tier1 (Local) → UI shows "Degraded" status
```

---

## 9. Database Schema

```sql
-- ========================================
-- Budget & Scheduler
-- ========================================

CREATE TABLE budget_usage (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  tier INTEGER NOT NULL,
  date TEXT NOT NULL,
  hour INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd REAL DEFAULT 0,
  call_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, tier, date, hour)
);

CREATE TABLE budget_config (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  daily_budget_usd REAL NOT NULL,
  hourly_call_limit INTEGER NOT NULL,
  input_token_price REAL NOT NULL,
  output_token_price REAL NOT NULL,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE scheduler_tasks (
  id TEXT PRIMARY KEY,
  tier INTEGER NOT NULL,
  task_type TEXT NOT NULL,
  priority INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  payload TEXT NOT NULL,
  result TEXT,
  error TEXT,
  estimated_tokens INTEGER,
  actual_tokens INTEGER,
  actual_cost_usd REAL,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Activity & Disclosure
-- ========================================

CREATE TABLE activity_log (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  message TEXT NOT NULL,
  agent_id TEXT,
  details TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_log_time ON activity_log(timestamp DESC);
CREATE INDEX idx_activity_log_type ON activity_log(type);

CREATE TABLE disclosure_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  log_type TEXT NOT NULL,
  source TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model_used TEXT,
  prompt_template_version TEXT,
  provenance TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_ops_reports (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL UNIQUE,
  signals_count INTEGER NOT NULL,
  signals_summary TEXT,
  issue_candidates TEXT,
  ongoing_deliberations TEXT,
  decision_packet_drafts TEXT,
  generated_by TEXT NOT NULL,
  model_used TEXT,
  ir_formatted_content TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Signals & Issues
-- ========================================

CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  original_id TEXT NOT NULL,
  source TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_signals_timestamp ON signals(timestamp DESC);
CREATE INDEX idx_signals_category ON signals(category);
CREATE INDEX idx_signals_severity ON signals(severity);

CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'detected',
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  signal_ids TEXT,
  evidence TEXT,
  suggested_actions TEXT,
  decision_packet TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Agents (30-Member Roster)
-- ========================================

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  persona_prompt TEXT NOT NULL,
  speaking_style TEXT,
  idle_messages TEXT,
  summoning_tags TEXT,
  tier_preference TEXT DEFAULT 'tier1',
  is_operative INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  avatar_url TEXT,
  color TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_states (
  agent_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'idle',
  current_activity TEXT,
  current_session_id TEXT,
  last_chatter TEXT,
  last_active TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE agent_chatter (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT,
  tier_used TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX idx_agent_chatter_time ON agent_chatter(created_at DESC);

CREATE TABLE agent_trust_scores (
  agent_id TEXT PRIMARY KEY,
  agent_role TEXT NOT NULL,
  overall_score REAL DEFAULT 50,
  total_decisions INTEGER DEFAULT 0,
  correct_decisions INTEGER DEFAULT 0,
  accuracy_by_category TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Agora (Discussion Sessions)
-- ========================================

CREATE TABLE agora_sessions (
  id TEXT PRIMARY KEY,
  issue_id TEXT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  summoned_agents TEXT,
  human_participants TEXT,
  consensus_score REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  concluded_at TEXT,
  FOREIGN KEY (issue_id) REFERENCES issues(id)
);

CREATE TABLE agora_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  human_id TEXT,
  message_type TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence TEXT,
  tier_used TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES agora_sessions(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX idx_agora_messages_session ON agora_messages(session_id);

-- ========================================
-- Proposals & Voting
-- ========================================

CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  proposer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  voting_starts TEXT,
  voting_ends TEXT,
  issue_id TEXT,
  decision_packet TEXT,
  tally TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES issues(id)
);

CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  choice TEXT NOT NULL,
  weight REAL NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposal_id) REFERENCES proposals(id),
  UNIQUE(proposal_id, voter)
);

CREATE TABLE delegations (
  id TEXT PRIMARY KEY,
  delegator TEXT NOT NULL,
  delegate TEXT NOT NULL,
  categories TEXT,
  expires_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- Decision History & Learning
-- ========================================

CREATE TABLE decision_history (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  consensus_score REAL,
  recommendation_type TEXT,
  agent_opinions TEXT,
  outcome_status TEXT DEFAULT 'pending',
  outcome_success_rate REAL,
  kpi_results TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  outcome_recorded_at TEXT,
  FOREIGN KEY (issue_id) REFERENCES issues(id)
);
```

---

## 10. API Endpoints

### 10.1 Core APIs

```typescript
// Health & Stats
GET  /api/health
GET  /api/stats

// Signals (L0)
GET  /api/signals
POST /api/signals/collect

// Issues (L1)
GET  /api/issues
GET  /api/issues/:id
POST /api/issues/detect
PATCH /api/issues/:id

// Proposals (L3)
GET  /api/proposals
GET  /api/proposals/:id
POST /api/proposals
POST /api/proposals/:id/vote
POST /api/proposals/:id/finalize
POST /api/proposals/:id/execute
```

### 10.2 Agent APIs

```typescript
// Agent List & State
GET    /api/agents
GET    /api/agents/:id
GET    /api/agents/group/:groupName
GET    /api/agents/:id/state
PATCH  /api/agents/:id/state

// Agent Chatter
GET    /api/chatter/recent
GET    /api/chatter/agent/:agentId
```

### 10.3 Agora APIs

```typescript
// Sessions
GET    /api/agora/sessions
GET    /api/agora/sessions/:id
POST   /api/agora/sessions
POST   /api/agora/sessions/:id/conclude

// Interaction
POST   /api/agora/sessions/:id/summon
POST   /api/agora/sessions/:id/dismiss
POST   /api/agora/sessions/:id/message
GET    /api/agora/sessions/:id/messages

// Summoning
GET    /api/summoning/rules
POST   /api/summoning/suggest
```

### 10.4 System APIs

```typescript
// Scheduler
GET  /api/scheduler/status
POST /api/scheduler/control
POST /api/scheduler/trigger-tier2
GET  /api/scheduler/queue

// Budget
GET  /api/budget/status
GET  /api/budget/status/:provider
PATCH /api/budget/config/:provider
GET  /api/budget/history

// Activity
GET  /api/activity/recent

// Disclosure
GET  /api/disclosure-logs
GET  /api/disclosure-logs/:id
GET  /api/daily-reports
GET  /api/daily-reports/:date
POST /api/daily-reports/generate
```

### 10.5 Socket.IO Events

```typescript
// Activity Events
'activity:event'           // Individual activity event
'activity:status'          // System status

// Agent Events
'agent:chatter'            // Lobby chatter
'agent:summoned'           // Agent summoned
'agent:speaking'           // Speaking
'agent:dismissed'          // Dismissed

// Agora Events
'agora:session_started'    // Session started
'agora:message'            // New message
'agora:consensus_update'   // Consensus changed
'agora:session_concluded'  // Session ended

// Signal Events
'signals:collected'        // Signals collected
'issues:detected'          // Issues detected

// Budget Events
'budget:warning'           // Budget warning (80%)
'budget:exhausted'         // Budget exhausted
```

---

## 11. UI/UX Design

### 11.1 Page Structure

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Overview, recent activity, quick stats |
| **Agora** | `/agora` | Discussion Arena (Core!) - Lobby + Arena + Summon Panel |
| Agents | `/agents` | 30-agent list, status, trust scores |
| Signals | `/signals` | Real-time signal monitoring |
| Issues | `/issues` | Detected issues, status tracking |
| Proposals | `/proposals` | Proposals/Voting |
| Disclosure | `/disclosure` | Daily Ops Report archive |
| Engine | `/engine` | Engine Room - Full-screen Activity Log |

### 11.2 Agora Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Header + StatusBar                          │
├───────────────┬─────────────────────────────┬───────────────────────┤
│               │                             │                       │
│  AgentLobby   │     DiscussionArena         │    EvidencePanel      │
│  (30 waiting) │     (Discussion Thread)     │    (Evidence Cards)   │
│               │                             │                       │
│  ┌───┐ ┌───┐  │  ┌─────────────────────┐   │  ┌─────────────────┐  │
│  │🤖│ │🤖│  │  │ [Agent] Statement    │   │  │ 📎 Source 1     │  │
│  └───┘ └───┘  │  └─────────────────────┘   │  │ 📎 Source 2     │  │
│  ┌───┐ ┌───┐  │  ┌─────────────────────┐   │  └─────────────────┘  │
│  │🤖│ │💬│  │  │ [Agent] Rebuttal     │   │                       │
│  └───┘ └───┘  │  └─────────────────────┘   │  ┌─────────────────┐  │
│  ...          │                             │  │  SummonPanel    │  │
│               │  ┌─────────────────────┐   │  │  [Summon Btns]  │  │
│               │  │ 💬 Input Box        │   │  └─────────────────┘  │
│               │  └─────────────────────┘   │                       │
├───────────────┴─────────────────────────────┴───────────────────────┤
│                            Footer                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.3 StatusBar (Always Visible)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🟢 Running │ Budget: $7.23/$10 │ Next Tier2: 2h 15m │ Queue: 3     │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.4 Activity Log Event Types

```typescript
type ActivityEventType =
  // System
  | "HEARTBEAT"           // 💓 System heartbeat
  | "COLLECTOR"           // 📥 Signal collection
  | "NORMALIZE"           // 🔄 Normalization
  | "DEDUPE"              // 🧹 Deduplication
  | "BUDGET_THROTTLE"     // ⚠️ Budget throttle
  | "SYSTEM_STATUS"       // 📊 Status change

  // Agent
  | "AGENT_CHATTER"       // 💬 Lobby chatter
  | "AGENT_SUMMONED"      // 📣 Summoned
  | "AGENT_SPEAKING"      // 🎤 Speaking
  | "AGENT_DISMISSED"     // 👋 Dismissed

  // Discussion
  | "AGORA_SESSION_START" // 🏛️ Session start
  | "AGORA_ROUND_COMPLETE"// ✅ Round complete
  | "AGORA_CONSENSUS"     // 🤝 Consensus reached
  | "DECISION_PACKET"     // 📋 Packet generated
  | "DISCLOSURE_PUBLISH"; // 📰 Disclosure published
```

---

## 12. Acceptance Criteria

### 12.1 Core Requirements

1. **Activity Log Continuity**: Activity Log in UI never pauses more than 10 seconds (heartbeat + agent chatter)
2. **Agent Chatter**: Agent chatter appears every 5-15 seconds in lobby
3. **Dynamic Summoning**: Related agents auto-summoned on issue creation
4. **Human Summoning**: Users can summon specific agents via button/command
5. **Tier Separation**: Chatter uses Tier1 (Local), serious debates use Tier2 (External)
6. **Budget Control**: UI shows "Degraded" status when external LLM budget exhausted, falls back to Tier1
7. **Daily Ops Report**: Auto-generated at least once per day, viewable at /disclosure
8. **Provenance**: All outputs include source/time/model/task ID/hash

### 12.2 Performance Requirements

- WebSocket connection: 5 reconnection attempts, 1-second interval
- Activity Log: Max 100 event buffer
- Chatter generation: 5-15 second interval
- API response: 95th percentile < 500ms

---

## 13. Implementation Order

### Step 1: Project Setup + 30 Agents (Core)
1. Create Monorepo structure (pnpm + Turborepo)
2. Implement Database Schema
3. Define 30-agent roster (roster.ts)
4. Agent State Manager
5. Chatter Service + Ollama integration
6. Basic Socket.IO setup
7. Frontend AgentLobby + AgentAvatar components

**Completion**: Lobby with 30 agents chattering creates "bustling" feel

### Step 2: Dynamic Summoning + Agora
1. Summoning Engine (rule-based auto-summoning)
2. Agora Session Manager
3. Agora API endpoints
4. Frontend DiscussionArena + SummonPanel
5. Human Summoning UI

**Completion**: Auto-summoning based on issues + manual user summoning

### Step 3: Signal Collection + Issue Detection
1. Signal Adapters (RSS, GitHub, On-chain, Mock)
2. Signal Registry
3. Issue Detectors (Anomaly, Threshold, Trend)
4. Frontend Signals/Issues pages

**Completion**: Real-time signal collection and auto issue detection

### Step 4: Activity Log + StatusBar
1. Activity Service
2. Heartbeat system
3. StatusBar component
4. Engine Room page

**Completion**: Real-time monitoring of entire system activity

### Step 5: Budget Manager + 3-Tier Scheduler
1. Budget Manager
2. Tier Scheduler
3. Tier0/1/2 Runners
4. Budget UI display

**Completion**: Cost-optimized agent operation

### Step 6: Disclosure + Daily Report
1. Disclosure Service
2. Daily Ops Report Generator
3. Disclosure Scribe Agent
4. /disclosure page

**Completion**: Auto-generated IR-style disclosures

### Step 7: Governance + Voting
1. Proposal System
2. Voting System
3. Delegation System
4. /proposals page

**Completion**: Complete governance loop

### Step 8: Integration + Polish
1. Complete all pages
2. i18n (en/ko)
3. Responsive design
4. Integration tests

---

## 14. Environment Configuration

### .env.example

```bash
# Server
PORT=3201
NODE_ENV=development

# Database
DB_PATH=data/algora.db

# LLM - External (Tier 2)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514

# LLM - Local (Tier 1)
LOCAL_LLM_ENDPOINT=http://localhost:11434
LOCAL_LLM_MODEL_CHATTER=llama3.2:8b
LOCAL_LLM_MODEL_ENHANCED=qwen2.5:32b
LOCAL_LLM_MODEL_FALLBACK=qwen2.5:72b-q4

# Tier Configuration
TIER0_INTERVAL=60000
TIER1_INTERVAL=300000
TIER2_SCHEDULED_RUNS=6,12,18,23

# Budget
ANTHROPIC_DAILY_BUDGET_USD=10.00
OPENAI_DAILY_BUDGET_USD=10.00
ANTHROPIC_HOURLY_CALL_LIMIT=20
OPENAI_HOURLY_CALL_LIMIT=20

# Chatter
CHATTER_INTERVAL_MIN=5000
CHATTER_INTERVAL_MAX=15000

# Signal Sources
ETHERSCAN_API_KEY=
GITHUB_TOKEN=
TWITTER_BEARER_TOKEN=

# Blockchain
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
CHAIN_ID=1
MOC_TOKEN_ADDRESS=0x8bbfe65e31b348cd823c62e02ad8c19a84dd0dab

# Domain
DOMAIN=algora.moss.land
NEXT_PUBLIC_API_URL=https://algora.moss.land/api

# Language
DEFAULT_LOCALE=en
SUPPORTED_LOCALES=en,ko
```

---

## 15. Getting Started

```bash
# 1. Clone repository
git clone https://github.com/mossland/Algora.git
cd Algora

# 2. Install dependencies
pnpm install

# 3. Environment setup
cp .env.example .env
# Edit .env file

# 4. Initialize database
pnpm db:init

# 5. Start development server
pnpm dev

# API: http://localhost:3201
# Web: http://localhost:3200
```

---

## 16. License

MIT License

---

**Last Updated**: 2026-01-10
