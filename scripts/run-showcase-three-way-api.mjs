import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
  MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1,
  VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M,
  VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M_1,
  VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
  VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1
} from '@qvac/sdk'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.QVAC_SHOWCASE_URL || 'http://127.0.0.1:8878'
const suiteId = process.env.QVAC_SHOWCASE_SUITE || 'official-real'
const runId = sanitizeRunId(process.env.QVAC_SHOWCASE_RUN_ID || '')
const shuffleSeed = String(process.env.QVAC_SHOWCASE_SHUFFLE_SEED || '')
const reportPrefix = sanitizeRunId(process.env.QVAC_SHOWCASE_REPORT_PREFIX || 'visionpsy-three-way') || 'visionpsy-three-way'
const interInferenceDelayMs = nonNegativeInteger(process.env.QVAC_SHOWCASE_INTER_INFERENCE_DELAY_MS, 0)
const batchPauseEvery = nonNegativeInteger(process.env.QVAC_SHOWCASE_BATCH_PAUSE_EVERY, 0)
const batchPauseMs = nonNegativeInteger(process.env.QVAC_SHOWCASE_BATCH_PAUSE_MS, 0)
const maximumLoad1 = nonNegativeNumber(process.env.QVAC_SHOWCASE_MAX_LOAD1, 0)
const loadPollMs = positiveInteger(process.env.QVAC_SHOWCASE_LOAD_POLL_MS, 60000)
const vlmevalkitRevision = '470e51787a351764057869304e425bc76170bdc6'
const vlmevalkitScorerSha256 = '06088ed4da68cd9d8c3018e7630d0503f1365e6dd31f651cbedd8aa44dc14466'
const suites = Object.freeze({
  'official-real': { expectedCount: 20, slug: 'realworldqa-20', name: 'RealWorldQA official real-image sample', group: item => item.group === 'official-real', scoring: 'multiple-choice exact', prompt: 'benchmark-native question and options; answer-letter-only suffix' },
  'validation-real': { expectedCount: 50, slug: 'realworldqa-validation-50', name: 'RealWorldQA content-blind validation sample', group: item => item.group === 'validation-real', scoring: 'multiple-choice exact', prompt: 'benchmark-native question and options; answer-letter-only suffix' },
  'validation-real-b': { expectedCount: 50, slug: 'realworldqa-validation-50-b', name: 'RealWorldQA second content-blind validation sample', group: item => item.group === 'validation-real-b', scoring: 'multiple-choice exact', prompt: 'benchmark-native question and options; answer-letter-only suffix' },
  'validation-real-c': { expectedCount: 150, slug: 'realworldqa-validation-150-c', name: 'RealWorldQA extended content-blind validation sample', group: item => item.group === 'validation-real-c', scoring: 'multiple-choice exact', prompt: 'benchmark-native question and options; answer-letter-only suffix' },
  'official-remainder': { expectedCount: 495, slug: 'realworldqa-remainder-495', name: 'RealWorldQA complete official remainder', group: item => item.group === 'official-remainder', scoring: 'multiple-choice exact', prompt: 'benchmark-native question and options; answer-letter-only suffix' },
  'official-all': { expectedCount: 765, slug: 'realworldqa-765', name: 'complete official RealWorldQA', group: item => Number.isInteger(item.sourceIndex), scoring: 'RealWorldQA multiple-choice exact', prompt: 'official question and options with answer-letter suffix' }
})
const suite = suites[suiteId]
if (!suite) throw new Error(`Unknown QVAC_SHOWCASE_SUITE: ${suiteId}`)
const reportsDir = path.join(root, 'reports')
await mkdir(reportsDir, { recursive: true })
const reportStem = `${reportPrefix}-${suite.slug}${runId ? `-${runId}` : ''}`
const checkpointPath = path.join(reportsDir, `.${reportStem}.checkpoint.ndjson`)
const resumeEnabled = process.env.QVAC_SHOWCASE_RESUME === '1'
const defaultProviderIds = Object.freeze(['qvac-visionpsy-standard-q8', 'qvac-visionpsy', 'qvac-visionpsy-flash-q4'])
const availableProviderIds = Object.freeze([...defaultProviderIds, 'qvac-visionpsy-standard-q4'])
const requestedProviderIds = String(process.env.QVAC_SHOWCASE_PROVIDER_IDS || '').split(',').map(value => value.trim()).filter(Boolean)
const providerIds = Object.freeze(requestedProviderIds.length ? [...new Set(requestedProviderIds)] : [...defaultProviderIds])
if (providerIds.some(providerId => !availableProviderIds.includes(providerId))) throw new Error(`Unknown QVAC_SHOWCASE_PROVIDER_IDS value; available providers: ${availableProviderIds.join(', ')}`)
const providerLabels = Object.freeze({
  'qvac-visionpsy-standard-q8': 'VisionPsy Standard Q8 (QVAC SDK)',
  'qvac-visionpsy-standard-q4': 'VisionPsy Standard Q4 imatrix (QVAC SDK)',
  'qvac-visionpsy': 'VisionPsy Flash Q8 (QVAC SDK)',
  'qvac-visionpsy-flash-q4': 'VisionPsy Flash Q4 imatrix (QVAC SDK)'
})
const artifactSources = Object.freeze({
  'qvac-visionpsy-standard-q8': { model: VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1, projector: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1 },
  'qvac-visionpsy-standard-q4': { model: VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M_1, projector: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0_1 },
  'qvac-visionpsy': { model: VISIONPSY_NANO_460M_MULTIMODAL_Q8_0, projector: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0 },
  'qvac-visionpsy-flash-q4': { model: VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M, projector: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0 }
})

