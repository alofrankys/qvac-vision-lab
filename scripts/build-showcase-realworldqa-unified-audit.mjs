import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHOWCASE_CASES } from '../src/showcase/index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportsDir = path.join(root, 'reports')
const inputName = process.env.QVAC_AUDIT_INPUT || 'visionpsy-three-way-realworldqa-765-qvac-sdk-unified-0182.json'
const parityName = process.env.QVAC_AUDIT_PARITY || 'visionpsy-realworldqa-vlmeval-parity-qvac-sdk-unified-0182.json'
const outputStem = process.env.QVAC_AUDIT_OUTPUT_STEM || 'visionpsy-realworldqa-765-qvac-sdk-unified-audit'
const run = JSON.parse(await readFile(path.join(reportsDir, inputName), 'utf8'))
const scorerParity = JSON.parse(await readFile(path.join(reportsDir, parityName), 'utf8'))
const historical = await optionalJson(path.join(reportsDir, 'visionpsy-three-way-realworldqa-765.json'))
const promptAblation = await optionalJson(path.join(reportsDir, 'visionpsy-realworldqa-prompt-ablation-120-qvac-sdk-unified.json'))
const cases = SHOWCASE_CASES.filter(item => Number.isInteger(item.sourceIndex))
const caseLookup = new Map(cases.map(item => [item.id, item]))
const providerIds = ['qvac-visionpsy-standard-q8', 'qvac-visionpsy', 'qvac-visionpsy-flash-q4']
const official = Object.freeze({
  'qvac-visionpsy-standard-q8': { matchingGguf: 0.591, fp32Table: 0.597, family: 'VisionPsy-Nano-460M' },
  'qvac-visionpsy': { matchingGguf: 0.567, fp32Table: 0.567, family: 'VisionPsy-Nano-460M-Flash' },
  'qvac-visionpsy-flash-q4': { matchingGguf: 0.549, fp32Table: 0.567, family: 'VisionPsy-Nano-460M-Flash' }
})

assert(run.dataset?.caseCount === 765, `Expected 765 cases, found ${run.dataset?.caseCount}`)
assert(run.results?.length === 2295, `Expected 2,295 results, found ${run.results?.length}`)
assert(new Set(run.results.map(item => `${item.caseId}:${item.providerId}`)).size === 2295, 'Duplicate or missing case/provider rows')
assert(providerIds.every(id => run.summaries[id]?.cases === 765), 'One or more provider summaries are incomplete')

