# Development Status - Algora

This file tracks the current development progress for continuity between sessions.

**Last Updated**: 2026-08-06
**Current Version**: 0.13.1
**Production URL**: https://algora.moss.land

---

## Recent Work: Shared-Ollama `num_ctx` Coordination (2026-08-06)

MOSS.AO sent a memo asking Algora to move `LOCAL_LLM_NUM_CTX` from 8192 to
16384, because the two services share the Ollama host at `192.168.1.65:11434`
and were requesting the same model at different context sizes.

**We made the change.** It is right in direction and free for us. But the memo's
supporting numbers did not survive re-measurement against the host
(Ollama 0.32.5, 2026-08-06), and three of them were wrong in ways that matter
for MOSS.AO's own debugging:

| Claim | Measured |
|---|---|
| Non-resident `num_ctx` "does not complete" (40s timeouts) | Completes. 4.38s at 16384, 4.64s back at 8192 |
| Model load ~60s | **4.3–4.5s** (our own code comment was the stale source) |
| 16384 costs ~+0.15 GB VRAM | **2.89 GB** at 16384 vs **3.03 GB** at 8192 — flat-to-lower |
| Algora calls arrive every ~90s | Every ~30s (2/min) + a `/api/tags` health probe each 60s |

A realistic reproduction — our production cadence against a 3,170-token/16384
request — showed no stall at all: MOSS.AO's call returned in **11.2s**
(`done_reason: stop`), and exactly one of our six calls paid a **4.45s** reload.
So the cost of divergent `num_ctx` is a few seconds per alternation, not an
indefinite hang.

**What the memo got right, and what it missed.** The structural claim holds: the
host keeps **one instance and serves one request at a time**. Confirmed twice —
a second context size never coexists (`/api/ps` shows one entry after
alternating), and a small call fired 8s into a 16.5s generation returned at
16.6s, i.e. it waited. Two consequences the memo did not draw:

- Its "~5 GB free, so this is not capacity" framing implies a second instance
  *could* load. It cannot, at any amount of free VRAM. Converging `num_ctx`
  removes reload thrash but **not** head-of-line blocking; if MOSS.AO stalls
  again, the lever is `OLLAMA_NUM_PARALLEL` on the host, not an env var in
  either app.
- Polling `/api/ps` after the fix caught a **third** `num_ctx` in rotation
  (4096), evicting the agreed 16384 runner. Source:
  `IdeaScorer.SCORING_NUM_CTX = 4096` in MOSS.AO's own scoring path — a
  hard-coded per-call override added as a workaround for this very problem.
  Their idea-triage timeouts were self-inflicted, and the two-party agreement
  they proposed could not hold until that override was removed.

**Resolved.** MOSS.AO confirmed all four corrections against their own
re-measurement and removed the override (`e0468d5`, *"drop SCORING_NUM_CTX — it
became the problem it was added for"*, verified as an ancestor of their deployed
HEAD; `src/` is clean and the removal is pinned by
`assert not hasattr(IdeaScorer, "SCORING_NUM_CTX")`). They also accepted both of
our declines. The host has since held `gemma3:4b ctx=16384` across a continuous
2-minute poll with no flips — one instance, one context size, both services on
it.

**Open, and owned by neither of us:** serialization. `OLLAMA_NUM_PARALLEL` sits
on 192.168.1.65, which neither project can reach from the ao box, so the request
goes to the host admin jointly. Draft in
`docs/ollama-host-parallelism-request.md`.

Their two optional suggestions were **declined with measurements**: moving our
small `fast` calls to `gemma3:1b`, and shortening `keep_alive`, would each put a
second entry in the host's single instance slot and convert a fixed 4.4s load
into continuous thrash. On a one-instance host, staying resident is what makes
us a good neighbour — which is also why `apps/api/.env` already consolidated all
three tiers onto `gemma3:4b`.

**Changes:** `LOCAL_LLM_NUM_CTX=16384` in prod `apps/api/.env` (backup at
`.env.bak.numctx.20260806`) with `algora-api` restarted and verified serving at
`context_length: 16384`; the code default raised to match; and the coordination
constraint documented at both use sites and in `.env.example` so the number is
not changed unilaterally again. The stale `keep_alive` comment claiming "cold
loads cost ~60s" — which the memo cited back at us as authoritative — now
carries the measured figure.

---

## Recent Work: Deliberation Output Fixes + Tier-2 Readiness (2026-08-06)

The operator asked whether Algora should move deliberation to a paid API, as
MOSS.AO did. Measured against the real system, the premise did not transfer —
and the investigation found that the visible quality problems were our own
constants, not the model.

**Why the MOSS.AO precedent does not apply.** Its CHANGELOG records the actual
root cause: *"no Ollama request ever sent `num_ctx`, so the shared server
loaded gemma3:4b at its own 4096 default … generation stopped at exactly
`prompt_eval + eval == 4096` with `done_reason="length"` — which the provider
then discarded, so nothing was ever logged."* That is the same bug fixed here
earlier the same day. After adding `num_ctx=16384`, MOSS.AO hit a second,
infrastructural wall: each distinct `num_ctx` is a separate model instance, and
the congested shared GPU hung every 16k load for ~30 minutes. Their own
conclusion: *"that part is infra, not code."*

> **Update 2026-08-06:** the "~30 minute hang" was never independently
> verified and does not reproduce — a 16k load on that host now measures
> **4.3–4.5s**. The single-instance constraint behind it is real. See
> *Shared-Ollama `num_ctx` Coordination* above.

Algora never reaches that wall. Reconstructing every prompt from the largest
real production session and tokenizing them on the actual Ollama host:
agent statement 752 tokens, final summary 2,859, action items 3,910, and a
synthetic worst case of **4,497 — 55% of the 8,192 window**. Every path is hard
windowed (`slice(-5)`, `getMessages(50)`, `slice(-30)`) with a 400-char cap per
message, so prompts cannot grow with rounds. Zero context-saturation warnings
across all production logs.

**What was actually broken (all local, all free to fix):**

- **Action items were being lost silently, 29–46% of the time.**
  `extractActionItems` ran at `maxTokens: 500`; larger sessions truncated the
  JSON array mid-structure, the `\[[\s\S]*\]` regex then found no match, and
  the function returned `[]` **with no log line** — only successes logged.
  Production evidence: 66 round-advance events, 47 success lines, 0 failure
  lines. Raised to 1,000 (uncapped runs peak at ~600) and the no-match branch
  now warns.
- **45.6% of agent statements were cut mid-word** — by our own
  `cleanResponse().substring(0, 500)`, not by the model, which stops naturally
  at ~80 tokens / 396–663 chars (`done_reason: 'stop'` in 16/16 samples). The
  cap is now 800 and ends on a sentence boundary. `maxTokens: 200` was never
  the binding constraint and is unchanged.
- **`generateRoundSummary` was running within 9 tokens of its 400 cap** — raised
  to 600 before it started failing the same way.
- **One agent could take up to 5 speaking slots in a round** (39.2% of
  round-slots had a repeat), because selection was uniform random over
  participants. `pickSpeaker()` now excludes the recent speakers.
