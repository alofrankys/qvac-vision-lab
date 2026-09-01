import {
  cancel,
  completion,
  getLoadedModelInfo,
  getSystemResources,
  loadModel,
  unloadModel
} from '@qvac/sdk'
import { execFile } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { promisify } from 'node:util'
import { assertVisionTaskInput, resultProvenance } from './provider-contract.mjs'

const GENERATION = Object.freeze({ temp: 0, top_p: 1, top_k: 40, seed: 42 })
const execFileAsync = promisify(execFile)

export class QvacMultimodalProvider {
  #modelId
  #loadPromise
  #loadSeconds
  #active = new Map()
  #hasCompletedPrediction = false
  #idleTimer
  #idleUnloadMs
  #lastUsedAt
  #unloadPromise
  #workerPid

  constructor({ status, modelSource, projectionSource, modelConfig = {}, preprocessPolicy, idleUnloadMs = Number(process.env.QVAC_VISION_IDLE_UNLOAD_MS || 900000) }) {
    this.definition = Object.freeze(status)
    this.modelSource = modelSource
    this.projectionSource = projectionSource
    this.modelConfig = modelConfig
    this.preprocessPolicy = preprocessPolicy || (modelConfig.image_no_upscale === 'on' ? 'native-resolution-no-upscale' : 'runtime-default')
    this.#idleUnloadMs = Number.isFinite(idleUnloadMs) && idleUnloadMs > 0 ? idleUnloadMs : null
  }

