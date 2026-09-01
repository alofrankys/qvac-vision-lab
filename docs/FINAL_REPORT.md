# Milestone 1 status report

Status on 2026-08-13: **multi-provider implementation complete; primary provider blocked upstream**. The exact VisionPsy-Nano model exists in the QVAC registry but its multimodal projection cannot be loaded by QVAC SDK 0.17.0 on this Mac. GitHub authentication and the `alofrankys/qvac-pawvault` remote are working. No unsupported capability is claimed as working.

## 1. Existing projects found

Only `AI Dog Watch` was present locally and no repositories were returned by the connected GitHub app. It contains a proven direct QVAC SDK bridge, real SmolVLM2/Qwen multimodal configurations, benchmark runners, human `NEEDS_REVIEW` ground truth, a Vision PSI Lab UI, error/runtime provenance, and a substantial DINOv2 pet Re-ID implementation. Separate AI Pet Detective, MedPsy, Vision PSI Lab, and related named repositories were not available to inspect.

## 2. Reused

The QVAC model lifecycle, direct image attachments, deterministic generation settings, concrete provider/model provenance, strict raw/normalized validation, latency/error recording, human-owned truth, and safe runtime close behavior were adapted. They were reduced to a photo-only in-process Node provider and small evaluation model.

## 3. Not reused

Video upload, keyframes, YOLO, ByteTrack, camera sources, geometry, scene maps, temporal events, A/B DogWatch prompts, and product decision thresholds were excluded. DINOv2 is documented and kept behind an identity boundary but not integrated. Lucky/Romeo assignment is manual.

## 4. New repository structure

The local independent Git repository contains separate `photo-import`, `metadata`, `vision`, `visionpsy`, `annotations`, `evaluation`, `identity`, `search`, and `albums` boundaries. The vision registry exposes the primary QVAC VisionPsy provider, the official patched-runtime adapter, and an explicitly labelled SmolVLM2 development control. Only Photo Lab functionality is implemented; `search` and `albums` are explicit milestone-2 placeholders.

## 5. QVAC / VisionPsy status

QVAC SDK 0.17.0 is installed and real multimodal inference was proven with the reused SmolVLM2 baseline. A live `modelRegistrySearch` found six VisionPsy-Nano 460M assets. Two exact pairs were fully downloaded and tested:

- base `visionpsy-nano-460m-q8_0` + base Q8 projection;
- Flash `visionpsy-nano-460m-flash-q4_k_m-imat` + Flash Q8 projection, with projection GPU enabled and disabled.

All exact QVAC VisionPsy attempts fail before inference with `MtmdLlm: Failed to load vision model`. PawVault therefore reports that provider as blocked. It never substitutes another provider. The isolated official patched llama.cpp adapter passed two real-image smokes using runtime commit `4effbda`; both returned the valid closed label `indoor`. SmolVLM2 remains a separately named development control.

## 6. What can be tested immediately

The app starts locally, imports and copies photos, renders thumbnails, extracts EXIF capture date/GPS, persists manual location and Lucky/Romeo/Both/Unknown identity, shows all candidate tasks and manual task statuses, and renders the review/metrics/failure-gallery UI. The visible provider selector requires an explicit provider and disables only unavailable choices. A real end-to-end SmolVLM2 control returned the valid `outdoor` label and persisted full run/provenance data.

## 7. Photos needed

Prepare 20–30 varied JPEG photos: indoor/outdoor; sofa, bed, floor, grass, dirt; standing/sitting/lying/crouching; zero/one/two dogs; toy/bowl/person present and absent; near and distant framing; easy and genuinely ambiguous cases; varied light, blur, occlusion, and partial subjects. Keep several negative examples for every visibility task. JPEG is preferred for consistent browser thumbnails; HEIC import/metadata works but display depends on the browser.

## 8. Real limits/problems

- VisionPsy-Nano projection load failure in QVAC SDK 0.17.0 blocks only the primary-provider smoke and runs.
- The official patched runtime is available on this Mac from the existing verified build. Other installations need a built `llama-mtmd-cli`; when absent, PawVault reports that exact condition rather than falling back.
- Browser security does not reveal original absolute source paths; PawVault stores the browser-provided filename/relative path.
- UI is local browser software, not yet packaged as a macOS `.app`.

## 9. Recommended next step

Send `QVAC_VISIONPSY_ISSUE_READY.md` and the unchanged technical reproduction to the runtime owner. Once a compatible QVAC backend is released, rerun the primary smoke. The patched adapter can be exercised independently with `npm run smoke:provider -- visionpsy-patched photo-1.jpg photo-2.jpg`. Do not begin Search MVP until real photo reviews exist.
