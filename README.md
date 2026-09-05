# QVAC Vision Lab

QVAC Vision Lab is a local-first, evidence-driven workspace for finding the real capability boundaries of small vision-language models on private, real-world images. It turns repeatable questions, raw outputs, timings, provenance, and explicit review into durable experiment evidence.

The public story has two layers: a friendly four-photo dog demo that makes local visual inference understandable, followed by an audited 765-case RealWorldQA corroboration against matching published VisionPsy GGUF results. This is the evaluation and prototyping layer for a larger privacy-first application built around real dog photos, natural visual questions and on-device intelligence.

## Why this exists

Model demos are easy; reliable product assumptions are not. The Lab keeps exploratory visual tasks separate from reusable findings and never treats a model answer as ground truth. Small samples remain explicitly exploratory.

## Experiments

| Experiment | Status | Purpose |
| --- | --- | --- |
| 01 — PawVault / Private Pet Photo Search | Completed; findings captured | Historical pet-photo tagging, semantic extraction, runtime, and failure-boundary work |
| 02 — Real-World Visual Q&A | Ready | Manual, per-image natural questions on real photos |
| 03 — Screenshot Understanding | Ready | Q&A for app, web, settings, dashboard, and warning screenshots |
| 04 — Documents & Charts | Ready | Q&A about visible text, tables, values, documents, and charts |
| 05 — Small Vision Model Arena | Experimental | Same image and exact question through explicitly selected providers |
| 06 — VisionPsy Live Showcase | Four-variant audit complete | Real-image live comparison with streaming, per-run KPIs and aggregate paired statistics |

PawVault remains intact as Experiment 01. Its old run IDs, photo IDs, prompts, raw outputs, reviews, and diagnostic evidence are not rewritten. The schema-v5 migration adds Arena records, judgments, question sets, and provenance fields only.

## Providers

- `qvac-visionpsy-standard-q8`: VisionPsy-Nano-460M Q8_0 through QVAC SDK 0.18.2 and `@qvac/llm-llamacpp` 0.47.0, using the official tiled-upscale preprocessing path.
- `qvac-visionpsy-standard-q4`: VisionPsy-Nano-460M Q4_K_M imatrix through the same QVAC SDK/backend, Standard Q8 vision projector and tiled-upscale preprocessing path.
- `qvac-visionpsy`: VisionPsy-Nano-460M-Flash Q8_0 through QVAC SDK 0.18.2 and `@qvac/llm-llamacpp` 0.47.0.
- `qvac-visionpsy-flash-q4`: VisionPsy-Nano-460M-Flash Q4_K_M imatrix through the same QVAC SDK/backend and native-resolution preprocessing.
- `lfm2.5-vl-450m`: pinned official LFM2.5-VL-450M Q8_0 primary peer on the persistent patched Metal server.
- `qvac-smolvlm2`: pinned SmolVLM2-500M Q8_0 primary peer through QVAC SDK, with propagated token budget, timeout and cancellation.

Provider choice is explicit. There is no silent fallback, and provider/runtime/model/projection provenance stays attached to every inference.

## VisionPsy Live Showcase

Experiment 06 exposes two public scenarios:

1. **Dog stories** — four personal photographs, four natural questions and four local VisionPsy variants. The published video is an accelerated replay of 16 recorded answers, with a separate blinded GPT-6 Astra review. The app can also run new local inferences; those do not inherit the frozen Astra grades. This is an explanatory demo, not a benchmark.
2. **RealWorldQA corroboration** — all 765 official scored cases reconstructed from the checksum-locked TSV (`MD5 4de008f55dc4fd008ca9e15321dc44b7`). Questions and options are preserved; the pinned VLMEvalKit scorer infers the selected option, which is then compared with the gold option for binary accuracy. No synthetic or external suite enters the aggregate.

