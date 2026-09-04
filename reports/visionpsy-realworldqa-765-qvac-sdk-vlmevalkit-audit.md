# VisionPsy · RealWorldQA 765 · frozen-protocol QVAC audit

Generated: 2026-09-04T20:46:28.627Z

VisionPsy Standard Q8 (QVAC SDK) ranks first locally by 3 answers over VisionPsy Standard Q4 imatrix (QVAC SDK). No paired difference remains significant after Holm correction.

| Rank | Model | Local | Official matching GGUF | Delta | Wilson 95% | Image-cluster bootstrap 95% | Mean TTFT | Mean latency |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | VisionPsy Standard Q8 (QVAC SDK) | 446/765 (58.3%) | 59.1% | -0.80 pp | 54.8%–61.7% | 54.8%–61.8% | 4737 ms | 4758 ms |
| 2 | VisionPsy Standard Q4 imatrix (QVAC SDK) | 443/765 (57.9%) | 60.3% | -2.39 pp | 54.4%–61.4% | 54.3%–61.4% | 3533 ms | 3549 ms |
| 3 | VisionPsy Flash Q8 (QVAC SDK) | 438/765 (57.3%) | 56.7% | +0.55 pp | 53.7%–60.7% | 53.7%–60.7% | 2663 ms | 2691 ms |
| 4 | VisionPsy Flash Q4 imatrix (QVAC SDK) | 428/765 (55.9%) | 54.9% | +1.05 pp | 52.4%–59.4% | 52.3%–59.4% | 2659 ms | 2691 ms |

Statistical verdict: **NO CLEAR WINNER AFTER HOLM**.

Sanity baselines: majority letter 44.1%; option-count-weighted random choice 37.7%.

Paired exact McNemar tests (Holm-adjusted):

- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Standard Q4 imatrix (QVAC SDK): unique wins 37–34; Δ=+0.39 pp (image-cluster bootstrap 95% -1.70 to +2.49 pp); raw p=0.8126; Holm p=1.0000.
- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q8 (QVAC SDK): unique wins 84–76; Δ=+1.05 pp (image-cluster bootstrap 95% -2.10 to +4.19 pp); raw p=0.5801; Holm p=1.0000.
- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): unique wins 87–69; Δ=+2.35 pp (image-cluster bootstrap 95% -0.79 to +5.60 pp); raw p=0.1733; Holm p=1.0000.
- VisionPsy Standard Q4 imatrix (QVAC SDK) vs VisionPsy Flash Q8 (QVAC SDK): unique wins 88–83; Δ=+0.65 pp (image-cluster bootstrap 95% -2.62 to +4.05 pp); raw p=0.7598; Holm p=1.0000.
- VisionPsy Standard Q4 imatrix (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): unique wins 92–77; Δ=+1.96 pp (image-cluster bootstrap 95% -1.30 to +5.36 pp); raw p=0.2815; Holm p=1.0000.
- VisionPsy Flash Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): unique wins 43–33; Δ=+1.31 pp (image-cluster bootstrap 95% -0.92 to +3.53 pp); raw p=0.3019; Holm p=1.0000.

## Deterministic repeatability

100 stratified cases, 3 total passes per model; repeats 2 and 3 add 800 new inferences.

- VisionPsy Standard Q8 (QVAC SDK): 60/100 · 60/100 · 60/100; max swing 0.00 pp; exact outputs 100/100.
- VisionPsy Standard Q4 imatrix (QVAC SDK): 59/100 · 59/100 · 59/100; max swing 0.00 pp; exact outputs 100/100.
- VisionPsy Flash Q8 (QVAC SDK): 52/100 · 52/100 · 52/100; max swing 0.00 pp; exact outputs 100/100.
- VisionPsy Flash Q4 imatrix (QVAC SDK): 55/100 · 55/100 · 55/100; max swing 0.00 pp; exact outputs 100/100.

Repeat 1 is the frozen 765-case primary run. Repeats 2 and 3 are new local inferences over the same deterministic 100-case subset. Accuracy ranges and exact-output agreement measure local repeatability; they are not confidence intervals for all possible prompts or hardware.

## Separate controlled local performance diagnostic

50 cases, 200 measured inferences and 4 excluded warm-ups. cases deterministically shuffled; provider order uses a balanced 4-position Latin rotation.

