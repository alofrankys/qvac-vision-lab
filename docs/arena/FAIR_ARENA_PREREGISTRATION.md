# Fair Real-World VQA v1 — preregistration

Status: DRAFT, NOT RUN. Version: `1.0.0-draft` until the user finishes and locks the question bank.

Primary roster: VisionPsy-Nano-460M Base, LFM2.5-VL-450M, SmolVLM2-500M. Precision: Q8_0 model and projector. Hardware: the same local Apple M4 system. Backend: Metal, sequential execution, rotating order.

The final set must contain at least 30 user-authored, real-image questions with coverage across object recognition, color/detail, spatial relation, physical context, visual text, numeric value, UI, document, chart/table and other real-world cases. Images and questions must be selected before results are visible. The lock records a version and SHA-256 over question IDs, exact text, category, photo ID and dataset ID.

Output budget is identical within every round. Answers remain blind until every answer receives a manual verdict or the reviewer deliberately performs an early reveal, permanently marking the round non-blind.

Primary ranking requires at least 30 shared reviewed questions and may not be mostly AI-reviewed. Technical smoke and soak prompts are excluded from the dataset and quality reporting.
