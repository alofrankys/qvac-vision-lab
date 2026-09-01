# RealWorldQA methodology and claim boundary

## What was run

QVAC Vision Lab evaluated the three matching GGUF variants on all 765 official RealWorldQA questions (762 unique images) from source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.

- VisionPsy Standard Q8_0
- VisionPsy Flash Q8_0
- VisionPsy Flash Q4_K_M imatrix

All three were served locally through `@qvac/sdk` 0.18.2, `@qvac/llm-llamacpp` 0.47.0 and the QVAC llama.cpp/Metal backend. Standard retained its tiled-upscale policy; Flash retained native-resolution/no-upscale. Each question used the original choices and exact answer-letter scoring. Model order rotated for every image; one warm-up per model was excluded.

## Result

| Variant | Correct | Local | Published matching GGUF | Delta |
| --- | ---: | ---: | ---: | ---: |
| Standard Q8_0 | 438/765 | 57.25% | 59.1% | -1.85 pp |
| Flash Q8_0 | 432/765 | 56.47% | 56.7% | -0.23 pp |
| Flash Q4_K_M imatrix | 432/765 | 56.47% | 54.9% | +1.57 pp |

The six-answer lead for Standard is not statistically decisive. All Holm-adjusted paired exact McNemar p-values equal 1.0. The defensible conclusion is “no clear winner in this local run.”

## What matches the official evaluation

- Same named public benchmark and full 765-question scope.
- Same source checksum and 762 unique images.
- Matching model/quantization variants.
- Exact multiple-choice scoring; a VLMEvalKit-compatible rescoring audit changed zero outcomes.
- One aggregate RealWorldQA result; the dog demo and external diagnostic suites are never mixed into it.

## What is not proven identical

- Exact private VLMEvalKit revision and invocation used for the published table.
- Bit-identical chat template, generation defaults and stop rules.
- Bit-identical image decoder, resize implementation and numerical kernels.
- Hardware, OS and runtime conditions.
- Repeated-run or repeated-seed variance.

Therefore this project uses **local corroboration** or **method-aligned comparison**, not “official reproduction” or “new leaderboard result.” The canonical raw evidence is `reports/visionpsy-three-way-realworldqa-765-qvac-sdk-unified-0182.json`; older exploratory runs are intentionally excluded from the public repository.

## Interpreting errors

Exact scoring is deliberately strict and reproducible, but it hides prose quality. The dog scenario separately demonstrates natural answers and rubric-based interpretation without contaminating benchmark accuracy. Published model limitations and local inspection both motivate caution around counting, fine spatial relations, small text/OCR, dense charts/documents, hallucination and ambiguous visual details. RealWorldQA alone cannot validate all of those capabilities.

Official references:

- [RealWorldQA dataset](https://huggingface.co/datasets/xai-org/RealworldQA)
- [VisionPsy Standard model card](https://huggingface.co/qvac/VisionPsy-Nano-460M)
- [VisionPsy Flash GGUF model card and result table](https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs)
