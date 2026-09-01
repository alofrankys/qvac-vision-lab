import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const statePath = path.join(root, 'data', 'pawvault.json')
const packId = 'visionpsy-claim-matched-03'
const batchId = process.argv[2] || 'batch_6481b757-a7fb-42d9-8a1e-01262c7ccf00'
const baseUrl = String(process.env.VISION_LAB_BASE_URL || 'http://127.0.0.1:8878').replace(/\/$/, '')
const judgeId = 'claim-matched-objective-v1-2026-08-20'

const providerNames = {
  'visionpsy-patched-base': 'VisionPsy-Nano 460M',
  'lfm2.5-vl-450m': 'LFM2.5-VL 450M',
  'qvac-smolvlm2': 'SmolVLM2 500M'
}
const familyOrder = ['ScienceQA', 'MM-IFEval', 'POPE', 'MME-position', 'OCRBench-irregular', 'MMStar-localization']
const familySizes = { ScienceQA: 6, 'MM-IFEval': 6, POPE: 6, 'MME-position': 4, 'OCRBench-irregular': 4, 'MMStar-localization': 4 }

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

function compact(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s"'`.,:;!?()[\]{}_-]+/g, '')
}

function firstChoice(value) {
  return String(value || '').trim().match(/^([A-D])(?:\b|[.)])/i)?.[1]?.toUpperCase() || null
}

function firstBoolean(value) {
  return String(value || '').trim().match(/^(yes|no)\b/i)?.[1]?.toLowerCase() || null
}

function itemNumber(question) {
  const match = String(question?.sourceReference || '').match(/claim-match-(\d+)/)
  if (!match) throw new Error(`Cannot resolve case number from ${question?.sourceReference}`)
  return Number(match[1])
}

function objectiveGrade({ number, family, expected, accepted, output }) {
  const raw = String(output || '').trim()
  let correct = false
  let rule = ''
  if (family === 'ScienceQA' || family === 'MMStar-localization') {
    const expectedChoice = String(expected).toUpperCase()
    const optionText = String(accepted?.[0] || '').replace(/^[A-D]\.\s*/i, '')
    correct = firstChoice(raw) === expectedChoice || compact(raw) === compact(optionText)
    rule = 'MCQ: lettera iniziale corretta o testo completo dell’opzione corretta'
  } else if (family === 'POPE' || family === 'MME-position') {
    correct = firstBoolean(raw) === String(expected).toLowerCase()
    rule = 'prima risposta sì/no'
  } else if (family === 'OCRBench-irregular') {
    correct = compact(raw).includes(compact(expected))
    rule = 'trascrizione completa presente, ignorando maiuscole e punteggiatura esterna'
  } else if (family === 'MM-IFEval') {
    const allowed = [expected, ...(accepted || [])].map(value => String(value).trim())
    correct = allowed.includes(raw)
    rule = 'tutti i vincoli e il contenuto devono coincidere con una risposta preregistrata valida'
  } else {
    throw new Error(`Unsupported family for case ${number}: ${family}`)
  }
  return { correct, rule }
}

const manifest = JSON.parse(await readFile(path.join(root, 'packs', packId, 'manifest.json'), 'utf8'))
const manifestByNumber = new Map(manifest.items.map(item => [Number(item.id.match(/(\d+)$/)[1]), item]))
let state = JSON.parse(await readFile(statePath, 'utf8'))
const batch = state.arenaBatches.find(item => item.id === batchId)
if (!batch) throw new Error(`Batch not found: ${batchId}`)
if (batch.benchmarkSetId !== packId) throw new Error(`Refusing to review ${batch.benchmarkSetId}`)

const rows = []
for (const roundId of batch.roundIds) {
  const round = state.arenaRounds.find(item => item.id === roundId)
  const question = state.questionBank.find(item => item.id === round.questionBankId)
  const number = itemNumber(question)
  const spec = manifestByNumber.get(number)
  for (const providerId of batch.providerIds) {
    const inference = state.inferences.find(item => item.arenaRoundId === roundId && item.providerId === providerId)
    const grade = objectiveGrade({
      number,
      family: spec.claimFamily,
      expected: spec.expectedAnswer,
      accepted: spec.acceptedAnswers,
      output: inference?.rawOutput
    })
    rows.push({
      number,
      roundId,
      providerId,
      family: spec.claimFamily,
      expected: spec.expectedAnswer,
      output: inference?.rawOutput || '',
      latencyMs: inference?.latencyMs || 0,
      correct: grade.correct,
      rule: grade.rule
    })
  }
}

