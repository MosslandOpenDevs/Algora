# 개발 현황 - Algora

이 파일은 세션 간 개발 연속성을 위해 현재 개발 진행 상황을 추적합니다.

**최종 업데이트**: 2026-01-15
**현재 버전**: 0.12.5
**프로덕션 URL**: https://algora.moss.land

---

## 현재 단계: Algora v2.0 업그레이드 - Agentic Governance OS

### v2.0 업그레이드 계획
전체 업그레이드 계획은 [docs/algora-v2-upgrade-plan.ko.md](docs/algora-v2-upgrade-plan.ko.md)를 참조하세요.

### Phase 1: Safe Autonomy 기반 (완료)
- [x] `@algora/safe-autonomy` 패키지 생성
- [x] Risk Classifier - 작업 리스크 분류 (LOW/MID/HIGH)
- [x] Lock Manager - 위험 작업 LOCK/UNLOCK 메커니즘
- [x] Approval Router - Director 3 우선 인간 검토 라우팅
- [x] Passive Consensus - 자동 승인 타임아웃 Opt-out 승인 모델
- [x] Retry Handler - 지수 백오프 재시도
- [x] Safe Autonomy 계층 전체 TypeScript 타입
- [x] 개발용 In-memory 스토리지 구현

### Phase 2: Orchestrator + 상태 머신 (완료)
- [x] `@algora/orchestrator` 패키지 생성
- [x] Primary Orchestrator 클래스 - 거버넌스 워크플로 중앙 조정자
- [x] 워크플로 상태 머신 - 12개 상태 (INTAKE → OUTCOME_PROOF)
- [x] TODO Manager - 지수 백오프 포함 지속적 작업 관리
- [x] Specialist Manager - 품질 게이트 포함 서브에이전트 조정
- [x] 워크플로, 이슈, 스페셜리스트 전체 TypeScript 타입
- [x] 워크플로 모니터링용 이벤트 시스템
- [x] 개발용 In-memory 스토리지 구현

### Phase 3: Document Registry (완료)
- [x] `@algora/document-registry` 패키지 생성
- [x] Document Manager - 15개 공식 문서 유형 CRUD 작업
- [x] Version Manager - 시맨틱 버전 관리, 차이점 추적, 브랜치
- [x] Provenance Manager - 출처 추적, 에이전트 기여, 무결성 증명
- [x] Audit Manager - 불변 감사 추적, 규정 준수 보고
- [x] 문서, 버전, 출처, 감사 전체 TypeScript 타입
- [x] 문서 상태 머신 (draft → pending_review → in_review → approved → published)
- [x] 개발용 In-memory 스토리지 구현

### Phase 4: Model Router (완료)
- [x] `@algora/model-router` 패키지 생성
- [x] Model Registry - 헬스 체크 포함 모델 관리
- [x] Task Difficulty Classifier - 5단계 난이도 분류 (trivial → critical)
- [x] Model Router - 폴백 포함 지능형 작업-모델 라우팅
- [x] Quality Gate - 커스텀 검증기 포함 출력 검증
- [x] Embedding Service - 캐싱 포함 RAG용 텍스트 임베딩
- [x] Reranker Service - 검색 품질 향상을 위한 문서 재순위
- [x] Tier 1 (로컬) 및 Tier 2 (외부) 기본 모델 라인업
- [x] 일일 한도 및 경고 포함 예산 관리

### Phase 5: Dual-House Governance (완료)
- [x] `@algora/dual-house` 패키지 생성
- [x] House Manager - MossCoin House 및 OpenSource House 정의
- [x] Member Management - 토큰 홀더 및 기여자 멤버십
- [x] Voting Power - 토큰 가중치(MOC) 및 기여 가중치(OSS)
- [x] Dual-House Voting - 정족수 및 임계값 검사 포함 병렬 투표
- [x] Vote Delegation - 범위 옵션 포함 대리 투표 (all/category/proposal)
- [x] Reconciliation Manager - 하우스 불일치 시 충돌 해결
- [x] Director 3 Decision - 무효화, 재투표, 거부, 조건부 승인
- [x] High-Risk Approval - 이중 승인 필요한 위험 작업 LOCK/UNLOCK
- [x] 거버넌스, 투표, 조정 전체 TypeScript 타입
- [x] 거버넌스 모니터링용 이벤트 시스템
- [x] 개발용 In-memory 스토리지 구현

### Phase 6: Governance OS 통합 (완료)
- [x] `@algora/governance-os` 패키지 생성
- [x] 통합 계층 - 모든 v2.0 패키지를 통합하는 GovernanceOS 클래스
- [x] 파이프라인 시스템 - 9단계 거버넌스 파이프라인 (signal_intake → outcome_verification)
- [x] 서브시스템 통합
  - [x] Safe Autonomy 통합 (LOCK/UNLOCK, 위험 분류)
  - [x] Orchestrator 통합 (워크플로 관리)
  - [x] Document Registry 통합 (공식 문서 생산)
  - [x] Model Router 통합 (LLM 작업 라우팅)
  - [x] Dual-House 통합 (투표 및 승인)
- [x] 이벤트 시스템 - 모든 서브시스템에 걸친 통합 이벤트 전파
- [x] 통계 추적 - 파이프라인 메트릭, LLM 비용, 투표 세션
- [x] 헬스 체크 API - 컴포넌트 상태 모니터링
- [x] 설정 시스템 - GovernanceOSConfig 및 WorkflowConfigs
- [x] 팩토리 함수 - createGovernanceOS, createDefaultGovernanceOS

