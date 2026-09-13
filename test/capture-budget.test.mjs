import test from 'node:test'
import assert from 'node:assert/strict'
import { CaptureBudget } from '../src/http/capture-budget.mjs'
test('capture quotas bound bytes, frames and sessions without deleting evidence', () => {
  const budget = new CaptureBudget({ maxBytes: 10, maxFrames: 2, maxSessions: 1 })
  budget.reserve('a', 4)
  assert.throws(() => budget.reserve('b', 1), { statusCode: 429 })
  assert.throws(() => budget.reserve('a', 7), { statusCode: 429 })
  budget.reserve('a', 4)
  assert.throws(() => budget.reserve('a', 1), { statusCode: 429 })
  assert.equal(budget.bytes, 8)
})
