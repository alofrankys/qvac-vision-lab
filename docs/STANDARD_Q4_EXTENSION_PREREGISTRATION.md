# Standard Q4 RealWorldQA extension · preregistration

Status: protocol frozen and addendum complete on 2026-09-04.

## Purpose

The canonical public run compared Standard Q8_0, Flash Q8_0 and Flash Q4_K_M imatrix. This addendum completes the architecture-by-quantization grid with VisionPsy-Nano-460M Standard Q4_K_M imatrix. It does not replace or rewrite the 2,295 existing inference records.

| Family | Q8_0 | Q4_K_M imatrix |
| --- | --- | --- |
| VisionPsy Standard | Complete | Complete · 443/765 |
| VisionPsy Flash | Complete | Complete |

## Frozen configuration

- Dataset: all 765 official RealWorldQA cases reconstructed from source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.
- Case order: deterministic shuffle seed `20260901`, identical to the canonical run.
- Prompt and scoring: checksum-pinned OpenCompass VLMEvalKit revision `470e51787a351764057869304e425bc76170bdc6`; exact answer-letter outcome.
- Model: `visionpsy-nano-460m-q4_k_m-imat.gguf`, registry revision `4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1`.
- Vision projector: `mmproj-visionpsy-nano-460m-q8.gguf` from the same registry revision. The Q4 label applies to the language-model weights; the official vision projector remains Q8_0.
- Runtime: `@qvac/sdk` 0.18.2 with `@qvac/llm-llamacpp` 0.47.0, QVAC llama.cpp backend and Apple Metal.
- Preprocessing: the same `official-standard-tiled-upscale` policy used by Standard Q8_0.
- Generation: temperature 0, top-p 1, top-k 40, seed 42 and 16 output tokens.
- Retry rule: up to three attempts for transport/runtime failures only; valid wrong answers are never retried.

The matching published RealWorldQA reference is 60.3% for Standard Q4_K_M imatrix. This value is a comparison target, not a pass criterion, and will not be used to change the protocol.

## Low-resource pacing

Inference remains strictly sequential. The default public command waits 30 seconds after each inference, adds a three-minute cooling pause after every 25 completed cases, and checks the one-minute system load before every warm-up and scored request. It waits in 60-second intervals while load exceeds 10, matching the test Mac's ten logical CPU cores. These controls reduce average hardware duty cycle but do not change model, prompt, image, generation or scoring settings. Latency collected during this deliberately paced addendum must not be compared directly with the earlier throughput-oriented run; a separate counterbalanced performance run is required for speed claims.

The runner writes one append-only checkpoint record after every completed inference and resumes by case/provider key. It must never delete or overwrite the canonical three-model evidence.

## Publication rule

No Standard Q4 local accuracy is quoted until all 765 cases are complete and the checkpoint passes manifest, artifact, scorer and duplicate-key validation. After completion, the four configurations may be presented as a complete 2×2 comparison. The dog video remains an illustrative product demo rather than benchmark evidence.

## Completion record

All 765 unique case/provider keys completed with zero retries, zero incomplete rows and zero provider-identity mismatches. Standard Q4 scored **443/765 (57.91%)**, with a Wilson 95% interval of **54.38–61.36%**, versus the frozen matching published value of **60.3%** (-2.39 percentage points). The primary three-model evidence remains byte-for-byte separate.

At the user's request, pacing was changed during the run: the initial low-resource delays were shortened and the final 560 cases ran without the load gate. Model artifact, projector, input order, prompt, generation values and scorer stayed frozen. Therefore the answer-level accuracy comparison remains paired and valid, while latency, throughput, RAM, CPU and GPU figures from this addendum must not be ranked directly against the earlier three-model run.

## Command

```bash
npm run showcase:test:standard-q4-vlmevalkit-low-resource
```
