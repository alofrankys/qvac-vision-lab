import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHOWCASE_CASES } from '../src/showcase/index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportsDir = path.join(root, 'reports')
const inputName = process.env.QVAC_AUDIT_INPUT || 'visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json'
const addendumName = process.env.QVAC_AUDIT_ADDENDUM || 'visionpsy-standard-q4-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json'
const parityName = process.env.QVAC_AUDIT_PARITY || 'visionpsy-realworldqa-vlmevalkit-upstream-470e517.json'
const repeatabilityName = process.env.QVAC_AUDIT_REPEATABILITY || 'visionpsy-realworldqa-repeatability-100x3.json'
const outputStem = process.env.QVAC_AUDIT_OUTPUT_STEM || 'visionpsy-realworldqa-765-qvac-sdk-vlmevalkit-audit'
const primaryRun = JSON.parse(await readFile(path.join(reportsDir, inputName), 'utf8'))
const addendumRun = JSON.parse(await readFile(path.join(reportsDir, addendumName), 'utf8'))
const scorerParity = JSON.parse(await readFile(path.join(reportsDir, parityName), 'utf8'))
const repeatabilityRun = await optionalJson(path.join(reportsDir, repeatabilityName))
const cases = SHOWCASE_CASES.filter(item => Number.isInteger(item.sourceIndex))
const caseLookup = new Map(cases.map(item => [item.id, item]))
const providerIds = ['qvac-visionpsy-standard-q8', 'qvac-visionpsy-standard-q4', 'qvac-visionpsy', 'qvac-visionpsy-flash-q4']
const official = Object.freeze({
  'qvac-visionpsy-standard-q8': { matchingGguf: 0.591, fp32Table: 0.597, family: 'VisionPsy-Nano-460M' },
  'qvac-visionpsy-standard-q4': { matchingGguf: 0.603, fp32Table: 0.597, family: 'VisionPsy-Nano-460M' },
  'qvac-visionpsy': { matchingGguf: 0.567, fp32Table: 0.567, family: 'VisionPsy-Nano-460M-Flash' },
  'qvac-visionpsy-flash-q4': { matchingGguf: 0.549, fp32Table: 0.567, family: 'VisionPsy-Nano-460M-Flash' }
})

assert(primaryRun.dataset?.caseCount === 765, `Expected 765 primary cases, found ${primaryRun.dataset?.caseCount}`)
assert(primaryRun.results?.length === 2295, `Expected 2,295 primary results, found ${primaryRun.results?.length}`)
assert(addendumRun.dataset?.caseCount === 765, `Expected 765 addendum cases, found ${addendumRun.dataset?.caseCount}`)
assert(addendumRun.results?.length === 765, `Expected 765 addendum results, found ${addendumRun.results?.length}`)
assert(primaryRun.dataset.sourceMd5 === addendumRun.dataset.sourceMd5, 'Primary and addendum source checksums differ')
assert(primaryRun.dataset.shuffleSeed === addendumRun.dataset.shuffleSeed, 'Primary and addendum shuffle seeds differ')
assert(primaryRun.dataset.promptTemplate === addendumRun.dataset.promptTemplate, 'Primary and addendum prompts differ')
assert(JSON.stringify(primaryRun.dataset.sourceIndices) === JSON.stringify(addendumRun.dataset.sourceIndices), 'Primary and addendum case orders differ')
assert(primaryRun.reproducibility?.scorer?.revision === addendumRun.reproducibility?.scorer?.revision, 'Primary and addendum scorer revisions differ')
assert(primaryRun.reproducibility?.scorer?.fileSha256 === addendumRun.reproducibility?.scorer?.fileSha256, 'Primary and addendum scorer hashes differ')
assert(JSON.stringify(primaryRun.reproducibility?.generation) === JSON.stringify(addendumRun.reproducibility?.generation), 'Primary and addendum generation settings differ')
const run = {
  ...primaryRun,
  protocol: `${primaryRun.protocol} + preregistered Standard Q4 addendum`,
  providers: { ...primaryRun.providers, ...addendumRun.providers },
  summaries: { ...primaryRun.summaries, ...addendumRun.summaries },
  results: [...primaryRun.results, ...addendumRun.results],
  reproducibility: {
    ...primaryRun.reproducibility,
    artifacts: { ...primaryRun.reproducibility.artifacts, ...addendumRun.reproducibility.artifacts },
    addendumApplicationCommit: addendumRun.reproducibility.applicationCommit,
    standardQ4ResourcePacing: addendumRun.reproducibility.resourcePacing
  }
}
assert(run.results.length === 3060, `Expected 3,060 combined results, found ${run.results.length}`)
assert(new Set(run.results.map(item => `${item.caseId}:${item.providerId}`)).size === 3060, 'Duplicate or missing case/provider rows')
assert(providerIds.every(id => run.summaries[id]?.cases === 765), 'One or more provider summaries are incomplete')

