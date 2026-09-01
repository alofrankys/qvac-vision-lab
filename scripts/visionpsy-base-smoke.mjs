import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { TASKS, normalizeTaskOutput } from '../src/domain/tasks.mjs'
import { VisionPsyPatchedBaseProvider } from '../src/vision/visionpsy-patched-provider.mjs'

const root = path.resolve('.')
const runId = 'run_20260813132428_draft_81956996'
const state = JSON.parse(await readFile(path.join(root, 'data/pawvault.json'), 'utf8'))
const run = state.runs.find(item => item.id === runId)
if (!run) throw new Error(`Missing source run ${runId}`)
const photos = run.photoIds.slice(0, 2).map(id => state.photos.find(photo => photo.id === id))
const task = TASKS.find(item => item.id === 'environment')
const provider = new VisionPsyPatchedBaseProvider({ ...process.env, VISIONPSY_BASE_PORT: '18894', VISIONPSY_GPU_LAYERS: '99' })
const rows = []

try {
  for (const [index, photo] of photos.entries()) {
    const result = await provider.analyzeImage({
      runId: `base-smoke-${index}`,
      imagePath: path.join(root, 'data/inference-images', photo.inferenceFilename),
      prompt: task.prompt,
      promptVersion: task.promptVersion,
      allowedLabels: task.labels,
      taskId: task.id,
      timeoutMs: 30000
    })
    const parsed = normalizeTaskOutput(task.id, result.rawOutput, task.labels)
    rows.push({ photoId: photo.id, taskId: task.id, rawOutput: result.rawOutput, normalizedOutput: parsed.normalized, validationResult: parsed.validationResult, latencyMs: result.latencyMs, runtimeStats: result.runtimeStats })
    console.log(`[${index + 1}/2] ${photo.filename}: ${result.rawOutput} (${result.latencyMs} ms)`)
  }
} finally {
  await provider.shutdown()
}

const output = path.join(root, 'data/smoke-results/visionpsy-base-two-image-smoke.json')
await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), sourceRunId: runId, provider: provider.definition, rows }, null, 2)}\n`)
console.log(output)