const providers = providerIds.map(providerId => buildProvider(providerId)).sort((a, b) => b.real.accuracy - a.real.accuracy)
const pairwise = holmAdjust(buildPairwise())
const minimumAdjustedP = Math.min(...pairwise.map(item => item.holmAdjustedP))
const agreement = buildAgreement()
const questionInventory = buildInventory()
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  title: 'VisionPsy · RealWorldQA 765 · unified QVAC audit',
  statisticalVerdict: minimumAdjustedP < 0.05 ? 'SIGNIFICANT_DIFFERENCE_AFTER_HOLM' : 'NO_CLEAR_WINNER_AFTER_HOLM',
  realPairwise: pairwise,
  verdict: {
    ranking: providers.map(item => item.providerId),
    statisticalVerdict: minimumAdjustedP < 0.05 ? 'SIGNIFICANT_DIFFERENCE_AFTER_HOLM' : 'NO_CLEAR_WINNER_AFTER_HOLM',
    summary: 'Standard Q8 finishes first by six answers, but the paired differences are not statistically significant. Treat the ordering as a local corroboration of the official direction, not proof that Standard is categorically better.',
    qualityConclusion: 'The three variants are statistically tied on this local run; Standard trades substantially higher TTFT for a small, uncertain quality edge.',
    publicationSafeClaim: 'On the complete 765-question RealWorldQA set, using the same local QVAC SDK/backend and exact option scoring, Standard Q8 scored 57.3% and both Flash variants 56.5%. Standard ranked first, but paired tests found no significant winner.'
  },
  methodology: {
    dataset: 'RealWorldQA',
    questions: 765,
    uniqueRealImages: questionInventory.uniqueImageHashes,
    sourceMd5: run.dataset.sourceMd5,
    scoring: 'Exact multiple-choice option accuracy; one point per question; no cross-suite aggregation.',
    prompt: run.dataset.prompt,
    providerOrder: run.dataset.orderPolicy,
    warmup: run.dataset.warmupPolicy,
    runtime: '@qvac/sdk 0.18.2',
    backend: '@qvac/llm-llamacpp 0.47.0 · qvac-fabric-llm.cpp · Metal GPU',
    sameRuntimeAndBackend: true,
    modelSpecificPreprocessing: {
      'qvac-visionpsy-standard-q8': 'official-standard-tiled-upscale',
      'qvac-visionpsy': 'native-resolution-no-upscale',
      'qvac-visionpsy-flash-q4': 'native-resolution-no-upscale'
    },
    scorerParity: {
      implementation: 'VLMEvalKit-compatible deterministic can_infer audit',
      extractionDifferences: scorerParity.totalExtractionDisagreements,
      passVerdictChanges: scorerParity.totalPassVerdictChanges
    },
    officialDifference: 'Tether reports a single VLMEvalKit harness and official benchmark metrics. This run matches the public dataset, checksum, option scoring, model quantizations and QVAC-native serving stack, but does not establish bit-for-bit parity of VLMEvalKit version, generation parameters, prompt template, image decoder/resize path, or hardware.'
  },
  officialReferences: {
    standardGguf: 'https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs',
    flashGguf: 'https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs',
    researchRepository: 'https://github.com/tether-ai-research/qvac-visionpsy-nano',
    announcement: 'https://qvac.tether.io/blog/visionpsy-nano-state-of-the-art-vision-ai-in-its-weight-class-small-enough-to-run-on-your-phone/'
  },
  officialWeaknesses: [
    observedWeakness('Misread prices and licence plates', 'Not directly measurable: RealWorldQA has no reliable label isolating price/plate OCR.', 'NOT_TESTED'),
    observedWeakness('Correct chart reading but incorrect aggregation', 'Not directly measurable in this scene-heavy RealWorldQA slice.', 'NOT_TESTED'),
    observedWeakness('Left/right confusion', 'Observed directionally: only 3 explicitly labelled left/right cases; Standard passed 1 and each Flash passed 2. The sample is too small for a conclusion.', 'OBSERVED_BUT_UNDERPOWERED'),
    observedWeakness('Degenerate repetition loops', 'Not observable under one-letter constrained decoding; all 2,295 answers were parseable.', 'MASKED_BY_PROTOCOL'),
    observedWeakness('Flash sensitivity on high-resolution OCR', 'Not isolated by RealWorldQA capability labels; requires OCRBench/DocVQA/InfoVQA or a dedicated high-resolution OCR slice.', 'NOT_TESTED'),
    observedWeakness('Quality degradation at lower quantization', 'Not visible in aggregate here: Flash Q8 and Flash Q4 both scored 432/765, but each uniquely won 35 cases, so equal totals hide different errors.', 'NOT_OBSERVED_IN_AGGREGATE')
  ],
  promptAblation: promptAblation ? {
    cases: promptAblation.selection.cases,
    uniqueImages: promptAblation.selection.uniqueImages,
    decision: 'KEEP_CURRENT_765_NO_FULL_RERUN',
    conclusion: 'The VLMEvalKit prompt changes individual answers but produces no significant aggregate improvement on the controlled 120-case sample.',
    providers: Object.fromEntries(Object.entries(promptAblation.providers).map(([providerId, item]) => [providerId, {
      current: item.current,
      vlmeval: item.vlmeval,
      deltaAnswers: item.deltaAnswers,
      gained: item.gained,
      lost: item.lost,
      exactMcNemarP: item.exactMcNemarP
    }]))
  } : null,
  criticalities: [
    criticality(1, 'Prompt and generation parity are not bit-for-bit proven', 'High', 'Small models can flip answers with formatting, option punctuation, image/text ordering, stop tokens and decoding settings.', 'Freeze and publish the exact local prompt/runtime configuration.', 'Run an A/B parity replication using the pinned upstream VLMEvalKit prompt and generation config.', 'B', 'Without this, compare direction and distance cautiously; do not call the run an exact reproduction.'),
    criticality(2, 'Preprocessing differs intentionally between Standard and Flash', 'High', 'Standard consumes tiled/upscaled views while Flash consumes the native view; this is part of the model design but prevents attributing every difference to weights alone.', 'Keep official per-model preprocessing for product-realistic comparison.', 'Add a preprocessing ablation while retaining the official run as primary.', 'A+B', 'Official preprocessing is the fair headline; the ablation explains whether tiling helps or hurts particular cases.'),
    criticality(3, 'RealWorldQA is compositionally imbalanced', 'High', 'Counting, spatial relation and binary reasoning contribute 518/765 questions, while several named capabilities have 1–3 cases.', 'Report only the overall official metric.', 'Report overall plus category denominators and suppress strong claims for tiny groups.', 'B', 'Category percentages without denominators would look precise but be misleading.'),
    criticality(4, 'A single benchmark cannot validate all advertised capabilities', 'High', 'OCR, documents, charts, hallucination, instruction following and open-ended reasoning are weakly represented or absent.', 'Keep the claim strictly scoped to RealWorldQA.', 'Add official OCRBench, ChartQA, POPE and MM-IFEval replications later.', 'A now; B next', 'The X post must not generalize this score to overall VisionPsy quality.'),
    criticality(5, 'Exact one-letter scoring masks answer quality', 'Medium', 'It measures option selection, not explanations, calibration, hallucination or repetition.', 'Use exact scoring because that is the benchmark metric.', 'Add a separate open-answer qualitative audit with a frozen rubric.', 'A for benchmark; B as separate evidence', 'Do not mix qualitative grades into the official accuracy denominator.'),
    criticality(6, 'The score gaps are statistically weak', 'High', 'Standard leads each Flash by 6/765, while paired exact McNemar p-values are about 0.70.', 'Publish the raw ranking only.', 'Publish counts, confidence intervals and paired tests together.', 'B', 'The defensible conclusion is “no clear local winner”, despite the rank order.'),
    criticality(7, 'System resource KPIs are not model-isolated', 'Medium', 'macOS GPU counters are system-wide and unified memory/process RSS does not fully represent model footprint.', 'Show them as live operational telemetry.', 'Label their scope and avoid cross-machine claims; use isolated device profiling for publication-grade memory data.', 'B', 'Latency is reliable for this machine/run; GPU/RAM comparisons need narrower claims.'),
    criticality(8, 'Equal aggregate scores can hide different failure sets', 'Medium', 'Flash Q8 and Q4 tie overall but disagree on 70 questions.', 'Rank by total accuracy only.', 'Publish paired disagreement counts and inspect recurrent clusters.', 'B', 'The Q4 result does not prove quantization is lossless on individual cases.'),
    criticality(9, 'Official-number provenance changes with precision and table revision', 'Medium', 'FP32/model-card headlines and matching GGUF rows are not interchangeable.', 'Compare against the family headline.', 'Compare each local file only against its matching GGUF column and record source URLs/date.', 'B', 'This avoids claiming a gain or loss against the wrong precision.'),
    criticality(10, 'No repeated-seed variance estimate', 'Medium', 'A deterministic run reveals paired case differences but not sensitivity to stochastic decoding or implementation nondeterminism.', 'Use temperature-zero once.', 'Repeat a stratified subset and hash outputs/configuration.', 'A for this exact benchmark; B for robustness audit', 'One deterministic run is valid for the fixed protocol, not a universal variance estimate.'),
    criticality(11, 'Execution order is balanced but deterministically tied to case order', 'Medium', 'Each provider runs first, second and third exactly 255 times, but cyclic assignment can correlate with dataset ordering and case difficulty.', 'Keep cyclic rotation and report it.', 'Shuffle cases with a published seed, then apply a balanced Latin-square provider order.', 'B for the next replication', 'This run controls unequal position counts, but cannot cleanly estimate a causal cache/order effect from the position subsets.')
  ],
  questionInventory,
  agreement,
  pairwise,
  providers,
  migrationComparison: buildMigrationComparison(historical),
  artifacts: {
    rawRun: inputName,
    scorerParity: parityName,
    checkpoint: '.visionpsy-three-way-realworldqa-765-qvac-sdk-unified-0182.checkpoint.ndjson'
  }
}

