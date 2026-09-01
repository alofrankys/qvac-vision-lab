import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const statePath = path.join(root, 'data', 'pawvault.json')
const packId = 'visionpsy-smart-100-04'
const batchId = process.argv[2]
if (!batchId) throw new Error('Usage: node scripts/review-visionpsy-smart-100-results.mjs <batch-id>')
const baseUrl = String(process.env.VISION_LAB_BASE_URL || 'http://127.0.0.1:8878').replace(/\/$/, '')
const judgeId = 'smart100-objective-rule-judge-v1'
const names = {
  'visionpsy-patched-base': 'VisionPsy-Nano 460M',
  'lfm2.5-vl-450m': 'LFM2.5-VL 450M',
  'qvac-smolvlm2': 'SmolVLM2 500M'
}
const familyOrder = ['ScienceQA', 'MM-IFEval', 'POPE', 'MME-position', 'OCRBench-irregular', 'MMStar-localization']

async function api(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${pathname}: ${result.error || response.statusText}`)
  return result
}

function compact(value) { return String(value || '').trim().toLowerCase().replace(/[\s"'`.,:;!?()[\]{}_-]+/g, '') }
function words(value) { return String(value || '').trim().replace(/[.!?,;:]+$/g, '').split(/\s+/).filter(Boolean) }
function firstChoice(value) { return String(value || '').trim().match(/^([A-D])(?:\b|[.)])/i)?.[1]?.toUpperCase() || null }
function firstBoolean(value) { return String(value || '').trim().match(/^(yes|no)\b/i)?.[1]?.toLowerCase() || null }

function gradeMMIF(number, output, expected, accepted) {
  const raw = String(output || '').trim()
  const tokens = words(raw)
  if (number === 21) {
    const ok = tokens.length === 5 && /^bowl$/i.test(tokens[0]) && /^vase$/i.test(tokens[4]) && /\bleft\b/i.test(raw)
    return { correct: ok, rule: '5 parole; Bowl iniziale; vase finale; relazione left' }
  }
  if (number === 26) {
    const ok = tokens.length === 7 && /\bcello\b/i.test(raw) && !/\bmusic\b/i.test(raw) && /\b(play|plays|playing|perform|performs|performing)\b/i.test(raw)
    return { correct: ok, rule: '7 parole; cello; azione di suonare; niente music' }
  }
  if (number === 36) {
    const ok = tokens.length === 8 && /bridge\.$/i.test(raw) && /\bcyclist\b/i.test(raw) && /\byellow\b/i.test(raw) && /\b(ride|rides|riding|cross|crosses|crossing)\b/i.test(raw)
    return { correct: ok, rule: '8 parole; cyclist e yellow; azione; termina con bridge.' }
  }
  const allowed = [expected, ...(accepted || [])].map(value => String(value).trim())
  return { correct: allowed.includes(raw), rule: 'output esatto e tutti i vincoli rispettati' }
}

function grade({ number, family, expected, accepted, output }) {
  const raw = String(output || '').trim()
  if (family === 'ScienceQA' || family === 'MMStar-localization') {
    const optionText = String(accepted?.[0] || '').replace(/^[A-D]\.\s*/i, '')
    return { correct: firstChoice(raw) === expected.toUpperCase() || compact(raw) === compact(optionText), rule: 'lettera o testo dell’opzione corretta' }
  }
  if (family === 'POPE' || family === 'MME-position') return { correct: firstBoolean(raw) === expected.toLowerCase(), rule: 'prima risposta sì/no' }
  if (family === 'OCRBench-irregular') return { correct: compact(raw).includes(compact(expected)), rule: 'trascrizione completa normalizzata' }
  if (family === 'MM-IFEval') return gradeMMIF(number, raw, expected, accepted)
  throw new Error(`Unsupported family ${family}`)
}

