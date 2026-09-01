# QVAC SDK 0.18.1 — VisionPsy KPI impact audit

Date: 2026-08-25
Host: Apple M4, macOS, Node.js 22.22.0

## Executive verdict

QVAC SDK 0.18.1 materially changes the **availability and integration KPIs**:
VisionPsy Base and Flash now load and infer through the official QVAC path, so
the former `BLOCKED` provider can be marked `READY`.

It does not, by itself, improve the model weights or justify rewriting any
historical Vision Lab quality score. The old patched-runtime evidence remains
immutable. A new official-SDK evidence series must be versioned separately.

## Controlled diagnostic

The audit used the same Apple M4 host, VisionPsy Flash Q4_K_M model, Q8
projector, two normalized JPEGs, exact prompts, temperature 0, 24-token budget,
and sequential execution. Four closed-label cases covered indoor/outdoor and
dog count with visually verified answers.

Three paths were compared:

1. current SDK provider configuration: projector on CPU, default upscale;
2. optimized SDK configuration: `mmproj-use-gpu=true` and
   `image_no_upscale=on`;
3. historical patched llama.cpp Metal server.

| Runtime path | Completed | Exact | Mean inference | Mean warm inference | Cold load/start |
| --- | ---: | ---: | ---: | ---: | ---: |
| SDK current | 4/4 | 4/4 | 21.070 s | 20.815 s | 3.493 s |
| SDK optimized | 4/4 | 4/4 | 3.808 s | 3.613 s | 1.167 s |
| Patched Metal | 4/4 | 4/4 | 2.663 s* | 1.576 s* | 1.554 s |

The optimized SDK reduced mean inference latency by **81.9%**, a **5.5×**
speedup over the current SDK configuration. Mean warm latency fell by 82.6%.

`*` The patched mean is not directly comparable as one aggregate: it includes
its first server cold start and then benefits from strong same-image prefix
cache reuse. Workload-level comparisons below are more informative.

## Workload-level performance

### First cold image

QVAC reports model load separately from inference, while the patched provider
includes server startup in its first request. Normalizing the accounting:

- optimized SDK: 1.167 s load + 4.394 s inference = **5.561 s**;
- patched Metal: **5.926 s** total;
- optimized SDK was about **6.2% faster** in this single cold observation.

### New image with runtime already warm

- optimized SDK: **3.483 s**;
- patched Metal: **4.034 s**;
- optimized SDK was about **13.7% faster** in this single new-image observation.

### Second question on the same image

- optimized SDK mean: **3.678 s**;
- patched Metal mean: **0.347 s**;
- patched was about **10.6× faster** for this pattern.

The trace explains the gap: patched llama.cpp evaluated roughly 864–868 prompt
tokens for the first question, then only 42 for the follow-up. QVAC evaluated
884–890 prompt tokens each time and reported `cacheTokens=0`. This matters for
Vision Lab workflows that ask several tasks about each photo.

## KPI impact

| KPI | Impact now | What can be claimed |
| --- | --- | --- |
| Load compatibility | Major positive | Base and Flash both load; former blocker fixed |
| Provider availability | `BLOCKED` → `READY` | Official SDK inference is operational |
| Closed-label parity | Positive but tiny sample | 4/4 exact and identical across all three paths |
| General accuracy | Not established | No model-weight change; rerun the locked benchmark |
| First/new-image latency | Near parity after tuning | 5.56 s cold total; 3.48 s warm new image in this audit |
| Multi-question latency | Patched still leads | SDK did not reuse the visual/prompt prefix in this test |
| Throughput/concurrency | Not measured | Do not claim a batching gain for the sequential Lab |
| Memory/energy | Not comparable | SDK exposes no directly comparable provider RSS/energy KPI |
| Operational complexity | Positive | Official package can replace a custom fork for compatibility |
| Lifecycle reliability | Open caveat | Node IPC auto-close hang observed; local workaround applied |

## Effect on previous Vision Lab work

- Historical quality, latency, and Arena results do **not** change
  retroactively; their runtime provenance remains patched llama.cpp.
- The old “QVAC VisionPsy unsupported” conclusion is superseded for SDK 0.18.1.
- A future official-SDK benchmark must use a new run/experiment version and
  record `@qvac/sdk 0.18.1`, `@qvac/llm-llamacpp 0.45.0`, GPU projector, upscale
  policy, cache behavior, model/projector hashes, and cold/warm state.
- Before migrating the primary Arena, repeat the locked set and compare raw
  outputs, exact/objective scores, invalid-output rate, latency by workload,
  timeouts, and cancellation behavior.

## Public communication boundary

Safe claim: QVAC responded quickly, the reported projector incompatibility is
fixed, Base and Flash now run through the official SDK, and a small local audit
confirmed real inference plus strong performance after GPU/no-upscale tuning.

Unsafe claim: the patch improves VisionPsy accuracy, changes historical
benchmark rankings, reduces memory/energy, or makes every workload faster.

## Reproducibility

- Audit script: `scripts/audit-qvac-visionpsy-018-kpis.mjs`
- Raw evidence:
  `docs/arena/runtime-compatibility-logs/visionpsy-qvac-018-kpi-audit.json`
- Compatibility audit: `docs/arena/QVAC_SDK_018_VISIONPSY_VERIFICATION.md`

This is a four-case diagnostic, not benchmark or ranking evidence. Provider
order was not rotated, and SDK/HTTP generation defaults are not byte-identical.