const response = await fetch(`${baseUrl}/api/showcase`)
if (!response.ok) throw new Error(`Showcase API returned HTTP ${response.status}`)
const catalog = await response.json()
const selectedCases = catalog.cases.filter(suite.group)
const cases = shuffleSeed ? deterministicShuffle(selectedCases, shuffleSeed) : selectedCases
if (cases.length !== suite.expectedCount) throw new Error(`Expected ${suite.expectedCount} ${suiteId} cases, received ${cases.length}`)
for (const providerId of providerIds) {
  const provider = catalog.providers.find(item => item.id === providerId)
  if (!provider?.ready) throw new Error(`${providerLabels[providerId]} is unavailable: ${provider?.reason || 'missing status'}`)
}

const startedAt = new Date().toISOString()
const warmups = []
for (const [index, providerId] of providerIds.entries()) {
  await waitForLoadHeadroom(`warm-up ${index + 1}/${providerIds.length}`)
  process.stdout.write(`Warm-up ${index + 1}/${providerIds.length}: ${providerLabels[providerId]}\n`)
  warmups.push(await runCaseWithRetries(cases[0], providerId, true))
}

let results = []
if (resumeEnabled) {
  try {
    const checkpoint = await readFile(checkpointPath, 'utf8')
    results = checkpoint.split('\n').filter(Boolean).map(line => JSON.parse(line))
    const validCaseIds = new Set(cases.map(item => item.id))
    const seen = new Set()
    results = results.filter(item => {
      const key = `${item.caseId}:${item.providerId}`
      if (!validCaseIds.has(item.caseId) || !providerIds.includes(item.providerId) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (results.length) process.stdout.write(`Resuming from ${results.length}/${cases.length * providerIds.length} checkpointed inferences.\n`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
if (!resumeEnabled || !results.length) await writeFile(checkpointPath, '')
for (const [caseIndex, showcaseCase] of cases.entries()) {
  const order = rotate(providerIds, caseIndex)
  for (const [orderIndex, providerId] of order.entries()) {
    if (results.some(item => item.caseId === showcaseCase.id && item.providerId === providerId)) continue
    await waitForLoadHeadroom(`case ${caseIndex + 1}/${cases.length}`)
    process.stdout.write(`[${caseIndex + 1}/${cases.length} · ${orderIndex + 1}/${providerIds.length}] ${showcaseCase.id} → ${providerLabels[providerId]}\n`)
    const result = await runCaseWithRetries(showcaseCase, providerId, false)
    const checkpointed = { caseIndex, executionOrder: order, orderIndex, ...result }
    results.push(checkpointed)
    await appendFile(checkpointPath, `${JSON.stringify(checkpointed)}\n`)
    const completedInferences = results.filter(item => !item.warmup).length
    const totalInferences = cases.length * providerIds.length
    if (completedInferences < totalInferences && interInferenceDelayMs) await pacedPause(interInferenceDelayMs, 'inter-inference')
    if (completedInferences < totalInferences && batchPauseEvery && batchPauseMs && completedInferences % batchPauseEvery === 0) await pacedPause(batchPauseMs, `batch boundary ${completedInferences}/${totalInferences}`)
  }
  const completeCases = results.filter(item => !item.warmup).length / providerIds.length
  if (Number.isInteger(completeCases)) process.stdout.write(`${progressLine(results, completeCases, cases.length)}\n`)
}

const summaries = Object.fromEntries(providerIds.map(providerId => [providerId, summarizeProvider(results.filter(item => item.providerId === providerId))]))
const pairwise = []
for (let leftIndex = 0; leftIndex < providerIds.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < providerIds.length; rightIndex += 1) {
    pairwise.push(comparePair(results, providerIds[leftIndex], providerIds[rightIndex], cases))
  }
}

const inferenceStartedAt = results.map(item => Date.parse(item.requestStartedAt)).filter(Number.isFinite).sort((a, b) => a - b)[0]
const inferenceFinishedAt = results.map(item => {
  const start = Date.parse(item.requestStartedAt)
  return Number.isFinite(start) ? start + (Number(item.metrics?.latencyMs) || 0) : null
}).filter(Number.isFinite).sort((a, b) => b - a)[0]

const report = {
  schemaVersion: 2,
  runId: runId || null,
  protocol: `QVAC Vision Lab Experiment 06 · ${suite.name} · ${providerIds.length === 1 ? 'single-provider addendum' : `${providerIds.length}-way`}${runId ? ` · ${runId}` : ''}`,
  baseUrl,
  startedAt: Number.isFinite(inferenceStartedAt) ? new Date(inferenceStartedAt).toISOString() : startedAt,
  finishedAt: Number.isFinite(inferenceFinishedAt) ? new Date(inferenceFinishedAt).toISOString() : new Date().toISOString(),
  dataset: {
    name: suite.name,
    suiteId,
    sourceMd5: cases[0]?.sourceMd5 || null,
    caseCount: cases.length,
    sourceIndices: cases.map(item => item.sourceIndex),
    scoring: suite.scoring,
    prompt: suite.prompt,
    promptTemplate: 'Question: <question>\\nOptions:\\nA. ...\\nPlease select the correct answer from the options above. ',
    imageMessageOrder: 'image before text',
    orderPolicy: providerIds.length === 1 ? 'single provider; case order fixed by the declared shuffle seed' : shuffleSeed ? `cases deterministically shuffled; provider order uses a balanced ${providerIds.length}-position Latin rotation` : 'provider order rotates by case index',
    shuffleSeed: shuffleSeed || null,
    warmupPolicy: 'one excluded warm-up per provider',
    inputManifest: cases.map(item => ({
      caseId: item.id,
      sourceIndex: item.sourceIndex,
      imageSha256: item.imageSha256,
      questionSha256: sha256(item.question),
      optionsSha256: sha256(stableJson(item.options)),
      promptSha256: sha256(item.prompt),
      expectedLetterSha256: sha256(item.expectedLetter)
    }))
  },
  reproducibility: {
    applicationCommit: gitValue(['rev-parse', 'HEAD']),
    applicationDirty: Boolean(gitValue(['status', '--porcelain'])),
    generation: { temp: 0, top_p: 1, top_k: 40, seed: 42, predict: 16 },
    scorer: {
      implementation: 'OpenCompass VLMEvalKit vlmeval/utils/matching_util.py can_infer',
      revision: vlmevalkitRevision,
      fileSha256: vlmevalkitScorerSha256
    },
    artifacts: Object.fromEntries(providerIds.map(providerId => [providerId, {
      model: artifactMetadata(artifactSources[providerId].model),
      projector: artifactMetadata(artifactSources[providerId].projector)
    }])),
    environment: {
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model || null,
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version
    },
    retryPolicy: 'up to three attempts for transport/runtime failure only; valid wrong answers are never retried',
    resourcePacing: {
      sequential: true,
      interInferenceDelayMs,
      batchPauseEvery: batchPauseEvery || null,
      batchPauseMs: batchPauseMs || null,
      maximumLoad1: maximumLoad1 || null,
      loadPollMs: maximumLoad1 ? loadPollMs : null,
      note: 'Pacing changes wall-clock duty cycle only; model, prompt, generation and scoring settings remain frozen.'
    }
  },
  providers: Object.fromEntries(providerIds.map(id => [id, catalog.providers.find(item => item.id === id)])),
  warmups,
  summaries,
  pairwise,
  results
}

const jsonPath = path.join(reportsDir, `${reportStem}.json`)
const markdownPath = path.join(reportsDir, `${reportStem}.md`)
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
await writeFile(markdownPath, markdownReport(report))
process.stdout.write(`\n${markdownReport(report)}\nSaved ${jsonPath}\nSaved ${markdownPath}\n`)

async function runCase(showcaseCase, providerId, warmup) {
  const requestStartedAt = new Date().toISOString()
  const response = await fetch(`${baseUrl}/api/showcase/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caseId: showcaseCase.id,
      imageTitle: showcaseCase.title,
      prompt: showcaseCase.prompt,
      providerId,
      maxTokens: showcaseCase.scoring === 'multiple_choice' ? 16 : ['vqa_consensus', 'exact_text'].includes(showcaseCase.scoring) ? 32 : 80,
      conversation: []
    })
  })
  const text = await response.text()
  const events = text.split('\n').filter(Boolean).map(line => JSON.parse(line))
  const failure = events.find(event => event.type === 'error')
  if (!response.ok || failure) throw new Error(`${providerLabels[providerId]} failed on ${showcaseCase.id}: ${failure?.error || `HTTP ${response.status}`}`)
  const complete = events.findLast(event => event.type === 'complete')
  if (!complete) throw new Error(`${providerLabels[providerId]} returned no complete event for ${showcaseCase.id}`)
  return {
    warmup,
    caseId: showcaseCase.id,
    sourceIndex: showcaseCase.sourceIndex,
    sourceDataset: showcaseCase.sourceDataset,
    capability: showcaseCase.capability,
    scoring: showcaseCase.scoring,
    expectedLetter: showcaseCase.expectedLetter,
    expectedAnswer: showcaseCase.expectedAnswer,
    providerId,
    requestStartedAt,
    output: complete.output,
    evaluation: complete.evaluation,
    metrics: complete.metrics
  }
}

async function runCaseWithRetries(showcaseCase, providerId, warmup, maxAttempts = 3) {
  const attempts = []
  const startedAt = Date.now()
  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = new Date().toISOString()
    try {
      const result = await runCase(showcaseCase, providerId, warmup)
      attempts.push({ attempt, startedAt: attemptStartedAt, finishedAt: new Date().toISOString(), status: 'complete' })
      return { ...result, retryCount: attempt - 1, attempts, endToEndWithRetriesMs: Date.now() - startedAt }
    } catch (error) {
      lastError = error
      attempts.push({ attempt, startedAt: attemptStartedAt, finishedAt: new Date().toISOString(), status: 'failed', error: error.message, code: error.code || null })
      if (attempt === maxAttempts) break
      process.stderr.write(`Retry ${attempt + 1}/${maxAttempts}: ${providerLabels[providerId]} on ${showcaseCase.id} after ${error.message}\n`)
      await new Promise(resolve => setTimeout(resolve, attempt * 1000))
    }
  }
  Object.assign(lastError, { attempts, retryCount: attempts.length - 1, endToEndWithRetriesMs: Date.now() - startedAt })
  throw lastError
}

function summarizeProvider(items) {
  const passed = items.filter(item => item.evaluation?.status === 'PASS').length
  const points = items.reduce((sum, item) => sum + (Number.isFinite(item.evaluation?.score) ? item.evaluation.score : item.evaluation?.status === 'PASS' ? 1 : 0), 0)
  const accuracy = items.length ? points / items.length : 0
  const interval = wilson(passed, items.length)
  const metrics = key => items.map(item => key.split('.').reduce((value, part) => value?.[part], item)).filter(Number.isFinite)
  const stat = key => summarizeValues(metrics(key))
  return {
    label: providerLabels[items[0]?.providerId],
    cases: items.length,
    passed,
    failed: items.length - passed,
    points,
    accuracy,
    wilson95: interval,
    latencyMs: stat('metrics.latencyMs'),
    ttftMs: stat('metrics.timeToFirstTokenMs'),
    tokensPerSecond: stat('metrics.tokensPerSecond'),
    promptTokens: stat('metrics.promptTokens'),
    outputTokens: stat('metrics.outputTokens'),
    processRssPeakBytes: stat('metrics.resources.processRssPeakBytes'),
    processCpuPeakPercent: stat('metrics.resources.processCpuPeakPercent'),
    systemRamDeltaBytes: stat('metrics.resources.systemRamDeltaBytes'),
    gpuUtilizationPeakPercent: stat('metrics.resources.gpuUtilizationPeakPercent'),
    preprocessPolicies: [...new Set(items.map(item => item.metrics?.preprocessPolicy).filter(Boolean))]
  }
}

function summarizeValues(values) {
  const ordered = [...values].sort((a, b) => a - b)
  return {
    count: values.length,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    median: percentile(ordered, 0.5),
    p95: percentile(ordered, 0.95),
    min: ordered[0] ?? null,
    max: ordered.at(-1) ?? null,
    sum: values.length ? values.reduce((sum, value) => sum + value, 0) : null
  }
}

function comparePair(results, leftId, rightId, cases) {
  let bothPass = 0
  let bothFail = 0
  let leftOnly = 0
  let rightOnly = 0
  const disagreements = []
  for (const showcaseCase of cases) {
    const left = results.find(item => item.caseId === showcaseCase.id && item.providerId === leftId)
    const right = results.find(item => item.caseId === showcaseCase.id && item.providerId === rightId)
    const leftPass = left?.evaluation?.status === 'PASS'
    const rightPass = right?.evaluation?.status === 'PASS'
    if (leftPass && rightPass) bothPass += 1
    else if (!leftPass && !rightPass) bothFail += 1
    else if (leftPass) { leftOnly += 1; disagreements.push({ caseId: showcaseCase.id, winner: leftId }) }
    else { rightOnly += 1; disagreements.push({ caseId: showcaseCase.id, winner: rightId }) }
  }
  return { leftId, rightId, bothPass, bothFail, leftOnly, rightOnly, discordant: leftOnly + rightOnly, exactMcNemarP: exactMcNemar(leftOnly, rightOnly), disagreements }
}

function exactMcNemar(leftOnly, rightOnly) {
  const n = leftOnly + rightOnly
  if (!n) return 1
  const tail = Math.min(leftOnly, rightOnly)
  let probability = 0
  for (let k = 0; k <= tail; k += 1) probability += choose(n, k) * (0.5 ** n)
  return Math.min(1, 2 * probability)
}

function choose(n, k) {
  let value = 1
  for (let i = 1; i <= k; i += 1) value = value * (n - k + i) / i
  return value
}

function wilson(successes, total) {
  if (!total) return { low: 0, high: 0 }
  const z = 1.959963984540054
  const p = successes / total
  const denominator = 1 + z ** 2 / total
  const center = (p + z ** 2 / (2 * total)) / denominator
  const margin = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * total)) / total) / denominator
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) }
}

function percentile(ordered, fraction) {
  if (!ordered.length) return null
  const index = (ordered.length - 1) * fraction
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return ordered[lower]
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)
}

function rotate(items, offset) {
  const shift = ((offset % items.length) + items.length) % items.length
  return [...items.slice(shift), ...items.slice(0, shift)]
}

function deterministicShuffle(items, seed) {
  return [...items].sort((left, right) => {
    const leftHash = sha256(`${seed}:${left.sourceIndex}:${left.id}`)
    const rightHash = sha256(`${seed}:${right.sourceIndex}:${right.id}`)
    return leftHash.localeCompare(rightHash) || String(left.id).localeCompare(String(right.id))
  })
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex')
}

function artifactMetadata(source) {
  return {
    registryPath: source.registryPath,
    revision: source.registryPath?.match(/\/resolve\/([a-f0-9]{40})\//)?.[1] || null,
    modelId: source.modelId,
    expectedSize: source.expectedSize,
    sha256: source.sha256Checksum,
    quantization: source.quantization
  }
}

function gitValue(args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() } catch { return null }
}

function sanitizeRunId(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

async function waitForLoadHeadroom(reason) {
  if (!maximumLoad1) return
  while (os.loadavg()[0] > maximumLoad1) {
    process.stdout.write(`LOAD GATE · ${os.loadavg()[0].toFixed(2)} > ${maximumLoad1.toFixed(2)} · waiting ${Math.round(loadPollMs / 1000)}s before ${reason}\n`)
    await new Promise(resolve => setTimeout(resolve, loadPollMs))
  }
}

async function pacedPause(milliseconds, reason) {
  process.stdout.write(`PAUSE ${Math.round(milliseconds / 1000)}s · ${reason}\n`)
  await new Promise(resolve => setTimeout(resolve, milliseconds))
}

function progressLine(results, completeCases, totalCases) {
  const scores = providerIds.map(providerId => {
    const items = results.filter(item => !item.warmup && item.providerId === providerId)
    const passed = items.filter(item => item.evaluation?.status === 'PASS').length
    return `${providerLabels[providerId]} ${passed}/${items.length} (${items.length ? (passed / items.length * 100).toFixed(1) : '0.0'}%)`
  })
  return `PROGRESS ${completeCases}/${totalCases} complete cases · ${scores.join(' · ')}`
}

function markdownReport(report) {
  const mixedScoring = report.dataset.scoring.startsWith('mixed:')
  const singleProvider = providerIds.length === 1
  const lines = [
    `# VisionPsy ${singleProvider ? 'single-provider addendum' : `${providerIds.length}-way`} · ${report.dataset.name}`,
    '',
    `- Run: ${report.startedAt} → ${report.finishedAt}`,
    `- Dataset: ${report.dataset.caseCount} cases${report.dataset.sourceMd5 ? `; source MD5 \`${report.dataset.sourceMd5}\`` : ''}.`,
    `- Protocol: ${report.dataset.scoring}, one excluded warm-up per model, ${singleProvider ? 'single provider over the declared seeded case order' : 'rotating execution order'}.`,
    ...(singleProvider ? ['- Comparability: accuracy may be paired against a matching frozen case set; performance requires a separately controlled comparison.'] : []),
    '',
    mixedScoring
      ? '| Model | Points | Any credit | Mixed score | Any-credit Wilson 95% | Mean TTFT | Mean latency | Mean tok/s | Mean prompt-eval tokens | Peak process RSS |'
      : '| Model | Correct | Accuracy | Wilson 95% | Mean TTFT | Mean latency | Mean tok/s | Mean prompt-eval tokens | Peak process RSS |',
    mixedScoring
      ? '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
      : '|---|---:|---:|---:|---:|---:|---:|---:|---:|'
  ]
  for (const providerId of providerIds) {
    const item = report.summaries[providerId]
    lines.push(mixedScoring
      ? `| ${item.label} | ${decimal(item.points)}/${item.cases} | ${item.passed}/${item.cases} | ${percent(item.accuracy)} | ${percent(item.wilson95.low)}–${percent(item.wilson95.high)} | ${duration(item.ttftMs.mean)} | ${duration(item.latencyMs.mean)} | ${decimal(item.tokensPerSecond.mean)} | ${decimal(item.promptTokens.mean)} | ${bytes(item.processRssPeakBytes.max)} |`
      : `| ${item.label} | ${item.passed}/${item.cases} | ${percent(item.accuracy)} | ${percent(item.wilson95.low)}–${percent(item.wilson95.high)} | ${duration(item.ttftMs.mean)} | ${duration(item.latencyMs.mean)} | ${decimal(item.tokensPerSecond.mean)} | ${decimal(item.promptTokens.mean)} | ${bytes(item.processRssPeakBytes.max)} |`)
  }
  lines.push('', `Pairwise exact McNemar tests on ${mixedScoring ? 'any-credit outcomes' : 'exact pass/fail outcomes'} (exploratory; n=${report.dataset.caseCount}):`, '')
  for (const pair of report.pairwise) lines.push(`- ${providerLabels[pair.leftId]} vs ${providerLabels[pair.rightId]}: discordant ${pair.leftOnly}–${pair.rightOnly}, exact p=${decimal(pair.exactMcNemarP, 4)}.`)
  lines.push('', 'Preprocessing:', '')
  for (const providerId of providerIds) lines.push(`- ${providerLabels[providerId]}: ${report.summaries[providerId].preprocessPolicies.join(', ') || 'not reported'}.`)
  return `${lines.join('\n')}\n`
}

function percent(value) { return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—' }
function decimal(value, digits = 1) { return Number.isFinite(value) ? value.toFixed(digits) : '—' }
function duration(value) { return Number.isFinite(value) ? `${Math.round(value)} ms` : '—' }
function bytes(value) { return Number.isFinite(value) ? `${(value / 1024 ** 2).toFixed(0)} MB` : '—' }
