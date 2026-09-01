import { createHash, randomUUID } from 'node:crypto'
import { ARENA_VERDICTS, PRIMARY_ARENA_PROVIDER_IDS, QUESTION_CATEGORIES, assertBenchmarkMutable, computeBenchmarkLockHash, createQuestionBankEntry, recordArenaJudgment, validateBenchmarkEntries, validateRankingPolicy } from './index.mjs'
import { OBJECTIVE_ANSWER_TYPES } from '../evaluation/objective-answer.mjs'

export const BENCHMARK_MIN_QUESTIONS = 30
export const BULK_FIELDS = Object.freeze(['dataset_id','image_filename','photo_id','question','category','expected_answer','accepted_answers','answer_type','expected_answer_source','source_reference','license','notes'])
const BULK_REQUIRED_FIELDS = Object.freeze(['dataset_id','image_filename','photo_id','question','category','expected_answer','expected_answer_source','notes'])
export const DEFAULT_RANKING_POLICY = Object.freeze({ minQuestions: 30, minUniqueImages: 30, requireExpectedAnswers: true, categoryMinimums: Object.freeze(Object.fromEntries(QUESTION_CATEGORIES.map(category => [category, 1]))) })
export const RUN_SIZE_PRESETS = Object.freeze({ quick5: 5, quick10: 10, preview20: 20, ranked30: 30 })
export const EVIDENCE_TIERS = Object.freeze(['QUICK_CHECK', 'EXPLORATORY', 'PRELIMINARY', 'RANKING_ELIGIBLE'])
const FORBIDDEN_BLIND_FIELDS = new Set(['provider','providerid','model','modelid','modelversion','runtime','mapping','blindmapping','identity','answerids','winnerproviderid'])

export function migrateArenaBuilderState(state, now = new Date().toISOString()) {
  state.schemaVersion = Math.max(8, Number(state.schemaVersion) || 0)
  state.arenaReviewImports ??= []
  state.migrations ??= {}
  for (const dataset of state.datasets || []) {
    dataset.description ??= ''
    dataset.updatedAt ??= dataset.createdAt || now
  }
  for (const entry of state.questionBank || []) {
    entry.notes ??= ''
    entry.updatedAt ??= entry.createdAt || now
    entry.provenance ??= entry.source || 'USER_AUTHORED'
  }
  for (const set of state.arenaBenchmarkSets || []) {
    set.description ??= ''
    set.outputBudget ??= 64
    set.providerIds ??= [...PRIMARY_ARENA_PROVIDER_IDS]
    set.parentVersionId ??= null
    set.lockPayloadVersion ??= set.locked ? 1 : 3
    set.rankingPolicy ??= structuredClone(DEFAULT_RANKING_POLICY)
  }
  for (const batch of state.arenaBatches || []) {
    batch.evidenceTier ??= evidenceTierForCount(batch.roundIds?.length || 0)
    batch.runSizeLabel ??= runSizeLabel(batch.roundIds?.length || 0)
  }
  state.migrations.datasetBenchmarkBuilderV7 ??= now
  state.migrations.flexibleArenaRunsV8 ??= now
  return state
}

export function createDataset(state, input, options = {}) {
  const name = clean(input.name, 120)
  if (!name) throw new Error('Dataset name is required')
  const id = slug(input.id || name, 'dataset')
  if (state.datasets.some(item => item.id === id)) throw new Error('Dataset id already exists')
  const now = options.now || new Date().toISOString()
  const dataset = { id, name, description: clean(input.description, 1000), category: clean(input.category, 80) || 'general', source: clean(input.source, 200) || 'Local user-managed dataset', photoIds: [], experimentIds: ['experiment_05_arena'], createdAt: now, updatedAt: now, groundTruthStatus: 'unreviewed' }
  state.datasets.push(dataset)
  return dataset
}

export function updateDataset(state, id, input, options = {}) {
  const dataset = state.datasets.find(item => item.id === id)
  if (!dataset) throw new Error('Dataset not found')
  if (input.name !== undefined) { const value = clean(input.name, 120); if (!value) throw new Error('Dataset name is required'); dataset.name = value }
  if (input.description !== undefined) dataset.description = clean(input.description, 1000)
  dataset.updatedAt = options.now || new Date().toISOString()
  return dataset
}

