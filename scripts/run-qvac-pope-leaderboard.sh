#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export PYTHONPATH="$ROOT/.third_party/VLMEvalKit-qvac:$ROOT/scripts/vlmeval_compat${PYTHONPATH:+:$PYTHONPATH}"
export LMUData="$ROOT/data/vlmeval"
exec "$ROOT/.venv-vlmeval/bin/python" "$ROOT/scripts/qvac-pope-leaderboard.py"