### Phase 7: 워크플로 구현 및 API 통합 (완료)

#### Step 1: API 통합 (완료)
- [x] apps/api 통합을 위한 GovernanceOSBridge 서비스
- [x] Governance OS REST API 엔드포인트:
  - [x] 파이프라인 엔드포인트: `/governance-os/pipeline/run`, `/governance-os/pipeline/issue/:id`
  - [x] 문서 엔드포인트: `/governance-os/documents`, `/governance-os/documents/:id`, `/governance-os/documents/type/:type`
  - [x] 투표 엔드포인트: `/governance-os/voting`, `/governance-os/voting/:id`, `/governance-os/voting/:id/vote`
  - [x] 승인 엔드포인트: `/governance-os/approvals`, `/governance-os/approvals/:id/approve`
  - [x] 리스크/잠금 엔드포인트: `/governance-os/risk/classify`, `/governance-os/locks/:id`
  - [x] 모델 라우터 엔드포인트: `/governance-os/model-router/execute`
  - [x] 통계/헬스 엔드포인트: `/governance-os/stats`, `/governance-os/health`, `/governance-os/config`

#### Step 2: 워크플로 핸들러 (완료)
- [x] **Workflow A: 학술 활동** (`workflow-a.ts`)
  - [x] 타입: AcademicSource, ResearchTopic, AcademicPaper, ResearchBrief
  - [x] 타입: TechnologyAssessment, ResearchDigest, WorkflowAConfig
  - [x] WorkflowAHandler 클래스 - executeResearchPhase(), executeDeliberationPhase()
  - [x] generateResearchDigest() - 주간 다이제스트 문서 생성
  - [x] generateTechnologyAssessment() - 공식 평가 문서 생성
  - [x] shouldGenerateAssessment() - 임계값 감지
  - [x] Orchestrator 통합 (executeWorkflowA 메서드)
  - [x] 테스트: 12개 테스트 케이스, 모두 통과

- [x] **Workflow B: 자유 토론** (`workflow-b.ts`)
  - [x] 타입: DebateSource, DebateCategory, DebatePhase, DebateTopic
  - [x] 타입: DebateArgument, DebateThread, ConsensusAssessment, DebateSummary
  - [x] WorkflowBHandler 클래스 - initializeDebate(), executeDebatePhase()
  - [x] executeFullDeliberation() - 완전한 5단계 토론 실행
  - [x] assessConsensus() - 합의 계산
  - [x] generateDebateSummary() - 공식 요약 문서 생성
  - [x] 반론 단계에서 Red Team 도전 생성
  - [x] Orchestrator 통합 (executeWorkflowB 메서드)
  - [x] 테스트: 13개 테스트 케이스, 모두 통과

- [x] **Workflow C: 개발자 지원** (`workflow-c.ts`)
  - [x] 타입: GrantStatus, GrantCategory, MilestoneStatus, RewardStatus
  - [x] 타입: GrantApplication, GrantMilestone, DeveloperGrant, MilestoneReport
  - [x] 타입: RetroactiveReward, GrantProposal, ApplicationEvaluation, MilestoneReview
  - [x] WorkflowCHandler 클래스 - processGrantApplication(), evaluateApplication()
  - [x] processMilestoneReport() - 마일스톤 추적
  - [x] processRetroactiveReward() - 소급 보상 지명 처리
  - [x] Dual-House 승인 통합 (MossCoin + OpenSource)
  - [x] 고액 그랜트(>$5,000)에 대한 Director 3 승인
  - [x] 자금 지급을 위한 LOCK 메커니즘
  - [x] Orchestrator 통합 (executeWorkflowC, processMilestoneReport, processRetroactiveReward)
  - [x] 테스트: 19개 테스트 케이스, 모두 통과

- [x] **Workflow D: 생태계 확장** (`workflow-d.ts`)
  - [x] 타입: ExpansionOrigin, OpportunityCategory, OpportunityStatus, PartnershipStatus
  - [x] 타입: ExpansionOpportunity, OpportunityAssessment, PartnershipProposal
  - [x] 타입: PartnershipAgreement, EcosystemReport, DetectedSignal
  - [x] 타입: AlwaysOnConfig, AntiAbuseConfig - 인테이크 관리용
  - [x] WorkflowDHandler 클래스 - processCallBasedOpportunity(), processAlwaysOnSignal()
  - [x] assessOpportunity() - SWOT 분석
  - [x] createPartnershipProposal() - 승인 요건 포함
  - [x] createPartnershipAgreement() - LOCK 메커니즘
  - [x] generateEcosystemReport() - 정기 보고서 생성
  - [x] 스팸 방지 가드레일 (속도 제한, 중복 제거, 품질 필터)
  - [x] 파트너십(>$1,000)에 대한 Dual-House 승인
  - [x] 고액 거래(>$10,000) 또는 고위험 카테고리에 대한 Director 3 승인
  - [x] 테스트: 21개 테스트 케이스, 모두 통과

