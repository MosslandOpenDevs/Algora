# Algora Governance Upgrade Plan v1.0

**작성일**: 2026-01-11
**버전**: 1.0.0
**상태**: 설계 완료 (Design Complete)

---

## 목차

1. [Executive Summary](#1-executive-summary)
2. [현재 구현 상태 (AS-IS)](#2-현재-구현-상태-as-is)
3. [목표 구조 (TO-BE)](#3-목표-구조-to-be)
4. [Gap Analysis: 변경/추가/삭제 사항](#4-gap-analysis-변경추가삭제-사항)
5. [Phase별 구현 계획](#5-phase별-구현-계획)
6. [데이터베이스 스키마 변경](#6-데이터베이스-스키마-변경)
7. [API 변경 사항](#7-api-변경-사항)
8. [프론트엔드 변경 사항](#8-프론트엔드-변경-사항)
9. [마이그레이션 전략](#9-마이그레이션-전략)
10. [위험 요소 및 대응](#10-위험-요소-및-대응)

---

## 1. Executive Summary

### 핵심 변경 요약

**Algora = 모스랜드 생태계의 '결정 품질'(근거/옵션/리스크)과 '실행 속도'를 올리는 24/7 거버넌스 OS**

현재 Algora는 **커뮤니티 직접 투표 모델**로 구현되어 있으나, 새로운 거버넌스 구조는 **Director Council(3명) 승인 모델**을 도입하여 효율성과 책임성을 강화합니다.

| 구분 | AS-IS (현재) | TO-BE (목표) |
|------|-------------|-------------|
| **의사결정 주체** | Token Holder 직접 투표 | Director 3명 승인 + DAO 투표(중대사안) |
| **실행 단위** | 개별 Agent | Working Group (5개 WG) |
| **Agent 역할** | 7 Cluster 고정 | Session별 동적 역할 할당 |
| **문서 체계** | Proposal 중심 | Issue Card → Decision Packet → Registry |
| **Human Gate** | 없음 (전체 커뮤니티) | Director Review Layer |

### 핵심 목표

1. **결정 속도 향상**: 일상 운영은 Director 승인으로 신속 처리
2. **투표 피로도 감소**: DAO 전체 투표는 중대사안으로 제한
3. **책임 구조 명확화**: Director가 최종 승인/책임
4. **문서화 강화**: 모든 결정을 Registry로 추적 가능하게

---

## 2. 현재 구현 상태 (AS-IS)

### 2.1 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  L0: Reality Oracle                                     │
│  - RSS (17 feeds), GitHub (68 repos), Blockchain       │
│  - SignalCollector 자동 수집                            │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  L1: Inference Mining                                   │
│  - IssueDetectionService (10 patterns)                 │
│  - 자동 Issue 생성 + Agora 세션 생성                    │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  L2: Agentic Consensus                                  │
│  - 30 Agents (7 Clusters)                              │
│  - Agora Session + LLM 기반 토론                        │
│  - Decision Packet 자동 생성                            │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  L3: Human Governance (현재)                            │
│  - Token 기반 커뮤니티 투표                              │
│  - Quorum + Approval Threshold                          │
│  - ❌ Director Council 없음                             │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  L4: Proof of Outcome                                   │
│  - Execution Tracking                                   │
│  - Trust Scoring                                        │
│  - Analytics                                            │
└─────────────────────────────────────────────────────────┘
```

### 2.2 현재 Agent 구조

**7 Clusters (30 Agents)**

| Cluster | 인원 | 현재 역할 | 주요 Agent |
|---------|------|----------|-----------|
| Visionaries | 5 | 미래 비전 | Singularity Seeker, Metaverse Native |
| Builders | 5 | 기술 구현 | Rust Evangelist, Rapid Prototyper |
| Investors | 4 | 시장 분석 | Diamond Hand, Macro Analyst |
| Guardians | 4 | 리스크 관리 | Compliance Officer, White Hat |
| Operatives | 5 | 데이터 수집 (Tier 0) | News Crawler, GitHub Watchdog |
| Moderators | 3 | 토론 진행 | Bridge Moderator, Evidence Curator |
| Advisors | 4 | 도메인 전문 | Risk Sentinel, Community Voice |

### 2.3 현재 Proposal Workflow

```
draft → pending_review → discussion → voting → passed/rejected → executed
```

**특징**:
- 모든 Proposal이 Token 기반 투표로 결정
- Director 승인 단계 없음
- Working Group 개념 없음

### 2.4 현재 데이터베이스 테이블 (19개)

```
Core: agents, agent_states, agent_chatter, agent_trust_scores
Signals: signals, issues
Agora: agora_sessions, agora_participants, agora_messages
Governance: proposals, votes, delegations, proposal_comments, proposal_endorsements, proposal_history
Outcomes: decision_history
System: budget_usage, budget_config, scheduler_tasks, activity_log, disclosure_logs, daily_ops_reports
```

---

## 3. 목표 구조 (TO-BE)

### 3.1 신규 거버넌스 계층

```
┌─────────────────────────────────────────────────────────┐
│  DAO (Token Holders) - 최상위                           │
│  결정: 큰 예산 엔벨롭, 룰/헌장급 정책, 권한 구조 변경      │
│  빈도: 월 1회 (중대사안만)                               │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Director Council (3명) - Human Gate                    │
│  A: Governance/Registry & Ops                           │
│  B: Ecosystem/Growth & IP                               │
│  C: Product/DevSupport                                   │
│  역할: 최종 승인, 공표, Registry 업데이트                 │
│  빈도: 주 2회 (30-45분)                                 │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Working Groups (5개) - AI 운영, Human 스폰서           │
│  1. MetaGov & Registry (Ops) - Director A              │
│  2. Ecosystem Growth - Director B                       │
│  3. DevSupport & Open Source - Director C              │
│  4. IP / Worldbuilding - Director B                    │
│  5. Safety & Integrity - Director A                    │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Agent Swarm (30+ Dynamic)                              │
│  - Session별 역할 동적 할당                              │
│  - WG 맥락에 맞는 Agent 소환                            │
└─────────────────────────────────────────────────────────┘
```

### 3.2 신규 Agent 역할 체계

**A) 시스템 레벨 (L0-L4 파이프라인)**

| Layer | Agent 역할 | 산출물 |
|-------|-----------|--------|
| L0 | Operatives (Reality Oracle) | Signal Snapshot |
| L1 | Analysts (Inference Mining) | Issue Card |
| L2 | Swarm (Agentic Consensus) | Decision Packet |
| L3 | Human Gate (Directors) | Official Decision + Registry |
| L4 | Verifiers (Proof-of-Outcome) | Outcome Report |

**B) 세션 레벨 (동적 소환)**

| 역할 | 책임 | 할당 클러스터 |
|------|------|--------------|
| Moderator (Chair) | 토론 구조화, 결론 압축 | Moderators |
| Scribe (Clerk) | 템플릿 변환, 버전/근거 링크 | Moderators |
| Risk Gate | 사기/남용/법무/평판 리스크 | Guardians |
| Evidence Curator | 근거 데이터 수집, 반증 확보 | Operatives |
| Builder (Tech) | 납품물 정의, 기술 실행 가능성 | Builders |
| Investor (Budget) | 예산, ROI, 토큰 영향 | Investors |
| Visionary (Strategy) | 장기 방향성, 세계관 일치 | Visionaries |
| Advisor (Domain) | IP/마케팅/법무 등 도메인 | Advisors |

### 3.3 신규 문서 체계

**4종 핵심 문서**

| 문서 | 생성 단계 | 내용 | 담당 |
|------|----------|------|------|
| **Issue Card** | L1 | 문제요약, 근거 링크, 권장 WG, 우선순위 | Analyst Agent |
| **Proposal/Policy Draft** | L2 | 납품물, 지표, 예산, 리스크, 대안 | Swarm Agents |
| **Decision Packet** | L2→L3 | 결정문 초안 + 커뮤니티 공지 요약 | Moderator + Scribe |
| **Outcome Report** | L4 | KPI/납품물 검증, 개선안 | Verifier Agent |

### 3.4 신규 Registry 시스템

| Registry | 내용 | 업데이트 주기 |
|----------|------|--------------|
| **Decision Registry** | 모든 공식 결정문 | 결정 시 |
| **Program Registry** | 그랜트/캠페인 정보 | 프로그램 변경 시 |
| **Agent Registry** | Agent 프로필, 신뢰도, 상태 | 실시간 |
| **Steward Registry** | Director/WG 리더 정보 | 권한 변경 시 |
| **Policy Registry** | 활성 정책/룰 | 정책 변경 시 |

---

## 4. Gap Analysis: 변경/추가/삭제 사항

### 4.1 ✅ 유지 (Keep)

| 항목 | 현재 상태 | 비고 |
|------|----------|------|
| L0 Signal Collection | 완료 (RSS, GitHub, Blockchain) | 유지 |
| L1 Issue Detection | 완료 (10 patterns) | 확장 필요 |
| L2 Agora Session | 완료 | Role 할당 추가 |
| L4 Outcome/Trust Scoring | 완료 | 유지 |
| 30 Agents (7 Clusters) | 완료 | 역할 체계 추가 |
| 3-Tier LLM System | 완료 | 유지 |
| WebSocket 실시간 통신 | 완료 | 이벤트 추가 |
| SQLite + WAL | 완료 | 테이블 추가 |

### 4.2 ➕ 추가 (Add)

#### 4.2.1 신규 Entity/테이블

| 테이블 | 용도 | 우선순위 |
|--------|------|----------|
| `directors` | Director 3명 정보 | P0 |
| `director_approvals` | Director 승인 기록 | P0 |
| `working_groups` | WG 5개 정의 | P0 |
| `wg_assignments` | Agent-WG 매핑 | P0 |
| `wg_decisions` | WG 내 결정 기록 | P1 |
| `decision_registry` | 공식 결정문 저장 | P0 |
| `policy_registry` | 정책/룰 저장 | P1 |
| `program_registry` | 프로그램 정보 | P1 |
| `session_roles` | Agora 세션 내 역할 할당 | P0 |
| `issue_cards` | 구조화된 Issue Card | P0 |
| `outcome_reports` | 구조화된 Outcome Report | P1 |

#### 4.2.2 신규 API 엔드포인트

| Endpoint | Method | 용도 |
|----------|--------|------|
| `/api/directors` | GET/POST/PUT | Director 관리 |
| `/api/directors/:id/approve` | POST | Decision 승인 |
| `/api/directors/:id/reject` | POST | Decision 반려 |
| `/api/working-groups` | GET/POST | WG 관리 |
| `/api/working-groups/:id/agents` | GET/POST | WG Agent 관리 |
| `/api/working-groups/:id/decisions` | GET/POST | WG 결정 기록 |
| `/api/registry/decisions` | GET/POST | Decision Registry |
| `/api/registry/policies` | GET/POST | Policy Registry |
| `/api/registry/programs` | GET/POST | Program Registry |
| `/api/agora/sessions/:id/roles` | GET/POST | 세션 역할 할당 |
| `/api/issues/:id/card` | GET/PUT | Issue Card 관리 |
| `/api/outcomes/:id/report` | GET/PUT | Outcome Report 관리 |

#### 4.2.3 신규 WebSocket 이벤트

| Event | Payload | 용도 |
|-------|---------|------|
| `director:approval_requested` | `{decisionId, directorIds}` | 승인 요청 알림 |
| `director:approved` | `{decisionId, directorId, signature}` | 승인 완료 |
| `director:rejected` | `{decisionId, directorId, reason}` | 반려 |
| `wg:decision_created` | `{wgId, decision}` | WG 결정 생성 |
| `registry:updated` | `{type, id, action}` | Registry 업데이트 |
| `session:role_assigned` | `{sessionId, agentId, role}` | 역할 할당 |

#### 4.2.4 신규 프론트엔드 페이지/컴포넌트

| 페이지 | 경로 | 용도 |
|--------|------|------|
| Director Dashboard | `/directors` | Director 전용 대시보드 |
| Director Review | `/directors/review` | 승인 대기 목록 |
| Working Groups | `/working-groups` | WG 목록 및 상태 |
| WG Detail | `/working-groups/:id` | WG 상세 및 결정 내역 |
| Decision Registry | `/registry/decisions` | 공식 결정문 목록 |
| Policy Registry | `/registry/policies` | 정책/룰 목록 |

| 컴포넌트 | 용도 |
|----------|------|
| `DirectorCard` | Director 정보 표시 |
| `ApprovalQueue` | 승인 대기열 |
| `ApprovalModal` | 승인/반려 UI |
| `WGCard` | WG 카드 |
| `WGAgentList` | WG 소속 Agent 목록 |
| `SessionRolePanel` | Agora 세션 역할 패널 |
| `IssueCardTemplate` | Issue Card 템플릿 뷰어 |
| `DecisionPacketEditor` | Decision Packet 편집기 |
| `RegistryBrowser` | Registry 브라우저 |

### 4.3 🔄 변경 (Modify)

#### 4.3.1 Proposal Workflow 변경

**AS-IS**:
```
draft → pending_review → discussion → voting → passed/rejected → executed
```

**TO-BE**:
```
draft → wg_review → agentic_deliberation → decision_packet_ready →
  ├─→ director_review → director_approved → executed (운영 결재)
  └─→ director_review → dao_required → dao_voting → passed/rejected → executed (DAO 결재)
```

**변경 포인트**:
- `pending_review` → `wg_review` (WG 검토)
- `discussion` → `agentic_deliberation` (Agent 숙의)
- 신규: `decision_packet_ready` (Decision Packet 완성)
- 신규: `director_review` (Director 검토)
- 신규: `director_approved` (Director 승인 완료)
- 신규: `dao_required` (DAO 투표 필요)
- `voting` → `dao_voting` (명확화)

#### 4.3.2 Agent 역할 체계 변경

**AS-IS**: 7 Cluster 고정
```typescript
type AgentCluster = 'visionaries' | 'builders' | 'investors' | 'guardians' | 'operatives' | 'moderators' | 'advisors';
```

**TO-BE**: Cluster + Session Role
```typescript
// Cluster (기존 유지)
type AgentCluster = 'visionaries' | 'builders' | 'investors' | 'guardians' | 'operatives' | 'moderators' | 'advisors';

// Session Role (신규)
type SessionRole = 'moderator' | 'scribe' | 'risk_gate' | 'evidence_curator' | 'builder_tech' | 'budget_analyst' | 'strategist' | 'domain_advisor';

// System Level Role (신규)
type SystemLevelRole = 'l0_operative' | 'l1_analyst' | 'l2_deliberator' | 'l4_verifier';
```

#### 4.3.3 Issue 구조 확장

**AS-IS**:
```typescript
interface Issue {
  id: string;
  title: string;
  description: string;
  signalIds: string[];
  status: IssueStatus;
  priority: IssuePriority;
}
```

**TO-BE**:
```typescript
interface Issue {
  id: string;
  title: string;
  description: string;
  signalIds: string[];
  status: IssueStatus;
  priority: IssuePriority;
  // 신규 필드
  issueCard?: IssueCard;
  recommendedWG?: string;
  evidenceLinks: string[];
  detectedBy: string; // Agent ID
}

interface IssueCard {
  summary: string;
  evidenceLinks: string[];
  recommendedWG: string;
  priority: IssuePriority;
  suggestedActions: string[];
  relatedDecisions: string[]; // Decision Registry IDs
  createdAt: string;
  createdBy: string; // Agent ID
}
```

#### 4.3.4 Decision Packet 구조 확장

**AS-IS**: 단순 텍스트
```typescript
decision_packet?: string;
```

**TO-BE**: 구조화된 객체
```typescript
interface DecisionPacket {
  id: string;
  proposalId: string;
  version: number;

  // 핵심 내용
  summary: string;
  options: DecisionOption[];
  recommendation: string;

  // 분석
  riskAssessment: RiskItem[];
  budgetImpact?: BudgetImpact;
  kpiTargets?: KPITarget[];

  // 메타데이터
  agentContributions: AgentContribution[];
  evidenceLinks: string[];

  // 승인 상태
  directorApprovals: DirectorApproval[];
  status: 'draft' | 'ready' | 'under_review' | 'approved' | 'rejected';

  createdAt: string;
  updatedAt: string;
}

interface DecisionOption {
  id: string;
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  estimatedCost?: number;
  estimatedTimeline?: string;
}

interface DirectorApproval {
  directorId: string;
  status: 'pending' | 'approved' | 'rejected' | 'revision_requested';
  comment?: string;
  timestamp?: string;
  signature?: string;
}
```

### 4.4 ❌ 삭제/Deprecate

| 항목 | 이유 | 대안 |
|------|------|------|
| 직접 Token Voting (일상 운영) | Director 승인으로 대체 | `director_review` 워크플로우 |
| `voting` status (일반 proposal) | 혼동 방지 | `dao_voting` (DAO 전용) |
| 개별 Agent 결정 | WG 기반으로 전환 | `wg_decisions` |

**주의**: 삭제 항목은 점진적 deprecation 후 제거. 기존 데이터 마이그레이션 필요.

---

## 5. Phase별 구현 계획

### Phase 1: Director Council 도입 (P0)

**목표**: Director 3명 기반 승인 체계 구축

**구현 항목**:
1. `directors` 테이블 생성
2. `director_approvals` 테이블 생성
3. Director CRUD API
4. Director 승인/반려 API
5. Proposal 워크플로우에 `director_review` 단계 추가
6. Director Dashboard 페이지
7. Approval Queue 컴포넌트

**예상 산출물**:
- Director 3명 등록 및 역할 할당 가능
- Decision Packet에 Director 승인 프로세스 적용
- 주 2회 Director Review 미팅 지원

### Phase 2: Working Group 시스템 (P0)

**목표**: 5개 WG 구조 구축

**구현 항목**:
1. `working_groups` 테이블 생성
2. `wg_assignments` 테이블 생성
3. `wg_decisions` 테이블 생성
4. WG CRUD API
5. WG-Agent 매핑 API
6. Issue → WG 자동 라우팅 로직
7. Working Groups 페이지
8. WG Detail 페이지

**예상 산출물**:
- 5개 WG 정의 및 Agent 할당
- Issue 생성 시 적합한 WG 자동 추천
- WG별 결정 내역 추적

### Phase 3: Registry 시스템 (P0)

**목표**: 모든 결정/정책/프로그램 추적 가능

**구현 항목**:
1. `decision_registry` 테이블 생성
2. `policy_registry` 테이블 생성
3. `program_registry` 테이블 생성
4. Registry CRUD API
5. Decision 승인 시 자동 Registry 등록
6. Registry 검색/필터 API
7. Decision Registry 페이지
8. Policy Registry 페이지
9. RegistryBrowser 컴포넌트

**예상 산출물**:
- 모든 공식 결정문 검색 가능
- 정책/룰 버전 관리
- 프로그램 상태 추적

### Phase 4: Session Role 시스템 (P1)

**목표**: Agora 세션 내 Agent 역할 동적 할당

**구현 항목**:
1. `session_roles` 테이블 생성
2. SessionRole 타입 정의
3. 역할 할당 API
4. 이슈 유형 → 역할 매핑 로직
5. Agora 세션에 Role Panel 추가
6. 역할별 발언 스타일 적용

**예상 산출물**:
- 세션 시작 시 필요한 역할 자동 소환
- 역할별 책임 명확화
- Moderator가 토론 구조화

### Phase 5: 문서 템플릿 시스템 (P1)

**목표**: Issue Card, Decision Packet, Outcome Report 표준화

**구현 항목**:
1. `issue_cards` 테이블 확장
2. `outcome_reports` 테이블 생성
3. IssueCard 생성 자동화 (L1)
4. DecisionPacket 구조화 (L2)
5. OutcomeReport 생성 자동화 (L4)
6. 템플릿 뷰어/편집기 컴포넌트

**예상 산출물**:
- 일관된 문서 형식
- 근거 링크 자동 포함
- 결정 추적 가능

### Phase 6: DAO 투표 분리 (P2)

**목표**: Director 승인 vs DAO 투표 경계 명확화

**구현 항목**:
1. `dao_required` 상태 추가
2. DAO 투표 트리거 조건 정의
3. Director → DAO 에스컬레이션 워크플로우
4. DAO Voting 전용 UI
5. 엔벨롭/헌장급 안건 구분

**예상 산출물**:
- 일상 운영: Director 승인으로 완결
- 중대사안: DAO 투표로 에스컬레이션
- 투표 피로도 감소

---

## 6. 데이터베이스 스키마 변경

### 6.1 신규 테이블

```sql
-- Director Council
CREATE TABLE directors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'governance_ops' | 'ecosystem_growth' | 'product_dev'
  wallet_address TEXT,
  email TEXT,
  avatar_url TEXT,
  status TEXT DEFAULT 'active', -- 'active' | 'inactive'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE director_approvals (
  id TEXT PRIMARY KEY,
  decision_packet_id TEXT NOT NULL,
  director_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending' | 'approved' | 'rejected' | 'revision_requested'
  comment TEXT,
  signature TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (director_id) REFERENCES directors(id),
  UNIQUE(decision_packet_id, director_id)
);

-- Working Groups
CREATE TABLE working_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  mission TEXT,
  sponsor_director_id TEXT,
  lead_agent_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sponsor_director_id) REFERENCES directors(id),
  FOREIGN KEY (lead_agent_id) REFERENCES agents(id)
);

CREATE TABLE wg_assignments (
  id TEXT PRIMARY KEY,
  wg_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT, -- 'lead' | 'member' | 'advisor'
  assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wg_id) REFERENCES working_groups(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  UNIQUE(wg_id, agent_id)
);

CREATE TABLE wg_decisions (
  id TEXT PRIMARY KEY,
  wg_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  decision_type TEXT, -- 'operational' | 'policy' | 'program'
  status TEXT DEFAULT 'draft',
  proposal_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wg_id) REFERENCES working_groups(id),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);

-- Registries
CREATE TABLE decision_registry (
  id TEXT PRIMARY KEY,
  decision_number TEXT UNIQUE NOT NULL, -- 'DEC-2026-001'
  title TEXT NOT NULL,
  summary TEXT,
  full_content TEXT,
  category TEXT, -- 'operational' | 'policy' | 'program' | 'budget'
  wg_id TEXT,
  proposal_id TEXT,
  approved_by TEXT, -- JSON array of director IDs
  effective_date TEXT,
  status TEXT DEFAULT 'active', -- 'active' | 'superseded' | 'revoked'
  superseded_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wg_id) REFERENCES working_groups(id),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);

CREATE TABLE policy_registry (
  id TEXT PRIMARY KEY,
  policy_number TEXT UNIQUE NOT NULL, -- 'POL-2026-001'
  title TEXT NOT NULL,
  content TEXT,
  version INTEGER DEFAULT 1,
  category TEXT,
  wg_id TEXT,
  decision_id TEXT,
  effective_date TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wg_id) REFERENCES working_groups(id),
  FOREIGN KEY (decision_id) REFERENCES decision_registry(id)
);

CREATE TABLE program_registry (
  id TEXT PRIMARY KEY,
  program_number TEXT UNIQUE NOT NULL, -- 'PRG-2026-001'
  name TEXT NOT NULL,
  description TEXT,
  wg_id TEXT,
  budget_envelope REAL,
  kpi_targets TEXT, -- JSON
  status TEXT DEFAULT 'active', -- 'planning' | 'active' | 'paused' | 'completed'
  start_date TEXT,
  end_date TEXT,
  decision_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wg_id) REFERENCES working_groups(id),
  FOREIGN KEY (decision_id) REFERENCES decision_registry(id)
);

-- Session Roles
CREATE TABLE session_roles (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'moderator' | 'scribe' | 'risk_gate' | etc.
  assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES agora_sessions(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  UNIQUE(session_id, role)
);

-- Issue Cards (Extended)
CREATE TABLE issue_cards (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  evidence_links TEXT, -- JSON array
  recommended_wg_id TEXT,
  priority TEXT,
  suggested_actions TEXT, -- JSON array
  related_decisions TEXT, -- JSON array of decision_registry IDs
  created_by TEXT, -- Agent ID
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (issue_id) REFERENCES issues(id),
  FOREIGN KEY (recommended_wg_id) REFERENCES working_groups(id),
  FOREIGN KEY (created_by) REFERENCES agents(id)
);

-- Outcome Reports (Extended)
CREATE TABLE outcome_reports (
  id TEXT PRIMARY KEY,
  outcome_id TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  kpi_results TEXT, -- JSON
  deliverables_verified TEXT, -- JSON
  lessons_learned TEXT,
  retro_candidate BOOLEAN DEFAULT FALSE,
  verified_by TEXT, -- Agent ID
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outcome_id) REFERENCES outcomes(id),
  FOREIGN KEY (verified_by) REFERENCES agents(id)
);
```

### 6.2 기존 테이블 수정

```sql
-- proposals 테이블 확장
ALTER TABLE proposals ADD COLUMN wg_id TEXT REFERENCES working_groups(id);
ALTER TABLE proposals ADD COLUMN director_review_status TEXT DEFAULT 'pending';
ALTER TABLE proposals ADD COLUMN dao_required BOOLEAN DEFAULT FALSE;
ALTER TABLE proposals ADD COLUMN decision_registry_id TEXT REFERENCES decision_registry(id);

-- agents 테이블 확장
ALTER TABLE agents ADD COLUMN system_level_role TEXT; -- 'l0_operative' | 'l1_analyst' | 'l2_deliberator' | 'l4_verifier'
ALTER TABLE agents ADD COLUMN primary_wg_id TEXT REFERENCES working_groups(id);

-- issues 테이블 확장
ALTER TABLE issues ADD COLUMN recommended_wg_id TEXT REFERENCES working_groups(id);
ALTER TABLE issues ADD COLUMN detected_by TEXT REFERENCES agents(id);

-- decision_packets 테이블 구조화 (기존 텍스트 필드 대신)
CREATE TABLE decision_packets (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  summary TEXT NOT NULL,
  options TEXT, -- JSON array of DecisionOption
  recommendation TEXT,
  risk_assessment TEXT, -- JSON array
  budget_impact TEXT, -- JSON
  kpi_targets TEXT, -- JSON array
  agent_contributions TEXT, -- JSON array
  evidence_links TEXT, -- JSON array
  status TEXT DEFAULT 'draft', -- 'draft' | 'ready' | 'under_review' | 'approved' | 'rejected'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);
```

### 6.3 인덱스 추가

```sql
CREATE INDEX idx_director_approvals_status ON director_approvals(status);
CREATE INDEX idx_wg_assignments_wg ON wg_assignments(wg_id);
CREATE INDEX idx_wg_decisions_wg ON wg_decisions(wg_id);
CREATE INDEX idx_decision_registry_category ON decision_registry(category);
CREATE INDEX idx_decision_registry_status ON decision_registry(status);
CREATE INDEX idx_policy_registry_category ON policy_registry(category);
CREATE INDEX idx_program_registry_status ON program_registry(status);
CREATE INDEX idx_session_roles_session ON session_roles(session_id);
CREATE INDEX idx_issue_cards_wg ON issue_cards(recommended_wg_id);
CREATE INDEX idx_proposals_wg ON proposals(wg_id);
CREATE INDEX idx_proposals_director_status ON proposals(director_review_status);
```

---

## 7. API 변경 사항

### 7.1 신규 라우터

```typescript
// apps/api/src/routes/directors.ts
router.get('/', getDirectors);
router.get('/:id', getDirector);
router.post('/', createDirector);
router.put('/:id', updateDirector);
router.post('/:id/approve', approveDecision);
router.post('/:id/reject', rejectDecision);
router.post('/:id/request-revision', requestRevision);
router.get('/:id/pending-reviews', getPendingReviews);
router.get('/:id/approval-history', getApprovalHistory);

// apps/api/src/routes/working-groups.ts
router.get('/', getWorkingGroups);
router.get('/:id', getWorkingGroup);
router.post('/', createWorkingGroup);
router.put('/:id', updateWorkingGroup);
router.get('/:id/agents', getWGAgents);
router.post('/:id/agents', assignAgentToWG);
router.delete('/:id/agents/:agentId', removeAgentFromWG);
router.get('/:id/decisions', getWGDecisions);
router.post('/:id/decisions', createWGDecision);

// apps/api/src/routes/registry.ts
router.get('/decisions', getDecisionRegistry);
router.get('/decisions/:id', getDecision);
router.post('/decisions', createDecision);
router.get('/policies', getPolicyRegistry);
router.get('/policies/:id', getPolicy);
router.post('/policies', createPolicy);
router.get('/programs', getProgramRegistry);
router.get('/programs/:id', getProgram);
router.post('/programs', createProgram);
router.get('/search', searchRegistry);

// apps/api/src/routes/session-roles.ts
router.get('/sessions/:sessionId/roles', getSessionRoles);
router.post('/sessions/:sessionId/roles', assignRole);
router.delete('/sessions/:sessionId/roles/:roleId', removeRole);
router.post('/sessions/:sessionId/auto-assign', autoAssignRoles);
```

### 7.2 기존 라우터 수정

```typescript
// apps/api/src/routes/proposals.ts - 수정
router.post('/:id/submit-to-wg', submitToWG); // 신규
router.post('/:id/submit-to-directors', submitToDirectors); // 신규
router.post('/:id/escalate-to-dao', escalateToDAO); // 신규
router.get('/:id/director-status', getDirectorStatus); // 신규

// apps/api/src/routes/issues.ts - 수정
router.get('/:id/card', getIssueCard); // 신규
router.put('/:id/card', updateIssueCard); // 신규
router.post('/:id/generate-card', generateIssueCard); // 신규

// apps/api/src/routes/agora.ts - 수정
router.get('/sessions/:id/roles', getSessionRoles); // 신규
router.post('/sessions/:id/assign-roles', assignRoles); // 신규
```

### 7.3 신규 서비스

```typescript
// apps/api/src/services/directors/
- DirectorService
- DirectorApprovalService

// apps/api/src/services/working-groups/
- WorkingGroupService
- WGAssignmentService
- WGDecisionService

// apps/api/src/services/registry/
- DecisionRegistryService
- PolicyRegistryService
- ProgramRegistryService

// apps/api/src/services/session-roles/
- SessionRoleService
- RoleAssignmentService
```

---

## 8. 프론트엔드 변경 사항

### 8.1 신규 페이지

```
apps/web/src/app/[locale]/
├── directors/
│   ├── page.tsx              # Director 목록 및 상태
│   └── [id]/
│       ├── page.tsx          # Director 상세
│       └── review/
│           └── page.tsx      # 승인 대기 목록
├── working-groups/
│   ├── page.tsx              # WG 목록
│   └── [id]/
│       └── page.tsx          # WG 상세
├── registry/
│   ├── page.tsx              # Registry 홈
│   ├── decisions/
│   │   └── page.tsx          # Decision Registry
│   ├── policies/
│   │   └── page.tsx          # Policy Registry
│   └── programs/
│       └── page.tsx          # Program Registry
```

### 8.2 신규 컴포넌트

```
apps/web/src/components/
├── directors/
│   ├── DirectorCard.tsx
│   ├── DirectorList.tsx
│   ├── ApprovalQueue.tsx
│   ├── ApprovalModal.tsx
│   └── DirectorStatus.tsx
├── working-groups/
│   ├── WGCard.tsx
│   ├── WGList.tsx
│   ├── WGAgentList.tsx
│   ├── WGDecisionList.tsx
│   └── WGDetailModal.tsx
├── registry/
│   ├── RegistryBrowser.tsx
│   ├── DecisionCard.tsx
│   ├── PolicyCard.tsx
│   ├── ProgramCard.tsx
│   └── RegistrySearch.tsx
├── agora/
│   ├── SessionRolePanel.tsx      # 신규
│   ├── RoleAssignmentModal.tsx   # 신규
│   └── RoleBadge.tsx             # 신규
├── issues/
│   └── IssueCardView.tsx         # 신규
├── proposals/
│   ├── DirectorReviewStatus.tsx  # 신규
│   ├── DAOEscalationBadge.tsx    # 신규
│   └── DecisionPacketEditor.tsx  # 신규 (확장)
```

### 8.3 사이드바 메뉴 업데이트

```typescript
// 기존
const menuItems = [
  { label: 'Dashboard', path: '/' },
  { label: 'Agents', path: '/agents' },
  { label: 'Agora', path: '/agora' },
  { label: 'Signals', path: '/signals' },
  { label: 'Issues', path: '/issues' },
  { label: 'Proposals', path: '/proposals' },
  { label: 'Engine', path: '/engine' },
  { label: 'Guide', path: '/guide' },
  { label: 'LIVE', path: '/live' },
];

// 신규
const menuItems = [
  { label: 'Dashboard', path: '/' },
  { label: 'LIVE', path: '/live' },
  // Governance Section
  { label: 'Directors', path: '/directors', icon: 'shield' },
  { label: 'Working Groups', path: '/working-groups', icon: 'users' },
  { label: 'Registry', path: '/registry', icon: 'archive' },
  // Operations Section
  { label: 'Agents', path: '/agents' },
  { label: 'Agora', path: '/agora' },
  { label: 'Signals', path: '/signals' },
  { label: 'Issues', path: '/issues' },
  { label: 'Proposals', path: '/proposals' },
  // System Section
  { label: 'Engine', path: '/engine' },
  { label: 'Guide', path: '/guide' },
];
```

---

## 9. 마이그레이션 전략

### 9.1 데이터 마이그레이션

**Step 1**: 신규 테이블 생성 (Breaking Change 없음)

**Step 2**: Director 3명 초기 데이터 삽입
```sql
INSERT INTO directors (id, name, role, status) VALUES
  ('director-a', 'Director A', 'governance_ops', 'active'),
  ('director-b', 'Director B', 'ecosystem_growth', 'active'),
  ('director-c', 'Director C', 'product_dev', 'active');
```

**Step 3**: Working Group 5개 초기 데이터 삽입
```sql
INSERT INTO working_groups (id, name, display_name, mission, sponsor_director_id) VALUES
  ('wg-metagov', 'metagov', 'MetaGov & Registry', 'Process, templates, registry, budget envelope operations', 'director-a'),
  ('wg-ecosystem', 'ecosystem', 'Ecosystem Growth', 'Grants, campaigns, chapters, partnership operations', 'director-b'),
  ('wg-devsupport', 'devsupport', 'DevSupport & Open Source', 'Open source, hackathon, builder support', 'director-c'),
  ('wg-ip', 'ip', 'IP / Worldbuilding', 'Worldview, content support, policies', 'director-b'),
  ('wg-safety', 'safety', 'Safety & Integrity', 'Fraud/abuse prevention, agent safety policies', 'director-a');
```

**Step 4**: Agent → WG 매핑 (기존 Cluster 기반)
```sql
-- Moderators, Guardians, Operatives → MetaGov
-- Investors, Advisors, Operatives → Ecosystem Growth
-- Builders, Operatives, Moderators → DevSupport
-- Visionaries, Advisors, Guardians → IP
-- Guardians, Operatives, Advisors → Safety
```

**Step 5**: 기존 Proposal 데이터 마이그레이션
- `status = 'pending_review'` → `director_review_status = 'pending'`
- 기존 `voting` 상태 유지 (호환성)

### 9.2 API 호환성

**Phase 1 (Additive)**:
- 신규 API 엔드포인트 추가
- 기존 API 변경 없음
- 프론트엔드 점진적 업데이트

**Phase 2 (Transitional)**:
- 신규 워크플로우 parallel 운영
- Deprecation 경고 추가
- 기존 워크플로우 지원 유지

**Phase 3 (Final)**:
- Deprecated API 제거
- 데이터 정리
- 문서 업데이트

### 9.3 Feature Flag

```typescript
// apps/api/src/config/features.ts
export const FEATURES = {
  DIRECTOR_COUNCIL: process.env.FEATURE_DIRECTOR_COUNCIL === 'true',
  WORKING_GROUPS: process.env.FEATURE_WORKING_GROUPS === 'true',
  REGISTRY_SYSTEM: process.env.FEATURE_REGISTRY_SYSTEM === 'true',
  SESSION_ROLES: process.env.FEATURE_SESSION_ROLES === 'true',
  DAO_ESCALATION: process.env.FEATURE_DAO_ESCALATION === 'true',
};
```

---

## 10. 위험 요소 및 대응

### 10.1 기술적 위험

| 위험 | 영향 | 대응 |
|------|------|------|
| DB 스키마 변경 충돌 | 높음 | Migration 스크립트 철저 테스트, 롤백 계획 |
| 기존 Proposal 호환성 | 중간 | 듀얼 워크플로우 운영, 점진적 전환 |
| 복잡도 증가 | 중간 | 모듈화, 문서화, 테스트 커버리지 확보 |
| 성능 저하 | 낮음 | 인덱스 최적화, 캐싱 전략 |

### 10.2 운영적 위험

| 위험 | 영향 | 대응 |
|------|------|------|
| Director 가용성 | 높음 | 위임 규칙 정의, 긴급 승인 프로세스 |
| WG 역할 혼란 | 중간 | 명확한 책임 문서화, 온보딩 가이드 |
| 커뮤니티 반발 | 중간 | 투명한 커뮤니케이션, 단계적 전환 |

### 10.3 대응 계획

1. **롤백 계획**: 각 Phase별 롤백 스크립트 준비
2. **모니터링**: 신규 기능 사용량, 오류율 추적
3. **피드백 루프**: Director/WG 피드백 수집 채널 마련
4. **문서화**: 변경 사항 실시간 문서화

---

## 부록: 초기 KPI

| 지표 | 목표 | 측정 주기 |
|------|------|----------|
| Decision 리드타임 | Issue → 공식문서 < 72h | 주간 |
| Decision Packet 근거 포함률 | > 90% | 주간 |
| Director 승인 응답시간 | < 24h | 일간 |
| WG 결정 생산량 | > 5건/WG/주 | 주간 |
| Outcome Report 제출률 | > 80% | 월간 |

---

**문서 작성**: Claude (Opus 4.5)
**검토 필요**: Mossland Director Council
**다음 단계**: Phase 1 구현 착수

---

*이 문서는 Algora 거버넌스 업그레이드의 마스터 계획입니다. 각 Phase 시작 전 상세 구현 계획을 별도로 작성합니다.*
