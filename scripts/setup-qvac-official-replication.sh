#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
vlmeval_root="$project_root/.third_party/VLMEvalKit-qvac"
venv_root="$project_root/.venv-vlmeval"

base_commit=63a279f1e53cccc5b9b4d8984b17a8fbbaef8d67
pr1601=5aaadcbcc6b5bbd9aa18468a387711596d7d5da1
pr1602=3aa99a43ff77430d413b7038b430b68d2083b82f
pr1611=8e292bf48a8802c9c8d3c114ed3d23607742b039
pr1613=02c8d8c4e4afe91161b567fe44675cf9e10922fa

if [ ! -d "$vlmeval_root/.git" ]; then
  mkdir -p "$project_root/.third_party"
  git clone --branch main --single-branch https://github.com/open-compass/VLMEvalKit.git "$vlmeval_root"
  git -C "$vlmeval_root" fetch origin \
    refs/pull/1601/head:refs/remotes/origin/pr-1601 \
    refs/pull/1602/head:refs/remotes/origin/pr-1602 \
    refs/pull/1611/head:refs/remotes/origin/pr-1611 \
    refs/pull/1613/head:refs/remotes/origin/pr-1613
  git -C "$vlmeval_root" switch --detach "$base_commit"
  git -C "$vlmeval_root" cherry-pick "$pr1601" "$pr1602" "$pr1611" "$pr1613"
fi

if ! git -C "$vlmeval_root" grep -q '"LFM2.5-VL-450M"' -- vlmeval/config.py; then
  git -C "$vlmeval_root" apply "$project_root/config/patches/vlmeval-lfm25-450m.patch"
fi

if ! git -C "$vlmeval_root" grep -q 'VLMEVAL_DEVICE' -- vlmeval/vlm/nanovlm.py; then
  if git -C "$vlmeval_root" apply --check "$project_root/config/patches/vlmeval-device-portability.patch"; then
    git -C "$vlmeval_root" apply "$project_root/config/patches/vlmeval-device-portability.patch"
  else
    printf '%s\n' 'Warning: the optional MPS model-adapter patch does not match the force-pushed PR 1613 head; dataset preparation remains available.' >&2
  fi
fi

mkdir -p "$project_root/data/vlmeval" "$project_root/data/hf-cache"

if [ "${1:-}" = "--with-python" ]; then
  uv venv "$venv_root" --python 3.12
  uv pip install --python "$venv_root/bin/python" -e "$vlmeval_root" --no-deps
  if [ "$(uname -s)" = "Darwin" ]; then
    uv pip install --python "$venv_root/bin/python" -r "$project_root/config/vlmeval-macos-requirements.txt"
  else
    uv pip install --python "$venv_root/bin/python" -r "$vlmeval_root/requirements.txt"
  fi
fi

node "$project_root/scripts/qvac-official-replication.mjs" status
