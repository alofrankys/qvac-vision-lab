#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export LMUData="$project_root/data/vlmeval"
export HF_HOME="$project_root/data/hf-cache"
export PYTHONPATH="$project_root/scripts/vlmeval_compat"

exec "$project_root/.venv-vlmeval/bin/python" "$project_root/scripts/qvac-partial-leaderboard.py"
