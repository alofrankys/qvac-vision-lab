import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { QvacVisionPsyFlashQ4Provider, QvacVisionPsyProvider, QvacVisionPsyStandardQ8Provider } from '../src/vision/qvac-visionpsy-provider.mjs'
import { REALWORLDQA_CASES, scoreShowcaseAnswer } from '../src/showcase/index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const showcaseCase = REALWORLDQA_CASES[0]
const imagePath = path.join(root, 'public', showcaseCase.imageUrl.replace(/^\//, ''))
const providers = [new QvacVisionPsyStandardQ8Provider(), new QvacVisionPsyProvider(), new QvacVisionPsyFlashQ4Provider()]
const report = {
  kind: 'QVAC_VISIONPSY_THREE_WAY_NATIVE_VERIFICATION',
  timestamp: new Date().toISOString(),
  caseId: showcaseCase.id,
  imageSha256: showcaseCase.imageSha256,
  results: []
}

try {
  for (const provider of providers) {
    const status = await provider.status()
    const result = await provider.analyzeImage({
      runId: `qvac-native-smoke-${status.id}`,
      imagePath,
      prompt: showcaseCase.prompt,
      outputMode: 'semantic',
      maxTokens: 16,
      timeoutMs: 90000
    })
    report.results.push({
      providerId: status.id,
      runtime: status.runtime,
      runtimeVersion: status.runtimeVersion,
      model: status.model,
      modelVersion: status.modelVersion,
      projection: status.projection,
      preprocessPolicy: result.runtimeStats.preprocessPolicy,
      output: result.rawOutput.trim(),
      evaluation: scoreShowcaseAnswer(showcaseCase, result.rawOutput),
      latencyMs: result.latencyMs,
      backend: result.runtimeStats.backend
    })
    await provider.shutdown()
  }
} catch (error) {
  report.error = String(error.stack || error)
} finally {
  await Promise.allSettled(providers.map(provider => provider.shutdown()))
}

report.functionalPass = !report.error && report.results.length === providers.length && report.results.every(item => item.backend === 'gpu')
console.log(JSON.stringify(report, null, 2))
process.exit(report.functionalPass ? 0 : 1)
