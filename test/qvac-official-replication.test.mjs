import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReferenceArgs, loadProtocol, validateProtocol } from '../scripts/qvac-official-replication.mjs'
import { buildPatchedChatRequest } from '../src/vision/visionpsy-patched-provider.mjs'

test('official QVAC protocol locks all 17 published benchmarks', () => {
  const protocol = loadProtocol()
  assert.deepEqual(validateProtocol(protocol), [])
  assert.equal(protocol.datasets.length, 17)
  assert.equal(protocol.executionSuites.full.length, 17)
  for (const dataset of protocol.datasets) {
    assert.match(dataset.artifact.url, /^https:\/\//)
    assert.match(dataset.artifact.md5, /^[a-f0-9]{32}$/)
    assert.ok(dataset.questionFormat)
    assert.ok(dataset.scoring)
  }
})

test('headline command uses the three full benchmarks explicitly highlighted by QVAC', () => {
  const protocol = loadProtocol()
  const args = buildReferenceArgs(protocol, { suite: 'headline', models: ['VisionPsy-Nano-460M'], judge: false })
  const dataAt = args.indexOf('--data')
  const modelAt = args.indexOf('--model')
  assert.deepEqual(args.slice(dataAt + 1, modelAt), ['ScienceQA_TEST', 'MM-IFEval', 'POPE'])
})

test('independent headline stages are available for resumable execution', () => {
  const protocol = loadProtocol()
  assert.deepEqual(protocol.executionSuites.pope, ['POPE'])
  assert.deepEqual(protocol.executionSuites.mmifeval, ['MM-IFEval'])
})

test('unknown suite and model are rejected', () => {
  const protocol = loadProtocol()
  assert.throws(() => buildReferenceArgs(protocol, { suite: 'made-up' }), /Unknown suite/)
  assert.throws(() => buildReferenceArgs(protocol, { models: ['not-a-model'] }), /Unknown reference model/)
})

test('patched QVAC payload keeps the official image-before-text order', () => {
  const payload = buildPatchedChatRequest({
    modelPath: '/model.gguf',
    prompt: 'Question?',
    imageBytes: Buffer.from('image'),
    maxTokens: 32
  })
  assert.deepEqual(payload.messages[0].content.map(item => item.type), ['image_url', 'text'])
  assert.equal(payload.temperature, 0)
  assert.equal(payload.max_tokens, 32)
})
