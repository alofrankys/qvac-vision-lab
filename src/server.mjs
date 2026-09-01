import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { StateStore } from './storage/store.mjs'
import { FOCUSED_BASE_PRESET, FOCUSED_BASE_PROMPT_VERSION, FOCUSED_BASE_TASK_IDS, PROMPT_VERSION, TASKS, normalizeTaskOutput, promptVersionForTask } from './domain/tasks.mjs'
import { addAiAssistedReviews, upsertGroundTruth } from './annotations/index.mjs'
import { VisionProviderRegistry } from './vision/providers.mjs'
import { createFakeArenaProviders } from './vision/fake-arena-provider.mjs'
import { readPhotoMetadata } from './metadata/exif.mjs'
import { evaluate, latestInferences, latestReviews } from './evaluation/metrics.mjs'
import { scoreObjectiveAnswer } from './evaluation/objective-answer.mjs'
import { calculateRunTimings, detectAnomalies, selectRunData } from './evaluation/diagnostics.mjs'
import { buildDiagnosticBundle, buildDiagnosticRun } from './export/diagnostic-export.mjs'
import { detectFormat, prepareImage } from './image-pipeline/pipeline.mjs'
import { PET_IDENTITIES } from './identity/index.mjs'
import { MINIMAL_SEMANTIC_PROMPT_VERSION, MINIMAL_SEMANTIC_TASKS, MINIMAL_SEMANTIC_TASK_IDS, MINIMAL_SMART_SEMANTIC_PRESET, SEARCH_TOKEN_RULES, SEMANTIC_EXTRACTION_PRESET, SEMANTIC_PROMPT_VERSION, SEMANTIC_REVIEW_VERDICTS, SEMANTIC_TASKS, SEMANTIC_TASK_IDS, minimalSemanticIssues, normalizeMinimalSemanticOutput, normalizeSemanticOutput, selectMinimalSmartPhotoIds, selectSemanticQuickPhotoIds, semanticMetrics } from './semantic/index.mjs'
import { EXPERIMENTS, OPEN_REVIEW_VERDICTS, PAWVAULT_EXPERIMENT_ID, PROVIDER_SLOTS, VQA_PRESETS, arenaMetrics, createVqaDraft, publicDatasets } from './lab/index.mjs'
import { ARENA_PROVIDER_IDS, ARENA_VERDICTS, PRIMARY_ARENA_PROVIDER_IDS, QUESTION_CATEGORIES, arenaDashboard, assertBenchmarkMutable, assertSameInputFairness, createArenaBatch, createArenaRound, createArenaRunForRound, createQuestionBankEntry, publicArenaRound, recordArenaJudgment, revealArenaRound } from './arena/index.mjs'
import { auditFairArena, readModelLock } from './arena/readiness.mjs'
import { JUDGE_PROVIDER_BOUNDARIES } from './arena/judges.mjs'
import { buildArenaBundle, buildPrivateMappingBundle } from './arena/export.mjs'
import { EVIDENCE_TIERS, addQuestion, addQuestionToSet, applyBlindReviewImport, applyQuestionImport, benchmarkCoverage, benchmarkDiff, blindReviewTemplate, buildReviewQueue, changeDatasetMembership, cloneBenchmarkVersion, createBenchmarkSet, createDataset, createRunSelection, csvTemplate, datasetBuilderView, duplicateQuestion, lockBenchmarkSet, lockPreview, previewBlindReviewImport, previewQuestionImport, removeQuestionFromSet, updateDataset, updateQuestion, validateBenchmarkSet } from './arena/builder.mjs'
import { REALWORLDQA_DATASET_STATUS, ResourceSampler, SHOWCASE_CASES, SHOWCASE_PROVIDER_IDS, buildShowcaseConversationPrompt, scoreShowcaseAnswer } from './showcase/index.mjs'
import { assertLocalRequest } from './http/local-request-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const dataDir = path.resolve(process.env.PAWVAULT_DATA_DIR || path.join(root, 'data'))
const photosDir = path.join(dataDir, 'photos')
const inferenceDir = path.join(dataDir, 'inference-images')
const benchmarkDir = path.join(dataDir, 'smoke-results')
const showcaseOriginalDir = path.join(dataDir, 'showcase', 'originals')
const showcaseInferenceDir = path.join(dataDir, 'showcase', 'inference')
const showcaseFrameCaptureDir = path.join(root, 'artifacts', 'demo3-frame-capture')
const showcaseFrameCaptureEnabled = process.env.QVAC_ENABLE_FRAME_CAPTURE === '1'
const dogTruthPath = path.join(benchmarkDir, 'dog-count-ground-truth.json')
const store = await new StateStore(path.join(dataDir, 'pawvault.json')).init()
const fakeArenaMode = process.env.QVAC_ARENA_TEST_FAKE_PROVIDERS === '1'
if (fakeArenaMode && (!process.env.NODE_ENV?.startsWith('test') || !dataDir.startsWith(os.tmpdir()))) throw new Error('Fake Arena providers are restricted to NODE_ENV=test and a temporary data directory')
const providers = new VisionProviderRegistry(fakeArenaMode ? createFakeArenaProviders() : undefined)
const arenaModelLock = await readModelLock()
const activeRuns = new Map()
const activeBatches = new Map()
const serverStartedAt = new Date().toISOString()
const BENCHMARK_PRESETS = Object.freeze([FOCUSED_BASE_PRESET, SEMANTIC_EXTRACTION_PRESET, MINIMAL_SMART_SEMANTIC_PRESET])
const ALL_SEMANTIC_TASK_IDS = Object.freeze([...SEMANTIC_TASK_IDS, ...MINIMAL_SEMANTIC_TASK_IDS])
await Promise.all([
  mkdir(photosDir, { recursive: true }),
  mkdir(inferenceDir, { recursive: true }),
  mkdir(showcaseOriginalDir, { recursive: true }),
  mkdir(showcaseInferenceDir, { recursive: true }),
  ...(showcaseFrameCaptureEnabled ? [mkdir(showcaseFrameCaptureDir, { recursive: true })] : [])
])
await migrateImagePipelines()

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.heic': 'image/heic', '.webp': 'image/webp', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' }

const server = createServer(async (request, response) => {
  try {
    assertLocalRequest(request)
    const url = new URL(request.url, 'http://127.0.0.1')
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url)
    if (url.pathname.startsWith('/photos/')) return await servePhoto(response, url.pathname.slice(8))
    if (url.pathname.startsWith('/previews/')) return await servePreview(response, url.pathname.slice(10))
    return await serveStatic(response, url.pathname)
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error(error)
    if (response.headersSent) { response.destroy(); return }
    sendJson(response, error.statusCode || 500, { error: error.message || String(error), code: error.code || null, blockers: error.blockers || undefined, batch: error.batch || undefined })
  }
})

