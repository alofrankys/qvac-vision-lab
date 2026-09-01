import { createHash, randomUUID } from 'node:crypto'

export const ARENA_EXPERIMENT_ID = 'experiment_05_arena'
export const PRIMARY_ARENA_PROVIDER_IDS = Object.freeze(['visionpsy-patched-base', 'lfm2.5-vl-450m', 'qvac-smolvlm2'])
export const SECONDARY_ARENA_PROVIDER_IDS = Object.freeze(['visionpsy-patched'])
export const ARENA_PROVIDER_IDS = Object.freeze([...PRIMARY_ARENA_PROVIDER_IDS, ...SECONDARY_ARENA_PROVIDER_IDS])
export const ARENA_VERDICTS = Object.freeze(['CORRECT', 'PARTIALLY_CORRECT', 'WRONG', 'HALLUCINATED', 'UNCLEAR_IMAGE'])
export const QUESTION_CATEGORIES = Object.freeze(['object_recognition', 'color_detail', 'spatial_relation', 'physical_context', 'visual_text', 'number_value', 'ui_understanding', 'document_understanding', 'chart_table', 'other'])
export const JUDGE_PROVIDER_IDS = Object.freeze(['GOLD_ANSWER_SCORER', 'USER_JUDGE', 'BLIND_HUMAN_JUDGE', 'CODEX_VISUAL_REVIEW', 'LOCAL_AI_JUDGE', 'EXTERNAL_AI_JUDGE'])
export const JUDGE_PROVIDER_CLASSES = Object.freeze({ GOLD_ANSWER_SCORER: 'DETERMINISTIC', USER_JUDGE: 'HUMAN', BLIND_HUMAN_JUDGE: 'HUMAN', CODEX_VISUAL_REVIEW: 'AI_ASSISTED', LOCAL_AI_JUDGE: 'AI', EXTERNAL_AI_JUDGE: 'AI' })
export const DEFAULT_SCORING = Object.freeze({ CORRECT: 2, PARTIALLY_CORRECT: 1, WRONG: 0, HALLUCINATED: -1, UNCLEAR_IMAGE: null })
export const STARTER_CATEGORY_SLOTS = Object.freeze(['object_recognition', 'color_detail', 'spatial_relation', 'physical_context', 'visual_text', 'number_value', 'ui_understanding', 'document_understanding', 'chart_table', 'other'])

export function migrateArenaState(state, now = new Date().toISOString()) {
  state.schemaVersion = Math.max(6, Number(state.schemaVersion) || 0)
  state.arenaRounds ??= []
  state.arenaJudgments ??= []
  state.arenaBatches ??= []
  state.arenaFeaturedExamples ??= []
  state.questionBank ??= []
  state.arenaBenchmarkSets ??= []
  state.arenaScoring ??= { ...DEFAULT_SCORING }
  state.migrations ??= {}
  if (!state.arenaBenchmarkSets.some(item => item.id === 'real_world_vision_arena_v1')) {
    state.arenaBenchmarkSets.push({ id: 'real_world_vision_arena_v1', name: 'Real-World Vision Arena v1', version: '1.0.0-draft', status: 'EMPTY', locked: false, lockHash: null, startedAt: null, questionIds: [], suggestedCategorySlots: [...STARTER_CATEGORY_SLOTS], createdAt: now })
  }
  const starter = state.arenaBenchmarkSets.find(item => item.id === 'real_world_vision_arena_v1')
  if (starter) { starter.version ??= '1.0.0-draft'; starter.lockHash ??= null }
  state.migrations.blindVisionArenaV5 ??= now
  state.migrations.fairResourceMatchedArenaV6 ??= now
  return state
}

