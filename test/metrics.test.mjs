import test from 'node:test'
import assert from 'node:assert/strict'
import { decisionStatus, evaluate } from '../src/evaluation/metrics.mjs'
import { TASKS } from '../src/domain/tasks.mjs'

function baseState() {
  return { photos: [{ id: 'p1' }], runs: [], inferences: [], reviews: [], taskStatuses: Object.fromEntries(TASKS.map(task => [task.id, task.defaultStatus])) }
}

test('accuracy excludes ambiguous reviews and ground truth comes from review', () => {
  const state = baseState()
  state.inferences = [
    { id: 'i1', photoId: 'p1', taskId: 'environment', normalizedOutput: 'outdoor', validationResult: 'VALID', latencyMs: 100, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'i2', photoId: 'p2', taskId: 'environment', normalizedOutput: 'unclear', validationResult: 'VALID', latencyMs: 300, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'i3', photoId: 'p3', taskId: 'environment', normalizedOutput: null, validationResult: 'INVALID_OUTPUT', latencyMs: 200, createdAt: '2026-01-01T00:00:00Z' }
  ]
  state.reviews = [
    { inferenceId: 'i1', verdict: 'CORRECT', correctLabel: 'outdoor', reviewedAt: '2026-01-02T00:00:00Z' },
    { inferenceId: 'i2', verdict: 'WRONG', correctLabel: 'indoor', reviewedAt: '2026-01-02T00:00:00Z' },
    { inferenceId: 'i3', verdict: 'AMBIGUOUS', correctLabel: null, reviewedAt: '2026-01-02T00:00:00Z' }
  ]
  const metric = evaluate(state).metrics.find(item => item.taskId === 'environment')
  assert.equal(metric.samplesEvaluated, 3)
  assert.equal(metric.accuracy, 0.5)
  assert.equal(metric.unclearRate, 1 / 3)
  assert.equal(metric.invalidOutputRate, 1 / 3)
  assert.equal(metric.averageLatencyMs, 200)
})

test('latest results and metrics remain separated by provider', () => {
  const state = baseState()
  state.inferences = [
    { id: 'visionpsy', providerId: 'visionpsy-patched', photoId: 'p1', taskId: 'environment', normalizedOutput: 'outdoor', validationResult: 'VALID', latencyMs: 200, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'smol', providerId: 'qvac-smolvlm2', photoId: 'p1', taskId: 'environment', normalizedOutput: 'indoor', validationResult: 'VALID', latencyMs: 100, createdAt: '2026-01-02T00:00:00Z' }
  ]
  state.reviews = [
    { inferenceId: 'visionpsy', verdict: 'CORRECT', reviewedAt: '2026-01-03T00:00:00Z' },
    { inferenceId: 'smol', verdict: 'WRONG', correctLabel: 'outdoor', reviewedAt: '2026-01-03T00:00:00Z' }
  ]
  const metrics = evaluate(state).metrics.filter(item => item.taskId === 'environment')
  assert.equal(metrics.length, 2)
  assert.equal(metrics.find(item => item.providerId === 'visionpsy-patched').accuracy, 1)
  assert.equal(metrics.find(item => item.providerId === 'qvac-smolvlm2').accuracy, 0)
})

test('only latest inference per photo and task is evaluated', () => {
  const state = baseState()
  state.inferences = [
    { id: 'old', photoId: 'p1', taskId: 'bowl', normalizedOutput: 'bowl_visible', validationResult: 'VALID', latencyMs: 900, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'new', photoId: 'p1', taskId: 'bowl', normalizedOutput: 'no_bowl_visible', validationResult: 'VALID', latencyMs: 100, createdAt: '2026-01-02T00:00:00Z' }
  ]
  const metric = evaluate(state).metrics.find(item => item.taskId === 'bowl')
  assert.equal(metric.averageLatencyMs, 100)
})

test('focused screening thresholds are stable', () => {
  assert.equal(decisionStatus(0.9), 'PROMISING')
  assert.equal(decisionStatus(0.8), 'NEEDS_MORE_DATA')
  assert.equal(decisionStatus(0.799), 'WEAK')
  assert.equal(decisionStatus(null), 'NEEDS_MORE_DATA')
})
