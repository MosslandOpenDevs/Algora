# Algora Architecture

> System Architecture Documentation for the 24/7 Live Agentic Governance Platform

[한국어 문서 (Korean)](./ARCHITECTURE.ko.md)

---

## Overview

Algora is built on a 5-layer architecture designed for transparency, auditability, and continuous operation.

## 5-Layer Architecture

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

### L0: Reality Oracle

**Purpose**: Collect real-world signals from various sources.

**Components**:
- RSS Feed Adapter
- GitHub Event Adapter
- On-chain Data Adapter (Ethereum/MOC)
- Social Media Adapter

**Data Flow**:
```
External Sources → Adapters → Normalization → Deduplication → Signal Storage
```

### L1: Inference Mining

**Purpose**: Detect anomalies and identify potential issues from collected signals.

**Components**:
- Anomaly Detector
- Threshold Monitor
- Trend Analyzer
- Issue Generator

**Triggers**:
- Statistical anomalies (>2 standard deviations)
- Threshold breaches (configurable)
- Trend pattern matches

### L2: Agentic Consensus

**Purpose**: AI agents deliberate on detected issues and form recommendations.

**Components**:
- Agent Manager (dynamically scalable)
- Summoning Engine
- Agora Session Manager
- Decision Packet Generator

**Agent Groups**:
| Group | Members | Focus |
|-------|---------|-------|
| Visionaries | 5 | Future/Innovation |
| Builders | 5 | Engineering |
| Investors | 4 | Market/Finance |
| Guardians | 4 | Risk/Compliance |
| Operatives | 5 | Data Collection |
| Moderators | 3 | Facilitation |
| Advisors | 4 | Domain Expertise |

### L3: Human Governance

**Purpose**: Enable MOC token holders to make final decisions.

**Components**:
- Proposal Manager
- Voting System
- Delegation System
- Execution Engine

**Voting Mechanics**:
- Token-weighted voting
- Delegation support
- Time-locked proposals

### L4: Proof of Outcome

**Purpose**: Track execution results and verify KPIs.

**Components**:
- Outcome Tracker
- KPI Verifier
- Trust Score Calculator
- Disclosure Publisher

---

## 3-Tier LLM System

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Tier 2: External LLM                        │
│                    (Claude/GPT - Serious Deliberation)              │
│                          Budget Controlled                          │
├─────────────────────────────────────────────────────────────────────┤
│                         Tier 1: Local LLM                           │
│                  (Ollama - Chatter, Simple Tasks)                   │
│                         Always Available                            │
├─────────────────────────────────────────────────────────────────────┤
│                         Tier 0: No LLM                              │
│                    (Data Collection, Aggregation)                   │
│                              Free                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Tier Details

| Tier | Cost | Latency | Use Cases | Models |
|------|------|---------|-----------|--------|
| Tier 0 | Free | Low | RSS fetch, GitHub events, On-chain data | N/A |
| Tier 1 | Local | Medium | Agent chatter, tagging, simple summaries | Llama 3.2, Phi-4, Qwen 2.5 |
| Tier 2 | External | Higher | Deliberation, Decision Packets, Analysis | Claude, GPT-4, Gemini |

### Budget Management

```typescript
interface BudgetConfig {
  provider: 'anthropic' | 'openai';
  dailyBudgetUsd: number;
  hourlyCallLimit: number;
  inputTokenPrice: number;
  outputTokenPrice: number;
}
```

**Fallback Logic**:
```
Tier2 Request → Check Budget →
  ├─ Available → Execute with External LLM
  └─ Exhausted → Fallback to Tier1 (Local) + UI "Degraded" Status
```

---

## Data Architecture

### Database Schema Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   signals    │────▶│    issues    │────▶│  proposals   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │agora_sessions│     │    votes     │
                     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │agora_messages│
                     └──────────────┘

┌──────────────┐     ┌──────────────┐
│    agents    │────▶│ agent_states │
└──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐
│agent_chatter │
└──────────────┘
```

### Key Tables

- **signals**: Raw data from Reality Oracle
- **issues**: Detected problems requiring attention
- **agents**: 30-agent roster with personas
- **agora_sessions**: Discussion sessions
- **proposals**: Human voting items
- **budget_usage**: LLM cost tracking

---

## Real-time Architecture

### WebSocket Events

```typescript
// Server → Client
'activity:event'           // System activity
'agent:chatter'            // Agent idle messages
'agent:summoned'           // Agent joins discussion
'agora:message'            // New discussion message
'budget:warning'           // Budget threshold alert

// Client → Server
'agora:join'               // Join discussion room
'agora:send_message'       // Send message
'agent:summon'             // Request agent summon
```

### Event Flow

```
Signal Detected
      │
      ▼
Issue Created ──────────────────────────────────────┐
      │                                              │
      ▼                                              ▼
Auto-Summon Agents              WebSocket: 'issues:detected'
      │                                              │
      ▼                                              ▼
Agora Session Start             WebSocket: 'agora:session_started'
      │                                              │
      ▼                                              ▼