async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true, serverStartedAt, frameCaptureEnabled: showcaseFrameCaptureEnabled, activeBatchIds: [...activeBatches.keys()], activeRunIds: [...activeRuns.keys()] })
  }
  if (request.method === 'GET' && url.pathname === '/api/showcase') {
    const statuses = await Promise.all(SHOWCASE_PROVIDER_IDS.map(id => providers.get(id).status()))
    return sendJson(response, 200, { cases: SHOWCASE_CASES, dataset: REALWORLDQA_DATASET_STATUS, providers: statuses.map(item => ({
      id: item.id,
      name: item.name,
      model: item.model,
      modelVersion: item.modelVersion,
      runtime: item.runtime,
      runtimeVersion: item.runtimeVersion,
      label: item.label,
      ready: item.state === 'READY',
      reason: item.reason || null
    })) })
  }
  if (request.method === 'POST' && url.pathname === '/api/showcase/capture-frame') {
    if (!showcaseFrameCaptureEnabled) throw httpError(403, 'Local frame capture is disabled; restart with QVAC_ENABLE_FRAME_CAPTURE=1 only for a trusted recording session')
    const runId = String(url.searchParams.get('run') || '')
    if (!/^[a-z0-9_-]{1,64}$/i.test(runId)) throw badRequest('Invalid capture run id')
    const captureDir = path.join(showcaseFrameCaptureDir, runId)
    await mkdir(captureDir, { recursive: true })
    if (url.searchParams.get('kind') === 'manifest') {
      const manifest = await jsonBody(request, 2 * 1024 * 1024)
      await writeFile(path.join(captureDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
      return sendJson(response, 200, { ok: true })
    }
    const index = Number(url.searchParams.get('index'))
    if (!Number.isInteger(index) || index < 0 || index > 10000) throw badRequest('Invalid capture frame index')
    const frame = await rawBody(request, 3 * 1024 * 1024)
    await writeFile(path.join(captureDir, `frame-${String(index).padStart(5, '0')}.jpg`), frame)
    response.writeHead(204)
    response.end()
    return
  }
  if (request.method === 'POST' && url.pathname === '/api/showcase/run') return runShowcase(request, response)
  if (request.method === 'GET' && url.pathname === '/api/benchmarks/dog-count') {
    return sendJson(response, 200, await dogCountBenchmarkView())
  }
  if (request.method === 'PATCH' && url.pathname === '/api/benchmarks/dog-count/truth') {
    const body = await jsonBody(request)
    const allowed = ['no_dog', 'one_dog', 'multiple_dogs']
    if (!allowed.includes(body.label)) throw badRequest('Invalid dog-count ground-truth label')
    const benchmark = await dogCountBenchmarkView()
    if (!benchmark.photos.some(photo => photo.id === body.photoId)) throw notFound('Benchmark photo not found')
    benchmark.truth.labels[body.photoId] = body.label
    benchmark.truth.updatedAt = new Date().toISOString()
    benchmark.truth.source = 'HUMAN_CONFIRMED'
    await writeFile(dogTruthPath, `${JSON.stringify(benchmark.truth, null, 2)}\n`)
    return sendJson(response, 200, await dogCountBenchmarkView())
  }
  if (request.method === 'GET' && url.pathname === '/api/state') {
    const state = store.snapshot()
    return sendJson(response, 200, await viewState(state, url.searchParams.get('runId')))
  }
  if (request.method === 'GET' && url.pathname === '/api/arena/dashboard') {
    const snapshot = store.snapshot()
    return sendJson(response, 200, arenaDashboard(snapshot, { datasetId: url.searchParams.get('datasetId') || 'all', category: url.searchParams.get('category') || 'all', providerId: url.searchParams.get('providerId') || 'all', judgeProviderId: url.searchParams.get('judgeProviderId') || 'all', evidenceTier: url.searchParams.get('evidenceTier') || 'RANKING_ELIGIBLE' }))
  }
  const arenaBatchStatusMatch = url.pathname.match(/^\/api\/arena\/batches\/([^/]+)\/status$/)
  if (request.method === 'GET' && arenaBatchStatusMatch) {
    const snapshot = store.snapshot()
    const batch = snapshot.arenaBatches.find(item => item.id === decodeURIComponent(arenaBatchStatusMatch[1]))
    if (!batch) throw notFound('Arena batch not found')
    const runs = snapshot.runs.filter(item => (batch.runIds || []).includes(item.id))
    const activeRun = runs.find(item => item.id === batch.currentRunId) || runs.find(item => item.status === 'RUNNING') || null
    const completedPredictions = runs.reduce((sum, run) => sum + Number(run.completedPredictions || 0) + Number(run.failedPredictions || 0), 0)
    const totalQuestions = batch.roundIds.length
    const finishedQuestions = Number(batch.completedRounds || 0) + Number(batch.failedRounds || 0)
    const terminal = ['AWAITING_JUDGMENT','PARTIALLY_COMPLETED','PARTIALLY_CANCELLED','CANCELLED','FAILED'].includes(batch.status)
    return sendJson(response, 200, {
      id: batch.id,
      status: batch.status,
      totalQuestions,
      completedQuestions: finishedQuestions,
      failedQuestions: Number(batch.failedRounds || 0),
      currentQuestion: batch.status === 'RUNNING' ? Math.min(totalQuestions, finishedQuestions + 1) : terminal ? finishedQuestions : 0,
      totalPredictions: totalQuestions * batch.providerIds.length,
      completedPredictions,
      currentModelStep: activeRun?.currentProviderId ? Math.max(1, batch.providerIds.indexOf(activeRun.currentProviderId) + 1) : null,
      modelsPerQuestion: batch.providerIds.length,
      stage: activeRun?.currentStage || (terminal ? 'completed' : batch.status === 'DRAFT' ? 'preparing' : 'starting'),
      startedAt: batch.startedAt || null,
      finishedAt: batch.finishedAt || null,
      error: batch.error || null,
      reviewReady: ['AWAITING_JUDGMENT','PARTIALLY_COMPLETED'].includes(batch.status)
    })
  }
  if (request.method === 'GET' && url.pathname === '/api/arena/readiness') {
    const snapshot = store.snapshot(); const batch = snapshot.arenaBatches.find(item => item.id === url.searchParams.get('batchId'))
    return sendJson(response, 200, await auditFairArena({ providerStatuses: await providers.statuses(), state: snapshot, verifyHashes: url.searchParams.get('fast') !== '1', benchmarkSetId: batch?.benchmarkSetId || url.searchParams.get('benchmarkSetId') || 'real_world_vision_arena_v1', level: batch?.arenaMode === 'FAIR_RESOURCE_MATCHED_PRIMARY' || url.searchParams.get('level') !== 'exploratory' ? 'ranking' : 'exploratory', questionIds: batch?.selectionSnapshot?.selectedQuestionIds || null }))
  }
  if (request.method === 'POST' && url.pathname === '/api/arena/selections/preview') {
    const body = await jsonBody(request)
    try { return sendJson(response, 200, { selection: createRunSelection(store.snapshot(), body) }) } catch (error) { throw badRequest(error.message) }
  }
  if (request.method === 'GET' && url.pathname === '/api/arena/builder') {
    const snapshot = store.snapshot()
    return sendJson(response, 200, { datasets: datasetBuilderView(snapshot), questions: snapshot.questionBank, benchmarkSets: snapshot.arenaBenchmarkSets.map(set => ({ ...set, coverage: benchmarkCoverage(snapshot, set.id), validation: validateBenchmarkSet(snapshot, set.id) })), reviewQueue: buildReviewQueue(snapshot, url.searchParams.get('batchId')) })
  }
  if (request.method === 'POST' && url.pathname === '/api/arena/datasets') {
    const body = await jsonBody(request); let dataset
    try { await store.update(state => { dataset = createDataset(state, body) }) } catch (error) { throw badRequest(error.message) }
    return sendJson(response, 201, { dataset })
  }
  if (request.method === 'POST' && url.pathname === '/api/arena/benchmark-sets') {
    const body = await jsonBody(request); let set
    try { await store.update(state => { set = createBenchmarkSet(state, body) }) } catch (error) { throw badRequest(error.message) }
    return sendJson(response, 201, { set })
  }
  const setQuestionsMatch = url.pathname.match(/^\/api\/arena\/benchmark-sets\/([^/]+)\/questions$/)
  if (['POST','DELETE'].includes(request.method) && setQuestionsMatch) {
    const body = await jsonBody(request); let set
    try { await store.update(state => { set = request.method === 'POST' ? addQuestionToSet(state, decodeURIComponent(setQuestionsMatch[1]), body.questionId) : removeQuestionFromSet(state, decodeURIComponent(setQuestionsMatch[1]), body.questionId) }) } catch (error) { throw badRequest(error.message) }
    return sendJson(response, 200, { set })
  }
  const arenaDatasetMatch = url.pathname.match(/^\/api\/arena\/datasets\/([^/]+)$/)
  if (request.method === 'PATCH' && arenaDatasetMatch) {
    const body = await jsonBody(request); let dataset
    try { await store.update(state => { dataset = updateDataset(state, decodeURIComponent(arenaDatasetMatch[1]), body) }) } catch (error) { throw badRequest(error.message) }
    return sendJson(response, 200, { dataset })
  }
  const arenaMembershipMatch = url.pathname.match(/^\/api\/arena\/datasets\/([^/]+)\/photos$/)
  if (['POST','DELETE'].includes(request.method) && arenaMembershipMatch) {
    const body = await jsonBody(request); let membership
    const datasetId = decodeURIComponent(arenaMembershipMatch[1])
    try { await store.update(state => { membership = changeDatasetMembership(state, request.method === 'DELETE' ? { fromDatasetId: datasetId, photoId: body.photoId } : { fromDatasetId: body.fromDatasetId, toDatasetId: datasetId, photoId: body.photoId }) }) } catch (error) { throw badRequest(error.message) }
    return sendJson(response, 200, membership)
  }
  if (request.method === 'GET' && url.pathname === '/api/arena/questions/import/template.csv') return sendDownload(response, Buffer.from(csvTemplate()), 'qvac-question-bank-template.csv', 'text/csv; charset=utf-8')
  if (request.method === 'POST' && url.pathname === '/api/arena/questions/import/preview') {
    const body = await jsonBody(request, 8 * 1024 * 1024)
    try { return sendJson(response, 200, previewQuestionImport(store.snapshot(), body)) } catch (error) { throw badRequest(error.message) }
  }
  if (request.method === 'POST' && url.pathname === '/api/arena/questions/import') {
    const body = await jsonBody(request, 8 * 1024 * 1024); let result
    try { await store.update(state => { result = applyQuestionImport(state, body) }) } catch (error) { throw badRequest(error.message) }
    return sendJson(response, 201, result)
  }
  const arenaDuplicateQuestionMatch = url.pathname.match(/^\/api\/arena\/questions\/([^/]+)\/duplicate$/)
  if (request.method === 'POST' && arenaDuplicateQuestionMatch) {
    const body = await jsonBody(request); let question
    try { await store.update(state => { question = duplicateQuestion(state, decodeURIComponent(arenaDuplicateQuestionMatch[1]), body) }) } catch (error) { throw badRequest(error.message) }
    return sendJson(response, 201, { question })
  }
  const setActionMatch = url.pathname.match(/^\/api\/arena\/benchmark-sets\/([^/]+)\/(validate|lock-preview|lock|clone|diff)$/)
  if (setActionMatch) {
    const setId = decodeURIComponent(setActionMatch[1]), action = setActionMatch[2]
    const body = request.method === 'POST' ? await jsonBody(request) : {}
    try {
      if (request.method === 'GET' && action === 'validate') return sendJson(response, 200, validateBenchmarkSet(store.snapshot(), setId))
      if (request.method === 'POST' && action === 'lock-preview') return sendJson(response, 200, lockPreview(store.snapshot(), setId, body))
      if (request.method === 'POST' && action === 'lock') { let set; await store.update(state => { set = lockBenchmarkSet(state, setId, body) }); return sendJson(response, 200, { set }) }
      if (request.method === 'POST' && action === 'clone') { let set; await store.update(state => { set = cloneBenchmarkVersion(state, setId, body) }); return sendJson(response, 201, { set }) }
      if (request.method === 'GET' && action === 'diff') return sendJson(response, 200, benchmarkDiff(store.snapshot(), setId, url.searchParams.get('otherId')))
    } catch (error) { throw badRequest(error.message) }
  }
  if (request.method === 'GET' && url.pathname === '/api/arena/review-queue') return sendJson(response, 200, buildReviewQueue(store.snapshot(), url.searchParams.get('batchId')))
  if (request.method === 'POST' && url.pathname === '/api/arena/reviews/export') {
    const body = await jsonBody(request); let template
    try { template = blindReviewTemplate(store.snapshot(), body.roundIds || [], body) } catch (error) { throw badRequest(error.message) }
    return sendDownload(response, Buffer.from(`${JSON.stringify(template, null, 2)}\n`), 'qvac-blind-human-review.json', 'application/json')
  }
  if (request.method === 'POST' && url.pathname === '/api/arena/reviews/import/preview') {
    const body = await jsonBody(request, 8 * 1024 * 1024)
    try { return sendJson(response, 200, previewBlindReviewImport(store.snapshot(), body)) } catch (error) { throw badRequest(error.message) }
  }
  if (request.method === 'POST' && url.pathname === '/api/arena/reviews/import') {
    const body = await jsonBody(request, 8 * 1024 * 1024); let result
    try { await store.update(state => { result = applyBlindReviewImport(state, body) }) } catch (error) { throw badRequest(error.message) }
    return sendJson(response, 201, result)
  }
  if (request.method === 'POST' && url.pathname === '/api/arena/rounds') {
    const body = await jsonBody(request)
    const snapshot = store.snapshot()
    if (snapshot.runs.some(item => item.status === 'RUNNING')) throw badRequest('Wait for the current run to finish or cancel it before starting Arena')
    let round
    await store.update(state => {
      round = createArenaRound(body, state)
      const createdAt = round.createdAt
      const run = createArenaRunForRound(round)
      state.arenaRounds.push(round); state.runs.push(run)
      if (body.saveQuestion) {
        const entry = createQuestionBankEntry({ ...body, text: round.question }, state)
        round.questionBankId = entry.id
        const starter = state.arenaBenchmarkSets.find(item => item.id === 'real_world_vision_arena_v1')
        assertBenchmarkMutable(starter); starter.questionIds.push(entry.id); starter.status = 'READY'
      }
    })
    return sendJson(response, 201, { round: publicArenaRound(round, store.snapshot()) })
  }
  const arenaRunMatch = url.pathname.match(/^\/api\/arena\/rounds\/([^/]+)\/run$/)
  if (request.method === 'POST' && arenaRunMatch) return sendJson(response, 201, await analyzeArenaRound(decodeURIComponent(arenaRunMatch[1])))
  const arenaJudgmentMatch = url.pathname.match(/^\/api\/arena\/rounds\/([^/]+)\/judgments$/)
  if (request.method === 'POST' && arenaJudgmentMatch) {
    const body = await jsonBody(request); let judgment
    try { await store.update(state => { judgment = recordArenaJudgment(state, { ...body, roundId: decodeURIComponent(arenaJudgmentMatch[1]) }) }) }
    catch (error) { throw badRequest(error.message) }
    return sendJson(response, 201, { judgment, round: publicArenaRound(store.snapshot().arenaRounds.find(item => item.id === judgment.roundId), store.snapshot()) })
  }
  const arenaRevealMatch = url.pathname.match(/^\/api\/arena\/rounds\/([^/]+)\/reveal$/)
  if (request.method === 'POST' && arenaRevealMatch) {
    const body = await jsonBody(request); let round
    try { await store.update(state => { round = state.arenaRounds.find(item => item.id === decodeURIComponent(arenaRevealMatch[1])); if (!round) throw new Error('Arena round not found'); revealArenaRound(round, state.arenaJudgments, body, { scoring: state.arenaScoring }) }) }
    catch (error) { throw badRequest(error.message) }
    return sendJson(response, 200, { round: publicArenaRound(round, store.snapshot()) })
  }
  if (request.method === 'POST' && url.pathname === '/api/arena/questions') {
    const body = await jsonBody(request); let question
    try { await store.update(state => { question = addQuestion(state, body) }) }
    catch (error) { throw badRequest(error.message) }
    return sendJson(response, 201, { question })
  }
  const arenaQuestionMatch = url.pathname.match(/^\/api\/arena\/questions\/([^/]+)$/)
  if (['PATCH','DELETE'].includes(request.method) && arenaQuestionMatch) {
    const body = request.method === 'PATCH' ? await jsonBody(request) : {}; let result
    try { await store.update(state => { const id = decodeURIComponent(arenaQuestionMatch[1]); const entry = state.questionBank.find(item => item.id === id); if (!entry) throw new Error('Question not found'); if (request.method === 'DELETE') { for (const set of state.arenaBenchmarkSets.filter(item => item.questionIds.includes(id))) assertBenchmarkMutable(set); state.questionBank = state.questionBank.filter(item => item.id !== id); for (const set of state.arenaBenchmarkSets) set.questionIds = set.questionIds.filter(value => value !== id); result = { deleted: id } } else result = updateQuestion(state, id, body) }) }
    catch (error) { throw badRequest(error.message) }
    return sendJson(response, 200, result)
  }
  if (request.method === 'POST' && url.pathname === '/api/arena/batches') {
    const body = await jsonBody(request); let batch
    try { await store.update(state => { const selectionSnapshot = body.selectionSnapshot || (body.runSize ? createRunSelection(state, body) : null); batch = createArenaBatch({ ...body, selectionSnapshot, modelLockSnapshot: { id: arenaModelLock.lock.id, hash: arenaModelLock.lockHash, primaryModels: arenaModelLock.lock.primaryModels } }, state) }) } catch (error) { throw badRequest(error.message) }
    console.info('[arena] batch created', JSON.stringify({ batchId: batch.id, questions: batch.roundIds.length, createdAt: batch.createdAt }))
    return sendJson(response, 201, { batch })
  }
  const arenaBatchRunMatch = url.pathname.match(/^\/api\/arena\/batches\/([^/]+)\/run$/)
  if (request.method === 'POST' && arenaBatchRunMatch) {
    const batch = store.snapshot().arenaBatches.find(item => item.id === decodeURIComponent(arenaBatchRunMatch[1]))
    if (!batch || batch.status !== 'DRAFT') throw badRequest('Arena batch is not available')
    {
      const ranking = batch.arenaMode === 'FAIR_RESOURCE_MATCHED_PRIMARY'
      const report = await auditFairArena({ providerStatuses: await providers.statuses(), state: store.snapshot(), verifyHashes: process.env.QVAC_ARENA_TEST_FAKE_PROVIDERS !== '1', benchmarkSetId: batch.benchmarkSetId, level: ranking ? 'ranking' : 'exploratory', questionIds: batch.selectionSnapshot?.selectedQuestionIds })
      if (report.verdict !== (ranking ? 'BENCHMARK_READY' : 'EXPLORATORY_READY')) throw readinessConflict(report.blockers)
      await store.update(state => { const target = state.arenaBatches.find(item => item.id === batch.id); target.readinessAudit = report })
      if (ranking) {
      if (batch.providerIds.length !== PRIMARY_ARENA_PROVIDER_IDS.length || PRIMARY_ARENA_PROVIDER_IDS.some(id => !batch.providerIds.includes(id))) throw readinessConflict(['PRIMARY_ROSTER_EXACT: batch provider roster mismatch'])
      }
    }
    console.info('[arena] batch run requested', JSON.stringify({ batchId: batch.id, status: batch.status, questions: batch.roundIds.length }))
    const controller = new AbortController()
    await store.update(state => { const target = state.arenaBatches.find(item => item.id === batch.id); if (target?.status !== 'DRAFT') throw badRequest('Arena batch is already running or complete'); target.status = 'RUNNING'; target.startedAt = new Date().toISOString(); const set = state.arenaBenchmarkSets.find(item => item.id === target.benchmarkSetId); if (set?.locked) set.startedAt ||= target.startedAt })
    activeBatches.set(batch.id, { controller, currentRunId: null })
    console.info('[arena] batch started', JSON.stringify({ batchId: batch.id, startedAt: store.snapshot().arenaBatches.find(item => item.id === batch.id)?.startedAt }))
    let terminalStatus = 'AWAITING_JUDGMENT'; let failure = null; let hadRoundFailures = false
    try {
      for (const roundId of batch.roundIds) {
        if (controller.signal.aborted) { terminalStatus = 'CANCELLED'; break }
        const current = store.snapshot(); const round = current.arenaRounds.find(item => item.id === roundId)
        activeBatches.get(batch.id).currentRunId = round?.runId || null
        await store.update(state => { const target = state.arenaBatches.find(item => item.id === batch.id); target.currentRunId = round?.runId || null; target.currentRoundId = roundId })
        const result = await analyzeArenaRound(roundId)
        hadRoundFailures ||= result.run.failedPredictions > 0
        await store.update(state => { const target = state.arenaBatches.find(item => item.id === batch.id); if (result.run.cancelled || result.run.failedPredictions > 0) target.failedRounds += 1; else target.completedRounds += 1 })
        const progress = store.snapshot().arenaBatches.find(item => item.id === batch.id)
        console.info('[arena] batch progress', JSON.stringify({ batchId: batch.id, completed: progress.completedRounds, failed: progress.failedRounds, total: progress.roundIds.length }))
        if (result.run.cancelled) { terminalStatus = 'CANCELLED'; break }
      }
    } catch (error) {
      failure = error; terminalStatus = 'FAILED'
      console.error('[arena] batch failed', JSON.stringify({ batchId: batch.id, error: error.message, stack: error.stack }))
      const activeRunId = activeBatches.get(batch.id)?.currentRunId
      const activeRun = activeRunId && activeRuns.get(activeRunId)
      if (activeRun) { activeRun.controller.abort(); for (const provider of activeRun.providers || []) await Promise.resolve(provider.cancel?.(activeRunId)).catch(() => {}); activeRuns.delete(activeRunId) }
      await store.update(state => {
        const now = new Date().toISOString(); const target = state.arenaBatches.find(item => item.id === batch.id)
        target.failedRounds += 1; target.error = error.message
        for (const run of state.runs.filter(item => (target.runIds || []).includes(item.id) && item.status === 'RUNNING')) Object.assign(run, { status: 'FAILED', finishedAt: now, currentStage: 'failed', error: error.message })
        for (const round of state.arenaRounds.filter(item => target.roundIds.includes(item.id) && item.status === 'RUNNING')) Object.assign(round, { status: 'FAILED', finishedAt: now, error: error.message })
      })
    } finally {
      await store.update(state => {
        const target = state.arenaBatches.find(item => item.id === batch.id)
        if (terminalStatus === 'AWAITING_JUDGMENT' && hadRoundFailures) terminalStatus = 'PARTIALLY_COMPLETED'
        if (terminalStatus === 'FAILED' && target.completedRounds) terminalStatus = 'PARTIALLY_COMPLETED'
        if (terminalStatus === 'CANCELLED' && target.completedRounds) terminalStatus = 'PARTIALLY_CANCELLED'
        target.status = terminalStatus; target.finishedAt = new Date().toISOString(); target.currentRunId = null
      })
      activeBatches.delete(batch.id)
    }
    const finalBatch = store.snapshot().arenaBatches.find(item => item.id === batch.id)
    console.info('[arena] batch finished', JSON.stringify({ batchId: batch.id, status: finalBatch.status, completed: finalBatch.completedRounds, failed: finalBatch.failedRounds, startedAt: finalBatch.startedAt, finishedAt: finalBatch.finishedAt }))
    if (failure) throw Object.assign(failure, { statusCode: failure.statusCode || 500, batch: finalBatch })
    return sendJson(response, 200, { batch: finalBatch })
  }
  const arenaBatchCancelMatch = url.pathname.match(/^\/api\/arena\/batches\/([^/]+)\/cancel$/)
  if (request.method === 'POST' && arenaBatchCancelMatch) {
    const batchId = decodeURIComponent(arenaBatchCancelMatch[1]); const active = activeBatches.get(batchId)
    if (!active) throw badRequest('Only a running Arena batch can be cancelled')
    active.controller.abort()
    const run = active.currentRunId && activeRuns.get(active.currentRunId)
    if (run) { run.controller.abort(); for (const provider of run.providers || []) await provider.cancel?.(active.currentRunId) }
    await store.update(state => { const batch = state.arenaBatches.find(item => item.id === batchId); batch.cancelReason = 'Cancelled by user' })
    return sendJson(response, 202, { batchId, cancelling: true })
  }
  const arenaExportMatch = url.pathname.match(/^\/api\/arena\/rounds\/([^/]+)\/export\/(bundle|blind|private)$/)
  if (request.method === 'GET' && arenaExportMatch) {
    const snapshot = store.snapshot(); const round = snapshot.arenaRounds.find(item => item.id === decodeURIComponent(arenaExportMatch[1]))
    if (!round) throw notFound('Arena round not found')
    const body = arenaExportMatch[2] === 'private' ? buildPrivateMappingBundle(snapshot, round) : await buildArenaBundle(snapshot, round, { photosDir, inferenceDir }, arenaExportMatch[2] === 'blind')
    return sendDownload(response, body, `qvac-arena-${round.id}-${arenaExportMatch[2]}.zip`, 'application/zip')
  }
  const arenaFeaturedMatch = url.pathname.match(/^\/api\/arena\/rounds\/([^/]+)\/featured$/)
  if (request.method === 'POST' && arenaFeaturedMatch) {
    const body = await jsonBody(request); const roundId = decodeURIComponent(arenaFeaturedMatch[1])
    await store.update(state => { if (!state.arenaRounds.some(item => item.id === roundId && item.status === 'REVEALED')) throw notFound('Revealed Arena round not found'); state.arenaFeaturedExamples = state.arenaFeaturedExamples.filter(item => item.roundId !== roundId); if (body.featured) state.arenaFeaturedExamples.push({ roundId, markedAt: new Date().toISOString(), provenance: 'USER_MANUAL' }) })
    return sendJson(response, 200, { roundId, featured: Boolean(body.featured) })
  }
  if (request.method === 'POST' && url.pathname === '/api/vqa/runs') {
    const body = await jsonBody(request)
    const snapshot = store.snapshot()
    if (snapshot.runs.some(item => item.status === 'RUNNING')) throw badRequest('Wait for the current run to finish or cancel it before starting another run')
    const { run, questions } = createVqaDraft(body, snapshot)
    for (const providerId of run.providerIds) providers.get(providerId)
    await store.update(state => {
      for (const existing of state.runs.filter(item => item.status === 'DRAFT')) { existing.status = 'CANCELLED'; existing.cancelled = true; existing.finishedAt = new Date().toISOString() }
      state.vqaQuestions.push(...questions)
      state.runs.push(run)
    })
    return sendJson(response, 201, { run, questions })
  }
  const vqaAnalyzeMatch = url.pathname.match(/^\/api\/vqa\/runs\/([^/]+)\/analyze$/)
  if (request.method === 'POST' && vqaAnalyzeMatch) return sendJson(response, 201, await analyzeVqaRun(decodeURIComponent(vqaAnalyzeMatch[1])))
  const findingMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/shareable-finding$/)
  if (request.method === 'PATCH' && findingMatch) {
    const body = await jsonBody(request)
    const finding = String(body.shareableFinding || '').trim().slice(0, 500)
    const run = await store.update(state => { const target = state.runs.find(item => item.id === decodeURIComponent(findingMatch[1])); if (!target) throw notFound('Run not found'); target.shareableFinding = finding; return target })
    return sendJson(response, 200, { run })
  }
  if (request.method === 'POST' && url.pathname === '/api/reviews/featured') {
    const body = await jsonBody(request)
    const inference = store.snapshot().inferences.find(item => item.id === body.inferenceId)
    if (!inference) throw notFound('Inference not found')
    await store.update(state => {
      state.featuredExamples = state.featuredExamples.filter(item => item.inferenceId !== inference.id)
      if (body.featured) state.featuredExamples.push({ inferenceId: inference.id, markedAt: new Date().toISOString(), provenance: 'USER_MANUAL' })
    })
    return sendJson(response, 200, { inferenceId: inference.id, featured: Boolean(body.featured) })
  }
  if (request.method === 'POST' && url.pathname === '/api/runs') {
    const body = await jsonBody(request)
    const snapshot = store.snapshot()
    if (snapshot.runs.some(item => item.status === 'RUNNING')) throw badRequest('Wait for the current run to finish or cancel it before starting another run')
    const requestedPhotoIds = [...new Set(body.photoIds || [])]
    if (requestedPhotoIds.some(id => !snapshot.photos.some(photo => photo.id === id))) throw badRequest('Unknown photo in requested working set')
    const run = createRunShell(body.benchmarkPreset, requestedPhotoIds)
    await store.update(state => {
      for (const existing of state.runs.filter(item => item.status === 'DRAFT')) { existing.status = 'CANCELLED'; existing.cancelled = true; existing.finishedAt = new Date().toISOString() }
      state.runs.push(run)
    })
    return sendJson(response, 201, { run })
  }
  const presetMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/preset$/)
  if (request.method === 'PATCH' && presetMatch) {
    const runId = decodeURIComponent(presetMatch[1])
    const body = await jsonBody(request)
    const preset = BENCHMARK_PRESETS.find(item => item.id === body.benchmarkPreset)
    if (!preset) throw badRequest('Unknown benchmark preset')
    const run = await store.update(state => {
      const target = state.runs.find(item => item.id === runId && item.status === 'DRAFT')
      if (!target) throw badRequest('Benchmark presets can only be applied to a draft run')
      target.benchmarkPreset = preset.id
      target.providerId = preset.providerId
      target.taskIds = [...preset.coreTaskIds]
      target.taskCount = target.taskIds.length
      if (preset.id === SEMANTIC_EXTRACTION_PRESET.id) target.semanticQuickPhotoIds = selectSemanticQuickPhotoIds(target.photoIds, state.annotations, preset.quickLimit)
      if (preset.id === MINIMAL_SMART_SEMANTIC_PRESET.id) target.minimalQuickPhotoIds = selectMinimalSmartPhotoIds(target.photoIds, state.annotations, state.photos, preset.quickLimit)
      return target
    })
    return sendJson(response, 200, { run })
  }
  const cancelMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/)
  if (request.method === 'POST' && cancelMatch) {
    const runId = decodeURIComponent(cancelMatch[1])
    const existingRun = store.snapshot().runs.find(item => item.id === runId)
    if (!existingRun) throw notFound('Run not found')
    if (existingRun.status !== 'RUNNING') throw badRequest('Only a running run can be cancelled')
    const active = activeRuns.get(runId)
    if (active) { active.controller.abort(); for (const item of active.providers || [active.provider]) await item?.cancel?.(runId) }
    const run = await store.update(state => {
      const target = state.runs.find(item => item.id === runId)
      Object.assign(target, { status: 'CANCELLED', cancelled: true, cancelReason: 'Cancelled by user', cancelledAt: new Date().toISOString(), finishedAt: new Date().toISOString(), lastStage: target.currentStage || target.currentTaskId || 'unknown', lastSuccessfulStep: target.lastSuccessfulStep || (target.firstInferenceFinishedAt ? 'provider invocation end' : 'provider initialization') })
      const arenaRound = state.arenaRounds?.find(item => item.runId === runId)
      if (arenaRound) Object.assign(arenaRound, { status: 'CANCELLED', finishedAt: target.finishedAt, cancelReason: target.cancelReason })
      return target
    })
    return sendJson(response, 200, { run })
  }
  const runExport = url.pathname.match(/^\/api\/runs\/([^/]+)\/export\/(json|bundle)$/)
  if (request.method === 'GET' && runExport) {
    const runId = decodeURIComponent(runExport[1])
    const state = store.snapshot()
    const run = state.runs.find(item => item.id === runId)
    if (!run) throw notFound('Run not found')
    if (!['COMPLETED', 'CANCELLED'].includes(run.status)) throw badRequest('Only completed or cancelled runs can be exported')
    if (runExport[2] === 'json') {
      const body = Buffer.from(`${JSON.stringify(buildDiagnosticRun(state, run), null, 2)}\n`)
      return sendDownload(response, body, `qvac-vision-lab-run-${(run.startedAt || run.createdAt).replaceAll(':', '').slice(0, 16)}.json`, 'application/json')
    }
    const body = await buildDiagnosticBundle(state, run, photosDir, inferenceDir)
    return sendDownload(response, body, `qvac-vision-lab-diagnostic-${run.id}.zip`, 'application/zip')
  }
  if (request.method === 'POST' && url.pathname === '/api/photos/import') {
    const body = await jsonBody(request, 55 * 1024 * 1024)
    if (!body.filename || !body.dataBase64) throw badRequest('A valid image is required')
    const buffer = Buffer.from(body.dataBase64, 'base64')
    if (!buffer.length || buffer.length > 40 * 1024 * 1024) throw badRequest('Image must be between 1 byte and 40 MB')
    const contentSha256 = createHash('sha256').update(buffer).digest('hex')
    const existingPhoto = store.snapshot().photos.find(photo => photo.contentSha256 === contentSha256)
    if (existingPhoto) {
      if (body.runId) await store.update(state => {
        const run = state.runs.find(item => item.id === body.runId && item.status === 'DRAFT')
        if (!run) throw badRequest('Current run is not available for import')
        if (!run.photoIds.includes(existingPhoto.id)) run.photoIds.push(existingPhoto.id)
        run.photoCount = run.photoIds.length
      })
      if (body.datasetId) await store.update(state => addPhotoToDataset(state, body.datasetId, existingPhoto.id))
      return sendJson(response, 200, { photo: publicPhoto(existingPhoto), reused: true, message: 'Existing identical photo reused' })
    }
    const detectedAtImport = detectFormat(buffer)
    if (!['jpeg','png','webp','heic'].includes(detectedAtImport)) throw badRequest('Unsupported or invalid image content')
    const id = randomUUID()
    const extension = safeExtension(body.filename, body.mimeType)
    const storedFilename = `${id}${extension}`
    await writeFile(path.join(photosDir, storedFilename), buffer, { flag: 'wx' })
    const metadata = await readPhotoMetadata(buffer, body.lastModified)
    const imagePipeline = await prepareImageWithTimeout({ originalPath: path.join(photosDir, storedFilename), outputDir: inferenceDir, photoId: id, reportedMime: body.mimeType, originalFilename: body.filename })
    const inferenceImageSha256 = imagePipeline.ready && imagePipeline.normalized?.filename ? await sha256Path(path.join(inferenceDir, imagePipeline.normalized.filename)) : null
    const photo = {
      id,
      sourcePath: body.relativePath || body.filename,
      filename: path.basename(body.filename),
      mimeType: body.mimeType,
      fileSizeBytes: buffer.length,
      contentSha256,
      storedFilename,
      importedAt: new Date().toISOString(),
      ...metadata,
      width: imagePipeline.original?.width ?? metadata.width,
      height: imagePipeline.original?.height ?? metadata.height,
      orientation: imagePipeline.original?.orientation ?? metadata.orientation,
      detectedFormat: imagePipeline.detectedFormat || null,
      imagePipeline,
      inferenceFilename: imagePipeline.normalized?.filename || null,
      inferenceImageSha256,
      manualLocation: '',
      petIdentity: 'Unknown'
    }
    await store.update(state => {
      state.photos.push(photo)
      if (body.datasetId) addPhotoToDataset(state, body.datasetId, photo.id)
      if (body.runId) {
        const run = state.runs.find(item => item.id === body.runId && item.status === 'DRAFT')
        if (!run) throw badRequest('Current run is not available for import')
        if (!run.photoIds.includes(photo.id)) run.photoIds.push(photo.id)
        run.photoCount = run.photoIds.length
      }
    })
    return sendJson(response, 201, { photo: publicPhoto(photo) })
  }
  if (request.method === 'PATCH' && url.pathname.startsWith('/api/photos/')) {
    const photoId = decodeURIComponent(url.pathname.slice('/api/photos/'.length))
    const body = await jsonBody(request)
    if (body.petIdentity !== undefined && !PET_IDENTITIES.includes(body.petIdentity)) throw badRequest('Invalid pet identity')
    const photo = await store.update(state => {
      const item = state.photos.find(candidate => candidate.id === photoId)
      if (!item) throw notFound('Photo not found')
      if (body.petIdentity !== undefined) item.petIdentity = body.petIdentity
      if (body.manualLocation !== undefined) item.manualLocation = String(body.manualLocation).slice(0, 200)
      return item
    })
    return sendJson(response, 200, { photo: publicPhoto(photo) })
  }
  if (request.method === 'POST' && url.pathname === '/api/analyze') {
    const body = await jsonBody(request)
    const state = store.snapshot()
    let run = state.runs.find(item => item.id === body.runId && item.status === 'DRAFT')
    if (!run) throw badRequest('Start a new run before analysis')
    const provider = providers.get(body.providerId)
    const providerStatus = await provider.status()
    if (providerStatus.state !== 'READY') throw httpError(503, providerStatus.reason || `${providerStatus.name} is not ready`)
    const photoIds = [...new Set(body.photoIds || [])]
    const taskIds = [...new Set(body.taskIds || [])]
    if (run.benchmarkPreset === FOCUSED_BASE_PRESET.id) {
      if (body.providerId !== FOCUSED_BASE_PRESET.providerId) throw badRequest('Focused Standard Benchmark v1 requires VisionPsy-Nano-460M')
      if (taskIds.some(id => !FOCUSED_BASE_TASK_IDS.includes(id))) throw badRequest('Focused Standard Benchmark v1 contains an unsupported task')
      if (FOCUSED_BASE_PRESET.coreTaskIds.some(id => !taskIds.includes(id))) throw badRequest('Focused Standard Benchmark v1 requires all six core tasks')
      const expectedPhotoIds = body.runScope === 'quick' ? run.photoIds.slice(0, 10) : run.photoIds
      if (photoIds.length !== expectedPhotoIds.length || photoIds.some((id, index) => id !== expectedPhotoIds[index])) throw badRequest('Focused benchmark photo scope does not match the current working set')
    }
    if (run.benchmarkPreset === SEMANTIC_EXTRACTION_PRESET.id) {
      if (body.providerId !== SEMANTIC_EXTRACTION_PRESET.providerId) throw badRequest('Semantic Extraction Benchmark v1 requires VisionPsy-Nano-460M')
      if (taskIds.length !== SEMANTIC_TASK_IDS.length || taskIds.some(id => !SEMANTIC_TASK_IDS.includes(id))) throw badRequest('Semantic Extraction Benchmark v1 requires exactly its three semantic tasks')
      const expectedPhotoIds = body.runScope === 'quick' ? run.semanticQuickPhotoIds : run.photoIds
      if (photoIds.length !== expectedPhotoIds.length || photoIds.some((id, index) => id !== expectedPhotoIds[index])) throw badRequest('Semantic benchmark photo scope does not match its documented deterministic subset')
    }
    if (run.benchmarkPreset === MINIMAL_SMART_SEMANTIC_PRESET.id) {
      if (body.providerId !== MINIMAL_SMART_SEMANTIC_PRESET.providerId) throw badRequest('Minimal Smart Semantic Test v2 requires VisionPsy-Nano-460M')
      if (taskIds.length !== MINIMAL_SEMANTIC_TASK_IDS.length || taskIds.some(id => !MINIMAL_SEMANTIC_TASK_IDS.includes(id))) throw badRequest('Minimal Smart Semantic Test v2 requires exactly its three minimal semantic tasks')
      const expectedPhotoIds = run.minimalQuickPhotoIds
      if (body.runScope !== 'quick') throw badRequest('Minimal Smart Semantic Test v2 is limited to its 10-photo micro-benchmark')
      if (photoIds.length !== expectedPhotoIds.length || photoIds.some((id, index) => id !== expectedPhotoIds[index])) throw badRequest('Minimal semantic photo scope does not match its deterministic 10-photo subset')
    }
    if (!photoIds.length || !taskIds.length) throw badRequest('Select at least one photo and one task')
    const selectedPhotos = photoIds.map(id => state.photos.find(photo => photo.id === id)).filter(Boolean)
    const selectedTasks = taskIds.map(id => TASKS.find(task => task.id === id)).filter(Boolean)
    if (selectedPhotos.length !== photoIds.length || selectedTasks.length !== taskIds.length) throw badRequest('Unknown photo or task')
    const readyPhotos = selectedPhotos.filter(photo => photo.imagePipeline?.ready && photo.inferenceFilename)
    const startHigh = performance.now()
    const startedAt = new Date().toISOString()
    const providerInitStartedAt = new Date().toISOString()
    const providerInitStart = performance.now()
    const providerDiagnostics = await provider.runtimeMetadata()
    const providerInitializationMs = Math.round(performance.now() - providerInitStart)
    Object.assign(run, {
      status: 'RUNNING', startedAt, providerId: providerStatus.id, runtime: providerStatus.runtime, runtimeVersion: providerStatus.runtimeVersion,
      model: providerStatus.model, modelVersion: providerStatus.modelVersion, projection: providerStatus.projection, promptVersion: run.benchmarkPreset === MINIMAL_SMART_SEMANTIC_PRESET.id ? MINIMAL_SEMANTIC_PROMPT_VERSION : run.benchmarkPreset === SEMANTIC_EXTRACTION_PRESET.id ? SEMANTIC_PROMPT_VERSION : run.benchmarkPreset === FOCUSED_BASE_PRESET.id ? FOCUSED_BASE_PROMPT_VERSION : PROMPT_VERSION,
      workingPhotoIds: [...run.photoIds], runScope: body.runScope === 'quick' ? 'quick' : 'full', photoIds, taskIds, photoCount: photoIds.length, taskCount: taskIds.length, expectedPredictions: readyPhotos.length * taskIds.length, inferenceReadyPhotos: readyPhotos.length, imagePipelineFailures: selectedPhotos.length - readyPhotos.length, completedPredictions: 0, failedPredictions: 0,
      cancelled: false, providerInitializationStartedAt: providerInitStartedAt, providerInitializationFinishedAt: new Date().toISOString(), providerInitializationMs,
      firstInferenceStartedAt: null, firstInferenceFinishedAt: null, firstResultAt: null, currentPhotoId: null, currentFilename: null, currentTaskId: null,
      currentStage: 'provider initialization', lastSuccessfulStep: 'provider metadata ready', stageStartedAt: new Date().toISOString(), taskTrace: [],
      providerDiagnostics: { ...providerDiagnostics, ...platformDiagnostics() }
    })
    await store.update(current => Object.assign(current.runs.find(item => item.id === run.id), run))
    const controller = new AbortController()
    activeRuns.set(run.id, { controller, provider })
    const created = []
    for (const photo of selectedPhotos) {
      if (controller.signal.aborted) break
      if (!photo.imagePipeline?.ready || !photo.inferenceFilename) {
        await store.update(current => {
          const target = current.runs.find(item => item.id === run.id)
          target.photoTimings ??= []
          target.photoTimings.push({ photoId: photo.id, filename: photo.filename, skipped: true, errorCode: photo.imagePipeline?.errorCode || 'IMAGE_DECODE_FAILED' })
          target.completedPhotos = target.photoTimings.length
        })
        continue
      }
      const photoStartedAt = new Date().toISOString()
      for (const task of selectedTasks) {
        if (controller.signal.aborted) break
        const taskStartedAt = new Date().toISOString()
        const taskTrace = []
        let previousTraceAt = Date.parse(taskStartedAt)
        const trace = async (stage, details = {}) => {
          const eventAtMs = Date.now()
          const event = { at: new Date(eventAtMs).toISOString(), elapsedMs: eventAtMs - Date.parse(taskStartedAt), durationSincePreviousMs: eventAtMs - previousTraceAt, photoId: photo.id, taskId: task.id, stage, ...details }
          previousTraceAt = eventAtMs
          taskTrace.push(event)
          await store.update(current => { const target = current.runs.find(item => item.id === run.id); if (!target) return; target.currentStage = stage; target.stageStartedAt = event.at; target.lastSuccessfulStep = details.success ? stage : target.lastSuccessfulStep; target.providerPid = details.pid ?? target.providerPid; target.taskTrace ??= []; target.taskTrace.push(event) })
        }
        await trace('dequeue task', { success: true })
        await trace('image preprocessing start')
        await trace('image preprocessing end', { success: true, preprocessingDurationMs: photo.imagePipeline?.pipeline ? Object.values(photo.imagePipeline.pipeline).reduce((sum, item) => sum + (item.durationMs || 0), 0) : null })
        await trace('inference image read', { success: true, inferenceFilename: photo.inferenceFilename })
        if (!run.firstInferenceStartedAt) run.firstInferenceStartedAt = taskStartedAt
        await store.update(current => Object.assign(current.runs.find(item => item.id === run.id), { firstInferenceStartedAt: run.firstInferenceStartedAt, currentPhotoId: photo.id, currentFilename: photo.filename, currentTaskId: task.id }))
        const base = {
          id: randomUUID(), runId: run.id, photoId: photo.id, taskId: task.id, task: task.name,
          prompt: task.prompt, promptVersion: promptVersionForTask(task.id), providerId: providerStatus.id,
          runtime: providerStatus.runtime, runtimeVersion: providerStatus.runtimeVersion,
          model: providerStatus.model, modelVersion: providerStatus.modelVersion, projection: providerStatus.projection,
          createdAt: taskStartedAt, startedAt: taskStartedAt, finishedAt: null, rawOutput: '', normalizedOutput: null,
          latencyMs: null, validationResult: 'ERROR', error: null
        }
        try {
          await trace('provider invocation start')
          const predictionInput = { runId: run.id, signal: controller.signal, timeoutMs: Number(process.env.PAWVAULT_PREDICTION_TIMEOUT_MS || 30000), imagePath: path.join(inferenceDir, photo.inferenceFilename), prompt: task.prompt, promptVersion: promptVersionForTask(task.id), allowedLabels: task.labels, outputMode: task.outputMode, taskId: task.id, maxTokens: MINIMAL_SEMANTIC_TASK_IDS.includes(task.id) ? 64 : task.outputMode === 'semantic' ? 48 : 24, onTrace: event => { void trace(event.stage, { pid: event.pid, retryCount: event.retryCount }) } }
          let result
          let retryCount = 0
          try { result = await provider.analyzeImage(predictionInput) }
          catch (firstError) {
            if (firstError.code !== 'MODEL_TIMEOUT' || controller.signal.aborted) throw firstError
            retryCount = 1
            await trace('server restart after timeout', { pid: firstError.pid, retryCount })
            await provider.restartServer?.('MODEL_TIMEOUT')
            result = await provider.analyzeImage({ ...predictionInput, retryCount })
          }
          await trace('provider invocation end', { success: true, pid: result.runtimeStats?.pid })
          await trace('output parsing')
          const validation = MINIMAL_SEMANTIC_TASK_IDS.includes(task.id) ? normalizeMinimalSemanticOutput(result.rawOutput) : task.outputMode === 'semantic' ? normalizeSemanticOutput(task.id, result.rawOutput) : normalizeTaskOutput(task.id, result.rawOutput, task.labels)
          await trace('normalization', { success: true })
          Object.assign(base, {
            rawOutput: result.rawOutput,
            normalizedOutput: validation.normalized,
            validationResult: validation.validationResult,
            latencyMs: result.latencyMs,
            providerId: result.providerId, runtime: result.runtime, runtimeVersion: result.runtimeVersion,
            model: result.model,
            modelVersion: result.modelVersion, projection: result.projection,
            promptVersion: result.promptVersion, timestamp: result.timestamp,
            runtimeStats: { ...result.runtimeStats, retry_count: retryCount },
            searchToken: validation.searchToken ?? null,
            semanticPhrase: task.outputMode === 'semantic' ? validation.normalized : null
          })
          if (validation.validationResult !== 'VALID') base.errorCode = 'MODEL_INVALID_OUTPUT'
        } catch (error) {
          base.error = String(error.stack || error)
          base.errorCode = error.code === 'MODEL_TIMEOUT' ? 'MODEL_TIMEOUT' : error.code === 'RUN_CANCELLED' ? 'RUN_CANCELLED' : 'PROVIDER_CALL_FAILED'
          base.runtimeStats = { pid: error.pid ?? null, server_pid: error.pid ?? null, server_started_at: error.serverStartedAt ?? null, server_restart_count: error.serverRestartCount ?? null, timeoutMs: Number(process.env.PAWVAULT_PREDICTION_TIMEOUT_MS || 30000), timeout_triggered: error.code === 'MODEL_TIMEOUT', retry_count: error.retryCount ?? (taskTrace.some(event => event.stage === 'server restart after timeout') ? 1 : 0), request_started_at: error.requestStartedAt ?? taskStartedAt, request_finished_at: error.requestFinishedAt ?? new Date().toISOString(), stdoutTail: error.stdout?.slice(-4000) || '', stderrTail: error.stderr?.slice(-8000) || '', trace: taskTrace }
        }
        base.finishedAt = new Date().toISOString()
        if (!run.firstInferenceFinishedAt) run.firstInferenceFinishedAt = base.finishedAt
        if (!run.firstResultAt) run.firstResultAt = base.finishedAt
        run.completedPredictions += base.error ? 0 : 1
        run.failedPredictions += base.error ? 1 : 0
        run.lastResultMs = base.latencyMs
        await store.update(current => {
          current.inferences.push(base)
          Object.assign(current.runs.find(item => item.id === run.id), { firstInferenceFinishedAt: run.firstInferenceFinishedAt, firstResultAt: run.firstResultAt, completedPredictions: run.completedPredictions, failedPredictions: run.failedPredictions, lastResultMs: run.lastResultMs })
        })
        await trace('persistence', { success: true })
        if (!controller.signal.aborted) await trace('next task', { success: true })
        created.push(base)
      }
      await store.update(current => {
        const target = current.runs.find(item => item.id === run.id)
        target.photoTimings ??= []
        target.photoTimings.push({ photoId: photo.id, filename: photo.filename, startedAt: photoStartedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - Date.parse(photoStartedAt) })
        target.completedPhotos = target.photoTimings.length
      })
    }
    const finishedAt = new Date().toISOString()
    const finalMetadata = await provider.runtimeMetadata()
    run = await store.update(current => {
      const target = current.runs.find(item => item.id === run.id)
      const cancelled = controller.signal.aborted || target.status === 'CANCELLED'
      Object.assign(target, { status: cancelled ? 'CANCELLED' : 'COMPLETED', cancelled, finishedAt, durationMs: Math.round(performance.now() - startHigh), currentPhotoId: null, currentFilename: null, currentTaskId: null, currentStage: cancelled ? 'cancelled' : 'completed', modelLoadMs: finalMetadata.coldStartMs ?? (Number.isFinite(finalMetadata.loadSeconds) ? Math.round(finalMetadata.loadSeconds * 1000) : null), providerDiagnostics: { ...target.providerDiagnostics, ...finalMetadata } })
      target.timings = calculateRunTimings(target, current.inferences.filter(item => item.runId === target.id))
      target.warnings = detectAnomalies(current.inferences.filter(item => item.runId === target.id))
      return target
    })
    activeRuns.delete(run.id)
    return sendJson(response, 201, { run, inferences: created, provider: finalMetadata })
  }
  if (request.method === 'POST' && url.pathname === '/api/reviews/ai-assisted-batch') {
    const body = await jsonBody(request)
    const result = await store.update(state => addAiAssistedReviews(state, { runId: body.runId, labels: body.labels }))
    return sendJson(response, 201, { created: result.created.length, skippedHuman: result.skippedHuman, skippedExisting: result.skippedExisting, skippedMissingInference: result.skippedMissingInference, reviewSource: 'CODEX_VISUAL_REVIEW', groundTruthSource: 'AI_ASSISTED' })
  }
  if (request.method === 'POST' && url.pathname === '/api/reviews') {
    const body = await jsonBody(request)
    const inferenceSnapshot = store.snapshot().inferences.find(item => item.id === body.inferenceId)
    const vqaManual = inferenceSnapshot?.taskId === 'vqa_manual'
    const semantic = ALL_SEMANTIC_TASK_IDS.includes(inferenceSnapshot?.taskId) || vqaManual
    const minimalSemantic = MINIMAL_SEMANTIC_TASK_IDS.includes(inferenceSnapshot?.taskId)
    const verdicts = semantic ? OPEN_REVIEW_VERDICTS : ['CORRECT', 'WRONG', 'AMBIGUOUS']
    if (!verdicts.includes(body.verdict)) throw badRequest('Invalid review verdict')
    const review = await store.update(state => {
      const inference = state.inferences.find(item => item.id === body.inferenceId)
      if (!inference) throw notFound('Inference not found')
      const task = TASKS.find(item => item.id === inference.taskId)
      if (!semantic && body.verdict === 'CORRECT' && inference.validationResult !== 'VALID') throw badRequest('Invalid model output cannot be confirmed as correct')
      if (!semantic && body.verdict === 'WRONG' && !task.labels.includes(body.correctLabel)) throw badRequest('Select a valid correct label')
      if (semantic && body.correctedText && inference.taskId !== 'associated_objects') throw badRequest('Manual semantic text correction is supported only for Associated objects')
      if (!minimalSemantic && !vqaManual && body.humanNote) throw badRequest('Human note is supported only for open-output review')
      const semanticCorrection = semantic && body.correctedText ? normalizeSemanticOutput('associated_objects', body.correctedText) : null
      if (semanticCorrection?.validationResult === 'INVALID_OUTPUT') throw badRequest('Associated objects correction must contain at most three short comma-separated object names')
      const item = {
        id: randomUUID(),
        inferenceId: inference.id,
        verdict: body.verdict,
        correctLabel: semantic ? null : body.verdict === 'CORRECT' ? inference.normalizedOutput : body.verdict === 'WRONG' ? body.correctLabel : null,
        correctedText: semanticCorrection?.normalized ?? null,
        humanNote: minimalSemantic || vqaManual ? String(body.humanNote || '').trim().slice(0, 500) || null : null,
        groundTruthSource: semantic ? 'USER_MANUAL' : body.verdict === 'AMBIGUOUS' ? null : 'HUMAN_CONFIRMED',
        reviewSource: 'USER_MANUAL',
        judge: { type: 'USER', provenance: 'USER_MANUAL' },
        reviewedAt: new Date().toISOString()
      }
      state.reviews.push(item)
      if (!semantic) upsertGroundTruth(state.annotations, inference, item)
      return item
    })
    const inference = store.snapshot().inferences.find(item => item.id === body.inferenceId)
    if (inference?.taskId === 'dog_count' && review.correctLabel) {
      const dogLabel = ({ none: 'no_dog', one: 'one_dog', two: 'multiple_dogs', more_than_two: 'multiple_dogs' })[review.correctLabel]
      if (dogLabel) {
        const benchmark = await dogCountBenchmarkView()
        benchmark.truth.labels[inference.photoId] = dogLabel
        benchmark.truth.updatedAt = review.reviewedAt
        benchmark.truth.source = 'HUMAN_CONFIRMED'
        await writeFile(dogTruthPath, `${JSON.stringify(benchmark.truth, null, 2)}\n`)
      }
    }
    return sendJson(response, 201, { review })
  }
  if (request.method === 'PATCH' && url.pathname.startsWith('/api/tasks/')) {
    const taskId = decodeURIComponent(url.pathname.slice('/api/tasks/'.length))
    const body = await jsonBody(request)
    if (!TASKS.some(task => task.id === taskId)) throw notFound('Task not found')
    if (!['CORE_CANDIDATE', 'EXPERIMENTAL', 'REJECTED'].includes(body.status)) throw badRequest('Invalid task status')
    await store.update(state => { state.taskStatuses[taskId] = body.status })
    return sendJson(response, 200, { taskId, status: body.status })
  }
  throw notFound('Route not found')
}

