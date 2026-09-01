import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packId = process.argv[2] || process.env.VISIONPSY_CLAIM_PACK_ID || 'visionpsy-claim-challenge-01'
const packNumber = packId.endsWith('-02') ? '02' : '01'
const packDir = path.join(root, 'packs', packId)
const deterministicDir = path.join(packDir, 'source', 'deterministic')
const generatedDir = path.join(packDir, 'source', 'generated')
const imageDir = path.join(packDir, 'images')

await Promise.all([
  mkdir(deterministicDir, { recursive: true }),
  mkdir(generatedDir, { recursive: true }),
  mkdir(imageDir, { recursive: true })
])

const deterministic = new Map([
  [1, foodChain()], [2, waterCycle()], [3, circuits()], [4, plantCell()], [5, forces()],
  [6, redShape()], [7, apples()], [8, clock()], [9, catDog()], [10, swatches()],
  [16, leftRight()], [17, aboveBelow()], [18, between()], [19, insideOutside()], [20, grid()],
  [21, curvedOcr()], [22, verticalOcr()], [23, rotatedOcr()], [24, wavyOcr()], [25, perspectiveOcr()]
])

for (const [number, markup] of deterministic) {
  const filename = `claim-${String(number).padStart(2, '0')}.png`
  const png = await sharp(Buffer.from(svg(markup))).png().toBuffer()
  await writeFile(path.join(deterministicDir, filename), png)
}

const deterministicThumbs = await Promise.all([...deterministic.keys()].map(async (number, index) => ({
  input: await sharp(path.join(deterministicDir, `claim-${String(number).padStart(2, '0')}.png`)).resize(240, 160, { fit: 'contain', background: '#ffffff' }).png().toBuffer(),
  left: (index % 5) * 240,
  top: Math.floor(index / 5) * 160
})))
await sharp({ create: { width: 1200, height: 640, channels: 3, background: '#ffffff' } })
  .composite(deterministicThumbs)
  .png()
  .toFile(path.join(packDir, 'deterministic-contact-sheet.png'))