| Model | Mean TTFT | Median TTFT | Mean latency | Median latency | Mean generation |
|---|---:|---:|---:|---:|---:|
| VisionPsy Flash Q4 imatrix (QVAC SDK) | 2234 ms | 1986 ms | 2257 ms | 2007 ms | 75.9 tok/s |
| VisionPsy Flash Q8 (QVAC SDK) | 2248 ms | 2068 ms | 2267 ms | 2080 ms | 67.8 tok/s |
| VisionPsy Standard Q4 imatrix (QVAC SDK) | 3953 ms | 3511 ms | 3972 ms | 3540 ms | 78.2 tok/s |
| VisionPsy Standard Q8 (QVAC SDK) | 4006 ms | 3680 ms | 4022 ms | 3693 ms | 72.1 tok/s |

The ordering is descriptive for this Mac and controlled run. It is not a portable hardware benchmark, and system-wide GPU or unified-memory samples are not model-isolated.

Agreement by number of correct models: 0/4 = 215; 1/4 = 53; 2/4 = 107; 3/4 = 72; 4/4 = 318.

## Methodology versus official

- Same public scope: 765 questions, source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.
- Prompt frozen verbatim from the pinned public VLMEvalKit revision; image is supplied before text.
- Scoring uses checksum-pinned VLMEvalKit option inference followed by binary comparison with the gold option.
- Same native stack across local variants: @qvac/sdk 0.18.2; @qvac/llm-llamacpp 0.47.0 · qvac-fabric-llm.cpp · Metal GPU.
- Standard Q4 is a separately paced preregistered addendum: accuracy is paired, performance telemetry is not directly rankable.
- Direct upstream scorer audit: 1 extraction difference and 1 pass/fail change (revision `470e51787a351764057869304e425bc76170bdc6`).
- Uncertainty: Wilson intervals describe question-level binomial uncertainty. A supplementary deterministic bootstrap resamples image clusters so questions sharing a source image are not treated as independent.
- Remaining caveat: This audit freezes the public VLMEvalKit prompt/scorer revision, dataset checksum, generation values, artifact hashes and QVAC-native stack. It cannot establish parity with unavailable vendor-internal environment details, hardware or numerical kernels.

## Audit criticalities

1. **Vendor-internal environment is not public (Medium)** — The local run is auditable without overstating vendor parity. Recommended: B.
2. **Preprocessing differs intentionally between Standard and Flash (High)** — Official preprocessing is the fair headline; the ablation explains whether tiling helps or hurts particular cases. Recommended: A+B.
3. **Answer choices are imbalanced and category labels are heuristic (High)** — This prevents category and letter-position artifacts from being mistaken for general visual skill. Recommended: B.
4. **A single benchmark cannot validate all advertised capabilities (High)** — The X post must not generalize this score to overall VisionPsy quality. Recommended: A now; B next.
5. **Exact one-letter scoring masks answer quality (Medium)** — Do not mix qualitative grades into the official accuracy denominator. Recommended: A for benchmark; B as separate evidence.
6. **The score gaps are statistically weak (High)** — The defensible conclusion is “no clear local winner”, despite the rank order. Recommended: B.
7. **System resource KPIs are not model-isolated (Medium)** — Latency is reliable for this machine/run; GPU/RAM comparisons need narrower claims. Recommended: B.
8. **Aggregate scores can hide different failure sets (Medium)** — The Q4 result does not prove quantization is lossless on individual cases. Recommended: B.
9. **Official-number provenance changes with precision and table revision (Medium)** — This avoids claiming a gain or loss against the wrong precision. Recommended: B.
10. **Repeatability is measured on a subset (Medium)** — This tests local implementation stability, not all prompts, seeds, hardware or stochastic settings. Recommended: B completed.
11. **Standard Q4 is a separate addendum run (High)** — The 2×2 quality comparison and the separate local timing diagnostic are now distinct artifacts. Recommended: B completed.
12. **Execution remains sequential on one device (Low)** — Accuracy remains paired; latency is explicitly local-device evidence. Recommended: B.
13. **Some questions share a source image (Medium)** — Public uncertainty now reflects the shared-image structure without changing the benchmark denominator. Recommended: B completed.
14. **Public benchmark material may have appeared in training data (Medium)** — The result remains a benchmark corroboration, not a clean-room generalization claim. Recommended: B.

## Publication-safe claim

Independent local RealWorldQA corroboration on the public 765-question split, using a frozen upstream prompt/scorer revision and one QVAC-native runtime/backend: VisionPsy Standard Q8 (QVAC SDK) 446/765 (58.3%); VisionPsy Standard Q4 imatrix (QVAC SDK) 443/765 (57.9%); VisionPsy Flash Q8 (QVAC SDK) 438/765 (57.3%); VisionPsy Flash Q4 imatrix (QVAC SDK) 428/765 (55.9%). The local rank order was not statistically decisive after paired Holm-corrected tests. This is not a claim of byte-for-byte replication of Tether's internal environment.