export function changeDatasetMembership(state, input, options = {}) {
  const source = input.fromDatasetId ? state.datasets.find(item => item.id === input.fromDatasetId) : null
  const target = input.toDatasetId ? state.datasets.find(item => item.id === input.toDatasetId) : null
  const photo = state.photos.find(item => item.id === input.photoId)
  if (!photo) throw new Error('Photo not found')
  if (input.fromDatasetId && !source) throw new Error('Source dataset not found')
  if (input.toDatasetId && !target) throw new Error('Target dataset not found')
  if (!source && !target) throw new Error('Choose a source or destination dataset')
  if (source && lockedReferenceExists(state, source.id, photo.id)) throw new Error('Photo membership is referenced by a locked benchmark version')
  if (source) source.photoIds = source.photoIds.filter(id => id !== photo.id)
  if (target && !target.photoIds.includes(photo.id)) target.photoIds.push(photo.id)
  const now = options.now || new Date().toISOString()
  if (source) source.updatedAt = now
  if (target) target.updatedAt = now
  return { photoId: photo.id, fromDatasetId: source?.id || null, toDatasetId: target?.id || null }
}

export function questionIssues(input, state, excludingId = null) {
  const text = clean(input.text || input.question, 500)
  const blockers = []
  const warnings = []
  if (!text) blockers.push('Question is required')
  if (text.length > 500) blockers.push('Question exceeds 500 characters')
  if (!QUESTION_CATEGORIES.includes(input.category || 'other')) blockers.push('Unknown question category')
  const dataset = state.datasets.find(item => item.id === input.datasetId)
  const photo = state.photos.find(item => item.id === input.photoId)
  if (!dataset) blockers.push('Dataset reference is missing')
  if (!photo) blockers.push('Photo reference is missing')
  if (dataset && photo && !dataset.photoIds.includes(photo.id)) blockers.push('Photo does not belong to the selected dataset')
  if (photo && (!photo.imagePipeline?.ready || !photo.inferenceFilename)) blockers.push('Photo is not inference-ready')
  const expected = clean(input.expectedAnswer, 500)
  if (input.expectedAnswer !== undefined && String(input.expectedAnswer).trim() && !expected) blockers.push('Expected answer is invalid')
  if (expected && !clean(input.expectedAnswerSource, 100)) warnings.push('Expected answer source will default to USER_DEFINED_GROUND_TRUTH')
  if (input.answerType && !OBJECTIVE_ANSWER_TYPES.includes(input.answerType)) blockers.push('Unknown objective answer type')
  const normalized = normalizeQuestion(text)
  const peers = (state.questionBank || []).filter(item => item.id !== excludingId && item.datasetId === input.datasetId && item.photoId === input.photoId)
  const exact = peers.find(item => normalizeQuestion(item.text) === normalized)
  if (exact) blockers.push(`Exact duplicate of ${exact.id}`)
  for (const peer of peers) if (!exact && similarity(normalized, normalizeQuestion(peer.text)) >= .82) { warnings.push(`Possible near-duplicate of ${peer.id}`); break }
  return { blockers, warnings, valid: blockers.length === 0 }
}

export function addQuestion(state, input, options = {}) {
  const issues = questionIssues(input, state)
  if (!issues.valid) throw new Error(issues.blockers.join('; '))
  const entry = createQuestionBankEntry(input, state, options)
  Object.assign(entry, { expectedAnswerSource: entry.expectedAnswer ? clean(input.expectedAnswerSource, 100) || 'USER_DEFINED_GROUND_TRUTH' : null, notes: clean(input.notes, 1000), provenance: clean(input.provenance, 100) || clean(input.source, 100) || 'USER_AUTHORED', updatedAt: entry.createdAt, issues: issues.warnings })
  if (input.benchmarkSetId) addQuestionToSet(state, input.benchmarkSetId, entry.id)
  return entry
}

export function updateQuestion(state, id, input, options = {}) {
  const entry = state.questionBank.find(item => item.id === id)
  if (!entry) throw new Error('Question not found')
  for (const set of state.arenaBenchmarkSets.filter(item => item.questionIds.includes(id))) assertBenchmarkMutable(set)
  const candidate = { ...entry, ...input, text: input.text ?? input.question ?? entry.text }
  const issues = questionIssues(candidate, state, id)
  if (!issues.valid) throw new Error(issues.blockers.join('; '))
  const expectedAnswer = clean(candidate.expectedAnswer, 500) || null
  Object.assign(entry, { text: clean(candidate.text, 500), category: candidate.category || 'other', datasetId: candidate.datasetId, photoId: candidate.photoId, expectedAnswer, acceptedAnswers: expectedAnswer ? [...new Set((candidate.acceptedAnswers || []).map(value => clean(value, 500)).filter(Boolean))] : [], answerType: candidate.answerType || 'exact_text', expectedAnswerSource: expectedAnswer ? clean(candidate.expectedAnswerSource, 100) || 'USER_DEFINED_GROUND_TRUTH' : null, sourceReference: clean(candidate.sourceReference, 500) || null, license: clean(candidate.license, 100) || null, difficulty: clean(candidate.difficulty, 40) || null, notes: clean(candidate.notes, 1000), updatedAt: options.now || new Date().toISOString(), issues: issues.warnings })
  return entry
}

