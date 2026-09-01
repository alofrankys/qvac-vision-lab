# QVAC SDK 0.18.1 VisionPsy verification

Verified on 2026-08-25 on Apple M4, macOS, Node.js 22.22.0.

## Verdict

The compatibility patch is real. Both published VisionPsy Nano projectors now
load with the official QVAC runtime, and the project provider completes real
multimodal inference through the public SDK API. This fixes the previous
`clip.projector_type=custom` load failure.

This is a runtime compatibility result, not a blanket model-quality claim. A
small two-case instruction-following check scored 1/2 exact matches.

## Installed stack

- `@qvac/sdk` 0.18.1, pinned exactly in `package.json`
- `@qvac/llm-llamacpp` 0.45.0, resolved by the SDK
- VisionPsy Flash Q4_K_M + Q8 projector from commit
  `a24fb9cdd1119406b15ff60b06a51f8438a931c1`
- VisionPsy Base Q8_0 + Q8 projector from commit
  `4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1`

The SDK 0.18.0 release adds the official Base and Flash constants. npm 0.18.1
is the current patch release used here.

## Evidence

The low-level loader reported for both Base and Flash:

```text
load_hparams: legacy projector type 'custom' from general.name='VisionPsyNano' loaded as 'visionpsy'
Model load completed successfully
LOAD_OK
```

The application-level smoke test completed through `loadModel()` and
`completion()` with:

- valid closed-label output: `indoor`
- cold model load: 1.68 s on the repeated verification run
- inference latency: 13.04 s for the test image
- SDK stats: `backendDevice=gpu`, Metal capability present
- a second request reused the loaded model (`modelReused=true`)

The objective two-case check produced:

| Case | Expected | Output | Exact |
| --- | --- | --- | --- |
| `smart100-019` | `B` | `B` | yes |
| `smart100-031` | `{"door_open":true,"light_on":false}` | `["door_open","light_on"]` | no |

Run it again with:

```bash
npm run verify:qvac-visionpsy
```

The full unit suite also passes: 113 passed, 0 failed, 1 skipped.

## Integration changes

`qvac-visionpsy` is now `READY` and uses the official SDK model constants.
The historical patched llama.cpp providers remain available for controlled
parity comparisons; they are no longer required merely to make VisionPsy load.

QVAC SDK 0.18.1's automatic Node IPC close was observed waiting indefinitely
after the final model unload. The reusable provider therefore unloads models
with `autoClose: false`; the app owns final process termination. One-shot smoke
commands exit after their report is written. This workaround does not affect
inference or idle model unloading.

## Official sources

- <https://github.com/tetherto/qvac/releases/tag/sdk-v0.18.0>
- <https://www.npmjs.com/package/@qvac/sdk?activeTab=versions>