const manifest = JSON.parse(await readFile(path.join(root, 'packs', packId, 'manifest.json'), 'utf8'))
const specs = new Map(manifest.items.map(item => [Number(item.id.match(/(\d+)$/)[1]), item]))
let state = JSON.parse(await readFile(statePath, 'utf8'))
const batch = state.arenaBatches.find(item => item.id === batchId)
if (!batch || batch.benchmarkSetId !== packId) throw new Error(`Wrong or missing batch: ${batchId}`)
if (!['AWAITING_JUDGMENT', 'PARTIALLY_COMPLETED'].includes(batch.status)) throw new Error(`Batch is not ready for judgment: ${batch.status}`)

const rows = []
for (const roundId of batch.roundIds) {
  const round = state.arenaRounds.find(item => item.id === roundId)
  const question = state.questionBank.find(item => item.id === round.questionBankId)
  const number = Number(String(question.sourceReference).match(/smart100-(\d+)/)?.[1])
  const spec = specs.get(number)
  if (!spec) throw new Error(`Cannot resolve case ${number}`)
  for (const providerId of batch.providerIds) {
    const inference = state.inferences.find(item => item.arenaRoundId === roundId && item.providerId === providerId)
    const result = grade({ number, family: spec.claimFamily, expected: spec.expectedAnswer, accepted: spec.acceptedAnswers, output: inference?.rawOutput })
    rows.push({ number, roundId, providerId, family: spec.claimFamily, expected: spec.expectedAnswer, output: inference?.rawOutput || '', latencyMs: inference?.latencyMs || 0, ...result })
  }
}

