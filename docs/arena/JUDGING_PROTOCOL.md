# Judging protocol

Review the source image, exact question and anonymized answers A/B/C. Model identity, runtime and latency remain hidden. Judge all answers before reveal. Use `BLIND_HUMAN_JUDGE` for an independent imported human judge or `USER_JUDGE` for the local operator; provenance and timestamps are retained.

- `CORRECT`: factual and answers the question.
- `PARTIALLY_CORRECT`: useful core answer with a material omission or minor error.
- `WRONG`: does not correctly answer the visible evidence.
- `HALLUCINATED`: introduces a clearly unsupported visual claim.
- `UNCLEAR_IMAGE`: source evidence is insufficient and is excluded from numeric scoring.

Scores are 2, 1, 0, -1 and null. Quality, runtime failures and invalid outputs are separate. AI judges never overwrite human judgments. Early reveal permanently excludes that round from blind-valid evidence.

## State and immutability

The ranking path is `DRAFT → RUNNING → AWAITING_JUDGMENT → READY_TO_REVEAL → REVEALED`. A normal reveal is accepted only after every anonymous answer has a pre-reveal judgment. Reveal is one-way: repeated reveal and post-reveal judgment edits are rejected. Cancelled, failed, partially completed, early-revealed, non-blind, and exploratory rounds remain diagnostic evidence but never enter the primary ranking.

Only judgments explicitly recorded before reveal are scoreable. `USER_JUDGE` and `BLIND_HUMAN_JUDGE` are human provenance; `CODEX_VISUAL_REVIEW` is AI-assisted; local and external AI judges are AI provenance. A primary ranking is blocked when AI/AI-assisted judgments form at least half of the eligible review evidence.

## Export boundary

`Blind Judge Bundle` is the only share-safe reviewer package. It contains the source/inference image, exact question, anonymous A/B/C raw answers, and a review template. It excludes provider IDs, model/runtime details, execution order, latency, mapping, winner, and private diagnostics.

`Private Mapping Bundle` contains the identity mapping and must not be sent to a blind reviewer. `Full Private Evidence Bundle` is also private and is intended for post-reveal audit/debug use.
