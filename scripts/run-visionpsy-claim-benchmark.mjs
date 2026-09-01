const baseUrl = String(process.env.VISION_LAB_BASE_URL || 'http://127.0.0.1:8878').replace(/\/$/, '')
const benchmarkSetId = process.argv[2] || process.env.VISIONPSY_CLAIM_PACK_ID || 'visionpsy-claim-challenge-01'
const providerIds = ['visionpsy-patched-base', 'lfm2.5-vl-450m', 'qvac-smolvlm2']

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(`${options.method || 'GET'} ${pathname}: ${body.error || response.statusText}`)
    error.body = body
    throw error
  }
  return body
}

const preview = await api('/api/arena/selections/preview', {
  method: 'POST',
  body: JSON.stringify({ benchmarkSetId, runSize: 'all', sampling: 'balanced', seed: 20260820, shuffle: true, shuffleSeed: 460 })
})
const builder = await api('/api/arena/builder')
const benchmark = builder.benchmarkSets.find(item => item.id === benchmarkSetId)
if (!benchmark) throw new Error(`Benchmark set not found: ${benchmarkSetId}`)
const expectedQuestions = benchmark.questionIds.length
if (preview.selection.selectedQuestionIds.length !== expectedQuestions) throw new Error(`Expected ${expectedQuestions} selected questions, got ${preview.selection.selectedQuestionIds.length}`)

const created = await api('/api/arena/batches', {
  method: 'POST',
  body: JSON.stringify({
    benchmarkSetId,
    providerIds,
    locked: true,
    version: '1.0.0',
    outputBudget: 64,
    selectionSnapshot: preview.selection,
    runSizeLabel: `VisionPsy Claims ${expectedQuestions}`
  })
})
const batchId = created.batch.id
console.log(JSON.stringify({ event: 'created', batchId, questions: created.batch.roundIds.length, predictions: created.batch.roundIds.length * providerIds.length }))

const readiness = await api(`/api/arena/readiness?batchId=${encodeURIComponent(batchId)}`)
console.log(JSON.stringify({ event: 'readiness', verdict: readiness.verdict, blockers: readiness.blockers }))
if (readiness.blockers?.length) throw new Error(`Readiness blocked: ${readiness.blockers.join('; ')}`)

const runPromise = api(`/api/arena/batches/${encodeURIComponent(batchId)}/run`, { method: 'POST', body: '{}' })
let last = ''
while (true) {
  await new Promise(resolve => setTimeout(resolve, 2000))
  const status = await api(`/api/arena/batches/${encodeURIComponent(batchId)}/status`)
  const signature = [status.status, status.completedQuestions, status.currentQuestion, status.currentModelStep, status.stage].join(':')
  if (signature !== last) {
    console.log(JSON.stringify({ event: 'progress', batchId, ...status }))
    last = signature
  }
  if (!['DRAFT', 'RUNNING'].includes(status.status)) break
}
const result = await runPromise
console.log(JSON.stringify({
  event: 'complete',
  batchId,
  status: result.batch.status,
  completedRounds: result.batch.completedRounds,
  failedRounds: result.batch.failedRounds,
  startedAt: result.batch.startedAt,
  finishedAt: result.batch.finishedAt
}))
