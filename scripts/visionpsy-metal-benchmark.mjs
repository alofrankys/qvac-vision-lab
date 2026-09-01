import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { TASKS } from '../src/domain/tasks.mjs'
import { VisionPsyPatchedProvider } from '../src/vision/visionpsy-patched-provider.mjs'

const state = JSON.parse(await readFile(path.resolve('data/pawvault.json'), 'utf8'))
const run = state.runs.find(item => item.id === 'run_20260813132428_draft_81956996')
const photos = run.photoIds.slice(0, 2).map(id => state.photos.find(photo => photo.id === id))
const tasks = ['environment', 'surface', 'dog_count'].map(id => TASKS.find(task => task.id === id))
const output = []
for (const config of [{ backend: 'cpu', gpuLayers: 0, port: 8797 }, { backend: 'metal', gpuLayers: 99, port: 8798 }]) {
  const provider = new VisionPsyPatchedProvider({ ...process.env, VISIONPSY_GPU_LAYERS: String(config.gpuLayers), VISIONPSY_PATCHED_PORT: String(config.port) })
  try {
    for (const photo of photos) for (const task of tasks) {
      process.stdout.write(`${config.backend} ${photo.filename} ${task.id}\n`)
      const result = await provider.analyzeImage({ runId: `metal-${config.backend}`, imagePath: path.resolve('data/inference-images', photo.inferenceFilename), prompt: task.prompt, allowedLabels: task.labels, taskId: task.id, timeoutMs: 30000 })
      output.push({ ...config, filename: photo.filename, taskId: task.id, rawOutput: result.rawOutput, totalPredictionMs: result.latencyMs, coldStartMs: result.runtimeStats.coldStartMs, ...result.runtimeStats.nativeTimings })
    }
  } finally { await provider.shutdown() }
}
const result = { generatedAt: new Date().toISOString(), buildEvidence: { GGML_METAL: true, device: 'Apple M4' }, rows: output }
await writeFile(path.resolve('data/smoke-results/visionpsy-cpu-metal.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))