const specs = [
  spec(1, 'chart_table', 'science-diagram', 'In this food chain, which organism is the primary consumer?', 'rabbit', ['the rabbit'], 'exact_text', 'A controlled food-chain diagram: grass → rabbit → fox.'),
  spec(2, 'chart_table', 'science-diagram', 'Which process is represented by the upward arrow marked B?', 'evaporation', ['water evaporation'], 'exact_text', 'A controlled water-cycle diagram with B rising from the lake.'),
  spec(3, 'chart_table', 'science-diagram', 'Which bulb will light: A or B? Answer with the letter only.', 'B', ['b'], 'exact_text', 'Circuit A is open; circuit B is closed.'),
  spec(4, 'chart_table', 'science-diagram', 'Which label points to the nucleus? Answer with the letter only.', 'A', ['a'], 'exact_text', 'Label A points to the purple nucleus.'),
  spec(5, 'chart_table', 'science-diagram', 'What is the direction of the net force?', 'right', ['to the right'], 'exact_text', 'A 35 N rightward force exceeds a 20 N leftward force.'),

  spec(6, 'ui_understanding', 'instruction-following', 'Answer with exactly one lowercase word: which shape is red?', 'triangle', [], 'exact_text', 'The only red shape is a triangle.'),
  spec(7, 'ui_understanding', 'instruction-following', 'Return JSON only, exactly in the form {"count":N}. How many apples are shown?', '{"count":2}', [], 'exact_text', 'Exactly two apples are shown.'),
  spec(8, 'ui_understanding', 'instruction-following', 'Answer with exactly two digits only: what hour does the clock show?', '03', [], 'exact_text', 'The clock shows three o’clock.'),
  spec(9, 'ui_understanding', 'instruction-following', 'Return the two animals from left to right as lowercase CSV with no spaces.', 'cat,dog', [], 'exact_text', 'A cat is on the left and a dog is on the right.'),
  spec(10, 'ui_understanding', 'instruction-following', 'Which labeled swatch is green? Answer with one uppercase letter only.', 'C', [], 'exact_text', 'Swatch C is green.'),

  photoSpec(11, 'object_recognition', 'hallucination-resistance', 'Is there a banana in this image? Answer yes or no only.', 'no', ['No'], 'boolean', 'Breakfast contains cereal, toast and orange juice; no banana.', 'Photoreal breakfast table; cereal, toast and orange juice; explicitly no banana.'),
  photoSpec(12, 'object_recognition', 'hallucination-resistance', 'Is there a smartphone on the desk? Answer yes or no only.', 'no', ['No'], 'boolean', 'Desk contains laptop, mug, notebook, pencil and lamp; no smartphone.', 'Photoreal office desk; explicitly no smartphone or tablet.'),
  photoSpec(13, 'object_recognition', 'hallucination-resistance', 'Is the dog wearing a leash? Answer yes or no only.', 'no', ['No'], 'boolean', 'The dog wears a blue collar but no leash.', 'Photoreal brown dog with blue collar and red ball; explicitly no leash.'),
  photoSpec(14, 'object_recognition', 'hallucination-resistance', 'Is there a microwave in this image? Answer yes or no only.', 'no', ['No'], 'boolean', 'Kitchen contains kettle, toaster, apples and boards; no microwave.', 'Photoreal kitchen counter; explicitly no microwave.'),
  photoSpec(15, 'object_recognition', 'hallucination-resistance', 'Is there a tower crane in this image? Answer yes or no only.', 'no', ['No'], 'boolean', 'Construction site contains an excavator and scaffolding; no tower crane.', 'Photoreal construction site; explicitly no tower crane.'),

  spec(16, 'spatial_relation', 'spatial-position', 'Which object is to the left of the blue circle?', 'red square', ['the red square'], 'exact_text', 'A red square is left of a blue circle.'),
  spec(17, 'spatial_relation', 'spatial-position', 'Which object is below the yellow star?', 'green triangle', ['the green triangle'], 'exact_text', 'A green triangle is below a yellow star.'),
  spec(18, 'spatial_relation', 'spatial-position', 'Which object is between the book and the vase?', 'cup', ['the cup'], 'exact_text', 'A cup is between a book and a vase.'),
  spec(19, 'spatial_relation', 'spatial-position', 'Where is the dog relative to the box?', 'outside', ['outside the box'], 'exact_text', 'The cat is inside the box and the dog is outside it.'),
  spec(20, 'spatial_relation', 'spatial-position', 'Which object is in the lower-right cell?', 'orange key', ['key', 'the orange key'], 'exact_text', 'An orange key occupies the lower-right cell of a 2×2 grid.'),

  spec(21, 'visual_text', 'irregular-ocr', 'Transcribe the curved text exactly.', 'NOVA 731', [], 'exact_text', 'The curved text reads NOVA 731.'),
  spec(22, 'visual_text', 'irregular-ocr', 'Read the vertical word from top to bottom.', 'CEDAR', [], 'exact_text', 'The vertical word reads CEDAR.'),
  spec(23, 'visual_text', 'irregular-ocr', 'Transcribe the rotated label exactly.', 'K7M4', [], 'exact_text', 'The rotated label reads K7M4.'),
  spec(24, 'visual_text', 'irregular-ocr', 'Transcribe the wavy text exactly.', 'BLUE HARBOR', [], 'exact_text', 'The wavy text reads BLUE HARBOR.'),
  spec(25, 'visual_text', 'irregular-ocr', 'Transcribe the text on the perspective sign exactly.', 'RIVER 29', [], 'exact_text', 'The perspective sign reads RIVER 29.'),

  photoSpec(26, 'physical_context', 'cluttered-localization', 'In which image quadrant is the yellow tape measure?', 'upper left', ['upper-left', 'top left'], 'exact_text', 'The yellow tape measure is in the upper-left quadrant.', 'Busy workbench; one yellow tape measure upper-left and one red screwdriver lower-right.'),
  photoSpec(27, 'physical_context', 'cluttered-localization', 'Where is the purple carton: top, middle, or bottom; and left, center, or right?', 'bottom center', ['bottom-center', 'bottom middle'], 'exact_text', 'The purple carton is at the bottom-center.', 'Crowded grocery shelf; one purple carton at bottom-center.'),
  photoSpec(28, 'physical_context', 'cluttered-localization', 'Which object is in the lower-right corner?', 'green backpack', ['backpack', 'the green backpack'], 'exact_text', 'A green backpack is in the lower-right corner.', 'Cluttered bedroom; one green backpack in lower-right corner.'),
  photoSpec(29, 'physical_context', 'cluttered-localization', 'In which image quadrant is the blue umbrella?', 'upper right', ['upper-right', 'top right'], 'exact_text', 'The blue umbrella is in the upper-right quadrant.', 'Busy street market; one blue umbrella in upper-right quadrant.'),
  photoSpec(30, 'physical_context', 'cluttered-localization', 'Where is the red kitchen timer relative to the sink?', 'left of the sink', ['to the left of the sink', 'left'], 'exact_text', 'The red timer is left of the sink.', 'Busy kitchen counter; one red timer to the left of the sink.')
]

