#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
revision=470e51787a351764057869304e425bc76170bdc6
expected_scorer_sha=06088ed4da68cd9d8c3018e7630d0503f1365e6dd31f651cbedd8aa44dc14466
target=${QVAC_VLMEVALKIT_ROOT:-"$project_root/.third_party/VLMEvalKit-470e517"}

if [ ! -d "$target/.git" ]; then
  if [ -e "$target" ]; then
    echo "Refusing to replace non-Git path: $target" >&2
    exit 1
  fi
  mkdir -p "$(dirname -- "$target")"
  git init "$target"
  git -C "$target" remote add origin https://github.com/open-compass/VLMEvalKit.git
  git -C "$target" fetch --depth 1 origin "$revision"
  git -C "$target" checkout --detach FETCH_HEAD
fi

actual_revision=$(git -C "$target" rev-parse HEAD)
[ "$actual_revision" = "$revision" ] || { echo "VLMEvalKit revision mismatch: $actual_revision" >&2; exit 1; }

scorer="$target/vlmeval/utils/matching_util.py"
actual_scorer_sha=$(shasum -a 256 "$scorer" | awk '{print $1}')
[ "$actual_scorer_sha" = "$expected_scorer_sha" ] || { echo "VLMEvalKit scorer hash mismatch: $actual_scorer_sha" >&2; exit 1; }

printf 'Pinned VLMEvalKit scorer ready\nrevision=%s\nsha256=%s\npath=%s\n' "$actual_revision" "$actual_scorer_sha" "$target"
