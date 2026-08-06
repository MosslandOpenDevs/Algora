# 개발 현황 - Algora

이 파일은 세션 간 개발 연속성을 위해 현재 개발 진행 상황을 추적합니다.

**최종 업데이트**: 2026-08-06
**현재 버전**: 0.13.1
**프로덕션 URL**: https://algora.moss.land

---

## 최근 작업: 공유 Ollama `num_ctx` 조율 (2026-08-06)

MOSS.AO가 `LOCAL_LLM_NUM_CTX`를 8192에서 16384로 올려 달라는 메모를
보냈습니다. 두 서비스가 `192.168.1.65:11434` Ollama 호스트를 공유하는데
같은 모델을 서로 다른 컨텍스트 크기로 요청하고 있었기 때문입니다.

**변경했습니다.** 방향이 옳고 우리 쪽 비용이 0입니다. 다만 메모의 근거
수치는 호스트를 직접 재측정하자(Ollama 0.32.5, 2026-08-06) 유지되지
않았고, 그중 셋은 MOSS.AO 자신의 디버깅에 영향을 주는 방식으로
틀렸습니다:

| 메모의 주장 | 실측 |
|---|---|
| 비상주 `num_ctx`는 "완료되지 않음"(40초 타임아웃) | 완료됨. 16384에서 4.38초, 8192 복귀 4.64초 |
| 모델 로드 ~60초 | **4.3–4.5초** (그 ~60초는 우리 코드 주석이 출처였고, 이미 낡은 값) |
| 16384는 VRAM +0.15GB | 16384에서 **2.89GB**, 8192에서 **3.03GB** — 오히려 낮음 |
| Algora 호출이 ~90초마다 | ~30초마다(분당 2회) + 60초마다 `/api/tags` 헬스 프로브 |

실제 조건 재현 — 우리 프로덕션 주기와 3,170토큰/16384 요청을 동시에
돌린 결과 — 정체는 전혀 없었습니다. MOSS.AO 쪽 호출은 **11.2초**에
반환됐고(`done_reason: stop`), 우리 6회 호출 중 정확히 1회만 **4.45초**
재로드를 부담했습니다. 즉 `num_ctx` 불일치의 비용은 교대마다 수 초이지,
무한 대기가 아닙니다.

**메모가 맞힌 것과 놓친 것.** 구조적 주장은 범위를 정확히 잡으면
성립합니다. 이 호스트는 **모델 이름당 러너 하나**를 유지하고, 그 러너는
**한 번에 요청 하나**를 처리합니다. 두 번 확인했습니다 — 같은 모델의 두
번째 컨텍스트 크기는 공존하지 않고(`/api/ps`에 항상 항목 1개), 16.5초짜리
생성 8초 지점에 넣은 짧은 호출이 16.6초에 반환됐습니다(즉 대기함). 메모가
끌어내지 않은 두 가지 귀결이 있습니다:

- "~5GB 여유가 있으니 용량 문제가 아니다"라는 서술은 *같은 모델의 다른
  `num_ctx` 인스턴스*가 로드될 수 있다는 뜻을 함축합니다. VRAM이 얼마나
  남든 로드되지 않습니다. `num_ctx` 수렴은 재로드 스래싱을 없애지만
  **선두 차단(head-of-line blocking)** 은 없애지 못합니다. 그쪽 지렛대는
  어느 앱의 환경변수도 아닌 호스트의 `OLLAMA_NUM_PARALLEL`입니다.
- 수정 후 `/api/ps`를 폴링하다 합의에 없던 **세 번째** `num_ctx`(4096)가
  돌고 있어 합의된 16384 런너를 축출하는 것을 발견했습니다. 출처는
  MOSS.AO 자체 코드의 `IdeaScorer.SCORING_NUM_CTX = 4096` — 바로 이
  문제의 우회책으로 넣은 호출별 하드코딩 오버라이드입니다. 아이디어
  분류 타임아웃은 자초한 것이며, 그들이 제안한 양자 합의는 이 오버라이드를
  걷어내기 전까지 성립할 수 없었습니다.

**해결됨.** MOSS.AO가 네 가지 지적을 자체 재측정으로 모두 확인하고
오버라이드를 제거했습니다(`e0468d5`, *"drop SCORING_NUM_CTX — 스스로가
해결하려던 문제가 되어버렸다"*. 배포된 HEAD의 조상임을 확인했고, `src/`는
깨끗하며 `assert not hasattr(IdeaScorer, "SCORING_NUM_CTX")`로 회귀
방지가 걸려 있습니다). 우리 쪽 거절 두 건도 타당하다고 수용했습니다.
이후 호스트는 2분 연속 폴링 내내 `gemma3:4b ctx=16384`를 유지했고 전환은
한 번도 없었습니다 — 인스턴스 하나, 컨텍스트 하나, 두 서비스 공용.

**호스트에서 나온 정정.** Windows 박스에서 실행한 `ollama ps`에
`gemma3:4b`(ctx 16384)와 `gemma3:1b`(ctx 4096)가 함께 상주하는 것이
나왔습니다. 즉 같은 모델 테스트에서 일반화했던 "한 번에 인스턴스 하나"는
범위를 너무 넓게 잡은 것이었습니다. 재측정: 17.3초짜리 `gemma3:4b` 생성의
8초 지점에 넣은 `gemma3:1b` 호출이 **0.59초**에 반환됐습니다. **서로 다른
모델은 각자 러너를 받아 병렬로 실행되며, 스래싱은 같은 모델의 다른
`num_ctx`에서만, 직렬화는 같은 러너 안에서만 발생합니다.** `num_ctx` 통일
작업은 영향받지 않으며 그대로 유효합니다. 달라지는 것은 해법이고, 그
결과 MOSS.AO의 첫 번째 제안(고빈도 경로에 더 작은 모델)은 원리적으로
옳았으며 우리의 거절이 틀렸습니다. 아래에 결정 사항으로 다시 엽니다.

나머지는 호스트 자체 시작 설정으로 확인됐고, 의도적 설정이 아니라 전부
기본값입니다 — `$env:OLLAMA_NUM_PARALLEL`은 비어 있습니다:

```
OLLAMA_NUM_PARALLEL:1   OLLAMA_MAX_LOADED_MODELS:0 (자동)   OLLAMA_MAX_QUEUE:512
OLLAMA_KEEP_ALIVE:5m0s  OLLAMA_FLASH_ATTENTION:false        OLLAMA_KV_CACHE_TYPE: (f16)
NVIDIA GeForce RTX 5060 — 전체 8.0 GiB, 가용 6.9 GiB
```

상주량은 2.89 GB(`4b`) + 0.88 GB(`1b`) ≈ 6.9 GiB 중 3.8 GiB입니다.

**해결: 호스트에 `OLLAMA_NUM_PARALLEL=4` 적용.** 직렬화가 사라졌고 속도
손해는 없었습니다:

