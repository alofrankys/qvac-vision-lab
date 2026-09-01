import { PRIMARY_ARENA_PROVIDER_IDS } from '../arena/index.mjs'

const REVISIONS = {
  'visionpsy-patched-base': '4138c5bd6e026d67cebf2dbd2d81c6229c14cdc1',
  'lfm2.5-vl-450m': '6f15859c2de1583b6180a9bc56338342592b589a',
  'qvac-smolvlm2': 'ccd7aae53bcb1997355c2f094959e72b3642ce17'
}

export function createFakeArenaProviders() { return PRIMARY_ARENA_PROVIDER_IDS.map(id => new FakeArenaProvider(id)) }

class FakeArenaProvider {
  constructor(id) {
    this.definition = { id, name: `Fake ${id}`, kind: 'TEST_ONLY_FAKE', runtime: 'synthetic-test-runtime', runtimeVersion: 'fake-v1', model: `fake-${id}`, modelVersion: `fake@${REVISIONS[id]}`, projection: 'fake-q8-projector', state: 'READY', ready: true, label: 'TEST ONLY' }
    this.active = new Map()
  }
  async status() { return { ...this.definition } }
  async runtimeMetadata() { return { ...this.definition, synthetic: true } }
  async analyzeImage(input) {
    const controller = new AbortController(); this.active.set(input.runId, controller)
    const abort = () => controller.abort(); input.signal?.addEventListener('abort', abort, { once: true })
    try {
      if (input.prompt.includes('[FAKE_DELAY]')) await waitFor(80, controller.signal)
      if (input.prompt.includes('[FAKE_TIMEOUT]')) throw Object.assign(new Error('Synthetic timeout'), { code: 'MODEL_TIMEOUT' })
      if (input.prompt.includes('[FAKE_ERROR]') && this.definition.id === 'lfm2.5-vl-450m') throw Object.assign(new Error('Synthetic model crash'), { code: 'MODEL_CRASH' })
      if (controller.signal.aborted) throw Object.assign(new Error('Synthetic cancellation'), { code: 'RUN_CANCELLED' })
      return { providerId: this.definition.id, runtime: this.definition.runtime, runtimeVersion: this.definition.runtimeVersion, model: this.definition.model, modelVersion: this.definition.modelVersion, projection: this.definition.projection, rawOutput: 'synthetic visual answer', latencyMs: 1, timestamp: new Date().toISOString(), runtimeStats: { synthetic: true, timeoutMs: input.timeoutMs, backend: 'fake' } }
    } finally { input.signal?.removeEventListener('abort', abort); this.active.delete(input.runId) }
  }
  async cancel(runId) { const controller = this.active.get(runId); controller?.abort(); return Boolean(controller) }
  async shutdown() { for (const controller of this.active.values()) controller.abort(); this.active.clear() }
}

function waitFor(ms, signal) {
  return new Promise((resolve, reject) => { const timer = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('Synthetic cancellation'), { code: 'RUN_CANCELLED' })) }, { once: true }) })
}
