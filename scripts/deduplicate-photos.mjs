import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('.')
const dataDir = path.join(root, 'data')
const statePath = path.join(dataDir, 'pawvault.json')
const state = JSON.parse(await readFile(statePath, 'utf8'))
const baseline = state.runs.find(run => run.id === 'run_20260813132428_draft_81956996')
if (!baseline) throw new Error('Immutable baseline run not found')
const baselineIds = new Set(baseline.photoIds)
const byNormalizedHash = new Map()

for (const photo of state.photos) {
  if (!photo.inferenceFilename) continue
  const bytes = await readFile(path.join(dataDir, 'inference-images', photo.inferenceFilename))
  const hash = createHash('sha256').update(bytes).digest('hex')
  const group = byNormalizedHash.get(hash) || []
  group.push(photo)
  byNormalizedHash.set(hash, group)
}

const replacements = new Map()
for (const group of byNormalizedHash.values()) {
  if (group.length < 2) continue
  const canonical = group.find(photo => baselineIds.has(photo.id)) || group[0]
  for (const duplicate of group) if (duplicate.id !== canonical.id) replacements.set(duplicate.id, canonical.id)
}

const backupDir = path.join(dataDir, 'dedup-backup')
await mkdir(backupDir, { recursive: true })
await copyFile(statePath, path.join(backupDir, `pawvault-before-dedup-${Date.now()}.json`))

for (const run of state.runs) {
  run.photoIds = [...new Set((run.photoIds || []).map(id => replacements.get(id) || id))]
  run.photoCount = run.photoIds.length
  for (const timing of run.photoTimings || []) timing.photoId = replacements.get(timing.photoId) || timing.photoId
  run.currentPhotoId = replacements.get(run.currentPhotoId) || run.currentPhotoId
}
for (const inference of state.inferences) inference.photoId = replacements.get(inference.photoId) || inference.photoId
for (const annotation of state.annotations || []) annotation.photoId = replacements.get(annotation.photoId) || annotation.photoId

const duplicatePhotos = state.photos.filter(photo => replacements.has(photo.id))
state.photos = state.photos.filter(photo => !replacements.has(photo.id))
for (const photo of state.photos) {
  const original = await readFile(path.join(dataDir, 'photos', photo.storedFilename))
  photo.contentSha256 = createHash('sha256').update(original).digest('hex')
}
state.migrations ||= {}
state.migrations.photoContentDeduplication = { at: new Date().toISOString(), removedRecords: duplicatePhotos.length, remainingUniquePhotos: state.photos.length }
await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`)

for (const photo of duplicatePhotos) {
  for (const file of [path.join(dataDir, 'photos', photo.storedFilename), photo.inferenceFilename && path.join(dataDir, 'inference-images', photo.inferenceFilename)].filter(Boolean)) {
    try { await unlink(file) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}

console.log(JSON.stringify({ removedRecords: duplicatePhotos.length, remainingUniquePhotos: state.photos.length, remappedRuns: state.runs.length, preservedInferences: state.inferences.length, backupDir }, null, 2))
