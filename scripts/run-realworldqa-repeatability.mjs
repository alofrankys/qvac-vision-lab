import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportsDir = path.join(root, 'reports')
const baseUrl = process.env.QVAC_SHOWCASE_URL || 'http://127.0.0.1:8878'
const primaryName = process.env.QVAC_REPEATABILITY_INPUT || 'visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json'
const addendumName = process.env.QVAC_REPEATABILITY_ADDENDUM || 'visionpsy-standard-q4-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json'
const stem = 'visionpsy-realworldqa-repeatability-100x3'
const checkpointPath = path.join(reportsDir, `.${stem}.checkpoint.ndjson`)
const providerIds = ['qvac-visionpsy-standard-q8', 'qvac-visionpsy-standard-q4', 'qvac-visionpsy', 'qvac-visionpsy-flash-q4']
const primary = JSON.parse(await readFile(path.join(reportsDir, primaryName), 'utf8'))
const addendum = JSON.parse(await readFile(path.join(reportsDir, addendumName), 'utf8'))
const sourceRuns = [primary, addendum]
const summaries = Object.assign({}, ...sourceRuns.map(run => run.summaries))

await mkdir(reportsDir, { recursive: true })
const response = await fetch(`${baseUrl}/api/showcase`)
if (!response.ok) throw new Error(`Showcase API returned HTTP ${response.status}`)
const catalog = await response.json()
const allCases = catalog.cases.filter(item => Number.isInteger(item.sourceIndex))
if (allCases.length !== 765) throw new Error(`Expected 765 installed RealWorldQA cases, found ${allCases.length}`)
const selected = stratifiedSample(allCases, 100, 'repeatability-20260901')
const selectedIds = new Set(selected.map(item => item.id))
const primaryRows = sourceRuns.flatMap(run => run.results.filter(item => selectedIds.has(item.caseId)))
if (primaryRows.length !== 400) throw new Error(`Expected 400 canonical rows for the subset, found ${primaryRows.length}`)

let reruns = []
try {
  reruns = (await readFile(checkpointPath, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await writeFile(checkpointPath, '')
}
const validKeys = new Set(selected.flatMap(item => [2, 3].flatMap(repeat => providerIds.map(providerId => `${repeat}:${item.id}:${providerId}`))))
const seen = new Set()
reruns = reruns.filter(item => validKeys.has(keyFor(item)) && !seen.has(keyFor(item)) && seen.add(keyFor(item)))
const expectedReruns = selected.length * providerIds.length * 2
if (reruns.length) process.stdout.write(`Resuming repeatability audit from ${reruns.length}/${expectedReruns} rerun inferences.\n`)

for (const repeat of [2, 3]) {
  for (const [caseIndex, showcaseCase] of selected.entries()) {
    const order = rotate(providerIds, caseIndex + repeat - 1)
    for (const [orderIndex, providerId] of order.entries()) {
      const key = `${repeat}:${showcaseCase.id}:${providerId}`
      if (reruns.some(item => keyFor(item) === key)) continue
      process.stdout.write(`[repeat ${repeat}/3 · ${caseIndex + 1}/100 · ${orderIndex + 1}/${providerIds.length}] ${showcaseCase.id} → ${providerId}\n`)
      const result = await runWithRetries(showcaseCase, providerId)
      const row = { repeat, caseIndex, orderIndex, executionOrder: order, ...result }
      reruns.push(row)
      await appendFile(checkpointPath, `${JSON.stringify(row)}\n`)
    }
    process.stdout.write(`REPEATABILITY ${repeat}/3 · ${caseIndex + 1}/100 cases\n`)
  }
}

const rows = [
  ...primaryRows.map(item => ({ ...item, repeat: 1 })),
  ...reruns
]
const providers = Object.fromEntries(providerIds.map(providerId => [providerId, summarize(providerId)]))
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  title: 'VisionPsy RealWorldQA deterministic repeatability audit · 100 cases × 3 repeats',
  sourceRuns: { primary: primaryName, standardQ4Addendum: addendumName },
  selection: {
    seed: 'repeatability-20260901',
    cases: 100,
    stratifiedBy: ['expected answer letter', 'number of answer options'],
    sourceIndices: selected.map(item => item.sourceIndex),
    caseIds: selected.map(item => item.id),
    strata: countBy(selected, item => `${item.expectedLetter}/${Object.keys(item.options || {}).length}-options`)
  },
  generation: primary.reproducibility?.generation,
  interpretation: 'Repeat 1 is the frozen 765-case primary run. Repeats 2 and 3 are new local inferences over the same deterministic 100-case subset. Accuracy ranges and exact-output agreement measure local repeatability; they are not confidence intervals for all possible prompts or hardware.',
  providers
}
await writeFile(path.join(reportsDir, `${stem}.json`), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(path.join(reportsDir, `${stem}.md`), markdown(report))
process.stdout.write(markdown(report))

async function runWithRetries(showcaseCase, providerId) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await run(showcaseCase, providerId)
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000))
    }
  }
  throw lastError
}

