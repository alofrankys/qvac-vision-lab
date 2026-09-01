import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packId = process.argv[2] || process.env.VISIONPSY_CLAIM_PACK_ID || 'visionpsy-claim-challenge-01'
const resume = process.argv.includes('--resume')
const packDir = path.join(root, 'packs', packId)
const manifest = JSON.parse(await readFile(path.join(packDir, 'manifest.json'), 'utf8'))
const baseUrl = String(process.env.VISION_LAB_BASE_URL || 'http://127.0.0.1:8878').replace(/\/$/, '')

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${pathname}: ${body.error || response.statusText}`)
  return body
}

const initial = await api('/api/arena/builder')
const existingDataset = initial.datasets.find(item => item.id === manifest.id)
const existingSet = initial.benchmarkSets.find(item => item.id === manifest.id)
if ((existingDataset?.photoIds?.length || existingSet?.questionIds?.length) && !resume || existingSet?.locked) {
  throw new Error(`${manifest.id} already contains data; refusing to create a partial duplicate`)
}

if (!existingDataset) {
  await api('/api/arena/datasets', {
    method: 'POST',
    body: JSON.stringify({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      category: 'public_claim_replication',
      source: 'Deterministic fixtures and project-generated controlled photorealistic assets'
    })
  })
}

if (!existingSet) {
  await api('/api/arena/benchmark-sets', {
    method: 'POST',
    body: JSON.stringify({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      rankingPolicy: manifest.rankingPolicy,
      outputBudget: 64
    })
  })
}

const imported = []
for (const [index, item] of manifest.items.entries()) {
  const bytes = await readFile(path.join(packDir, item.filename))
  const image = await api('/api/photos/import', {
    method: 'POST',
    body: JSON.stringify({
      datasetId: manifest.id,
      filename: path.basename(item.filename),
      relativePath: `packs/${packId}/${item.filename}`,
      mimeType: 'image/png',
      dataBase64: bytes.toString('base64')
    })
  })
  const photo = image.photo
  if (!photo?.id || !photo.imagePipeline?.ready) throw new Error(`Imported image is not inference-ready: ${item.id}`)
  await api('/api/arena/questions', {
    method: 'POST',
    body: JSON.stringify({
      text: item.question,
      category: item.category,
      datasetId: manifest.id,
      photoId: photo.id,
      expectedAnswer: item.expectedAnswer,
      acceptedAnswers: item.acceptedAnswers,
      answerType: item.answerType,
      expectedAnswerSource: item.expectedAnswerSource,
      sourceReference: `packs/${packId}/manifest.json#${item.id}`,
      license: manifest.license,
      difficulty: item.difficulty,
      notes: `${item.claimArea || item.claimFamily}; ${item.sourceMethod}; visually checked before installation.`,
      provenance: item.sourceMethod,
      benchmarkSetId: manifest.id
    })
  })
  imported.push({
    itemId: item.id,
    photoId: photo.id,
    reused: Boolean(image.reused),
    sha256: createHash('sha256').update(bytes).digest('hex')
  })
  console.log(`[${index + 1}/${manifest.items.length}] ${item.id} imported and linked`)
}

const validation = await api(`/api/arena/benchmark-sets/${encodeURIComponent(manifest.id)}/validate`)
if (!validation.valid) throw new Error(`Benchmark validation failed: ${validation.blockers.join('; ')}`)
const locked = await api(`/api/arena/benchmark-sets/${encodeURIComponent(manifest.id)}/lock`, {
  method: 'POST',
  body: JSON.stringify({ confirm: true, version: '1.0.0' })
})

console.log(JSON.stringify({
  installed: manifest.id,
  images: imported.length,
  questions: validation.coverage.total,
  uniqueImages: validation.coverage.uniqueImages,
  categories: validation.coverage.categories,
  locked: locked.set.locked,
  version: locked.set.version,
  lockHash: locked.set.lockHash
}, null, 2))
