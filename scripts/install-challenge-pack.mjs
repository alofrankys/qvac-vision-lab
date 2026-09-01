import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StateStore } from '../src/storage/store.mjs'
import { prepareImage } from '../src/image-pipeline/pipeline.mjs'
import { addQuestion, DEFAULT_RANKING_POLICY } from '../src/arena/builder.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packDir = path.join(root, 'packs', 'vision-lab-challenge-01')
const manifest = JSON.parse(await readFile(path.join(packDir, 'manifest.json'), 'utf8'))
const dataDir = path.resolve(process.env.PAWVAULT_DATA_DIR || path.join(root, 'data'))
const photosDir = path.join(dataDir, 'photos'), inferenceDir = path.join(dataDir, 'inference-images')
await Promise.all([mkdir(photosDir, { recursive: true }), mkdir(inferenceDir, { recursive: true })])
const store = await new StateStore(path.join(dataDir, 'pawvault.json')).init()
const current = store.snapshot()
const existingSet = current.arenaBenchmarkSets.find(item => item.id === manifest.id)
if (existingSet?.locked) throw new Error('Challenge pack benchmark is already locked; installer will not mutate it')

const prepared = []
for (const item of manifest.items) {
  const originalPath = path.join(packDir, item.filename)
  const bytes = await readFile(originalPath)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== item.sha256) throw new Error(`Asset integrity failed: ${item.id}`)
  const storedFilename = `${item.id}.png`
  const storedPath = path.join(photosDir, storedFilename)
  await copyFile(originalPath, storedPath)
  const imagePipeline = await prepareImage({ originalPath: storedPath, outputDir: inferenceDir, photoId: item.id, reportedMime: 'image/png', originalFilename: path.basename(item.filename) })
  if (!imagePipeline.ready) throw new Error(`Image pipeline failed for ${item.id}: ${imagePipeline.error}`)
  const inferenceBytes = await readFile(path.join(inferenceDir, imagePipeline.normalized.filename))
  prepared.push({ item, photo: { id: item.id, sourcePath: item.filename, filename: path.basename(item.filename), mimeType: 'image/png', fileSizeBytes: bytes.length, contentSha256: sha256, storedFilename, importedAt: manifest.generatedAt, width: imagePipeline.original.width, height: imagePipeline.original.height, orientation: imagePipeline.original.orientation, exifCaptureDate: null, exifGps: null, browserLastModified: null, metadataError: null, detectedFormat: imagePipeline.detectedFormat, imagePipeline, inferenceFilename: imagePipeline.normalized.filename, inferenceImageSha256: createHash('sha256').update(inferenceBytes).digest('hex'), manualLocation: '', petIdentity: 'Unknown', provenance: 'VISION_LAB_CHALLENGE_PACK_01', license: item.license } })
}

await store.update(state => {
  state.challengePacks ??= []
  let dataset = state.datasets.find(item => item.id === manifest.id)
  if (!dataset) { dataset = { id: manifest.id, name: manifest.name, description: manifest.description, category: 'synthetic_visual_reasoning', source: 'Project-generated synthetic assets', photoIds: [], experimentIds: ['experiment_05_arena'], createdAt: manifest.generatedAt, updatedAt: manifest.generatedAt, groundTruthStatus: 'manifest_verified', license: manifest.license }; state.datasets.push(dataset) }
  let set = state.arenaBenchmarkSets.find(item => item.id === manifest.id)
  if (!set) { set = { id: manifest.id, name: manifest.name, description: manifest.description, version: manifest.version, status: 'READY', locked: false, lockHash: null, lockPayloadVersion: 3, lockedAt: null, startedAt: null, questionIds: [], suggestedCategorySlots: Object.keys(manifest.rankingPolicy.categoryMinimums), rankingPolicy: structuredClone(manifest.rankingPolicy || DEFAULT_RANKING_POLICY), providerIds: ['visionpsy-patched-base','lfm2.5-vl-450m','qvac-smolvlm2'], outputBudget: 64, parentVersionId: null, createdAt: manifest.generatedAt }; state.arenaBenchmarkSets.push(set) }
  set.rankingPolicy = structuredClone(manifest.rankingPolicy)
  for (const { item, photo } of prepared) {
    const existingPhoto = state.photos.find(entry => entry.id === item.id)
    if (existingPhoto) Object.assign(existingPhoto, photo); else state.photos.push(photo)
    if (!dataset.photoIds.includes(item.id)) dataset.photoIds.push(item.id)
    const questionId = `question_${item.id}`
    let question = state.questionBank.find(entry => entry.id === questionId)
    if (!question) {
      question = addQuestion(state, { ...item, id: undefined, text: item.question, photoId: item.id, datasetId: dataset.id, source: 'VISION_LAB_CHALLENGE_PACK_01', provenance: 'SYNTHETIC_PACK_MANIFEST' }, { idFactory: () => item.id })
    } else Object.assign(question, { text: item.question, category: item.category, expectedAnswer: item.expectedAnswer, acceptedAnswers: item.acceptedAnswers, answerType: item.answerType, expectedAnswerSource: item.expectedAnswerSource, sourceReference: item.sourceReference, license: item.license, difficulty: item.difficulty, photoId: item.id, datasetId: dataset.id, updatedAt: manifest.generatedAt })
    if (!set.questionIds.includes(question.id)) set.questionIds.push(question.id)
  }
  dataset.updatedAt = new Date().toISOString(); set.status = 'READY'; set.version = manifest.version; set.lockPayloadVersion = 3
  const record = { id: manifest.id, version: manifest.version, itemCount: manifest.items.length, manifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), installedAt: new Date().toISOString(), license: manifest.license }
  const old = state.challengePacks.find(item => item.id === manifest.id); if (old) Object.assign(old, record); else state.challengePacks.push(record)
})
const result = store.snapshot()
const dataset = result.datasets.find(item => item.id === manifest.id), set = result.arenaBenchmarkSets.find(item => item.id === manifest.id)
console.log(JSON.stringify({ installed: manifest.id, images: dataset.photoIds.length, questions: set.questionIds.length, uniqueImages: new Set(set.questionIds.map(id => result.questionBank.find(item => item.id === id)?.photoId)).size, stateFile: path.join(dataDir, 'pawvault.json') }, null, 2))
