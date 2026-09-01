# Security

QVAC Vision Lab is a local research application. It binds to `127.0.0.1` by default and is not designed for direct exposure to an untrusted network.

- Do not publish `data/`, diagnostic exports, frame captures or `.env` files; they can contain images, metadata, prompts and model outputs.
- Local frame capture is disabled by default. Enable it only for a trusted recording session with `QVAC_ENABLE_FRAME_CAPTURE=1` and turn it off afterward.
- Inspect any exported bundle before sharing it.
- Model files are downloaded externally; verify the pinned repository/commit and hashes recorded by provider status.

Please report a suspected vulnerability privately to the repository owner rather than opening an issue containing sensitive data.
