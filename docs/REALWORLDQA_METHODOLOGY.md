# RealWorldQA methodology and claim boundary

## What was run

QVAC Vision Lab evaluated four matching GGUF variants on all 765 official RealWorldQA scored cases from source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.

- VisionPsy Standard Q8_0
- VisionPsy Standard Q4_K_M imatrix
- VisionPsy Flash Q8_0
- VisionPsy Flash Q4_K_M imatrix

All four were served locally through `@qvac/sdk` 0.18.2, `@qvac/llm-llamacpp` 0.47.0 and the QVAC llama.cpp/Metal backend. Standard retained its tiled-upscale policy; Flash retained native-resolution/no-upscale. Each question used the original choices and exact answer-letter scoring; one warm-up per variant was excluded. The primary three-model run rotated order for every image. Standard Q4 was a preregistered single-provider addendum over the identical seeded case order.

## Result

| Variant | Correct | Local | Published matching GGUF | Delta |
| --- | ---: | ---: | ---: | ---: |
| Standard Q8_0 | 446/765 | 58.30% | 59.1% | -0.80 pp |
| Standard Q4_K_M imatrix | 443/765 | 57.91% | 60.3% | -2.39 pp |
| Flash Q8_0 | 438/765 | 57.25% | 56.7% | +0.55 pp |
| Flash Q4_K_M imatrix | 428/765 | 55.95% | 54.9% | +1.05 pp |

Standard Q8 leads Standard Q4 by three answers and Flash Q8 by eight. None of the six paired exact McNemar comparisons remains significant after Holm correction; every adjusted p-value is 1.0000. The defensible conclusion is “no clear winner in this local run.”

## What matches the official evaluation

- Same named public benchmark and full 765-question scope.
- Same source checksum and 762 unique images.
- Matching model/quantization variants.
- The public VLMEvalKit prompt is frozen from revision `470e51787a351764057869304e425bc76170bdc6`; the checksum-verified upstream `can_infer` scorer audit changed one extraction and one pass/fail outcome in the original 2,295-output run. Standard Q4 used that same frozen scorer.
- One aggregate RealWorldQA result; the dog demo and external diagnostic suites are never mixed into it.

## What is not proven identical

- Exact internal harness revision and invocation used for the published table.
- Bit-identical chat template, generation defaults and stop rules.
- Bit-identical image decoder, resize implementation and numerical kernels.
- Hardware, OS and runtime conditions.
- Behavior under different prompts, stochastic generation settings, hardware or numerical kernels.

Therefore this project uses **local corroboration** or **method-aligned comparison**, not “official reproduction” or “new leaderboard result.” The raw evidence is split without rewriting history: `reports/visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json` contains the original 2,295 records and `reports/visionpsy-standard-q4-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json` contains the 765-record addendum. The combined audit validates and joins them by case/provider key.

## Completed preregistered Standard Q4 extension

The frozen 765-case addendum completed with 443 correct answers (57.91%; Wilson 95% 54.38–61.36%) without changing or replacing the original 2,295 inference records. It supplies the missing cell in the 2×2 Standard/Flash × Q8/Q4 grid and uses the official Standard Q4 model with the official Q8 vision projector, Standard tiled-upscale preprocessing, identical dataset order, prompt, scorer, generation settings and QVAC runtime. Its local result is 2.39 percentage points below the matching published 60.3% value. Pacing was relaxed during execution at the user's request; this does not affect answer scoring, but its performance telemetry is not directly comparable with the earlier counterbalanced run. See [the preregistration and completion record](STANDARD_Q4_EXTENSION_PREREGISTRATION.md).

## Deterministic repeatability

A seeded, answer-letter/option-count-stratified subset of 100 cases was evaluated three times for Standard Q8, Flash Q8 and Flash Q4. Repeat 1 reuses the canonical run; repeats 2 and 3 add 600 new inferences. Those three variants produced identical raw outputs and pass/fail verdicts on all 100 cases in all three passes, yielding a 0.00 percentage-point score swing. Standard Q4 is excluded because it has not yet received the same repeatability run. This demonstrates deterministic repeatability only for the covered local fixed protocol; it is not a confidence interval and does not generalize to different prompts, seeds, hardware or stochastic decoding.

## Interpreting errors

Exact scoring is deliberately strict and reproducible, but it hides prose quality. The dog scenario separately demonstrates natural answers and rubric-based interpretation without contaminating benchmark accuracy. Published model limitations and local inspection both motivate caution around counting, fine spatial relations, small text/OCR, dense charts/documents, hallucination and ambiguous visual details. RealWorldQA alone cannot validate all of those capabilities.

Official references:

- [RealWorldQA dataset](https://huggingface.co/datasets/xai-org/RealworldQA)
- [VisionPsy Standard model card](https://huggingface.co/qvac/VisionPsy-Nano-460M)
- [VisionPsy Flash GGUF model card and result table](https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs)
