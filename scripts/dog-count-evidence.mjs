import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { TASKS } from '../src/domain/tasks.mjs'

const state = JSON.parse(await readFile(path.resolve('data/pawvault.json'), 'utf8'))
const task = TASKS.find(item => item.id === 'dog_count')
const reviewByInference = new Map(state.reviews.map(review => [review.inferenceId, review]))
const latestByPhoto = new Map()
for (const inference of state.inferences.filter(item => item.taskId === 'dog_count' && item.providerId === 'visionpsy-patched')) {
  const previous = latestByPhoto.get(inference.photoId)
  if (!previous || Date.parse(previous.createdAt) < Date.parse(inference.createdAt)) latestByPhoto.set(inference.photoId, inference)
}
const rows = [...latestByPhoto.values()].map(inference => {
  const photo = state.photos.find(item => item.id === inference.photoId)
  const review = reviewByInference.get(inference.id)
  return {
    runId: inference.runId, filename: photo?.filename, inferenceImage: photo?.inferenceFilename ? path.resolve('data/inference-images', photo.inferenceFilename) : null,
    prompt: inference.prompt, rawOutput: inference.rawOutput, normalizedOutput: inference.normalizedOutput,
    allowedLabels: task.labels, parseStatus: inference.validationResult, errorCode: inference.errorCode ?? null,
    latencyMs: inference.latencyMs, humanGroundTruth: review?.verdict === 'CORRECT' ? inference.normalizedOutput : review?.correctLabel ?? null,
    invalidClass: classify(inference)
  }
})
const output = path.resolve('data/smoke-results/dog-count-evidence.json')
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), reviewCoverage: { reviewed: rows.filter(row => row.humanGroundTruth).length, total: rows.length }, rows }, null, 2)}\n`)
console.log(JSON.stringify({ output, rows: rows.length, reviewed: rows.filter(row => row.humanGroundTruth).length }, null, 2))

function classify(inference) {
  if (inference.errorCode === 'MODEL_TIMEOUT') return 'TIMEOUT'
  if (inference.validationResult === 'VALID') return null
  if (!String(inference.rawOutput || '').trim()) return 'EMPTY_OUTPUT'
  if (/\b(none|one|two|more than two|unclear)\b/i.test(inference.rawOutput)) return 'VERBOSE_BUT_PARSEABLE'
  if (typeof inference.rawOutput !== 'string') return 'MALFORMED_RESPONSE'
  return 'UNSUPPORTED_LABEL'
}
