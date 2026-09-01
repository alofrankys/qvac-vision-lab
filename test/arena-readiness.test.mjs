import test from 'node:test'
import assert from 'node:assert/strict'
import { arenaDashboard, computeBenchmarkLockHash, migrateArenaState, PRIMARY_ARENA_PROVIDER_IDS } from '../src/arena/index.mjs'
import { auditFairArena } from '../src/arena/readiness.mjs'

function readyFixture(count = 30) {
  const state = { schemaVersion: 5, photos: [], datasets: [{ id: 'dataset', photoIds: [] }], questionBank: [], arenaBenchmarkSets: [], arenaRounds: [], arenaJudgments: [], arenaBatches: [], inferences: [], migrations: {} }
  migrateArenaState(state, '2026-08-15T00:00:00.000Z')
  const set = state.arenaBenchmarkSets[0]
  const categories = ['object_recognition','color_detail','spatial_relation','physical_context','visual_text','number_value','ui_understanding','document_understanding','chart_table','other']
  for (let index = 0; index < count; index++) {
    const photoId = `photo-${index}`; const questionId = `question-${String(index).padStart(2, '0')}`
    state.photos.push({ id: photoId, inferenceFilename: `${photoId}.jpg`, inferenceImageSha256: 'a'.repeat(64), imagePipeline: { ready: true } })
    state.datasets[0].photoIds.push(photoId)
    state.questionBank.push({ id: questionId, text: `Question ${index}?`, category: categories[index % categories.length], datasetId: 'dataset', photoId, expectedAnswer: String(index), acceptedAnswers: [], answerType: 'integer', expectedAnswerSource: 'USER_DEFINED_GROUND_TRUTH' })
    set.questionIds.push(questionId)
  }
  Object.assign(set, { version: '1.0.0', locked: true, lockedAt: '2026-08-15T00:00:00.000Z', status: 'LOCKED' })
  set.lockHash = computeBenchmarkLockHash(set, state, set.version)
  return state
}

const modelLockRecord = {
  lockHash: 'test-lock-hash',
  lock: {
    id: 'test-lock', precisionPolicy: { status: 'CLOSELY_COMPARABLE' },
    primaryModels: PRIMARY_ARENA_PROVIDER_IDS.map((providerId, index) => ({ providerId, revision: `revision-${index}`, model: { quantization: 'Q8_0', bytes: 1, sha256: 'a' }, projector: { quantization: 'Q8_0', bytes: 1, sha256: 'b' } }))
  }
}
const providerStatuses = PRIMARY_ARENA_PROVIDER_IDS.map((id, index) => ({ id, ready: true, state: 'READY', modelVersion: `model@revision-${index}` }))

test('readiness gate is positive for a valid locked 30-question fixture and does not mutate state', async () => {
  const state = readyFixture(); const before = JSON.stringify(state)
  const report = await auditFairArena({ providerStatuses, state, verifyHashes: false, modelLockRecord })
  assert.equal(report.verdict, 'BENCHMARK_READY'); assert.equal(JSON.stringify(state), before)
})

test('readiness gate reports missing questions and detects lock tampering without mutation', async () => {
  const short = readyFixture(2); const before = JSON.stringify(short)
  assert.equal((await auditFairArena({ providerStatuses, state: short, verifyHashes: false, modelLockRecord })).verdict, 'BLOCKED')
  assert.equal(JSON.stringify(short), before)
  const tampered = readyFixture(); tampered.questionBank[0].text = 'tampered after lock'
  const report = await auditFairArena({ providerStatuses, state: tampered, verifyHashes: false, modelLockRecord })
  assert.ok(report.blockers.some(item => item.startsWith('DATASET_LOCK_INTEGRITY')))
})

test('exploratory audit allows a valid unlocked sample below 30 while ranking audit remains blocked', async () => {
  const state = readyFixture(5); const set = state.arenaBenchmarkSets[0]; Object.assign(set, { locked: false, lockHash: null, status: 'READY' })
  const exploratory = await auditFairArena({ providerStatuses, state, verifyHashes: false, modelLockRecord, level: 'exploratory', questionIds: set.questionIds })
  const ranking = await auditFairArena({ providerStatuses, state, verifyHashes: false, modelLockRecord, level: 'ranking', questionIds: set.questionIds })
  assert.equal(exploratory.verdict, 'EXPLORATORY_READY'); assert.equal(ranking.verdict, 'BLOCKED'); assert.ok(ranking.blockers.some(item => item.startsWith('MINIMUM_30_QUESTIONS')))
})

test('BLIND_HUMAN_JUDGE is human and can satisfy ranking review provenance', () => {
  const state = readyFixture(); state.arenaScoring = { CORRECT: 2, PARTIALLY_CORRECT: 1, WRONG: 0, HALLUCINATED: -1, UNCLEAR_IMAGE: null }
  for (let index = 0; index < 30; index++) {
    const roundId = `round-${index}`; const blindMapping = { A: PRIMARY_ARENA_PROVIDER_IDS[0], B: PRIMARY_ARENA_PROVIDER_IDS[1], C: PRIMARY_ARENA_PROVIDER_IDS[2] }; const answerIds = {}
    for (const [label, providerId] of Object.entries(blindMapping)) { const id = `${roundId}-${label}`; answerIds[label] = id; state.inferences.push({ id, arenaRoundId: roundId, providerId, validationResult: 'VALID', latencyMs: 10 }); state.arenaJudgments.push({ roundId, blindLabel: label, verdict: 'CORRECT', judgeProviderId: 'BLIND_HUMAN_JUDGE', judgedBeforeReveal: true }) }
    state.arenaRounds.push({ id: roundId, status: 'REVEALED', blindStatus: 'BLIND_VALID', arenaMode: 'FAIR_RESOURCE_MATCHED_PRIMARY', datasetId: 'dataset', category: 'other', blindMapping, answerIds, fairness: { sameSourceImage: true, sameQuestion: true, sameOutputBudget: true } })
  }
  const dashboard = arenaDashboard(state)
  assert.equal(dashboard.sharedReviewedRounds, 30); assert.equal(dashboard.rankingEligible, true); assert.equal(dashboard.evidenceTier, 'RANKING_ELIGIBLE')
})

test('Arena migration from schema v5 is additive and idempotent', () => {
  const state = { schemaVersion: 5, migrations: {}, arenaBenchmarkSets: [], photos: [], datasets: [] }
  migrateArenaState(state, '2026-08-15T00:00:00.000Z'); const once = JSON.stringify(state); migrateArenaState(state, '2026-08-16T00:00:00.000Z')
  assert.equal(JSON.stringify(state), once); assert.equal(state.schemaVersion, 6)
})