const providers = providerIds.map(providerId => buildProvider(providerId)).sort((a, b) => b.real.accuracy - a.real.accuracy)
const pairwise = holmAdjust(buildPairwise())
const minimumAdjustedP = Math.min(...pairwise.map(item => item.holmAdjustedP))
const agreement = buildAgreement()
const questionInventory = buildInventory()
const repeatability = buildRepeatability(repeatabilityRun)
const flashQuantizationPair = pairwise.find(item => item.leftId === 'qvac-visionpsy' && item.rightId === 'qvac-visionpsy-flash-q4')
const leaderMargin = providers[0].real.passed - providers[1].real.passed
const report = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  title: 'VisionPsy · RealWorldQA 765 · upstream-prompt QVAC audit',
  statisticalVerdict: minimumAdjustedP < 0.05 ? 'SIGNIFICANT_DIFFERENCE_AFTER_HOLM' : 'NO_CLEAR_WINNER_AFTER_HOLM',
  realPairwise: pairwise,
  verdict: {
    ranking: providers.map(item => item.providerId),
    statisticalVerdict: minimumAdjustedP < 0.05 ? 'SIGNIFICANT_DIFFERENCE_AFTER_HOLM' : 'NO_CLEAR_WINNER_AFTER_HOLM',
    summary: verdictSummary(providers, minimumAdjustedP),
    qualityConclusion: minimumAdjustedP < 0.05 ? 'At least one paired model difference remains significant after Holm correction.' : 'The observed rank order is not statistically decisive in this local run.',
    publicationSafeClaim: publicationSafeClaim(providers, minimumAdjustedP)
  },
  methodology: {
    dataset: 'RealWorldQA',
    questions: 765,
    uniqueRealImages: questionInventory.uniqueImageHashes,
    sourceMd5: run.dataset.sourceMd5,
    scoring: 'Exact multiple-choice option accuracy; one point per question; no cross-suite aggregation.',
    prompt: run.dataset.promptTemplate,
    providerOrder: 'Primary three-model run used balanced Latin rotation; Standard Q4 was a preregistered single-provider addendum over the identical seeded case order.',
    warmup: run.dataset.warmupPolicy,
    runtime: '@qvac/sdk 0.18.2',
    backend: '@qvac/llm-llamacpp 0.47.0 · qvac-fabric-llm.cpp · Metal GPU',
    sameRuntimeAndBackend: true,
    modelSpecificPreprocessing: {
      'qvac-visionpsy-standard-q8': 'official-standard-tiled-upscale',
      'qvac-visionpsy-standard-q4': 'official-standard-tiled-upscale',
      'qvac-visionpsy': 'native-resolution-no-upscale',
      'qvac-visionpsy-flash-q4': 'native-resolution-no-upscale'
    },
    scorerParity: {
      implementation: 'Direct checksum-verified OpenCompass VLMEvalKit can_infer source execution',
      revision: scorerParity.implementation.revision,
      scorerSha256: scorerParity.implementation.scorerSha256,
      extractionDifferences: scorerParity.totalExtractionDifferences,
      passVerdictChanges: scorerParity.totalPassVerdictChanges
    },
    performanceComparability: 'Accuracy is paired on identical inputs. Standard Q4 was executed later as a separately paced addendum, so its latency, throughput, RAM, CPU and GPU telemetry is local operational evidence and must not be ranked directly against the primary three-model run.',
    officialDifference: 'This audit freezes the public VLMEvalKit prompt/scorer revision, dataset checksum, generation values, artifact hashes and QVAC-native stack. It cannot establish parity with unavailable vendor-internal environment details, hardware or numerical kernels.'
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
    observedWeakness('Degenerate repetition loops', 'Not observable under one-letter constrained decoding; all 3,060 answers were parseable.', 'MASKED_BY_PROTOCOL'),
    observedWeakness('Flash sensitivity on high-resolution OCR', 'Not isolated by RealWorldQA capability labels; requires OCRBench/DocVQA/InfoVQA or a dedicated high-resolution OCR slice.', 'NOT_TESTED'),
    observedWeakness('Quality degradation at lower quantization', `Observed directionally but not decisively: Flash Q8 scored ${run.summaries['qvac-visionpsy'].passed}/765 and Flash Q4 scored ${run.summaries['qvac-visionpsy-flash-q4'].passed}/765. They disagreed on ${flashQuantizationPair.leftOnly + flashQuantizationPair.rightOnly} cases (${flashQuantizationPair.leftOnly} Q8-only wins, ${flashQuantizationPair.rightOnly} Q4-only wins).`, 'OBSERVED_BUT_NOT_SIGNIFICANT')
  ],
  promptAblation: null,
  criticalities: [
    criticality(1, 'Vendor-internal environment is not public', 'Medium', 'The public prompt and scorer can be frozen, but unavailable vendor hardware and full internal invocation cannot be reconstructed.', 'Call the result an exact reproduction.', 'Call it an independent local corroboration with a fully frozen local protocol.', 'B', 'The local run is auditable without overstating vendor parity.'),
    criticality(2, 'Preprocessing differs intentionally between Standard and Flash', 'High', 'Standard consumes tiled/upscaled views while Flash consumes the native view; this is part of the model design but prevents attributing every difference to weights alone.', 'Keep official per-model preprocessing for product-realistic comparison.', 'Add a preprocessing ablation while retaining the official run as primary.', 'A+B', 'Official preprocessing is the fair headline; the ablation explains whether tiling helps or hurts particular cases.'),
    criticality(3, 'Answer choices are imbalanced and category labels are heuristic', 'High', 'The majority answer letter is B (337/765); local capability labels are not an official RealWorldQA taxonomy.', 'Report only headline accuracy.', 'Publish majority/random baselines and label every category breakdown as local heuristic analysis.', 'B', 'This prevents category and letter-position artifacts from being mistaken for general visual skill.'),
    criticality(4, 'A single benchmark cannot validate all advertised capabilities', 'High', 'OCR, documents, charts, hallucination, instruction following and open-ended reasoning are weakly represented or absent.', 'Keep the claim strictly scoped to RealWorldQA.', 'Add official OCRBench, ChartQA, POPE and MM-IFEval replications later.', 'A now; B next', 'The X post must not generalize this score to overall VisionPsy quality.'),
    criticality(5, 'Exact one-letter scoring masks answer quality', 'Medium', 'It measures option selection, not explanations, calibration, hallucination or repetition.', 'Use exact scoring because that is the benchmark metric.', 'Add a separate open-answer qualitative audit with a frozen rubric.', 'A for benchmark; B as separate evidence', 'Do not mix qualitative grades into the official accuracy denominator.'),
    criticality(6, 'The score gaps are statistically weak', 'High', `The aggregate leader is only ${leaderMargin}/765 answers ahead of the runner-up, and the minimum Holm-adjusted paired p-value is ${minimumAdjustedP.toFixed(4)}.`, 'Publish the raw ranking only.', 'Publish counts, confidence intervals and paired tests together.', 'B', 'The defensible conclusion is “no clear local winner”, despite the rank order.'),
    criticality(7, 'System resource KPIs are not model-isolated', 'Medium', 'macOS GPU counters are system-wide and unified memory/process RSS does not fully represent model footprint.', 'Show them as live operational telemetry.', 'Label their scope and avoid cross-machine claims; use isolated device profiling for publication-grade memory data.', 'B', 'Latency is reliable for this machine/run; GPU/RAM comparisons need narrower claims.'),
    criticality(8, 'Aggregate scores can hide different failure sets', 'Medium', `Flash Q8 and Q4 differ by ${Math.abs(run.summaries['qvac-visionpsy'].passed - run.summaries['qvac-visionpsy-flash-q4'].passed)} correct answers but disagree on ${flashQuantizationPair.leftOnly + flashQuantizationPair.rightOnly} individual questions.`, 'Rank by total accuracy only.', 'Publish paired disagreement counts and inspect recurrent clusters.', 'B', 'The Q4 result does not prove quantization is lossless on individual cases.'),
    criticality(9, 'Official-number provenance changes with precision and table revision', 'Medium', 'FP32/model-card headlines and matching GGUF rows are not interchangeable.', 'Compare against the family headline.', 'Compare each local file only against its matching GGUF column and record source URLs/date.', 'B', 'This avoids claiming a gain or loss against the wrong precision.'),
    criticality(10, 'Repeatability is measured on a subset', 'Medium', repeatability ? `A deterministic 100-case subset was run three times: every provider had ${repeatability.minimumExactOutputAgreement * 100}% exact-output agreement and ${repeatability.maximumAccuracySwingPoints.toFixed(2)} pp maximum accuracy swing.` : 'The full run has no repeated-subset robustness audit attached.', 'Treat the deterministic full run as sufficient for this exact protocol.', 'Publish the separate stratified repeatability audit without presenting it as a confidence interval.', repeatability ? 'B completed' : 'B', 'This tests local implementation stability, not all prompts, seeds, hardware or stochastic settings.'),
    criticality(11, 'Standard Q4 is a separate addendum run', 'High', 'Its 765 answers use identical inputs, prompt, scorer, generation values and native QVAC stack, but were collected after the three-model run under changing low-resource pacing.', 'Rank all four variants by both accuracy and speed as if they ran together.', 'Use the four-way grid for paired accuracy; label Standard Q4 performance telemetry non-comparable until a dedicated counterbalanced performance run exists.', 'B', 'The 2×2 quality comparison is auditable, while performance claims remain bounded.'),
    criticality(12, 'Execution remains sequential on one device', 'Low', 'The seeded shuffle and primary Latin rotation reduce position bias, but thermal drift can still affect performance KPIs.', 'Ignore run position.', 'Publish order and temperature-independent quality separately from device-specific performance.', 'B', 'Accuracy remains paired; latency is explicitly local-device evidence.')
  ],
  questionInventory,
  agreement,
  pairwise,
  repeatability,
  providers,
  sanityBaselines: buildSanityBaselines(questionInventory),
  categoryLabels: { provenance: 'LOCAL_HEURISTIC', publicationRule: 'Never describe these labels as an official RealWorldQA taxonomy.' },
  migrationComparison: null,
  artifacts: {
    rawRun: inputName,
    standardQ4Addendum: addendumName,
    scorerParity: parityName,
    repeatability: repeatability ? repeatabilityName : null,
    checkpoints: ['.visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.checkpoint.ndjson', '.visionpsy-standard-q4-realworldqa-765-qvac-sdk-vlmevalkit-470e517.checkpoint.ndjson'],
    inputManifestEmbedded: Boolean(run.dataset.inputManifest?.length === 765),
    reproducibility: run.reproducibility
  }
}