const jsonPath = path.join(reportsDir, `${outputStem}.json`)
const markdownPath = path.join(reportsDir, `${outputStem}.md`)
const publicPath = path.join(root, 'public', 'showcase', 'visionpsy-three-way-realworldqa-765.json')
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
await writeFile(markdownPath, markdown(report))
await writeFile(publicPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(markdown(report))

function buildProvider(providerId) {
  const rows = run.results.filter(item => item.providerId === providerId)
  const summary = run.summaries[providerId]
  const reference = official[providerId]
  const real = { passed: summary.passed, failed: summary.failed, cases: summary.cases, accuracy: summary.accuracy, interval: [summary.wilson95.low * 100, summary.wilson95.high * 100] }
  return {
    providerId,
    label: summary.label,
    family: reference.family,
    real,
    officialRealWorldQaAccuracy: reference.matchingGguf,
    officialFp32RealWorldQaAccuracy: reference.fp32Table,
    deviationFromOfficial: real.accuracy - reference.matchingGguf,
    officialRemainder: summarizeRows(rows.filter(item => item.caseIndex >= 270)),
    priorReal: summarizeRows(rows.filter(item => item.caseIndex < 270)),
    performance: {
      ttftMs: summary.ttftMs,
      latencyMs: summary.latencyMs,
      tokensPerSecond: summary.tokensPerSecond,
      promptTokens: summary.promptTokens,
      processRssPeakBytes: summary.processRssPeakBytes,
      processCpuPeakPercent: summary.processCpuPeakPercent,
      gpuUtilizationPeakPercent: summary.gpuUtilizationPeakPercent
    },
    errorAnalysis: {
      capabilityAccuracy: groupSummary(rows, item => item.capability || 'Unknown'),
      expectedLetterAccuracy: groupSummary(rows, item => item.expectedLetter || 'Unknown'),
      executionPositionAccuracy: groupSummary(rows, item => String(item.orderIndex + 1)),
      predictionBias: countBy(rows, item => item.evaluation?.predictedLetter || 'UNPARSEABLE'),
      failureTypes: {
        wrongOption: rows.filter(item => item.evaluation?.status !== 'PASS' && /^[A-D]$/.test(item.evaluation?.predictedLetter || '')).length,
        unparseable: rows.filter(item => !/^[A-D]$/.test(item.evaluation?.predictedLetter || '')).length
      }
    }
  }
}

function buildInventory() {
  return {
    questions: cases.length,
    uniqueImageHashes: new Set(cases.map(item => item.imageSha256).filter(Boolean)).size,
    answerLetters: countBy(cases, item => item.expectedLetter),
    optionCounts: countBy(cases, item => Object.keys(item.options || {}).length),
    capabilities: countBy(cases, item => item.capability)
  }
}

function buildAgreement() {
  let allCorrect = 0
  let allWrong = 0
  let exactlyOneCorrect = 0
  let exactlyTwoCorrect = 0
  for (const item of cases) {
    const correct = providerIds.filter(id => rowFor(item.id, id)?.evaluation?.status === 'PASS').length
    if (correct === 3) allCorrect += 1
    else if (correct === 2) exactlyTwoCorrect += 1
    else if (correct === 1) exactlyOneCorrect += 1
    else allWrong += 1
  }
  return { allCorrect, allWrong, exactlyOneCorrect, exactlyTwoCorrect }
}

function buildPairwise() {
  const pairs = []
  for (let leftIndex = 0; leftIndex < providerIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < providerIds.length; rightIndex += 1) {
      const leftId = providerIds[leftIndex]
      const rightId = providerIds[rightIndex]
      let leftOnly = 0
      let rightOnly = 0
      const disagreements = []
      for (const item of cases) {
        const left = rowFor(item.id, leftId)
        const right = rowFor(item.id, rightId)
        const leftPass = left?.evaluation?.status === 'PASS'
        const rightPass = right?.evaluation?.status === 'PASS'
        if (leftPass && !rightPass) leftOnly += 1
        if (!leftPass && rightPass) rightOnly += 1
        if (leftPass !== rightPass && disagreements.length < 30) disagreements.push({ caseId: item.id, sourceIndex: item.sourceIndex, capability: item.capability, leftPass, rightPass, expected: item.expectedLetter, leftPrediction: left?.evaluation?.predictedLetter, rightPrediction: right?.evaluation?.predictedLetter })
      }
      pairs.push({ leftId, rightId, leftLabel: run.summaries[leftId].label, rightLabel: run.summaries[rightId].label, leftOnly, rightOnly, exactMcNemarP: exactMcnemar(leftOnly, rightOnly), disagreementExamples: disagreements })
    }
  }
  return pairs
}

