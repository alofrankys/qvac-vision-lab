import test from 'node:test'
import assert from 'node:assert/strict'
import { VisionProviderRegistry } from '../src/vision/providers.mjs'

test('registry exposes the fair primary peers plus Flash without automatic fallback', async () => {
  const registry = new VisionProviderRegistry()
  const statuses = await registry.statuses()
  assert.deepEqual(statuses.map(item => item.id), ['qvac-visionpsy', 'visionpsy-patched', 'visionpsy-patched-base', 'lfm2.5-vl-450m', 'qvac-smolvlm2', 'qvac-visionpsy-standard-q8', 'qvac-visionpsy-standard-q4', 'qvac-visionpsy-flash-q4'])
  assert.ok(['READY', 'UNAVAILABLE'].includes(statuses.find(item => item.id === 'qvac-visionpsy').state))
  assert.equal(statuses.find(item => item.id === 'qvac-smolvlm2').label, 'PRIMARY PEER · Q8_0 · METAL')
  assert.ok(['READY', 'UNAVAILABLE'].includes(statuses.find(item => item.id === 'lfm2.5-vl-450m').state))
  assert.equal(statuses.find(item => item.id === 'visionpsy-patched-base').model, 'VisionPsy-Nano-460M')
  assert.match(statuses.find(item => item.id === 'visionpsy-patched-base').label, /STANDARD · OFFICIAL TILING/)
  assert.match(statuses.find(item => item.id === 'qvac-visionpsy-standard-q8').label, /QVAC NATIVE · STANDARD Q8_0/)
  assert.match(statuses.find(item => item.id === 'qvac-visionpsy-standard-q4').label, /QVAC NATIVE · STANDARD Q4_K_M/)
  assert.match(statuses.find(item => item.id === 'qvac-visionpsy-flash-q4').label, /QVAC NATIVE · FLASH Q4_K_M/)
  assert.equal(registry.get('qvac-visionpsy').definition.id, 'qvac-visionpsy')
  assert.throws(() => registry.get('not-a-provider'), /Unknown vision provider/)
})

test('QVAC VisionPsy exposes the patched official runtime', async () => {
  const registry = new VisionProviderRegistry()
  const status = await registry.get('qvac-visionpsy').status()
  assert.ok(['READY', 'UNAVAILABLE'].includes(status.state))
  if (status.state === 'UNAVAILABLE') assert.ok(status.reason)
  assert.match(status.runtimeVersion, /@qvac\/sdk 0\.18\.2/)
  assert.match(status.runtimeVersion, /@qvac\/llm-llamacpp 0\.47\.0/)
})