All four variants use QVAC SDK and the same QVAC llama.cpp backend on Apple Metal; preprocessing remains model-specific. The primary three-variant run uses the checksum-pinned upstream VLMEvalKit prompt, deterministic case shuffling with a published seed, and a balanced three-position provider rotation. Standard Q4 was added later under a frozen preregistration over the identical 765 inputs, prompt, scorer, generation settings and case order. This makes the four-way **accuracy** comparison paired; its separately paced performance telemetry is not a direct speed ranking. Recording Assist shows raw answers, Pass/Fail, TTFT, latency, throughput, tokens, process RSS/CPU, and system-wide macOS GPU samples.

| Variant | Local exact | Matching published GGUF | Delta |
| --- | ---: | ---: | ---: |
| Standard Q8_0 | 446/765 · 58.30% | 59.1% | -0.80 pp |
| Standard Q4_K_M imatrix | 443/765 · 57.91% | 60.3% | -2.39 pp |
| Flash Q8_0 | 438/765 · 57.25% | 56.7% | +0.55 pp |
| Flash Q4_K_M imatrix | 428/765 · 55.95% | 54.9% | +1.05 pp |

Standard Q8 finished three answers ahead of Standard Q4 and eight ahead of Flash Q8. None of the six paired exact McNemar comparisons remains significant after Holm correction, and every image-cluster bootstrap interval for a paired score difference includes zero, so the defensible conclusion is **no clear local winner**. A separate 100-case, three-pass repeatability audit now covers all four variants: every raw output and pass/fail verdict repeated exactly, with 0.00 pp maximum score swing. This is a **local corroboration**, not a bit-for-bit reproduction of Tether’s in-house evaluation. Read the [methodology](docs/REALWORLDQA_METHODOLOGY.md), [publication audit](docs/PUBLICATION_AUDIT.md), [combined audit](reports/visionpsy-realworldqa-765-qvac-sdk-vlmevalkit-audit.md), [primary raw run](reports/visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.md), [Standard Q4 addendum](reports/visionpsy-standard-q4-realworldqa-765-qvac-sdk-vlmevalkit-470e517.md), and [controlled performance diagnostic](reports/visionpsy-four-way-performance-realworldqa-validation-50-counterbalanced-50.md).

A separate 50-case four-way timing diagnostic, with excluded warm-ups and balanced execution order, measured mean local latency of 2.26 s (Flash Q4), 2.27 s (Flash Q8), 3.97 s (Standard Q4) and 4.02 s (Standard Q8). It is a Mac-specific performance check and is never merged into the 765-question quality result.

### Reading the dog-demo scores

The video displays **mean Astra rubric score out of 10**, not benchmark accuracy: Standard Q8 **8.50**, Standard Q4 **7.75**, Flash Q8 **9.00**, Flash Q4 **8.25**. Each photo has equal weight. Three separately randomized, model-name-blinded passes returned identical scores; this measures judge stability, not proof of correctness. There are four images, not a larger statistical sample created by repeating the judge.

The rubric weights requested facts 80%, absence of unsupported extra claims 10%, and explicit constraints such as one sentence/no breed names 10%. Standard and Flash **tie on the factual-content subscore at each quantization**; instruction following separates their overall scores. The rubric was fixed before these judging calls, but the demo questions and answers were already selected and seen. This is neither a held-out benchmark nor human-validated ground truth. The Astra review ran separately through cloud-hosted Codex; VisionPsy answers were local. No claim of end-to-end cloud-free judging is made.

See the [dog-review methodology and per-photo results](docs/DOG_DEMO_ASTRA_REVIEW.md) and [complete prompts, anonymous mappings and raw judge outputs](reports/visionpsy-dog-demo-astra-20260905.json). These scores never enter the RealWorldQA aggregate. The old recorded dog timings remain historical samples, not a speed ranking.

## Reusable Visual Q&A workflow

Choose one to ten images, write one exact question per image, and explicitly opt in if one question should be reused. The Lab never creates automatic questions. Visual Q&A uses one provider; exploratory Arena rounds compare explicitly selected peers, while the locked primary Arena uses the exact three-model roster below.

Open-output review supports `CORRECT`, `PARTIALLY_CORRECT`, `WRONG`, `HALLUCINATED`, and `UNCLEAR_IMAGE`, plus an optional human note and featured-example flag. Judge provenance distinguishes `USER`, `CODEX_ASSISTED`, and `LOCAL_MODEL`. Rankings are withheld below the minimum reviewed-sample threshold.

