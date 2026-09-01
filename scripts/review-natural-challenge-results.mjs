import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const state = JSON.parse(await readFile(path.join(root, 'data', 'pawvault.json'), 'utf8'))
const baseUrl = String(process.env.VISION_LAB_BASE_URL || 'http://127.0.0.1:8878').replace(/\/$/, '')
const batchId = process.env.NATURAL_BENCHMARK_BATCH_ID || 'batch_adf56bd1-910c-40c8-ad06-07316687de33'
const judgeId = 'codex-natural-semantic-audit-2026-08-20'

const wrong = {
  'lfm2.5-vl-450m': new Map([
    ['Where is the rabbit relative to the bench?', 'Incorrect relation: says on the bench; the rabbit is under it.'],
    ['Which branch of the trail is the hiker taking?', 'Does not identify the right-hand branch.'],
    ['How many blue cups are on the table?', 'Incorrect count: says three; only two cups are blue.'],
    ['Which animal is outside the fenced pen?', 'Incorrect animal: says sheep; the dog is outside.']
  ]),
  'qvac-smolvlm2': new Map([
    ['Where is the rabbit relative to the bench?', 'Incorrect relation: says in front; the rabbit is under the bench.'],
    ['How many oranges are in the bowl?', 'Incorrect count: says five; there are four.'],
    ['Which branch of the trail is the hiker taking?', 'Does not identify the right-hand branch.'],
    ['How many blue cups are on the table?', 'Incorrect count: says three; only two cups are blue.'],
    ['What object is on the lower shelf of the coffee table?', 'Incorrect object: says potted plant; the lower shelf holds a blue book.']
  ]),
  'visionpsy-patched-base': new Map([
    ['What color is the cat on the left?', 'Incorrect color: says white; the left cat is black.'],
    ['Where is the rabbit relative to the bench?', 'Does not answer the requested spatial relation.'],
    ['What is the dog holding in its mouth?', 'Truncated generic description never identifies the blue frisbee.'],
    ['Which branch of the trail is the hiker taking?', 'Truncated description never identifies the right-hand branch.'],
    ['How many blue cups are on the table?', 'Incorrect count: says three; only two cups are blue.'],
    ['What should be used to handle the hot baking tray safely?', 'Truncated description never identifies the oven mitt.'],
    ['What object is between the fork and the knife?', 'Truncated description never identifies the blue plate.'],
    ['What color is the backpack?', 'Incorrect color: says green; the backpack is red.']
  ])
}

const partial = {
  'visionpsy-patched-base': new Map([
    ['How are the hikers crossing the stream?', 'Recognizes that the hikers are crossing the stream but omits the stepping-stone method.']
  ])
}

async function api(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${pathname}: ${result.error || response.statusText}`)
  return result
}

const batch = state.arenaBatches.find(item => item.id === batchId)
if (!batch) throw new Error(`Batch not found: ${batchId}`)
if (batch.benchmarkSetId !== 'natural-vision-challenge-pack-01') throw new Error('Refusing to review an unrelated batch')

const summary = Object.fromEntries(batch.providerIds.map(providerId => [providerId, { CORRECT: 0, PARTIALLY_CORRECT: 0, WRONG: 0 }]))
let imported = 0
for (const roundId of batch.roundIds) {
  const round = state.arenaRounds.find(item => item.id === roundId)
  if (!round) throw new Error(`Missing round: ${roundId}`)
  for (const [blindLabel, providerId] of Object.entries(round.blindMapping)) {
    const wrongReason = wrong[providerId]?.get(round.question)
    const partialReason = partial[providerId]?.get(round.question)
    const verdict = wrongReason ? 'WRONG' : partialReason ? 'PARTIALLY_CORRECT' : 'CORRECT'
    const note = wrongReason || partialReason || 'Answer is semantically consistent with the verified scene and accepted gold answer.'
    summary[providerId][verdict] += 1
    const exists = state.arenaJudgments.some(item => item.roundId === round.id && item.blindLabel === blindLabel && item.judgeId === judgeId)
    if (exists) continue
    await api(`/api/arena/rounds/${encodeURIComponent(round.id)}/judgments`, {
      blindLabel,
      verdict,
      note,
      judgeProviderId: 'CODEX_VISUAL_REVIEW',
      judgeId,
      judgeLabel: 'Codex semantic visual review'
    })
    imported += 1
  }
}

console.log(JSON.stringify({ batchId, judgeId, imported, summary }, null, 2))