export function recordArenaJudgment(state, input, options = {}) {
  const round = state.arenaRounds.find(item => item.id === input.roundId)
  if (!round) throw new Error('Arena round not found')
  if (round.status === 'REVEALED') throw new Error('Revealed Arena judgments are immutable; create a separate non-ranking amendment instead')
  if (!['AWAITING_JUDGMENT','READY_TO_REVEAL'].includes(round.status)) throw new Error('Arena round is not accepting judgments')
  if (!Object.hasOwn(round.blindMapping, input.blindLabel)) throw new Error('Unknown blind answer label')
  if (!ARENA_VERDICTS.includes(input.verdict)) throw new Error('Unknown Arena verdict')
  const judgeProviderId = input.judgeProviderId || 'USER_JUDGE'
  if (!JUDGE_PROVIDER_IDS.includes(judgeProviderId)) throw new Error('Unknown judge provider')
  if (judgeProviderId === 'GOLD_ANSWER_SCORER' && options.allowDeterministic !== true) throw new Error('Deterministic gold judgments can only be created by the server scorer')
  const now = options.now || new Date().toISOString()
  const judgment = {
    id: `judgment_${(options.idFactory || randomUUID)()}`, roundId: round.id, blindLabel: input.blindLabel,
    verdict: input.verdict, score: scoreVerdict(input.verdict, state.arenaScoring), note: String(input.note || '').trim().slice(0, 500) || null,
    judgeProviderId, judgeId: String(input.judgeId || (judgeProviderId === 'USER_JUDGE' ? 'local-user' : judgeProviderId.toLowerCase())),
    provenance: judgeProviderId, judgeLabel: String(input.judgeLabel || '').trim().slice(0, 120) || null, judgedAt: now, judgedBeforeReveal: round.status !== 'REVEALED'
  }
  state.arenaJudgments.push(judgment)
  const labels = Object.keys(round.blindMapping)
  const blindJudgments = state.arenaJudgments.filter(item => item.roundId === round.id && item.judgedBeforeReveal)
  if (labels.every(label => blindJudgments.some(item => item.blindLabel === label))) round.status = 'READY_TO_REVEAL'
  return judgment
}

export function revealArenaRound(round, judgments, input = {}, options = {}) {
  if (round.status === 'REVEALED') throw new Error('Arena round is already revealed')
  if (!['AWAITING_JUDGMENT','READY_TO_REVEAL'].includes(round.status)) throw new Error('Arena round cannot transition to REVEALED from its current state')
  const labels = Object.keys(round.blindMapping)
  const blindComplete = labels.every(label => judgments.some(item => item.roundId === round.id && item.blindLabel === label && item.judgedBeforeReveal))
  if (!blindComplete && !input.early) throw new Error('Judge every blind answer before reveal')
  round.status = 'REVEALED'
  round.revealedAt = options.now || new Date().toISOString()
  round.blindStatus = blindComplete && !input.early ? 'BLIND_VALID' : 'NON_BLIND'
  round.reviewMode = blindComplete && !input.early ? 'BLIND_REVIEW' : 'NON_BLIND_REVIEW'
  round.judgedBeforeReveal = blindComplete && !input.early
  Object.assign(round, calculateRoundWinner(round, judgments, options.scoring || DEFAULT_SCORING))
  return round
}

export function createQuestionBankEntry(input, state, options = {}) {
  const text = String(input.text || input.question || '').trim()
  if (!text || text.length > 500) throw new Error('Question must contain 1–500 characters')
  const category = input.category || 'other'
  if (!QUESTION_CATEGORIES.includes(category)) throw new Error('Unknown question category')
  const now = options.now || new Date().toISOString()
  const expectedAnswer = String(input.expectedAnswer || '').trim().slice(0, 500) || null
  const entry = { id: `question_${(options.idFactory || randomUUID)()}`, text, category, expectedAnswer, acceptedAnswers: expectedAnswer ? [...new Set((input.acceptedAnswers || []).map(value => String(value).trim().slice(0, 500)).filter(Boolean))] : [], answerType: input.answerType || 'exact_text', expectedAnswerSource: expectedAnswer ? String(input.expectedAnswerSource || 'USER_DEFINED_GROUND_TRUTH') : null, sourceReference: String(input.sourceReference || '').trim().slice(0, 500) || null, license: String(input.license || '').trim().slice(0, 100) || null, difficulty: String(input.difficulty || '').trim().slice(0, 40) || null, photoId: input.photoId || null, datasetId: input.datasetId || null, createdAt: now, source: input.source || 'USER_AUTHORED' }
  state.questionBank.push(entry)
  return entry
}

