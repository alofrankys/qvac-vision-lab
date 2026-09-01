import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { QvacVisionPsyProvider } from '../src/vision/qvac-visionpsy-provider.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packRoot = path.join(root, 'packs', 'visionpsy-smart-100-04')
const manifest = JSON.parse(await readFile(path.join(packRoot, 'manifest.json'), 'utf8'))
const selectedIds = new Set(['smart100-019', 'smart100-031'])
const cases = manifest.items.filter(item => selectedIds.has(item.id))
const provider = new QvacVisionPsyProvider()
const report = { kind: 'QVAC_VISIONPSY_018_VERIFICATION', timestamp: new Date().toISOString(), cases: [] }

try {
  for (const item of cases) {
    const result = await provider.analyzeImage({
      runId: `sdk-018-${item.id}`,
      imagePath: path.join(packRoot, item.filename),
      prompt: item.question,
      outputMode: 'semantic',
      maxTokens: 64,
      timeoutMs: 45000
    })
    const output = result.rawOutput.trim()
    const accepted = new Set([item.expectedAnswer, ...(item.acceptedAnswers || [])].map(value => value.trim()))
    report.cases.push({
      id: item.id,
      expected: item.expectedAnswer,
      output,
      exactMatch: accepted.has(output),
      latencyMs: result.latencyMs,
      modelReused: result.runtimeStats.modelReused,
      backendDevice: result.runtimeStats.backendDevice
    })
  }
} catch (error) {
  report.error = String(error.stack || error)
} finally {
  await provider.shutdown()
}

report.functionalPass = !report.error && report.cases.length === cases.length
report.exactMatches = report.cases.filter(item => item.exactMatch).length
console.log(JSON.stringify(report, null, 2))
process.exit(report.functionalPass ? 0 : 1)
