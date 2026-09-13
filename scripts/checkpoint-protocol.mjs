import { createHash } from 'node:crypto'

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export function protocolHash(value) { return createHash('sha256').update(canonical(value)).digest('hex') }
export function validateCheckpoint(rows, hash, caseIds, providerIds) {
  const seen = new Set()
  for (const row of rows) {
    const key = `${row.caseId}:${row.providerId}`
    if (row.protocolHash !== hash) throw new Error('Checkpoint protocol mismatch or legacy checkpoint without provenance. Preserve it and select a new run ID.')
    if (!caseIds.includes(row.caseId) || !providerIds.includes(row.providerId) || seen.has(key) || row.warmup) throw new Error(`Invalid or duplicate checkpoint row: ${key}`)
    if (row.returnedProvider?.id !== row.providerId) throw new Error(`Checkpoint provider mismatch: ${key}`)
    seen.add(key)
  }
  return rows
}
