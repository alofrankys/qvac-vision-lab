import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { computeBenchmarkLockHash, PRIMARY_ARENA_PROVIDER_IDS } from '../src/arena/index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'qvac-arena-api-'))
const port = 19000 + Math.floor(Math.random() * 1000)
const baseUrl = `http://127.0.0.1:${port}`
let server

try {
  await writeFixture(dataDir)
  server = spawn('/usr/bin/env', ['node', 'src/server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), PAWVAULT_DATA_DIR: dataDir, QVAC_ARENA_TEST_FAKE_PROVIDERS: '1', NODE_ENV: 'test-arena-integration' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let logs = ''
  server.stdout.on('data', chunk => { logs += chunk })
  server.stderr.on('data', chunk => { logs += chunk })
  await waitUntil(async () => (await fetch(`${baseUrl}/api/state`).catch(() => null))?.ok, 5000, () => logs)

  await builderApiScenario()
  await negativeGateScenario()
  const successfulBatch = await successfulPrimaryScenario()
  await blindReviewApiScenario(successfulBatch)
  await partialFailureScenario()
  await cancellationScenario()
  process.stdout.write('Arena fake API integration: 6 scenarios passed\n')
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([once(server, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))])
    if (server.exitCode === null) { server.kill('SIGKILL'); await once(server, 'exit') }
  }
  await rm(dataDir, { recursive: true, force: true })
}

async function builderApiScenario() {
  const created = await api('/api/arena/datasets', { method: 'POST', body: { name: 'API Builder Dataset', description: 'Disposable API fixture' } })
  assert.equal(created.dataset.name, 'API Builder Dataset')
  const builder = await api('/api/arena/builder')
  assert.ok(builder.datasets.some(item => item.id === created.dataset.id))
  const header = 'dataset_id,image_filename,photo_id,question,category,expected_answer,expected_answer_source,notes'
  const preview = await api('/api/arena/questions/import/preview', { method: 'POST', body: { format: 'csv', content: `${header}\ndataset-positive-set,photo-positive-set-0.jpg,,API disposable question?,other,,,fixture\n` } })
  assert.equal(preview.validRows, 1)
  const quick = await api('/api/arena/selections/preview', { method: 'POST', body: { benchmarkSetId: 'positive-set', runSize: 'quick5', sampling: 'balanced', seed: 1234, shuffle: true, shuffleSeed: 5678 } })
  assert.equal(quick.selection.selectedQuestionIds.length, 5)
  const quickBatch = await api('/api/arena/batches', { method: 'POST', body: { benchmarkSetId: 'positive-set', providerIds: PRIMARY_ARENA_PROVIDER_IDS, selectionSnapshot: quick.selection, outputBudget: 32 } })
  assert.equal(quickBatch.batch.arenaMode, 'EXPLORATORY'); assert.equal(quickBatch.batch.selectionSnapshot.frozen, true)
  const invalid = await api('/api/arena/questions/import', { method: 'POST', body: { format: 'csv', content: `${header}\ndataset-positive-set,missing.jpg,,Broken?,other,,,\n` }, allowError: true })
  assert.equal(invalid.status, 400)
}

async function negativeGateScenario() {
  const created = await api('/api/arena/batches', { method: 'POST', body: batchBody('negative-set', true) })
  const before = await persistedState()
  const response = await api(`/api/arena/batches/${created.batch.id}/run`, { method: 'POST', allowError: true })
  assert.equal(response.status, 409)
  assert.equal(response.body.code, 'ARENA_NOT_READY')
  assert.ok(response.body.blockers.some(item => item.startsWith('MINIMUM_30_QUESTIONS')))
  const after = await persistedState()
  assert.deepEqual(after, before, 'readiness rejection must not mutate persisted state')
}

