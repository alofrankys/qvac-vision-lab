import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { VisionPsyPatchedProvider } from '../src/vision/visionpsy-patched-provider.mjs'
import { TASKS, normalizeDogCountOutput, normalizeOutput } from '../src/domain/tasks.mjs'

const inferenceDir = path.resolve('data/inference-images')
const outputPath = path.resolve('data/smoke-results/dog-count-benchmark.json')
const baseline = `Classify only the number of dogs visible in this image.\n\nAllowed labels:\nnone\none\ntwo\nmore_than_two\nunclear\n\nReturn exactly one allowed label.\nIf ambiguous, return unclear.`
const prompts = {
  A_current: { prompt: baseline, labels: ['none', 'one', 'two', 'more_than_two', 'unclear'], expected: truth => truth },
  B_direct: { prompt: `Count only the dogs visible in this image.\n\nAllowed labels:\nnone\none\ntwo\nmore_than_two\nunclear\n\nReturn exactly one label.\nDo not describe the image.\nIf two distinct dogs are visible, return two.\nIf uncertain, return unclear.`, labels: ['none', 'one', 'two', 'more_than_two', 'unclear'], expected: truth => truth },
  C_separation: { prompt: `Look at the entire image and determine how many distinct dogs are visibly present.\n\nAllowed labels:\nnone\none\ntwo\nmore_than_two\nunclear\n\nImportant:\n- Count distinct visible dogs, not faces or body parts.\n- If two separate dogs are visible, return two.\n- Do not guess hidden dogs.\n- Return exactly one allowed label.`, labels: ['none', 'one', 'two', 'more_than_two', 'unclear'], expected: truth => truth },
  D_binary: { prompt: `Are at least two distinct dogs visible in this image?\n\nAllowed labels:\nyes\nno\nunclear\n\nReturn exactly one label.`, labels: ['yes', 'no', 'unclear'], expected: truth => truth === 'two' ? 'yes' : 'no' }
}

// Ten real PawVault import instances. The one-dog class contains two repeated
// imports because the local archive currently has only three unique one-dog scenes.
const samples = [
  ['one-1', 'IMG_5186.PNG', '18f27f60-cfd1-4c3c-a5d1-f31d97209f4c.jpg', 'one'],
  ['one-2', 'IMG_5187.PNG', 'aa2d30b8-6d86-418b-862f-29a8ad2f7802.jpg', 'one'],
  ['one-3', 'IMG_5649.HEIC', '9d1fcdd8-c525-4451-a77e-3dabc20777dd.jpg', 'one'],
  ['one-4-repeat', 'IMG_5186.PNG', '8b6718b7-3d3e-414a-baed-4a9fd922a256.jpg', 'one'],
  ['one-5-repeat', 'IMG_5187.PNG', 'cfcfd7d1-2a58-4da4-93bb-1c0ebff09c94.jpg', 'one'],
  ['two-1', 'IMG_3474.HEIC', '51389fe6-b79a-4d05-910c-57f9defa4bcb.jpg', 'two'],
  ['two-2', 'IMG_3631.HEIC', '9d5d7d9a-d523-448d-920f-746931c2c000.jpg', 'two'],
  ['two-3', 'IMG_5184.PNG', '8e9c5016-8f93-40a3-abd6-04019a8ae8d0.jpg', 'two'],
  ['two-4', 'IMG_5190.PNG', '2871840f-c257-4fa7-967d-543ff893b41c.jpg', 'two'],
  ['two-5', 'IMG_5528.HEIC', '55939598-7773-4b2a-a134-9f0ab57d075a.jpg', 'two']
].map(([id, filename, inferenceFilename, truth]) => ({ id, filename, inferenceFilename, truth }))

const provider = new VisionPsyPatchedProvider({ ...process.env, VISIONPSY_PATCHED_PORT: process.env.VISIONPSY_PATCHED_PORT || '8795' })
const rows = []
try {
  for (const [variant, definition] of Object.entries(prompts)) {
    for (const sample of samples) {
      const started = Date.now()
      try {
        const result = await provider.analyzeImage({ runId: 'dog-count-benchmark', imagePath: path.join(inferenceDir, sample.inferenceFilename), prompt: definition.prompt, allowedLabels: definition.labels, taskId: 'dog_count', timeoutMs: 30000 })
        const parsed = variant === 'D_binary' ? normalizeOutput(result.rawOutput, definition.labels) : normalizeDogCountOutput(result.rawOutput)
        rows.push({ variant, ...sample, prompt: definition.prompt, allowedLabels: definition.labels, rawOutput: result.rawOutput, normalizedOutput: parsed.normalized, parseStatus: parsed.validationResult, expected: definition.expected(sample.truth), correct: parsed.normalized === definition.expected(sample.truth), latencyMs: result.latencyMs, invalidClass: classifyInvalid(result.rawOutput, parsed) })
      } catch (error) {
        rows.push({ variant, ...sample, prompt: definition.prompt, allowedLabels: definition.labels, rawOutput: '', normalizedOutput: null, parseStatus: 'ERROR', expected: definition.expected(sample.truth), correct: false, latencyMs: Date.now() - started, errorCode: error.code || 'OTHER', invalidClass: error.code === 'MODEL_TIMEOUT' ? 'TIMEOUT' : 'OTHER' })
      }
    }
  }
} finally { await provider.shutdown() }

const summary = Object.fromEntries(Object.keys(prompts).map(variant => {
  const selected = rows.filter(row => row.variant === variant)
  const rate = (truth, predicate) => { const group = selected.filter(row => row.truth === truth); return group.length ? group.filter(predicate).length / group.length : null }
  return [variant, { oneAccuracy: rate('one', row => row.correct), twoAccuracy: rate('two', row => row.correct), unclearRate: selected.filter(row => row.normalizedOutput === 'unclear').length / selected.length, invalidOutputRate: selected.filter(row => row.parseStatus !== 'VALID').length / selected.length, meanLatencyMs: Math.round(selected.reduce((sum, row) => sum + row.latencyMs, 0) / selected.length) }]
}))
await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), limitation: 'Only three unique one-dog scenes were available; two repeated imports are included to reach five instances.', samples, summary, rows }, null, 2)}\n`)
console.log(JSON.stringify({ outputPath, summary }, null, 2))

function classifyInvalid(raw, parsed) {
  if (parsed.validationResult === 'VALID') return null
  if (!String(raw || '').trim()) return 'EMPTY_OUTPUT'
  if (/\b(none|one|two|more than two|unclear|yes|no)\b/i.test(raw)) return 'VERBOSE_BUT_PARSEABLE'
  if (typeof raw !== 'string') return 'MALFORMED_RESPONSE'
  return 'UNSUPPORTED_LABEL'
}
