import test from 'node:test'
import assert from 'node:assert/strict'
import { benchmarkCardState, benchmarkProgress, predictionCount, presetSelection, scopePhotoIds } from '../public/benchmark-workflow.js'
import { FOCUSED_BASE_PRESET } from '../src/domain/tasks.mjs'

const photos = Array.from({ length: 71 }, (_, index) => `photo-${String(index + 1).padStart(2, '0')}`)

test('preset selects Base and only the six core tasks', () => {
  const selection = presetSelection(FOCUSED_BASE_PRESET)
  assert.equal(selection.providerId, 'visionpsy-patched-base')
  assert.deepEqual(selection.enabledTaskIds, FOCUSED_BASE_PRESET.coreTaskIds)
  assert.deepEqual(selection.experimentalTaskIds, ['dog_with_toy'])
  assert.ok(!selection.enabledTaskIds.includes('dog_with_toy'))
})

test('prediction count follows photos times enabled tasks', () => {
  assert.equal(predictionCount(photos, FOCUSED_BASE_PRESET.coreTaskIds), 426)
})

test('quick validation uses the first ten photos deterministically', () => {
  assert.deepEqual(scopePhotoIds(photos, 'quick'), photos.slice(0, 10))
  assert.equal(benchmarkCardState({ photos, tasks: [], preset: FOCUSED_BASE_PRESET }).predictions, 60)
})

test('full benchmark keeps the complete working set', () => {
  assert.deepEqual(scopePhotoIds(photos, 'full'), photos)
  assert.equal(benchmarkCardState({ photos, tasks: [], preset: FOCUSED_BASE_PRESET, scope: 'full' }).predictions, 426)
})

test('duration estimate requires real historical samples', () => {
  assert.equal(benchmarkCardState({ photos, tasks: [], preset: FOCUSED_BASE_PRESET }).duration, null)
  assert.deepEqual(benchmarkCardState({ photos, tasks: [], preset: FOCUSED_BASE_PRESET, timing: { sampleCount: 4, p25TaskMs: 1000, p75TaskMs: 2000 } }).duration, { minMs: 60000, maxMs: 120000 })
})

test('progress uses inference-ready prediction total when preprocessing failed', () => {
  assert.deepEqual(benchmarkProgress({ status: 'RUNNING', expectedPredictions: 54, completedPredictions: 12, failedPredictions: 1, completedPhotos: 2, photoCount: 10, taskCount: 6, taskIds: ['a', 'b'], currentTaskId: 'b' }), { completed: 13, total: 54, taskIndex: 2, photoIndex: 3 })
})