- **16% of statements cited documents that do not exist** ("Section 3.2.1 of
  Document Gamma-7" and similar, which then propagated into decision packets).
  The Docs Librarian persona asked for "quotes documentation standards" while
  no documents are in context; the persona is reworded and the system prompt
  now forbids inventing document, section or protocol identifiers.

**Tier 2 made genuinely usable (still off by default).** Enabling it was not a
matter of flipping a flag — four things would have failed silently:

- `claude-3-haiku-20240307` (retired 2026-04-19) was hard-coded, so every
  Anthropic call would have 404'd and fallen through the provider chain. Model
  ids for all three providers are now env-configurable.
- The budget guard priced **output tokens only**, at a flat rate. Deliberation
  runs ~7:1 input:output, so a nominal $10/day ceiling was really $25–41/day.
  Input tokens are now billed, providers report them, and per-token prices are
  env-configurable — including on existing deployments, where the
  `INSERT OR IGNORE` seed had frozen them at whatever was seeded months ago.
- **A Tier-2 failure did not fall back to Ollama.** It threw; Agora catches a
  throw and substitutes a hard-coded template sentence, stored as a real agent
  statement. An expired key or a spent budget would have filled the public feed
  with governance-sounding text no model produced. Tier-2 requests now degrade
  to the local model, and a Tier-1 request that fails outright throws instead of
  returning empty content (which callers silently swallow).
- **A global flag routes the wrong calls.** Seven of eight deliberation call
  sites hard-code `tier: 1`, and the model-router classifier sends 83.5% of
  debate turns to `critical` on bare substring matches for 'security'/'audit'.
  Flipping the flag would have paid for agent chatter while leaving Decision
  Packets local. Routing is now per-call-site via `AGORA_SYNTHESIS_TIER`,
  covering exactly the three synthesis calls (~143/day).

`ecosystem.config.cjs` no longer pins `LLM_DISABLE_TIER2` and the API keys to
empty strings: pm2 applies that block last and dotenv never overwrites an
already-defined variable, so those lines would have silently defeated a key
placed in `apps/api/.env`.

- Verified: api 76/76, `tsc` clean. The two budget tests were updated to encode
  the new degrade-to-local contract rather than the old throw.

---

## Recent Work: Document Validation Was Eating Proposals (2026-08-06)

With the bridge finally wired (previous entry), the first stale-session
harvest completed three deliberations — and only one produced a proposal.
The other two died in a place nothing was watching: `console.error` writes to
**stderr**, so the failure was in `api-error-<pmid>.log` while every other
orchestrator line went to `api-out-<pmid>.log`.

```
DocumentValidationError: Validation failed for summary: Must be at most 500 characters
  at DocumentManager.validateSummary → AgoraService.integrateWithGovernanceOS
```

`integrateWithGovernanceOS()` creates a Decision Packet **document** and then
calls `handleAgoraSessionCompleted()` — which is what updates the issue and
creates the proposal — inside a single try/catch. The document's `summary`
was the raw LLM-generated `decisionPacket.recommendation`. Past 500
characters, `create()` threw, the throw skipped everything after it, and the
proposal was lost. **12 of 23 decision packets on prod (52%) have a
recommendation over 500 characters**, so roughly half of all deliberations
would have silently failed to produce a proposal.

- **Structural isolation.** Document creation now has its own try/catch. A
  document records the deliberation; governance has to advance without it.
  This is the actual regression fix — the clamping below prevents the
  trigger, this prevents the *class*.
- **Clamping at the boundary.** New `clampTitle`/`clampSummary` in
  `@algora/document-registry` (which owns the limits), exposed as
  `DocumentManager` methods so they read the same config the validator uses
  and cannot drift from it. Applied at all 14 title/summary sites across
  `apps/api`. They normalize whitespace, truncate on a word boundary within
  budget, and — importantly — also handle the **minimum** lengths that
  hand-rolled `.substring(0, 500)` ignored: `minSummaryLength` is 50, so
  `"Detected issue in category ai with low priority"` (46 chars) failed
  validation exactly as a long one did.
- **Two more instances found by adversarial review** (3-lens multi-agent,
  both independently reproduced end-to-end): the governance pipeline's
  `createDocument` adapter silently **discarded the caller's summary** and
  substituted the title, so any issue title under 33 characters produced a
  sub-50-character summary and the pipeline's only document was dropped —
  into `ctx.metadata.documentProduction`, a key nothing in the repo reads.
  And all seven workflow document fallbacks (`'Research findings'`,
  `'Debate findings'`, …) are under 50 characters, so an empty LLM field
  guaranteed a validation throw that unwound past every remaining document in
  that workflow. Both fixed; the pipeline now also logs what it swallows.
- **Tests.** `governance-integration.test.ts` pins the isolation itself (the
  handler still runs when document creation throws — the review correctly
  noted the behavioral half had no test), and the registry suite covers
  clamping against the real validator, split surrogate pairs at the
  truncation point (emoji), space-less Hangul, and non-default configs.
  api 76/76, document-registry 26/26, `tsc` clean.

---

## Recent Work: Zombie Sessions + the ISO-'T' Timestamp Trap (2026-08-06)

Checking whether the live deliberation → proposal path had started firing
turned up something worse upstream: of 6 "active" Agora sessions, **five had
been dead for 8–21 hours** — no messages, no progress — while the hourly
stale-sweeper reported nothing to clean.

**Root cause (one bug, three subsystems).** Most timestamp columns are
written from JS as `new Date().toISOString()` — `2026-08-05T21:27:40.708Z`,
with a `'T'` separator — but were compared against SQLite's
`datetime('now', ...)`, which renders with a **space**. Both are TEXT, so
the comparison is lexicographic, and `'T'` (0x54) sorts after `' '` (0x20):
any row whose date component matches the cutoff's compares as *greater*
regardless of its time. Measured on production:

- **Staleness (`<`) matched nothing until the UTC date rolled over.** Stale
  sessions accumulated all day, then 72 were closed in a single batch just
  after midnight. The sweeper query found 0 of 5 genuinely stale sessions
  at audit time; the ISO-bound version found all 5.
- **Recent-window counts (`>`) were inflated.** The dashboard reported
  3,547 signals in 24h against a true 2,404 (+47%).
- **The proposal queue lagged ~24h per stage** — already fixed in the
  earlier loop work, before the pattern was recognized as systemic.
- **Wallet-verification nonces did not expire on time.** `expires_at >
  datetime('now')` kept same-day nonces valid, stretching the intended
  15-minute signature-replay window to end-of-UTC-day. Ended token votings
  and expired delegations had the same flaw.

**Fix.** A documented `apps/api/src/utils/time.ts` (`isoNow`, `isoAgo`,
`isoMinutesAgo`, `isoHoursAgo`, `isoDaysAgo`) produces ISO-8601 bounds that
compare correctly against ISO columns *and* keep index usage — unlike
wrapping the column in `datetime(col)`. Applied to every affected site
across signal/activity stats, pipeline health, issue detection, proposal
stats, the Agora sweep, and token/delegation expiry. Columns genuinely
written by SQL `DEFAULT CURRENT_TIMESTAMP` (`issues.created_at`,
`signals.created_at`, the trust tables) were verified individually and left
comparing against `datetime('now')`, which is correct for them.

**Second defect found in the same audit: swept sessions were thrown away.**
`cleanupStaleSessions()` only flips status to `'completed'` — no summary, no
decision packet, no governance integration — so every swept session was a
dead end for the proposal pipeline. Since in-memory round timers do not
survive an API restart (six deploys on 08-05 alone), that was the normal
path, not the exception: **2,176 completed sessions but only 20 decision
packets.** A new bounded `harvestStaleSessions()` now runs first each hour
and puts orphans that actually deliberated (≥5 agent messages) through the
real `completeSession()` flow — summary → decision packet → bridge →
proposal. The sweep now preserves harvest-eligible sessions until a 6-hour
escape hatch, so the harvest bound is meaningful and a permanently failing
session still gets closed.

**Third finding: hourly maintenance lost an hour on every restart.**
`setInterval` only fires after a full period, so each auto-deploy restart
bought 60 minutes with no proposal-queue or stale-session maintenance —
and with eight deploys on 08-05, deploys landing under an hour apart would
mean those jobs effectively never run. Both now also run once ~3 minutes
after boot (`scheduleBootKick`), which matters most for the stale sweep:
a restart is precisely what orphans in-flight sessions.

- Tests: `utils/time.test.ts` pins the trap itself (both `<` and `>`
  directions, skipping the vacuous just-after-midnight case) and
  `services/agora-stale.test.ts` covers the sweep/harvest interaction
  (zombie detection, preservation, hard-close escape hatch, boot-recovery
  behavior). Full api suite 71/71, `tsc` clean.

---

## Recent Work: Live Governance Integration Reconnected + LLM Context Fix (2026-08-06)

Prompted by the operator's report that moss-ao's local-LLM deliberations
were failing on large (16k-token) prompts, an audit of Algora's Ollama-only
deliberation stack found two silent faults of the same family:

- **The local LLM's effective context was ~2,048 tokens.** The Ollama call
  set `num_predict` but never `num_ctx`, so the server default applied —
  measured empirically at ~2048 by sending a 9k-word probe prompt
  (`prompt_eval_count: 2051`). Ollama silently truncates anything longer,
  so the final-summary prompt (~3.4k tokens: last 30 messages × 400-char
  cap) was losing its head on every call — summaries "succeeded" while
  reading only a fragment of the transcript. Every tier-1 call now requests
  `num_ctx` explicitly (`LOCAL_LLM_NUM_CTX`, default 8192 — 2x headroom
  over the largest current prompt; gemma3:4b supports 128k), and a
  saturation check logs a WARN whenever `prompt_eval_count` fills the
  window, so an outgrown prompt is a log line instead of a quality mystery.
- **The live deliberation → governance path was never wired.**
  `AgoraService` is constructed twice: socket.ts passes the GovernanceOS
  bridge, but issue-detection.ts constructs its own instance *before the
  bridge exists* — and that instance runs all auto-spawned deliberations.
  Result: every completion logged "GovernanceOS Bridge not available,
  skipping integration" (19× on 08-05 alone) — no DP documents, no
  pipeline, no live proposal creation even at 95% consensus; the hourly
  backfill was the only thing creating proposals. `AgoraService` now has a
  `setGovernanceOSBridge()` setter and `IssueDetection.
  setGovernanceOSBridge()` forwards the bridge to its internal
  orchestrator, so completions integrate in real time.
- Verified: api suite 62/62, `tsc` clean. Post-deploy, session completions
  should log `[GovernanceOSBridge] Handling Agora session completion` and
  strong-consensus (≥70%, ≥3 rounds, high/critical issue) completions
  create proposals immediately instead of waiting for the backfill.

---

## Recent Work: Deliberation → Proposal → Resolution Loop Closed (2026-08-06)

Once the 2026-08-05 stabilization work landed, the dormant creation side of
the governance funnel woke up on its own: the hourly
`backfillMissingProposals` job produced 7 draft proposals from completed
Agora deliberations (its first successful run ever — the crash loop had
always killed the API before the scheduler could do this). Tracing the
funnel end-to-end then showed it dead-ended twice before any issue could
ever reach `resolved`:

- **`resolveCompletedVotings()` had no caller.** The voting → passed/
  rejected transition (and the linked issue's `resolved`/`detected` update —
  the only code path that ever resolves an issue) existed but was never
  invoked from anywhere. It now runs as stage 3 of the hourly proposal
  queue: draft → discussion → voting → **resolution**.
- **Same-day timestamps never compared as expired.** The queue's three time
  gates compared ISO-`'T'` timestamps against `datetime('now')`, which
  renders with a space separator — and in a string comparison `'T'` (0x54)
  sorts after `' '` (0x20), so a gate crossed at 10:00 was not recognized
  until the *date* changed (up to ~24h lag per stage). All three queries now
  compare against a JS ISO cutoff parameter.
- **Issues were left expiry-exposed while their proposal was in flight.**
  Proposal creation left the linked issue in `detected`, so the 7-day
  auto-expiry janitor could dismiss it mid-pipeline (the pipeline itself
  takes ~4 days). The bridge now parks the issue in `pending_vote` (never
  auto-expired; reverted to `detected` on rejection by
  `resolveCompletedVotings`, resolved on pass).
- **Rejected proposals no longer block re-proposal.** The dedup guard
  matched ANY existing proposal for the issue, including terminal
  `rejected`/`cancelled` ones — but the rejection path deliberately reverts
  the issue to `detected` "for re-discussion", which could then never
  produce a new proposal. The guard now ignores terminal proposals.
- **Tests.** New `governance/proposal.test.ts` (8 tests, in-memory SQLite)
  pins the resolution semantics: passive pass on zero votes, tally
  pass/reject, issue resolve/revert (only from in-flight statuses),
  same-day-expiry regression, unparseable-tally fail-open, history logging,
  and the soak-promotion path. Full api suite 62/62, `tsc` clean.

The end-to-end cycle is now: signal → issue (detected) → Agora deliberation
→ proposal (draft, issue → pending_vote) → discussion (24h soak) → voting
(48h) → passed/rejected → issue resolved / reverted for re-discussion.
Human sovereignty is preserved at every stage: proposals soak in
discussion where holders can intervene, votes count when cast, and
zero-vote passive approval only applies to agent-recommended,
demo-labeled actions.

---

## Recent Work: Auto-Deploy pm2 Config Bleed Fixed (2026-08-05)

Prod `algora-api` was stopped and SIGKILLed every 5 minutes for ~2.5 hours
(05:26–08:03 UTC), starting right after the first real auto-deploys. Root
cause: pm2 flattens a managed process's config into its child environment,
so inside the `algora-deploy` cron process (`cron_restart: '1-59/5 * * * *'`,
`autorestart: false`) those keys are literal env vars — and `pm2 restart
--update-env` in `scripts/deploy.sh` merges the CLI's environment into the
target's stored config. `algora-api` inherited the deploy poller's 5-minute
cron_restart on the 05:21 deploy and pm2 dutifully restarted it every tick
after. Verified empirically on the box (pm2 7.0.3): a plain restart with the
same poisoned environment does NOT bleed; `--update-env` transfers both
`cron_restart` and `autorestart: false`. The diagnosis then reproduced
itself live: while this fix was in review, the still-deployed old script
deployed PR #8 (a web change) at 08:11 UTC and poisoned `algora-web` the
same way.

- **`--update-env` dropped** from both restart calls in
  `build_and_restart()` (rollback shares the same path). Nothing relied on
  it: the API reads `apps/api/.env` itself via dotenv at boot, web bakes
  `NEXT_PUBLIC_*` at build time, and ecosystem env changes already require
  manual re-registration (the script logs a NOTE for that case).
- **Environment scrub.** The script prologue now `unset`s the flattened
  pm2 config keys (`cron_restart`, `autorestart`, `watch`, `instances`,
  `exec_mode`, `max_memory_restart`, `node_args`, `name`, `namespace` —
  list kept in sync with the sibling pollers' fix, agentic-orchestrator
  PR #2949), so even a future reintroduction of `--update-env` (or any
  other env-merging pm2 call) has nothing poisonous to merge.
- **Config-bleed tripwire, every tick.** `check_config_bleed()` parses
  `pm2 jlist` on every 5-minute tick (external causes) and again right
  after the script's own restarts (immediate detection), flagging a
  cron_restart OR a disabled autorestart (boolean or string `"false"` —
  the other half of the demonstrated bleed, which would silently disable
  crash recovery) on `algora-api`/`algora-web`. It fails open — a broken
  check never blocks a deploy — but loudly: an unparseable `pm2 jlist`
  logs its own WARN instead of masquerading as a clean pass. Covered by a
  fixture harness (clean roster, each bleed shape, banner-polluted jlist,
  missing node).
- **Recovery guidance corrected.** The ECOSYSTEM_CHANGED NOTE used to
  recommend `pm2 restart ecosystem.config.cjs --update-env && pm2 save`,
  which cannot clear a poisoned key (pm2 merges but never removes — even
  an explicit `--cron-restart 0` fails on 7.0.3) and whose `pm2 save`
  would have persisted the poison across reboots. Both the NOTE and the
  tripwire WARNING now prescribe the only reliable form:
  `pm2 delete <app> && pm2 start ecosystem.config.cjs --only <app> && pm2 save`.
- **Alert webhook registration hardened.** `ecosystem.config.cjs` now
  reads `DEPLOY_ALERT_WEBHOOK` from the root `.env` (same minimal parse as
  the `ALGORA_AUTO_DEPLOY` gate), so configuring alerts no longer depends
  on the variable happening to be exported in whichever shell registered
  the poller. (No webhook is configured on the box yet — alerts are
  log-only until one is added.)
- **Server state cleaned:** `algora-api` and `algora-web` deleted and
  re-registered from `ecosystem.config.cjs` (new pm2 ids 44/47, so logs
  rotated to `api-*-44.log`/`web-*-47.log`), `pm2 save` re-run; verified
  cron-free, `autorestart: true` intact, and healthy across subsequent
  poller ticks.
- **Same disease elsewhere on the box:** pm2 logs show sibling projects'
  apps (e.g. `oracle-web`) being cron-bounced at :00 seconds — the other
  moss-ao-family deploy pollers this script was adapted from likely carry
  the same `--update-env` bug. Flagged for their own repos; out of scope
  here.

---

## Recent Work: Vacuous Governance-Proposal Detections Fixed (2026-08-05)

Keyword pattern conditions in the L1 issue-detection service evaluated
against `${signal.description} ${signal.source}`, so any signal whose
*source name* contains a pattern keyword satisfied the condition regardless
of content. The seeded source `github:ethereum/EIPs` (category `protocol`)
contains `EIP`, so every housekeeping event from that repo (`eth-bot
performed IssueCommentEvent`, ~630 signals per 7 days) fully matched the
`governance-proposal` pattern — **616 junk `[New Governance Proposal]`
issues** on prod, still ~8/day after the flood-dedup fix. Prod's
keyword-named social sources (`HN Governance`, `Uniswap Governance`) had the
same exposure.

- **Keyword haystack = description only.** `evaluateCondition` no longer
  folds `signal.source` into keyword matching; source matching is what the
  dedicated `source` condition type is for (`fear-extreme` and
  `mossland-update` use it deliberately). This also de-fangs keyword-named
  sources without renaming them.
- **Bot severity floor.** GitHub collector events by bot actors (`*[bot]`
  suffix, `eth-bot`, `dependabot`, `renovate`) are floored to `low` severity
  in `formatEvent` — they stay in the activity feed but can no longer
  escalate severity-gated detection patterns.
- **Unit tests.** New `apps/api/src/services/issue-detection.test.ts` runs
  `matchPattern`/`evaluateCondition` against the real pattern config
  (`IssueDetectionService.PATTERNS`, now a static): the EIPs bot-comment
  regression, true positives (real EIP/governance content still matches),
  category gating, source-condition behavior, and the bot floor.
- Verified: 10 new tests, full api suite 54/54, `tsc` build clean.

---

## Recent Work: API Crash-Loop Fix (2026-08-05)

Prod `algora-api` crashed ~57x/day on 2026-08-04, every time with the same
stack: `SqliteError: FOREIGN KEY constraint failed` in
`AgoraService.addMessage` via `handleRoundTimeout`. Root cause chain: the
orchestrator inserts round-summary messages as `bridge-moderator`
(`ORCHESTRATOR_CONFIG.orchestratorAgentId`), but `seedAgents()` only ran on
manual `pnpm db:init`, so prod's `agents` table kept a pre-`bridge-moderator`
roster while the code moved on → FK failure → unhandled rejection from the
unguarded `setInterval(() => checkTimeouts())` → Node 22 kills the process →
pm2 restart. (Crashes stopped 2026-08-05 03:09 UTC when the roster was
manually reseeded.) Hardening shipped:

- **Guarded session timer.** The 30s timeout-checker interval catches and
  logs instead of leaking rejections; 3 consecutive failures force-complete
  the session and stop its timer (a persistent failure must not re-run the
  LLM-calling timeout handlers every 30s forever). The round timer now
  resets before the handler body, so a mid-flight failure can't re-post the
  same round summary on the next tick.
- **Roster seeding at boot.** `seedAgents(db)` runs on every API start via a
  targeted upsert (`ON CONFLICT(id) DO UPDATE` of definition columns only),
  so the DB roster tracks the code roster while operator-managed columns
  (`is_active`, `expertise`, `avatar_url`, `created_at`) survive restarts.
- **Process-level handlers.** `unhandledRejection` → log + keep serving;
  `uncaughtException` → log + exit(1) for a clean pm2 restart with a marker.
- Verified: tsc build + 44/44 tests; adversarial multi-agent review (11
  agents) confirmed 2 real issues in the first draft — REPLACE-based seeding
  clobbering operator columns, and the catch converting the crash into an
  unbounded 30s LLM retry loop — both fixed as above.

---

## Recent Work: Issue-Flood Cleanup + Lifecycle Fixes (2026-08-05)

The L1 issue-detection service had accumulated **4,956 permanently-open
issues** in prod (~100–200/day since 2026-06-17) and, as a side effect,
auto-spawned **2,163 Agora LLM debate sessions** (token cost). Three root
causes: no code path ever closed an issue; the threshold-alert dedup compared
`category = '%'` for wildcard thresholds (an equality that never matches); and
pattern dedup relied only on an in-memory cooldown that resets on every pm2
restart (algora-api restarts frequently).

- **Threshold-alert dedup fixed.** An alert is skipped while an issue for the
  same threshold is open and recent (title-prefix match, 6h re-arm bound),
  instead of the broken category comparison; the bound keeps one stale open
  alert from suppressing a new, distinct surge indefinitely.
- **Pattern-issue dedup.** While a recent issue from the same pattern is open
  (re-arm window: 6h critical/high, 24h medium/low), new matches fold their
  signals into it — `issue_signals`, the denormalized `signal_ids` column
  (read by the web UI signal counts, pipeline-health, orchestrator bridge),
  `updated_at`, plus an `issue:updated` emit — instead of creating another
  issue, which also stops the duplicate Agora sessions and documents.
- **Auto-expiry janitor.** Each 2-minute detection cycle dismisses
  `detected`/`confirmed` issues untouched (by `updated_at`) for
  `ISSUE_AUTO_EXPIRE_DAYS` (default 7); `in_progress` gets a 3x horizon and
  mid-governance statuses (`pending_vote`, `approved_for_action`, ...) are
  never auto-expired. Explicit `0` disables; empty/invalid falls back to 7
  with a warning so a config typo can't silently disable it. Emits
  `issue:updated` per dismissal; logged as `ISSUE_AUTO_EXPIRED`.
- **Stats fix.** `openIssues` in `/api/stats` counted a nonexistent `'open'`
  status; now counts `detected`/`confirmed`/`in_progress`.
- **One-time prod cleanup.** Online-backed-up `algora.db`
  (`data/algora.db.backup-issues-cleanup-20260805`), then dismissed 4,094
  stale (>7 days) + 852 duplicate open issues → **10 open remain** (newest per
  pattern/alert group).
- Verified: `apps/api` tsc build passes (all 8 workspace packages), 44/44
  tests pass; adversarial multi-agent review (13 agents) confirmed 7 findings
  (dedup swallowing distinct events, janitor dismissing mid-governance work,
  stale `signal_ids`, env-parsing footgun) — all addressed by the re-arm
  bounds, `updated_at`-keyed staleness + status scoping, `signal_ids` sync,
  and strict env parsing above.

---

## Recent Work: Per-Page SEO Metadata + PWA Polish (2026-06-29)

Audited the web app's metadata basics (favicon, title, OG, Twitter, manifest,
robots, sitemap) — all present and correct. The one real gap: every sub-page
was a Client Component, so all ~39 indexable locale URLs inherited the home
page's single title/description and the `%s · Algora` template was dead code.

