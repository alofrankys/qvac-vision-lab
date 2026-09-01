# VisionPsy patched hang investigation

Date: 2026-08-13. No prompts, labels, normalization semantics, candidate tags, or image preprocessing rules were changed.

## Root cause

The stalled real run spent 120,078 ms inside the patched CLI prediction after preprocessing had completed. The model became ready, but the CLI produced no first output before its old 120-second timeout. The adapter also spawned a fresh `llama-mtmd-cli` process for every photo/task and rejected immediately after `SIGTERM`, without waiting for process exit. This caused needless model reloads and allowed stuck native processes to overlap subsequent tasks.

The adapter now uses the same official patched llama.cpp build through a persistent `llama-server`. One process/model is reused across predictions. Every prediction has a configurable 30-second end-to-end timeout (`PAWVAULT_PREDICTION_TIMEOUT_MS`), including startup. A timeout is `MODEL_TIMEOUT`, never invalid output. Timeout and Cancel terminate the owned process group and wait for close before the queue or next run proceeds. Preprocessing has an independent configurable 30-second guard (`PAWVAULT_PREPROCESSING_TIMEOUT_MS`) reported as `PREPROCESSING_TIMEOUT`.

## Real measurements

- Test A, one photo / `environment`: completed, 13,604 ms provider time; cold start 1,058 ms; inference from prompt to first response 12,542 ms; image read below 1 ms; parse/normalize/persist about 17 ms.
- Test B, one photo / three tasks: completed all three in 9,939 ms; PID 65314 reused. Warm provider times: `environment` 95 ms (same cached image/task), `posture` 4,853 ms, `dog_count` 4,915 ms.
- Test C, two photos / one task each: completed both and advanced to photo 2 in 5,009 ms; PID 65314 reused. Warm provider times: 96 ms and 4,867 ms.
- Forced 3-second timeout: controlled `MODEL_TIMEOUT`; run advanced/persisted in 3,551 ms and the server PID was removed.
- Cancel during active prediction: final status `CANCELLED`, inference `RUN_CANCELLED`, completed evidence preserved, server process terminated; a following run started with a new PID and completed normally.

Each run persists current photo/task/stage, stage timestamps and deltas, PID, last successful step, provider logs, timeout/cancel reason, and completed predictions. Completed and cancelled runs can both be exported as Diagnostic Run or Diagnostic Bundle.
