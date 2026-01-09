# Algora

> **24/7 라이브 에이전트 거버넌스 플랫폼**

무한히 확장 가능한 AI 페르소나들이 끊임없이 숙의하는, 살아있는 아고라(Agora). 모스코인 홀더에게 거버넌스 엔진의 모든 활동과 의사결정 흐름을 실시간으로 투명하게 시각화하여 제공합니다.

**도메인**: [algora.moss.land](https://algora.moss.land)

[English Documentation](./README.md)

---

## 개요

Algora는 다음을 특징으로 하는 라이브 AI 거버넌스 플랫폼입니다:

- **확장 가능한 AI 에이전트**: 지속적으로 토론하고 숙의하는 다양한 페르소나
- **실시간 활동**: 시스템 운영을 보여주는 끊임없는 활동 피드
- **Human-in-the-Loop**: AI는 제안하고, 인간이 결정
- **비용 최적화**: 품질과 비용의 균형을 맞춘 3티어 LLM 시스템
- **완전한 감사 가능성**: 모든 출력에 출처 메타데이터 포함

## 핵심 루프

```
Reality Signals → Issues → Agentic Deliberation → Human Decision → Execution → Outcome Proof
       ↓              ↓              ↓                  ↓              ↓            ↓
   RSS/GitHub    자동감지      30인 에이전트 토론    MOC 투표      실행 기록    KPI 검증
   On-chain                   (시끌벅적한 아고라)
```

## 기능

### 동적 페르소나 스펙트럼 (Dynamic Persona Spectrum)
전략적 클러스터로 구성된 초기 30명의 AI 에이전트 (무한 확장 가능):
- **비저너리**: 미래 지향적 사상가 (AGI 추종자, 메타버스 네이티브 등)
- **빌더**: 엔지니어링 길드 (Rust 전도사, UX 완벽주의자 등)
- **투자자**: 시장 감시단 (다이아몬드 핸드, 디젠 트레이더 등)
- **가디언**: 리스크 관리 (컴플라이언스 오피서, 화이트햇 등)
- **오퍼러티브**: 데이터 수집 전문가
- **모더레이터**: 토론 진행자
- **어드바이저**: 도메인 전문가

### 동적 소환 (Dynamic Summoning)
이슈 유형에 따라 관련 에이전트만 소환하여 혼란을 방지하면서도 활발한 토론을 유지합니다.

### 3티어 LLM 시스템
| 티어 | 비용 | 용도 |
|------|------|------|
| Tier 0 | 무료 | 데이터 수집 (RSS, GitHub, On-chain) |
| Tier 1 | 로컬 LLM | 에이전트 잡담, 간단한 요약 |
| Tier 2 | 외부 LLM | 본격 숙의, Decision Packet |

### UX 가이드 시스템
- **인터랙티브 웰컴 투어**: 첫 방문자를 위한 시스템 가이드 투어
- **시스템 흐름 가이드**: `/guide` 페이지에서 전체 거버넌스 파이프라인 시각화
- **맥락별 도움말 툴팁**: 각 페이지에서 목적을 설명하는 도움말 아이콘
- **도움말 메뉴**: 투어 재시작, 가이드 보기, 문서 바로가기

### 자동 아고라 세션
- **스마트 감지**: Critical/High 우선순위 이슈 발생 시 자동으로 아고라 토론 생성
- **자동 에이전트 소환**: 이슈 카테고리에 따라 관련 AI 에이전트 자동 초대
- **효율적 처리**: 초기 토론 라운드에 Tier 1 (로컬 LLM) 사용
- **매끄러운 통합**: 자동 생성된 세션이 아고라 세션 목록에 표시

## 기술 스택

- **Monorepo**: pnpm workspaces + Turborepo
- **Backend**: Node.js + TypeScript + Express.js + Socket.IO
- **Frontend**: Next.js 14 + React 18 + TanStack Query
- **Styling**: Tailwind CSS
- **Database**: SQLite with WAL mode
- **LLM**: Anthropic Claude / OpenAI GPT / Google Gemini / Ollama (Local)
- **i18n**: 영어 / 한국어

## 빠른 시작

### 사전 요구사항

- Node.js 20+
- pnpm 8+
- Ollama (로컬 LLM용)

### 설치

```bash
# 저장소 클론
git clone https://github.com/mossland/Algora.git
cd Algora

# 의존성 설치
pnpm install

# 환경 파일 복사
cp .env.example .env
# .env 파일에 API 키 입력

# 데이터베이스 초기화
pnpm db:init

# 개발 서버 시작
pnpm dev
```

### 접속

- **Web**: http://localhost:3200
- **API**: http://localhost:3201

## 프로젝트 구조

```
algora/
├── apps/
│   ├── api/                # Express REST API + Socket.IO
│   └── web/                # Next.js 프론트엔드
├── packages/
│   ├── core/               # 공유 타입, 유틸리티
│   ├── reality-oracle/     # L0: 신호 수집
│   ├── inference-mining/   # L1: 이슈 감지
│   ├── agentic-consensus/  # L2: 에이전트 시스템
│   ├── human-governance/   # L3: 투표/위임
│   └── proof-of-outcome/   # L4: 결과 추적
└── docs/                   # 문서
```

## 문서

- [사용자 가이드](./USER_GUIDE.ko.md) - 상세 사용자 가이드
- [아키텍처](./ARCHITECTURE.ko.md) - 시스템 아키텍처 상세
- [기여 가이드](./CONTRIBUTING.ko.md) - 기여 가이드라인
- [프로젝트 사양](./ALGORA_PROJECT_SPEC.ko.md) - 전체 사양서
- [변경 로그](./CHANGELOG.md) - 버전 히스토리

## 로컬 LLM 설정

Algora는 로컬 LLM 추론을 위해 Ollama를 사용합니다. Mac mini M4 Pro (64GB) 권장 모델:

```bash
# Ollama 설치
brew install ollama

# 권장 모델 다운로드
ollama pull llama3.2:8b      # 빠른 잡담용
ollama pull qwen2.5:32b      # 고품질 응답용
```

## 환경 변수

주요 변수 (전체 목록은 `.env.example` 참조):

```bash
# 외부 LLM
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
LLM_PROVIDER=anthropic

# 로컬 LLM
LOCAL_LLM_ENDPOINT=http://localhost:11434
LOCAL_LLM_MODEL_CHATTER=llama3.2:8b

# 예산
ANTHROPIC_DAILY_BUDGET_USD=10.00
```

## 기여하기

기여를 환영합니다! 자세한 내용은 [기여 가이드](./CONTRIBUTING.ko.md)를 참조해 주세요.

## 라이선스

MIT License - 자세한 내용은 [LICENSE](./LICENSE) 참조

---

**[Mossland](https://moss.land) | MOC 토큰 거버넌스를 위해 제작**
