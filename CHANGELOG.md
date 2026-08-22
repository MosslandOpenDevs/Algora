# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Security
- **Log inspection APIs are admin-only and fail closed** — every `/api/logs/*`
  route now passes through the shared `requireAdmin` guard, including stats,
  file listings, recent entries, search, error summaries, disk usage, and
  cleanup. Sensitive responses are marked `Cache-Control: no-store`; pagination
  inputs are validated and capped; and recent-file reads are limited to
  enumerated regular `.log` files so non-log files and symlinks are rejected.
- **Tier 2 (paid LLM APIs) made safe to enable** — four failures were waiting behind the flag: the hard-coded `claude-3-haiku-20240307` retired 2026-04-19 (model ids are now env-configurable per provider); the budget guard priced **output tokens only** at a flat rate, so with deliberation's ~7:1 input:output ratio a nominal $10/day ceiling was really $25–41/day (input tokens are now reported by each provider and billed, with env-configurable per-token rates that also apply to existing deployments whose `INSERT OR IGNORE` seed had frozen them); a Tier-2 failure threw rather than falling back to Ollama, and Agora turns a throw into a hard-coded template sentence stored as a real agent statement — so an expired key or spent budget would have filled the public feed with governance-sounding text no model produced (Tier-2 requests now degrade to the local model; a failed Tier-1 request throws instead of returning empty content that callers swallow); and a global flag would have routed the wrong calls, since 7 of 8 deliberation call sites hard-code `tier: 1` while the router classifier sends 83.5% of debate turns to `critical` on bare substring matches — routing is now per-call-site via `AGORA_SYNTHESIS_TIER`, covering only the three synthesis calls (~143/day). `ecosystem.config.cjs` also stopped pinning `LLM_DISABLE_TIER2` and the API keys to empty strings, which would have silently defeated a key placed in `apps/api/.env` (pm2 applies that block last and dotenv never overwrites a defined variable).
- **Wallet-verification nonces now actually expire in 15 minutes** — the nonce lookup compared the ISO-`'T'` `expires_at` against SQLite's space-separated `datetime('now')`, and `'T'` (0x54) sorts after `' '` (0x20), so any nonce issued earlier the same UTC day still compared as unexpired. The 15-minute signature-replay window silently stretched to end-of-day. The same mis-comparison also kept ended token votings counted as active and expired delegations counted as live.
- **Closed the public write control plane** — ~40 previously-unauthenticated operational write endpoints across 15 routers now require `requireAdmin` (`x-admin-key` / Bearer): collector source management (also an SSRF vector), signal/issue injection, Agora session orchestration, treasury allocate/approve/disburse + transactions + limits, token snapshots, voting initialize/finalize, RAG indexing/wipe, disclosure publishing, alert deletion, KPI snapshot/cache-clear/thermal config, pipeline retry/backfill/escalation-resolve, quality-log purge, log-file cleanup.
- **Vote forgery & replay blocked** — `POST /api/token/voting/:proposalId/vote` now requires a valid EIP-712 wallet signature that recovers to the claimed `walletAddress` with a single-use nonce (added `GET /api/token/voting/:proposalId/typed-data`; mirrors the existing `proposals.ts` signature flow). The frontend now signs each vote via wagmi `useSignTypedData`.
- **Delegation is now wallet-signed** — `POST /api/proposals/delegation` and `DELETE /api/proposals/delegation/:id` moved off the shared admin key to public-but-signed: each requires an EIP-712 `Delegation` signature from the delegator (single-use nonce, per-flow domain), and revoke additionally enforces server-side delegator ownership. Added `GET /api/proposals/delegation/typed-data`; `DelegationModal` and the profile revoke now sign via wagmi. This makes delegation work for any connected holder while making it forgery-proof.
- **Rate-limiting on public interactive endpoints** — wallet verify/refresh, token vote, delegation create/revoke (+ its typed-data), agent summon/dismiss, Agora session create/message, and alert acknowledge are kept public (the live showcase needs them) but now sit behind `writeLimiter` (20 writes/min/IP) to throttle spam/abuse.

### Changed
- **Shared Ollama context coordination** — raised the reference
  `LOCAL_LLM_NUM_CTX` from 8192 to 16384 and aligned every client using the
  same model after controlled tests confirmed that different per-call context
  sizes replace the resident runner. A divergent override was removed and
  regression coverage added. Live endpoints, host and tenant identities, raw
  timings, and capacity figures are kept in private operations records.
- **Honest "simulated data" labeling** — surfaced the existing `MockDataBadge` across 15 components so demo (non-on-chain) money is clearly marked: a persistent banner over the treasury stats grid plus inline badges on profile/wallet balance + voting-power tiles, the vote power breakdown, proposal & dual-house tallies, and allocation/transaction cards. The real on-chain ETH balance (wagmi `useBalance`) is intentionally left unbadged.
- **Live-showcase translation toggle restored** — the Tier-1 (local Ollama) `/governance-os/translate[/batch]` routes dropped `requireAuth` (kept `llmLimiter`) so the public 한글/EN toggle works for anonymous visitors again.
- **Per-page SEO metadata** — every locale sub-page is now a thin Server wrapper that emits a localized `<title>` (through the `%s · Algora` template), a per-section description, a self-referential canonical, and in-`<head>` `hreflang` alternates (a new `apps/web/src/lib/seo.ts` reuses the existing `Navigation`/`subtitle` i18n catalogs). `admin`/`profile` additionally emit `robots: noindex`. The browser `theme-color` is now light/dark-aware, the Twitter card image carries `alt` text, and the PWA manifest relaxes `orientation` to `any` and ships dedicated full-bleed maskable icon variants (192/512).

### Added
- **Shared-host parallelism tuned** — chose reference
  `OLLAMA_NUM_PARALLEL=2` from controlled, normalized measurements (about
  `1.6x` aggregate throughput at `1.03x` resident memory versus the
  single-slot baseline). Distinct models can use separate runners when
  capacity permits, and concurrency tests are bracketed by single-request
  controls. The generalized method is documented in
  `docs/ollama-shared-host-tuning.md`; host-specific workloads, topology,
  timings, and absolute capacity are intentionally omitted.
