import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TASKS, normalizeOutput } from '../src/domain/tasks.mjs'
import { QvacVisionPsyProvider } from '../src/vision/qvac-visionpsy-provider.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const imagePath = path.resolve(process.argv[2] || '')
if (!process.argv[2]) {
  console.error('Usage: npm run smoke -- /absolute/path/to/image.jpg')
  process.exit(2)
}

const provider = new QvacVisionPsyProvider()
const task = TASKS.find(item => item.id === 'environment')
try {
  const result = await provider.analyzeImage({ imagePath, prompt: task.prompt, allowedLabels: task.labels, taskId: task.id })
  const validation = normalizeOutput(result.rawOutput, task.labels)
  const report = {
    kind: 'REAL_QVAC_SMOKE_TEST',
    timestamp: new Date().toISOString(),
    imagePath,
    task: task.id,
    prompt: task.prompt,
    ...result,
    ...validation,
    runtime: await provider.runtimeMetadata()
  }
  await mkdir(path.join(root, 'data', 'smoke-results'), { recursive: true })
  const destination = path.join(root, 'data', 'smoke-results', 'latest.json')
  await writeFile(destination, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (report.validationResult !== 'VALID') process.exitCode = 1
} finally {
  await provider.shutdown()
  // The reusable provider deliberately keeps the QVAC worker connection alive.
  // This is a one-shot command, so terminate after the report has been written.
  process.exit(process.exitCode || 0)
}