export function createArenaBatch(input, state, options = {}) {
  const set = state.arenaBenchmarkSets.find(item => item.id === input.benchmarkSetId)
  if (!set) throw new Error('Benchmark set not found')
  const providerIds = [...new Set(input.providerIds || [])]
  if (providerIds.length < 2 || providerIds.some(id => !ARENA_PROVIDER_IDS.includes(id))) throw new Error('Select at least two available Arena providers')
  const selectedQuestionIds = input.selectionSnapshot?.selectedQuestionIds || input.selectedQuestionIds || set.questionIds
  if (!selectedQuestionIds.length || new Set(selectedQuestionIds).size !== selectedQuestionIds.length) throw new Error('Arena selection requires unique questions')
  const entries = selectedQuestionIds.map(id => state.questionBank.find(item => item.id === id)).filter(Boolean)
  if (entries.length !== selectedQuestionIds.length) throw new Error('Arena selection references a missing question')
  if (!entries.length) throw new Error('Benchmark set is empty')
  validateBenchmarkEntries(entries, state)
  const now = options.now || new Date().toISOString()
  const requestedLock = Boolean(input.locked)
  const version = String(input.version || set.version || '1.0.0')
  if (set.locked && requestedLock && version !== set.version) throw new Error('Benchmark set already has an incompatible lock')
  const lockHash = computeBenchmarkLockHash(set, state, version)
  if (set.locked && set.lockHash !== lockHash) throw new Error('Benchmark set integrity check failed')
  const primary = providerIds.length === PRIMARY_ARENA_PROVIDER_IDS.length && PRIMARY_ARENA_PROVIDER_IDS.every(id => providerIds.includes(id))
  if (requestedLock && !set.locked) validateRankingPolicy(set, set.questionIds.map(id => state.questionBank.find(item => item.id === id)).filter(Boolean))
  const officialRanked = primary && requestedLock && (set.locked || entries.length >= 30)
  const evidenceTier = input.selectionSnapshot?.evidenceTier || evidenceTierForCount(entries.length)
  const snapshotCore = { ...(input.selectionSnapshot || {}), benchmarkSetId: set.id, selectedQuestionIds: entries.map(item => item.id), selectedImageIds: entries.map(item => item.photoId), uniqueImageIds: [...new Set(entries.map(item => item.photoId))], providerIds, outputBudget: Number(input.outputBudget) || 64, modelLock: input.modelLockSnapshot || null, prompts: entries.map(item => ({ questionId: item.id, photoId: item.photoId, text: item.text, category: item.category })) }
  const selectionSnapshot = { ...snapshotCore, frozen: true, frozenAt: now, snapshotHash: createHash('sha256').update(JSON.stringify(snapshotCore)).digest('hex') }
  const draftRounds = entries.map((entry, index) => createArenaRound({ photoId: entry.photoId, datasetId: entry.datasetId, question: entry.text, category: entry.category, expectedAnswer: entry.expectedAnswer, acceptedAnswers: entry.acceptedAnswers, answerType: entry.answerType, expectedAnswerSource: entry.expectedAnswerSource, providerIds, outputBudget: input.outputBudget, benchmarkSetId: set.id, questionBankId: entry.id, lockedBenchmarkSet: officialRanked }, state, { ...options, roundIndex: state.arenaRounds.length + index }))
  for (const round of draftRounds) Object.assign(round, { evidenceTier, selectionSnapshotHash: selectionSnapshot.snapshotHash })
  const draftRuns = draftRounds.map(round => createArenaRunForRound(round, options))
  const batch = { id: `batch_${(options.idFactory || randomUUID)()}`, benchmarkSetId: set.id, providerIds, roundIds: draftRounds.map(item => item.id), runIds: draftRuns.map(item => item.id), status: 'DRAFT', locked: requestedLock || set.locked, arenaMode: officialRanked ? 'FAIR_RESOURCE_MATCHED_PRIMARY' : 'EXPLORATORY', evidenceTier, runSizeLabel: input.runSizeLabel || runSizeLabel(entries.length), selectionSnapshot, createdAt: now, startedAt: null, finishedAt: null, completedRounds: 0, failedRounds: 0, cancelReason: null, error: null }
  if (requestedLock && !set.locked) Object.assign(set, { version, locked: true, lockedAt: now, startedAt: null, status: 'LOCKED', lockHash })
  state.arenaBatches.push(batch)
  state.arenaRounds.push(...draftRounds)
  state.runs ??= []
  state.runs.push(...draftRuns)
  return batch
}

function evidenceTierForCount(count) { return count < 10 ? 'QUICK_CHECK' : count < 20 ? 'EXPLORATORY' : count < 30 ? 'PRELIMINARY' : 'RANKING_ELIGIBLE' }
function runSizeLabel(count) { return count === 5 ? 'Quick 5' : count === 10 ? 'Quick 10' : count === 20 ? 'Preview 20' : count >= 30 ? `Ranked ${count}` : `Custom ${count}` }

export function createArenaRunForRound(round, options = {}) {
  const idFactory = options.idFactory || randomUUID
  const id = `run_${round.createdAt.replace(/[-:.TZ]/g, '').slice(0, 14)}_arena_${idFactory().slice(0, 8)}`
  round.runId = id
  return { id, status: 'DRAFT', createdAt: round.createdAt, startedAt: null, finishedAt: null, durationMs: null, experimentId: round.experimentId, benchmarkPreset: 'fair_resource_matched_arena_v1', arenaRoundId: round.id, datasetId: round.datasetId, photoIds: [round.photoId], photoCount: 1, taskIds: ['arena_visual_question'], taskCount: 1, providerIds: [...round.providerIds], expectedPredictions: round.providerIds.length, completedPredictions: 0, failedPredictions: 0, cancelled: false }
}

