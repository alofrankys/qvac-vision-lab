import { access, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import path from 'node:path'
import os from 'node:os'
import { assertVisionTaskInput, resultProvenance } from './provider-contract.mjs'

const DEFAULT_MODEL = path.join(os.homedir(), '.qvac/models/8fe2e85ea66c27c8_visionpsy-nano-460m-flash-q4_k_m-imat.gguf')
const DEFAULT_PROJECTION = path.join(os.homedir(), '.qvac/models/a8585d02f6913607_mmproj-visionpsy-nano-460m-flash-q8.gguf')
const DEFAULT_BASE_MODEL = path.join(os.homedir(), '.qvac/models/194207cdb1a218aa_visionpsy-nano-460m-q8_0.gguf')
const DEFAULT_BASE_PROJECTION = path.join(os.homedir(), '.qvac/models/4abdf8c5183110ba_mmproj-visionpsy-nano-460m-q8.gguf')
const DEFAULT_LFM_MODEL = path.join(os.homedir(), '.qvac/models/fair_lfm2.5-vl-450m-q8_0.gguf')
const DEFAULT_LFM_PROJECTION = path.join(os.homedir(), '.qvac/models/fair_mmproj-lfm2.5-vl-450m-q8_0.gguf')
const BIN_DIR = path.join(os.homedir(), 'Projects/visionpsy-twinpaws/vendor/llama-mtmd-metal/bin')

export class VisionPsyPatchedProvider {
  constructor(env = process.env, variant = 'flash') {
    this.variant = variant
    const cliDirectory = env.VISIONPSY_PATCHED_CLI ? path.dirname(env.VISIONPSY_PATCHED_CLI) : BIN_DIR
    this.serverPath = env.VISIONPSY_PATCHED_SERVER || path.join(cliDirectory, 'llama-server')
    const isBase = variant === 'base'
    const isLfm = variant === 'lfm25'
    const modelEnv = isLfm ? 'LFM25_MODEL' : isBase ? 'VISIONPSY_BASE_MODEL' : 'VISIONPSY_PATCHED_MODEL'
    const projectionEnv = isLfm ? 'LFM25_MMPROJ' : isBase ? 'VISIONPSY_BASE_MMPROJ' : 'VISIONPSY_PATCHED_MMPROJ'
    const portEnv = isLfm ? 'LFM25_PORT' : isBase ? 'VISIONPSY_BASE_PORT' : 'VISIONPSY_PATCHED_PORT'
    this.modelPath = env[modelEnv] || (isLfm ? DEFAULT_LFM_MODEL : isBase ? DEFAULT_BASE_MODEL : DEFAULT_MODEL)
    this.projectionPath = env[projectionEnv] || (isLfm ? DEFAULT_LFM_PROJECTION : isBase ? DEFAULT_BASE_PROJECTION : DEFAULT_PROJECTION)
    this.port = Number(env[portEnv] || (isLfm ? 8796 : isBase ? 8794 : 8793))
    this.gpuLayers = Number(env.VISIONPSY_GPU_LAYERS ?? 99)
    this.predictionTimeoutMs = Number(env.PAWVAULT_PREDICTION_TIMEOUT_MS || 30000)
    this.server = null
    this.serverLogs = ''
    this.startPromise = null
    this.coldStartMs = null
    this.serverStartedAt = null
    this.serverRestartCount = 0
    this.active = new Map()
    this.idleTimer = null
    const idleUnloadMs = Number(env.QVAC_VISION_IDLE_UNLOAD_MS || 900000)
    this.idleUnloadMs = Number.isFinite(idleUnloadMs) && idleUnloadMs > 0 ? idleUnloadMs : null
    this.lastUsedAt = null
    this.stopPromise = null
    const forceBaseNoUpscale = isBase && env.VISIONPSY_BASE_NO_UPSCALE === '1'
    this.preprocessPolicy = isBase ? (forceBaseNoUpscale ? 'diagnostic-standard-no-upscale' : 'official-standard-tiled-upscale') : isLfm ? 'runtime-default' : 'native-resolution-no-upscale'
    this.definition = {
      id: isLfm ? 'lfm2.5-vl-450m' : isBase ? 'visionpsy-patched-base' : 'visionpsy-patched',
      name: isLfm ? 'LFM2.5-VL-450M' : `VisionPsy Patched — ${isBase ? 'Standard' : 'Flash'}`,
      kind: isLfm ? 'FAIR_ARENA_PEER' : 'VISIONPSY_PATCHED',
      runtime: 'patched llama.cpp mtmd server', runtimeVersion: 'tether-ai-research/qvac-visionpsy-nano@896c8b90f5fe372bd587bc4336ab9f07e8ea1eca',
      model: isLfm ? 'LFM2.5-VL-450M' : isBase ? 'VisionPsy-Nano-460M' : 'VisionPsy-Nano-460M-Flash',
      modelVersion: isLfm ? 'LiquidAI/LFM2.5-VL-450M-GGUF@6f15859c2de1583b6180a9bc56338342592b589a · Q8_0' : isBase ? 'qvac/VisionPsy-Nano-460M-GGUFs@4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1 · Q8_0' : 'a24fb9cdd1119406b15ff60b06a51f8438a931c1 · Q4_K_M · imatrix',
      projection: path.basename(this.projectionPath), label: `${isLfm ? 'PRIMARY PEER' : `PATCHED ${isBase ? `STANDARD · ${forceBaseNoUpscale ? 'DIAGNOSTIC NO UPSCALE' : 'OFFICIAL TILING'}` : 'FLASH Q4 · NATIVE RESOLUTION'}`} · ${this.gpuLayers > 0 ? 'METAL' : 'CPU'}`
    }
  }

  async status() {
    try {
      await Promise.all([access(this.serverPath), access(this.modelPath), access(this.projectionPath)])
      return { ...this.definition, state: 'READY', ready: true, reason: null, loaded: Boolean(this.server), pid: this.server?.pid ?? null, coldStartMs: this.coldStartMs, serverStartedAt: this.serverStartedAt, serverRestartCount: this.serverRestartCount, idleUnloadMs: this.idleUnloadMs, lastUsedAt: this.lastUsedAt ? new Date(this.lastUsedAt).toISOString() : null }
    } catch (error) {
      return { ...this.definition, state: 'UNAVAILABLE', ready: false, reason: `Official patched runtime unavailable: ${error.message}` }
    }
  }

  async ensureServer({ onTrace, signal, deadline }) {
    this.clearIdleTimer()
    if (this.stopPromise) await this.stopPromise
    if (this.server) {
      try {
        const healthController = new AbortController()
        const health = await withHardTimeout(fetch(`http://127.0.0.1:${this.port}/health`, { signal: healthController.signal }), Math.max(1, Math.min(1500, deadline - Date.now())), () => healthController.abort(), 'VisionPsy health check timed out')
        if (!health.ok) throw new Error(`health HTTP ${health.status}`)
      } catch {
        onTrace?.({ stage: 'server_health_failed', pid: this.server.pid })
        await this.restartServer('HEALTH_CHECK_FAILED')
        return this.ensureServer({ onTrace, signal, deadline })
      }
      onTrace?.({ stage: 'runtime_process_reuse', pid: this.server.pid })
      onTrace?.({ stage: 'model_ready', pid: this.server.pid, coldStartMs: this.coldStartMs, reused: true })
      return { reused: true, coldStartMs: this.coldStartMs }
    }
    if (this.startPromise) return this.startPromise
    this.startPromise = (async () => {
      const started = performance.now()
      if (await portResponds(this.port)) throw codedError('MODEL_IDENTITY_MISMATCH', `Refusing to attach to an unowned runtime already listening on port ${this.port}`, null, '')
      const args = ['-m', this.modelPath, '--mmproj', this.projectionPath, '--host', '127.0.0.1', '--port', String(this.port), '-c', '8192', '-ngl', String(this.gpuLayers), '--parallel', '1']
      const child = spawn(this.serverPath, args, { env: buildPatchedServerEnvironment(process.env, this.variant), stdio: ['ignore', 'pipe', 'pipe'], detached: true })
      this.server = child
      this.serverStartedAt = new Date().toISOString()
      onTrace?.({ stage: 'runtime_process_start', pid: child.pid })
      const capture = chunk => { this.serverLogs = `${this.serverLogs}${chunk}`.slice(-16000) }
      child.stdout.on('data', capture)
      child.stderr.on('data', capture)
      child.once('close', () => { if (this.server === child) this.server = null })
      while (Date.now() < deadline) {
        if (signal.aborted) {
          await terminateProcessAndWait(child)
          throw new DOMException('VisionPsy startup aborted', 'AbortError')
        }
        if (this.server !== child) throw codedError('PROVIDER_CALL_FAILED', 'VisionPsy server exited during startup', child.pid, this.serverLogs)
        try {
          const healthController = new AbortController()
          const abortHealth = () => healthController.abort()
          signal.addEventListener('abort', abortHealth, { once: true })
          let response
          try { response = await withHardTimeout(fetch(`http://127.0.0.1:${this.port}/health`, { signal: healthController.signal }), Math.max(1, Math.min(1500, deadline - Date.now())), () => healthController.abort(), 'VisionPsy startup health check timed out') }
          finally { signal.removeEventListener('abort', abortHealth) }
          if (response.ok) {
            this.coldStartMs = Math.round(performance.now() - started)
            onTrace?.({ stage: 'model_ready', pid: child.pid, coldStartMs: this.coldStartMs, reused: false })
            return { reused: false, coldStartMs: this.coldStartMs }
          }
        } catch (error) {
          if (signal.aborted) {
            await terminateProcessAndWait(child)
            throw new DOMException('VisionPsy startup aborted', 'AbortError')
          }
        }
        await delay(200)
      }
      await terminateProcessAndWait(child)
      throw codedError('MODEL_TIMEOUT', `VisionPsy prediction timed out after ${this.predictionTimeoutMs} ms during runtime startup`, child.pid, this.serverLogs)
    })()
    try { return await this.startPromise } finally { this.startPromise = null }
  }

  async analyzeImage(input) {
    assertVisionTaskInput(input)
    const started = performance.now()
    const timeoutMs = input.timeoutMs || this.predictionTimeoutMs
    const deadline = Date.now() + timeoutMs
    const trace = []
    const emit = event => {
      const item = { at: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started), ...event }
      trace.push(item)
      input.onTrace?.(item)
    }
    const controller = new AbortController()
    const abort = () => controller.abort()
    input.signal?.addEventListener('abort', abort, { once: true })
    this.active.set(input.runId, controller)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    emit({ stage: 'provider_invocation_start' })
    let providerPid = null
    try {
      const lifecycle = await this.ensureServer({ onTrace: emit, signal: controller.signal, deadline })
      providerPid = this.server?.pid ?? null
      emit({ stage: 'inference_image_read_start', pid: this.server?.pid })
      const readStarted = performance.now()
      const bytes = input.imageBytes || await readFile(input.imagePath)
      emit({ stage: 'inference_image_read_end', pid: this.server?.pid, durationMs: Math.round(performance.now() - readStarted), byteLength: bytes.length })
      if (controller.signal.aborted) throw abortError(input, timeoutMs, this.server?.pid, this.serverLogs)
      emit({ stage: 'prompt_sent', pid: this.server?.pid })
      const promptSentAt = performance.now()
      const streaming = typeof input.onToken === 'function'
      const request = fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPatchedChatRequest({
          modelPath: this.modelPath,
          prompt: input.prompt,
          imageBytes: bytes,
          maxTokens: input.maxTokens || 24,
          stream: streaming
        }))
      })
      const response = await withHardTimeout(request, Math.max(1, deadline - Date.now()), () => controller.abort(), 'VisionPsy HTTP request exceeded its hard deadline')
      emit({ stage: 'response_headers', pid: this.server?.pid })
      if (!response.ok) throw codedError('PROVIDER_CALL_FAILED', `VisionPsy server HTTP ${response.status}: ${(await response.text()).slice(-2000)}`, this.server?.pid, this.serverLogs)
      let rawOutput = ''
      let usage = null
      let timeToFirstTokenMs = null
      let promptToFirstTokenMs = null
      if (streaming && response.body) {
        const streamed = await readChatCompletionStream(response.body, {
          onToken: token => {
            if (timeToFirstTokenMs == null && token) {
              timeToFirstTokenMs = Math.round(performance.now() - started)
              promptToFirstTokenMs = Math.round(performance.now() - promptSentAt)
              emit({ stage: 'first_token', pid: this.server?.pid, timeToFirstTokenMs, promptToFirstTokenMs })
            }
            input.onToken(token)
          }
        })
        rawOutput = streamed.rawOutput
        usage = streamed.usage
      } else {
        const data = await response.json()
        rawOutput = data.choices?.[0]?.message?.content || ''
        usage = data.usage || null
        if (rawOutput) {
          timeToFirstTokenMs = Math.round(performance.now() - started)
          promptToFirstTokenMs = Math.round(performance.now() - promptSentAt)
          emit({ stage: 'first_token', pid: this.server?.pid, timeToFirstTokenMs, promptToFirstTokenMs })
        }
      }
      const latencyMs = Math.round(performance.now() - started)
      await delay(20)
      const nativeTimings = parseNativeTimings(this.serverLogs)
      const outputTokens = nativeTimings.generationTokens ?? usage?.completion_tokens ?? null
      const tokensPerSecond = Number.isFinite(outputTokens) && Number.isFinite(nativeTimings.generationMs) && nativeTimings.generationMs > 0
        ? outputTokens / (nativeTimings.generationMs / 1000)
        : null
      emit({ stage: 'provider_invocation_end', pid: this.server?.pid })
      return resultProvenance(this.definition, {
        rawOutput, latencyMs, promptVersion: input.promptVersion,
        runtimeStats: {
          backend: this.gpuLayers > 0 ? 'metal' : 'cpu', gpuLayers: this.gpuLayers, lifecycle: 'llama-server reused while active and stopped after idle timeout', pid: this.server?.pid,
          coldStartMs: lifecycle.reused ? null : lifecycle.coldStartMs,
          warmInferenceMs: lifecycle.reused ? latencyMs : null,
          serverReused: lifecycle.reused, timeoutMs, nativeTimings, timeToFirstTokenMs, promptToFirstTokenMs, outputTokens, tokensPerSecond, usage, trace, stderrTail: this.serverLogs.slice(-8000),
          server_pid: this.server?.pid ?? null, server_started_at: this.serverStartedAt, server_restart_count: this.serverRestartCount,
          preprocessPolicy: this.preprocessPolicy,
          request_started_at: trace[0]?.at ?? new Date().toISOString(), request_finished_at: new Date().toISOString(), timeout_triggered: false, retry_count: input.retryCount || 0
        }
      })
    } catch (error) {
      if (error.name === 'AbortError') {
        const pid = providerPid ?? this.server?.pid
        const timedOutServerStartedAt = this.serverStartedAt
        // A timed-out native request may continue computing after the HTTP client
        // disconnects. Terminate it before advancing the queue; the next task will
        // cold-start a clean server instead of overlapping a stuck process.
        if (!input.signal?.aborted) await this.restartServer('MODEL_TIMEOUT')
        const failure = abortError(input, timeoutMs, pid, this.serverLogs)
        Object.assign(failure, { serverStartedAt: timedOutServerStartedAt, serverRestartCount: this.serverRestartCount, requestStartedAt: trace[0]?.at, requestFinishedAt: new Date().toISOString(), timeoutTriggered: !input.signal?.aborted, retryCount: input.retryCount || 0 })
        throw failure
      }
      throw error
    } finally {
      clearTimeout(timer)
      input.signal?.removeEventListener('abort', abort)
      this.active.delete(input.runId)
      this.lastUsedAt = Date.now()
      this.scheduleIdleUnload()
    }
  }

  async cancel(runId) {
    const active = this.active.get(runId)
    if (active) active.abort()
    // A cancelled HTTP request can leave native inference running. Kill the owned
    // server process so the next run starts from a known-clean lifecycle.
    await this.stopServer(false)
    return Boolean(active)
  }

  async restartServer() {
    const restarted = await this.stopServer(true)
    return { restarted, restartCount: this.serverRestartCount }
  }

  async runtimeMetadata() { return this.status() }
  async shutdown() {
    this.clearIdleTimer()
    for (const controller of this.active.values()) controller.abort()
    await this.stopServer(false)
  }

  clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  scheduleIdleUnload() {
    this.clearIdleTimer()
    if (!this.idleUnloadMs || !this.server || this.active.size) return
    const expectedLastUsedAt = this.lastUsedAt
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.active.size || this.lastUsedAt !== expectedLastUsedAt) return
      this.stopServer(false).catch(error => console.error(`${this.definition.id} idle unload failed`, error))
    }, this.idleUnloadMs)
    this.idleTimer.unref?.()
  }

  async stopServer(countRestart) {
    this.clearIdleTimer()
    if (this.stopPromise) return this.stopPromise
    const child = this.server
    if (!child) return false
    this.server = null
    this.serverStartedAt = null
    this.startPromise = null
    const operation = terminateProcessAndWait(child).then(() => {
      if (countRestart) this.serverRestartCount += 1
      return true
    })
    this.stopPromise = operation
    try { return await operation } finally { if (this.stopPromise === operation) this.stopPromise = null }
  }
}

