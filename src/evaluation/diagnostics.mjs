export function percentile(values, fraction) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

export function calculateRunTimings(run, inferences = []) {
  const taskMs = inferences.map(item => item.latencyMs).filter(Number.isFinite)
  const warmMs = inferences.map(item => item.runtimeStats?.warmInferenceMs).filter(Number.isFinite)
  const photoGroups = Map.groupBy(inferences.filter(item => item.startedAt && item.finishedAt), item => item.photoId)
  const photoMs = [...photoGroups.values()].map(items => {
    const start = Math.min(...items.map(item => Date.parse(item.startedAt)))
    const end = Math.max(...items.map(item => Date.parse(item.finishedAt)))
    return end - start
  })
  const startMs = Date.parse(run.startedAt)
  const finishMs = Date.parse(run.finishedAt)
  return {
    totalRunMs: Number.isFinite(finishMs - startMs) ? finishMs - startMs : null,
    modelLoadMs: run.modelLoadMs ?? null,
    timeToFirstResultMs: run.firstResultAt ? Date.parse(run.firstResultAt) - startMs : null,
    totalInferenceMs: taskMs.length ? taskMs.reduce((sum, value) => sum + value, 0) : 0,
    avgPhotoMs: photoMs.length ? Math.round(photoMs.reduce((sum, value) => sum + value, 0) / photoMs.length) : null,
    p50PhotoMs: percentile(photoMs, 0.5),
    p95PhotoMs: percentile(photoMs, 0.95),
    avgTaskMs: taskMs.length ? Math.round(taskMs.reduce((sum, value) => sum + value, 0) / taskMs.length) : null,
    avgWarmInferenceMs: warmMs.length ? Math.round(warmMs.reduce((sum, value) => sum + value, 0) / warmMs.length) : null,
    modelShutdownMs: run.modelShutdownMs ?? null
  }
}

export function detectAnomalies(inferences = []) {
  const warnings = []
  for (const [taskId, items] of Map.groupBy(inferences, item => item.taskId)) {
    if (!items.length) continue
    const counts = Object.groupBy(items, item => item.normalizedOutput ?? '__invalid__')
    const dominant = Object.entries(counts).sort((a, b) => b[1].length - a[1].length)[0]
    if (items.length >= 3 && dominant[1].length / items.length >= 0.9) warnings.push({ code: 'LABEL_CONCENTRATION', taskId, message: `${taskId} returned "${dominant[0]}" for ${dominant[1].length}/${items.length} photos. Possible output collapse or task failure.` })
    const invalid = items.filter(item => item.validationResult === 'INVALID_OUTPUT').length
    if (invalid / items.length >= 0.25) warnings.push({ code: 'INVALID_OUTPUTS', taskId, message: `${taskId} produced ${invalid}/${items.length} invalid outputs.` })
    const fast = items.filter(item => Number.isFinite(item.latencyMs) && item.latencyMs < 10).length
    if (fast) warnings.push({ code: 'SUSPICIOUS_LATENCY', taskId, message: `${taskId} has ${fast} inference(s) below 10 ms; verify that real model work occurred.` })
  }
  const rawGroups = Object.groupBy(inferences, item => String(item.rawOutput || '').trim())
  for (const [raw, items] of Object.entries(rawGroups)) if (raw && items.length >= 5) warnings.push({ code: 'REPEATED_RAW_OUTPUT', taskId: null, message: `Identical raw output repeated ${items.length} times: "${raw.slice(0, 120)}".` })
  return warnings
}

export function summarizeRun(run, inferences, reviews = []) {
  const reviewMap = new Map(reviews.map(item => [item.inferenceId, item]))
  const taskResults = {}
  for (const [taskId, items] of Map.groupBy(inferences, item => item.taskId)) {
    const counts = {}
    for (const item of items) counts[item.normalizedOutput ?? 'invalid'] = (counts[item.normalizedOutput ?? 'invalid'] || 0) + 1
    const taskReviews = items.map(item => reviewMap.get(item.id)).filter(Boolean)
    const correct = taskReviews.filter(item => item.verdict === 'CORRECT').length
    const wrong = taskReviews.filter(item => item.verdict === 'WRONG').length
    const semanticReview = taskReviews.some(item => ['PARTIALLY_CORRECT', 'HALLUCINATED', 'UNCLEAR_IMAGE'].includes(item.verdict)) || taskId.startsWith('minimal_') || ['physical_context', 'associated_objects', 'visible_posture'].includes(taskId)
    if (semanticReview) {
      const partiallyCorrect = taskReviews.filter(item => item.verdict === 'PARTIALLY_CORRECT').length
      const hallucinated = taskReviews.filter(item => item.verdict === 'HALLUCINATED').length
      taskResults[taskId] = { counts, reviewed: taskReviews.length, correct, partiallyCorrect, wrong, hallucinated, unclearImage: taskReviews.filter(item => item.verdict === 'UNCLEAR_IMAGE').length, usefulRate: taskReviews.length ? (correct + partiallyCorrect) / taskReviews.length : null, hallucinationRate: taskReviews.length ? hallucinated / taskReviews.length : null, unreviewed: items.length - taskReviews.length }
    } else taskResults[taskId] = { counts, accuracy: correct + wrong ? correct / (correct + wrong) : null, wrong, ambiguous: taskReviews.filter(item => item.verdict === 'AMBIGUOUS').length, unreviewed: items.length - taskReviews.length }
  }
  return { runId: run.id, provider: run.providerId, photos: run.photoIds.length, predictions: inferences.length, durationMs: run.durationMs ?? null, taskResults, warnings: detectAnomalies(inferences) }
}

export function selectRunData(state, runId) {
  const run = state.runs.find(item => item.id === runId) || null
  if (!run) return { run: null, photos: [], inferences: [], reviews: [] }
  const photoIds = new Set(run.photoIds)
  const inferences = state.inferences.filter(item => item.runId === run.id)
  const inferenceIds = new Set(inferences.map(item => item.id))
  return { run, photos: state.photos.filter(item => photoIds.has(item.id)), inferences, reviews: state.reviews.filter(item => inferenceIds.has(item.inferenceId)) }
}
