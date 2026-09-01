#!/usr/bin/env python3
"""Execute can_infer from a checksum-pinned VLMEvalKit source file."""

import argparse
import hashlib
import importlib.util
import json
import logging
import pathlib
import subprocess
import sys
import types

REVISION = "470e51787a351764057869304e425bc76170bdc6"
SCORER_SHA256 = "06088ed4da68cd9d8c3018e7630d0503f1365e6dd31f651cbedd8aa44dc14466"


def load_official_scorer(root: pathlib.Path):
    actual_revision = subprocess.check_output(
        ["git", "-C", str(root), "rev-parse", "HEAD"], text=True
    ).strip()
    if actual_revision != REVISION:
        raise RuntimeError(f"VLMEvalKit revision mismatch: {actual_revision}")

    scorer_path = root / "vlmeval" / "utils" / "matching_util.py"
    scorer_sha = hashlib.sha256(scorer_path.read_bytes()).hexdigest()
    if scorer_sha != SCORER_SHA256:
        raise RuntimeError(f"VLMEvalKit scorer hash mismatch: {scorer_sha}")

    # matching_util imports only VLMEvalKit's logger. Supplying that namespace
    # avoids importing the toolkit's unrelated video/model integrations while
    # still executing the exact, checksum-verified upstream scorer source.
    vlmeval = types.ModuleType("vlmeval")
    smp = types.ModuleType("vlmeval.smp")
    log = types.ModuleType("vlmeval.smp.log")
    log.get_logger = logging.getLogger
    sys.modules.update({"vlmeval": vlmeval, "vlmeval.smp": smp, "vlmeval.smp.log": log})

    spec = importlib.util.spec_from_file_location("pinned_vlmeval_matching_util", scorer_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.can_infer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=pathlib.Path)
    args = parser.parse_args()
    can_infer = load_official_scorer(args.root.resolve())
    rows = json.load(sys.stdin)
    output = [can_infer(str(row.get("output", "")), dict(row["choices"])) or None for row in rows]
    json.dump(output, sys.stdout)


if __name__ == "__main__":
    main()
