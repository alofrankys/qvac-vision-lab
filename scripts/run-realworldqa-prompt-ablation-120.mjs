import { createHash } from 'node:crypto'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportsDir = path.join(root, 'reports')
const baseUrl = process.env.QVAC_SHOWCASE_URL || 'http://127.0.0.1:8878'
const selectionName = 'visionpsy-realworldqa-prompt-ablation-120-selection.json'
const baselineName = 'visionpsy-three-way-realworldqa-765-qvac-sdk-unified-0182.json'
const reportStem = 'visionpsy-realworldqa-prompt-ablation-120-qvac-sdk-unified'
const checkpointPath = path.join(reportsDir, `.${reportStem}.checkpoint.ndjson`)
const providerIds = ['qvac-visionpsy-standard-q8', 'qvac-visionpsy', 'qvac-visionpsy-flash-q4']
const labels = {
  'qvac-visionpsy-standard-q8': 'VisionPsy Standard Q8',
  'qvac-visionpsy': 'VisionPsy Flash Q8',
  'qvac-visionpsy-flash-q4': 'VisionPsy Flash Q4 imatrix'
}

const selection = JSON.parse(await readFile(path.join(reportsDir, selectionName), 'utf8'))
const baselineRun = JSON.parse(await readFile(path.join(reportsDir, baselineName), 'utf8'))
const catalogResponse = await fetch(`${baseUrl}/api/showcase`)
if (!catalogResponse.ok) throw new Error(`Showcase API returned HTTP ${catalogResponse.status}`)
const catalog = await catalogResponse.json()
const catalogCases = new Map(catalog.cases.map(item => [item.id, item]))
for (const providerId of providerIds) {
  const provider = catalog.providers.find(item => item.id === providerId)
  if (!provider?.ready) throw new Error(`${labels[providerId]} unavailable: ${provider?.reason || 'missing status'}`)
}

const cases = [...selection.cases].sort((a, b) => stableHash(a.caseId).localeCompare(stableHash(b.caseId)))
for (const item of cases) if (!catalogCases.has(item.caseId)) throw new Error(`Missing catalog case ${item.caseId}`)

process.stdout.write('Warm-up: all three QVAC providers\n')
for (const providerId of providerIds) await infer(cases[0], providerId, true)

let results = []
try {
  results = (await readFile(checkpointPath, 'utf8')).split('\n').filter(Boolean).map(JSON.parse)
  const valid = new Set(cases.map(item => item.caseId))
  const seen = new Set()
  results = results.filter(item => {
    const key = `${item.caseId}:${item.providerId}`
    if (!valid.has(item.caseId) || !providerIds.includes(item.providerId) || seen.has(key)) return false
    seen.add(key)
    return true
  })
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (!results.length) await writeFile(checkpointPath, '')
else process.stdout.write(`Resuming from ${results.length}/${cases.length * providerIds.length} inferences\n`)

for (const [caseIndex, item] of cases.entries()) {
  const order = rotate(providerIds, caseIndex)
  for (const [orderIndex, providerId] of order.entries()) {
    if (results.some(row => row.caseId === item.caseId && row.providerId === providerId)) continue
    process.stdout.write(`[${caseIndex + 1}/${cases.length} · ${orderIndex + 1}/3] ${item.caseId} → ${labels[providerId]}\n`)
    const result = await infer(item, providerId, false)
    const row = { caseIndex, executionOrder: order, orderIndex, ...result }
    results.push(row)
    await appendFile(checkpointPath, `${JSON.stringify(row)}\n`)
  }
  const complete = completeCases(results)
  if (complete && (complete % 10 === 0 || complete === cases.length)) process.stdout.write(`${progress(results, complete)}\n`)
}

const providers = Object.fromEntries(providerIds.map(providerId => [providerId, summarize(providerId)]))
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  protocol: 'RealWorldQA prompt ablation · current answer-letter suffix versus upstream VLMEvalKit ImageMCQ prompt',
  sourceMd5: selection.sourceMd5,
  selection: { source: selectionName, cases: cases.length, uniqueImages: new Set(cases.map(item => item.imageSha256)).size, seed: selection.seed, policy: selection.policy },
  runtime: '@qvac/sdk 0.18.2 · @qvac/llm-llamacpp 0.47.0 · qvac-fabric-llm.cpp · Metal',
  controls: { sameImages: true, sameModels: true, sameBackend: true, sameGoldAnswers: true, sameMaxTokens: true, providerOrder: 'deterministically shuffled cases with balanced cyclic provider order', changedVariable: 'prompt wording only' },
  prompts: { current: '<question> + options + Answer with only the letter of the correct option.', vlmeval: 'Question: <question>\\nOptions:\\n...\\nPlease select the correct answer from the options above.' },
  providers,
  results
}

