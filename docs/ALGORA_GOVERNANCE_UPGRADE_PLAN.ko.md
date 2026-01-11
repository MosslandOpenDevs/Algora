# Algora 거버넌스 업그레이드 계획 v1.0

**작성일**: 2026-01-11
**버전**: 1.0.0
**상태**: 설계 완료

---

## 목차

1. [요약](#1-요약)
2. [현재 구현 상태 (AS-IS)](#2-현재-구현-상태-as-is)
3. [목표 구조 (TO-BE)](#3-목표-구조-to-be)
4. [Gap 분석: 변경/추가/삭제 사항](#4-gap-분석-변경추가삭제-사항)
5. [Phase별 구현 계획](#5-phase별-구현-계획)
6. [데이터베이스 스키마 변경](#6-데이터베이스-스키마-변경)
7. [API 변경 사항](#7-api-변경-사항)
8. [프론트엔드 변경 사항](#8-프론트엔드-변경-사항)
9. [마이그레이션 전략](#9-마이그레이션-전략)
10. [위험 요소 및 대응](#10-위험-요소-및-대응)

---

## 1. 요약

### 한 줄 정의

**Algora = 모스랜드 생태계의 '결정 품질'(근거/옵션/리스크)과 '실행 속도'를 올리는 24/7 거버넌스 OS**

AI는 상시 숙의/초안/검증을 수행하고, **휴먼(Director 3명)은 최종 승인/공표(공식 문서)와 책임/리스크 게이트**를 맡습니다.

### 핵심 변경 요약표

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
│  L0: Reality Oracle (신호 수집)                         │
│  - RSS (17개 피드), GitHub (68개 레포), Blockchain      │
│  - SignalCollector 자동 수집                            │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  L1: Inference Mining (이슈 탐지)                       │
│  - IssueDetectionService (10개 패턴)                   │
│  - 자동 Issue 생성 + Agora 세션 생성                    │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  L2: Agentic Consensus (AI 숙의)                        │
│  - 30 Agents (7 Clusters)                              │
│  - Agora Session + LLM 기반 토론                        │
│  - Decision Packet 자동 생성                            │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  L3: Human Governance (휴먼 거버넌스) - 현재            │
│  - Token 기반 커뮤니티 투표                              │
│  - Quorum + Approval Threshold                          │
│  - ❌ Director Council 없음                             │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  L4: Proof of Outcome (결과 검증)                       │
│  - 실행 추적                                            │
│  - 신뢰도 점수                                          │
│  - 분석                                                 │
└─────────────────────────────────────────────────────────┘
```

### 2.2 현재 Agent 구조

**7개 클러스터 (총 30 Agent)**

| 클러스터 | 인원 | 현재 역할 | 주요 Agent |
|---------|------|----------|-----------|
| Visionaries | 5 | 미래 비전 | Singularity Seeker, Metaverse Native |
| Builders | 5 | 기술 구현 | Rust Evangelist, Rapid Prototyper |
| Investors | 4 | 시장 분석 | Diamond Hand, Macro Analyst |
| Guardians | 4 | 리스크 관리 | Compliance Officer, White Hat |
| Operatives | 5 | 데이터 수집 (Tier 0) | News Crawler, GitHub Watchdog |
| Moderators | 3 | 토론 진행 | Bridge Moderator, Evidence Curator |
| Advisors | 4 | 도메인 전문 | Risk Sentinel, Community Voice |

### 2.3 현재 Proposal 워크플로우

```
draft → pending_review → discussion → voting → passed/rejected → executed
```

**특징**:
- 모든 Proposal이 Token 기반 투표로 결정
- Director 승인 단계 없음
- Working Group 개념 없음

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
│  A: Governance/Registry & Ops (프로세스/문서/예산)       │
│  B: Ecosystem/Growth & IP (성장/파트너십/세계관)         │
│  C: Product/DevSupport (개발자 지원/오픈소스/기술)       │
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
│  Agent Swarm (30+ 동적)                                 │
│  - Session별 역할 동적 할당                              │
│  - WG 맥락에 맞는 Agent 소환                            │
└─────────────────────────────────────────────────────────┘
```

### 3.2 5개 Working Group 상세

| Working Group | 목적(미션) | 주요 산출물 | 휴먼 스폰서 | 주력 Agent 클러스터 |
|--------------|----------|-----------|-----------|-------------------|
| **MetaGov & Registry** | 프로세스/템플릿/레지스트리/예산 엔벨롭 운영 | Decision Registry, 문서 템플릿, 분기 운영리포트 | Director A | Moderators, Guardians, Operatives |
| **Ecosystem Growth** | 그랜트/캠페인/챕터/파트너십 운영 설계 | Program 제안서, KPI 설계, 라운드 리포트 | Director B | Investors, Advisors, Operatives |
| **DevSupport & OSS** | 오픈소스/해커톤/빌더 지원 | 지원후보 추천, 마일스톤 표준, 레포 트래킹 리포트 | Director C | Builders, Operatives, Moderators |
| **IP / Worldbuilding** | 세계관/콘텐츠 지원 및 정책 | IP 지원 결정문, 크리에이터 정책/가이드 | Director B | Visionaries, Advisors, Guardians |
| **Safety & Integrity** | 사기/남용 방지, Agent 안전정책 | 위험 플래그 리포트, 정책/제재 절차 | Director A | Guardians, Operatives, Advisors |

### 3.3 신규 Agent 역할 체계

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

### 3.4 신규 문서 체계 (4종)

| 문서 | 생성 단계 | 내용 | 담당 |
|------|----------|------|------|
| **Issue Card** | L1 | 문제요약, 근거 링크, 권장 WG, 우선순위 | Analyst Agent |
| **Proposal/Policy Draft** | L2 | 납품물, 지표, 예산, 리스크, 대안 | Swarm Agents |
| **Decision Packet** | L2→L3 | 결정문 초안 + 커뮤니티 공지 요약 | Moderator + Scribe |
| **Outcome Report** | L4 | KPI/납품물 검증, 개선안 | Verifier Agent |

### 3.5 신규 Registry 시스템

| Registry | 내용 | 업데이트 주기 |
|----------|------|--------------|
| **Decision Registry** | 모든 공식 결정문 | 결정 시 |
| **Program Registry** | 그랜트/캠페인 정보 | 프로그램 변경 시 |
| **Agent Registry** | Agent 프로필, 신뢰도, 상태 | 실시간 |
| **Steward Registry** | Director/WG 리더 정보 | 권한 변경 시 |
| **Policy Registry** | 활성 정책/룰 | 정책 변경 시 |

---

## 4. Gap 분석: 변경/추가/삭제 사항

### 4.1 유지 (Keep)

| 항목 | 현재 상태 | 비고 |
|------|----------|------|
| L0 Signal Collection | 완료 | 유지 |
| L1 Issue Detection | 완료 | 확장 필요 |
| L2 Agora Session | 완료 | Role 할당 추가 |
| L4 Outcome/Trust Scoring | 완료 | 유지 |
| 30 Agents (7 Clusters) | 완료 | 역할 체계 추가 |
| 3-Tier LLM System | 완료 | 유지 |

### 4.2 추가 (Add)

#### 신규 테이블

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

#### 신규 API 엔드포인트

| Endpoint | Method | 용도 |
|----------|--------|------|
| `/api/directors` | GET/POST/PUT | Director 관리 |
| `/api/directors/:id/approve` | POST | Decision 승인 |
| `/api/directors/:id/reject` | POST | Decision 반려 |
| `/api/working-groups` | GET/POST | WG 관리 |
| `/api/working-groups/:id/agents` | GET/POST | WG Agent 관리 |
| `/api/registry/decisions` | GET/POST | Decision Registry |
| `/api/registry/policies` | GET/POST | Policy Registry |
| `/api/agora/sessions/:id/roles` | GET/POST | 세션 역할 할당 |

#### 신규 프론트엔드 페이지

| 페이지 | 경로 | 용도 |
|--------|------|------|
| Director Dashboard | `/directors` | Director 전용 대시보드 |
| Working Groups | `/working-groups` | WG 목록 및 상태 |
| Decision Registry | `/registry/decisions` | 공식 결정문 목록 |
| Policy Registry | `/registry/policies` | 정책/룰 목록 |

### 4.3 변경 (Modify)

#### Proposal Workflow 변경

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

#### Agent 역할 체계 변경

**AS-IS**: 7 Cluster 고정

**TO-BE**: Cluster + Session Role + System Level Role

### 4.4 삭제/Deprecate

| 항목 | 이유 | 대안 |
|------|------|------|
| 직접 Token Voting (일상 운영) | Director 승인으로 대체 | `director_review` 워크플로우 |
| 개별 Agent 결정 | WG 기반으로 전환 | `wg_decisions` |

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

### Phase 2: Working Group 시스템 (P0)

**목표**: 5개 WG 구조 구축

**구현 항목**:
1. `working_groups` 테이블 생성
2. `wg_assignments` 테이블 생성
3. WG CRUD API
4. WG-Agent 매핑 API
5. Issue → WG 자동 라우팅 로직
6. Working Groups 페이지

### Phase 3: Registry 시스템 (P0)

**목표**: 모든 결정/정책/프로그램 추적 가능

**구현 항목**:
1. `decision_registry` 테이블 생성
2. `policy_registry` 테이블 생성
3. Registry CRUD API
4. Decision Registry 페이지

### Phase 4: Session Role 시스템 (P1)

**목표**: Agora 세션 내 Agent 역할 동적 할당

**구현 항목**:
1. `session_roles` 테이블 생성
2. 역할 할당 API
3. Agora 세션에 Role Panel 추가

### Phase 5: 문서 템플릿 시스템 (P1)

**목표**: Issue Card, Decision Packet, Outcome Report 표준화

**구현 항목**:
1. `issue_cards` 테이블 확장
2. `outcome_reports` 테이블 생성
3. 템플릿 뷰어/편집기 컴포넌트

### Phase 6: DAO 투표 분리 (P2)

**목표**: Director 승인 vs DAO 투표 경계 명확화

**구현 항목**:
1. `dao_required` 상태 추가
2. DAO 투표 트리거 조건 정의
3. Director → DAO 에스컬레이션 워크플로우

---

## 6. 데이터베이스 스키마 변경

### 6.1 신규 테이블 요약

```sql
-- Director Council
directors (id, name, role, wallet_address, email, avatar_url, status, ...)
director_approvals (id, decision_packet_id, director_id, status, comment, signature, ...)

-- Working Groups
working_groups (id, name, display_name, mission, sponsor_director_id, lead_agent_id, ...)
wg_assignments (id, wg_id, agent_id, role, ...)
wg_decisions (id, wg_id, title, description, decision_type, status, proposal_id, ...)

-- Registries
decision_registry (id, decision_number, title, summary, full_content, category, wg_id, ...)
policy_registry (id, policy_number, title, content, version, category, ...)
program_registry (id, program_number, name, description, wg_id, budget_envelope, ...)

-- Session Roles
session_roles (id, session_id, agent_id, role, ...)

-- Extended
issue_cards (id, issue_id, summary, evidence_links, recommended_wg_id, ...)
outcome_reports (id, outcome_id, summary, kpi_results, deliverables_verified, ...)
decision_packets (id, proposal_id, version, summary, options, recommendation, ...)
```

### 6.2 기존 테이블 수정

```sql
-- proposals 확장
ALTER TABLE proposals ADD COLUMN wg_id TEXT;
ALTER TABLE proposals ADD COLUMN director_review_status TEXT;
ALTER TABLE proposals ADD COLUMN dao_required BOOLEAN;
ALTER TABLE proposals ADD COLUMN decision_registry_id TEXT;

-- agents 확장
ALTER TABLE agents ADD COLUMN system_level_role TEXT;
ALTER TABLE agents ADD COLUMN primary_wg_id TEXT;

-- issues 확장
ALTER TABLE issues ADD COLUMN recommended_wg_id TEXT;
ALTER TABLE issues ADD COLUMN detected_by TEXT;
```

---

## 7. API 변경 사항

### 7.1 신규 라우터

```
/api/directors - Director 관리
/api/working-groups - WG 관리
/api/registry - Registry 관리
/api/session-roles - 세션 역할 관리
```

### 7.2 기존 라우터 수정

```
/api/proposals - director_review, dao_escalation 추가
/api/issues - issue card 관리 추가
/api/agora - session roles 추가
```

---

## 8. 프론트엔드 변경 사항

### 8.1 신규 페이지

```
/directors - Director 대시보드
/directors/review - 승인 대기 목록
/working-groups - WG 목록
/working-groups/:id - WG 상세
/registry/decisions - Decision Registry
/registry/policies - Policy Registry
/registry/programs - Program Registry
```

### 8.2 신규 컴포넌트

```
DirectorCard, ApprovalQueue, ApprovalModal
WGCard, WGAgentList, WGDecisionList
RegistryBrowser, DecisionCard, PolicyCard
SessionRolePanel, RoleAssignmentModal, RoleBadge
IssueCardView, DecisionPacketEditor
```

---

## 9. 마이그레이션 전략

### 9.1 단계별 접근

**Step 1**: 신규 테이블 생성 (Breaking Change 없음)

**Step 2**: Director 3명 초기 데이터 삽입

**Step 3**: Working Group 5개 초기 데이터 삽입

**Step 4**: Agent → WG 매핑

**Step 5**: 기존 Proposal 데이터 마이그레이션

### 9.2 Feature Flag

```typescript
FEATURES = {
  DIRECTOR_COUNCIL: boolean,
  WORKING_GROUPS: boolean,
  REGISTRY_SYSTEM: boolean,
  SESSION_ROLES: boolean,
  DAO_ESCALATION: boolean,
};
```

---

## 10. 위험 요소 및 대응

### 10.1 기술적 위험

| 위험 | 영향 | 대응 |
|------|------|------|
| DB 스키마 변경 충돌 | 높음 | Migration 스크립트 철저 테스트 |
| 기존 Proposal 호환성 | 중간 | 듀얼 워크플로우 운영 |
| 복잡도 증가 | 중간 | 모듈화, 문서화 |

### 10.2 운영적 위험

| 위험 | 영향 | 대응 |
|------|------|------|
| Director 가용성 | 높음 | 위임 규칙 정의, 긴급 승인 프로세스 |
| WG 역할 혼란 | 중간 | 명확한 책임 문서화 |
| 커뮤니티 반발 | 중간 | 투명한 커뮤니케이션 |

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

*이 문서는 Algora 거버넌스 업그레이드의 마스터 계획입니다.*