async function analyzeArenaRound(roundId) {
  const snapshot = store.snapshot()
  let round = snapshot.arenaRounds.find(item => item.id === roundId)
  let run = round && snapshot.runs.find(item => item.id === round.runId)
  if (!round || !run || !['DRAFT','QUEUED'].includes(round.status) || run.status !== 'DRAFT') throw badRequest('Arena round is not available for analysis')
  const photo = snapshot.photos.find(item => item.id === round.photoId)
  if (!photo?.imagePipeline?.ready || !photo.inferenceFilename) throw badRequest('Arena image is not inference-ready')
  const selectedProviders = round.providerIds.map(id => providers.get(id))
  const statuses = []
  for (const provider of selectedProviders) {
    const status = await provider.status()
    if (status.state !== 'READY') throw httpError(503, `${status.name}: ${status.reason || 'provider not ready'}`)
    statuses.push(status)
  }
  const startedAt = new Date().toISOString(); const startHigh = performance.now()
  Object.assign(round, { status: 'RUNNING', startedAt })
  Object.assign(run, { status: 'RUNNING', startedAt, expectedPredictions: selectedProviders.length, completedPredictions: 0, failedPredictions: 0, currentStage: 'provider initialization', currentPhotoId: photo.id, currentBlindLabel: null })
  await store.update(state => { Object.assign(state.arenaRounds.find(item => item.id === round.id), round); Object.assign(state.runs.find(item => item.id === run.id), run) })
  const controller = new AbortController(); activeRuns.set(run.id, { controller, providers: selectedProviders })
  const created = []
  for (const providerId of round.executionOrder || round.providerIds) {
    if (controller.signal.aborted) break
    const blindLabel = Object.entries(round.blindMapping).find(([, id]) => id === providerId)?.[0]
    const index = round.providerIds.indexOf(providerId); const provider = selectedProviders[index]; const status = statuses[index]
    const taskStartedAt = new Date().toISOString()
    await store.update(state => Object.assign(state.runs.find(item => item.id === run.id), { currentBlindLabel: blindLabel, currentStage: 'inference' }))
    const base = { id: randomUUID(), runId: run.id, arenaRoundId: round.id, blindLabel, executionIndex: (round.executionOrder || round.providerIds).indexOf(providerId), experimentId: round.experimentId, datasetId: round.datasetId, photoId: photo.id, inferenceImage: round.inferenceImage, taskId: 'arena_visual_question', task: 'Blind Arena visual question', prompt: round.question, formattedRuntimePrompt: round.question, promptVersion: 'user-authored-arena-v1', outputBudget: round.outputBudget, modelLockId: arenaModelLock.lock.id, modelLockHash: arenaModelLock.lockHash, providerId: status.id, runtime: status.runtime, runtimeVersion: status.runtimeVersion, model: status.model, modelVersion: status.modelVersion, projection: status.projection, createdAt: taskStartedAt, startedAt: taskStartedAt, finishedAt: null, rawOutput: '', normalizedOutput: null, latencyMs: null, validationResult: 'ERROR', error: null, errorCode: null }
    try {
      const result = await provider.analyzeImage({ runId: run.id, signal: controller.signal, timeoutMs: Number(process.env.PAWVAULT_PREDICTION_TIMEOUT_MS || 30000), imagePath: path.join(inferenceDir, photo.inferenceFilename), prompt: round.question, promptVersion: 'user-authored-arena-v1', allowedLabels: [], outputMode: 'semantic', taskId: 'arena_visual_question', maxTokens: round.outputBudget })
      const validation = normalizeMinimalSemanticOutput(result.rawOutput)
      Object.assign(base, { rawOutput: result.rawOutput, normalizedOutput: validation.normalized, validationResult: validation.validationResult, latencyMs: result.latencyMs, providerId: result.providerId, runtime: result.runtime, runtimeVersion: result.runtimeVersion, model: result.model, modelVersion: result.modelVersion, projection: result.projection, timestamp: result.timestamp, runtimeStats: { ...result.runtimeStats, retry_count: 0 } })
      if (validation.validationResult !== 'VALID') base.errorCode = result.rawOutput?.trim() ? 'INVALID_OUTPUT' : 'EMPTY_OUTPUT'
    } catch (error) {
      base.error = String(error.stack || error)
      base.errorCode = arenaFailureCode(error)
      base.runtimeStats = { pid: error.pid ?? null, timeoutMs: Number(process.env.PAWVAULT_PREDICTION_TIMEOUT_MS || 30000), timeout_triggered: error.code === 'MODEL_TIMEOUT', stdoutTail: error.stdout?.slice(-4000) || '', stderrTail: error.stderr?.slice(-8000) || '', retry_count: 0 }
    }
    base.finishedAt = new Date().toISOString(); created.push(base)
    run.completedPredictions += base.error ? 0 : 1; run.failedPredictions += base.error ? 1 : 0
    await store.update(state => { state.inferences.push(base); const targetRound = state.arenaRounds.find(item => item.id === round.id); targetRound.answerIds[blindLabel] = base.id; Object.assign(state.runs.find(item => item.id === run.id), { completedPredictions: run.completedPredictions, failedPredictions: run.failedPredictions }) })
  }
  const finishedAt = new Date().toISOString()
  const result = await store.update(state => {
    const targetRun = state.runs.find(item => item.id === run.id); const targetRound = state.arenaRounds.find(item => item.id === round.id)
    const cancelled = controller.signal.aborted || targetRun.status === 'CANCELLED'
    Object.assign(targetRun, { status: cancelled ? 'CANCELLED' : 'COMPLETED', cancelled, finishedAt, durationMs: Math.round(performance.now() - startHigh), currentStage: cancelled ? 'cancelled' : 'completed', currentBlindLabel: null })
    Object.assign(targetRound, { status: cancelled ? 'CANCELLED' : 'AWAITING_JUDGMENT', finishedAt })
    if (!cancelled) {
      assertSameInputFairness(targetRound, state.inferences)
      if (targetRound.expectedAnswer) for (const blindLabel of Object.keys(targetRound.blindMapping)) {
        const inference = state.inferences.find(item => item.id === targetRound.answerIds[blindLabel])
        const objective = scoreObjectiveAnswer(inference?.rawOutput || '', targetRound)
        if (objective.verdict) recordArenaJudgment(state, { roundId: targetRound.id, blindLabel, verdict: objective.verdict, judgeProviderId: 'GOLD_ANSWER_SCORER', judgeId: 'objective-answer-v1', judgeLabel: 'Deterministic gold-answer scorer', note: JSON.stringify({ answerType: objective.answerType, normalizedOutput: objective.actual, accepted: objective.accepted }) }, { allowDeterministic: true })
      }
    }
    return { run: targetRun, round: publicArenaRound(targetRound, state) }
  })
  activeRuns.delete(run.id)
  return result
}

