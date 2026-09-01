# Fair Arena readiness audit

Audit date: 2026-08-15.

| Model | Direct GGUF tensor parameters | Precision | Model + projector bytes | Measured peak RSS | Backend |
|---|---:|---|---:|---:|---|
| VisionPsy Base | 507,363,264 | Q8_0 + Q8_0 | 545,458,144 | 1,651,834,880 | patched llama.cpp mtmd · Metal |
| LFM2.5-VL | 448,718,848 | Q8_0 + Q8_0 | 482,034,272 | 1,077,739,520 | patched llama.cpp mtmd · Metal |
| SmolVLM2 | 507,482,304 | Q8_0 + Q8_0 | 545,593,888 | SDK provider allocation unavailable | QVAC MTMD · Metal |

Machine fingerprint inputs: MacBook Air `Mac16,12`, Apple M4, 10 cores, 16 GiB unified memory, arm64, macOS 26.6. Serial number and hardware UUID are excluded.

## Software readiness result

`READY_FOR_DATASET_PREPARATION`

No P0/P1 software or real-provider blocker remains. Passing: official freshness audit, exact roster, revisions and artifact hashes, Q8_0 policy, provider integrations, output-budget propagation, persistent lifecycle, cancellation/deadline contracts, rotating order, blind mapping, identity guard, atomic state updates, authoritative server-side readiness gate, blind-export leak checks, isolated fake-provider API tests, a fresh 18/18 real smoke, and a final 54/54 real stabilization soak. The real soak found no timeout, crash, identity crossover, stale cross-prompt output, hidden retry, restart, fallback, or unbounded late RSS growth.

## Data gate

The runtime audit still correctly returns `BLOCKED`: `Real-World Vision Arena v1` is empty/mutable, has fewer than 30 linked questions, and therefore has no final lock hash. This is an operational data blocker, not a software defect. No questions were silently generated and no real benchmark was run.

Before a trusted comparison, author/select at least 30 real questions with preregistered category coverage, inspect them, then create the locked versioned batch. Run `npm run arena:audit` again; only its `BENCHMARK_READY` result authorizes the real benchmark.