- **Per-page metadata.** Split each of the 15 sub-pages (incl. `issues/[id]`)
  into a thin Server `page.tsx` that exports `generateMetadata` (new
  `apps/web/src/lib/seo.ts`) and renders the original client component, now
  `*View.tsx` (byte-identical — no content drift). Public routes get a
  localized title (reusing `Navigation` labels), a section description
  (reusing `<Namespace>.subtitle`), a self-canonical, and in-`<head>` hreflang
  alternates; `admin`/`profile` get `noindex`.
- **PWA / social polish.** `theme-color` is now light/dark-aware; the Twitter
  image carries `alt`; manifest `orientation` relaxed to `any`; added dedicated
  full-bleed maskable icon variants (192/512) split from the bold `any` icons.
- Verified: `apps/web` typecheck + production build pass, lint clean; curl
  confirms localized titles/descriptions/canonical/hreflang across en/ko/ja/zh,
  `noindex` on admin, and og:image still absolute on sub-pages; adversarial
  multi-agent review found no blocker.

---

## Recent Work: Write-Path Hardening + Honest Mock Labeling (2026-06-27)

The wallet-connect and EIP-712 signature layers are real, but MOC balances,
voting power, and the treasury are simulated demo data (mock balance = hash of
the wallet address; treasury allocate/approve/disburse are SQLite status flips
with no on-chain transfer). Two coordinated changes addressed this:

