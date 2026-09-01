import test from 'node:test'
import assert from 'node:assert/strict'
import { addAiAssistedReviews, upsertGroundTruth } from '../src/annotations/index.mjs'

test('human ground truth is shared by photo/task and independent of provider', () => {
  const annotations = []
  const inferenceA = { photoId: 'photo-1', taskId: 'environment', normalizedOutput: 'indoor', providerId: 'qvac-smolvlm2' }
  const inferenceB = { ...inferenceA, normalizedOutput: 'outdoor', providerId: 'visionpsy-patched' }

  upsertGroundTruth(annotations, inferenceA, { id: 'review-1', groundTruthSource: 'HUMAN_CONFIRMED', reviewedAt: '2026-01-01', correctLabel: 'outdoor' })
  upsertGroundTruth(annotations, inferenceB, { id: 'review-2', groundTruthSource: 'HUMAN_CONFIRMED', reviewedAt: '2026-01-02', correctLabel: 'indoor' })

  assert.equal(annotations.length, 1)
  assert.deepEqual(annotations[0], {
    id: 'review-1', photoId: 'photo-1', taskId: 'environment', correctLabel: 'indoor', source: 'HUMAN_CONFIRMED', updatedAt: '2026-01-02'
  })
})

test('AI-assisted batch fills only missing human labels and records explicit provenance', () => {
  const state = {
    runs: [{ id: 'run-1', status: 'COMPLETED' }],
    inferences: [
      { id: 'i1', runId: 'run-1', photoId: 'p1', taskId: 'environment', validationResult: 'VALID', normalizedOutput: 'indoor' },
      { id: 'i2', runId: 'run-1', photoId: 'p1', taskId: 'posture', validationResult: 'VALID', normalizedOutput: 'standing' }
    ],
    annotations: [{ photoId: 'p1', taskId: 'environment', correctLabel: 'outdoor', source: 'HUMAN_CONFIRMED' }],
    reviews: []
  }
  let id = 0
  const result = addAiAssistedReviews(state, { runId: 'run-1', labels: [
    { photoId: 'p1', taskId: 'environment', correctLabel: 'indoor' },
    { photoId: 'p1', taskId: 'posture', correctLabel: 'lying' }
  ], reviewedAt: '2026-08-13T00:00:00.000Z', idFactory: () => `ai-${++id}` })
  assert.equal(result.skippedHuman, 1)
  assert.equal(result.created.length, 1)
  assert.deepEqual(state.reviews[0], { id: 'ai-1', inferenceId: 'i2', verdict: 'WRONG', correctLabel: 'lying', groundTruthSource: 'AI_ASSISTED', reviewSource: 'CODEX_VISUAL_REVIEW', reviewedAt: '2026-08-13T00:00:00.000Z' })
  assert.equal(state.annotations.length, 1)

  const repeated = addAiAssistedReviews(state, { runId: 'run-1', labels: [{ photoId: 'p1', taskId: 'posture', correctLabel: 'lying' }], idFactory: () => 'duplicate' })
  assert.equal(repeated.created.length, 0)
  assert.equal(repeated.skippedExisting, 1)
  assert.equal(state.reviews.length, 1)
})