```
단일 요청 (대조군, 이전):   300 tok @ 106.6 tok/s
동시 요청 4개:             1200 tok / 5.1초  =  집계 235 tok/s
단일 요청 (대조군, 이후):   300 tok @ 106.9 tok/s
```

집계 처리량 2.2배, 단일 요청 decode는 변경 전 기준선 약 109 tok/s 대비
변화 없음, VRAM +0.41 GB(2.89 → 3.30 GB, 가용 6.9 GiB). 전체 정리는
`docs/ollama-shared-host-tuning.md`.

**기록해 둘 오경보 하나.** 변경 도중 표본에서 decode 5.2 tok/s, prefill
101 tok/s가 나와 심각한 성능 저하로 보고했고 백엔드(Vulkan vs CUDA)를
원인으로 의심했습니다. 호스트 로그가 이를 반증했고(`library=CUDA` 유지),
대조군을 붙여 재측정하니 저하는 전혀 없었습니다. 표본이 오염된 것이었습니다
— `NUM_PARALLEL > 1`이 되는 순간 Algora 자신의 프로덕션 트래픽이 GPU를 실제로
공유하므로, 대조군 없는 "단일 요청" 측정은 사실상 *n*중 경합을 잰 것입니다.
**이 호스트는 결코 유휴가 아니므로, 동시성 측정은 항상 단일 요청 대조군
사이에 끼워서 하십시오.**

**하지 않기로 한 것: chatter 스케줄러를 `gemma3:1b`로 이동.** 선두 차단에
대한 대비책이었는데 `NUM_PARALLEL=4`로 차단 자체가 사라졌으므로, 지금
적용하면 사용자에게 보이는 chatter 품질만 잃고 얻는 게 없습니다. 호스트가
단일 슬롯으로 되돌아갈 때만 재고할 가치가 있습니다. 판단 근거가 자명하지
않아 남겨둡니다: 어느 경우든 `complexity: 'fast'` 전체에 적용해서는 안
됩니다. 7개 `fast` 호출처 중 4개가 `agora.ts`의 실제 숙의 경로입니다.

선택 제안 두 가지는 **실측을 근거로 거절**했습니다. 짧은 `fast` 호출을
`gemma3:1b`로 돌리는 것과 `keep_alive` 단축은 각각 호스트의 단일 인스턴스
슬롯에 두 번째 항목을 넣어, 고정 4.4초 로드를 상시 스래싱으로 바꿉니다.
인스턴스가 하나뿐인 호스트에서는 상주를 유지하는 것이 곧 좋은 이웃이
되는 방법이며, `apps/api/.env`가 이미 3개 티어를 `gemma3:4b`로 통합해 둔
이유이기도 합니다.

**변경 사항:** 프로덕션 `apps/api/.env`에 `LOCAL_LLM_NUM_CTX=16384`
(백업 `.env.bak.numctx.20260806`), `algora-api` 재시작 후
`context_length: 16384`로 서빙 중임을 확인했습니다. 코드 기본값도 동일하게
올렸고, 조율 제약을 사용처 두 곳과 `.env.example`에 명시해 다시 일방적으로
바뀌지 않도록 했습니다. 메모가 근거로 인용한 "콜드 로드 ~60초"라는 낡은
`keep_alive` 주석도 실측값으로 교체했습니다.

---

## 최근 작업: 숙의 출력 수정 + Tier 2 준비 (2026-08-06)

운영자가 MOSS.AO처럼 숙의를 유료 API로 옮겨야 하는지 물었습니다. 실제
시스템을 측정한 결과 전제가 성립하지 않았고, 눈에 보이던 품질 문제는
모델이 아니라 우리 상수였습니다.

**MOSS.AO 선례가 적용되지 않는 이유.** 그쪽 CHANGELOG가 실제 원인을 기록하고
있습니다: *"어떤 Ollama 요청도 `num_ctx`를 보내지 않아 공유 서버가
gemma3:4b를 자체 기본값 4096으로 로드했다 … 생성이 정확히 `prompt_eval +
eval == 4096`에서 `done_reason="length"`로 끊겼는데, provider가 그 필드를
버려서 로그 한 줄 남지 않았다."* 같은 날 Algora에서 고친 바로 그 버그입니다.
`num_ctx=16384`를 넣은 뒤엔 두 번째 벽 — 인프라 — 에 부딪혔습니다: num_ctx
값마다 별도 모델 인스턴스라, 혼잡한 공유 GPU가 16k 로드를 매번 ~30분씩
멈춰 세웠습니다. 그쪽 결론: *"그건 코드가 아니라 인프라 문제다."*

> **2026-08-06 업데이트:** "~30분 정지"는 독립적으로 검증된 적이 없고
> 재현되지 않습니다 — 해당 호스트의 16k 로드는 현재 **4.3–4.5초**로
> 측정됩니다. 그 뒤에 있는 단일 인스턴스 제약 자체는 사실입니다. 위의
> *공유 Ollama `num_ctx` 조율* 절을 참고하세요.

Algora는 그 벽에 닿지 않습니다. 프로덕션 최대 세션에서 모든 프롬프트를
재구성해 실제 Ollama 호스트로 토크나이즈한 결과: 에이전트 발언 752토큰,
최종 요약 2,859, 액션 아이템 3,910, 이론상 최악 **4,497 — 8,192 창의 55%**.
모든 경로가 하드 윈도잉(`slice(-5)`, `getMessages(50)`, `slice(-30)`)에
메시지당 400자 캡이라 라운드가 늘어도 커지지 않습니다. 전체 프로덕션 로그에
컨텍스트 포화 경고 0건.

**실제로 고장 나 있던 것(전부 로컬, 전부 무료 수정):**

- **액션 아이템이 29~46% 조용히 유실.** `extractActionItems`가
  `maxTokens: 500`이라 큰 세션에서 JSON 배열이 중간에 끊기고, 정규식이
  매칭에 실패하면 **로그 없이** `[]`를 반환했습니다 — 성공만 로그를
  남겼습니다. 프로덕션 증거: 라운드 승격 66회, 성공 47회, 실패 0회.
  1,000으로 상향(무제한 실행 시 최대 ~600)하고 no-match 분기에 경고 추가.
- **에이전트 발언의 45.6%가 단어 중간에서 절단** — 모델이 아니라 우리
  `cleanResponse().substring(0, 500)` 때문. 모델은 16/16 샘플에서 ~80토큰
  (396~663자)에 스스로 종료(`done_reason: 'stop'`)했습니다. 캡을 800으로
  올리고 문장 경계에서 끝나게 했습니다. `maxTokens: 200`은 애초에 걸린 적이
  없어 그대로 둡니다.
- **`generateRoundSummary`가 400 캡의 9토큰 이내**에서 동작 중 — 같은 방식으로
  실패하기 전에 600으로 상향.
