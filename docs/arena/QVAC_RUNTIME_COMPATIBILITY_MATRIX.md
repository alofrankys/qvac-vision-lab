# QVAC Runtime Compatibility Matrix

> Historical 0.17.x snapshot. The VisionPsy blocker was fixed and independently
> verified with SDK 0.18.1 / llm-llamacpp 0.45.0 on 2026-08-25; see
> [QVAC SDK 0.18.1 VisionPsy verification](QVAC_SDK_018_VISIONPSY_VERIFICATION.md).

Date: 2026-08-15
Scope: runtime compatibility only. No benchmark questions, judging, rankings, provider roster, model artifacts, quantization policy, or Arena methodology were changed.

## Decision

| Model | Pinned projector type | Pinned QVAC SDK | Newer QVAC check | Operational runtime |
| --- | --- | --- | --- | --- |
| VisionPsy Base Q8_0 | `custom` | **FAIL at projector load** | **FAIL** with SDK 0.17.1 + llm-llamacpp 0.42.0; current official source still has no `custom` projector mapping | Keep patched VisionPsy llama.cpp runtime |
| LFM2.5-VL-450M Q8_0 | `lfm2` | **PASS** on Metal | Not required to establish compatibility | QVAC is technically viable; do not migrate Arena without a separate controlled change |
| SmolVLM2-500M Q8_0 | `idefics3` | **PASS** on Metal | Positive control established on pinned stack | Keep QVAC |

The QVAC JavaScript API accepts arbitrary local model and projector paths. Compatibility is decided later by the native MTMD projector implementation. This is why the same SDK contract accepts all three calls but the native VisionPsy load alone fails.

## Stack inventory

Host used for every real run: macOS 26.6 (25G72), Apple Silicon arm64, Apple M4, Metal enabled, Node.js 22.22.0.

| Component | Project-pinned / installed | Latest official npm version checked 2026-08-15 | Result |
| --- | ---: | ---: | --- |
| `@qvac/sdk` | 0.17.0 | 0.17.1 | update available; pinned project untouched |
| `@qvac/llm-llamacpp` | 0.39.4 | 0.43.0 | update available; pinned project untouched |
| `@qvac/fabric` | 0.3.1 | 0.4.0 | update available; pinned project untouched |
| `bare-runtime` | 1.31.0 | 1.31.0 | current |

The native binary bundled by llm-llamacpp 0.39.4 identifies its Fabric source as `v9840.1.1-f0453e20aa`. The newer isolated llm-llamacpp 0.42.0 binary identifies `v10069.0.0-039e1e4439`. The latest 0.43.0 package is published (543,224,339 bytes unpacked), but its 543 MB artifact did not finish materializing after a bounded four-minute isolated download attempt. This did not mutate `package.json`, `package-lock.json`, or project `node_modules`.

## Official multimodal contract

The installed official SDK example `node_modules/@qvac/sdk/dist/examples/llamacpp-multimodal.js` establishes the contract:

1. `loadModel({ modelSrc, modelConfig: { projectionModelSrc, ctx_size } })` loads the language model and projector together.
2. `completion({ modelId, history: [{ role: 'user', content, attachments: [{ path }] }], stream: true })` supplies image media.
3. The SDK resolves local/registry sources and forwards `files.model[]` plus `files.projectionModel` to `@qvac/llm-llamacpp`.
4. The native MTMD layer parses `clip.projector_type` and must contain an implementation for that exact type.

This matches the public QVAC API reference and the repository's implementation. The investigation found no alternate documented SDK parameter that enables a missing native projector implementation.

Official references:

- <https://docs.qvac.tether.io/reference/api/>
- <https://github.com/tetherto/qvac>
- <https://github.com/tetherto/qvac-fabric-llm.cpp>

## Artifact metadata

All artifacts below match `config/fair-arena-model-lock.json`; no weights were changed.

| Model | Repository revision used for both pinned artifacts | Model SHA-256 | Projector SHA-256 |
| --- | --- | --- | --- |
| VisionPsy Base | `qvac/VisionPsy-Nano-460M-GGUFs@4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1` | `fc70a6c6eed7d2f82ed48cbd52cc7118b249eff8b91112ef9cbfca6813a1eefa` | `92f1bb80acaba3e7b59b6534f47447b830330bc9051018d6d8b5d768e58503c2` |
| LFM2.5-VL-450M | `LiquidAI/LFM2.5-VL-450M-GGUF@6f15859c2de1583b6180a9bc56338342592b589a` | `263aca93039e22140d55e046831c700c796affa8143d7638581c488a30c712bc` | `ebfc428baa37efad8bae93864f914b2634a09009f91ad59f974fe1a1565d8561` |
| SmolVLM2-500M | `ggml-org/SmolVLM2-500M-Video-Instruct-GGUF@ccd7aae53bcb1997355c2f094959e72b3642ce17` | `6f67b8036b2469fcd71728702720c6b51aebd759b78137a8120733b4d66438bc` | `921dc7e259f308e5b027111fa185efcbf33db13f6e35749ddf7f5cdb60ef520b` |

| Model | Model parameters / bytes | Projector parameters / bytes | Projector metadata relevant to compatibility |
| --- | --- | --- | --- |
| VisionPsy Base | 409,133,760 / 436,676,000 | 98,229,504 / 108,782,144 | `clip.projector_type=custom`, projection 960, image 512, preproc image 2048, scale factor 4, mean `[0,0,0]`, std `[1,1,1]` |
| LFM2.5-VL-450M | 354,483,968 / 379,219,104 | 94,234,880 / 102,815,168 | `clip.projector_type=lfm2`, projection 1024, image 256, scale factor 2, mean/std 0.5 |
| SmolVLM2-500M | 409,252,800 / 436,808,704 | 98,229,504 / 108,785,184 | `clip.projector_type=idefics3`, projection 960, image 512, scale factor 4, mean/std 0.5 |

