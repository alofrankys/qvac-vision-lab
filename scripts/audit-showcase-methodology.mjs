import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const reportsDir = path.join(root, 'reports')
const preferredRun = 'visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json'
const legacyRun = 'visionpsy-three-way-realworldqa-765-qvac-sdk-unified-0182.json'
const runName = process.env.QVAC_METHODOLOGY_INPUT || await firstExisting(preferredRun, legacyRun)
const addendumName = 'visionpsy-standard-q4-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json'
const primaryRun = JSON.parse(await readFile(path.join(reportsDir, runName), 'utf8'))
const standardQ4Addendum = await readOptional(addendumName)
if (primaryRun.dataset?.caseCount !== 765 || primaryRun.results?.length !== 2295) throw new Error('Methodology audit requires exactly 765 cases and 2,295 primary-run model outputs.')
if (!standardQ4Addendum || standardQ4Addendum.dataset?.caseCount !== 765 || standardQ4Addendum.results?.length !== 765) throw new Error('Methodology audit requires the complete 765-output Standard Q4 addendum.')
assertMatchingEvidence(primaryRun, standardQ4Addendum)
const run = {
  ...primaryRun,
  summaries: { ...primaryRun.summaries, ...standardQ4Addendum.summaries },
  providers: { ...primaryRun.providers, ...standardQ4Addendum.providers },
  results: [...primaryRun.results, ...standardQ4Addendum.results]
}

const directScorerName = 'visionpsy-realworldqa-vlmevalkit-upstream-470e517.json'
const directScorer = await readOptional(directScorerName)
const repeatabilityName = 'visionpsy-realworldqa-repeatability-100x3.json'
const repeatability = await readOptional(repeatabilityName)
const performanceName = 'visionpsy-four-way-performance-realworldqa-validation-50-counterbalanced-50.json'
const performance = await readOptional(performanceName)
const providerIds = ['qvac-visionpsy-standard-q8', 'qvac-visionpsy-standard-q4', 'qvac-visionpsy', 'qvac-visionpsy-flash-q4']
const published = {
  'qvac-visionpsy-standard-q8': 0.591,
  'qvac-visionpsy-standard-q4': 0.603,
  'qvac-visionpsy': 0.567,
  'qvac-visionpsy-flash-q4': 0.549
}
const labels = {
  'qvac-visionpsy-standard-q8': 'VisionPsy Standard Q8_0',
  'qvac-visionpsy-standard-q4': 'VisionPsy Standard Q4_K_M imatrix',
  'qvac-visionpsy': 'VisionPsy Flash Q8_0',
  'qvac-visionpsy-flash-q4': 'VisionPsy Flash Q4_K_M imatrix'
}
const uniqueCases = [...new Map(run.results.map(item => [item.caseId, item])).values()]
const answerLetters = countBy(uniqueCases, item => item.expectedLetter)
const optionCounts = await installedOptionCounts()
const majorityBaseline = Math.max(...Object.values(answerLetters)) / uniqueCases.length
const weightedRandomBaseline = optionCounts ? Object.entries(optionCounts).reduce((sum, [count, rows]) => sum + Number(rows) / Number(count), 0) / uniqueCases.length : null