export function canonicalBenchmarkPayload(set, state, version = set.version) {
  const entries = set.questionIds.map(id => state.questionBank.find(item => item.id === id)).filter(Boolean)
  if (entries.length !== set.questionIds.length) throw new Error('Benchmark set references a missing question')
  validateBenchmarkEntries(entries, state)
  const payload = { benchmarkSetId: set.id, version: String(version), questions: entries.map(item => { const row = { id: item.id, text: item.text, category: item.category, datasetId: item.datasetId, photoId: item.photoId, expectedAnswer: item.expectedAnswer || null, expectedAnswerSource: item.expectedAnswerSource || null }; if ((set.lockPayloadVersion || 1) >= 2) row.inferenceImageSha256 = state.photos.find(photo => photo.id === item.photoId)?.inferenceImageSha256 || null; if ((set.lockPayloadVersion || 1) >= 3) Object.assign(row, { acceptedAnswers: item.acceptedAnswers || [], answerType: item.answerType || 'exact_text', sourceReference: item.sourceReference || null, license: item.license || null }); return row }).sort((a, b) => a.id.localeCompare(b.id)) }
  if ((set.lockPayloadVersion || 1) >= 2) Object.assign(payload, { lockPayloadVersion: set.lockPayloadVersion, providerIds: [...(set.providerIds || PRIMARY_ARENA_PROVIDER_IDS)], outputBudget: Number(set.outputBudget) || 64 })
  if ((set.lockPayloadVersion || 1) >= 3) payload.rankingPolicy = set.rankingPolicy || null
  return payload
}

export function computeBenchmarkLockHash(set, state, version = set.version) {
  return createHash('sha256').update(JSON.stringify(canonicalBenchmarkPayload(set, state, version))).digest('hex')
}

export function validateBenchmarkEntries(entries, state) {
  for (const entry of entries) {
    if (!entry?.photoId || !entry?.datasetId) throw new Error('Every batch question needs an image and dataset')
    const dataset = state.datasets.find(item => item.id === entry.datasetId)
    const photo = state.photos.find(item => item.id === entry.photoId)
    if (!dataset?.photoIds?.includes(entry.photoId)) throw new Error(`Question ${entry.id} image does not belong to its dataset`)
    if (!photo?.imagePipeline?.ready || !photo.inferenceFilename) throw new Error(`Question ${entry.id} image is not inference-ready`)
    if (!/^[a-f0-9]{64}$/i.test(photo.inferenceImageSha256 || '')) throw new Error(`Question ${entry.id} inference image is missing a valid SHA-256`)
  }
  return true
}

export function createBlindMapping(providerIds, random = Math.random) {
  if (new Set(providerIds).size !== providerIds.length || providerIds.length < 2) throw new Error('Arena requires at least two unique providers')
  const shuffled = [...providerIds]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
  }
  return Object.fromEntries(shuffled.map((providerId, index) => [String.fromCharCode(65 + index), providerId]))
}

