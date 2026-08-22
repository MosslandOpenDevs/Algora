# Algora: 24/7 라이브 에이전트 거버넌스 플랫폼

> **"무한히 확장 가능한 AI 페르소나들이 끊임없이 숙의하는, 살아있는 아고라(Agora)"**

- **도메인**: https://algora.moss.land
- **GitHub**: https://github.com/mossland/Algora

[English Documentation](./ALGORA_PROJECT_SPEC.md)

---

## 1. 프로젝트 비전

### 1.1 한 줄 요약
모스코인 홀더에게 **거버넌스 엔진의 모든 활동과 의사결정 흐름을 실시간으로 투명하게 시각화**하여 제공하는 **라이브 AI 거버넌스 플랫폼**

### 1.2 핵심 루프
```
Reality Signals → Issues → Agentic Deliberation → Human Decision → Execution → Outcome Proof
       ↓              ↓              ↓                  ↓              ↓            ↓
   RSS/GitHub    자동감지      30인 에이전트 토론    MOC 투표      실행 기록    KPI 검증
   On-chain                   (시끌벅적한 아고라)
```

### 1.3 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **Human Sovereignty** | AI는 제안/근거/요약/권고까지만. 최종 의사결정과 자금집행은 사람이 한다. |
| **Auditability First** | 모든 산출물에 provenance 메타데이터 (출처/시간/모델/작업ID/해시) 포함 |
| **비용 통제** | 외부 LLM은 예산/레이트리밋/스케줄러로 엄격히 통제. 초과 시 Local LLM 대체 |
| **플러그인 구조** | 커넥터(입력)와 에이전트는 언제든 추가 가능한 모듈형 구조 |

---

## 2. 다국어 및 문서화 요구사항

### 2.1 웹사이트 국제화 (i18n)
- **기본 언어**: 영어
- **지원 언어**: 영어 (en), 한국어 (ko)
- **언어 전환**: UI에서 영어/한국어 토글
- **프레임워크**: next-intl

### 2.2 코드 및 문서 표준
- **코드 주석**: 영어만 사용
- **문서 파일**:
  - 기본: 영어 (예: `README.md`, `ARCHITECTURE.md`)
  - 번역: 한국어 (예: `README.ko.md`, `ARCHITECTURE.ko.md`)
- **커밋 메시지**: 영어

### 2.3 필수 문서 파일
| 파일 | 설명 |
|------|------|
| `README.md` / `README.ko.md` | 프로젝트 개요 및 빠른 시작 |
| `CLAUDE.md` | AI 어시스턴트 컨텍스트 파일 |
| `ARCHITECTURE.md` / `ARCHITECTURE.ko.md` | 시스템 아키텍처 상세 |
| `CONTRIBUTING.md` / `CONTRIBUTING.ko.md` | 기여 가이드라인 |
| `CHANGELOG.md` | 버전 히스토리 |
| `ALGORA_PROJECT_SPEC.md` / `ALGORA_PROJECT_SPEC.ko.md` | 전체 프로젝트 사양서 |

### 2.4 문서 업데이트 정책
- 모든 문서는 커밋할 때마다 업데이트해야 함
- 한국어 번역은 영어 버전과 동기화되어야 함
- 버전 번호와 날짜는 모든 문서에서 일관성 유지

---

## 3. UI/UX 중요성

> **UI/UX는 이 프로젝트에서 매우 중요합니다.**

### 3.1 디자인 원칙
- **생동감 있는 느낌**: 시스템이 24/7 살아서 운영되고 있다는 느낌 전달
- **시각적 피드백**: 실시간 활동 인디케이터, 상태가 표시되는 에이전트 아바타
- **현대적 미학**: Tailwind CSS를 사용한 깔끔하고 전문적인 디자인
- **반응형 디자인**: 모바일 우선, 모든 화면 크기에서 작동
- **접근성**: WCAG 2.1 AA 준수 목표

### 3.2 핵심 UI 요소
- **StatusBar**: 항상 표시되는 시스템 상태 (예산, 대기열, 다음 실행)
- **AgentLobby**: 유휴/활성 상태가 표시되는 30명의 에이전트 아바타
- **DiscussionArena**: 실시간 토론 시각화
- **Activity Feed**: 지속적인 이벤트 스트림 (10초 이상 갭 없음)

---

## 4. 로컬 LLM 하드웨어 사양

### 4.1 대상 호스트

