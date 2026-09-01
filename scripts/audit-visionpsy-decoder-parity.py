#!/usr/bin/env python3
"""Compare VisionPsy's custom decoder against Transformers Llama on one long prompt."""

import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace

import torch
from PIL import Image
from safetensors import safe_open
from transformers import AutoProcessor, LlamaConfig, LlamaForCausalLM


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "data/hf-cache/hub/models--qvac--VisionPsy-Nano-460M/snapshots/a779cb695f7627c36ded60a82a8c3cc73f03fa24"
WEIGHTS = SNAPSHOT / "model.safetensors"
IMAGE = ROOT / "data/vlmeval/images/POPE/6.jpg"
PROMPT = "Is there a person in the image? Please answer yes or no.\nGive a very brief answer."


def tensor_from_output(value):
    if isinstance(value, tuple):
        return value[0]
    return value


def stats(left, right):
    left = tensor_from_output(left).float()
    right = tensor_from_output(right).float()
    delta = (left - right).abs()
    return {
        "maxAbs": float(delta.max()),
        "meanAbs": float(delta.mean()),
        "cosine": float(torch.nn.functional.cosine_similarity(
            left.reshape(1, -1), right.reshape(1, -1)
        )),
    }


def main():
    os.environ.setdefault("HF_HOME", str(ROOT / "data/hf-cache"))
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    processor = AutoProcessor.from_pretrained(
        "qvac/VisionPsy-Nano-460M", trust_remote_code=True, local_files_only=True
    )
    processed = processor(
        images=Image.open(IMAGE).convert("RGB"), text=PROMPT, return_tensors="pt"
    )
    input_ids = processed["input_ids"]

    spec = importlib.util.spec_from_file_location("visionpsy_custom_lm", SNAPSHOT / "language_model.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    cfg = SimpleNamespace(
        lm_hidden_dim=960, lm_inter_dim=2560, lm_rms_eps=1e-5,
        lm_re_base=100000, lm_max_position_embeddings=8192,
        lm_vocab_size=49218, lm_n_heads=15, lm_n_kv_heads=5,
        lm_dropout=0.0, lm_n_blocks=32, lm_attn_scaling=1.0,
        lm_use_tokens=False, lm_tie_weights=True,
    )
    custom = module.LanguageModel(cfg).eval()
    llama = LlamaForCausalLM(LlamaConfig(
        vocab_size=49218, hidden_size=960, intermediate_size=2560,
        num_hidden_layers=32, num_attention_heads=15, num_key_value_heads=5,
        max_position_embeddings=8192, rope_theta=100000,
        rms_norm_eps=1e-5, attention_dropout=0.0,
        hidden_act="silu", attention_bias=False, mlp_bias=False,
        tie_word_embeddings=True, use_cache=False,
    )).eval()

    with safe_open(str(WEIGHTS), framework="pt", device="cpu") as source:
        custom_state = custom.state_dict()
        for key in list(custom_state):
            custom_state[key] = source.get_tensor("decoder." + key)
        custom.load_state_dict(custom_state)

    llama_state = llama.state_dict()
    llama_state["model.embed_tokens.weight"] = custom_state["token_embedding.weight"]
    llama_state["model.norm.weight"] = custom_state["norm.weight"]
    llama_state["lm_head.weight"] = custom_state["head.weight"]
    for index in range(32):
        cp = f"blocks.{index}."
        rp = f"model.layers.{index}."
        llama_state[rp + "self_attn.q_proj.weight"] = custom_state[cp + "attn.q_proj.weight"]
        llama_state[rp + "self_attn.k_proj.weight"] = custom_state[cp + "attn.k_proj.weight"]
        llama_state[rp + "self_attn.v_proj.weight"] = custom_state[cp + "attn.v_proj.weight"]
        llama_state[rp + "self_attn.o_proj.weight"] = custom_state[cp + "attn.out_proj.weight"]
        gate, up = custom_state[cp + "mlp.gate_up_proj.weight"].chunk(2, dim=0)
        llama_state[rp + "mlp.gate_proj.weight"] = gate
        llama_state[rp + "mlp.up_proj.weight"] = up
        llama_state[rp + "mlp.down_proj.weight"] = custom_state[cp + "mlp.down_proj.weight"]
        llama_state[rp + "input_layernorm.weight"] = custom_state[cp + "norm1.weight"]
        llama_state[rp + "post_attention_layernorm.weight"] = custom_state[cp + "norm2.weight"]
    llama.load_state_dict(llama_state)

    custom_layers = []
    llama_layers = []
    hooks = []
    for block in custom.blocks:
        hooks.append(block.register_forward_hook(lambda _m, _i, out: custom_layers.append(tensor_from_output(out).detach())))
    for block in llama.model.layers:
        hooks.append(block.register_forward_hook(lambda _m, _i, out: llama_layers.append(tensor_from_output(out).detach())))

    with torch.inference_mode():
        token_embeddings = custom.token_embedding(input_ids)
        custom_hidden, _ = custom(token_embeddings, attention_mask=None, kv_cache=None, start_pos=0)
        custom_logits = custom.head(custom_hidden)
        llama_logits = llama(input_ids=input_ids, attention_mask=None, use_cache=False).logits
    for hook in hooks:
        hook.remove()

    def top(logits):
        values, ids = logits[0, -1].topk(8)
        return [
            {"id": int(token), "token": processor.tokenizer.decode([int(token)]), "logit": float(value)}
            for value, token in zip(values, ids)
        ]

    print(json.dumps({
        "inputTokens": int(input_ids.shape[-1]),
        "embedding": stats(custom.token_embedding(input_ids), llama.model.embed_tokens(input_ids)),
        "layers": [stats(a, b) for a, b in zip(custom_layers, llama_layers)],
        "finalLogits": stats(custom_logits[:, -1], llama_logits[:, -1]),
        "customTop": top(custom_logits),
        "llamaTop": top(llama_logits),
    }, indent=2))


if __name__ == "__main__":
    main()
