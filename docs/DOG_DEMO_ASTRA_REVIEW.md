# Four-photo dog demo: blinded Astra review

Review date: 2026-09-05. This is a small illustrative review, not a benchmark or independent certification. It evaluates the exact 16 answers stored in the recorded dog replay; no VisionPsy answer was regenerated, replaced or selected based on the new score.

## Simple public interpretation

**Four personal photos, four questions, four local VisionPsy variants. Recorded answers were reviewed separately by GPT-6 Astra against a fixed rubric.** The video shows mean rubric score out of ten. RealWorldQA is a separate 765-question, binary-gold comparison; the two scores must not be combined or compared as if they measured the same thing.

| Original photo | Standard Q8 | Standard Q4 | Flash Q8 | Flash Q4 |
|---|---:|---:|---:|---:|
| 3 — Mountain companions | 9/10 | 7/10 | 10/10 | 8/10 |
| 1 — Nap on the tiled floor | 6/10 | 9/10 | 10/10 | 10/10 |
| 2 — Nap on the picnic blanket | 9/10 | 9/10 | 10/10 | 9/10 |
| 5 — Cafe companions | 10/10 | 6/10 | 6/10 | 6/10 |
| **Mean across four photos** | **8.50/10** | **7.75/10** | **9.00/10** | **8.25/10** |
| Median across four photos | 9.00/10 | 8.00/10 | 10.00/10 | 8.50/10 |

Every per-photo score is the median of three new judge sessions. All three sessions agreed on every total, so the per-photo means are identical. The final mean gives each photo equal weight. The video uses the mean, not the median: a 10/10 median would hide Flash Q8's object-identification error in the cafe photo. Fractional aggregate values come from averaging integer grades; they do not imply fine-grained measurement certainty.

## Judge and evidence

- Requested/CLI-reported model: `gpt-6-astra`, reasoning effort `high`; Codex CLI 0.153.1, authenticated with ChatGPT. This was not a direct API-key call, and the model alias is not an immutable weight identifier.
- The actual four photographs were attached to every session. Image hashes, frozen source hash, protocol, schema, anonymous inputs, mappings, component grades and original Italian judge explanations are in the [evidence JSON](../reports/visionpsy-dog-demo-astra-20260905.json).
- Each pass used a fresh session, randomized presentation order and new opaque candidate IDs, without model names, prior editorial scores or supplied reference answers. The judge was instructed to inspect the images, not browse or inspect project files. No tool calls appeared in the captured session logs.
- Two photo/question/answer pairs were duplicates across models. They were graded once per pass and mapped back identically: **14 distinct answers × 3 passes = 42 judgments**, displayed over 16 model/photo cells. These are not 48 independent observations.
- Execution headers and original output are evidence of this local workflow, not a vendor-signed attestation or an external audit. Local CLI logs are retained privately; no account metadata or private reasoning trace is published.
- VisionPsy generation was on-device; the Astra judging stage used cloud-hosted Codex. The recorded video replays both stored answers and the already-computed judge scores. It does not invoke Astra live.
- Short English captions in the video summarize the original Italian judge explanations; they are not additional judge calls or verbatim quotations. The recorded raw outputs remain authoritative.

## Frozen rubric, version 1.0

Each question asks for two factual parts. Each part receives 0–4 points: 4 correct and sufficient; 3 mostly correct with minor imprecision; 2 meaningfully partial; 1 a vague relevant fragment; 0 absent or wrong. One additional point covers absence of materially unsupported *extra* facts (no double penalty for the same error), and one covers explicit format constraints, including one sentence and any prohibition on breed names.

Total divided by ten produces a 0–1 score in steps of 0.10. Warm/playful tone is not a factual bonus; neutral natural wording is acceptable. Incorrect objects and omissions reduce the factual components. A second sentence loses only the format point unless it introduces a separate factual error. The full exact prompt in the evidence file is authoritative.

This rubric was frozen before the new judge calls, but after the answers were available to the project author. It differs from the previous editorial quarter-scale: score changes cannot be attributed exclusively to replacing the judge. The old scores are superseded, not presented as an independent calibration set.

## What drives the apparent ranking?

| Component, normalized for diagnosis only | Standard Q8 | Standard Q4 | Flash Q8 | Flash Q4 |
|---|---:|---:|---:|---:|
| Two requested factual parts | 87.50% | 81.25% | 87.50% | 81.25% |
| No unsupported extra facts | 100% | 100% | 100% | 100% |
| Explicit constraints | 50% | 25% | 100% | 75% |

**Standard and Flash tie on factual content at each quantization.** Their overall score gap comes from instruction following, not greater aggregate factual content on these four examples. These component percentages are rubric scores, not gold-label accuracy. The grounding component does not imply hallucination-free answers: incorrect requested objects were already penalized in the factual components.

- Mountain: Standard Q4 omits the right dog's coat; Flash Q4 gives a weak contrast. Standard Q8 supplies the contrast but violates the no-breed/one-sentence instructions.
- Floor: Standard Q8 says only “It is asleep,” omitting the tiled floor.
- Picnic: all variants identify the blanket and orange harness; three use two sentences.
- Cafe: only Standard Q8 identifies the leash. Standard Q4 says pet toy; both Flash answers say grooming brush. All correctly count two dogs.

## Reproduction and limits

Run `node --test test/dog-astra-review.test.mjs` to verify image hashes, exact question/answer matching, anonymized candidate mappings, arithmetic, aggregates and UI-score parity without new inference. To repeat the model judgment, extract any `passes[].input` string and use the four owner-provided images in the manifest's P1–P4 order with `codex exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox read-only -m gpt-6-astra -c 'model_reasoning_effort="high"' --output-schema schema.json -i P1.jpg -i P2.jpg -i P3.jpg -i P4.jpg -`, feeding that input on stdin in a separate working directory. `schema.json` is the evidence's `schema` field. New evaluations incur model usage and may differ over time; do not overwrite this frozen evidence.

Four owner-selected images and already-seen questions cannot support a general model ranking. Questions contain contextual cues such as “nap” and “cafe”; this is not a blind scene-discovery test. Names are hidden, but response style can still influence a judge. Three passes of one model are not three independent human evaluators. Judge agreement measures stability, not correctness; there is no independent human calibration. A model judge may misread an image or apply a subjective boundary inconsistently. No claim is made that the evaluation is objective, certified, universally reproducible or immune to criticism.
