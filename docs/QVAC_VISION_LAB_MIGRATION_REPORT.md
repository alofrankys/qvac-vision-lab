# QVAC Vision Lab migration report

Date: 2026-08-15

## Scope

The product and repository identity moves from QVAC PawVault to QVAC Vision Lab. PawVault is preserved as `Experiment 01 — PawVault / Private Pet Photo Search`; it is not deleted, flattened, or rewritten as a new experiment.

## Data safety

- A byte-identical local backup of `data/pawvault.json` was created before migration.
- Schema v4 is additive. It introduces `datasets`, `vqaQuestions`, `featuredExamples`, `shareableFindings`, and a migration marker.
- Historical runs retain their original IDs, photo IDs, task IDs, prompts, outputs, reviews, timing, and error evidence.
- Historical runs receive logical `experimentId`, `datasetId`, `questionSet`, and provenance metadata when absent.
- Historical review provenance is classified without changing its verdict or evidence.
- Private state, images, inference derivatives, and backups remain Git-ignored.

## Product changes

- Added a five-experiment dashboard under the QVAC Vision Lab brand.
- Kept the complete PawVault workspace available from Experiment 01.
- Added reusable manual per-image Visual Q&A for real photos, screenshots, and documents/charts.
- Added a side-by-side small-model Arena for VisionPsy Base and SmolVLM2.
- LFM2.5-VL-450M was subsequently integrated as a pinned Q8_0 primary Fair Arena peer; see `docs/arena/` for the later audited state.
- Added dataset registry, open-output review, judge provenance, featured examples, comparison metrics, and shareable run findings.
- Diagnostic exports now identify project, experiment, dataset, and question set while retaining PawVault provenance.

## Compatibility

Existing PawVault routes, benchmark presets, prompts, provider/runtime integrations, reviews, and diagnostic exports remain available. No experiment is executed by the migration. Search, albums, YOLO, DINOv2, EXIF handling, image preprocessing semantics, and existing provider implementations are unchanged.

## Verification

Verification covers additive migration, historical ID retention, dataset construction, manual question validation, explicit provider provenance, arena threshold behavior, UI route availability, existing prompt/normalization behavior, runtime timeout/cancel behavior, and diagnostic compatibility.