const items = []
for (const item of specs) {
  const sourceDir = item.sourceMethod === 'IMAGEGEN_CONTROLLED_SCENE' ? generatedDir : deterministicDir
  const filename = `claim-${String(item.number).padStart(2, '0')}.png`
  const bytes = await readFile(path.join(sourceDir, filename))
  await writeFile(path.join(imageDir, filename), bytes)
  items.push({
    id: `vpsy-claim-${String(item.number).padStart(2, '0')}`,
    filename: `images/${filename}`,
    category: item.category,
    claimArea: item.claimArea,
    question: item.question,
    expectedAnswer: item.expectedAnswer,
    acceptedAnswers: item.acceptedAnswers,
    answerType: item.answerType,
    expectedAnswerSource: 'CONTROLLED_SCENE_SPEC_VISUALLY_VERIFIED',
    sourceMethod: item.sourceMethod,
    sourceReference: item.sourceReference,
    license: 'PROJECT_GENERATED',
    difficulty: item.number % 5 < 2 ? 'hard' : 'medium',
    sha256: createHash('sha256').update(bytes).digest('hex')
  })
}

const manifest = {
  schemaVersion: 1,
  id: packId,
  name: `VisionPsy Public Claims Challenge ${packNumber}`,
  version: '1.0.0-draft',
  description: 'Thirty controlled cases targeting six capabilities highlighted in VisionPsy-Nano public benchmark claims.',
  generatedAt: new Date().toISOString(),
  license: 'PROJECT_GENERATED',
  rankingPolicy: {
    minQuestions: 30,
    minUniqueImages: 30,
    requireExpectedAnswers: true,
    categoryMinimums: {
      chart_table: 5,
      ui_understanding: 5,
      object_recognition: 5,
      spatial_relation: 5,
      visual_text: 5,
      physical_context: 5
    }
  },
  items
}