const audit = {
  schemaVersion: 4,
  generatedAt: new Date().toISOString(),
  sourceRuns: {
    primaryThreeModelRun: runName,
    standardQ4Addendum: addendumName
  },
  verdict: run.dataset.promptTemplate ? 'UPSTREAM_PROMPT_LOCAL_CORROBORATION' : 'LOCAL_CORROBORATION_WITH_PROMPT_GAP',
  results: providerIds.map(providerId => ({
    providerId,
    label: labels[providerId] || providerId,
    correct: run.summaries[providerId].passed,
    total: run.summaries[providerId].cases,
    accuracy: run.summaries[providerId].accuracy,
    publishedMatchingGgufAccuracy: published[providerId],
    deltaPercentagePoints: (run.summaries[providerId].accuracy - published[providerId]) * 100
  })),
  sanityBaselines: { answerLetters, majorityLetterBaseline: majorityBaseline, optionCounts, weightedRandomOptionBaseline: weightedRandomBaseline },
  reproducibility: run.reproducibility || null,
  scorerAudit: directScorer ? {
    kind: 'DIRECT_PINNED_VLMEVALKIT_SOURCE', report: directScorerName,
    revision: directScorer.implementation.revision, scorerSha256: directScorer.implementation.scorerSha256,
    extractionDifferences: directScorer.totalExtractionDifferences, passVerdictChanges: directScorer.totalPassVerdictChanges
  } : { kind: 'NOT_YET_RUN', consequence: 'Do not claim direct VLMEvalKit scorer parity until the pinned upstream audit has completed.' },
  repeatabilityAudit: repeatability ? {
    report: repeatabilityName,
    cases: repeatability.selection.cases,
    repeats: 3,
    newInferences: repeatability.selection.cases * Object.keys(repeatability.providers).length * 2,
    coveredProviderIds: Object.keys(repeatability.providers),
    excludedProviderIds: providerIds.filter(providerId => !repeatability.providers[providerId]),
    maximumAccuracySwingPoints: Math.max(...Object.values(repeatability.providers).map(item => item.maximumAccuracySwingPoints)),
    minimumExactOutputAgreement: Math.min(...Object.values(repeatability.providers).map(item => item.identicalOutputs.rate)),
    minimumPassFailAgreement: Math.min(...Object.values(repeatability.providers).map(item => item.identicalPassFailVerdicts.rate))
  } : null,
  controlledPerformanceAudit: performance ? {
    report: performanceName,
    cases: performance.dataset?.caseCount,
    measuredInferences: performance.results?.length,
    excludedWarmups: performance.warmups?.length,
    orderPolicy: performance.dataset?.orderPolicy,
    providers: providerIds.map(providerId => ({
      providerId,
      meanTtftMs: performance.summaries?.[providerId]?.ttftMs?.mean,
      meanLatencyMs: performance.summaries?.[providerId]?.latencyMs?.mean,
      meanTokensPerSecond: performance.summaries?.[providerId]?.tokensPerSecond?.mean
    }))
  } : null,
  controls: {
    dataset: 'Complete checksum-locked RealWorldQA: 765 scored questions.',
    prompt: run.dataset.promptTemplate || 'Legacy local answer-letter suffix; differs from upstream VLMEvalKit.',
    runtime: 'All four variants use QVAC SDK and @qvac/llm-llamacpp; preprocessing remains model-specific by design.',
    order: `${primaryRun.dataset.orderPolicy}; Standard Q4 is a later single-provider addendum over the exact same seeded case order.`,
    retries: run.reproducibility?.retryPolicy || 'Attempt evidence is persisted; valid wrong answers are not retried.',
    categories: 'Capability/category labels are local heuristics and are not an official RealWorldQA taxonomy.'
  },
  comparability: {
    accuracy: 'Paired case-by-case across all four variants: same 765 source indices, image hashes, prompts, expected answers and scorer.',
    performance: performance ? 'The full-run telemetry is not directly rankable because Standard Q4 was a separately paced addendum. A separate 50-case four-way diagnostic uses excluded warm-ups and a balanced four-position rotation for descriptive local timing.' : 'Not directly rankable across all four variants: Standard Q4 was measured later in a separately paced single-provider addendum.',
    statisticalConclusion: 'All six pairwise accuracy comparisons are exploratory; the combined four-way report applies Holm correction.'
  },
  residualLimitations: [
    'Tether reports in-house results; an exact vendor environment and all internal generation details are not publicly frozen.',
    'This is one benchmark and does not reproduce the complete 17-benchmark VisionPsy table.',
    repeatability && providerIds.every(providerId => repeatability.providers[providerId]) ? 'The 100-case repeatability audit covers all four variants. It tests deterministic local implementation stability, not other prompts, stochastic settings, hardware or the full 765-case set.' : repeatability ? 'The 100-case repeatability audit does not yet cover every variant. It tests deterministic local implementation stability, not other prompts, stochastic settings, hardware or the full 765-case set.' : 'One deterministic full run does not estimate implementation nondeterminism; repeat-run variance remains a separate robustness question.',
    'Exact multiple-choice accuracy does not measure open-ended prose quality, safety, calibration or usefulness.',
    'Performance KPIs are local-device measurements and are not comparable with unpublished vendor hardware.',
    performance ? 'The controlled four-way timing diagnostic covers 50 cases on one Mac. It is descriptive local evidence, not a portable hardware benchmark or a replacement for the full-run accuracy comparison.' : 'Standard Q4 was added after the primary balanced three-model rotation. Its paired accuracy is comparable, but its timing and resource KPIs are not a controlled four-way performance experiment.'
  ]
}

