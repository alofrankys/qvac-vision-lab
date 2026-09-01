# VisionPsy RealWorldQA repeatability audit

100 deterministically selected cases, three repeats per model. Repeat 1 is reused from the primary 765-case run.

| Model | Repeat 1 | Repeat 2 | Repeat 3 | Max swing | Exact output agreement | Pass/fail agreement |
|---|---:|---:|---:|---:|---:|---:|
| VisionPsy Standard Q8 (QVAC SDK) | 60/100 (60.0%) | 60/100 (60.0%) | 60/100 (60.0%) | 0.00 pp | 100/100 (100.0%) | 100/100 (100.0%) |
| VisionPsy Flash Q8 (QVAC SDK) | 52/100 (52.0%) | 52/100 (52.0%) | 52/100 (52.0%) | 0.00 pp | 100/100 (100.0%) | 100/100 (100.0%) |
| VisionPsy Flash Q4 imatrix (QVAC SDK) | 55/100 (55.0%) | 55/100 (55.0%) | 55/100 (55.0%) | 0.00 pp | 100/100 (100.0%) | 100/100 (100.0%) |

Repeat 1 is the frozen 765-case primary run. Repeats 2 and 3 are new local inferences over the same deterministic 100-case subset. Accuracy ranges and exact-output agreement measure local repeatability; they are not confidence intervals for all possible prompts or hardware.
