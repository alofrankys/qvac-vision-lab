import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const statePath = path.join(root, 'data', 'pawvault.json')
const baseUrl = String(process.env.VISION_LAB_BASE_URL || 'http://127.0.0.1:8878').replace(/\/$/, '')
const batchId = process.argv[2] || 'batch_1254e8bf-c127-43dc-b676-586b5dbead5f'
const judgeId = 'codex-visionpsy-claims-semantic-audit-2026-08-20'
const providerNames = {
  'visionpsy-patched-base': 'VisionPsy-Nano 460M',
  'lfm2.5-vl-450m': 'LFM2.5-VL 450M',
  'qvac-smolvlm2': 'SmolVLM2 500M'
}
const claimAreas = {
  chart_table: 'Science / diagrammi',
  ui_understanding: 'Istruzioni e formato',
  object_recognition: 'Anti-allucinazione',
  spatial_relation: 'Posizione spaziale',
  visual_text: 'OCR irregolare',
  physical_context: 'Localizzazione nel disordine'
}

const grading = {
  'visionpsy-patched-base': {
    correct: new Set([3, 6, 7, 9, 10, 20, 22, 28]),
    partial: new Set([21, 27])
  },
  'lfm2.5-vl-450m': {
    correct: new Set([1, 4, 7, 9, 11, 12, 13, 14, 16, 17, 20, 22, 26, 28, 29, 30]),
    partial: new Set([2])
  },
  'qvac-smolvlm2': {
    correct: new Set([1, 2, 4, 5, 6, 7, 9, 10, 11, 12, 13, 17, 18, 20, 22, 25, 28, 30]),
    partial: new Set([16, 21, 23, 27])
  }
}
const partialNotes = {
  2: 'Describes water rising from the lake but mixes evaporation with condensation and never names the requested process cleanly.',
  16: 'Identifies the left-hand red target but calls the square a rectangle.',
  21: 'Reads most/all target characters but the exact irregular transcription is incomplete or contains extra text.',
  23: 'Includes K7M4 but also returns the unrelated panel title, violating exact transcription.',
  27: 'Gets the vertical level (bottom) but omits the required horizontal position (center).'
}
const exactInstruction = {
  'visionpsy-patched-base': new Set([6, 9, 10]),
  'lfm2.5-vl-450m': new Set([]),
  'qvac-smolvlm2': new Set([6, 10])
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

let state = JSON.parse(await readFile(statePath, 'utf8'))
const batch = state.arenaBatches.find(item => item.id === batchId)
if (!batch) throw new Error(`Batch not found: ${batchId}`)
if (batch.benchmarkSetId !== 'visionpsy-claim-challenge-02') throw new Error('Refusing to review a batch other than the corrected challenge 02')

let imported = 0
for (const roundId of batch.roundIds) {
  const round = state.arenaRounds.find(item => item.id === roundId)
  const question = state.questionBank.find(item => item.id === round.questionBankId)
  const match = question?.sourceReference?.match(/vpsy-claim-(\d+)/)
  if (!match) throw new Error(`Cannot resolve controlled item number for ${round.id}`)
  const number = Number(match[1])
  for (const [blindLabel, providerId] of Object.entries(round.blindMapping)) {
    const rules = grading[providerId]
    const verdict = rules.correct.has(number) ? 'CORRECT' : rules.partial.has(number) ? 'PARTIALLY_CORRECT' : 'WRONG'
    const inference = state.inferences.find(item => item.arenaRoundId === round.id && item.providerId === providerId)
    const note = verdict === 'CORRECT'
      ? 'Semantically consistent with the visually verified controlled scene.'
      : verdict === 'PARTIALLY_CORRECT'
        ? partialNotes[number]
        : `Does not answer the controlled ground truth “${round.expectedAnswer}”. Output: ${String(inference?.rawOutput || '').slice(0, 220)}`
    const exists = state.arenaJudgments.some(item => item.roundId === round.id && item.blindLabel === blindLabel && item.judgeId === judgeId)
    if (exists) continue
    await api(`/api/arena/rounds/${encodeURIComponent(round.id)}/judgments`, {
      blindLabel,
      verdict,
      note,
      judgeProviderId: 'CODEX_VISUAL_REVIEW',
      judgeId,
      judgeLabel: 'Codex controlled-scene semantic audit'
    })
    imported += 1
  }
}

let revealed = 0
state = JSON.parse(await readFile(statePath, 'utf8'))
for (const roundId of batch.roundIds) {
  const round = state.arenaRounds.find(item => item.id === roundId)
  if (round?.status === 'REVEALED') continue
  await api(`/api/arena/rounds/${encodeURIComponent(roundId)}/reveal`, {})
  revealed += 1
}

state = JSON.parse(await readFile(statePath, 'utf8'))
const rows = []
for (const roundId of batch.roundIds) {
  const round = state.arenaRounds.find(item => item.id === roundId)
  const question = state.questionBank.find(item => item.id === round.questionBankId)
  const number = Number(question.sourceReference.match(/vpsy-claim-(\d+)/)[1])
  for (const providerId of batch.providerIds) {
    const rules = grading[providerId]
    const verdict = rules.correct.has(number) ? 'CORRECT' : rules.partial.has(number) ? 'PARTIALLY_CORRECT' : 'WRONG'
    const inference = state.inferences.find(item => item.arenaRoundId === round.id && item.providerId === providerId)
    rows.push({ number, category: round.category, providerId, verdict, score: verdict === 'CORRECT' ? 1 : verdict === 'PARTIALLY_CORRECT' ? 0.5 : 0, latencyMs: inference?.latencyMs || 0 })
  }
}

const summary = Object.fromEntries(batch.providerIds.map(providerId => {
  const own = rows.filter(row => row.providerId === providerId)
  const byArea = Object.fromEntries(Object.entries(claimAreas).map(([category, label]) => {
    const selected = own.filter(row => row.category === category)
    return [label, Number(selected.reduce((sum, row) => sum + row.score, 0).toFixed(1))]
  }))
  const semanticScore = own.reduce((sum, row) => sum + row.score, 0)
  const exactFormatScore = exactInstruction[providerId].size
  const averageLatencyMs = Math.round(own.reduce((sum, row) => sum + row.latencyMs, 0) / own.length)
  return [providerId, { semanticScore, exactFormatScore, averageLatencyMs, byArea }]
}))

const ranking = Object.entries(summary).sort((a, b) => b[1].semanticScore - a[1].semanticScore)
const areaHeaders = Object.values(claimAreas)
const markdown = `# VisionPsy Public Claims Challenge 02 — results\n\n` +
  `Batch: \`${batchId}\`  \n30 controlled images × 3 local models; 90/90 successful inferences; semantic visual review with correct=1, partial=0.5, wrong=0.\n\n` +
  `## What the public sources claim\n\n` +
  `The official QVAC/Hugging Face material reports 62.3 normalized overall for VisionPsy, versus 59.6 for LFM2.5-VL-450M and 52.5 for SmolVLM2-500M. The highlighted individual strengths that shaped this replication are ScienceQA (86.5), MM-IFEval (42.3), POPE (87.9), MME position (85.0), OCRBench irregular text (92.0), and MMStar object localization (57.5).\n\n` +
  `Primary sources: [QVAC announcement](https://qvac.tether.io/blog/visionpsy-nano-state-of-the-art-vision-ai-in-its-weight-class-small-enough-to-run-on-your-phone/), [detailed Hugging Face evaluation article](https://huggingface.co/blog/qvac/visionpsy), [model card](https://huggingface.co/qvac/VisionPsy-Nano-460M-GGUFs), and [official repository](https://github.com/tether-ai-research/qvac-visionpsy-nano). The article says the results were produced in-house with VLMEvalKit; the upstream integration and evaluator fixes were still proposed as open pull requests, so these are vendor claims rather than a completed independent replication.\n\n` +
  `## Local protocol\n\n` +
  `The corrected set contains six balanced areas with five unique images each: science diagrams, exact instruction following, absent-object hallucination checks, spatial position, irregular OCR, and object localization in clutter. Twenty assets are deterministic diagrams; ten are controlled photorealistic scenes generated with the built-in OpenAI image-generation tool and visually verified. All three models ran Q8_0 under the frozen local model lock.\n\n` +
  `## Overall ranking\n\n| Rank | Model | Semantic score | Exact instruction format (5) | Avg latency |\n|---:|---|---:|---:|---:|\n` +
  ranking.map(([providerId, result], index) => `| ${index + 1} | ${providerNames[providerId]} | ${result.semanticScore}/30 | ${result.exactFormatScore}/5 | ${result.averageLatencyMs} ms |`).join('\n') +
  `\n\n## By claimed capability\n\n| Model | ${areaHeaders.join(' | ')} |\n|---|${areaHeaders.map(() => '---:').join('|')}|\n` +
  batch.providerIds.map(providerId => `| ${providerNames[providerId]} | ${areaHeaders.map(area => `${summary[providerId].byArea[area]}/5`).join(' | ')} |`).join('\n') +
  `\n\n## Interpretation\n\n` +
  `VisionPsy reproduces one narrow claimed advantage here: strict output-format compliance (3/5), ahead of SmolVLM2 (2/5) and LFM (0/5). It also uniquely solves the open-vs-closed circuit case.\n\n` +
  `The broader public superiority claim is not reproduced. VisionPsy scores 9/30 semantically and is especially weak in the five negative-object/hallucination probes (0/5), despite POPE being one of the highlighted public strengths. SmolVLM2 leads overall and in science, spatial reasoning, and irregular OCR; LFM leads controlled negative-object checks and cluttered localization.\n\n` +
  `This is a targeted 30-case replication, not a reimplementation of ScienceQA, POPE, MM-IFEval, MME, OCRBench or MMStar. The result can falsify broad transfer to these new cases, but cannot invalidate the original benchmark scores without running the official datasets and evaluator versions.\n`

const reportPath = path.join(root, 'reports', 'visionpsy-public-claims-challenge-02-results.md')
await writeFile(reportPath, markdown)
console.log(JSON.stringify({ batchId, judgeId, imported, revealed, summary, reportPath }, null, 2))