async function analyzeVqaRun(runId) {
  const snapshot = store.snapshot()
  let run = snapshot.runs.find(item => item.id === runId && item.status === 'DRAFT')
  if (!run || !VQA_PRESETS.some(item => item.id === run.benchmarkPreset)) throw badRequest('VQA run is not available for analysis')
  const selectedPhotos = run.photoIds.map(id => snapshot.photos.find(photo => photo.id === id)).filter(Boolean)
  const questionMap = new Map(snapshot.vqaQuestions.filter(item => run.questionIds.includes(item.id)).map(item => [item.photoId, item]))
  if (selectedPhotos.length !== run.photoIds.length || selectedPhotos.some(photo => !questionMap.get(photo.id))) throw badRequest('VQA run has incomplete image or question data')
  const selectedProviders = run.providerIds.map(id => providers.get(id))
  const statuses = []
  for (const provider of selectedProviders) {
    const status = await provider.status()
    if (status.state !== 'READY') throw httpError(503, `${status.name}: ${status.reason || 'provider not ready'}`)
    statuses.push(status)
  }
  const readyPhotos = selectedPhotos.filter(photo => photo.imagePipeline?.ready && photo.inferenceFilename)
  const startedAt = new Date().toISOString()
  const startHigh = performance.now()
  Object.assign(run, { status: 'RUNNING', startedAt, expectedPredictions: readyPhotos.length * selectedProviders.length, inferenceReadyPhotos: readyPhotos.length, imagePipelineFailures: selectedPhotos.length - readyPhotos.length, completedPredictions: 0, failedPredictions: 0, currentStage: 'provider initialization', currentPhotoId: null, currentQuestionId: null, currentProviderId: null, providerDiagnostics: {} })
  for (let index = 0; index < selectedProviders.length; index++) run.providerDiagnostics[statuses[index].id] = { ...(await selectedProviders[index].runtimeMetadata()), ...platformDiagnostics() }
  await store.update(state => Object.assign(state.runs.find(item => item.id === run.id), run))
  const controller = new AbortController()
  activeRuns.set(run.id, { controller, providers: selectedProviders })
  const created = []
  for (const photo of selectedPhotos) {
    if (controller.signal.aborted) break
    if (!photo.imagePipeline?.ready || !photo.inferenceFilename) continue
    const question = questionMap.get(photo.id)
    for (let index = 0; index < selectedProviders.length; index++) {
      if (controller.signal.aborted) break
      const provider = selectedProviders[index]
      const status = statuses[index]
      const taskStartedAt = new Date().toISOString()
      await store.update(state => Object.assign(state.runs.find(item => item.id === run.id), { currentPhotoId: photo.id, currentFilename: photo.filename, currentQuestionId: question.id, currentProviderId: status.id, currentStage: 'inference' }))
      const base = { id: randomUUID(), runId: run.id, experimentId: run.experimentId, datasetId: run.datasetId, questionId: question.id, photoId: photo.id, taskId: 'vqa_manual', task: 'Manual visual question', prompt: question.text, promptVersion: 'manual-vqa-v1', providerId: status.id, runtime: status.runtime, runtimeVersion: status.runtimeVersion, model: status.model, modelVersion: status.modelVersion, projection: status.projection, createdAt: taskStartedAt, startedAt: taskStartedAt, finishedAt: null, rawOutput: '', normalizedOutput: null, semanticPhrase: null, latencyMs: null, validationResult: 'ERROR', error: null, errorCode: null }
      try {
        const input = { runId: run.id, signal: controller.signal, timeoutMs: Number(process.env.PAWVAULT_PREDICTION_TIMEOUT_MS || 30000), imagePath: path.join(inferenceDir, photo.inferenceFilename), prompt: question.text, promptVersion: 'manual-vqa-v1', allowedLabels: [], outputMode: 'semantic', taskId: 'vqa_manual', maxTokens: 64 }
        let result
        let retryCount = 0
        try { result = await provider.analyzeImage(input) }
        catch (firstError) {
          if (firstError.code !== 'MODEL_TIMEOUT' || controller.signal.aborted) throw firstError
          retryCount = 1
          await provider.restartServer?.('MODEL_TIMEOUT')
          result = await provider.analyzeImage({ ...input, retryCount })
        }
        const validation = normalizeMinimalSemanticOutput(result.rawOutput)
        Object.assign(base, { rawOutput: result.rawOutput, normalizedOutput: validation.normalized, semanticPhrase: validation.normalized, validationResult: validation.validationResult, latencyMs: result.latencyMs, providerId: result.providerId, runtime: result.runtime, runtimeVersion: result.runtimeVersion, model: result.model, modelVersion: result.modelVersion, projection: result.projection, timestamp: result.timestamp, runtimeStats: { ...result.runtimeStats, retry_count: retryCount } })
        if (validation.validationResult !== 'VALID') base.errorCode = 'MODEL_INVALID_OUTPUT'
      } catch (error) {
        base.error = String(error.stack || error)
        base.errorCode = error.code === 'MODEL_TIMEOUT' ? 'MODEL_TIMEOUT' : error.code === 'RUN_CANCELLED' ? 'RUN_CANCELLED' : 'PROVIDER_CALL_FAILED'
        base.runtimeStats = { pid: error.pid ?? null, timeoutMs: Number(process.env.PAWVAULT_PREDICTION_TIMEOUT_MS || 30000), timeout_triggered: error.code === 'MODEL_TIMEOUT', stdoutTail: error.stdout?.slice(-4000) || '', stderrTail: error.stderr?.slice(-8000) || '' }
      }
      base.finishedAt = new Date().toISOString()
      run.completedPredictions += base.error ? 0 : 1
      run.failedPredictions += base.error ? 1 : 0
      await store.update(state => { state.inferences.push(base); Object.assign(state.runs.find(item => item.id === run.id), { completedPredictions: run.completedPredictions, failedPredictions: run.failedPredictions }) })
      created.push(base)
    }
  }
  const finishedAt = new Date().toISOString()
  run = await store.update(state => {
    const target = state.runs.find(item => item.id === run.id)
    const cancelled = controller.signal.aborted || target.status === 'CANCELLED'
    Object.assign(target, { status: cancelled ? 'CANCELLED' : 'COMPLETED', cancelled, finishedAt, durationMs: Math.round(performance.now() - startHigh), currentPhotoId: null, currentQuestionId: null, currentProviderId: null, currentStage: cancelled ? 'cancelled' : 'completed' })
    const rows = state.inferences.filter(item => item.runId === target.id)
    target.timings = calculateRunTimings(target, rows)
    target.warnings = detectAnomalies(rows)
    return target
  })
  activeRuns.delete(run.id)
  return { run, inferences: created }
}

