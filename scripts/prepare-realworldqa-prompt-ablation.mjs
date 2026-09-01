import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHOWCASE_CASES } from '../src/showcase/index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportsDir = path.join(root, 'reports')
const runName = 'visionpsy-three-way-realworldqa-765-qvac-sdk-unified-0182.json'
const run = JSON.parse(await readFile(path.join(reportsDir, runName), 'utf8'))
const providerIds = ['qvac-visionpsy-standard-q8', 'qvac-visionpsy', 'qvac-visionpsy-flash-q4']
const cases = SHOWCASE_CASES.filter(item => Number.isInteger(item.sourceIndex)).map(item => enrich(item))
const capabilityGroups = Map.groupBy(cases, item => item.capability)
const rare = cases.filter(item => capabilityGroups.get(item.capability).length < 20)
const largeCapabilityNames = [...capabilityGroups].filter(([, items]) => items.length >= 20).map(([name]) => name).sort()
const selected = [...rare]
for (const capability of largeCapabilityNames) selected.push(...balancedTake(capabilityGroups.get(capability), 17))

if (selected.length !== 120) throw new Error(`Expected 120 selected cases, received ${selected.length}`)
if (new Set(selected.map(item => item.id)).size !== selected.length) throw new Error('Prompt-ablation selection contains duplicates')

const selection = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  seed: 'qvac-realworldqa-prompt-parity-v1',
  sourceRun: runName,
  sourceMd5: run.dataset.sourceMd5,
  policy: 'Include all 18 cases from capabilities with fewer than 20 examples, then select 17 cases from each of the six large capabilities by round-robin agreement state and expected answer letter with deterministic hash ordering.',
  cases: selected.sort((a, b) => a.sourceIndex - b.sourceIndex).map(item => ({
    caseId: item.id,
    sourceIndex: item.sourceIndex,
    capability: item.capability,
    agreementState: item.agreementState,
    expectedLetter: item.expectedLetter,
    baselinePasses: item.baselinePasses,
    imageSha256: item.imageSha256,
    currentPrompt: item.prompt,
    officialVlmevalPrompt: officialPrompt(item)
  })),
  inventory: {
    cases: selected.length,
    uniqueImages: new Set(selected.map(item => item.imageSha256)).size,
    capabilities: countBy(selected, item => item.capability),
    agreementStates: countBy(selected, item => item.agreementState),
    expectedLetters: countBy(selected, item => item.expectedLetter)
  }
}

const problemAudit = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceRun: runName,
  totalCases: cases.length,
  allCorrect: cases.filter(item => item.agreementState === 'all_correct').length,
  problematicCases: cases.filter(item => item.agreementState !== 'all_correct').length,
  allWrong: cases.filter(item => item.agreementState === 'all_wrong').length,
  disagreements: cases.filter(item => item.agreementState === 'one_correct' || item.agreementState === 'two_correct').length,
  byCapability: Object.fromEntries([...capabilityGroups].sort(([a], [b]) => a.localeCompare(b)).map(([capability, items]) => [capability, {
    cases: items.length,
    allCorrect: items.filter(item => item.agreementState === 'all_correct').length,
    allWrong: items.filter(item => item.agreementState === 'all_wrong').length,
    oneCorrect: items.filter(item => item.agreementState === 'one_correct').length,
    twoCorrect: items.filter(item => item.agreementState === 'two_correct').length,
    problemRate: items.filter(item => item.agreementState !== 'all_correct').length / items.length
  }])),
  recurrentWrongPredictions: recurrentWrongPredictions(cases),
  cases: cases.filter(item => item.agreementState !== 'all_correct').map(item => ({
    caseId: item.id,
    sourceIndex: item.sourceIndex,
    capability: item.capability,
    expectedLetter: item.expectedLetter,
    agreementState: item.agreementState,
    predictions: item.predictions,
    question: item.question,
    options: item.options,
    imageUrl: item.imageUrl,
    imageSha256: item.imageSha256
  }))
}

