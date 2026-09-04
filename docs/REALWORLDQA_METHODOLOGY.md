# RealWorldQA methodology and claim boundary

## What was run

QVAC Vision Lab evaluated three matching GGUF variants on all 765 official RealWorldQA scored cases from source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.

- VisionPsy Standard Q8_0
- VisionPsy Flash Q8_0
- VisionPsy Flash Q4_K_M imatrix

All three were served locally through `@qvac/sdk` 0.18.2, `@qvac/llm-llamacpp` 0.47.0 and the QVAC llama.cpp/Metal backend. Standard retained its tiled-upscale policy; Flash retained native-resolution/no-upscale. Each question used the original choices and exact answer-letter scoring. Model order rotated for every image; one warm-up per model was excluded.

## Result

| Variant | Correct | Local | Published matching GGUF | Delta |
| --- | ---: | ---: | ---: | ---: |
| Standard Q8_0 | 446/765 | 58.30% | 59.1% | -0.80 pp |
| Flash Q8_0 | 438/765 | 57.25% | 56.7% | +0.55 pp |
| Flash Q4_K_M imatrix | 428/765 | 55.95% | 54.9% | +1.05 pp |

The eight-answer lead for Standard over Flash Q8 is not statistically decisive. The three Holm-adjusted paired exact McNemar p-values are 0.6037, 0.5199 and 0.6037. The defensible conclusion is “no clear winner in this local run.”

## What matches the official evaluation

- Same named public benchmark and full 765-question scope.
- Same source checksum and 762 unique images.
- Matching model/quantization variants.
- The public VLMEvalKit prompt is frozen from revision `470e51787a351764057869304e425bc76170bdc6`; the checksum-verified upstream `can_infer` scorer changed one extraction and one pass/fail outcome across 2,295 outputs.
- One aggregate RealWorldQA result; the dog demo and external diagnostic suites are never mixed into it.

## What is not proven identical

- Exact internal harness revision and invocation used for the published table.
- Bit-identical chat template, generation defaults and stop rules.
- Bit-identical image decoder, resize implementation and numerical kernels.
- Hardware, OS and runtime conditions.
- Behavior under different prompts, stochastic generation settings, hardware or numerical kernels.

Therefore this project uses **local corroboration** or **method-aligned comparison**, not “official reproduction” or “new leaderboard result.” The canonical raw evidence is `reports/visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json`; older exploratory runs are intentionally excluded from the public repository.

## Preregistered Standard Q4 extension

The original roster is asymmetric across architecture and quantization. A frozen 765-case addendum adds VisionPsy Standard Q4_K_M imatrix without changing or replacing the original 2,295 inference records. When complete, this supplies a 2×2 Standard/Flash × Q8/Q4 comparison. The addendum uses the official Standard Q4 model and Q8 vision projector, the same Standard tiled-upscale preprocessing, dataset order, prompt, scorer, generation settings and QVAC runtime as the canonical run. Low-resource pauses alter only duty cycle; performance claims require a separate counterbalanced run. See [the preregistration](STANDARD_Q4_EXTENSION_PREREGISTRATION.md).

## Deterministic repeatability

A seeded, answer-letter/option-count-stratified subset of 100 cases was evaluated three times per model. Repeat 1 reuses the canonical run; repeats 2 and 3 add 600 new inferences. Every model produced identical raw outputs and identical pass/fail verdicts on all 100 cases in all three passes, yielding a 0.00 percentage-point score swing. This demonstrates deterministic repeatability for this local fixed protocol; it is not a confidence interval and does not generalize to different prompts, seeds, hardware or stochastic decoding.

## Interpreting errors

Exact scoring is deliberately strict and reproducible, but it hides prose quality. The dog scenario separately demonstrates natural answers and rubric-based interpretation without contaminating benchmark accuracy. Published model limitations and local inspection both motivate caution around counting, fine spatial relations, small text/OCR, dense charts/documents, hallucination and ambiguous visual details. RealWorldQA alone cannot validate all of those capabilities.

Official references:

- [RealWorldQA dataset](https://huggingface.co/datasets/xai-org/RealworldQA)
- [VisionPsy Standard model card](https://huggingface.co/qvac/VisionPsy-Nano-460M)
- [VisionPsy Flash GGUF model card and result table](https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs)