async function dogCountBenchmarkView() {
  const state = store.snapshot()
  const sourceRunId = 'run_20260813132428_draft_81956996'
  const run = state.runs.find(item => item.id === sourceRunId)
  if (!run) throw notFound('VisionPsy Flash baseline run not found')
  await mkdir(benchmarkDir, { recursive: true })
  let truth
  try { truth = JSON.parse(await readFile(dogTruthPath, 'utf8')) }
  catch {
    truth = { labels: Object.fromEntries(run.photoIds.map(id => [id, null])), allowedLabels: ['no_dog', 'one_dog', 'multiple_dogs'], source: null, note: 'Human labels only. Model outputs are never ground truth.' }
    await writeFile(dogTruthPath, `${JSON.stringify(truth, null, 2)}\n`)
  }
  const experiments = []
  for (const [provider, filename] of [['Flash', 'visionpsy-dog-flash.json'], ['Standard', 'visionpsy-dog-base.json']]) {
    try {
      const artifact = JSON.parse(await readFile(path.join(benchmarkDir, filename), 'utf8'))
      for (const variant of ['A_exact', 'B_single_multiple', 'C_binary']) {
        const rows = artifact.rows.filter(row => row.variant === variant)
        experiments.push({ provider, variant, ...dogBenchmarkMetrics(rows, truth.labels) })
      }
    } catch {}
  }
  return { baselineId: 'VISIONPSY_FLASH_BASELINE_V1', sourceRunId, photos: run.photoIds.map(id => publicPhoto(state.photos.find(photo => photo.id === id))).filter(Boolean), truth, confirmed: Object.values(truth.labels).filter(Boolean).length, total: run.photoIds.length, experiments }
}