Tier 1은 GPU 예산이 대략 **8GB** 수준인 소박한 Ollama 호스트를 대상으로 하며, 이
호스트는 **다른 서비스와 공유될 수 있습니다**. 아래 모델 구성은 전용 워크스테이션이
아니라 그 환경에 맞춰 정해진 것입니다. 두 모델을 동시에 상주시킬 수 있는 호스트면
충분합니다.

### 4.2 로컬 LLM 모델

| 모델 | 역할 | VRAM | 비고 |
|------|------|------|------|
| **gemma3:4b** | 채팅 | ~3GB | 모든 Tier 1 작업: 잡담, 토론, 요약, 한국어, 코딩, LLM-as-judge 리랭킹 |
| **nomic-embed-text** | 임베딩 | ~0.3GB | 768차원, RAG 시맨틱 검색 |

모든 Tier 1 작업을 단일 채팅 모델로 보내는 것은 의도된 설계입니다. Ollama는 같은
모델이라도 `num_ctx`가 다르면 *별개 인스턴스*로 취급하므로, 모델이나 컨텍스트 크기를
바꾸면 상주 중인 인스턴스가 축출됩니다. 공유 호스트에서는 그 리로드 비용을 모든
입주 서비스가 함께 치릅니다. 임베딩 모델은 유일하게 허용된 예외로, 채팅 모델 옆에
함께 상주할 만큼 작습니다.

여기서 두 가지 제약이 따라 나오며, 둘 다 어기면 뒤늦게 조용히 실패합니다:

- **작업별로 채팅 모델이나 컨텍스트를 바꾸지 마세요.**
  `packages/model-router/src/registry.ts`와 `LOCAL_LLM_MODEL_*` 변수를 함께
  바꿔야 하며, 특정 호출부만 오버라이드해서는 안 됩니다.
- **호스트가 pull하지 않은 모델을 지정하지 마세요.** Ollama는 시작 시점이 아니라
  호출 시점에 `HTTP 404`를 반환합니다. `curl $LOCAL_LLM_ENDPOINT/api/tags`로
  확인하세요.

더 큰 전용 호스트로 올릴 때는 두 모델을 함께 올리고 레지스트리를 갱신하면 됩니다.

### 4.3 구성
```bash
# Ollama 엔드포인트
LOCAL_LLM_ENDPOINT=http://localhost:11434

# Tier 1 채팅 모델 — 설계상 어디서나 동일한 모델
LOCAL_LLM_MODEL_CHATTER=gemma3:4b
LOCAL_LLM_MODEL_ENHANCED=gemma3:4b

# 컨텍스트 윈도우. 두 패키지가 서로 다른 이름으로 읽으므로 함께 변경하세요.
LOCAL_LLM_NUM_CTX=16384
OLLAMA_NUM_CTX=16384

# RAG용 임베딩 모델. 위 호스트에 반드시 존재해야 합니다.
RAG_EMBEDDING_MODEL=nomic-embed-text
```

### 4.4 성능 참고사항
- Apple Silicon 통합 메모리는 VRAM 복사 없이 효율적인 모델 로딩 허용
- MLX 최적화 모델 (LM Studio 경유)이 Ollama보다 더 나은 성능 제공 가능
- 메모리에 맞추기 위해 대형 모델에는 양자화 모델 (Q4/Q5) 사용 고려
- 메모리 대역폭이 M4 Pro에서 LLM 추론의 주요 병목

---

## 5. 시스템 아키텍처

### 5.1 5계층 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                        L4: Proof of Outcome                         │
│                  (실행 결과, KPI 검증, 신뢰 점수)                      │
├─────────────────────────────────────────────────────────────────────┤
│                       L3: Human Governance                          │
│                    (MOC 투표, 위임, 제안 실행)                         │
├─────────────────────────────────────────────────────────────────────┤
│                      L2: Agentic Consensus                          │
│              (30인 대의회, 동적 소환)                                  │
├─────────────────────────────────────────────────────────────────────┤
│                       L1: Inference Mining                          │
│                (이상 감지, 임계값, 트렌드 분석)                         │
├─────────────────────────────────────────────────────────────────────┤
│                       L0: Reality Oracle                            │
│            (RSS, GitHub, On-chain, 소셜 신호 수집)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 기술 스택

