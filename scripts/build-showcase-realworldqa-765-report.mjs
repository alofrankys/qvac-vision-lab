import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { SHOWCASE_CASES } = await import('../src/showcase/index.mjs')
const reportsDir = path.join(root, 'reports')
const initialReal = await readReport('visionpsy-three-way-realworldqa-20.json')
const validationRealA = await readReport('visionpsy-three-way-realworldqa-validation-50.json')
const validationRealB = await readReport('visionpsy-three-way-realworldqa-validation-50-b.json')
const validationRealC = await readReport('visionpsy-three-way-realworldqa-validation-150-c.json')
const officialRemainder = await readReport('visionpsy-three-way-realworldqa-remainder-495.json')
const scorerParity = await readReport('visionpsy-realworldqa-vlmeval-parity.json')
const providerIds = ['visionpsy-patched-base', 'qvac-visionpsy', 'visionpsy-patched']
const officialRealWorldQa = Object.freeze({ 'visionpsy-patched-base': 0.591, 'qvac-visionpsy': 0.567, 'visionpsy-patched': 0.549 })
const officialFp32RealWorldQa = Object.freeze({ 'visionpsy-patched-base': 0.6, 'qvac-visionpsy': 0.5843, 'visionpsy-patched': null })
const priorRealResults = [...initialReal.results, ...validationRealA.results, ...validationRealB.results, ...validationRealC.results]
const realResults = [...priorRealResults, ...officialRemainder.results]
const officialCases = SHOWCASE_CASES.filter(item => Number.isInteger(item.sourceIndex))
const caseLookup = new Map(officialCases.map(item => [item.id, item]))

const providers = providerIds.map(providerId => {
  const initialResult = result(initialReal.summaries[providerId])
  const validationAResult = result(validationRealA.summaries[providerId])
  const validationBResult = result(validationRealB.summaries[providerId])
  const validationCResult = result(validationRealC.summaries[providerId])
  const remainderResult = result(officialRemainder.summaries[providerId])
  const priorReal = combine(initialResult, validationAResult, validationBResult, validationCResult)
  const real = combine(priorReal, remainderResult)
  const officialAccuracy = officialRealWorldQa[providerId]
  return {
    providerId,
    label: initialReal.summaries[providerId].label,
    officialRealWorldQaAccuracy: officialAccuracy,
    officialFp32RealWorldQaAccuracy: officialFp32RealWorldQa[providerId],
    deviationFromOfficial: Number.isFinite(officialAccuracy) ? real.accuracy - officialAccuracy : null,
    initialReal: initialResult,
    validationRealA: validationAResult,
    validationRealB: validationBResult,
    validationRealC: validationCResult,
    officialRemainder: remainderResult,
    priorReal,
    real,
    errorAnalysis: analyzeProvider(realResults.filter(item => item.providerId === providerId)),
    performance: summarizePerformance(realResults.filter(item => item.providerId === providerId))
  }
}).sort((left, right) => right.real.accuracy - left.real.accuracy)

const realPairwise = holmAdjust(pairwise(realResults, providerIds))
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  caveat: 'The 765-case RealWorldQA total contains every official source question and uses one homogeneous exact multiple-choice metric. Published references are matched to the exact GGUF quantizations (Standard Q8_0 59.1%, Flash Q8_0 56.7%, Flash Q4_K_M-imatrix 54.9%). A deterministic VLMEvalKit can_infer audit produced zero extraction differences and zero pass/fail changes across all 2,295 outputs. This remains a local protocol corroboration rather than a bit-for-bit official reproduction because provider runtime and preprocessing implementations differ.',
  scorerParity: {
    totalExtractionDisagreements: scorerParity.totalExtractionDisagreements,
    totalPassVerdictChanges: scorerParity.totalPassVerdictChanges,
    report: 'visionpsy-realworldqa-vlmeval-parity.json'
  },
  selection: {
    validationA: validationRealA.dataset,
    validationB: validationRealB.dataset,
    validationC: validationRealC.dataset,
    officialRemainder: officialRemainder.dataset
  },
  statisticalVerdict: realPairwise.some(item => item.holmAdjustedP < 0.05) ? 'SIGNIFICANT_DIFFERENCE_AFTER_HOLM' : 'NO_CLEAR_WINNER_AFTER_HOLM',
  realPairwise,
  questionInventory: inventory(officialCases),
  suites: {
    priorRealWorldQa: { cases: 270, scoring: initialReal.dataset.scoring, sourceMd5: initialReal.dataset.sourceMd5 },
    officialRemainder: { cases: 495, report: 'visionpsy-three-way-realworldqa-remainder-495.json', scoring: officialRemainder.dataset.scoring, sourceMd5: officialRemainder.dataset.sourceMd5 },
    officialRealWorldQa: { cases: 765, scoring: 'multiple-choice exact', sourceMd5: initialReal.dataset.sourceMd5 }
  },
  providers
}