const jsonPath = path.join(reportsDir, `${outputStem}.json`)
const markdownPath = path.join(reportsDir, `${outputStem}.md`)
const publicPath = path.join(root, 'public', 'showcase', 'visionpsy-four-way-realworldqa-765.json')
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
  const byCorrectCount = Object.fromEntries(Array.from({ length: providerIds.length + 1 }, (_, index) => [index, 0]))
  for (const item of cases) {
    const correct = providerIds.filter(id => rowFor(item.id, id)?.evaluation?.status === 'PASS').length
    byCorrectCount[correct] += 1
  }
  return { allCorrect: byCorrectCount[providerIds.length], allWrong: byCorrectCount[0], byCorrectCount }
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
  const lines = ['# VisionPsy · RealWorldQA 765 · frozen-protocol QVAC audit', '', `Generated: ${audit.generatedAt}`, '', audit.verdict.summary, '', '| Rank | Model | Local | Official matching GGUF | Delta | Wilson 95% | Mean TTFT | Mean latency |', '|---:|---|---:|---:|---:|---:|---:|---:|']
  audit.providers.forEach((provider, index) => lines.push(`| ${index + 1} | ${provider.label} | ${cell(provider.real)} | ${percent(provider.officialRealWorldQaAccuracy)} | ${signedPoints(provider.deviationFromOfficial)} | ${provider.real.interval.map(value => `${value.toFixed(1)}%`).join('–')} | ${duration(provider.performance.ttftMs.mean)} | ${duration(provider.performance.latencyMs.mean)} |`))
  lines.push('', `Statistical verdict: **${audit.verdict.statisticalVerdict.replaceAll('_', ' ')}**.`, '', `Sanity baselines: majority letter ${percent(audit.sanityBaselines.majorityLetterBaseline)}; option-count-weighted random choice ${percent(audit.sanityBaselines.weightedRandomOptionBaseline)}.`, '', 'Paired exact McNemar tests (Holm-adjusted):', '')
  for (const pair of audit.pairwise) lines.push(`- ${pair.leftLabel} vs ${pair.rightLabel}: unique wins ${pair.leftOnly}–${pair.rightOnly}; raw p=${pair.exactMcNemarP.toFixed(4)}; Holm p=${pair.holmAdjustedP.toFixed(4)}.`)
  if (audit.repeatability) {
    lines.push('', '## Deterministic repeatability', '', `${audit.repeatability.cases} stratified cases, ${audit.repeatability.repeats} total passes per model; repeats 2 and 3 add ${audit.repeatability.newInferences} new inferences.`, '')
    for (const provider of audit.repeatability.providers) lines.push(`- ${provider.label}: ${provider.repeatScores.map(item => `${item.passed}/${item.cases}`).join(' · ')}; max swing ${provider.maximumAccuracySwingPoints.toFixed(2)} pp; exact outputs ${provider.identicalOutputs.cases}/${provider.identicalOutputs.total}.`)
    lines.push('', audit.repeatability.interpretation)
  }
  lines.push('', `Agreement by number of correct models: ${Object.entries(audit.agreement.byCorrectCount).map(([count, cases]) => `${count}/4 = ${cases}`).join('; ')}.`, '', '## Methodology versus official', '', `- Same public scope: ${audit.methodology.questions} questions, ${audit.methodology.uniqueRealImages} unique real images, source MD5 \`${audit.methodology.sourceMd5}\`.`, `- Prompt frozen verbatim from the pinned public VLMEvalKit revision; image is supplied before text.`, `- Same native stack across local variants: ${audit.methodology.runtime}; ${audit.methodology.backend}.`, `- Standard Q4 is a separately paced preregistered addendum: accuracy is paired, performance telemetry is not directly rankable.`, `- Direct upstream scorer audit: ${audit.methodology.scorerParity.extractionDifferences} extraction differences and ${audit.methodology.scorerParity.passVerdictChanges} pass/fail changes (revision \`${audit.methodology.scorerParity.revision}\`).`, `- Remaining caveat: ${audit.methodology.officialDifference}`, '', '## Audit criticalities', '')
  for (const item of audit.criticalities) lines.push(`${item.id}. **${item.title} (${item.severity})** — ${item.consequence} Recommended: ${item.recommended}.`)
  lines.push('', '## Publication-safe claim', '', audit.verdict.publicationSafeClaim, '')
  return lines.join('\n')
}

