# VisionPsy · RealWorldQA 765 · unified QVAC audit

Generated: 2026-08-31T14:59:32.849Z

Standard Q8 finishes first by six answers, but the paired differences are not statistically significant. Treat the ordering as a local corroboration of the official direction, not proof that Standard is categorically better.

| Rank | Model | Local | Official matching GGUF | Delta | Wilson 95% | Mean TTFT | Mean latency |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | VisionPsy Standard Q8 (QVAC SDK) | 438/765 (57.3%) | 59.1% | -1.85 pp | 53.7%–60.7% | 5584 ms | 5606 ms |
| 2 | VisionPsy Flash Q8 (QVAC SDK) | 432/765 (56.5%) | 56.7% | -0.23 pp | 52.9%–59.9% | 3131 ms | 3154 ms |
| 3 | VisionPsy Flash Q4 imatrix (QVAC SDK) | 432/765 (56.5%) | 54.9% | +1.57 pp | 52.9%–59.9% | 3134 ms | 3158 ms |

Statistical verdict: **NO CLEAR WINNER AFTER HOLM**.

Paired exact McNemar tests (Holm-adjusted):

- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q8 (QVAC SDK): unique wins 89–83; raw p=0.7031; Holm p=1.0000.
- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): unique wins 87–81; raw p=0.6998; Holm p=1.0000.
- VisionPsy Flash Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): unique wins 35–35; raw p=1.0000; Holm p=1.0000.

Agreement: all correct 328; all wrong 232; exactly one correct 92; exactly two correct 113.

## Methodology versus official

- Same public scope: 765 questions, 762 unique real images, source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.
- Same native stack across local variants: @qvac/sdk 0.18.2; @qvac/llm-llamacpp 0.47.0 · qvac-fabric-llm.cpp · Metal GPU.
- Scorer audit: 0 extraction differences and 0 pass/fail changes.
- Remaining caveat: Tether reports a single VLMEvalKit harness and official benchmark metrics. This run matches the public dataset, checksum, option scoring, model quantizations and QVAC-native serving stack, but does not establish bit-for-bit parity of VLMEvalKit version, generation parameters, prompt template, image decoder/resize path, or hardware.

## Audit criticalities

1. **Prompt and generation parity are not bit-for-bit proven (High)** — Without this, compare direction and distance cautiously; do not call the run an exact reproduction. Recommended: B.
2. **Preprocessing differs intentionally between Standard and Flash (High)** — Official preprocessing is the fair headline; the ablation explains whether tiling helps or hurts particular cases. Recommended: A+B.
3. **RealWorldQA is compositionally imbalanced (High)** — Category percentages without denominators would look precise but be misleading. Recommended: B.
4. **A single benchmark cannot validate all advertised capabilities (High)** — The X post must not generalize this score to overall VisionPsy quality. Recommended: A now; B next.
5. **Exact one-letter scoring masks answer quality (Medium)** — Do not mix qualitative grades into the official accuracy denominator. Recommended: A for benchmark; B as separate evidence.
6. **The score gaps are statistically weak (High)** — The defensible conclusion is “no clear local winner”, despite the rank order. Recommended: B.
7. **System resource KPIs are not model-isolated (Medium)** — Latency is reliable for this machine/run; GPU/RAM comparisons need narrower claims. Recommended: B.
8. **Equal aggregate scores can hide different failure sets (Medium)** — The Q4 result does not prove quantization is lossless on individual cases. Recommended: B.
9. **Official-number provenance changes with precision and table revision (Medium)** — This avoids claiming a gain or loss against the wrong precision. Recommended: B.
10. **No repeated-seed variance estimate (Medium)** — One deterministic run is valid for the fixed protocol, not a universal variance estimate. Recommended: A for this exact benchmark; B for robustness audit.
11. **Execution order is balanced but deterministically tied to case order (Medium)** — This run controls unequal position counts, but cannot cleanly estimate a causal cache/order effect from the position subsets. Recommended: B for the next replication.

## Publication-safe claim

On the complete 765-question RealWorldQA set, using the same local QVAC SDK/backend and exact option scoring, Standard Q8 scored 57.3% and both Flash variants 56.5%. Standard ranked first, but paired tests found no significant winner.