## Fair Resource-Matched Arena

Experiment 05 compares VisionPsy-Nano-460M, LFM2.5-VL-450M and SmolVLM2-500M using pinned Q8_0 model/projector artifacts on the same local Apple Metal device. It enforces the same normalized image, exact user-authored question and output budget, rotates sequential execution order, and keeps identities hidden until manual review. VisionPsy-Nano-460M-Flash remains a secondary speed/control model excluded from primary quality ranking.

Answers are randomized to A/B/C independently from execution order. Before reveal, provider IDs, model/runtime details, mapping and latency remain private. Manual review uses `CORRECT`, `PARTIALLY_CORRECT`, `WRONG`, `HALLUCINATED`, or `UNCLEAR_IMAGE`; early reveal permanently marks a round non-blind. Evidence is exploratory below 20 shared reviewed questions, preliminary at 20–29, and only potentially ranking-eligible at 30 or more.

Before any real benchmark, run `npm run arena:audit`. It recomputes model/projector hashes and checks provider, precision, dataset version and question-lock gates without inference. Verify a completed Arena run with `npm run arena:verify -- <run-id>`.

The UI separates `Blind Judge Bundle` (share-safe anonymous review material) from `Private Mapping Bundle` and `Full Private Evidence Bundle` (never share before review). Locked primary batch execution is refused server-side unless the authoritative audit returns `BENCHMARK_READY`; UI enablement is only a convenience. For software-only API verification without model inference or project data, run `npm run arena:test:integration`.

Methodology: [roster audit](docs/arena/CURRENT_MODEL_ROSTER_AUDIT.md), [competitor discovery](docs/arena/COMPETITOR_DISCOVERY_2026-08-15.md), [model locks](docs/arena/MODEL_LOCKS.md), [fairness policy](docs/arena/FAIRNESS_POLICY.md), [preregistration](docs/arena/FAIR_ARENA_PREREGISTRATION.md), [judging](docs/arena/JUDGING_PROTOCOL.md), [smoke/soak](docs/arena/SOAK_TEST_REPORT.md), and [readiness audit](docs/arena/FAIR_ARENA_READINESS_AUDIT.md).

## Datasets and provenance

`Pet Photos Real Set v1` is created additively from the canonical historical PawVault working set. Dataset records include stable image IDs, source description, experiment usage, and ground-truth status. Future screenshot and document imports use the same local registry boundary.

Diagnostic exports include project, experiment, dataset, question set, exact prompt/question, inference image metadata, raw and normalized output, latency, provider/runtime/model details, errors, and review provenance. Old PawVault diagnostic structures remain readable.

## Architecture

```text
public/             experiments dashboard, PawVault UI, VQA and Arena review
src/lab/            experiment catalog, datasets, migrations, VQA drafts/metrics
src/vision/         explicit provider adapters and lifecycle boundaries
src/storage/        atomic local JSON persistence and additive migration
src/evaluation/     metrics, timing, warnings, failure evidence
src/export/         diagnostic JSON/ZIP with experiment provenance
docs/experiments/   historical experiment index and findings
test/               unit, migration, workflow, timeout, and UI-contract tests
```

See [architecture](docs/ARCHITECTURE.md), the [PawVault experiment index](docs/experiments/pawvault/README.md), and the [migration report](docs/QVAC_VISION_LAB_MIGRATION_REPORT.md).

## Run and reproduce

Requirements: macOS 14+, Node.js 22.17+, npm 10.9+. Apple Silicon is recommended.

The npm dependency tree includes QVAC native binaries for several supported platforms. A clean `npm ci` currently occupies approximately 5.7 GB; model files and reconstructed RealWorldQA images require additional disk space.

Local vision models are loaded only by real inference requests. QVAC SDK models
and owned patched `llama-server` processes unload after 15 idle minutes by
default and cold-start on demand; set `QVAC_VISION_IDLE_UNLOAD_MS` to override
the delay. Health, status, and diagnostic reads do not reset the idle timer.

```bash
npm ci
npm start
```

