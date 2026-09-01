import path from 'node:path'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { VisionProviderRegistry } from '../src/vision/providers.mjs'
import { TASKS, normalizeOutput } from '../src/domain/tasks.mjs'

const [providerId, ...imagePaths] = process.argv.slice(2)
if (!providerId || imagePaths.length === 0) {
  console.error('Usage: node scripts/smoke-provider.mjs <provider-id> <absolute-image> [absolute-image]')
  process.exit(2)
}

const task = TASKS.find(item => item.id === 'environment')
const registry = new VisionProviderRegistry()
const provider = registry.get(providerId)
const status = await provider.status()
const report = { kind: 'REAL_PROVIDER_SMOKE', provider: status, taskId: task.id, results: [] }

try {
  if (status.state !== 'READY') throw new Error(status.reason || `Provider ${providerId} is ${status.state}`)
  for (const imagePath of imagePaths) {
    const resolved = path.resolve(imagePath)
    await access(resolved)
    const result = await provider.analyzeImage({ imagePath: resolved, prompt: task.prompt, allowedLabels: task.labels, taskId: task.id })
    report.results.push({ image: path.basename(resolved), ...result, ...normalizeOutput(result.rawOutput, task.labels) })
  }
} catch (error) {
  report.error = String(error.stack || error)
} finally {
  await registry.shutdown()
}

const outputDir = path.resolve('data/smoke-results')
await mkdir(outputDir, { recursive: true })
const outputPath = path.join(outputDir, `${providerId}-latest.json`)
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
const failed = report.error || report.results.some(item => item.validationResult !== 'VALID')
process.exit(failed ? 1 : 0)
