# 개발 현황 - Algora

이 파일은 세션 간 개발 연속성을 위해 현재 개발 진행 상황을 추적합니다.

**최종 업데이트**: 2026-01-12
**현재 버전**: 0.8.0

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

### Phase 6: 예정
- Phase 6: Integration & Testing

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
- [x] **UI 애니메이션** - 모달 fade-in/scale-in, 카드 호버 효과, 새 항목 slide-in
- [x] **상세 모달** - 모든 모달 일관된 애니메이션 적용 (7개 파일)
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
- [x] packages/core - TypeScript 타입
- [x] packages/safe-autonomy - LOCK/UNLOCK, 리스크 분류, 승인 라우팅 (v2.0)
- [x] packages/orchestrator - 워크플로 오케스트레이션, 상태 머신, TODO 관리 (v2.0)
- [x] packages/document-registry - 공식 문서 저장소, 버전 관리, 출처 추적 (v2.0)
- [x] packages/model-router - LLM 난이도 기반 라우팅, 품질 게이트, RAG (v2.0)
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
- [x] CLAUDE.md
- [x] CHANGELOG.md
- [x] DEVELOPMENT_STATUS.md (이 파일)

---

## 다음 단계 (우선순위 순)

### 8단계: UI 통합 및 폴리싱
1. 토큰 지갑 연결 UI (MetaMask, WalletConnect)
2. 잔액 시각화가 포함된 트레저리 대시보드
3. 제안의 토큰 가중 투표 UI
4. 홀더 프로필 및 투표 이력 페이지
5. 토큰 이벤트를 위한 실시간 WebSocket 통합

### 9단계: 프로덕션 배포
1. 메인넷 컨트랙트 통합
2. 보안 감사
3. 성능 최적화
4. 모니터링 및 알림

---

## 프로젝트 실행

```bash
# 의존성 설치
pnpm install

# 프론트엔드와 백엔드 동시 실행
pnpm dev

# 또는 개별 실행:
cd apps/api && pnpm dev   # 백엔드 :3201
cd apps/web && pnpm dev   # 프론트엔드 :3200
```

---

## Git 커밋 히스토리

```
451a1d0 feat(web): Add Engine Room page with system monitoring
b1d61a3 feat(web): Add Proposals page with voting interface
5b1a6de feat(web): Add Issues page with status workflow
0816720 feat(web): Add Signals page with source filtering
40b7bcc feat(web): Add Agora page with live deliberation interface
e388a3a feat(web): Add Agents page with grid view and detail modal
00d555d docs: Add development status tracking
e7354e9 fix(api): Add missing /api/stats and /api/activity endpoints
e413b1b fix(web): Fix API response handling
66e5dda fix(web): Add missing date-fns dependency
```

---

## 알려진 이슈

1. Next.js 14.1.0이 구버전임 (경미한 경고)
2. 서버 재시작 시 에이전트 상태가 유지되지 않음 (초기화 필요)
3. 스키마 변경 후 데이터베이스 재초기화 필요 (algora.db 삭제 후 db:init 실행)

---

## 환경 설정 참고

- Node.js v20.19.6
- pnpm (모노레포용)
- SQLite 데이터베이스: `apps/api/data/algora.db`
- 첫 실행 시 데이터베이스 자동 초기화

---

## AI 어시스턴트를 위한 안내

개발 계속 시:
1. 이 파일을 먼저 읽어 현재 상태 파악
2. CLAUDE.md에서 프로젝트 컨텍스트와 가이드라인 확인
3. `git log --oneline -10`으로 최근 변경사항 확인
4. `pnpm dev`로 개발 서버 시작
5. 중요한 변경 후 이 파일과 CHANGELOG.md 업데이트