const jsonPath = path.join(reportsDir, 'visionpsy-three-way-realworldqa-765.json')
const markdownPath = path.join(reportsDir, 'visionpsy-three-way-realworldqa-765.md')
const publicJsonPath = path.join(root, 'public', 'showcase', 'visionpsy-three-way-realworldqa-765.json')
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
await writeFile(markdownPath, markdown(report))
await writeFile(publicJsonPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(markdown(report))

async function readReport(filename) {
  return JSON.parse(await readFile(path.join(reportsDir, filename), 'utf8'))
}

function result(summary) {
  return { passed: summary.passed, failed: summary.failed, cases: summary.cases, accuracy: summary.accuracy }
}

function combine(...items) {
  const passed = items.reduce((sum, item) => sum + item.passed, 0)
  const cases = items.reduce((sum, item) => sum + item.cases, 0)
  return { passed, failed: cases - passed, cases, accuracy: passed / cases }
}

function summarizePerformance(results) {
  const values = path => results.map(item => path.reduce((value, key) => value?.[key], item)).filter(Number.isFinite)
  const stat = path => {
    const items = values(path)
    return { count: items.length, mean: items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null, max: items.length ? Math.max(...items) : null }
  }
  return {
    ttftMs: stat(['metrics', 'timeToFirstTokenMs']),
    latencyMs: stat(['metrics', 'latencyMs']),
    tokensPerSecond: stat(['metrics', 'tokensPerSecond']),
    promptTokens: stat(['metrics', 'promptTokens']),
    processRssPeakBytes: stat(['metrics', 'resources', 'processRssPeakBytes'])
  }
}

function inventory(cases) {
  return {
    questions: cases.length,
    uniqueImageHashes: new Set(cases.map(item => item.imageSha256).filter(Boolean)).size,
    answerLetters: countBy(cases, item => item.expectedLetter),
    optionCounts: countBy(cases, item => Object.keys(item.options || {}).length),
    capabilities: countBy(cases, item => item.capability)
  }
}

function analyzeProvider(results) {
  const rows = results.map(result => ({ ...result, showcaseCase: caseLookup.get(result.caseId) }))
  const capabilityAccuracy = summarizeGroups(rows, row => row.capability || row.showcaseCase?.capability || 'Unknown')
  const expectedLetterAccuracy = summarizeGroups(rows, row => row.expectedLetter || row.showcaseCase?.expectedLetter || 'Unknown')
  const predictionBias = countBy(rows, row => row.evaluation?.predictedLetter || 'UNPARSEABLE')
  const confusionMatrix = {}
  for (const row of rows) {
    const expected = row.expectedLetter || row.showcaseCase?.expectedLetter || 'Unknown'
    const predicted = row.evaluation?.predictedLetter || 'UNPARSEABLE'
    confusionMatrix[expected] ||= {}
    confusionMatrix[expected][predicted] = (confusionMatrix[expected][predicted] || 0) + 1
  }
  const failures = rows.filter(row => row.evaluation?.status !== 'PASS')
  return {
    capabilityAccuracy,
    expectedLetterAccuracy,
    predictionBias,
    confusionMatrix,
    failureTypes: {
      wrongOption: failures.filter(row => /^[A-D]$/.test(row.evaluation?.predictedLetter || '')).length,
      unparseable: failures.filter(row => !/^[A-D]$/.test(row.evaluation?.predictedLetter || '')).length
    },
    failureExamples: failures.slice(0, 20).map(row => ({
      caseId: row.caseId,
      sourceIndex: row.sourceIndex,
      capability: row.capability || row.showcaseCase?.capability,
      question: row.showcaseCase?.question,
      expectedLetter: row.expectedLetter || row.showcaseCase?.expectedLetter,
      predictedLetter: row.evaluation?.predictedLetter || null,
      output: row.output
    }))
  }
}

function summarizeGroups(items, group) {
  const groups = new Map()
  for (const item of items) {
    const key = String(group(item))
    const current = groups.get(key) || { passed: 0, cases: 0 }
    current.cases += 1
    if (item.evaluation?.status === 'PASS') current.passed += 1
    groups.set(key, current)
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, { ...value, failed: value.cases - value.passed, accuracy: value.passed / value.cases }]))
}