export function duplicateQuestion(state, id, input = {}, options = {}) {
  const entry = state.questionBank.find(item => item.id === id)
  if (!entry) throw new Error('Question not found')
  return addQuestion(state, { ...entry, ...input, text: input.text || `${entry.text} (copy)`, benchmarkSetId: input.benchmarkSetId, provenance: `DUPLICATED_FROM:${id}` }, options)
}

export function addQuestionToSet(state, setId, questionId) {
  const set = state.arenaBenchmarkSets.find(item => item.id === setId)
  if (!set) throw new Error('Benchmark set not found')
  assertBenchmarkMutable(set)
  if (set.questionIds.includes(questionId)) throw new Error('Question is already in this benchmark set')
  const question = state.questionBank.find(item => item.id === questionId)
  if (!question) throw new Error('Question not found')
  const exact = set.questionIds.map(id => state.questionBank.find(item => item.id === id)).find(item => item && item.photoId === question.photoId && normalizeQuestion(item.text) === normalizeQuestion(question.text))
  if (exact) throw new Error(`Exact duplicate blocked within benchmark set (${exact.id})`)
  set.questionIds.push(questionId); set.status = 'READY'; return set
}

export function benchmarkCoverage(state, setId) {
  const set = state.arenaBenchmarkSets.find(item => item.id === setId)
  if (!set) throw new Error('Benchmark set not found')
  const entries = set.questionIds.map(id => state.questionBank.find(item => item.id === id)).filter(Boolean)
  const categories = Object.fromEntries(QUESTION_CATEGORIES.map(category => [category, entries.filter(item => item.category === category).length]))
  const datasets = Object.fromEntries([...new Set(entries.map(item => item.datasetId).filter(Boolean))].sort().map(id => [id, entries.filter(item => item.datasetId === id).length]))
  const policy = set.rankingPolicy || DEFAULT_RANKING_POLICY
  const categoryGaps = Object.entries(policy.categoryMinimums || {}).filter(([category, minimum]) => (categories[category] || 0) < minimum).map(([category, minimum]) => ({ category, count: categories[category] || 0, minimum }))
  const uniqueImages = new Set(entries.map(item => item.photoId).filter(Boolean)).size
  const expectedAnswers = entries.filter(item => item.expectedAnswer).length
  const suggestions = categoryGaps.map(item => `Add ${item.minimum - item.count} ${item.category.replaceAll('_',' ')} question(s)`)
  return { total: entries.length, target: policy.minQuestions, uniqueImages, uniqueImagesTarget: policy.minUniqueImages, expectedAnswers, expectedAnswersTarget: policy.requireExpectedAnswers ? entries.length : 0, categories, categoryGaps, datasets, policy, suggestions }
}

export function evidenceTierForCount(count) {
  const value = Number(count) || 0
  if (value < 10) return 'QUICK_CHECK'
  if (value < 20) return 'EXPLORATORY'
  if (value < 30) return 'PRELIMINARY'
  return 'RANKING_ELIGIBLE'
}

export function resolveRunSize(input, available) {
  const preset = input.runSize || 'quick5'
  const requested = preset === 'all' ? available : preset === 'custom' ? Number(input.customN) : RUN_SIZE_PRESETS[preset]
  if (!Number.isInteger(requested) || requested < 1) throw new Error('Run size must be a positive integer')
  if (requested > available) throw new Error(`Run size ${requested} exceeds ${available} available questions`)
  return requested
}

