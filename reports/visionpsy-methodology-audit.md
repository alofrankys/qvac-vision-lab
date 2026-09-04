# VisionPsy methodology audit · adversarial release view

Generated: 2026-09-04T16:04:58.925Z

Verdict: **UPSTREAM_PROMPT_LOCAL_CORROBORATION**.

| Model | Local | Matching published GGUF | Delta |
|---|---:|---:|---:|
| VisionPsy Standard Q8_0 | 446/765 (58.30%) | 59.10% | -0.80 pp |
| VisionPsy Standard Q4_K_M imatrix | 443/765 (57.91%) | 60.30% | -2.39 pp |
| VisionPsy Flash Q8_0 | 438/765 (57.25%) | 56.70% | +0.55 pp |
| VisionPsy Flash Q4_K_M imatrix | 428/765 (55.95%) | 54.90% | +1.05 pp |

## Evidence design

- Primary run: `visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json` (balanced three-position rotation).
- Standard Q4 addendum: `visionpsy-standard-q4-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json` (same 765 cases and seeded order, executed separately).
- Accuracy comparability: Paired case-by-case across all four variants: same 765 source indices, image hashes, prompts, expected answers and scorer.
- Performance comparability: Not directly rankable across all four variants: Standard Q4 was measured later in a separately paced single-provider addendum.
- Statistical interpretation: All six pairwise accuracy comparisons are exploratory; the combined four-way report applies Holm correction.

## Sanity baselines

- Majority answer-letter baseline: 44.05%.
- Weighted random-option baseline: 37.70%.
- Answer letters: B=337, C=145, A=280, D=3.

## Deterministic repeatability

- 100 stratified cases × 3 passes per covered model.
- Covered: VisionPsy Standard Q8_0, VisionPsy Flash Q8_0, VisionPsy Flash Q4_K_M imatrix.
- Excluded: VisionPsy Standard Q4_K_M imatrix.
- 600 new inferences in passes 2 and 3.
- Maximum accuracy swing: 0.00 pp.
- Minimum exact-output agreement: 100.0%.
- Minimum pass/fail agreement: 100.0%.

## Publication wording

> I ran the complete 765-question RealWorldQA set locally on four matching VisionPsy GGUF variants: VisionPsy Standard Q8_0 446/765 (58.30%) versus 59.10%; VisionPsy Standard Q4_K_M imatrix 443/765 (57.91%) versus 60.30%; VisionPsy Flash Q8_0 438/765 (57.25%) versus 56.70%; VisionPsy Flash Q4_K_M imatrix 428/765 (55.95%) versus 54.90%. The checksum-pinned upstream VLMEvalKit scorer produced 1 extraction differences and 1 pass/fail changes. A separate 100-case, three-pass audit produced 0.00 pp maximum score swing and 100.0% minimum exact-output agreement. Standard Q4 was a later single-provider addendum with identical cases, prompts and scoring, so its accuracy is paired but its performance KPIs are not directly comparable. This is an independent local corroboration on Apple Metal, not a reproduction of Tether's complete in-house evaluation.

## Residual limitations

- Tether reports in-house results; an exact vendor environment and all internal generation details are not publicly frozen.
- This is one benchmark and does not reproduce the complete 17-benchmark VisionPsy table.
- The 100-case repeatability audit covers the original three variants only; Standard Q4 has no repeated-subset audit. It tests deterministic local implementation stability, not other prompts, stochastic settings, hardware or the full 765-case set.
- Exact multiple-choice accuracy does not measure open-ended prose quality, safety, calibration or usefulness.
- Performance KPIs are local-device measurements and are not comparable with unpublished vendor hardware.
- Standard Q4 was added after the primary balanced three-model rotation. Its paired accuracy is comparable, but its timing and resource KPIs are not a controlled four-way performance experiment.

Primary references:

- https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs
- https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs
- https://github.com/open-compass/VLMEvalKit