export function createArenaRound(input, state, options = {}) {
  const now = options.now || new Date().toISOString()
  const idFactory = options.idFactory || randomUUID
  const photo = state.photos.find(item => item.id === input.photoId)
  if (!photo) throw new Error('Unknown Arena image')
  const dataset = state.datasets.find(item => item.id === input.datasetId)
  if (!dataset?.photoIds.includes(photo.id)) throw new Error('Arena image must belong to the selected dataset')
  const question = String(input.question || '').trim()
  if (!question || question.length > 500) throw new Error('Arena question must contain 1–500 characters')
  const providerIds = [...new Set(input.providerIds || [])]
  if (providerIds.length < 2) throw new Error('Select at least two Arena providers')
  if (providerIds.some(id => !ARENA_PROVIDER_IDS.includes(id))) throw new Error('Unavailable provider cannot enter the Arena')
  const category = input.category || 'other'
  if (!QUESTION_CATEGORIES.includes(category)) throw new Error('Unknown question category')
  const expectedAnswer = String(input.expectedAnswer || '').trim().slice(0, 500) || null
  const id = `arena_${now.replace(/[-:.TZ]/g, '').slice(0, 14)}_${idFactory().slice(0, 8)}`
  const executionOrder = rotateExecutionOrder(providerIds, options.roundIndex ?? state.arenaRounds.length)
  return {
    id, experimentId: ARENA_EXPERIMENT_ID, runId: null, datasetId: dataset.id, photoId: photo.id, question, category, expectedAnswer,
    acceptedAnswers: expectedAnswer ? [...new Set((input.acceptedAnswers || []).map(value => String(value).trim()).filter(Boolean))] : [], answerType: input.answerType || 'exact_text', expectedAnswerSource: expectedAnswer ? input.expectedAnswerSource || 'USER_DEFINED_GROUND_TRUTH' : null, providerIds, outputBudget: Number(input.outputBudget) || 64,
    blindMapping: createBlindMapping(providerIds, options.random), executionOrder, answerIds: {}, status: 'DRAFT', blindStatus: 'BLIND_PENDING', judgedBeforeReveal: true,
    revealedAt: null, createdAt: now, startedAt: null, finishedAt: null, winner: null, winnerProviderId: null, lockedBenchmarkSet: Boolean(input.lockedBenchmarkSet),
    benchmarkSetId: input.benchmarkSetId || null, questionBankId: input.questionBankId || null,
    inferenceImage: { sourcePhotoId: photo.id, sha256: photo.inferenceImageSha256 || null, ...(photo.imagePipeline?.normalized || {}) },
    arenaMode: Boolean(input.lockedBenchmarkSet) && providerIds.length === PRIMARY_ARENA_PROVIDER_IDS.length && PRIMARY_ARENA_PROVIDER_IDS.every(id => providerIds.includes(id)) ? 'FAIR_RESOURCE_MATCHED_PRIMARY' : 'EXPLORATORY',
    modelLockVersion: 'fair-arena-model-lock-v1',
    fairness: { sameSourceImage: true, sameQuestion: true, sameOutputBudget: true, sameHardware: true, sameReviewCriteria: true, sequentialExecution: true, rotatingExecutionOrder: true, precisionClass: 'Q8_0', comparability: 'CLOSELY_COMPARABLE', providerSpecificPromptOptimization: false, fallbackAllowed: false }
  }
}

export function rotateExecutionOrder(providerIds, roundIndex = 0) {
  const offset = providerIds.length ? roundIndex % providerIds.length : 0
  return [...providerIds.slice(offset), ...providerIds.slice(0, offset)]
}

export function scoreVerdict(verdict, scoring = DEFAULT_SCORING) {
  if (!ARENA_VERDICTS.includes(verdict)) throw new Error('Unknown Arena verdict')
  return scoring[verdict]
}

export function chooseJudgment(judgments, judgeFilter = 'all') {
  const selected = judgeFilter === 'all' ? judgments : judgments.filter(item => item.judgeProviderId === judgeFilter)
  const priority = { GOLD_ANSWER_SCORER: 0, BLIND_HUMAN_JUDGE: 1, USER_JUDGE: 2, CODEX_VISUAL_REVIEW: 3, LOCAL_AI_JUDGE: 4, EXTERNAL_AI_JUDGE: 5 }
  return [...selected].sort((a, b) => (priority[a.judgeProviderId] ?? 99) - (priority[b.judgeProviderId] ?? 99) || String(b.judgedAt).localeCompare(String(a.judgedAt)))[0] || null
}

export function calculateRoundWinner(round, judgments, scoring = DEFAULT_SCORING, judgeFilter = 'all') {
  judgments = judgments.filter(item => item.judgedBeforeReveal === true)
  const scores = Object.keys(round.blindMapping).map(label => {
    const judgment = chooseJudgment(judgments.filter(item => item.roundId === round.id && item.blindLabel === label), judgeFilter)
    return { blindLabel: label, providerId: round.blindMapping[label], judgment, score: judgment ? scoreVerdict(judgment.verdict, scoring) : null }
  })
  const valid = scores.filter(item => Number.isFinite(item.score))
  if (!valid.length) return { winner: 'NO_VALID_JUDGMENT', winnerProviderId: null, scores }
  const high = Math.max(...valid.map(item => item.score))
  const leaders = valid.filter(item => item.score === high)
  if (leaders.length !== 1) return { winner: 'TIE', winnerProviderId: null, scores }
  return { winner: leaders[0].blindLabel, winnerProviderId: leaders[0].providerId, scores }
}