Agent Messages ◄────────────────WebSocket: 'agora:message'
      │
      ▼
Consensus Reached
      │
      ▼
Decision Packet ────────────────WebSocket: 'agora:consensus'
      │
      ▼
Human Proposal
```

### Automatic Agora Session Creation

High-priority issues automatically trigger Agora discussion sessions:

```
Issue Detected
      │
      ▼
Priority Check ─────────────────┐
      │                         │
      │ (critical/high)         │ (medium/low)
      ▼                         ▼
┌─────────────────┐      Manual Process
│ Auto-Create     │      (if needed)
│ Agora Session   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Select Agents   │
│ by Category     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Agent Auto-     │
│ Summoning       │
└────────┬────────┘
         │
         ▼
WebSocket: 'agora:session-created'
```

**Category-Agent Mapping**:
| Issue Category | Auto-Summoned Agents |
|----------------|---------------------|
| Security | Nova, Marcus |
| Market | Sophia, Marcus |
| Governance | Nova, Sophia |
| DeFi | Marcus, Sophia |
| Protocol | Marcus, Nova |
| Mossland | Nova, Sophia, Marcus |

**Cooldown Rules**:
- Critical issues: 30 minutes between auto-sessions
- High priority issues: 60 minutes between auto-sessions

---

## Frontend Architecture

### Page Structure

```
/                     # Dashboard - Overview
/guide                # System Flow Guide (New Users)
/agora                # Discussion Arena (Core)
/agents               # Agent Management
/signals              # Signal Monitoring
/issues               # Issue Tracking
/proposals            # Voting Interface
/disclosure           # Public Reports
/engine               # System Activity Log
```

### UX Guide System

```
First Visit Detection
      │
      ▼
┌─────────────────┐
│ Welcome Tour    │───▶ Tour Steps (5 stages)
│ Modal Appears   │         │
└────────┬────────┘         ▼
         │              1. Welcome
         │              2. Signals
         │              3. Issues
         │              4. Agora
         │              5. Proposals
         ▼
┌─────────────────┐
│ localStorage:   │
│ algora_has_     │
│ seen_tour=true  │
└─────────────────┘
```

**Components**:
- `WelcomeTour`: Multi-step guided tour on first visit
- `SystemFlowDiagram`: Visual pipeline diagram on /guide page
- `HelpTooltip`: Contextual help icons on each page
- `HelpMenu`: Quick access menu in header

### Component Hierarchy

```
App
├── Layout
│   ├── Header
│   │   └── StatusBar (Budget, Queue, System Status)
│   ├── Sidebar (Navigation)
│   └── Main Content
│
├── Pages
│   ├── Dashboard
│   │   ├── StatsCards
│   │   ├── RecentActivity
│   │   └── ActiveSessions
│   │
│   ├── Agora
│   │   ├── AgentLobby (30 agents)
│   │   ├── DiscussionArena
│   │   ├── EvidencePanel
│   │   └── SummonPanel
│   │
│   └── Engine
│       └── ActivityLog (Full-screen)
│
└── Shared Components
    ├── AgentAvatar
    ├── ActivityEvent
    ├── ProposalCard
    └── SignalCard
```

### State Management

```typescript
// TanStack Query for server state
const { data: agents } = useQuery(['agents'], fetchAgents);
const { data: sessions } = useQuery(['agora', 'sessions'], fetchSessions);

// Socket.IO for real-time updates
useSocket('agent:chatter', (data) => {
  queryClient.setQueryData(['chatter'], (old) => [...old, data]);
});
```

---

## Security Considerations

### Principles

1. **Human Sovereignty**: AI never executes; humans always approve
2. **Auditability**: All actions logged with provenance
3. **Budget Control**: Strict limits on external API usage
4. **Input Validation**: Zod schemas for all inputs

### Implementation

```typescript
// Provenance metadata on all outputs
interface Provenance {
  source: string;
  timestamp: Date;
  model: string;
  taskId: string;
  contentHash: string;
}
```

---

## Deployment Architecture

### Production Setup

```
                    ┌─────────────┐
                    │   Vercel    │
                    │  (Frontend) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   API GW    │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
  ┌──────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐
  │  API Server │  │    SQLite    │  │   Ollama     │
  │  (Express)  │  │   Database   │  │  (Local LLM) │
  └─────────────┘  └──────────────┘  └──────────────┘
```

### Environment Requirements

**Minimum**:
- Node.js 20+
- 4GB RAM
- 10GB Storage

**Recommended** (for Local LLM):
- Apple M4 Pro or equivalent
- 64GB RAM
- 100GB+ Storage
- Ollama installed

---

## Performance Targets

| Metric | Target |
|--------|--------|
| API Response (p95) | < 500ms |
| WebSocket Latency | < 100ms |
| Activity Log Gap | < 10 seconds |
| Chatter Interval | 5-15 seconds |
| Page Load Time | < 2 seconds |

---

**Last Updated**: 2025-01-09
