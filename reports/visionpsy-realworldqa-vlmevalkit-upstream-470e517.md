# Direct pinned VLMEvalKit scorer audit

- Revision: `470e51787a351764057869304e425bc76170bdc6`
- Scorer SHA-256: `06088ed4da68cd9d8c3018e7630d0503f1365e6dd31f651cbedd8aa44dc14466`
- Outputs compared: 2295
- Extraction differences: 1
- Pass/fail changes: 1

| Provider | Upstream correct | Extraction differences | Pass changes |
|---|---:|---:|---:|
| qvac-visionpsy-standard-q8 | 447/765 | 1 | 1 |
| qvac-visionpsy | 438/765 | 0 | 0 |
| qvac-visionpsy-flash-q4 | 428/765 | 0 | 0 |

The audit executes the exact checksum-verified upstream `can_infer` source. It does not claim parity for model preprocessing, inference runtime, hardware, or any unavailable vendor-internal harness configuration.
