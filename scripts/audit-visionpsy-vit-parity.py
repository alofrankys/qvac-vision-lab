#!/usr/bin/env python3
"""Compare VisionPsy's custom ViT against Transformers SigLIP layer by layer."""

import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace

import torch
from PIL import Image
from safetensors import safe_open
from transformers import AutoProcessor, SiglipVisionConfig, SiglipVisionModel


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "data/hf-cache/hub/models--qvac--VisionPsy-Nano-460M/snapshots/a779cb695f7627c36ded60a82a8c3cc73f03fa24"
WEIGHTS = SNAPSHOT / "model.safetensors"
IMAGE = ROOT / "data/vlmeval/images/POPE/6.jpg"


def stats(left, right):
    delta = (left.float() - right.float()).abs()
    return {
        "shape": list(left.shape),
        "maxAbs": float(delta.max()),
        "meanAbs": float(delta.mean()),
        "cosine": float(torch.nn.functional.cosine_similarity(
            left.float().reshape(1, -1), right.float().reshape(1, -1)
        )),
    }


def main():
    os.environ.setdefault("HF_HOME", str(ROOT / "data/hf-cache"))
    os.environ.setdefault("HF_HUB_OFFLINE", "1")

    spec = importlib.util.spec_from_file_location("visionpsy_custom_vit", SNAPSHOT / "vision_transformer.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    cfg = SimpleNamespace(
        vit_img_size=512, vit_patch_size=16, vit_cls_flag=False,
        vit_hidden_dim=768, vit_inter_dim=3072, vit_n_heads=12,
        vit_dropout=0.0, vit_n_blocks=12, vit_ln_eps=1e-6,
    )
    custom = module.ViT(cfg).eval()

    reference_cfg = SiglipVisionConfig(
        hidden_size=768, intermediate_size=3072, num_hidden_layers=12,
        num_attention_heads=12, image_size=512, patch_size=16,
        layer_norm_eps=1e-6, attention_dropout=0.0,
        hidden_act="gelu_pytorch_tanh", vision_use_head=False,
    )
    reference = SiglipVisionModel(reference_cfg).eval()

    with safe_open(str(WEIGHTS), framework="pt", device="cpu") as source:
        custom_state = custom.state_dict()
        for key in list(custom_state):
            custom_state[key] = source.get_tensor("vision_encoder." + key)
        custom.load_state_dict(custom_state)

    reference_state = reference.state_dict()
    reference_state["embeddings.patch_embedding.weight"] = custom_state["patch_embedding.conv.weight"]
    reference_state["embeddings.patch_embedding.bias"] = custom_state["patch_embedding.conv.bias"]
    reference_state["embeddings.position_embedding.weight"] = custom_state["patch_embedding.position_embedding"].squeeze(0)
    reference_state["post_layernorm.weight"] = custom_state["layer_norm.weight"]
    reference_state["post_layernorm.bias"] = custom_state["layer_norm.bias"]
    for index in range(12):
        cp = f"blocks.{index}."
        rp = f"encoder.layers.{index}."
        for custom_name, reference_name in [
            ("ln1.weight", "layer_norm1.weight"), ("ln1.bias", "layer_norm1.bias"),
            ("ln2.weight", "layer_norm2.weight"), ("ln2.bias", "layer_norm2.bias"),
            ("attn.out_proj.weight", "self_attn.out_proj.weight"),
            ("attn.out_proj.bias", "self_attn.out_proj.bias"),
            ("mlp.fc1.weight", "mlp.fc1.weight"), ("mlp.fc1.bias", "mlp.fc1.bias"),
            ("mlp.fc2.weight", "mlp.fc2.weight"), ("mlp.fc2.bias", "mlp.fc2.bias"),
        ]:
            reference_state[rp + reference_name] = custom_state[cp + custom_name]
        qkv_weight = custom_state[cp + "attn.qkv_proj.weight"]
        qkv_bias = custom_state[cp + "attn.qkv_proj.bias"]
        for offset, name in enumerate(("q_proj", "k_proj", "v_proj")):
            reference_state[rp + f"self_attn.{name}.weight"] = qkv_weight[offset * 768:(offset + 1) * 768]
            reference_state[rp + f"self_attn.{name}.bias"] = qkv_bias[offset * 768:(offset + 1) * 768]
    reference.load_state_dict(reference_state)

    processor = AutoProcessor.from_pretrained(
        "qvac/VisionPsy-Nano-460M", trust_remote_code=True, local_files_only=True
    )
    processed = processor(
        images=Image.open(IMAGE).convert("RGB"),
        text="Is there a person in the image? Please answer yes or no.",
        return_tensors="pt",
    )
    images = processed["images"]
    if isinstance(images, list):
        images = torch.cat(images, dim=0)
    tile = images[:1]

    custom_layers = []
    reference_layers = []
    hooks = []
    for block in custom.blocks:
        hooks.append(block.register_forward_hook(lambda _m, _i, out: custom_layers.append(out.detach())))
    for block in reference.encoder.layers:
        hooks.append(block.register_forward_hook(lambda _m, _i, out: reference_layers.append(out.detach())))
    with torch.inference_mode():
        custom_embedding = custom.patch_embedding(tile)
        reference_embedding = reference.embeddings(tile)
        custom_output = custom(tile)
        reference_output = reference(tile).last_hidden_state
    for hook in hooks:
        hook.remove()

    print(json.dumps({
        "image": str(IMAGE),
        "tileRange": [float(tile.min()), float(tile.max())],
        "embedding": stats(custom_embedding, reference_embedding),
        "layers": [stats(a, b) for a, b in zip(custom_layers, reference_layers)],
        "final": stats(custom_output, reference_output),
    }, indent=2))


if __name__ == "__main__":
    main()
