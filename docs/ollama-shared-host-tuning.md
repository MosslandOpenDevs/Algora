# Shared Ollama service: generalized tuning reference

This guide records reusable tuning lessons for a GPU-backed Ollama service used
by multiple workloads. Operational endpoints, hostnames, tenant names, OS/GPU
identifiers, driver versions, and absolute capacity figures are intentionally
omitted. Keep `LOCAL_LLM_ENDPOINT` and host-specific settings in non-versioned
deployment configuration.

The values below are a reference starting point, not a statement of the live
production configuration. Re-measure them on each deployment.

## Reference baseline

| setting                    |             reference value | scope                             |
| -------------------------- | --------------------------: | --------------------------------- |
| model                      |                 `gemma3:4b` | workload-specific                 |
| `num_ctx`                  |                     `16384` | every client using the same model |
| `OLLAMA_NUM_PARALLEL`      |                         `2` | host                              |
| `OLLAMA_MAX_LOADED_MODELS` |                         `2` | host                              |
| `OLLAMA_FLASH_ATTENTION`   |                      `true` | host                              |
| `OLLAMA_KV_CACHE_TYPE`     |                      `q8_0` | host                              |
| `OLLAMA_GPU_OVERHEAD`      | deployment-specific reserve | host                              |
| `keep_alive`               |                       `15m` | per call                          |

Host-level variables are read at process start. Restart Ollama after changing
them, then confirm the effective values in the service log rather than assuming
the environment and running process agree.

## Scheduling model

Controlled measurements showed three behaviors that should be tested
separately:

| situation                        | behavior                                                       |
| -------------------------------- | -------------------------------------------------------------- |
| same model, different `num_ctx`  | the runner is replaced, causing a reload                       |
| same runner, concurrent requests | requests share the configured slots                            |
| different models                 | separate runners can execute concurrently when capacity allows |

This is why `num_ctx` is a coordination value as well as a context ceiling.
Clients using the same model should use the same value; otherwise alternating
requests can repeatedly replace the resident runner. Size the value from the
largest bounded prompt plus headroom, and change it across all clients together.

## Choosing `OLLAMA_NUM_PARALLEL`

Benchmark with realistic prompt and output lengths. One controlled reference
measurement produced the following normalized result; absolute throughput and
memory values are deliberately omitted because they fingerprint the host and do
not transfer reliably across hardware.

| `NUM_PARALLEL` | resident-memory ratio | aggregate-throughput ratio |
| -------------: | --------------------: | -------------------------: |
|              1 |                 1.00x |                      1.00x |
|              2 |           about 1.03x |                 about 1.6x |
|              4 |           about 1.14x |                 about 2.2x |

The reference deployment chose `2`: it captured most of the throughput gain
while preserving headroom for another resident model. Treat that as a starting
point only. Validate the combined reservation implied by
`NUM_PARALLEL * MAX_LOADED_MODELS` on the target host.

A controlled second-model coexistence test also confirmed that separate model
runners can remain resident and serve concurrently without eviction when there
is enough headroom. Do not infer that result from unrelated background traffic;
reproduce it with test workloads you control.

## Measurement discipline

Background traffic can contaminate shared-host benchmarks. For every concurrency
test:

1. Run a single-request control immediately before the test.
2. Run the concurrent workload with fixed prompts and output limits.
3. Run the same single-request control immediately afterward.
4. Compare normalized latency, throughput, and resident memory.

Without those controls, a slowdown may simply reflect contention from another
workload rather than a backend or configuration regression.

## Flash attention and KV-cache format

On the reference deployment, enabling flash attention and using a `q8_0` KV
cache produced no material change beyond run-to-run noise, and resident memory
was unchanged at the available measurement precision. This is safe to leave
enabled, but it should not be treated as guaranteed capacity headroom. Model
choice and parallelism remain the primary controls; re-measure on other
architectures.

## Keep-alive

The reference client sends `keep_alive: 15m` while the server default may be
shorter. On a shared service, a longer residency period can prevent avoidable
reloads between intermittent callers. Balance that against the need to admit
other models, and configure it per workload rather than publishing host-specific
assumptions.

## Verification

Set the real endpoint only in a local or deployment environment file, then use
the configured value for read-only verification:

```bash
OLLAMA_BASE_URL="${LOCAL_LLM_ENDPOINT:-http://localhost:11434}"
curl -s "${OLLAMA_BASE_URL}/api/ps"
```

After a restart, inspect the Ollama service log for the effective server
configuration and inference backend. Log locations and accelerator details vary
by host and should stay in private operations documentation.