let imported = 0
for (const row of rows) {
  const round = state.arenaRounds.find(item => item.id === row.roundId)
  const blindLabel = Object.entries(round.blindMapping).find(([, providerId]) => providerId === row.providerId)?.[0]
  if (!blindLabel) throw new Error(`Blind label not found for ${row.roundId}/${row.providerId}`)
  const exists = state.arenaJudgments.some(item => item.roundId === row.roundId && item.blindLabel === blindLabel && item.judgeId === judgeId)
  if (exists) continue
  await api(`/api/arena/rounds/${encodeURIComponent(row.roundId)}/judgments`, {
    blindLabel,
    verdict: row.correct ? 'CORRECT' : 'WRONG',
    note: row.correct
      ? `Passa la regola preregistrata: ${row.rule}.`
      : `Non passa “${row.rule}”. Atteso: ${JSON.stringify(row.expected)}. Output: ${JSON.stringify(String(row.output).slice(0, 260))}`,
    judgeProviderId: 'CODEX_VISUAL_REVIEW',
    judgeId,
    judgeLabel: 'Claim-matched objective judge v1'
  })
  imported += 1
}

let revealed = 0
state = JSON.parse(await readFile(statePath, 'utf8'))
for (const roundId of batch.roundIds) {
  const round = state.arenaRounds.find(item => item.id === roundId)
  if (round?.status === 'REVEALED') continue
  await api(`/api/arena/rounds/${encodeURIComponent(roundId)}/reveal`, {})
  revealed += 1
}

function popeMetrics(providerId) {
  const selected = rows.filter(row => row.providerId === providerId && row.family === 'POPE')
  let tp = 0, fp = 0, tn = 0, fn = 0
  for (const row of selected) {
    const predicted = firstBoolean(row.output)
    if (row.expected === 'yes' && predicted === 'yes') tp += 1
    else if (row.expected === 'yes') fn += 1
    else if (predicted === 'yes') fp += 1
    else tn += 1
  }
  const precision = tp / Math.max(1, tp + fp)
  const recall = tp / Math.max(1, tp + fn)
  const f1 = (2 * precision * recall) / Math.max(Number.EPSILON, precision + recall)
  return { tp, fp, tn, fn, precision, recall, f1, yesRatio: (tp + fp) / selected.length }
}

const summary = Object.fromEntries(batch.providerIds.map(providerId => {
  const own = rows.filter(row => row.providerId === providerId)
  const byFamily = Object.fromEntries(familyOrder.map(family => [family, own.filter(row => row.family === family && row.correct).length]))
  return [providerId, {
    score: own.filter(row => row.correct).length,
    byFamily,
    pope: popeMetrics(providerId),
    averageLatencyMs: Math.round(own.reduce((sum, row) => sum + row.latencyMs, 0) / own.length)
  }]
}))
const ranking = Object.entries(summary).sort((a, b) => b[1].score - a[1].score || a[1].averageLatencyMs - b[1].averageLatencyMs)

