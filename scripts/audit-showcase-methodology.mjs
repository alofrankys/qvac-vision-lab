import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const report = await readJson('reports/visionpsy-three-way-realworldqa-765.json')
const parity = await readJson('reports/visionpsy-realworldqa-vlmeval-parity.json')

const runtimeMatrix = [
  {
    providerId: 'visionpsy-patched-base',
    model: 'VisionPsy-Nano-460M Standard Q8_0',
    orchestration: 'Local HTTP llama-server managed directly by QVAC Vision Lab',
    nativeBackend: 'Patched llama.cpp MTMD on Metal',
    preprocessing: 'Standard tiled upscale',
    qvacSdk: false
  },
  {
    providerId: 'qvac-visionpsy',
    model: 'VisionPsy-Nano-460M-Flash Q8_0',
    orchestration: 'QVAC SDK 0.18.2 with a managed Bare worker',
    nativeBackend: '@qvac/llm-llamacpp 0.47.0 / llama.cpp MTMD on Metal',
    preprocessing: 'Flash native resolution / no upscale',
    qvacSdk: true
  },
  {
    providerId: 'visionpsy-patched',
    model: 'VisionPsy-Nano-460M-Flash Q4_K_M imatrix',
    orchestration: 'Local HTTP llama-server managed directly by QVAC Vision Lab',
    nativeBackend: 'Patched llama.cpp MTMD on Metal',
    preprocessing: 'Flash native resolution / no upscale',
    qvacSdk: false
  }
]

const decisions = [
  decision(1, 'Cross-benchmark aggregation', 'RESOLVED',
    'Experiment 06 now exposes and aggregates only all 765 RealWorldQA questions with one binary exact-option metric.',
    'Keep the 765-question score as the sole quality headline.',
    'The result is directly interpretable against the matching published RealWorldQA GGUF values; no mixed 1,000-image score remains.'),
  decision(2, 'Gold-answer or consensus filtering', 'NOT_APPLICABLE',
    'The removed TextVQA/VizWiz subsets were the only components selected by answer consensus. RealWorldQA is now used in full without filtering by correctness, answer, difficulty or model output.',
    'Use the full official split; do not choose between answer-based sampling schemes.',
    'No easier-subset selection bias remains in the primary score.'),
  decision(3, 'Sampling and byte-range selection', 'RESOLVED_FOR_PRIMARY_SCORE',
    'The primary result is a census of all 765 source rows. The historical 20/50/50/150/495 groups are only execution partitions whose union is the complete set.',
    'Recommended option A: retain the checksum-locked full TSV and enumerate every row. If a quick diagnostic is ever needed, sample uniformly from the complete row-ID list with a published seed. Do not use byte-window sampling.',
    'The final score has no sampling error from row selection. Quick subsets remain exploratory and must never replace the complete result.'),
  decision(4, 'VLMEvalKit scorer', 'VERIFIED_WITH_LIMIT',
    `The local RealWorldQA extractor was compared with VLMEvalKit-compatible can_infer behavior over ${parity.totalCompared ?? 2295} outputs: ${parity.totalExtractionDisagreements} extraction differences and ${parity.totalPassVerdictChanges} pass/fail changes.`,
    'Keep the audited local scorer for the interactive dashboard, pin the parity test as a release gate, and use a pinned direct VLMEvalKit run for any stronger end-to-end reproduction claim.',
    'VLMEvalKit does affect RealWorldQA answer extraction in principle, but it changes none of the current 2,295 verdicts. Direct end-to-end use would additionally test prompt construction and preprocessing.'),
  decision(5, 'Runtime/backend equivalence', 'OPEN_REPRODUCTION_GAP',
    'All three local paths ultimately execute llama.cpp-family native inference on Apple Metal, but only Flash Q8 is orchestrated by QVAC SDK. Standard Q8 and Flash Q4 use the patched llama-server directly. Quantization and model-specific preprocessing also differ.',
    'For the current post, describe this as a comparison of three pinned on-device stacks. For a model-only causal comparison, rerun the same quantization through one identical runtime where technically supported.',
    'Current accuracy remains valid per stack, while TTFT/RAM differences cannot be attributed solely to model architecture or to QVAC SDK.'),
  decision(6, 'Adaptive research sequence', 'CURRENT_RUN_EXPLORATORY_CORROBORATION',
    'The experiment grew after intermediate results were observed, even though the final score now uses the full official dataset.',
    'Keep the existing 765 run as local corroboration. Before a confirmatory claim, freeze model hashes, prompt, preprocessing, runtime versions, generation settings, scorer and analysis plan, then rerun all 765 from an empty result file.',
    'No rerun is necessary for an honest descriptive X post. A fresh preregistered run is required before calling the work a confirmatory independent reproduction.'),
  decision(7, 'Statistics', 'CORRECTED',
    'RealWorldQA produces one binary verdict per model and question, so Wilson intervals and paired exact McNemar tests are appropriate. Three pairwise tests require multiplicity control.',
    'Report absolute correct/765 and percentage for each model, Wilson 95% intervals, and exact McNemar p-values with Holm correction across the three pairs.',
    'The raw Standard-vs-Flash-Q4 p=0.0313 does not survive Holm correction; the correct family-wise verdict is no clear pairwise winner at alpha 0.05.'),
  decision(8, 'Retries and operational failures', 'FIXED_FOR_FUTURE_RUNS',
    'Historical successful records did not preserve failed attempts, so their retry history cannot be reconstructed reliably.',
    'Keep up to three retries only for transport/runtime failures, never for a valid wrong answer. Persist every attempt, retry count and full wall time; publish first-attempt completion rate separately.',
    'Long runs remain resilient without silently improving model accuracy. Future latency and reliability figures include retry cost; the existing score must be labelled as lacking attempt-level retry evidence.')
]

