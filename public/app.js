import { benchmarkCardState, benchmarkProgress, scopePhotoIds } from './benchmark-workflow.js'

const $ = selector => document.querySelector(selector)
const state = { data: null, selectedPhotos: new Set(), selectedTasks: new Set(), selectedProviderId: 'qvac-visionpsy', selectedRunId: null, activePresetId: null, benchmarkScope: 'quick', quickTruthTaskId: null, quickTruthStatus: 'all', quickTruthLabel: 'all', openInference: null, busy: false, showArchive: false, elapsedTimer: null, vqaPresetId: 'real_world_vqa_quick_v1', vqaDatasetId: 'pet_photos_real_v1', vqaPhotoIds: new Set(), vqaQuestions: {}, vqaProviderIds: new Set(['visionpsy-patched-base']), vqaReuseQuestion: false, evidenceKind: 'all', evidenceExperiment: 'all', evidenceProvider: 'all', evidenceJudge: 'all', arenaOpen: false, arenaTab: 'quick', arenaDatasetId: 'pet_photos_real_v1', arenaPhotoId: null, arenaProviderIds: new Set(['visionpsy-patched-base','lfm2.5-vl-450m','qvac-smolvlm2']), arenaReadiness: null, arenaFilters: { datasetId: 'all', category: 'all', providerId: 'all', judgeProviderId: 'all', evidenceTier: 'RANKING_ELIGIBLE' }, builderDatasetId: null, builderSetId: 'real_world_vision_arena_v1', datasetSearch: '', datasetReadyFilter: 'all', questionSearch: '', questionCategory: 'all', questionDataset: 'all', selectedQuestionIds: new Set(), quickRunSize: 'quick5', quickCustomN: 5, quickSampling: 'balanced', quickSeed: null, quickShuffle: false, quickSelection: null, activeArenaBatchId: null, arenaRunProgress: null, reviewIndex: 0, pendingQuestionImport: null, pendingReviewImport: null }
const experimentRoute = window.location.pathname.match(/^\/experiments\/(0[1-6])\/?$/)?.[1] || null
const experimentRouteById = { experiment_01_pawvault: '01', experiment_02_visual_qa: '02', experiment_03_screenshot: '03', experiment_04_documents: '04', experiment_05_arena: '05', experiment_06_showcase: '06' }
let routeInitialized = false
let dogBenchmark = null

// Experiment pages must become visible even if unrelated historical dashboard
// state cannot be loaded. Experiment 06 has its own independent showcase API.
if (experimentRoute) applyExperimentRoute()

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...options.headers }, ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

async function downloadPost(path, payload, filename) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Request failed (${response.status})`) }
  const link = document.createElement('a'); link.href = URL.createObjectURL(await response.blob()); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

async function load(runId = state.selectedRunId) {
  ;[state.data, dogBenchmark] = await Promise.all([
    api(`/api/state${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`),
    api('/api/benchmarks/dog-count').catch(() => null)
  ])
  if (!routeInitialized) { configureExperimentRoute(); routeInitialized = true }
  state.selectedRunId = state.data.currentRun?.id || null
  const previousPresetId = state.activePresetId
  state.activePresetId = state.data.currentRun?.benchmarkPreset || null
  const preset = activePreset()
  if (preset) {
    if (previousPresetId !== preset.id) state.selectedProviderId = preset.providerId
    state.selectedTasks = new Set([...state.selectedTasks].filter(id => [...preset.coreTaskIds, ...preset.experimentalTaskIds].includes(id)))
    if (!state.selectedTasks.size && state.data.currentRun?.status === 'DRAFT') state.selectedTasks = new Set(preset.coreTaskIds)
  }
  state.selectedPhotos = new Set([...state.selectedPhotos].filter(id => state.data.photos.some(photo => photo.id === id)))
  if (preset?.mode === 'minimal-semantic' && state.data.currentRun?.status === 'DRAFT') state.selectedPhotos = new Set(state.data.currentRun.minimalQuickPhotoIds || [])
  render()
}

function render() {
  const { photos, tasks, inferences, reviews, evaluation, providers, currentRun, previousRuns, archivedPhotos } = state.data
  const preset = activePreset()
  const labVqa = state.data.vqaPresets?.some(item => item.id === currentRun?.benchmarkPreset)
  renderLab()
  const provider = providers.find(item => item.id === state.selectedProviderId) || providers[0]
  state.selectedProviderId = provider.id
  $('#photo-count').textContent = `${photos.length} current photo${photos.length === 1 ? '' : 's'}`
  const arenaProviders = state.arenaOpen ? providers.filter(item => state.data.arena?.primaryProviderIds?.includes(item.id)) : []
  const arenaReady = arenaProviders.length === 3 && arenaProviders.every(item => item.ready)
  $('#provider-pill').textContent = state.arenaOpen ? `3 modelli Arena · ${arenaReady ? 'PRONTI' : 'NON DISPONIBILI'}` : `${provider.name} · ${provider.label}`
  $('#provider-pill').className = `pill ${(state.arenaOpen ? arenaReady : provider.ready) ? 'ready' : 'blocked'}`
  $('#provider-note').textContent = state.arenaOpen ? (arenaReady ? 'I tre modelli locali richiesti dall’Arena sono pronti.' : 'Uno o più modelli Arena non sono disponibili.') : provider.ready ? `${provider.model} · ${provider.runtime}.` : provider.reason
  $('#current-run-id').textContent = currentRun?.id || 'No active run'
  $('#current-run-meta').textContent = currentRun ? `${currentRun.status} · ${currentRun.photoIds.length} photo${currentRun.photoIds.length === 1 ? '' : 's'} · ${currentRun.providerId || (preset ? 'VisionPsy-Nano-460M selected' : 'provider not selected')}` : 'Importing creates a fresh run automatically.'
  const exportable = ['COMPLETED', 'CANCELLED'].includes(currentRun?.status)
  for (const id of ['export-json','export-bundle']) $(`#${id}`).classList.toggle('disabled', !exportable)
  $('#export-json').href = exportable ? `/api/runs/${encodeURIComponent(currentRun.id)}/export/json` : '#'
  $('#export-bundle').href = exportable ? `/api/runs/${encodeURIComponent(currentRun.id)}/export/bundle` : '#'
  renderProviders(providers, preset); renderTasks(tasks, preset); renderPhotos(photos, tasks, inferences, reviews); renderQuickGroundTruth(photos, tasks, labVqa ? [] : inferences, reviews, preset); renderSemanticResults(photos, tasks, labVqa ? [] : inferences, reviews, preset)
  renderBenchmarkConfirmation(photos, tasks, currentRun, preset)
  const semanticMode = ['semantic', 'minimal-semantic'].includes(preset?.mode)
  renderMetrics(semanticMode || labVqa ? [] : evaluation.metrics); renderFailures(semanticMode || labVqa ? [] : evaluation.failures); renderWarnings(currentRun?.warnings || evaluation.warnings || [])
  renderPreviousRuns(previousRuns); renderArchive(archivedPhotos)
  $('#empty-state').classList.toggle('hidden', photos.length > 0)
  $('#selection-count').textContent = `${state.selectedPhotos.size} selected in current run`
  $('#archive-section').classList.toggle('hidden', !state.showArchive)
  const reviewable = inferences.length
  $('#ground-truth-banner').classList.toggle('hidden', !reviewable)
  $('#ground-truth-progress').textContent = `${reviews.length} / ${reviewable} reviewed`
  $('#ground-truth-shortcut').classList.toggle('hidden', !reviewable)
  $('#ground-truth-shortcut').textContent = `Review Results (${reviews.length}/${reviewable})`
  $('#show-archive').textContent = `View old photos (${archivedPhotos.length})`
  $('#start-new-run').disabled = currentRun?.status === 'RUNNING'
  $('#analyze-button').disabled = state.busy || currentRun?.status !== 'DRAFT' || !state.selectedPhotos.size || !state.selectedTasks.size || !provider.ready
  $('#cancel-run').classList.toggle('hidden', currentRun?.status !== 'RUNNING')
  if (!provider.ready && !state.busy) $('#run-status').textContent = provider.reason
  renderBrain(currentRun)
  renderDogBenchmark()
  applyExperimentRoute()
}

function configureExperimentRoute() {
  if (!['02','03','04','05'].includes(experimentRoute)) return
  if (experimentRoute === '05') { state.arenaOpen = true; state.arenaTab = 'quick'; return }
  state.arenaOpen = false
  const experimentId = Object.keys(experimentRouteById).find(id => experimentRouteById[id] === experimentRoute)
  const preset = state.data.vqaPresets.find(item => item.experimentId === experimentId)
  if (!preset) return
  state.vqaPresetId = preset.id
  state.vqaDatasetId = ({ screenshot: 'screenshot_real_v1', document_chart: 'document_chart_real_v1' })[preset.datasetCategory] || 'pet_photos_real_v1'
  state.vqaProviderIds = new Set(preset.defaultProviderIds)
}