function countBy(items, group) {
  const counts = {}
  for (const item of items) {
    const key = String(group(item))
    counts[key] = (counts[key] || 0) + 1
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

function markdown(combined) {
  const lines = [
    '# VisionPsy three-way · complete official RealWorldQA 765',
    '',
    `Generated: ${combined.generatedAt}`,
    '',
    '| Rank on official 765 | Model | Previous real 270 | Final remainder 495 | Local official-set 765 | Published matching GGUF | Deviation | Mean TTFT | Mean latency |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|'
  ]
  combined.providers.forEach((provider, index) => {
    lines.push(`| ${index + 1} | ${provider.label} | ${cell(provider.priorReal)} | ${cell(provider.officialRemainder)} | ${cell(provider.real)} | ${percent(provider.officialRealWorldQaAccuracy)} | ${signedPoints(provider.deviationFromOfficial)} | ${duration(provider.performance.ttftMs.mean)} | ${duration(provider.performance.latencyMs.mean)} |`)
  })
  lines.push('', `Statistical verdict: **${combined.statisticalVerdict.replaceAll('_', ' ')}**.`, '', `VLMEvalKit scorer parity: **${combined.scorerParity.totalExtractionDisagreements} extraction differences; ${combined.scorerParity.totalPassVerdictChanges} pass/fail changes**.`, '', 'Paired exact McNemar tests on all 765 official questions:', '')
  for (const pair of combined.realPairwise) lines.push(`- ${pair.leftLabel} vs ${pair.rightLabel}: unique wins ${pair.leftOnly}–${pair.rightOnly}; raw p=${pair.exactMcNemarP.toFixed(4)}; Holm-adjusted p=${pair.holmAdjustedP.toFixed(4)}.`)
  lines.push('', `Caveat: ${combined.caveat}`, '')
  return lines.join('\n')
}

function cell(item) { return `${item.passed}/${item.cases} (${percent(item.accuracy)})` }
function percent(value) { return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—' }
function signedPoints(value) { return Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)} pp` : '—' }
function duration(value) { return Number.isFinite(value) ? `${Math.round(value)} ms` : '—' }

function pairwise(results, ids) {
  const caseIds = [...new Set(results.map(item => item.caseId))]
  const pairs = []
  for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
      const leftId = ids[leftIndex]
      const rightId = ids[rightIndex]
      let leftOnly = 0
      let rightOnly = 0
      for (const caseId of caseIds) {
        const leftPass = results.find(item => item.caseId === caseId && item.providerId === leftId)?.evaluation?.status === 'PASS'
        const rightPass = results.find(item => item.caseId === caseId && item.providerId === rightId)?.evaluation?.status === 'PASS'
        if (leftPass && !rightPass) leftOnly += 1
        if (!leftPass && rightPass) rightOnly += 1
      }
      pairs.push({
        leftId,
        rightId,
        leftLabel: initialReal.summaries[leftId].label,
        rightLabel: initialReal.summaries[rightId].label,
        leftOnly,
        rightOnly,
        exactMcNemarP: exactMcnemar(leftOnly, rightOnly)
      })
    }
  }
  return pairs
}

function exactMcnemar(leftOnly, rightOnly) {
  const total = leftOnly + rightOnly
  if (!total) return 1
  let probability = 0
  for (let successes = 0; successes <= Math.min(leftOnly, rightOnly); successes += 1) probability += choose(total, successes) * (0.5 ** total)
  return Math.min(1, probability * 2)
}

function holmAdjust(items) {
  const ranked = items.map((item, index) => ({ item, index })).sort((left, right) => left.item.exactMcNemarP - right.item.exactMcNemarP)
  let previous = 0
  const adjusted = Array(items.length)
  ranked.forEach((entry, rank) => {
    previous = Math.max(previous, Math.min(1, entry.item.exactMcNemarP * (items.length - rank)))
    adjusted[entry.index] = { ...entry.item, holmAdjustedP: previous }
  })
  return adjusted
}

function choose(total, selected) {
  let value = 1
  for (let index = 1; index <= selected; index += 1) value = value * (total - selected + index) / index
  return value
}