function buildMigrationComparison(oldReport) {
  if (!oldReport?.providers) return null
  const oldByBadge = new Map(oldReport.providers.map(item => [badge(item.providerId), item]))
  return providers.map(item => {
    const old = oldByBadge.get(badge(item.providerId))
    return old ? { providerId: item.providerId, previousMixedRuntimePassed: old.real.passed, unifiedQvacPassed: item.real.passed, deltaAnswers: item.real.passed - old.real.passed } : null
  }).filter(Boolean)
}

function markdown(audit) {
  const lines = ['# VisionPsy · RealWorldQA 765 · unified QVAC audit', '', `Generated: ${audit.generatedAt}`, '', audit.verdict.summary, '', '| Rank | Model | Local | Official matching GGUF | Delta | Wilson 95% | Mean TTFT | Mean latency |', '|---:|---|---:|---:|---:|---:|---:|---:|']
  audit.providers.forEach((provider, index) => lines.push(`| ${index + 1} | ${provider.label} | ${cell(provider.real)} | ${percent(provider.officialRealWorldQaAccuracy)} | ${signedPoints(provider.deviationFromOfficial)} | ${provider.real.interval.map(value => `${value.toFixed(1)}%`).join('–')} | ${duration(provider.performance.ttftMs.mean)} | ${duration(provider.performance.latencyMs.mean)} |`))
  lines.push('', `Statistical verdict: **${audit.verdict.statisticalVerdict.replaceAll('_', ' ')}**.`, '', 'Paired exact McNemar tests (Holm-adjusted):', '')
  for (const pair of audit.pairwise) lines.push(`- ${pair.leftLabel} vs ${pair.rightLabel}: unique wins ${pair.leftOnly}–${pair.rightOnly}; raw p=${pair.exactMcNemarP.toFixed(4)}; Holm p=${pair.holmAdjustedP.toFixed(4)}.`)
  lines.push('', `Agreement: all correct ${audit.agreement.allCorrect}; all wrong ${audit.agreement.allWrong}; exactly one correct ${audit.agreement.exactlyOneCorrect}; exactly two correct ${audit.agreement.exactlyTwoCorrect}.`, '', '## Methodology versus official', '', `- Same public scope: ${audit.methodology.questions} questions, ${audit.methodology.uniqueRealImages} unique real images, source MD5 \`${audit.methodology.sourceMd5}\`.`, `- Same native stack across local variants: ${audit.methodology.runtime}; ${audit.methodology.backend}.`, `- Scorer audit: ${audit.methodology.scorerParity.extractionDifferences} extraction differences and ${audit.methodology.scorerParity.passVerdictChanges} pass/fail changes.`, `- Remaining caveat: ${audit.methodology.officialDifference}`, '', '## Audit criticalities', '')
  for (const item of audit.criticalities) lines.push(`${item.id}. **${item.title} (${item.severity})** — ${item.consequence} Recommended: ${item.recommended}.`)
  lines.push('', '## Publication-safe claim', '', audit.verdict.publicationSafeClaim, '')
  return lines.join('\n')
}