function applyExperimentRoute() {
  const show = (selector, visible) => document.querySelector(selector)?.classList.toggle('hidden', !visible)
  show('#experiments', !experimentRoute)
  show('#showcase', experimentRoute === '06')
  show('#vqa-workbench', ['02','03','04','05'].includes(experimentRoute))
  show('.hero', experimentRoute === '01')
  show('#photos', experimentRoute === '01')
  show('#evaluation', experimentRoute === '01')
  for (const link of document.querySelectorAll('.primary-nav a,.experiment-page-menu a')) {
    const target = link.getAttribute('href')?.match(/\/experiments\/(0[1-6])\//)?.[1] || null
    const active = experimentRoute ? target === experimentRoute : link.getAttribute('href') === '/'
    link.classList.toggle('active', active)
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current')
  }
  const fallbackTitles = { '01': 'PawVault', '02': 'Visual Q&A', '03': 'Screenshot Understanding', '04': 'Documents & Charts', '05': 'Small Vision Model Arena', '06': 'VisionPsy Live Showcase' }
  const title = experimentRoute ? state.data?.experiments?.find(item => experimentRouteById[item.id] === experimentRoute)?.subtitle || fallbackTitles[experimentRoute] : 'QVAC Vision Lab'
  document.title = `${experimentRoute ? `Experiment ${experimentRoute} · ` : ''}${title || 'QVAC Vision Lab'} · QVAC Vision Lab`
}

function renderBenchmarkConfirmation(photos, tasks, run, preset) {
  const panel = $('#benchmark-confirmation')
  panel.classList.toggle('hidden', preset?.id !== 'focused_base_v1')
  const semanticPanel = $('#semantic-confirmation')
  semanticPanel.classList.toggle('hidden', preset?.id !== 'semantic_extraction_v1')
  const minimalPanel = $('#minimal-semantic-confirmation')
  minimalPanel.classList.toggle('hidden', preset?.id !== 'minimal_smart_semantic_v2')
  const ready = photos.filter(photo => photo.imagePipeline?.ready).length
  const failed = photos.length - ready
  $('#import-summary').classList.toggle('hidden', !photos.length)
  $('#import-summary').innerHTML = photos.length ? `<b>${ready} photos ready</b><span>${ready} inference-ready</span><span class="${failed ? 'failure' : ''}">${failed} preprocessing failure${failed === 1 ? '' : 's'}</span>${failed ? '<a href="#photo-grid">Review failures</a>' : ''}` : ''
  if (!preset) return
  if (preset.id === 'minimal_smart_semantic_v2') {
    const quickIds = run?.minimalQuickPhotoIds || []
    const selected = quickIds.map(id => photos.find(photo => photo.id === id)).filter(Boolean)
    const readyCount = selected.filter(photo => photo.imagePipeline?.ready).length
    $('#minimal-photo-count').textContent = `${selected.length} selected · ${readyCount} ready`
    $('#minimal-predictions').textContent = String(readyCount * preset.coreTaskIds.length)
    $('#minimal-photo-strip').innerHTML = selected.map((photo, index) => `<article class="minimal-photo-chip"><img src="${photo.imageUrl}" alt="${escapeHtml(photo.filename)}"><span>${index + 1}. ${escapeHtml(photo.filename)}</span></article>`).join('') || '<div class="blank">The deterministic subset will appear when photos are available.</div>'
    $('#minimal-prompt-list').innerHTML = preset.coreTaskIds.map(id => { const task = tasks.find(item => item.id === id); return `<article class="minimal-prompt"><b>${escapeHtml(task?.name || id)}</b><pre>${escapeHtml(task?.prompt || '')}</pre></article>` }).join('')
    $('#start-minimal-semantic').disabled = state.busy || run?.status !== 'DRAFT' || selected.length !== 10 || readyCount !== 10 || state.selectedProviderId !== preset.providerId
    return
  }
  if (preset.id === 'semantic_extraction_v1') {
    const quickIds = run?.semanticQuickPhotoIds || []
    const scopedIds = state.benchmarkScope === 'quick' ? quickIds : photos.map(photo => photo.id)
    const readyCount = scopedIds.filter(id => photos.find(photo => photo.id === id)?.imagePipeline?.ready).length
    $('#semantic-photo-count').textContent = `${readyCount} selected`
    $('#semantic-predictions').textContent = String(readyCount * preset.coreTaskIds.length)
    $('#semantic-full-label').textContent = `All ${photos.length} current photos`
    $('#semantic-photo-ids').textContent = quickIds.join('\n') || 'Quick subset will be selected when photos are available.'
    for (const input of document.querySelectorAll('[name="semantic-scope"]')) input.checked = input.value === state.benchmarkScope
    $('#start-semantic-benchmark').disabled = state.busy || run?.status !== 'DRAFT' || !readyCount || state.selectedProviderId !== preset.providerId
    return
  }
  const selectedTasks = [...preset.coreTaskIds, ...(state.selectedTasks.has(preset.experimentalTaskIds[0]) ? preset.experimentalTaskIds : [])]
  const scopedPhotos = scopePhotoIds(photos.map(photo => photo.id), state.benchmarkScope, preset.quickLimit)
  const scopedReady = scopedPhotos.filter(id => photos.find(photo => photo.id === id)?.imagePipeline?.ready).length
  const predictions = scopedReady * selectedTasks.length
  $('#benchmark-photo-ready').textContent = `${scopedReady} ready${state.benchmarkScope === 'quick' && photos.length > 10 ? ` of ${photos.length}` : ''}`
  $('#benchmark-task-count').textContent = `${selectedTasks.length} active`
  $('#benchmark-predictions').textContent = String(predictions)
  $('#benchmark-core-tasks').innerHTML = preset.coreTaskIds.map(id => `<li>✓ ${escapeHtml(shortTaskName(tasks.find(task => task.id === id)?.name))}</li>`).join('')
  $('#benchmark-experimental').checked = state.selectedTasks.has(preset.experimentalTaskIds[0])
  $('#full-scope-label').textContent = `All ${photos.length} current photos`
  for (const input of document.querySelectorAll('[name="benchmark-scope"]')) input.checked = input.value === state.benchmarkScope
  const estimate = benchmarkCardState({ photos: scopedPhotos.filter(id => photos.find(photo => photo.id === id)?.imagePipeline?.ready), tasks, preset: { ...preset, coreTaskIds: selectedTasks }, scope: 'full', timing: state.data.benchmarkTiming }).duration
  $('#benchmark-estimate').textContent = estimate ? `Estimated duration: ~${durationMinutes(estimate.minMs)}–${durationMinutes(estimate.maxMs)} minutes (approximate, based on ${state.data.benchmarkTiming.sampleCount} historical predictions).` : 'Estimated duration unavailable until more runs are completed.'
  $('#start-benchmark').disabled = state.busy || run?.status !== 'DRAFT' || !scopedReady || state.selectedProviderId !== preset.providerId
  const quickSuccess = run?.status === 'COMPLETED' && run.runScope === 'quick' && !run.failedPredictions && !run.imagePipelineFailures
  $('#quick-success').classList.toggle('hidden', !quickSuccess)
  $('#start-full-after-quick').classList.toggle('hidden', !quickSuccess)
  $('#start-benchmark').classList.toggle('hidden', run?.status !== 'DRAFT')
  $('#preset-provider-warning').classList.toggle('hidden', state.selectedProviderId === preset.providerId)
}

function renderDogBenchmark() {
  if (!dogBenchmark) return
  $('#benchmark-progress').textContent = `${dogBenchmark.confirmed}/${dogBenchmark.total}`
  $('#benchmark-metrics').innerHTML = dogBenchmark.experiments.map(metric => `<article><b>${metric.provider} + ${metric.variant.replaceAll('_',' ')}</b><span>Reviewed ${metric.reviewed}/${dogBenchmark.total}</span><span>One-dog ${percent(metric.oneDogAccuracy)}</span><span>Multiple-dog ${percent(metric.multipleDogAccuracy)}</span><span>Overall ${percent(metric.overallAccuracy)}</span><span>Unclear ${percent(metric.unclearRate)}</span><span>Invalid ${percent(metric.invalidRate)}</span></article>`).join('') || '<div class="blank">Benchmark artifacts not available yet.</div>'
}

function renderProviders(providers, preset) {
  $('#provider-list').innerHTML = providers.map(provider => `<label class="provider-option"><input type="radio" name="provider" value="${provider.id}" data-provider-id="${provider.id}" ${provider.id === state.selectedProviderId ? 'checked' : ''}><span><b>${escapeHtml(provider.name)}</b><small class="${provider.ready ? provider.kind === 'DEVELOPMENT' ? 'development' : 'ready' : 'blocked'}">${escapeHtml(provider.label)}${provider.reason ? ` — ${escapeHtml(provider.reason)}` : ''}${preset && provider.id === preset.providerId ? ' — preset default' : ''}</small></span></label>`).join('')
}

function renderTasks(tasks, preset) {
  const visible = preset ? tasks.filter(task => [...preset.coreTaskIds, ...preset.experimentalTaskIds].includes(task.id)) : tasks
  $('#task-list').innerHTML = visible.map(task => { const experimental = preset?.experimentalTaskIds.includes(task.id); return `<div class="task-row"><input id="task-${task.id}" type="checkbox" data-task-check="${task.id}" ${state.selectedTasks.has(task.id) ? 'checked' : ''}><label for="task-${task.id}"><b>${escapeHtml(task.name)}</b><small>${task.labels.join(' · ')}${experimental ? ' · off by default' : ''}</small></label>${preset ? `<span class="task-preset-kind">${experimental ? 'EXPERIMENTAL' : 'CORE'}</span>` : `<select class="task-status" data-task-status="${task.id}" data-status="${task.status}">${['CORE_CANDIDATE','EXPERIMENTAL','REJECTED'].map(value => `<option value="${value}" ${value === task.status ? 'selected' : ''}>${value.replace('_',' ')}</option>`).join('')}</select>`}</div>` }).join('')
}

function renderPhotos(photos, tasks, inferences, reviews) {
  $('#photo-grid').classList.toggle('ground-truth-mode', Boolean(inferences.length))
  const reviewMap = new Map(reviews.map(item => [item.inferenceId, item]))
  $('#photo-grid').innerHTML = photos.map(photo => {
    const results = inferences.filter(item => item.photoId === photo.id)
    const tags = results.map(result => { const review = reviewMap.get(result.id); const resultLabel = result.errorCode || result.normalizedOutput || 'invalid output'; return `<button class="tag ${result.validationResult !== 'VALID' ? 'invalid' : ''} ${review ? 'reviewed' : ''}" data-open-inference="${result.id}">${escapeHtml(result.task)} · ${escapeHtml(resultLabel)}${review ? ` · ${review.verdict[0]}` : ''}</button>` }).join('')
    const ready = photo.imagePipeline?.ready
    const visual = ready ? `<img class="photo-image" src="${photo.imageUrl}" alt="${escapeHtml(photo.filename)}" loading="lazy">` : `<div class="photo-image preview-failed"><b>⚠ Image preview failed</b><span>${escapeHtml(photo.filename)}</span><small>Decode status: FAILED<br>VisionPsy will not be called</small></div>`
    const stages = photo.imagePipeline?.pipeline || {}
    return `<article class="photo-card ${state.selectedPhotos.has(photo.id) ? 'selected' : ''} ${ready ? '' : 'pipeline-failed'}"><input class="photo-select" type="checkbox" aria-label="Select ${escapeHtml(photo.filename)}" data-photo-check="${photo.id}" ${state.selectedPhotos.has(photo.id) ? 'checked' : ''}>${visual}<div class="photo-body"><div class="filename">${escapeHtml(photo.filename)}</div><div class="meta-line">${formatDate(photo.exifCaptureDate || photo.browserLastModified)}${photo.exifGps ? ' · GPS available' : ''}</div><details class="image-diagnostic"><summary>IMAGE · ${ready ? '✓ inference-ready' : '✗ inference skipped'}</summary><div>${stageLine('read', stages.fileRead)}${stageLine('decode', stages.imageDecode)}${stageLine('normalized', stages.normalizedDecode)}${stageLine('preview', stages.preview)}${ready ? `Detected: ${escapeHtml(photo.detectedFormat)} · ${photo.width}×${photo.height}` : `<b>${escapeHtml(photo.imagePipeline?.errorCode || 'IMAGE_DECODE_FAILED')}</b><br>${escapeHtml(photo.imagePipeline?.error || '')}`}</div></details><div class="photo-fields"><select data-identity="${photo.id}">${state.data.identities.map(value => `<option ${photo.petIdentity === value ? 'selected' : ''}>${value}</option>`).join('')}</select><input data-location="${photo.id}" value="${escapeAttr(photo.manualLocation || '')}" placeholder="Manual location"></div><div class="tags">${tags || `<span class="meta-line">${ready ? 'Not analyzed in this run' : 'Image preprocessing failed · VisionPsy was not called'}</span>`}</div></div>${results.map(result => reviewDrawer(result, tasks.find(task => task.id === result.taskId), reviewMap.get(result.id))).join('')}</article>`
  }).join('')
}

function renderQuickGroundTruth(photos, tasks, inferences, reviews, preset) {
  const panel = $('#quick-ground-truth')
  const semanticMode = ['semantic', 'minimal-semantic'].includes(preset?.mode)
  panel.classList.toggle('hidden', !inferences.length || semanticMode)
  if (!inferences.length || semanticMode) return
  const taskIds = currentTaskIds(preset).filter(id => inferences.some(item => item.taskId === id))
  if (!taskIds.includes(state.quickTruthTaskId)) state.quickTruthTaskId = taskIds[0]
  const task = tasks.find(item => item.id === state.quickTruthTaskId)
  const reviewMap = new Map(reviews.map(item => [item.inferenceId, item]))
  const allRows = photos.map(photo => ({ photo, inference: [...inferences].reverse().find(item => item.photoId === photo.id && item.taskId === task?.id) })).filter(item => item.inference)
  const labels = [...new Set(allRows.map(({ inference }) => inference.normalizedOutput || 'invalid output'))]
  $('#quick-truth-status').value = state.quickTruthStatus
  $('#quick-truth-label').innerHTML = `<option value="all">All labels</option>${labels.map(label => `<option value="${escapeAttr(label)}" ${state.quickTruthLabel === label ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}`
  if (state.quickTruthLabel !== 'all' && !labels.includes(state.quickTruthLabel)) state.quickTruthLabel = 'all'
  const rows = allRows.filter(({ inference }) => {
    const review = reviewMap.get(inference.id)
    const statusMatch = state.quickTruthStatus === 'all' || !review || review.verdict === 'WRONG'
    const labelMatch = state.quickTruthLabel === 'all' || (inference.normalizedOutput || 'invalid output') === state.quickTruthLabel
    return statusMatch && labelMatch
  })
  const reviewed = allRows.filter(({ inference }) => reviewMap.has(inference.id)).length
  $('#quick-truth-progress').textContent = `${reviewed}/${allRows.length}`
  $('#quick-truth-tabs').innerHTML = taskIds.map(id => { const item = tasks.find(task => task.id === id); const count = inferences.filter(inference => inference.taskId === id && reviewMap.has(inference.id)).length; const total = inferences.filter(inference => inference.taskId === id).length; return `<button class="${id === state.quickTruthTaskId ? 'active' : ''}" data-quick-task="${id}">${escapeHtml(item.name)} <span>${count}/${total}</span></button>` }).join('')
  $('#quick-truth-grid').innerHTML = rows.map(({ photo, inference }) => { const review = reviewMap.get(inference.id); const selected = review?.correctLabel; const predicted = inference.errorCode || inference.normalizedOutput || 'invalid output'; return `<article class="quick-truth-row ${review ? 'reviewed' : ''}"><img src="${photo.imageUrl}" alt="${escapeHtml(photo.filename)}" loading="lazy"><div><b>${escapeHtml(photo.filename)}</b><small>Model: ${escapeHtml(predicted)}</small></div><div class="quick-labels">${task.labels.map(label => `<button class="${selected === label ? 'selected' : ''}" data-quick-truth="${inference.id}|${escapeAttr(label)}">${escapeHtml(label)}</button>`).join('')}</div></article>` }).join('') || '<div class="blank">No results match these filters.</div>'
}

function renderSemanticResults(photos, tasks, inferences, reviews, preset) {
  const panel = $('#semantic-results')
  const semantic = ['semantic', 'minimal-semantic'].includes(preset?.mode) && inferences.length
  const minimal = preset?.mode === 'minimal-semantic'
  panel.classList.toggle('hidden', !semantic)
  if (!semantic) return
  const reviewMap = new Map(reviews.map(review => [review.inferenceId, review]))
  $('#semantic-review-eyebrow').textContent = minimal ? 'MINIMAL SMART SEMANTIC REVIEW' : 'QUICK SEMANTIC REVIEW'
  $('#semantic-review-title').textContent = minimal ? 'Essential visual descriptions' : 'Semantic fingerprint quality'
  $('#semantic-review-progress').textContent = `${inferences.filter(item => reviewMap.has(item.id)).length}/${inferences.length}`
  const semanticEvaluation = state.data.semanticEvaluation || { metrics: [], useful: [], failures: [], comparison: [], issues: [] }
  const issuesByInference = Map.groupBy(semanticEvaluation.issues || [], issue => issue.inferenceId)
  $('#semantic-metrics').innerHTML = semanticEvaluation.metrics.map(metric => `<article class="metric-card"><h3>${escapeHtml(metric.taskName)}</h3><div class="metric-score">${percent(metric.usefulRate)} <small>useful rate</small></div><div class="metric-details">${minimal ? '' : `<span>Strict correctness<b>${percent(metric.strictCorrectness)}</b></span>`}<span>Correct<b>${metric.correct}</b></span><span>Partial<b>${metric.partially_correct}</b></span><span>Wrong<b>${metric.wrong}</b></span><span>Hallucinated<b>${metric.hallucinated}</b></span><span>Hallucination rate<b>${percent(metric.hallucinationRate)}</b></span><span>Unclear image<b>${metric.unclear_image}</b></span><span>Invalid output<b>${metric.invalid_output}</b></span></div></article>`).join('')
  const issuePanel = $('#minimal-diagnostic-issues')
  issuePanel.classList.toggle('hidden', !minimal || !semanticEvaluation.issues?.length)
  issuePanel.innerHTML = minimal ? [...new Map((semanticEvaluation.issues || []).map(issue => [`${issue.code}:${issue.message}`, issue])).values()].map(issue => `<div class="diagnostic-warning"><b>${escapeHtml(issue.code.replaceAll('_', ' '))}</b><br>${escapeHtml(issue.message)}</div>`).join('') : ''
  $('#semantic-review-grid').innerHTML = photos.map(photo => {
    const rows = inferences.filter(item => item.photoId === photo.id)
    if (!rows.length) return ''
    return `<article class="semantic-card"><img src="${photo.imageUrl}" alt="${escapeHtml(photo.filename)}"><div><h3>${escapeHtml(photo.filename)}</h3>${rows.map(row => semanticReviewRow(row, reviewMap.get(row.id), issuesByInference.get(row.id) || [], minimal)).join('')}</div></article>`
  }).join('')
  const smallRow = row => `<div class="semantic-small"><b>${escapeHtml(row.inference.task)}</b><span>${escapeHtml(row.inference.normalizedOutput || row.inference.errorCode || 'invalid')}</span><small>${escapeHtml(row.review.verdict)}</small></div>`
  $('#semantic-useful').innerHTML = semanticEvaluation.useful.slice(0, 20).map(smallRow).join('') || '<div class="blank">Review outputs to populate this view.</div>'
  $('#semantic-failures').innerHTML = semanticEvaluation.failures.slice(0, 20).map(smallRow).join('') || '<div class="blank">No reviewed hallucinations or failures.</div>'
  $('#semantic-token-rules').innerHTML = state.data.semanticSearchTokenRules.map(rule => `<code>${escapeHtml(rule.source)} → ${escapeHtml(rule.token)}</code>`).join('')
  $('#semantic-comparison').innerHTML = semanticEvaluation.comparison.slice(0, 60).map(row => `<div class="semantic-small"><b>${escapeHtml(row.oldTaskId)} → ${escapeHtml(row.oldOutput)}</b><span>${escapeHtml(row.semanticTaskId)} → ${escapeHtml(row.semanticOutput)}</span><small>token: ${escapeHtml(row.searchToken)}</small></div>`).join('') || '<div class="blank">No overlapping previous results.</div>'
  $('#semantic-token-rules').closest('details').classList.toggle('hidden', minimal)
  $('#semantic-comparison').closest('details').classList.toggle('hidden', minimal)
}

function semanticReviewRow(inference, review, issues = [], minimal = false) {
  const values = ['CORRECT', 'PARTIALLY_CORRECT', 'WRONG', 'HALLUCINATED', 'UNCLEAR_IMAGE']
  const correction = !minimal && inference.taskId === 'associated_objects' ? `<input data-semantic-correction="${inference.id}" value="${escapeAttr(review?.correctedText || '')}" placeholder="Optional corrected objects, comma separated">` : ''
  const humanNote = minimal ? `<textarea data-human-note="${inference.id}" placeholder="Human note (optional)">${escapeHtml(review?.humanNote || '')}</textarea>` : ''
  const flags = issues.length ? `<div class="semantic-issues">${issues.map(issue => `<span class="semantic-issue" title="${escapeAttr(issue.message)}">${escapeHtml(issue.code.replaceAll('_', ' '))}</span>`).join('')}</div>` : ''
  return `<div class="semantic-output"><b>${escapeHtml(inference.task)}</b><p>VisionPsy: <strong>${escapeHtml(inference.normalizedOutput || inference.errorCode || 'invalid output')}</strong></p><small>Raw: ${escapeHtml(inference.rawOutput || '—')}${minimal ? '' : ` · Search token: ${escapeHtml(inference.searchToken || 'unknown')}`}</small>${flags}${correction}${humanNote}<div class="semantic-verdicts">${values.map(value => `<button class="${review?.verdict === value ? 'selected' : ''}" data-semantic-review="${inference.id}:${value}">${value.replaceAll('_',' ')}</button>`).join('')}</div></div>`
}

function reviewOrigin(review) { return review?.groundTruthSource === 'AI_ASSISTED' ? 'AI-assisted visual review' : 'Human confirmed' }

function groundTruthRow(result, task, review) {
  const current = review?.correctLabel || ''
  const predicted = result.errorCode || result.normalizedOutput || 'invalid output'
  return `<div class="truth-row ${review ? 'confirmed' : ''}"><div><b>${escapeHtml(result.task)}</b><small>Model: ${escapeHtml(predicted)}${review ? ` · ${reviewOrigin(review)}` : ''}</small></div><select aria-label="Correct label for ${escapeAttr(result.task)}" data-ground-truth-select="${result.id}"><option value="">Choose correct label…</option>${task.labels.map(label => `<option value="${escapeAttr(label)}" ${current === label ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select><button data-save-ground-truth="${result.id}" ${current ? '' : 'disabled'}>${review ? 'Update' : 'Save'}</button></div>`
}

function reviewDrawer(result, task, review) {
  const labels = task?.labels || []
  return `<div class="review-drawer ${state.openInference === result.id ? '' : 'hidden'}"><p>${escapeHtml(result.task)} · <span class="raw-output">raw: ${escapeHtml(result.rawOutput || result.error || 'empty')}</span><br>normalized: ${escapeHtml(result.normalizedOutput || 'invalid')}</p><span class="provenance">Provider: ${escapeHtml(result.providerId)}<br>Runtime: ${escapeHtml(result.runtime)} ${escapeHtml(result.runtimeVersion)}<br>Model: ${escapeHtml(result.model)}<br>Prompt: ${escapeHtml(result.promptVersion)} · Latency: ${result.latencyMs ?? '—'} ms · Run: ${escapeHtml(result.runId)}</span>${review ? `<p>${reviewOrigin(review)}: <b>${review.verdict}</b>${review.correctLabel ? ` · truth: ${escapeHtml(review.correctLabel)}` : ''}</p>` : labels.length ? `<div class="review-actions"><button data-review="${result.id}:CORRECT">✓ Correct</button><button data-wrong-toggle="${result.id}">✕ Wrong</button><button data-review="${result.id}:AMBIGUOUS">? Ambiguous</button></div><div class="review-correct hidden" data-wrong="${result.id}"><select class="review-select">${labels.map(label => `<option>${label}</option>`).join('')}</select><button data-save-wrong="${result.id}">Save truth</button></div>` : '<p>Use the Visual Q&amp;A review panel above.</p>'}</div>`
}

function renderLab() {
  const { experiments = [], datasets = [], vqaPresets = [], providers = [], currentRun, vqaEvaluation } = state.data
  $('#experiment-grid').innerHTML = experiments.map(item => `<article class="experiment-card"><div><span class="experiment-status ${item.status.toLowerCase()}">${escapeHtml(item.status)} · ${escapeHtml(item.statusDetail)}</span><p class="eyebrow">${escapeHtml(item.number)}</p><h2>${escapeHtml(item.subtitle)}</h2><p>${escapeHtml(item.description)}</p></div><a class="secondary" href="/experiments/${experimentRouteById[item.id]}/">${item.id === 'experiment_01_pawvault' ? 'Open preserved workspace' : item.id === 'experiment_05_arena' ? 'Open model arena' : item.id === 'experiment_06_showcase' ? 'Open live showcase' : 'Open quick test'}</a></article>`).join('')
  $('#vqa-dataset').innerHTML = datasets.map(item => `<option value="${escapeAttr(item.id)}" ${state.vqaDatasetId === item.id ? 'selected' : ''}>${escapeHtml(item.name)} · ${item.imageCount} images</option>`).join('')
  $('#dataset-grid').innerHTML = datasets.map(item => `<article class="dataset-card"><b>${escapeHtml(item.name)}</b><span>${item.imageCount} images · ${escapeHtml(item.category)}</span><span>Source: ${escapeHtml(item.source)}</span><span>Ground truth: ${escapeHtml(item.groundTruthStatus)}</span><span>Used by: ${escapeHtml(item.experimentUsage.join(', '))}</span></article>`).join('')
  const vqaPreset = vqaPresets.find(item => item.id === state.vqaPresetId) || vqaPresets[0]
  const experiment = experiments.find(item => item.id === vqaPreset?.experimentId)
  $('#vqa-experiment-number').textContent = state.arenaOpen ? 'EXPERIMENT 05' : experiment?.number || 'EXPERIMENT'
  $('#vqa-title').textContent = state.arenaOpen ? 'Test rapido tra 3 modelli' : experiment?.subtitle || 'Visual Q&A'
  $('#vqa-description').textContent = state.arenaOpen ? 'Scegli quante domande usare, avvia il test e segui l’avanzamento fino alla valutazione finale.' : experiment?.description || ''
  $('#blind-arena').classList.toggle('hidden', !state.arenaOpen)
  $('#legacy-vqa').classList.toggle('hidden', state.arenaOpen)
  if (state.arenaOpen) renderArena(datasets, providers)
  const selected = state.vqaPhotoIds
  const dataset = datasets.find(item => item.id === state.vqaDatasetId)
  const availablePhotos = (state.data.labPhotos || state.data.photos).filter(photo => dataset?.photoIds.includes(photo.id))
  $('#vqa-photo-picker').innerHTML = availablePhotos.map(photo => `<label class="vqa-photo-option ${selected.has(photo.id) ? 'selected' : ''}" title="${escapeAttr(photo.filename)}"><img src="${photo.imageUrl}" alt="${escapeAttr(photo.filename)}"><input type="checkbox" data-vqa-photo="${photo.id}" ${selected.has(photo.id) ? 'checked' : ''}></label>`).join('') || '<div class="blank">Add local images to this dataset.</div>'
  const selectableProviders = providers.filter(item => ['visionpsy-patched-base','qvac-smolvlm2'].includes(item.id))
  $('#vqa-provider-picker').innerHTML = selectableProviders.map(item => `<label class="vqa-provider-option"><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.model)} · ${item.ready ? 'ready' : item.reason}</small></span><input type="${vqaPreset?.comparison ? 'checkbox' : 'radio'}" name="vqa-provider" data-vqa-provider="${item.id}" ${state.vqaProviderIds.has(item.id) ? 'checked' : ''} ${item.ready ? '' : 'disabled'}></label>`).join('')
  $('#vqa-question-list').innerHTML = [...selected].map(id => { const photo = (state.data.labPhotos || state.data.photos).find(item => item.id === id); return photo ? `<article class="vqa-question"><img src="${photo.imageUrl}" alt="${escapeAttr(photo.filename)}"><label><b>${escapeHtml(photo.filename)}</b><textarea data-vqa-question="${photo.id}" maxlength="500" placeholder="Write one precise question about this image">${escapeHtml(state.vqaQuestions[photo.id] || '')}</textarea></label></article>` : '' }).join('') || '<div class="blank">Select up to 10 images. Questions are never generated automatically.</div>'
  const questionsReady = selected.size > 0 && [...selected].every(id => String(state.vqaQuestions[id] || '').trim())
  $('#create-vqa-run').disabled = !questionsReady || !state.vqaProviderIds.size || currentRun?.status === 'RUNNING'
  const isVqa = vqaPresets.some(item => item.id === currentRun?.benchmarkPreset)
  $('#start-vqa-run').classList.toggle('hidden', state.arenaOpen || !isVqa || currentRun?.status !== 'DRAFT')
  $('#cancel-vqa-run').classList.toggle('hidden', state.arenaOpen || !isVqa || currentRun?.status !== 'RUNNING')
  $('#vqa-results').classList.toggle('hidden', !isVqa || !vqaEvaluation)
  renderEvidenceGallery(experiments, providers)
  if (!isVqa || !vqaEvaluation) return
  $('#shareable-finding').value = currentRun.shareableFinding || ''
  $('#vqa-metrics').innerHTML = vqaEvaluation.metrics.map(metric => `<article class="metric-card"><h3>${escapeHtml(metric.providerId)}</h3><div class="metric-score">${metric.reviewed}<small> reviewed / ${metric.samples} answers</small></div><div class="metric-details"><span>Correct<b>${metric.correct}</b></span><span>Partial<b>${metric.partiallyCorrect}</b></span><span>Wrong<b>${metric.wrong}</b></span><span>Hallucinated<b>${metric.hallucinated}</b></span><span>Invalid<b>${metric.invalid}</b></span><span>Avg latency<b>${metric.averageLatencyMs == null ? '—' : metric.averageLatencyMs + ' ms'}</b></span></div><p class="screening-note">${escapeHtml(metric.rankingNote || 'Minimum review threshold reached.')}</p></article>`).join('')
  $('#vqa-result-list').innerHTML = vqaEvaluation.rows.map(row => `<article class="vqa-result-card"><img src="${row.photo.imageUrl}" alt="${escapeAttr(row.photo.filename)}"><div><p class="eyebrow">${escapeHtml(row.photo.filename)}</p><h3>${escapeHtml(row.question.text)}</h3><div class="vqa-answers">${row.answers.map(({ inference, review, featured }) => `<section class="vqa-answer"><b>${escapeHtml(inference.providerId)}</b><p>${escapeHtml(inference.rawOutput || inference.errorCode || 'No output')}</p><small>${inference.latencyMs ?? '—'} ms · ${escapeHtml(inference.runtime)} · ${escapeHtml(inference.model)}</small><input class="vqa-note" data-vqa-note="${inference.id}" value="${escapeAttr(review?.humanNote || '')}" placeholder="Human note (optional)"><div class="vqa-verdicts">${['CORRECT','PARTIALLY_CORRECT','WRONG','HALLUCINATED','UNCLEAR_IMAGE'].map(value => `<button class="${review?.verdict === value ? 'selected' : ''}" data-vqa-review="${inference.id}:${value}">${value.replaceAll('_',' ')}</button>`).join('')}</div><label><input type="checkbox" data-vqa-featured="${inference.id}" ${featured ? 'checked' : ''}> Featured example</label></section>`).join('')}</div></div></article>`).join('')
}

function renderArena(datasets, providers) {
  const arena = state.data.arena || {}; const round = arena.currentRound
  $('#arena-live').classList.toggle('hidden', state.arenaTab !== 'live'); $('#arena-quick').classList.toggle('hidden', state.arenaTab !== 'quick'); $('#arena-batch').classList.toggle('hidden', state.arenaTab !== 'batch'); for (const button of document.querySelectorAll('.arena-tabs [data-arena-tab]')) button.classList.toggle('selected', button.dataset.arenaTab === state.arenaTab)
  $('.arena-readiness').classList.toggle('hidden', state.arenaTab === 'quick')
  $('.arena-dashboard').classList.toggle('hidden', state.arenaTab === 'quick')
  const dataset = datasets.find(item => item.id === state.arenaDatasetId) || datasets[0]
  if (!datasets.some(item => item.id === state.arenaDatasetId)) state.arenaDatasetId = dataset?.id || ''
  const photos = (state.data.labPhotos || []).filter(photo => dataset?.photoIds.includes(photo.id))
  if (state.arenaPhotoId && !photos.some(item => item.id === state.arenaPhotoId)) state.arenaPhotoId = null
  $('#arena-dataset').innerHTML = datasets.map(item => `<option value="${escapeAttr(item.id)}" ${item.id === state.arenaDatasetId ? 'selected' : ''}>${escapeHtml(item.name)} · ${item.imageCount} images</option>`).join('')
  $('#arena-photo-picker').innerHTML = photos.map(photo => `<button class="arena-photo-option ${state.arenaPhotoId === photo.id ? 'selected' : ''}" data-arena-photo="${photo.id}" title="${escapeAttr(photo.filename)}"><img src="${photo.imageUrl}" alt="${escapeAttr(photo.filename)}"></button>`).join('') || '<div class="blank">Add real images to this dataset first.</div>'
  $('#arena-category').innerHTML = (arena.categories || []).map(value => `<option value="${value}">${escapeHtml(value.replaceAll('_',' '))}</option>`).join('')
  const names = { 'visionpsy-patched-base': 'VisionPsy-Nano-460M', 'lfm2.5-vl-450m': 'LFM2.5-VL-450M', 'qvac-smolvlm2': 'SmolVLM2-500M', 'visionpsy-patched': 'VisionPsy-Nano-460M-Flash · secondary control' }
  $('#arena-provider-picker').innerHTML = (arena.providerIds || []).map(id => { const provider = providers.find(item => item.id === id); return `<label class="arena-provider-option"><span><b>${escapeHtml(names[id] || id)}</b><small>${provider?.ready ? `${escapeHtml(provider.model)} · ready` : escapeHtml(provider?.reason || 'not ready')}</small></span><input type="checkbox" data-arena-provider="${id}" ${state.arenaProviderIds.has(id) ? 'checked' : ''} ${provider?.ready ? '' : 'disabled'}></label>` }).join('')
  const question = $('#arena-question')?.value.trim() || ''
  $('#arena-create').disabled = !state.arenaPhotoId || !question || state.arenaProviderIds.size < 2 || state.data.currentRun?.status === 'RUNNING'
  $('#arena-empty').classList.toggle('hidden', Boolean(round)); $('#arena-round').classList.toggle('hidden', !round)
  $('#arena-run').classList.toggle('hidden', round?.status !== 'DRAFT')
  $('#arena-cancel').classList.toggle('hidden', round?.status !== 'RUNNING')
  if (round) {
    const revealed = round.status === 'REVEALED'
    const answerCards = round.answers.map(answer => { const latest = [...answer.judgments].reverse().find(item => ['USER_JUDGE','BLIND_HUMAN_JUDGE'].includes(item.judgeProviderId)) || answer.judgments.at(-1); const identity = revealed ? `<small>${escapeHtml(answer.providerId)} · ${escapeHtml(answer.model || 'unknown model')} · ${answer.latencyMs ?? '—'} ms</small>` : '<small>Identity, runtime and latency hidden</small>'; const debug = revealed ? `<details class="arena-debug"><summary>Advanced · Arena Debug</summary><pre>${escapeHtml(JSON.stringify({ sourceImageId: round.imageId, commonNormalizedImage: round.inferenceImage, semanticQuestion: round.question, formattedRuntimePrompt: answer.formattedRuntimePrompt, modelLockId: answer.modelLockId, modelLockHash: answer.modelLockHash, providerId: answer.providerId, runtime: answer.runtime, runtimeVersion: answer.runtimeVersion, model: answer.model, modelVersion: answer.modelVersion, projection: answer.projection, rawOutput: answer.rawOutput, parsedOutput: answer.normalizedOutput, latencyMs: answer.latencyMs, runtimeStats: answer.runtimeStats, executionIndex: answer.executionIndex, executionOrder: round.executionOrder, errorCode: answer.errorCode, error: answer.error, judgeResult: latest || null }, null, 2))}</pre></details>` : ''; return `<section class="arena-answer"><h3>Answer ${answer.blindLabel}</h3>${identity}<blockquote>${escapeHtml(answer.rawOutput || answer.errorCode || (round.status === 'DRAFT' ? 'Waiting to run' : 'No output'))}</blockquote><textarea data-arena-note="${answer.blindLabel}" placeholder="Judge note (optional)">${escapeHtml(latest?.note || '')}</textarea><div class="arena-verdicts">${(arena.verdicts || []).map(value => `<button class="${latest?.verdict === value ? 'selected' : ''}" data-arena-verdict="${answer.blindLabel}:${value}" ${revealed ? 'disabled' : ''}>${escapeHtml(value.replaceAll('_',' '))}</button>`).join('')}</div>${debug}</section>` }).join('')
    const reveal = ['AWAITING_JUDGMENT','READY_TO_REVEAL'].includes(round.status) ? `<div class="arena-reveal"><button class="primary" data-arena-reveal="normal" ${round.allAnswersJudged || round.objectiveScoringComplete ? '' : 'disabled'}>${round.objectiveScoringComplete ? 'Reveal Objective Results' : 'Reveal Models'}</button><button class="secondary" data-arena-reveal="early">Reveal without full judging</button></div><p class="arena-reveal-note">${round.objectiveScoringComplete ? 'Ground-truth scoring is complete; optional human votes remain blind until reveal.' : 'Early reveal permanently marks this round NON_BLIND_REVIEW.'}</p>` : ''
    const winner = revealed ? `<div class="arena-winner"><p class="eyebrow">${escapeHtml(round.blindStatus)} · ${escapeHtml(round.reviewMode)}</p><h3>${round.winner?.winner === 'TIE' ? 'Tie' : round.winner?.winner === 'NO_VALID_JUDGMENT' ? 'No valid judgment' : `Winner: Answer ${escapeHtml(round.winner?.winner || '—')}`}</h3><p>${round.winner?.winnerProviderId ? escapeHtml(round.winner.winnerProviderId) : 'No unique provider winner.'}</p></div><div class="arena-export-actions"><a class="secondary" href="/api/arena/rounds/${encodeURIComponent(round.id)}/export/bundle">Private Evidence Bundle</a><a class="secondary" href="/api/arena/rounds/${encodeURIComponent(round.id)}/export/blind">Share-safe Blind Judge Bundle</a><a class="secondary" href="/api/arena/rounds/${encodeURIComponent(round.id)}/export/private">Private Mapping Bundle</a><label><input type="checkbox" data-arena-featured="${round.id}" ${(arena.featuredExamples || []).some(item => item.roundId === round.id) ? 'checked' : ''}> Featured example</label></div>` : ''
    $('#arena-round').innerHTML = `<div class="arena-source"><img src="${round.photo.imageUrl}" alt="${escapeAttr(round.photo.filename)}"><div><span class="arena-blind-badge">${revealed ? escapeHtml(round.blindStatus) : 'BLIND · IDENTITIES HIDDEN'}</span><p class="eyebrow">${escapeHtml(round.category.replaceAll('_',' '))} · ${round.outputBudget} tokens</p><h2>${escapeHtml(round.question)}</h2>${round.expectedAnswer ? `<p>Expected: ${escapeHtml(round.expectedAnswer)} · ${escapeHtml(round.expectedAnswerSource)}</p>` : ''}<p>Status: ${escapeHtml(round.status)}</p></div></div><div class="arena-answer-grid">${answerCards}</div>${reveal}${winner}`
  }
  const dashboard = arena.dashboard || { metrics: [], headToHead: {} }
  $('#arena-filter-dataset').innerHTML = `<option value="all">All datasets</option>${datasets.map(item => `<option value="${escapeAttr(item.id)}" ${state.arenaFilters.datasetId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}`
  $('#arena-filter-category').innerHTML = `<option value="all">All categories</option>${(arena.categories || []).map(item => `<option value="${item}" ${state.arenaFilters.category === item ? 'selected' : ''}>${escapeHtml(item.replaceAll('_',' '))}</option>`).join('')}`
  $('#arena-filter-provider').innerHTML = `<option value="all">All providers</option>${(arena.providerIds || []).map(item => `<option value="${item}" ${state.arenaFilters.providerId === item ? 'selected' : ''}>${escapeHtml(names[item] || item)}</option>`).join('')}`
  $('#arena-filter-judge').innerHTML = `<option value="all">All judges</option>${(arena.judgeProviders || []).map(item => `<option value="${item.id}" ${state.arenaFilters.judgeProviderId === item.id ? 'selected' : ''}>${escapeHtml(item.id.replaceAll('_',' '))}${item.ready ? '' : ' · boundary only'}</option>`).join('')}`
  $('#arena-filter-tier').value = state.arenaFilters.evidenceTier
  $('#arena-ranking-note').textContent = `${dashboard.rankingNote || 'All ranking conditions met.'} Reviewed evidence tier: ${(dashboard.reviewedEvidenceTier || 'QUICK_CHECK').replaceAll('_',' ')} · shared reviewed questions ${dashboard.sharedReviewedRounds || 0}. Thirty is the minimum for primary ranking, not for exploratory runs.`
  $('#arena-kpis').innerHTML = dashboard.metrics.map(metric => `<article class="arena-kpi"><b>${escapeHtml(names[metric.providerId] || metric.providerId)}</b><span>Correct ${percent(metric.correctRate)} · partial ${percent(metric.partialRate)} · useful ${percent(metric.usefulRate)}</span><span>Wrong ${percent(metric.wrongRate)} · hallucination ${percent(metric.hallucinationRate)} · invalid ${percent(metric.invalidOutputRate)}</span><span>W/L/T ${metric.wins}/${metric.losses}/${metric.ties} · win rate ${percent(metric.headToHeadWinRate)}</span><span>Latency avg ${metric.averageLatencyMs ?? '—'} · p50 ${metric.p50LatencyMs ?? '—'} · p95 ${metric.p95LatencyMs ?? '—'} ms · cold ${metric.coldStartMs ?? '—'} ms</span><span>Timeout ${percent(metric.timeoutRate)} · runtime failures ${metric.runtimeFailures}</span>${Object.entries(metric.categoryMetrics || {}).map(([category,value]) => `<span>${escapeHtml(category.replaceAll('_',' '))}: ${value.reviewed} reviewed · ${percent(value.usefulRate)} useful</span>`).join('')}</article>`).join('') || '<div class="blank">No revealed, reviewed rounds yet.</div>'
  const matrixRows = Object.entries(dashboard.headToHead || {}).flatMap(([left, values]) => Object.entries(values).map(([right, value]) => `<tr><td>${escapeHtml(names[left] || left)}</td><td>${escapeHtml(names[right] || right)}</td><td>${value.wins}</td><td>${value.losses}</td><td>${value.ties}</td><td>${value.sharedRounds}</td></tr>`)).join('')
  $('#arena-head-to-head').innerHTML = matrixRows ? `<table><thead><tr><th>Model</th><th>vs</th><th>Wins</th><th>Losses</th><th>Ties</th><th>Shared</th></tr></thead><tbody>${matrixRows}</tbody></table>` : ''
  renderQuickArena(arena, names)
  renderArenaBuilder(arena)
}

function renderQuickArena(arena, names) {
  const sets = arena.builder?.benchmarkSets || []
  const currentSet = sets.find(item => item.id === state.builderSetId)
  if (!currentSet || currentSet.questionIds.length === 0) state.builderSetId = sets.find(item => item.questionIds.length > 0)?.id || sets[0]?.id || ''
  const set = sets.find(item => item.id === state.builderSetId)
  $('#quick-arena-set').innerHTML = sets.map(item => `<option value="${escapeAttr(item.id)}" ${item.id === state.builderSetId ? 'selected' : ''}>${escapeHtml(item.name)} · ${item.questionIds.length} questions${item.locked ? ' · locked' : ''}</option>`).join('')
  $('#quick-available-count').textContent = `${set?.questionIds.length || 0} available questions · manual selection ${state.selectedQuestionIds.size || 0}`
  for (const button of document.querySelectorAll('[data-run-size]')) button.classList.toggle('selected', button.dataset.runSize === state.quickRunSize)
  $('#quick-custom-wrap').classList.toggle('hidden', state.quickRunSize !== 'custom'); $('#quick-custom-n').value = state.quickCustomN
  const confirmation = $('#quick-confirmation'); const selection = state.quickSelection
  confirmation.classList.toggle('hidden', !selection)
  if (selection) confirmation.innerHTML = `<p class="eyebrow">PASSO 2 · CONFERMA</p><h3>Pronto per avviare ${selection.selectedQuestionIds.length} domande</h3><p>I 3 modelli risponderanno alle stesse domande. Il test richiede in genere circa 2 minuti per 5 domande.</p><div class="confirmation-grid"><span>Domande<b>${selection.selectedQuestionIds.length}</b></span><span>Immagini diverse<b>${selection.uniqueImageIds.length}</b></span><span>Risposte totali<b>${selection.selectedQuestionIds.length * (arena.primaryProviderIds?.length || 3)}</b></span></div><details><summary>Dettagli tecnici e domande selezionate</summary><p>Campionamento: ${escapeHtml(selection.sampling)} · seed ${selection.seed} · ${escapeHtml(selection.evidenceTier.replaceAll('_',' '))}</p><p>${(arena.primaryProviderIds || []).map(id => `✓ ${escapeHtml(names[id] || id)}`).join('<br>')}</p><ol>${selection.selectedQuestionIds.map((id,index) => `<li>${escapeHtml(id)} · ${escapeHtml(selection.selectedImageIds[index])}</li>`).join('')}</ol></details><button id="quick-start" class="primary" ${state.arenaRunProgress?.status === 'RUNNING' ? 'disabled' : ''}>PASSO 3 · AVVIA IL TEST</button>`
  renderQuickRunProgress(arena)
}

function renderQuickRunProgress(arena) {
  const panel = $('#quick-run-status')
  const latestBatch = [...(arena.batches || [])].reverse().find(item => item.runSizeLabel)
  const progress = state.arenaRunProgress || (latestBatch ? { id: latestBatch.id, status: latestBatch.status, totalQuestions: latestBatch.roundIds.length, completedQuestions: Number(latestBatch.completedRounds || 0) + Number(latestBatch.failedRounds || 0), failedQuestions: Number(latestBatch.failedRounds || 0), currentQuestion: latestBatch.status === 'RUNNING' ? Number(latestBatch.completedRounds || 0) + Number(latestBatch.failedRounds || 0) + 1 : Number(latestBatch.completedRounds || 0) + Number(latestBatch.failedRounds || 0), totalPredictions: latestBatch.roundIds.length * latestBatch.providerIds.length, completedPredictions: 0, modelsPerQuestion: latestBatch.providerIds.length, startedAt: latestBatch.startedAt, finishedAt: latestBatch.finishedAt, error: latestBatch.error, reviewReady: ['AWAITING_JUDGMENT','PARTIALLY_COMPLETED'].includes(latestBatch.status) } : null)
  panel.classList.toggle('hidden', !progress)
  if (!progress) return
  const running = ['DRAFT','RUNNING'].includes(progress.status)
  const complete = progress.reviewReady || progress.status === 'AWAITING_JUDGMENT'
  const total = Math.max(1, progress.totalPredictions || progress.totalQuestions || 1)
  const done = progress.completedPredictions || (progress.completedQuestions || 0) * (progress.modelsPerQuestion || 3)
  const percentage = complete ? 100 : Math.min(99, Math.round(done / total * 100))
  const elapsed = progress.startedAt ? formatElapsed(Date.now() - new Date(progress.startedAt).getTime()) : '0:00'
  const title = running ? 'Test in corso: puoi lasciare aperta questa pagina' : complete ? 'Test completato' : 'Test interrotto'
  const detail = running ? `Domanda ${Math.max(1, progress.currentQuestion || 1)} di ${progress.totalQuestions} · ${done} di ${progress.totalPredictions} risposte · tempo ${elapsed}` : complete ? `${progress.completedQuestions} domande completate${progress.failedQuestions ? ` · ${progress.failedQuestions} con errori` : ' senza errori'}. Ora valuta le risposte senza vedere i nomi dei modelli.` : escapeHtml(progress.error || progress.status)
  const connection = progress.connectionLost ? `<div class="quick-connection-lost"><b>Connessione al server persa.</b><span>Il calcolo può essere ancora attivo. Riprovo automaticamente ogni secondo; non avviare un duplicato.</span></div>` : running ? '<div class="quick-running-signal"><i></i><span>Collegamento attivo · aggiornamento automatico ogni secondo.</span></div>' : ''
  panel.innerHTML = `<div class="quick-run-head"><div><p class="eyebrow">${running ? 'PASSO 3 · CALCOLO' : complete ? 'PASSO 4 · VALUTAZIONE' : 'ATTENZIONE'}</p><h3>${title}</h3><p>${detail}</p></div><strong>${percentage}%</strong></div><div class="quick-progress-track"><i style="width:${percentage}%"></i></div>${connection}${complete ? '<button id="quick-review-results" class="primary">VALUTA LE RISPOSTE</button>' : !running ? '<button id="quick-retry" class="secondary">Prepara un nuovo test</button>' : ''}`
}

function formatElapsed(milliseconds) { const seconds = Math.max(0, Math.floor(milliseconds / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }

async function refreshArenaBatchProgress(batchId) {
  try {
    const progress = await api(`/api/arena/batches/${encodeURIComponent(batchId)}/status`)
    state.arenaRunProgress = { ...progress, connectionLost: false, lastUpdatedAt: new Date().toISOString() }
    renderQuickRunProgress(state.data.arena)
    return progress
  } catch (error) {
    if (state.arenaRunProgress) state.arenaRunProgress = { ...state.arenaRunProgress, connectionLost: true, connectionError: error.message }
    renderQuickRunProgress(state.data.arena)
    throw error
  }
}

function runSizeTitle(selection) { return selection.requestedCount === 5 ? 'QUICK 5' : selection.requestedCount === 10 ? 'QUICK 10' : selection.requestedCount === 20 ? 'PREVIEW 20' : selection.requestedCount >= 30 ? `RANKED ${selection.requestedCount}` : `CUSTOM ${selection.requestedCount}` }

async function previewQuickSelection({ reshuffle = false } = {}) {
  const set = state.data.arena.builder.benchmarkSets.find(item => item.id === state.builderSetId)
  if (!set) throw new Error('Select a question set')
  if (!set.questionIds.length) throw new Error('This question set is empty. Select Vision Lab Challenge Pack 01.')
  const selectedFromSet = [...state.selectedQuestionIds].filter(id => set.questionIds.includes(id))
  const requested = state.quickRunSize === 'quick5' ? 5 : state.quickRunSize === 'quick10' ? 10 : state.quickRunSize === 'preview20' ? 20 : state.quickRunSize === 'ranked30' ? 30 : state.quickRunSize === 'custom' ? Number($('#quick-custom-n').value || state.quickCustomN) : set.questionIds.length
  if (selectedFromSet.length > 0 && selectedFromSet.length < requested) throw new Error(`You manually selected ${selectedFromSet.length} question(s), but this run needs ${requested}. Select more questions or choose Deselect all.`)
  const seed = reshuffle ? Math.floor(Math.random() * 0xffffffff) : state.quickSeed
  const body = { benchmarkSetId: set.id, sourceQuestionIds: selectedFromSet.length ? selectedFromSet : undefined, runSize: state.quickRunSize, customN: Number($('#quick-custom-n').value || state.quickCustomN), sampling: state.quickSampling, seed, shuffle: $('#quick-shuffle').checked, preferImageDiversity: $('#quick-image-diversity').checked }
  const result = await api('/api/arena/selections/preview', { method: 'POST', body: JSON.stringify(body) })
  state.quickSelection = result.selection; state.quickSeed = result.selection.seed; state.quickCustomN = body.customN; render(); return result.selection
}

function renderArenaBuilder(arena) {
  const builder = arena.builder || { datasets: [], benchmarkSets: [], reviewQueue: { rounds: [], total: 0, judged: 0 } }
  const sets = builder.benchmarkSets || []; const mutableSet = sets.find(item => !item.locked) || sets[0]
  if (!sets.some(item => item.id === state.builderSetId)) state.builderSetId = mutableSet?.id || ''
  if (!builder.datasets.some(item => item.id === state.builderDatasetId)) state.builderDatasetId = builder.datasets[0]?.id || ''
  const selectedDataset = builder.datasets.find(item => item.id === state.builderDatasetId)
  const selectedSet = sets.find(item => item.id === state.builderSetId)
  const visibleDatasets = builder.datasets.filter(item => (!state.datasetSearch || item.name.toLowerCase().includes(state.datasetSearch.toLowerCase())) && (state.datasetReadyFilter === 'all' || state.datasetReadyFilter === 'ready' && item.readyCount === item.imageCount || state.datasetReadyFilter === 'errors' && item.preprocessingErrors > 0))
  $('#builder-datasets').innerHTML = visibleDatasets.map(dataset => `<article class="builder-dataset ${dataset.id === state.builderDatasetId ? 'selected' : ''}" data-builder-dataset="${escapeAttr(dataset.id)}"><div><b>${escapeHtml(dataset.name)}</b><small>${dataset.readyCount}/${dataset.imageCount} ready · ${dataset.preprocessingErrors} preprocessing errors</small><p>${escapeHtml(dataset.description || 'No description')}</p><button class="secondary" data-rename-dataset="${dataset.id}">Rename / describe</button></div><div class="builder-thumbs">${dataset.photos.slice(0,8).map(photo => `<figure title="${escapeAttr(`${photo.filename} · ${photo.width || '?'}×${photo.height || '?'} · ${photo.pipeline}`)}"><img src="${photo.imageUrl || ''}" alt="${escapeAttr(photo.filename)}"><button class="icon secondary" data-move-dataset-photo="${dataset.id}:${photo.id}" title="Move to another dataset">→</button><button class="icon danger" data-remove-dataset-photo="${dataset.id}:${photo.id}" title="Remove from this dataset only">×</button></figure>`).join('')}</div></article>`).join('') || '<div class="blank">No datasets match these filters.</div>'
  $('#builder-question-dataset').innerHTML = builder.datasets.map(item => `<option value="${escapeAttr(item.id)}" ${item.id === state.builderDatasetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')
  const reusable = state.data.photos.filter(photo => !selectedDataset?.photos.some(item => item.id === photo.id)); $('#builder-reuse-photo').innerHTML = reusable.map(photo => `<option value="${escapeAttr(photo.id)}">${escapeHtml(photo.filename)} · ${photo.imagePipeline?.ready ? 'ready' : 'pipeline error'}</option>`).join('') || '<option value="">No additional existing images</option>'
  $('#builder-question-photo').innerHTML = (selectedDataset?.photos || []).map(photo => `<option value="${escapeAttr(photo.id)}">${escapeHtml(photo.filename)} · ${photo.width || '?'}×${photo.height || '?'} · ${escapeHtml(photo.pipeline)}</option>`).join('')
  const previewPhoto = selectedDataset?.photos?.find(photo => photo.id === $('#builder-question-photo').value) || selectedDataset?.photos?.[0]; $('#builder-question-preview').src = previewPhoto?.imageUrl || ''; $('#builder-question-preview').classList.toggle('hidden', !previewPhoto?.imageUrl)
  $('#builder-question-category').innerHTML = (arena.categories || []).map(item => `<option value="${item}">${escapeHtml(item.replaceAll('_',' '))}</option>`).join('')
  $('#builder-question-set').innerHTML = `<option value="">Question bank only</option>${sets.filter(item => !item.locked).map(item => `<option value="${escapeAttr(item.id)}" ${item.id === state.builderSetId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}`
  $('#question-filter-category').innerHTML = `<option value="all">All categories</option>${(arena.categories || []).map(item => `<option value="${item}" ${state.questionCategory === item ? 'selected' : ''}>${escapeHtml(item.replaceAll('_',' '))}</option>`).join('')}`
  $('#question-filter-dataset').innerHTML = `<option value="all">All datasets</option>${builder.datasets.map(item => `<option value="${item.id}" ${state.questionDataset === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}`
  $('#builder-question-count').textContent = `${selectedSet?.questionIds.length || 0}/30`
  const filteredQuestions = (arena.questionBank || []).filter(item => (!state.questionSearch || item.text.toLowerCase().includes(state.questionSearch.toLowerCase())) && (state.questionCategory === 'all' || item.category === state.questionCategory) && (state.questionDataset === 'all' || item.datasetId === state.questionDataset))
  $('#question-selected-count').textContent = `${state.selectedQuestionIds.size} / ${arena.questionBank.length} questions selected`
  $('#arena-question-bank').innerHTML = filteredQuestions.map(item => { const inSet = selectedSet?.questionIds.includes(item.id); return `<article class="question-row"><label class="question-select"><input type="checkbox" data-question-check="${item.id}" ${state.selectedQuestionIds.has(item.id) ? 'checked' : ''}><span><b>${escapeHtml(item.text)}</b><small>VALID · ${escapeHtml(item.category)} · ${escapeHtml(item.datasetId || 'no dataset')} · ${escapeHtml(item.photoId || 'no image')}</small><p>${item.expectedAnswer ? `Expected: ${escapeHtml(item.expectedAnswer)} · ${escapeHtml(item.answerType || 'exact_text')}${item.acceptedAnswers?.length ? ` · also ${escapeHtml(item.acceptedAnswers.join(', '))}` : ''} · ${escapeHtml(item.expectedAnswerSource || '')}` : 'Comparative answer only'} ${item.issues?.length ? `· ⚠ ${escapeHtml(item.issues.join('; '))}` : ''}</p></span></label><div>${selectedSet && !selectedSet.locked ? `<button class="secondary" data-toggle-set-question="${selectedSet.id}:${item.id}:${inSet ? 'remove' : 'add'}">${inSet ? 'Remove from set' : 'Add to set'}</button>` : ''}<button class="secondary" data-edit-question="${item.id}">Edit</button><button class="secondary" data-duplicate-question="${item.id}">Duplicate</button><button class="danger" data-delete-question="${item.id}">Delete</button></div></article>` }).join('') || '<div class="blank">No questions match these filters.</div>'
  $('#arena-benchmark-sets').innerHTML = sets.map(set => { const coverage = set.coverage || {}; const validation = set.validation || {}; const gaps = (coverage.categoryGaps || []).map(item => `${item.category.replaceAll('_',' ')} ${item.count}/${item.minimum}`); return `<article class="benchmark-wizard ${set.id === state.builderSetId ? 'selected' : ''}" data-builder-set="${escapeAttr(set.id)}"><div><b>${escapeHtml(set.name)} · ${escapeHtml(set.version || 'draft')}</b><p>${set.questionIds.length}/${coverage.target || 30} questions · ${coverage.uniqueImages || 0}/${coverage.uniqueImagesTarget || 30} unique images · ${coverage.expectedAnswers || 0} gold answers · ${set.locked ? 'LOCKED / immutable' : 'mutable'}</p>${set.versionDiff ? `<small>Changes from ${escapeHtml(set.versionDiff.left)}: +${set.versionDiff.addedQuestionIds.length} / −${set.versionDiff.removedQuestionIds.length} questions · ${set.versionDiff.changedMetadata.length} metadata fields</small>` : ''}<small>Datasets selected by linked questions: ${Object.entries(coverage.datasets || {}).map(([id,count]) => `${escapeHtml(id)} ${count}`).join(' · ') || 'none'}</small><small>Coverage: ${Object.entries(coverage.categories || {}).filter(([,count]) => count).map(([name,count]) => `${escapeHtml(name.replaceAll('_',' '))} ${count}`).join(' · ') || 'none'}</small><small>${gaps.length ? `Required quota gaps: ${escapeHtml(gaps.join(', '))}` : 'All required category quotas met.'}</small><small class="${validation.valid ? 'ok' : 'error'}">${validation.valid ? 'Validation passed' : `Blockers: ${escapeHtml((validation.blockers || []).join('; '))}`}</small></div><div>${!set.locked ? `<button class="secondary" data-validate-set="${set.id}">Validate</button><button class="primary" data-preview-lock="${set.id}" ${validation.valid ? '' : 'disabled'}>Preview & lock</button>` : `<button class="secondary" data-clone-set="${set.id}">Create new version</button><button class="primary" data-create-batch-from-locked="${set.id}">Create primary batch</button>`}</div></article>` }).join('') + (arena.batches || []).map(batch => { const gateBlocked = batch.arenaMode === 'FAIR_RESOURCE_MATCHED_PRIMARY' && (state.arenaReadiness?.verdict !== 'BENCHMARK_READY' || state.arenaReadiness?.benchmarkSetId !== batch.benchmarkSetId); return `<article class="arena-batch-item"><b>${escapeHtml(batch.runSizeLabel || batch.id)}</b><p>${escapeHtml((batch.evidenceTier || 'EXPLORATORY').replaceAll('_',' '))} · ${formatDate(batch.createdAt)} · ${batch.roundIds.length} questions / ${batch.selectionSnapshot?.uniqueImageIds?.length || batch.roundIds.length} unique images</p><p>${escapeHtml(batch.status)} · completed ${batch.completedRounds || 0} · failed ${batch.failedRounds || 0}</p>${batch.status === 'DRAFT' ? `<button data-arena-run-batch="${batch.id}" ${gateBlocked ? 'disabled' : ''}>${gateBlocked ? 'Blocked — readiness required' : batch.arenaMode === 'FAIR_RESOURCE_MATCHED_PRIMARY' ? 'Run ranked benchmark' : 'Run exploratory Arena'}</button>` : ''}</article>` }).join('')
  const queue = builder.reviewQueue || { rounds: [], total: 0, judged: 0 }; state.reviewIndex = Math.min(state.reviewIndex, Math.max(0, queue.rounds.length - 1)); const review = queue.rounds[state.reviewIndex]
  $('#review-progress').textContent = `${queue.judged}/${queue.total} rounds fully judged · ${queue.pending || 0} awaiting review`
  $('#arena-review-queue').innerHTML = review ? `<article class="review-queue-card"><img src="${review.imageUrl}" alt="Blind review image"><div><p class="eyebrow">${state.reviewIndex + 1}/${queue.total} · ${escapeHtml(review.category)}</p><h3>${escapeHtml(review.question)}</h3><a class="secondary" href="/api/arena/rounds/${encodeURIComponent(review.id)}/export/blind">Export share-safe bundle for this round</a>${review.answers.map(answer => `<section><b>Answer ${answer.blindLabel}${answer.judged ? ' · judged' : ''}</b><blockquote>${escapeHtml(answer.rawOutput)}</blockquote><textarea data-queue-note="${review.id}:${answer.blindLabel}" placeholder="Optional human note"></textarea><div class="arena-verdicts">${(arena.verdicts || []).map(verdict => `<button data-queue-verdict="${review.id}:${answer.blindLabel}:${verdict}">${escapeHtml(verdict.replaceAll('_',' '))}</button>`).join('')}</div></section>`).join('')}<div class="bulk-actions"><button class="primary" data-queue-reveal="${review.id}" ${review.answers.every(answer => answer.judged) ? '' : 'disabled'}>Reveal after full judging</button><button class="danger" data-queue-reveal-early="${review.id}">Reveal early (non-blind)</button></div><p class="error">Do not reveal early: it permanently excludes this round from blind ranking.</p></div></article>` : '<div class="blank">No completed batch rounds are awaiting blind review.</div>'
}

function renderEvidenceGallery(experiments, providers) {
  const rows = state.data.evidenceGallery || []
  $('#evidence-experiment').innerHTML = `<option value="all">All experiments</option>${experiments.map(item => `<option value="${item.id}" ${state.evidenceExperiment === item.id ? 'selected' : ''}>${escapeHtml(item.number)} · ${escapeHtml(item.name)}</option>`).join('')}`
  $('#evidence-provider').innerHTML = `<option value="all">All providers</option>${providers.map(item => `<option value="${item.id}" ${state.evidenceProvider === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}`
  $('#evidence-kind').value = state.evidenceKind; $('#evidence-judge').value = state.evidenceJudge
  const successVerdicts = new Set(['CORRECT','PARTIALLY_CORRECT'])
  const filtered = rows.filter(row => (state.evidenceKind === 'all' || (state.evidenceKind === 'success') === successVerdicts.has(row.verdict)) && (state.evidenceExperiment === 'all' || row.experimentId === state.evidenceExperiment) && (state.evidenceProvider === 'all' || row.providerId === state.evidenceProvider) && (state.evidenceJudge === 'all' || row.judgeSource === state.evidenceJudge))
  $('#evidence-gallery').innerHTML = filtered.slice(0, 60).map(row => `<article class="evidence-card ${successVerdicts.has(row.verdict) ? 'success' : 'failure'}"><img src="${row.photo.imageUrl}" alt="${escapeAttr(row.photo.filename)}"><div><b>${escapeHtml(row.verdict)} · ${escapeHtml(row.taskId)}</b><p>${escapeHtml(row.rawOutput || row.errorType)}</p><small>${escapeHtml(row.experimentId)} · ${escapeHtml(row.providerId)}</small><small>${escapeHtml(row.runtime)} · ${escapeHtml(row.model)}</small><small>Judge: ${escapeHtml(row.judgeSource)} · Error: ${escapeHtml(row.errorType)}</small></div></article>`).join('') || '<div class="blank">No reviewed evidence matches these filters.</div>'
}

function renderMetrics(metrics) {
  $('#metric-grid').innerHTML = metrics.map(metric => { const accuracy = metric.accuracy == null ? null : Math.round(metric.accuracy * 100); return `<article class="metric-card"><div class="metric-head"><h3>${escapeHtml(metric.taskName)}<span class="metric-provider">${escapeHtml(metric.providerId)}</span></h3><span class="decision-label ${metric.decisionStatus.toLowerCase()}">${metric.decisionStatus.replaceAll('_',' ')}</span></div><div class="metric-score">${accuracy == null ? '—' : `${accuracy}%`} <small>accuracy</small></div><div class="metric-bars"><i style="width:${accuracy || 0}%"></i></div><div class="metric-details"><span>Reviewed<b>${metric.samplesEvaluated}</b></span><span>Correct<b>${metric.correct}</b></span><span>Incorrect<b>${metric.incorrect}</b></span><span>Unclear prediction<b>${metric.unclearPredictions} · ${percent(metric.unclearRate)}</b></span><span>Invalid output<b>${metric.invalidOutputs} · ${percent(metric.invalidOutputRate)}</b></span><span>Avg latency<b>${metric.averageLatencyMs == null ? '—' : `${metric.averageLatencyMs} ms`}</b></span></div><p class="screening-note">Screening iniziale su un dataset piccolo: ≥90% promising · 80–89% needs more data · &lt;80% weak</p></article>` }).join('')
}

function renderFailures(failures) { $('#failure-count').textContent = failures.length; $('#failure-gallery').innerHTML = failures.length ? failures.map(({ photo, inference, review }) => `<article class="failure-card"><img src="${photo.imageUrl}" alt="${escapeHtml(photo.filename)}"><div class="failure-info"><b>${escapeHtml(inference.task)}</b><p>Predicted: ${escapeHtml(inference.normalizedOutput || 'invalid')}<br>Truth: ${escapeHtml(review.correctLabel)}</p><code>${escapeHtml(inference.rawOutput)}</code></div></article>`).join('') : '<div class="blank">No reviewed failures in this run.</div>' }
function renderWarnings(warnings) { $('#diagnostic-warnings').innerHTML = warnings.map(item => `<div class="diagnostic-warning"><b>DIAGNOSTIC WARNING</b><br>${escapeHtml(item.message)}</div>`).join('') }
function renderPreviousRuns(runs) { $('#previous-runs-list').innerHTML = runs.length ? runs.map(run => `<button class="previous-run" data-run-id="${run.id}"><b>${escapeHtml(run.id)}</b><span>${formatDateTime(run.date)}</span><span>${escapeHtml(run.providerId || run.status)}</span><span>${run.photos} photos</span><span>${formatDuration(run.durationMs)}</span></button>`).join('') : '<div class="blank">No previous runs yet.</div>' }
function renderArchive(photos) { $('#archive-grid').innerHTML = photos.map(photo => `<article class="photo-card"><img class="photo-image" src="${photo.imageUrl}" alt="${escapeHtml(photo.filename)}" loading="lazy"><div class="photo-body"><div class="filename">${escapeHtml(photo.filename)}</div><div class="meta-line">Earlier photo · ${formatDate(photo.importedAt)}</div></div></article>`).join('') || '<div class="blank">No earlier photos.</div>' }

function renderBrain(run) {
  const brain = $('#brain-status')
  const visible = state.busy || run?.status === 'RUNNING' || run?.status === 'COMPLETED'
  brain.classList.toggle('hidden', !visible)
  if (!visible) return
  const elapsed = run?.startedAt ? Date.now() - Date.parse(run.startedAt) : 0
  if (run.status === 'COMPLETED') brain.textContent = `VisionPsy local inference\nCOMPLETED\n\n${run.inferenceReadyPhotos ?? run.photoCount} inference-ready\n${run.imagePipelineFailures ?? 0} image pipeline failures\n${run.completedPredictions + run.failedPredictions} model predictions\nTotal time: ${formatDuration(run.durationMs)}\nAvg/photo: ${formatDuration(run.timings?.avgPhotoMs)}\nAvg/task: ${formatDuration(run.timings?.avgTaskMs)}\nCold start: ${formatDuration(run.timings?.modelLoadMs)}\nWarm inference: ${formatDuration(run.timings?.avgWarmInferenceMs)}`
  else {
    const progress = benchmarkProgress(run)
    const remaining = progress.completed ? elapsed / progress.completed * Math.max(0, progress.total - progress.completed) : null
    const runName = run.benchmarkPreset === 'focused_base_v1' ? 'Focused Standard Benchmark v1' : run.benchmarkPreset === 'minimal_smart_semantic_v2' ? 'Minimal Smart Semantic Test v2' : 'VisionPsy local inference'
    brain.textContent = `${runName}\nRUNNING\n\nPhoto ${progress.photoIndex} / ${run.photoCount || state.selectedPhotos.size}\nTask ${progress.taskIndex || '—'} / ${run.taskCount || '—'}\nCurrent: ${shortTaskName(state.data.tasks.find(task => task.id === run.currentTaskId)?.name || run.currentTaskId || 'initializing…')}\nCompleted predictions: ${progress.completed} / ${progress.total}\nStage: ${friendlyStage(run.currentStage)}\nElapsed: ${formatDuration(elapsed)}\nEstimated remaining: ${remaining == null ? 'calculating…' : `~${formatDuration(remaining)}`}\nProvider PID: ${run.providerPid || '—'}`
  }
}

async function ensureDraftRun() {
  if (state.data.currentRun?.status === 'DRAFT') return state.data.currentRun
  const { run } = await api('/api/runs', { method: 'POST', body: JSON.stringify({ benchmarkPreset: state.activePresetId }) })
  state.selectedRunId = run.id; state.selectedPhotos.clear(); state.openInference = null
  await load(run.id)
  return run
}

$('#file-input').addEventListener('change', event => importFiles(event.target.files))
$('#vqa-file-input').addEventListener('change', event => importVqaFiles(event.target.files))
const drop = $('#drop-zone')
for (const type of ['dragenter','dragover']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('drag') })
for (const type of ['dragleave','drop']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('drag') })
drop.addEventListener('drop', event => importFiles(event.dataTransfer.files))

async function importFiles(fileList) {
  const files = [...fileList].filter(file => file.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name))
  if (!files.length) return toast('No supported images selected.', true)
  $('#import-progress').classList.remove('hidden')
  try {
    const run = state.data.currentRun?.status === 'DRAFT' && state.data.currentRun.photoIds.length === 0
      ? state.data.currentRun
      : (await api('/api/runs', { method: 'POST', body: JSON.stringify({ benchmarkPreset: state.activePresetId }) })).run
    state.selectedRunId = run.id
    state.selectedPhotos.clear()
    for (let index = 0; index < files.length; index++) {
      const file = files[index]; $('#import-progress span').textContent = `Importing ${index + 1} / ${files.length} · ${file.name}`
      const result = await api('/api/photos/import', { method: 'POST', body: JSON.stringify({ runId: run.id, filename: file.name, relativePath: file.webkitRelativePath || file.name, mimeType: file.type, lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null, dataBase64: arrayBufferToBase64(await file.arrayBuffer()) }) })
      state.selectedPhotos.add(result.photo.id)
    }
    toast(`${files.length} new photo${files.length === 1 ? '' : 's'} added to the current run.`); await load(run.id)
  } catch (error) { toast(error.message, true) } finally { $('#import-progress').classList.add('hidden'); $('#file-input').value = '' }
}

async function importVqaFiles(fileList) {
  const input = $('#vqa-file-input')
  const files = [...fileList].filter(file => file.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name))
  if (!files.length) return toast('No supported images selected.', true)
  try {
    for (const file of files) {
      const result = await api('/api/photos/import', { method: 'POST', body: JSON.stringify({ datasetId: state.vqaDatasetId, filename: file.name, relativePath: file.webkitRelativePath || file.name, mimeType: file.type, lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null, dataBase64: arrayBufferToBase64(await file.arrayBuffer()) }) })
      if (state.vqaPhotoIds.size < 10) state.vqaPhotoIds.add(result.photo.id)
    }
    await load(state.selectedRunId); toast(`${files.length} image${files.length === 1 ? '' : 's'} added to the selected dataset.`)
  } catch (error) { toast(error.message, true) } finally { input.value = '' }
}

document.addEventListener('change', async event => {
  const arenaFilterMap = { 'arena-filter-dataset': 'datasetId', 'arena-filter-category': 'category', 'arena-filter-provider': 'providerId', 'arena-filter-judge': 'judgeProviderId', 'arena-filter-tier': 'evidenceTier' }
  if (arenaFilterMap[event.target.id]) { state.arenaFilters[arenaFilterMap[event.target.id]] = event.target.value; const query = new URLSearchParams(state.arenaFilters); try { state.data.arena.dashboard = await api(`/api/arena/dashboard?${query}`); render() } catch (error) { toast(error.message, true) } return }
  if (event.target.id === 'arena-dataset') { state.arenaDatasetId = event.target.value; state.arenaPhotoId = null; render() }
  if (event.target.id === 'builder-question-dataset') { state.builderDatasetId = event.target.value; render() }
  if (event.target.id === 'builder-question-photo') { const photo = state.data.arena.builder.datasets.find(item => item.id === state.builderDatasetId)?.photos.find(item => item.id === event.target.value); $('#builder-question-preview').src = photo?.imageUrl || ''; $('#builder-question-preview').classList.toggle('hidden', !photo?.imageUrl) }
  if (event.target.id === 'question-filter-category') { state.questionCategory = event.target.value; render() }
  if (event.target.id === 'question-filter-dataset') { state.questionDataset = event.target.value; render() }
  if (event.target.id === 'dataset-ready-filter') { state.datasetReadyFilter = event.target.value; render() }
  if (event.target.id === 'quick-arena-set') { state.builderSetId = event.target.value; state.quickSelection = null; render() }
  if (event.target.name === 'quick-sampling') { state.quickSampling = event.target.value; state.quickSelection = null; render() }
  if (event.target.id === 'quick-image-diversity' || event.target.id === 'quick-shuffle') { state.quickShuffle = $('#quick-shuffle').checked; state.quickSelection = null; render() }
  const questionCheck = event.target.dataset.questionCheck; if (questionCheck) { event.target.checked ? state.selectedQuestionIds.add(questionCheck) : state.selectedQuestionIds.delete(questionCheck); render() }
  const arenaProvider = event.target.dataset.arenaProvider; if (arenaProvider) { event.target.checked ? state.arenaProviderIds.add(arenaProvider) : state.arenaProviderIds.delete(arenaProvider); render() }
  const arenaFeatured = event.target.dataset.arenaFeatured; if (arenaFeatured) { try { await api(`/api/arena/rounds/${encodeURIComponent(arenaFeatured)}/featured`, { method: 'POST', body: JSON.stringify({ featured: event.target.checked }) }); await load() } catch (error) { toast(error.message, true) } }
  if (event.target.id === 'vqa-dataset') { state.vqaDatasetId = event.target.value; state.vqaPhotoIds.clear(); state.vqaQuestions = {}; render() }
  if (event.target.id === 'evidence-kind') { state.evidenceKind = event.target.value; render() }
  if (event.target.id === 'evidence-experiment') { state.evidenceExperiment = event.target.value; render() }
  if (event.target.id === 'evidence-provider') { state.evidenceProvider = event.target.value; render() }
  if (event.target.id === 'evidence-judge') { state.evidenceJudge = event.target.value; render() }
  const vqaPhoto = event.target.dataset.vqaPhoto; if (vqaPhoto) { if (event.target.checked && state.vqaPhotoIds.size >= 10) { event.target.checked = false; return toast('Quick tests are limited to 10 images.', true) } event.target.checked ? state.vqaPhotoIds.add(vqaPhoto) : state.vqaPhotoIds.delete(vqaPhoto); render() }
  const vqaProvider = event.target.dataset.vqaProvider; if (vqaProvider) { const comparison = state.data.vqaPresets.find(item => item.id === state.vqaPresetId)?.comparison; if (comparison) event.target.checked ? state.vqaProviderIds.add(vqaProvider) : state.vqaProviderIds.delete(vqaProvider); else state.vqaProviderIds = new Set([vqaProvider]); render() }
  if (event.target.id === 'vqa-reuse-question') { state.vqaReuseQuestion = event.target.checked; if (state.vqaReuseQuestion) { const first = [...state.vqaPhotoIds][0]; const text = state.vqaQuestions[first] || ''; for (const id of state.vqaPhotoIds) state.vqaQuestions[id] = text } render() }
  const featured = event.target.dataset.vqaFeatured; if (featured) { try { await api('/api/reviews/featured', { method: 'POST', body: JSON.stringify({ inferenceId: featured, featured: event.target.checked }) }); await load() } catch (error) { toast(error.message, true) } }
  const taskCheck = event.target.dataset.taskCheck; if (taskCheck) { event.target.checked ? state.selectedTasks.add(taskCheck) : state.selectedTasks.delete(taskCheck); render() }
  const photoCheck = event.target.dataset.photoCheck; if (photoCheck) { event.target.checked ? state.selectedPhotos.add(photoCheck) : state.selectedPhotos.delete(photoCheck); render() }
  const taskStatus = event.target.dataset.taskStatus; if (taskStatus) { try { await api(`/api/tasks/${taskStatus}`, { method: 'PATCH', body: JSON.stringify({ status: event.target.value }) }); await load() } catch (error) { toast(error.message, true) } }
  const identity = event.target.dataset.identity; if (identity) savePhoto(identity, { petIdentity: event.target.value })
  const providerId = event.target.dataset.providerId; if (providerId) { state.selectedProviderId = providerId; render(); if (activePreset() && providerId !== activePreset().providerId) toast('This benchmark preset is designed for VisionPsy-Nano-460M.', true) }
  if (event.target.name === 'benchmark-scope') { state.benchmarkScope = event.target.value; render() }
  if (event.target.name === 'semantic-scope') { state.benchmarkScope = event.target.value; render() }
  if (event.target.id === 'benchmark-experimental') { event.target.checked ? state.selectedTasks.add('dog_with_toy') : state.selectedTasks.delete('dog_with_toy'); render() }
  if (event.target.id === 'quick-truth-status') { state.quickTruthStatus = event.target.value; render() }
  if (event.target.id === 'quick-truth-label') { state.quickTruthLabel = event.target.value; render() }
  const truthSelect = event.target.dataset.groundTruthSelect; if (truthSelect) document.querySelector(`[data-save-ground-truth="${truthSelect}"]`).disabled = !event.target.value
})
document.addEventListener('input', event => {
  if (event.target.id === 'question-search') { state.questionSearch = event.target.value; render(); return }
  if (event.target.id === 'dataset-search') { state.datasetSearch = event.target.value; render(); return }
  if (event.target.id === 'quick-custom-n') { state.quickCustomN = Number(event.target.value); state.quickSelection = null; return }
  if (['arena-question','arena-expected'].includes(event.target.id)) {
    $('#arena-create').disabled = !state.arenaPhotoId || !$('#arena-question').value.trim() || state.arenaProviderIds.size < 2 || state.data.currentRun?.status === 'RUNNING'
    return
  }
  const questionId = event.target.dataset.vqaQuestion
  if (!questionId) return
  state.vqaQuestions[questionId] = event.target.value
  if (state.vqaReuseQuestion && questionId === [...state.vqaPhotoIds][0]) {
    for (const id of state.vqaPhotoIds) state.vqaQuestions[id] = event.target.value
    for (const textarea of document.querySelectorAll('[data-vqa-question]')) if (textarea !== event.target) textarea.value = event.target.value
  }
  $('#create-vqa-run').disabled = !state.vqaPhotoIds.size || ![...state.vqaPhotoIds].every(id => String(state.vqaQuestions[id] || '').trim()) || !state.vqaProviderIds.size
})
document.addEventListener('focusout', event => { const id = event.target.dataset.location; if (id) savePhoto(id, { manualLocation: event.target.value }) })
document.addEventListener('click', async event => {
  const experimentId = event.target.dataset.openExperiment
  if (experimentId) {
    if (experimentId === 'experiment_01_pawvault') return $('#photos').scrollIntoView({ behavior: 'smooth' })
    if (experimentId === 'experiment_06_showcase') { window.qvacShowcase?.open(); return }
    if (experimentId === 'experiment_05_arena') {
      state.arenaOpen = true; state.arenaTab = 'quick'
      $('#vqa-experiment-number').textContent = 'ESPERIMENTO 05'; $('#vqa-title').textContent = 'Test rapido tra 3 modelli'; $('#vqa-description').textContent = 'Scegli quante domande usare, avvia il test e segui l’avanzamento fino alla valutazione finale.'
      render(); $('#vqa-workbench').classList.remove('hidden'); $('#vqa-workbench').scrollIntoView({ behavior: 'smooth' }); return
    }
    state.arenaOpen = false
    const preset = state.data.vqaPresets.find(item => item.experimentId === experimentId)
    state.vqaPresetId = preset.id
    state.vqaDatasetId = ({ screenshot: 'screenshot_real_v1', document_chart: 'document_chart_real_v1' })[preset.datasetCategory] || 'pet_photos_real_v1'
    state.vqaProviderIds = new Set(preset.defaultProviderIds)
    state.vqaPhotoIds.clear(); state.vqaQuestions = {}
    render(); $('#vqa-workbench').classList.remove('hidden'); $('#vqa-workbench').scrollIntoView({ behavior: 'smooth' }); return
  }
  const arenaTab = event.target.closest('[data-arena-tab]')?.dataset.arenaTab; if (arenaTab) { state.arenaTab = arenaTab; for (const button of document.querySelectorAll('.arena-tabs [data-arena-tab]')) button.classList.toggle('selected', button.dataset.arenaTab === arenaTab); $('#arena-live').classList.toggle('hidden', arenaTab !== 'live'); $('#arena-quick').classList.toggle('hidden', arenaTab !== 'quick'); $('#arena-batch').classList.toggle('hidden', arenaTab !== 'batch'); return }
  const runSize = event.target.dataset.runSize; if (runSize) { state.quickRunSize = runSize; state.quickSelection = null; render(); if (runSize !== 'custom') { try { await previewQuickSelection() } catch (error) { toast(error.message, true) } } return }
  if (event.target.id === 'quick-preview') { try { await previewQuickSelection() } catch (error) { toast(error.message, true) } return }
  if (event.target.id === 'quick-reshuffle') { try { await previewQuickSelection({ reshuffle: true }); toast('New deterministic sample generated with a different seed.') } catch (error) { toast(error.message, true) } return }
  if (event.target.id === 'quick-start') { const selection = state.quickSelection; if (!selection || ['DRAFT','RUNNING'].includes(state.arenaRunProgress?.status)) return; const set = state.data.arena.builder.benchmarkSets.find(item => item.id === selection.benchmarkSetId); const official = selection.evidenceTier === 'RANKING_ELIGIBLE' && set?.locked; try { const created = await api('/api/arena/batches', { method: 'POST', body: JSON.stringify({ benchmarkSetId: set.id, providerIds: state.data.arena.primaryProviderIds, locked: official, version: set.version, outputBudget: set.outputBudget || 64, selectionSnapshot: selection, runSizeLabel: runSizeTitle(selection) }) }); state.activeArenaBatchId = created.batch.id; state.arenaRunProgress = { id: created.batch.id, status: 'DRAFT', totalQuestions: created.batch.roundIds.length, completedQuestions: 0, failedQuestions: 0, currentQuestion: 1, totalPredictions: created.batch.roundIds.length * created.batch.providerIds.length, completedPredictions: 0, modelsPerQuestion: created.batch.providerIds.length, startedAt: new Date().toISOString(), reviewReady: false, connectionLost: false }; state.arenaFilters.evidenceTier = selection.evidenceTier; renderQuickRunProgress(state.data.arena); $('#quick-run-status').scrollIntoView({ behavior: 'smooth', block: 'center' }); state.elapsedTimer = setInterval(() => { renderQuickRunProgress(state.data.arena); void refreshArenaBatchProgress(created.batch.id).catch(() => {}) }, 1000); await api(`/api/arena/batches/${encodeURIComponent(created.batch.id)}/run`, { method: 'POST', body: '{}' }); await refreshArenaBatchProgress(created.batch.id); renderQuickRunProgress(state.data.arena); $('#quick-run-status').scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Test completato. Ora valuta le risposte.') } catch (error) { if (state.activeArenaBatchId) await refreshArenaBatchProgress(state.activeArenaBatchId).catch(() => {}); else state.arenaRunProgress = { status: 'FAILED', error: error.message }; renderQuickRunProgress(state.data.arena); toast(error.message, true) } finally { clearInterval(state.elapsedTimer); state.elapsedTimer = null } return }
  if (event.target.id === 'quick-review-results') { try { await load(); state.arenaTab = 'batch'; render(); $('#arena-review-queue').scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch (error) { toast(`Impossibile caricare la valutazione: ${error.message}`, true) } return }
  if (event.target.id === 'quick-retry') { state.arenaRunProgress = null; state.activeArenaBatchId = null; state.quickSelection = null; render(); return }
  const questionSelect = event.target.dataset.questionSelect; if (questionSelect) { const set = state.data.arena.builder.benchmarkSets.find(item => item.id === state.builderSetId); const visible = (state.data.arena.questionBank || []).filter(item => set?.questionIds.includes(item.id) && (!state.questionSearch || item.text.toLowerCase().includes(state.questionSearch.toLowerCase())) && (state.questionCategory === 'all' || item.category === state.questionCategory) && (state.questionDataset === 'all' || item.datasetId === state.questionDataset)); if (questionSelect === 'all') for (const item of visible) state.selectedQuestionIds.add(item.id); else if (questionSelect === 'none') state.selectedQuestionIds.clear(); else if (questionSelect === 'invert') for (const item of visible) state.selectedQuestionIds.has(item.id) ? state.selectedQuestionIds.delete(item.id) : state.selectedQuestionIds.add(item.id); else if (questionSelect === 'clear') { state.questionSearch = ''; state.questionCategory = 'all'; state.questionDataset = 'all'; $('#question-search').value = '' } else { const count = Number(window.prompt('How many questions?', '10')); if (!Number.isInteger(count) || count < 1) return; try { const result = await api('/api/arena/selections/preview', { method: 'POST', body: JSON.stringify({ benchmarkSetId: set.id, sourceQuestionIds: visible.map(item => item.id), runSize: 'custom', customN: count, sampling: questionSelect, preferImageDiversity: questionSelect === 'balanced' }) }); state.selectedQuestionIds = new Set(result.selection.membershipQuestionIds) } catch (error) { toast(error.message, true) } } state.quickSelection = null; render(); return }
  const arenaPhoto = event.target.closest('[data-arena-photo]')?.dataset.arenaPhoto; if (arenaPhoto) { state.arenaPhotoId = arenaPhoto; render(); return }
  const builderDataset = event.target.closest('[data-builder-dataset]')?.dataset.builderDataset; if (builderDataset && !event.target.closest('button')) { state.builderDatasetId = builderDataset; render(); return }
  const builderSet = event.target.closest('[data-builder-set]')?.dataset.builderSet; if (builderSet && !event.target.closest('button')) { state.builderSetId = builderSet; render(); return }
  const renameDataset = event.target.dataset.renameDataset; if (renameDataset) { const current = state.data.arena.builder.datasets.find(item => item.id === renameDataset); const name = window.prompt('Dataset name', current.name); if (name == null) return; const description = window.prompt('Dataset description', current.description || ''); if (description == null) return; try { await api(`/api/arena/datasets/${encodeURIComponent(renameDataset)}`, { method: 'PATCH', body: JSON.stringify({ name, description }) }); await load(); toast('Dataset updated.') } catch (error) { toast(error.message, true) } return }
  const removeDatasetPhoto = event.target.dataset.removeDatasetPhoto; if (removeDatasetPhoto) { const [datasetId, photoId] = removeDatasetPhoto.split(':'); if (!window.confirm('Remove this image from the dataset? The global photo and all historical evidence will be preserved.')) return; try { await api(`/api/arena/datasets/${encodeURIComponent(datasetId)}/photos`, { method: 'DELETE', body: JSON.stringify({ photoId }) }); await load(); toast('Image removed from this dataset only; history preserved.') } catch (error) { toast(error.message, true) } return }
  const moveDatasetPhoto = event.target.dataset.moveDatasetPhoto; if (moveDatasetPhoto) { const [fromDatasetId, photoId] = moveDatasetPhoto.split(':'); const choices = state.data.arena.builder.datasets.filter(item => item.id !== fromDatasetId).map(item => `${item.id} — ${item.name}`).join('\n'); const toDatasetId = window.prompt(`Move image to which dataset id?\n${choices}`); if (!toDatasetId) return; try { await api(`/api/arena/datasets/${encodeURIComponent(toDatasetId)}/photos`, { method: 'POST', body: JSON.stringify({ fromDatasetId, photoId }) }); state.builderDatasetId = toDatasetId; await load(); toast('Image moved between datasets; global photo preserved.') } catch (error) { toast(error.message, true) } return }
  const editQuestionId = event.target.dataset.editQuestion; if (editQuestionId) { const current = state.data.arena.questionBank.find(item => item.id === editQuestionId); const text = window.prompt('Question', current.text); if (text == null) return; const expectedAnswer = window.prompt('Expected answer (optional)', current.expectedAnswer || ''); if (expectedAnswer == null) return; const notes = window.prompt('Human notes / provenance', current.notes || ''); if (notes == null) return; try { await api(`/api/arena/questions/${encodeURIComponent(editQuestionId)}`, { method: 'PATCH', body: JSON.stringify({ text, expectedAnswer, expectedAnswerSource: current.expectedAnswerSource, notes }) }); await load(); toast('Mutable question updated.') } catch (error) { toast(error.message, true) } return }
  const duplicateQuestionId = event.target.dataset.duplicateQuestion; if (duplicateQuestionId) { try { await api(`/api/arena/questions/${encodeURIComponent(duplicateQuestionId)}/duplicate`, { method: 'POST', body: JSON.stringify({ benchmarkSetId: '' }) }); await load(); toast('Question duplicated as a mutable copy.') } catch (error) { toast(error.message, true) } return }
  const toggleSetQuestion = event.target.dataset.toggleSetQuestion; if (toggleSetQuestion) { const [setId, questionId, action] = toggleSetQuestion.split(':'); try { await api(`/api/arena/benchmark-sets/${encodeURIComponent(setId)}/questions`, { method: action === 'add' ? 'POST' : 'DELETE', body: JSON.stringify({ questionId }) }); await load(); toast(action === 'add' ? 'Question added to benchmark set.' : 'Question removed from benchmark set.') } catch (error) { toast(error.message, true) } return }
  const deleteQuestionId = event.target.dataset.deleteQuestion; if (deleteQuestionId) { if (!window.confirm('Delete this mutable question from the question bank? Locked versions and historical evidence cannot be changed.')) return; try { await api(`/api/arena/questions/${encodeURIComponent(deleteQuestionId)}`, { method: 'DELETE', body: '{}' }); await load(); toast('Mutable question deleted.') } catch (error) { toast(error.message, true) } return }
  const validateSetId = event.target.dataset.validateSet; if (validateSetId) { try { const result = await api(`/api/arena/benchmark-sets/${encodeURIComponent(validateSetId)}/validate`); toast(result.valid ? 'Server-side validation passed.' : result.blockers.join('; '), !result.valid) } catch (error) { toast(error.message, true) } return }
  const previewLockId = event.target.dataset.previewLock; if (previewLockId) { try { const set = state.data.arena.builder.benchmarkSets.find(item => item.id === previewLockId); const preview = await api(`/api/arena/benchmark-sets/${encodeURIComponent(previewLockId)}/lock-preview`, { method: 'POST', body: JSON.stringify({ version: set.version, providerIds: state.data.arena.primaryProviderIds, outputBudget: set.outputBudget || 64 }) }); const summary = `IRREVERSIBLE LOCK\nVersion: ${preview.version}\nQuestions: ${preview.questionCount}\nUnique images: ${preview.uniqueImages}\nExpected answers: ${preview.expectedAnswers}\nRoster: ${preview.providerIds.join(', ')}\nBudget: ${preview.outputBudget}\nSHA-256: ${preview.lockHash}\n\nLock this version?`; if (!window.confirm(summary)) return; await api(`/api/arena/benchmark-sets/${encodeURIComponent(previewLockId)}/lock`, { method: 'POST', body: JSON.stringify({ confirm: true, version: preview.version, providerIds: preview.providerIds, outputBudget: preview.outputBudget }) }); await load(); toast('Benchmark version locked. It is now immutable.') } catch (error) { toast(error.message, true) } return }
  const cloneSetId = event.target.dataset.cloneSet; if (cloneSetId) { const version = window.prompt('New version', '1.1.0-draft'); if (!version) return; try { const result = await api(`/api/arena/benchmark-sets/${encodeURIComponent(cloneSetId)}/clone`, { method: 'POST', body: JSON.stringify({ version }) }); state.builderSetId = result.set.id; await load(); toast('New mutable version cloned; locked history unchanged.') } catch (error) { toast(error.message, true) } return }
  const batchFromLocked = event.target.dataset.createBatchFromLocked; if (batchFromLocked) { const set = state.data.arena.builder.benchmarkSets.find(item => item.id === batchFromLocked); try { const result = await api('/api/arena/batches', { method: 'POST', body: JSON.stringify({ benchmarkSetId: set.id, providerIds: state.data.arena.primaryProviderIds, locked: true, version: set.version, outputBudget: set.outputBudget || 64 }) }); await load(); toast(`Primary batch ${result.batch.id} created but not run.`) } catch (error) { toast(error.message, true) } return }
  const arenaVerdict = event.target.dataset.arenaVerdict; if (arenaVerdict) { const [blindLabel, verdict] = arenaVerdict.split(':'); const note = document.querySelector(`[data-arena-note="${blindLabel}"]`)?.value || ''; try { await api(`/api/arena/rounds/${encodeURIComponent(state.data.arena.currentRound.id)}/judgments`, { method: 'POST', body: JSON.stringify({ blindLabel, verdict, note, judgeProviderId: 'USER_JUDGE' }) }); await load(); toast(`Answer ${blindLabel} judged ${verdict.replaceAll('_',' ')}.`) } catch (error) { toast(error.message, true) } return }
  const queueVerdict = event.target.dataset.queueVerdict; if (queueVerdict) { const [roundId, blindLabel, verdict] = queueVerdict.split(':'); const note = document.querySelector(`[data-queue-note="${roundId}:${blindLabel}"]`)?.value || ''; try { await api(`/api/arena/rounds/${encodeURIComponent(roundId)}/judgments`, { method: 'POST', body: JSON.stringify({ blindLabel, verdict, note, judgeProviderId: 'USER_JUDGE' }) }); await load(); toast(`Answer ${blindLabel} judged ${verdict.replaceAll('_',' ')}.`) } catch (error) { toast(error.message, true) } return }
  const queueReveal = event.target.dataset.queueReveal; if (queueReveal) { try { await api(`/api/arena/rounds/${encodeURIComponent(queueReveal)}/reveal`, { method: 'POST', body: JSON.stringify({ early: false }) }); await load(); toast('Round revealed after complete blind judging.') } catch (error) { toast(error.message, true) } return }
  const queueRevealEarly = event.target.dataset.queueRevealEarly; if (queueRevealEarly) { if (!window.confirm('Reveal before every answer is judged? This permanently marks the round NON_BLIND and excludes it from primary ranking.')) return; try { await api(`/api/arena/rounds/${encodeURIComponent(queueRevealEarly)}/reveal`, { method: 'POST', body: JSON.stringify({ early: true }) }); await load(); toast('Round revealed early and marked NON_BLIND.', true) } catch (error) { toast(error.message, true) } return }
  const arenaReveal = event.target.dataset.arenaReveal; if (arenaReveal) { try { await api(`/api/arena/rounds/${encodeURIComponent(state.data.arena.currentRound.id)}/reveal`, { method: 'POST', body: JSON.stringify({ early: arenaReveal === 'early' }) }); await load(); toast(arenaReveal === 'early' ? 'Models revealed; round marked NON_BLIND_REVIEW.' : 'Blind review complete. Models revealed.') } catch (error) { toast(error.message, true) } return }
  const arenaCreateBatch = event.target.dataset.arenaCreateBatch; if (arenaCreateBatch) { try { const result = await api('/api/arena/batches', { method: 'POST', body: JSON.stringify({ benchmarkSetId: arenaCreateBatch, providerIds: [...state.arenaProviderIds], locked: true, outputBudget: 64 }) }); await load(); toast(`Locked batch ${result.batch.id} created. It has not been run.`) } catch (error) { toast(error.message, true) } return }
  const arenaRunBatch = event.target.dataset.arenaRunBatch; if (arenaRunBatch) { state.elapsedTimer = setInterval(() => void load().catch(() => {}), 750); try { await api(`/api/arena/batches/${encodeURIComponent(arenaRunBatch)}/run`, { method: 'POST', body: '{}' }); await load(); toast('Batch execution reached a terminal state; review completed evidence and any failures.') } catch (error) { await load(); toast(error.message, true) } finally { clearInterval(state.elapsedTimer) } return }
  const arenaCancelBatch = event.target.dataset.arenaCancelBatch; if (arenaCancelBatch) { try { await api(`/api/arena/batches/${encodeURIComponent(arenaCancelBatch)}/cancel`, { method: 'POST', body: '{}' }); toast('Batch cancellation requested; completed evidence is preserved.'); await load() } catch (error) { toast(error.message, true) } return }
  const vqaReview = event.target.dataset.vqaReview; if (vqaReview) { const [id, verdict] = vqaReview.split(':'); const humanNote = document.querySelector(`[data-vqa-note="${id}"]`)?.value || undefined; await saveSemanticReview(id, verdict, undefined, humanNote) }
  const semanticReview = event.target.dataset.semanticReview; if (semanticReview) { const [id, verdict] = semanticReview.split(':'); const correctedText = document.querySelector(`[data-semantic-correction="${id}"]`)?.value || undefined; const humanNote = document.querySelector(`[data-human-note="${id}"]`)?.value || undefined; await saveSemanticReview(id, verdict, correctedText, humanNote) }
  const quickTask = event.target.closest('[data-quick-task]')?.dataset.quickTask; if (quickTask) { state.quickTruthTaskId = quickTask; render() }
  const quickTruth = event.target.dataset.quickTruth; if (quickTruth) { const separator = quickTruth.indexOf('|'); const inferenceId = quickTruth.slice(0, separator); const correctLabel = quickTruth.slice(separator + 1); const inference = state.data.inferences.find(item => item.id === inferenceId); const verdict = inference.validationResult === 'VALID' && inference.normalizedOutput === correctLabel ? 'CORRECT' : 'WRONG'; await saveReview(inferenceId, verdict, verdict === 'WRONG' ? correctLabel : undefined) }
  const saveTruth = event.target.dataset.saveGroundTruth; if (saveTruth) {
    const inference = state.data.inferences.find(item => item.id === saveTruth)
    const correctLabel = document.querySelector(`[data-ground-truth-select="${saveTruth}"]`).value
    if (!correctLabel) return toast('Choose the correct label first.', true)
    const verdict = inference.validationResult === 'VALID' && inference.normalizedOutput === correctLabel ? 'CORRECT' : 'WRONG'
    await saveReview(saveTruth, verdict, verdict === 'WRONG' ? correctLabel : undefined)
  }
  const inferenceId = event.target.dataset.openInference; if (inferenceId) { state.openInference = state.openInference === inferenceId ? null : inferenceId; render() }
  const wrongToggle = event.target.dataset.wrongToggle; if (wrongToggle) document.querySelector(`[data-wrong="${wrongToggle}"]`).classList.toggle('hidden')
  const review = event.target.dataset.review; if (review) { const [id, verdict] = review.split(':'); await saveReview(id, verdict) }
  const wrong = event.target.dataset.saveWrong; if (wrong) await saveReview(wrong, 'WRONG', document.querySelector(`[data-wrong="${wrong}"] select`).value)
  const runId = event.target.closest('[data-run-id]')?.dataset.runId; if (runId) { state.selectedPhotos.clear(); state.selectedRunId = runId; await load(runId); document.querySelector('#photos').scrollIntoView() }
})

$('#dataset-create-form').addEventListener('submit', async event => { event.preventDefault(); try { const result = await api('/api/arena/datasets', { method: 'POST', body: JSON.stringify({ name: $('#builder-dataset-name').value, description: $('#builder-dataset-description').value }) }); state.builderDatasetId = result.dataset.id; event.target.reset(); await load(); toast('Dataset created.') } catch (error) { toast(error.message, true) } })
$('#benchmark-set-create-form').addEventListener('submit', async event => { event.preventDefault(); try { const result = await api('/api/arena/benchmark-sets', { method: 'POST', body: JSON.stringify({ name: $('#benchmark-set-name').value, version: $('#benchmark-set-version').value }) }); state.builderSetId = result.set.id; event.target.reset(); $('#benchmark-set-version').value = '1.0.0-draft'; await load(); toast('Mutable benchmark set created.') } catch (error) { toast(error.message, true) } })
$('#question-create-form').addEventListener('submit', async event => { event.preventDefault(); try { await api('/api/arena/questions', { method: 'POST', body: JSON.stringify({ datasetId: $('#builder-question-dataset').value, photoId: $('#builder-question-photo').value, text: $('#builder-question-text').value, category: $('#builder-question-category').value, expectedAnswer: $('#builder-expected-answer').value, expectedAnswerSource: $('#builder-expected-source').value, notes: $('#builder-question-notes').value, benchmarkSetId: $('#builder-question-set').value || undefined }) }); event.target.reset(); await load(); toast('Question validated and saved.') } catch (error) { toast(error.message, true) } })
$('#builder-image-input').addEventListener('change', async event => { const files = [...event.target.files]; if (!state.builderDatasetId) return toast('Select or create a dataset first.', true); try { for (const file of files) await api('/api/photos/import', { method: 'POST', body: JSON.stringify({ datasetId: state.builderDatasetId, filename: file.name, relativePath: file.webkitRelativePath || file.name, mimeType: file.type, lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null, dataBase64: arrayBufferToBase64(await file.arrayBuffer()) }) }); await load(); toast(`${files.length} image(s) imported through the validated pipeline.`) } catch (error) { toast(error.message, true) } finally { event.target.value = '' } })
$('#builder-reuse-photo-button').addEventListener('click', async () => { const photoId = $('#builder-reuse-photo').value; if (!photoId || !state.builderDatasetId) return toast('Select a dataset and an existing image.', true); try { await api(`/api/arena/datasets/${encodeURIComponent(state.builderDatasetId)}/photos`, { method: 'POST', body: JSON.stringify({ photoId }) }); await load(); toast('Existing PawVault image reused without duplication.') } catch (error) { toast(error.message, true) } })
$('#question-import-input').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; const body = { format: file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json', content: await file.text(), benchmarkSetId: state.builderSetId }; try { const preview = await api('/api/arena/questions/import/preview', { method: 'POST', body: JSON.stringify(body) }); state.pendingQuestionImport = body; $('#question-import-preview').textContent = JSON.stringify(preview, null, 2); if (preview.invalidRows) { if (!window.confirm(`Preview: ${preview.validRows} valid and ${preview.invalidRows} invalid row(s). Explicitly import only valid rows and skip invalid ones?`)) return; await api('/api/arena/questions/import', { method: 'POST', body: JSON.stringify({ ...body, allowPartial: true }) }); await load(); toast('Partial import explicitly confirmed; invalid rows were skipped.') } else if (window.confirm(`Preview complete: ${preview.validRows} valid rows. Import atomically now?`)) { await api('/api/arena/questions/import', { method: 'POST', body: JSON.stringify(body) }); await load(); toast('Bulk questions imported atomically.') } } catch (error) { toast(error.message, true) } finally { event.target.value = '' } })
$('#review-prev').addEventListener('click', () => { state.reviewIndex = Math.max(0, state.reviewIndex - 1); render() })
$('#review-next').addEventListener('click', () => { state.reviewIndex = Math.min((state.data.arena.builder.reviewQueue.rounds.length || 1) - 1, state.reviewIndex + 1); render() })
$('#review-export').addEventListener('click', async () => { const rounds = state.data.arena.builder.reviewQueue.rounds.map(item => item.id); if (!rounds.length) return toast('No unrevealed completed rounds to export.', true); try { await downloadPost('/api/arena/reviews/export', { roundIds: rounds }, 'qvac-blind-human-review.json'); toast('Blind review template exported without provider identities.') } catch (error) { toast(error.message, true) } })
$('#review-import-input').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; try { const payload = JSON.parse(await file.text()); const preview = await api('/api/arena/reviews/import/preview', { method: 'POST', body: JSON.stringify(payload) }); state.pendingReviewImport = payload; $('#review-import-preview').textContent = JSON.stringify(preview, null, 2); if (preview.valid && window.confirm(`Import ${preview.judgmentCount} blind human judgments atomically for ${preview.judgeId}?`)) { await api('/api/arena/reviews/import', { method: 'POST', body: JSON.stringify(payload) }); await load(); toast('Blind human judgments imported with audit provenance.') } } catch (error) { toast(error.message, true) } finally { event.target.value = '' } })

$('#arena-create').addEventListener('click', async () => {
  try {
    const result = await api('/api/arena/rounds', { method: 'POST', body: JSON.stringify({ datasetId: state.arenaDatasetId, photoId: state.arenaPhotoId, question: $('#arena-question').value, category: $('#arena-category').value, expectedAnswer: $('#arena-expected').value, outputBudget: Number($('#arena-budget').value), providerIds: [...state.arenaProviderIds], saveQuestion: $('#arena-save-question').checked }) })
    state.selectedRunId = result.round.runId; await load(result.round.runId); toast('Blind round created. Nothing has run yet.')
  } catch (error) { toast(error.message, true) }
})
$('#arena-run').addEventListener('click', async () => {
  const round = state.data.arena.currentRound; state.busy = true; render(); state.elapsedTimer = setInterval(() => void load(round.runId).catch(() => {}), 750)
  try { await api(`/api/arena/rounds/${encodeURIComponent(round.id)}/run`, { method: 'POST', body: '{}' }); toast('Blind answers ready for review.') }
  catch (error) { toast(error.message, true) }
  finally { clearInterval(state.elapsedTimer); state.busy = false; await load(round.runId) }
})
$('#arena-cancel').addEventListener('click', async () => { try { const round = state.data.arena.currentRound; await api(`/api/runs/${encodeURIComponent(round.runId)}/cancel`, { method: 'POST', body: '{}' }); await load(round.runId); toast('Arena run cancelled; completed evidence was preserved.') } catch (error) { toast(error.message, true) } })
$('#arena-audit').addEventListener('click', async () => {
  const output = $('#arena-audit-result'); output.textContent = 'Verifying local artifacts and providers…'
  try { const level = $('#arena-audit-level').value; const report = await api(`/api/arena/readiness?benchmarkSetId=${encodeURIComponent(state.builderSetId || 'real_world_vision_arena_v1')}&level=${encodeURIComponent(level)}`); state.arenaReadiness = report; output.textContent = `${report.verdict}\n${report.checks.map(item => `${item.ok ? '✓' : '✕'} ${item.id} — ${item.detail}${item.blocking ? '' : ' · ranking-only'}`).join('\n')}`; render(); toast(['BENCHMARK_READY','EXPLORATORY_READY'].includes(report.verdict) ? `${report.verdict.replaceAll('_',' ')}.` : `Readiness blocked by ${report.blockers.length} item(s).`, report.verdict === 'BLOCKED') }
  catch (error) { output.textContent = error.message; toast(error.message, true) }
})

$('#create-vqa-run').addEventListener('click', async () => {
  try {
    const result = await api('/api/vqa/runs', { method: 'POST', body: JSON.stringify({ presetId: state.vqaPresetId, datasetId: state.vqaDatasetId, photoIds: [...state.vqaPhotoIds], questions: state.vqaQuestions, providerIds: [...state.vqaProviderIds] }) })
    state.selectedRunId = result.run.id
    await load(result.run.id)
    toast('Visual Q&A draft created. Review the exact questions, then run it.')
  } catch (error) { toast(error.message, true) }
})
$('#start-vqa-run').addEventListener('click', async () => {
  state.busy = true; render(); state.elapsedTimer = setInterval(() => void load(state.selectedRunId).catch(() => {}), 750)
  try { const result = await api(`/api/vqa/runs/${encodeURIComponent(state.data.currentRun.id)}/analyze`, { method: 'POST', body: '{}' }); toast(`${result.run.completedPredictions} VQA answers complete.`) }
  catch (error) { toast(error.message, true) }
  finally { clearInterval(state.elapsedTimer); state.busy = false; await load(state.selectedRunId) }
})
$('#cancel-vqa-run').addEventListener('click', () => $('#cancel-run').click())
$('#save-finding').addEventListener('click', async () => { try { await api(`/api/runs/${encodeURIComponent(state.data.currentRun.id)}/shareable-finding`, { method: 'PATCH', body: JSON.stringify({ shareableFinding: $('#shareable-finding').value }) }); toast('Shareable finding saved.'); await load() } catch (error) { toast(error.message, true) } })

$('#start-focused-base').addEventListener('click', async () => {
  const run = state.data.currentRun
  if (run?.status !== 'DRAFT') return toast(run?.status === 'RUNNING' ? 'The current run is still running. The preset cannot be changed.' : 'Start New Run before choosing a preset.', true)
  const result = await api(`/api/runs/${encodeURIComponent(run.id)}/preset`, { method: 'PATCH', body: JSON.stringify({ benchmarkPreset: 'focused_base_v1' }) })
  state.activePresetId = 'focused_base_v1'; state.selectedProviderId = 'visionpsy-patched-base'; state.selectedTasks = new Set(state.data.benchmarkPresets[0].coreTaskIds); state.selectedPhotos = new Set(run.photoIds); state.benchmarkScope = 'quick'; state.quickTruthTaskId = null
  await load(result.run.id); toast('Focused Standard Benchmark v1 applied. Review the summary, then start the benchmark.')
})
$('#choose-semantic').addEventListener('click', async () => {
  const run = state.data.currentRun
  if (run?.status !== 'DRAFT') return toast(run?.status === 'RUNNING' ? 'The current run is still running.' : 'Start New Run before choosing a preset.', true)
  const result = await api(`/api/runs/${encodeURIComponent(run.id)}/preset`, { method: 'PATCH', body: JSON.stringify({ benchmarkPreset: 'semantic_extraction_v1' }) })
  const preset = state.data.benchmarkPresets.find(item => item.id === 'semantic_extraction_v1')
  state.activePresetId = preset.id; state.selectedProviderId = preset.providerId; state.selectedTasks = new Set(preset.coreTaskIds); state.selectedPhotos = new Set(result.run.semanticQuickPhotoIds); state.benchmarkScope = 'quick'; state.quickTruthTaskId = null
  await load(result.run.id); toast('Semantic Extraction Benchmark v1 applied. Quick 20 selected; no benchmark started.')
})
$('#choose-minimal-semantic').addEventListener('click', async () => {
  try {
    let run = state.data.currentRun
    if (run?.status !== 'DRAFT') {
      const photoIds = run?.workingPhotoIds || run?.photoIds || []
      const fresh = await api('/api/runs', { method: 'POST', body: JSON.stringify({ photoIds }) })
      await load(fresh.run.id)
      run = fresh.run
    }
    const result = await api(`/api/runs/${encodeURIComponent(run.id)}/preset`, { method: 'PATCH', body: JSON.stringify({ benchmarkPreset: 'minimal_smart_semantic_v2' }) })
    const preset = state.data.benchmarkPresets.find(item => item.id === 'minimal_smart_semantic_v2')
    state.activePresetId = preset.id; state.selectedProviderId = preset.providerId; state.selectedTasks = new Set(preset.coreTaskIds); state.selectedPhotos = new Set(result.run.minimalQuickPhotoIds); state.benchmarkScope = 'quick'; state.quickTruthTaskId = null
    await load(result.run.id); toast('Minimal Smart Semantic Test v2 applied. Exactly 10 photos selected; no benchmark started.')
  } catch (error) { toast(error.message, true) }
})
$('#start-new-run').addEventListener('click', async () => { const fresh = await api('/api/runs', { method: 'POST', body: '{}' }); state.selectedRunId = fresh.run.id; state.activePresetId = null; state.selectedTasks.clear(); state.selectedPhotos.clear(); state.openInference = null; state.quickTruthTaskId = null; await load(fresh.run.id); toast('New empty run ready. Earlier photos remain in the archive.') })
$('#show-archive').addEventListener('click', () => { state.showArchive = true; render(); $('#archive-section').scrollIntoView() })
$('#hide-archive').addEventListener('click', () => { state.showArchive = false; render() })
$('#select-all').addEventListener('click', () => { const all = state.selectedPhotos.size === state.data.photos.length; state.selectedPhotos = new Set(all ? [] : state.data.photos.map(photo => photo.id)); render() })
$('#select-core').addEventListener('click', () => { const preset = activePreset(); state.selectedTasks = new Set(preset ? preset.coreTaskIds : state.data.tasks.filter(task => task.status === 'CORE_CANDIDATE').map(task => task.id)); render() })
$('#start-benchmark').addEventListener('click', () => startAnalysis({ presetMode: true }))
$('#start-semantic-benchmark').addEventListener('click', () => startAnalysis({ presetMode: true }))
$('#start-minimal-semantic').addEventListener('click', () => startAnalysis({ presetMode: true }))
$('#analyze-button').addEventListener('click', () => startAnalysis({ presetMode: false }))
$('#start-full-after-quick').addEventListener('click', async () => {
  try {
    const sourceIds = state.data.currentRun.workingPhotoIds || state.data.currentRun.photoIds
    const fresh = await api('/api/runs', { method: 'POST', body: JSON.stringify({ benchmarkPreset: 'focused_base_v1', photoIds: sourceIds }) })
    state.selectedRunId = fresh.run.id; state.activePresetId = 'focused_base_v1'; state.selectedProviderId = 'visionpsy-patched-base'; state.selectedTasks = new Set(state.data.benchmarkPresets[0].coreTaskIds); state.selectedPhotos = new Set(sourceIds); state.benchmarkScope = 'full'
    await load(fresh.run.id)
    await startAnalysis({ presetMode: true })
  } catch (error) { toast(error.message, true) }
})

async function startAnalysis({ presetMode }) {
  const preset = activePreset()
  const sourcePhotoIds = preset?.mode === 'minimal-semantic' ? state.data.currentRun.minimalQuickPhotoIds : preset?.mode === 'semantic' && state.benchmarkScope === 'quick' ? state.data.currentRun.semanticQuickPhotoIds : state.data.currentRun.photoIds
  const photoIds = presetMode ? scopePhotoIds(sourcePhotoIds, state.benchmarkScope, preset.quickLimit) : [...state.selectedPhotos]
  const taskIds = presetMode ? [...preset.coreTaskIds, ...(preset.experimentalTaskIds || []).filter(id => state.selectedTasks.has(id))] : [...state.selectedTasks]
  state.busy = true; render(); $('#run-status').textContent = `Loading ${state.selectedProviderId} and analyzing locally…`
  state.elapsedTimer = setInterval(() => { void load(state.selectedRunId).catch(() => {}) }, 750)
  try {
    const result = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ runId: state.data.currentRun.id, providerId: state.selectedProviderId, photoIds, taskIds, runScope: presetMode ? state.benchmarkScope : 'full' }) })
    toast(`${result.run.completedPredictions} predictions complete${result.run.failedPredictions ? `, ${result.run.failedPredictions} failed` : ''}.`, Boolean(result.run.failedPredictions)); $('#run-status').textContent = `${result.run.id} · completed in ${formatDuration(result.run.durationMs)}.`
  } catch (error) { toast(error.message, true); $('#run-status').textContent = error.message } finally { clearInterval(state.elapsedTimer); state.busy = false; await load(state.selectedRunId) }
}
$('#cancel-run').addEventListener('click', async () => { try { await api(`/api/runs/${encodeURIComponent(state.data.currentRun.id)}/cancel`, { method: 'POST', body: '{}' }); toast('Run cancelled. Completed results were preserved.'); state.busy = false; clearInterval(state.elapsedTimer); await load(state.selectedRunId) } catch (error) { toast(error.message, true) } })

async function savePhoto(id, patch) { try { await api(`/api/photos/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); await load() } catch (error) { toast(error.message, true) } }
async function saveReview(inferenceId, verdict, correctLabel) { try { await api('/api/reviews', { method: 'POST', body: JSON.stringify({ inferenceId, verdict, correctLabel }) }); toast('Human review saved.'); await load() } catch (error) { toast(error.message, true) } }
async function saveSemanticReview(inferenceId, verdict, correctedText, humanNote) { try { await api('/api/reviews', { method: 'POST', body: JSON.stringify({ inferenceId, verdict, correctedText, humanNote }) }); toast('Semantic review saved.'); await load() } catch (error) { toast(error.message, true) } }
function activePreset() { return state.data?.benchmarkPresets?.find(item => item.id === state.activePresetId) || null }
function currentTaskIds(preset) { return preset ? [...preset.coreTaskIds, ...preset.experimentalTaskIds] : (state.data.currentRun?.taskIds || []) }
function shortTaskName(name='') { return name.replace('Dog on human furniture', 'On sofa / armchair').replace('Dog on dog bed', 'On dog bed').replace('Dog near bowl', 'Near bowl').replace('Dog on grass', 'On grass').replace('Dog with toy · experimental', 'Dog with toy') }
function friendlyStage(stage='') { const value = stage.replaceAll('_',' ').toLowerCase(); if (value.includes('preprocessing') || value.includes('image read')) return 'preprocessing'; if (value.includes('provider') || value.includes('prompt') || value.includes('model') || value.includes('output byte')) return 'inference'; if (value.includes('normalization') || value.includes('parsing')) return 'normalization'; if (value.includes('persistence')) return 'persistence'; return value || 'initializing' }
function durationMinutes(value) { return Math.max(1, Math.round(value / 60000)) }
function percent(value) { return value == null ? '—' : `${Math.round(value * 100)}%` }
function formatDate(value) { if (!value) return 'Capture date unavailable'; const date = new Date(value); return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date) }
function formatDateTime(value) { if (!value) return '—'; return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
function formatDuration(value) { if (!Number.isFinite(value)) return '—'; if (value < 1000) return `${value} ms`; const seconds = Math.round(value / 1000); return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}` }
function arrayBufferToBase64(buffer) { const bytes = new Uint8Array(buffer); let binary = ''; for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(binary) }
function escapeHtml(value='') { return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])) }
function escapeAttr(value='') { return escapeHtml(value) }
function stageLine(name, stage) { const symbol = stage?.status === 'ok' ? '✓' : stage?.status === 'failed' ? '✗' : '–'; return `${symbol} ${name}${stage?.error ? ` · ${escapeHtml(stage.error)}` : ''}<br>` }
let toastTimer
function toast(message, error=false) { const element=$('#toast'); element.textContent=message; element.className=`toast show${error?' error':''}`; clearTimeout(toastTimer); toastTimer=setTimeout(()=>element.className='toast',4200) }

load().catch(error => toast(error.message, true))