- **Closed the public write control plane.** ~40 operational write endpoints
  across 15 routers that were reachable unauthenticated now require
  `requireAdmin`. Public interactive endpoints the live showcase depends on
  (wallet verify, token vote, agent summon/dismiss, Agora session create/message,
  alert acknowledge) stay public but are rate-limited via `writeLimiter`.
- **Votes are now wallet-signed.** `POST /api/token/voting/:proposalId/vote`
  requires a valid EIP-712 signature (anti-forgery + anti-replay); added
  `GET /api/token/voting/:proposalId/typed-data` and frontend signing.
- **Delegation is now wallet-signed.** Create/revoke moved off the admin key to
  public-but-signed (EIP-712 `Delegation`, single-use nonce; revoke also checks
  delegator ownership). Lets any connected holder delegate while blocking forgery.
- **Honest labeling.** Surfaced `MockDataBadge` across 15 components so simulated
  money is clearly marked (real on-chain ETH balance left unbadged).
- **Demo fixes.** Restored the public Tier-1 translation toggle (dropped
  `requireAuth`, kept `llmLimiter`); fixed the decision-packet "Generate Analysis"
  false-success toast so a failed (admin-gated) run shows an honest error.
- Verified: `apps/api` typecheck clean + 44 tests pass; `apps/web` typecheck clean;
  adversarial multi-agent review (gating, EIP-712 flows, regressions) found no
  blocker/major.
- Next: native SIWE per-user sessions (WS-1) to replace the shared admin key.

---

## Current Phase: Algora v2.0 Upgrade - Agentic Governance OS

### v2.0 Upgrade Plan
See [docs/algora-v2-upgrade-plan.md](docs/algora-v2-upgrade-plan.md) for the complete upgrade plan.

### Phase 1: Safe Autonomy Foundation (COMPLETED)
- [x] `@algora/safe-autonomy` package created
- [x] Risk Classifier - Action risk taxonomy (LOW/MID/HIGH)
- [x] Lock Manager - LOCK/UNLOCK mechanism for dangerous actions
- [x] Approval Router - Human review routing with Director 3 priority
- [x] Passive Consensus - Opt-out approval model with auto-approve timeout
- [x] Retry Handler - Delay-retry with exponential backoff
- [x] Full TypeScript types for Safe Autonomy layer
- [x] In-memory storage implementations for development

### Phase 2: Orchestrator + State Machine (COMPLETED)
- [x] `@algora/orchestrator` package created
- [x] Primary Orchestrator class - Central coordinator for governance workflows
- [x] Workflow State Machine - 12 states (INTAKE → OUTCOME_PROOF)
- [x] TODO Manager - Persistent task continuation with exponential backoff
- [x] Specialist Manager - Subagent coordination with quality gates
- [x] Full TypeScript types for workflows, issues, specialists
- [x] Event system for workflow monitoring
- [x] In-memory storage implementations for development

### Phase 3: Document Registry (COMPLETED)
- [x] `@algora/document-registry` package created
- [x] Document Manager - CRUD operations for 15 official document types
- [x] Version Manager - Semantic versioning, diff tracking, branching
- [x] Provenance Manager - Origin tracking, agent contributions, integrity proofs
- [x] Audit Manager - Immutable audit trail, compliance reporting
- [x] Full TypeScript types for documents, versions, provenance, audit
- [x] Document state machine (draft → pending_review → in_review → approved → published)
- [x] In-memory storage implementations for development

### Phase 4: Model Router (COMPLETED)
- [x] `@algora/model-router` package created
- [x] Model Registry - Model management with health checks
- [x] Task Difficulty Classifier - 5 difficulty levels (trivial → critical)
- [x] Model Router - Intelligent task-to-model routing with fallback
- [x] Quality Gate - Output validation with custom validators
- [x] Embedding Service - Text embeddings for RAG with caching
- [x] Reranker Service - Document reranking for improved retrieval
- [x] Default model lineup for Tier 1 (local) and Tier 2 (external)
- [x] Budget management with daily limits and warnings

### Phase 5: Dual-House Governance (COMPLETED)
- [x] `@algora/dual-house` package created
- [x] House Manager - MossCoin House and OpenSource House definitions
- [x] Member Management - Token holders and contributor membership
- [x] Voting Power - Token-weighted (MOC) and contribution-weighted (OSS)
- [x] Dual-House Voting - Parallel voting with quorum and threshold checks
- [x] Vote Delegation - Proxy voting with scope options (all/category/proposal)
- [x] Reconciliation Manager - Conflict resolution when houses disagree
- [x] Director 3 Decision - Override, revote, veto, or conditional approval
- [x] High-Risk Approval - LOCK/UNLOCK for dangerous actions requiring dual approval
- [x] Full TypeScript types for governance, voting, reconciliation
- [x] Event system for governance monitoring
- [x] In-memory storage implementations for development

### Phase 6: Governance OS Integration (COMPLETED)
- [x] `@algora/governance-os` package created
- [x] Unified Integration Layer - GovernanceOS class integrating all v2.0 packages
- [x] Pipeline System - 9-stage governance pipeline (signal_intake → outcome_verification)
- [x] Subsystem Integration
  - [x] Safe Autonomy integration (LOCK/UNLOCK, risk classification)
  - [x] Orchestrator integration (workflow management)
  - [x] Document Registry integration (official document production)
  - [x] Model Router integration (LLM task routing)
  - [x] Dual-House integration (voting and approval)
- [x] Event System - Unified event propagation across all subsystems
- [x] Statistics Tracking - Pipeline metrics, LLM costs, voting sessions
- [x] Health Check API - Component status monitoring
- [x] Configuration System - GovernanceOSConfig and WorkflowConfigs
- [x] Factory Functions - createGovernanceOS, createDefaultGovernanceOS

### Phase 7: Workflow Implementation & API Integration (COMPLETED)

#### Step 1: API Integration (COMPLETED)
- [x] GovernanceOSBridge service for apps/api integration
- [x] REST API endpoints for Governance OS:
  - [x] Pipeline endpoints: `/governance-os/pipeline/run`, `/governance-os/pipeline/issue/:id`
  - [x] Document endpoints: `/governance-os/documents`, `/governance-os/documents/:id`, `/governance-os/documents/type/:type`
  - [x] Voting endpoints: `/governance-os/voting`, `/governance-os/voting/:id`, `/governance-os/voting/:id/vote`
  - [x] Approval endpoints: `/governance-os/approvals`, `/governance-os/approvals/:id/approve`
  - [x] Risk/Lock endpoints: `/governance-os/risk/classify`, `/governance-os/locks/:id`
  - [x] Model router endpoint: `/governance-os/model-router/execute`
  - [x] Stats/Health endpoints: `/governance-os/stats`, `/governance-os/health`, `/governance-os/config`

#### Step 2: Workflow Handlers (COMPLETED)
- [x] **Workflow A: Academic Activity** (`workflow-a.ts`)
  - [x] Types: AcademicSource, ResearchTopic, AcademicPaper, ResearchBrief
  - [x] Types: TechnologyAssessment, ResearchDigest, WorkflowAConfig
  - [x] WorkflowAHandler class with executeResearchPhase(), executeDeliberationPhase()
  - [x] generateResearchDigest() for weekly digest documents
  - [x] generateTechnologyAssessment() for formal assessments
  - [x] shouldGenerateAssessment() threshold detection
  - [x] Integration with Orchestrator (executeWorkflowA method)
  - [x] Tests: 12 test cases, all passing

- [x] **Workflow B: Free Debate** (`workflow-b.ts`)
  - [x] Types: DebateSource, DebateCategory, DebatePhase, DebateTopic
  - [x] Types: DebateArgument, DebateThread, ConsensusAssessment, DebateSummary
  - [x] WorkflowBHandler class with initializeDebate(), executeDebatePhase()
  - [x] executeFullDeliberation() for complete 5-phase debates
  - [x] assessConsensus() for consensus calculation
  - [x] generateDebateSummary() for official summary documents
  - [x] Red Team challenge generation in rebuttals phase
  - [x] Integration with Orchestrator (executeWorkflowB method)
  - [x] Tests: 13 test cases, all passing

- [x] **Workflow C: Developer Support** (`workflow-c.ts`)
  - [x] Types: GrantStatus, GrantCategory, MilestoneStatus, RewardStatus
  - [x] Types: GrantApplication, GrantMilestone, DeveloperGrant, MilestoneReport
  - [x] Types: RetroactiveReward, GrantProposal, ApplicationEvaluation, MilestoneReview
  - [x] WorkflowCHandler class with processGrantApplication(), evaluateApplication()
  - [x] processMilestoneReport() for milestone tracking
  - [x] processRetroactiveReward() for retroactive reward nominations
  - [x] Dual-House approval integration (MossCoin + OpenSource)
  - [x] Director 3 approval for high-value grants (>$5,000)
  - [x] LOCK mechanism for fund disbursements
  - [x] Integration with Orchestrator (executeWorkflowC, processMilestoneReport, processRetroactiveReward)
  - [x] Tests: 19 test cases, all passing

- [x] **Workflow D: Ecosystem Expansion** (`workflow-d.ts`)
  - [x] Types: ExpansionOrigin, OpportunityCategory, OpportunityStatus, PartnershipStatus
  - [x] Types: ExpansionOpportunity, OpportunityAssessment, PartnershipProposal
  - [x] Types: PartnershipAgreement, EcosystemReport, DetectedSignal
  - [x] Types: AlwaysOnConfig, AntiAbuseConfig for intake management
  - [x] WorkflowDHandler class with processCallBasedOpportunity(), processAlwaysOnSignal()
  - [x] assessOpportunity() with SWOT analysis
  - [x] createPartnershipProposal() with approval requirements
  - [x] createPartnershipAgreement() with LOCK mechanism
  - [x] generateEcosystemReport() for periodic reporting
  - [x] Anti-spam guardrails (rate limiting, deduplication, quality filters)
  - [x] Dual-House approval for partnerships (>$1,000)
  - [x] Director 3 approval for high-value deals (>$10,000) or high-risk categories
  - [x] Tests: 21 test cases, all passing