await writeFile(path.join(reportsDir, `${reportStem}.json`), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(path.join(reportsDir, `${reportStem}.md`), markdown(report))
process.stdout.write(`\n${markdown(report)}\n`)

async function infer(item, providerId, warmup) {
  const showcaseCase = catalogCases.get(item.caseId)
  const startedAt = new Date().toISOString()
  const response = await fetch(`${baseUrl}/api/showcase/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: item.caseId, imageTitle: showcaseCase.title, prompt: item.officialVlmevalPrompt, providerId, maxTokens: 16, conversation: [] })
  })
  const text = await response.text()
  const events = text.split('\n').filter(Boolean).map(line => JSON.parse(line))
  const failure = events.find(event => event.type === 'error')
  if (!response.ok || failure) throw new Error(`${labels[providerId]} failed on ${item.caseId}: ${failure?.error || `HTTP ${response.status}`}`)
  const complete = events.findLast(event => event.type === 'complete')
  if (!complete) throw new Error(`No completion for ${item.caseId} / ${providerId}`)
  return { warmup, caseId: item.caseId, sourceIndex: item.sourceIndex, capability: item.capability, expectedLetter: item.expectedLetter, agreementState: item.agreementState, providerId, requestStartedAt: startedAt, promptVariant: 'vlmeval_official', prompt: item.officialVlmevalPrompt, output: complete.output, evaluation: complete.evaluation, metrics: complete.metrics, retryCount: 0 }
}

function summarize(providerId) {
  const current = cases.map(item => baselineRun.results.find(row => row.caseId === item.caseId && row.providerId === providerId))
  const vlmeval = cases.map(item => results.find(row => row.caseId === item.caseId && row.providerId === providerId))
  const currentPass = current.filter(row => row?.evaluation?.status === 'PASS').length
  const vlmevalPass = vlmeval.filter(row => row?.evaluation?.status === 'PASS').length
  let gained = 0
  let lost = 0
  let unchangedCorrect = 0
  let unchangedWrong = 0
  const changedCases = []
  for (const item of cases) {
    const before = baselineRun.results.find(row => row.caseId === item.caseId && row.providerId === providerId)
    const after = results.find(row => row.caseId === item.caseId && row.providerId === providerId)
    const beforePass = before?.evaluation?.status === 'PASS'
    const afterPass = after?.evaluation?.status === 'PASS'
    if (!beforePass && afterPass) gained += 1
    else if (beforePass && !afterPass) lost += 1
    else if (beforePass) unchangedCorrect += 1
    else unchangedWrong += 1
    if (beforePass !== afterPass || before?.evaluation?.predictedLetter !== after?.evaluation?.predictedLetter) changedCases.push({ caseId: item.caseId, capability: item.capability, expectedLetter: item.expectedLetter, currentPrediction: before?.evaluation?.predictedLetter, vlmevalPrediction: after?.evaluation?.predictedLetter, currentPass: beforePass, vlmevalPass: afterPass })
  }
  return { label: labels[providerId], cases: cases.length, current: { passed: currentPass, accuracy: currentPass / cases.length }, vlmeval: { passed: vlmevalPass, accuracy: vlmevalPass / cases.length }, deltaAnswers: vlmevalPass - currentPass, deltaAccuracy: (vlmevalPass - currentPass) / cases.length, gained, lost, unchangedCorrect, unchangedWrong, exactMcNemarP: exactMcnemar(gained, lost), changedOutputs: changedCases.length, changedCases, capability: Object.fromEntries([...new Set(cases.map(item => item.capability))].sort().map(capability => [capability, capabilitySummary(providerId, capability)])) }
}

function capabilitySummary(providerId, capability) {
  const selected = cases.filter(item => item.capability === capability)
  const before = selected.filter(item => baselineRun.results.find(row => row.caseId === item.caseId && row.providerId === providerId)?.evaluation?.status === 'PASS').length
  const after = selected.filter(item => results.find(row => row.caseId === item.caseId && row.providerId === providerId)?.evaluation?.status === 'PASS').length
  return { cases: selected.length, currentPassed: before, vlmevalPassed: after, delta: after - before }
}

function completeCases(rows) { return Math.floor(rows.length / providerIds.length) }
function progress(rows, complete) { return `PROGRESS ${complete}/${cases.length} · ${providerIds.map(id => { const done = rows.filter(row => row.providerId === id); const passed = done.filter(row => row.evaluation?.status === 'PASS').length; return `${labels[id]} ${passed}/${done.length}` }).join(' · ')}` }
function rotate(items, offset) { const shift = offset % items.length; return [...items.slice(shift), ...items.slice(0, shift)] }
function stableHash(value) { return createHash('sha256').update(`${selection.seed}:run-order:${value}`).digest('hex') }
function exactMcnemar(gained, lost) { const n = gained + lost; if (!n) return 1; let p = 0; for (let k = 0; k <= Math.min(gained, lost); k += 1) p += choose(n, k) * 0.5 ** n; return Math.min(1, 2 * p) }
function choose(n, k) { let value = 1; for (let i = 1; i <= k; i += 1) value = value * (n - k + i) / i; return value }
function percent(value) { return `${(value * 100).toFixed(1)}%` }
function markdown(report) { const lines = ['# RealWorldQA prompt ablation · 120 cases', '', `Generated: ${report.generatedAt}`, '', '| Model | Current prompt | VLMEvalKit prompt | Delta | Gains–losses | Exact p |', '|---|---:|---:|---:|---:|---:|']; for (const providerId of providerIds) { const item = report.providers[providerId]; lines.push(`| ${item.label} | ${item.current.passed}/${item.cases} (${percent(item.current.accuracy)}) | ${item.vlmeval.passed}/${item.cases} (${percent(item.vlmeval.accuracy)}) | ${item.deltaAnswers >= 0 ? '+' : ''}${item.deltaAnswers} | ${item.gained}–${item.lost} | ${item.exactMcNemarP.toFixed(4)} |`) } lines.push('', `Controls: ${Object.entries(report.controls).map(([key, value]) => `${key}=${value}`).join('; ')}.`, ''); return lines.join('\n') }