async function successfulPrimaryScenario() {
  const created = await api('/api/arena/batches', { method: 'POST', body: batchBody('positive-set', true) })
  const running = api(`/api/arena/batches/${created.batch.id}/run`, { method: 'POST' })
  await waitUntil(async () => (await persistedState()).arenaBatches.find(item => item.id === created.batch.id)?.status === 'RUNNING', 3000)
  const progress = await api(`/api/arena/batches/${created.batch.id}/status`)
  assert.equal(progress.status, 'RUNNING')
  assert.equal(progress.totalQuestions, 30)
  assert.equal(progress.totalPredictions, 90)
  const repeated = await api(`/api/arena/batches/${created.batch.id}/run`, { method: 'POST', allowError: true })
  assert.equal(repeated.status, 400)
  const result = await running
  assert.equal(result.batch.status, 'AWAITING_JUDGMENT')
  assert.equal(result.batch.completedRounds, 30)
  assert.equal(result.batch.failedRounds, 0)
  const state = await persistedState()
  const roundIds = new Set(result.batch.roundIds)
  assert.equal(state.inferences.filter(item => roundIds.has(item.arenaRoundId)).length, 90)
  assert.equal(state.arenaJudgments.filter(item => roundIds.has(item.roundId) && item.judgeProviderId === 'GOLD_ANSWER_SCORER').length, 90)
  return result.batch
}

async function blindReviewApiScenario(batch) {
  const state = await persistedState(); const round = state.arenaRounds.find(item => item.id === batch.roundIds[0])
  const bundle = await fetch(`${baseUrl}/api/arena/rounds/${encodeURIComponent(round.id)}/export/blind`)
  assert.equal(bundle.status, 200)
  assert.equal(bundle.headers.get('content-type'), 'application/zip')
  const payload = { schemaVersion: 1, bundleType: 'BLIND_HUMAN_REVIEW', judgeId: 'api-human-judge', judgeLabel: 'Disposable integration judge', rounds: [{ roundId: round.id, judgments: Object.keys(round.blindMapping).map(blindLabel => ({ blindLabel, verdict: 'CORRECT', note: 'fixture' })) }] }
  const preview = await api('/api/arena/reviews/import/preview', { method: 'POST', body: payload })
  assert.equal(preview.valid, true)
  const imported = await api('/api/arena/reviews/import', { method: 'POST', body: payload })
  assert.equal(imported.imported, 3)
  await api(`/api/arena/rounds/${encodeURIComponent(round.id)}/reveal`, { method: 'POST', body: {} })
  const rejected = await api('/api/arena/reviews/import', { method: 'POST', body: payload, allowError: true })
  assert.equal(rejected.status, 400)
  const leaked = await api('/api/arena/reviews/import/preview', { method: 'POST', body: { ...payload, providerId: 'forbidden' }, allowError: true })
  assert.equal(leaked.status, 400)
}

async function partialFailureScenario() {
  const created = await api('/api/arena/batches', { method: 'POST', body: batchBody('error-set', false) })
  const result = await api(`/api/arena/batches/${created.batch.id}/run`, { method: 'POST' })
  assert.equal(result.batch.status, 'PARTIALLY_COMPLETED')
  assert.equal(result.batch.completedRounds, 2)
  assert.equal(result.batch.failedRounds, 1)
  const state = await persistedState()
  const roundIds = new Set(result.batch.roundIds)
  const evidence = state.inferences.filter(item => roundIds.has(item.arenaRoundId))
  assert.equal(evidence.length, 9)
  assert.ok(evidence.some(item => item.errorCode === 'MODEL_CRASH'))
  assert.equal(state.runs.some(item => result.batch.runIds.includes(item.id) && item.status === 'RUNNING'), false)
}

async function cancellationScenario() {
  const created = await api('/api/arena/batches', { method: 'POST', body: batchBody('delay-set', false) })
  const running = api(`/api/arena/batches/${created.batch.id}/run`, { method: 'POST' })
  await waitUntil(async () => {
    const state = await persistedState()
    return state.arenaBatches.find(item => item.id === created.batch.id)?.status === 'RUNNING'
  }, 3000)
  const cancelling = await api(`/api/arena/batches/${created.batch.id}/cancel`, { method: 'POST' })
  assert.equal(cancelling.cancelling, true)
  const result = await running
  assert.ok(['CANCELLED','PARTIALLY_CANCELLED'].includes(result.batch.status))
  assert.notEqual(result.batch.status, 'RUNNING')
  const state = await persistedState()
  const roundIds = new Set(result.batch.roundIds)
  assert.ok(state.inferences.some(item => roundIds.has(item.arenaRoundId)), 'completed or cancelled evidence must be persisted')
}