## Native support comparison

The current official `tetherto/qvac-fabric-llm.cpp` source was inspected at commit `4919828e15a6090d06af060f8dbf6e9b437da419`.

- `tools/mtmd/clip-impl.h` maps both `lfm2` and `idefics3`.
- It does **not** define or map a `custom` projector type.
- `tools/mtmd/clip.cpp` converts an unmapped string to `PROJECTOR_TYPE_UNKNOWN` and throws `unknown projector type`.
- The pinned and newer QVAC native binaries both contain the `lfm2` and `idefics3` preprocessors and the unknown-projector error path.

The VisionPsy patched source at `vendor/qvac-visionpsy-nano/llama-cpp-inference/llama.cpp-custom` contains the missing delta:

- `PROJECTOR_TYPE_CUSTOM` in the enum;
- the string mapping `{ PROJECTOR_TYPE_CUSTOM, "custom" }`;
- dedicated `custom` graph/load cases;
- the `pixel_shuffle` path used with the projector's scale factor.

Changing only the GGUF metadata from `custom` to another type would be invalid: the preprocessor and projection graph semantics differ.

## Minimal real runs

One disposable image and one short factual prompt were used. No benchmark or judging data was created.

| Model / stack | Load | Inference | Backend | Result |
| --- | ---: | ---: | --- | --- |
| VisionPsy Base / SDK 0.17.0 + llm 0.39.4 | failed after 9.410 s wall time | not reached | native worker started; model backend not reached | `MODEL_LOAD_FAILED` (52200), `[MtmdLlm] Failed to load vision model ...mmproj-visionpsy...` |
| VisionPsy Base / isolated SDK 0.17.1 + llm 0.42.0 | failed after 9.427 s wall time | not reached | native worker started; model backend not reached | same `MODEL_LOAD_FAILED` (52200) |
| LFM / SDK 0.17.0, ctx 4096 | 1.351 s | 1.620 s; TTFT 1.517 s | Metal GPU, all 17/17 layers offloaded | PASS; 1,801 prompt tokens, 26 generated tokens |
| SmolVLM2 / SDK 0.17.0, ctx 1024 | 1.036 s | 0.323 s; TTFT 0.313 s | Metal GPU, all 33/33 layers offloaded | PASS; 88 prompt tokens, 15 generated tokens |

The first LFM run used ctx 1024 and correctly returned `CONTEXT_OVERFLOW` because the image produced 1,801 positions. That is a test configuration failure, not a model/projector compatibility failure. The ctx 4096 rerun passed.

## LFM QVAC versus patched parity check

Two disposable images and the same three disposable questions were sent to each runtime (12 total calls). These questions are explicitly excluded from any future ranked dataset.

- QVAC: 6/6 completed, mean latency 1.537 s.
- Patched llama.cpp: 6/6 completed, mean latency 1.469 s.
- Both runtimes identified the same core visible facts for all six image/question pairs.
- No fake provider, retry, fallback, or model identity substitution was used.

This proves LFM can run through QVAC, but does not authorize changing its Arena runtime. Such a migration would need a separate controlled fairness and regression decision.

## Reproduction

Single-model repro:

```sh
node scripts/qvac-multimodal-repro.mjs \
  --model /absolute/model.gguf \
  --projector /absolute/mmproj.gguf \
  --image /absolute/image.jpg \
  --ctx-size 4096
```

LFM parity:

```sh
node scripts/qvac-lfm-parity.mjs
```

Evidence files:

- `scripts/qvac-multimodal-repro.mjs`
- `scripts/qvac-lfm-parity.mjs`
- `docs/arena/runtime-compatibility-logs/visionpsy-current.log`
- `docs/arena/runtime-compatibility-logs/visionpsy-sdk-0.17.1-llm-0.42.0-effective.log`
- `docs/arena/runtime-compatibility-logs/lfm-current.log`
- `docs/arena/runtime-compatibility-logs/lfm-current-ctx4096.log`
- `docs/arena/runtime-compatibility-logs/smol-current.log`
- `docs/arena/runtime-compatibility-logs/lfm-qvac-vs-patched-parity.json`

## Impact assessment

- **VisionPsy production/Arena:** keep the patched runtime. It is not a fallback; it is the only locally verified runtime containing VisionPsy's custom MTMD implementation.
- **LFM quality fairness:** QVAC and patched outputs were coherent in this tiny parity check, but they use different server/API paths and may apply chat templates, image tiling, generation defaults, or lifecycle settings differently. Six disposable questions are not enough evidence to declare quality equivalence.
- **Runtime consistency:** moving LFM would put 2/3 primary models on QVAC, but VisionPsy would still require patched runtime. This modest operational consistency benefit does not remove mixed-runtime effects.
- **Historical reproducibility:** a migration would make earlier smoke/soak latency and memory results non-comparable and should begin a new evidence series rather than overwrite the old one.
- **Recommendation for LFM:** do not migrate automatically. QVAC is now a verified technical option; evaluate a separately approved, locked regression run before changing the provider assignment.
- **SmolVLM2:** QVAC remains the positive-control path.
- **Fairness reporting:** continue recording the runtime per answer. A mixed-runtime Arena is honest and technically necessary until the custom VisionPsy projector is upstreamed into QVAC Fabric.
- **Dataset/judging:** no impact; none was created or modified here.