audit.publicationWording = publicationWording(audit)
await writeFile(path.join(reportsDir, 'visionpsy-methodology-audit.json'), `${JSON.stringify(audit, null, 2)}\n`)
await writeFile(path.join(reportsDir, 'visionpsy-methodology-audit.md'), markdown(audit))
process.stdout.write(markdown(audit))

async function firstExisting(...names) {
  for (const name of names) { try { await access(path.join(reportsDir, name)); return name } catch {} }
  throw new Error(`No canonical RealWorldQA run found (${names.join(', ')}).`)
}

async function readOptional(name) {
  try { return JSON.parse(await readFile(path.join(reportsDir, name), 'utf8')) } catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

function assertMatchingEvidence(primary, addendum) {
  const checks = [
    ['source checksum', primary.dataset.sourceMd5, addendum.dataset.sourceMd5],
    ['shuffle seed', primary.dataset.shuffleSeed, addendum.dataset.shuffleSeed],
    ['prompt template', primary.dataset.promptTemplate, addendum.dataset.promptTemplate],
    ['source-index order', JSON.stringify(primary.dataset.sourceIndices), JSON.stringify(addendum.dataset.sourceIndices)],
    ['scorer revision', primary.reproducibility?.scorer?.revision, addendum.reproducibility?.scorer?.revision],
    ['scorer hash', primary.reproducibility?.scorer?.sha256, addendum.reproducibility?.scorer?.sha256],
    ['generation settings', JSON.stringify(primary.reproducibility?.generation), JSON.stringify(addendum.reproducibility?.generation)]
  ]
  for (const [label, expected, actual] of checks) {
    if (expected !== actual) throw new Error(`Standard Q4 addendum ${label} does not match the primary run.`)
  }
}

async function installedOptionCounts() {
  const directories = ['realworldqa', 'realworldqa-validation-50', 'realworldqa-validation-50-b', 'realworldqa-validation-150-c', 'realworldqa-remainder-495']
  const counts = {}
  let total = 0
  for (const directory of directories) {
    try {
      const manifest = JSON.parse(await readFile(path.join(root, 'public', 'showcase', directory, 'manifest.json'), 'utf8'))
      for (const item of manifest.cases || []) { const count = Object.keys(item.options || {}).length; counts[count] = (counts[count] || 0) + 1; total += 1 }
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return total === 765 ? counts : null
}

function countBy(items, key) {
  const counts = {}
  for (const item of items) { const value = key(item); counts[value] = (counts[value] || 0) + 1 }
  return counts
}

function publicationWording(value) {
  const scores = value.results.map(item => `${item.label} ${item.correct}/${item.total} (${percent(item.accuracy)}) versus ${percent(item.publishedMatchingGgufAccuracy)}`).join('; ')
  const scorer = value.scorerAudit.kind === 'DIRECT_PINNED_VLMEVALKIT_SOURCE'
    ? `The checksum-pinned upstream VLMEvalKit scorer produced ${value.scorerAudit.extractionDifferences} extraction ${value.scorerAudit.extractionDifferences === 1 ? 'difference' : 'differences'} and ${value.scorerAudit.passVerdictChanges} pass/fail ${value.scorerAudit.passVerdictChanges === 1 ? 'change' : 'changes'}.`
    : 'Direct pinned VLMEvalKit scorer verification is still pending.'
  const repeatability = value.repeatabilityAudit
    ? `A separate ${value.repeatabilityAudit.cases}-case, three-pass audit produced ${value.repeatabilityAudit.maximumAccuracySwingPoints.toFixed(2)} pp maximum score swing and ${(value.repeatabilityAudit.minimumExactOutputAgreement * 100).toFixed(1)}% minimum exact-output agreement.`
    : 'A repeated-subset robustness audit is still pending.'
  const performance = value.controlledPerformanceAudit
    ? `A separate ${value.controlledPerformanceAudit.cases}-case four-way run with excluded warm-ups and balanced execution order provides descriptive local timing without changing the quality score.`
    : 'Four-way controlled timing remains separate from the quality score.'
  return `I ran the complete 765-question RealWorldQA set locally on four matching VisionPsy GGUF variants: ${scores}. ${scorer} ${repeatability} Standard Q4 was a later single-provider addendum with identical cases, prompts and scoring, so its original full-run performance KPIs are not directly comparable. ${performance} This is an independent local corroboration on Apple Metal, not a reproduction of Tether's complete in-house evaluation.`
}

function markdown(value) {
  const lines = ['# VisionPsy methodology audit · adversarial release view', '', `Generated: ${value.generatedAt}`, '', `Verdict: **${value.verdict}**.`, '', '| Model | Local | Matching published GGUF | Delta |', '|---|---:|---:|---:|']
  for (const item of value.results) lines.push(`| ${item.label} | ${item.correct}/${item.total} (${percent(item.accuracy)}) | ${percent(item.publishedMatchingGgufAccuracy)} | ${signed(item.deltaPercentagePoints)} pp |`)
  lines.push('', '## Evidence design', '', `- Primary run: \`${value.sourceRuns.primaryThreeModelRun}\` (balanced three-position rotation).`, `- Standard Q4 addendum: \`${value.sourceRuns.standardQ4Addendum}\` (same 765 cases and seeded order, executed separately).`, `- Accuracy comparability: ${value.comparability.accuracy}`, `- Performance comparability: ${value.comparability.performance}`, `- Statistical interpretation: ${value.comparability.statisticalConclusion}`)
  lines.push('', '## Sanity baselines', '', `- Majority answer-letter baseline: ${percent(value.sanityBaselines.majorityLetterBaseline)}.`, `- Weighted random-option baseline: ${Number.isFinite(value.sanityBaselines.weightedRandomOptionBaseline) ? percent(value.sanityBaselines.weightedRandomOptionBaseline) : 'unavailable until all manifests are installed'}.`, `- Answer letters: ${Object.entries(value.sanityBaselines.answerLetters).map(([key, count]) => `${key}=${count}`).join(', ')}.`)
  if (value.repeatabilityAudit) lines.push('', '## Deterministic repeatability', '', `- ${value.repeatabilityAudit.cases} stratified cases × ${value.repeatabilityAudit.repeats} passes per covered model.`, `- Covered: ${value.repeatabilityAudit.coveredProviderIds.map(providerId => labels[providerId] || providerId).join(', ')}.`, `- Excluded: ${value.repeatabilityAudit.excludedProviderIds.map(providerId => labels[providerId] || providerId).join(', ')}.`, `- ${value.repeatabilityAudit.newInferences} new inferences in passes 2 and 3.`, `- Maximum accuracy swing: ${value.repeatabilityAudit.maximumAccuracySwingPoints.toFixed(2)} pp.`, `- Minimum exact-output agreement: ${(value.repeatabilityAudit.minimumExactOutputAgreement * 100).toFixed(1)}%.`, `- Minimum pass/fail agreement: ${(value.repeatabilityAudit.minimumPassFailAgreement * 100).toFixed(1)}%.`)
  if (value.controlledPerformanceAudit) {
    lines.push('', '## Controlled local performance diagnostic', '', `- ${value.controlledPerformanceAudit.cases} cases, ${value.controlledPerformanceAudit.measuredInferences} measured inferences and ${value.controlledPerformanceAudit.excludedWarmups} excluded warm-ups.`, `- ${value.controlledPerformanceAudit.orderPolicy}.`, '- These timings are descriptive for this Mac and are not merged into the 765-question quality score.', '', '| Model | Mean TTFT | Mean latency | Mean generation |', '|---|---:|---:|---:|')
    for (const item of [...value.controlledPerformanceAudit.providers].sort((a, b) => a.meanLatencyMs - b.meanLatencyMs)) lines.push(`| ${labels[item.providerId] || item.providerId} | ${Math.round(item.meanTtftMs)} ms | ${Math.round(item.meanLatencyMs)} ms | ${item.meanTokensPerSecond.toFixed(1)} tok/s |`)
  }
  lines.push('', '## Publication wording', '', `> ${value.publicationWording}`, '', '## Residual limitations', '')
  for (const item of value.residualLimitations) lines.push(`- ${item}`)
  lines.push('', 'Primary references:', '', '- https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs', '- https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs', '- https://github.com/open-compass/VLMEvalKit', '')
  return lines.join('\n')
}

function percent(value) { return `${(Number(value) * 100).toFixed(2)}%` }
function signed(value) { return `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}` }