- [x] **Workflow E: 워킹 그룹** (`workflow-e.ts`)
  - [x] 타입: WorkingGroupStatus, CharterDuration, WGDocumentType, WGProposalOrigin
  - [x] 타입: WorkingGroupProposal, WorkingGroupCharter, WGPublishingRules
  - [x] 타입: WorkingGroup, WGStatusReport, WGDissolutionRequest, IssuePattern
  - [x] WorkflowEHandler 클래스 - processWGProposal(), evaluateProposal()
  - [x] createCharter() - 승인된 제안서에서 헌장 생성
  - [x] activateWorkingGroup() - 헌장에서 WG 활성화
  - [x] canPublishDocument() 및 recordPublication() - 게시 권한
  - [x] generateStatusReport() - WG 상태 보고서
  - [x] processDissolulutionRequest() - WG 해산 처리
  - [x] detectPatterns() - 자동 제안 이슈 패턴 감지
  - [x] generateAutoProposal() - 오케스트레이터 주도 WG 제안서 생성
  - [x] 모든 WG 결성에 대한 Dual-House 승인
  - [x] 고예산 WG(>$5,000)에 대한 Director 3 승인
  - [x] 테스트: 31개 테스트 케이스, 모두 통과

**전체 Orchestrator 테스트: 96개 통과**

### Phase 8: 프론트엔드 UI 통합 및 v2.0 완료 (완료)
- [x] `apps/web/src/lib/api.ts`에 Governance OS API 타입
  - [x] PipelineStage, PipelineStatus 타입
  - [x] DocumentType, DocumentState, GovernanceDocument 타입
  - [x] DualHouseVote, HouseType - 투표용
  - [x] LockedAction, RiskLevel - Safe Autonomy용
  - [x] WorkflowStatus, GovernanceOSStats, GovernanceOSHealth
  - [x] API 함수: fetchGovernanceOSStats, fetchDocuments, fetchDualHouseVotes 등
- [x] Governance OS 컴포넌트 (`apps/web/src/components/governance/`)
  - [x] PipelineVisualization - 9단계 파이프라인 표시 및 진행률
  - [x] WorkflowCard - 워크플로 타입 카드(A-E) 및 통계
  - [x] DocumentCard - 공식 문서 카드 및 상태 배지
  - [x] DualHouseVoteCard - Dual-House 투표 진행률 및 상태
  - [x] LockedActionCard - Safe Autonomy 작업 카드 및 승인 추적
- [x] Governance OS 페이지 (`apps/web/src/app/[locale]/governance/page.tsx`)
  - [x] 통계 카드가 있는 대시보드 개요
  - [x] 탭 네비게이션 (개요, 워크플로, 문서, 투표, 승인)
  - [x] 파이프라인 시각화
  - [x] TanStack Query 데이터 페칭 통합
- [x] 네비게이션 업데이트
  - [x] 사이드바에 "Governance OS" 메뉴 항목 추가 및 NEW 배지
- [x] i18n 번역 (EN/KO)
  - [x] 모든 UI 문자열이 포함된 Governance 섹션
  - [x] 파이프라인 단계 이름
  - [x] 문서 상태
  - [x] 투표 상태
  - [x] Safe Autonomy 상태
- [x] 백엔드 API 엔드포인트 연결
  - [x] GovernanceOSBridge 새 메서드 (listAllDocuments, listAllVotings, listAllApprovals, getWorkflowStatuses)
  - [x] 새 REST 엔드포인트: GET /documents, GET /voting, GET /approvals, GET /workflows
  - [x] 실제 엔드포인트에 연결된 프론트엔드 API 함수 (목업 데이터 제거)
  - [x] WittyLoader/WittyMessage에 'governance' 카테고리 확장
- [x] **에이전트 클러스터 확장 (30→38 에이전트)**
  - [x] 새 클러스터 타입 추가: 'orchestrators', 'archivists', 'red-team', 'scouts'
  - [x] 8명의 새 에이전트: Nova Prime, Atlas (오케스트레이터), Archive Alpha, Trace Master (아키비스트),
        Contrarian Carl, Breach Tester, Base Questioner (레드팀), Horizon Seeker (스카우트)
  - [x] 새 그룹에 대한 i18n 번역 업데이트 (EN/KO)
- [x] **Governance 이벤트를 위한 실시간 Socket.IO**
  - [x] `apps/api/src/services/socket.ts`에 새 브로드캐스트 함수:
        - broadcastDocumentCreated, broadcastDocumentStateChanged
        - broadcastVotingCreated, broadcastVoteCast, broadcastVotingStatusChanged
        - broadcastActionLocked, broadcastActionUnlocked, broadcastDirector3Approval
        - broadcastPipelineProgress, broadcastWorkflowStateChanged, broadcastHealthUpdate
  - [x] `apps/web/src/hooks/useSocket.ts`에 새 프론트엔드 훅:
        - GovernanceEvent 타입 - 11개 이벤트 타입
        - useGovernanceEvents 훅 - 여러 이벤트 구독
- [x] **운영 KPI 계측**
  - [x] 새 KPI 모듈: `packages/governance-os/src/kpi.ts`
        - DecisionQualityMetrics (DP 완성도, 옵션 다양성, 레드팀 커버리지)
        - ExecutionSpeedMetrics (신호-이슈, 이슈-DP, 엔드투엔드 타이밍)
        - SystemHealthMetrics (업타임, LLM 가용성, 큐 깊이, 에러율)
  - [x] KPICollector 클래스 - recordSample, recordHeartbeat, recordOperation, recordExecutionTiming
  - [x] `apps/api/src/routes/governance-os.ts`에 7개 새 API 엔드포인트:
        - GET /kpi/dashboard, /kpi/decision-quality, /kpi/execution-speed
        - GET /kpi/system-health, /kpi/alerts, /kpi/targets, /kpi/export
