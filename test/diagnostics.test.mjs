import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRunTimings, detectAnomalies, selectRunData, summarizeRun } from '../src/evaluation/diagnostics.mjs'

const run = { id: 'run-a', startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:10.000Z', firstResultAt: '2026-01-01T00:00:02.000Z', modelLoadMs: 500, photoIds: ['p1', 'p2'], providerId: 'visionpsy-patched', durationMs: 10000 }
const inferences = [
  { id: 'i1', runId: 'run-a', photoId: 'p1', taskId: 'dog_count', startedAt: '2026-01-01T00:00:01.000Z', finishedAt: '2026-01-01T00:00:03.000Z', latencyMs: 2000, rawOutput: 'There appears to be one dog.', normalizedOutput: 'one', validationResult: 'VALID' },
  { id: 'i2', runId: 'run-a', photoId: 'p2', taskId: 'dog_count', startedAt: '2026-01-01T00:00:04.000Z', finishedAt: '2026-01-01T00:00:07.000Z', latencyMs: 3000, rawOutput: 'one', normalizedOutput: 'one', validationResult: 'VALID' }
]

test('timing calculations use persisted timestamps and latencies', () => {
  assert.deepEqual(calculateRunTimings(run, inferences), { totalRunMs: 10000, modelLoadMs: 500, timeToFirstResultMs: 2000, totalInferenceMs: 5000, avgPhotoMs: 2500, p50PhotoMs: 2000, p95PhotoMs: 3000, avgTaskMs: 2500, avgWarmInferenceMs: null, modelShutdownMs: null })
})

test('summary preserves raw/normalized distinction and review counts', () => {
  const summary = summarizeRun(run, inferences, [{ inferenceId: 'i1', verdict: 'WRONG' }])
  assert.equal(inferences[0].rawOutput, 'There appears to be one dog.')
  assert.equal(inferences[0].normalizedOutput, 'one')
  assert.deepEqual(summary.taskResults.dog_count.counts, { one: 2 })
  assert.equal(summary.taskResults.dog_count.wrong, 1)
  assert.equal(summary.taskResults.dog_count.unreviewed, 1)
})

test('anomaly detection reports diagnostic warning without claiming a bug', () => {
  const collapsed = Array.from({ length: 10 }, (_, index) => ({ ...inferences[0], id: `i${index}`, photoId: `p${index}`, rawOutput: 'one', normalizedOutput: 'one' }))
  const warnings = detectAnomalies(collapsed)
  assert.ok(warnings.some(item => item.code === 'LABEL_CONCENTRATION' && item.message.includes('Possible output collapse')))
  assert.ok(warnings.every(item => !item.message.toLowerCase().includes('is a bug')))
})

test('selectRunData prevents stale result and photo leakage', () => {
  const state = { runs: [run, { ...run, id: 'run-b', photoIds: ['p3'] }], photos: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], inferences: [...inferences, { ...inferences[0], id: 'i3', runId: 'run-b', photoId: 'p3' }], reviews: [{ inferenceId: 'i1' }, { inferenceId: 'i3' }] }
  const selected = selectRunData(state, 'run-b')
  assert.deepEqual(selected.photos.map(item => item.id), ['p3'])
  assert.deepEqual(selected.inferences.map(item => item.id), ['i3'])
  assert.deepEqual(selected.reviews.map(item => item.inferenceId), ['i3'])
})
