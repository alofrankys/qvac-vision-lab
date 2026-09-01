export const QUICK_VALIDATION_LIMIT = 10

export function presetSelection(preset) {
  return {
    providerId: preset.providerId,
    enabledTaskIds: [...preset.coreTaskIds],
    experimentalTaskIds: [...preset.experimentalTaskIds]
  }
}

export function scopePhotoIds(photoIds, scope, quickLimit = QUICK_VALIDATION_LIMIT) {
  return scope === 'quick' ? photoIds.slice(0, quickLimit) : [...photoIds]
}

export function predictionCount(photoIds, taskIds) {
  return photoIds.length * taskIds.length
}

export function durationRange(predictions, timing) {
  if (!timing || timing.sampleCount < 3 || !Number.isFinite(timing.p25TaskMs) || !Number.isFinite(timing.p75TaskMs)) return null
  return { minMs: predictions * timing.p25TaskMs, maxMs: predictions * timing.p75TaskMs }
}

export function benchmarkProgress(run) {
  const completed = (run.completedPredictions || 0) + (run.failedPredictions || 0)
  const total = run.expectedPredictions ?? (run.photoCount || 0) * (run.taskCount || 0)
  const taskIndex = run.currentTaskId && run.taskIds?.includes(run.currentTaskId) ? run.taskIds.indexOf(run.currentTaskId) + 1 : 0
  const photoIndex = Math.min((run.completedPhotos || 0) + (run.status === 'RUNNING' ? 1 : 0), run.photoCount || 0)
  return { completed, total, taskIndex, photoIndex }
}

export function benchmarkCardState({ photos, tasks, preset, scope = 'quick', timing = null }) {
  const selection = presetSelection(preset)
  const selectedPhotos = scopePhotoIds(photos, scope, preset.quickLimit || QUICK_VALIDATION_LIMIT)
  const predictions = predictionCount(selectedPhotos, selection.enabledTaskIds)
  return { ...selection, selectedPhotos, predictions, duration: durationRange(predictions, timing) }
}