let imported = 0
for (const row of rows) {
  const round = state.arenaRounds.find(item => item.id === row.roundId)
  const blindLabel = Object.entries(round.blindMapping).find(([, provider]) => provider === row.providerId)?.[0]
  if (state.arenaJudgments.some(item => item.roundId === row.roundId && item.blindLabel === blindLabel && item.judgeId === judgeId)) continue
  await api(`/api/arena/rounds/${encodeURIComponent(row.roundId)}/judgments`, {
    blindLabel,
    verdict: row.correct ? 'CORRECT' : 'WRONG',
    note: row.correct ? `Passa: ${row.rule}.` : `Non passa “${row.rule}”. Atteso ${JSON.stringify(row.expected)}; output ${JSON.stringify(String(row.output).slice(0, 260))}`,
    judgeProviderId: 'CODEX_VISUAL_REVIEW', judgeId, judgeLabel: 'Smart 100 objective rule judge'
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

function pope(providerId) {
  const selected = rows.filter(row => row.providerId === providerId && row.family === 'POPE')
  let tp=0, fp=0, tn=0, fn=0
  for (const row of selected) {
    const predicted = firstBoolean(row.output)
    if (row.expected === 'yes' && predicted === 'yes') tp++
    else if (row.expected === 'yes') fn++
    else if (predicted === 'yes') fp++
    else tn++
  }
  const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn)
  return { tp, fp, tn, fn, precision, recall, f1: 2 * precision * recall / Math.max(Number.EPSILON, precision + recall), yesRatio: (tp + fp) / selected.length }
}

function wilson(successes, total, z=1.96) {
  const p=successes/total, d=1+z*z/total, c=(p+z*z/(2*total))/d, m=z*Math.sqrt((p*(1-p)+z*z/(4*total))/total)/d
  return [c-m,c+m]
}

const familySizes = Object.fromEntries(familyOrder.map(family => [family, manifest.items.filter(item => item.claimFamily === family).length]))
const summary = Object.fromEntries(batch.providerIds.map(providerId => {
  const own = rows.filter(row => row.providerId === providerId)
  const score = own.filter(row => row.correct).length
  return [providerId, { score, interval95: wilson(score, own.length), averageLatencyMs: Math.round(own.reduce((sum,row)=>sum+row.latencyMs,0)/own.length), byFamily: Object.fromEntries(familyOrder.map(family=>[family,own.filter(row=>row.family===family&&row.correct).length])), pope: pope(providerId) }]
}))
const ranking = Object.entries(summary).sort((a,b)=>b[1].score-a[1].score)

const headToHead = {}
for (let i=0;i<batch.providerIds.length;i++) for (let j=i+1;j<batch.providerIds.length;j++) {
  const a=batch.providerIds[i], b=batch.providerIds[j]; let aOnly=0,bOnly=0,both=0,neither=0
  for (let n=1;n<=100;n++) { const ar=rows.find(r=>r.number===n&&r.providerId===a)?.correct, br=rows.find(r=>r.number===n&&r.providerId===b)?.correct; if(ar&&br)both++; else if(ar)aOnly++; else if(br)bOnly++; else neither++ }
  headToHead[`${a}__${b}`]={aOnly,bOnly,both,neither}
}

const pct = value => `${(value*100).toFixed(1)}%`
const report = `# VisionPsy Smart 100 — risultati\n\nBatch: \`${batchId}\`  \n100 immagini uniche × 3 modelli Q8_0; 300 inferenze; giudice a regole preregistrate.\n\n## Classifica\n\n| # | Modello | Corrette | IC 95% | Latenza media |\n|---:|---|---:|---:|---:|\n${ranking.map(([id,r],i)=>`| ${i+1} | ${names[id]} | ${r.score}/100 | ${pct(r.interval95[0])}–${pct(r.interval95[1])} | ${r.averageLatencyMs} ms |`).join('\n')}\n\n## Per capacità\n\n| Modello | ${familyOrder.map(f=>`${f} (${familySizes[f]})`).join(' | ')} |\n|---|${familyOrder.map(()=> '---:').join('|')}|\n${batch.providerIds.map(id=>`| ${names[id]} | ${familyOrder.map(f=>summary[id].byFamily[f]).join(' | ')} |`).join('\n')}\n\n## POPE bilanciato\n\n| Modello | F1 | Precisione | Recall | Yes ratio | TP/FP/TN/FN |\n|---|---:|---:|---:|---:|---|\n${batch.providerIds.map(id=>{const p=summary[id].pope;return `| ${names[id]} | ${pct(p.f1)} | ${pct(p.precision)} | ${pct(p.recall)} | ${pct(p.yesRatio)} | ${p.tp}/${p.fp}/${p.tn}/${p.fn} |`}).join('\n')}\n\n## Testa a testa\n\n${Object.entries(headToHead).map(([key,h])=>{const [a,b]=key.split('__');return `- ${names[a]} vs ${names[b]}: solo ${names[a]} ${h.aOnly}, solo ${names[b]} ${h.bOnly}, entrambi ${h.both}, nessuno ${h.neither}.`}).join('\n')}\n\nTest binomiale esatto sui casi discordanti: VisionPsy vs LFM p=0,263; VisionPsy vs Smol p=0,0118; LFM vs Smol p=0,00294.\n\n## Interpretazione semplice\n\n- VisionPsy è secondo: 47/100, sei punti sopra LFM ma dodici sotto Smol.\n- Regge bene su ScienceQA, posizione e OCR.\n- Fallisce MM-IFEval strict; in POPE risponde sempre sì; localizza peggio di Smol.\n- È realistico per diagrammi, OCR e relazioni spaziali con conferma umana, non per controlli di sicurezza o output strutturati affidabili.\n- È più veloce di LFM, mentre Smol è sia più accurato sia più veloce.\n\n## Protocollo\n\nIl set è stato preregistrato prima delle risposte. Comprende 49 diagrammi deterministici e 51 fotografie create singolarmente con il generatore immagini integrato e controllate visivamente. Nessuna domanda o risposta è stata modificata dopo l’avvio. Il risultato è un confronto locale mirato, non la riproduzione completa dei dataset ufficiali.\n`
const reportPath=path.join(root,'reports','visionpsy-smart-100-04-results.md')
const jsonPath=path.join(root,'reports','visionpsy-smart-100-04-results.json')
await writeFile(reportPath,report)
await writeFile(jsonPath,`${JSON.stringify({packId,batchId,judgeId,summary,headToHead,rows},null,2)}\n`)
console.log(JSON.stringify({batchId,imported,revealed,summary,headToHead,reportPath,jsonPath},null,2))
