"""Import-only compatibility shim for image-only VLMEvalKit runs on macOS.

The official VLMEvalKit package imports video modules eagerly, while decord has
no macOS arm64 wheel. QVAC's 17 selected benchmarks are image-only, so this
module permits import and fails loudly if a video path is accidentally used.
"""


def _unsupported(*_args, **_kwargs):
    raise RuntimeError("decord is unavailable on macOS arm64; this replication permits image benchmarks only")


class VideoReader:
    def __init__(self, *_args, **_kwargs):
        _unsupported()


def cpu(*args, **kwargs):
    return _unsupported(*args, **kwargs)


class _Bridge:
    @staticmethod
    def set_bridge(*_args, **_kwargs):
        return None


bridge = _Bridge()
