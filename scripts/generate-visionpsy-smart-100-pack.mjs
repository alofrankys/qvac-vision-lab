import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { specs } from './visionpsy-smart-100-spec.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packId = 'visionpsy-smart-100-04'
const packDir = path.join(root, 'packs', packId)
const deterministicDir = path.join(packDir, 'source', 'deterministic')
const generatedDir = path.join(packDir, 'source', 'generated')
const imageDir = path.join(packDir, 'images')
const mode = process.argv.includes('--finalize') ? 'finalize' : 'prepare'
await Promise.all([deterministicDir, generatedDir, imageDir].map(dir => mkdir(dir, { recursive: true })))

for (const spec of specs.filter(item => item.sourceMethod === 'DETERMINISTIC_SVG')) {
  const png = await sharp(Buffer.from(svg(render(spec.render)))).png().toBuffer()
  await writeFile(path.join(deterministicDir, filename(spec.number)), png)
}

const deterministicSpecs = specs.filter(item => item.sourceMethod === 'DETERMINISTIC_SVG')
const deterministicThumbs = await Promise.all(deterministicSpecs.map(async (spec, index) => ({
  input: await sharp(path.join(deterministicDir, filename(spec.number))).resize(180, 120, { fit: 'contain', background: '#ffffff' }).png().toBuffer(),
  left: (index % 7) * 180,
  top: Math.floor(index / 7) * 120
})))
await sharp({ create: { width: 1260, height: 840, channels: 3, background: '#ffffff' } }).composite(deterministicThumbs).png().toFile(path.join(packDir, 'deterministic-contact-sheet.png'))

const generatedSpecs = specs.filter(item => item.sourceMethod === 'IMAGEGEN_CONTROLLED_SCENE')
await writeFile(path.join(packDir, 'imagegen-prompts.json'), `${JSON.stringify(generatedSpecs.map(({ number, family, sceneTruth, imagePrompt }) => ({ number, family, sceneTruth, imagePrompt })), null, 2)}\n`)
await writeFile(path.join(packDir, 'PRE-REGISTRATION.md'), preregistration())

if (mode === 'prepare') {
  console.log(JSON.stringify({ packId, preregistered: specs.length, deterministic: specs.length - generatedSpecs.length, imagegen: generatedSpecs.length, status: 'NO_INFERENCE_RUN' }, null, 2))
  process.exit(0)
}

const items = []
for (const spec of specs) {
  const sourceDir = spec.sourceMethod === 'IMAGEGEN_CONTROLLED_SCENE' ? generatedDir : deterministicDir
  const sourcePath = path.join(sourceDir, filename(spec.number))
  const bytes = await readFile(sourcePath)
  await writeFile(path.join(imageDir, filename(spec.number)), bytes)
  items.push({
    id: `smart100-${pad(spec.number)}`,
    filename: `images/${filename(spec.number)}`,
    category: spec.category,
    claimFamily: spec.family,
    question: spec.question,
    expectedAnswer: spec.expectedAnswer,
    acceptedAnswers: spec.acceptedAnswers,
    answerType: spec.answerType,
    expectedAnswerSource: 'PRE_REGISTERED_CONTROLLED_SCENE_VISUALLY_VERIFIED',
    sourceMethod: spec.sourceMethod,
    sourceReference: `PRE-REGISTRATION.md case ${spec.number}: ${spec.sceneTruth}`,
    difficulty: 'claim-matched-smart',
    license: 'PROJECT_GENERATED',
    sha256: createHash('sha256').update(bytes).digest('hex')
  })
}

const thumbs = await Promise.all(items.map(async (entry, index) => ({
  input: await sharp(path.join(packDir, entry.filename)).resize(160, 110, { fit: 'contain', background: '#ffffff' }).png().toBuffer(),
  left: (index % 10) * 160,
  top: Math.floor(index / 10) * 110
})))
await sharp({ create: { width: 1600, height: 1100, channels: 3, background: '#ffffff' } }).composite(thumbs).png().toFile(path.join(packDir, 'full-contact-sheet.png'))