function dogBenchmarkMetrics(rows, labels) {
  const reviewed = rows.filter(row => labels[row.photoId])
  const usable = reviewed.filter(row => row.parseStatus === 'VALID' && row.normalizedOutput !== 'unclear')
  const correct = row => {
    const truth = labels[row.photoId]
    if (row.variant === 'C_binary') return (row.normalizedOutput === 'yes') === (truth === 'multiple_dogs')
    if (truth === 'no_dog') return row.normalizedOutput === (row.variant === 'A_exact' ? 'none' : 'no_dog')
    if (truth === 'one_dog') return row.normalizedOutput === (row.variant === 'A_exact' ? 'one' : 'single_dog')
    return row.variant === 'A_exact' ? ['two', 'more_than_two'].includes(row.normalizedOutput) : row.normalizedOutput === 'multiple_dogs'
  }
  const accuracy = selected => selected.length ? selected.filter(correct).length / selected.length : null
  return { reviewed: reviewed.length, oneDogAccuracy: accuracy(usable.filter(row => labels[row.photoId] === 'one_dog')), multipleDogAccuracy: accuracy(usable.filter(row => labels[row.photoId] === 'multiple_dogs')), overallAccuracy: accuracy(usable), unclearRate: rows.length ? rows.filter(row => row.normalizedOutput === 'unclear').length / rows.length : null, invalidRate: rows.length ? rows.filter(row => row.parseStatus !== 'VALID').length / rows.length : null }
}

