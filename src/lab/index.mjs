import { randomUUID } from 'node:crypto'

export const CURRENT_PROJECT = 'QVAC Vision Lab'
export const HISTORICAL_PRODUCT = 'QVAC PawVault'
export const PAWVAULT_EXPERIMENT_ID = 'experiment_01_pawvault'
export const OPEN_REVIEW_VERDICTS = Object.freeze(['CORRECT', 'PARTIALLY_CORRECT', 'WRONG', 'HALLUCINATED', 'UNCLEAR_IMAGE'])
export const JUDGE_TYPES = Object.freeze(['USER', 'CODEX_ASSISTED', 'LOCAL_MODEL'])

export const EXPERIMENTS = Object.freeze([
  experiment(PAWVAULT_EXPERIMENT_ID, 'Experiment 01', 'PawVault', 'Private Pet Photo Search', 'COMPLETED', 'Findings captured', 'Test whether VisionPsy can transform real private pet photos into useful searchable semantic information.'),
  experiment('experiment_02_visual_qa', 'Experiment 02', 'Visual Q&A', 'Real-World Visual Q&A', 'READY', 'Quick test available', 'Ask precise, natural questions about a single real image.'),
  experiment('experiment_03_screenshot', 'Experiment 03', 'Screenshot Understanding', 'Single-Image Screenshot Q&A', 'READY', 'Quick test available', 'Test apps, websites, settings, dashboards, and warning dialogs as single images.'),
  experiment('experiment_04_documents', 'Experiment 04', 'Documents & Charts', 'Visual Text, Document & Chart Q&A', 'READY', 'Quick test available', 'Ask precise questions about visible text, values, tables, documents, and charts.'),
  experiment('experiment_05_arena', 'Experiment 05', 'Fair Resource-Matched Arena', 'Compare Models', 'READY', 'Three pinned primary peers; dataset gate pending', 'Run the same image and exact question through pinned local peers with blind review and auditable fairness controls.'),
  experiment('experiment_06_showcase', 'Experiment 06', 'VisionPsy RealWorldQA', 'Complete Local Benchmark', 'READY', '765 official questions · three VisionPsy variants', 'Run the complete official RealWorldQA set through VisionPsy Standard Q8, Flash Q8 and Flash Q4 with exact option scoring, streaming and measured local telemetry.')
])

export const VQA_PRESETS = Object.freeze([
  vqaPreset('real_world_vqa_quick_v1', 'Real-World VQA Quick Test v1', 'experiment_02_visual_qa', 'general'),
  vqaPreset('screenshot_qa_quick_v1', 'Screenshot Q&A Quick Test v1', 'experiment_03_screenshot', 'screenshot'),
  vqaPreset('document_chart_qa_quick_v1', 'Document & Chart Q&A Quick Test v1', 'experiment_04_documents', 'document_chart'),
  { ...vqaPreset('small_vision_model_arena_v1', 'Small Vision Model Arena v1', 'experiment_05_arena', 'comparison'), comparison: true, defaultProviderIds: ['visionpsy-patched-base', 'lfm2.5-vl-450m', 'qvac-smolvlm2'] }
])

export const PROVIDER_SLOTS = Object.freeze([
  { id: 'lfm2.5-vl-450m', name: 'LFM2.5-VL-450M', state: 'READY', ready: true, reason: null }
])

