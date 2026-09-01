# VisionPsy three-way · complete official RealWorldQA

- Run: 2026-09-01T14:34:51.436Z → 2026-09-01T22:04:03.315Z
- Dataset: 765 cases; source MD5 `4de008f55dc4fd008ca9e15321dc44b7`.
- Protocol: RealWorldQA multiple-choice exact, one excluded warm-up per model, rotating execution order.

| Model | Correct | Accuracy | Wilson 95% | Mean TTFT | Mean latency | Mean tok/s | Mean prompt-eval tokens | Peak process RSS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| VisionPsy Standard Q8 (QVAC SDK) | 446/765 | 58.3% | 54.8%–61.7% | 4737 ms | 4758 ms | 69.2 | 901.2 | 1643 MB |
| VisionPsy Flash Q8 (QVAC SDK) | 438/765 | 57.3% | 53.7%–60.7% | 2663 ms | 2691 ms | 71.2 | 533.3 | 1616 MB |
| VisionPsy Flash Q4 imatrix (QVAC SDK) | 428/765 | 55.9% | 52.4%–59.4% | 2659 ms | 2691 ms | 77.7 | 533.3 | 1624 MB |

Pairwise exact McNemar tests on exact pass/fail outcomes (exploratory; n=765):

- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q8 (QVAC SDK): discordant 84–76, exact p=0.5801.
- VisionPsy Standard Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): discordant 87–69, exact p=0.1733.
- VisionPsy Flash Q8 (QVAC SDK) vs VisionPsy Flash Q4 imatrix (QVAC SDK): discordant 43–33, exact p=0.3019.

Preprocessing:

- VisionPsy Standard Q8 (QVAC SDK): official-standard-tiled-upscale.
- VisionPsy Flash Q8 (QVAC SDK): native-resolution-no-upscale.
- VisionPsy Flash Q4 imatrix (QVAC SDK): native-resolution-no-upscale.
