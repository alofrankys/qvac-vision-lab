import test from 'node:test'
import assert from 'node:assert/strict'
import { executePatchedProcess, withHardTimeout } from '../src/vision/visionpsy-patched-provider.mjs'

test('patched subprocess captures output and lifecycle timestamps', async () => {
  const result = await executePatchedProcess('/bin/sh', ['-c', 'printf ready; printf "loading model:" >&2'], process.env, { timeoutMs: 1000 })
  assert.equal(result.stdout, 'ready')
  assert.ok(result.pid > 0)
  assert.ok(result.firstOutputAt)
  assert.ok(result.modelReadyAt)
  assert.ok(result.processEndedAt)
})

test('patched subprocess is killed and rejects with MODEL_TIMEOUT', async () => {
  const started = Date.now()
  await assert.rejects(executePatchedProcess('/bin/sh', ['-c', 'sleep 5'], process.env, { timeoutMs: 80 }), error => error.code === 'MODEL_TIMEOUT' && error.pid > 0)
  assert.ok(Date.now() - started < 1500)
})

test('patched subprocess supports cancellation', async () => {
  const controller = new AbortController()
  const pending = executePatchedProcess('/bin/sh', ['-c', 'sleep 5'], process.env, { timeoutMs: 5000, signal: controller.signal })
  setTimeout(() => controller.abort(), 50)
  await assert.rejects(pending, error => error.code === 'RUN_CANCELLED')
})

test('timeout soak never leaves a synthetic prediction running indefinitely', async () => {
  const started = Date.now()
  const pids = []
  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(executePatchedProcess('/bin/sh', ['-c', 'sleep 5'], process.env, { timeoutMs: 60, onSpawn: child => pids.push(child.pid) }), error => error.code === 'MODEL_TIMEOUT')
  }
  assert.ok(Date.now() - started < 2500)
  await new Promise(resolve => setTimeout(resolve, 100))
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH')
})

test('hard deadline returns control even when the underlying request never settles', async () => {
  const started = Date.now()
  let aborted = false
  await assert.rejects(withHardTimeout(new Promise(() => {}), 70, () => { aborted = true }), error => error.name === 'AbortError')
  assert.equal(aborted, true)
  assert.ok(Date.now() - started < 500)
})
