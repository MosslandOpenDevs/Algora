# 개발 현황 - Algora

이 파일은 세션 간 개발 연속성을 위해 현재 개발 진행 상황을 추적합니다.

**최종 업데이트**: 2026-01-09
**현재 버전**: 0.2.0

---

## 현재 단계: 에이전트 시스템 (v0.3.0)

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
- [x] ActivityService (10초 간격 하트비트)
- [x] SchedulerService (3-tier LLM)

#### 프론트엔드 - apps/web (100%)
- [x] Next.js 14 (App Router)
- [x] next-intl (영어/한국어 i18n)
- [x] TanStack Query (데이터 fetching)
- [x] Tailwind CSS (커스텀 Algora 테마)
- [x] 대시보드 페이지 (통계 그리드)
- [x] 헤더 (시스템 상태, 언어 토글)
- [x] 사이드바 네비게이션
- [x] ActivityFeed 컴포넌트
- [x] AgentLobbyPreview 컴포넌트
- [x] StatsCard 컴포넌트
- [x] **에이전트 페이지** - 그리드 뷰, 클러스터 필터, 상세 모달, 소환/퇴장
- [x] **아고라 페이지** - 실시간 채팅, 세션 관리, 참가자 목록
- [x] **신호 페이지** - 소스 필터링, 우선순위 표시, 통계
- [x] **이슈 페이지** - 상태 워크플로우, 우선순위 필터, 검색
- [x] **제안 페이지** - 투표 진행률, 정족수 추적, 필터
- [x] **엔진룸 페이지** - 예산, tier 사용량, 스케줄러, 시스템 상태

#### 에이전트 시스템 (100%)
- [x] 3-tier 지원 LLM 서비스 (llm.ts)
  - [x] Tier 1: Ollama (로컬 LLM)
  - [x] Tier 2: Anthropic, OpenAI, Gemini
  - [x] tier 간 자동 폴백
- [x] ChatterService - 에이전트 유휴 메시지 생성 (chatter.ts)
- [x] SummoningService - 동적 에이전트 소환 (summoning.ts)
- [x] AgoraService - LLM 응답 세션 관리 (agora.ts)
- [x] 모든 서비스 실시간 WebSocket 이벤트
- [x] chatter API 엔드포인트 (/api/chatter)
- [x] 자동 토론 기능 아고라 API 확장

#### 공유 패키지
- [x] packages/core - TypeScript 타입
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

### 3단계: 신호 수집
1. RSS 피드 수집기
2. GitHub 웹훅 통합
3. 온체인 데이터 수집기
4. 신호 처리 파이프라인

### 4단계: 이슈 탐지
1. 거버넌스 이슈 패턴 인식
2. 알림 임계값 및 알림
3. 이슈 라이프사이클 관리

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
