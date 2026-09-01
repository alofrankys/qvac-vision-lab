import assert from 'node:assert/strict'
import test from 'node:test'

import { assertLocalRequest } from '../src/http/local-request-policy.mjs'

test('local request policy accepts loopback hosts and origins', () => {
  assert.doesNotThrow(() => assertLocalRequest({ headers: { host: '127.0.0.1:8877' } }))
  assert.doesNotThrow(() => assertLocalRequest({ headers: { host: 'localhost:8877', origin: 'http://localhost:8877' } }))
  assert.doesNotThrow(() => assertLocalRequest({ headers: { host: '[::1]:8877', origin: 'http://[::1]:8877' } }))
})

test('local request policy rejects DNS rebinding and cross-origin requests', () => {
  assert.throws(() => assertLocalRequest({ headers: { host: 'attacker.example' } }), { code: 'LOCAL_ORIGIN_REQUIRED' })
  assert.throws(() => assertLocalRequest({ headers: { host: '127.0.0.1:8877', origin: 'https://attacker.example' } }), { code: 'LOCAL_ORIGIN_REQUIRED' })
})