export function publicArenaRound(round, state) {
  const revealed = round.status === 'REVEALED'
  const photo = state.photos.find(item => item.id === round.photoId)
  const judgments = state.arenaJudgments.filter(item => item.roundId === round.id)
  const answers = Object.keys(round.blindMapping).sort().map(blindLabel => {
    const inference = state.inferences.find(item => item.id === round.answerIds[blindLabel])
    const ownJudgments = judgments.filter(item => item.blindLabel === blindLabel)
    const visibleJudgments = revealed ? ownJudgments : ownJudgments.filter(item => item.judgeProviderId !== 'GOLD_ANSWER_SCORER')
    const humanJudgments = ownJudgments.filter(item => ['USER_JUDGE','BLIND_HUMAN_JUDGE'].includes(item.judgeProviderId))
    const base = { blindLabel, rawOutput: inference?.rawOutput || '', errorCode: inference?.errorCode || null, validationResult: inference?.validationResult || 'PENDING', judgments: visibleJudgments, judged: humanJudgments.length > 0, objectivelyScored: ownJudgments.some(item => item.judgeProviderId === 'GOLD_ANSWER_SCORER') }
    return revealed ? { ...base, providerId: round.blindMapping[blindLabel], runtime: inference?.runtime || null, runtimeVersion: inference?.runtimeVersion || null, model: inference?.model || null, modelVersion: inference?.modelVersion || null, projection: inference?.projection || null, modelLockId: inference?.modelLockId || round.modelLockVersion, modelLockHash: inference?.modelLockHash || null, executionIndex: inference?.executionIndex ?? null, formattedRuntimePrompt: inference?.formattedRuntimePrompt || round.question, normalizedOutput: inference?.normalizedOutput || null, latencyMs: inference?.latencyMs ?? null, runtimeStats: inference?.runtimeStats || null, error: inference?.error || null } : base
  })
  const winner = revealed ? calculateRoundWinner(round, judgments, state.arenaScoring) : null
  return { id: round.id, runId: round.runId, experimentId: round.experimentId, datasetId: round.datasetId, imageId: round.photoId, inferenceImage: round.inferenceImage || null, photo: photo ? publicPhoto(photo) : null, question: round.question, category: round.category, expectedAnswer: revealed ? round.expectedAnswer : null, acceptedAnswers: revealed ? round.acceptedAnswers || [] : undefined, answerType: revealed ? round.answerType || 'exact_text' : undefined, expectedAnswerSource: revealed ? round.expectedAnswerSource : null, outputBudget: round.outputBudget, status: round.status, blindStatus: round.blindStatus, reviewMode: round.reviewMode || null, judgedBeforeReveal: round.judgedBeforeReveal, revealedAt: round.revealedAt, createdAt: round.createdAt, startedAt: round.startedAt, finishedAt: round.finishedAt, lockedBenchmarkSet: round.lockedBenchmarkSet, benchmarkSetId: round.benchmarkSetId, arenaMode: round.arenaMode, modelLockVersion: round.modelLockVersion, executionOrder: revealed ? round.executionOrder : undefined, fairness: round.fairness, answers, allAnswersJudged: answers.length > 0 && answers.every(item => item.judged), objectiveScoringComplete: Boolean(round.expectedAnswer) && answers.length > 0 && answers.every(item => item.objectivelyScored), winner }
}

export function validateRankingPolicy(set, entries) {
  const policy = set.rankingPolicy || { minQuestions: 30, minUniqueImages: 30, requireExpectedAnswers: true, categoryMinimums: Object.fromEntries(QUESTION_CATEGORIES.map(category => [category, 1])) }
  const errors = []
  if (entries.length < policy.minQuestions) errors.push(`${entries.length}/${policy.minQuestions} questions`)
  const uniqueImages = new Set(entries.map(item => item.photoId)).size
  if (uniqueImages < policy.minUniqueImages) errors.push(`${uniqueImages}/${policy.minUniqueImages} unique images`)
  if (policy.requireExpectedAnswers) { const count = entries.filter(item => item.expectedAnswer).length; if (count !== entries.length) errors.push(`${count}/${entries.length} expected answers`) }
  for (const [category, minimum] of Object.entries(policy.categoryMinimums || {})) { const count = entries.filter(item => item.category === category).length; if (count < minimum) errors.push(`${count}/${minimum} ${category} questions`) }
  if (errors.length) throw new Error(`Ranking policy failed: ${errors.join('; ')}`)
  return true
}

export function assertSameInputFairness(round, inferences) {
  const rows = inferences.filter(item => item.arenaRoundId === round.id)
  if (rows.length !== round.providerIds.length) throw new Error('Every selected provider must produce an answer or recorded failure')
  if (rows.some(item => item.photoId !== round.photoId || item.prompt !== round.question || item.outputBudget !== round.outputBudget)) throw new Error('Arena same-input fairness violation')
  if (!round.inferenceImage?.sha256 || rows.some(item => item.inferenceImage?.sha256 !== round.inferenceImage.sha256)) throw new Error('Arena inference-image SHA-256 fairness violation')
  if (new Set(rows.map(item => item.providerId)).size !== round.providerIds.length) throw new Error('Arena provider coverage violation')
  if (round.executionOrder?.length !== round.providerIds.length || new Set(round.executionOrder).size !== round.providerIds.length) throw new Error('Arena execution-order fairness violation')
  return true
}