const audit = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  scope: 'Complete official RealWorldQA only',
  dataset: {
    questions: report.questionInventory.questions,
    uniqueImages: report.questionInventory.uniqueImageHashes,
    sourceMd5: report.suites.officialRealWorldQa.sourceMd5,
    metric: report.suites.officialRealWorldQa.scoring,
    optionCounts: report.questionInventory.optionCounts,
    answerLetters: report.questionInventory.answerLetters,
    capabilities: report.questionInventory.capabilities
  },
  results: report.providers.map(provider => ({
    providerId: provider.providerId,
    label: provider.label,
    correct: provider.real.passed,
    total: provider.real.cases,
    accuracy: provider.real.accuracy,
    publishedMatchingGgufAccuracy: provider.officialRealWorldQaAccuracy,
    deltaPercentagePoints: (provider.real.accuracy - provider.officialRealWorldQaAccuracy) * 100
  })),
  scorerParity: report.scorerParity,
  runtimeMatrix,
  methodologyComparison: [
    { dimension: 'Dataset', tether: 'Complete RealWorldQA sample set within the published VLMEvalKit evaluation', local: 'The same complete 765-row RealWorldQA set; checksum-locked source', residualGap: 'None in row coverage' },
    { dimension: 'Metric', tether: 'RealWorldQA official multiple-choice accuracy', local: 'Exact option accuracy with an audited VLMEval-compatible extractor', residualGap: 'No current verdict difference; direct end-to-end harness still not identical' },
    { dimension: 'Artifacts', tether: 'FP32 table plus separate GGUF quantization grid', local: 'Matching Standard Q8, Flash Q8 and Flash Q4 imatrix GGUF variants', residualGap: 'Compare local scores only with matching GGUF rows, not FP32 rows' },
    { dimension: 'Harness', tether: 'In-house VLMEvalKit adapter using checkpoint-resolved preprocessing and Transformers/vLLM paths', local: 'Custom Node harness using QVAC SDK for Flash Q8 and patched llama-server for the other two', residualGap: 'Prompt/runtime/preprocessing are not bit-for-bit identical' },
    { dimension: 'Inference device', tether: 'Official evaluation hardware is not established by the cited model cards', local: 'Apple Silicon Metal on this Mac', residualGap: 'Performance KPIs are local-device measurements only' },
    { dimension: 'Independence', tether: 'Vendor in-house results; related VLMEvalKit changes presented in open PRs', local: 'Independent local hardware execution but custom harness', residualGap: 'Corroboration of one benchmark, not reproduction of the full 17-benchmark table' }
  ],
  decisions,
  publicationWording: 'I ran the complete 765-question RealWorldQA set locally on the matching VisionPsy GGUF variants. Standard Q8 scored 451/765 (58.95%) versus the published 59.1%; Flash Q8 scored 432/765 (56.47%) versus 56.7%; Flash Q4 imatrix scored 421/765 (55.03%) versus 54.9%. The scorer produced zero verdict differences against the audited VLMEvalKit-compatible extraction over all 2,295 outputs. This is close local corroboration on Apple Metal, not a bit-for-bit reproduction of Tether’s full evaluation, because the local runtime and preprocessing paths are not identical.'
}