- [x] **Workflow E: Working Groups** (`workflow-e.ts`)
  - [x] Types: WorkingGroupStatus, CharterDuration, WGDocumentType, WGProposalOrigin
  - [x] Types: WorkingGroupProposal, WorkingGroupCharter, WGPublishingRules
  - [x] Types: WorkingGroup, WGStatusReport, WGDissolutionRequest, IssuePattern
  - [x] WorkflowEHandler class with processWGProposal(), evaluateProposal()
  - [x] createCharter() for charter creation from approved proposals
  - [x] activateWorkingGroup() to activate WG from charter
  - [x] canPublishDocument() and recordPublication() for publishing authority
  - [x] generateStatusReport() for WG status reports
  - [x] processDissolulutionRequest() for WG dissolution
  - [x] detectPatterns() for auto-proposal issue pattern detection
  - [x] generateAutoProposal() for orchestrator-initiated WG proposals
  - [x] Dual-House approval for all WG formations
  - [x] Director 3 approval for high-budget WGs (>$5,000)
  - [x] Tests: 31 test cases, all passing

**Total Orchestrator Tests: 96 passing**

### Phase 8: Frontend UI Integration & v2.0 Completion (COMPLETED)
- [x] Governance OS API types in `apps/web/src/lib/api.ts`
  - [x] PipelineStage, PipelineStatus types
  - [x] DocumentType, DocumentState, GovernanceDocument types
  - [x] DualHouseVote, HouseType for voting
  - [x] LockedAction, RiskLevel for safe autonomy
  - [x] WorkflowStatus, GovernanceOSStats, GovernanceOSHealth
  - [x] API functions: fetchGovernanceOSStats, fetchDocuments, fetchDualHouseVotes, etc.
- [x] Governance OS components (`apps/web/src/components/governance/`)
  - [x] PipelineVisualization - 9-stage pipeline display with progress
  - [x] WorkflowCard - Workflow type cards (A-E) with stats
  - [x] DocumentCard - Official document cards with state badges
  - [x] DualHouseVoteCard - Dual-house voting progress and status
  - [x] LockedActionCard - Safe autonomy action cards with approval tracking
- [x] Governance OS page (`apps/web/src/app/[locale]/governance/page.tsx`)
  - [x] Dashboard overview with stats cards
  - [x] Tab navigation (Overview, Workflows, Documents, Voting, Approvals)
  - [x] Pipeline visualization
  - [x] TanStack Query integration for data fetching
- [x] Navigation updates
  - [x] Added "Governance OS" menu item to Sidebar with NEW badge
- [x] i18n translations (EN/KO)
  - [x] Governance section with all UI strings
  - [x] Pipeline stage names
  - [x] Document states
  - [x] Voting status
  - [x] Safe autonomy status
- [x] Backend API endpoints connection
  - [x] GovernanceOSBridge new methods (listAllDocuments, listAllVotings, listAllApprovals, getWorkflowStatuses)
  - [x] New REST endpoints: GET /documents, GET /voting, GET /approvals, GET /workflows
  - [x] Frontend API functions connected to real endpoints (mock data removed)
  - [x] WittyLoader/WittyMessage extended with 'governance' category
- [x] **Agent Clusters Expansion (30→38 agents)**
  - [x] Added new cluster types: 'orchestrators', 'archivists', 'red-team', 'scouts'
  - [x] 8 new agents: Nova Prime, Atlas (orchestrators), Archive Alpha, Trace Master (archivists),
        Contrarian Carl, Breach Tester, Base Questioner (red-team), Horizon Seeker (scouts)
  - [x] Updated i18n translations for new groups (EN/KO)
- [x] **Real-time Socket.IO for Governance Events**
  - [x] New broadcast functions in `apps/api/src/services/socket.ts`:
        - broadcastDocumentCreated, broadcastDocumentStateChanged
        - broadcastVotingCreated, broadcastVoteCast, broadcastVotingStatusChanged
        - broadcastActionLocked, broadcastActionUnlocked, broadcastDirector3Approval
        - broadcastPipelineProgress, broadcastWorkflowStateChanged, broadcastHealthUpdate
  - [x] New frontend hook in `apps/web/src/hooks/useSocket.ts`:
        - GovernanceEvent type with 11 event types
        - useGovernanceEvents hook for subscribing to multiple events
- [x] **Operational KPIs Instrumentation**
  - [x] New KPI module: `packages/governance-os/src/kpi.ts`
        - DecisionQualityMetrics (DP completeness, option diversity, red team coverage)
        - ExecutionSpeedMetrics (signal-to-issue, issue-to-DP, end-to-end timing)
        - SystemHealthMetrics (uptime, LLM availability, queue depth, error rate)
  - [x] KPICollector class with recordSample, recordHeartbeat, recordOperation, recordExecutionTiming
  - [x] 7 new API endpoints in `apps/api/src/routes/governance-os.ts`:
        - GET /kpi/dashboard, /kpi/decision-quality, /kpi/execution-speed
        - GET /kpi/system-health, /kpi/alerts, /kpi/targets, /kpi/export
- [x] **Security Spam Protection (Anti-Abuse Guard)**
  - [x] New module: `packages/safe-autonomy/src/anti-abuse.ts`
        - AntiAbuseGuard class with rate limiting, deduplication, quality filtering
        - Blacklist management, cooldown after rejection
        - Multiple source validation requirement
        - Topic hash generation for deduplication
- [x] **E2E Pipeline Tests**
  - [x] New test file: `packages/governance-os/src/__tests__/e2e-pipeline.test.ts`
        - Full Pipeline Execution tests (LOW/MID/HIGH risk)
        - Document Registry Integration tests
        - Dual-House Voting Integration tests
        - Model Router Integration tests
        - KPI Collector Integration tests
        - Health Monitoring tests
        - Pipeline Stage Verification (9 stages)
        - Workflow Type Coverage (A, B, C, D, E)
- [x] **Ollama Model Integration**
  - [x] New provider: `packages/model-router/src/providers/ollama.ts`
        - OllamaProvider class for local LLM inference
        - Chat and generate API support
        - Embedding support for RAG
        - Health checks and model listing
        - Pull model functionality
        - OLLAMA_INSTALL_COMMANDS and OLLAMA_HARDWARE_REQUIREMENTS constants
  - [x] OllamaLLMProvider adapter for ModelRouter
  - [x] Factory functions: createOllamaModelRoutingSystem, createOllamaModelRoutingSystemWithDefaults

### Phase 11: Shadcn UI Integration & Mobile Responsive (COMPLETED)
- [x] **Shadcn UI (Radix UI) Component Library**
  - [x] 14 base components: Button, Card, Dialog, Sheet, DropdownMenu, Tooltip, Tabs, Badge, Command, ScrollArea, Avatar, Separator, Popover, Toast
  - [x] CVA (class-variance-authority) for component variants
  - [x] Tailwind CSS variable theming mapped to agora brand colors
  - [x] `tailwindcss-animate` plugin integration
  - [x] `components.json` Shadcn config (New York style)
- [x] **Layout Migration**
  - [x] MobileNav → Shadcn Sheet (better animations, accessibility)
  - [x] Header → Shadcn Tooltips for mobile status indicators
  - [x] GlobalSearch → Shadcn CommandDialog (cmdk-based command palette)
  - [x] AlertDropdown → Shadcn Popover + ScrollArea
- [x] **Component Migration**
  - [x] AccessibleModal → Shadcn Dialog wrapper (same external API)
  - [x] AccessibleDropdown → Shadcn DropdownMenu wrapper
  - [x] HelpTooltip → Shadcn Tooltip with self-contained TooltipProvider
  - [x] StatsCard/AnimatedCard → dark mode support, responsive padding
- [x] **Page-level Responsive Improvements**
  - [x] Dashboard: 2x2 stats grid on mobile, Card+ScrollArea for activity feed
  - [x] Agora: Sheet-based sidebars on mobile, iOS safe-area input support
- [x] **i18n Updates**
  - [x] Search namespace added (EN/KO)
  - [x] Activity.types.PIPELINE added (EN/KO)
- [x] **Accessibility**
  - [x] DialogTitle for CommandDialog (screen reader support)
  - [x] 44px minimum touch targets on mobile
  - [x] Keyboard navigation via Radix primitives

### Phase 10.9: Governance Pipeline Automation (COMPLETED)
- [x] **Proposal Auto-Progression** (`governance-os-bridge.ts`)
  - [x] `autoProgressProposalForIssue()` - draft→pending_review→discussion→voting
  - [x] Consensus ≥70% triggers immediate voting transition
  - [x] DP document auto-creation on Agora session completion
  - [x] GP document auto-creation when proposal enters voting
- [x] **Voting Resolution** (`governance/proposal.ts`)
  - [x] `autoProgressProposals()` - batch progress stale draft proposals
  - [x] `resolveCompletedVotings()` - auto-resolve expired voting periods
  - [x] Issue status linked to proposal outcome (passed→resolved, rejected→detected)
- [x] **Scheduler Integration** (`scheduler/index.ts`)
  - [x] Hourly `processProposalQueue` task
  - [x] 6-hourly `resolveCompletedVotings` task
  - [x] `PROPOSAL_QUEUE` and `VOTING_RESOLUTION` activity types
- [x] **Governance v2.0 Activation** (`governance-os-bridge.ts`)
  - [x] Dual-house voting for HIGH risk proposals
  - [x] Passive consensus signaling for LOW risk proposals
  - [x] Red Team auto-summon for escalated sessions
- [x] **Backlog Processing** (`routes/governance-os.ts`)
  - [x] `POST /api/governance-os/admin/process-backlog` endpoint
  - [x] Processes backfill + auto-progress + voting resolution in one call
- [x] **Data Quality & Performance**
  - [x] 3 compound DB indexes (activity_log, agora_messages, signals)
  - [x] Chatter rate limiting (2/hr per agent) and dedup
  - [x] Context-aware chatter prompts (references recent signals/issues)
  - [x] LLM Tier 1 preference increased (5s→15s fallback threshold)
- [x] **Agent System Enhancement**
  - [x] Red Team auto-summon for CRITICAL priority issues (`summoning.ts`)
  - [x] Trust score weighting in Agora consensus analysis (`agora.ts`)

### Phase 9: Production Deployment (COMPLETED)
- [x] **pm2 Process Management**
  - [x] `ecosystem.config.cjs` for managing both api and web apps
  - [x] Local machine deployment (211.196.73.206)
  - [x] api on port 3201, web on port 3200
  - [x] Auto-restart configuration with memory limits
- [x] **nginx Reverse Proxy**
  - [x] Lightsail server (13.209.131.190) with nginx
  - [x] SSL/TLS with Let's Encrypt
  - [x] WebSocket proxy for Socket.IO
  - [x] Static asset caching headers
