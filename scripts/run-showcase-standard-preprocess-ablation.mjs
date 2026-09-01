import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.QVAC_SHOWCASE_URL || 'http://127.0.0.1:8879'
const providerId = 'visionpsy-patched-base'
const correctedPath = path.join(root, 'reports', 'visionpsy-three-way-realworldqa-20.json')
const corrected = JSON.parse(await readFile(correctedPath, 'utf8'))
const catalogResponse = await fetch(`${baseUrl}/api/showcase`)
if (!catalogResponse.ok) throw new Error(`Ablation API returned HTTP ${catalogResponse.status}`)
const catalog = await catalogResponse.json()
const cases = catalog.cases.filter(item => item.group === 'official-real')
const provider = catalog.providers.find(item => item.id === providerId)
if (!provider?.ready) throw new Error(`Standard provider unavailable: ${provider?.reason || 'missing'}`)

process.stdout.write('Excluded warm-up: Standard Q8 with no-upscale diagnostic\n')
await run(cases[0])
const diagnosticResults = []
for (const [index, showcaseCase] of cases.entries()) {
  process.stdout.write(`[${index + 1}/${cases.length}] ${showcaseCase.id}\n`)
  diagnosticResults.push(await run(showcaseCase))
}

const officialResults = corrected.results.filter(item => item.providerId === providerId)
let officialOnly = 0
let diagnosticOnly = 0
let bothPass = 0
let bothFail = 0
const disagreements = []
for (const showcaseCase of cases) {
  const official = officialResults.find(item => item.caseId === showcaseCase.id)
  const diagnostic = diagnosticResults.find(item => item.caseId === showcaseCase.id)
  const officialPass = official?.evaluation?.status === 'PASS'
  const diagnosticPass = diagnostic?.evaluation?.status === 'PASS'
  if (officialPass && diagnosticPass) bothPass += 1
  else if (!officialPass && !diagnosticPass) bothFail += 1
  else if (officialPass) { officialOnly += 1; disagreements.push({ caseId: showcaseCase.id, winner: 'official-standard-tiled-upscale' }) }
  else { diagnosticOnly += 1; disagreements.push({ caseId: showcaseCase.id, winner: 'diagnostic-standard-no-upscale' }) }
}

const report = {
  schemaVersion: 1,
  protocol: 'VisionPsy Standard preprocessing ablation · RealWorldQA official 20-case sample',
  finishedAt: new Date().toISOString(),
  datasetMd5: cases[0]?.sourceMd5,
  official: summary(officialResults),
  diagnosticNoUpscale: summary(diagnosticResults),
  paired: {
    bothPass,
    bothFail,
    officialOnly,
    diagnosticOnly,
    discordant: officialOnly + diagnosticOnly,
    exactMcNemarP: exactMcNemar(officialOnly, diagnosticOnly),
    disagreements
  },
  diagnosticResults
}
const jsonPath = path.join(root, 'reports', 'visionpsy-standard-preprocess-ablation.json')
const markdownPath = path.join(root, 'reports', 'visionpsy-standard-preprocess-ablation.md')
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
await writeFile(markdownPath, markdown(report))
process.stdout.write(`\n${markdown(report)}\nSaved ${jsonPath}\nSaved ${markdownPath}\n`)

async function run(showcaseCase) {
  const response = await fetch(`${baseUrl}/api/showcase/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId: showcaseCase.id, imageTitle: showcaseCase.title, prompt: showcaseCase.prompt, providerId, maxTokens: 16, conversation: [] })
  })
  const events = (await response.text()).split('\n').filter(Boolean).map(line => JSON.parse(line))
  const failure = events.find(item => item.type === 'error')
  if (failure) throw new Error(`${showcaseCase.id}: ${failure.error}`)
  const complete = events.findLast(item => item.type === 'complete')
  if (!complete) throw new Error(`${showcaseCase.id}: missing complete event`)
  return { caseId: showcaseCase.id, sourceIndex: showcaseCase.sourceIndex, output: complete.output, evaluation: complete.evaluation, metrics: complete.metrics }
}

function summary(items) {
  const passed = items.filter(item => item.evaluation?.status === 'PASS').length
  const values = key => items.map(item => key.split('.').reduce((value, part) => value?.[part], item)).filter(Number.isFinite)
  const mean = key => { const found = values(key); return found.length ? found.reduce((sum, value) => sum + value, 0) / found.length : null }
  return {
    passed,
    cases: items.length,
    accuracy: passed / items.length,
    meanTtftMs: mean('metrics.timeToFirstTokenMs'),
    meanLatencyMs: mean('metrics.latencyMs'),
    meanTokensPerSecond: mean('metrics.tokensPerSecond'),
    meanPromptTokens: mean('metrics.promptTokens'),
    preprocessPolicies: [...new Set(items.map(item => item.metrics?.preprocessPolicy).filter(Boolean))]
  }
}

function exactMcNemar(left, right) {
  const n = left + right
  if (!n) return 1
  const tail = Math.min(left, right)
  let p = 0
  for (let k = 0; k <= tail; k += 1) p += choose(n, k) * (0.5 ** n)
  return Math.min(1, 2 * p)
}

function choose(n, k) {
  let value = 1
  for (let i = 1; i <= k; i += 1) value = value * (n - k + i) / i
  return value
}

function markdown(report) {
  const official = report.official
  const diagnostic = report.diagnosticNoUpscale
  return [
    '# VisionPsy Standard preprocessing ablation',
    '',
    `- Dataset: 20 official RealWorldQA cases; MD5 \`${report.datasetMd5}\`.`,
    `- Official Standard tiling/upscale: ${official.passed}/${official.cases} (${percent(official.accuracy)}), mean TTFT ${Math.round(official.meanTtftMs)} ms, mean prompt ${official.meanPromptTokens.toFixed(1)} tokens.`,
    `- Diagnostic Standard no-upscale: ${diagnostic.passed}/${diagnostic.cases} (${percent(diagnostic.accuracy)}), mean TTFT ${Math.round(diagnostic.meanTtftMs)} ms, mean prompt ${diagnostic.meanPromptTokens.toFixed(1)} tokens.`,
    `- Paired discordance: official-only ${report.paired.officialOnly}, diagnostic-only ${report.paired.diagnosticOnly}; exact McNemar p=${report.paired.exactMcNemarP.toFixed(4)}.`,
    '',
    'This small sample estimates preprocessing sensitivity; it is not the full official benchmark.'
  ].join('\n') + '\n'
}

function percent(value) { return `${(value * 100).toFixed(1)}%` }
