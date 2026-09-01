import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createZip } from '../export/zip.mjs'
import { publicArenaRound } from './index.mjs'

const json = value => `${JSON.stringify(value, null, 2)}\n`

export async function buildArenaBundle(state, round, directories, blind = false) {
  if (!blind && round.status !== 'REVEALED') throw new Error('Private Arena exports require reveal')
  if (blind && !['AWAITING_JUDGMENT','READY_TO_REVEAL','REVEALED'].includes(round.status)) throw new Error('Blind Judge export requires completed inference')
  const photo = state.photos.find(item => item.id === round.photoId)
  const answers = Object.entries(round.blindMapping).map(([blindLabel, providerId]) => {
    const inference = state.inferences.find(item => item.id === round.answerIds[blindLabel])
    return blind ? { blindLabel, rawOutput: inference?.rawOutput || '', errorCode: inference?.errorCode || null } : { blindLabel, providerId, inference }
  })
  const blindRound = { schemaVersion: 1, bundleType: 'BLIND_JUDGE_SHARE_SAFE', roundId: round.id, datasetId: round.datasetId, imageId: round.photoId, inferenceImageSha256: round.inferenceImage?.sha256 || null, question: round.question, category: round.category, outputBudget: round.outputBudget, answers, methodology: { sameSourceImage: true, sameQuestion: true, sameOutputBudget: true, sequentialExecution: true, identitiesWithheld: true }, verdicts: ['CORRECT','PARTIALLY_CORRECT','WRONG','HALLUCINATED','UNCLEAR_IMAGE'] }
  const entries = [
    { name: 'README.txt', data: blind ? 'QVAC Vision Lab Blind Judge Bundle — SHARE SAFE\nContains only image/question, anonymous A/B/C outputs or error codes, and non-identifying methodology. The private mapping is a separate export and is not present here.\n' : 'QVAC Vision Lab Arena Bundle — PRIVATE EVIDENCE\nContains model identities, runtime details, judgments, provenance, and source/inference images. Do not distribute this full bundle to blind judges.\n' },
    { name: 'arena.json', data: json(blind ? blindRound : publicArenaRound(round, state)) },
    { name: 'questions.json', data: json([blind ? { question: round.question, category: round.category } : { question: round.question, category: round.category, expectedAnswer: round.expectedAnswer, expectedAnswerSource: round.expectedAnswerSource }]) },
    { name: 'answers.json', data: json(answers) },
    ...(blind ? [{ name: 'review-template.json', data: json({ schemaVersion: 1, bundleType: 'BLIND_HUMAN_REVIEW', judgeId: '', judgeLabel: '', rounds: [{ roundId: round.id, judgments: Object.keys(round.blindMapping).map(blindLabel => ({ blindLabel, verdict: null, note: null })) }] }) }] : [
      { name: 'judgments.json', data: json(state.arenaJudgments.filter(item => item.roundId === round.id)) },
      { name: 'summary.json', data: json({ roundId: round.id, blindStatus: round.blindStatus, reviewMode: round.reviewMode, winner: round.winner, winnerProviderId: round.winnerProviderId, fairness: round.fairness }) }
    ])
  ]
  if (photo?.storedFilename) entries.push({ name: `images/original/${photo.filename || photo.storedFilename}`, data: await readFile(path.join(directories.photosDir, photo.storedFilename)) })
  if (photo?.inferenceFilename) entries.push({ name: `images/inference/${photo.inferenceFilename}`, data: await readFile(path.join(directories.inferenceDir, photo.inferenceFilename)) })
  return createZip(entries)
}

export function buildPrivateMappingBundle(state, round) {
  if (round.status !== 'REVEALED') throw new Error('Private mapping export requires reveal')
  const mapping = Object.fromEntries(Object.entries(round.blindMapping).map(([blindLabel, providerId]) => {
    const inference = state.inferences.find(item => item.id === round.answerIds[blindLabel])
    return [blindLabel, { providerId, model: inference?.model || null, modelVersion: inference?.modelVersion || null, runtime: inference?.runtime || null, runtimeVersion: inference?.runtimeVersion || null, projection: inference?.projection || null }]
  }))
  return createZip([
    { name: 'README.txt', data: 'QVAC Vision Lab Private Mapping Bundle\nPRIVATE: never distribute this archive to blind judges. It identifies anonymous answers.\n' },
    { name: 'private/blind-mapping.json', data: json({ roundId: round.id, inferenceImageSha256: round.inferenceImage?.sha256 || null, mapping }) }
  ])
}