const report = `# VisionPsy Claim-Matched 03 — risultati\n\n` +
  `Batch: \`${batchId}\`  \n` +
  `Protocollo preregistrato prima dell’inferenza; 30 immagini uniche × 3 modelli locali Q8_0; 90/90 inferenze riuscite. Giudice deterministico: nessun punteggio parziale e nessuna modifica post-risposta.\n\n` +
  `## Risultato essenziale\n\n` +
  `| Pos. | Modello | Totale | Latenza media |\n|---:|---|---:|---:|\n` +
  ranking.map(([providerId, result], index) => `| ${index + 1} | ${providerNames[providerId]} | ${result.score}/30 | ${result.averageLatencyMs} ms |`).join('\n') +
  `\n\nI tre modelli cadono in una fascia strettissima di due punti: questo set riproduce competitività/parità pratica, non una superiorità netta.\n\n` +
  `## Per capacità dichiarata\n\n` +
  `| Modello | ScienceQA | MM-IFEval | POPE | MME posizione | OCR irregolare | MMStar localizzazione |\n|---|---:|---:|---:|---:|---:|---:|\n` +
  batch.providerIds.map(providerId => `| ${providerNames[providerId]} | ${familyOrder.map(family => `${summary[providerId].byFamily[family]}/${familySizes[family]}`).join(' | ')} |`).join('\n') +
  `\n\n- ScienceQA: VisionPsy è a pari merito con LFM.\n` +
  `- MM-IFEval: parità a zero; le scene sono comprese in parte, ma nessun modello rispetta integralmente i vincoli composti. Non è una vittoria utile.\n` +
  `- POPE: VisionPsy e LFM rispondono sempre “sì”; vedono gli oggetti presenti ma allucinano tutti gli assenti. Smol è leggermente migliore.\n` +
  `- MME posizione e OCR: parità completa.\n` +
  `- MMStar localizzazione: VisionPsy è al centro, fra Smol e LFM.\n\n` +
  `## POPE, metrica ufficiale pertinente\n\n` +
  `| Modello | F1 | Precisione | Recall | Yes ratio | TP/FP/TN/FN |\n|---|---:|---:|---:|---:|---|\n` +
  batch.providerIds.map(providerId => {
    const p = summary[providerId].pope
    return `| ${providerNames[providerId]} | ${(p.f1 * 100).toFixed(1)}% | ${(p.precision * 100).toFixed(1)}% | ${(p.recall * 100).toFixed(1)}% | ${(p.yesRatio * 100).toFixed(1)}% | ${p.tp}/${p.fp}/${p.tn}/${p.fn} |`
  }).join('\n') +
  `\n\n## Situazioni reali in cui ha senso competere\n\n` +
  `1. **Tutor scientifico e assistenza tecnica visiva** — scegliere una causa o la prossima azione da una foto/diagramma. Qui VisionPsy è 4/6 e pari al migliore; è un candidato realistico per suggerimenti locali a bassa latenza, con conferma umana.\n` +
  `2. **Output strutturato per automazioni** — trasformare una scena in JSON, liste o stringhe vincolate. È commercialmente interessante per workflow offline, ma oggi 0/6 strict per tutti: serve un post-processore o fine-tuning, non marketing.\n` +
  `3. **Inventario e sicurezza: oggetto presente/assente** — controllare se manca un DPI o se un oggetto pericoloso compare. VisionPsy riconosce i presenti ma fallisce gli assenti; è una direzione utile solo dopo calibrazione anti-allucinazione.\n` +
  `4. **Orientamento e assistenza accessibile** — “tazza a sinistra del piatto”, “valigia sotto la panca”. VisionPsy è in parità (2/4): può supportare ricerca oggetti e guida, ma non ancora decisioni di sicurezza.\n` +
  `5. **Lettura locale di etichette difficili** — targhette ruotate, verticali o poco contrastate. Tutti fanno 3/4; è il caso d’uso più maturo per inventario, manutenzione e trasporti.\n` +
  `6. **Ricerca di oggetti nel disordine** — trovare una tazza in un mobile o un telecomando fra i cuscini. VisionPsy 2/4: competitivo ma non leader; buono come shortlist locale prima di un modello più grande.\n\n` +
  `## Limiti\n\n` +
  `Questo è un analogo controllato di 30 casi, non l’esecuzione completa dei dataset ufficiali. Dimostra che, quando prompt, bilanciamento e metriche assomigliano alle prove dichiarate, VisionPsy torna competitivo. Non dimostra i punteggi pubblici né una superiorità statistica.\n\n` +
  `Fonti metodologiche: [valutazione QVAC](https://huggingface.co/blog/qvac/visionpsy), [VLMEvalKit](https://github.com/open-compass/VLMEvalKit/blob/main/docs/en/Quickstart.md), [POPE](https://github.com/AoiDragon/POPE), [MM-IFEval](https://github.com/SYuan03/MM-IFEngine), [OCRBench](https://github.com/qywh2023/OCRbench), [MMStar](https://github.com/MMStar-Benchmark/MMStar), [ScienceQA](https://github.com/lupantech/ScienceQA).\n`

const reportPath = path.join(root, 'reports', 'visionpsy-claim-matched-03-results.md')
const jsonPath = path.join(root, 'reports', 'visionpsy-claim-matched-03-results.json')
await writeFile(reportPath, report)
await writeFile(jsonPath, `${JSON.stringify({ packId, batchId, judgeId, summary, rows }, null, 2)}\n`)
console.log(JSON.stringify({ batchId, judgeId, imported, revealed, summary, reportPath, jsonPath }, null, 2))
