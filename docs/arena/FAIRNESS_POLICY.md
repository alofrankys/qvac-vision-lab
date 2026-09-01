# Fairness policy

The primary comparison includes exactly VisionPsy Base, LFM2.5-VL-450M and SmolVLM2-500M. VisionPsy Flash is secondary only.

Each round enforces the same normalized JPEG, exact user question, output token budget, device, review rubric and deterministic generation policy. Providers run sequentially. Execution order rotates by round independently from randomized blind labels. No provider-specific prompt optimization, fallback, retry advantage or semantic normalization is permitted.

Infrastructure failures remain separate from human quality verdicts. Codes include `IMAGE_DECODE_FAILED`, `PREPROCESSING_FAILED`, `MODEL_LOAD_FAILED`, `MODEL_TIMEOUT`, `MODEL_CRASH`, `INVALID_OUTPUT`, `EMPTY_OUTPUT`, `RUNTIME_RESTART`, `OOM`, `CANCELLED` and `MODEL_IDENTITY_MISMATCH`.

Evidence tiers: fewer than 20 shared reviewed questions is `EXPLORATORY`; 20–29 is `PRELIMINARY`; at least 30 can be ranking-eligible only if the full primary roster, blind-human-review and fairness gates pass.

Limitations: Q8_0 does not erase architectural differences; QVAC SDK does not expose a directly comparable provider-process RSS; unified-memory and thermal state can vary. Resource telemetry is displayed beside quality but never folded into quality scores.