- [x] **Next.js i18n Middleware Fix**
  - [x] Fixed middleware matcher to exclude `_next` paths
  - [x] Resolved static asset 500 errors and redirect loops
- [ ] Full integration testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Mainnet deployment preparation

### Phase 9.5: System Enhancement (COMPLETED)
- [x] **Automatic Report Generation System**
  - [x] `ReportGeneratorService` (`apps/api/src/services/report-generator/`)
  - [x] `DataCollector` - Aggregates metrics from all tables (signals, issues, proposals, agents, sessions)
  - [x] `WeeklyReportGenerator` - Weekly governance report with LLM executive summary
  - [x] `MonthlyReportGenerator` - Comprehensive monthly report with strategic insights
  - [x] Scheduler integration (weekly: Monday 00:00 UTC, monthly: 1st 00:00 UTC)
  - [x] Manual generation API: `POST /api/disclosure/generate/weekly`, `POST /api/disclosure/generate/monthly`
  - [x] Markdown content stored in disclosure_reports table
  - [x] Frontend markdown rendering with `react-markdown` + `remark-gfm`
  - [x] Custom styled components for tables, code blocks, headers
- [x] **Real-time Health Endpoint Enhancement**
  - [x] `/health` now returns real data: budget, scheduler, agents
  - [x] Budget: daily limit, spent, remaining (from budget_config + budget_usage)
  - [x] Scheduler: isRunning, nextTier2, queueLength, tier2Hours
  - [x] Agents: total, active count
  - [x] Uptime tracking from server start
- [x] **Budget Configuration via Environment**
  - [x] `ANTHROPIC_DAILY_BUDGET_USD`, `ANTHROPIC_HOURLY_LIMIT`
  - [x] `OPENAI_DAILY_BUDGET_USD`, `OPENAI_HOURLY_LIMIT`
  - [x] `GOOGLE_DAILY_BUDGET_USD`, `GOOGLE_HOURLY_LIMIT`
  - [x] `OLLAMA_HOURLY_LIMIT`
  - [x] Auto-seed budget_config on first run from .env
- [x] **Admin API Key Protection**
  - [x] `ADMIN_API_KEY` environment variable
  - [x] `requireAdmin` middleware for budget modification
  - [x] `PATCH /api/budget/config/:provider` requires X-Admin-Key header
- [x] **Engine Room Page Real Data**
  - [x] Uses real health API data instead of mock
  - [x] `/api/stats/tier-usage` endpoint for tier statistics
  - [x] SchedulerCard updated for nullable fields
- [x] **Modal Portal Pattern**
  - [x] All modals use React Portal (`createPortal`) for proper z-index
  - [x] z-[99999] for guaranteed top-level rendering
  - [x] Fixed modal stacking issues on all pages
- [x] **Translation Fixes**
  - [x] Added `Engine.status.ok` key for "All systems operational"

---

## Previous Phase: Token Integration (v0.8.0) - COMPLETED

### Completed Features

#### Infrastructure (100%)
- [x] Monorepo setup (pnpm workspaces + Turborepo)
- [x] TypeScript configuration
- [x] ESLint + Prettier configuration
- [x] Environment variables template (.env.example)
- [x] Git repository initialized

#### Backend - apps/api (100%)
- [x] Express.js server on port 3201
- [x] Socket.IO WebSocket integration
- [x] SQLite database with WAL mode
- [x] Database schema for all entities
- [x] 30 AI agents seeded with personas
- [x] REST API endpoints:
  - [x] GET /health - Health check
  - [x] GET /api/stats - Dashboard statistics
  - [x] GET /api/agents - List agents
  - [x] GET /api/activity - Activity feed
  - [x] GET /api/agora/sessions - Agora sessions
  - [x] GET /api/signals - Signals
  - [x] GET /api/issues - Issues
  - [x] GET /api/proposals - Proposals
  - [x] GET /api/budget - Budget info
- [x] ActivityService with heartbeat (60s interval)
- [x] SchedulerService for 3-tier LLM

#### Frontend - apps/web (100%)
- [x] Next.js 14 with App Router
- [x] next-intl for i18n (en/ko)
- [x] TanStack Query for data fetching
- [x] Tailwind CSS with custom Algora theme
- [x] Dashboard page with stats grid
- [x] Header with system status and language toggle
- [x] Sidebar navigation
- [x] ActivityFeed component (enhanced with severity badges, agent info, animations)
- [x] AgentLobbyPreview component
- [x] StatsCard component (clickable with variants and hover animations)
- [x] StatsDetailModal component (breakdown, activity list)
- [x] **Agents page** - Grid view, cluster filter, detail modal, summon/dismiss
- [x] **Agora page** - Live chat, session management, participant list
  - [x] Real-time message fetching from database
  - [x] Agent group display with color coding in participant list
  - [x] Auto-start discussion with random intervals (30s-2min)
- [x] **UI Animations** - Modal fade-in/scale-in, card hover effects, new item slide-in
- [x] **Detail Modals** - All modals have consistent animations (7 modal files)
- [x] **Disclosure page** - Transparency reports and governance disclosures
- [x] **Signals page** - Source filtering, priority indicators, stats
- [x] **Issues page** - Status workflow, priority filter, search
- [x] **Proposals page** - Voting progress, quorum tracking, filters
- [x] **Engine Room page** - Budget, tier usage, scheduler, system health
- [x] **Guide page** - System flow visualization
- [x] **Live Showcase page** (`/live`) - Real-time governance dashboard
  - [x] LiveHeader, SignalStream, SystemBlueprint, LiveMetrics
  - [x] ActivityLog, AgentChatter, AgoraPreview components
  - [x] TerminalBox, GlowText shared components
  - [x] Socket.io real-time updates
  - [x] LIVE badge in header, LIVE menu in sidebar
- [x] **UX Guide System**
  - [x] WelcomeTour component (multi-step guided tour)
  - [x] SystemFlowDiagram component (visual pipeline)
  - [x] HelpTooltip component (fixed positioning, z-index 9999)
  - [x] HelpMenu component (header quick access menu)
  - [x] localStorage persistence for tour completion

#### Agent System (100%)
- [x] LLM Service with 3-tier support (llm.ts)
  - [x] Tier 1: Ollama (local LLM)
  - [x] Tier 2: Anthropic, OpenAI, Gemini
  - [x] Automatic fallback between tiers
  - [x] Global LLM request queue (rate limiting)
  - [x] 10s minimum delay between concurrent calls
- [x] ChatterService - Agent idle message generation (chatter.ts)
- [x] SummoningService - Dynamic agent summoning (summoning.ts)
- [x] AgoraService - Session management with LLM responses (agora.ts)
  - [x] Auto-start discussion when session created with autoSummon
  - [x] Random intervals (30s-2min) for natural conversation pacing
  - [x] Auto-update summoned_agents when participants added
  - [x] LLM queue status monitoring (/api/agora/llm-queue)
- [x] Real-time WebSocket events for all services
- [x] API endpoints for chatter (/api/chatter)
- [x] Enhanced Agora API with automated discussions

#### Signal Collection (100%)
- [x] RSS Collector Service (rss.ts)
  - [x] Configurable RSS feed management
  - [x] Automatic severity detection
  - [x] 17 feeds across 5 categories: AI, Crypto, Finance, Security, Dev
- [x] GitHub Collector Service (github.ts)
  - [x] Repository events monitoring
  - [x] Issues and PRs tracking
  - [x] 41 repos: ethereum, Uniswap, Aave, OpenZeppelin, AI projects
  - [x] All 27 mossland public repos monitored
- [x] Blockchain Collector Service (blockchain.ts)
  - [x] Price monitoring (CoinGecko multi-coin)
  - [x] DeFi TVL tracking (DeFiLlama protocols, chains, stablecoins)
  - [x] Fear & Greed Index
  - [x] Optional: CoinMarketCap, Etherscan, OpenSea (API keys)
- [x] Signal Processor (index.ts)
  - [x] Unified collector management
  - [x] Statistics and reporting
