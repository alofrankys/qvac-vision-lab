import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const baseUrl = process.env.PAWVAULT_URL || 'http://127.0.0.1:8791'
const imagePath = path.resolve(process.argv[2] || '')
if (!process.argv[2]) {
  console.error('Usage: npm run test:integration -- /absolute/path/to/image.jpg')
  process.exit(2)
}

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

const bytes = await readFile(imagePath)
const extension = path.extname(imagePath).toLowerCase()
const mimeType = extension === '.heic' || extension === '.heif' ? 'image/heic' : extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
const created = await request('/api/runs', { method: 'POST', body: '{}' })
const imported = await request('/api/photos/import', {
  method: 'POST',
  body: JSON.stringify({ runId: created.run.id, filename: path.basename(imagePath), relativePath: path.basename(imagePath), mimeType, dataBase64: bytes.toString('base64') })
})
assert.ok(imported.photo.id)
const importedAgain = await request('/api/photos/import', {
  method: 'POST',
  body: JSON.stringify({ runId: created.run.id, filename: `duplicate-${path.basename(imagePath)}`, relativePath: `duplicate-${path.basename(imagePath)}`, mimeType, dataBase64: bytes.toString('base64') })
})
assert.equal(importedAgain.photo.id, imported.photo.id)
assert.equal(importedAgain.reused, true)
const afterDuplicateImport = await request(`/api/state?runId=${encodeURIComponent(created.run.id)}`)
assert.equal(afterDuplicateImport.photos.length, 1)

const analyzed = await request('/api/analyze', {
  method: 'POST',
  body: JSON.stringify({ runId: created.run.id, providerId: process.env.PAWVAULT_PROVIDER_ID || 'qvac-smolvlm2', photoIds: [imported.photo.id], taskIds: ['environment'] })
})
assert.equal(analyzed.inferences.length, 1)
const inference = analyzed.inferences[0]
assert.equal(inference.providerId, process.env.PAWVAULT_PROVIDER_ID || 'qvac-smolvlm2')
assert.ok(inference.rawOutput || inference.error)

const verdict = inference.validationResult === 'VALID' ? 'CORRECT' : 'AMBIGUOUS'
await request('/api/reviews', { method: 'POST', body: JSON.stringify({ inferenceId: inference.id, verdict }) })
const current = await request(`/api/state?runId=${encodeURIComponent(created.run.id)}`)
const metric = current.evaluation.metrics.find(item => item.taskId === 'environment')
assert.equal(metric.samplesEvaluated, 1)
assert.equal(current.photos.length, 1)
console.log(JSON.stringify({
  kind: 'REAL_END_TO_END_INTEGRATION_TEST',
  photoId: imported.photo.id,
  runId: analyzed.run.id,
  task: inference.taskId,
  rawOutput: inference.rawOutput,
  normalizedOutput: inference.normalizedOutput,
  validationResult: inference.validationResult,
  latencyMs: inference.latencyMs,
  verdict,
  samplesEvaluated: metric.samplesEvaluated,
  accuracy: metric.accuracy
}, null, 2))