await writeFile(path.join(root, 'reports/visionpsy-methodology-audit.json'), `${JSON.stringify(audit, null, 2)}\n`)
await writeFile(path.join(root, 'reports/visionpsy-methodology-audit.md'), markdown(audit))
process.stdout.write(markdown(audit))

function decision(number, title, status, evidence, recommendation, consequence) {
  return { number, title, status, evidence, recommendation, consequence }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
}

function markdown(value) {
  const lines = [
    '# VisionPsy methodology audit · RealWorldQA-only', '',
    `Generated: ${value.generatedAt}`, '',
    '## Verdict', '',
    'Experiment 06 now has one benchmark perimeter: all 765 RealWorldQA questions, 762 unique real images and exact multiple-choice scoring. The former external, synthetic and mixed aggregates are outside the experiment and are not publication results.', '',
    '## Results against matching published GGUF rows', '',
    '| Model | Local | Published | Delta |', '|---|---:|---:|---:|'
  ]
  for (const item of value.results) lines.push(`| ${item.label} | ${item.correct}/${item.total} (${percent(item.accuracy)}) | ${percent(item.publishedMatchingGgufAccuracy)} | ${signed(item.deltaPercentagePoints)} pp |`)
  lines.push('', '## Tether methodology versus local methodology', '', '| Dimension | Tether / published method | Local method | Residual gap |', '|---|---|---|---|')
  for (const item of value.methodologyComparison) lines.push(`| ${item.dimension} | ${item.tether} | ${item.local} | ${item.residualGap} |`)
  lines.push('', '## Runtime and backend map', '', '| Model | Orchestration/runtime layer | Native inference backend | Preprocessing | QVAC SDK |', '|---|---|---|---|---|')
  for (const item of value.runtimeMatrix) lines.push(`| ${item.model} | ${item.orchestration} | ${item.nativeBackend} | ${item.preprocessing} | ${item.qvacSdk ? 'Yes' : 'No'} |`)
  lines.push('', '## Audit decisions', '')
  for (const item of value.decisions) {
    lines.push(`### ${item.number}. ${item.title} · ${item.status}`, '', item.evidence, '', `**Recommendation:** ${item.recommendation}`, '', `**Consequence:** ${item.consequence}`, '')
  }
  lines.push('## Publication wording', '', `> ${value.publicationWording}`, '', '## Primary references', '',
    '- Tether Standard model card: https://huggingface.co/qvac/VisionPsy-Nano-460M',
    '- Tether Standard GGUF table: https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs',
    '- Tether Flash model card: https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash',
    '- Tether Flash GGUF table: https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs',
    '- VLMEvalKit quickstart: https://github.com/open-compass/VLMEvalKit/blob/main/docs/en/Quickstart.md',
    '- VisionPsy VLMEvalKit adapter PR: https://github.com/open-compass/VLMEvalKit/pull/1613', '')
  return lines.join('\n')
}

function percent(value) { return `${(value * 100).toFixed(2)}%` }
function signed(value) { return `${value >= 0 ? '+' : ''}${value.toFixed(2)}` }
