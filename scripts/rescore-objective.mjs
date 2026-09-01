import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StateStore } from '../src/storage/store.mjs'
import { recordArenaJudgment } from '../src/arena/index.mjs'
import { scoreObjectiveAnswer } from '../src/evaluation/objective-answer.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const store = await new StateStore(path.join(root, 'data', 'pawvault.json')).init()
let rescored = 0
let changed = 0

await store.update(state => {
  for (const round of state.arenaRounds.filter(item => item.expectedAnswer && item.status !== 'REVEALED')) {
    for (const blindLabel of Object.keys(round.blindMapping || {})) {
      const inference = state.inferences.find(item => item.id === round.answerIds?.[blindLabel])
      if (!inference) continue
      const objective = scoreObjectiveAnswer(inference.rawOutput || '', round)
      if (!objective.verdict) continue
      rescored += 1
      const previous = [...state.arenaJudgments].reverse().find(item => item.roundId === round.id && item.blindLabel === blindLabel && item.judgeProviderId === 'GOLD_ANSWER_SCORER')
      if (previous?.judgeId === 'objective-answer-v2' && previous.verdict === objective.verdict) continue
      if (previous?.verdict !== objective.verdict) changed += 1
      recordArenaJudgment(state, {
        roundId: round.id,
        blindLabel,
        verdict: objective.verdict,
        judgeProviderId: 'GOLD_ANSWER_SCORER',
        judgeId: 'objective-answer-v2',
        judgeLabel: 'Deterministic gold-answer scorer v2',
        note: JSON.stringify({ answerType: objective.answerType, normalizedOutput: objective.actual, accepted: objective.accepted, supersedesJudgmentId: previous?.id || null })
      }, { allowDeterministic: true })
    }
  }
})

console.log(JSON.stringify({ rescored, changed, scorer: 'objective-answer-v2' }))
