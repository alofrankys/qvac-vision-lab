#!/usr/bin/env python3

import argparse
import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROTOCOL_PATH = ROOT / 'config' / 'qvac-official-replication.json'


def main():
    parser = argparse.ArgumentParser(description='Download and verify the exact VLMEvalKit datasets in a QVAC suite.')
    parser.add_argument('--suite', default='headline')
    args = parser.parse_args()

    protocol = json.loads(PROTOCOL_PATH.read_text())
    if args.suite not in protocol['executionSuites']:
        raise SystemExit(f'Unknown suite: {args.suite}')

    # Import only after validating arguments: VLMEvalKit has a deliberately
    # broad dependency surface and can take several seconds to initialize.
    from vlmeval.dataset import build_dataset

    selected = protocol['executionSuites'][args.suite]
    results = []
    for position, name in enumerate(selected, 1):
        print(json.dumps({'stage': 'dataset_prepare_start', 'dataset': name, 'position': position, 'total': len(selected)}), flush=True)
        dataset = build_dataset(name)
        rows = len(dataset.data)
        item = {'dataset': name, 'rows': rows, 'type': getattr(dataset, 'TYPE', None)}
        results.append(item)
        print(json.dumps({'stage': 'dataset_prepare_complete', **item, 'position': position, 'total': len(selected)}), flush=True)

    print(json.dumps({'complete': True, 'suite': args.suite, 'datasets': results}, indent=2), flush=True)


if __name__ == '__main__':
    main()