function observedWeakness(claim, localFinding, status) { return { claim, localFinding, status } }
function criticality(id, title, severity, risk, solutionA, solutionB, recommended, consequence) { return { id, title, severity, risk, solutionA, solutionB, recommended, consequence } }
function summarizeRows(rows) { const passed = rows.filter(item => item.evaluation?.status === 'PASS').length; return { passed, failed: rows.length - passed, cases: rows.length, accuracy: passed / rows.length } }
function groupSummary(rows, group) { const groups = new Map(); for (const row of rows) { const key = String(group(row)); const value = groups.get(key) || { passed: 0, cases: 0 }; value.cases += 1; if (row.evaluation?.status === 'PASS') value.passed += 1; groups.set(key, value) } return Object.fromEntries([...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, { ...value, failed: value.cases - value.passed, accuracy: value.passed / value.cases }])) }
function countBy(rows, group) { const counts = {}; for (const row of rows) { const key = String(group(row)); counts[key] = (counts[key] || 0) + 1 } return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) }
function rowFor(caseId, providerId) { return run.results.find(item => item.caseId === caseId && item.providerId === providerId) }
function exactMcnemar(leftOnly, rightOnly) { const total = leftOnly + rightOnly; if (!total) return 1; let probability = 0; for (let successes = 0; successes <= Math.min(leftOnly, rightOnly); successes += 1) probability += choose(total, successes) * (0.5 ** total); return Math.min(1, probability * 2) }
function holmAdjust(items) { const ranked = items.map((item, index) => ({ item, index })).sort((a, b) => a.item.exactMcNemarP - b.item.exactMcNemarP); let previous = 0; const adjusted = Array(items.length); ranked.forEach((entry, rank) => { previous = Math.max(previous, Math.min(1, entry.item.exactMcNemarP * (items.length - rank))); adjusted[entry.index] = { ...entry.item, holmAdjustedP: previous } }); return adjusted }
function choose(total, selected) { let value = 1; for (let index = 1; index <= selected; index += 1) value = value * (total - selected + index) / index; return value }
function badge(providerId) { if (providerId.includes('standard') || providerId === 'visionpsy-patched-base') return 'standard'; if (providerId.includes('flash-q4') || providerId === 'visionpsy-patched') return 'flash-q4'; return 'flash-q8' }
function cell(item) { return `${item.passed}/${item.cases} (${percent(item.accuracy)})` }
function percent(value) { return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—' }
function signedPoints(value) { return Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)} pp` : '—' }
function duration(value) { return Number.isFinite(value) ? `${Math.round(value)} ms` : '—' }
function assert(condition, message) { if (!condition) throw new Error(message) }
async function optionalJson(filename) { try { return JSON.parse(await readFile(filename, 'utf8')) } catch { return null } }
