# Request: raise `OLLAMA_NUM_PARALLEL` on 192.168.1.65

**To:** administrator of the Ollama host `192.168.1.65:11434`
**From:** Algora and MOSS.AO (agentic-orchestrator), jointly
**Date:** 2026-08-06
**Ask:** set `OLLAMA_NUM_PARALLEL=2` (and leave `OLLAMA_MAX_LOADED_MODELS` at 1)

---

## Summary

Two services share this host. We have already fixed everything fixable from our
side — both now request the identical model and context size, so the host holds
a single `gemma3:4b` instance and no longer reloads between our calls.

What remains is not a configuration either of us owns: the host serves **one
request at a time**, so our two workloads queue behind each other. One short
call arriving during a long generation waits for that generation to finish.

Raising `OLLAMA_NUM_PARALLEL` to 2 resolves it, and we measured the cost: it is
**0.01 GB**.

## What we already did

| | before | now |
|---|---|---|
| Algora `num_ctx` | 8192 | **16384** |
| MOSS.AO `num_ctx` | 16384, with a 4096 override on one path | **16384** everywhere |
| model | `gemma3:4b` both | unchanged |

Each distinct `num_ctx` is a separate runner, so the mismatch was forcing a full
unload/reload on every alternation. Converged 2026-08-06; the host has since
held one instance at `ctx=16384` across continuous polling, with no flips.

## The remaining problem, measured

Serialization. A 3,000-token generation was started, and a trivial "say OK"
request was fired 8 seconds into it:

```
long generation   ..................................... done at 16.55s
short request         fired at t=8s ................... returned at 16.6s
```

The short request did not run alongside; it waited for the long one to finish.
Confirmed again at a different scale (a probe fired 6s into an 8.7s generation
returned at 8.8s).

This matters because the two workloads have opposite shapes:

- **Algora** — ~2 calls/minute, 19–31 output tokens, sub-second when unblocked.
- **MOSS.AO** — infrequent, but multi-thousand-token prompts and generations
  running tens of seconds.

Every MOSS.AO generation currently blocks every Algora call that lands during
it, and Algora's steady cadence delays MOSS.AO's turn to start.

## Cost of the change: 0.01 GB

`OLLAMA_NUM_PARALLEL=2` allocates KV cache for two slots, i.e. the equivalent of
a 32768-token window at our agreed `num_ctx=16384`. Measured directly on this
host by loading each window and reading `size_vram` from `/api/ps`:

| window | resident VRAM |
|---|---|
| 4096 | 2.88 GB |
| 8192 | 3.03 GB |
| 16384 | 2.89 GB |
| **32768** (= 2 slots × 16384) | **2.90 GB** |

`gemma3` uses sliding-window attention on most layers, so the KV cache is
near-flat in the context length — the footprint is dominated by the Q4_K_M
weights. Doubling the slots costs ~10 MB, not a doubling.

We have not been able to read the card's total capacity ourselves (no shell on
this host). The figure we have been working from is ~8 GB, against ~2.9 GB
resident — if that is right, headroom is not the constraint here.

## Exact change requested

```
OLLAMA_NUM_PARALLEL=2
```

Left deliberately alone:

- **`OLLAMA_MAX_LOADED_MODELS`** — please keep this at 1. We want one shared
  instance; letting a second model load is what caused the thrash we just spent
  a day removing.
- **`OLLAMA_KEEP_ALIVE`** — Algora requests `keep_alive: 15m` per call and
  MOSS.AO calls often enough to hold it; no server-side change needed.

If 2 proves comfortable, 3 would give each service a slot with one spare, at a
similar marginal cost. We would rather start at 2 and measure.

## How we will verify

```bash
curl -s $OLLAMA/api/ps          # expect ONE gemma3:4b, context_length 16384
```

then re-run the interleaving test above: the short request should return in
under a second instead of waiting for the long generation. We will report the
numbers back either way, including if it does not help.

## Contact

Either team can be reached through the ao box (`/home/atrn/Algora`,
`/home/atrn/agentic-orchestrator`). Happy to schedule the restart for a quiet
window, or to run the verification ourselves immediately afterward.