export function createRunSelection(state, input) {
  const set = state.arenaBenchmarkSets.find(item => item.id === input.benchmarkSetId)
  if (!set) throw new Error('Benchmark set not found')
  const sourceIds = input.sourceQuestionIds?.length ? [...new Set(input.sourceQuestionIds)] : [...set.questionIds]
  if (sourceIds.some(id => !set.questionIds.includes(id))) throw new Error('Quick selection must use questions from the selected set')
  const entries = sourceIds.map(id => state.questionBank.find(item => item.id === id))
  if (entries.some(item => !item)) throw new Error('Selection references a missing question')
  validateBenchmarkEntries(entries, state)
  const unique = []; const seen = new Set()
  for (const entry of entries) { const key = `${entry.photoId}:${normalizeQuestion(entry.text)}`; if (!seen.has(key)) { seen.add(key); unique.push(entry) } }
  const count = resolveRunSize(input, unique.length)
  const sampling = ['first','random','balanced'].includes(input.sampling) ? input.sampling : 'balanced'
  const seed = normalizeSeed(input.seed ?? randomSeed())
  const preferImageDiversity = input.preferImageDiversity !== false
  let selected = sampling === 'first' ? unique.slice(0, count) : sampling === 'random' ? sampleRandom(unique, count, seed, preferImageDiversity) : sampleBalanced(unique, count, seed, preferImageDiversity)
  const membershipQuestionIds = selected.map(item => item.id)
  const shuffle = Boolean(input.shuffle)
  const shuffleSeed = shuffle ? normalizeSeed(input.shuffleSeed ?? seed ^ 0x9e3779b9) : null
  if (shuffle) selected = deterministicShuffle(selected, shuffleSeed)
  const availableCategories = [...new Set(unique.map(item => item.category))]
  const missingCategories = QUESTION_CATEGORIES.filter(category => !availableCategories.includes(category))
  return {
    benchmarkSetId: set.id, runSize: input.runSize || 'custom', requestedCount: count, sampling, seed, preferImageDiversity,
    shuffle, shuffleSeed, membershipQuestionIds, selectedQuestionIds: selected.map(item => item.id), selectedImageIds: selected.map(item => item.photoId),
    uniqueImageIds: [...new Set(selected.map(item => item.photoId))], evidenceTier: evidenceTierForCount(count), missingCategories,
    categoryCounts: Object.fromEntries(QUESTION_CATEGORIES.map(category => [category, selected.filter(item => item.category === category).length])),
    snapshotHash: createHash('sha256').update(JSON.stringify({ setId: set.id, membershipQuestionIds, orderedQuestionIds: selected.map(item => item.id), seed, shuffleSeed })).digest('hex')
  }
}

export function createBenchmarkSet(state, input, options = {}) {
  const name = clean(input.name, 120)
  if (!name) throw new Error('Benchmark set name is required')
  const id = slug(input.id || name, 'benchmark')
  if (state.arenaBenchmarkSets.some(item => item.id === id)) throw new Error('Benchmark set id already exists')
  const now = options.now || new Date().toISOString()
  const set = { id, name, description: clean(input.description, 1000), version: clean(input.version, 80) || '1.0.0-draft', status: 'EMPTY', locked: false, lockHash: null, lockPayloadVersion: 3, lockedAt: null, startedAt: null, questionIds: [], suggestedCategorySlots: [...QUESTION_CATEGORIES], rankingPolicy: structuredClone(input.rankingPolicy || DEFAULT_RANKING_POLICY), providerIds: [...PRIMARY_ARENA_PROVIDER_IDS], outputBudget: Number(input.outputBudget) || 64, parentVersionId: null, createdAt: now }
  state.arenaBenchmarkSets.push(set); return set
}

export function removeQuestionFromSet(state, setId, questionId) {
  const set = state.arenaBenchmarkSets.find(item => item.id === setId)
  if (!set) throw new Error('Benchmark set not found')
  assertBenchmarkMutable(set)
  if (!set.questionIds.includes(questionId)) throw new Error('Question is not in this benchmark set')
  set.questionIds = set.questionIds.filter(id => id !== questionId)
  set.status = set.questionIds.length ? 'READY' : 'EMPTY'
  return set
}

export function validateBenchmarkSet(state, setId) {
  const set = state.arenaBenchmarkSets.find(item => item.id === setId)
  if (!set) throw new Error('Benchmark set not found')
  const blockers = [], warnings = [], questionIds = set.questionIds || []
  if (questionIds.length < BENCHMARK_MIN_QUESTIONS) blockers.push(`${questionIds.length}/${BENCHMARK_MIN_QUESTIONS} questions`)
  if (new Set(questionIds).size !== questionIds.length) blockers.push('Duplicate question ids in benchmark set')
  const entries = questionIds.map(id => state.questionBank.find(item => item.id === id))
  if (entries.some(item => !item)) blockers.push('Missing question reference')
  try { if (!blockers.some(value => value === 'Missing question reference')) validateBenchmarkEntries(entries, state) } catch (error) { blockers.push(error.message) }
  const seen = new Set()
  for (const entry of entries.filter(Boolean)) { const key = `${entry.photoId}:${normalizeQuestion(entry.text)}`; if (seen.has(key)) blockers.push(`Exact duplicate in set: ${entry.id}`); seen.add(key) }
  const coverage = benchmarkCoverage(state, setId)
  try { validateRankingPolicy(set, entries.filter(Boolean)) } catch (error) { blockers.push(error.message) }
  if (!String(set.version || '').trim()) blockers.push('Version is required')
  return { valid: blockers.length === 0, blockers: [...new Set(blockers)], warnings, coverage }
}

