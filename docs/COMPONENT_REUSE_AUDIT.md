# COMPONENT REUSE AUDIT

Audit date: 2026-08-13. Scope inspected: the local workspace and repositories visible through the connected GitHub app. Only `AI Dog Watch` was present locally; the connector returned no accessible repositories. The requested AI Pet Detective, Vision PSI Lab, MedPsy, and other named repositories could therefore not be inspected as separate projects.

## Project / component: AI Dog Watch — QVAC multimodal bridge

What it does: Uses the official direct `@qvac/sdk` attachment API, loads a local multimodal model once, runs image inference, records runtime metadata, and unloads safely.

Status: Proven with a real image on this Mac. SDK 0.17.0; compact SmolVLM2 and larger Qwen3VL configurations are present.

Reuse directly / Adapt / Do not reuse: **Adapt.**

Reason: The load/infer/unload lifecycle and deterministic generation settings are reliable. PawVault uses the same SDK calls in a smaller in-process Node provider instead of retaining the old Python/JSON-lines/video architecture.

## Project / component: AI Dog Watch — Vision benchmark V2

What it does: Builds separate prompts, preserves raw and normalized output, validates closed outputs, records latency/errors/model data, and keeps human-confirmed ground truth separate from model output.

Status: Implemented and tested. Existing real compact-model benchmark reports show strict-format failures for several harder video-oriented tasks.

Reuse directly / Adapt / Do not reuse: **Adapt.**

Reason: Reuse evaluation semantics and honest provenance, but replace video cases and schemas with PawVault's small closed-label photo tasks.

## Project / component: AI Dog Watch — Vision PSI Lab UI

What it does: Provides case review, `NEEDS_REVIEW`, provider availability, result comparison, filters, and raw-output inspection.

Status: Implemented.

Reuse directly / Adapt / Do not reuse: **Adapt.**

Reason: Reuse the review/evidence concepts. Do not copy the video-oriented A/B product assumptions or its large React screen.

## Project / component: AI Dog Watch — DINOv2 pet Re-ID

What it does: Implements a `PetEmbeddingModel` boundary with local DINOv2 ViT-S/14 embeddings, detector-gated crops, multi-sample decisions, unknown thresholds, provenance, manual correction, and benchmark reporting.

Status: Implemented and locally exercised; small Lucky/Romeo holdout was promising but thresholds are not calibrated. MPS may fall back to CPU.

Reuse directly / Adapt / Do not reuse: **Do not integrate in milestone 1.**

Reason: It is the correct future identity boundary, but it adds detector, enrollment, embeddings, and calibration complexity. PawVault stores manual `Lucky`, `Romeo`, `Both`, or `Unknown` identity now and reserves a clean `identity` module boundary.

## Project / component: AI Dog Watch — video/CV pipeline

What it does: Video upload, YOLO dog detection, ByteTrack, geometry, temporal events, scene maps, and camera providers.

Status: Substantial implementation.

Reuse directly / Adapt / Do not reuse: **Do not reuse.**

Reason: These are old video product assumptions and explicitly outside the PawVault Photo Lab milestone.

## Project / component: VisionPsy-Nano model name

What it does: Requested model identity for the new lab.

Status: **Available in the live QVAC distributed model registry**, although it is not exported as a named SDK constant. The registry contains base and Flash variants of VisionPsy-Nano 460M, Q4/Q8 weights, and matching Q8 multimodal projections.

Reuse directly / Adapt / Do not reuse: **Configured directly, but blocked at runtime.**

Reason: The base Q8 pair and the separately published Flash Q4_K_M/Q8-projection pair were downloaded from immutable registry commits. QVAC 0.17.0 failed to load both vision projections, including with projection GPU use disabled. PawVault keeps the exact Flash configuration but marks it unavailable and prevents repeated analysis downloads. The earlier SmolVLM2 baseline remains audit evidence only and is not used as a substitute.
