# Current model roster audit

Audit date: 2026-08-15. Scope: locally runnable, general-purpose image VLMs in the approximately 400–550M total-parameter class. Official model cards, repositories and release metadata were used; no benchmark scores were used to select the roster.

| Provider | Current official checkpoint | Parameter accounting | Status |
|---|---|---:|---|
| VisionPsy Base | `qvac/VisionPsy-Nano-460M-GGUFs@4138c5b…` | 460M published family size | PRIMARY_PEER |
| LFM2.5-VL | `LiquidAI/LFM2.5-VL-450M-GGUF@6f15859…` | 350M language backbone + 86M SigLIP2 encoder ≈436M | PRIMARY_PEER |
| SmolVLM2 | `ggml-org/SmolVLM2-500M-Video-Instruct-GGUF@ccd7aae…`; upstream `HuggingFaceTB@7b375e1…` | 500M published family size | PRIMARY_PEER |

Official evidence: [VisionPsy native](https://huggingface.co/qvac/VisionPsy-Nano-460M), [VisionPsy GGUF](https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs), [LFM2.5-VL-450M](https://huggingface.co/LiquidAI/LFM2.5-VL-450M), [LFM2.5 official GGUF](https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF), [SmolVLM2-500M](https://huggingface.co/HuggingFaceTB/SmolVLM2-500M-Video-Instruct).

VisionPsy Flash is secondary speed/control only. FastVLM-0.5B (explicitly excluded and larger in total multimodal form), the smallest InternVL2.5 (roughly 300M vision + 500M language), current Qwen VLMs and the explicitly excluded nanoVLM are not primary peers. No newly obvious current same-class fourth peer was found.
