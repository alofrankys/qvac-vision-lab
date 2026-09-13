# Adversarial remediation — 2026-09-05

This checklist distinguishes implemented safeguards from evidence still requiring
verification. No software or video is “unattackable”. Existing raw results remain
unchanged; safeguards added today do not retrospectively certify their provenance.

| Finding | Remedy / consequence |
| --- | --- |
| 1. Replay authenticity | Label the animation as an animated replay of actual answers with original metrics. Word reveal timing is synthetic, not the original event stream. Export a fresh video before publication. |
| 2. Resume identity | New runs freeze a protocol hash before warm-up, retain returned provider identity on every row, reject mixed/legacy/duplicate checkpoints, acquire an exclusive writer lock, and refuse to overwrite final reports. Old checkpoints require a new run ID, not silent migration. Pacing may change without changing protocol identity. |
| 3. Activity / resource visibility | Showcase enters the active-run register and supports cancellation. A shared HTTP admission gate covers Showcase, Arena rounds/batches, VQA and Analyze; busy requests receive 409 rather than starting more model work. Health separately reports readiness and model residency; null residency means unknown. Cancellation is not model unload. Real HTTP tests cover same-route and cross-route rejection. |
| 4. Silent fallback | Unknown provider IDs are rejected; mismatched returned IDs are rejected both by server and runner. No answer is silently attributed to another requested model. |
| 5. Publication provenance | Renderer writes a SHA-256 manifest binding frame sequence, audio, output and render-time source/evidence files. This is integrity metadata, not an independent witness. Source hashes at rendering do not prove capture-browser code identity. GitHub and final MP4 must be checked together before release. |
| 6. Dog grades | Four owner-selected photos are an illustrative demonstration, not a representative test. The rubric was frozen before judge calls, after model answers existed. GPT-6 Astra is an AI judge, not ground truth; format contributes to the score. No general winner is claimed. |
| 7. Tether comparison | Call this local RealWorldQA corroboration: one benchmark, matching published GGUF variants, not Tether's complete evaluation or identical harness. Dog ratings never enter binary RealWorldQA accuracy. |
| 8. Performance | Dog timings are historical recorded samples, not a controlled speed ranking. Keep the separate counterbalanced 50-case performance diagnostic separate from quality and demo scores. |
| 9. HTTP / capture safety | Exact browser origin (host, scheme, port), browser session token on mutations, loopback binding, per-server capture byte/frame/session budgets and exclusive frame writes. Local non-browser clients remain trusted; this is not authentication against hostile software on the same Mac. Quotas reset at restart and are not a total disk quota. Capture remains opt-in. |
| 10. Verification | Behavioral checkpoint/capture tests, real HTTP tests with explicitly synthetic temporary providers, and raw-result-to-published-chart equality checks supplement existing tests. Hardware inferences are not run by CI. Final browser/layout and MP4 verification are separate release gates. |

## Publication wording

“Four personal dog photos make the demo tangible. Separately, we evaluated four
VisionPsy variants on all 765 RealWorldQA questions, using QVAC SDK locally.
Results are close to the matching published scores; this is a local corroboration,
not an exact reproduction of Tether's evaluation. The video animates actual saved
answers; displayed timings belong to the original runs.”

## Verification performed

- 142 automated tests: 141 passed, one optional HEIC codec test skipped.
- Six temporary-provider Arena API integration scenarios passed.
- Real HTTP checks exercised exact Origin rejection, browser token protection,
  invalid provider rejection, returned identity, streamed completion, busy health,
  and same-/cross-route concurrency rejection.
- Preserved raw outputs reconcile exactly with the four published 765-case bars.
- The four-photo replay was captured again without new model inference. Final
  release verification checks MP4 decoding, duration and representative frames.

## Safe recovery and reproducibility

The verified v17 video is 49.9 seconds, H.264 1600×900 with AAC audio.
Its complete decode and output checksum passed verification on 2026-09-13.
The [video integrity manifest](dog-video-v17.manifest.json) binds it to its
render-time inputs; music and capture frames are not redistributed here.
Run `npm run showcase:video:verify` with the local MP4 and its sidecar manifest.
FFmpeg/FFprobe must be installed (or specified via `FFMPEG_PATH`/`FFPROBE_PATH`).

Use a new `QVAC_SHOWCASE_RUN_ID` for a new experiment; do not reuse canonical
report names. Never delete an old checkpoint to bypass a mismatch. A stale writer
lock after a hard kill requires confirming no owner process is alive before removing
that exact lock. Public evidence does not include licensed music or private capture
frames; reproducing the MP4 requires those local assets. Numerical evidence can be
verified without them. No new inference was performed by these remediation tests.
