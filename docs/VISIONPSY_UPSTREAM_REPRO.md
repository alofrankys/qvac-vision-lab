# VisionPsy-Nano projector incompatibility in QVAC LLM addon

## Summary

The official VisionPsy-Nano and VisionPsy-Nano-Flash GGUF projectors cannot be loaded by the current published QVAC llama.cpp addon. The native loader reaches the projector metadata and rejects its projector type:

```text
clip_model_loader: model name:   VisionPsyNano
clip_init: failed to load model '...mmproj...gguf': load_hparams: unknown projector type: custom
Error: [MtmdLlm] Failed to load vision model from ...mmproj...gguf
```

This reproduces with the addon resolved by `@qvac/sdk@0.17.0` (`@qvac/llm-llamacpp@0.39.4`, Fabric `v9840.1.1-f0453e20aa`) and with the latest independently published addon tested on 2026-08-13 (`@qvac/llm-llamacpp@0.42.0`, Fabric `v10069.0.0-039e1e4439`).

## Environment

- macOS 26.6 (25G72), Darwin arm64
- Apple M4 MacBook Air, 16 GB unified memory, Metal supported
- Node.js 22.22.0
- Bare Runtime 1.31.0
- `@qvac/sdk` 0.17.0
- SDK-resolved `@qvac/llm-llamacpp` 0.39.4
- comparison `@qvac/llm-llamacpp` 0.42.0

QVAC application configuration:

```json
{
  "registryStreamTimeoutMs": 300000,
  "registryDownloadMaxRetries": 10,
  "httpConnectionTimeoutMs": 60000,
  "httpDownloadConcurrency": 3,
  "loggerConsoleOutput": false
}
```

Loader configuration in the minimal repro is deliberately conservative and uses the CPU projector. The same error was also reproduced with projector GPU use enabled and through the SDK worker with Metal active.

```json
{
  "device": "gpu",
  "gpu_layers": "99",
  "ctx_size": "2048",
  "predict": "128",
  "temp": "0.1",
  "verbosity": "2",
  "mmproj-use-gpu": "false"
}
```

## Artifacts verified

All local bytes match the sizes and SHA-256 values returned by the QVAC registry. Base and Flash language-model/projector files come from their respective repositories and pinned commits; no cross-pairing is involved.

| Pair | Artifact | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Base | `visionpsy-nano-460m-q8_0.gguf` | 436,676,000 | `fc70a6c6eed7d2f82ed48cbd52cc7118b249eff8b91112ef9cbfca6813a1eefa` |
| Base | `mmproj-visionpsy-nano-460m-q8.gguf` | 108,782,144 | `92f1bb80acaba3e7b59b6534f47447b830330bc9051018d6d8b5d768e58503c2` |
| Flash | `visionpsy-nano-460m-flash-q4_k_m-imat.gguf` | 303,143,488 | `90b0abe16180f1fe5918bc5d89c3b6eeaf40520a50f906d6303a59a32b699fbc` |
| Flash | `mmproj-visionpsy-nano-460m-flash-q8.gguf` | 108,782,144 | `bbb0691873a4e638f6928898b3c3be9a4730bd4ced301197726a4fcb549695d0` |

Both VisionPsy projectors are GGUF v3 with 198 tensors. Their decisive metadata is:

```json
{
  "general.architecture": "clip",
  "general.type": "mmproj",
  "general.name": "VisionPsyNano",
  "clip.projector_type": "custom",
  "clip.vision.projector.scale_factor": 4,
  "clip.vision.preproc_image_size": 2048
}
```

The working SmolVLM2 control also has 198 tensors, but declares `clip.projector_type: "idefics3"`; the same 0.42.0 addon logs `load_hparams: projector: idefics3` and completes with `LOAD_OK`.

## Minimal reproduction

Use the checked-in [`scripts/repro-visionpsy.cjs`](../scripts/repro-visionpsy.cjs) with absolute paths to an installed addon package and a matching GGUF pair:

```bash
node_modules/bare-runtime/bin/bare scripts/repro-visionpsy.cjs \
  /absolute/path/to/node_modules/@qvac/llm-llamacpp \
  /absolute/path/to/visionpsy-nano-460m-flash-q4_k_m-imat.gguf \
  /absolute/path/to/mmproj-visionpsy-nano-460m-flash-q8.gguf \
  visionpsy-flash
```

Expected: `LOAD_OK`.

Actual on both addon versions tested:

```text
load_hparams: unknown projector type: custom
[MtmdLlm] Failed to load vision model
```

Control run: replace the two GGUF arguments with a matching SmolVLM2 model and projector. Actual: `load_hparams: projector: idefics3`, then `LOAD_OK`.

## Compatibility evidence and requested upstream action

The official VisionPsy repository says its GGUF path requires the bundled **patched llama.cpp fork**. QVAC SDK 0.17.0 release notes do not list VisionPsy among the added SDK model constants, and neither addon 0.39.4 nor current addon 0.42.0 recognizes the published `custom` projector type.

Requested resolution (one of):

1. Port the VisionPsy pixel-shuffle/custom projector implementation into QVAC Fabric/MTMD and publish a compatible `@qvac/llm-llamacpp` release; or
2. Publish VisionPsy projector artifacts using a projector type already implemented by QVAC, if semantically correct; and
3. Add an SDK-level load-and-image-inference regression test for both Base and Flash pairs before advertising them in the QVAC registry.

Until one of those is available, changing quantization, clearing the cache, toggling Metal/CPU projector execution, or upgrading only the published addon does not address the rejected projector architecture.
