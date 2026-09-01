# QVAC VisionPsy-Nano projector incompatibility

## Summary

QVAC SDK 0.17.0 discovers and downloads both published VisionPsy-Nano variants, but its native MTMD runtime cannot load either projector. The failure happens before inference and is reproducible with immutable registry artifacts. SmolVLM2 loads through the same SDK on the same machine, isolating the problem to VisionPsy's projector type.

## Environment

- Apple Silicon Mac (Apple M4), macOS
- Node.js 22.17+
- `@qvac/sdk` 0.17.0
- SDK-resolved native addon 0.39.4; also reproduced with 0.42.0
- Exact artifact URIs and SHA-256 hashes: see `VISIONPSY_UPSTREAM_REPRO.md`

## Result

Both the base Q8 and Flash projection GGUF files declare `clip.projector_type: custom`. Loading either pair ends with:

```text
load_hparams: unknown projector type: custom
MtmdLlm: Failed to load vision model
```

No VisionPsy prediction is produced. PawVault therefore reports the primary `qvac-visionpsy` provider as `BLOCKED` and does not substitute another model.

## Reproduction

```bash
npm install
node scripts/inspect-gguf.mjs
node scripts/repro-visionpsy.cjs /absolute/path/to/photo.jpg
```

The existing reproduction document and scripts are intentionally preserved unchanged. The requested upstream resolution is a QVAC native runtime that implements the published `custom` projector, or a compatible officially published projection artifact.