async function run(showcaseCase, providerId) {
  const requestStartedAt = new Date().toISOString()
  const response = await fetch(`${baseUrl}/api/showcase/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caseId: showcaseCase.id,
      imageTitle: showcaseCase.title,
      prompt: showcaseCase.prompt,
      providerId,
      maxTokens: 16,
      conversation: []
    })
  })
  const events = (await response.text()).split('\n').filter(Boolean).map(line => JSON.parse(line))
  const failure = events.find(event => event.type === 'error')
  const complete = events.findLast(event => event.type === 'complete')
  if (!response.ok || failure || !complete) throw new Error(failure?.error || `Incomplete HTTP ${response.status}`)
  return {
    caseId: showcaseCase.id,
    sourceIndex: showcaseCase.sourceIndex,
    providerId,
    requestStartedAt,
    output: complete.output,
    evaluation: complete.evaluation,
    metrics: complete.metrics
  }
}

function summarize(providerId) {
  const providerRows = rows.filter(item => item.providerId === providerId)
  const repeats = [1, 2, 3].map(repeat => {
    const repeatRows = providerRows.filter(item => item.repeat === repeat)
    const passed = repeatRows.filter(item => item.evaluation?.status === 'PASS').length
    return { repeat, passed, cases: repeatRows.length, accuracy: passed / repeatRows.length }
  })
  let identicalOutputs = 0
  let identicalVerdicts = 0
  for (const item of selected) {
    const caseRows = providerRows.filter(row => row.caseId === item.id).sort((a, b) => a.repeat - b.repeat)
    if (new Set(caseRows.map(row => normalize(row.output))).size === 1) identicalOutputs += 1
    if (new Set(caseRows.map(row => row.evaluation?.status)).size === 1) identicalVerdicts += 1
  }
  const accuracies = repeats.map(item => item.accuracy)
  return {
    label: summaries[providerId].label,
    repeats,
    accuracyRange: [Math.min(...accuracies), Math.max(...accuracies)],
    maximumAccuracySwingPoints: (Math.max(...accuracies) - Math.min(...accuracies)) * 100,
    identicalOutputs: { cases: identicalOutputs, total: selected.length, rate: identicalOutputs / selected.length },
    identicalPassFailVerdicts: { cases: identicalVerdicts, total: selected.length, rate: identicalVerdicts / selected.length }
  }
}

function stratifiedSample(items, count, seed) {
  const groups = new Map()
  for (const item of items) {
    const key = `${item.expectedLetter}/${Object.keys(item.options || {}).length}`
    const group = groups.get(key) || []
    group.push(item)
    groups.set(key, group)
  }
  for (const group of groups.values()) group.sort((left, right) => hash(`${seed}:${left.id}`).localeCompare(hash(`${seed}:${right.id}`)))
  const selected = []
  const keys = [...groups.keys()].sort()
  for (let cursor = 0; selected.length < count; cursor += 1) {
    let added = false
    for (const key of keys) {
      const item = groups.get(key)[cursor]
      if (item && selected.length < count) { selected.push(item); added = true }
    }
    if (!added) break
  }
  return selected.sort((left, right) => hash(`${seed}:order:${left.id}`).localeCompare(hash(`${seed}:order:${right.id}`)))
}

function markdown(report) {
  const lines = [
    '# VisionPsy RealWorldQA repeatability audit',
    '',
    `${report.selection.cases} deterministically selected cases, three repeats per model. Repeat 1 is reused from the primary 765-case run.`,
    '',
    '| Model | Repeat 1 | Repeat 2 | Repeat 3 | Max swing | Exact output agreement | Pass/fail agreement |',
    '|---|---:|---:|---:|---:|---:|---:|'
  ]
  for (const provider of Object.values(report.providers)) {
    const values = provider.repeats.map(item => `${item.passed}/${item.cases} (${percent(item.accuracy)})`)
    lines.push(`| ${provider.label} | ${values.join(' | ')} | ${provider.maximumAccuracySwingPoints.toFixed(2)} pp | ${provider.identicalOutputs.cases}/${provider.identicalOutputs.total} (${percent(provider.identicalOutputs.rate)}) | ${provider.identicalPassFailVerdicts.cases}/${provider.identicalPassFailVerdicts.total} (${percent(provider.identicalPassFailVerdicts.rate)}) |`)
  }
  lines.push('', report.interpretation, '')
  return lines.join('\n')
}

function countBy(items, group) { const counts = {}; for (const item of items) { const key = group(item); counts[key] = (counts[key] || 0) + 1 } return counts }
function keyFor(item) { return `${item.repeat}:${item.caseId}:${item.providerId}` }
function normalize(value) { return String(value || '').trim().replace(/\s+/g, ' ') }
function rotate(items, offset) { const shift = offset % items.length; return [...items.slice(shift), ...items.slice(0, shift)] }
function hash(value) { return createHash('sha256').update(value).digest('hex') }
function percent(value) { return `${(value * 100).toFixed(1)}%` }
