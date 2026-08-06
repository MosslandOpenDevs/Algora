# Request: raise `OLLAMA_NUM_PARALLEL` on 192.168.1.65

**To:** administrator of the Ollama host `192.168.1.65:11434`
**From:** Algora and MOSS.AO (agentic-orchestrator), jointly
**Date:** 2026-08-06
**Ask:** set `OLLAMA_NUM_PARALLEL=2` (and leave `OLLAMA_MAX_LOADED_MODELS` at 1)

---

## Summary

Two services share this host. We have already fixed everything fixable from our
side — both now request the identical model and context size, so the host holds
a single `gemma3:4b` runner and no longer reloads between our calls.

What remains is not a configuration either of us owns: **a single runner serves
one request at a time**, and since both services use `gemma3:4b`, our two
workloads queue behind each other. One short call arriving during a long
generation waits for that generation to finish.

Raising `OLLAMA_NUM_PARALLEL` to 2 resolves it, and we measured the cost: it is
**0.01 GB**.

> **Scope note.** This is a per-runner limit, not a host-wide one. Distinct
> models already load side by side and execute in parallel here — measured: a
> `gemma3:1b` call fired 8s into a 17.3s `gemma3:4b` generation returned in
> **0.59s**. The gap is only between requests sharing one model.

Confirmed against the server's own startup config (`server.log`, run of
2026-08-04, current):

```
OLLAMA_NUM_PARALLEL:1            <-- the setting this request is about
OLLAMA_MAX_LOADED_MODELS:0       <-- 0 = auto; already fine, leave it
OLLAMA_MAX_QUEUE:512
OLLAMA_KEEP_ALIVE:5m0s           <-- our per-call keep_alive overrides this
OLLAMA_FLASH_ATTENTION:false
OLLAMA_KV_CACHE_TYPE:            <-- empty = f16
OLLAMA_VULKAN:true
```

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

Serialization **within the shared `gemma3:4b` runner**. A 3,000-token generation
was started, and a trivial "say OK" request to the same model was fired 8
seconds into it:

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

Against the card, per the server's own probe at startup:

```
NVIDIA GeForce RTX 5060, discrete, CUDA 12.0, driver 13.1
total="8.0 GiB"  available="6.9 GiB"
```

Current residency is `gemma3:4b` at 2.89 GB plus `gemma3:1b` at 0.88 GB — about
**3.8 of 6.9 GiB**, leaving ~3.1 GiB free. The ~10 MB this change adds is
comfortably inside that.

## Exact change requested

On the Windows host, as the user Ollama runs under:

```powershell
setx OLLAMA_NUM_PARALLEL 2
```

then restart Ollama (quit from the tray icon and relaunch) so the new value is
read at startup. Verify with:

```powershell
Select-String -Path "$env:LOCALAPPDATA\Ollama\server.log" -Pattern "server config" | Select-Object -Last 1
```

Left deliberately alone:

- **`OLLAMA_MAX_LOADED_MODELS`** — currently `0` (auto), which is correct.
  Distinct models already coexist and that is working well; no change wanted.
- **`OLLAMA_KEEP_ALIVE`** — server default `5m`, but Algora sends
  `keep_alive: 15m` per call and MOSS.AO calls often enough to hold it. No
  server-side change needed.

If 2 proves comfortable, 3 would give each service a slot with one spare, at a
similar marginal cost. We would rather start at 2 and measure.

**Optional, unrelated to this request:** `OLLAMA_FLASH_ATTENTION` is `false` and
`OLLAMA_KV_CACHE_TYPE` is empty (f16). Enabling flash attention usually lowers
KV-cache memory and improves throughput, and would then allow a quantised KV
cache (`q8_0`) if headroom ever gets tight. Worth a try, but it is a separate
change and we have not measured it here.

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
