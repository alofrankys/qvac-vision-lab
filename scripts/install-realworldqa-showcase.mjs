#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

const root = path.resolve(import.meta.dirname, '..')
const sourcePath = path.resolve(process.argv[2] || '')
const destination = path.join(root, 'public', 'showcase', 'realworldqa')
const expectedMd5 = '4de008f55dc4fd008ca9e15321dc44b7'
const selections = Object.freeze([
  [5, 'Breakfast plate', 'Relative size'],
  [8, 'Dog in the shop', 'Orientation'],
  [39, 'Cereal bowl', 'Relative size'],
  [41, 'Jewelry display', 'Fine spatial relation'],
  [44, 'Squirrel at window', 'Spatial grounding'],
  [48, 'Pink scrunchie', 'Counting'],
  [53, 'Kitchen appliances', 'Object-between relation'],
  [64, 'Cat in a bag', 'Gaze direction'],
  [112, 'Laptop cable', 'Functional relation'],
  [118, 'Dog and plush toy', 'Left/right relation'],
  [152, 'Travel luggage', 'Vertical relation'],
  [159, 'Guitar corner', 'Left/right relation'],
  [166, 'Dog bed and guitar', 'Fine spatial relation'],
  [170, 'Dog by the oven', 'Action + relation'],
  [201, 'Two black cats', 'Relative size'],
  [310, 'Indoor plants', 'Object localization'],
  [339, 'Drill and window', 'Left/right relation'],
  [412, 'Three drinks', 'Object-between relation'],
  [566, 'Taco table', 'Food relation'],
  [757, 'Coffee counter', 'Counting']
])
const selectedIndices = Object.freeze(selections.map(([sourceIndex]) => sourceIndex))

if (!sourcePath) throw new Error('Usage: node scripts/install-realworldqa-showcase.mjs /path/to/RealWorldQA.tsv')

const md5 = await hashFile(sourcePath, 'md5')
if (md5 !== expectedMd5) throw new Error(`RealWorldQA checksum mismatch: expected ${expectedMd5}, got ${md5}`)

const selected = new Set(selectedIndices)
const records = new Map()
let headers = null
let sourceRows = 0
const input = readline.createInterface({ input: createReadStream(sourcePath), crlfDelay: Infinity })
for await (const line of input) {
  if (!line) continue
  if (!headers) { headers = parseTsvLine(line); continue }
  sourceRows += 1
  const values = parseTsvLine(line)
  const indexColumn = headers.indexOf('index')
  const sourceIndex = Number(values[indexColumn])
  if (!selected.has(sourceIndex)) continue
  records.set(sourceIndex, Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
}

await mkdir(destination, { recursive: true })
const cases = []
for (const [position, [sourceIndex, title, capability]] of selections.entries()) {
  const record = records.get(sourceIndex)
  if (!record) throw new Error(`RealWorldQA row ${sourceIndex} is missing`)
  const imageBytes = Buffer.from(record.image, 'base64')
  const extension = detectExtension(imageBytes)
  const filename = `real-${String(position + 1).padStart(2, '0')}-rwqa-${sourceIndex}${extension}`
  await writeFile(path.join(destination, filename), imageBytes)
  const options = Object.fromEntries(['A', 'B', 'C', 'D'].filter(letter => record[letter]).map(letter => [letter, record[letter]]))
  const expectedAnswer = options[record.answer]
  if (!expectedAnswer) throw new Error(`RealWorldQA row ${sourceIndex} has invalid answer ${record.answer}`)
  cases.push({
    id: `realworldqa-${sourceIndex}`,
    title,
    capability,
    sourceDataset: 'RealWorldQA',
    sourceIndex,
    imageUrl: `/showcase/realworldqa/${filename}`,
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
  selection: 'Fixed, capability-diverse 20-case screen-recording sample; not an official leaderboard reproduction.',
  cases
}
await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ destination, sourceMd5: md5, extracted: cases.length, indices: selectedIndices }, null, 2)}\n`)

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
