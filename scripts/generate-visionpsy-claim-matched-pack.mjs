import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packId = 'visionpsy-claim-matched-03'
const packDir = path.join(root, 'packs', packId)
const deterministicDir = path.join(packDir, 'source', 'deterministic')
const generatedDir = path.join(packDir, 'source', 'generated')
const imageDir = path.join(packDir, 'images')
await Promise.all([mkdir(deterministicDir, { recursive: true }), mkdir(generatedDir, { recursive: true }), mkdir(imageDir, { recursive: true })])

const deterministic = new Map([
  [1, scienceSpoons()], [2, sciencePlant()], [3, scienceShadow()], [4, scienceKettle()], [5, scienceFoodChain()], [6, scienceCircuit()],
  [19, positionMug()], [20, positionBook()], [21, positionSuitcase()], [22, positionLamp()],
  [23, ocrCurved()], [24, ocrTag()], [25, ocrVertical()], [26, ocrStop()]
])

for (const [number, markup] of deterministic) {
  const png = await sharp(Buffer.from(svg(markup))).png().toBuffer()
  await writeFile(path.join(deterministicDir, filename(number)), png)
}

const thumbs = await Promise.all([...deterministic.keys()].map(async (number, index) => ({
  input: await sharp(path.join(deterministicDir, filename(number))).resize(240, 160, { fit: 'contain', background: '#ffffff' }).png().toBuffer(),
  left: (index % 5) * 240,
  top: Math.floor(index / 5) * 160
})))
await sharp({ create: { width: 1200, height: 480, channels: 3, background: '#ffffff' } }).composite(thumbs).png().toFile(path.join(packDir, 'deterministic-contact-sheet.png'))