export function lockPreview(state, setId, input = {}) {
  const set = state.arenaBenchmarkSets.find(item => item.id === setId)
  if (!set) throw new Error('Benchmark set not found')
  const version = clean(input.version || set.version, 80)
  const validation = validateBenchmarkSet(state, setId)
  const providerIds = input.providerIds || set.providerIds || PRIMARY_ARENA_PROVIDER_IDS
  const outputBudget = Number(input.outputBudget || set.outputBudget || 64)
  const payload = { benchmarkSetId: set.id, version, questionCount: set.questionIds.length, uniqueImages: validation.coverage.uniqueImages, categoryCoverage: validation.coverage.categories, categoryGaps: validation.coverage.categoryGaps, expectedAnswers: validation.coverage.expectedAnswers, providerIds, outputBudget, lockHash: computeBenchmarkLockHash({ ...set, lockPayloadVersion: 3, providerIds, outputBudget }, state, version) }
  return { ...payload, ...validation, irreversible: true }
}

export function lockBenchmarkSet(state, setId, input = {}, options = {}) {
  const set = state.arenaBenchmarkSets.find(item => item.id === setId)
  if (!set) throw new Error('Benchmark set not found')
  assertBenchmarkMutable(set)
  if (input.confirm !== true) throw new Error('Irreversible lock confirmation is required')
  const preview = lockPreview(state, setId, input)
  if (!preview.valid) throw new Error(preview.blockers.join('; '))
  Object.assign(set, { version: preview.version, locked: true, lockedAt: options.now || new Date().toISOString(), status: 'LOCKED', lockHash: preview.lockHash, lockPayloadVersion: 3, providerIds: preview.providerIds, outputBudget: preview.outputBudget })
  return set
}

export function cloneBenchmarkVersion(state, setId, input = {}, options = {}) {
  const source = state.arenaBenchmarkSets.find(item => item.id === setId)
  if (!source?.locked) throw new Error('Only a locked benchmark version can be cloned')
  const id = slug(input.id || `${source.id}-${input.version || 'next'}`, 'benchmark')
  if (state.arenaBenchmarkSets.some(item => item.id === id)) throw new Error('Benchmark set id already exists')
  const now = options.now || new Date().toISOString()
  const set = { ...source, id, name: clean(input.name, 120) || `${source.name} — next version`, description: clean(input.description, 1000) || source.description, version: clean(input.version, 80) || nextVersion(source.version), status: 'READY', locked: false, lockHash: null, lockedAt: null, startedAt: null, parentVersionId: source.id, createdAt: now, questionIds: [...source.questionIds], providerIds: [...(source.providerIds || PRIMARY_ARENA_PROVIDER_IDS)] }
  state.arenaBenchmarkSets.push(set); return set
}

export function benchmarkDiff(state, leftId, rightId) {
  const left = state.arenaBenchmarkSets.find(item => item.id === leftId), right = state.arenaBenchmarkSets.find(item => item.id === rightId)
  if (!left || !right) throw new Error('Benchmark version not found')
  return { left: left.id, right: right.id, addedQuestionIds: right.questionIds.filter(id => !left.questionIds.includes(id)), removedQuestionIds: left.questionIds.filter(id => !right.questionIds.includes(id)), changedMetadata: ['name','description','version','outputBudget'].filter(key => JSON.stringify(left[key]) !== JSON.stringify(right[key])).map(key => ({ field: key, from: left[key], to: right[key] })) }
}

export function csvTemplate() { return `${BULK_FIELDS.join(',')}\npet_photos_real_v1,image.jpg,,What is visible?,object_recognition,Dog,"dog|a dog",exact_text,USER_DEFINED_GROUND_TRUTH,Human annotation,CC-BY-4.0,Optional note\n` }

