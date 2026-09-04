# VisionPsy single-provider addendum · complete official RealWorldQA

- Run: 2026-09-04T12:46:18.801Z → 2026-09-04T15:16:34.114Z
- Dataset: 765 cases; source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.
- Protocol: RealWorldQA multiple-choice exact, one excluded warm-up, single provider over the same seeded case order used by the primary three-model run.
- Comparability: accuracy is paired case-by-case with the primary run; TTFT, latency, throughput and resource figures are a separately paced addendum and must not be ranked directly against the primary run.

| Model | Correct | Accuracy | Wilson 95% | Mean TTFT | Mean latency | Mean tok/s | Mean prompt-eval tokens | Peak process RSS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| VisionPsy Standard Q4 imatrix (QVAC SDK) | 443/765 | 57.9% | 54.4%–61.4% | 3533 ms | 3549 ms | 87.1 | 901.2 | 854 MB |

Pairwise exact McNemar tests on exact pass/fail outcomes (exploratory; n=765):


Preprocessing:

- VisionPsy Standard Q4 imatrix (QVAC SDK): official-standard-tiled-upscale.
