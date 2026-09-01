import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { VisionPsyPatchedBaseProvider, Lfm25VlProvider } from '../src/vision/visionpsy-patched-provider.mjs'
import { QvacSmolVlm2Provider } from '../src/vision/qvac-smolvlm2-provider.mjs'

const state = JSON.parse(await readFile(new URL('../data/pawvault.json', import.meta.url)))
const photos = state.photos.filter(item => item.inferenceFilename && item.imagePipeline?.ready).slice(0, 2)
if (photos.length !== 2) throw new Error('Arena smoke requires exactly two inference-ready local fixtures')
const prompts = [
  'Name the largest visible object in one short phrase.',
  'State the dominant visible color in one short phrase.',
  'Describe one visible spatial relation briefly.'
]
const factories = [
  () => new VisionPsyPatchedBaseProvider({ ...process.env, VISIONPSY_BASE_PORT: '8894' }),
  () => new Lfm25VlProvider({ ...process.env, LFM25_PORT: '8896' }),
  () => new QvacSmolVlm2Provider()
]
const report = { schemaVersion: 1, kind: 'TECHNICAL_SMOKE_NOT_BENCHMARK', startedAt: new Date().toISOString(), photos: photos.map(item => item.id), prompts, providers: [] }

for (const factory of factories) {
  const provider = factory()
  const row = { providerId: provider.definition.id, status: await provider.status(), predictions: [] }
  report.providers.push(row)
  try {
    for (const photo of photos) for (const prompt of prompts) {
      try {
        const result = await provider.analyzeImage({ runId: `technical-smoke-${provider.definition.id}`, imagePath: path.resolve('data/inference-images', photo.inferenceFilename), prompt, promptVersion: 'fair-arena-technical-smoke-v1', outputMode: 'semantic', allowedLabels: [], maxTokens: 32, timeoutMs: 45000 })
        row.predictions.push({ photoId: photo.id, prompt, ok: true, rawOutput: result.rawOutput, latencyMs: result.latencyMs, runtimeStats: compactStats(result.runtimeStats) })
      } catch (error) {
        row.predictions.push({ photoId: photo.id, prompt, ok: false, errorCode: error.code || 'PROVIDER_CALL_FAILED', error: error.message })
      }
    }
  } finally { await provider.shutdown() }
  row.passed = row.predictions.length === 6 && row.predictions.every(item => item.ok)
}
report.finishedAt = new Date().toISOString()
report.passed = report.providers.every(item => item.passed)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
// The SDK intentionally keeps its local DHT/provider event loop alive for app
// reuse. A one-shot CLI must terminate explicitly after models are unloaded.
process.exit(report.passed ? 0 : 1)

function compactStats(stats = {}) {
  return {
    backend: stats.backend || stats.backendDevice || null,
    pid: stats.pid || stats.server_pid || null,
    coldStartMs: stats.coldStartMs ?? null,
    warmInferenceMs: stats.warmInferenceMs ?? null,
    reused: stats.serverReused ?? stats.modelReused ?? null,
    timeToFirstTokenMs: stats.timeToFirstToken ?? null,
    generatedTokens: stats.generatedTokens ?? stats.nativeTimings?.generationTokens ?? null,
    timeoutMs: stats.timeoutMs ?? null
  }
}