export function assertBenchmarkMutable(set) {
  if (set.locked) throw new Error('LOCKED BENCHMARK SET cannot add, remove or change questions')
  return true
}

export function arenaDashboard(state, filters = {}) {
  const allFilteredRounds = state.arenaRounds.filter(round => round.status === 'REVEALED' && (!filters.datasetId || filters.datasetId === 'all' || round.datasetId === filters.datasetId) && (!filters.category || filters.category === 'all' || round.category === filters.category))
  const requestedTier = filters.evidenceTier || 'RANKING_ELIGIBLE'
  const tierRounds = allFilteredRounds.filter(round => round.blindStatus === 'BLIND_VALID' && roundEvidenceTier(round, state) === requestedTier)
  const rounds = requestedTier === 'RANKING_ELIGIBLE' ? tierRounds.filter(round => round.arenaMode === 'FAIR_RESOURCE_MATCHED_PRIMARY') : tierRounds
  const eligibleRoundIds = new Set(rounds.map(round => round.id))
  const judgments = state.arenaJudgments.filter(item => eligibleRoundIds.has(item.roundId) && item.judgedBeforeReveal === true && (!filters.judgeProviderId || filters.judgeProviderId === 'all' || item.judgeProviderId === filters.judgeProviderId))
  const providers = new Map()
  for (const round of rounds) {
    const outcome = calculateRoundWinner(round, judgments, state.arenaScoring, filters.judgeProviderId || 'all')
    for (const [label, providerId] of Object.entries(round.blindMapping)) {
      if (filters.providerId && filters.providerId !== 'all' && providerId !== filters.providerId) continue
      const row = providers.get(providerId) || emptyProviderMetric(providerId)
      const inference = state.inferences.find(item => item.id === round.answerIds[label])
      const judgment = chooseJudgment(judgments.filter(item => item.roundId === round.id && item.blindLabel === label), filters.judgeProviderId || 'all')
      row.answers++
      if (judgment) {
        row.reviewedAnswers++
        row.verdicts[judgment.verdict]++
        const category = row.categories[round.category] ||= { reviewed: 0, useful: 0 }
        category.reviewed++; if (['CORRECT', 'PARTIALLY_CORRECT'].includes(judgment.verdict)) category.useful++
      }
      if (inference?.errorCode === 'MODEL_TIMEOUT') row.timeouts++
      if (inference?.error || inference?.errorCode === 'PROVIDER_CALL_FAILED') row.runtimeFailures++
      if (inference?.validationResult !== 'VALID') row.invalidOutputs++
      if (Number.isFinite(inference?.latencyMs)) row.latencies.push(inference.latencyMs)
      const cold = inference?.runtimeStats?.cold_start_ms ?? inference?.runtimeStats?.coldStartMs
      if (Number.isFinite(cold)) row.coldStarts.push(cold)
      if (outcome.winner === 'TIE') row.ties++
      else if (outcome.winnerProviderId) outcome.winnerProviderId === providerId ? row.wins++ : row.losses++
      providers.set(providerId, row)
    }
  }
  const metrics = [...providers.values()].map(finalizeProviderMetric)
  const sharedReviewedRounds = rounds.filter(round => Object.keys(round.blindMapping).every(label => chooseJudgment(judgments.filter(item => item.roundId === round.id && item.blindLabel === label), filters.judgeProviderId || 'all'))).length
  const aiReviews = judgments.filter(item => ['AI','AI_ASSISTED'].includes(JUDGE_PROVIDER_CLASSES[item.judgeProviderId])).length
  const fair = rounds.every(round => round.fairness?.sameSourceImage && round.fairness?.sameQuestion && round.fairness?.sameOutputBudget)
  const mostlyAi = judgments.length > 0 && aiReviews / judgments.length >= 0.5
  const primaryComplete = PRIMARY_ARENA_PROVIDER_IDS.every(id => metrics.some(item => item.providerId === id))
  const rankingEligible = requestedTier === 'RANKING_ELIGIBLE' && sharedReviewedRounds >= 30 && !mostlyAi && fair && primaryComplete
  const evidenceTier = requestedTier
  const reviewedEvidenceTier = evidenceTierForCount(sharedReviewedRounds)
  const reasons = [sharedReviewedRounds < 30 && 'fewer than 30 shared reviewed questions', mostlyAi && 'mostly AI review', !fair && 'unfair input conditions', !primaryComplete && 'primary roster incomplete'].filter(Boolean)
  const matrix = headToHead(rounds, judgments, state.arenaScoring, filters.judgeProviderId || 'all')
  const filteredMatrix = filters.providerId && filters.providerId !== 'all' ? { [filters.providerId]: matrix[filters.providerId] || {} } : matrix
  const rankingNote = rankingEligible ? null : requestedTier === 'RANKING_ELIGIBLE' ? `${evidenceTier} — no primary ranking (${reasons.join('; ') || 'readiness conditions incomplete'}).` : `${evidenceTier.replaceAll('_', ' ')} — NOT INCLUDED IN PRIMARY RANKING.`
  return { metrics, sharedReviewedRounds, exploratoryRoundCount: allFilteredRounds.length - rounds.length, evidenceTier, reviewedEvidenceTier, rankingEligible, rankingNote, headToHead: filteredMatrix, agreement: judgeAgreement(judgments.filter(item => rounds.some(round => round.id === item.roundId))) }
}