export class VisionPsyPatchedBaseProvider extends VisionPsyPatchedProvider {
  constructor(env = process.env) { super(env, 'base') }
}

export class Lfm25VlProvider extends VisionPsyPatchedProvider {
  constructor(env = process.env) { super(env, 'lfm25') }
}

// The QVAC mtmd reference path places the image marker before the question.
// Keep this payload builder exported so protocol tests can prevent an
// accidental text-first regression, which materially changes VisionPsy scores.
export function buildPatchedChatRequest({ modelPath, prompt, imageBytes, maxTokens = 24, stream = false }) {
  return {
    model: modelPath,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBytes.toString('base64')}` } },
        { type: 'text', text: prompt }
      ]
    }],
    temperature: 0,
    max_tokens: maxTokens,
    stream
  }
}

export function buildPatchedServerEnvironment(env, variant = 'flash') {
  const serverEnvironment = { ...env }
  delete serverEnvironment.MTMD_NO_UPSCALE
  if (variant === 'flash' || (variant === 'base' && env.VISIONPSY_BASE_NO_UPSCALE === '1')) serverEnvironment.MTMD_NO_UPSCALE = '1'
  return serverEnvironment
}

export async function readChatCompletionStream(body, { onToken = () => {} } = {}) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let rawOutput = ''
  let usage = null
  const consume = line => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return false
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return payload === '[DONE]'
    let event
    try { event = JSON.parse(payload) } catch { return false }
    usage = event.usage || usage
    const content = event.choices?.[0]?.delta?.content ?? event.choices?.[0]?.text ?? ''
    const token = Array.isArray(content) ? content.map(item => item?.text || '').join('') : String(content || '')
    if (token) {
      rawOutput += token
      onToken(token)
    }
    return false
  }
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    let finished = false
    for (const line of lines) if (consume(line)) finished = true
    if (finished || done) break
  }
  if (buffer) consume(buffer)
  return { rawOutput, usage }
}

function parseNativeTimings(logs) {
  const prompt = [...logs.matchAll(/prompt eval time\s*=\s*([0-9.]+) ms \/\s*(\d+) tokens/g)].at(-1)
  const generation = [...logs.matchAll(/(?:generation )?eval time\s*=\s*([0-9.]+) ms \/\s*(\d+)(?: runs| tokens)/g)].at(-1)
  const total = [...logs.matchAll(/total time\s*=\s*([0-9.]+) ms/g)].at(-1)
  return { promptEvalMs: prompt ? Number(prompt[1]) : null, promptTokens: prompt ? Number(prompt[2]) : null, generationMs: generation ? Number(generation[1]) : null, generationTokens: generation ? Number(generation[2]) : null, totalMs: total ? Number(total[1]) : null }
}

function abortError(input, timeoutMs, pid, logs) {
  return codedError(input.signal?.aborted ? 'RUN_CANCELLED' : 'MODEL_TIMEOUT', input.signal?.aborted ? 'Run cancelled by user' : `VisionPsy prediction timed out after ${timeoutMs} ms`, pid, logs)
}

function codedError(code, message, pid, stderr) {
  return Object.assign(new Error(message), { code, pid, stderr })
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function portResponds(port) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 250)
  try { await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal }); return true }
  catch { return false }
  finally { clearTimeout(timer) }
}

function terminateProcess(child, signal = 'SIGTERM') {
  if (!child?.pid) return
  try { process.kill(-child.pid, signal) } catch { try { child.kill(signal) } catch {} }
}

async function terminateProcessAndWait(child) {
  if (!child?.pid || child.exitCode !== null) return
  const closed = new Promise(resolve => child.once('close', resolve))
  terminateProcess(child)
  if (await Promise.race([closed.then(() => true), delay(1500).then(() => false)])) return
  terminateProcess(child, 'SIGKILL')
  await Promise.race([closed, delay(500)])
}

export function withHardTimeout(promise, timeoutMs, onTimeout = () => {}, message = 'Operation exceeded its hard deadline') {
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout()
      reject(new DOMException(message, 'AbortError'))
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Exported only for deterministic subprocess timeout/cancel regression tests.
export function executePatchedProcess(command, args, env, options = {}) {
  return new Promise((resolve, reject) => {
    const processStartedAt = new Date().toISOString()
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    options.onSpawn?.(child)
    let stdout = ''
    let stderr = ''
    let failure = null
    let firstOutputAt = null
    let modelReadyAt = null
    const fail = (code, message) => {
      if (failure) return
      failure = codedError(code, message, child.pid, stderr)
      Object.assign(failure, { stdout })
      terminateProcess(child)
    }
    const timer = setTimeout(() => fail('MODEL_TIMEOUT', `Process timed out after ${options.timeoutMs} ms`), options.timeoutMs)
    const abort = () => fail('RUN_CANCELLED', 'Run cancelled by user')
    options.signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', chunk => { stdout += chunk; firstOutputAt ||= new Date().toISOString(); options.onFirstOutput?.() })
    child.stderr.on('data', chunk => { stderr += chunk; if (/loading model:/i.test(String(chunk))) { modelReadyAt ||= new Date().toISOString(); options.onModelReady?.() } })
    child.on('error', error => { failure ||= error })
    child.on('close', code => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      if (failure) return reject(failure)
      if (code !== 0) return reject(new Error(`Process exited ${code}`))
      resolve({ stdout, stderr, pid: child.pid, processStartedAt, processEndedAt: new Date().toISOString(), firstOutputAt, modelReadyAt })
    })
  })
}
