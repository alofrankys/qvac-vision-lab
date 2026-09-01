# VisionPsy Standard preprocessing ablation

- Dataset: 20 official RealWorldQA cases; MD5 `4de008f55dc4fd008ca9e15321dc44b7`.
- Official Standard tiling/upscale: 10/20 (50.0%), mean TTFT 3835 ms, mean prompt 877.4 tokens.
- Diagnostic Standard no-upscale: 10/20 (50.0%), mean TTFT 1502 ms, mean prompt 431.1 tokens.
- Paired discordance: official-only 1, diagnostic-only 1; exact McNemar p=1.0000.

This small sample estimates preprocessing sensitivity; it is not the full official benchmark.