- [x] **보안 스팸 방지 (Anti-Abuse 가드)**
  - [x] 새 모듈: `packages/safe-autonomy/src/anti-abuse.ts`
        - AntiAbuseGuard 클래스 - 속도 제한, 중복 제거, 품질 필터링
        - 블랙리스트 관리, 거부 후 쿨다운
        - 다중 소스 검증 요구
        - 중복 제거를 위한 토픽 해시 생성
- [x] **E2E 파이프라인 테스트**
  - [x] 새 테스트 파일: `packages/governance-os/src/__tests__/e2e-pipeline.test.ts`
        - 전체 파이프라인 실행 테스트 (LOW/MID/HIGH 리스크)
        - Document Registry 통합 테스트
        - Dual-House Voting 통합 테스트
        - Model Router 통합 테스트
        - KPI Collector 통합 테스트
        - 헬스 모니터링 테스트
        - 파이프라인 단계 검증 (9단계)
        - 워크플로 타입 커버리지 (A, B, C, D, E)
- [x] **Ollama 모델 통합**
  - [x] 새 프로바이더: `packages/model-router/src/providers/ollama.ts`
        - OllamaProvider 클래스 - 로컬 LLM 추론
        - Chat 및 generate API 지원
        - RAG용 임베딩 지원
        - 헬스 체크 및 모델 목록
        - 모델 풀 기능
        - OLLAMA_INSTALL_COMMANDS 및 OLLAMA_HARDWARE_REQUIREMENTS 상수
  - [x] ModelRouter용 OllamaLLMProvider 어댑터
  - [x] 팩토리 함수: createOllamaModelRoutingSystem, createOllamaModelRoutingSystemWithDefaults

### Phase 9: 프로덕션 배포 (완료)
- [x] **pm2 프로세스 관리**
  - [x] api 및 web 앱 관리를 위한 `ecosystem.config.cjs`
  - [x] 로컬 머신 배포 (211.196.73.206)
  - [x] api는 포트 3201, web은 포트 3200
  - [x] 메모리 제한이 있는 자동 재시작 설정
- [x] **nginx 리버스 프록시**
  - [x] nginx가 설치된 Lightsail 서버 (13.209.131.190)
  - [x] Let's Encrypt SSL/TLS
  - [x] Socket.IO를 위한 WebSocket 프록시
  - [x] 정적 자산 캐싱 헤더
- [x] **Next.js i18n 미들웨어 수정**
  - [x] `_next` 경로를 제외하도록 미들웨어 매처 수정
  - [x] 정적 자산 500 오류 및 리다이렉트 루프 해결
- [ ] 전체 통합 테스트
- [ ] 성능 최적화
- [ ] 보안 감사
- [ ] 메인넷 배포 준비

### Phase 9.5: 시스템 개선 (완료)
- [x] **자동 보고서 생성 시스템**
  - [x] `ReportGeneratorService` (`apps/api/src/services/report-generator/`)
  - [x] `DataCollector` - 모든 테이블에서 메트릭 집계 (signals, issues, proposals, agents, sessions)
  - [x] `WeeklyReportGenerator` - LLM 요약이 포함된 주간 거버넌스 보고서
  - [x] `MonthlyReportGenerator` - 전략적 인사이트가 포함된 월간 종합 보고서
  - [x] 스케줄러 통합 (주간: 월요일 00:00 UTC, 월간: 1일 00:00 UTC)
  - [x] 수동 생성 API: `POST /api/disclosure/generate/weekly`, `POST /api/disclosure/generate/monthly`
  - [x] disclosure_reports 테이블에 마크다운 콘텐츠 저장
  - [x] `react-markdown` + `remark-gfm`을 사용한 프론트엔드 마크다운 렌더링
  - [x] 테이블, 코드 블록, 헤더를 위한 커스텀 스타일 컴포넌트
- [x] **실시간 헬스 엔드포인트 개선**
  - [x] `/health`가 이제 실제 데이터 반환: budget, scheduler, agents
  - [x] Budget: 일일 한도, 사용량, 잔여 (budget_config + budget_usage에서)
  - [x] Scheduler: isRunning, nextTier2, queueLength, tier2Hours
  - [x] Agents: 전체 수, 활성 수
  - [x] 서버 시작 시간부터 업타임 추적
- [x] **환경 변수를 통한 예산 설정**
  - [x] `ANTHROPIC_DAILY_BUDGET_USD`, `ANTHROPIC_HOURLY_LIMIT`
  - [x] `OPENAI_DAILY_BUDGET_USD`, `OPENAI_HOURLY_LIMIT`
  - [x] `GOOGLE_DAILY_BUDGET_USD`, `GOOGLE_HOURLY_LIMIT`
  - [x] `OLLAMA_HOURLY_LIMIT`
  - [x] 첫 실행 시 .env에서 budget_config 자동 시드
- [x] **Admin API 키 보호**
  - [x] `ADMIN_API_KEY` 환경 변수
  - [x] 예산 수정을 위한 `requireAdmin` 미들웨어
  - [x] `PATCH /api/budget/config/:provider`는 X-Admin-Key 헤더 필요
- [x] **Engine Room 페이지 실제 데이터**
  - [x] 목업 대신 실제 health API 데이터 사용
  - [x] tier 통계를 위한 `/api/stats/tier-usage` 엔드포인트
  - [x] nullable 필드를 위한 SchedulerCard 업데이트