function batchBody(benchmarkSetId, locked) {
  return { benchmarkSetId, providerIds: PRIMARY_ARENA_PROVIDER_IDS, locked, version: '1.0.0', outputBudget: 32 }
}

async function api(route, { method = 'GET', body, allowError = false } = {}) {
  const response = await fetch(`${baseUrl}${route}`, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const payload = await response.json()
  if (!response.ok && !allowError) throw new Error(`${method} ${route}: ${response.status} ${JSON.stringify(payload)}`)
  return allowError ? { status: response.status, body: payload } : payload
}

async function persistedState() { return JSON.parse(await readFile(path.join(dataDir, 'pawvault.json'), 'utf8')) }

async function waitUntil(predicate, timeoutMs, diagnostics = () => '') {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for fake API server/state. ${diagnostics()}`)
}

async function writeFixture(directory) {
  const photosDir = path.join(directory, 'photos'); const inferenceDir = path.join(directory, 'inference-images')
  await mkdir(photosDir, { recursive: true }); await mkdir(inferenceDir, { recursive: true })
  const state = { schemaVersion: 6, photos: [], runs: [], inferences: [], reviews: [], annotations: [], taskStatuses: {}, datasets: [], questionBank: [], arenaBenchmarkSets: [], arenaRounds: [], arenaJudgments: [], arenaBatches: [], migrations: {} }
  const specifications = [
    ['negative-set', 2, index => `Negative question ${index}?`],
    ['positive-set', 30, index => `Positive question ${index}?`],
    ['error-set', 3, index => index === 1 ? '[FAKE_ERROR] synthetic failure' : `Error scenario ${index}?`],
    ['delay-set', 10, index => `[FAKE_DELAY] cancellation ${index}?`]
  ]
  for (const [setId, count, question] of specifications) {
    const datasetId = `dataset-${setId}`
    const dataset = { id: datasetId, name: datasetId, photoIds: [] }; state.datasets.push(dataset)
    const set = { id: setId, name: setId, version: '1.0.0-draft', status: 'READY', locked: false, lockHash: null, lockPayloadVersion: 3, startedAt: null, questionIds: [], rankingPolicy: { minQuestions: 30, minUniqueImages: 30, requireExpectedAnswers: true, categoryMinimums: { other: 30 } }, createdAt: new Date().toISOString() }
    for (let index = 0; index < count; index++) {
      const photoId = setId === 'positive-set' ? `photo-${setId}-${index}` : `photo-${setId}`
      const filename = `${photoId}.jpg`
      if (!dataset.photoIds.includes(photoId)) {
        dataset.photoIds.push(photoId)
        state.photos.push({ id: photoId, filename, storedFilename: filename, inferenceFilename: filename, inferenceImageSha256: 'a'.repeat(64), mimeType: 'image/jpeg', imagePipeline: { pipelineVersion: 1, ready: true, normalized: { filename, width: 1, height: 1 } } })
        await writeFile(path.join(photosDir, filename), 'fake image fixture')
        await writeFile(path.join(inferenceDir, filename), 'fake inference fixture')
      }
      const id = `question-${setId}-${index}`; set.questionIds.push(id)
      state.questionBank.push({ id, text: question(index), category: 'other', photoId, datasetId, expectedAnswer: String(index), acceptedAnswers: [], answerType: 'integer', expectedAnswerSource: 'TEST_FIXTURE_GROUND_TRUTH', source: 'TEST_FIXTURE' })
    }
    state.arenaBenchmarkSets.push(set)
  }
  const invalidLockedSet = state.arenaBenchmarkSets.find(item => item.id === 'negative-set')
  Object.assign(invalidLockedSet, { version: '1.0.0', locked: true, lockedAt: new Date().toISOString(), status: 'LOCKED' })
  invalidLockedSet.lockHash = computeBenchmarkLockHash(invalidLockedSet, state, invalidLockedSet.version)
  await writeFile(path.join(directory, 'pawvault.json'), `${JSON.stringify(state, null, 2)}\n`)
}
