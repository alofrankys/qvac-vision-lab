# VisionPsy methodology audit · adversarial release view

Generated: 2026-09-04T20:46:28.853Z

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
- Performance comparability: The full-run telemetry is not directly rankable because Standard Q4 was a separately paced addendum. A separate 50-case four-way diagnostic uses excluded warm-ups and a balanced four-position rotation for descriptive local timing.
- Statistical interpretation: All six pairwise accuracy comparisons are exploratory; the combined four-way report applies Holm correction.

## Sanity baselines

- Majority answer-letter baseline: 44.05%.
- Weighted random-option baseline: 37.70%.
- Answer letters: B=337, C=145, A=280, D=3.

## Deterministic repeatability

- 100 stratified cases × 3 passes per covered model.
- Covered: VisionPsy Standard Q8_0, VisionPsy Standard Q4_K_M imatrix, VisionPsy Flash Q8_0, VisionPsy Flash Q4_K_M imatrix.
- Excluded: .
- 800 new inferences in passes 2 and 3.
- Maximum accuracy swing: 0.00 pp.
- Minimum exact-output agreement: 100.0%.
- Minimum pass/fail agreement: 100.0%.

## Controlled local performance diagnostic

- 50 cases, 200 measured inferences and 4 excluded warm-ups.
- cases deterministically shuffled; provider order uses a balanced 4-position Latin rotation.
- These timings are descriptive for this Mac and are not merged into the 765-question quality score.

| Model | Mean TTFT | Mean latency | Mean generation |
|---|---:|---:|---:|
| VisionPsy Flash Q4_K_M imatrix | 2234 ms | 2257 ms | 75.9 tok/s |
| VisionPsy Flash Q8_0 | 2248 ms | 2267 ms | 67.8 tok/s |
| VisionPsy Standard Q4_K_M imatrix | 3953 ms | 3972 ms | 78.2 tok/s |
| VisionPsy Standard Q8_0 | 4006 ms | 4022 ms | 72.1 tok/s |

## Publication wording

> I ran the complete 765-question RealWorldQA set locally on four matching VisionPsy GGUF variants: VisionPsy Standard Q8_0 446/765 (58.30%) versus 59.10%; VisionPsy Standard Q4_K_M imatrix 443/765 (57.91%) versus 60.30%; VisionPsy Flash Q8_0 438/765 (57.25%) versus 56.70%; VisionPsy Flash Q4_K_M imatrix 428/765 (55.95%) versus 54.90%. The checksum-pinned upstream VLMEvalKit scorer produced 1 extraction difference and 1 pass/fail change. A separate 100-case, three-pass audit produced 0.00 pp maximum score swing and 100.0% minimum exact-output agreement. Standard Q4 was a later single-provider addendum with identical cases, prompts and scoring, so its original full-run performance KPIs are not directly comparable. A separate 50-case four-way run with excluded warm-ups and balanced execution order provides descriptive local timing without changing the quality score. This is an independent local corroboration on Apple Metal, not a reproduction of Tether's complete in-house evaluation.

## Residual limitations

- Tether reports in-house results; an exact vendor environment and all internal generation details are not publicly frozen.
- This is one benchmark and does not reproduce the complete 17-benchmark VisionPsy table.
- The 100-case repeatability audit covers all four variants. It tests deterministic local implementation stability, not other prompts, stochastic settings, hardware or the full 765-case set.
- Exact multiple-choice accuracy does not measure open-ended prose quality, safety, calibration or usefulness.
- Performance KPIs are local-device measurements and are not comparable with unpublished vendor hardware.
- The controlled four-way timing diagnostic covers 50 cases on one Mac. It is descriptive local evidence, not a portable hardware benchmark or a replacement for the full-run accuracy comparison.

Primary references:

- https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs
- https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs
- https://github.com/open-compass/VLMEvalKit
