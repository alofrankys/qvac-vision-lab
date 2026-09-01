import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { TASKS, normalizeTaskOutput, normalizeOutput } from '../src/domain/tasks.mjs'
import { VisionPsyPatchedProvider, VisionPsyPatchedBaseProvider } from '../src/vision/visionpsy-patched-provider.mjs'

const ROOT = path.resolve('.')
const RUN_ID = 'run_20260813132428_draft_81956996'
const outputDir = path.join(ROOT, 'data/smoke-results')
const state = JSON.parse(await readFile(path.join(ROOT, 'data/pawvault.json'), 'utf8'))
const baselineRun = state.runs.find(run => run.id === RUN_ID)
if (!baselineRun) throw new Error(`Baseline run not found: ${RUN_ID}`)
const photos = baselineRun.photoIds.map(id => state.photos.find(photo => photo.id === id))
if (photos.length !== 12 || photos.some(photo => !photo?.inferenceFilename)) throw new Error('Baseline must resolve to exactly 12 inference-ready photos')

await mkdir(outputDir, { recursive: true })
const manifest = { id: 'VISIONPSY_FLASH_BASELINE_V1', runId: RUN_ID, immutable: true, photos: [] }
for (const photo of photos) {
  const imagePath = path.join(ROOT, 'data/inference-images', photo.inferenceFilename)
  const bytes = await readFile(imagePath)
  manifest.photos.push({ photoId: photo.id, filename: photo.filename, inferenceFilename: photo.inferenceFilename, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length })
}
await writeFile(path.join(outputDir, 'visionpsy-flash-baseline-v1.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const truthPath = path.join(outputDir, 'dog-count-ground-truth.json')
let truth = { labels: Object.fromEntries(photos.map(photo => [photo.id, null])), allowedLabels: ['no_dog', 'one_dog', 'multiple_dogs'], note: 'Human labels only. Fill each null; model outputs are never ground truth.' }
try { truth = JSON.parse(await readFile(truthPath, 'utf8')) } catch { await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`) }

const exactA = `Classify only the number of distinct dogs visibly present in the entire image.\n\nAllowed labels:\nnone\none\ntwo\nmore_than_two\nunclear\n\nReturn exactly one allowed label.\nInspect the whole image before answering.\nIf two distinct dogs are visibly present, return two.\nDo not infer hidden dogs.\nIf uncertain, return unclear.`
const simplifiedB = `Determine whether the image visibly contains no dogs, one dog, or multiple distinct dogs.\n\nAllowed labels:\nno_dog\nsingle_dog\nmultiple_dogs\nunclear\n\nReturn exactly one allowed label.\nInspect the entire image.\nIf at least two distinct dogs are visibly present, return multiple_dogs.\nIf uncertain, return unclear.`
const binaryC = `Are at least two distinct dogs visibly present in this image?\n\nAllowed labels:\nyes\nno\nunclear\n\nReturn exactly one allowed label.\nInspect the entire image before answering.`
const dogVariants = {
  A_exact: { prompt: exactA, labels: ['none', 'one', 'two', 'more_than_two', 'unclear'] },
  B_single_multiple: { prompt: simplifiedB, labels: ['no_dog', 'single_dog', 'multiple_dogs', 'unclear'] },
  C_binary: { prompt: binaryC, labels: ['yes', 'no', 'unclear'] }
}

const mode = process.argv[2]
if (!['base-full', 'dog-flash', 'dog-base'].includes(mode)) throw new Error('Usage: node scripts/visionpsy-ceiling-benchmark.mjs base-full|dog-flash|dog-base')
const isBase = mode.includes('base')
const Provider = isBase ? VisionPsyPatchedBaseProvider : VisionPsyPatchedProvider
const provider = new Provider({ ...process.env, VISIONPSY_PATCHED_PORT: '8795', VISIONPSY_BASE_PORT: '8796' })
const jobs = mode === 'base-full'
  ? photos.flatMap(photo => TASKS.filter(task => baselineRun.taskIds.includes(task.id)).map(task => ({ photo, taskId: task.id, prompt: task.prompt, labels: task.labels, variant: 'current' })))
  : Object.entries(dogVariants).flatMap(([variant, spec]) => photos.map(photo => ({ photo, taskId: 'dog_count', variant, ...spec })))
const rows = []
try {
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index]
    process.stdout.write(`[${index + 1}/${jobs.length}] ${provider.definition.model} ${job.photo.filename} ${job.taskId}/${job.variant}\n`)
    const imagePath = path.join(ROOT, 'data/inference-images', job.photo.inferenceFilename)
    try {
      const result = await provider.analyzeImage({ runId: `${mode}-${Date.now()}`, imagePath, prompt: job.prompt, allowedLabels: job.labels, taskId: job.taskId, timeoutMs: 30000 })
      const parsed = mode === 'base-full' ? normalizeTaskOutput(job.taskId, result.rawOutput, job.labels) : normalizeOutput(result.rawOutput, job.labels)
      rows.push({ photoId: job.photo.id, filename: job.photo.filename, inferenceFilename: job.photo.inferenceFilename, taskId: job.taskId, variant: job.variant, prompt: job.prompt, allowedLabels: job.labels, rawOutput: result.rawOutput, normalizedOutput: parsed.normalized, parseStatus: parsed.validationResult, errorCode: null, latencyMs: result.latencyMs, runtimeStats: result.runtimeStats })
    } catch (error) {
      rows.push({ photoId: job.photo.id, filename: job.photo.filename, inferenceFilename: job.photo.inferenceFilename, taskId: job.taskId, variant: job.variant, prompt: job.prompt, allowedLabels: job.labels, rawOutput: '', normalizedOutput: null, parseStatus: 'ERROR', errorCode: error.code || 'OTHER', latencyMs: null })
    }
  }
} finally { await provider.shutdown() }

const groups = mode === 'base-full' ? TASKS.filter(task => baselineRun.taskIds.includes(task.id)).map(task => task.id) : Object.keys(dogVariants)
const summary = Object.fromEntries(groups.map(group => {
  const selected = rows.filter(row => mode === 'base-full' ? row.taskId === group : row.variant === group)
  const rawDistribution = Object.fromEntries(Object.entries(Object.groupBy(selected, row => row.rawOutput || `__${row.errorCode || 'EMPTY'}__`)).map(([key, values]) => [key, values.length]))
  return [group, { samples: selected.length, rawDistribution, invalidRate: selected.filter(row => row.parseStatus !== 'VALID').length / selected.length, unclearRate: selected.filter(row => row.normalizedOutput === 'unclear').length / selected.length, meanLatencyMs: mean(selected.map(row => row.latencyMs)), meanPromptEvalMs: mean(selected.map(row => row.runtimeStats?.nativeTimings?.promptEvalMs)), meanGenerationMs: mean(selected.map(row => row.runtimeStats?.nativeTimings?.generationMs)) }]
}))
const result = { generatedAt: new Date().toISOString(), experimentId: `${mode}-${Date.now()}`, baselineManifest: 'VISIONPSY_FLASH_BASELINE_V1', sourceRunId: RUN_ID, provider: provider.definition, groundTruthComplete: Object.values(truth.labels).every(Boolean), summary, rows }
const output = path.join(outputDir, `visionpsy-${mode}.json`)
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({ output, provider: provider.definition, summary }, null, 2))

function mean(values) { const valid = values.filter(Number.isFinite); return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null }