export function parseDelimited(text) {
  const rows = []; let row = [], field = '', quoted = false
  for (let index = 0; index <= String(text).length; index++) { const char = String(text)[index] ?? '\n'; if (quoted) { if (char === '"' && String(text)[index + 1] === '"') { field += '"'; index++ } else if (char === '"') quoted = false; else field += char } else if (char === '"') quoted = true; else if (char === ',') { row.push(field); field = '' } else if (char === '\n') { row.push(field.replace(/\r$/, '')); if (row.some(value => value !== '')) rows.push(row); row = []; field = '' } else field += char }
  if (quoted) throw new Error('CSV contains an unterminated quoted field')
  const headers = rows.shift()?.map(value => value.trim().toLowerCase()) || []
  if (BULK_REQUIRED_FIELDS.some(field => !headers.includes(field))) throw new Error(`CSV header must include: ${BULK_REQUIRED_FIELDS.join(', ')}`)
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

export function previewQuestionImport(state, input) {
  let rawRows
  if (input.format === 'csv') rawRows = parseDelimited(input.content || '')
  else { const parsed = typeof input.content === 'string' ? JSON.parse(input.content) : input.content; rawRows = Array.isArray(parsed) ? parsed : parsed?.questions; if (!Array.isArray(rawRows)) throw new Error('JSON import must contain an array of questions') }
  const rows = rawRows.map((raw, index) => {
    const datasetId = raw.dataset_id || raw.datasetId
    const dataset = state.datasets.find(item => item.id === datasetId)
    const requestedPhotoId = raw.photo_id || raw.photoId
    const filename = raw.image_filename || raw.imageFilename
    const matches = requestedPhotoId ? state.photos.filter(item => item.id === requestedPhotoId) : state.photos.filter(item => dataset?.photoIds?.includes(item.id) && item.filename === filename)
    const normalized = { datasetId, photoId: matches.length === 1 ? matches[0].id : null, text: raw.question || raw.text, category: raw.category || 'other', expectedAnswer: raw.expected_answer ?? raw.expectedAnswer, acceptedAnswers: parseAcceptedAnswers(raw.accepted_answers ?? raw.acceptedAnswers), answerType: raw.answer_type || raw.answerType || 'exact_text', expectedAnswerSource: raw.expected_answer_source ?? raw.expectedAnswerSource, sourceReference: raw.source_reference ?? raw.sourceReference, license: raw.license, notes: raw.notes, provenance: 'BULK_IMPORT' }
    const extra = []; if (!requestedPhotoId && matches.length !== 1) extra.push(matches.length ? 'image_filename is ambiguous in dataset' : 'image_filename does not resolve in dataset')
    const issues = questionIssues(normalized, state)
    return { row: index + 2, input: raw, normalized, blockers: [...extra, ...issues.blockers], warnings: issues.warnings, valid: extra.length === 0 && issues.valid }
  })
  const within = new Map()
  for (const row of rows) { const key = `${row.normalized.photoId}:${normalizeQuestion(row.normalized.text)}`; if (within.has(key)) { row.blockers.push(`Exact duplicate of import row ${within.get(key)}`); row.valid = false } else within.set(key, row.row) }
  return { format: input.format, rowCount: rows.length, validRows: rows.filter(item => item.valid).length, invalidRows: rows.filter(item => !item.valid).length, atomic: true, rows }
}

export function applyQuestionImport(state, input, options = {}) {
  const preview = previewQuestionImport(state, input)
  if (preview.invalidRows && input.allowPartial !== true) throw new Error(`Atomic import rejected: ${preview.invalidRows} invalid row(s)`)
  const imported = []
  for (const row of preview.rows.filter(item => item.valid)) imported.push(addQuestion(state, { ...row.normalized, benchmarkSetId: input.benchmarkSetId }, options))
  return { importedIds: imported.map(item => item.id), skippedRows: preview.invalidRows, partial: preview.invalidRows > 0 }
}

export function buildReviewQueue(state, batchId = null) {
  const batch = batchId ? state.arenaBatches.find(item => item.id === batchId) : [...state.arenaBatches].reverse().find(item => ['AWAITING_JUDGMENT','PARTIALLY_COMPLETED','RUNNING'].includes(item.status))
  const rounds = (batch?.roundIds || []).map(id => state.arenaRounds.find(item => item.id === id)).filter(item => item && ['AWAITING_JUDGMENT','READY_TO_REVEAL'].includes(item.status))
  const isHuman = item => ['USER_JUDGE','BLIND_HUMAN_JUDGE'].includes(item.judgeProviderId)
  const judged = rounds.filter(round => Object.keys(round.blindMapping).every(label => state.arenaJudgments.some(item => item.roundId === round.id && item.blindLabel === label && isHuman(item)))).length
  return { batchId: batch?.id || null, total: rounds.length, judged, pending: rounds.length - judged, rounds: rounds.map(round => ({ id: round.id, photoId: round.photoId, question: round.question, category: round.category, status: round.status, objectiveScoringComplete: Boolean(round.expectedAnswer) && Object.keys(round.blindMapping).every(label => state.arenaJudgments.some(item => item.roundId === round.id && item.blindLabel === label && item.judgeProviderId === 'GOLD_ANSWER_SCORER')), imageUrl: `/previews/${round.photoId}`, answers: Object.keys(round.blindMapping).sort().map(label => ({ blindLabel: label, rawOutput: state.inferences.find(item => item.id === round.answerIds[label])?.rawOutput || '', judged: state.arenaJudgments.some(item => item.roundId === round.id && item.blindLabel === label && isHuman(item)) })) })) }
}

export function blindReviewTemplate(state, roundIds, input = {}) {
  const rounds = roundIds.map(id => state.arenaRounds.find(item => item.id === id))
  if (rounds.some(round => !round || !['AWAITING_JUDGMENT','READY_TO_REVEAL'].includes(round.status))) throw new Error('Blind review export requires unrevealed completed rounds')
  return { schemaVersion: 1, bundleType: 'BLIND_HUMAN_REVIEW', judgeId: clean(input.judgeId, 120) || '', judgeLabel: clean(input.judgeLabel, 120) || '', rounds: rounds.map(round => ({ roundId: round.id, imageId: round.photoId, inferenceImageSha256: round.inferenceImage?.sha256 || null, question: round.question, category: round.category, judgments: Object.keys(round.blindMapping).sort().map(blindLabel => ({ blindLabel, verdict: null, note: null })) })) }
}

export function previewBlindReviewImport(state, payload) {
  if (containsForbiddenField(payload)) throw new Error('Blind review import contains identity or mapping fields')
  if (!clean(payload?.judgeId, 120)) throw new Error('judgeId is required')
  if (!Array.isArray(payload.rounds) || !payload.rounds.length) throw new Error('Review import contains no rounds')
  const errors = [], rows = []
  for (const input of payload.rounds) {
    const round = state.arenaRounds.find(item => item.id === input.roundId)
    if (!round) { errors.push(`Unknown round ${input.roundId}`); continue }
    if (!['AWAITING_JUDGMENT','READY_TO_REVEAL'].includes(round.status)) { errors.push(`Round ${round.id} is already revealed or unavailable`); continue }
    const labels = new Set(Object.keys(round.blindMapping))
    if (!Array.isArray(input.judgments) || input.judgments.length !== labels.size) { errors.push(`Round ${round.id} must judge every blind label`); continue }
    for (const judgment of input.judgments) {
      if (!labels.has(judgment.blindLabel)) errors.push(`Round ${round.id}: unknown label ${judgment.blindLabel}`)
      if (!ARENA_VERDICTS.includes(judgment.verdict)) errors.push(`Round ${round.id}/${judgment.blindLabel}: invalid verdict`)
      rows.push({ roundId: round.id, blindLabel: judgment.blindLabel, verdict: judgment.verdict, note: judgment.note })
    }
  }
  return { valid: errors.length === 0, errors, judgmentCount: rows.length, judgeId: clean(payload.judgeId, 120), judgeLabel: clean(payload.judgeLabel, 120), rows }
}

export function applyBlindReviewImport(state, payload, options = {}) {
  const preview = previewBlindReviewImport(state, payload)
  if (!preview.valid) throw new Error(`Atomic blind review import rejected: ${preview.errors.join('; ')}`)
  const imported = preview.rows.map(row => recordArenaJudgment(state, { ...row, judgeProviderId: 'BLIND_HUMAN_JUDGE', judgeId: preview.judgeId, judgeLabel: preview.judgeLabel }, options))
  state.arenaReviewImports.push({ id: `review_import_${(options.idFactory || randomUUID)()}`, judgeId: preview.judgeId, judgeLabel: preview.judgeLabel || null, judgmentIds: imported.map(item => item.id), importedAt: options.now || new Date().toISOString(), provenance: 'BLIND_HUMAN_JUDGE', payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') })
  return { imported: imported.length, judgeId: preview.judgeId }
}

export function datasetBuilderView(state) {
  return (state.datasets || []).map(dataset => { const photos = dataset.photoIds.map(id => state.photos.find(item => item.id === id)).filter(Boolean); return { ...dataset, imageCount: photos.length, readyCount: photos.filter(item => item.imagePipeline?.ready).length, preprocessingErrors: photos.filter(item => !item.imagePipeline?.ready).length, photos: photos.map(photo => ({ id: photo.id, filename: photo.filename, width: photo.width || photo.imagePipeline?.normalized?.width || null, height: photo.height || photo.imagePipeline?.normalized?.height || null, imageUrl: photo.imagePipeline?.ready ? `/previews/${photo.id}` : null, pipeline: photo.imagePipeline?.ready ? 'READY' : photo.imagePipeline?.errorCode || 'NOT_READY', inferenceImageSha256: photo.inferenceImageSha256 || null })) } })
}

function lockedReferenceExists(state, datasetId, photoId) { return state.arenaBenchmarkSets.some(set => set.locked && set.questionIds.some(id => { const q = state.questionBank.find(item => item.id === id); return q?.datasetId === datasetId && q?.photoId === photoId })) }
function clean(value, max = Infinity) { return String(value ?? '').trim().slice(0, max) }
function parseAcceptedAnswers(value) { return Array.isArray(value) ? value : String(value || '').split('|').map(item => item.trim()).filter(Boolean) }
function slug(value, fallback) { return clean(value, 120).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `${fallback}-${randomUUID().slice(0, 8)}` }
function normalizeQuestion(value) { return clean(value).toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, ' ').trim() }
function similarity(left, right) { const a = new Set(left.split(' ').filter(Boolean)), b = new Set(right.split(' ').filter(Boolean)); const union = new Set([...a, ...b]); return union.size ? [...a].filter(value => b.has(value)).length / union.size : 0 }
function nextVersion(version = '1.0.0') { const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/); return match ? `${match[1]}.${Number(match[2]) + 1}.0-draft` : `${version}-next` }
function containsForbiddenField(value) { if (!value || typeof value !== 'object') return false; return Object.entries(value).some(([key, child]) => FORBIDDEN_BLIND_FIELDS.has(key.toLowerCase()) || containsForbiddenField(child)) }
function runSizeLabel(count) { return count === 5 ? 'Quick 5' : count === 10 ? 'Quick 10' : count === 20 ? 'Preview 20' : count >= 30 ? `Ranked ${count}` : `Custom ${count}` }
function normalizeSeed(value) { const numeric = Number(value); return Number.isFinite(numeric) ? Math.abs(Math.trunc(numeric)) >>> 0 : createHash('sha256').update(String(value)).digest().readUInt32LE(0) }
function randomSeed() { return Number.parseInt(randomUUID().replaceAll('-', '').slice(0, 8), 16) >>> 0 }
function seededRandom(seed) { let state = normalizeSeed(seed) || 0x6d2b79f5; return () => { state |= 0; state = state + 0x6d2b79f5 | 0; let value = Math.imul(state ^ state >>> 15, 1 | state); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296 } }
function deterministicShuffle(entries, seed) { const result = [...entries], random = seededRandom(seed); for (let index = result.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [result[index], result[swap]] = [result[swap], result[index]] } return result }
function diversify(entries, count, prefer, seed) { if (!prefer) return entries.slice(0, count); const output = [], deferred = [], images = new Set(); for (const entry of entries) { if (images.has(entry.photoId)) deferred.push(entry); else { output.push(entry); images.add(entry.photoId) } } return [...output, ...deterministicShuffle(deferred, seed ^ 0x85ebca6b)].slice(0, count) }
function sampleRandom(entries, count, seed, prefer) { return diversify(deterministicShuffle(entries, seed), count, prefer, seed) }
function sampleBalanced(entries, count, seed, prefer) { const random = seededRandom(seed); const groups = new Map(); for (const entry of deterministicShuffle(entries, seed)) { const rows = groups.get(entry.category) || []; rows.push(entry); groups.set(entry.category, rows) } const categories = deterministicShuffle([...groups.keys()], Math.floor(random() * 0xffffffff)); const selected = [], usedImages = new Set(); while (selected.length < count) { let progressed = false; for (const category of categories) { const rows = groups.get(category); if (!rows.length) continue; let index = prefer ? rows.findIndex(item => !usedImages.has(item.photoId)) : 0; if (index < 0) index = 0; const [entry] = rows.splice(index, 1); selected.push(entry); usedImages.add(entry.photoId); progressed = true; if (selected.length === count) break } if (!progressed) break } return selected }
