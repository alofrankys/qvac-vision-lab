#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

const root = path.resolve(import.meta.dirname, '..')
const sourcePath = path.resolve(process.argv[2] || '')
const batchKey = process.env.QVAC_RWQA_BATCH || 'b'
const configurations = Object.freeze({
  b: {
    destinationFolder: 'realworldqa-validation-50-b',
    priorFolders: ['realworldqa', 'realworldqa-validation-50'],
    sampleCount: 50,
    answerTargets: { A: 17, B: 17, C: 16, D: 0 },
    filenamePrefix: 'validation-b',
    padWidth: 2,
    idPrefix: 'realworldqa-validation-b',
    titlePrefix: 'More real scene',
    selection: 'Second content-blind, answer-stratified systematic 50-row sample; excludes all prior 70 source rows and image hashes; selected before inference.',
    selectionMethod: 'Within each remaining gold answer-letter stratum, take evenly spaced unique-image rows at floor((position + 0.5) * stratumSize / targetCount); targets A=17, B=17, C=16, D=0 because all three D rows were used previously.'
  },
  c: {
    destinationFolder: 'realworldqa-validation-150-c',
    priorFolders: ['realworldqa', 'realworldqa-validation-50', 'realworldqa-validation-50-b'],
    sampleCount: 150,
    answerTargets: { A: 50, B: 50, C: 50, D: 0 },
    filenamePrefix: 'validation-c',
    padWidth: 3,
    idPrefix: 'realworldqa-validation-c',
    titlePrefix: 'Extended real scene',
    selection: 'Third content-blind, answer-stratified systematic 150-row sample; excludes all prior 120 source rows and image hashes; selected before inference.',
    selectionMethod: 'Within each remaining gold answer-letter stratum, take evenly spaced unique-image rows at floor((position + 0.5) * stratumSize / targetCount); targets A=50, B=50, C=50, D=0 because all three D rows were used previously.'
  },
  d: {
    destinationFolder: 'realworldqa-remainder-495',
    priorFolders: ['realworldqa', 'realworldqa-validation-50', 'realworldqa-validation-50-b', 'realworldqa-validation-150-c'],
    sampleCount: 495,
    answerTargets: { A: 188, B: 250, C: 57, D: 0 },
    filenamePrefix: 'remainder',
    padWidth: 3,
    idPrefix: 'realworldqa-remainder',
    titlePrefix: 'Final official scene',
    allowDuplicateImages: true,
    selection: 'Complete remainder of the official RealWorldQA source: all 495 source rows not present in the first 270 measured cases; selected by source index before inference.',
    selectionMethod: 'Take every remaining source row exactly once. Answer counts A=188, B=250, C=57, D=0 complete the official source totals A=280, B=337, C=145, D=3. Repeated source images are retained because every official scored question remains in scope.'
  }
})
const configuration = configurations[batchKey]
if (!configuration) throw new Error(`Unknown QVAC_RWQA_BATCH: ${batchKey}`)
const destination = path.join(root, 'public', 'showcase', configuration.destinationFolder)
const priorManifestPaths = configuration.priorFolders.map(folder => path.join(root, 'public', 'showcase', folder, 'manifest.json'))
const expectedMd5 = '4de008f55dc4fd008ca9e15321dc44b7'
const expectedRows = 765
const sampleCount = configuration.sampleCount
const answerTargets = Object.freeze(configuration.answerTargets)

if (!sourcePath) throw new Error('Usage: node scripts/install-realworldqa-validation-50-b.mjs /path/to/RealWorldQA.tsv')

const md5 = await hashFile(sourcePath, 'md5')
if (md5 !== expectedMd5) throw new Error(`RealWorldQA checksum mismatch: expected ${expectedMd5}, got ${md5}`)

const priorManifests = await Promise.all(priorManifestPaths.map(async manifestPath => JSON.parse(await readFile(manifestPath, 'utf8'))))
const excludedIndices = new Set(priorManifests.flatMap(manifest => manifest.cases.map(item => Number(item.sourceIndex))))
const excludedImageHashes = new Set(priorManifests.flatMap(manifest => manifest.cases.map(item => item.imageSha256)))
const candidatesByAnswer = Object.fromEntries(Object.keys(answerTargets).map(letter => [letter, []]))
const candidateHashes = new Set()
let headers = null
let sourceRows = 0
const inventory = readline.createInterface({ input: createReadStream(sourcePath), crlfDelay: Infinity })
for await (const line of inventory) {
  if (!line) continue
  if (!headers) { headers = parseTsvLine(line); continue }
  sourceRows += 1
  const values = parseTsvLine(line)
  const sourceIndex = Number(values[headers.indexOf('index')])
  const answer = values[headers.indexOf('answer')]
  if (excludedIndices.has(sourceIndex) || !candidatesByAnswer[answer]) continue
  const imageBytes = Buffer.from(values[headers.indexOf('image')], 'base64')
  const imageSha256 = createHash('sha256').update(imageBytes).digest('hex')
  if (!configuration.allowDuplicateImages && (excludedImageHashes.has(imageSha256) || candidateHashes.has(imageSha256))) continue
  candidateHashes.add(imageSha256)
  candidatesByAnswer[answer].push({ sourceIndex, imageSha256 })
}
if (sourceRows !== expectedRows) throw new Error(`Expected ${expectedRows} RealWorldQA rows, received ${sourceRows}`)

