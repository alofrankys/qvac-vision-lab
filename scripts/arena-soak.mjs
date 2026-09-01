import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { VisionPsyPatchedBaseProvider, Lfm25VlProvider } from '../src/vision/visionpsy-patched-provider.mjs'
import { QvacSmolVlm2Provider } from '../src/vision/qvac-smolvlm2-provider.mjs'

const state = JSON.parse(await readFile(new URL('../data/pawvault.json', import.meta.url)))
const modelLock = JSON.parse(await readFile(new URL('../config/fair-arena-model-lock.json', import.meta.url)))
const photos = state.photos.filter(item => item.inferenceFilename && item.imagePipeline?.ready).slice(0, 2)
const factories = [
  () => new VisionPsyPatchedBaseProvider({ ...process.env, VISIONPSY_BASE_PORT: '8894' }),
  () => new Lfm25VlProvider({ ...process.env, LFM25_PORT: '8896' }),
  () => new QvacSmolVlm2Provider()
]
const callsPerProvider = 18
const report = { schemaVersion: 1, kind: 'TECHNICAL_SOAK_NOT_BENCHMARK', callsPerProvider, startedAt: new Date().toISOString(), freeMemoryBeforeBytes: os.freemem(), providers: [] }

for (const factory of factories) {
  const provider = factory(); const calls = []; const pids = new Set(); const rssSamples = []; const hostRssSamples = [process.memoryUsage().rss]; const systemUsedSamples = [os.totalmem() - os.freemem()]
  const locked = modelLock.primaryModels.find(item => item.providerId === provider.definition.id)
  const prompts = ['State the dominant visible color in one short phrase.', 'Name the largest visible object in one short phrase.', 'Where is the most visible dog physically located? Answer in one short phrase.']
  const sampler = setInterval(() => { systemUsedSamples.push(os.totalmem() - os.freemem()); hostRssSamples.push(process.memoryUsage().rss); for (const pid of pids) { const rss = rssBytes(pid); if (rss) rssSamples.push(rss) } }, 50)
  let runtimeMetadata = null
  try {
    for (let index = 0; index < callsPerProvider; index++) {
      const photo = photos[index % photos.length]
      const prompt = prompts[index % prompts.length]
      try {
        const result = await provider.analyzeImage({ runId: `technical-soak-${provider.definition.id}`, imagePath: path.resolve('data/inference-images', photo.inferenceFilename), prompt, promptVersion: 'fair-arena-technical-soak-v1', outputMode: 'semantic', allowedLabels: [], maxTokens: 32, timeoutMs: 30000 })
        const pid = result.runtimeStats?.pid || result.runtimeStats?.server_pid || null; if (pid) pids.add(pid)
        const rss = pid ? rssBytes(pid) : null; if (rss) rssSamples.push(rss)
        calls.push({ ok: true, photoId: photo.id, prompt, providerId: result.providerId, modelVersion: result.modelVersion, revisionMatched: Boolean(locked && String(result.modelVersion).includes(locked.revision)), identityMatched: result.providerId === provider.definition.id, latencyMs: result.latencyMs, coldStartMs: result.runtimeStats?.coldStartMs ?? null, warmInferenceMs: result.runtimeStats?.warmInferenceMs ?? null, reused: result.runtimeStats?.serverReused ?? result.runtimeStats?.modelReused ?? null, retryCount: result.runtimeStats?.retry_count ?? 0, restartCount: result.runtimeStats?.server_restart_count ?? 0, processRssBytes: rss, hostProcessRssBytes: process.memoryUsage().rss, systemUsedMemoryBytes: os.totalmem() - os.freemem(), rawOutputHash: createHash('sha256').update(result.rawOutput).digest('hex'), rawOutputPrefix: result.rawOutput.slice(0, 160) })
      } catch (error) { calls.push({ ok: false, errorCode: error.code || 'PROVIDER_CALL_FAILED', error: error.message }) }
    }
    runtimeMetadata = await provider.runtimeMetadata().catch(error => ({ error: error.message }))
    const latencies = calls.filter(item => item.ok).map(item => item.latencyMs)
    const staleOutputSuspicions = calls.slice(1).filter((item, index) => item.ok && calls[index].ok && item.rawOutputHash === calls[index].rawOutputHash && item.prompt !== calls[index].prompt).length
    const hiddenRetries = calls.filter(item => item.ok && item.retryCount !== 0).length
    const identityFailures = calls.filter(item => item.ok && (!item.identityMatched || !item.revisionMatched)).length
    const successful = calls.filter(item => item.ok)
    const firstLoaded = successful[0]; const lastLoaded = successful.at(-1)
    const rssField = pids.size ? 'processRssBytes' : 'hostProcessRssBytes'
    const lateStart = successful.at(-7)?.[rssField] ?? null; const lateEnd = lastLoaded?.[rssField] ?? null
    const lateRssGrowthBytes = lateStart != null && lateEnd != null ? lateEnd - lateStart : null
    const memoryStable = lateRssGrowthBytes == null || lateRssGrowthBytes <= 64 * 1024 * 1024
    report.providers.push({ providerId: provider.definition.id, passed: calls.length === callsPerProvider && calls.every(item => item.ok) && pids.size <= 1 && !hiddenRetries && !identityFailures && !staleOutputSuspicions && memoryStable, calls: calls.length, failures: calls.filter(item => !item.ok), identityFailures, hiddenRetries, staleOutputSuspicions, memoryStable, uniquePids: [...pids], providerRssSource: pids.size ? 'native-provider-process' : 'in-process-sdk-host', peakProviderRssBytes: pids.size ? (rssSamples.length ? Math.max(...rssSamples) : null) : Math.max(...hostRssSamples), lateRssGrowthBytes, peakSystemUsedMemoryBytes: Math.max(...systemUsedSamples), peakSystemIncreaseBytes: Math.max(...systemUsedSamples) - systemUsedSamples[0], averageLatencyMs: latencies.length ? Math.round(latencies.reduce((a,b) => a + b, 0) / latencies.length) : null, minLatencyMs: latencies.length ? Math.min(...latencies) : null, maxLatencyMs: latencies.length ? Math.max(...latencies) : null, coldStartMs: calls.find(item => item.coldStartMs != null)?.coldStartMs ?? null, warmLatencyMs: latencies.slice(1), runtimeMetadata, evidence: calls })
  } finally { clearInterval(sampler); await provider.shutdown() }
}
report.freeMemoryAfterBytes = os.freemem()
report.finishedAt = new Date().toISOString()
report.passed = report.providers.every(item => item.passed)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exit(report.passed ? 0 : 1)

function rssBytes(pid) {
  try { return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) * 1024 || null }
  catch { return null }
}
