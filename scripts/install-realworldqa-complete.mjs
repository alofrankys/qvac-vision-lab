#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

const root = path.resolve(import.meta.dirname, '..')
const sourcePath = path.resolve(process.argv[2] || '')
const expectedMd5 = '4de008f55dc4fd008ca9e15321dc44b7'
const reportPath = path.join(root, 'reports', 'visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json')

if (!sourcePath) throw new Error('Usage: npm run showcase:install:realworldqa -- /path/to/RealWorldQA.tsv')
if (await hashFile(sourcePath, 'md5') !== expectedMd5) throw new Error(`RealWorldQA checksum mismatch; expected ${expectedMd5}`)

const report = JSON.parse(await readFile(reportPath, 'utf8'))
let displayTitles = new Map()
try {
  const displayManifest = JSON.parse(await readFile(path.join(root, 'public', 'showcase', 'realworldqa', 'manifest.json'), 'utf8'))
  displayTitles = new Map(displayManifest.cases.map(item => [Number(item.sourceIndex), item.title]))
} catch {}
const caseSpecs = [...new Map(report.results.map(result => [result.caseId, {
  id: result.caseId,
  sourceIndex: Number(result.sourceIndex),
  capability: result.capability || 'Visual question answering'
}])).values()]
if (caseSpecs.length !== 765) throw new Error(`Canonical audit must identify 765 cases; found ${caseSpecs.length}`)

const records = new Map()
let headers = null
const input = readline.createInterface({ input: createReadStream(sourcePath), crlfDelay: Infinity })
for await (const line of input) {
  if (!line) continue
  if (!headers) { headers = parseTsvLine(line); continue }
  const values = parseTsvLine(line)
  const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']))
  records.set(Number(record.index), record)
}
if (records.size !== 765) throw new Error(`Expected 765 TSV records; found ${records.size}`)

const partitions = [
  { key: 'official-real', directory: 'realworldqa', prefix: 'real', digits: 2, match: id => /^realworldqa-\d+$/.test(id), title: (n, spec) => displayTitles.get(spec.sourceIndex) || `Official real scene ${n}` },
  { key: 'validation-real', directory: 'realworldqa-validation-50', prefix: 'validation', digits: 2, match: id => id.startsWith('realworldqa-validation-') && !id.includes('-b-') && !id.includes('-c-'), title: n => `Real scene ${n}` },
  { key: 'validation-real-b', directory: 'realworldqa-validation-50-b', prefix: 'validation-b', digits: 2, match: id => id.startsWith('realworldqa-validation-b-'), title: n => `Additional real scene ${n}` },
  { key: 'validation-real-c', directory: 'realworldqa-validation-150-c', prefix: 'validation-c', digits: 3, match: id => id.startsWith('realworldqa-validation-c-'), title: n => `Extended real scene ${n}` },
  { key: 'official-remainder', directory: 'realworldqa-remainder-495', prefix: 'remainder', digits: 3, match: id => id.startsWith('realworldqa-remainder-'), title: n => `Final official scene ${n}` }
]

let installed = 0
for (const partition of partitions) {
  const specs = caseSpecs.filter(spec => partition.match(spec.id))
  const destination = path.join(root, 'public', 'showcase', partition.directory)
  await mkdir(destination, { recursive: true })
  const cases = []
  for (const [index, spec] of specs.entries()) {
    const record = records.get(spec.sourceIndex)
    if (!record) throw new Error(`Missing TSV row ${spec.sourceIndex}`)
    const imageBytes = Buffer.from(record.image, 'base64')
    const extension = detectExtension(imageBytes)
    const number = String(index + 1).padStart(partition.digits, '0')
    const filename = `${partition.prefix}-${number}-rwqa-${spec.sourceIndex}${extension}`
    await writeFile(path.join(destination, filename), imageBytes)
    const options = Object.fromEntries(['A', 'B', 'C', 'D'].filter(letter => record[letter]).map(letter => [letter, record[letter]]))
    if (!options[record.answer]) throw new Error(`RealWorldQA row ${spec.sourceIndex} has invalid answer ${record.answer}`)
    cases.push({
      id: spec.id,
      title: partition.title(number, spec),
      capability: spec.capability,
      sourceDataset: 'RealWorldQA',
      sourceIndex: spec.sourceIndex,
      imageUrl: `/showcase/${partition.directory}/${filename}`,
      imageSha256: createHash('sha256').update(imageBytes).digest('hex'),
      question: record.question,
      options,
      answer: record.answer,
      expectedAnswer: options[record.answer]
    })
  }
  await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    source: 'https://huggingface.co/datasets/xai-org/RealworldQA',
    sourceMd5: expectedMd5,
    sourceRows: records.size,
    selection: 'Canonical partition recovered from the checked-in 765-case QVAC audit; no source rows are added, removed, or modified.',
    cases
  }, null, 2)}\n`)
  installed += cases.length
  process.stdout.write(`${partition.directory}: ${cases.length} cases\n`)
}

const uniqueIndices = new Set(caseSpecs.map(spec => spec.sourceIndex))
if (installed !== 765 || uniqueIndices.size !== 765) throw new Error(`Installation verification failed: ${installed} cases, ${uniqueIndices.size} unique source indices`)
process.stdout.write(`Installed all ${installed} RealWorldQA cases from checksum ${expectedMd5}.\n`)

function parseTsvLine(line) {
  const values = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1 } else quoted = !quoted
    } else if (character === '\t' && !quoted) { values.push(value); value = '' } else value += character
  }
  values.push(value)
  return values
}

function detectExtension(bytes) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return '.jpg'
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png'
  throw new Error('Unsupported image encoding')
}

function hashFile(filePath, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    createReadStream(filePath).on('error', reject).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex')))
  })
}