function arenaFailureCode(error) {
  if (error.code === 'MODEL_TIMEOUT') return 'MODEL_TIMEOUT'
  if (error.code === 'RUN_CANCELLED') return 'CANCELLED'
  if (error.code === 'MODEL_IDENTITY_MISMATCH') return 'MODEL_IDENTITY_MISMATCH'
  if (/out of memory|\boom\b/i.test(error.message || '')) return 'OOM'
  if (/load|startup/i.test(error.message || '')) return 'MODEL_LOAD_FAILED'
  if (/crash|exited|signal/i.test(error.message || '')) return 'MODEL_CRASH'
  return 'MODEL_CRASH'
}

async function viewState(state, requestedRunId) {
  const selectedRun = requestedRunId ? state.runs.find(item => item.id === requestedRunId) : [...state.runs].reverse().find(item => item.status === 'DRAFT' || item.status === 'RUNNING') || state.runs.at(-1) || null
  const selected = selectedRun ? selectRunData(state, selectedRun.id) : { photos: [], inferences: [], reviews: [] }
  const runPhotoIds = new Set(selected.photos.map(photo => photo.id))
  const isArenaRun = ['blind_vision_arena_v1','fair_resource_matched_arena_v1'].includes(selectedRun?.benchmarkPreset)
  const runInferences = isArenaRun ? [] : selected.inferences
  const runReviews = latestReviews({ ...state, reviews: selected.reviews })
  const selectedQuestions = selectedRun?.questionIds ? state.vqaQuestions.filter(item => selectedRun.questionIds.includes(item.id)) : []
  const isVqaRun = VQA_PRESETS.some(item => item.id === selectedRun?.benchmarkPreset)
  return {
    project: { name: 'QVAC Vision Lab', historicalProduct: 'QVAC PawVault' },
    experiments: EXPERIMENTS,
    datasets: publicDatasets(state),
    labPhotos: state.photos.map(publicPhoto),
    vqaPresets: VQA_PRESETS,
    providerSlots: PROVIDER_SLOTS,
    currentRun: isArenaRun ? { id: selectedRun.id, status: selectedRun.status, benchmarkPreset: selectedRun.benchmarkPreset, arenaRoundId: selectedRun.arenaRoundId, photoIds: selectedRun.photoIds, photoCount: selectedRun.photoCount, taskIds: selectedRun.taskIds, taskCount: selectedRun.taskCount, completedPredictions: selectedRun.completedPredictions, failedPredictions: selectedRun.failedPredictions, currentStage: selectedRun.currentStage, currentBlindLabel: selectedRun.currentBlindLabel, startedAt: selectedRun.startedAt, finishedAt: selectedRun.finishedAt, durationMs: selectedRun.durationMs, cancelled: selectedRun.cancelled } : selectedRun,
    photos: selected.photos.map(publicPhoto),
    archivedPhotos: state.photos.filter(photo => !runPhotoIds.has(photo.id)).map(publicPhoto),
    previousRuns: [...state.runs].filter(run => run.id !== selectedRun?.id).reverse().map(run => runSummary(run, state)),
    tasks: TASKS.map(task => ({ ...task, status: state.taskStatuses[task.id] || task.defaultStatus })),
    inferences: runInferences,
    reviews: runReviews,
    questions: selectedQuestions,
    featuredExamples: state.featuredExamples || [],
    evidenceGallery: evidenceGallery(state),
    evaluation: evaluate({ ...state, inferences: runInferences, reviews: runReviews, runs: selectedRun ? [selectedRun] : [] }),
    semanticEvaluation: [SEMANTIC_EXTRACTION_PRESET.id, MINIMAL_SMART_SEMANTIC_PRESET.id].includes(selectedRun?.benchmarkPreset) ? { metrics: semanticMetrics(runInferences, runReviews, selectedRun.benchmarkPreset === MINIMAL_SMART_SEMANTIC_PRESET.id ? MINIMAL_SEMANTIC_TASKS : SEMANTIC_TASKS), useful: semanticResultRows(state, selectedRun, runInferences, runReviews, ['CORRECT', 'PARTIALLY_CORRECT']), failures: semanticResultRows(state, selectedRun, runInferences, runReviews, ['WRONG', 'HALLUCINATED']), comparison: selectedRun.benchmarkPreset === SEMANTIC_EXTRACTION_PRESET.id ? semanticComparison(state, selectedRun, runInferences) : [], issues: selectedRun.benchmarkPreset === MINIMAL_SMART_SEMANTIC_PRESET.id ? minimalSemanticIssues(runInferences, runReviews, state.annotations, state.photos) : [] } : null,
    vqaEvaluation: isVqaRun ? { metrics: arenaMetrics(runInferences, runReviews), rows: vqaResultRows(state, selectedRun, runInferences, runReviews, selectedQuestions), minimumReviewedForRanking: 20 } : null,
    providers: await providers.statuses(),
    benchmarkPresets: BENCHMARK_PRESETS,
    semanticSearchTokenRules: SEARCH_TOKEN_RULES.map(([source, token]) => ({ source, token })),
    benchmarkTiming: benchmarkTiming(state),
    identities: PET_IDENTITIES,
    arena: arenaView(state, selectedRun?.arenaRoundId)
  }
}

function arenaView(state, selectedArenaRoundId) {
  const selected = state.arenaRounds.find(item => item.id === selectedArenaRoundId) || [...state.arenaRounds].reverse().find(item => item.status !== 'REVEALED') || state.arenaRounds.at(-1) || null
  const blindReviewActive = selected && selected.status !== 'REVEALED' && !['DRAFT','CANCELLED','FAILED'].includes(selected.status)
  const filters = { datasetId: 'all', category: 'all', providerId: 'all', judgeProviderId: 'all', evidenceTier: 'RANKING_ELIGIBLE' }
  return {
    currentRound: selected ? publicArenaRound(selected, state) : null,
    rounds: [...state.arenaRounds].reverse().filter(item => item.status === 'REVEALED').map(item => publicArenaRound(item, state)),
    dashboard: arenaDashboard(state, filters),
    questionBank: state.questionBank.map(entry => blindReviewActive ? { ...entry, expectedAnswer: null, expectedAnswerSource: null, notes: '', redactedDuringBlindReview: true } : entry),
    benchmarkSets: state.arenaBenchmarkSets,
    batches: state.arenaBatches,
    scoring: state.arenaScoring,
    verdicts: ARENA_VERDICTS,
    categories: QUESTION_CATEGORIES,
    providerIds: ARENA_PROVIDER_IDS,
    primaryProviderIds: PRIMARY_ARENA_PROVIDER_IDS,
    evidenceTiers: EVIDENCE_TIERS,
    judgeProviders: JUDGE_PROVIDER_BOUNDARIES,
    featuredExamples: state.arenaFeaturedExamples,
    builder: { datasets: datasetBuilderView(state), reviewQueue: buildReviewQueue(state), benchmarkSets: state.arenaBenchmarkSets.map(set => ({ ...set, coverage: benchmarkCoverage(state, set.id), validation: validateBenchmarkSet(state, set.id), versionDiff: set.parentVersionId ? benchmarkDiff(state, set.parentVersionId, set.id) : null })), groundTruthRedactedDuringBlindReview: Boolean(blindReviewActive) }
  }
}

function vqaResultRows(state, run, inferences, reviews, questions) {
  const reviewMap = new Map(reviews.map(item => [item.inferenceId, item]))
  const questionMap = new Map(questions.map(item => [item.id, item]))
  return run.photoIds.map(photoId => ({
    photo: publicPhoto(state.photos.find(photo => photo.id === photoId)),
    question: questions.find(item => item.photoId === photoId) || null,
    answers: inferences.filter(item => item.photoId === photoId).map(inference => ({ inference, review: reviewMap.get(inference.id) || null, featured: (state.featuredExamples || []).some(item => item.inferenceId === inference.id) }))
  })).filter(item => item.photo && item.question && questionMap.has(item.question.id))
}

function evidenceGallery(state) {
  return latestReviews(state).map(review => {
    const inference = state.inferences.find(item => item.id === review.inferenceId)
    const run = inference && state.runs.find(item => item.id === inference.runId)
    const photo = inference && state.photos.find(item => item.id === inference.photoId)
    if (!inference || !run || !photo) return null
    return { inferenceId: inference.id, verdict: review.verdict, judgeSource: review.judge?.type || (review.reviewSource === 'CODEX_VISUAL_REVIEW' ? 'CODEX_ASSISTED' : 'USER'), experimentId: run.experimentId || PAWVAULT_EXPERIMENT_ID, taskId: inference.taskId, providerId: inference.providerId, runtime: inference.runtime, model: inference.model, errorType: inference.errorCode || (review.verdict === 'HALLUCINATED' ? 'HALLUCINATION' : review.verdict === 'WRONG' ? 'WRONG_ANSWER' : 'NONE'), rawOutput: inference.rawOutput, humanNote: review.humanNote || null, photo: publicPhoto(photo), featured: (state.featuredExamples || []).some(item => item.inferenceId === inference.id) }
  }).filter(Boolean)
}

function semanticResultRows(state, run, inferences, reviews, verdicts) {
  const reviewMap = new Map(reviews.map(review => [review.inferenceId, review]))
  return inferences.map(inference => ({ inference, review: reviewMap.get(inference.id), photo: publicPhoto(state.photos.find(photo => photo.id === inference.photoId)) })).filter(row => row.photo && verdicts.includes(row.review?.verdict))
}

function semanticComparison(state, run, semanticInferences) {
  const oldTaskMap = { physical_context: ['surface', 'dog_on_grass', 'dog_on_dog_bed', 'dog_on_human_furniture'], associated_objects: ['toy', 'focused_toy_visible', 'toy_type', 'bowl'], visible_posture: ['posture', 'focused_posture'] }
  const before = state.inferences.filter(item => item.runId !== run.id && run.photoIds.includes(item.photoId))
  return semanticInferences.map(current => {
    const candidates = before.filter(item => item.photoId === current.photoId && oldTaskMap[current.taskId]?.includes(item.taskId)).sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))
    const old = candidates[0]
    return old ? { photoId: current.photoId, semanticTaskId: current.taskId, oldTaskId: old.taskId, oldOutput: old.errorCode || old.normalizedOutput || 'invalid', semanticOutput: current.errorCode || current.normalizedOutput || 'invalid', searchToken: current.searchToken || 'unknown' } : null
  }).filter(Boolean)
}

function createRunShell(benchmarkPreset = null, photoIds = []) {
  const createdAt = new Date().toISOString()
  const preset = BENCHMARK_PRESETS.find(item => item.id === benchmarkPreset) || null
  const taskIds = preset ? [...preset.coreTaskIds] : []
  const run = { id: `run_${createdAt.replace(/[-:.TZ]/g, '').slice(0, 14)}_draft_${randomUUID().slice(0, 8)}`, status: 'DRAFT', createdAt, startedAt: null, finishedAt: null, durationMs: null, providerId: preset?.providerId || null, benchmarkPreset: preset?.id || null, photoIds: [...photoIds], taskIds, photoCount: photoIds.length, taskCount: taskIds.length, completedPredictions: 0, failedPredictions: 0, cancelled: false }
  if (preset?.id === SEMANTIC_EXTRACTION_PRESET.id) run.semanticQuickPhotoIds = selectSemanticQuickPhotoIds(photoIds, store.snapshot().annotations, preset.quickLimit)
  if (preset?.id === MINIMAL_SMART_SEMANTIC_PRESET.id) { const snapshot = store.snapshot(); run.minimalQuickPhotoIds = selectMinimalSmartPhotoIds(photoIds, snapshot.annotations, snapshot.photos, preset.quickLimit) }
  return run
}

function benchmarkTiming(state) {
  const completedRunIds = new Set(state.runs.filter(run => run.status === 'COMPLETED' && run.providerId === FOCUSED_BASE_PRESET.providerId).map(run => run.id))
  const values = state.inferences.filter(item => completedRunIds.has(item.runId) && Number.isFinite(item.latencyMs)).map(item => item.latencyMs).sort((a, b) => a - b)
  if (values.length < 3) return { sampleCount: values.length, p25TaskMs: null, p75TaskMs: null }
  const at = fraction => values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]
  return { sampleCount: values.length, p25TaskMs: at(0.25), p75TaskMs: at(0.75) }
}

