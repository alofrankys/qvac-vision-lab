# Competitor discovery — 2026-08-15

The search checked official organization pages and current model cards for QVAC, Liquid AI, Hugging Face TB, Apple, OpenGVLab and Qwen. A candidate had to be a current, locally runnable image VLM, support the same real-image/question task, and remain near 400–550M total multimodal parameters.

LFM2.5-VL-450M is the current Liquid peer and supersedes LFM2-VL-450M. Its official card identifies a 350M language backbone and 86M SigLIP2 encoder. Its official GGUF repository provides matching Q8_0 model and projector artifacts. It is integrated.

SmolVLM2-500M-Video-Instruct remains the current official approximately-500M SmolVLM checkpoint and explicitly supports still-image VQA. VisionPsy-Nano-460M Base remains the current QVAC base checkpoint; Flash is not primary.

No current same-class peer is missing. FastVLM-0.5B and the smallest InternVL2.5 are documented out-of-class; current Qwen VLMs are much larger. Re-audit before any later benchmark version.
