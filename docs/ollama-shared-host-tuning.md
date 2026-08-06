# Shared Ollama host: applied tuning and measurements

**Host:** `192.168.1.65:11434` — Windows, NVIDIA RTX 5060, Ollama 0.32.5
**Shared by:** Algora and MOSS.AO (agentic-orchestrator)
**Status:** all changes applied and verified 2026-08-06

---

## Applied configuration

| | value | owner |
|---|---|---|
| model | `gemma3:4b` | both services |
| `num_ctx` | **16384** | both services (coordination value — see below) |
| `OLLAMA_NUM_PARALLEL` | **2** (was 1, the default) | host |
| `OLLAMA_MAX_LOADED_MODELS` | **2** (was `0`/auto) | host |
| `OLLAMA_FLASH_ATTENTION` | **true** (was false) | host |
| `OLLAMA_KV_CACHE_TYPE` | **q8_0** (was empty/f16) | host |
| `OLLAMA_GPU_OVERHEAD` | **1 GiB** reserved | host |
| `keep_alive` | `15m` per call | Algora |

> `OLLAMA_NUM_PARALLEL` is read only at process start, so a `setx` change needs
> an Ollama restart before it takes effect. Confirm the live value from the log
> (below) rather than from the environment variable — they can disagree.

## The scheduling model

Measured, not assumed. Three distinct behaviours that are easy to conflate:

| situation | behaviour |
|---|---|
| same model, different `num_ctx` | runner is **replaced** — full unload/reload, 4.3–4.5s |
| same runner, concurrent requests | **shares slots** (was: serialized at `NUM_PARALLEL=1`) |
| different models | **separate runners, genuinely parallel** |

The third was verified directly: a `gemma3:1b` call fired 8s into a 17.3s
`gemma3:4b` generation returned in **0.59s**.

The first is why `num_ctx` is a *coordination* value rather than a ceiling.
Neither service needs 16384 on its own — Algora's largest real prompt is ~4.5k
tokens — but any mismatch makes every alternation pay a reload. Do not change it
on one side only.

## Why `NUM_PARALLEL` was raised

At `NUM_PARALLEL=1` a single runner served one request at a time, so the two
services blocked each other. A trivial call fired 8 seconds into a 16.5s
generation returned at 16.6s — it had simply waited.

The workloads have opposite shapes, which made this expensive both ways:

- **Algora** — ~2 calls/min, 19–31 output tokens, sub-second when unblocked.
- **MOSS.AO** — infrequent, multi-thousand-token prompts, tens of seconds.

## Results — why 2 rather than 4

Both were measured live, each bracketed by single-request controls (300-token
requests, 4 fired concurrently):

| `NUM_PARALLEL` | `gemma3:4b` VRAM | aggregate, 4 concurrent | vs serial |
|---|---|---|---|
| 1 | 2.89 GB | ~107 tok/s | 1.0x |
| **2** (current) | **2.98 GB** | **173 tok/s** | **1.6x** |
| 4 | 3.30 GB | 235 tok/s | 2.2x |

Single-request decode is unchanged at every setting (106.6 / 106.9 tok/s at 4,
106.9 tok/s at 2) against the ~109 tok/s pre-change baseline. The slot count is
directly visible in completion times: at 2, four concurrent requests finish in
two pairs (3.61s, 3.61s, 6.88s, 6.90s); at 4 they all finish together.

**2 is the chosen setting** because `MAX_LOADED_MODELS` is 2 and
`NUM_PARALLEL` applies *per runner* — so 4 would let two resident models reserve
8 slots between them. 2 keeps ~74% of the throughput gain for ~22% of the VRAM
cost, and leaves room for a third-party model to load.

That headroom is not hypothetical: a `gemma3:1b` at ctx 4096 (not ours — some
other client on the LAN) appears on this host periodically. Measured with both
resident:

```
gemma3:4b  ctx=16384  2.98 GB
gemma3:1b  ctx= 4096  0.95 GB
                      ------- 3.92 GB of ~5.9 GiB usable
                              (6.9 GiB available - 1.0 GiB GPU_OVERHEAD)
```

~2.0 GB spare, and they serve concurrently: a `gemma3:1b` probe fired 2s into a
`gemma3:4b` generation returned in **0.38s**, with no eviction.

> Note on an earlier estimate: ~10 MB was predicted for two slots by using a
> single runner at `num_ctx=32768` as a proxy. That under-predicts. The measured
> figures in the table above are the ones to trust.

## Measurement caveat, learned the hard way

Mid-change sampling showed decode at **5.2 tok/s** and prefill at 101 tok/s,
which read as a catastrophic regression and was reported as one. It was not.
Once `NUM_PARALLEL > 1`, Algora's own live production traffic genuinely shares
the GPU, so any "single request" sample taken without a control is really
measuring *n*-way contention.

**Take a single-request control immediately before and after any concurrent
measurement on this host.** A number without that control means nothing here,
because the host is never idle.

## Flash attention + `q8_0` KV cache: measured, no effect

These were suggested here as a likely win and were then enabled on the host.
Re-measured with the same controls:

| | f16 KV, no FA | FA + `q8_0` KV |
|---|---|---|
| single request (control) | 106.6 / 106.9 tok/s | 104.7 / 107.2 tok/s |
| 4 concurrent, aggregate | 235 tok/s | 229 tok/s |
| resident VRAM | 3.30 GB | 3.30 GB |

**No measurable difference on any axis** — the deltas are inside run-to-run
noise, and VRAM is identical to two decimal places. The likely reason is the
same property that makes `num_ctx` cheap here: gemma3 uses sliding-window
attention on most layers, so the KV cache is already small and quantising it
saves nothing worth measuring.

Harmless to leave on, but do not expect it to buy headroom. If VRAM ever gets
tight on this host, the lever is model choice or `NUM_PARALLEL`, not the KV
cache format.

## Not changed

- **`OLLAMA_KEEP_ALIVE`** — server default `5m`, overridden per call by Algora's
  `15m`.

## Verification

```bash
curl -s http://192.168.1.65:11434/api/ps    # one gemma3:4b, context_length 16384
```

```powershell
Select-String -Path "$env:LOCALAPPDATA\Ollama\server.log" -Pattern "server config" | Select-Object -Last 1
Select-String -Path "$env:LOCALAPPDATA\Ollama\server.log" -Pattern "inference compute" | Select-Object -Last 1
```

The second confirms the backend is CUDA (`library=CUDA`, compute 12.0, driver
13.1) rather than the Vulkan path the config also enables — worth re-checking
after any Ollama restart, since a silent backend change would look exactly like
a performance regression.
