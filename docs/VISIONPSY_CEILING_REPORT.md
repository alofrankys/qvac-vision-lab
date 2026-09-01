# VisionPsy ceiling report

Date: 2026-08-13

## Baseline

`VISIONPSY_FLASH_BASELINE_V1` is the immutable reference for source run
`run_20260813132428_draft_81956996`. The 84 original predictions and the 12
inference-normalized images were not modified. A local manifest records the
SHA-256 of every inference image.

Flash baseline raw distributions:

| Task | Raw distribution | Invalid | Unclear | Mean latency |
| --- | --- | ---: | ---: | ---: |
| environment | `unclear` 11, ` outdoor` 1 | 0/12 | 11/12 | 8,889 ms |
| surface | `dog` 5, `unclear` 3, `floor` 4 | 5/12 | 3/12 | 9,055 ms |
| posture | `lying` 9, `standing` 3 | 0/12 | 0/12 | 8,779 ms |
| dog_count | `one` 12 | 0/12 | 0/12 | 9,371 ms |
| toy | `no_toy_visible` 5, `toy_visible` 5, `no` 2 | 2/12 before safe aliases | 0/12 | 10,300 ms |
| bowl | `bowl_visible` 8, `no_bowl_visible` 2, `No` 1, `no` 1 | 2/12 before safe aliases | 0/12 | 9,942 ms |
| person | `no` 8, `person_visible` 4 | 8/12 before safe aliases | 0/12 | 8,404 ms |

## Base on the same 12 images

| Task | Raw distribution | Invalid | Unclear | Mean latency | Prompt/image eval | Generation |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| environment | `unclear` 12 | 0/12 | 12/12 | 2,212 ms | 2,083 ms | 16 ms |
| surface | `floor` 10, `other` 2 | 0/12 | 0/12 | 1,608 ms | 1,523 ms | 9 ms |
| posture | `lying` 9, `standing` 3 | 0/12 | 0/12 | 1,595 ms | 1,507 ms | 9 ms |
| dog_count | `more_than_two` 7, explanatory output 5 | 5/12 | 0/12 | 1,635 ms | 1,508 ms | 49 ms |
| toy | `toy_visible` 7, `no_toy_visible` 5 | 0/12 | 0/12 | 1,619 ms | 1,509 ms | 35 ms |
| bowl | `bowl_visible` 9, `no_bowl_visible` 2, `No Bowl Visible` 1 | 1/12 | 0/12 | 1,621 ms | 1,515 ms | 33 ms |
| person | `no_person_visible` 12 | 0/12 | 0/12 | 1,666 ms | 1,551 ms | 38 ms |

Base is not a general quality improvement: it improves closed-label adherence
for surface/person/toy, but collapses environment and fails dog-count output
discipline. Accuracy is intentionally not reported without human truth.

## Dog-count A/B/C raw results

| Provider | Variant | Raw distribution | Invalid | Unclear | Mean latency |
| --- | --- | --- | ---: | ---: | ---: |
| Flash | A exact | `one` 8, `two` 4 | 0/12 | 0/12 | 1,978 ms |
| Flash | B single/multiple | `no_dog` 10, `multiple_dogs` 2 | 0/12 | 0/12 | 2,005 ms |
| Flash | C binary | `yes` 11, `no` 1 | 0/12 | 0/12 | 2,034 ms |
| Base | A exact | `more_than_two` 9, `one` 2, `two` 1 | 0/12 | 0/12 | 1,941 ms |
| Base | B single/multiple | `multiple_dogs` 12 | 0/12 | 0/12 | 1,919 ms |
| Base | C binary | `yes` 11, `no` 1 | 0/12 | 0/12 | 1,993 ms |

The output changes drastically with taxonomy while the image set is fixed.
Both models produce almost identical binary output and Base B collapses to one
label. Recommendation: **REMOVE FROM VISIONPSY**. A dedicated detector is the
appropriate future solution; none is implemented here.

Human accuracy remains pending at 0/12 reviewed images. The local UI provides
`No dog`, `One dog`, and `Multiple dogs` controls and computes one-dog,
multiple-dog, overall, unclear, and invalid rates only from human-confirmed
labels.

## `surface = dog`

The five exact images were inspected. Four show dogs prominently over indoor
flooring; one shows a dog prominently on grass. All used the same valid
closed-label surface prompt, Flash model/projection, peg-native chat template,
temperature 0, `max_tokens: 24`, and persistent runtime. `dog` was emitted in
two tokens, so the output limit did not truncate an otherwise valid label.
CPU and Metal both reproduced `dog` for the first mini-test image, while Base
returned allowed surface labels on 12/12. This is a Flash instruction-following
and capability limitation triggered by the salient subject, not normalization,
prompt-template, output-token, or backend configuration. `dog` remains invalid.

## CPU versus Metal

The existing patched llama.cpp build has `GGML_METAL=ON` and reports Apple M4
Metal support. PawVault had explicitly passed `-ngl 0`; it now defaults to
`-ngl 99` and remains configurable with `VISIONPSY_GPU_LAYERS=0` for CPU.

Same 2 images x environment/surface/dog_count, sequential:

| Backend | Cold start | Prompt/image eval | Generation | Native total | End-to-end prediction |
| --- | ---: | ---: | ---: | ---: | ---: |
| CPU | 622 ms | 4,015 ms | 77 ms | 4,092 ms | 4,276 ms |
| Metal | 407 ms | 2,129 ms | 63 ms | 2,192 ms | 2,338 ms |

Metal reduces mean end-to-end latency by about 45% and prompt/image evaluation
by about 47%. Semantics remained unchanged in five exact-output pairs; the last
pair differed only in explanatory wording and described the same two dogs.

## Current task outlook

Promising for further human review: posture, toy visibility, bowl visibility,
person visibility, and Base surface. Unreliable on this evidence: environment,
dog count in every tested taxonomy, and Flash surface. These are adherence and
distribution observations, not accuracy claims.