- **한 에이전트가 한 라운드에서 최대 5번 발언**(라운드 슬롯의 39.2%에서 중복)
  — 참여자 균등 랜덤이었기 때문. `pickSpeaker()`가 직전 발언자를 제외합니다.
- **발언의 16%가 존재하지 않는 문서를 인용**("Section 3.2.1 of Document
  Gamma-7" 등, 결정 패킷까지 전파). 컨텍스트에 문서가 없는데 Docs Librarian
  페르소나가 "quotes documentation standards"를 요구했습니다. 페르소나를
  수정하고 시스템 프롬프트가 문서·섹션·프로토콜 식별자 날조를 금지합니다.

**Tier 2를 실제로 쓸 수 있게 정비(기본은 여전히 꺼짐).** 플래그만 뒤집으면
네 가지가 조용히 실패했을 것입니다:

- `claude-3-haiku-20240307`(2026-04-19 은퇴)이 하드코딩돼 모든 Anthropic
  호출이 404 후 폴백 체인으로 흘렀을 것입니다. 세 프로바이더 모델 id를 전부
  env로 뺐습니다.
- 예산 가드가 **출력 토큰만** 정액으로 계산했습니다. 숙의는 입출력 ~7:1이라
  명목 $10/일이 실제 $25~41/일이었습니다. 이제 입력도 과금하고, 프로바이더가
  입력 토큰을 보고하며, 단가를 env로 설정할 수 있습니다 — `INSERT OR IGNORE`
  시드 탓에 단가가 몇 달 전 값으로 굳어 있던 기존 배포에서도 적용됩니다.
- **Tier 2 실패 시 Ollama로 폴백하지 않았습니다.** 예외를 던졌고, Agora는
  예외를 잡으면 하드코딩된 템플릿 문장을 진짜 에이전트 발언으로 저장합니다.
  키 만료나 예산 소진이 아무 모델도 만들지 않은 문장으로 공개 피드를 채웠을
  것입니다. 이제 Tier 2 요청은 로컬로 강등되고, Tier 1 요청이 완전히 실패하면
  빈 문자열 대신 예외를 던집니다(호출자가 조용히 삼키는 것을 방지).
- **전역 플래그는 엉뚱한 호출을 라우팅합니다.** 8개 숙의 호출부 중 7개가
  `tier: 1` 하드코딩이고, 모델 라우터 분류기는 'security'/'audit' 부분 문자열
  매칭만으로 토론 턴의 83.5%를 `critical`로 보냅니다. 플래그를 켜면 채팅에
  돈을 쓰고 정작 Decision Packet은 로컬에 남습니다. 이제
  `AGORA_SYNTHESIS_TIER`로 호출부 단위 라우팅하며, 정확히 합성 3종(하루
  ~143콜)만 대상입니다.

`ecosystem.config.cjs`는 더 이상 `LLM_DISABLE_TIER2`와 API 키를 빈 문자열로
고정하지 않습니다: pm2가 그 블록을 마지막에 적용하고 dotenv는 이미 정의된
변수를 덮어쓰지 않으므로, 그 줄들이 `apps/api/.env`에 넣은 키를 조용히
무력화했을 것입니다.

- 검증: api 76/76, `tsc` 클린. 예산 테스트 2개는 기존 "예외" 계약 대신 새
  "로컬 강등" 계약을 담도록 갱신했습니다.

---

## 최근 작업: 문서 검증이 제안을 삼키고 있었다 (2026-08-06)

브리지가 드디어 연결된 뒤(이전 항목), 첫 스테일 세션 harvest가 숙의 3건을
완료했는데 제안은 1건만 생성됐습니다. 나머지 둘은 아무도 안 보는 곳에서
죽었습니다: `console.error`는 **stderr**로 나가므로, 다른 오케스트레이터
로그가 전부 `api-out-<pmid>.log`에 있는 동안 실패는
`api-error-<pmid>.log`에 있었습니다.

```
DocumentValidationError: Validation failed for summary: Must be at most 500 characters
  at DocumentManager.validateSummary → AgoraService.integrateWithGovernanceOS
```

`integrateWithGovernanceOS()`는 결정 패킷 **문서**를 만든 뒤
`handleAgoraSessionCompleted()`(이슈 갱신과 제안 생성을 담당)를 호출하는데,
둘이 같은 try/catch 안에 있었습니다. 문서의 `summary`는 LLM이 생성한
`decisionPacket.recommendation` 원본이었고, 500자를 넘으면 `create()`가
던지면서 이후 전부가 건너뛰어져 제안이 사라졌습니다. **프로덕션 결정 패킷
23개 중 12개(52%)의 recommendation이 500자를 초과**하므로, 전체 숙의의 약
절반이 조용히 제안을 못 만들 상태였습니다.

- **구조적 격리.** 문서 생성에 자체 try/catch를 뒀습니다. 문서는 숙의의
  기록일 뿐이고, 거버넌스는 문서 없이도 진행돼야 합니다. 이것이 진짜 회귀
  수정입니다 — 아래 클램핑이 방아쇠를 막는다면, 이건 그 *부류*를 막습니다.
- **경계에서의 클램핑.** 한계를 소유한 `@algora/document-registry`에
  `clampTitle`/`clampSummary`를 추가하고, validator가 쓰는 것과 같은 config를
  읽도록 `DocumentManager` 메서드로 노출했습니다(양쪽이 어긋날 수 없음).
  `apps/api`의 title/summary 14곳 전부에 적용. 공백 정규화, 예산 내 단어
  경계 절단을 하며, 무엇보다 손으로 짠 `.substring(0, 500)`이 무시하던
  **최소** 길이도 처리합니다: `minSummaryLength`가 50이라
  `"Detected issue in category ai with low priority"`(46자)도 긴 것과
  똑같이 검증에 실패했습니다.
- **적대적 리뷰가 찾은 동일 결함 2건**(3렌즈 멀티에이전트, 두 검증자가 각각
  종단 재현): 거버넌스 파이프라인의 `createDocument` 어댑터가 호출자의
  summary를 **조용히 버리고** title로 대체하고 있어, 이슈 제목이 33자 미만이면
  summary가 50자 미만이 되어 파이프라인의 유일한 문서가 사라졌습니다 —
  그것도 저장소 어디에서도 읽지 않는 `ctx.metadata.documentProduction`으로.
  또 워크플로 문서 폴백 7개(`'Research findings'`, `'Debate findings'` 등)가
  전부 50자 미만이라, LLM 필드가 비면 검증 예외가 확정적으로 나면서 해당
  워크플로의 남은 문서까지 전부 날아갔습니다. 둘 다 수정했고, 파이프라인은
  이제 삼킨 에러를 로그로 남깁니다.
- **테스트.** `governance-integration.test.ts`가 격리 자체를 고정하고(문서
  생성이 던져도 핸들러가 실행됨 — 리뷰가 "행위 쪽 절반에 테스트가 없다"고
  정확히 지적), registry 스위트가 실제 validator 대상 클램핑, 절단 지점의
  서로게이트 쌍 분할(이모지), 공백 없는 한글, 비기본 config를 검증합니다.
  api 76/76, document-registry 26/26, `tsc` 클린.

---

## 최근 작업: 좀비 세션과 ISO-'T' 타임스탬프 함정 (2026-08-06)

실시간 숙의 → 제안 경로가 발화하는지 확인하려다 상류에서 더 심각한 것을
발견했습니다: "활성" 아고라 세션 6개 중 **5개가 8~21시간째 죽어
있었는데**(메시지도 진행도 없음) 시간별 스테일 스위퍼는 청소할 게 없다고
보고하고 있었습니다.

**근본 원인(버그 하나, 서브시스템 셋).** 대부분의 타임스탬프 컬럼은 JS의
`new Date().toISOString()`으로 기록되지만(`2026-08-05T21:27:40.708Z`,
`'T'` 구분자), **공백**으로 렌더링되는 SQLite `datetime('now', ...)`와
비교되고 있었습니다. 둘 다 TEXT라 사전식 비교가 일어나고 `'T'`(0x54)는
`' '`(0x20)보다 뒤에 정렬되므로, 날짜 부분이 컷오프와 같은 행은 시각과
무관하게 항상 *더 크게* 비교됩니다. 프로덕션 실측:

- **만료(`<`) 비교가 UTC 날짜가 바뀔 때까지 아무것도 못 찾음.** 스테일
  세션이 하루 종일 쌓였다가 자정 직후 72개가 한 번에 종료됐습니다. 감사
  시점에 스위퍼 쿼리는 진짜 스테일 세션 5개 중 0개를 찾았고, ISO 바운드
  버전은 5개를 모두 찾았습니다.
- **최근 구간(`>`) 집계가 부풀려짐.** 대시보드가 24시간 시그널을 실제
  2,404건 대비 3,547건으로 보고(+47%).
- **제안 큐가 단계당 ~24시간 지연** — 이 패턴이 시스템적이라는 걸 알기
  전, 앞선 순환 고리 작업에서 이미 수정.
- **지갑 검증 nonce가 제때 만료되지 않음.** `expires_at >
  datetime('now')`가 같은 날 nonce를 계속 유효로 판정해, 의도한 15분
  서명 재사용 창이 UTC 하루 끝까지 늘어났습니다. 종료된 토큰 투표와 만료된
  위임도 같은 결함.

**수정.** 문서화된 `apps/api/src/utils/time.ts`(`isoNow`, `isoAgo`,
`isoMinutesAgo`, `isoHoursAgo`, `isoDaysAgo`)가 ISO 컬럼과 올바르게
비교되면서 *인덱스도 유지하는*(컬럼을 `datetime(col)`로 감싸는 방식과
달리) ISO-8601 바운드를 생성합니다. 시그널/활동 통계, 파이프라인 헬스,
이슈 감지, 제안 통계, 아고라 스위프, 토큰/위임 만료 등 영향받는 모든
사이트에 적용했습니다. SQL `DEFAULT CURRENT_TIMESTAMP`로 기록되는
컬럼(`issues.created_at`, `signals.created_at`, trust 테이블들)은 개별
확인 후 `datetime('now')` 비교를 그대로 뒀습니다 — 그쪽은 그게 맞습니다.

**같은 감사에서 발견한 두 번째 결함: 스위프된 세션이 버려지고
있었습니다.** `cleanupStaleSessions()`는 status만 `'completed'`로 바꿀
뿐 — 요약도, 결정 패킷도, 거버넌스 통합도 없이 — 스위프된 세션은 제안
파이프라인의 막다른 길이었습니다. 인메모리 라운드 타이머는 API 재시작을
넘기지 못하므로(08-05 하루에만 배포 6회) 그게 예외가 아니라 정상
경로였습니다: **완료 세션 2,176개에 결정 패킷은 20개.** 새로 추가한 범위
제한형 `harvestStaleSessions()`가 매시간 먼저 실행돼, 실제로 숙의한
고아 세션(에이전트 메시지 5개 이상)을 진짜 `completeSession()`
흐름(요약 → 결정 패킷 → 브리지 → 제안)에 태웁니다. 스위프는 6시간 탈출구
전까지 harvest 대상 세션을 보존하므로 harvest 한도가 유의미해지고, 영구
실패 세션도 결국 종료됩니다.

**세 번째 발견: 시간별 정비가 재시작마다 한 시간씩 유실.** `setInterval`은
한 주기가 꽉 차야 발화하므로, 자동 배포 재시작마다 제안 큐와 스테일 세션
정비가 60분씩 비었습니다 — 08-05 하루에 배포 8회였고, 배포 간격이 1시간
미만이면 해당 잡들은 사실상 영원히 안 돕니다. 이제 둘 다 부팅 후 약 3분
시점에 1회 실행됩니다(`scheduleBootKick`). 스테일 스위프에 특히
중요한데, 진행 중 세션을 고아로 만드는 게 바로 재시작이기 때문입니다.

- 테스트: `utils/time.test.ts`가 함정 자체를 고정하고(`<`/`>` 양방향,
  자정 직후 무의미 케이스는 건너뜀), `services/agora-stale.test.ts`가
  스위프/harvest 상호작용을 검증합니다(좀비 감지, 보존, 하드 클로즈
  탈출구, 부팅 복구 동작). api 전체 스위트 71/71, `tsc` 클린.

---

## 최근 작업: 실시간 거버넌스 통합 재연결 + LLM 컨텍스트 수정 (2026-08-06)

moss-ao의 로컬 LLM 숙의가 대형(16k 토큰) 프롬프트에서 실패한다는 운영자
보고를 계기로 Algora의 Ollama 전용 숙의 스택을 점검한 결과, 같은 계열의
조용한 결함 두 개를 발견했습니다:

- **로컬 LLM의 실효 컨텍스트가 약 2,048 토큰이었습니다.** Ollama 호출이
  `num_predict`만 설정하고 `num_ctx`를 설정하지 않아 서버 기본값이
  적용됐고 — 9천 단어 프로브 프롬프트로 실측하니 `prompt_eval_count:
  2051`에서 잘렸습니다. Ollama는 초과분을 조용히 자르므로, 최종 요약
  프롬프트(~3.4k 토큰: 최근 30개 메시지 × 400자 캡)는 매번 앞부분이
  잘린 채 — 트랜스크립트의 일부만 읽고도 "성공"하고 있었습니다. 이제 모든
  1티어 호출이 `num_ctx`를 명시적으로 요청하고(`LOCAL_LLM_NUM_CTX`, 기본
  8192 — 현재 최대 프롬프트의 2배 여유; gemma3:4b는 128k 지원),
  `prompt_eval_count`가 창을 채우면 WARN을 남기는 포화 검사를 추가해
  프롬프트가 창을 넘어서면 품질 미스터리가 아니라 로그 한 줄이 되도록
  했습니다.
- **실시간 숙의 → 거버넌스 경로가 배선된 적이 없었습니다.**
  `AgoraService`는 두 곳에서 생성됩니다: socket.ts는 GovernanceOS
  브리지를 넘기지만, issue-detection.ts는 *브리지가 존재하기 전에* 자체
  인스턴스를 생성하고 — 자동 생성 숙의는 전부 그 인스턴스가 실행합니다.
  결과: 모든 완료가 "GovernanceOS Bridge not available, skipping
  integration"을 남겼고(08-05 하루에만 19회) — 95% 합의에도 DP 문서도,
  파이프라인도, 실시간 제안 생성도 없었으며 시간별 백필만 제안을 만들고
  있었습니다. `AgoraService`에 `setGovernanceOSBridge()` setter를
  추가하고 `IssueDetection.setGovernanceOSBridge()`가 내부
  오케스트레이터로 브리지를 전달해 완료가 실시간으로 통합되게 했습니다.
- 검증: api 스위트 62/62, `tsc` 클린. 배포 후 세션 완료 시
  `[GovernanceOSBridge] Handling Agora session completion` 로그가 남고,
  강한 합의(≥70%, ≥3라운드, high/critical 이슈) 완료는 백필을 기다리지
  않고 즉시 제안을 생성해야 합니다.

---

## 최근 작업: 숙의 → 제안 → 해결 순환 고리 완성 (2026-08-06)

2026-08-05 안정화 작업이 반영되자 잠자던 거버넌스 깔때기의 생성부가 스스로
깨어났습니다: 시간별 `backfillMissingProposals` 작업이 완료된 아고라
숙의로부터 초안 제안 7건을 생성했습니다(사상 첫 성공 실행 — 그동안은
크래시 루프가 스케줄러보다 먼저 API를 죽였습니다). 이후 깔때기를 끝까지
추적하니, 이슈가 `resolved`에 도달하기 전에 두 번 막다른 길에 부딪히는
구조였습니다:

- **`resolveCompletedVotings()`의 호출자가 없었습니다.** 투표 →
  가결/부결 전이(그리고 연결된 이슈의 `resolved`/`detected` 갱신 — 이슈를
  해결 상태로 만드는 유일한 코드 경로)가 존재하지만 어디에서도 호출되지
  않았습니다. 이제 시간별 제안 큐의 3단계로 실행됩니다: 초안 → 토론 →
  투표 → **해결**.
- **같은 날짜의 타임스탬프가 만료로 판정되지 않았습니다.** 큐의 시간
  게이트 3곳이 ISO `'T'` 형식 타임스탬프를 공백 구분자로 렌더링되는
  `datetime('now')`와 문자열 비교했는데, `'T'`(0x54)가 `' '`(0x20)보다
  뒤에 정렬되므로 10:00에 지난 게이트가 *날짜*가 바뀔 때까지 인식되지
  않았습니다(단계당 최대 ~24시간 지연). 세 쿼리 모두 JS ISO 컷오프
  파라미터와 비교하도록 수정했습니다.
- **제안이 진행 중인 동안 이슈가 만료에 노출됐습니다.** 제안 생성이
  연결된 이슈를 `detected`로 남겨 7일 자동 만료 재니터가 파이프라인
  도중(파이프라인 자체가 ~4일 소요) 이슈를 기각할 수 있었습니다. 이제
  브리지가 이슈를 `pending_vote`로 옮깁니다(자동 만료 대상 아님; 부결 시
  `resolveCompletedVotings`가 `detected`로 복귀, 가결 시 resolved).
- **부결된 제안이 재상정을 막지 않습니다.** 중복 방지 가드가 종결된
  `rejected`/`cancelled` 제안까지 포함해 "해당 이슈의 아무 제안"과
  대조했는데, 부결 경로는 의도적으로 이슈를 "재논의를 위해" `detected`로
  되돌리므로 그 재논의가 새 제안을 만들 수 없는 모순이었습니다. 가드가
  종결 제안을 무시하도록 수정했습니다.
- **테스트.** 새 `governance/proposal.test.ts`(인메모리 SQLite, 8개)가
  해결 의미론을 고정합니다: 무투표 수동적 가결, 집계 가결/부결, 이슈
  해결/복귀(진행 중 상태에서만), 같은 날 만료 회귀, 파싱 불가 집계
  fail-open, 이력 기록, soak 승격 경로. api 전체 스위트 62/62, `tsc`
  클린.

이제 전체 순환은: 시그널 → 이슈(detected) → 아고라 숙의 → 제안(초안,
이슈는 pending_vote) → 토론(24시간 soak) → 투표(48시간) → 가결/부결 →
이슈 해결 / 재논의 복귀입니다. 인간 주권은 모든 단계에서 유지됩니다:
제안은 홀더가 개입할 수 있는 토론 단계를 거치고, 투표는 행사되면
집계되며, 무투표 수동적 승인은 에이전트 권고·시뮬레이션 표시 액션에만
적용됩니다.

---

## 최근 작업: 자동 배포의 pm2 설정 전염 수정 (2026-08-05)

첫 실제 자동 배포 직후부터 prod `algora-api`가 약 2.5시간(05:26–08:03
UTC) 동안 5분마다 중지·SIGKILL당했습니다. 원인: pm2는 관리 중인
프로세스의 설정을 자식 환경변수로 평탄화하므로, `algora-deploy` 크론
프로세스(`cron_restart: '1-59/5 * * * *'`, `autorestart: false`) 안에서는
해당 키들이 실제 env 변수로 존재합니다 — 그리고 `scripts/deploy.sh`의
`pm2 restart --update-env`는 CLI의 환경을 대상 프로세스의 저장된 설정에
병합합니다. 05:21 배포에서 `algora-api`가 배포 폴러의 5분 cron_restart를
물려받았고, 이후 pm2가 매 틱마다 충실히 재시작했습니다. 서버에서 실증
검증(pm2 7.0.3): 같은 오염된 환경에서도 플래그 없는 재시작은 전염되지
않으며, `--update-env`는 `cron_restart`와 `autorestart: false`를 모두
옮깁니다. 이 진단은 수정 검토 중에 실시간으로 재현되기까지 했습니다:
서버에 아직 배포돼 있던 구버전 스크립트가 08:11 UTC에 PR #8(web 변경)을
배포하며 `algora-web`을 같은 방식으로 오염시켰습니다.

- **`--update-env` 제거** — `build_and_restart()`의 두 재시작 호출 모두에서
  제거(rollback도 같은 경로 공유). 이 플래그에 의존하는 것은 없었습니다:
  API는 부팅 시 dotenv로 `apps/api/.env`를 직접 읽고, web은 빌드 시점에
  `NEXT_PUBLIC_*`을 굽고, ecosystem env 변경은 어차피 수동 재등록이
  필요합니다(스크립트가 해당 경우 NOTE를 남김).
- **환경 스크럽.** 스크립트 서두에서 평탄화된 pm2 설정 키(`cron_restart`,
  `autorestart`, `watch`, `instances`, `exec_mode`, `max_memory_restart`,
  `node_args`, `name`, `namespace` — 형제 폴러들의 수정본인
  agentic-orchestrator PR #2949와 목록 동기화)를 `unset`하므로, 미래에
  `--update-env`가 재도입되거나 다른 env 병합형 pm2 호출이 생겨도 병합될
  독성 키 자체가 없습니다.
- **매 틱 실행되는 설정 전염 트립와이어.** `check_config_bleed()`가 매
  5분 틱마다(외부 원인 대비) 그리고 스크립트 자신의 재시작 직후(즉시
  감지) `pm2 jlist`를 파싱해, `algora-api`/`algora-web`의 cron_restart
  또는 비활성화된 autorestart(불리언/문자열 `"false"` 모두 — 전염의 나머지
  절반으로, 크래시 복구를 조용히 꺼버리는 축)를 감지합니다. 실패 시
  열림(fail-open — 검사 고장이 배포를 막으면 안 됨)이되 시끄럽게:
  `pm2 jlist`가 파싱 불가면 깨끗한 통과로 위장하지 않고 자체 WARN을
  남깁니다. 픽스처 하니스로 검증(정상 로스터, 각 전염 형태, 배너 오염
  jlist, node 부재).
- **복구 안내 교정.** ECOSYSTEM_CHANGED NOTE가 권하던 `pm2 restart
  ecosystem.config.cjs --update-env && pm2 save`는 오염된 키를 지울 수
  없고(pm2는 병합만 하고 제거하지 않음 — 7.0.3에선 명시적
  `--cron-restart 0`도 실패), 뒤따르는 `pm2 save`는 오염을 재부팅 후까지
  영속화했을 것입니다. NOTE와 트립와이어 WARNING 모두 유일하게 신뢰할 수
  있는 형태를 안내합니다:
  `pm2 delete <app> && pm2 start ecosystem.config.cjs --only <app> && pm2 save`.
- **알림 웹훅 등록 강화.** `ecosystem.config.cjs`가 루트 `.env`에서
  `DEPLOY_ALERT_WEBHOOK`을 읽습니다(`ALGORA_AUTO_DEPLOY` 게이트와 같은
  최소 파싱). 웹훅 설정이 폴러를 등록한 셸에 변수가 export돼 있었는지에
  더 이상 좌우되지 않습니다. (서버에 웹훅은 아직 미설정 — 설정 전까지
  알림은 로그 전용입니다.)
- **서버 상태 정리:** `algora-api`와 `algora-web`을 delete 후
  `ecosystem.config.cjs`에서 재등록(새 pm2 id 44/47, 로그는
  `api-*-44.log`/`web-*-47.log`로 회전), `pm2 save` 재실행. cron 없음,
  `autorestart: true` 유지, 이후 폴러 틱을 넘겨도 정상임을 확인했습니다.
- **같은 서버의 타 프로젝트에도 같은 병:** pm2 로그에서 형제 프로젝트
  앱들(예: `oracle-web`)이 :00초에 크론 재시작되는 증상이 보입니다 — 이
  스크립트의 원본인 moss-ao 계열 배포 폴러들도 같은 `--update-env` 버그를
  가진 것으로 보입니다. 각자 리포지토리에서 처리하도록 표시(여기 범위
  밖).

---

## 최근 작업: 무의미한 거버넌스 제안 감지 수정 (2026-08-05)

L1 이슈 감지 서비스의 키워드 패턴 조건이 `${signal.description}
${signal.source}`를 대상으로 평가되어, *소스 이름*에 패턴 키워드가 포함된
시그널은 내용과 무관하게 조건을 만족했습니다. 시드된 소스
`github:ethereum/EIPs`(카테고리 `protocol`)는 `EIP`를 포함하므로 해당
레포의 모든 하우스키핑 이벤트(`eth-bot performed IssueCommentEvent`, 7일간
~630개 시그널)가 `governance-proposal` 패턴에 완전 매치 — 프로덕션에 **정크
`[New Governance Proposal]` 이슈 616개**, 플러딩 중복 방지 수정 이후에도
하루 ~8개씩 생성되고 있었습니다. 프로덕션의 키워드성 이름을 가진 소셜
소스(`HN Governance`, `Uniswap Governance`)도 같은 노출이 있었습니다.

- **키워드 대상 = description만.** `evaluateCondition`이 키워드 매칭에
  `signal.source`를 더 이상 포함하지 않습니다. 소스 매칭은 전용 `source`
  조건 타입의 역할입니다(`fear-extreme`, `mossland-update`가 의도적으로
  사용). 이로써 키워드성 이름의 소스도 이름 변경 없이 무해화됩니다.
- **봇 severity 하한.** GitHub 수집기에서 봇 액터(`*[bot]` 접미사,
  `eth-bot`, `dependabot`, `renovate`)의 이벤트는 `formatEvent`에서
  severity가 `low`로 고정됩니다 — 활동 피드에는 남되 severity 게이트가 있는
  감지 패턴을 더 이상 격상시키지 못합니다.
- **단위 테스트.** 새 `apps/api/src/services/issue-detection.test.ts`가
  실제 패턴 설정(`IssueDetectionService.PATTERNS`, 이제 static)을 대상으로
  `matchPattern`/`evaluateCondition`을 검증합니다: EIPs 봇 코멘트 회귀,
  진짜 양성(실제 EIP/거버넌스 내용은 여전히 매치), 카테고리 게이트,
  source 조건 동작, 봇 severity 하한.
- 검증: 신규 테스트 10개, api 전체 스위트 54/54, `tsc` 빌드 클린.

---

## 최근 작업: API 크래시 루프 수정 (2026-08-05)

prod `algora-api`가 2026-08-04 하루에 ~57회 크래시했고, 매번 동일한 스택
(`AgoraService.addMessage`의 `SqliteError: FOREIGN KEY constraint failed`,
`handleRoundTimeout` 경유)이었습니다. 원인 체인: 오케스트레이터가 라운드 요약
메시지를 `bridge-moderator`(`ORCHESTRATOR_CONFIG.orchestratorAgentId`) 명의로
삽입하는데, `seedAgents()`가 수동 `pnpm db:init`에서만 실행돼 prod의
`agents` 테이블은 `bridge-moderator` 이전의 구버전 로스터에 머물러 있었음 →
FK 실패 → catch 없는 `setInterval(() => checkTimeouts())`에서 unhandled
rejection → Node 22가 프로세스 종료 → pm2 재시작. (2026-08-05 03:09 UTC에
로스터가 수동 재시드되면서 크래시는 멈춘 상태.) 적용한 하드닝:

- **세션 타이머 가드.** 30초 타임아웃 체커 인터벌이 rejection을 catch해
  로그로 남기고, 3회 연속 실패 시 세션을 강제 완료하고 타이머를 중지합니다
  (지속 실패가 LLM을 호출하는 타임아웃 핸들러를 30초마다 무한 재실행하면 안
  되므로). 라운드 타이머는 핸들러 본문 이전에 리셋해, 중간 실패가 다음 틱에
  같은 라운드 요약을 중복 게시하지 못하게 했습니다.
- **부팅 시 로스터 시딩.** `seedAgents(db)`가 매 API 기동 시 targeted
  upsert(`ON CONFLICT(id) DO UPDATE`, 정의 컬럼만 갱신)로 실행돼 DB 로스터가
  코드 로스터를 따라가되, 운영자 관리 컬럼(`is_active`, `expertise`,
  `avatar_url`, `created_at`)은 재시작에도 보존됩니다.
- **프로세스 레벨 핸들러.** `unhandledRejection` → 로그 + 서비스 지속;
  `uncaughtException` → 로그 + exit(1)로 마커를 남기고 pm2 재시작.
- 검증: tsc 빌드 + 테스트 44/44; 적대적 멀티에이전트 리뷰(11개 에이전트)가
  초안의 실제 문제 2건(REPLACE 시딩의 운영 컬럼 클로버링, catch가 크래시를
  무한 30초 LLM 재시도 루프로 바꾸는 문제)을 확인 — 위와 같이 모두 수정.

---

## 최근 작업: 이슈 플러딩 정리 + 라이프사이클 수정 (2026-08-05)

L1 이슈 감지 서비스가 프로덕션에 **영구히 열려 있는 이슈 4,956개**를
누적시켰고(2026-06-17부터 하루 ~100–200개), 그 부작용으로 **Agora LLM 토론
세션 2,163개**가 자동 생성되었습니다(토큰 비용). 근본 원인 세 가지: 이슈를
닫는 코드 경로가 아예 없었고; threshold 알림 중복 체크가 와일드카드
임계값에 대해 `category = '%'` 등호 비교(절대 매치 안 됨)를 사용했으며;
패턴 중복 방지가 pm2 재시작마다 리셋되는 인메모리 쿨다운에만 의존했습니다
(algora-api는 자주 재시작됨).

- **Threshold 알림 중복 체크 수정.** 깨진 category 비교 대신, 같은 임계값의
  이슈가 열려 있고 최근(제목 접두사 매치, 6시간 re-arm 바운드)인 동안만
  알림을 건너뜁니다 — 이 바운드 덕분에 오래된 open 알림 하나가 새로운 별개
  급증을 무한정 억누르지 못합니다.
- **패턴 이슈 중복 방지.** 같은 패턴의 최근 이슈가 열려 있는 동안(re-arm
  윈도우: critical/high 6시간, medium/low 24시간) 새 매치는 새 이슈 대신
  기존 이슈에 병합됩니다 — `issue_signals`, 비정규화된 `signal_ids` 컬럼(웹
  UI 시그널 카운트, pipeline-health, orchestrator bridge가 직접 읽음),
  `updated_at` 갱신 + `issue:updated` 이벤트 발행. 중복 Agora 세션과 문서
  생성도 함께 차단됩니다.
- **자동 만료 janitor.** 2분 감지 사이클마다 `updated_at` 기준으로
  `ISSUE_AUTO_EXPIRE_DAYS`(기본 7일) 동안 변화 없는 `detected`/`confirmed`
  이슈를 dismiss합니다; `in_progress`는 3배 horizon을 갖고, 거버넌스 진행
  상태(`pending_vote`, `approved_for_action` 등)는 절대 자동 만료되지
  않습니다. 명시적 `0`만 비활성화하며, 빈 값/잘못된 값은 경고와 함께 7일로
  폴백해 설정 오타가 조용히 janitor를 끄지 못합니다. dismiss마다
  `issue:updated`를 발행하고 `ISSUE_AUTO_EXPIRED`로 기록합니다.
- **통계 수정.** `/api/stats`의 `openIssues`가 존재하지 않는 `'open'` 상태를
  세고 있었음; 이제 `detected`/`confirmed`/`in_progress`를 셉니다.
- **일회성 프로덕션 정리.** `algora.db` 온라인 백업
  (`data/algora.db.backup-issues-cleanup-20260805`) 후, 7일 초과 이슈
  4,094개 + 최근 중복 852개를 dismiss → **10개만 open으로 유지**(패턴/알림
  그룹별 최신 1건).
- 검증: `apps/api` tsc 빌드 통과(워크스페이스 8개 패키지 전체), 테스트 44/44
  통과; 적대적 멀티에이전트 리뷰(13개 에이전트)가 7건을 확인(별개 사건을
  삼키는 dedup, 진행 중 거버넌스를 dismiss하는 janitor, `signal_ids` 불일치,
  env 파싱 함정) — 위의 re-arm 바운드, `updated_at` 기준 staleness + 상태
  스코핑, `signal_ids` 동기화, 엄격한 env 파싱으로 모두 해소.

---

## 최근 작업: 페이지별 SEO 메타데이터 + PWA 마무리 (2026-06-29)

웹 앱의 메타데이터 기본 사항(favicon, title, OG, Twitter, manifest, robots,
sitemap)을 점검한 결과 모두 정상이었습니다. 유일한 실제 갭: 모든 하위 페이지가
클라이언트 컴포넌트라서 인덱싱 대상 로케일 URL ~39개가 홈페이지의 단일
title/description을 그대로 상속했고 `%s · Algora` 템플릿은 사실상 죽은 코드였습니다.

- **페이지별 메타데이터.** 15개 하위 페이지(`issues/[id]` 포함)를 각각
  `generateMetadata`를 내보내는 얇은 서버 `page.tsx`(신규 `apps/web/src/lib/seo.ts`)와
  원본 클라이언트 컴포넌트를 렌더링하는 `*View.tsx`(바이트 동일 — 내용 변경 없음)로
  분리했습니다. 공개 라우트는 로케일별 제목(`Navigation` 라벨 재사용), 섹션
  설명(`<Namespace>.subtitle` 재사용), 자기 참조 canonical, `<head>` 내 hreflang
  대체 링크를 갖고, `admin`/`profile`은 `noindex`를 갖습니다.
- **PWA / 소셜 마무리.** `theme-color`를 라이트/다크 대응으로 변경; Twitter 이미지에
  `alt` 추가; manifest `orientation`을 `any`로 완화; 굵은 `any` 아이콘과 분리한
  전체 화면(full-bleed) 마스커블 아이콘 변형(192/512) 추가.
- 검증: `apps/web` 타입체크 + 프로덕션 빌드 통과, 린트 클린; curl로 en/ko/ja/zh
  전반의 로케일별 제목/설명/canonical/hreflang, admin의 `noindex`, 하위 페이지의
  og:image 절대 경로 유지를 확인; 적대적 멀티에이전트 리뷰에서 blocker 없음.

---

## 최근 작업: 쓰기 경로 하드닝 + 정직한 목업 라벨링 (2026-06-27)

지갑 연결과 EIP-712 서명 계층은 실제로 동작하지만, MOC 잔액·투표파워·트레저리는
시뮬레이션된 데모 데이터입니다(목업 잔액 = 지갑 주소 해시; 트레저리
allocate/approve/disburse는 온체인 전송 없는 SQLite 상태 변경). 두 가지 변경을
함께 적용했습니다:

- **공개 쓰기 제어 평면 차단.** 인증 없이 접근 가능하던 15개 라우터의 운영용 쓰기
  엔드포인트 ~40개를 `requireAdmin`으로 보호했습니다. 라이브 쇼케이스가 의존하는
  공개 인터랙티브 엔드포인트(지갑 검증, 토큰 투표, 에이전트 소환/해제, Agora 세션
  생성/메시지, 알림 확인)는 공개로 유지하되 `writeLimiter`로 레이트리밋을 적용했습니다.
- **투표는 이제 지갑 서명 필요.** `POST /api/token/voting/:proposalId/vote`는 유효한
  EIP-712 서명을 요구합니다(위조·재전송 방지). `GET /api/token/voting/:proposalId/typed-data`
  엔드포인트와 프론트엔드 서명을 추가했습니다.
- **위임도 이제 지갑 서명 필요.** 생성/취소를 admin 키에서 공개+서명 방식으로 전환
  (EIP-712 `Delegation`, 1회용 nonce; 취소는 위임자 소유권도 검증). 연결된 홀더는
  위임할 수 있게 하면서 위조는 차단합니다.
- **정직한 라벨링.** 15개 컴포넌트에 `MockDataBadge`를 노출해 시뮬레이션된 금액을
  명확히 표시했습니다(실제 온체인 ETH 잔액은 라벨 미부착).
- **데모 수정.** 공개 Tier-1 번역 토글 복구(`requireAuth` 제거, `llmLimiter` 유지);
  decision-packet "Generate Analysis"의 거짓 성공 토스트 수정(admin 게이트 실패 시
  정직한 에러 표시).
- 검증: `apps/api` 타입체크 통과 + 테스트 44개 통과; `apps/web` 타입체크 통과;
  적대적 멀티에이전트 리뷰(게이팅·EIP-712 흐름·회귀)에서 blocker/major 없음.
- 다음: 거버넌스 쓰기에서 공유 admin 키를 대체할 네이티브 SIWE 사용자별 세션(WS-1).

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

### Phase 11: Shadcn UI 통합 및 모바일 반응형 (완료)
- [x] **Shadcn UI (Radix UI) 컴포넌트 라이브러리**
  - [x] 14개 기본 컴포넌트: Button, Card, Dialog, Sheet, DropdownMenu, Tooltip, Tabs, Badge, Command, ScrollArea, Avatar, Separator, Popover, Toast
  - [x] CVA (class-variance-authority) 컴포넌트 변형
  - [x] Tailwind CSS 변수 테마를 agora 브랜드 색상에 매핑
  - [x] `tailwindcss-animate` 플러그인 통합
  - [x] `components.json` Shadcn 설정 (New York 스타일)
- [x] **레이아웃 마이그레이션**
  - [x] MobileNav → Shadcn Sheet (향상된 애니메이션, 접근성)
  - [x] Header → 모바일 상태 표시를 위한 Shadcn Tooltips
  - [x] GlobalSearch → Shadcn CommandDialog (cmdk 기반 커맨드 팔레트)
  - [x] AlertDropdown → Shadcn Popover + ScrollArea
- [x] **컴포넌트 마이그레이션**
  - [x] AccessibleModal → Shadcn Dialog 래퍼 (동일한 외부 API 유지)
  - [x] AccessibleDropdown → Shadcn DropdownMenu 래퍼
  - [x] HelpTooltip → 자체 TooltipProvider를 포함한 Shadcn Tooltip
  - [x] StatsCard/AnimatedCard → 다크 모드 지원, 반응형 패딩
- [x] **페이지 수준 반응형 개선**
  - [x] 대시보드: 모바일 2x2 통계 그리드, Card+ScrollArea 활동 피드
  - [x] 아고라: 모바일 Sheet 사이드바, iOS safe-area 입력 지원
- [x] **i18n 업데이트**
  - [x] Search 네임스페이스 추가 (EN/KO)
  - [x] Activity.types.PIPELINE 추가 (EN/KO)
- [x] **접근성**
  - [x] CommandDialog용 DialogTitle (스크린 리더 지원)
  - [x] 모바일 최소 터치 영역 44px
  - [x] Radix 프리미티브를 통한 키보드 네비게이션

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

### Phase 10.6: 운영 데이터 분석 및 개선 (완료)

13일간의 프로덕션 데이터 기준 (2026-01-09 ~ 2026-01-21):

#### 데이터 분석 결과
- **activity_log**: 129,974 레코드 (~10,000/일)
- **agent_chatter**: 32,900 레코드 (~2,500/일)
- **agora_messages**: 21,983 레코드 (~1,700/일)
- **signals**: 14,935 레코드 (~1,150/일)
- **데이터베이스 크기**: 141MB (정리 없이 연간 ~4GB 예상)

#### LLM 비용 추적 (P0) - 완료
- [x] `apps/api/src/index.ts`에 `generation` 이벤트 리스너 추가
- [x] 모든 LLM 호출을 `budget_usage` 테이블에 기록
- [x] provider, tier, 토큰, 예상 비용 추적
- [x] provider/tier/date/hour 기준 집계를 위한 Upsert 패턴

#### Ollama 타임아웃 최적화 (P0) - 완료
- [x] qwen2.5:32b 같은 대형 모델을 위해 타임아웃을 60초에서 120초로 증가
- [x] 하이브리드 모델 전략 검증:
  - Chatter는 `complexity: 'fast'` 사용 → `llama3.2:3b`
  - Agora는 `complexity: 'balanced'` 사용 → `qwen2.5:32b`

#### 데이터 보존 서비스 (P1) - 완료
- [x] 새 서비스: `apps/api/src/services/data-retention.ts`
- [x] 표준 30일 보존 정책:
  - `activity_log`: 30일 (HEARTBEAT: 7일)
  - `agent_chatter`: 90일
  - `signals`: 90일
  - `agora_messages`, `issues`, `proposals`, `votes`: **영구** (거버넌스 기록)
  - `budget_usage`: 365일
- [x] 스케줄러 통합 (매일 03:00)
- [x] `triggerDataCleanup()`으로 수동 정리 트리거

#### 모니터링 API 확장 (P2) - 완료
- [x] `GET /api/stats/llm-usage` - tier/provider별 LLM 사용량, Tier 1 비율, 비용
- [x] `GET /api/stats/data-growth` - 행 수, 일일 평균, 성장 추세
- [x] `GET /api/stats/system-health` - 헬스 점수, 오류 수, 예산 상태

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
