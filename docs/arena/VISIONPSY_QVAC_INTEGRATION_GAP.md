# VisionPsy ↔ QVAC Integration Gap

Date: 2026-08-15
Status: **CONFIRMED NATIVE PROJECTOR GAP**

## What fails

The exact pinned VisionPsy Base Q8_0 language model and Q8_0 projector were passed through the minimal official QVAC SDK multimodal contract:

- model: `194207cdb1a218aa_visionpsy-nano-460m-q8_0.gguf`, SHA-256 `fc70a6c6eed7d2f82ed48cbd52cc7118b249eff8b91112ef9cbfca6813a1eefa`;
- projector: `4abdf8c5183110ba_mmproj-visionpsy-nano-460m-q8.gguf`, SHA-256 `92f1bb80acaba3e7b59b6534f47447b830330bc9051018d6d8b5d768e58503c2`;
- repository revision: `qvac/VisionPsy-Nano-460M-GGUFs@4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1`.

`loadModel` fails before inference with:

```text
MODEL_LOAD_FAILED (52200)
[MtmdLlm] Failed to load vision model from ...mmproj-visionpsy-nano-460m-q8.gguf
```

The image is never preprocessed, no prompt is evaluated, and no token is generated. This is not an Arena adapter failure, prompt failure, quantization mismatch, Metal failure, timeout, or bad image.

Expected behavior: `loadModel` accepts the matching model/projector pair, completion consumes one image attachment, emits a short answer, and `unloadModel` releases it.

Actual behavior: the SDK worker starts and accepts both local paths, then native MTMD rejects the projector during model activation. Completion and unload are never reached because no model ID is returned.

## Root cause

The pinned projector declares:

```text
clip.projector_type = custom
clip.vision.projector.scale_factor = 4
clip.vision.preproc_image_size = 2048
```

Official QVAC Fabric source at `4919828e15a6090d06af060f8dbf6e9b437da419` has no `PROJECTOR_TYPE_CUSTOM` enum or `"custom"` mapping. The loader therefore classifies this metadata value as unknown and rejects the projector.

The patched VisionPsy fork does contain `PROJECTOR_TYPE_CUSTOM`, the `"custom"` mapping, dedicated graph/load branches, and the required pixel-shuffle path. That is why the same pinned artifacts run with patched llama.cpp but not with the published QVAC runtime.

Patched-runtime proof: the Fair Arena validation already ran this exact Base model/projector revision through the pinned patched server (`896c8b90f5fe372bd587bc4336ab9f07e8ea1eca`, binary SHA-256 `cc4378feae55860bfb700d92cf6be9265347a1dba579da6930c64a3664800bc8`) with real image inference. The local patched source and `libmtmd` binary both expose the custom mapping and pixel-shuffle implementation absent from official QVAC Fabric.

Minimal repro: `scripts/qvac-multimodal-repro.mjs`; full current-stack log: `docs/arena/runtime-compatibility-logs/visionpsy-current.log`.

## Versions checked

- Project pinned: SDK 0.17.0, llm-llamacpp 0.39.4, native Fabric `v9840.1.1-f0453e20aa` — FAIL.
- Isolated newer check: SDK 0.17.1, llm-llamacpp 0.42.0, native Fabric `v10069.0.0-039e1e4439` — same FAIL.
- Official source master checked at commit `4919828e15a6090d06af060f8dbf6e9b437da419` — `custom` still absent.
- npm latest at check time: SDK 0.17.1, llm-llamacpp 0.43.0, fabric 0.4.0, bare-runtime 1.31.0. The 0.43.0 binary artifact download did not complete within the bounded isolated test window, so no false claim of testing that binary is made.

## What will not fix it

- Retrying the SDK call.
- Increasing context size.
- Toggling Metal or `mmproj-use-gpu`.
- Renaming `custom` to `idefics3`, `lfm2`, or another supported metadata value.
- Re-quantizing the same unsupported graph.
- Changing prompts or Arena normalization.

The custom projector graph and preprocessing semantics must be implemented, not relabeled.

## Valid integration routes

1. **Preferred:** upstream the VisionPsy custom projector delta into `tetherto/qvac-fabric-llm.cpp`, add a fixture for this exact projector, then publish and validate a new `@qvac/llm-llamacpp`/QVAC release.
2. Maintain a QVAC-compatible native package built from the official Fabric runtime plus the audited VisionPsy projector patch, with explicit revision and binary hash provenance.
3. Keep the current patched llama.cpp server for VisionPsy while using QVAC for supported models. This is the current verified route.

Acceptance for routes 1 or 2 must include:

- exact pinned model/projector hashes;
- successful load on Metal and CPU;
- identical image preprocessing dimensions and pixel-shuffle behavior;
- cold and warm lifecycle tests;
- cancellation/timeout cleanup;
- output regression against the current patched reference;
- no metadata spoofing or silent fallback.

## Current recommendation

Do not force VisionPsy through QVAC SDK today. Keep `visionpsy-patched-base` on the patched runtime and report that runtime transparently. Revisit only after an official or auditable QVAC native build contains the missing `custom` projector implementation.

This finding does not invalidate QVAC multimodal generally: the same SDK/runtime successfully loaded and inferred with the pinned LFM `lfm2` projector and SmolVLM2 `idefics3` projector.