export function migrateLabState(state, now = new Date().toISOString()) {
  state.schemaVersion = Math.max(4, Number(state.schemaVersion) || 0)
  state.datasets ??= []
  state.vqaQuestions ??= []
  state.shareableFindings ??= {}
  state.featuredExamples ??= []
  state.migrations ??= {}
  const canonicalPhotoIds = canonicalPawVaultPhotoIds(state.runs || [], state.photos || [])
  let dataset = state.datasets.find(item => item.id === 'pet_photos_real_v1')
  if (!dataset) {
    dataset = { id: 'pet_photos_real_v1', name: 'Pet Photos Real Set v1', category: 'pet_photos', photoIds: canonicalPhotoIds, source: 'Private real-world user photos imported locally', experimentIds: [PAWVAULT_EXPERIMENT_ID, 'experiment_02_visual_qa', 'experiment_05_arena'], createdAt: oldestDate(state.photos) || now, groundTruthStatus: groundTruthStatus(state.annotations) }
    state.datasets.push(dataset)
  } else {
    dataset.photoIds ??= canonicalPhotoIds
    dataset.experimentIds = [...new Set([...(dataset.experimentIds || []), PAWVAULT_EXPERIMENT_ID, 'experiment_02_visual_qa', 'experiment_05_arena'])]
    dataset.groundTruthStatus ??= groundTruthStatus(state.annotations)
  }
  ensureDataset(state, { id: 'screenshot_real_v1', name: 'Screenshot Real Set v1', category: 'screenshot', experimentIds: ['experiment_03_screenshot'], source: 'User-selected local screenshots' }, now)
  ensureDataset(state, { id: 'document_chart_real_v1', name: 'Documents & Charts Real Set v1', category: 'document_chart', experimentIds: ['experiment_04_documents'], source: 'User-selected local document and chart images' }, now)
  for (const run of state.runs || []) {
    run.experimentId ??= PAWVAULT_EXPERIMENT_ID
    run.datasetId ??= run.experimentId === PAWVAULT_EXPERIMENT_ID ? dataset.id : null
    run.questionSet ??= run.promptSet || run.promptVersion || run.benchmarkPreset || null
    run.provenance ??= { historicalProduct: HISTORICAL_PRODUCT, currentProject: CURRENT_PROJECT, migratedWithoutRewritingEvidence: true }
  }
  for (const review of state.reviews || []) {
    review.judge ??= review.reviewSource === 'CODEX_VISUAL_REVIEW' || review.groundTruthSource === 'AI_ASSISTED'
      ? { type: 'CODEX_ASSISTED', provenance: 'CODEX_VISUAL_REVIEW' }
      : { type: 'USER', provenance: 'USER_MANUAL' }
  }
  if (!state.migrations.qvacVisionLabV4) state.migrations.qvacVisionLabV4 = now
  return state
}

export function publicDatasets(state) {
  return (state.datasets || []).map(dataset => ({ ...dataset, imageCount: dataset.photoIds?.length || 0, source: dataset.source || 'Local import', experimentUsage: (dataset.experimentIds || []).map(id => EXPERIMENTS.find(item => item.id === id)?.name || id) }))
}

export function validateVqaDraftInput(input, state) {
  const preset = VQA_PRESETS.find(item => item.id === input.presetId)
  if (!preset) throw new Error('Unknown VQA preset')
  const photoIds = [...new Set(input.photoIds || [])]
  if (!photoIds.length || photoIds.length > preset.quickLimit) throw new Error(`Select between 1 and ${preset.quickLimit} images`)
  if (photoIds.some(id => !state.photos.some(photo => photo.id === id))) throw new Error('Unknown photo in VQA selection')
  const dataset = state.datasets.find(item => item.id === (input.datasetId || 'pet_photos_real_v1'))
  if (!dataset) throw new Error('Unknown dataset')
  if (photoIds.some(id => !dataset.photoIds.includes(id))) throw new Error('Every selected image must belong to the selected dataset')
  const questions = photoIds.map(photoId => ({ photoId, text: String(input.questions?.[photoId] || '').trim() }))
  if (questions.some(item => !item.text)) throw new Error('Write one manual question for every selected image')
  if (questions.some(item => item.text.length > 500)) throw new Error('Questions must be at most 500 characters')
  const providerIds = [...new Set(input.providerIds || preset.defaultProviderIds)]
  if (!providerIds.length) throw new Error('Select at least one provider')
  if (!preset.comparison && providerIds.length !== 1) throw new Error('Quick VQA presets use exactly one provider')
  return { preset, photoIds, questions, providerIds }
}