await writeFile(path.join(packDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(path.join(packDir, 'README.md'), `# VisionPsy Public Claims Challenge ${packNumber}\n\n30 controlled images across six claim-aligned areas: science diagrams, instruction following, hallucination resistance, spatial position, irregular OCR, and localization in clutter.\n\nTwenty images are deterministic SVG fixtures rendered to PNG. Ten photorealistic scenes were generated with the built-in OpenAI image-generation tool and visually checked against the negative/presence constraints. All ground truth is explicit in manifest.json.\n`)
console.log(`Generated manifest and ${items.length} benchmark assets in ${packDir}`)

function spec(number, category, claimArea, question, expectedAnswer, acceptedAnswers, answerType, sourceReference) {
  return { number, category, claimArea, question, expectedAnswer, acceptedAnswers, answerType, sourceReference, sourceMethod: 'DETERMINISTIC_SVG' }
}

function photoSpec(number, category, claimArea, question, expectedAnswer, acceptedAnswers, answerType, sourceReference, generationPrompt) {
  return { number, category, claimArea, question, expectedAnswer, acceptedAnswers, answerType, sourceReference: `${sourceReference} Generation constraint: ${generationPrompt}`, sourceMethod: 'IMAGEGEN_CONTROLLED_SCENE' }
}

function foodChain() { return board('SCIENCE DIAGRAM', `<g transform="translate(105 230)"><rect width="255" height="260" rx="32" fill="#dcfce7"/><text x="128" y="105" class="emoji">🌿</text><text x="128" y="205" class="label" text-anchor="middle">GRASS</text></g><g transform="translate(475 230)"><rect width="255" height="260" rx="32" fill="#fef3c7"/><text x="128" y="105" class="emoji">🐇</text><text x="128" y="205" class="label" text-anchor="middle">RABBIT</text></g><g transform="translate(845 230)"><rect width="255" height="260" rx="32" fill="#fee2e2"/><text x="128" y="105" class="emoji">🦊</text><text x="128" y="205" class="label" text-anchor="middle">FOX</text></g>${arrow(370,360,455,360)}${arrow(740,360,825,360)}<text x="600" y="590" class="small" text-anchor="middle">Arrows show energy flow</text>`)}
function waterCycle() { return board('WATER CYCLE', `<rect x="90" y="570" width="1020" height="115" rx="50" fill="#38bdf8"/><path d="M105 570 Q260 505 420 570 T735 570 T1095 570" fill="#7dd3fc"/><ellipse cx="560" cy="190" rx="180" ry="72" fill="#e2e8f0"/><ellipse cx="710" cy="200" rx="170" ry="66" fill="#e2e8f0"/><circle cx="205" cy="195" r="75" fill="#facc15"/><path d="M340 555 C330 450 380 350 500 280" fill="none" stroke="#ef4444" stroke-width="18" marker-end="url(#arrow)"/><text x="350" y="405" class="big">B</text><path d="M725 280 C850 340 900 430 870 540" fill="none" stroke="#2563eb" stroke-width="18" marker-end="url(#arrow)"/><text x="875" y="410" class="big">D</text><text x="600" y="725" class="small" text-anchor="middle">LAKE</text>`)}
function circuits() { return board('TWO ELECTRIC CIRCUITS', `<g transform="translate(85 190)"><rect width="455" height="420" rx="30" fill="#f8fafc" stroke="#94a3b8" stroke-width="5"/><text x="45" y="70" class="big">A</text>${circuit(false)}</g><g transform="translate(660 190)"><rect width="455" height="420" rx="30" fill="#f8fafc" stroke="#94a3b8" stroke-width="5"/><text x="45" y="70" class="big">B</text>${circuit(true)}</g>`)}
function circuit(closed) { return `<path d="M90 310 L90 150 L200 150 M270 150 L365 150 L365 310 L90 310" fill="none" stroke="#334155" stroke-width="12"/><line x1="70" y1="245" x2="110" y2="245" stroke="#334155" stroke-width="8"/><line x1="60" y1="270" x2="120" y2="270" stroke="#334155" stroke-width="15"/><circle cx="365" cy="230" r="52" fill="#fef9c3" stroke="#334155" stroke-width="9"/><path d="M333 230 Q365 185 397 230 Q365 275 333 230" fill="#facc15"/><circle cx="205" cy="150" r="12" fill="#334155"/><circle cx="270" cy="150" r="12" fill="#334155"/><line x1="205" y1="150" x2="${closed ? 270 : 260}" y2="${closed ? 150 : 105}" stroke="#dc2626" stroke-width="12" stroke-linecap="round"/>` }
function plantCell() { return board('PLANT CELL', `<rect x="215" y="175" width="770" height="450" rx="80" fill="#bbf7d0" stroke="#166534" stroke-width="22"/><rect x="280" y="235" width="640" height="330" rx="110" fill="#ecfccb" stroke="#65a30d" stroke-width="10"/><ellipse cx="465" cy="400" rx="88" ry="78" fill="#a855f7" stroke="#6b21a8" stroke-width="8"/><ellipse cx="690" cy="400" rx="135" ry="105" fill="#bae6fd" stroke="#0284c7" stroke-width="7"/><circle cx="835" cy="305" r="30" fill="#f59e0b"/><line x1="465" y1="400" x2="120" y2="290" stroke="#334155" stroke-width="8"/><text x="70" y="285" class="big">A</text><line x1="690" y1="400" x2="1080" y2="325" stroke="#334155" stroke-width="8"/><text x="1095" y="325" class="big">B</text><line x1="975" y1="510" x2="1095" y2="570" stroke="#334155" stroke-width="8"/><text x="1100" y="595" class="big">C</text>`)}
function forces() { return board('FORCES ON THE BOX', `<rect x="480" y="310" width="240" height="200" rx="18" fill="#f59e0b" stroke="#92400e" stroke-width="8"/><text x="600" y="425" text-anchor="middle" class="label">BOX</text><line x1="470" y1="410" x2="170" y2="410" stroke="#2563eb" stroke-width="24" marker-end="url(#arrow)"/><text x="300" y="350" text-anchor="middle" class="big">20 N</text><line x1="730" y1="410" x2="1080" y2="410" stroke="#dc2626" stroke-width="24" marker-end="url(#arrow)"/><text x="900" y="350" text-anchor="middle" class="big">35 N</text>`)}
function redShape() { return board('SHAPES', `<circle cx="250" cy="405" r="115" fill="#2563eb"/><polygon points="600,245 755,525 445,525" fill="#dc2626"/><rect x="865" y="290" width="215" height="215" rx="25" fill="#16a34a"/>`)}
function apples() { return board('FRUIT COUNT', `<circle cx="430" cy="395" r="125" fill="#dc2626"/><circle cx="770" cy="395" r="125" fill="#ef4444"/><path d="M430 270 Q405 205 460 180" fill="none" stroke="#78350f" stroke-width="22"/><path d="M770 270 Q740 210 795 180" fill="none" stroke="#78350f" stroke-width="22"/><ellipse cx="478" cy="207" rx="55" ry="25" fill="#16a34a" transform="rotate(-25 478 207)"/><ellipse cx="817" cy="208" rx="55" ry="25" fill="#22c55e" transform="rotate(-25 817 208)"/>`)}
function clock() { return board('CLOCK', `<circle cx="600" cy="405" r="230" fill="white" stroke="#0f172a" stroke-width="18"/>${Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;const x1=600+185*Math.sin(a);const y1=405-185*Math.cos(a);const x2=600+215*Math.sin(a);const y2=405-215*Math.cos(a);return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0f172a" stroke-width="10"/>`}).join('')}<line x1="600" y1="405" x2="600" y2="205" stroke="#2563eb" stroke-width="18" stroke-linecap="round"/><line x1="600" y1="405" x2="745" y2="405" stroke="#dc2626" stroke-width="22" stroke-linecap="round"/><circle cx="600" cy="405" r="20" fill="#0f172a"/>`)}
function catDog() { return board('ANIMALS', `<g transform="translate(250 280)"><circle cx="0" cy="110" r="120" fill="#f59e0b"/><polygon points="-100,30 -80,-80 -20,15" fill="#f59e0b"/><polygon points="100,30 80,-80 20,15" fill="#f59e0b"/><circle cx="-40" cy="90" r="13"/><circle cx="40" cy="90" r="13"/><path d="M-30 150 Q0 175 30 150" fill="none" stroke="#0f172a" stroke-width="8"/><text x="0" y="290" class="label" text-anchor="middle">CAT</text></g><g transform="translate(920 280)"><circle cx="0" cy="110" r="120" fill="#a16207"/><ellipse cx="-105" cy="70" rx="40" ry="100" fill="#78350f" transform="rotate(18 -105 70)"/><ellipse cx="105" cy="70" rx="40" ry="100" fill="#78350f" transform="rotate(-18 105 70)"/><circle cx="-40" cy="95" r="13"/><circle cx="40" cy="95" r="13"/><ellipse cx="0" cy="145" rx="25" ry="18" fill="#0f172a"/><text x="0" y="290" class="label" text-anchor="middle">DOG</text></g><line x1="470" y1="400" x2="730" y2="400" stroke="#cbd5e1" stroke-width="6"/>`)}
function swatches() { return board('COLOR SWATCHES', `<g transform="translate(125 245)"><rect width="250" height="280" rx="28" fill="#dc2626"/><circle cx="125" cy="-50" r="45" fill="#fff" stroke="#0f172a" stroke-width="5"/><text x="125" y="-33" class="big" text-anchor="middle">A</text></g><g transform="translate(475 245)"><rect width="250" height="280" rx="28" fill="#2563eb"/><circle cx="125" cy="-50" r="45" fill="#fff" stroke="#0f172a" stroke-width="5"/><text x="125" y="-33" class="big" text-anchor="middle">B</text></g><g transform="translate(825 245)"><rect width="250" height="280" rx="28" fill="#16a34a"/><circle cx="125" cy="-50" r="45" fill="#fff" stroke="#0f172a" stroke-width="5"/><text x="125" y="-33" class="big" text-anchor="middle">C</text></g>`)}
function leftRight() { return board('SPATIAL RELATION', `<rect x="220" y="275" width="250" height="250" rx="20" fill="#dc2626"/><circle cx="900" cy="400" r="135" fill="#2563eb"/><line x1="500" y1="400" x2="730" y2="400" stroke="#94a3b8" stroke-width="8" stroke-dasharray="18 18"/>`)}
function aboveBelow() { return board('SPATIAL RELATION', `<polygon points="600,165 650,300 795,305 680,395 720,535 600,450 480,535 520,395 405,305 550,300" fill="#facc15"/><polygon points="600,525 780,730 420,730" fill="#16a34a"/>`)}
function between() { return board('BETWEEN', `<g transform="translate(130 300)"><rect width="260" height="250" rx="16" fill="#2563eb"/><rect x="25" y="22" width="210" height="205" fill="#dbeafe"/><text x="130" y="145" text-anchor="middle" class="label">BOOK</text></g><g transform="translate(500 300)"><path d="M40 80 h160 l-20 190 h-120 z" fill="#f8fafc" stroke="#0f172a" stroke-width="9"/><path d="M55 100 h130" stroke="#60a5fa" stroke-width="25"/><text x="120" y="330" text-anchor="middle" class="label">CUP</text></g><g transform="translate(850 255)"><path d="M80 0 h120 l-15 115 q90 150 -15 330 h-60 q-105 -180 -15 -330 z" fill="#a855f7"/><text x="140" y="500" text-anchor="middle" class="label">VASE</text></g>`)}
function insideOutside() { return board('INSIDE OR OUTSIDE', `<rect x="160" y="245" width="500" height="390" rx="20" fill="#d6b38c" stroke="#78350f" stroke-width="16"/><text x="410" y="680" class="small" text-anchor="middle">BOX</text><g transform="translate(410 405)"><circle r="100" fill="#f59e0b"/><polygon points="-85,-50 -70,-140 -20,-65" fill="#f59e0b"/><polygon points="85,-50 70,-140 20,-65" fill="#f59e0b"/><text x="0" y="170" class="label" text-anchor="middle">CAT</text></g><g transform="translate(925 390)"><circle r="105" fill="#a16207"/><ellipse cx="-90" cy="-45" rx="35" ry="90" fill="#78350f"/><ellipse cx="90" cy="-45" rx="35" ry="90" fill="#78350f"/><text x="0" y="175" class="label" text-anchor="middle">DOG</text></g>`)}
function grid() { return board('2 × 2 GRID', `<rect x="250" y="160" width="700" height="560" fill="#fff" stroke="#0f172a" stroke-width="10"/><line x1="600" y1="160" x2="600" y2="720" stroke="#0f172a" stroke-width="8"/><line x1="250" y1="440" x2="950" y2="440" stroke="#0f172a" stroke-width="8"/><circle cx="425" cy="300" r="78" fill="#2563eb"/><polygon points="775,210 865,370 685,370" fill="#16a34a"/><polygon points="425,510 455,590 540,595 472,647 495,730 425,680 355,730 378,647 310,595 395,590" fill="#a855f7" transform="scale(.75) translate(140 195)"/><g transform="translate(760 560) rotate(-20)"><circle cx="0" cy="0" r="58" fill="none" stroke="#f97316" stroke-width="28"/><rect x="40" y="-18" width="180" height="36" rx="15" fill="#f97316"/><rect x="160" y="0" width="30" height="65" fill="#f97316"/><rect x="205" y="0" width="30" height="45" fill="#f97316"/></g>`)}
function curvedOcr() { return board('CURVED TEXT', `<path d="M245 510 Q600 100 955 510" fill="none" stroke="#cbd5e1" stroke-width="5" stroke-dasharray="12 12"/><text x="285" y="430" class="ocr" transform="rotate(-32 285 430)">N</text><text x="365" y="345" class="ocr" transform="rotate(-23 365 345)">O</text><text x="460" y="290" class="ocr" transform="rotate(-13 460 290)">V</text><text x="555" y="265" class="ocr">A</text><text x="680" y="285" class="ocr" transform="rotate(12 680 285)">7</text><text x="770" y="335" class="ocr" transform="rotate(22 770 335)">3</text><text x="850" y="420" class="ocr" transform="rotate(32 850 420)">1</text>`)}
function verticalOcr() { return board('VERTICAL TEXT', `<rect x="460" y="125" width="280" height="620" rx="30" fill="#0f172a"/><text x="600" y="225" class="ocrLight" text-anchor="middle">C</text><text x="600" y="325" class="ocrLight" text-anchor="middle">E</text><text x="600" y="425" class="ocrLight" text-anchor="middle">D</text><text x="600" y="525" class="ocrLight" text-anchor="middle">A</text><text x="600" y="625" class="ocrLight" text-anchor="middle">R</text>`)}
function rotatedOcr() { return board('ROTATED LABEL', `<g transform="translate(600 420) rotate(-28)"><rect x="-300" y="-105" width="600" height="210" rx="24" fill="#facc15" stroke="#0f172a" stroke-width="12"/><text x="0" y="38" class="ocr" text-anchor="middle">K7M4</text></g>`)}
function wavyOcr() { return board('WAVY TEXT', `<path d="M105 440 Q270 220 435 440 T765 440 T1095 440" fill="none" stroke="#bfdbfe" stroke-width="30"/><text x="150" y="390" class="ocr" transform="rotate(-28 150 390)">B</text><text x="235" y="310" class="ocr" transform="rotate(-12 235 310)">L</text><text x="315" y="315" class="ocr" transform="rotate(12 315 315)">U</text><text x="410" y="390" class="ocr" transform="rotate(28 410 390)">E</text><text x="545" y="445" class="ocr" transform="rotate(-12 545 445)">H</text><text x="640" y="390" class="ocr" transform="rotate(-25 640 390)">A</text><text x="735" y="310" class="ocr" transform="rotate(-10 735 310)">R</text><text x="830" y="315" class="ocr" transform="rotate(12 830 315)">B</text><text x="925" y="390" class="ocr" transform="rotate(25 925 390)">O</text><text x="1030" y="455" class="ocr" transform="rotate(10 1030 455)">R</text>`)}
function perspectiveOcr() { return board('PERSPECTIVE SIGN', `<polygon points="210,255 1040,330 930,610 290,565" fill="#14532d" stroke="#f8fafc" stroke-width="20"/><text x="625" y="470" class="ocrLight" text-anchor="middle" transform="rotate(5 625 470) skewX(4)">RIVER 29</text>`)}

function board(title, body) { return `<rect width="1200" height="800" fill="#f8fafc"/><rect x="30" y="30" width="1140" height="740" rx="34" fill="white" stroke="#cbd5e1" stroke-width="5"/><text x="75" y="105" class="title">${title}</text><line x1="75" y1="135" x2="1125" y2="135" stroke="#e2e8f0" stroke-width="5"/>${body}` }
function arrow(x1,y1,x2,y2) { return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#334155" stroke-width="14" marker-end="url(#arrow)"/>` }
function svg(body) { return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs><style>.title{font:700 35px Arial,sans-serif;fill:#0f172a;letter-spacing:2px}.label{font:700 35px Arial,sans-serif;fill:#0f172a}.small{font:600 28px Arial,sans-serif;fill:#475569}.big{font:700 48px Arial,sans-serif;fill:#0f172a}.emoji{font:100px Arial,sans-serif}.ocr{font:800 76px Arial,sans-serif;fill:#0f172a;letter-spacing:8px}.ocrLight{font:800 76px Arial,sans-serif;fill:#fff;letter-spacing:8px}</style>${body}</svg>` }
