import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const reportsDir = path.join(root, 'reports')
const preferredRun = 'visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json'
const legacyRun = 'visionpsy-three-way-realworldqa-765-qvac-sdk-unified-0182.json'
const runName = process.env.QVAC_METHODOLOGY_INPUT || await firstExisting(preferredRun, legacyRun)
const run = JSON.parse(await readFile(path.join(reportsDir, runName), 'utf8'))
if (run.dataset?.caseCount !== 765 || run.results?.length !== 2295) throw new Error('Methodology audit requires exactly 765 cases and 2,295 model outputs.')

const directScorerName = 'visionpsy-realworldqa-vlmevalkit-upstream-470e517.json'
const directScorer = await readOptional(directScorerName)
const repeatabilityName = 'visionpsy-realworldqa-repeatability-100x3.json'
const repeatability = await readOptional(repeatabilityName)
const providerIds = Object.keys(run.summaries)
const published = {
  'qvac-visionpsy-standard-q8': 0.591,
  'qvac-visionpsy': 0.567,
  'qvac-visionpsy-flash-q4': 0.549
}
const labels = {
  'qvac-visionpsy-standard-q8': 'VisionPsy Standard Q8_0',
  'qvac-visionpsy': 'VisionPsy Flash Q8_0',
  'qvac-visionpsy-flash-q4': 'VisionPsy Flash Q4_K_M imatrix'
}
const uniqueCases = [...new Map(run.results.map(item => [item.caseId, item])).values()]
const answerLetters = countBy(uniqueCases, item => item.expectedLetter)
const optionCounts = await installedOptionCounts()
const majorityBaseline = Math.max(...Object.values(answerLetters)) / uniqueCases.length
const weightedRandomBaseline = optionCounts ? Object.entries(optionCounts).reduce((sum, [count, rows]) => sum + Number(rows) / Number(count), 0) / uniqueCases.length : null

const audit = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  sourceRun: runName,
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
    newInferences: repeatability.selection.cases * 3 * 2,
    maximumAccuracySwingPoints: Math.max(...Object.values(repeatability.providers).map(item => item.maximumAccuracySwingPoints)),
    minimumExactOutputAgreement: Math.min(...Object.values(repeatability.providers).map(item => item.identicalOutputs.rate)),
    minimumPassFailAgreement: Math.min(...Object.values(repeatability.providers).map(item => item.identicalPassFailVerdicts.rate))
  } : null,
  controls: {
    dataset: 'Complete checksum-locked RealWorldQA: 765 questions over 762 unique image hashes.',
    prompt: run.dataset.promptTemplate || 'Legacy local answer-letter suffix; differs from upstream VLMEvalKit.',
    runtime: 'All three providers use QVAC SDK and @qvac/llm-llamacpp; preprocessing remains model-specific by design.',
    order: run.dataset.orderPolicy,
    retries: run.reproducibility?.retryPolicy || 'Attempt evidence is persisted; valid wrong answers are not retried.',
    categories: 'Capability/category labels are local heuristics and are not an official RealWorldQA taxonomy.'
  },
  residualLimitations: [
    'Tether reports in-house results; an exact vendor environment and all internal generation details are not publicly frozen.',
    'This is one benchmark and does not reproduce the complete 17-benchmark VisionPsy table.',
    repeatability ? 'The 100-case repeatability audit tests deterministic local implementation stability, not other prompts, stochastic settings, hardware or the full 765-case set.' : 'One deterministic full run does not estimate implementation nondeterminism; repeat-run variance remains a separate robustness question.',
    'Exact multiple-choice accuracy does not measure open-ended prose quality, safety, calibration or usefulness.',
    'Performance KPIs are local-device measurements and are not comparable with unpublished vendor hardware.'
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
    ? `The checksum-pinned upstream VLMEvalKit scorer produced ${value.scorerAudit.extractionDifferences} extraction differences and ${value.scorerAudit.passVerdictChanges} pass/fail changes.`
    : 'Direct pinned VLMEvalKit scorer verification is still pending.'
  const repeatability = value.repeatabilityAudit
    ? `A separate ${value.repeatabilityAudit.cases}-case, three-pass audit produced ${value.repeatabilityAudit.maximumAccuracySwingPoints.toFixed(2)} pp maximum score swing and ${(value.repeatabilityAudit.minimumExactOutputAgreement * 100).toFixed(1)}% minimum exact-output agreement.`
    : 'A repeated-subset robustness audit is still pending.'
  return `I ran the complete 765-question RealWorldQA set locally on matching VisionPsy GGUF variants: ${scores}. ${scorer} ${repeatability} This is an independent local corroboration on Apple Metal, not a reproduction of Tether's complete in-house evaluation.`
}

function markdown(value) {
  const lines = ['# VisionPsy methodology audit · adversarial release view', '', `Generated: ${value.generatedAt}`, '', `Verdict: **${value.verdict}**.`, '', '| Model | Local | Matching published GGUF | Delta |', '|---|---:|---:|---:|']
  for (const item of value.results) lines.push(`| ${item.label} | ${item.correct}/${item.total} (${percent(item.accuracy)}) | ${percent(item.publishedMatchingGgufAccuracy)} | ${signed(item.deltaPercentagePoints)} pp |`)
  lines.push('', '## Sanity baselines', '', `- Majority answer-letter baseline: ${percent(value.sanityBaselines.majorityLetterBaseline)}.`, `- Weighted random-option baseline: ${Number.isFinite(value.sanityBaselines.weightedRandomOptionBaseline) ? percent(value.sanityBaselines.weightedRandomOptionBaseline) : 'unavailable until all manifests are installed'}.`, `- Answer letters: ${Object.entries(value.sanityBaselines.answerLetters).map(([key, count]) => `${key}=${count}`).join(', ')}.`)
  if (value.repeatabilityAudit) lines.push('', '## Deterministic repeatability', '', `- ${value.repeatabilityAudit.cases} stratified cases × ${value.repeatabilityAudit.repeats} passes per model.`, `- ${value.repeatabilityAudit.newInferences} new inferences in passes 2 and 3.`, `- Maximum accuracy swing: ${value.repeatabilityAudit.maximumAccuracySwingPoints.toFixed(2)} pp.`, `- Minimum exact-output agreement: ${(value.repeatabilityAudit.minimumExactOutputAgreement * 100).toFixed(1)}%.`, `- Minimum pass/fail agreement: ${(value.repeatabilityAudit.minimumPassFailAgreement * 100).toFixed(1)}%.`)
  lines.push('', '## Publication wording', '', `> ${value.publicationWording}`, '', '## Residual limitations', '')
  for (const item of value.residualLimitations) lines.push(`- ${item}`)
  lines.push('', 'Primary references:', '', '- https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs', '- https://huggingface.co/qvac/VisionPsy-Nano-460M-Flash-GGUFs', '- https://github.com/open-compass/VLMEvalKit', '')
  return lines.join('\n')
}

function percent(value) { return `${(Number(value) * 100).toFixed(2)}%` }
function signed(value) { return `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}` }