await writeFile(path.join(reportsDir, 'visionpsy-realworldqa-problem-audit-qvac-sdk-unified.json'), `${JSON.stringify(problemAudit, null, 2)}\n`)
await writeFile(path.join(reportsDir, 'visionpsy-realworldqa-prompt-ablation-120-selection.json'), `${JSON.stringify(selection, null, 2)}\n`)
await writeFile(path.join(reportsDir, 'visionpsy-realworldqa-problem-audit-qvac-sdk-unified.md'), markdown(problemAudit, selection))
process.stdout.write(markdown(problemAudit, selection))

function enrich(item) {
  const rows = providerIds.map(providerId => run.results.find(row => row.caseId === item.id && row.providerId === providerId))
  const baselinePasses = rows.filter(row => row?.evaluation?.status === 'PASS').length
  return {
    ...item,
    baselinePasses,
    agreementState: baselinePasses === 3 ? 'all_correct' : baselinePasses === 2 ? 'two_correct' : baselinePasses === 1 ? 'one_correct' : 'all_wrong',
    predictions: Object.fromEntries(providerIds.map((providerId, index) => [providerId, rows[index]?.evaluation?.predictedLetter || null]))
  }
}

function balancedTake(items, count) {
  const buckets = Map.groupBy(items, item => `${item.agreementState}:${item.expectedLetter}`)
  for (const values of buckets.values()) values.sort((a, b) => stableHash(a.id).localeCompare(stableHash(b.id)))
  const orderedKeys = [...buckets.keys()].sort()
  const chosen = []
  while (chosen.length < count) {
    let added = false
    for (const key of orderedKeys) {
      const item = buckets.get(key).shift()
      if (!item) continue
      chosen.push(item)
      added = true
      if (chosen.length === count) break
    }
    if (!added) break
  }
  return chosen
}

function recurrentWrongPredictions(items) {
  const patterns = new Map()
  for (const item of items.filter(value => value.agreementState === 'all_wrong')) {
    const predicted = providerIds.map(id => item.predictions[id]).join('/')
    const key = `${item.expectedLetter}->${predicted}`
    patterns.set(key, (patterns.get(key) || 0) + 1)
  }
  return Object.fromEntries([...patterns.entries()].sort((a, b) => b[1] - a[1]))
}

function officialPrompt(item) {
  return `Question: ${item.question}\nOptions:\n${Object.entries(item.options).map(([key, value]) => `${key}. ${value}`).join('\n')}\nPlease select the correct answer from the options above.`
}

function stableHash(value) { return createHash('sha256').update(`qvac-realworldqa-prompt-parity-v1:${value}`).digest('hex') }
function countBy(items, group) { const result = {}; for (const item of items) { const key = String(group(item)); result[key] = (result[key] || 0) + 1 } return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b))) }
function markdown(audit, selection) {
  const lines = ['# VisionPsy RealWorldQA problem audit', '', `Generated: ${audit.generatedAt}`, '', `- Problematic: ${audit.problematicCases}/${audit.totalCases}.`, `- All wrong: ${audit.allWrong}; model disagreements: ${audit.disagreements}.`, `- Prompt-ablation sample: ${selection.inventory.cases} cases; ${selection.inventory.uniqueImages} unique images.`, '', '| Capability | Cases | All correct | All wrong | One correct | Two correct | Problem rate |', '|---|---:|---:|---:|---:|---:|---:|']
  for (const [capability, item] of Object.entries(audit.byCapability).sort((a, b) => b[1].cases - a[1].cases)) lines.push(`| ${capability} | ${item.cases} | ${item.allCorrect} | ${item.allWrong} | ${item.oneCorrect} | ${item.twoCorrect} | ${(item.problemRate * 100).toFixed(1)}% |`)
  lines.push('', `Selection policy: ${selection.policy}`, '')
  return lines.join('\n')
}
