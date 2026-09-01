import { readFile } from 'node:fs/promises'
import path from 'node:path'

const base = process.env.PAWVAULT_URL || 'http://127.0.0.1:8877'
const [caseName, ...images] = process.argv.slice(2)
const taskIds = caseName === 'B' ? ['environment', 'posture', 'dog_count'] : ['environment']
if (!['A','B','C'].includes(caseName) || !images.length) throw new Error('Usage: node scripts/lifecycle-smoke.mjs A|B|C image [image]')

async function api(route, options = {}) { const response = await fetch(`${base}${route}`, { headers: { 'Content-Type': 'application/json' }, ...options }); const data = await response.json(); if (!response.ok) throw new Error(data.error); return data }
const { run } = await api('/api/runs', { method: 'POST', body: '{}' })
const photoIds = []
for (const image of caseName === 'C' ? images.slice(0, 2) : images.slice(0, 1)) {
  const bytes = await readFile(image)
  const result = await api('/api/photos/import', { method: 'POST', body: JSON.stringify({ runId: run.id, filename: path.basename(image), relativePath: path.basename(image), mimeType: path.extname(image).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg', dataBase64: bytes.toString('base64') }) })
  photoIds.push(result.photo.id)
}
const analyzed = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ runId: run.id, providerId: 'visionpsy-patched', photoIds, taskIds }) })
console.log(JSON.stringify({ caseName, run: analyzed.run, predictions: analyzed.inferences.map(item => ({ photoId: item.photoId, taskId: item.taskId, latencyMs: item.latencyMs, errorCode: item.errorCode, rawOutput: item.rawOutput, pid: item.runtimeStats?.pid, trace: item.runtimeStats?.trace })) }, null, 2))
