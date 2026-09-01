# Public repository audit

Audit date: 2026-09-01. Scope: repository history, runtime surface, dependencies, data provenance, benchmark methodology, public UX, reproducibility and publication contents.

## Publication contract

The public repository tells two distinct stories:

1. **Dog stories:** approachable, natural visual Q&A over four owner-supplied photos. It explains what local inference looks like; it makes no benchmark claim.
2. **RealWorldQA corroboration:** a fixed 765-question, exact-scored comparison against matching published VisionPsy GGUF values. It is evidence, not entertainment, and is labelled as local rather than official.

## Resolved high-priority findings

| Finding | Severity | Resolution |
| --- | --- | --- |
| `sharp` dependency had published high-severity libvips advisories | High | Pinned `sharp` 0.35.4; production dependency audit returns zero known vulnerabilities. |
| Redistributed RealWorldQA samples created avoidable licensing ambiguity | High | No RealWorldQA image/question is committed. The complete checksum-locked dataset is reconstructed locally and ignored by Git. |
| Old 600-case diagnostic material could be mistaken for RealWorldQA evidence | High | Removed from the public Experiment 06 surface and aggregate; only canonical 765-case artifacts are allow-listed. |
| “Replica” language overstated parity with an in-house harness | High | README, UI and methodology use “local corroboration” and enumerate every known mismatch. |
| Recording endpoint could write arbitrary volumes of local frame files | High | Disabled by default and gated behind `QVAC_ENABLE_FRAME_CAPTURE=1`; filenames and payload sizes remain bounded. |
| Third-party music had no recorded redistribution grant | High | Excluded from Git; the demo falls back to locally generated Web Audio. |
| Large raw datasets, checkpoints and videos risked accidental publication | High | Explicit ignore policy plus a staged-content and secret scan before push. |

## Remaining limitations

- Source code is licensed under Apache-2.0. Dataset, model and personal-photo rights remain separate under `THIRD_PARTY_NOTICES.md`.
- The four personal dog photos are intentionally included but remain copyright of the repository owner.
- Full RealWorldQA reconstruction requires the official source TSV and about 130 MB of generated local assets.
- Model weights are external, large and downloaded on first use.
- The browser dashboard is local-only and has not been hardened for exposure to an untrusted network.
- The checked-in benchmark is a single machine/run. Its paired statistics reduce overclaiming but do not estimate run-to-run variance.

## Publication decision

Ready for a public GitHub repository after the full automated test suite, dependency audit, clean-clone startup check, browser smoke test, staged-secret scan and final staged-file review all pass.
