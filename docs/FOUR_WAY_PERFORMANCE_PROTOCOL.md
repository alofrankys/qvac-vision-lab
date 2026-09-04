# Four-way local performance protocol

This diagnostic isolates the four VisionPsy variants from the separately paced full-quality runs. It is designed to answer one narrow question: how do local response timings compare when all four artifacts run under the same procedure on this Mac?

## Frozen controls

- 50 deterministic RealWorldQA cases selected before execution.
- Identical images, prompts, generation settings and QVAC-native runtime/backend.
- One excluded warm-up per model.
- Sequential inference with a balanced four-position Latin rotation.
- No intentional inter-inference delay or batch pause.
- Append-only checkpoint and resumable execution.
- Raw TTFT, response latency and generation throughput retained per inference.

## Claim boundary

This is a local-device performance diagnostic, not a portable speed benchmark. macOS GPU utilization is system-wide, unified-memory accounting is not model-isolated, and background work or thermal state can still affect timing. Accuracy from the complete 765-question audit remains the quality result; the 50-case diagnostic must not replace or be merged into that denominator.

Run it with:

```sh
npm run showcase:test:four-way-performance
```
