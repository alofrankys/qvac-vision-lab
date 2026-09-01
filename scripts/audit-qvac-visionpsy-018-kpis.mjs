import path from 'node:path'
import process from 'node:process'
import { writeFile } from 'node:fs/promises'
import {
  MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
  VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M
} from '@qvac/sdk'
import { QvacMultimodalProvider } from '../src/vision/qvac-provider.mjs'
import { QvacVisionPsyProvider } from '../src/vision/qvac-visionpsy-provider.mjs'
import { VisionPsyPatchedProvider } from '../src/vision/visionpsy-patched-provider.mjs'

const root = path.resolve(import.meta.dirname, '..')
const images = [
  { id: 'two-dogs-bed', path: path.join(root, 'data/inference-images/eacf9234-414a-4cff-a62d-f0e6120607c9.jpg'), dogCount: 'two' },
  { id: 'one-dog-pad', path: path.join(root, 'data/inference-images/9a894466-0176-45ce-afb1-82199183a31f.jpg'), dogCount: 'one' }
]
const tasks = [
  {
    id: 'environment', expected: () => 'indoor', labels: ['indoor', 'outdoor', 'unclear'],
    prompt: 'Is this photo indoors or outdoors?\n\nAllowed labels:\nindoor\noutdoor\nunclear\n\nReturn exactly one allowed label.'
  },
  {
    id: 'dog_count', expected: image => image.dogCount, labels: ['none', 'one', 'two', 'more_than_two', 'unclear'],
    prompt: 'How many dogs are visibly present?\n\nAllowed labels:\nnone\none\ntwo\nmore_than_two\nunclear\n\nReturn exactly one allowed label.'
  }
]

function optimizedQvac() {
  return new QvacMultimodalProvider({
    status: {
      id: 'qvac-visionpsy-optimized', name: 'QVAC VisionPsy optimized audit', kind: 'DIAGNOSTIC',
      runtime: 'QVAC MTMD', runtimeVersion: '@qvac/sdk 0.18.1 · @qvac/llm-llamacpp 0.45.0',
      model: 'VisionPsy-Nano-460M-Flash', modelVersion: 'a24fb9cdd1119406b15ff60b06a51f8438a931c1',
      projection: 'mmproj-visionpsy-nano-460m-flash-q8.gguf', state: 'READY', label: 'DIAGNOSTIC', reason: null
    },
    modelSource: VISIONPSY_NANO_460M_MULTIMODAL_Q4_K_M,
    projectionSource: MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0,
    modelConfig: { 'mmproj-use-gpu': true, image_no_upscale: 'on' }
  })
}

const providerFactories = [
  ['sdk_current', () => new QvacVisionPsyProvider()],
  ['sdk_optimized', optimizedQvac],
  ['patched_metal', () => new VisionPsyPatchedProvider({ ...process.env, PAWVAULT_PREDICTION_TIMEOUT_MS: '60000' })]
]
const results = []

for (const [providerName, createProvider] of providerFactories) {
  const provider = createProvider()
  try {
    for (const image of images) {
      for (const task of tasks) {
        const expected = task.expected(image)
        const startedAt = new Date().toISOString()
        try {
          const result = await provider.analyzeImage({
            runId: `sdk-018-kpi-${providerName}-${image.id}-${task.id}`,
            imagePath: image.path,
            prompt: task.prompt,
            allowedLabels: task.labels,
            maxTokens: 24,
            timeoutMs: 60_000,
            promptVersion: 'qvac-sdk-018-kpi-audit-v1'
          })
          const output = result.rawOutput.trim().toLowerCase()
          results.push({
            provider: providerName, image: image.id, task: task.id, expected, output,
            exact: output === expected, status: 'PASS', startedAt, latencyMs: result.latencyMs,
            runtimeStats: result.runtimeStats
          })
        } catch (error) {
          results.push({ provider: providerName, image: image.id, task: task.id, expected, status: 'FAIL', startedAt, error: { code: error.code, message: error.message } })
        }
      }
    }
  } finally {
    await provider.shutdown()
  }
}

const summaries = providerFactories.map(([provider]) => {
  const rows = results.filter(item => item.provider === provider)
  const passing = rows.filter(item => item.status === 'PASS')
  const warm = passing.filter(item => item.runtimeStats?.modelReused || item.runtimeStats?.serverReused)
  const mean = values => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
  return {
    provider,
    completed: passing.length,
    total: rows.length,
    exact: passing.filter(item => item.exact).length,
    meanLatencyMs: mean(passing.map(item => item.latencyMs)),
    meanWarmLatencyMs: mean(warm.map(item => item.latencyMs)),
    coldStartMs: passing[0]?.runtimeStats?.coldStartMs ?? null,
    meanTimeToFirstTokenMs: mean(passing.map(item => item.runtimeStats?.timeToFirstToken).filter(Number.isFinite)),
    meanTokensPerSecond: mean(passing.map(item => item.runtimeStats?.tokensPerSecond).filter(Number.isFinite))
  }
})

const report = {
  generatedAt: new Date().toISOString(),
  purpose: 'Diagnostic runtime KPI audit; small sample, not ranking evidence.',
  controls: {
    hardware: 'same Apple M4 host',
    execution: 'sequential, one loaded provider at a time',
    model: 'same VisionPsy Flash Q4_K_M artifact and Q8 projector',
    inputs: 'same two normalized JPEGs, exact prompts, maxTokens=24, temperature=0',
    caveat: 'provider order was not rotated; HTTP and SDK generation defaults are not byte-identical'
  },
  summaries,
  results
}
const outputPath = path.join(root, 'docs/arena/runtime-compatibility-logs/visionpsy-qvac-018-kpi-audit.json')
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ outputPath, summaries }, null, 2))
process.exit(results.every(item => item.status === 'PASS') ? 0 : 1)