const specs = [
  mcq(1, 'chart_table', 'ScienceQA', 'Which spoon will make the ice cube melt faster?', ['Metal spoon', 'Wooden spoon', 'Both at the same rate', 'Neither spoon'], 'A', 'Equal-sized ice cubes rest on metal and wooden spoons.'),
  mcq(2, 'chart_table', 'ScienceQA', 'Which response explains why the plant bends toward the bright window?', ['Gravitropism', 'Phototropism', 'Condensation', 'Erosion'], 'B', 'The plant visibly bends toward the only bright window.'),
  mcq(3, 'chart_table', 'ScienceQA', 'At which time of day was this scene most likely observed?', ['Sunrise', 'Midday', 'Sunset', 'Midnight'], 'B', 'The sun is high and the tree casts a very short shadow.'),
  mcq(4, 'chart_table', 'ScienceQA', 'Which process changes the liquid water in the kettle into water vapor?', ['Freezing', 'Condensation', 'Evaporation', 'Melting'], 'C', 'Steam rises from a boiling kettle.'),
  mcq(5, 'chart_table', 'ScienceQA', 'Which organism is the secondary consumer in this food chain?', ['Grass', 'Grasshopper', 'Frog', 'Hawk'], 'C', 'Controlled chain: grass → grasshopper → frog → hawk.'),
  mcq(6, 'chart_table', 'ScienceQA', 'Which change would turn the glowing bulb off?', ['Close the switch', 'Open the switch', 'Add another wire', 'Add another battery'], 'B', 'The bulb is lit in a simple closed circuit.'),

  item(7, 'ui_understanding', 'MM-IFEval', 'Describe the relation between the mug and notebook. Write exactly one sentence containing exactly four words. The first word must be “Mug” and the last word must be “notebook”.', 'Mug rests beside notebook.', ['Mug sits beside notebook.'], 'exact_text', 'Red mug left of a blue notebook.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(8, 'ui_understanding', 'MM-IFEval', 'List exactly the three visible fruits in alphabetical order, using lowercase words separated by semicolons with no spaces.', 'apple;banana;orange', [], 'exact_text', 'Exactly one apple, banana and orange.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(9, 'ui_understanding', 'MM-IFEval', 'Return JSON only with exactly two keys, “left” and “right”, naming the vehicle on each side. Use lowercase values and no spaces.', '{"left":"bicycle","right":"car"}', [], 'exact_text', 'Bicycle left; red car right.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(10, 'ui_understanding', 'MM-IFEval', 'Answer in exactly two lines. Line 1 must be DOG. Line 2 must be the rug color in uppercase.', 'DOG\nGREEN', [], 'exact_text', 'Brown dog on green rug.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(11, 'ui_understanding', 'MM-IFEval', 'Name the cup and the lamp only. Return exactly two lowercase bullet lines beginning with “- ”, ordered alphabetically.', '- cup\n- lamp', [], 'exact_text', 'Desk contains a cup and a lamp.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(12, 'ui_understanding', 'MM-IFEval', 'Describe the main action in exactly six words. Include the word “violin” and do not use the word “music”.', 'A performer plays violin on stage.', ['The performer plays violin on stage.'], 'exact_text', 'A violinist performs on stage.', 'IMAGEGEN_CONTROLLED_SCENE'),

  item(13, 'object_recognition', 'POPE', 'Is there a bicycle in the image?', 'yes', ['Yes'], 'boolean', 'Park contains a bicycle.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(14, 'object_recognition', 'POPE', 'Is there a microwave in the image?', 'yes', ['Yes'], 'boolean', 'Kitchen contains a microwave.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(15, 'object_recognition', 'POPE', 'Is there a keyboard in the image?', 'yes', ['Yes'], 'boolean', 'Desk contains a keyboard.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(16, 'object_recognition', 'POPE', 'Is there a surfboard in the image?', 'no', ['No'], 'boolean', 'Beach omits surfboards.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(17, 'object_recognition', 'POPE', 'Is there a toothbrush in the image?', 'no', ['No'], 'boolean', 'Bathroom omits toothbrushes.', 'IMAGEGEN_CONTROLLED_SCENE'),
  item(18, 'object_recognition', 'POPE', 'Is there a traffic light in the image?', 'no', ['No'], 'boolean', 'Crosswalk scene omits traffic lights.', 'IMAGEGEN_CONTROLLED_SCENE'),

  item(19, 'spatial_relation', 'MME-position', 'Is the red mug to the left of the white plate? Please answer yes or no.', 'yes', ['Yes'], 'boolean', 'Red mug is left of white plate.', 'DETERMINISTIC_SVG'),
  item(20, 'spatial_relation', 'MME-position', 'Is the red book below the blue box? Please answer yes or no.', 'no', ['No'], 'boolean', 'Red book is above blue box.', 'DETERMINISTIC_SVG'),
  item(21, 'spatial_relation', 'MME-position', 'Is the suitcase under the wooden bench? Please answer yes or no.', 'yes', ['Yes'], 'boolean', 'Suitcase is under bench.', 'DETERMINISTIC_SVG'),
  item(22, 'spatial_relation', 'MME-position', 'Is the floor lamp to the right of the sofa? Please answer yes or no.', 'no', ['No'], 'boolean', 'Lamp is left of sofa.', 'DETERMINISTIC_SVG'),

  item(23, 'visual_text', 'OCRBench-irregular', 'What is the text written on the curved storefront sign?', 'ALTO 58', [], 'exact_text', 'Only target text ALTO 58 appears.', 'DETERMINISTIC_SVG'),
  item(24, 'visual_text', 'OCRBench-irregular', 'What is the identifier written on the metal tag?', 'K9-Z41', [], 'exact_text', 'Only target identifier K9-Z41 appears.', 'DETERMINISTIC_SVG'),
  item(25, 'visual_text', 'OCRBench-irregular', 'Read the vertical banner from top to bottom.', 'CEDAR', [], 'exact_text', 'Only target word CEDAR appears.', 'DETERMINISTIC_SVG'),
  item(26, 'visual_text', 'OCRBench-irregular', 'What is the text on the low-contrast transit label?', 'NORTH 27', [], 'exact_text', 'Only target text NORTH 27 appears.', 'DETERMINISTIC_SVG'),

  mcq(27, 'physical_context', 'MMStar-localization', 'Where is the blue mug located?', ['On the top shelf', 'Inside the open lower cabinet', 'In the sink', 'On the windowsill'], 'B', 'Blue mug is inside open lower cabinet.', 'IMAGEGEN_CONTROLLED_SCENE'),
  mcq(28, 'physical_context', 'MMStar-localization', 'Where is the yellow helmet located?', ['On the floor', 'On a wall hook above the workbench', 'On the car roof', 'Inside a cardboard box'], 'B', 'Yellow helmet hangs on wall hook.', 'IMAGEGEN_CONTROLLED_SCENE'),
  mcq(29, 'physical_context', 'MMStar-localization', 'In which image quadrant is the green umbrella?', ['Upper-left', 'Upper-right', 'Lower-left', 'Lower-right'], 'A', 'Green umbrella is in upper-left quadrant.', 'IMAGEGEN_CONTROLLED_SCENE'),
  mcq(30, 'physical_context', 'MMStar-localization', 'Where is the television remote?', ['Under the coffee table', 'Between two red sofa cushions', 'On the bookshelf', 'Beside the floor lamp'], 'B', 'Remote is between red sofa cushions.', 'IMAGEGEN_CONTROLLED_SCENE')
]

const items = []
for (const spec of specs) {
  const sourceDir = spec.sourceMethod === 'IMAGEGEN_CONTROLLED_SCENE' ? generatedDir : deterministicDir
  const bytes = await readFile(path.join(sourceDir, filename(spec.number)))
  await writeFile(path.join(imageDir, filename(spec.number)), bytes)
  items.push({
    id: `claim-match-${String(spec.number).padStart(2, '0')}`,
    filename: `images/${filename(spec.number)}`,
    category: spec.category,
    claimFamily: spec.claimFamily,
    question: spec.question,
    expectedAnswer: spec.expectedAnswer,
    acceptedAnswers: spec.acceptedAnswers,
    answerType: spec.answerType,
    expectedAnswerSource: 'PRE_REGISTERED_CONTROLLED_SCENE_VISUALLY_VERIFIED',
    sourceMethod: spec.sourceMethod,
    sourceReference: `PRE-REGISTRATION.md case ${spec.number}: ${spec.sceneTruth}`,
    difficulty: 'benchmark-matched',
    license: 'PROJECT_GENERATED',
    sha256: createHash('sha256').update(bytes).digest('hex')
  })
}

const allThumbs = await Promise.all(items.map(async (entry, index) => ({
  input: await sharp(path.join(packDir, entry.filename)).resize(240, 160, { fit: 'contain', background: '#ffffff' }).png().toBuffer(),
  left: (index % 5) * 240,
  top: Math.floor(index / 5) * 160
})))
await sharp({ create: { width: 1200, height: 960, channels: 3, background: '#ffffff' } })
  .composite(allThumbs)
  .png()
  .toFile(path.join(packDir, 'full-contact-sheet.png'))

const manifest = {
  schemaVersion: 1,
  id: packId,
  name: 'VisionPsy Claim-Matched 03',
  version: '1.0.0-draft',
  description: 'Pre-registered claim-matched analogues of ScienceQA, MM-IFEval, POPE, MME position, OCRBench irregular text and MMStar localization.',
  generatedAt: new Date().toISOString(),
  license: 'PROJECT_GENERATED',
  rankingPolicy: {
    minQuestions: 30,
    minUniqueImages: 30,
    requireExpectedAnswers: true,
    categoryMinimums: { chart_table: 6, ui_understanding: 6, object_recognition: 6, spatial_relation: 4, visual_text: 4, physical_context: 4 }
  },
  items
}
await writeFile(path.join(packDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Generated ${items.length} claim-matched assets and manifest at ${packDir}`)

function filename(number) { return `claim-match-${String(number).padStart(2, '0')}.png` }
function item(number, category, claimFamily, question, expectedAnswer, acceptedAnswers, answerType, sceneTruth, sourceMethod = 'DETERMINISTIC_SVG') { return { number, category, claimFamily, question, expectedAnswer, acceptedAnswers, answerType, sceneTruth, sourceMethod } }
function mcq(number, category, claimFamily, question, options, expectedAnswer, sceneTruth, sourceMethod = 'DETERMINISTIC_SVG') {
  const letters = ['A', 'B', 'C', 'D']
  const prompt = `${question}\nOptions:\n${options.map((option, index) => `${letters[index]}. ${option}`).join('\n')}\nPlease select the correct answer from the options above.`
  return item(number, category, claimFamily, prompt, expectedAnswer, [`${expectedAnswer}. ${options[letters.indexOf(expectedAnswer)]}`], 'exact_text', sceneTruth, sourceMethod)
}

function scienceSpoons() { return canvas(`<defs><linearGradient id="steel" x1="0" x2="1"><stop stop-color="#64748b"/><stop offset=".5" stop-color="#f8fafc"/><stop offset="1" stop-color="#64748b"/></linearGradient></defs><rect width="1200" height="800" fill="#edf6ff"/><ellipse cx="330" cy="350" rx="125" ry="78" fill="url(#steel)" stroke="#334155" stroke-width="8"/><rect x="320" y="420" width="20" height="260" rx="10" fill="#64748b"/><rect x="270" y="280" width="120" height="110" rx="18" fill="#dbeafe" stroke="#7dd3fc" stroke-width="8"/><text x="330" y="735" text-anchor="middle" class="label">METAL</text><ellipse cx="870" cy="350" rx="125" ry="78" fill="#a16207" stroke="#713f12" stroke-width="8"/><rect x="860" y="420" width="20" height="260" rx="10" fill="#a16207"/><rect x="810" y="280" width="120" height="110" rx="18" fill="#dbeafe" stroke="#7dd3fc" stroke-width="8"/><text x="870" y="735" text-anchor="middle" class="label">WOOD</text>`)}
function sciencePlant() { return canvas(`<rect width="1200" height="800" fill="#f8fafc"/><rect x="760" y="80" width="360" height="500" rx="16" fill="#dbeafe" stroke="#475569" stroke-width="15"/><line x1="940" y1="80" x2="940" y2="580" stroke="#94a3b8" stroke-width="12"/><line x1="760" y1="330" x2="1120" y2="330" stroke="#94a3b8" stroke-width="12"/><circle cx="1020" cy="175" r="70" fill="#fde047"/><path d="M420 650 Q470 410 760 300" fill="none" stroke="#166534" stroke-width="32"/><ellipse cx="560" cy="470" rx="105" ry="50" fill="#22c55e" transform="rotate(-22 560 470)"/><ellipse cx="675" cy="370" rx="105" ry="50" fill="#16a34a" transform="rotate(-30 675 370)"/><path d="M300 650 h300 l-45 130 h-210 z" fill="#b45309"/>`)}
function scienceShadow() { return canvas(`<rect width="1200" height="800" fill="#86c9ff"/><rect y="535" width="1200" height="265" fill="#86b85f"/><circle cx="600" cy="105" r="70" fill="#fde047"/><rect x="580" y="315" width="42" height="260" fill="#78350f"/><circle cx="600" cy="285" r="165" fill="#15803d"/><ellipse cx="700" cy="605" rx="130" ry="35" fill="#475569" opacity=".55"/><line x1="620" y1="575" x2="785" y2="620" stroke="#475569" stroke-width="30" opacity=".55"/>`)}
function scienceKettle() { return canvas(`<rect width="1200" height="800" fill="#f1f5f9"/><rect y="610" width="1200" height="190" fill="#64748b"/><path d="M380 600 Q330 360 430 260 h330 q100 100 50 340 z" fill="#94a3b8" stroke="#334155" stroke-width="15"/><path d="M760 330 Q970 330 930 510 Q900 610 810 575" fill="none" stroke="#334155" stroke-width="35"/><path d="M430 280 L280 390 L410 420" fill="#94a3b8" stroke="#334155" stroke-width="15"/><path d="M485 230 Q430 110 520 65 M600 230 Q555 115 640 55 M710 230 Q670 120 750 75" fill="none" stroke="#bfdbfe" stroke-width="34" stroke-linecap="round" opacity=".85"/>`)}
function scienceFoodChain() { return canvas(`<rect width="1200" height="800" fill="#f7fee7"/><g transform="translate(65 260)"><rect width="220" height="230" rx="25" fill="#dcfce7"/><text x="110" y="105" text-anchor="middle" class="emoji">🌿</text><text x="110" y="185" text-anchor="middle" class="small">GRASS</text></g><g transform="translate(355 260)"><rect width="220" height="230" rx="25" fill="#fef3c7"/><text x="110" y="105" text-anchor="middle" class="emoji">🦗</text><text x="110" y="185" text-anchor="middle" class="small">GRASSHOPPER</text></g><g transform="translate(645 260)"><rect width="220" height="230" rx="25" fill="#dcfce7"/><text x="110" y="105" text-anchor="middle" class="emoji">🐸</text><text x="110" y="185" text-anchor="middle" class="small">FROG</text></g><g transform="translate(935 260)"><rect width="220" height="230" rx="25" fill="#fee2e2"/><text x="110" y="105" text-anchor="middle" class="emoji">🦅</text><text x="110" y="185" text-anchor="middle" class="small">HAWK</text></g>${arrow(290,375,340,375)}${arrow(580,375,630,375)}${arrow(870,375,920,375)}`)}
function scienceCircuit() { return canvas(`<rect width="1200" height="800" fill="#f8fafc"/><path d="M250 575 L250 235 L480 235 M680 235 L950 235 L950 575 L250 575" fill="none" stroke="#334155" stroke-width="22"/><line x1="205" y1="415" x2="295" y2="415" stroke="#334155" stroke-width="12"/><line x1="185" y1="455" x2="315" y2="455" stroke="#334155" stroke-width="28"/><circle cx="950" cy="405" r="105" fill="#fef08a" stroke="#334155" stroke-width="16"/><path d="M885 405 Q950 315 1015 405 Q950 495 885 405" fill="#facc15"/><circle cx="480" cy="235" r="22" fill="#334155"/><circle cx="680" cy="235" r="22" fill="#334155"/><line x1="480" y1="235" x2="680" y2="235" stroke="#dc2626" stroke-width="22" stroke-linecap="round"/><text x="580" y="165" text-anchor="middle" class="small">CLOSED SWITCH</text>`)}
function positionMug() { return room(`<g transform="translate(260 340)"><path d="M0 0 h180 v180 h-180 z" fill="#dc2626"/><path d="M180 35 q110 0 75 100 q-20 55 -75 20" fill="none" stroke="#dc2626" stroke-width="28"/></g><ellipse cx="870" cy="450" rx="180" ry="95" fill="#fff" stroke="#94a3b8" stroke-width="10"/>`)}
function positionBook() { return room(`<rect x="360" y="180" width="480" height="175" rx="18" fill="#dc2626"/><rect x="405" y="385" width="390" height="230" rx="18" fill="#2563eb"/>`)}
function positionSuitcase() { return room(`<rect x="230" y="260" width="740" height="90" rx="20" fill="#a16207"/><rect x="275" y="350" width="35" height="250" fill="#713f12"/><rect x="890" y="350" width="35" height="250" fill="#713f12"/><rect x="465" y="430" width="270" height="210" rx="22" fill="#0f766e" stroke="#134e4a" stroke-width="10"/><path d="M535 430 v-50 h130 v50" fill="none" stroke="#134e4a" stroke-width="18"/>`)}
function positionLamp() { return room(`<rect x="115" y="180" width="220" height="120" rx="30" fill="#fde68a"/><rect x="215" y="300" width="22" height="330" fill="#475569"/><ellipse cx="226" cy="650" rx="120" ry="30" fill="#475569"/><rect x="500" y="330" width="560" height="300" rx="60" fill="#64748b"/><rect x="560" y="260" width="220" height="170" rx="35" fill="#94a3b8"/><rect x="790" y="260" width="220" height="170" rx="35" fill="#94a3b8"/>`)}
function ocrCurved() { return canvas(`<rect width="1200" height="800" fill="#c7a273"/><path d="M130 610 Q600 65 1070 610 L980 710 Q600 285 220 710 z" fill="#1e3a5f" stroke="#e5e7eb" stroke-width="18"/><text x="285" y="495" class="ocrLight" transform="rotate(-25 285 495)">A</text><text x="395" y="395" class="ocrLight" transform="rotate(-15 395 395)">L</text><text x="505" y="340" class="ocrLight" transform="rotate(-7 505 340)">T</text><text x="615" y="330" class="ocrLight" transform="rotate(5 615 330)">O</text><text x="775" y="390" class="ocrLight" transform="rotate(15 775 390)">5</text><text x="890" y="495" class="ocrLight" transform="rotate(25 890 495)">8</text>`)}
function ocrTag() { return canvas(`<defs><filter id="noise"><feTurbulence baseFrequency=".35" numOctaves="2" seed="7" result="n"/><feBlend in="SourceGraphic" in2="n" mode="multiply"/></filter></defs><rect width="1200" height="800" fill="#3f3f46"/><g transform="translate(600 400) rotate(-19)"><rect x="-390" y="-145" width="780" height="290" rx="30" fill="#a1a1aa" stroke="#27272a" stroke-width="18"/><circle cx="-315" cy="0" r="30" fill="#52525b"/><circle cx="315" cy="0" r="30" fill="#52525b"/><text x="0" y="35" text-anchor="middle" class="ocrDark" filter="url(#noise)">K9-Z41</text></g>`)}
function ocrVertical() { return canvas(`<rect width="1200" height="800" fill="#ded6c8"/><path d="M440 40 L760 70 L710 760 L470 730 z" fill="#7f1d1d" stroke="#fef2f2" stroke-width="15"/><text x="600" y="180" text-anchor="middle" class="ocrLight">C</text><text x="600" y="290" text-anchor="middle" class="ocrLight">E</text><text x="600" y="400" text-anchor="middle" class="ocrLight">D</text><text x="600" y="510" text-anchor="middle" class="ocrLight">A</text><text x="600" y="620" text-anchor="middle" class="ocrLight">R</text>`)}
function ocrStop() { return canvas(`<rect width="1200" height="800" fill="#8aa0ad"/><rect x="145" y="245" width="910" height="310" rx="30" fill="#78909c" stroke="#607d8b" stroke-width="18"/><text x="600" y="440" text-anchor="middle" class="ocrLow">NORTH 27</text><circle cx="215" cy="315" r="18" fill="#546e7a"/><circle cx="985" cy="485" r="18" fill="#546e7a"/>`)}

function room(body) { return canvas(`<rect width="1200" height="800" fill="#f8fafc"/><rect y="640" width="1200" height="160" fill="#d6b98c"/>${body}`) }
function arrow(x1,y1,x2,y2) { return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#334155" stroke-width="14" marker-end="url(#arrow)"/>` }
function canvas(body) { return body }
function svg(body) { return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#334155"/></marker></defs><style>.label{font:700 42px Arial,sans-serif;fill:#0f172a}.small{font:700 25px Arial,sans-serif;fill:#0f172a}.emoji{font:85px Arial,sans-serif}.ocrLight{font:800 92px Arial,sans-serif;fill:#f8fafc;letter-spacing:8px}.ocrDark{font:800 110px Arial,sans-serif;fill:#27272a;letter-spacing:8px}.ocrLow{font:800 96px Arial,sans-serif;fill:#91a4ad;letter-spacing:7px}</style>${body}</svg>` }
