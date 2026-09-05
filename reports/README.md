# Canonical public evidence

Only the final frozen-protocol QVAC SDK evidence is committed here. Older exploratory runs, checkpoints and generated diagnostic suites remain local and ignored.

The Standard Q4_K_M imatrix extension is preregistered and completed as documented in `docs/STANDARD_Q4_EXTENSION_PREREGISTRATION.md`. Its raw addendum is separate from the original run; the generated four-way audit validates and joins both without rewriting either.

- `visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.{json,md}` — raw 2,295 inference records and summary for all 765 cases.
- `visionpsy-standard-q4-realworldqa-765-qvac-sdk-vlmevalkit-470e517.{json,md}` — raw 765-record preregistered Standard Q4 addendum.
- `visionpsy-realworldqa-765-qvac-sdk-vlmevalkit-audit.{json,md}` — four-way official-value comparison, six paired tests, repeatability coverage and publication-safe interpretation.
- `visionpsy-realworldqa-vlmevalkit-upstream-470e517.{json,md}` — direct checksum-pinned upstream scorer audit.
- `visionpsy-realworldqa-repeatability-100x3.{json,md}` — 100 stratified cases over three deterministic passes per model.
- `visionpsy-methodology-audit.{json,md}` — adversarial methodology and claim-boundary audit.
- `visionpsy-standard-preprocess-ablation.{json,md}` — separate preprocessing sensitivity evidence.

See `docs/REALWORLDQA_METHODOLOGY.md` before quoting results.

## Separate illustrative dog review

`visionpsy-dog-demo-astra-20260905.json` contains the frozen 2026-09-05 GPT-6 Astra review of the four-photo recorded dog demo: exact protocol, anonymous inputs and mappings, original judge outputs and aggregates. It is not part of any RealWorldQA aggregate. Read `docs/DOG_DEMO_ASTRA_REVIEW.md` for the distinction between rubric scores, instruction following and factual content.
