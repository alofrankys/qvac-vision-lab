#!/usr/bin/env python3
"""Read scalar/string/array metadata from a GGUF v2/v3 file without dependencies."""

import argparse
import json
import struct


FORMATS = {
    0: "B", 1: "b", 2: "H", 3: "h", 4: "I", 5: "i",
    6: "f", 7: "?", 10: "Q", 11: "q", 12: "d",
}


def unpack(handle, fmt):
    size = struct.calcsize("<" + fmt)
    return struct.unpack("<" + fmt, handle.read(size))[0]


def read_string(handle):
    return handle.read(unpack(handle, "Q")).decode("utf-8")


def read_value(handle, value_type):
    if value_type == 8:
        return read_string(handle)
    if value_type == 9:
        element_type = unpack(handle, "I")
        count = unpack(handle, "Q")
        return [read_value(handle, element_type) for _ in range(count)]
    return unpack(handle, FORMATS[value_type])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--contains", action="append", default=[])
    parser.add_argument("--tensors", action="store_true")
    args = parser.parse_args()
    with open(args.path, "rb") as handle:
        if handle.read(4) != b"GGUF":
            raise ValueError("not a GGUF file")
        version = unpack(handle, "I")
        tensor_count = unpack(handle, "Q")
        metadata_count = unpack(handle, "Q")
        metadata = {}
        for _ in range(metadata_count):
            key = read_string(handle)
            value = read_value(handle, unpack(handle, "I"))
            if not args.contains or any(part.lower() in key.lower() for part in args.contains):
                metadata[key] = value
        tensors = []
        if args.tensors:
            for _ in range(tensor_count):
                name = read_string(handle)
                dimensions = unpack(handle, "I")
                shape = [unpack(handle, "Q") for _ in range(dimensions)]
                ggml_type = unpack(handle, "I")
                offset = unpack(handle, "Q")
                if not args.contains or any(part.lower() in name.lower() for part in args.contains):
                    tensors.append({"name": name, "shape": shape, "type": ggml_type, "offset": offset})
    print(json.dumps({
        "version": version,
        "tensorCount": tensor_count,
        "metadataCount": metadata_count,
        "metadata": metadata,
        "tensors": tensors,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
