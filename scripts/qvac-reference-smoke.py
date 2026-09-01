import argparse
import json
import time

from vlmeval.config import supported_VLM
from vlmeval.dataset import build_dataset


def main():
    parser = argparse.ArgumentParser(description="One-case smoke test through the QVAC-patched VLMEvalKit adapter")
    parser.add_argument("--model", default="VisionPsy-Nano-460M")
    parser.add_argument("--image")
    parser.add_argument("--dataset", default="ScienceQA_TEST")
    parser.add_argument("--prompt")
    parser.add_argument("--index", type=int, help="Zero-based row from the real VLMEvalKit dataset")
    parser.add_argument("--max-new-tokens", type=int, default=32)
    args = parser.parse_args()

    if args.model not in supported_VLM:
        raise SystemExit(f"Unknown model: {args.model}")

    started = time.perf_counter()
    model = supported_VLM[args.model](max_new_tokens=args.max_new_tokens)
    loaded = time.perf_counter()
    gold = None
    source_index = None
    if args.index is not None:
        dataset = build_dataset(args.dataset)
        if args.index < 0 or args.index >= len(dataset):
            raise SystemExit(f"Index {args.index} outside dataset size {len(dataset)}")
        row = dataset.data.iloc[args.index]
        model.set_dump_image(dataset.dump_image)
        message = dataset.build_prompt(row)
        prediction = model.generate(message, dataset=args.dataset)
        gold = row.get("answer")
        source_index = row.get("index")
    else:
        if not args.image or not args.prompt:
            raise SystemExit("Provide --index for a real dataset row, or both --image and --prompt")
        prediction = model.generate(
            [
                {"type": "image", "value": args.image},
                {"type": "text", "value": args.prompt},
            ],
            dataset=args.dataset,
        )
    finished = time.perf_counter()
    print(json.dumps({
        "model": args.model,
        "dataset": args.dataset,
        "datasetRow": args.index,
        "sourceIndex": source_index,
        "gold": gold,
        "prediction": prediction,
        "loadSeconds": round(loaded - started, 3),
        "inferenceSeconds": round(finished - loaded, 3),
    }, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
