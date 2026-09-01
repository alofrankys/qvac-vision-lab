#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

const root = path.resolve(import.meta.dirname, '..')
const sourcePath = path.resolve(process.argv[2] || '')
const destination = path.join(root, 'public', 'showcase', 'realworldqa-validation-50')
const existingManifestPath = path.join(root, 'public', 'showcase', 'realworldqa', 'manifest.json')
const expectedMd5 = '4de008f55dc4fd008ca9e15321dc44b7'
const expectedRows = 765
const sampleCount = 50
// RealWorldQA contains only three D-labelled rows, so the largest feasible
// near-balanced split is 16/16/15/3 rather than a misleading 13/13/12/12.
const answerTargets = Object.freeze({ A: 16, B: 16, C: 15, D: 3 })

if (!sourcePath) throw new Error('Usage: node scripts/install-realworldqa-validation-50.mjs /path/to/RealWorldQA.tsv')

const md5 = await hashFile(sourcePath, 'md5')
if (md5 !== expectedMd5) throw new Error(`RealWorldQA checksum mismatch: expected ${expectedMd5}, got ${md5}`)

const existingManifest = JSON.parse(await readFile(existingManifestPath, 'utf8'))
const excluded = new Set(existingManifest.cases.map(item => Number(item.sourceIndex)))
const candidatesByAnswer = Object.fromEntries(Object.keys(answerTargets).map(letter => [letter, []]))
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
  if (!excluded.has(sourceIndex) && candidatesByAnswer[answer]) candidatesByAnswer[answer].push(sourceIndex)
}
if (sourceRows !== expectedRows) throw new Error(`Expected ${expectedRows} RealWorldQA rows, received ${sourceRows}`)

const selectedIndices = Object.entries(answerTargets)
  .flatMap(([answer, count]) => systematicSample(candidatesByAnswer[answer], count))
  .sort((a, b) => a - b)
if (selectedIndices.length !== sampleCount) throw new Error(`Expected ${sampleCount} selected rows, received ${selectedIndices.length}`)
const selected = new Set(selectedIndices)
const records = new Map()
headers = null
const input = readline.createInterface({ input: createReadStream(sourcePath), crlfDelay: Infinity })
for await (const line of input) {
  if (!line) continue
  if (!headers) { headers = parseTsvLine(line); continue }
  const values = parseTsvLine(line)
  const sourceIndex = Number(values[headers.indexOf('index')])
  if (!selected.has(sourceIndex)) continue
  records.set(sourceIndex, Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

await mkdir(destination, { recursive: true })
const cases = []
for (const [position, sourceIndex] of selectedIndices.entries()) {
  const record = records.get(sourceIndex)
  if (!record) throw new Error(`RealWorldQA row ${sourceIndex} is missing`)
  const imageBytes = Buffer.from(record.image, 'base64')
  const extension = detectExtension(imageBytes)
  const filename = `validation-${String(position + 1).padStart(2, '0')}-rwqa-${sourceIndex}${extension}`
  await writeFile(path.join(destination, filename), imageBytes)
  const options = Object.fromEntries(['A', 'B', 'C', 'D'].filter(letter => record[letter]).map(letter => [letter, record[letter]]))
  const expectedAnswer = options[record.answer]
  if (!expectedAnswer) throw new Error(`RealWorldQA row ${sourceIndex} has invalid answer ${record.answer}`)
  cases.push({
    id: `realworldqa-validation-${sourceIndex}`,
    title: `Real scene ${String(position + 1).padStart(2, '0')}`,
    capability: classifyQuestion(record.question),
    sourceDataset: 'RealWorldQA',
    sourceIndex,
    imageUrl: `/showcase/realworldqa-validation-50/${filename}`,
    imageSha256: createHash('sha256').update(imageBytes).digest('hex'),
    question: record.question,
    options,
    answer: record.answer,
    expectedAnswer
  })
}

const manifest = {
  schemaVersion: 1,
  source: 'https://opencompass.openxlab.space/utils/VLMEval/RealWorldQA.tsv',
  sourceMd5: md5,
  sourceRows,
  selection: 'Content-blind, answer-stratified systematic 50-row sample across the full dataset; excludes the existing 20-case showcase sample; selected before inference.',
  selectionMethod: 'Within each gold answer-letter stratum, take evenly spaced rows at floor((position + 0.5) * stratumSize / targetCount); targets A=16, B=16, C=15, D=3 because the full dataset contains only three D-labelled rows.',
  answerTargets,
  excludedSourceIndices: [...excluded].sort((a, b) => a - b),
  cases
}
await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ destination, sourceMd5: md5, extracted: cases.length, indices: selectedIndices }, null, 2)}\n`)

function systematicSample(candidates, count) {
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