- [x] **Modal Portal 패턴**
  - [x] 모든 모달이 적절한 z-index를 위해 React Portal (`createPortal`) 사용
  - [x] 최상위 렌더링을 보장하는 z-[99999]
  - [x] 모든 페이지에서 모달 겹침 문제 해결
- [x] **번역 수정**
  - [x] "All systems operational"을 위한 `Engine.status.ok` 키 추가

---

## 이전 단계: 토큰 통합 (v0.8.0) - 완료

### 완료된 기능

#### 인프라 (100%)
- [x] 모노레포 설정 (pnpm workspaces + Turborepo)
- [x] TypeScript 설정
- [x] ESLint + Prettier 설정
- [x] 환경 변수 템플릿 (.env.example)
- [x] Git 저장소 초기화

#### 백엔드 - apps/api (100%)
- [x] Express.js 서버 (포트 3201)
- [x] Socket.IO WebSocket 통합
- [x] SQLite 데이터베이스 (WAL 모드)
- [x] 전체 엔티티 데이터베이스 스키마
- [x] 30개 AI 에이전트 페르소나 시드
- [x] REST API 엔드포인트:
  - [x] GET /health - 헬스 체크
  - [x] GET /api/stats - 대시보드 통계
  - [x] GET /api/agents - 에이전트 목록
  - [x] GET /api/activity - 활동 피드
  - [x] GET /api/agora/sessions - 아고라 세션
  - [x] GET /api/signals - 신호
  - [x] GET /api/issues - 이슈
  - [x] GET /api/proposals - 제안
  - [x] GET /api/budget - 예산 정보
- [x] ActivityService (60초 간격 하트비트)
- [x] SchedulerService (3-tier LLM)

#### 프론트엔드 - apps/web (100%)
- [x] Next.js 14 (App Router)
- [x] next-intl (영어/한국어 i18n)
- [x] TanStack Query (데이터 fetching)
- [x] Tailwind CSS (커스텀 Algora 테마)
- [x] 대시보드 페이지 (통계 그리드)
- [x] 헤더 (시스템 상태, 언어 토글)
- [x] 사이드바 네비게이션
- [x] ActivityFeed 컴포넌트 (심각도 배지, 에이전트 정보, 애니메이션 강화)
- [x] AgentLobbyPreview 컴포넌트
- [x] StatsCard 컴포넌트 (클릭 가능, variant 스타일, 호버 애니메이션)
- [x] StatsDetailModal 컴포넌트 (세부 내역, 활동 목록)
- [x] **에이전트 페이지** - 그리드 뷰, 클러스터 필터, 상세 모달, 소환/퇴장
- [x] **아고라 페이지** - 실시간 채팅, 세션 관리, 참가자 목록
  - [x] 데이터베이스에서 실시간 메시지 페칭
  - [x] 참가자 목록에 색상 코딩된 에이전트 그룹 표시
  - [x] 랜덤 간격(30초-2분)으로 토론 자동 시작
- [x] **UI 애니메이션** - 모달 fade-in/scale-in, 카드 호버 효과, 새 항목 slide-in
- [x] **상세 모달** - 모든 모달 일관된 애니메이션 적용 (7개 파일)
- [x] **공개 페이지** - 투명성 보고서 및 거버넌스 공개
- [x] **신호 페이지** - 소스 필터링, 우선순위 표시, 통계
- [x] **이슈 페이지** - 상태 워크플로우, 우선순위 필터, 검색
- [x] **제안 페이지** - 투표 진행률, 정족수 추적, 필터
- [x] **엔진룸 페이지** - 예산, tier 사용량, 스케줄러, 시스템 상태
- [x] **가이드 페이지** - 시스템 흐름 시각화
- [x] **라이브 쇼케이스 페이지** (`/live`) - 실시간 거버넌스 대시보드
  - [x] LiveHeader, SignalStream, SystemBlueprint, LiveMetrics
  - [x] ActivityLog, AgentChatter, AgoraPreview 컴포넌트
  - [x] TerminalBox, GlowText 공유 컴포넌트
  - [x] Socket.io 실시간 업데이트
  - [x] 헤더에 LIVE 배지, 사이드바에 LIVE 메뉴
- [x] **UX 가이드 시스템**
  - [x] WelcomeTour 컴포넌트 (다단계 가이드 투어)
  - [x] SystemFlowDiagram 컴포넌트 (시각적 파이프라인)
  - [x] HelpTooltip 컴포넌트 (고정 위치, z-index 9999)
  - [x] HelpMenu 컴포넌트 (헤더 빠른 액세스 메뉴)
  - [x] 투어 완료를 위한 localStorage 지속성

#### 에이전트 시스템 (100%)
- [x] 3-tier 지원 LLM 서비스 (llm.ts)
  - [x] Tier 1: Ollama (로컬 LLM)
  - [x] Tier 2: Anthropic, OpenAI, Gemini
  - [x] tier 간 자동 폴백
  - [x] 전역 LLM 요청 큐 (rate limiting)
  - [x] 동시 호출 간 최소 10초 지연
- [x] ChatterService - 에이전트 유휴 메시지 생성 (chatter.ts)
- [x] SummoningService - 동적 에이전트 소환 (summoning.ts)
- [x] AgoraService - LLM 응답 세션 관리 (agora.ts)
  - [x] autoSummon 세션 생성 시 자동 토론 시작
  - [x] 자연스러운 대화를 위한 랜덤 간격 (30초-2분)
  - [x] 참가자 추가 시 summoned_agents 자동 업데이트
  - [x] LLM 큐 상태 모니터링 (/api/agora/llm-queue)
