import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { SHOWCASE_CASES, extractMultipleChoiceLetter } from '../src/showcase/index.mjs'

const root = path.resolve(import.meta.dirname, '..')
const revision = '470e51787a351764057869304e425bc76170bdc6'
const scorerSha256 = '06088ed4da68cd9d8c3018e7630d0503f1365e6dd31f651cbedd8aa44dc14466'
const vlmevalRoot = path.resolve(process.env.QVAC_VLMEVALKIT_ROOT || path.join(root, '.third_party', 'VLMEvalKit-470e517'))
const inputName = process.env.QVAC_VLMEVAL_INPUT || 'visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json'
const outputStem = process.env.QVAC_VLMEVAL_OUTPUT_STEM || 'visionpsy-realworldqa-vlmevalkit-upstream-470e517'
const report = JSON.parse(await readFile(path.join(root, 'reports', inputName), 'utf8'))
const cases = SHOWCASE_CASES.filter(item => Number.isInteger(item.sourceIndex))
if (cases.length !== 765) throw new Error(`Install all 765 checksum-locked RealWorldQA cases first; found ${cases.length}.`)
if (report.results.length !== 2295) throw new Error(`Expected 2,295 outputs; found ${report.results.length}.`)

const lookup = new Map(cases.map(item => [item.id, item]))
const payload = report.results.map(result => {
  const item = lookup.get(result.caseId)
  if (!item) throw new Error(`Missing installed case ${result.caseId}`)
  return { output: result.output, choices: item.options }
})
const upstreamLetters = await runPython(payload)
const rows = report.results.map((result, index) => {
  const item = lookup.get(result.caseId)
  const localLetter = extractMultipleChoiceLetter(result.output, item.options)
  const upstreamLetter = upstreamLetters[index]
  return {
    caseId: result.caseId,
    sourceIndex: result.sourceIndex,
    providerId: result.providerId,
    expectedLetter: item.expectedLetter,
    output: result.output,
    localLetter,
    upstreamLetter,
    sameExtraction: localLetter === upstreamLetter,
    localPass: localLetter === item.expectedLetter,
    upstreamPass: upstreamLetter === item.expectedLetter
  }
})
const providerIds = [...new Set(rows.map(item => item.providerId))]
const providers = Object.fromEntries(providerIds.map(providerId => {
  const selected = rows.filter(item => item.providerId === providerId)
  return [providerId, {
    cases: selected.length,
    upstreamPassed: selected.filter(item => item.upstreamPass).length,
    extractionDifferences: selected.filter(item => !item.sameExtraction).length,
    passVerdictChanges: selected.filter(item => item.localPass !== item.upstreamPass).length
  }]
}))
const audit = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  inputReport: inputName,
  implementation: {
    repository: 'https://github.com/open-compass/VLMEvalKit',
    revision,
    source: 'vlmeval/utils/matching_util.py can_infer',
    scorerSha256,
    directChecksumVerifiedSourceExecution: true,
    judgeFallback: false
  },
  totalCompared: rows.length,
  totalExtractionDifferences: rows.filter(item => !item.sameExtraction).length,
  totalPassVerdictChanges: rows.filter(item => item.localPass !== item.upstreamPass).length,
  providers,
  differences: rows.filter(item => !item.sameExtraction || item.localPass !== item.upstreamPass).slice(0, 100)
}
await writeFile(path.join(root, 'reports', `${outputStem}.json`), `${JSON.stringify(audit, null, 2)}\n`)
await writeFile(path.join(root, 'reports', `${outputStem}.md`), markdown(audit))
process.stdout.write(markdown(audit))

function runPython(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON || 'python3', [path.join(root, 'scripts', 'vlmevalkit-scorer.py'), '--root', vlmevalRoot], { stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))
    child.once('error', reject)
    child.once('close', code => {
      if (code) return reject(new Error(`Pinned VLMEvalKit scorer failed (${code}): ${Buffer.concat(stderr).toString()}`))
      try { resolve(JSON.parse(Buffer.concat(stdout).toString())) } catch (error) { reject(error) }
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

function markdown(value) {
  const lines = [
    '# Direct pinned VLMEvalKit scorer audit', '',
    `- Revision: \`${value.implementation.revision}\``,
    `- Scorer SHA-256: \`${value.implementation.scorerSha256}\``,
    `- Outputs compared: ${value.totalCompared}`,
    `- Extraction differences: ${value.totalExtractionDifferences}`,
    `- Pass/fail changes: ${value.totalPassVerdictChanges}`, '',
    '| Provider | Upstream correct | Extraction differences | Pass changes |',
    '|---|---:|---:|---:|'
  ]
  for (const [providerId, item] of Object.entries(value.providers)) lines.push(`| ${providerId} | ${item.upstreamPassed}/${item.cases} | ${item.extractionDifferences} | ${item.passVerdictChanges} |`)
  lines.push('', 'The audit executes the exact checksum-verified upstream `can_infer` source. It does not claim parity for model preprocessing, inference runtime, hardware, or any unavailable vendor-internal harness configuration.', '')
  return lines.join('\n')
}