function buildRepeatability(source) {
  if (!source?.providers || !source.selection?.cases) return null
  const repeatabilityProviderIds = providerIds.filter(providerId => source.providers[providerId])
  const providers = repeatabilityProviderIds.map(providerId => {
    const provider = source.providers[providerId]
    assert(provider?.repeats?.length === 3, `Incomplete repeatability rows for ${providerId}`)
    return {
      providerId,
      label: provider.label,
      repeatScores: provider.repeats,
      maximumAccuracySwingPoints: provider.maximumAccuracySwingPoints,
      identicalOutputs: provider.identicalOutputs,
      identicalPassFailVerdicts: provider.identicalPassFailVerdicts
    }
  })
  return {
    cases: source.selection.cases,
    repeats: 3,
    newInferences: source.selection.cases * repeatabilityProviderIds.length * 2,
    coverageProviderIds: repeatabilityProviderIds,
    excludedProviderIds: providerIds.filter(providerId => !repeatabilityProviderIds.includes(providerId)),
    seed: source.selection.seed,
    stratifiedBy: source.selection.stratifiedBy,
    maximumAccuracySwingPoints: Math.max(...providers.map(item => item.maximumAccuracySwingPoints)),
    minimumExactOutputAgreement: Math.min(...providers.map(item => item.identicalOutputs.rate)),
    minimumPassFailAgreement: Math.min(...providers.map(item => item.identicalPassFailVerdicts.rate)),
    providers,
    interpretation: source.interpretation
  }
}

