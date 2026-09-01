import { readFile } from 'node:fs/promises'
import path from 'node:path'

const base = process.env.PAWVAULT_URL || 'http://127.0.0.1:8877'
const image = process.argv[2]
if (!image) throw new Error('Usage: node scripts/cancel-smoke.mjs image')

async function api(route, options = {}) {
  const response = await fetch(`${base}${route}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  return data
}

const { run } = await api('/api/runs', { method: 'POST', body: '{}' })
const bytes = await readFile(image)
const imported = await api('/api/photos/import', { method: 'POST', body: JSON.stringify({ runId: run.id, filename: path.basename(image), mimeType: 'image/jpeg', dataBase64: bytes.toString('base64') }) })
const analysis = api('/api/analyze', { method: 'POST', body: JSON.stringify({ runId: run.id, providerId: 'visionpsy-patched', photoIds: [imported.photo.id], taskIds: ['environment'] }) })
let running
for (let attempt = 0; attempt < 500; attempt++) {
  running = (await api(`/api/state?runId=${run.id}`)).currentRun
  if (running.status === 'RUNNING' && running.providerPid) break
  await new Promise(resolve => setTimeout(resolve, 10))
}
if (!running?.providerPid) throw new Error('Prediction did not reach a cancellable provider stage')
const pid = running.providerPid
await api(`/api/runs/${run.id}/cancel`, { method: 'POST', body: '{}' })
const analyzed = await analysis
const persisted = (await api(`/api/state?runId=${run.id}`)).currentRun
console.log(JSON.stringify({ runId: run.id, pid, finalStatus: persisted.status, cancelReason: persisted.cancelReason, lastStage: persisted.lastStage, lastSuccessfulStep: persisted.lastSuccessfulStep, inferenceErrorCode: analyzed.inferences.at(-1)?.errorCode, durationMs: persisted.durationMs }, null, 2))
