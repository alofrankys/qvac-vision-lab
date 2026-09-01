# Fair Arena real-provider technical validation

Date: 2026-08-15. These used two existing local inference-ready images and disposable technical prompts. They are not questions from the future benchmark dataset.

Fresh smoke: 2 real local images × 3 short technical questions × 3 primary providers = 18/18 completed, zero timeout/crash. Each native provider retained one PID across all six calls; SmolVLM2 retained one in-process SDK model ID.

| Provider | Cold start | Warm range | Smoke |
|---|---:|---:|---:|
| VisionPsy Base | 824 ms | 1,663–1,948 ms | 6/6 |
| LFM2.5-VL | 608 ms | 1,240–1,448 ms | 6/6 |
| SmolVLM2 | 8,693 ms | 303–506 ms | 6/6 |

The Smol cold start was an outlier: two subsequent fresh soak loads measured 1,355 ms and 1,312 ms. It is retained rather than discarded.

Final stabilization soak: 18 consecutive calls per provider, 54/54 total, zero timeout/crash/restart, zero identity mismatch, zero retry, and zero cross-prompt stale-output suspicion. The same six image/question pairs were repeated for three cycles so late memory growth could be separated from lazy allocation and prompt-cache warm-up.

| Provider | Cold start | Non-cached warm range | Cached repeat range | Peak provider RSS | Final-cycle RSS growth |
|---|---:|---:|---:|---:|---:|
| VisionPsy Base | 826 ms | 1,733–2,095 ms | 63–279 ms | 1,651,834,880 B | 851,968 B |
| LFM2.5-VL | 611 ms | 1,359–1,426 ms | 82–109 ms | 1,077,739,520 B* | stable within 64 MiB gate |
| SmolVLM2 | 1,312 ms | 203–316 ms | 203–305 ms | SDK host RSS only; non-comparable | stable within 64 MiB gate |

`*` LFM peak shown is the directly observed native-process peak from the corrected 12-call soak immediately preceding the final stabilization run; the 18-call run also passed the same bounded-growth gate.

## Resource match

Counts below are direct sums of GGUF tensor dimensions, not rounded model-card labels.

| Provider | Model params | Projector params | Total params | Precision | Artifact bytes | Backend |
|---|---:|---:|---:|---|---:|---|
| VisionPsy Base | 409,133,760 | 98,229,504 | 507,363,264 | Q8_0 + Q8_0 | 545,458,144 | patched llama.cpp mtmd · Metal |
| LFM2.5-VL | 354,483,968 | 94,234,880 | 448,718,848 | Q8_0 + Q8_0 | 482,034,272 | patched llama.cpp mtmd · Metal |
| SmolVLM2 | 409,252,800 | 98,229,504 | 507,482,304 | Q8_0 + Q8_0 | 545,593,888 | QVAC MTMD · GPU/Metal |

Every inference reported the exact locked provider ID and revision. Native runtimes used one owned PID, zero restarts and `retry_count=0`; the SDK reported one loaded `SMOLVLM2_500M_MULTIMODAL_Q8_0` model, Metal support and unified memory. No fake provider or fallback path was present. QVAC SDK still does not expose a separately attributable model-process/GPU allocation; its host RSS is therefore not presented as comparable peak model RAM.
