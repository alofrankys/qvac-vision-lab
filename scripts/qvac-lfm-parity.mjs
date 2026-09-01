#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { QvacMultimodalProvider } from '../src/vision/qvac-provider.mjs'
import { Lfm25VlProvider } from '../src/vision/visionpsy-patched-provider.mjs'

const root = path.resolve(import.meta.dirname, '..')
const home = process.env.HOME
const images = [
  'data/inference-images/eacf9234-414a-4cff-a62d-f0e6120607c9.jpg',
  'data/inference-images/9a894466-0176-45ce-afb1-82199183a31f.jpg'
].map(item => path.join(root, item))
const questions = [
  'What color is the most visible dog?',
  'What is the most visible dog physically resting on?',
  'Is this photo indoors or outdoors?'
]

const qvac = new QvacMultimodalProvider({
  status: {
    id: 'lfm-qvac-parity', name: 'LFM2.5 QVAC parity', kind: 'DIAGNOSTIC',
    runtime: 'QVAC MTMD', runtimeVersion: '@qvac/sdk 0.17.0 · @qvac/llm-llamacpp 0.39.4',
    model: 'LFM2.5-VL-450M', modelVersion: '6f15859c2de1583b6180a9bc56338342592b589a · Q8_0',
    projection: 'fair_mmproj-lfm2.5-vl-450m-q8_0.gguf', state: 'READY', label: 'DIAGNOSTIC', reason: null
  },
  modelSource: path.join(home, '.qvac/models/fair_lfm2.5-vl-450m-q8_0.gguf'),
  projectionSource: path.join(home, '.qvac/models/fair_mmproj-lfm2.5-vl-450m-q8_0.gguf'),
  modelConfig: { ctx_size: 4096, 'mmproj-use-gpu': true }
})
const patched = new Lfm25VlProvider({ ...process.env, PAWVAULT_PREDICTION_TIMEOUT_MS: '60000' })
const providers = [['qvac', qvac], ['patched_llamacpp', patched]]
const results = []

try {
  for (const [providerName, provider] of providers) {
    for (const [imageIndex, imagePath] of images.entries()) {
      for (const [questionIndex, prompt] of questions.entries()) {
        const runId = `lfm-parity-${providerName}-${imageIndex}-${questionIndex}`
        try {
          const result = await provider.analyzeImage({
            runId, imagePath, prompt, outputMode: 'semantic', promptVersion: 'disposable-qvac-parity-v1',
            maxTokens: 32, timeoutMs: 60_000
          })
          results.push({ provider: providerName, imagePath, prompt, status: 'PASS', rawOutput: result.rawOutput, latencyMs: result.latencyMs, runtimeStats: result.runtimeStats })
        } catch (error) {
          results.push({ provider: providerName, imagePath, prompt, status: 'FAIL', error: { code: error.code, message: error.message } })
        }
      }
    }
  }
} finally {
  await Promise.allSettled(providers.map(([, provider]) => provider.shutdown()))
}

const passCount = results.filter(item => item.status === 'PASS').length
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  purpose: 'Disposable runtime parity only; not benchmark or ranking data.',
  images, questions, passCount, total: results.length, results
}, null, 2))
process.exit(passCount === results.length ? 0 : 1)
