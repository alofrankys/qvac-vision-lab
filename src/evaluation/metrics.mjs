import { TASKS } from '../domain/tasks.mjs'

export function latestInferences(state) {
  const latest = new Map()
  for (const item of state.inferences) {
    const key = `${item.providerId || item.provider || 'legacy'}:${item.photoId}:${item.taskId}`
    const current = latest.get(key)
    if (!current || current.createdAt < item.createdAt) latest.set(key, item)
  }
  return [...latest.values()]
}

export function latestReviews(state) {
  const latest = new Map()
  for (const item of state.reviews) {
    const current = latest.get(item.inferenceId)
    if (!current || current.reviewedAt < item.reviewedAt) latest.set(item.inferenceId, item)
  }
  return [...latest.values()]
}

export function evaluate(state) {
  const inferences = latestInferences(state)
  const reviews = latestReviews(state)
  const reviewByInference = new Map(reviews.map(item => [item.inferenceId, item]))
  const providerIds = [...new Set(inferences.map(item => item.providerId || item.provider || 'legacy'))]
  const requestedTaskIds = new Set(state.runs?.flatMap(run => run.taskIds || []) || [])
  const metricTasks = requestedTaskIds.size ? TASKS.filter(task => requestedTaskIds.has(task.id)) : TASKS
  const metrics = providerIds.flatMap(providerId => metricTasks.map(task => {
    const runs = inferences.filter(item => item.taskId === task.id && (item.providerId || item.provider || 'legacy') === providerId)
    const evaluated = runs.map(item => reviewByInference.get(item.id)).filter(Boolean)
    const correct = evaluated.filter(item => item.verdict === 'CORRECT').length
    const incorrect = evaluated.filter(item => item.verdict === 'WRONG').length
    const ambiguous = evaluated.filter(item => item.verdict === 'AMBIGUOUS').length
    const scored = correct + incorrect
    return {
      taskId: task.id,
      taskName: task.name,
      providerId,
      status: state.taskStatuses[task.id],
      samplesEvaluated: evaluated.length,
      correct,
      incorrect,
      ambiguous,
      unclearPredictions: runs.filter(item => item.normalizedOutput === 'unclear').length,
      invalidOutputs: runs.filter(item => item.validationResult === 'INVALID_OUTPUT').length,
      accuracy: scored ? correct / scored : null,
      decisionStatus: decisionStatus(scored ? correct / scored : null),
      unclearRate: runs.length ? runs.filter(item => item.normalizedOutput === 'unclear').length / runs.length : null,
      invalidOutputRate: runs.length ? runs.filter(item => item.validationResult === 'INVALID_OUTPUT').length / runs.length : null,
      averageLatencyMs: runs.length ? Math.round(runs.reduce((sum, item) => sum + (item.latencyMs || 0), 0) / runs.length) : null
    }
  }))
  const failures = reviews
    .filter(review => review.verdict === 'WRONG')
    .map(review => {
      const inference = state.inferences.find(item => item.id === review.inferenceId)
      const photo = inference && state.photos.find(item => item.id === inference.photoId)
      return inference && photo ? { review, inference, photo } : null
    })
    .filter(Boolean)
  return { metrics, failures, runs: state.runs || [] }
}

export function decisionStatus(accuracy) {
  if (!Number.isFinite(accuracy)) return 'NEEDS_MORE_DATA'
  if (accuracy >= 0.9) return 'PROMISING'
  if (accuracy >= 0.8) return 'NEEDS_MORE_DATA'
  return 'WEAK'
}
