# Dog count investigation

Date: 2026-08-13. Scope was limited to `dog_count`; other tasks were not changed.

## Evidence from real runs

The newest completed real run (`run_20260813132428_draft_81956996`) produced raw `one` for all 12 photos. The normalized value was also `one`; every response was parse-valid. Latencies ranged from 4,043 to 16,126 ms. The persisted dataset contains no human-reviewed `dog_count` prediction, so benchmark truth was assigned only to visually unambiguous images in an isolated benchmark and was not written into PawVault ground truth.

Across the full persisted history, the latest prediction per photo/import contained 21 exact raw `one` responses and 14 legacy empty/error responses. The empty legacy responses are `EMPTY_OUTPUT`, not invalid model labels. Exact evidence, including inference-image paths, prompts, raw/normalized output, labels, latency, parsing and review coverage, is generated locally by `scripts/dog-count-evidence.mjs` in ignored `data/smoke-results/dog-count-evidence.json`.

## Normalizer audit

The v1 normalizer used exact equality and could not map `two` to `one`; there was no substring collision. New dog-count-only tests cover `one`, `one dog`, `two`, `two dogs`, `2 dogs`, `there are two dogs`, `unclear`, and ambiguous prose. Conservative aliases now accept only explicit semantic forms. `multiple dogs` remains invalid because it does not distinguish `two` from `more_than_two`.

## Prompt benchmark

The benchmark used 10 existing real PawVault import instances: five labeled one and five labeled two. Only three unique one-dog scenes existed, so two one-dog instances are repeated imports; this limits confidence and is why the task is not promoted to core.

| Variant | One accuracy | Two accuracy | Unclear | Invalid rate |
|---|---:|---:|---:|---:|
| A — current baseline | 100% | 0% | 0% | 0% |
| B — direct count | 80% | 0% | 30% | 0% |
| C — strict exact-label parser | 0% | 0% | 0% | 90% |
| C — conservative dog-count parser | 100% | 80% | 0% | 0% |
| D — binary at-least-two | 20% | 60% | 0% | 0% |

Variant C made the model semantically identify the count in prose on 9/10 samples, including four of five two-dog images. Its strict-format failure was repaired with anchored, dog-count-only parsing. The remaining two-dog miss returned exact raw `one`, so it is a model failure and is not remapped.

## Decision

Conclusion **B with limited confidence**: the explicit-separation prompt plus conservative dog-count parsing materially improves the small real benchmark to 90% overall, but does not yet justify CORE status. `dog_count` is now `EXPERIMENTAL`, retains the exact taxonomy `none / one / two / more_than_two / unclear`, and uses prompt version `pawvault-dog-count-v2`. Binary single-vs-multiple was worse (40% overall), so the taxonomy is not simplified.