  async status() {
    return { ...this.definition, loaded: Boolean(this.#modelId), loadSeconds: this.#loadSeconds, idleUnloadMs: this.#idleUnloadMs, lastUsedAt: this.#lastUsedAt ? new Date(this.#lastUsedAt).toISOString() : null }
  }

  async #ensureLoaded() {
    this.#clearIdleTimer()
    if (this.#unloadPromise) await this.#unloadPromise
    if (this.definition.state !== 'READY') throw new Error(this.definition.reason)
    if (this.#modelId) return
    if (this.#loadPromise) return this.#loadPromise
    this.#loadPromise = (async () => {
      const started = performance.now()
      this.#modelId = await loadModel({
        modelSrc: this.modelSource,
        modelType: 'llamacpp-completion',
        modelConfig: {
          ctx_size: 2048,
          projectionModelSrc: this.projectionSource,
          gpu_layers: 99,
          device: 'gpu',
          image_tile_mode: 'sequential',
          ...this.modelConfig
        },
        onProgress: progress => process.stderr.write(`${this.definition.id} model ${progress.percentage.toFixed(0)}%\n`)
      }, { timeout: 1800000 })
      this.#loadSeconds = (performance.now() - started) / 1000
    })()
    try { await this.#loadPromise } finally { this.#loadPromise = undefined }
  }

  async analyzeImage(input) {
    assertVisionTaskInput(input)
    this.#clearIdleTimer()
    const invocationStarted = performance.now()
    // QVAC owns a Bare worker rather than a llama-server. Sample the host while
    // loading, then switch telemetry to the worker as soon as its PID is known.
    input.onTrace?.({ stage: 'provider_invocation_start', pid: this.#workerPid || process.pid, preprocessPolicy: this.preprocessPolicy })
    await this.#ensureLoaded()
    this.#workerPid = this.#workerPid || await findQvacWorkerPid(process.pid)
    const generationStarted = performance.now()
    const timeoutMs = Number(input.timeoutMs || 30000)
    const run = completion({
      modelId: this.#modelId,
      history: [{ role: 'user', content: input.prompt, attachments: [{ path: input.imagePath }] }],
      stream: true,
      generationParams: { ...GENERATION, predict: Number(input.maxTokens || 24) }
    })
    this.#active.set(input.runId, run.requestId)
    const controller = new AbortController()
    const abort = () => controller.abort()
    input.signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let rawOutput = ''
    let measuredTtftMs = null
    try {
      input.onTrace?.({ stage: 'model_ready', pid: this.#workerPid || process.pid, coldStartMs: this.#loadSeconds ? Math.round(this.#loadSeconds * 1000) : null, reused: this.#hasCompletedPrediction })
      input.onTrace?.({ stage: 'prompt_sent' })
      for await (const token of abortable(run.tokenStream, controller.signal)) {
        if (measuredTtftMs == null && token) {
          measuredTtftMs = Math.round(performance.now() - invocationStarted)
          input.onTrace?.({ stage: 'first_token', timeToFirstTokenMs: measuredTtftMs, promptToFirstTokenMs: Math.round(performance.now() - generationStarted) })
        }
        rawOutput += token
        input.onToken?.(token)
      }
      const warmInferenceMs = Math.round(performance.now() - generationStarted)
      const latencyMs = Math.round(performance.now() - invocationStarted)
      const firstPrediction = !this.#hasCompletedPrediction
      this.#hasCompletedPrediction = true
      const stats = await run.stats
      input.onTrace?.({ stage: 'provider_invocation_end' })
      return resultProvenance(this.definition, {
        rawOutput,
        latencyMs,
        runtimeStats: {
          ...stats,
          lifecycle: 'QVAC model reused while active and unloaded after idle timeout',
          coldStartMs: firstPrediction && this.#loadSeconds ? Math.round(this.#loadSeconds * 1000) : null,
          warmInferenceMs: firstPrediction ? null : warmInferenceMs,
          modelReused: !firstPrediction,
          serverReused: !firstPrediction,
          timeoutMs,
          requestId: run.requestId,
          timeToFirstTokenMs: measuredTtftMs ?? finiteRound(stats.timeToFirstToken),
          promptToFirstTokenMs: finiteRound(stats.timeToFirstToken),
          outputTokens: stats.generatedTokens ?? stats.emittedTokens ?? null,
          tokensPerSecond: stats.tokensPerSecond ?? null,
          backend: stats.backendDevice || 'gpu',
          nativeTimings: { promptTokens: stats.promptTokens ?? null, generationTokens: stats.generatedTokens ?? null },
          preprocessPolicy: this.preprocessPolicy,
          generation: { ...GENERATION, predict: Number(input.maxTokens || 24) }
        }
      })
    } catch (error) {
      if (controller.signal.aborted) {
        await cancel({ requestId: run.requestId }).catch(() => {})
        throw Object.assign(new Error(input.signal?.aborted ? 'Run cancelled by user' : `QVAC prediction timed out after ${timeoutMs} ms`), { code: input.signal?.aborted ? 'RUN_CANCELLED' : 'MODEL_TIMEOUT', requestId: run.requestId })
      }
      throw error
    } finally {
      clearTimeout(timer)
      input.signal?.removeEventListener('abort', abort)
      this.#active.delete(input.runId)
      this.#lastUsedAt = Date.now()
      this.#scheduleIdleUnload()
    }
  }

  async cancel(runId) {
    const requestId = this.#active.get(runId)
    if (!requestId) return false
    await cancel({ requestId }).catch(() => {})
    return true
  }

  async runtimeMetadata() {
    const status = await this.status()
    if (!this.#modelId) return status
    const [loadedModel, resources] = await Promise.all([
      getLoadedModelInfo({ modelId: this.#modelId }).catch(error => ({ error: String(error) })),
      getSystemResources().catch(error => ({ error: String(error) }))
    ])
    return { ...status, loadedModel, resources, generation: GENERATION, lifecycle: 'QVAC model reused while active and unloaded after idle timeout' }
  }

  async shutdown() {
    this.#clearIdleTimer()
    await this.#beginUnload(true)
  }

  #clearIdleTimer() {
    if (this.#idleTimer) clearTimeout(this.#idleTimer)
    this.#idleTimer = undefined
  }

  #scheduleIdleUnload() {
    this.#clearIdleTimer()
    if (!this.#idleUnloadMs || !this.#modelId || this.#active.size) return
    const expectedLastUsedAt = this.#lastUsedAt
    this.#idleTimer = setTimeout(() => {
      this.#idleTimer = undefined
      if (this.#active.size || this.#lastUsedAt !== expectedLastUsedAt) return
      this.#beginUnload(false).catch(error => console.error(`${this.definition.id} idle unload failed`, error))
    }, this.#idleUnloadMs)
    this.#idleTimer.unref?.()
  }

  async #beginUnload(force) {
    if (this.#unloadPromise) return this.#unloadPromise
    const operation = (async () => {
      if (this.#loadPromise) await this.#loadPromise.catch(() => {})
      if (!force && this.#active.size) return false
      if (!this.#modelId) return false
      const modelId = this.#modelId
      this.#modelId = undefined
      this.#workerPid = undefined
      this.#hasCompletedPrediction = false
      // SDK 0.18.x can wait indefinitely while auto-closing its Node IPC server
      // after the last model is unloaded. Keep the shared worker alive; the app's
      // own shutdown path terminates the Node process after provider cleanup.
      await unloadModel({ modelId, clearStorage: false, autoClose: false })
      return true
    })()
    this.#unloadPromise = operation
    try { return await operation } finally { if (this.#unloadPromise === operation) this.#unloadPromise = undefined }
  }
}

function finiteRound(value) { return Number.isFinite(value) ? Math.round(value) : null }

async function findQvacWorkerPid(parentPid) {
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,ppid=,command='], { timeout: 1000, maxBuffer: 2 * 1024 * 1024 })
    return parseQvacWorkerPid(stdout, parentPid)
  } catch {
    return null
  }
}

export function parseQvacWorkerPid(stdout, parentPid) {
  for (const line of String(stdout).split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
    if (match && Number(match[2]) === Number(parentPid) && /@qvac\/sdk\/dist\/server\/worker\.js/.test(match[3])) return Number(match[1])
  }
  return null
}

async function* abortable(iterable, signal) {
  const iterator = iterable[Symbol.asyncIterator]()
  while (true) {
    const next = iterator.next()
    const result = await Promise.race([next, new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))])
    if (result.done) return
    yield result.value
  }
}