| 영역 | 기술 |
|------|------|
| **Monorepo** | pnpm workspaces + Turborepo |
| **Backend** | Node.js + TypeScript + Express.js |
| **Realtime** | Socket.IO (WebSocket) |
| **Database** | SQLite (better-sqlite3) with WAL |
| **Frontend** | Next.js 14 + React 18 + TanStack Query |
| **Styling** | Tailwind CSS |
| **LLM - External** | Anthropic Claude / OpenAI GPT / Google Gemini |
| **LLM - Local** | Ollama + gemma3:4b (chat) / nomic-embed-text (embeddings) |
| **Blockchain** | viem (Ethereum) |
| **Validation** | Zod |
| **i18n** | next-intl (en/ko) |

### 5.3 프로젝트 구조

```
algora/
├── apps/
│   ├── api/                    # Express REST API + Socket.IO
│   │   └── src/
│   │       ├── index.ts        # 메인 서버
│   │       ├── db.ts           # SQLite 스키마
│   │       ├── budget/         # Budget Manager
│   │       ├── scheduler/      # 3티어 스케줄러
│   │       ├── activity/       # Activity Log 서비스
│   │       ├── agents/         # 30인 에이전트 관리
│   │       ├── agora/          # 토론 세션 관리
│   │       └── disclosure/     # 공시 파이프라인
│   │
│   └── web/                    # Next.js 프론트엔드
│       └── src/
│           ├── app/            # 페이지 (App Router)
│           │   ├── [locale]/   # i18n 라우팅
│           │   │   ├── page.tsx    # 대시보드
│           │   │   ├── agora/      # 토론장
│           │   │   ├── agents/     # 에이전트 관리
│           │   │   ├── signals/    # 신호 모니터링
│           │   │   ├── issues/     # 이슈 목록
│           │   │   ├── proposals/  # 제안/투표
│           │   │   ├── disclosure/ # 공시 아카이브
│           │   │   └── engine/     # 엔진 룸
│           ├── components/     # UI 컴포넌트
│           ├── hooks/          # React Hooks
│           └── i18n/           # 국제화
│
├── packages/
│   ├── core/                   # 공유 타입, 유틸리티
│   ├── reality-oracle/         # L0: 신호 수집 어댑터
│   ├── inference-mining/       # L1: 이슈 감지
│   ├── agentic-consensus/      # L2: 에이전트 시스템
│   ├── human-governance/       # L3: 투표/위임
│   └── proof-of-outcome/       # L4: 결과 추적
│
├── docs/                       # 추가 문서
│   ├── api/                    # API 문서
│   └── guides/                 # 사용자 가이드
│
├── CLAUDE.md                   # AI 어시스턴트 컨텍스트
├── README.md                   # 프로젝트 개요 (EN)
├── README.ko.md                # 프로젝트 개요 (KO)
├── ARCHITECTURE.md             # 아키텍처 상세 (EN)
├── ARCHITECTURE.ko.md          # 아키텍처 상세 (KO)
├── CONTRIBUTING.md             # 기여 가이드 (EN)
├── CONTRIBUTING.ko.md          # 기여 가이드 (KO)
├── CHANGELOG.md                # 버전 히스토리
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

---

## 6. 동적 페르소나 스펙트럼 (Dynamic Persona Spectrum): 확장 가능한 멀티 에이전트 시스템

> **초기 구성**: 7개 전략 클러스터에 30명의 AI 에이전트
> **아키텍처**: 거버넌스 필요에 따라 무한 확장 가능하도록 설계

### 6.1 운영 전략

- **유휴 모드**: 모든 에이전트가 Tier-1 (로컬 LLM)로 페르소나 기반 "잡담" 상태 유지
- **활성 모드**: 관련 에이전트만 Tier-2 (Claude/GPT/Gemini)로 승격하여 본격 숙의
- **확장성**: 거버넌스 필요에 따라 에이전트 클러스터를 동적으로 확장 가능
- **UI 효과**: 지속적인 에이전트 상호작용이 "살아있는 생태계" 느낌 전달

### 6.2 에이전트 그룹

#### 그룹 1: 비저너리 (미래 설계자) - 5인

| ID | 이름 | 페르소나 | 대표 발언 |
|----|------|---------|----------|
| `singularity-seeker` | Singularity Seeker | AGI/특이점 추종자 | "이 기능이 AGI 도래를 앞당길 수 있습니까?" |
| `metaverse-native` | Metaverse Native | 가상세계/게이미피케이션 | "재미없으면 아무도 안 옵니다. 도파민 요소가 부족해요." |
| `solarpunk-architect` | Solarpunk Architect | 친환경/지속가능성 | "에너지 효율적인가요? 유기적으로 성장 가능한가요?" |
| `chaos-pilot` | Chaos Pilot | 실험주의/파괴적 혁신 | "너무 안전해요. 좀 더 미친 짓을 해봅시다." |
| `dao-fundamentalist` | DAO Fundamentalist | 탈중앙화 원리주의 | "왜 운영자가 개입하죠? 스마트 컨트랙트로 자동화하세요." |

#### 그룹 2: 빌더 (엔지니어링 길드) - 5인

| ID | 이름 | 페르소나 | 대표 발언 |
|----|------|---------|----------|
| `rust-evangelist` | Rust Evangelist | 안정성/메모리 안전성 | "그 코드는 안전하지 않습니다. Rust로 재작성하시죠." |
| `rapid-prototyper` | Rapid Prototyper | 속도전/해커톤 스타일 | "언제 다 짭니까? 일단 배포하고 고칩시다." |
| `legacy-keeper` | Legacy Keeper | 보수적 유지보수 | "새 기능 때문에 기존 시스템이 멈추면 책임질 겁니까?" |
| `ux-perfectionist` | UX Perfectionist | 사용자 경험 최우선 | "백엔드는 모르겠고, 버튼 위치가 불편합니다." |
| `docs-librarian` | Docs Librarian | 문서화 집착 | "PR에 설명이 없네요. 머지할 수 없습니다." |

#### 그룹 3: 투자자 (시장 감시단) - 4인

| ID | 이름 | 페르소나 | 대표 발언 |
|----|------|---------|----------|
| `diamond-hand` | Diamond Hand | 장기 투자자 | "지금 가격은 중요하지 않습니다. 펀더멘탈에 집중하세요." |
| `degen-trader` | Degen Trader | 단타/밈 중독 | "그래서 언제 쏘나요? 요즘 유행하는 AI 메타 태웁시다." |
| `whale-watcher` | Whale Watcher | 온체인 분석가 | "방금 3번 지갑에서 대량 이동이 있었습니다. 뭔가 있어요." |
| `macro-analyst` | Macro Analyst | 거시경제 분석가 | "연준 발표 전까진 몸 사려야 합니다." |

#### 그룹 4: 가디언 (리스크 관리) - 4인

| ID | 이름 | 페르소나 | 대표 발언 |
|----|------|---------|----------|
| `compliance-officer` | Compliance Officer | 규제/법무 | "SEC가 싫어할 단어입니다. '투자' 대신 '참여'라고 쓰세요." |
| `white-hat` | White Hat | 보안 전문가 | "Reentrancy 공격에 취약해 보입니다." |
| `budget-hawk` | Budget Hawk | 예산 감시자 | "이 기능에 GPT-4를 쓰는 건 낭비입니다. 3.5로 낮추세요." |
| `fact-checker` | Fact Checker | 팩트 검증 | "그 뉴스는 루머입니다. 공식 소스가 아닙니다." |

#### 그룹 5: 오퍼러티브 (특수 요원) - 5인 (Tier 0/1 전담)

| ID | 이름 | 역할 | 실행 주기 |
|----|------|------|----------|
| `news-crawler` | News Crawler Alpha | AI 뉴스 수집 | 10분 |
| `crypto-feeder` | Crypto Feeder | 코인 뉴스 요약 | 10분 |
| `github-watchdog` | Github Watchdog | 커밋 실시간 중계 | 5분 |
| `discord-relay` | Discord Relay | 커뮤니티 여론 | 15분 |
| `summary-bot` | Summary Bot | 토론 3줄 요약 | 요청 시 |

#### 그룹 6: 핵심 모더레이터 - 3인

| ID | 이름 | 역할 |
|----|------|------|
| `bridge-moderator` | Bridge Moderator | 토론 진행 + Decision Packet 합성 |
| `evidence-curator` | Evidence Curator | 근거/출처 카드 관리 |
| `disclosure-scribe` | Disclosure Scribe | 공시/IR 문서 작성 |

#### 그룹 7: 전문 어드바이저 - 4인

| ID | 이름 | 역할 |
|----|------|------|
| `risk-sentinel` | Risk Sentinel | 보안/리스크 분석 |
| `treasury-tactician` | Treasury Tactician | 자금/토크노믹스 |
| `community-voice` | Community Voice | 커뮤니티 감정 대변 |
| `product-architect` | Product Architect | 제품/기획 관점 |

---

## 7. 동적 소환 (Dynamic Summoning) 시스템

### 7.1 개념

30명이 동시에 떠들면 난장판! **이슈의 성격에 따라 관련된 에이전트만 소환**

### 7.2 로비 (대기실)

모든 에이전트가 `Idle` 상태로 대기하며 간헐적 잡담(Chatter) 발생

```typescript
interface AgentState {
  id: string;
  status: 'idle' | 'active' | 'speaking' | 'listening';
  currentActivity?: string;  // "비트코인 차트를 쳐다보는 중..."
  lastChatter?: Date;
}

