import { PROMPT_VERSION } from '../domain/tasks.mjs'

export { PROMPT_VERSION }

export function publicProviderStatus(status) {
  return {
    id: status.id,
    name: status.name,
    kind: status.kind,
    runtime: status.runtime,
    runtimeVersion: status.runtimeVersion,
    model: status.model,
    modelVersion: status.modelVersion,
    projection: status.projection,
    state: status.state,
    ready: status.state === 'READY',
    label: status.label,
    reason: status.reason || null
  }
}

export function assertVisionTaskInput(input) {
  if (!input || typeof input.imagePath !== 'string' || !input.imagePath) throw new TypeError('imagePath is required')
  if (typeof input.prompt !== 'string' || !input.prompt) throw new TypeError('prompt is required')
  if (input.outputMode !== 'semantic' && (!Array.isArray(input.allowedLabels) || !input.allowedLabels.length)) throw new TypeError('allowedLabels are required')
}

export function resultProvenance(status, overrides = {}) {
  return {
    providerId: status.id,
    runtime: status.runtime,
    runtimeVersion: status.runtimeVersion,
    model: status.model,
    modelVersion: status.modelVersion,
    projection: status.projection,
    promptVersion: PROMPT_VERSION,
    timestamp: new Date().toISOString(),
    ...overrides
  }
}
