# Model locks

The machine-readable source of truth is [`config/fair-arena-model-lock.json`](../../config/fair-arena-model-lock.json). It pins repository revisions, local paths, byte sizes, SHA-256 hashes, quantization, projector artifacts, licenses and the patched runtime binary.

Primary precision is Q8_0 for both model and projector. The configuration is `CLOSELY_COMPARABLE`, not mathematically identical: architectures differ and SmolVLM uses the QVAC SDK interface while VisionPsy and LFM use the same patched llama.cpp mtmd server. All execute locally on the same Apple M4 Metal device with deterministic generation controls and no fallback.

The readiness audit recomputes every artifact hash. A mismatch blocks execution. A listening but unowned native server port is rejected as `MODEL_IDENTITY_MISMATCH`; the provider never silently attaches to it.