// UI에 표시될 잡담 예시
// [Degen Trader] "비트코인 4% 상승 중... 이번엔 진짜 불장인가? 🚀"
// [Rust Evangelist] "방금 새 crate 업데이트 봤는데, 메모리 안전성 개선됐더라."
// [White Hat] "Curve 해킹 사후 분석 읽는 중... 우리 컨트랙트는 괜찮겠지?"
```

### 7.3 특별 관심 그룹 (이슈 유형별 자동 소환)

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

### 7.4 인간 소환 (사용자 개입)

```typescript
// UI 버튼 또는 채팅 명령으로 에이전트 소환
POST /api/agora/:sessionId/summon
{
  agentId: "white-hat",
  reason?: "보안 전문가 의견이 필요합니다"
}

// 또는 채팅 입력: "@white-hat 이 코드의 보안 취약점은 없나요?"
```

---

## 8. 3티어 스케줄러 + Budget Manager

### 8.1 티어 분류

| 티어 | 비용 | 실행 주기 | 작업 | 담당 |
|------|------|----------|------|------|
| **Tier 0** | 무료 | 1-10분 | RSS/GitHub/On-chain 수집, 중복 제거 | 오퍼러티브 |
| **Tier 1** | 로컬 LLM | 5-15초 | 잡담, 간단 요약, 태깅, Issue 후보 | 30인 전체 (유휴) |
| **Tier 2** | 외부 LLM | 트리거 시 | 본격 토론, Decision Packet | 소환된 에이전트만 |

### 8.2 Budget Manager

```typescript
interface BudgetConfig {
  provider: 'anthropic' | 'openai';
  dailyBudgetUsd: number;      // 기본: $10/day
  hourlyCallLimit: number;     // 기본: 20 calls/hour
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

### 8.3 Tier 2 트리거 조건

1. **심각도 기반**: HIGH/CRITICAL 신호 유입
2. **커뮤니티 반응**: 10+ 관련 신호 발생
3. **보안 이슈**: 보안 관련 키워드 감지
4. **스케줄**: 하루 1-4회 정기 실행 (기본: 6시, 12시, 18시, 23시)

### 8.4 폴백 로직

```
예산 소진 시:
Tier2 요청 → 예산 체크 → 부족! → Tier1(로컬)로 대체 → UI "Degraded" 표시
```

---

## 9. 환경 설정

### .env.example

```bash
# 서버
PORT=3201
NODE_ENV=development

# 데이터베이스
DB_PATH=data/algora.db

# LLM - 외부 (Tier 2)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514

# LLM - 로컬 (Tier 1)
LOCAL_LLM_ENDPOINT=http://localhost:11434
LOCAL_LLM_MODEL_CHATTER=gemma3:4b
LOCAL_LLM_MODEL_ENHANCED=gemma3:4b
LOCAL_LLM_NUM_CTX=16384
OLLAMA_NUM_CTX=16384
RAG_EMBEDDING_MODEL=nomic-embed-text

# 티어 설정
TIER0_INTERVAL=60000
TIER1_INTERVAL=300000
TIER2_SCHEDULED_RUNS=6,12,18,23

# 예산
ANTHROPIC_DAILY_BUDGET_USD=10.00
OPENAI_DAILY_BUDGET_USD=10.00
ANTHROPIC_HOURLY_CALL_LIMIT=20
OPENAI_HOURLY_CALL_LIMIT=20

# 잡담
CHATTER_INTERVAL_MIN=5000
CHATTER_INTERVAL_MAX=15000

# 신호 소스
ETHERSCAN_API_KEY=
GITHUB_TOKEN=
TWITTER_BEARER_TOKEN=

# 블록체인
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
CHAIN_ID=1
MOC_TOKEN_ADDRESS=0x8bbfe65e31b348cd823c62e02ad8c19a84dd0dab

# 도메인
DOMAIN=algora.moss.land
NEXT_PUBLIC_API_URL=https://algora.moss.land/api

# 언어
DEFAULT_LOCALE=en
SUPPORTED_LOCALES=en,ko
```

---

## 10. 시작하기

```bash
# 1. 저장소 클론
git clone https://github.com/mossland/Algora.git
cd Algora

# 2. 의존성 설치
pnpm install

# 3. 환경 설정
cp .env.example .env
# .env 파일 편집

# 4. 데이터베이스 초기화
pnpm db:init

# 5. 개발 서버 시작
pnpm dev

# API: http://localhost:3201
# Web: http://localhost:3200
```

---

## 11. 수용 기준 (Acceptance Criteria)

### 11.1 핵심 요구사항

1. **Activity Log 연속성**: UI에서 Activity Log가 최대 10초 이상 멈추지 않음 (heartbeat + 에이전트 잡담)
2. **Agent Chatter**: 로비에서 5-15초마다 에이전트 잡담이 표시됨
3. **Dynamic Summoning**: 이슈 생성 시 관련 에이전트가 자동 소환됨
4. **Human Summoning**: 사용자가 버튼/명령으로 특정 에이전트 소환 가능
5. **Tier 분리**: 잡담은 Tier1(로컬), 본격 토론은 Tier2(외부)
6. **Budget 제한**: 외부 LLM 예산 소진 시 Tier1 대체 + UI "Degraded" 표시
7. **Daily Ops Report**: 최소 하루 1회 자동 생성 + /disclosure에서 조회 가능
8. **Provenance**: 모든 산출물에 출처/시간/모델/작업ID/해시 포함

### 11.2 성능 요구사항

- WebSocket 연결: 재연결 5회 시도, 1초 간격
- Activity Log: 최대 100개 이벤트 버퍼
- Chatter 생성: 5-15초 간격
- API 응답: 95th percentile < 500ms

---

## 12. 구현 순서

### Step 1: 프로젝트 셋업 + 30인 에이전트 (핵심)
1. Monorepo 구조 생성 (pnpm + Turborepo)
2. Database Schema 구현
3. 30인 에이전트 명부 정의 (roster.ts)
4. Agent State Manager
5. Chatter Service + Ollama 연동
6. Socket.IO 기본 설정
7. Frontend AgentLobby + AgentAvatar 컴포넌트

**완료 시**: 로비에서 30인 에이전트가 잡담하며 "웅성거리는" 느낌

### Step 2: Dynamic Summoning + Agora
1. Summoning Engine (규칙 기반 자동 소환)
2. Agora Session Manager
3. Agora API 엔드포인트
4. Frontend DiscussionArena + SummonPanel
5. Human Summoning UI

**완료 시**: 이슈 기반 자동 소환 + 사용자 수동 소환 가능

### Step 3: Signal Collection + Issue Detection
1. Signal Adapters (RSS, GitHub, On-chain, Mock)
2. Signal Registry
3. Issue Detectors (Anomaly, Threshold, Trend)
4. Frontend Signals/Issues 페이지

**완료 시**: 실시간 신호 수집 및 이슈 자동 감지

### Step 4: Activity Log + StatusBar
1. Activity Service
2. Heartbeat 시스템
3. StatusBar 컴포넌트
4. Engine Room 페이지

**완료 시**: 전체 시스템 활동 실시간 모니터링

### Step 5: Budget Manager + 3티어 스케줄러
1. Budget Manager
2. Tier Scheduler
3. Tier0/1/2 Runners
4. Budget UI 표시

**완료 시**: 비용 최적화된 에이전트 운영

### Step 6: Disclosure + Daily Report
1. Disclosure Service
2. Daily Ops Report Generator
3. Disclosure Scribe Agent
4. /disclosure 페이지

**완료 시**: IR 스타일 자동 공시

### Step 7: Governance + Voting
1. Proposal System
2. Voting System
3. Delegation System
4. /proposals 페이지

**완료 시**: 완전한 거버넌스 루프

### Step 8: 통합 + Polish
1. 전체 페이지 완성
2. i18n (en/ko)
3. 반응형 디자인
4. 통합 테스트

---

## 13. 라이선스

MIT License

---

**최종 업데이트**: 2025-01-09
