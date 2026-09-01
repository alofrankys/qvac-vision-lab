import { readFile } from 'node:fs/promises'
import { assertSameInputFairness } from '../src/arena/index.mjs'

const runId = process.argv[2]
if (!runId) throw new Error('Usage: npm run arena:verify -- <run-id>')
const state = JSON.parse(await readFile(new URL('../data/pawvault.json', import.meta.url)))
const run = state.runs.find(item => item.id === runId)
const round = state.arenaRounds.find(item => item.runId === runId)
if (!run || !round) throw new Error(`Arena run not found: ${runId}`)
assertSameInputFairness(round, state.inferences)
const report = { runId, roundId: round.id, fair: true, status: round.status, arenaMode: round.arenaMode, executionOrder: round.executionOrder, modelLockVersion: round.modelLockVersion, answers: Object.keys(round.answerIds).length }
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
