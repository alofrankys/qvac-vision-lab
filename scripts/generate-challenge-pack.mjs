import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packDir = path.join(root, 'packs', 'vision-lab-challenge-01')
const imageDir = path.join(packDir, 'images')

const screenshots = [
  ['Payment center','Payment failed','What is the payment status shown?','Payment failed',['failed'],'exact_text'],
  ['Workspace sync','Offline mode','Which mode is active?','Offline mode',['offline'],'exact_text'],
  ['Device storage','92% used','What percentage of storage is used?','92%',['92 percent'],'percentage'],
  ['System health','Image processor: Degraded','What is the image processor status?','Degraded',[],'exact_text'],
  ['Two-factor authentication','Code expires in 04:30','How much time remains before the code expires?','04:30',['4:30'],'time'],
  ['Upload report','Rejected file type: HEIC','Which file type was rejected?','HEIC',['.heic'],'exact_text'],
  ['Privacy settings','Processed: On this device','Where is the content processed?','On this device',['locally'],'exact_text'],
  ['Review calendar','Next review: 14:30','At what time is the next review?','14:30',['2:30 pm'],'time'],
  ['Connection recovery','Retry in 3 seconds','How many seconds until retry?','3',['3 seconds'],'integer'],
  ['Camera access','Permission denied','What is the camera permission status?','Permission denied',['denied'],'exact_text']
]
const documents = [
  ['INVOICE VL-1042',[['Services','€100.00'],['Tax','€28.50'],['TOTAL','€128.50']],'What is the invoice total?','128.50',['€128.50','128,50 EUR'],'currency'],
  ['RECEIPT 0841',[['Notebook','€25.00'],['Markers','€17.90'],['SUBTOTAL','€42.90']],'What is the subtotal?','42.90',['€42.90','42,90 EUR'],'currency'],
  ['SHIPPING NOTICE',[['Carrier','QV Express'],['Tracking code','QV-2048-IT'],['Service','Priority']],'What is the tracking code?','QV-2048-IT',[],'exact_text'],
  ['SUPPORT FORM',[['Department','Vision Lab'],['Case ID','PV-731'],['Priority','Normal']],'What is the case ID?','PV-731',[],'exact_text'],
  ['TRAVEL ITINERARY',[['Route','Rome → Milan'],['Platform','7'],['Departure','16:45']],'What is the departure time?','16:45',['4:45 pm'],'time'],
  ['INVENTORY SHEET',[['Item','Camera stand'],['Location','Shelf B4'],['Stock','27']],'How many units are in stock?','27',[],'integer'],
  ['ORDER SUMMARY',[['Product','Sensor kit'],['Unit price','€19.00'],['Quantity','6']],'What quantity was ordered?','6',[],'integer'],
  ['NUTRITION LABEL',[['Serving','100 g'],['Carbohydrate','24 g'],['Protein','18 g']],'How many grams of protein are listed?','18',['18 g'],'integer'],
  ['QUALITY REPORT',[['Check','Optical alignment'],['Inspector','QA-17'],['Status','Passed']],'What is the inspection status?','Passed',['pass'],'exact_text'],
  ['ACCOUNT STATEMENT',[['Opening balance','€800.00'],['Net change','€45.20'],['Closing balance','€845.20']],'What is the closing balance?','845.20',['€845.20','845,20 EUR'],'currency']
]
const charts = [
  ['Quarterly uploads',['Q1','Q2','Q3','Q4'],[18,31,27,46],'Which quarter has the highest value?','Q4',[],'exact_text'],
  ['Annual accuracy',['2022','2023','2024'],[51,59,68],'What is the value for 2024?','68',[],'integer'],
  ['Regional cases',['North','South'],[42,24],'What is the difference between North and South?','18',[],'integer'],
  ['Monthly failures',['January','February','March'],[22,15,8],'Which month has the lowest value?','March',['Mar'],'exact_text'],
  ['Task distribution',['OCR','Charts','UI'],[40,35,25],'What is the total of all three values?','100',[],'integer'],
  ['Traffic by device',['Mobile','Desktop','Tablet'],[62,30,8],'What percentage is Mobile?','62%',['62 percent'],'percentage'],
  ['Alert colors',['Red','Blue','Red','Green','Red'],[30,30,30,30,30],'How many bars are red?','3',[],'integer'],
  ['Yearly score',['2023','2024','2025'],[44,57,73],'Which year has the highest score?','2025',[],'integer'],
  ['Quarter table',['Q1','Q2','Q3'],[32,44,39],'What value is shown for Q2?','44',[],'integer'],
  ['Response times',['A','B','C'],[20,30,40],'What is the average of the three values?','30',[],'integer']
]

