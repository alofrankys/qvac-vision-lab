# Security policy

QVAC Vision Lab is a local-first research application. The server binds to a
loopback address and rejects non-loopback `Host` and `Origin` headers. Do not
expose it through a public reverse proxy or port-forward without adding
authentication, authorization, rate limiting and a separate threat review.

- Do not publish `data/`, diagnostic exports, frame captures, `.env` files,
  checkpoints or reconstructed benchmark assets; they can contain images,
  metadata, prompts and model outputs.
- Local frame capture is disabled by default. Enable it only for a trusted
  recording session with `QVAC_ENABLE_FRAME_CAPTURE=1` and turn it off afterward.
- Inspect every exported bundle before sharing it.
- Model files are downloaded externally; verify the pinned repository revision
  and hashes recorded in provider and run provenance.

## Reporting a vulnerability

Please use GitHub's private vulnerability-reporting flow when it is available
for this repository. Do not include private photographs, model caches, API
tokens, raw benchmark assets or other sensitive local data in a public issue.

## Supported version

Security fixes target the current `main` branch. Model weights, QVAC runtime
packages and third-party datasets have their own upstream security and licence
policies.
