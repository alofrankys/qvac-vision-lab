# Image pipeline investigation — 2026-08-13

## Findings

PawVault previously copied uploads and served the original bytes both to the browser preview and the provider. It performed EXIF extraction but no full decode, orientation application, color normalization, resize, re-encode, or pixel validation. Browser HEIC support was therefore allowed to fail as a black/unrendered card, and the patched runtime received original HEIC/PNG inputs directly. Pipeline failures could consequently surface later as empty model output and be labelled `invalid output`.

There is no Object URL lifecycle race: the UI uses persistent HTTP `/photos/:id` URLs and does not use `URL.createObjectURL`, `URL.revokeObjectURL`, `FileReader`, Canvas, or ImageBitmap.

Content inspection of the 24 locally persisted photos found 14 genuine HEIF/HEIC inputs, 8 PNG inputs, and two files named `.HEIC` and reported as `image/heic` whose actual content was JPEG. This proves extension/MIME were insufficient. The native Sharp 0.34.3/libvips build could identify HEIC dimensions but lacked the compression decoder needed for these Apple files. macOS Quick Look 316 decoded the same real HEIC into 2048px PNG successfully; that result is revalidated and converted to the common JPEG representation. All 24 existing photos passed the completed pipeline after migration.

## Current provider input

Providers now receive only a decoded-again, non-progressive, quality-92 standard sRGB JPEG. EXIF orientation is applied, alpha is flattened onto white, aspect ratio is preserved, the image is not enlarged, and its maximum dimension is 2048px. The exact bytes are stored locally in ignored `data/inference-images/` and exported under `photos/inference/`.

Old invalid results remain historical evidence attached to their old run; they are not silently rewritten. Rerunning creates new predictions from validated normalized inputs.