function runSummary(run, state) {
  const inferenceIds = new Set(state.inferences.filter(item => item.runId === run.id).map(item => item.id))
  const reviewed = new Set(state.reviews.filter(item => inferenceIds.has(item.inferenceId)).map(item => item.inferenceId)).size
  return { id: run.id, status: run.status, date: run.startedAt || run.createdAt, providerId: run.providerId, photos: run.photoCount || run.photoIds?.length || 0, durationMs: run.durationMs, reviewed, completedPredictions: run.completedPredictions || 0 }
}

function platformDiagnostics() {
  let appCommitSha = null; let branch = null
  try { appCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim() } catch {}
  return { backend: 'Provider reported; see runtimeStats per prediction', machine: os.cpus()[0]?.model || null, platform: `${os.platform()} ${os.release()} ${os.arch()}`, ramGb: Math.round(os.totalmem() / 1024 ** 3), threadCount: null, runtimeFlags: null, appCommitSha, branch }
}

async function runShowcase(request, response) {
  const controller = new AbortController()
  let sampler = null
  let samplerStopped = false
  let closed = false
  let providerPid = null
  const stopSampler = async () => {
    if (!sampler || samplerStopped) return null
    samplerStopped = true
    return sampler.stop()
  }
  const emit = (type, payload = {}) => {
    if (!closed && !response.writableEnded) response.write(`${JSON.stringify({ type, at: new Date().toISOString(), ...payload })}\n`)
  }
  request.once('aborted', () => controller.abort())
  response.once('close', () => { closed = true; if (!response.writableEnded) controller.abort() })
  try {
    const body = await jsonBody(request, 18 * 1024 * 1024)
    const prompt = String(body.prompt || '').trim()
    if (!prompt || prompt.length > 12000) throw badRequest('Write a question between 1 and 12,000 characters')
    const inferencePrompt = buildShowcaseConversationPrompt(body.conversation, prompt, body.imageTitle)
    const selectedCase = SHOWCASE_CASES.find(item => item.id === body.caseId)
    const providerId = SHOWCASE_PROVIDER_IDS.includes(body.providerId) ? body.providerId : SHOWCASE_PROVIDER_IDS[0]
    const provider = providers.get(providerId)
    const status = await provider.status()
    if (status.state !== 'READY') throw httpError(503, status.reason || 'Selected VisionPsy runtime is unavailable')
    const image = await resolveShowcaseImage(body)
    const { inferencePath, ...publicImage } = image
    const runId = `showcase_${Date.now()}_${randomUUID().slice(0, 8)}`

    response.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive'
    })
    response.flushHeaders?.()
    emit('started', { runId, image: publicImage, provider: { id: status.id, name: status.name, model: status.model, modelVersion: status.modelVersion, runtime: status.runtime, label: status.label }, prompt })

    sampler = new ResourceSampler({
      getPid: () => providerPid,
      onSample: sample => emit('telemetry', { sample })
    })
    await sampler.start()
    const result = await provider.analyzeImage({
      runId,
      signal: controller.signal,
      timeoutMs: Number(process.env.SHOWCASE_PREDICTION_TIMEOUT_MS || 180000),
      imagePath: inferencePath,
      prompt: inferencePrompt,
      promptVersion: 'visionpsy-live-conversation-v2',
      allowedLabels: [],
      outputMode: 'semantic',
      taskId: 'visionpsy_live_showcase',
      maxTokens: Math.max(16, Math.min(512, Number(body.maxTokens) || 80)),
      onToken: token => emit('token', { token }),
      onTrace: event => {
        if (event.pid) providerPid = event.pid
        emit('trace', { event })
      }
    })
    const resources = await stopSampler()
    emit('complete', {
      runId,
      output: result.rawOutput,
      provider: { id: result.providerId, model: result.model, modelVersion: result.modelVersion, runtime: result.runtime, runtimeVersion: result.runtimeVersion },
      metrics: {
        latencyMs: result.latencyMs,
        timeToFirstTokenMs: result.runtimeStats?.timeToFirstTokenMs ?? null,
        promptToFirstTokenMs: result.runtimeStats?.promptToFirstTokenMs ?? null,
        outputTokens: result.runtimeStats?.outputTokens ?? null,
        tokensPerSecond: result.runtimeStats?.tokensPerSecond ?? null,
        coldStartMs: result.runtimeStats?.coldStartMs ?? null,
        serverReused: result.runtimeStats?.serverReused ?? null,
        backend: result.runtimeStats?.backend ?? null,
        gpuLayers: result.runtimeStats?.gpuLayers ?? null,
        promptTokens: result.runtimeStats?.nativeTimings?.promptTokens ?? result.runtimeStats?.promptTokens ?? null,
        preprocessPolicy: result.runtimeStats?.preprocessPolicy ?? null,
        generation: result.runtimeStats?.generation ?? null,
        nativeTimings: result.runtimeStats?.nativeTimings ?? null,
        resources
      },
      evaluation: scoreShowcaseAnswer(selectedCase, result.rawOutput)
    })
    response.end()
  } catch (error) {
    const resources = await stopSampler().catch(() => null)
    if (!response.headersSent) {
      response.writeHead(error.statusCode || 500, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' })
    }
    emit('error', { code: error.code || null, error: error.message || String(error), resources })
    if (!response.writableEnded) response.end()
  }
}

async function resolveShowcaseImage(body) {
  const selected = SHOWCASE_CASES.find(item => item.id === body.caseId)
  let originalPath
  let originalFilename
  let reportedMime
  let source
  let photoId = `showcase_${randomUUID()}`
  if (selected) {
    originalPath = path.join(publicDir, selected.imageUrl.replace(/^\//, ''))
    originalFilename = path.basename(originalPath)
    reportedMime = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(originalPath).toLowerCase()] || 'image/png'
    source = { kind: 'built-in', caseId: selected.id, title: selected.title, imageUrl: selected.imageUrl }
  } else {
    const match = String(body.imageDataUrl || '').match(/^data:(image\/(?:jpeg|png|webp|heic));base64,([A-Za-z0-9+/=]+)$/)
    if (!match) throw badRequest('Choose a built-in case or drop a JPEG, PNG, WebP, or HEIC image')
    const bytes = Buffer.from(match[2], 'base64')
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw badRequest('Dropped image must be between 1 byte and 12 MB')
    reportedMime = match[1]
    const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' })[reportedMime]
    originalFilename = `local-drop${extension}`
    originalPath = path.join(showcaseOriginalDir, `${photoId}${extension}`)
    await writeFile(originalPath, bytes)
    source = { kind: 'local-drop', caseId: null, title: String(body.filename || 'Dropped image').slice(0, 120), imageUrl: null }
  }
  const pipeline = await prepareImageWithTimeout({ originalPath, outputDir: showcaseInferenceDir, photoId, reportedMime, originalFilename })
  if (!pipeline.ready) throw badRequest(`Image preprocessing failed: ${pipeline.errorCode || pipeline.error || 'unknown error'}`)
  return {
    ...source,
    width: pipeline.normalized.width,
    height: pipeline.normalized.height,
    sizeBytes: pipeline.normalized.sizeBytes,
    inferencePath: path.join(showcaseInferenceDir, pipeline.normalized.filename)
  }
}

async function migrateImagePipelines() {
  const state = store.snapshot()
  const pending = state.photos.filter(photo => photo.imagePipeline?.pipelineVersion !== 1 || !photo.imagePipeline.ready || (photo.inferenceFilename && !photo.inferenceImageSha256))
  if (!pending.length) return
  for (const photo of pending) {
    const imagePipeline = photo.imagePipeline?.pipelineVersion === 1 && photo.imagePipeline.ready ? photo.imagePipeline : await prepareImageWithTimeout({ originalPath: path.join(photosDir, photo.storedFilename), outputDir: inferenceDir, photoId: photo.id, reportedMime: photo.mimeType, originalFilename: photo.filename })
    const inferenceImageSha256 = imagePipeline.ready && (imagePipeline.normalized?.filename || photo.inferenceFilename) ? await sha256Path(path.join(inferenceDir, imagePipeline.normalized?.filename || photo.inferenceFilename)).catch(() => null) : null
    await store.update(current => {
      const target = current.photos.find(item => item.id === photo.id)
      Object.assign(target, { detectedFormat: imagePipeline.detectedFormat || target.detectedFormat || null, imagePipeline, inferenceFilename: imagePipeline.normalized?.filename || target.inferenceFilename || null, inferenceImageSha256, width: imagePipeline.original?.width ?? target.width ?? null, height: imagePipeline.original?.height ?? target.height ?? null, orientation: imagePipeline.original?.orientation ?? target.orientation ?? null })
    })
  }
}

async function sha256Path(filePath) { return createHash('sha256').update(await readFile(filePath)).digest('hex') }

async function prepareImageWithTimeout(input) {
  const timeoutMs = Number(process.env.PAWVAULT_PREPROCESSING_TIMEOUT_MS || 30000)
  let timer
  try {
    return await Promise.race([
      prepareImage(input),
      new Promise(resolve => { timer = setTimeout(() => resolve({ pipelineVersion: 1, ready: false, errorCode: 'PREPROCESSING_TIMEOUT', error: `Image preprocessing timed out after ${timeoutMs} ms`, pipeline: {} }), timeoutMs) })
    ])
  } finally { clearTimeout(timer) }
}

function publicPhoto(photo) {
  const { storedFilename, inferenceFilename, ...rest } = photo
  return { ...rest, imageUrl: photo.imagePipeline?.ready ? `/previews/${photo.id}` : null, originalUrl: `/photos/${photo.id}` }
}

function addPhotoToDataset(state, datasetId, photoId) {
  const dataset = state.datasets.find(item => item.id === datasetId)
  if (!dataset) throw badRequest('Unknown dataset')
  if (!dataset.photoIds.includes(photoId)) dataset.photoIds.push(photoId)
}

async function servePhoto(response, id) {
  const photo = store.snapshot().photos.find(item => item.id === id)
  if (!photo) throw notFound('Photo not found')
  let body
  try { body = await readFile(path.join(photosDir, photo.storedFilename)) }
  catch (error) { if (error.code === 'ENOENT') throw notFound('Photo file not found'); throw error }
  response.writeHead(200, { 'Content-Type': photo.mimeType, 'Cache-Control': 'private, max-age=3600' })
  response.end(body)
}

async function servePreview(response, id) {
  const photo = store.snapshot().photos.find(item => item.id === id)
  if (!photo?.imagePipeline?.ready || !photo.inferenceFilename) throw notFound('Validated preview not found')
  let body
  try { body = await readFile(path.join(inferenceDir, photo.inferenceFilename)) }
  catch (error) { if (error.code === 'ENOENT') throw notFound('Validated preview file not found'); throw error }
  response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' })
  response.end(body)
}

async function serveStatic(response, pathname) {
  const experimentPage = /^\/experiments\/0[1-6]\/?$/.test(pathname)
  const relative = pathname === '/' || experimentPage ? 'index.html' : decodeURIComponent(pathname.slice(1))
  const fullPath = path.resolve(publicDir, relative)
  if (!fullPath.startsWith(`${publicDir}${path.sep}`)) throw notFound('File not found')
  try {
    const body = await readFile(fullPath)
    response.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath)] || 'application/octet-stream' })
    response.end(body)
  } catch (error) {
    if (error.code === 'ENOENT') throw notFound('File not found')
    throw error
  }
}

function jsonBody(request, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', chunk => {
      size += chunk.length
      if (size > limit) { reject(badRequest('Request body too large')); request.destroy(); return }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) }
      catch { reject(badRequest('Invalid JSON')) }
    })
    request.on('error', reject)
  })
}

function rawBody(request, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', chunk => {
      size += chunk.length
      if (size > limit) { reject(badRequest('Request body too large')); request.destroy(); return }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function safeExtension(filename, mimeType) {
  const extension = path.extname(filename).toLowerCase()
  if (/^\.(jpe?g|png|heic|webp)$/.test(extension)) return extension
  return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/heic': '.heic', 'image/webp': '.webp' })[mimeType] || '.img'
}
function sendJson(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)) }
function sendDownload(response, body, filename, contentType) { response.writeHead(200, { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': body.length }); response.end(body) }
function httpError(statusCode, message) { return Object.assign(new Error(message), { statusCode }) }
function readinessConflict(blockers) { return Object.assign(httpError(409, 'Fair Arena readiness gate blocked execution'), { code: 'ARENA_NOT_READY', blockers }) }
function badRequest(message) { return httpError(400, message) }
function notFound(message) { return httpError(404, message) }

const port = Number(process.env.PORT || 8877)
server.listen(port, '127.0.0.1', () => console.log(`QVAC Vision Lab ready at http://127.0.0.1:${port}`))

async function shutdown(signal) {
  console.log(`\n${signal}: closing QVAC runtime…`)
  server.close()
  await providers.shutdown().catch(error => console.error('Vision provider shutdown failed', error))
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