- **Issue auto-expiry janitor** — every detection cycle now auto-dismisses open (`detected`/`confirmed`) issues untouched for `ISSUE_AUTO_EXPIRE_DAYS` (default 7; explicit `0` disables, empty/invalid falls back to 7 with a warning). Staleness is keyed on last touch (`updated_at`), `in_progress` issues get a 3x horizon, and mid-governance statuses (`pending_vote`, `approved_for_action`, `needs_manual_review`, ...) are never auto-expired, so live governance work is not dismissed mid-flight. Each dismissal emits `issue:updated`. A one-time prod cleanup dismissed the 4,946 stale/duplicate open issues that had accumulated since mid-June (online backup kept on the server).
- **Mossland ecosystem wayfinding bar** — Algora was the only sister site without an outbound ecosystem bar (bridge.moss.land and ao.moss.land already link the family; only inbound links existed here). A new `EcosystemBar` (`components/cross-link/EcosystemBar.tsx`, Server Component) mounts once in the root layout after `NpcCityStrip`, rendering the same set in the same order as the other two sites — BRIDGE (Governance OS) · **Algora** (AI Deliberation Lab, current, non-link) · MOSS.AO (Agentic Orchestrator) — which completes the three-site wayfinding loop. New `Ecosystem` i18n namespace in **all four** locales, with role copy aligned to the in-product canon (`Navigation.governance`, the layout's SEO taglines: `AI 熟議ラボ` / `AI 审议实验室`). Carries the accessibility pattern from MOSS.AO's pre-merge review (agentic-orchestrator PR #2950): a real space text node between site name and role so the accessible name reads "BRIDGE Governance OS" rather than "BRIDGEGovernance OS", and new-tab disclosure on the external links (aria-hidden `↗` + localized sr-only text). `rel="noopener"` per the `NpcCityStrip` precedent, so sister sites keep referrer attribution.

### Fixed
- **Passing a date range to governance analytics threw `ambiguous column name`** —
  `getGovernanceMetrics` builds one `dateFilter` fragment and interpolates it
  into two queries with different FROM clauses. It read `AND created_at BETWEEN
  ? AND ?` unqualified, which resolves against `FROM proposals` but is
  ambiguous against `FROM proposals p LEFT JOIN votes v`, since both tables
  have a `created_at`. So `/api/outcomes/analytics/governance` worked without
  dates and failed with them, and `/api/outcomes/analytics/report` — which
  always passes dates — failed outright. The fragment and both queries now
  share the `p` alias. This surfaced only after the wrong-column fixes below
  cleared the first error out of the way; it had been the second failure in the
  same request all along. It also sits exactly in the blind spot
  `db/schema-conformance.test.ts` declares — the defect is *inside* an
  interpolated fragment, whose text no static check can know — so it is covered
  the only way it can be, by `services/proof-of-outcome/analytics.test.ts`
  actually running the queries, dated and undated, and asserting the filter
  both admits and excludes.
- **Three analytics endpoints threw on every call** — the same wrong-column
  defect as the timeline, in `services/proof-of-outcome/analytics.ts`, behind
  three live routes. `/api/outcomes/analytics/agent/:id` counted
  `agora_messages.speaker_id`, where the column is `agent_id`.
  `/api/outcomes/analytics/categories` and `/api/outcomes/analytics/export`
  read `proposals.category` — but proposals have no category at all: it belongs
  to the issue they answer, reached through `issue_id`. Both now `LEFT JOIN
  issues`, which is lossless here (**all 338 proposals carry an `issue_id` and
  all 338 join**). Category analytics returns 31 buckets over 335 proposals and
  the export returns 335 rows with no null category, where all three
  previously returned nothing but a `SqliteError`. The stored category can be
  multi-valued (`security|governance`); it is grouped as written rather than
  split, so a bucket stays an exact category string — changing that is a
  product decision, not a defect.
- **The issue timeline 500'd on every issue that had a deliberation** —
  `/api/timeline/issue/:id` selected `round_count` and `completed_at` from
  `agora_sessions`. Neither column has ever existed: the table has
  `current_round` and `concluded_at`, and no migration ever created the other
  two. TypeScript could not catch it because the row type was hand-written to
  match the SQL rather than the table, so the mismatch surfaced only as a
  runtime `SqliteError` — and only in the logs, since the handler's catch
  turned it into a failed response. **2,553 of 2,554 sessions carry an
  `issue_id`**, so in practice every issue with a session had a broken
  timeline. SQLite reports only the first unknown column, so the log named
  `round_count` alone and a one-word fix would have simply moved the error to
  `completed_at`; both are corrected together. The response keys (`roundCount`,
  `completedAt`) are unchanged — they are this endpoint's published shape.
  Round counts also read "1 rounds" for the 2,212 single-round sessions, which
  is now pluralized.
- **A route's schema depended on a service constructor running first** —
  `issue_signals`, read by two timeline queries, was created only by
  `IssueDetectionService.initializeTables()`. On a fresh database the table did
  not exist until issue detection happened to run, so the canonical schema and
  the route layer disagreed about what exists. Its definition now lives in
  `createSchema()` alongside `issues`; the service's `IF NOT EXISTS` copy is
  idempotent and left in place.
- **Regression guard for all of the above** (`db/schema-conformance.test.ts`) —
  every static SQL statement in `apps/api` is now prepared against a fresh
  canonical schema, so a column that does not exist fails in CI instead of at
  request time. This generalizes the guard `activity/activity-log.test.ts`
  already applied to hand-written `activity_log` INSERTs. Verified by
  reintroducing each of the four bugs one at a time — every one fails the
  guard, and all four fixed passes it. Two blind spots are counted and
  reported rather than silently skipped, so they stay visible: statements
  assembled with `${}` interpolation cannot be prepared ahead of time, and
  columns on tables that a service creates for itself rather than
  `createSchema()` cannot be checked against a schema that does not declare
  them (138 such statements today — a known pattern, not a defect, and
  deliberately not turned into a schema refactor).
- **RAG embedding model pointed at a model the host does not have** — the API's
  RAG service defaulted to `qwen3-embedding:0.6b`, which returns
  `HTTP 404 model not found` on the shared Ollama host; the model actually
  present there is `nomic-embed-text`. The mismatch stayed invisible because the
  startup availability probe accepted **any** model whose name merely contained
  `"embed"`, so a co-tenant's unrelated embedding model satisfied it: production
  logged `[RAG] Service available with model: qwen3-embedding:0.6b` and
  `/api/rag/status` reported `available: true`, while every `/api/embeddings`
  call would have 404'd at index time. Because `indexDocument()` stores the
  document even when embedding fails, each indexed document would have been
  written with a `NULL` vector — permanently invisible to semantic search, and
  distinguishable only by the `documentsIndexedWithoutEmbedding` counter. Only
  the zero documents indexed so far kept this latent (`documentsIndexed: 0`).
  The default is now `nomic-embed-text` (verified against the host: `HTTP 200`,
  **768** dimensions, over the same legacy `/api/embeddings` endpoint the
  service uses), and the availability probe now requires the **configured**
  model to be present, resolving a bare name to its `:latest` tag the way Ollama
  does and naming the models the host does have when it fails. Loading the
  embedding model was confirmed not to disturb the single-resident-chat-model
  convention: `gemma3:4b @ num_ctx 16384` stayed resident alongside it
  (2.98GB + 0.32GB). `@algora/model-router`'s registry, task-type mapping,
  default embedding model, install command and VRAM table were realigned to the
  same model — note its embedding path is mock-backed
  (`MockEmbeddingProvider`), so the API's RAG service was the only live caller.
- **`/api/rag/status` reported a hard-coded embedding width** — `embeddingDimensions`
  was a constant that no code path consumed, so it stayed at its default no
  matter which model `RAG_EMBEDDING_MODEL` selected: the same class of confident
  falsehood as the availability flag above. It is now re-stamped from the length
  of the first real embedding, so the status endpoint reports the model's actual
  width.
- **Setup docs told newcomers to install models that are wrong or do not exist** —
  `README`, `ALGORA_PROJECT_SPEC` (both languages), `ARCHITECTURE` (both
  languages) and `CLAUDE.md` still described the pre-consolidation model set.
  Following them produced a broken install three ways: `ollama pull llama3.2:8b`
  is a tag that does not exist (`HTTP 404` from the Ollama registry — Llama 3.2
  ships 1B/3B); the recommended 24B–72B models are far past what the deployment
  targets and are not what any code path requests; and **no embedding model was
  mentioned at all**, so RAG could not work for anyone who followed the guide.
  The docs now describe the two models actually deployed (`gemma3:4b`,
  `nomic-embed-text`), state why Tier 1 routes everything to one chat model, and
  spell out the two ways to break a shared host — varying the model or its
  context per task, and naming a model the host has not pulled.
- **Undocumented and phantom LLM environment variables** — `LOCAL_LLM_MODEL_CHATTER`
  and `LOCAL_LLM_MODEL_ENHANCED` are read by `@algora/orchestrator` and
  `@algora/governance-os` but were absent from `.env.example`, while the specs
  told operators to set them to models the deployment does not run.
  `LOCAL_LLM_MODEL_FALLBACK` was documented in both specs and read by nothing at
  all. The two real variables are now in `.env.example`, the phantom one is
  gone, and `OLLAMA_NUM_CTX` is documented next to `LOCAL_LLM_NUM_CTX` — two
  packages read the same coordination value under those two names, so
  overriding only one silently desyncs the resident runner.
- **Signal collectors are no longer restarted every 30 seconds, forever** — the collector health check judged liveness by counting rows the collector had written to the `signals` table in the past 5 minutes, but signals are deduplicated on insert (a healthy fetch usually writes zero rows) and configured fetch intervals run 15–120 minutes, so every collector read as permanently dead. Each 30s tick restarted it; each restart's `start()` kicked off an immediate sweep of all sources, so the configured interval timers never lived long enough to fire and sources were polled ~17× more often than configured — production had accumulated **65k–128k restarts per collector**, CoinGecko was answering `HTTP 429` around the clock, and a third of the activity feed was restart log spam. Liveness is now read from the source tables' `last_fetched` (stamped on every successful fetch, deduped or not) against a window derived from each collector's own slowest configured interval (2 cycles, floored at 10 min, capped at 6 h), a never-fetched collector measures from service start so cold boots get the same grace, and a restart already waiting on its backoff can't be queued again by the next tick. The backoff exponent also derived from the lifetime restart count, so `2^128k` overflowed to `Infinity` and every backoff clamped to the 5-minute max; it now escalates per restart-since-last-success with a capped exponent, and restart counts inflated past 10,000 by the loop era are shed once on load. The `/api/pipeline/alerts` endpoint had its own independent flat 5-minute staleness window with the same false-positive problem — it now reads the same per-collector verdict from the service (`getStaleness()`).
- **`completedLast24h` in pipeline health was always 0** — the normal `completeSession()` path never stamped `concluded_at` (only the timeout and stale-sweep paths did, via `COALESCE`), while the health stage counts completions by that column; production showed 19 sessions completed in 24h and `completedLast24h: 0`. The normal path now stamps it the same way.
- **Deliberation output was being thrown away by our own constants** — `extractActionItems` ran at `maxTokens: 500`, truncating the JSON array mid-structure on larger sessions so the regex found no match and the function returned `[]` **with no log line** (prod: 66 round-advance events, 47 success lines, 0 failure lines — a 29–46% silent loss); `cleanResponse()` cut 45.6% of agent statements mid-word at 500 chars although the model stops naturally at ~80 tokens / 396–663 chars; and `generateRoundSummary` was running within 9 tokens of its 400 cap. Raised to 1000 / 800 (sentence-boundary) / 600, and the silent no-match branch now warns. Measured against the real system, none of this was a model or context limit: the largest possible prompt is 4,497 tokens against an 8,192 window, every path is hard-windowed, and production has logged zero context-saturation warnings.
- **Agents no longer talk to themselves or cite documents that do not exist** — speaker selection was uniform random, letting one agent take up to 5 slots in a round (39.2% of round-slots had a repeat); `pickSpeaker()` now excludes recent speakers. Separately, 16% of statements cited invented references ("Section 3.2.1 of Document Gamma-7"), which propagated into decision packets: the Docs Librarian persona asked for "quotes documentation standards" while no documents are in context, so the persona is reworded and the system prompt forbids inventing document, section or protocol identifiers.
- **Document validation no longer eats proposals** — `integrateWithGovernanceOS()` created a Decision Packet document and called `handleAgoraSessionCompleted()` (which updates the issue and creates the proposal) inside one try/catch, with the document's `summary` set to the raw LLM `recommendation`; past the registry's 500-character limit `create()` threw and the proposal was lost — and **12 of 23 decision packets on prod (52%) exceed it**. The failure was invisible because `console.error` goes to the stderr log, not the one carrying every other orchestrator line. Document creation is now isolated in its own try/catch (governance advances without the record), and new `clampTitle`/`clampSummary` helpers — owned by `@algora/document-registry` and exposed as `DocumentManager` methods so they read the same config the validator enforces — are applied at all 14 title/summary sites, handling the **minimum** lengths that hand-rolled `.substring(0, 500)` ignored (`minSummaryLength` is 50, so a 46-character generated summary failed just as a long one did). Adversarial review surfaced two more instances of the same class, both fixed: the governance pipeline's `createDocument` adapter silently discarded the caller's summary and substituted the title (dropping the pipeline's only document for any issue title under 33 characters, into a metadata key nothing reads), and all seven workflow document fallbacks were under 50 characters.
- **Zombie Agora sessions and the ISO-`'T'` timestamp trap, codebase-wide** — most timestamp columns are written from JS as `new Date().toISOString()` (`'T'` separator) but were compared against SQLite's `datetime('now', ...)` (space separator); as a plain string comparison `'T'` (0x54) sorts after `' '` (0x20), so any row sharing the cutoff's date compared as *greater* regardless of its time. Consequences found in production: the stale-session sweeper matched **nothing** until the UTC date rolled over, so orphaned deliberations piled up all day (5 sitting idle 8–21h at audit time) and were then closed 72-at-once just after midnight; dashboard windows over-counted (3,547 reported vs 2,404 real signals/24h); the proposal queue's gates lagged up to ~24h per stage. Fixed with a documented `utils/time.ts` helper (`isoAgo`/`isoNow`/`isoMinutesAgo`/…) producing ISO bounds that compare correctly *and* keep index usage, applied to every affected site (signal & activity stats, pipeline health, issue detection, proposal stats, Agora sweep, token/delegation expiry); columns genuinely written by `DEFAULT CURRENT_TIMESTAMP` were verified and left comparing against `datetime('now')`. Regression tests pin the failure mode itself.
- **Hourly maintenance no longer skipped by restarts** — the proposal queue and Agora stale-session jobs ran on a bare `setInterval`, so every auto-deploy restart bought a full hour with no maintenance; with deploys landing under an hour apart those jobs would effectively never run. Both now also fire once ~3 minutes after boot, which matters most for the stale sweep since a restart is exactly what orphans in-flight sessions.
- **Stale deliberations are salvaged instead of discarded** — `cleanupStaleSessions()` only flipped status to `'completed'`, skipping the summary, decision packet and governance integration, so a swept session was a dead end for the proposal pipeline; because in-memory round timers do not survive an API restart, that was the *normal* path — prod had 2,176 completed sessions but only 20 decision packets. A new bounded `harvestStaleSessions()` now runs first each hour and puts orphans that actually deliberated (≥5 agent messages) through the real `completeSession()` flow, and the sweep preserves harvest-eligible sessions until a 6-hour escape hatch so the bound is meaningful.
- **Local LLM prompts no longer silently truncated** — the Ollama call set `num_predict` but never `num_ctx`, so the server's tiny default applied (measured ~2048 tokens via a probe prompt on prod) and anything longer — including the ~3.4k-token final-summary prompt — was silently beheaded before the model saw it. Every tier-1 call now requests `num_ctx` explicitly (`LOCAL_LLM_NUM_CTX`, default 8192), and a saturation check WARNs when `prompt_eval_count` fills the window so an outgrown prompt surfaces in the logs instead of degrading summaries invisibly.
- **Live deliberation → governance integration reconnected** — `AgoraService` is constructed in two places, and the instance that runs all auto-spawned deliberations (inside issue-detection, built before the GovernanceOS bridge exists) never received the bridge: every session completion logged "GovernanceOS Bridge not available, skipping integration" (19× on 08-05 alone), so no DP documents, no governance pipeline, and no real-time proposal creation happened even at 95% consensus — the hourly backfill was the only proposal creator. A new `setGovernanceOSBridge()` setter on `AgoraService`, forwarded from `IssueDetection.setGovernanceOSBridge()`, wires the bridge into that instance at boot.
- **Deliberation → proposal → resolution loop closed** — the governance funnel dead-ended before any issue could reach `resolved`: `resolveCompletedVotings()` (voting → passed/rejected plus the linked issue's resolve/revert — the only path that ever resolves an issue) existed with no caller and now runs as stage 3 of the hourly proposal queue; the queue's three time gates compared ISO-`'T'` timestamps against `datetime('now')`'s space-separated rendering, so a same-day expiry wasn't recognized until the date rolled over (up to ~24h lag per stage) and they now compare against JS ISO cutoffs; proposal creation now parks the linked issue in `pending_vote` (never auto-expired, reverted to `detected` on rejection) instead of leaving it `detected` and exposed to the 7-day janitor mid-pipeline; and the duplicate-proposal guard no longer counts terminal `rejected`/`cancelled` proposals, so an issue reverted "for re-discussion" can actually be re-proposed. New `governance/proposal.test.ts` (8 tests, in-memory SQLite) pins the semantics; api suite 62/62.
- **Auto-deploy state guards: a failed deploy can no longer masquerade as deployed** — `scripts/deploy.sh` used HEAD as its "what is deployed" baseline, but its `git reset --hard` advances HEAD *before* the build and health check prove the commit, so a SIGKILL/OOM/reboot mid-deploy left the poller reading "up to date" forever over a stale or broken build. The baseline is now a last-successful-deploy SHA persisted in `.git/algora-deploy/` (advanced only after the health check passes; interrupted deploys are re-run from it, and the change-classification diff spans last-good → remote so previously unshipped changes are re-included). Around that core: live build outputs (`apps/web/.next`, `apps/api/dist`, `packages/*/dist` — `pnpm build` overwrites all of them in place under the running processes) are snapshotted before each build and restored on failure, which also gives rollback a rebuild-free fast path; a commit that failed to deploy retries with exponential backoff (5m→60m cap, reset by a new commit) instead of a full build + double-restart + webhook cycle every 5 minutes; repeated-guard webhooks (dirty tree, red CI, failed SHA) are deduplicated per SHA; server-local commits now abort the deploy (`merge-base --is-ancestor` guard) instead of being silently destroyed by `reset --hard`; installs trigger on any `package.json`/`pnpm-workspace.yaml` change (not just the lockfile) and a failed build gets one install + rebuild retry to self-heal node_modules rot; the single-flight lock records its owner pid so a dead deploy's lock is reclaimed on the next tick (a live-but-hung one is flagged, never doubled); the CI gate pages `check-runs` at `per_page=100` and a CI stuck "pending" past `DEPLOY_CI_TIMEOUT_MIN` (default 30m) warns and proceeds instead of holding deploys forever; and the whole flow is wrapped in `main()` so the script surviving its own mid-run update executes already-parsed code. A new offline harness (`scripts/test-deploy.sh`, stubbed pm2/pnpm/curl against throwaway git remotes, in the style of agentic-orchestrator's `tests/test_deploy.py`) pins all of the above across 11 scenarios.
- **Global search un-broken** — `/api/search` has been returning 500 on every request (prod included): the route was written against a schema that never shipped, selecting `agents.description` (the roster schema uses persona fields) and `signals.title/summary/source_type` (a signal's headline lives in `description`, its origin in `source`). Both queries now match the real schema — agent snippets fall back `expertise` → `speaking_style` → `group_name`; signal results title on the stripped description headline with `source · category` as the snippet and severity as status.
- **Markdown handled on the remaining proposal/search surfaces** — the same generator-markdown that hit issue descriptions also flows into proposals and search, where it still showed raw syntax: the proposal detail modal rendered `proposal.summary` through a hand-rolled parser that knew `##`/`###`/lists but leaked `**bold**` literals (the governance-os bridge emits `- **[severity]**` evidence bullets), and printed the related issue's markdown description as plain pre-wrap text — both now render through the shared `MarkdownContent`; proposal cards strip markdown from their line-clamped summary; and `/api/search` snippets strip markdown server-side *before* truncating (a post-truncation strip could leave dangling `**`), via `stripMarkdown` moved to `@algora/core` (its first runtime util — web re-exports it from `lib/utils`, so existing imports are unchanged).
- **Issue descriptions now render as markdown** — L1 pattern detections generate markdown descriptions (`##` headings, `**bold**` metadata, bullet lists), but the issue detail modal and `/issues/[id]` page printed them as raw text. Both now render through a new shared theme-aware `MarkdownContent` component (react-markdown + remark-gfm + remark-breaks, the same stack the disclosure modal already used); single newlines become hard breaks GitHub-comment style, so the generator's line-per-metadata layout and legacy plain-text line breaks survive the switch from `whitespace-pre-wrap`. Issue-card previews strip markdown syntax via a new `stripMarkdown` util instead of showing `##`/`**` literals in the line-clamped preview.
- **Disclosure report content is readable in dark mode** — `DisclosureDetailModal` rendered markdown reports through its own duplicate element-styling map with hardcoded `text-slate-700`/`text-slate-600` body colors, nearly invisible on the dark theme. It now renders through the shared `MarkdownContent` component via a new `size="document"` variant that keeps report-reading typography (large ruled headings, base-size body) on theme-aware `agora-*` tokens. Unifying also fixed fenced code blocks double-padding (both `pre` and `code` carried `p-4`) and moved code/table-header boxes to `bg-agora-darker` + border so they stay visible in light mode.
- **Auto-deploy no longer poisons pm2 config** — `scripts/deploy.sh` ran `pm2 restart --update-env` from inside the pm2-managed deploy poller; pm2 flattens the calling process's config into its environment, and `--update-env` merges the CLI's environment into the target's stored config, so `algora-api` inherited the poller's `1-59/5 * * * *` cron_restart and was SIGKILLed every 5 minutes until manually re-registered — and while the fix was in review the still-deployed old script did the same to `algora-web` on the PR #8 deploy (`autorestart: false` bleeds the same way — verified empirically on pm2 7.0.3, where `--cron-restart 0` also fails to clear a poisoned cron; only delete + re-register from the ecosystem file does). Defense in depth shipped: the flag is dropped (a plain restart keeps the target's registered config, and nothing depended on the merge — the API reads `apps/api/.env` via dotenv itself, web bakes `NEXT_PUBLIC_*` at build time, ecosystem changes already require manual re-registration); the script prologue `unset`s the flattened poison keys so even a regressed `--update-env` has nothing to merge; a `check_config_bleed()` tripwire runs on every poller tick and after each restart, flagging a cron_restart or disabled autorestart on the app processes (fail-open but loud — an unparseable `pm2 jlist` logs its own WARN); the ECOSYSTEM_CHANGED NOTE's recovery advice was corrected from the merge-only `pm2 restart ... --update-env` form (which would have `pm2 save`d the poison) to delete + `--only` re-registration; and `ecosystem.config.cjs` now reads `DEPLOY_ALERT_WEBHOOK` from the root `.env` so alert delivery doesn't depend on the registering shell's exports.
- **Vacuous governance-proposal detections stopped** — keyword pattern conditions matched against `description + source`, so any signal whose *source name* contained a pattern keyword matched regardless of content: every `github:ethereum/EIPs` event (mostly `eth-bot` / `github-actions[bot]` housekeeping comments, ~630 signals per 7 days) satisfied the governance-proposal pattern via the literal `EIP` in its own source string — 616 junk `[New Governance Proposal]` issues on prod, still ~8/day after the flood-dedup fix. Keyword conditions now match the signal description only; source matching is what the dedicated `source` condition type is for (used deliberately by the fear-extreme and mossland-update patterns), which also covers prod's keyword-named social sources (`HN Governance`, `Uniswap Governance`) without renames. GitHub collector events from bot actors (`*[bot]` suffix, `eth-bot`, `dependabot`, `renovate`) are additionally severity-floored to `low` in `formatEvent` so automated housekeeping stays in the feed but can no longer escalate severity-gated patterns. New unit tests exercise `matchPattern`/`evaluateCondition` against the real pattern config (now `IssueDetectionService.PATTERNS`), including the EIPs bot-comment regression and the bot severity floor.
- **API crash loop stopped (~57 crashes/day)** — Agora round timeouts inserted the orchestrator's round-summary message as `bridge-moderator`, but prod's `agents` table still held an old roster without that id (seeding only ran on manual `pnpm db:init`), so the insert failed its FK; the error surfaced as an unhandled rejection from the unguarded session-timer `setInterval`, which kills the process under Node 22's default policy. Fix layers: the timer callback now catches, counts consecutive failures, and after 3 strikes force-completes the session and stops its timer (so a persistent failure can't silently re-run the LLM-calling handlers every 30s); the round timer resets before the handler body so a mid-flight failure can't re-post the same summary; the agent roster is re-seeded on every boot via a targeted upsert that refreshes definition columns while preserving operator-managed ones (`is_active`, `expertise`, `avatar_url`, `created_at`); and process-level handlers log-and-continue on `unhandledRejection` / log-and-exit on `uncaughtException` so any future occurrence is a clear log line instead of a silent crash loop.
- **Issue flooding stopped** — the L1 issue-detection service created issues but never closed or deduplicated them, accumulating 4,956 permanently-open issues (~100–200/day) and auto-spawning 2,163 Agora LLM debate sessions. Threshold-alert dedup compared `category = '%'` for wildcard thresholds (an equality that never matches) — it now skips while the same alert is open and recent (6h re-arm bound); pattern detections now fold new signals into the recent open issue for that pattern instead of creating a duplicate issue + Agora session + governance document, bounded by a re-arm window (6h for critical/high, 24h for medium/low) so a stale open issue cannot swallow a genuinely new event indefinitely. Merges keep the denormalized `signal_ids` column in sync (web UI signal counts, pipeline-health metrics, and the orchestrator bridge read it) and emit `issue:updated`. The dashboard `openIssues` stat no longer counts a nonexistent `'open'` status (real open set: `detected`/`confirmed`/`in_progress`).
- **Decision-packet false success** — `generateDecisionPacket` no longer swallows the admin-gated endpoint's 401/503; a failed "Generate Analysis" now surfaces an honest error toast instead of a misleading "AI analysis generated" success.
- **Duplicate sub-page titles/descriptions** — the ~39 indexable locale URLs (12 public routes × 4 locales, minus home) previously inherited the home page's single `<title>`/description because every sub-page was a Client Component; the `%s · Algora` template was effectively dead code. Each route now self-describes per locale.

### Planned
- Full integration testing
- Native SIWE per-user sessions (WS-1) to replace the shared admin key for governance writes

---

## [0.13.1] - 2026-02-01

### Added
- **Shadcn UI Component Library** - 14 Radix UI-based components (Button, Card, Dialog, Sheet, DropdownMenu, Tooltip, Tabs, Badge, Command, ScrollArea, Avatar, Separator, Popover, Toast)
- **Command Palette** - cmdk-based global search replacing custom modal
- **Sheet Navigation** - Radix Sheet for mobile sidebar (MobileNav, Agora sidebars)
- **i18n: Search namespace** (EN/KO) and `Activity.types.PIPELINE` key

### Changed
- **MobileNav** migrated to Shadcn Sheet with improved animations and accessibility
- **GlobalSearch** migrated to Shadcn CommandDialog
- **AlertDropdown** migrated to Shadcn Popover + ScrollArea
- **AccessibleModal** now wraps Shadcn Dialog (same external API preserved)
- **AccessibleDropdown** now wraps Shadcn DropdownMenu
- **HelpTooltip** migrated to Shadcn Tooltip with self-contained TooltipProvider
- **Dashboard** stats grid: 2x2 on mobile, Card+ScrollArea for activity feed
- **Agora page** full mobile rewrite: Sheet sidebars, iOS safe-area input
- **StatsCard/AnimatedCard** added dark mode support and responsive padding
- **Tailwind config** extended with Shadcn CSS variables, `tailwindcss-animate` plugin

### Fixed
- Missing `Activity.types.PIPELINE` i18n key causing console errors
- Missing `Search` i18n namespace causing 500 on Korean locale
- DialogContent accessibility warnings (missing DialogTitle)

---

## [0.13.0] - 2026-02-01

### Added
- **Governance Pipeline Automation** - Complete Agora→Proposal→Voting→Resolution flow
  - `autoProgressProposalForIssue()` in governance-os-bridge for auto-transitioning proposals
  - `autoProgressProposals()` and `resolveCompletedVotings()` in proposal service
  - Hourly proposal queue processing and 6-hourly voting resolution in scheduler
  - `POST /api/governance-os/admin/process-backlog` for bulk pipeline processing
- **Governance v2.0 Activation**
  - DP document auto-creation on Agora session completion
  - GP document auto-creation when proposals enter voting
  - Dual-house voting auto-creation for HIGH risk proposals
  - Passive consensus signaling for LOW risk proposals
- **Red Team Auto-Summon** for CRITICAL priority issues in summoning service
- **Trust Score Weighting** in Agora consensus analysis
- **Database Indexes** - 3 compound indexes for activity_log, agora_messages, signals
- **Activity Types** - `PROPOSAL_QUEUE` and `VOTING_RESOLUTION`

### Changed
- **Chatter Quality** - Rate limiting (2/hr per agent), dedup, context-aware prompts
- **LLM Routing** - Increased Tier 1 preference (fallback threshold 5s→15s)
- **Red Team in Escalation** - Auto-summon Red Team agents for extended discussions

---

## [0.12.10] - 2026-01-25

### Changed
- **Code Quality Improvements** (ESLint compliance):
  - Prefixed unused variables with underscore (`_summary`, `_reason`, `_orchestrator`, `_session`)
  - Added proper braces to switch case blocks in `github.ts` collector
  - Fixed regex escaping in `cleanResponse()` method
  - Removed unused imports in `governance-os/types.ts`
  - Removed unused imports in test files
  - Cleaned up unused variable warnings across multiple services

### Fixed
- ESLint warnings across 23 files:
  - `apps/api/src/routes/agora.ts`
  - `apps/api/src/routes/timeline.ts`
  - `apps/api/src/services/agora.ts`
  - `apps/api/src/services/chatter.ts`
  - `apps/api/src/services/collectors/blockchain.ts`
  - `apps/api/src/services/collectors/github.ts`
  - `apps/api/src/services/kpi-persistence.ts`
  - `apps/api/src/services/llm.ts`
  - `apps/api/src/services/log-monitor.ts`
  - `apps/api/src/services/passive-consensus.ts`
  - `apps/api/src/services/proof-of-outcome/analytics.ts`
  - `apps/api/src/services/summoning.ts`
  - `packages/document-registry/src/__tests__/document-registry.test.ts`
  - `packages/document-registry/src/versioning.ts`
  - `packages/governance-os/src/__tests__/e2e-pipeline.test.ts`
  - `packages/governance-os/src/governance-os.ts`
  - `packages/governance-os/src/kpi.ts`
  - `packages/governance-os/src/pipeline.ts`
  - `packages/governance-os/src/types.ts`
  - `packages/model-router/src/providers/ollama.ts`
  - `packages/orchestrator/src/__tests__/workflow-b.test.ts`
  - `packages/orchestrator/src/__tests__/workflow-e.test.ts`
  - `packages/orchestrator/src/workflows/workflow-e.ts`

---

## [0.12.9] - 2026-01-25

### Added
- **Auto-Proposal Generation from Agora Sessions** (`apps/api/src/services/governance-os-bridge.ts`):
  - `createProposalFromSession()` - Automatically creates proposals when Agora sessions complete
  - Conditions: consensus >= 70%, rounds >= 3, issue priority high/critical
  - Proposals created in `draft` status for human review
  - `categoryToProposalType()` - Maps issue categories to proposal types

- **Proposal Backfill API** (`apps/api/src/routes/governance-os.ts`):
  - `POST /api/governance-os/admin/backfill-proposals` - Backfill missing proposals from completed sessions
  - Processes sessions that completed without auto-proposal creation
  - Successfully backfilled 50 proposals from past sessions

- **Enhanced Agora-Governance Integration** (`apps/api/src/services/agora.ts`):
  - Added `totalRounds` parameter to `handleAgoraSessionCompleted()` call
  - Improved session completion flow with proposal generation

- **Issue Detail Page** (`apps/web/src/app/[locale]/issues/[id]/page.tsx`):
  - Added dynamic route for individual issue pages
  - Enables direct linking to issues (e.g., `/issues/{id}`)
  - Fixes 404 error when accessing issue links from external sites
  - Includes full issue details, progress indicator, and evidence section

### Fixed
- **Missing Proposal Generation**: Issue → Agora → Proposal pipeline was broken
  - Agora sessions completed but proposals were not auto-generated
  - 6+ days of completed sessions had no corresponding proposals
  - Root cause: `handleAgoraSessionCompleted()` created PP documents but not proposal records

---

## [0.12.8] - 2026-01-22

### Added
- **LLM Thermal Throttling System** (`apps/api/src/services/llm.ts`):
  - Configurable cooldown between Tier 1 (local LLM) calls to prevent server overheating
  - `ThermalThrottleConfig` interface with minCooldownMs, maxCallsPerMinute, dynamicCooldown, maxCooldownMs
  - Rate limiting to max 20 calls per minute (configurable)
  - Dynamic cooldown increases under heavy load (2x cooldown when > 10 calls/min)
  - `waitForCooldown()` method automatically enforces delays between calls
  - `getThermalStatus()` method for monitoring thermal state
  - `updateThermalConfig()` method for runtime configuration

- **Thermal Monitoring API** (`apps/api/src/routes/stats.ts`):
  - `GET /api/stats/thermal` - Get current thermal status:
    - lastCallTime, cooldownMs, callsInLastMinute
    - Configured limits and dynamic cooldown status
  - `PATCH /api/stats/thermal/config` - Update thermal configuration at runtime

- **i18n Admin Page Translations** (`apps/web/src/i18n/messages/`):
  - Added Navigation keys: `admin`, `timeline`, `profile` to all 4 languages
  - Added Admin section with `title`, `subtitle`, `refresh`, `systemHealth`, `llmUsage`, `dataGrowth`, `kpiTrends`
  - Updated: en.json, ko.json, ja.json, zh.json

### Changed
- **Thermal Throttling Settings Optimized for Server Cooling**:
  - minCooldownMs: 2000 → 5000 (5 seconds between calls)
  - maxCallsPerMinute: 15 → 8 (reduced call rate)
  - maxCooldownMs: 10000 → 30000 (30 seconds max cooldown)

### Fixed
- **Build Errors**:
  - Fixed Express Router type inference error in `logs.ts`
  - Fixed TokenVoteTally interface mismatch in `token.ts`
  - Fixed Chinese quotation marks breaking JSON parsing in `zh.json`
  - Fixed multiple ESLint unused variable errors across components
  - Fixed Next.js typed routes error in profile page
  - Fixed Lucide icon `title` prop error in PassiveConsensusIndicator

---

## [0.12.7] - 2026-01-21

### Added
- **LLM Cost Tracking** (`apps/api/src/index.ts`):
  - `setupLLMCostTracking()` function listening to `llmService.on('generation')` events
  - Records all LLM calls to `budget_usage` table with provider, tier, tokens, and estimated cost
  - Upsert pattern aggregates by provider/tier/date/hour for efficient querying
  - Console logging for each LLM call with cost estimate

- **Data Retention Service** (`apps/api/src/services/data-retention.ts`):
  - `DataRetentionService` class for automated data cleanup
  - Standard 30-day retention policy:
    - `activity_log`: 30 days (HEARTBEAT: 7 days)
    - `agent_chatter`: 90 days
    - `signals`: 90 days
    - `agora_messages`, `issues`, `proposals`, `votes`: **Permanent** (governance records)
    - `budget_usage`: 365 days
  - `runCleanup()` method for batch deletion with timing reports
  - `getDataSizes()` method for monitoring table row counts

- **Scheduler Data Cleanup Integration** (`apps/api/src/scheduler/index.ts`):
  - `dataCleanupHour` config option (default: 03:00)
  - `scheduleDataCleanup()` for daily automatic cleanup
  - `triggerDataCleanup()` for manual cleanup execution
  - `getRetentionConfig()` to expose retention settings
  - `dataSizes` added to scheduler status for monitoring

- **Extended Monitoring API** (`apps/api/src/routes/stats.ts`):
  - `GET /api/stats/llm-usage` - Detailed LLM usage statistics:
    - Usage by tier and provider for configurable period
    - Today's summary with Tier 1 ratio calculation
    - Total cost tracking
  - `GET /api/stats/data-growth` - Data growth trends:
    - Current row counts per table
    - Daily averages for key tables
    - Growth trend visualization data
    - Estimated database size
  - `GET /api/stats/system-health` - System health metrics:
    - Health score (0-100) based on errors, timeouts, budget
    - Error and warning counts (today vs yesterday)
    - LLM timeout tracking
    - Budget status with percentage used
    - Scheduler and data retention status

### Changed
- **Ollama Timeout** (`apps/api/src/services/llm.ts`):
  - Increased from 60 seconds to 120 seconds for large models like `qwen2.5:32b`
  - Reduces unnecessary Tier 2 fallback due to timeouts

### Fixed
- **Budget Usage Table Empty**: Previously `budget_usage` table was empty despite LLM calls
  - Root cause: `generation` event was emitted but no listener was recording it
  - Fixed by adding event listener in `index.ts` to capture and record all LLM usage

---

## [0.12.6] - 2026-01-16

### Added
- **React Server Components Migration** (`apps/web/src/`):
  - `lib/server-api.ts` - Server-side fetch utilities with 3s timeout
  - `components/dashboard/DashboardClient.tsx` - Client component for interactive features
  - Dashboard page converted to async Server Component with pre-rendered data
  - `ActivityFeed` and `AgentLobbyPreview` accept `initialData` prop for hydration

- **Performance Diagnostics** (`apps/api/src/index.ts`):
  - Server-Timing headers for performance measurement
  - Slow request logging (> 500ms) to console
  - Timing information viewable in Chrome DevTools Network tab

- **Deployment Utilities** (`deploy/`):
  - `nginx.conf.example` - Example nginx config with proxy caching
  - `warmup.sh` - Cold start mitigation script

### Changed
- **Internal API Routing**: Server-side fetch uses `localhost:3201` instead of external URL to avoid circular nginx requests
- **API_INTERNAL_URL** environment variable added to `ecosystem.config.cjs` for PM2 deployment
- **Static Favicon**: Replaced dynamic `icon.tsx` (ImageResponse) with static `favicon.svg` for faster TTFB
- **Middleware Optimization**: Updated matcher to explicitly exclude all static file extensions

### Fixed
- **Mobile Responsiveness Fixes**:
  - Live page header overflow on narrow screens
  - Proposal modal proposer address and budget overflow
  - Treasury tabs horizontal scroll for mobile
  - Engine Room refresh button visual feedback ("Refreshed" text display)
  - Proposal modal Event History text overflow
  - Proposal modal Governance Process icon clipping
  - Treasury Balance Distribution text/spacing overflow

- **TTFB Bottleneck** (7-11 second delay resolved):
  - Root cause: RSC using external URL caused circular nginx requests
  - Fixed with internal localhost routing for server-side fetches
  - AbortController timeout (3s) prevents blocking on slow responses

- **Translation Fixes** (`apps/web/src/i18n/messages/`):
  - Added `engine.refreshed` key: "Refreshed" (EN) / "완료" (KO)

---

## [0.12.5] - 2026-01-15

### Added
- **Voting Delegation UI** (`apps/web/src/components/delegation/`):
  - `DelegationCard` - Delegation item display with address, voting power, expiration, categories
  - `DelegationStats` - 4 stats cards grid (own/received/given/effective voting power)
  - `DelegationModal` - Multi-step delegation creation modal with:
    - Intro step explaining delegation
    - Input step with delegate address, category selection, expiration options
    - Confirm step showing delegation summary
    - Success/Error result states
  - `DelegationList` - Tabbed list component (given/received delegations)
  - Index barrel export for all delegation components

- **Delegation API Functions** (`apps/web/src/lib/api.ts`):
  - `Delegation` interface with id, delegator, delegate, categories, weight, expires_at, is_active
  - `DelegationResponse` interface for delegatedTo/delegatedFrom arrays
  - `fetchDelegations(address)` - Get delegations for address
  - `createDelegation(data)` - Create new delegation
  - `revokeDelegation(id)` - Revoke existing delegation

- **Profile Page Delegation Section** (`apps/web/src/app/[locale]/profile/page.tsx`):
  - DelegationStats component showing voting power breakdown
  - DelegationList with tabbed given/received views
  - "Delegate" button opening DelegationModal
  - Real-time delegation data with TanStack Query

- **Internationalization**:
  - 65+ new translation keys for delegation UI (EN/KO)
  - Stats labels, modal steps, error messages, empty states

### Changed
- Updated USER_GUIDE.md with detailed Treasury and Wallet & Profile sections
- Updated USER_GUIDE.ko.md with Korean translations
- Updated DEVELOPMENT_STATUS.md/ko.md with Phase 10 progress

---

## [0.12.4] - 2026-01-15

### Added
- **Automatic Report Generation System** (`apps/api/src/services/report-generator/`):
  - `ReportGeneratorService` for automated weekly and monthly report generation
  - `DataCollector` aggregates metrics from signals, issues, proposals, agents, sessions
  - `WeeklyReportGenerator` produces governance reports with LLM executive summary
  - `MonthlyReportGenerator` creates comprehensive reports with strategic insights
  - Scheduler integration: weekly (Monday 00:00 UTC), monthly (1st 00:00 UTC)
  - Manual generation API: `POST /api/disclosure/generate/weekly`, `POST /api/disclosure/generate/monthly`
  - Markdown rendering in DisclosureDetailModal with styled tables, headers, code blocks

- **Real-time Health Endpoint** (`apps/api/src/index.ts`):
  - `/health` now returns real data: budget status, scheduler info, agent counts
  - Budget: daily limit, spent today, remaining balance
  - Scheduler: isRunning, nextTier2 run time, queue length, scheduled hours
  - Uptime tracking from server start time

- **Budget Configuration via Environment** (`apps/api/src/db/index.ts`):
  - `ANTHROPIC_DAILY_BUDGET_USD`, `ANTHROPIC_HOURLY_LIMIT`
  - `OPENAI_DAILY_BUDGET_USD`, `OPENAI_HOURLY_LIMIT`
  - `GOOGLE_DAILY_BUDGET_USD`, `GOOGLE_HOURLY_LIMIT`
  - `OLLAMA_HOURLY_LIMIT`
  - Auto-seed budget_config table on first run from .env values

- **Admin API Key Protection** (`apps/api/src/routes/budget.ts`):
  - `ADMIN_API_KEY` environment variable for admin operations
  - `requireAdmin` middleware protects budget modification endpoints
  - `PATCH /api/budget/config/:provider` requires `X-Admin-Key` header

- **Tier Usage Statistics API** (`apps/api/src/routes/stats.ts`):
  - `GET /api/stats/tier-usage` returns tier 0/1/2 call counts for today

### Changed
- **Engine Room Page** (`apps/web/src/app/[locale]/engine/page.tsx`):
  - Now uses real API data instead of hardcoded mock values
  - SchedulerCard updated to handle nullable fields gracefully

### Fixed
- **Modal Portal Pattern** (all modal components):
  - All modals now use React Portal (`createPortal`) for proper z-index stacking
  - Fixed modal overlay issues on Governance and other pages
  - Uses `z-[99999]` for guaranteed top-level rendering

- **Translation Fixes** (`apps/web/src/i18n/messages/en.json`, `ko.json`):
  - Added `Engine.status.ok` key: "All systems operational" / "모든 시스템 정상 작동 중"

---

## [0.12.3] - 2026-01-13

### Added
- **Production Deployment** (`https://algora.moss.land`):
  - pm2 ecosystem configuration (`ecosystem.config.cjs`) for process management
  - nginx reverse proxy configuration for the managed public edge
  - SSL/TLS with Let's Encrypt for secure connections
  - WebSocket proxy support for Socket.IO real-time features
  - Static asset caching headers for performance

### Fixed
- **Next.js i18n Middleware** (`apps/web/src/middleware.ts`):
  - Fixed middleware matcher to exclude `_next` paths from locale processing
  - Resolved 500 errors on static assets (`/_next/static/...`)
  - Fixed `ERR_TOO_MANY_REDIRECTS` caused by locale prefix conflicts
  - Matcher now properly excludes: `_next`, `api`, `favicon.ico`, and file extensions

### Changed
- Updated `apps/web/.env.local` with production API URL (`https://algora.moss.land`)
- DEVELOPMENT_STATUS.md updated with Phase 9 deployment completion

---

## [0.12.2] - 2026-01-13

### Added
- **Agent Clusters Expansion (30 → 38 agents)** (`@algora/core`, `@algora/api`):
  - New cluster types: 'orchestrators', 'archivists', 'red-team', 'scouts'
  - 8 new agents with unique personas:
    - Orchestrators: Nova Prime (methodical coordinator), Atlas (resilient backup)
    - Archivists: Archive Alpha (meticulous keeper), Trace Master (forensic auditor)
    - Red Team: Contrarian Carl (devil's advocate), Breach Tester (security attacker), Base Questioner (assumption challenger)
    - Scouts: Horizon Seeker (opportunity detector)
  - Updated i18n translations for new groups (EN/KO)

- **Real-time Socket.IO for Governance Events** (`@algora/api`, `@algora/web`):
  - 11 new broadcast functions for governance events:
    - `broadcastDocumentCreated`, `broadcastDocumentStateChanged`
    - `broadcastVotingCreated`, `broadcastVoteCast`, `broadcastVotingStatusChanged`
    - `broadcastActionLocked`, `broadcastActionUnlocked`, `broadcastDirector3Approval`
    - `broadcastPipelineProgress`, `broadcastWorkflowStateChanged`, `broadcastHealthUpdate`
  - New `useGovernanceEvents` hook for frontend real-time subscriptions
  - GovernanceEvent type with full event type definitions

- **Operational KPIs Instrumentation** (`@algora/governance-os`):
  - KPICollector class with comprehensive metric tracking:
    - Decision Quality: DP completeness, option diversity, red team coverage, evidence depth
    - Execution Speed: signal-to-issue, issue-to-DP, review queue, execution, end-to-end timing
    - System Health: uptime, heartbeat gaps, LLM availability, queue depth, error rate
  - 7 new API endpoints: `/kpi/dashboard`, `/kpi/decision-quality`, `/kpi/execution-speed`,
    `/kpi/system-health`, `/kpi/alerts`, `/kpi/targets`, `/kpi/export`
  - Alert generation for metrics below target thresholds
  - Prometheus-compatible metric export

- **Security Spam Protection** (`@algora/safe-autonomy`):
  - AntiAbuseGuard class with comprehensive protection:
    - Rate limiting (configurable signals per hour)
    - Deduplication with topic hash and similarity threshold
    - Quality filtering with minimum signal quality requirement
    - Blacklist management for domains and patterns
    - Cooldown periods after rejection
    - Multiple source validation requirement
  - DEFAULT_ANTI_ABUSE_CONFIG with sensible defaults

- **E2E Pipeline Tests** (`@algora/governance-os`):
  - Comprehensive test suite covering:
    - Full Pipeline Execution (LOW/MID/HIGH risk scenarios)
    - Document Registry Integration (create, publish, query)
    - Dual-House Voting Integration (create, start, cast votes)
    - Model Router Integration (task execution, statistics)
    - KPI Collector Integration (samples, heartbeats, operations)
    - Health Monitoring and Statistics
    - Pipeline Stage Verification (all 9 stages)
    - Workflow Type Coverage (A, B, C, D, E)

- **Ollama Model Integration** (`@algora/model-router`):
  - OllamaProvider class for local LLM inference:
    - Text generation via `/api/generate` and `/api/chat` endpoints
    - Embedding support via `/api/embed` endpoint
    - Health checks via `/api/tags` endpoint
    - Model pull functionality with progress callback
    - Automatic retry with exponential backoff
  - OllamaLLMProvider adapter for ModelRouter integration
  - OLLAMA_INSTALL_COMMANDS constant with install commands for all model categories
  - OLLAMA_HARDWARE_REQUIREMENTS constant with VRAM/RAM requirements per model
  - Factory functions: `createOllamaModelRoutingSystem`, `createOllamaModelRoutingSystemWithDefaults`

### Changed
- Package versions updated to reflect new features
- DEVELOPMENT_STATUS.md updated with Phase 8 completion details

---

## [0.12.1] - 2026-01-13

### Added
- **Backend API Endpoints for Governance OS** (`@algora/api`):
  - `GET /governance-os/documents` - List all documents with filters (type, state, limit, offset)
  - `GET /governance-os/voting` - List all voting sessions with filters (status, limit, offset)
  - `GET /governance-os/approvals` - List all high-risk approvals/locked actions
  - `GET /governance-os/approvals/:approvalId` - Get specific approval by ID
  - `GET /governance-os/workflows` - Get workflow statuses for all 5 workflow types (A-E)

- **GovernanceOSBridge Service Methods** (`apps/api/src/services/governance-os-bridge.ts`):
  - `listAllDocuments()` - Query documents from Document Registry
  - `listAllVotings()` - Query voting sessions from Dual-House
  - `listAllApprovals()` - Query high-risk approvals with lock status
  - `getApproval()` - Get specific approval by ID
  - `getWorkflowStatuses()` - Aggregate workflow statistics

- **WittyLoader/WittyMessage Enhancements** (`apps/web/src/components/ui/`, `apps/web/src/hooks/`):
  - New `'governance'` message category for loading states
  - New empty state types: `'workflows'`, `'documents'`, `'votes'`, `'approvals'`
  - Governance-specific loading messages from `governanceMessages`

### Changed
- **Frontend API Functions** (`apps/web/src/lib/api.ts`):
  - `fetchGovernanceOSStats()` - Now correctly handles `{ stats }` wrapper response
  - `fetchDocument()` - Now correctly handles `{ document }` wrapper response
  - `fetchDocuments()` - Now uses real `/governance-os/documents` endpoint
  - `fetchDualHouseVotes()` - Now uses real `/governance-os/voting` endpoint
  - `fetchLockedActions()` - Now uses real `/governance-os/approvals` endpoint
  - `fetchWorkflowStatuses()` - **Removed mock data**, now uses real `/governance-os/workflows` endpoint

### Removed
- Mock data from `fetchWorkflowStatuses()` function - now fetches from real API

---

## [0.12.0] - 2026-01-13

### Added
- **Governance OS Dashboard UI** (`@algora/web`):
  - New `/governance` page with comprehensive v2.0 dashboard
  - Pipeline visualization component showing 9-stage workflow:
    - signal_intake → issue_detection → triage → research → deliberation
    - decision_packet → voting → execution → outcome_verification
  - WorkflowCard component for 5 workflow types (A-E)
  - DocumentCard component for 15 official document types with state badges
  - DualHouseVoteCard component for MossCoin/OpenSource dual-house voting
  - LockedActionCard component for Safe Autonomy status with approval tracking

- **Governance OS API Types** (`apps/web/src/lib/api.ts`):
  - PipelineStage, PipelineStatus for workflow tracking
  - DocumentType (DP, GP, RM, RC, WGC, WGR, ER, PP, PA, DGP, DG, MR, RR, DR, AR, RD, TA)
  - DocumentState (draft, pending_review, in_review, approved, published, superseded, archived, rejected)
  - GovernanceDocument with version and state tracking
  - DualHouseVote for dual-house voting sessions
  - LockedAction, RiskLevel (LOW, MID, HIGH) for safe autonomy
  - WorkflowStatus, GovernanceOSStats, GovernanceOSHealth
  - API functions: fetchGovernanceOSStats, fetchGovernanceOSHealth, fetchPipelineStatus,
    fetchDocuments, fetchDocument, fetchDualHouseVotes, fetchLockedActions,
    fetchWorkflowStatuses, approveLockedAction, castDualHouseVote

- **Navigation Updates**:
  - Added "Governance OS" menu item to Sidebar
  - NEW badge for highlighting new feature

- **Internationalization**:
  - Complete English and Korean translations for Governance OS page
  - Pipeline stage names, document states, voting status, safe autonomy status

---

## [0.11.0] - 2026-01-13

### Added
- **Workflow C: Developer Support** (`@algora/orchestrator`):
  - Types: GrantStatus, GrantCategory, MilestoneStatus, RewardStatus
  - Types: GrantApplication, GrantMilestone, DeveloperGrant, MilestoneReport
  - Types: RetroactiveReward, GrantProposal, ApplicationEvaluation, MilestoneReview
  - WorkflowCHandler class implementation:
    - `processGrantApplication()` - Process applications and create proposals
    - `evaluateApplication()` - AI-powered evaluation with multi-dimensional scoring
    - `processMilestoneReport()` - Review milestone submissions
    - `processRetroactiveReward()` - Handle retroactive reward nominations
    - `requiresDualHouseApproval()` - Check dual-house requirements
    - `requiresDirector3Approval()` - Check Director 3 requirements
    - `calculateDisbursement()` - Calculate disbursement with LOCK status
  - Dual-House approval integration (MossCoin House + OpenSource House)
  - Director 3 approval for high-value grants (>$5,000)
  - LOCK mechanism for all fund disbursements
  - 19 comprehensive test cases, all passing

- **Workflow D: Ecosystem Expansion** (`@algora/orchestrator`):
  - Types: ExpansionOrigin, OpportunityCategory, OpportunityStatus, PartnershipStatus
  - Types: ExpansionOpportunity, OpportunityAssessment, PartnershipProposal
  - Types: PartnershipAgreement, EcosystemReport, DetectedSignal
  - Types: AlwaysOnConfig, AntiAbuseConfig, SignalSource
  - WorkflowDHandler class implementation:
    - `processCallBasedOpportunity()` - Process explicit proposals
    - `processAlwaysOnSignal()` - Process signals from always-on scanner
    - `assessOpportunity()` - AI-powered assessment with SWOT analysis
    - `createPartnershipProposal()` - Create proposals from qualified opportunities
    - `createPartnershipAgreement()` - Create agreements with LOCK mechanism
    - `generateEcosystemReport()` - Generate periodic ecosystem reports
    - `requiresDualHouseApproval()` - Check value-based approval requirements
    - `requiresDirector3Approval()` - Check high-value/high-risk requirements
  - Dual intake: call_based (explicit) and always_on (scanning)
  - Anti-spam guardrails (rate limiting, deduplication, quality filters, blocked domains)
  - Partnership agreement LOCK until all approvals received
  - 21 comprehensive test cases, all passing

- **Workflow E: Working Groups** (`@algora/orchestrator`):
  - Types: WorkingGroupStatus, CharterDuration, WGDocumentType, WGProposalOrigin
  - Types: WorkingGroupProposal, WorkingGroupCharter, WGPublishingRules
  - Types: WorkingGroup, WGStatusReport, WGDissolutionRequest, IssuePattern
  - Types: CharterAmendment, WGProposalEvaluation
  - WorkflowEHandler class implementation:
    - `processWGProposal()` - Process WG formation proposals
    - `evaluateProposal()` - AI-powered multi-dimensional evaluation
    - `createCharter()` - Create charter from approved proposal
    - `activateWorkingGroup()` - Activate WG from approved charter
    - `canPublishDocument()` - Check publishing authority
    - `recordPublication()` - Track WG document publications
    - `generateStatusReport()` - Generate WG status reports
    - `processDissolulutionRequest()` - Handle WG dissolution
    - `detectPatterns()` - Auto-detect issue patterns for WG proposals
    - `generateAutoProposal()` - Generate WG proposals from patterns
  - Publishing authority system with configurable rules
  - Charter management with duration options (3m, 6m, 1y, indefinite)
  - Auto-proposal from issue pattern detection
  - Dual-House approval for all WG formations
  - Director 3 approval for high-budget WGs (>$5,000)
  - 31 comprehensive test cases, all passing

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 7 completion
- Total orchestrator tests: 96 passing (A: 12, B: 13, C: 19, D: 21, E: 31)
- Phase 7 (Workflow Implementation & API Integration) now complete

---

## [0.10.0] - 2026-01-13

### Added
- **Phase 7 Step 1: API Integration**:
  - GovernanceOSBridge service for apps/api integration
  - REST API endpoints for Governance OS:
    - Pipeline endpoints: `/governance-os/pipeline/run`, `/pipeline/issue/:id`
    - Document endpoints: `/governance-os/documents`, `/documents/:id`, `/documents/type/:type`
    - Voting endpoints: `/governance-os/voting`, `/voting/:id`, `/voting/:id/vote`
    - Approval endpoints: `/governance-os/approvals`, `/approvals/:id/approve`
    - Risk/Lock endpoints: `/governance-os/risk/classify`, `/locks/:id`
    - Model router endpoint: `/governance-os/model-router/execute`
    - Stats/Health endpoints: `/governance-os/stats`, `/health`, `/config`

- **Workflow A: Academic Activity** (`@algora/orchestrator`):
  - Types: AcademicSource, ResearchTopic, AcademicPaper, ResearchBrief
  - Types: TechnologyAssessment, ResearchDigest, WorkflowAConfig
  - WorkflowAHandler class implementation:
    - `executeResearchPhase()` - Gather papers and create research brief
    - `executeDeliberationPhase()` - Collect agent opinions, calculate consensus
    - `generateResearchDigest()` - Weekly digest document generation
    - `generateTechnologyAssessment()` - Formal assessment generation
    - `shouldGenerateAssessment()` - Threshold detection
  - Integration with Orchestrator via `executeWorkflowA()` method
  - 12 comprehensive test cases, all passing

- **Workflow B: Free Debate** (`@algora/orchestrator`):
  - Types: DebateSource, DebateCategory, DebatePhase, DebateTopic
  - Types: DebateArgument, DebateThread, ConsensusAssessment, DebateSummary
  - WorkflowBHandler class implementation:
    - `initializeDebate()` - Create debate thread from topic
    - `executeDebatePhase()` - Run individual debate phases
    - `executeFullDeliberation()` - Complete 5-phase debate execution
    - `assessConsensus()` - Consensus calculation with scoring
    - `generateDebateSummary()` - Official summary document
    - `shouldContinueDebate()` - Debate state management
  - Multi-phase debate support (opening, arguments, rebuttals, synthesis, conclusion)
  - Red Team challenge generation in rebuttals phase
  - 5 diverse agent perspectives per debate
  - Integration with Orchestrator via `executeWorkflowB()` method
  - 13 comprehensive test cases, all passing

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 7 progress
- Orchestrator now supports workflow handler initialization
- Added `executeWorkflowA()` and `executeWorkflowB()` to Orchestrator class

---

## [0.9.0] - 2026-01-12

### Added
- **Phase 6: Governance OS Integration Package** (`@algora/governance-os`):
  - **Types** (`types.ts`):
    - GovernanceOSConfig for system-wide configuration
    - PipelineStage and PipelineContext for pipeline management
    - PipelineResult for pipeline completion status
    - WorkflowConfigs (A-E) for workflow-specific settings
    - GovernanceOSEvents for unified event system
    - GovernanceOSStats for system statistics
    - WORKFLOW_DOCUMENT_OUTPUTS mapping
    - DUAL_APPROVAL_DOCUMENTS and DIRECTOR3_REQUIRED_DOCUMENTS
    - ACTION_RISK_LEVELS for risk classification
    - SPECIALIST_DIFFICULTY_MAPPING for model routing
    - DOCUMENT_DIFFICULTY_MAPPING for document generation
  - **Pipeline** (`pipeline.ts`):
    - GovernancePipeline class with 9 stages
    - Stage handlers for signal_intake through outcome_verification
    - Event emission for pipeline progress
    - Retry logic with exponential backoff
    - Pipeline context management
    - PipelineServices interface for dependency injection
  - **Governance OS** (`governance-os.ts`):
    - GovernanceOS class integrating all v2.0 packages
    - Initialization of Safe Autonomy, Orchestrator, Document Registry, Model Router, Dual-House
    - Event wiring between subsystems
    - Pipeline execution API
    - Subsystem accessor methods
    - Statistics tracking (uptime, pipelines, documents, voting, LLM costs)
    - Health check API for component status
    - Configuration management
  - **Factory Functions** (`index.ts`):
    - `createGovernanceOS()` for custom configuration
    - `createDefaultGovernanceOS()` for default setup
    - Comprehensive re-exports from all v2.0 packages

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 6 completion

---

## [0.8.0] - 2026-01-12

### Added
- **Phase 5: Dual-House Governance Package** (`@algora/dual-house`):
  - **Types** (`types.ts`):
    - House types (MossCoin House, OpenSource House)
    - House configuration with quorum, threshold, focus areas
    - Member types (MossCoinMember, OpenSourceMember)
    - Vote types (for, against, abstain) with voting power
    - Dual-house voting status tracking
    - Reconciliation types for conflict resolution
    - Director 3 decision types (override, revote, veto, conditional)
    - High-risk approval types with LOCK/UNLOCK status
    - Vote delegation with scope options
    - Event types for governance monitoring
    - Statistics types for both houses
  - **House Manager** (`houses.ts`):
    - MossCoin House member registration
    - OpenSource House contributor registration
    - Token balance and contribution score tracking
    - Voting power calculation with role multipliers
    - Member status management (active, inactive, suspended)
    - Delegation support between members
    - House statistics calculation
    - Event emission for member changes
  - **Voting Manager** (`voting.ts`):
    - Dual-house voting session creation
    - Parallel voting in both houses
    - Vote casting with power calculation
    - Quorum and pass threshold checking
    - Tally calculation with participation rates
    - Early finalization when quorum reached
    - Vote delegation with scope (all, category, proposal)
    - Automatic status updates
    - Event emission for voting events
  - **Reconciliation Manager** (`reconciliation.ts`):
    - Reconciliation triggering when houses disagree
    - Conflict summary generation
    - Orchestrator analysis with recommendations
    - Director 3 decision submission
    - Decision application (override, revote, veto)
    - Expiration handling for pending memos
    - Deadline extension support
    - Event emission for reconciliation events
  - **High-Risk Approval Manager** (`high-risk-approval.ts`):
    - High-risk approval creation
    - House approval recording
    - Director 3 approval recording
    - LOCK/UNLOCK mechanism
    - Execution handler registration
    - Action execution with audit
    - Missing approval tracking
    - Event emission for approval events
  - **Factory Functions** (`index.ts`):
    - `createDualHouseGovernance()` for complete system
    - `createDualHouseGovernanceWithStorage()` for custom storage
    - Automatic event wiring between components
    - Comprehensive exports for all components

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 5 completion

---

## [0.7.0] - 2026-01-12

### Added
- **Phase 4: Model Router Package** (`@algora/model-router`):
  - **Types** (`types.ts`):
    - LLM tier system (Tier 0: Free, Tier 1: Local, Tier 2: External)
    - Model capabilities (text, code, vision, embedding, rerank, functions)
    - Task types with difficulty classification
    - 5 difficulty levels (trivial, simple, moderate, complex, critical)
    - Quality gate configuration
    - RAG types for embeddings and reranking
    - Default model lineup for all task types
  - **Model Registry** (`registry.ts`):
    - Model registration and management
    - Health check system with automatic monitoring
    - Model search by tier, provider, capabilities
    - Fallback chain generation
    - 14 pre-seeded default models (Ollama + Claude + GPT-4o)
  - **Task Difficulty Classifier** (`classifier.ts`):
    - Automatic task difficulty classification
    - Keyword-based difficulty detection
    - High-stakes and multi-step reasoning detection
    - Confidence scoring with reasoning
    - Batch classification support
  - **Model Router** (`router.ts`):
    - Intelligent task-to-model routing
    - Automatic fallback on failure
    - Budget management with daily limits
    - Statistics tracking (tokens, cost, latency)
    - Event emission for monitoring
  - **Quality Gate** (`quality-gate.ts`):
    - Output validation with multiple checks
    - Length, format, keyword, and safety checks
    - Built-in validators (coherence, completeness, JSON, decision packet)
    - Confidence scoring
    - Custom validator support
  - **Embedding Service** (`rag/embeddings.ts`):
    - Text embedding generation
    - Embedding caching with LRU eviction
    - Cosine similarity calculation
    - Semantic search (find similar)
    - Batch embedding support
    - 3 default embedding models
  - **Reranker Service** (`rag/reranker.ts`):
    - Document reranking by relevance
    - Reciprocal Rank Fusion (RRF)
    - Relevance threshold filtering
    - RAG pipeline combining embeddings + reranking
    - 2 default reranker models
  - **Factory Functions** (`index.ts`):
    - `createModelRoutingSystem()` for easy instantiation
    - `createModelRoutingSystemWithDefaults()` with pre-seeded models
    - Comprehensive exports for all components

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 4 completion

---

## [0.6.0] - 2026-01-12

### Added
- **Phase 3: Document Registry Package** (`@algora/document-registry`):
  - **Types** (`types.ts`):
    - 15 Official document types (DP, GP, RM, RC, WGC, WGR, ER, PP, PA, DGP, DG, MR, RR, DR, AR)
    - Document categories (decision, working_group, ecosystem, developer, transparency, research)
    - Document states (draft, pending_review, in_review, approved, published, superseded, archived, rejected)
    - Semantic versioning with major/minor/patch
    - Provenance types with agent contributions and review history
    - Audit action types (created, updated, state_changed, reviewed, approved, rejected, published, etc.)
    - Document ID generation utilities
  - **Document Manager** (`document.ts`):
    - Full CRUD operations for documents
    - State machine with valid transitions
    - Content hashing for integrity verification
    - Version increment logic
    - Publish, archive, and supersede workflows
    - Agent contribution tracking
    - Event emission for document changes
  - **Version Manager** (`versioning.ts`):
    - Document version storage and retrieval
    - Semantic version comparison
    - Diff generation between versions
    - Version tagging with optional metadata
    - Branch support for parallel versions
    - Version history traversal
  - **Provenance Manager** (`provenance.ts`):
    - Full provenance tracking from signal to outcome
    - Agent contribution recording with model/cost info
    - Review chain management
    - Integrity proof generation (SHA-256)
    - Provenance verification with issue detection
    - Provenance chain building for document lineage
  - **Audit Manager** (`audit.ts`):
    - Immutable audit trail for all document actions
    - Query support with filters (action, actor, date range)
    - Audit summary generation
    - Export to JSON/CSV formats
    - Retention policy with cleanup
    - Integrity verification of audit trail
    - Actor helpers (system, agent, human)
  - **Factory Function** (`index.ts`):
    - `createDocumentRegistry()` for easy instantiation
    - Comprehensive exports for all managers and types

### Changed
- Updated `DEVELOPMENT_STATUS.md` with Phase 3 completion

---

## [0.5.0] - 2026-01-12

### Added
- **Phase 2: Orchestrator Package** (`@algora/orchestrator`):
  - **Types** (`types.ts`):
    - Workflow types (A-E): Academic, Debate, Developer Support, Ecosystem, Working Groups
    - 12 Workflow states: INTAKE → OUTCOME_PROOF with valid transitions
    - Issue types with priority scoring (TopicCategory, ImpactFactors, etc.)
    - Specialist types (RES, ANA, DRA, REV, RED, SUM, TRN, ARC)
    - TODO and task management types
    - Decision packet and execution plan types
    - Event types for orchestrator monitoring
    - Configuration with default values
  - **State Machine** (`state-machine.ts`):
    - WorkflowStateMachine class with transition validation
    - Acceptance criteria enforcement per state
    - State history tracking with provenance
    - Terminal state detection and blocking state handling
    - Serialization/deserialization for persistence
    - Event subscription for state changes
  - **TODO Manager** (`todo-manager.ts`):
    - Persistent TODO list for task continuation
    - Task lifecycle (pending → in_progress → completed/failed/blocked)
    - Exponential backoff for failed tasks
    - Queue depth monitoring
    - Recovery on restart
  - **Specialist Manager** (`specialist-manager.ts`):
    - Specialist subagent coordination
    - System prompts for each specialist type
    - Quality gate validation for outputs
    - Task queue with priority ordering
    - LLM provider interface
    - Mock LLM provider for testing
  - **Orchestrator** (`orchestrator.ts`):
    - Primary coordinator for governance workflows
    - Issue intake and workflow dispatch
    - Priority score calculation
    - Dynamic agent summoning based on issue category
    - Decision packet generation
    - Event emission for monitoring
    - Heartbeat for system liveness

### Changed
- Updated `tsconfig.json` with `@algora/orchestrator` path mapping
- Dependencies on `@algora/safe-autonomy` for risk classification

---

## [0.4.0] - 2026-01-12

### Added
- **Algora v2.0 Upgrade Plan**:
  - Complete upgrade plan document (`docs/algora-v2-upgrade-plan.md`)
  - Korean translation (`docs/algora-v2-upgrade-plan.ko.md`)
  - 20 sections (A-T) covering all v2.0 components
  - Requirements Traceability Matrix and Coverage Checklist

- **Phase 1: Safe Autonomy Package** (`@algora/safe-autonomy`):
  - **Risk Classifier** (`risk-classifier.ts`):
    - Action risk taxonomy (LOW/MID/HIGH)
    - Risk penalty calculation
    - Automatic LOCK triggering for high-risk actions
  - **Lock Manager** (`lock-manager.ts`):
    - LOCK/UNLOCK mechanism for dangerous actions
    - Approval tracking with multi-party requirements
    - Execution gating (HIGH-risk cannot execute without Director 3 approval)
  - **Approval Router** (`approval-router.ts`):
    - Risk-based routing (LOW→auto, MID→any_reviewer, HIGH→director_3)
    - Reviewer registry and notification system
    - Escalation and reminder functionality
  - **Passive Consensus** (`passive-consensus.ts`):
    - Opt-out approval model
    - Auto-approve after timeout (24h LOW, 48h MID)
    - Veto and escalation support
    - "Unreviewed by Human" labeling
  - **Retry Handler** (`retry-handler.ts`):
    - Exponential backoff retry logic
    - Configurable max retries and delays
    - Escalation to human after exhaustion
  - **Full TypeScript Types** (`types.ts`):
    - Complete type definitions for Safe Autonomy layer
    - Default configuration with sensible defaults
  - **Factory Functions**:
    - `createSafeAutonomySystem()` - Bundle all components
    - Individual factory functions for each component

### Changed
- Updated `tsconfig.json` with `@algora/safe-autonomy` path mapping
- Updated `pnpm-workspace.yaml` auto-discovers new package

---

## [0.3.0] - 2026-01-10

### Added
- **Live Showcase Page** (`/live`):
  - Real-time dashboard showcasing 24/7 AI governance system
  - Terminal-style UI with light theme (matching site style)
  - Components:
    - `LiveHeader` - Status bar with version, uptime counter, live indicator
    - `SignalStream` - Real-time signal feed with source color coding
    - `SystemBlueprint` - Pipeline visualization (Signals → Analysis → Issues → Agora → Proposals → Execute)
    - `LiveMetrics` - Live statistics with sparkline graphs
    - `ActivityLog` - Terminal-style activity stream
    - `AgentChatter` - Agent idle messages preview
    - `AgoraPreview` - Active session preview with participants
    - `TerminalBox`, `GlowText` - Shared terminal UI components
  - Socket.io integration for real-time updates
  - LIVE badge in header with pulsing red indicator
  - LIVE menu item in sidebar navigation

### Fixed
- **Hydration Errors**:
  - `useWittyMessage` hook now uses deterministic initial value (first message in array)
  - Time/date formatting uses safe fallbacks to prevent server/client mismatch
  - All live components properly handle undefined timestamps
- **Agora System Messages**: System messages now display as "System" instead of "Unknown"
- **API Response Handling**: All live components correctly extract nested arrays from API responses

---

## [0.2.3] - 2026-01-10

### Added
- **UI Animations**:
  - New Tailwind animations: `slide-in-right`, `scale-in`, `highlight`, `glow`
  - Modal open/close animations (fade-in backdrop + scale-in content)
  - Card hover effects with scale and shadow transitions
- **StatsDetailModal**: New modal component for detailed statistics view
  - Current value with trend indicator
  - Breakdown visualization with progress bars
  - Related activity list filtered by type
- **Enhanced ActivityFeed**:
  - Severity badges with color coding (info/low/medium/high/critical)
  - Agent name display for agent-related activities
  - Metadata summary (uptime, memory, sessionId)
  - Slide-in animation for new items
  - Increased to 25 items with 10s polling interval

### Changed
- **Heartbeat interval**: 10 seconds → 60 seconds (reduced server load)
- **StatsCard component**:
  - Now clickable with `onClick` prop
  - Added variant styles (default, warning, success, primary)
  - Added subtitle prop for contextual hints
  - Enhanced hover animations
- **All modal components** now have consistent animations:
  - ActivityDetailModal, AgentDetailModal, SignalDetailModal
  - IssueDetailModal, SessionDetailModal, NewSessionModal
  - ProposalDetailModal

### Fixed
- Translation files updated with new keys for stats descriptions and detail modal

---

## [0.2.2] - 2026-01-10

### Added
- **Agora Enhancements**:
  - Real-time message fetching from database (replaced mock data)
  - Agent group display in participant list (Visionaries, Builders, etc.)
  - Group-based color coding for participants
  - Participant count in sidebar header
- **Auto Discussion Improvements**:
  - Auto-start discussion when session is created with `autoSummon`
  - Random intervals between 30 seconds to 2 minutes (more natural pacing)
  - First message after 5-10 second delay
- **LLM Rate Limiting**:
  - Global LLM request queue to prevent local LLM overload
  - Minimum 10 second delay between LLM calls
  - Queue status monitoring endpoint (`/api/agora/llm-queue`)
  - Sequential processing of concurrent requests from multiple sessions
- **Disclosure Page**: New transparency reports page with mock data

### Fixed
- **Tooltip z-index**: Fixed help tooltips being hidden behind sidebar by using fixed positioning with calculated coordinates (z-index 9999)
- **Documentation link**: Fixed HelpMenu docs link (`algoradao/algora` → `mossland/Algora/blob/main/USER_GUIDE.md`)
- **Agora Invalid Date**: Fixed `AgoraSession` interface to match API response (snake_case: `created_at`, `updated_at`, etc.)
- **Signals pagination**: Show "Showing X of Y" when displaying fewer signals than total
- **AutoSummon agents**: Fixed `summoned_agents` column not being updated when agents are added via `addParticipant()`
- **SQL syntax error**: Fixed double quotes to single quotes for SQLite string literals in SummoningService

### Changed
- `AgoraMessage` interface added to API types
- `fetchSessionWithMessages()` function added for fetching session with messages
- `startAutomatedDiscussion()` now uses setTimeout with random intervals instead of fixed setInterval

---

## [0.2.1] - 2026-01-09

### Added
- **UX Guide System**:
  - `WelcomeTour` component for first-time visitors
  - `SystemFlowDiagram` component for visual pipeline explanation
  - `HelpTooltip` component for contextual help on each page
  - `HelpMenu` component in header for quick access
  - `/guide` page with complete governance flow visualization
  - localStorage persistence for tour completion status
  - Full i18n support (English/Korean) for guide system
- **Automatic Agora Session Creation**:
  - Auto-create Agora sessions for Critical/High priority issues
  - Category-based agent auto-summoning (Security, Market, Governance, etc.)
  - Cooldown mechanism (30min for critical, 60min for high priority)
  - `AGORA_SESSION_AUTO_CREATED` activity type in ActivityFeed
- **User Documentation**:
  - `USER_GUIDE.md` - Complete English user guide
  - `USER_GUIDE.ko.md` - Complete Korean user guide

### Changed
- Updated `README.md` / `README.ko.md` with new features
- Updated `ARCHITECTURE.md` / `ARCHITECTURE.ko.md` with auto-session flow diagrams
- Updated `DEVELOPMENT_STATUS.md` with completed features
- Added `Zap` icon for auto-created session activity type

---

## [0.1.0] - 2026-01-09

### Added
- **Monorepo Structure**: pnpm workspaces + Turborepo configuration
- **Project Documentation**:
  - `README.md` / `README.ko.md` - Project overview
  - `ARCHITECTURE.md` / `ARCHITECTURE.ko.md` - System architecture
  - `CONTRIBUTING.md` / `CONTRIBUTING.ko.md` - Contribution guidelines
  - `ALGORA_PROJECT_SPEC.md` / `ALGORA_PROJECT_SPEC.ko.md` - Full specification
  - `CLAUDE.md` - AI assistant context
  - `CHANGELOG.md` - Version history
- **Backend (apps/api)**:
  - Express + Socket.IO server on port 3201
  - SQLite database with WAL mode
  - Full database schema (agents, sessions, signals, issues, proposals, etc.)
  - REST API endpoints for all entities
  - ActivityService for logging and heartbeat
  - SchedulerService for 3-tier LLM scheduling
  - 30 seed agents with personas across 7 clusters
- **Frontend (apps/web)**:
  - Next.js 14 with App Router
  - next-intl for i18n (English/Korean)
  - TanStack Query for data fetching
  - Tailwind CSS with custom Algora theme
  - Dashboard with stats and activity feed
  - Header with system status and language toggle
  - Sidebar navigation
  - AgentLobbyPreview component
- **Shared Types (packages/core)**:
  - TypeScript type definitions for all entities
  - API response types
  - WebSocket event type map
- Local LLM recommendations for Mac mini M4 Pro (64GB):
  - Tier 1 (Chatter): Llama 3.2 8B, Phi-4, Qwen 2.5
  - Tier 1+ (Enhanced): Mistral Small 3, Qwen 2.5 32B
  - Tier 2 Fallback: Qwen 2.5 72B-Q4
- External LLM support: Anthropic Claude, OpenAI GPT, Google Gemini
- Development ports: Frontend (3200), Backend (3201)

### Changed
- Updated project vision to emphasize scalability and transparency
  - Initial 30 AI agents with infinite scalability architecture
  - "Dynamic Persona Spectrum" for agent cluster naming
  - Focus on transparent visualization of governance activities

---

## Version History Format

### [X.Y.Z] - YYYY-MM-DD

#### Added
- New features

#### Changed
- Changes in existing functionality

#### Deprecated
- Soon-to-be removed features

#### Removed
- Removed features

#### Fixed
- Bug fixes

#### Security
- Vulnerability fixes

---

## Roadmap

### v0.1.0 - Foundation (Completed)
- [x] Monorepo structure setup
- [x] Database schema implementation
- [x] 30-agent roster definition
- [x] Basic Socket.IO setup
- [x] AgentLobby component

### v0.2.0 - Agora Core (Completed)
- [x] Dynamic summoning engine
- [x] Agora session management
- [x] Discussion arena UI
- [x] Human summoning interface

### v0.2.1 - UX & Auto-Sessions (Completed)
- [x] UX Guide System (Welcome Tour, Help Tooltips)
- [x] Automatic Agora session creation
- [x] User Guide documentation (EN/KO)
- [x] System flow visualization

### v0.3.0 - Signal Intelligence (Completed)
- [x] Signal collection adapters (RSS, GitHub, Blockchain)
- [x] Issue detection system
- [x] Signals/Issues pages

### v0.4.0 - System Operations (Completed)
- [x] Activity log service
- [x] StatusBar component
- [x] Engine room page
- [x] Budget manager

### v0.5.0 - Governance (Completed)
- [x] Proposal system
- [x] Voting mechanism
- [x] Delegation support
- [x] Disclosure reports

### v0.8.0 - Token Integration (Completed)
- [x] MOC token integration
- [x] Token-weighted voting
- [x] Treasury management
- [x] Wallet verification

### v1.0.0 - Production Release (Planned)
- [ ] Full responsive design
- [ ] Integration tests
- [ ] Performance optimization
- [ ] Security audit
- [ ] Mainnet deployment

---

**Note**: This changelog will be updated with every commit as per our documentation policy.