export function createVqaDraft(input, state, now = new Date().toISOString(), idFactory = randomUUID) {
  const { preset, photoIds, questions, providerIds } = validateVqaDraftInput(input, state)
  const questionRows = questions.map(item => ({ id: `question_${idFactory()}`, experimentId: preset.experimentId, datasetId: input.datasetId || 'pet_photos_real_v1', photoId: item.photoId, text: item.text, source: 'USER_MANUAL', createdAt: now }))
  const run = {
    id: `run_${now.replace(/[-:.TZ]/g, '').slice(0, 14)}_vqa_${idFactory().slice(0, 8)}`, status: 'DRAFT', experimentId: preset.experimentId,
    benchmarkPreset: preset.id, providerId: providerIds.length === 1 ? providerIds[0] : null, providerIds, datasetId: input.datasetId || 'pet_photos_real_v1',
    questionSet: 'manual_per_image', questionIds: questionRows.map(item => item.id), photoIds, taskIds: ['vqa_manual'], photoCount: photoIds.length,
    taskCount: 1, expectedPredictions: photoIds.length * providerIds.length, completedPredictions: 0, failedPredictions: 0, startedAt: null, finishedAt: null,
    durationMs: null, cancelled: false, shareableFinding: '', provenance: { currentProject: CURRENT_PROJECT, questionSource: 'USER_MANUAL', judgeBoundary: ['USER', 'CODEX_ASSISTED', 'LOCAL_MODEL'], silentFallback: false }
  }
  return { run, questions: questionRows }
}

export function arenaMetrics(inferences, reviews, minimumReviewed = 20) {
  const reviewMap = new Map(reviews.map(item => [item.inferenceId, item]))
  return [...Map.groupBy(inferences, item => item.providerId).entries()].map(([providerId, rows]) => {
    const judged = rows.map(row => reviewMap.get(row.id)).filter(Boolean)
    const count = verdict => judged.filter(review => review.verdict === verdict).length
    return { providerId, samples: rows.length, reviewed: judged.length, correct: count('CORRECT'), partiallyCorrect: count('PARTIALLY_CORRECT'), wrong: count('WRONG'), hallucinated: count('HALLUCINATED'), unclearImage: count('UNCLEAR_IMAGE'), invalid: rows.filter(row => row.validationResult !== 'VALID').length, averageLatencyMs: average(rows.map(row => row.latencyMs).filter(Number.isFinite)), rankingEligible: judged.length >= minimumReviewed, rankingNote: judged.length < minimumReviewed ? 'Exploratory result — sample too small for ranking.' : null }
  })
}

function experiment(id, number, name, subtitle, status, statusDetail, description) { return { id, number, name, subtitle, status, statusDetail, description } }
function vqaPreset(id, name, experimentId, datasetCategory) { return { id, name, experimentId, datasetCategory, mode: 'vqa', quickLimit: 10, defaultProviderIds: ['visionpsy-patched-base'], reviewVerdicts: OPEN_REVIEW_VERDICTS } }
function canonicalPawVaultPhotoIds(runs, photos) { const candidates = runs.flatMap(run => [run.workingPhotoIds, run.photoIds]).filter(Array.isArray); return [...(candidates.sort((a, b) => b.length - a.length)[0] || photos.map(item => item.id))] }
function oldestDate(photos = []) { return photos.map(item => item.importedAt).filter(Boolean).sort()[0] || null }
function groundTruthStatus(annotations = []) { const sources = new Set(annotations.map(item => item.source || item.groundTruthSource).filter(Boolean)); return sources.size ? `mixed ${[...sources].sort().join(' / ')}` : 'unreviewed' }
function average(values) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null }
function ensureDataset(state, input, now) { if (!state.datasets.some(item => item.id === input.id)) state.datasets.push({ ...input, photoIds: [], createdAt: now, groundTruthStatus: 'unreviewed' }) }
