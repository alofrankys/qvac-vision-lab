import { randomUUID } from 'node:crypto'
import { TASKS } from '../domain/tasks.mjs'

export const REVIEW_VERDICTS = Object.freeze(['CORRECT', 'WRONG', 'AMBIGUOUS'])

// A prediction becomes ground truth only after CORRECT or WRONG is explicitly
// submitted by a human. AMBIGUOUS is measured but does not create ground truth.
export function isHumanGroundTruth(review) {
  return review?.groundTruthSource === 'HUMAN_CONFIRMED'
}

export function upsertGroundTruth(annotations, inference, review) {
  if (!isHumanGroundTruth(review)) return null
  const values = {
    photoId: inference.photoId,
    taskId: inference.taskId,
    correctLabel: review.correctLabel,
    source: review.groundTruthSource,
    updatedAt: review.reviewedAt
  }
  const existing = annotations.find(item => item.photoId === values.photoId && item.taskId === values.taskId)
  if (existing) Object.assign(existing, values)
  else annotations.push({ id: review.id, ...values })
  return values
}

export function addAiAssistedReviews(state, { runId, labels, reviewedAt = new Date().toISOString(), idFactory = randomUUID } = {}) {
  const run = state.runs.find(item => item.id === runId)
  if (!run) throw new Error('Run not found')
  if (!['COMPLETED', 'CANCELLED'].includes(run.status)) throw new Error('AI-assisted review requires a completed or cancelled run')
  if (!Array.isArray(labels)) throw new Error('AI-assisted labels must be an array')
  const taskById = new Map(TASKS.map(task => [task.id, task]))
  const manualPairs = new Set(state.annotations.filter(item => item.source === 'HUMAN_CONFIRMED').map(item => `${item.photoId}:${item.taskId}`))
  const inferenceByPair = new Map()
  for (const inference of state.inferences.filter(item => item.runId === runId)) inferenceByPair.set(`${inference.photoId}:${inference.taskId}`, inference)
  const existingReviewIds = new Set(state.reviews.map(item => item.inferenceId))
  const created = []
  let skippedHuman = 0
  let skippedExisting = 0
  let skippedMissingInference = 0
  for (const label of labels) {
    const task = taskById.get(label.taskId)
    if (!task || !task.labels.includes(label.correctLabel)) throw new Error(`Invalid AI-assisted label for ${label.taskId}`)
    const pair = `${label.photoId}:${label.taskId}`
    if (manualPairs.has(pair)) { skippedHuman += 1; continue }
    const inference = inferenceByPair.get(pair)
    if (!inference) { skippedMissingInference += 1; continue }
    if (existingReviewIds.has(inference.id)) { skippedExisting += 1; continue }
    const review = {
      id: idFactory(), inferenceId: inference.id,
      verdict: inference.validationResult === 'VALID' && inference.normalizedOutput === label.correctLabel ? 'CORRECT' : 'WRONG',
      correctLabel: label.correctLabel,
      groundTruthSource: 'AI_ASSISTED', reviewSource: 'CODEX_VISUAL_REVIEW', reviewedAt
    }
    state.reviews.push(review)
    existingReviewIds.add(inference.id)
    created.push(review)
  }
  return { created, skippedHuman, skippedExisting, skippedMissingInference }
}
