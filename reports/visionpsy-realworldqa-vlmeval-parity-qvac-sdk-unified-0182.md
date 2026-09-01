# RealWorldQA scorer parity audit

Generated: 2026-08-31T14:12:23.971Z

| Provider | Local exact | VLMEvalKit-compatible exact | Score delta | Extraction differences | Pass changes |
|---|---:|---:|---:|---:|---:|
| qvac-visionpsy-standard-q8 | 438/765 (57.25%) | 438/765 (57.25%) | +0.00 pp | 0 | 0 |
| qvac-visionpsy | 432/765 (56.47%) | 432/765 (56.47%) | +0.00 pp | 0 | 0 |
| qvac-visionpsy-flash-q4 | 432/765 (56.47%) | 432/765 (56.47%) | +0.00 pp | 0 | 0 |

Total extraction differences: **0**; pass/fail changes: **0**.

Caveat: All three providers use QVAC SDK with the qvac-fabric-llm.cpp backend. This audit establishes scorer parity; Standard and Flash intentionally retain their official, model-specific image preprocessing.
