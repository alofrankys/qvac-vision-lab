# VisionPsy three-way · complete official RealWorldQA

- Run: 2026-08-31T10:47:54.967Z → 2026-08-31T13:34:16.890Z
- Dataset: 765 cases; source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.
- Protocol: RealWorldQA multiple-choice exact, one excluded warm-up per model, rotating execution order.

| Model | Correct | Accuracy | Wilson 95% | Mean TTFT | Mean latency | Mean tok/s | Mean prompt-eval tokens | Peak process RSS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| VisionPsy Standard Q8 (QVAC SDK) | 438/765 | 57.3% | 53.7%–60.7% | 5584 ms | 5606 ms | 51.6 | 896.2 | 245 MB |
| VisionPsy Flash Q8 (QVAC SDK) | 432/765 | 56.5% | 52.9%–59.9% | 3131 ms | 3154 ms | 49.7 | 528.3 | 245 MB |
| VisionPsy Flash Q4 imatrix (QVAC SDK) | 432/765 | 56.5% | 52.9%–59.9% | 3134 ms | 3158 ms | 53.4 | 528.3 | 245 MB |

Pairwise exact McNemar tests on exact pass/fail outcomes (exploratory; n=765):

- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q8 (QVAC SDK): discordant 89–83, exact p=0.7031.
- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): discordant 87–81, exact p=0.6998.
- VisionPsy Flash Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): discordant 35–35, exact p=1.0000.

Preprocessing:

- VisionPsy Standard Q8 (QVAC SDK): official-standard-tiled-upscale.
- VisionPsy Flash Q8 (QVAC SDK): native-resolution-no-upscale.
- VisionPsy Flash Q4 imatrix (QVAC SDK): native-resolution-no-upscale.
