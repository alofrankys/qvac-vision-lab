# VisionPsy 4-way · RealWorldQA content-blind validation sample

- Run: 2026-09-04T20:18:37.268Z → 2026-09-04T20:29:25.037Z
- Dataset: 50 cases; source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.
- Protocol: multiple-choice exact, one excluded warm-up per model, rotating execution order.

| Model | Correct | Accuracy | Wilson 95% | Mean TTFT | Mean latency | Mean tok/s | Mean prompt-eval tokens | Peak process RSS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| VisionPsy Standard Q8 (QVAC SDK) | 31/50 | 62.0% | 48.2%–74.1% | 4006 ms | 4022 ms | 72.1 | 887.9 | 1869 MB |
| VisionPsy Standard Q4 imatrix (QVAC SDK) | 31/50 | 62.0% | 48.2%–74.1% | 3953 ms | 3972 ms | 78.2 | 887.9 | 1868 MB |
| VisionPsy Flash Q8 (QVAC SDK) | 31/50 | 62.0% | 48.2%–74.1% | 2248 ms | 2267 ms | 67.8 | 523.9 | 1868 MB |
| VisionPsy Flash Q4 imatrix (QVAC SDK) | 29/50 | 58.0% | 44.2%–70.6% | 2234 ms | 2257 ms | 75.9 | 523.9 | 1861 MB |

Pairwise exact McNemar tests on exact pass/fail outcomes (exploratory; n=50):

- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Standard Q4 imatrix (QVAC SDK): discordant 2–2, exact p=1.0000.
- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q8 (QVAC SDK): discordant 5–5, exact p=1.0000.
- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): discordant 4–2, exact p=0.6875.
- VisionPsy Standard Q4 imatrix (QVAC SDK) vs VisionPsy Flash Q8 (QVAC SDK): discordant 5–5, exact p=1.0000.
- VisionPsy Standard Q4 imatrix (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): discordant 5–3, exact p=0.7266.
- VisionPsy Flash Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): discordant 4–2, exact p=0.6875.

Preprocessing:

- VisionPsy Standard Q8 (QVAC SDK): official-standard-tiled-upscale.
- VisionPsy Standard Q4 imatrix (QVAC SDK): official-standard-tiled-upscale.
- VisionPsy Flash Q8 (QVAC SDK): native-resolution-no-upscale.
- VisionPsy Flash Q4 imatrix (QVAC SDK): native-resolution-no-upscale.