function observedWeakness(claim, localFinding, status) { return { claim, localFinding, status } }
function criticality(id, title, severity, risk, solutionA, solutionB, recommended, consequence) { return { id, title, severity, risk, solutionA, solutionB, recommended, consequence } }
function buildSanityBaselines(inventory) {
  const total = inventory.questions
  const majorityCount = Math.max(...Object.values(inventory.answerLetters))
  const weightedRandom = Object.entries(inventory.optionCounts)
    .reduce((sum, [optionCount, casesForCount]) => sum + (casesForCount / Number(optionCount)), 0) / total
  return {
    majorityLetter: Object.entries(inventory.answerLetters).sort((left, right) => right[1] - left[1])[0][0],
    majorityLetterBaseline: majorityCount / total,
    weightedRandomOptionBaseline: weightedRandom,
    note: 'These are sanity checks, not competing model scores.'
  }
}
function verdictSummary(rankedProviders, minimumP) {
  const [leader, runnerUp] = rankedProviders
  const margin = leader.real.passed - runnerUp.real.passed
  const significance = minimumP < 0.05
    ? 'At least one paired difference remains significant after Holm correction.'
    : 'No paired difference remains significant after Holm correction.'
  return `${leader.label} ranks first locally by ${margin} answer${margin === 1 ? '' : 's'} over ${runnerUp.label}. ${significance}`
}
function publicationSafeClaim(rankedProviders, minimumP) {
  const results = rankedProviders.map(provider => `${provider.label} ${provider.real.passed}/${provider.real.cases} (${percent(provider.real.accuracy)})`).join('; ')
  const inference = minimumP < 0.05 ? 'At least one paired difference was statistically significant after Holm correction.' : 'The local rank order was not statistically decisive after paired Holm-corrected tests.'
  return `Independent local RealWorldQA corroboration on the public 765-question split, using a frozen upstream prompt/scorer revision and one QVAC-native runtime/backend: ${results}. ${inference} This is not a claim of byte-for-byte replication of Tether's internal environment.`
}
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
