# VISIONPSY_FLASH_BASELINE_V1

Immutable reference for PawVault VisionPsy ceiling experiments.

- Source run: `run_20260813132428_draft_81956996`
- Provider: `VisionPsy-Nano-460M-Flash`
- Projection: `mmproj-visionpsy-nano-460m-flash-q8.gguf`
- Dataset: the exact 12 inference-normalized images referenced by the source run
- Predictions: 84 original persisted predictions; never mutated by benchmark tooling

The local benchmark manifest records each inference image SHA-256 under
`data/smoke-results/visionpsy-flash-baseline-v1.json`. All Base, dog-count A/B/C,
and CPU/Metal measurements are written as separate local experiment artifacts.