Open <http://127.0.0.1:8877>. Port 8877 is the permanent project UI port. Run checks with `npm test`. New experiments are prepared as drafts and are never executed automatically.

The repository includes the four owner-supplied dog photos but redistributes no RealWorldQA images or questions. To reconstruct all 765 official cases locally, download the official `RealWorldQA.tsv` and run:

```bash
npm run showcase:install:realworldqa -- /absolute/path/to/RealWorldQA.tsv
```

The installer refuses a source whose MD5 is not `4de008f55dc4fd008ca9e15321dc44b7`. Then use `npm run showcase:test:official-all-vlmevalkit` for the frozen primary three-model cycle and the Standard Q4 command below for the preregistered fourth-variant addendum. Models are downloaded by the configured QVAC providers on first use and are not stored in Git.

To run only the preregistered Standard Q4 addendum with low average hardware duty cycle, append-only checkpointing, a 30-second pause between inferences, an extra three-minute pause every 25 cases and a load gate that waits whenever the one-minute system load exceeds the ten logical CPU cores:

```bash
npm run showcase:test:standard-q4-vlmevalkit-low-resource
```

The pacing is intended to leave the Mac responsive for other work. It makes wall-clock and latency figures unsuitable for a direct speed comparison with the original run; accuracy inputs and scoring remain unchanged.

For the checksum-pinned upstream scorer audit:

```bash
npm run showcase:setup:vlmevalkit-scorer
npm run showcase:audit:vlmevalkit-upstream
```

The scorer command verifies both the VLMEvalKit Git revision and the SHA-256 of `matching_util.py` before directly executing its `can_infer` implementation.

For the separate deterministic repeatability audit (100 stratified cases, three passes per model; repeat 1 is reused from the canonical run):

```bash
npm run showcase:test:repeatability
```

For a separate 50-case, four-model, balanced-rotation local performance diagnostic (never merged into the 765-question quality score):

```bash
npm run showcase:test:four-way-performance
```

Its controls and claim boundary are frozen in [the four-way performance protocol](docs/FOUR_WAY_PERFORMANCE_PROTOCOL.md).

## Privacy

Photos, EXIF/GPS, state, model outputs, backups, inference images, frame captures, videos and smoke artifacts stay in ignored local paths. The only personal images intentionally published are the four selected dog-demo assets. The app has no cloud backend. Diagnostic bundles can contain sensitive originals and metadata; inspect them before sharing.

## Findings so far

- Runtime lifecycle, timeout, cancellation, and raw-output evidence are first-class requirements, not debugging extras.
- Closed-label accuracy and open-output usefulness are different measures and remain separate.
- Human review is the default ground-truth boundary; assisted review must carry explicit provenance.
- Small evaluations reveal hypotheses and failure modes, not universal model rankings.

Historical detailed findings and upstream evidence are indexed under `docs/experiments/pawvault/`.

## License

Source code is licensed under the Apache License 2.0; see [LICENSE](LICENSE). RealWorldQA, model artifacts, personal photographs and other third-party material retain their own terms described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The four dog-demo photographs are not licensed for reuse.

## Limitations

- Local browser UI, not a packaged macOS app.
- Inference is sequential to keep memory and runtime behavior predictable.
- Dataset size and review coverage are limited; comparison results remain exploratory until thresholds are met.
- The 765-case result is one deterministic run on one Mac and one benchmark; it is not a universal model ranking.
- The committed result covers one of 17 public VisionPsy benchmarks and is an independent local corroboration, not Tether's internal harness or an official leaderboard submission.
- The dog demo is deliberately illustrative and must not be described as benchmark evidence.
- Exact-option scoring does not measure prose quality, safety, or open-ended usefulness.
- QVAC process metrics are isolated where possible; macOS GPU metrics are system-wide.
- Search, albums, YOLO, DINOv2, automatic identity, and cloud sharing are outside this migration.

## Roadmap

Run and review Experiments 02–06 on deliberately varied sets; add verified providers only behind the existing adapter boundary; expand dataset provenance and share-safe exports; promote findings only when review coverage justifies them.

## Repository

The project is published at <https://github.com/alofrankys/qvac-vision-lab>.
