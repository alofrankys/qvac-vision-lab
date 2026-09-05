# Public repository audit

Audit date: 2026-09-04. Scope: repository history, runtime surface, dependencies, data provenance, benchmark methodology, public UX, reproducibility and publication contents.

## Publication contract

The public repository tells two distinct stories:

1. **Dog stories:** approachable, natural visual Q&A over four owner-supplied photos. It explains what local inference looks like; it makes no benchmark claim.
2. **RealWorldQA corroboration:** a fixed 765-question, exact-scored comparison against matching published VisionPsy GGUF values. It is evidence, not entertainment, and is labelled as local rather than official.

The completed public evidence covers Standard Q8_0, Standard Q4_K_M imatrix, Flash Q8_0 and Flash Q4_K_M imatrix. The separately preregistered Standard Q4 addendum completed all 765 cases and completes the 2×2 architecture/quantization grid without rewriting the original records.

## Resolved high-priority findings

| Finding | Severity | Resolution |
| --- | --- | --- |
| `sharp` dependency had published high-severity libvips advisories | High | Pinned `sharp` 0.35.4; production dependency audit returns zero known vulnerabilities. |
| Redistributed RealWorldQA samples created avoidable licensing ambiguity | High | No RealWorldQA image/question is committed. The complete checksum-locked dataset is reconstructed locally and ignored by Git. |
| Old diagnostic and superseded RealWorldQA material could be mistaken for canonical evidence | High | Removed from the public Experiment 06 surface and aggregate; the reports index separates the frozen quality run, direct scorer audit, methodology/repeatability audits and controlled local timing diagnostic. |
| “Replica” language overstated parity with an in-house harness | High | README, UI and methodology use “local corroboration” and enumerate every known mismatch. |
| Recording endpoint could write arbitrary volumes of local frame files | High | Disabled by default and gated behind `QVAC_ENABLE_FRAME_CAPTURE=1`; filenames and payload sizes remain bounded. |
| Third-party music provenance was not recorded | High | “Soul Jazz” by Francisco Alvear is documented with its Mixkit source and Stock Music Free License; the source audio and rendered media remain excluded from Git, and the app falls back to generated Web Audio. |
| Large raw datasets, checkpoints and videos risked accidental publication | High | Explicit ignore policy plus a staged-content and secret scan before push. |

## Remaining limitations

The 2026-09-05 dog-demo addendum replaces unsourced editorial grades with a documented, model-name-blinded GPT-6 Astra review. Prompts, image hashes, anonymous mappings and all three judge outputs are published separately. The video shows mean rubric score out of ten, not accuracy; fresh local answers cannot inherit those scores. This improves traceability, not certification. The review remains four selected examples, one judge model, an author-designed rubric and no independent human calibration. See [the complete protocol and limitations](DOG_DEMO_ASTRA_REVIEW.md).

- Source code is licensed under Apache-2.0. Dataset, model and personal-photo rights remain separate under `THIRD_PARTY_NOTICES.md`.
- The four personal dog photos are intentionally included but remain copyright of the repository owner.
- Full RealWorldQA reconstruction requires the official source TSV and about 130 MB of generated local assets.
- Model weights are external, large and downloaded on first use.
- The browser dashboard is local-only and has not been hardened for exposure to an untrusted network.
- The checked-in benchmark is from one machine. A 100-case, three-pass audit covering all four variants found 100% exact-output agreement, but it does not estimate behavior across other prompts, stochastic settings, hardware or the full benchmark under repeated execution.
- Standard Q4 was collected as a separate addendum and its low-resource pacing was relaxed during execution. Its paired accuracy remains valid; wall-clock, latency and resource telemetry are unsuitable for direct ranking against the primary run.
- A separate 50-case timing diagnostic corrects that performance-comparison gap: all four variants ran sequentially on the same Mac, with one excluded warm-up each and a balanced four-position rotation. Mean latency was 2.26 s for Flash Q4, 2.27 s for Flash Q8, 3.97 s for Standard Q4 and 4.02 s for Standard Q8. These are descriptive local timings, not portable hardware claims and not part of the 765-question quality score.

## Publication decision

Ready for a public GitHub repository after the full automated test suite, dependency audit, clean-clone startup check, browser smoke test, staged-secret scan and final staged-file review all pass.
