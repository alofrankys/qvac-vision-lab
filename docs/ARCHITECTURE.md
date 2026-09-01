# QVAC Vision Lab architecture

QVAC Vision Lab is the current project. The Photo Lab described below is preserved as Experiment 01 — PawVault. Reusable experiments share the same local storage, provider, provenance, review, timeout, cancellation, and diagnostic boundaries.

The system is a single local Node.js process. The browser UI sends photos and review actions only to `127.0.0.1`. The server copies imported files into local ignored storage, extracts EXIF, persists state atomically, and owns a registry of three explicit vision providers.

Each analysis request names its provider explicitly and expands to independent `(photo, task)` or `(image, manual question, provider)` inferences. Provider lookup either selects that exact adapter or rejects the request; it never falls back. Historical closed-label tasks preserve their prompts and normalization. Open Visual Q&A preserves the exact user-authored question and full raw answer without converting it into closed-label accuracy. A row always preserves run ID, experiment, dataset, question or prompt version, raw output, validation state, concrete provider/runtime/model/projection, latency, runtime stats, and error text.

Human review is separate from inference. Historical label review keeps `CORRECT`, `WRONG`, and `AMBIGUOUS`; open-output experiments use `CORRECT`, `PARTIALLY_CORRECT`, `WRONG`, `HALLUCINATED`, and `UNCLEAR_IMAGE`, plus a note. Judge provenance explicitly records user, Codex-assisted, or local-model origin. Metrics never silently mix providers, tasks, or judge origins.

An evaluation run owns its photo IDs, task IDs, provider provenance, live progress, high-resolution wall-clock timing, per-photo timing, and per-task predictions. The state endpoint projects exactly one selected run, preventing stale results from leaking into a new run. Old photos are exposed separately as an archive. Diagnostic JSON and ZIP exports are generated on demand from persisted state; the ZIP contains store-only entries and copies source bytes without modifying originals.

The image boundary does not trust filename or reported MIME. Magic-byte detection and a full decoder establish the actual format and pixel metadata. The original remains unchanged; a full-image sRGB JPEG is generated with EXIF orientation applied, alpha flattened, aspect ratio preserved, maximum dimension 2048, and no enlargement. A second decode plus pixel statistics gate preview and provider access. Failed images receive a pipeline error taxonomy and never become model invalid outputs. The diagnostic bundle stores originals under `photos/original/` and exact provider inputs under `photos/inference/`.

Automatic identity stays behind `PetIdentityProvider`. The existing DINOv2 implementation can later be adapted only with its detector/crop, multi-reference, unknown-threshold, and calibration safeguards intact. It must never be replaced by a VisionPsy prompt that guesses Lucky or Romeo.