- [x] 모든 서비스 실시간 WebSocket 이벤트
- [x] chatter API 엔드포인트 (/api/chatter)
- [x] 자동 토론 기능 아고라 API 확장

#### 신호 수집 (100%)
- [x] RSS 수집기 서비스 (rss.ts)
  - [x] 설정 가능한 RSS 피드 관리
  - [x] 자동 심각도 감지
  - [x] 5개 카테고리 17개 피드: AI, Crypto, Finance, Security, Dev
- [x] GitHub 수집기 서비스 (github.ts)
  - [x] 저장소 이벤트 모니터링
  - [x] 이슈 및 PR 추적
  - [x] 41개 저장소: ethereum, Uniswap, Aave, OpenZeppelin, AI 프로젝트
  - [x] mossland 전체 27개 public 저장소 모니터링
- [x] 블록체인 수집기 서비스 (blockchain.ts)
  - [x] 가격 모니터링 (CoinGecko 멀티코인)
  - [x] DeFi TVL 추적 (DeFiLlama 프로토콜, 체인, 스테이블코인)
  - [x] Fear & Greed Index
  - [x] 옵션: CoinMarketCap, Etherscan, OpenSea (API 키 필요)
- [x] 신호 프로세서 (index.ts)
  - [x] 통합 수집기 관리
  - [x] 통계 및 리포팅