const categoryMinimums = Object.fromEntries([...new Set(specs.map(item => item.category))].map(category => [category, specs.filter(item => item.category === category).length]))
const manifest = {
  schemaVersion: 1,
  id: packId,
  name: 'VisionPsy Smart 100 — Claim-Matched 04',
  version: '1.0.0',
  description: 'One hundred pre-registered, unique controlled images spanning the six benchmark families highlighted in the VisionPsy evaluation.',
  generatedAt: new Date().toISOString(),
  license: 'PROJECT_GENERATED',
  rankingPolicy: { minQuestions: 100, minUniqueImages: 100, requireExpectedAnswers: true, categoryMinimums },
  items
}
await writeFile(path.join(packDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ packId, items: items.length, uniqueHashes: new Set(items.map(item => item.sha256)).size, generated: generatedSpecs.length, deterministic: items.length - generatedSpecs.length, categoryMinimums }, null, 2))

function filename(number) { return `smart100-${pad(number)}.png` }
function pad(number) { return String(number).padStart(3, '0') }
function esc(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') }
function t(x, y, value, cls = 'label', extra = '') { return `<text x="${x}" y="${y}" class="${cls}" ${extra}>${esc(value)}</text>` }
function rect(x, y, w, h, fill, extra = '') { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>` }
function circle(x, y, r, fill, extra = '') { return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>` }
function line(x1, y1, x2, y2, color = '#334155', width = 16, extra = '') { return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>` }
function base(body, background = '#f8fafc') { return `${rect(0, 0, 1200, 800, background)}${body}` }

function render(kind) {
  switch (kind) {
    case 'conduction': return base(`${circle(310,330,120,'#94a3b8','stroke="#334155" stroke-width="10"')}${rect(300,430,20,260,'#64748b')}${rect(255,275,110,105,'#dbeafe','rx="18" stroke="#38bdf8" stroke-width="8"')}${circle(890,330,120,'#a16207','stroke="#713f12" stroke-width="10"')}${rect(880,430,20,260,'#a16207')}${rect(835,275,110,105,'#dbeafe','rx="18" stroke="#38bdf8" stroke-width="8"')}${t(310,735,'METAL','label','text-anchor="middle"')}${t(890,735,'WOOD','label','text-anchor="middle"')}`, '#e0f2fe')
    case 'plant': return base(`${rect(790,80,330,500,'#dbeafe','rx="14" stroke="#475569" stroke-width="14"')}${circle(1030,165,62,'#fde047')}${line(420,650,790,300,'#166534',32,'stroke-linecap="round"')}${circle(610,470,80,'#22c55e')}${circle(730,360,75,'#16a34a')}${rect(300,650,280,120,'#b45309')}`)
    case 'short_shadow': return base(`${rect(0,540,1200,260,'#84b85b')}${circle(600,95,68,'#fde047')}${rect(580,320,42,260,'#78350f')}${circle(600,280,160,'#15803d')}${line(620,580,790,630,'#475569',34,'opacity=".55"')}`, '#8ed0ff')
    case 'evaporation': return base(`${rect(0,610,1200,190,'#64748b')}<path d="M370 600 Q330 350 440 250 H760 Q850 360 810 600Z" fill="#94a3b8" stroke="#334155" stroke-width="15"/><path d="M470 220 Q410 120 500 50 M600 220 Q540 110 630 45 M720 220 Q670 115 760 65" fill="none" stroke="#bfdbfe" stroke-width="34" stroke-linecap="round"/>`)
    case 'food_chain': return base(`${food(50,'GRASS','#16a34a')}${arrow(255,400,330,400)}${food(345,'GRASSHOPPER','#ca8a04')}${arrow(550,400,625,400)}${food(640,'FROG','#22c55e')}${arrow(845,400,920,400)}${food(935,'HAWK','#dc2626')}`, '#f7fee7')
    case 'lever': return base(`${rect(220,540,300,160,'#a16207')}${circle(650,590,70,'#f59e0b')}<path d="M430 520 L1050 300" stroke="#475569" stroke-width="42"/><path d="M970 210 v150" stroke="#dc2626" stroke-width="25" marker-end="url(#arrow)"/>${t(950,180,'PRESS','small','text-anchor="middle"')}`, '#fff7ed')
    case 'magnet': return base(`<path d="M160 250 v250 q0 170 170 170 q170 0 170-170 v-250 h-110 v250 q0 60-60 60 q-60 0-60-60 v-250z" fill="#dc2626"/><g>${sample(650,210,'PLASTIC','#e879f9')}${sample(930,210,'IRON NAIL','#64748b',true)}${sample(650,500,'WOOD','#a16207')}${sample(930,500,'GLASS','#7dd3fc')}</g>`, '#f1f5f9')
    case 'erosion': return base(`<path d="M0 520 Q300 390 520 500 Q760 630 1200 430 V800 H0Z" fill="#a16207"/><path d="M0 510 Q300 420 520 520 Q760 650 1200 450" fill="none" stroke="#38bdf8" stroke-width="80"/>${circle(155,150,70,'#94a3b8')}${circle(1040,210,95,'#22c55e')}`, '#dbeafe')
    case 'melting': return base(`${circle(600,115,70,'#fde047')}${rect(480,335,240,220,'#dbeafe','rx="28" stroke="#38bdf8" stroke-width="10"')}${t(600,465,'ICE','label','text-anchor="middle"')}${circle(600,610,190,'#7dd3fc','opacity=".55"')}`, '#fff7ed')
    case 'gears': return base(`${circle(410,400,230,'#64748b','stroke="#334155" stroke-width="35" stroke-dasharray="55 25"')}${circle(800,400,115,'#f59e0b','stroke="#92400e" stroke-width="28" stroke-dasharray="35 18"')}${circle(410,400,55,'#f8fafc')}${circle(800,400,35,'#f8fafc')}`, '#eef2ff')
    case 'lens': return base(`${line(90,250,500,250,'#dc2626',12)}${line(90,400,500,400,'#dc2626',12)}${line(90,550,500,550,'#dc2626',12)}<path d="M560 100 Q700 400 560 700 Q830 400 560 100Z" fill="#bae6fd" stroke="#0284c7" stroke-width="12"/>${line(700,250,1010,400,'#dc2626',12)}${line(700,400,1010,400,'#dc2626',12)}${line(700,550,1010,400,'#dc2626',12)}${circle(1010,400,18,'#fde047')}`)
    case 'long_shadow': return base(`${rect(0,560,1200,240,'#84b85b')}${circle(110,390,70,'#fde047')}${rect(820,330,40,260,'#78350f')}${circle(840,280,150,'#15803d')}${line(820,590,180,690,'#475569',44,'opacity=".55"')}`, '#93c5fd')
    case 'insulation': return base(`${bottle(150,'ALUMINUM','#94a3b8')}${bottle(420,'WOOL','#f59e0b')}${bottle(690,'WET PAPER','#60a5fa')}${bottle(960,'BARE','#e2e8f0')}`, '#fff7ed')
    case 'balance': return base(`${line(600,160,600,650,'#334155',24)}${line(250,320,950,420,'#334155',20)}<path d="M180 320 h250 l-40 150 h-170z" fill="#e2e8f0" stroke="#475569" stroke-width="10"/><path d="M820 420 h250 l-40 150 h-170z" fill="#e2e8f0" stroke="#475569" stroke-width="10"/>${rect(260,230,90,90,'#dc2626')}${circle(945,345,50,'#2563eb')}${rect(430,650,340,35,'#334155')}`)
    case 'waves': return base(`${t(90,250,'A','label')}<path d="M180 220 Q300 80 420 220 T660 220 T900 220 T1140 220" fill="none" stroke="#2563eb" stroke-width="18"/>${t(90,590,'B','label')}<path d="M180 560 Q240 450 300 560 T420 560 T540 560 T660 560 T780 560 T900 560 T1020 560 T1140 560" fill="none" stroke="#dc2626" stroke-width="18"/>`)
    case 'solar': return base(`${circle(180,130,70,'#fde047')}${panel(160,340,-16)}${panel(470,330,16)}${panel(780,330,75)}${rect(1000,250,170,300,'#475569')}`, '#dbeafe')
    case 'seedlings': return base(`${pot(130,90,'NO WATER',80)}${pot(410,180,'WATER + LIGHT',260)}${pot(690,100,'DARK ONLY',120)}${pot(970,70,'SALT WATER',55)}`, '#ecfccb')
    case 'water_cycle': return base(`${circle(160,120,65,'#fde047')}${rect(0,610,1200,190,'#38bdf8')}<path d="M570 190 q70-130 150 0 q120-60 160 45 q100 10 80 100 H490 q-30-100 80-145Z" fill="#e2e8f0"/>${arrow(330,600,520,310)}${arrow(790,340,920,590)}${t(390,420,'VAPOR','small')}`, '#bfdbfe')
    case 'pulley': return base(`${t(250,90,'A','label','text-anchor="middle"')}${circle(250,240,80,'#94a3b8','stroke="#334155" stroke-width="12"')}${line(250,320,250,590)}${rect(170,590,160,120,'#dc2626')}${t(850,90,'B','label','text-anchor="middle"')}${circle(850,210,70,'#94a3b8','stroke="#334155" stroke-width="12"')}${circle(850,430,70,'#94a3b8','stroke="#334155" stroke-width="12"')}<path d="M700 700 V210 Q850 80 1000 210 V700" fill="none" stroke="#334155" stroke-width="18"/>${rect(770,520,160,120,'#2563eb')}`)
    case 'batteries': return base(`${circuit(80,1,'A')}${circuit(650,2,'B')}`, '#fefce8')
    case 'shape_row': return base(`<polygon points="220,590 350,230 480,590" fill="#ef4444"/>${circle(650,410,150,'#3b82f6')}${rect(900,260,290,290,'#22c55e')}`)
    case 'door_light': return base(`${rect(160,120,410,570,'#111827','stroke="#475569" stroke-width="18"')}<polygon points="165,125 460,205 460,650 165,685" fill="#a16207" stroke="#713f12" stroke-width="14"/>${circle(425,425,18,'#fde047')}${circle(880,170,95,'#cbd5e1','stroke="#475569" stroke-width="12"')}${t(880,370,'LIGHT OFF','label','text-anchor="middle"')}`, '#e2e8f0')
    case 'grid': return base(`${grid()}${circle(675,400,70,'#dc2626')}`, '#f8fafc')
    case 'two_colors': return base(`${rect(180,180,360,440,'#2563eb','rx="35"')}${rect(660,180,360,440,'#f97316','rx="35"')}`)
    case 'level_card': return base(`${rect(230,200,740,400,'#1e293b','rx="45" stroke="#94a3b8" stroke-width="12"')}${t(600,445,'LEVEL','ocr','text-anchor="middle"')}`, '#e2e8f0')
    case 'sku_table': return base(`${rect(150,130,900,540,'#ffffff','stroke="#334155" stroke-width="12"')}${line(150,280,1050,280)}${line(600,130,600,670)}${t(375,225,'SKU','label','text-anchor="middle"')}${t(825,225,'QTY','label','text-anchor="middle"')}${t(375,480,'R4-18','ocrDark','text-anchor="middle"')}${t(825,480,'7','ocrDark','text-anchor="middle"')}`)
    case 'abc_cards': return base(`${card(150,'A','#dc2626')}${card(475,'B','#2563eb')}${card(800,'C','#16a34a')}`)
    case 'fruit_count': return base(`${[0,1,2,3].map(i=>circle(270+i*180,280,62,'#dc2626')).join('')}${[0,1,2].map(i=>circle(360+i*220,520,70,'#f97316')).join('')}`, '#fff7ed')
    case 'status_panel': return base(`${rect(210,190,780,420,'#0f172a','rx="40" stroke="#64748b" stroke-width="14"')}${circle(305,400,48,'#22c55e')}${t(645,430,'STATUS READY','label','text-anchor="middle" style="fill:#f8fafc"')}`, '#cbd5e1')
    case 'cup_plate': return base(`${circle(400,430,170,'#e5e7eb','stroke="#64748b" stroke-width="10"')}${rect(760,330,190,210,'#16a34a','rx="22"')}`)
    case 'book_box': return base(`${rect(350,170,500,180,'#f97316','rx="20"')}${rect(410,430,380,230,'#7e22ce','rx="20"')}`)
    case 'bag_stool': return base(`${rect(280,220,640,100,'#a16207','rx="18"')}${rect(330,320,30,330,'#713f12')}${rect(840,320,30,330,'#713f12')}${rect(485,420,230,220,'#111827','rx="28"')}`)
    case 'lamp_sofa': return base(`${rect(130,160,220,130,'#fde047','rx="28"')}${line(240,290,240,650,'#475569',24)}${rect(510,330,560,300,'#2563eb','rx="55"')}`)
    case 'ball_basket': return base(`<path d="M360 300 H840 L760 680 H440Z" fill="#d6a85f" stroke="#7c4a12" stroke-width="18"/>${circle(600,475,120,'#dc2626')}`)
    case 'spoon_fork': return base(`${line(300,210,900,210,'#64748b',30)}${[340,380,420,460].map(x=>line(x,140,x,240,'#64748b',16)).join('')}${line(300,560,900,560,'#94a3b8',34)}${circle(270,560,80,'#94a3b8')}`)
    case 'triangle_circle': return base(`${circle(350,410,160,'#2563eb')}<polygon points="750,590 920,230 1090,590" fill="#dc2626"/>`)
    case 'key_between': return base(`${rect(100,280,300,250,'#78350f','rx="24"')}${circle(600,400,70,'none','stroke="#f59e0b" stroke-width="28"')}${line(665,400,800,400,'#f59e0b',28)}${rect(850,240,230,330,'#1e293b','rx="24"')}`)
    case 'cat_chair': return base(`${rect(380,180,440,120,'#a16207')}${rect(410,300,35,340,'#713f12')}${rect(755,300,35,340,'#713f12')}${circle(600,500,110,'#f59e0b')}${t(600,525,'CAT','small','text-anchor="middle"')}`)
    case 'cup_sink': return base(`${rect(360,230,520,330,'#cbd5e1','rx="40" stroke="#64748b" stroke-width="14"')}${rect(140,350,150,190,'#0ea5e9','rx="20"')}`)
    case 'ocr_curved': return base(`<path d="M130 620 Q600 80 1070 620 L980 710 Q600 300 220 710Z" fill="#1e3a5f" stroke="#e5e7eb" stroke-width="18"/>${curvedLetters('BRAVO 19')}`, '#c49a6c')
    case 'ocr_tag': return base(`<g transform="translate(600 400) rotate(17)">${rect(-390,-145,780,290,'#a1a1aa','rx="30" stroke="#27272a" stroke-width="18"')}${t(0,40,'M7-Q82','ocrDark','text-anchor="middle"')}</g>`, '#3f3f46')
    case 'ocr_vertical': return base(`${rect(450,40,300,720,'#14532d','stroke="#f0fdf4" stroke-width="14"')}${['M','A','P','L','E'].map((c,i)=>t(600,170+i*125,c,'ocr','text-anchor="middle"')).join('')}`, '#d1d5db')
    case 'ocr_low': return base(`${rect(150,245,900,310,'#8ca1aa','rx="28" stroke="#71858d" stroke-width="16"')}${t(600,445,'EAST 43','ocrLow','text-anchor="middle"')}`, '#9badb5')
    case 'ocr_mirror': return base(`${rect(160,210,880,380,'#0f172a','rx="20"')}${t(600,450,'CARGO 61','ocr','text-anchor="middle" transform="translate(1200 0) scale(-1 1)"')}`, '#94a3b8')
    case 'ocr_perspective': return base(`<polygon points="260,180 1030,270 900,650 180,560" fill="#facc15" stroke="#713f12" stroke-width="18"/>${t(590,455,'AB-904','ocrDark','text-anchor="middle" transform="rotate(7 590 455)"')}`, '#334155')
    case 'ocr_receipt': return base(`${rect(350,65,500,670,'#fafaf9','stroke="#a8a29e" stroke-width="8"')}${t(600,185,'RECEIPT','small','text-anchor="middle"')}${line(420,250,780,250,'#a8a29e',6)}${t(430,350,'TOTAL','small')}${t(770,350,'18.70','ocrDark','text-anchor="end"')}${line(420,420,780,420,'#a8a29e',6)}`, '#57534e')
    case 'ocr_circle': return base(`${circle(600,400,260,'#1d4ed8','stroke="#dbeafe" stroke-width="22"')}${t(600,450,'ORBIT 52','ocr','text-anchor="middle"')}`, '#bfdbfe')
    case 'ocr_occluded': return base(`${rect(190,240,820,330,'#d6d3d1','rx="25" stroke="#44403c" stroke-width="14"')}${t(600,445,'ZX-318','ocrDark','text-anchor="middle"')}${rect(535,210,90,410,'#78716c','opacity=".32" transform="rotate(12 580 415)"')}`, '#292524')
    case 'ocr_neon': return base(`<g transform="rotate(-12 600 400)">${rect(180,200,840,400,'#111827','rx="45"')}${t(600,455,'LUNA 24','neon','text-anchor="middle"')}</g>`, '#020617')
    default: throw new Error(`Unknown deterministic render: ${kind}`)
  }
}

function food(x, label, color) { return `${rect(x,280,210,240,'#ffffff','rx="24" stroke="#cbd5e1" stroke-width="8"')}${circle(x+105,375,65,color)}${t(x+105,480,label,'tiny','text-anchor="middle"')}` }
function arrow(x1,y1,x2,y2) { return line(x1,y1,x2,y2,'#334155',14,'marker-end="url(#arrow)"') }
function sample(x,y,label,color,nail=false) { return `${nail?line(x-60,y,x+60,y,'#475569',20):circle(x,y,65,color)}${t(x,y+120,label,'tiny','text-anchor="middle"')}` }
function bottle(x,label,color) { return `${rect(x,260,150,330,color,'rx="25" stroke="#475569" stroke-width="8"')}${rect(x+45,200,60,70,'#475569')}${t(x+75,665,label,'tiny','text-anchor="middle"')}` }
function panel(x,y,angle) { return `<g transform="translate(${x} ${y}) rotate(${angle})">${rect(0,0,260,180,'#1e3a8a','stroke="#60a5fa" stroke-width="10"')}${line(87,0,87,180,'#60a5fa',6)}${line(174,0,174,180,'#60a5fa',6)}${line(0,90,260,90,'#60a5fa',6)}</g>` }
function pot(x,height,label,growth) { return `${rect(x,500,170,170,'#b45309')}${line(x+85,500,x+85,500-growth,'#166534',18)}${circle(x+50,500-growth,45,'#22c55e')}${circle(x+120,500-growth-30,45,'#16a34a')}${t(x+85,735,label,'tiny','text-anchor="middle"')}` }
function circuit(x,batteries,label) { return `<g transform="translate(${x} 0)">${t(230,120,label,'label','text-anchor="middle"')}${rect(20,220,450,400,'none','stroke="#334155" stroke-width="18"')}${circle(420,420,70,'#fde047','stroke="#334155" stroke-width="12"')}${Array.from({length:batteries},(_,i)=>`<g transform="translate(${100+i*90} 405)">${line(0,-55,0,55,'#334155',10)}${line(35,-80,35,80,'#334155',20)}</g>`).join('')}</g>` }
function grid() { return `${rect(300,140,600,520,'#ffffff','stroke="#334155" stroke-width="10"')}${[1,2].map(i=>line(300,140+i*173,900,140+i*173,'#94a3b8',8)).join('')}${[1,2,3].map(i=>line(300+i*150,140,300+i*150,660,'#94a3b8',8)).join('')}${[1,2,3].map((n,i)=>t(225,250+i*173,String(n),'small','text-anchor="middle"')).join('')}${[1,2,3,4].map((n,i)=>t(375+i*150,100,String(n),'small','text-anchor="middle"')).join('')}` }
function card(x,label,color) { return `${rect(x,220,250,380,color,'rx="35"')}${t(x+125,455,label,'ocr','text-anchor="middle"')}` }
function curvedLetters(value) { const chars=[...value]; return chars.map((char,i)=>{const x=300+i*85; const y=450-Math.round(125*Math.sin((i/(chars.length-1))*Math.PI)); const a=-25+i*7; return t(x,y,char,'ocr','text-anchor="middle" transform="rotate('+a+' '+x+' '+y+')"')}).join('') }

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#334155"/></marker></defs><style>.label{font:700 42px Arial,sans-serif;fill:#0f172a}.small{font:700 30px Arial,sans-serif;fill:#0f172a}.tiny{font:700 22px Arial,sans-serif;fill:#0f172a}.ocr{font:800 92px Arial,sans-serif;fill:#f8fafc;letter-spacing:7px}.ocrDark{font:800 96px Arial,sans-serif;fill:#27272a;letter-spacing:7px}.ocrLow{font:800 94px Arial,sans-serif;fill:#a9bac1;letter-spacing:7px}.neon{font:800 104px Arial,sans-serif;fill:#f0abfc;stroke:#c026d3;stroke-width:4;letter-spacing:9px}</style>${body}</svg>`
}

function preregistration() {
  const counts = Object.fromEntries([...new Set(specs.map(item => item.family))].map(family => [family, specs.filter(item => item.family === family).length]))
  const rows = specs.map(spec => `| ${spec.number} | ${spec.family} | ${spec.sourceMethod === 'IMAGEGEN_CONTROLLED_SCENE' ? 'foto controllata' : 'diagramma controllato'} | ${spec.question.replaceAll('\n', '<br>')} | ${String(spec.expectedAnswer).replaceAll('\n', '\\n').replaceAll('|', '\\|')} | ${spec.sceneTruth} |`).join('\n')
  return `# VisionPsy Smart 100 — preregistrazione\n\nData: 2026-08-20. Stato iniziale: **nessuna inferenza eseguita**.\n\n## Regole bloccate\n\n- 100 immagini uniche e 100 domande, una domanda per immagine.\n- Stessi file, prompt, token budget e quantizzazione Q8_0 per VisionPsy, LFM2.5-VL e SmolVLM2.\n- Nessun caso può essere modificato dopo l’avvio dell’inferenza. Prima dell’avvio una scena generata può essere rigenerata solo se il controllo visivo rileva che non rispetta la verità dichiarata.\n- ScienceQA e MMStar: scelta multipla in formato VLMEvalKit; POPE e MME: prima risposta sì/no; OCR: trascrizione completa normalizzata; MM-IFEval: tutti i vincoli devono essere rispettati.\n- POPE è bilanciato: 10 presenze e 10 assenze.\n\n## Distribuzione\n\n${Object.entries(counts).map(([family,count])=>`- ${family}: ${count}`).join('\n')}\n\n## Casi preregistrati\n\n| # | Famiglia | Asset | Domanda | Gold | Verità visiva |\n|---:|---|---|---|---|---|\n${rows}\n`
}