function roundEvidenceTier(round, state) { return round.evidenceTier || state.arenaBatches?.find(batch => batch.roundIds?.includes(round.id))?.evidenceTier || (round.arenaMode === 'FAIR_RESOURCE_MATCHED_PRIMARY' ? 'RANKING_ELIGIBLE' : 'EXPLORATORY') }

export function judgeAgreement(judgments) {
  const groups = Map.groupBy(judgments, item => `${item.roundId}:${item.blindLabel}`)
  let agreementCount = 0; let disagreementCount = 0
  for (const rows of groups.values()) {
    if (rows.length < 2) continue
    new Set(rows.map(item => item.verdict)).size === 1 ? agreementCount++ : disagreementCount++
  }
  const total = agreementCount + disagreementCount
  return { agreementCount, disagreementCount, agreementRate: total ? agreementCount / total : null, flag: disagreementCount ? 'JUDGE_DISAGREEMENT' : null }
}

function headToHead(rounds, judgments, scoring, judgeFilter) {
  const matrix = {}
  for (const round of rounds) {
    const scores = calculateRoundWinner(round, judgments, scoring, judgeFilter).scores.filter(item => Number.isFinite(item.score))
    for (let left = 0; left < scores.length; left++) for (let right = left + 1; right < scores.length; right++) {
      const a = scores[left]; const b = scores[right]
      matrix[a.providerId] ||= {}; matrix[b.providerId] ||= {}
      const ab = matrix[a.providerId][b.providerId] ||= { wins: 0, losses: 0, ties: 0, sharedRounds: 0 }
      const ba = matrix[b.providerId][a.providerId] ||= { wins: 0, losses: 0, ties: 0, sharedRounds: 0 }
      ab.sharedRounds++; ba.sharedRounds++
      if (a.score === b.score) { ab.ties++; ba.ties++ } else if (a.score > b.score) { ab.wins++; ba.losses++ } else { ab.losses++; ba.wins++ }
    }
  }
  return matrix
}

function emptyProviderMetric(providerId) { return { providerId, answers: 0, reviewedAnswers: 0, verdicts: Object.fromEntries(ARENA_VERDICTS.map(item => [item, 0])), invalidOutputs: 0, timeouts: 0, runtimeFailures: 0, wins: 0, losses: 0, ties: 0, latencies: [], coldStarts: [], categories: {} } }
function finalizeProviderMetric(row) {
  const denominator = row.reviewedAnswers || 0
  const competition = row.wins + row.losses + row.ties
  return { providerId: row.providerId, answers: row.answers, reviewedAnswers: denominator, correctRate: rate(row.verdicts.CORRECT, denominator), partialRate: rate(row.verdicts.PARTIALLY_CORRECT, denominator), usefulRate: rate(row.verdicts.CORRECT + row.verdicts.PARTIALLY_CORRECT, denominator), wrongRate: rate(row.verdicts.WRONG, denominator), hallucinationRate: rate(row.verdicts.HALLUCINATED, denominator), invalidOutputRate: rate(row.invalidOutputs, row.answers), timeoutRate: rate(row.timeouts, row.answers), wins: row.wins, losses: row.losses, ties: row.ties, headToHeadWinRate: rate(row.wins, competition), averageLatencyMs: average(row.latencies), p50LatencyMs: percentile(row.latencies, .5), p95LatencyMs: percentile(row.latencies, .95), coldStartMs: average(row.coldStarts), runtimeFailures: row.runtimeFailures, verdicts: row.verdicts, categoryMetrics: Object.fromEntries(Object.entries(row.categories).map(([key, value]) => [key, { ...value, usefulRate: rate(value.useful, value.reviewed) }])) }
}
function average(values) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null }
function percentile(values, p) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] }
function rate(value, total) { return total ? value / total : null }
function publicPhoto(photo) { const { storedFilename, inferenceFilename, ...rest } = photo; return { ...rest, imageUrl: photo.imagePipeline?.ready ? `/previews/${photo.id}` : null, originalUrl: `/photos/${photo.id}` } }