- [x] 수집기 API 엔드포인트 (/api/collectors/*)

#### 이슈 탐지 (100%)
- [x] IssueDetectionService (issue-detection.ts)
  - [x] 패턴 기반 탐지 (10개 사전 정의 패턴)
  - [x] Security, Market, Governance, DeFi, Mossland, AI 카테고리
  - [x] 중복 방지 쿨다운 메커니즘
- [x] 알림 임계값
  - [x] 빈도 기반 알림
  - [x] 중요 신호 급증 탐지
  - [x] 카테고리별 임계값
- [x] 이슈 라이프사이클 관리
  - [x] 상태 워크플로우: detected → confirmed → in_progress → resolved
  - [x] 신호-이슈 상관관계
  - [x] 증거 추적
- [x] LLM 강화 분석
  - [x] 고우선순위 항목 AI 분석
  - [x] 권장 조치 생성
- [x] 아고라 세션 자동 생성
  - [x] Critical/High 우선순위 이슈에 대해 아고라 세션 자동 생성
  - [x] 카테고리 기반 에이전트 자동 소환
  - [x] 쿨다운 메커니즘 (critical: 30분, high: 60분)
  - [x] AGORA_SESSION_AUTO_CREATED 활동 타입
- [x] API 엔드포인트 (/api/issues/detection/*)

#### 휴먼 거버넌스 (100%)
- [x] GovernanceService (services/governance/index.ts)
  - [x] 제안, 투표, 의사결정 패킷 통합 서비스
  - [x] 일반 워크플로우 편의 메서드
- [x] ProposalService (proposal.ts)
  - [x] 제안 전체 라이프사이클 관리
  - [x] 상태 워크플로우: draft → pending_review → discussion → voting → passed/rejected → executed
  - [x] 이슈에서 제안 생성 기능
  - [x] 댓글 및 승인 시스템
  - [x] 에이전트 승인 추적
- [x] VotingService (voting.ts)
  - [x] 유효성 검증을 통한 투표
  - [x] 투표권 계산
  - [x] 정족수 확인 집계 계산
  - [x] 위임 시스템 (대리 투표)
  - [x] 투표 기간 종료 시 자동 종료
  - [x] 투표자 등록 관리
- [x] DecisionPacketService (decision-packet.ts)
  - [x] AI 생성 의사결정 요약
  - [x] 장단점 분석 옵션
  - [x] 에이전트 분석 집계
  - [x] 위험 평가 생성
  - [x] 재생성을 위한 버전 관리
- [x] 포괄적인 API 엔드포인트 (/api/proposals/*)
  - [x] 제안 CRUD 작업
  - [x] 워크플로우 전환 (submit, start-discussion, start-voting, cancel)
  - [x] 투표 엔드포인트 (vote, finalize, get votes)
  - [x] 댓글 및 승인 엔드포인트
  - [x] 의사결정 패킷 엔드포인트 (get, generate, versions)
  - [x] 위임 엔드포인트 (create, revoke, get)

#### 결과 증명 (100%)
- [x] ProofOfOutcomeService (services/proof-of-outcome/index.ts)
  - [x] 결과, 신뢰 점수, 분석 통합 서비스
  - [x] 제안 완료 처리 편의 메서드
- [x] OutcomeService (outcome.ts)
  - [x] 통과/거부된 제안에서 결과 생성
  - [x] 실행 계획 및 단계 관리
  - [x] 실행 라이프사이클: pending → executing → completed/failed → verified
  - [x] 신뢰도 점수가 포함된 검증 시스템
  - [x] 이의 제기된 결과에 대한 분쟁 처리
- [x] TrustScoringService (trust-scoring.ts)
  - [x] 에이전트 신뢰 점수 추적 (0-100 척도)
  - [x] 예측 기록 및 해결
  - [x] 승인 정확도 추적
  - [x] 참여율 모니터링
  - [x] 신뢰 점수 히스토리 및 업데이트
  - [x] 비활성 에이전트 점수 자동 감소
- [x] AnalyticsService (analytics.ts)
  - [x] 거버넌스 지표 (통과율, 참여율, 투표)
  - [x] 제안, 투표, 결과 시계열 데이터
  - [x] 에이전트 성과 순위
  - [x] 신호-결과 상관관계 분석
  - [x] 카테고리 분석
  - [x] 내보내기 가능한 거버넌스 리포트
- [x] 포괄적인 API 엔드포인트 (/api/outcomes/*)
  - [x] 결과 CRUD 및 실행 관리
  - [x] 검증 및 분쟁 엔드포인트
  - [x] 신뢰 점수 엔드포인트
  - [x] 분석 대시보드 및 지표 엔드포인트

#### 토큰 통합 (100%)
- [x] TokenIntegrationService (services/token/index.ts)
  - [x] 토큰, 투표, 트레저리 통합 서비스
  - [x] 일반 워크플로우 편의 메서드
- [x] TokenService (token.ts)
  - [x] MOC 토큰 홀더 검증
  - [x] 논스를 이용한 지갑 서명 검증
  - [x] 토큰 잔액 확인 (실제 + 목 모드)
  - [x] 투표권 계산
  - [x] 투표용 스냅샷 생성
  - [x] 홀더 등록 및 관리
- [x] TokenVotingService (token-voting.ts)
  - [x] 토큰 가중 투표 시스템
  - [x] 스냅샷과 함께 제안 투표 초기화
  - [x] 투표권으로 투표
  - [x] 정족수 및 통과 임계값 확인
  - [x] 투표 집계 계산
  - [x] 투표 종료
- [x] TreasuryService (treasury.ts)
  - [x] 멀티 토큰 트레저리 잔액 추적
  - [x] 제안으로부터 예산 할당
  - [x] 할당 라이프사이클: pending → approved → disbursed
  - [x] 거래 기록 및 확인
  - [x] 카테고리별 지출 한도
  - [x] 온체인 거래 지원 (목 + 실제)
- [x] 포괄적인 API 엔드포인트 (/api/token/*)
  - [x] 토큰 정보 및 통계 엔드포인트
  - [x] 지갑 검증 (요청, 확인)
  - [x] 홀더 관리 엔드포인트
  - [x] 스냅샷 엔드포인트
  - [x] 토큰 투표 엔드포인트
  - [x] 트레저리 잔액 및 할당 엔드포인트
  - [x] 거래 관리 엔드포인트
  - [x] 지출 한도 엔드포인트
  - [x] 대시보드 엔드포인트

#### 공유 패키지
- [x] packages/core - TypeScript 타입 (38 에이전트 클러스터, 11 클러스터 타입)
- [x] packages/safe-autonomy - LOCK/UNLOCK, 리스크 분류, 승인 라우팅, Anti-Abuse 가드 (v2.0)
- [x] packages/orchestrator - 워크플로 오케스트레이션, 상태 머신, TODO 관리 (v2.0)
- [x] packages/document-registry - 공식 문서 저장소, 버전 관리, 출처 추적 (v2.0)
- [x] packages/model-router - LLM 난이도 기반 라우팅, 품질 게이트, RAG, Ollama 프로바이더 (v2.0)
- [x] packages/dual-house - Dual-House 거버넌스, 투표, 조정 (v2.0)
- [x] packages/governance-os - 통합 통합 계층, KPI 컬렉터, E2E 테스트 (v2.0)
- [ ] packages/reality-oracle - 신호 수집
- [ ] packages/inference-mining - 이슈 탐지
- [ ] packages/agentic-consensus - 에이전트 시스템
- [ ] packages/human-governance - 투표
- [ ] packages/proof-of-outcome - 결과 추적

#### 문서화 (100%)
- [x] README.md / README.ko.md
- [x] ARCHITECTURE.md / ARCHITECTURE.ko.md
- [x] CONTRIBUTING.md / CONTRIBUTING.ko.md
- [x] ALGORA_PROJECT_SPEC.md / ALGORA_PROJECT_SPEC.ko.md
- [x] USER_GUIDE.md / USER_GUIDE.ko.md
- [x] CLAUDE.md
- [x] CHANGELOG.md
- [x] DEVELOPMENT_STATUS.md (이 파일)

---

### Phase 10: 토큰 UI 및 거버넌스 기능 (진행 중)

#### Step 1: 지갑 연결 UI (완료)
- [x] MetaMask/WalletConnect/Coinbase 지원 WalletConnect v2 모달
- [x] 잔액과 주소를 표시하는 ConnectedWallet 헤더 컴포넌트
- [x] 지갑 검증 플로우가 있는 프로필 페이지
- [x] 실시간 업데이트가 되는 MOC 토큰 잔액 표시
- [x] 토큰 잔액에서 투표권 계산
- [x] 지갑 UI i18n 번역 (EN/KO)

#### Step 2: 트레저리 대시보드 개선 (완료)
- [x] 트레저리 시각화 컴포넌트 (`apps/web/src/components/treasury/`)
  - [x] AllocationCard - 상태 배지가 있는 예산 할당 항목
  - [x] TransactionCard - 타입 표시기가 있는 거래 내역
  - [x] HolderCard - 검증 상태가 있는 토큰 홀더 카드
  - [x] BalanceDistributionChart - CSS conic-gradient 도넛 차트
  - [x] AllocationStatusBreakdown - 스택 진행 막대
  - [x] SpendingLimitsCard - 카테고리별 지출 한도
  - [x] AllocationDetailModal - 상태 타임라인이 있는 상세 모달
  - [x] TransactionDetailModal - 익스플로러 링크가 있는 거래 상세
- [x] `api.ts`에 Treasury API 함수
- [x] 트레저리 컴포넌트 i18n 번역 (EN/KO)

#### Step 3: 투표권 위임 UI (완료)
- [x] 위임 컴포넌트 (`apps/web/src/components/delegation/`)
  - [x] DelegationCard - 주소/투표권/만료일이 있는 위임 항목 표시
  - [x] DelegationStats - 4개 통계 카드 (보유/받은/위임한/실효 투표권)
  - [x] DelegationModal - 다단계 모달 (소개 → 입력 → 확인 → 성공)
  - [x] DelegationList - 탭으로 구분된 목록 (보낸/받은 위임)
- [x] Delegation API 함수 (fetchDelegations, createDelegation, revokeDelegation)
- [x] 위임 섹션이 있는 프로필 페이지 통합
- [x] 카테고리별 위임 (트레저리/기술/거버넌스/커뮤니티)
- [x] 만료 옵션 (30/90/180일 또는 무기한)
- [x] 위임 UI i18n 번역 (EN/KO)

#### Step 4: 토큰 가중 투표 UI (대기)
- [ ] 연결된 지갑으로 제안 투표
- [ ] 투표권 표시와 함께 투표 확인
- [ ] 위임된 투표 자동 적용
- [ ] 프로필 페이지에 투표 이력

---

## 다음 단계 (우선순위 순)

### Phase 10 나머지
1. 제안의 토큰 가중 투표 UI
2. 토큰 이벤트를 위한 실시간 WebSocket 통합

### Phase 11: 프로덕션 강화
1. 메인넷 컨트랙트 통합
2. 보안 감사
3. 성능 최적화
4. 모니터링 및 알림 (pm2 monit, 로그 로테이션)

### Phase 12: 고급 기능
1. packages/reality-oracle - 신호 수집 리팩토링
2. packages/inference-mining - 이슈 탐지 리팩토링
3. packages/agentic-consensus - 에이전트 시스템 리팩토링
4. packages/human-governance - 투표 리팩토링
5. packages/proof-of-outcome - 결과 추적 리팩토링

---

## 프로젝트 실행

### 개발 모드
```bash
# 의존성 설치
pnpm install

# 프론트엔드와 백엔드 동시 실행
pnpm dev

# 또는 개별 실행:
cd apps/api && pnpm dev   # 백엔드 :3201
cd apps/web && pnpm dev   # 프론트엔드 :3200
```

### 프로덕션 모드 (pm2)
```bash
# 모든 패키지 빌드
pnpm build

# pm2로 시작
pm2 start ecosystem.config.cjs

# 관리 명령어
pm2 status              # 상태 확인
pm2 logs algora-api     # API 로그
pm2 logs algora-web     # 웹 로그
pm2 restart all         # 전체 재시작
pm2 stop all            # 전체 중지

# 재부팅 시 자동 시작
pm2 save
pm2 startup
```

### 프로덕션 URL
- **프로덕션**: https://algora.moss.land
- **로컬 개발**: http://localhost:3200 (web), http://localhost:3201 (api)

---

## Git 커밋 히스토리 (최근)

```
568ec18 feat: Add voting delegation UI with stats, list, and modal components
0461d1c feat: Enhance Treasury Dashboard with visualization and components
9475650 feat: Implement wallet connection UI with MOC token display and verification
3086f08 docs: Update USER_GUIDE.md and USER_GUIDE.ko.md with v2.0 features
2568ccd feat: Add production deployment with pm2 and nginx reverse proxy
bafeae9 test: Add comprehensive tests for v2.0 packages and fix exports
```

---

## 알려진 이슈

1. Next.js 14.1.0이 구버전임 (경미한 경고)
2. 서버 재시작 시 에이전트 상태가 유지되지 않음 (초기화 필요)
3. 스키마 변경 후 데이터베이스 재초기화 필요 (algora.db 삭제 후 db:init 실행)
4. 프로덕션 API 연결 시 localhost CORS 이슈 (예상된 동작)

---

## 환경 설정 참고

- Node.js v20.19.6
- pnpm (모노레포용)
- SQLite 데이터베이스: `apps/api/data/algora.db`
- 첫 실행 시 데이터베이스 자동 초기화
- Tier 1 LLM을 위해 Ollama 필요 (http://localhost:11434)

---

## AI 어시스턴트를 위한 안내

개발 계속 시:
1. 이 파일을 먼저 읽어 현재 상태 파악
2. CLAUDE.md에서 프로젝트 컨텍스트와 가이드라인 확인
3. `git log --oneline -10`으로 최근 변경사항 확인
4. `pnpm dev`로 개발 서버 시작 (또는 프로덕션에서는 `pm2 start ecosystem.config.cjs`)
5. 중요한 변경 후 이 파일과 CHANGELOG.md 업데이트
6. 문서 변경 시 한국어 번역 (*.ko.md) 업데이트

### 알아야 할 주요 파일
- `ecosystem.config.cjs` - pm2 설정
- `apps/web/src/middleware.ts` - Next.js i18n 미들웨어 (`_next` 경로 제외)
- `apps/web/.env.local` - 프론트엔드 환경 (NEXT_PUBLIC_API_URL)
- `apps/api/.env` - 백엔드 환경

### 현재 아키텍처
```
인터넷 → algora.moss.land (DNS)
       → Lightsail 13.209.131.190 (nginx + SSL)
       → 로컬 211.196.73.206 (pm2: api:3201, web:3200)
```