await mkdir(imageDir, { recursive: true })
const items = []
for (let index = 0; index < screenshots.length; index++) items.push(await emit('screenshot', index, screenshots[index], renderScreenshot))
for (let index = 0; index < documents.length; index++) items.push(await emit('document', index, documents[index], renderDocument))
for (let index = 0; index < charts.length; index++) items.push(await emit('chart', index, charts[index], renderChart))

const manifest = {
  schemaVersion: 1,
  id: 'vision_lab_challenge_pack_01',
  name: 'Vision Lab Challenge Pack 01',
  version: '1.0.0-draft',
  description: 'Thirty synthetic, objective visual questions for UI screenshots, documents and charts.',
  generatedAt: new Date().toISOString(),
  license: 'CC0-1.0',
  rankingPolicy: { minQuestions: 30, minUniqueImages: 30, requireExpectedAnswers: true, categoryMinimums: { ui_understanding: 10, document_understanding: 10, chart_table: 10 } },
  items
}
await writeFile(path.join(packDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(path.join(packDir, 'README.md'), '# Vision Lab Challenge Pack 01\n\n30 synthetic benchmark images: 10 UI screenshots, 10 documents and 10 charts. Each item has one objective question, accepted answers, answer type, provenance and a SHA-256 digest in `manifest.json`.\n\nRun `npm run challenge:install` to add the pack to the local Vision Lab state. The installer is additive and idempotent.\n')
await writeFile(path.join(packDir, 'LICENSE.md'), '# CC0 1.0\n\nThe synthetic assets and benchmark metadata in this directory are dedicated to the public domain under CC0 1.0. No external source images or personal data are included.\n')
console.log(`Generated ${items.length} assets in ${packDir}`)

async function emit(domain, index, row, renderer) {
  const number = String(index + 1).padStart(2, '0')
  const id = `vlcp01-${domain}-${number}`
  const filename = `${id}.png`
  const png = await sharp(Buffer.from(renderer(row, index))).png().toBuffer()
  await writeFile(path.join(imageDir, filename), png)
  const category = domain === 'screenshot' ? 'ui_understanding' : domain === 'document' ? 'document_understanding' : 'chart_table'
  const questionOffset = domain === 'document' ? 2 : domain === 'chart' ? 3 : 2
  return { id, domain, filename: `images/${filename}`, category, question: row[questionOffset], expectedAnswer: row[questionOffset + 1], acceptedAnswers: row[questionOffset + 2], answerType: row[questionOffset + 3], expectedAnswerSource: 'SYNTHETIC_MANIFEST_GROUND_TRUTH', sourceReference: `Generated by scripts/generate-challenge-pack.mjs (${id})`, license: 'CC0-1.0', difficulty: index < 4 ? 'easy' : index < 8 ? 'medium' : 'hard', sha256: createHash('sha256').update(png).digest('hex') }
}

function renderScreenshot([app, message], index) {
  const accents = ['#7c3aed','#2563eb','#0891b2','#059669','#d97706','#dc2626','#4f46e5','#0f766e','#9333ea','#be123c']
  return svg(`<rect width="1200" height="800" fill="#eef2f7"/><rect x="70" y="55" width="1060" height="690" rx="24" fill="white" stroke="#d8dee9" stroke-width="3"/><rect x="70" y="55" width="1060" height="78" rx="24" fill="#172033"/><circle cx="110" cy="94" r="9" fill="#ff6b6b"/><circle cx="140" cy="94" r="9" fill="#ffd43b"/><circle cx="170" cy="94" r="9" fill="#51cf66"/><text x="220" y="105" class="nav">${esc(app)}</text><rect x="125" y="185" width="950" height="390" rx="22" fill="#f8fafc" stroke="#e2e8f0"/><circle cx="600" cy="285" r="58" fill="${accents[index]}22"/><text x="600" y="305" text-anchor="middle" class="icon" fill="${accents[index]}">${index % 2 ? '●' : '!'}</text><text x="600" y="405" text-anchor="middle" class="hero">${esc(message)}</text><text x="600" y="458" text-anchor="middle" class="muted">System notice · VL-${String(index + 1).padStart(3,'0')}</text><rect x="455" y="505" width="290" height="64" rx="14" fill="${accents[index]}"/><text x="600" y="546" text-anchor="middle" class="button">Continue</text><text x="125" y="680" class="muted">Vision Lab synthetic interface fixture</text>`)
}

function renderDocument([title, rows], index) {
  const rowMarkup = rows.map(([key,value], i) => `<rect x="170" y="${285+i*105}" width="860" height="84" rx="8" fill="${i % 2 ? '#f8fafc' : '#eef2ff'}"/><text x="210" y="${338+i*105}" class="label">${esc(key)}</text><text x="985" y="${338+i*105}" text-anchor="end" class="value">${esc(value)}</text>`).join('')
  return svg(`<rect width="1200" height="800" fill="#dfe6ee"/><rect x="110" y="45" width="980" height="710" rx="8" fill="white" stroke="#cbd5e1" stroke-width="2"/><rect x="110" y="45" width="20" height="710" fill="#334155"/><text x="170" y="135" class="docTitle">${esc(title)}</text><text x="170" y="184" class="muted">QVAC Synthetic Records · Document ${String(index + 1).padStart(2,'0')}</text><line x1="170" y1="230" x2="1030" y2="230" stroke="#94a3b8" stroke-width="2"/>${rowMarkup}<text x="170" y="700" class="muted">Synthetic fixture · no personal or external source data</text>`)
}

function renderChart([title, labels, values], index) {
  const max = Math.max(...values, 1)
  const palette = index === 6 ? ['#dc2626','#2563eb','#dc2626','#16a34a','#dc2626'] : ['#2563eb','#7c3aed','#0891b2','#f97316','#16a34a']
  const step = 780 / values.length
  const bars = values.map((value, i) => { const height = index === 6 ? 210 : 300 * value / max; const x = 220 + i * step; return `<rect x="${x}" y="${600-height}" width="${Math.min(110,step-35)}" height="${height}" rx="8" fill="${palette[i]}"/><text x="${x+Math.min(110,step-35)/2}" y="${580-height}" text-anchor="middle" class="chartValue">${value}${index === 5 ? '%' : ''}</text><text x="${x+Math.min(110,step-35)/2}" y="650" text-anchor="middle" class="axis">${esc(labels[i])}</text>` }).join('')
  return svg(`<rect width="1200" height="800" fill="#f1f5f9"/><rect x="75" y="50" width="1050" height="700" rx="22" fill="white" stroke="#dbe3ee" stroke-width="2"/><text x="145" y="130" class="docTitle">${esc(title)}</text><text x="145" y="175" class="muted">Synthetic chart · values shown above bars</text><line x1="155" y1="600" x2="1070" y2="600" stroke="#475569" stroke-width="3"/>${bars}<text x="145" y="710" class="muted">Vision Lab Challenge Pack 01 · Chart ${String(index + 1).padStart(2,'0')}</text>`)
}

function svg(body) { return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><style>.nav{font:600 25px Arial;fill:white}.hero{font:700 42px Arial;fill:#172033}.muted{font:22px Arial;fill:#64748b}.icon{font:700 55px Arial}.button{font:600 22px Arial;fill:white}.docTitle{font:700 40px Arial;fill:#172033}.label{font:600 27px Arial;fill:#475569}.value{font:700 31px Arial;fill:#0f172a}.chartValue{font:700 26px Arial;fill:#172033}.axis{font:600 22px Arial;fill:#475569}</style>${body}</svg>` }
function esc(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') }
