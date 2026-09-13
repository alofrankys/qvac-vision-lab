import test from 'node:test'
import assert from 'node:assert/strict'
import { protocolHash, validateCheckpoint } from '../scripts/checkpoint-protocol.mjs'

test('protocol identity is key-order stable and detects changed prompts/models', () => {
  assert.equal(protocolHash({ a: 1, b: 2 }), protocolHash({ b: 2, a: 1 }))
  assert.notEqual(protocolHash({ prompt: 'one' }), protocolHash({ prompt: 'two' }))
  assert.notEqual(protocolHash({ model: 'q4' }), protocolHash({ model: 'q8' }))
})
test('checkpoint fails closed on legacy, mixed, duplicate and foreign rows', () => {
  const row = { caseId: 'a', providerId: 'm', protocolHash: 'hash', returnedProvider: { id: 'm' } }
  assert.deepEqual(validateCheckpoint([row], 'hash', ['a'], ['m']), [row])
  for (const rows of [[{ ...row, protocolHash: undefined }], [{ ...row, protocolHash: 'other' }], [row, row], [{ ...row, caseId: 'b' }], [{ ...row, returnedProvider: { id: 'other' } }], [{ ...row, warmup: true }]]) {
    assert.throws(() => validateCheckpoint(rows, 'hash', ['a'], ['m']))
  }
})