const selected = Object.entries(answerTargets)
  .flatMap(([answer, count]) => systematicSample(candidatesByAnswer[answer], count))
  .sort((left, right) => left.sourceIndex - right.sourceIndex)
if (selected.length !== sampleCount) throw new Error(`Expected ${sampleCount} selected rows, received ${selected.length}`)
const selectedIndices = new Set(selected.map(item => item.sourceIndex))
const records = new Map()
headers = null
const input = readline.createInterface({ input: createReadStream(sourcePath), crlfDelay: Infinity })
for await (const line of input) {
  if (!line) continue
  if (!headers) { headers = parseTsvLine(line); continue }
  const values = parseTsvLine(line)
  const sourceIndex = Number(values[headers.indexOf('index')])
  if (!selectedIndices.has(sourceIndex)) continue
  records.set(sourceIndex, Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

await mkdir(destination, { recursive: true })
const cases = []
for (const [position, selection] of selected.entries()) {
  const record = records.get(selection.sourceIndex)
  if (!record) throw new Error(`RealWorldQA row ${selection.sourceIndex} is missing`)
  const imageBytes = Buffer.from(record.image, 'base64')
  const extension = detectExtension(imageBytes)
  const positionLabel = String(position + 1).padStart(configuration.padWidth, '0')
  const filename = `${configuration.filenamePrefix}-${positionLabel}-rwqa-${selection.sourceIndex}${extension}`
  await writeFile(path.join(destination, filename), imageBytes)
  const options = Object.fromEntries(['A', 'B', 'C', 'D'].filter(letter => record[letter]).map(letter => [letter, record[letter]]))
  const expectedAnswer = options[record.answer]
  if (!expectedAnswer) throw new Error(`RealWorldQA row ${selection.sourceIndex} has invalid answer ${record.answer}`)
  cases.push({
    id: `${configuration.idPrefix}-${selection.sourceIndex}`,
    title: `${configuration.titlePrefix} ${positionLabel}`,
    capability: classifyQuestion(record.question),
    sourceDataset: 'RealWorldQA',
    sourceIndex: selection.sourceIndex,
      imageUrl: `/showcase/${configuration.destinationFolder}/${filename}`,
    imageSha256: selection.imageSha256,
    question: record.question,
    options,
    answer: record.answer,
    expectedAnswer
  })
}

const manifest = {
  schemaVersion: 1,
  batchId: `validation-real-${batchKey}`,
  source: 'https://opencompass.openxlab.space/utils/VLMEval/RealWorldQA.tsv',
  sourceMd5: md5,
  sourceRows,
  selection: configuration.selection,
  selectionMethod: configuration.selectionMethod,
  answerTargets,
  excludedSourceIndices: [...excludedIndices].sort((a, b) => a - b),
  excludedImageHashes: [...excludedImageHashes].sort(),
  cases
}
await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ destination, sourceMd5: md5, extracted: cases.length, indices: cases.map(item => item.sourceIndex) }, null, 2)}\n`)

function systematicSample(candidates, count) {
  if (!count) return []
  if (candidates.length < count) throw new Error(`Cannot sample ${count} rows from a ${candidates.length}-row stratum`)
  return Array.from({ length: count }, (_, position) => candidates[Math.floor(((position + 0.5) * candidates.length) / count)])
}

function classifyQuestion(question) {
  const text = String(question || '').toLowerCase()
  if (/\bhow many\b/.test(text)) return 'Counting'
  if (/\bwhere\b|\brelative to\b|\bleft\b|\bright\b|\babove\b|\bbelow\b|\bbehind\b|\bin front\b|\bnext to\b/.test(text)) return 'Spatial relation'
  if (/\bcolou?r\b|\bshape\b|\bsize\b|\bbigger\b|\bsmaller\b/.test(text)) return 'Attribute recognition'
  if (/\bwhich\b|\bwho\b/.test(text)) return 'Visual selection'
  if (/^(is|are|does|do|can|has|have)\b/.test(text)) return 'Binary visual reasoning'
  return 'Object and scene understanding'
}

function parseTsvLine(line) {
  const values = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1 }
      else quoted = !quoted
    } else if (character === '\t' && !quoted) {
      values.push(value)
      value = ''
    } else value += character
  }
  values.push(value)
  return values
}

function detectExtension(imageBytes) {
  if (imageBytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return '.jpg'
  if (imageBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png'
  throw new Error('Unsupported image encoding in RealWorldQA row')
}

function hashFile(filePath, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolve(hash.digest('hex')))
  })
}