- [x] Collectors API endpoints (/api/collectors/*)

#### Issue Detection (100%)
- [x] IssueDetectionService (issue-detection.ts)
  - [x] Pattern-based detection (10 predefined patterns)
  - [x] Security, Market, Governance, DeFi, Mossland, AI categories
  - [x] Cooldown mechanism to prevent duplicates
- [x] Alert Thresholds
  - [x] Frequency-based alerts
  - [x] Critical signal surge detection
  - [x] Category-specific thresholds
- [x] Issue Lifecycle Management
  - [x] Status workflow: detected → confirmed → in_progress → resolved
  - [x] Signal-to-issue correlation
  - [x] Evidence tracking
- [x] LLM-Enhanced Analysis
  - [x] AI-powered signal analysis for high-priority items
  - [x] Suggested actions generation
- [x] Automatic Agora Session Creation
  - [x] Auto-create Agora sessions for Critical/High priority issues
  - [x] Category-based agent auto-summoning
  - [x] Cooldown mechanism (30min for critical, 60min for high)
  - [x] AGORA_SESSION_AUTO_CREATED activity type
- [x] API endpoints (/api/issues/detection/*)

#### Human Governance (100%)
- [x] GovernanceService (services/governance/index.ts)
  - [x] Unified service combining proposals, voting, and decision packets
  - [x] Convenience methods for common workflows
- [x] ProposalService (proposal.ts)
  - [x] Full proposal lifecycle management
  - [x] Status workflow: draft → pending_review → discussion → voting → passed/rejected → executed
  - [x] Create from issue functionality
  - [x] Comments and endorsements system
  - [x] Agent endorsement tracking
- [x] VotingService (voting.ts)
  - [x] Vote casting with validation
  - [x] Voting power calculation
  - [x] Tally calculation with quorum checking
  - [x] Delegation system (proxy voting)
  - [x] Auto-finalization when voting period ends
  - [x] Voter registry management
- [x] DecisionPacketService (decision-packet.ts)
  - [x] AI-generated decision summaries
  - [x] Options analysis with pros/cons
  - [x] Agent analysis aggregation
  - [x] Risk assessment generation
  - [x] Version management for regeneration
- [x] Comprehensive API endpoints (/api/proposals/*)
  - [x] CRUD operations for proposals
  - [x] Workflow transitions (submit, start-discussion, start-voting, cancel)
  - [x] Voting endpoints (vote, finalize, get votes)
  - [x] Comments and endorsements endpoints
  - [x] Decision packet endpoints (get, generate, versions)
  - [x] Delegation endpoints (create, revoke, get)

#### Proof of Outcome (100%)
- [x] ProofOfOutcomeService (services/proof-of-outcome/index.ts)
  - [x] Unified service combining outcomes, trust scoring, and analytics
  - [x] Convenience methods for processing proposal completions
- [x] OutcomeService (outcome.ts)
  - [x] Outcome creation from passed/rejected proposals
  - [x] Execution plan management with steps
  - [x] Execution lifecycle: pending → executing → completed/failed → verified
  - [x] Verification system with confidence scores
  - [x] Dispute handling for contested outcomes
- [x] TrustScoringService (trust-scoring.ts)
  - [x] Agent trust score tracking (0-100 scale)
  - [x] Prediction recording and resolution
  - [x] Endorsement accuracy tracking
  - [x] Participation rate monitoring
  - [x] Trust score history and updates
  - [x] Automatic score decay for inactive agents
- [x] AnalyticsService (analytics.ts)
  - [x] Governance metrics (pass rate, participation, votes)
  - [x] Time series data for proposals, voting, outcomes
  - [x] Agent performance ranking
  - [x] Signal-to-outcome correlation analysis
  - [x] Category analytics
  - [x] Exportable governance reports
- [x] Comprehensive API endpoints (/api/outcomes/*)
  - [x] Outcome CRUD and execution management
  - [x] Verification and dispute endpoints
  - [x] Trust scoring endpoints
  - [x] Analytics dashboard and metrics endpoints

#### Token Integration (100%)
- [x] TokenIntegrationService (services/token/index.ts)
  - [x] Unified service combining token, voting, and treasury
  - [x] Convenience methods for common workflows
- [x] TokenService (token.ts)
  - [x] MOC token holder verification
  - [x] Wallet signature verification with nonce
  - [x] Token balance checking (real + mock mode)
  - [x] Voting power calculation
  - [x] Snapshot creation for voting
  - [x] Holder registration and management
- [x] TokenVotingService (token-voting.ts)
  - [x] Token-weighted voting system
  - [x] Proposal voting initialization with snapshots
  - [x] Vote casting with voting power
  - [x] Quorum and pass threshold checking
  - [x] Vote tally calculation
  - [x] Voting finalization
- [x] TreasuryService (treasury.ts)
  - [x] Multi-token treasury balance tracking
  - [x] Budget allocations from proposals
  - [x] Allocation lifecycle: pending → approved → disbursed
  - [x] Transaction recording and confirmation
  - [x] Spending limits per category
  - [x] On-chain transaction support (mock + real)
- [x] Comprehensive API endpoints (/api/token/*)
  - [x] Token info and stats endpoints
  - [x] Wallet verification (request, confirm)
  - [x] Holder management endpoints
  - [x] Snapshot endpoints
  - [x] Token voting endpoints
  - [x] Treasury balance and allocation endpoints
  - [x] Transaction management endpoints
  - [x] Spending limits endpoints
  - [x] Dashboard endpoint

#### Shared Packages
- [x] packages/core - TypeScript types (38 agent clusters, 11 cluster types)
- [x] packages/safe-autonomy - LOCK/UNLOCK, Risk Classification, Approval Routing, Anti-Abuse Guard (v2.0)
- [x] packages/orchestrator - Workflow Orchestration, State Machine, TODO Manager (v2.0)
- [x] packages/document-registry - Official Document Storage, Versioning, Provenance (v2.0)
- [x] packages/model-router - LLM Difficulty-Based Routing, Quality Gates, RAG, Ollama Provider (v2.0)
- [x] packages/dual-house - Dual-House Governance, Voting, Reconciliation (v2.0)
- [x] packages/governance-os - Unified Integration Layer, KPI Collector, E2E Tests (v2.0)
- [ ] packages/reality-oracle - Signal collection
- [ ] packages/inference-mining - Issue detection
- [ ] packages/agentic-consensus - Agent system
- [ ] packages/human-governance - Voting
- [ ] packages/proof-of-outcome - Result tracking

#### Documentation (100%)
- [x] README.md / README.ko.md
- [x] ARCHITECTURE.md / ARCHITECTURE.ko.md
- [x] CONTRIBUTING.md / CONTRIBUTING.ko.md
- [x] ALGORA_PROJECT_SPEC.md / ALGORA_PROJECT_SPEC.ko.md
- [x] USER_GUIDE.md / USER_GUIDE.ko.md
- [x] CLAUDE.md
- [x] CHANGELOG.md
- [x] DEVELOPMENT_STATUS.md (this file)

---

### Phase 10: Token UI & Governance Features (IN PROGRESS)

#### Step 1: Wallet Connection UI (COMPLETED)
- [x] WalletConnect v2 modal with MetaMask/WalletConnect/Coinbase support
- [x] ConnectedWallet header component showing balance and address
- [x] Profile page with wallet verification flow
- [x] MOC token balance display with real-time updates
- [x] Voting power calculation from token balance
- [x] i18n translations (EN/KO) for wallet UI

#### Step 2: Treasury Dashboard Enhancement (COMPLETED)
- [x] Treasury visualization components (`apps/web/src/components/treasury/`)
  - [x] AllocationCard - Budget allocation items with status badges
  - [x] TransactionCard - Transaction history with type indicators
  - [x] HolderCard - Token holder cards with verification status
  - [x] BalanceDistributionChart - CSS conic-gradient donut chart
  - [x] AllocationStatusBreakdown - Stacked progress bar
  - [x] SpendingLimitsCard - Category-based spending limits
  - [x] AllocationDetailModal - Detail modal with status timeline
  - [x] TransactionDetailModal - Transaction detail with explorer links
- [x] Treasury API functions in `api.ts`
- [x] i18n translations (EN/KO) for treasury components

#### Step 3: Voting Delegation UI (COMPLETED)
- [x] Delegation components (`apps/web/src/components/delegation/`)
  - [x] DelegationCard - Delegation item display with address/power/expiration
  - [x] DelegationStats - 4 stats cards (own/received/given/effective power)
  - [x] DelegationModal - Multi-step modal (intro → input → confirm → success)
  - [x] DelegationList - Tabbed list (given/received delegations)
- [x] Delegation API functions (fetchDelegations, createDelegation, revokeDelegation)
- [x] Profile page integration with delegation section
- [x] Category-based delegation (treasury/technical/governance/community)
- [x] Expiration options (30/90/180 days or never)
- [x] i18n translations (EN/KO) for delegation UI

#### Step 4: Token-weighted Voting UI (PENDING)
- [ ] Proposal voting with connected wallet
- [ ] Vote confirmation with voting power display
- [ ] Delegated vote auto-application
- [ ] Vote history on profile page

---

### Phase 10.5: Performance Optimization (COMPLETED)

#### Mobile Responsiveness Fixes (COMPLETED)
- [x] Issue/Proposal/Treasury/Disclosure/Engine Room pages mobile UI
- [x] Modal layouts with proper scroll structure
- [x] Grid responsive breakpoints (grid-cols-1 sm:grid-cols-2)
- [x] Text truncation and overflow handling
- [x] Live page header overflow fix
- [x] Proposal modal proposer address and budget overflow fix
- [x] Treasury tabs horizontal scroll
- [x] Engine Room refresh button visual feedback

#### Initial Load Performance (RSC Migration) (COMPLETED)
- [x] **Dashboard RSC Conversion**
  - [x] `lib/server-api.ts` - Server-side fetch utilities with timeout
  - [x] `DashboardClient.tsx` - Client component for interactive features
  - [x] `page.tsx` converted to async Server Component
  - [x] `ActivityFeed` and `AgentLobbyPreview` accept `initialData` prop
  - [x] Data fetched on server, pre-rendered into HTML
  - [x] React Query handles real-time updates after hydration

#### TTFB Bottleneck Resolution (COMPLETED)
- [x] **Root Cause Analysis**: RSC was using external URL causing circular nginx requests
- [x] **Internal API Routing**: Server-side fetch uses `localhost:3201` directly
- [x] `API_INTERNAL_URL` environment variable in PM2 config
- [x] 3-second timeout with AbortController to prevent blocking
- [x] **Dynamic Icon Removal**: Deleted `icon.tsx` (ImageResponse), replaced with static `favicon.svg`
- [x] **Middleware Optimization**: Explicit exclusion of all static file paths
- [x] **Server-Timing Headers**: Added to API for performance diagnostics
- [x] **Slow Request Logging**: Console warning for requests > 500ms
- [x] `deploy/nginx.conf.example` - Example nginx config with proxy caching
- [x] `deploy/warmup.sh` - Cold start mitigation script

---

### Phase 10.6: Operational Data Analysis & Improvements (COMPLETED)

Based on 13 days of production data (2026-01-09 ~ 2026-01-21):

#### Data Analysis Results
- **activity_log**: 129,974 records (~10,000/day)
- **agent_chatter**: 32,900 records (~2,500/day)
- **agora_messages**: 21,983 records (~1,700/day)
- **signals**: 14,935 records (~1,150/day)
- **Database Size**: 141MB (estimated ~4GB/year without cleanup)

#### LLM Cost Tracking (P0) - COMPLETED
- [x] `generation` event listener in `apps/api/src/index.ts`
- [x] Records all LLM calls to `budget_usage` table
- [x] Tracks provider, tier, tokens, and estimated cost
- [x] Upsert pattern aggregates by provider/tier/date/hour

#### Ollama Timeout Optimization (P0) - COMPLETED
- [x] Increased timeout from 60s to 120s for large models like qwen2.5:32b
- [x] Hybrid model strategy verified:
  - Chatter uses `complexity: 'fast'` → `llama3.2:3b`
  - Agora uses `complexity: 'balanced'` → `qwen2.5:32b`

#### Data Retention Service (P1) - COMPLETED
- [x] New service: `apps/api/src/services/data-retention.ts`
- [x] Standard 30-day retention policy:
  - `activity_log`: 30 days (HEARTBEAT: 7 days)
  - `agent_chatter`: 90 days
  - `signals`: 90 days
  - `agora_messages`, `issues`, `proposals`, `votes`: **Permanent**
  - `budget_usage`: 365 days
- [x] Scheduler integration (daily at 03:00)
- [x] Manual cleanup trigger via `triggerDataCleanup()`

#### Monitoring API Extension (P2) - COMPLETED
- [x] `GET /api/stats/llm-usage` - LLM usage by tier/provider, Tier 1 ratio, costs
- [x] `GET /api/stats/data-growth` - Row counts, daily averages, growth trends
- [x] `GET /api/stats/system-health` - Health score, error counts, budget status

---

### Phase 10.7: System Enhancements (COMPLETED)

#### D5 - Passive Consensus (COMPLETED)
- [x] PassiveConsensusService (`apps/api/src/services/passive-consensus.ts`)
- [x] Auto-approval for LOW risk (24h), MID risk (48h)
- [x] "Unreviewed" label for auto-approved items
- [x] REST endpoints: `/api/passive-consensus/*`

#### D2 - Model Router RAG (COMPLETED)
- [x] RAGService (`apps/api/src/services/rag.ts`)
- [x] In-memory vector store with cosine similarity
- [x] Governance document indexing and search
- [x] REST endpoints: `/api/rag/*`

#### D3 - Quality Gate (COMPLETED)
- [x] QualityGateService (`apps/api/src/services/quality-gate.ts`)
- [x] 8 validators: format, length, safety, relevance, completeness, consistency, citation, confidence
- [x] REST endpoints: `/api/quality-gate/*`

#### E2 - Governance Timeline View (COMPLETED)
- [x] TimelineEvent types and API (`apps/api/src/routes/timeline.ts`)
- [x] GovernanceTimeline component (`apps/web/src/components/timeline/`)
- [x] 7-stage flow visualization (Signal → Execution)
- [x] Filtering by stage and date range
- [x] Timeline page (`apps/web/src/app/[locale]/timeline/`)

#### C3 - Log Rotation & Monitoring (COMPLETED)
- [x] pm2-logrotate setup script (`scripts/setup-logrotate.sh`)
- [x] LogMonitorService (`apps/api/src/services/log-monitor.ts`)
- [x] REST endpoints: `/api/logs/*`

#### E5 - Multilingual Expansion (COMPLETED)
- [x] Japanese translations (`apps/web/src/i18n/messages/ja.json`)
- [x] Chinese translations (`apps/web/src/i18n/messages/zh.json`)
- [x] Updated middleware and request.ts for 4 locales (en, ko, ja, zh)

#### C4 - API Caching Layer (COMPLETED)
- [x] In-memory cache integration (`apps/api/src/lib/cache.ts`)
- [x] Cache for `/api/stats` (15s TTL)
- [x] Cache for `/api/stats/tier-usage` (30s TTL)
- [x] Cache for `/api/timeline/stats` (30s TTL)
- [x] Cache monitoring endpoints: `/api/stats/cache`, `/api/stats/cache/clear`

#### B6 - Accessibility Improvements (COMPLETED)
- [x] AccessibleModal component (focus trap, escape key, scroll lock)
- [x] AccessibleDropdown component (keyboard navigation, type-ahead search)
- [x] Header ARIA enhancements (role="banner", aria-live for status)
- [x] Translations for all 4 languages

#### LLM Thermal Throttling (COMPLETED)
- [x] Cooldown between Tier 1 calls (default 5s, was 2s)
- [x] Rate limiting (max 8 calls/minute, was 15)
- [x] Dynamic cooldown under heavy load (max 30s, was 10s)
- [x] Automatic Tier 2 fallback when cooldown too long
- [x] REST endpoints: `/api/stats/thermal`, `/api/stats/thermal/config`
- [x] Environment config: `LLM_MIN_COOLDOWN_MS`, `LLM_MAX_CALLS_PER_MINUTE`, `LLM_MAX_COOLDOWN_MS`

#### i18n Admin Page Translations (COMPLETED)
- [x] Added Navigation keys: `admin`, `timeline`, `profile` (4 languages)
- [x] Added Admin section: `title`, `subtitle`, `refresh`, `systemHealth`, `llmUsage`, `dataGrowth`, `kpiTrends`
- [x] Updated: en.json, ko.json, ja.json, zh.json

---

### Phase 10.8: Pipeline Health Monitoring (COMPLETED)

Full pipeline inspection with 4 gap fixes and monitoring dashboard.

#### Gap 1: Signal Collector Auto-Recovery (COMPLETED)
- [x] `CollectorHealth` interface for tracking health state per collector
- [x] Health check interval (30 seconds default)
- [x] Auto-restart with exponential backoff for 3+ consecutive failures
- [x] Stale detection (5 minute threshold triggers restart)
- [x] Health state persisted to `collector_health` DB table
- [x] WebSocket events: `collectors:health`, `collectors:restarted`

#### Gap 2: Low-Consensus Session Escalation (COMPLETED)
- [x] `EscalationType` and `EscalatedSession` types
- [x] Escalation routing based on consensus score:
  - 50-70%: `extended_discussion` (additional rounds)
  - 30-50%: `working_group` (focused working group)
  - <30%: `human_review` (governance committee)
- [x] `escalateLowConsensusSession()` auto-triggers for completed sessions
- [x] `getPendingEscalations()` and `resolveEscalation()` methods
- [x] WebSocket event: `governance:session:escalated`
- [x] `escalated_sessions` DB table

#### Gap 3: Pipeline Failure Retry Queue (COMPLETED)
- [x] `InMemoryQueue` for pipeline retries with 3 max attempts
- [x] Exponential backoff between retries
- [x] Auto-queue when `runTier2Tasks` fails
- [x] Status marked `needs_manual_review` after exhausting retries
- [x] `getPipelineRetryStats()` for monitoring
- [x] `queuePipelineRetry()` for manual retry trigger
- [x] `pipeline_retry_queue` DB table

#### Gap 4: Scheduled Proposal Backfill (COMPLETED)
- [x] `scheduleProposalBackfill()` runs at 02:00 and 14:00 UTC daily
- [x] `triggerProposalBackfill()` for manual trigger
- [x] WebSocket event: `governance:backfill:scheduled`

#### Pipeline Health API (COMPLETED)
- [x] New route: `apps/api/src/routes/pipeline-health.ts`
- [x] Endpoints:
  - `GET /api/pipeline/health` - Overall health score (0-100)
  - `GET /api/pipeline/metrics` - 24h throughput/latency metrics
  - `GET /api/pipeline/alerts` - Active alerts (critical/warning/info)
  - `GET /api/pipeline/stages` - Stage-by-stage health details
  - `GET /api/pipeline/collectors` - Collector health status
  - `GET /api/pipeline/escalations` - Pending escalations
  - `POST /api/pipeline/retry/:issueId` - Manual retry trigger
  - `POST /api/pipeline/escalations/:id/resolve` - Resolve escalation
  - `POST /api/pipeline/backfill` - Manual proposal backfill

#### Pipeline Health Dashboard (COMPLETED)
- [x] `PipelineHealthDashboard` component (`apps/web/src/components/admin/`)
- [x] Visual pipeline flow with 6 stages
- [x] Real-time health score display
- [x] Stage-by-stage status cards
- [x] Throughput metrics (signals, issues, sessions, proposals)
- [x] Retry queue status
- [x] Active alerts panel
- [x] Integrated into Admin page

#### Activity Types (COMPLETED)
- [x] Added: `COLLECTOR_HEALTH`, `PIPELINE_RETRY`, `PROPOSAL_BACKFILL`, `SESSION_ESCALATED`, `HUMAN_REVIEW_REQUIRED`

---

## Next Steps (Priority Order)

### Phase 10 Remaining
1. Token-weighted voting UI in proposals
2. Real-time WebSocket integration for token events

### Phase 11: Production Hardening
1. Mainnet contract integration
2. Security audit
3. Performance optimization
4. Monitoring and alerting (pm2 monit, log rotation)

### Phase 12: Advanced Features
1. packages/reality-oracle - Signal collection refactoring
2. packages/inference-mining - Issue detection refactoring
3. packages/agentic-consensus - Agent system refactoring
4. packages/human-governance - Voting refactoring
5. packages/proof-of-outcome - Result tracking refactoring

---

## Running the Project

### Development Mode
```bash
# Install dependencies
pnpm install

# Start both frontend and backend
pnpm dev

# Or start individually:
cd apps/api && pnpm dev   # Backend on :3201
cd apps/web && pnpm dev   # Frontend on :3200
```

### Production Mode (pm2)
```bash
# Build all packages
pnpm build

# Start with pm2
pm2 start ecosystem.config.cjs

# Management commands
pm2 status              # View status
pm2 logs algora-api     # API logs
pm2 logs algora-web     # Web logs
pm2 restart all         # Restart all
pm2 stop all            # Stop all

# Auto-start on reboot
pm2 save
pm2 startup
```

### Production URLs
- **Production**: https://algora.moss.land
- **Local Dev**: http://localhost:3200 (web), http://localhost:3201 (api)

---

## Git Commit History (Recent)

```
156bec7 feat: Complete governance pipeline automation (Signal→Issue→Agora→Proposal→Voting→Resolution)
50904bc docs: Update commit hash in DEVELOPMENT_STATUS.md
8683cef chore: Fix ESLint warnings across 23 files
109a766 feat: Add pipeline health monitoring with auto-recovery and dashboard
4b40edd feat: Add LLM thermal throttling to prevent server overheating
574e3b9 feat: Add accessibility improvements with ARIA labels and reusable components
81f655e feat: Integrate in-memory caching for high-traffic API endpoints
1877e89 feat: Add Japanese and Chinese language support
c4f3394 feat: Add log rotation and monitoring system
4b1cb88 feat: Add Governance Timeline View showing signal-to-execution flow
a8d31b7 feat: Add Quality Gate service for LLM output validation
1a514e8 feat: Add RAG service for semantic search in governance documents
8166984 feat: Add passive consensus system for opt-out approval model
9e7e410 feat: Add KPI persistent storage and history visualization
```

---

## Known Issues

1. Next.js 14.1.0 is outdated (minor warning)
2. Agent states not being persisted on server restart (need initialization)
3. Database requires re-initialization after schema changes (delete algora.db and run db:init)
4. Localhost CORS issues when connecting to production API (expected behavior)

---

## Environment Setup Notes

- Node.js v20.19.6
- pnpm (for monorepo)
- SQLite database stored in `apps/api/data/algora.db`
- Database auto-initializes on first run
- Ollama required for Tier 1 LLM (http://localhost:11434)

---

## For AI Assistants

When continuing development:
1. Read this file first to understand current status
2. Check CLAUDE.md for project context and guidelines
3. Run `git log --oneline -10` to see recent changes
4. Run `pnpm dev` to start the development servers (or `pm2 start ecosystem.config.cjs` for production)
5. Update this file and CHANGELOG.md after significant changes
6. Update Korean translations (*.ko.md) when documentation changes

### Key Files to Know
- `ecosystem.config.cjs` - pm2 configuration
- `apps/web/src/middleware.ts` - Next.js i18n middleware (exclude `_next` paths)
- `apps/web/.env.local` - Frontend environment (NEXT_PUBLIC_API_URL)
- `apps/api/.env` - Backend environment

### Current Architecture
```
Internet → algora.moss.land (DNS)
        → Lightsail 13.209.131.190 (nginx + SSL)
        → Local 211.196.73.206 (pm2: api:3201, web:3200)
```
