#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
suite=${1:-headline}

export LMUData="$project_root/data/vlmeval"
export HF_HOME="$project_root/data/hf-cache"
export PYTHONPATH="$project_root/scripts/vlmeval_compat"
export VLMEVAL_LOCALIZE_NPROC="${VLMEVAL_LOCALIZE_NPROC:-1}"

cd "$project_root/.third_party/VLMEvalKit-qvac"
"$project_root/.venv-vlmeval/bin/python" "$project_root/scripts/qvac-prepare-datasets.py" --suite "$suite"
cd "$project_root"
node scripts/qvac-benchmark-inventory.mjs --suite "$suite" --write
