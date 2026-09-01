#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const protocolPath = path.join(root, 'config', 'qvac-official-replication.json')
const dataRoot = path.join(root, 'data', 'vlmeval')
const outputPath = path.join(root, 'data', 'qvac-official-replication', 'dataset-inventory.json')

export async function inspectTsv(filePath, countRule = null) {
  const hashes = { md5: createHash('md5'), sha256: createHash('sha256') }
  let records = 0
  let inQuotes = false
  let atFieldStart = true
  let carry = Buffer.alloc(0)
  const countToken = countRule?.kind === 'delimited_token' ? Buffer.from(countRule.token) : null
  let tokenCarry = Buffer.alloc(0)
  let evaluationUnits = 0
  for await (const chunk of createReadStream(filePath)) {
    hashes.md5.update(chunk)
    hashes.sha256.update(chunk)
    if (countToken) {
      const tokenInput = tokenCarry.length ? Buffer.concat([tokenCarry, chunk]) : chunk
      let offset = 0
      while ((offset = tokenInput.indexOf(countToken, offset)) >= 0) {
        evaluationUnits++
        offset += countToken.length
      }
      tokenCarry = tokenInput.subarray(Math.max(0, tokenInput.length - countToken.length + 1))
    }
    const input = carry.length ? Buffer.concat([carry, chunk]) : chunk
    const stop = input.length && input.at(-1) === 34 ? input.length - 1 : input.length
    let index = 0
    while (index < stop) {
      const byte = input[index]
      if (inQuotes) {
        if (byte === 34) {
          if (index + 1 < input.length && input[index + 1] === 34) index += 2
          else { inQuotes = false; index++ }
        } else index++
        continue
      }
      if (atFieldStart && byte === 34) {
        inQuotes = true
        atFieldStart = false
      } else if (byte === 9) {
        atFieldStart = true
      } else if (byte === 10) {
        records++
        atFieldStart = true
      } else if (byte !== 13) {
        atFieldStart = false
      }
      index++
    }
    carry = stop < input.length ? input.subarray(stop) : Buffer.alloc(0)
  }
  if (carry.length) {
    // A final quote closes a quoted field; it cannot add a new record.
    if (carry[0] === 34 && inQuotes) inQuotes = false
  }
  const info = await stat(filePath)
  const rows = Math.max(0, records - 1)
  return {
    bytes: info.size,
    rows,
    evaluationUnits: countToken ? evaluationUnits : rows,
    md5: hashes.md5.digest('hex'),
    sha256: hashes.sha256.digest('hex')
  }
}

export async function buildInventory(protocol, suite = 'full') {
  const selected = protocol.executionSuites[suite]
  if (!selected) throw new Error(`Unknown suite: ${suite}`)
  const wanted = new Set(selected)
  const datasets = []
  for (const item of protocol.datasets.filter(dataset => wanted.has(dataset.vlmeval))) {
    const filePath = path.join(dataRoot, `${item.vlmeval}.tsv`)
    if (!existsSync(filePath)) {
      datasets.push({
        name: item.name, vlmeval: item.vlmeval, area: item.area,
        questionFormat: item.questionFormat, scoring: item.scoring,
        path: filePath, present: false, expectedMd5: item.artifact.md5,
        qvacPublishedCount: item.n ?? null, locked: false,
        reason: 'DATASET_NOT_PREPARED'
      })
      continue
    }
    const actual = await inspectTsv(filePath, item.countRule)
    const checksumMatches = actual.md5 === item.artifact.md5
    const countMatches = item.n == null || actual.evaluationUnits === item.n
    datasets.push({
      name: item.name, vlmeval: item.vlmeval, area: item.area,
      questionFormat: item.questionFormat, scoring: item.scoring,
      path: filePath, present: true, expectedMd5: item.artifact.md5,
      qvacPublishedCount: item.n ?? null, ...actual,
      checksumMatches, countMatches, locked: checksumMatches && countMatches,
      reason: !checksumMatches ? 'CHECKSUM_MISMATCH' : !countMatches ? 'PUBLISHED_COUNT_MISMATCH' : null
    })
  }
  const totalRows = datasets.reduce((sum, item) => sum + (item.rows || 0), 0)
  return {
    schemaVersion: 1,
    protocolId: protocol.id,
    generatedAt: new Date().toISOString(),
    suite,
    expectedDatasets: selected.length,
    preparedDatasets: datasets.filter(item => item.present).length,
    lockedDatasets: datasets.filter(item => item.locked).length,
    totalRowsPrepared: totalRows,
    ready: datasets.length === selected.length && datasets.every(item => item.locked),
    datasets
  }
}

async function main() {
  const args = process.argv.slice(2)
  const suiteAt = args.indexOf('--suite')
  const suite = suiteAt >= 0 ? args[suiteAt + 1] : 'full'
  const shouldWrite = args.includes('--write')
  const protocol = JSON.parse(await readFile(protocolPath, 'utf8'))
  const inventory = await buildInventory(protocol, suite)
  if (shouldWrite) {
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`)
  }
  process.stdout.write(`${JSON.stringify({ ...inventory, outputPath: shouldWrite ? outputPath : null }, null, 2)}\n`)
}

if (path.resolve(process.argv[1] || '') === path.resolve(import.meta.filename)) {
  main().catch(error => {
    console.error(error.stack || error.message)
    process.exitCode = 1
  })
}
