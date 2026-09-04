const $ = selector => document.querySelector(selector)
const showcaseSearchParams = new URLSearchParams(window.location.search)
const useRecordedDemo3Replay = showcaseSearchParams.get('demo3') === 'replay'
const useLocalFrameCapture = showcaseSearchParams.get('captureFrames') === '1'
const liveDemoReplaySpeed = Math.max(1, Number(showcaseSearchParams.get('replaySpeed')) || 1.5)
const COMPARISON_PROVIDER_IDS = Object.freeze(['qvac-visionpsy-standard-q8', 'qvac-visionpsy-standard-q4', 'qvac-visionpsy', 'qvac-visionpsy-flash-q4'])
const PROVIDER_BADGES = Object.freeze({
  'qvac-visionpsy-standard-q8': 'STANDARD Q8',
  'qvac-visionpsy-standard-q4': 'STANDARD Q4',
  'visionpsy-patched-base': 'STANDARD Q8',
  'qvac-visionpsy': 'FLASH Q8',
  'qvac-visionpsy-flash-q4': 'FLASH Q4',
  'visionpsy-patched': 'FLASH Q4'
})
const OFFICIAL_REAL_GROUPS = Object.freeze(['official-real', 'validation-real', 'validation-real-b', 'validation-real-c', 'official-remainder'])
const LIVE_DEMO_CASE_IDS = Object.freeze(['realworldqa-48', 'realworldqa-41', 'realworldqa-53'])
const LIVE_DEMO_COMPACT_LAYOUT = Object.freeze({ thumbnailStartX: 50, thumbnailStep: 96, thumbnailWidth: 90, thumbnailImageWidth: 34, firstModelX: 460 })
const LIVE_DEMO_RUNTIME = Object.freeze({ sdk: '0.18.2', backend: '0.47.0', accelerator: 'Apple Metal' })
const LIVE_DEMO_THEME = Object.freeze({
  background: '#070a09',
  surface: '#101412',
  surfaceRaised: '#171817',
  border: '#29332f',
  primary: '#16e3c1',
  primaryMuted: 'rgba(22,227,193,.28)',
  blue: '#4bb8ff',
  text: '#f5f7f6',
  muted: '#9aa5a1'
})
const LIVE_DEMO_3_SCENES = Object.freeze([
  {
    id: 'personal-dog-3',
    title: 'Mountain companions',
    imageUrl: '/showcase/personal-dogs/demo-3-mountain-companions.jpg',
    filename: 'demo-3-mountain-companions.jpg',
    prompt: 'The two mountain explorers have very different looks. Which dog is on the left, and how do their coats differ? Answer in one cheerful sentence using visible features rather than breed names.',
    expectedAnswer: '2 points · left dog: white and brown · coat contrast: fluffy/long vs short/smooth or tan/reddish',
    demoKind: 'dog-rubric',
    questionLabel: '01 · NATURAL VISUAL QUESTION · TWO-POINT RUBRIC'
  },
  {
    id: 'personal-dog-1',
    title: 'The quietest nap',
    imageUrl: '/showcase/personal-dogs/demo-3-quietest-nap.jpg',
    filename: 'demo-3-quietest-nap.jpg',
    prompt: 'This little dog seems to have found its perfect nap spot. Is it awake or asleep, and what surface is it resting on? Answer like a warm photo caption in one short sentence.',
    expectedAnswer: '2 points · asleep · tiled floor',
    demoKind: 'dog-rubric',
    questionLabel: '02 · WARM PHOTO CAPTION · TWO-POINT RUBRIC'
  },
  {
    id: 'personal-dog-2',
    title: 'Picnic nap',
    imageUrl: '/showcase/personal-dogs/demo-3-picnic-nap.jpg',
    filename: 'demo-3-picnic-nap.jpg',
    prompt: 'This outdoor nap looks wonderfully cozy. What is the dog lying on, and what bright-colored item is it wearing? Answer like a warm photo caption in one short sentence.',
    expectedAnswer: '2 points · patterned blanket · orange harness',
    demoKind: 'dog-rubric',
    questionLabel: '03 · OBJECT + ATTRIBUTE · TWO-POINT RUBRIC'
  },
  {
    id: 'personal-dog-5',
    title: 'Cafe companions',
    imageUrl: '/showcase/personal-dogs/demo-3-cafe-companions.jpg',
    filename: 'demo-3-cafe-companions.jpg',
    prompt: 'These cafe companions look ready to leave. How many dogs are visible, and what item with a loop-shaped handle lies on the floor beside them? Answer in one playful sentence.',
    expectedAnswer: '2 points · two dogs · retractable leash/lead',
    demoKind: 'dog-rubric',
    questionLabel: '04 · COUNT + OBJECT ID · TWO-POINT RUBRIC'
  }
])
const LIVE_DEMO_3_REPLAY_RESULTS = Object.freeze({
  'personal-dog-3': Object.freeze({
    'qvac-visionpsy-standard-q8': Object.freeze({ output: 'The dog on the left is the Cavalier King Charles Spaniel, identifiable by its white and brown coat. Its fur is soft and long, while the dog on the right has a short tan coat.', timeToFirstTokenMs: 2720, latencyMs: 3080, tokensPerSecond: 120.2, outputTokens: 43 }),
    'qvac-visionpsy-standard-q4': Object.freeze({ output: 'The dog on the left is the Cavalier King Charles Spaniel. It has a white and brown coat, long floppy ears, and a fluffy tail.', timeToFirstTokenMs: 8222, latencyMs: 8650, tokensPerSecond: 73.5, outputTokens: 31 }),
    'qvac-visionpsy': Object.freeze({ output: 'The dog on the left has a white and brown coat, while the dog on the right has a tan and white coat.', timeToFirstTokenMs: 1880, latencyMs: 2100, tokensPerSecond: 113.1, outputTokens: 25 }),
    'qvac-visionpsy-flash-q4': Object.freeze({ output: 'The dog on the left has a white and brown coat, while the dog on the right has a brown and white coat.', timeToFirstTokenMs: 1860, latencyMs: 2050, tokensPerSecond: 132.8, outputTokens: 25 })
  }),
  'personal-dog-1': Object.freeze({
    'qvac-visionpsy-standard-q8': Object.freeze({ output: 'It is asleep.', timeToFirstTokenMs: 2310, latencyMs: 2360, tokensPerSecond: 89.2, outputTokens: 4 }),
    'qvac-visionpsy-standard-q4': Object.freeze({ output: 'It is asleep. The dog is resting on a tiled floor.', timeToFirstTokenMs: 5027, latencyMs: 5231, tokensPerSecond: 69.4, outputTokens: 14 }),
    'qvac-visionpsy': Object.freeze({ output: 'The little dog is peacefully asleep on a clean, white tiled floor.', timeToFirstTokenMs: 2270, latencyMs: 2410, tokensPerSecond: 105.9, outputTokens: 15 }),
    'qvac-visionpsy-flash-q4': Object.freeze({ output: 'The little dog is peacefully asleep on a clean, white tiled floor.', timeToFirstTokenMs: 2260, latencyMs: 2360, tokensPerSecond: 145.3, outputTokens: 15 })
  }),
  'personal-dog-2': Object.freeze({
    'qvac-visionpsy-standard-q8': Object.freeze({ output: "The dog is resting on a colorful, patterned blanket adorned with elephants and intricate designs. It's wearing a vibrant orange harness.", timeToFirstTokenMs: 2480, latencyMs: 2700, tokensPerSecond: 113.2, outputTokens: 25 }),
    'qvac-visionpsy-standard-q4': Object.freeze({ output: "The dog is lying on a colorful blanket adorned with elephants and patterns. It's wearing a bright orange harness.", timeToFirstTokenMs: 5863, latencyMs: 6185, tokensPerSecond: 69.3, outputTokens: 22 }),
    'qvac-visionpsy': Object.freeze({ output: "The dog is lying on a colorful, patterned blanket, and it's wearing an orange harness.", timeToFirstTokenMs: 1930, latencyMs: 2100, tokensPerSecond: 109.5, outputTokens: 19 }),
    'qvac-visionpsy-flash-q4': Object.freeze({ output: "The dog is lying on a colorful, patterned blanket, and it's wearing an orange harness. The scene is bathed in warm sunlight, making the nap look especially cozy.", timeToFirstTokenMs: 1880, latencyMs: 2190, tokensPerSecond: 134.1, outputTokens: 40 })
  }),
  'personal-dog-5': Object.freeze({
    'qvac-visionpsy-standard-q8': Object.freeze({ output: 'Two dogs are visible, and the item on the floor is a dog leash.', timeToFirstTokenMs: 3320, latencyMs: 3500, tokensPerSecond: 97.0, outputTokens: 17 }),
    'qvac-visionpsy-standard-q4': Object.freeze({ output: 'There are two dogs visible in the cafe, and the item on the floor is a loop-shaped handle for a pet toy.', timeToFirstTokenMs: 5869, latencyMs: 6266, tokensPerSecond: 69.3, outputTokens: 27 }),
    'qvac-visionpsy': Object.freeze({ output: 'Two dogs are visible, and the item on the floor is a pet grooming brush.', timeToFirstTokenMs: 2060, latencyMs: 2230, tokensPerSecond: 100.8, outputTokens: 17 }),
    'qvac-visionpsy-flash-q4': Object.freeze({ output: 'Two dogs are visible, and the item on the floor is a pet grooming brush.', timeToFirstTokenMs: 2150, latencyMs: 2310, tokensPerSecond: 113.4, outputTokens: 17 })
  })
})
const LIVE_DEMO_OFFICIAL_RESULTS = Object.freeze([
  { providerId: 'qvac-visionpsy-standard-q8', local: 58.30, official: 59.1, artifact: 'VisionPsy Standard Q8_0' },
  { providerId: 'qvac-visionpsy-standard-q4', local: 57.91, official: 60.3, artifact: 'VisionPsy Standard Q4_K_M-i' },
  { providerId: 'qvac-visionpsy', local: 57.25, official: 56.7, artifact: 'VisionPsy Flash Q8_0' },
  { providerId: 'qvac-visionpsy-flash-q4', local: 55.95, official: 54.9, artifact: 'VisionPsy Flash Q4_K_M-i' }
])

const showcase = {
  cases: [],
  dataset: null,
  providers: [],
  selectedCaseId: 'realworldqa-5',
  suite: 'official-real',
  customImageDataUrl: null,
  customFilename: null,
  running: false,
  autoplay: false,
  controller: null,
  startedAt: null,
  timer: null,
  output: '',
  messages: [],
  activeAssistantId: null,
  currentMetrics: {},
  livePeaks: {},
  history: [],
  comparison: {},
  comparisonOrder: [],
  comparisonSequence: 0,
  cycle: { results: [], startedAt: null, elapsedMs: null, total: 20, suite: 'official-real' }
}

const liveDemo = {
  running: false,
  mode: 'benchmark',
  abort: false,
  controller: null,
  sceneIndex: 0,
  activeCase: null,
  phase: 'READY',
  typedQuestion: '',
  cards: {},
  scenes: [],
  finalCard: false,
  results: [],
  introCard: false,
  introPage: 0,
  introPageStartedAt: null,
  introTransition: 'in',
  introTransitionStartedAt: null,
  images: new Map(),
  cursor: { x: 1460, y: 62, clickAt: 0 },
  startedAt: null,
  animationFrame: null,
  recorder: null,
  recordingChunks: [],
  videoUrl: null,
  completedElapsedMs: null,
  recordingStartedAt: null,
  introEndedAtMs: null,
  popupStartedAtMs: null,
  audioContext: null,
  musicElement: null,
  musicNodes: []
}

const localFrameCapture = {
  running: false,
  runId: null,
  frameIndex: 0,
  startedAt: 0,
  timestampsMs: [],
  loopPromise: null
}

window.qvacShowcase = { open: openShowcase, startRecordingAssist, startLiveDemo, startLiveDemo3, startLiveDemo3Replay }

function confirmLiveDemoStart(mode) {
  const replay = mode === 'dogs-replay'
  const dogMode = mode === 'dogs' || replay
  if (!dogMode && !showcase.dataset?.complete) {
    window.alert('Install the checksum-locked complete RealWorldQA dataset before starting this scenario.')
    return false
  }
  if (replay) return window.confirm('Start a recorded-results replay?\n\nNo new model inference will run. The recording will remain visibly marked REPLAY.')
  const inferences = dogMode ? 16 : 12
  const photos = dogMode ? 4 : 3
  return window.confirm(`Start ${photos} real images and ${inferences} sequential local inferences?\n\nAll four VisionPsy variants will run through QVAC SDK. This can use substantial CPU, GPU and RAM. You can stop the run at any time.`)
}

async function initialize() {
  bindEvents()
  try {
    const response = await fetch('/api/showcase')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || `Showcase unavailable (${response.status})`)
    showcase.cases = data.cases || []
    showcase.dataset = data.dataset || null
    showcase.providers = data.providers || []
    renderCases()
    renderProviders()
    clearComparison()
    updateSuiteUi()
    selectCase(showcase.selectedCaseId, { clearQuestion: true })
    const benchmarkButton = $('#showcase-live-demo')
    benchmarkButton.disabled = !showcase.dataset?.complete
    benchmarkButton.title = showcase.dataset?.complete ? 'Run three RealWorldQA scenes across four local variants' : 'Install the complete checksum-locked RealWorldQA dataset first'
    $('#showcase-live-demo-3').title = useRecordedDemo3Replay ? 'Replay sixteen previously recorded local results' : 'Run sixteen new local dog-photo inferences'
  } catch (error) {
    setRuntime(false, error.message)
    setStage('RUNTIME UNAVAILABLE', 'error')
  }
  renderConversation()
  void loadVerifiedBenchmark()
}

async function loadVerifiedBenchmark() {
  try {
    const response = await fetch('/showcase/visionpsy-four-way-realworldqa-765.json', { cache: 'no-store' })
    if (!response.ok) return
    const report = await response.json()
    const section = $('#showcase-verified')
    section.classList.remove('hidden')
    $('#showcase-verified-status').textContent = `VERIFIED · ${new Date(report.generatedAt).toLocaleString()}`
    const minimumP = Math.min(...report.realPairwise.map(item => item.holmAdjustedP ?? item.exactMcNemarP))
    const realScores = report.providers.map(provider => provider.real.passed)
    const realSpread = Math.max(...realScores) - Math.min(...realScores)
    const majorityBaseline = report.sanityBaselines?.majorityLetterBaseline
    const randomBaseline = report.sanityBaselines?.weightedRandomOptionBaseline
    const repeatability = report.repeatability
    const repeatabilityCard = repeatability ? `<div><b>Deterministic repeatability</b><small>${repeatability.cases} stratified cases × ${repeatability.repeats} passes</small><small>${repeatability.newInferences} new inferences</small><small>Max score swing ${repeatability.maximumAccuracySwingPoints.toFixed(2)} pp</small><small>Exact outputs ${(repeatability.minimumExactOutputAgreement * 100).toFixed(1)}% minimum</small></div>` : ''
    $('#showcase-verified-summary').innerHTML = report.providers.map((provider, index) => `<article class="showcase-cycle-summary-card">
      <header><div><span>OFFICIAL-765 RANK ${index + 1} · ${escapeHtml(PROVIDER_BADGES[provider.providerId] || provider.providerId)}${provider.providerId === 'qvac-visionpsy-standard-q4' ? ' · SEPARATE ADDENDUM' : ''}</span><h3>${escapeHtml(provider.label)}</h3></div><b>${provider.real.passed}/${provider.real.cases}</b></header>
      <div class="showcase-cycle-summary-kpis">
        <span>Local RealWorldQA 765<b>${scoreCell(provider.real)}</b></span>
        <span>Published matching GGUF<b>${(provider.officialRealWorldQaAccuracy * 100).toFixed(1)}%</b></span>
        <span>Local vs published<b>${provider.deviationFromOfficial >= 0 ? '+' : ''}${(provider.deviationFromOfficial * 100).toFixed(2)} pp</b></span>
        <span>Incorrect answers<b>${provider.real.failed}/${provider.real.cases}</b></span>
        <span>Mean TTFT<b>${durationCell(provider.performance.ttftMs.mean)}</b></span>
        <span>Mean latency<b>${durationCell(provider.performance.latencyMs.mean)}</b></span>
        <span>Peak process RSS<b>${bytesCell(provider.performance.processRssPeakBytes.max)}</b></span>
      </div>
    </article>`).join('') + `<div class="showcase-pairwise"><span>STATISTICAL VERDICT · ${escapeHtml(report.statisticalVerdict.replaceAll('_', ' '))}</span><div><b>Paired quality result</b><small>Score spread ${realSpread} answers</small><small>Minimum Holm p ${minimumP.toFixed(3)}</small><small>${minimumP < 0.05 ? 'Significant pair found' : 'No significant pair'}</small><small>${minimumP < 0.05 ? 'Read pairwise details' : 'Do not claim a winner'}</small></div><div><b>Frozen benchmark protocol</b><small>Complete RealWorldQA 765</small><small>Exact option scoring</small><small>Primary rotation + Q4 addendum</small><small>Performance not directly ranked</small></div><div><b>Direct upstream scorer</b><small>VLMEvalKit ${escapeHtml(report.methodology?.scorerParity?.revision?.slice(0, 8) || 'pinned')}</small><small>${report.methodology?.scorerParity?.extractionDifferences ?? '—'} extraction differences</small><small>${report.methodology?.scorerParity?.passVerdictChanges ?? '—'} verdict changes</small><small>Checksum verified</small></div>${repeatabilityCard}<div><b>Sanity baselines</b><small>Majority letter ${Number.isFinite(majorityBaseline) ? `${(majorityBaseline * 100).toFixed(1)}%` : 'pending rerun'}</small><small>Weighted random ${Number.isFinite(randomBaseline) ? `${(randomBaseline * 100).toFixed(1)}%` : 'pending rerun'}</small><small>Categories are local heuristics</small><small>Local corroboration, not vendor replica</small></div></div>`
  } catch {}
}

function scoreCell(result) {
  return `${result.passed}/${result.cases} · ${(result.accuracy * 100).toFixed(1)}%`
}

function durationCell(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : '—'
}

function bytesCell(value) {
  return Number.isFinite(value) ? `${(value / 1024 ** 2).toFixed(0)} MB` : '—'
}

function bindEvents() {
  document.addEventListener('click', event => {
    const nav = event.target.closest('a[href="#showcase"]')
    if (nav) { event.preventDefault(); openShowcase() }
  })
  $('#showcase-case-list').addEventListener('click', event => {
    const button = event.target.closest('[data-showcase-case]')
    if (button && !showcase.running && !showcase.autoplay) selectCase(button.dataset.showcaseCase, { clearQuestion: true })
  })
  $('#showcase-suite-picker').addEventListener('click', event => {
    const button = event.target.closest('[data-showcase-suite]')
    if (button && !showcase.running && !showcase.autoplay) selectSuite(button.dataset.showcaseSuite)
  })
  $('#showcase-use-question').addEventListener('click', () => {
    $('#showcase-question').value = selectedCase()?.prompt || ''
    $('#showcase-question').focus()
  })
  $('#showcase-run').addEventListener('click', () => { void runShowcase().catch(() => {}) })
  $('#showcase-compare').addEventListener('click', () => { void runComparison().catch(() => {}) })
  $('#showcase-cancel').addEventListener('click', cancelRun)
  $('#showcase-autoplay').addEventListener('click', () => { void startRecordingAssist() })
  $('#showcase-live-demo').addEventListener('click', () => {
    if (!confirmLiveDemoStart('benchmark')) return
    void startLiveDemo().catch(error => showLiveDemoError(error))
  })
  $('#showcase-live-demo-3').addEventListener('click', () => {
    const mode = useRecordedDemo3Replay ? 'dogs-replay' : 'dogs'
    if (!confirmLiveDemoStart(mode)) return
    void (useRecordedDemo3Replay ? startLiveDemo3Replay() : startLiveDemo3()).catch(error => showLiveDemoError(error))
  })
  $('#showcase-demo-stop').addEventListener('click', stopLiveDemo)
  $('#showcase-demo-close').addEventListener('click', closeLiveDemo)
  $('#showcase-demo-replay').addEventListener('click', replayLiveDemo)
  $('#showcase-clear-chat').addEventListener('click', () => { if (!showcase.running) clearConversation() })
  $('#showcase-clear-history').addEventListener('click', () => { showcase.history = []; renderHistory() })
  $('#showcase-provider').addEventListener('change', updateSelectedProviderIdentity)
  $('#showcase-question').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!showcase.running) void runShowcase().catch(() => {}) }
  })
  $('#showcase-file').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) void useDroppedFile(file); event.target.value = '' })
  const drop = $('#showcase-drop-zone')
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, event => { event.preventDefault(); if (!showcase.running) drop.classList.add('drag') })
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('drag') })
  drop.addEventListener('drop', event => { const file = event.dataTransfer?.files?.[0]; if (file && !showcase.running) void useDroppedFile(file) })
  drop.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); $('#showcase-file').click() } })
}

function openShowcase() {
  $('#showcase').classList.remove('hidden')
  $('#provider-pill').textContent = 'VisionPsy Live · LOCAL'
  $('#provider-pill').className = 'pill ready'
  $('#showcase').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function renderCases() {
  const cases = activeCases()
  $('#showcase-case-list').innerHTML = cases.length
    ? cases.map(item => `<button class="showcase-case ${item.id === showcase.selectedCaseId ? 'selected' : ''}" data-showcase-case="${escapeHtml(item.id)}"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}"><em>REALWORLDQA</em><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.capability)}</small></span></button>`).join('')
    : '<div class="showcase-dataset-missing"><b>This RealWorldQA partition is not installed.</b><span>Use the checksum-locked installer documented in README.md to enable the complete 765-case run.</span></div>'
}

function activeCases() {
  return casesForSuite(showcase.suite)
}

function selectSuite(suite) {
  if (!['official-real', 'validation-real', 'validation-real-b', 'validation-real-c', 'official-remainder', 'official-all'].includes(suite)) return
  showcase.suite = suite
  updateSuiteUi()
  const cases = activeCases()
  if (!cases.some(item => item.id === showcase.selectedCaseId)) selectCase(cases[0]?.id, { clearQuestion: true })
  else renderCases()
}

function updateSuiteUi() {
  const cases = activeCases()
  document.querySelectorAll('[data-showcase-suite]').forEach(button => {
    const suiteCases = casesForSuite(button.dataset.showcaseSuite)
    const requiresCompleteDataset = button.dataset.showcaseSuite === 'official-all' && !showcase.dataset?.complete
    button.classList.toggle('selected', button.dataset.showcaseSuite === showcase.suite)
    button.disabled = suiteCases.length === 0 || requiresCompleteDataset
    button.title = button.disabled ? 'Install the complete official dataset to enable this partition' : `${suiteCases.length} installed cases`
  })
  const labels = {
    'official-real': ['Twenty official real-image cases', 'RealWorldQA · checksum locked', 'official real'],
    'validation-real': ['Fifty new official real-image cases', 'RealWorldQA · blind stratified validation sample', 'new real'],
    'validation-real-b': ['Fifty additional official real-image cases', 'RealWorldQA · second blind stratified sample', 'more real'],
    'validation-real-c': ['One hundred fifty extended real-image cases', 'RealWorldQA · third blind stratified sample', 'extended real'],
    'official-remainder': ['Four hundred ninety-five final official questions', 'RealWorldQA · every previously untested source row', 'final real'],
    'official-all': ['Complete official RealWorldQA', '765 questions · 762 unique real images', 'official 765']
  }
  const [title, count, shortLabel] = labels[showcase.suite]
  $('#showcase-library-title').textContent = title
  $('#showcase-library-count').textContent = count
  $('#showcase-autoplay').textContent = `Run ${shortLabel} ${cases.length} · ${cases.length * COMPARISON_PROVIDER_IDS.length} inferences`
  $('#showcase-autoplay').disabled = cases.length === 0 || showcase.running || showcase.autoplay
  $('#showcase-cycle-label').textContent = `04 · ${shortLabel.toUpperCase()} ${cases.length}-SCENE CYCLE`
}

function casesForSuite(suite) {
  if (suite === 'official-real') return showcase.cases.filter(item => item.group === 'official-real')
  if (suite === 'validation-real') return showcase.cases.filter(item => item.group === 'validation-real')
  if (suite === 'validation-real-b') return showcase.cases.filter(item => item.group === 'validation-real-b')
  if (suite === 'validation-real-c') return showcase.cases.filter(item => item.group === 'validation-real-c')
  if (suite === 'official-remainder') return showcase.cases.filter(item => item.group === 'official-remainder')
  return showcase.cases.filter(item => OFFICIAL_REAL_GROUPS.includes(item.group))
}

function renderProviders() {
  const select = $('#showcase-provider')
  select.innerHTML = showcase.providers.map(item => `<option value="${escapeHtml(item.id)}" ${item.ready ? '' : 'disabled'}>${escapeHtml(item.model)} · ${escapeHtml(compactVersion(item.modelVersion))}${item.ready ? '' : ' · unavailable'}</option>`).join('')
  const ready = showcase.providers.find(item => item.id === select.value && item.ready) || showcase.providers.find(item => item.ready)
  if (ready) select.value = ready.id
  updateSelectedProviderIdentity()
  renderComparison()
}

function compactVersion(value) {
  const version = String(value || 'version unavailable')
  return version.replace(/([a-f0-9]{12})[a-f0-9]{20,}/gi, '$1…')
}

function updateSelectedProviderIdentity() {
  const provider = showcase.providers.find(item => item.id === $('#showcase-provider')?.value) || showcase.providers.find(item => item.ready)
  if (!provider) {
    setRuntime(false, showcase.providers.map(item => item.reason).filter(Boolean).join(' · ') || 'No local VisionPsy runtime found')
    $('#showcase-runtime-version').textContent = 'MODEL VERSION · UNAVAILABLE'
    return
  }
  setRuntime(provider.ready, `${provider.runtime || 'local runtime'} · ${compactVersion(provider.runtimeVersion)} · ${provider.label}`)
  $('#showcase-runtime-model').textContent = provider.model
  $('#showcase-runtime-version').textContent = `MODEL VERSION · ${compactVersion(provider.modelVersion)}`
}

function renderGroundTruth(item) {
  const panel = $('#showcase-ground-truth')
  panel.classList.toggle('hidden', !item?.expectedAnswer)
  $('#showcase-expected-answer').textContent = item?.expectedAnswer || 'Unscored custom image'
  panel.querySelector('small').textContent = item?.scoring === 'multiple_choice' ? 'RealWorldQA gold · exact option scoring' : 'Custom image · no benchmark score'
}

function clearComparison() {
  showcase.comparison = {}
  showcase.comparisonOrder = []
  const status = $('#showcase-comparison-status')
  if (status) status.textContent = 'READY TO COMPARE'
  renderComparison()
}

function renderComparison() {
  const grid = $('#showcase-comparison-grid')
  if (!grid) return
  grid.innerHTML = COMPARISON_PROVIDER_IDS.map(providerId => {
    const provider = showcase.providers.find(item => item.id === providerId)
    const result = showcase.comparison[providerId] || {}
    const status = result.status || (provider?.ready ? 'ready' : 'unavailable')
    const evaluation = result.evaluation
    const verdict = evaluation?.status || (status === 'complete' ? 'UNSCORED' : status.toUpperCase())
    const output = result.output ? escapeHtml(result.output) : status === 'running' ? 'Waiting for the first token…' : 'Run the same image and question through all four local variants.'
    const metrics = result.metrics || {}
    const resources = metrics.resources || {}
    return `<article class="showcase-compare-card ${status}">
      <header><div><span>${escapeHtml(PROVIDER_BADGES[providerId] || providerId)}</span><b>${escapeHtml(provider?.model || providerId)}</b><small class="showcase-model-version">MODEL VERSION · ${escapeHtml(compactVersion(provider?.modelVersion))}</small></div><strong class="${evaluation?.status?.toLowerCase() || ''}">${escapeHtml(verdict)}</strong></header>
      <div class="showcase-compare-output ${status === 'running' ? 'streaming' : ''}">${output}</div>
      <footer><span>TTFT <b>${formatDuration(metrics.timeToFirstTokenMs)}</b></span><span>Latency <b>${formatDuration(metrics.latencyMs)}</b></span><span>Speed <b>${Number.isFinite(metrics.tokensPerSecond) ? `${metrics.tokensPerSecond.toFixed(1)} tok/s` : '—'}</b></span><span>${Number.isFinite(resources.processRssPeakBytes) ? 'Process RSS' : 'System RAM Δ'} <b>${formatBytes(resources.processRssPeakBytes ?? resources.systemRamDeltaBytes)}</b></span><span>Prompt eval <b>${Number.isFinite(metrics.promptTokens) ? `${metrics.promptTokens} tok` : '—'}</b></span></footer>
    </article>`
  }).join('')
}

function setRuntime(ready, detail) {
  const signal = $('#showcase-runtime-signal')
  signal.className = `showcase-live-signal ${ready ? 'ready' : 'blocked'}`
  signal.innerHTML = `<i></i>${ready ? 'LOCAL RUNTIME READY' : 'LOCAL RUNTIME BLOCKED'}`
  $('#showcase-runtime-detail').textContent = detail
  $('#showcase-run').disabled = !ready
}

function selectCase(id, { clearQuestion = false } = {}) {
  const item = showcase.cases.find(candidate => candidate.id === id)
  if (!item) return
  const imageChanged = showcase.selectedCaseId !== item.id || Boolean(showcase.customImageDataUrl)
  if (imageChanged && showcase.messages.length && !showcase.running) clearConversation()
  showcase.selectedCaseId = item.id
  showcase.customImageDataUrl = null
  showcase.customFilename = null
  $('#showcase-image').src = item.imageUrl
  $('#showcase-image').alt = `${item.title} visual reasoning challenge`
  $('#showcase-image-title').textContent = item.title
  $('#showcase-image-source').textContent = 'OFFICIAL REALWORLDQA'
  $('#showcase-image-meta').textContent = `${item.capability} · public benchmark row ${item.sourceIndex}`
  $('#showcase-suggested-question').textContent = item.prompt
  renderGroundTruth(item)
  clearComparison()
  if (clearQuestion) $('#showcase-question').value = ''
  renderCases()
}

function isRealCase(item) {
  return OFFICIAL_REAL_GROUPS.includes(item?.group)
}

async function useDroppedFile(file) {
  if (!/^image\/(jpeg|png|webp|heic)$/.test(file.type)) return failUi('Use a JPEG, PNG, WebP, or HEIC image.')
  if (!file.size || file.size > 12 * 1024 * 1024) return failUi('The dropped image must be smaller than 12 MB.')
  const dataUrl = await readDataUrl(file)
  if (showcase.messages.length && !showcase.running) clearConversation()
  showcase.selectedCaseId = null
  showcase.customImageDataUrl = dataUrl
  showcase.customFilename = file.name
  $('#showcase-image').src = dataUrl
  $('#showcase-image').alt = file.name
  $('#showcase-image-title').textContent = file.name
  $('#showcase-image-source').textContent = 'LOCAL DROP'
  $('#showcase-image-meta').textContent = `${formatBytes(file.size)} · never uploaded to a cloud service`
  $('#showcase-suggested-question').textContent = 'Write one focused question about the dropped image.'
  renderGroundTruth(null)
  clearComparison()
  $('#showcase-question').value = ''
  renderCases()
  $('#showcase-question').focus()
}

async function runComparison({ orderOffset = null } = {}) {
  if (showcase.running) return
  const item = selectedCase()
  const prompt = $('#showcase-question').value.trim() || item?.prompt || ''
  if (!prompt) { $('#showcase-question').focus(); throw failUi('Type a question before comparing the models.') }
  const offset = orderOffset == null ? showcase.comparisonSequence++ : orderOffset
  const providerOrder = rotate(COMPARISON_PROVIDER_IDS, offset)
  const providers = providerOrder
    .map(id => showcase.providers.find(item => item.id === id))
    .filter(item => item?.ready)
  if (providers.length !== COMPARISON_PROVIDER_IDS.length) throw failUi('Standard Q8, Standard Q4, Flash Q8 and Flash Q4 must all be ready for the four-way comparison.')

  showcase.running = true
  showcase.controller = new AbortController()
  showcase.startedAt = performance.now()
  showcase.timer = setInterval(updateElapsed, 33)
  clearComparison()
  showcase.comparisonOrder = providers.map(provider => provider.id)
  resetKpis()
  setRunningUi(true)
  $('#showcase-question').value = prompt
  try {
    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index]
      showcase.comparison[provider.id] = { status: 'running', output: '', metrics: null, evaluation: null }
      $('#showcase-comparison-status').textContent = `RUNNING ${index + 1} OF ${providers.length} · ${PROVIDER_BADGES[provider.id] || provider.id}`
      setStage(`COMPARING ${PROVIDER_BADGES[provider.id] || provider.id}`, 'running')
      renderComparison()
      const response = await fetch('/api/showcase/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: showcase.controller.signal,
        body: JSON.stringify({
          caseId: showcase.selectedCaseId,
          imageDataUrl: showcase.customImageDataUrl,
          filename: showcase.customFilename,
          prompt,
          conversation: [],
          imageTitle: $('#showcase-image-title').textContent,
          providerId: provider.id,
          maxTokens: item?.scoring === 'multiple_choice' ? 16 : 80
        })
      })
      const result = await consumeNdjson(response, event => handleComparisonEvent(provider.id, event))
      if (!response.ok || result.error) throw new Error(result.error?.error || `${provider.model} failed (${response.status})`)
      if (!result.complete) throw new Error(`${provider.model} closed without a completion event.`)
      const completed = result.complete
      showcase.comparison[provider.id] = { status: 'complete', output: completed.output || '', metrics: completed.metrics || {}, evaluation: completed.evaluation || null }
      applyFinalMetrics(completed.metrics || {})
      renderComparison()
      addHistory({
        imageUrl: $('#showcase-image').src,
        title: `${$('#showcase-image-title').textContent} · ${PROVIDER_BADGES[provider.id] || provider.id}`,
        prompt,
        output: completed.output || '',
        metrics: completed.metrics || {},
        evaluation: completed.evaluation || null
      })
      await wait(350)
    }
    $('#showcase-comparison-status').textContent = `COMPLETE · ORDER ${showcase.comparisonOrder.map(id => PROVIDER_BADGES[id]).join(' → ')}`
    setStage('ALL 4 VARIANTS COMPLETE', 'complete')
    return showcase.comparison
  } catch (error) {
    const active = Object.values(showcase.comparison).find(item => item.status === 'running')
    if (active) { active.status = 'error'; active.output = error.name === 'AbortError' ? 'Comparison cancelled.' : error.message }
    renderComparison()
    if (error.name === 'AbortError') setStage('CANCELLED', 'error')
    else { setStage('COMPARISON FAILED', 'error'); failUi(error.message) }
    throw error
  } finally {
    clearInterval(showcase.timer)
    showcase.timer = null
    showcase.running = false
    showcase.controller = null
    setRunningUi(false)
    updateElapsed()
    const lastCompleted = [...providers].reverse().map(provider => showcase.comparison[provider.id]).find(result => result?.metrics)
    if (lastCompleted) applyFinalMetrics(lastCompleted.metrics)
  }
}

function handleComparisonEvent(providerId, event) {
  const result = showcase.comparison[providerId]
  if (!result) return
  if (event.type === 'token') { result.output += event.token || ''; renderComparison() }
  if (event.type === 'complete') {
    result.output = event.output || result.output
    result.metrics = event.metrics || {}
    result.evaluation = event.evaluation || null
    renderComparison()
  }
}

async function runShowcase() {
  if (showcase.running) return
  const prompt = $('#showcase-question').value.trim()
  if (!prompt) { $('#showcase-question').focus(); throw failUi('Type a question before running VisionPsy.') }
  const providerId = $('#showcase-provider').value
  if (!providerId) throw failUi('No ready VisionPsy runtime is selected.')
  const conversation = showcase.messages
    .filter(message => !message.pending && !message.error)
    .slice(-6)
    .map(message => ({ role: message.role, content: message.content, imageTitle: message.imageTitle || null }))
  const userMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: prompt,
    imageUrl: $('#showcase-image').src,
    imageTitle: $('#showcase-image-title').textContent
  }
  const assistantMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', pending: true, metrics: null }
  showcase.messages.push(userMessage, assistantMessage)
  showcase.activeAssistantId = assistantMessage.id
  renderConversation()
  $('#showcase-question').value = ''
  showcase.running = true
  showcase.output = ''
  showcase.currentMetrics = {}
  showcase.livePeaks = {}
  showcase.controller = new AbortController()
  showcase.startedAt = performance.now()
  resetKpis()
  setRunningUi(true)
  setStage('PREPARING IMAGE', 'running')
  showcase.timer = setInterval(updateElapsed, 33)
  updateElapsed()
  let completed = null
  try {
    const response = await fetch('/api/showcase/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: showcase.controller.signal,
      body: JSON.stringify({
        caseId: showcase.selectedCaseId,
        imageDataUrl: showcase.customImageDataUrl,
        filename: showcase.customFilename,
        prompt,
        conversation,
        imageTitle: userMessage.imageTitle,
        providerId,
        maxTokens: selectedCase()?.scoring === 'multiple_choice' ? 16 : 80
      })
    })
    const result = await consumeNdjson(response, handleStreamEvent)
    completed = result.complete
    if (!response.ok || result.error) throw new Error(result.error?.error || `VisionPsy request failed (${response.status})`)
    if (!completed) throw new Error('The local runtime closed without a completion event.')
    showcase.currentMetrics = completed.metrics || {}
    applyFinalMetrics(completed.metrics || {})
    assistantMessage.content = completed.output || showcase.output
    assistantMessage.pending = false
    assistantMessage.metrics = completed.metrics || {}
    assistantMessage.evaluation = completed.evaluation || null
    renderConversation()
    setStage('COMPLETE', 'complete')
    addHistory({
      imageUrl: $('#showcase-image').src,
      title: $('#showcase-image-title').textContent,
      prompt,
      output: completed.output || showcase.output,
      metrics: completed.metrics || {},
      evaluation: completed.evaluation || null
    })
    return completed
  } catch (error) {
    assistantMessage.pending = false
    assistantMessage.error = true
    assistantMessage.content = error.name === 'AbortError' ? 'Generation cancelled.' : `Local run failed: ${error.message}`
    renderConversation()
    if (error.name === 'AbortError') setStage('CANCELLED', 'error')
    else { setStage('FAILED', 'error'); failUi(error.message) }
    throw error
  } finally {
    clearInterval(showcase.timer)
    showcase.timer = null
    showcase.running = false
    showcase.controller = null
    showcase.activeAssistantId = null
    setRunningUi(false)
    updateElapsed()
  }
}

function handleStreamEvent(event) {
  if (event.type === 'started') setStage('STARTING LOCAL RUNTIME', 'running')
  if (event.type === 'trace') handleTrace(event.event)
  if (event.type === 'token') {
    showcase.output += event.token || ''
    const message = activeAssistantMessage()
    if (message) message.content = showcase.output
    renderConversation()
    setStage('STREAMING ANSWER', 'running')
  }
  if (event.type === 'telemetry') applyLiveTelemetry(event.sample || {})
  if (event.type === 'complete') {
    showcase.output = event.output || showcase.output
    const message = activeAssistantMessage()
    if (message) message.content = showcase.output
    renderConversation()
  }
}

function handleTrace(event = {}) {
  const label = ({
    provider_invocation_start: 'STARTING LOCAL RUNTIME',
    runtime_process_start: 'LOADING MODEL INTO METAL',
    runtime_process_reuse: 'REUSING WARM MODEL',
    model_ready: 'MODEL READY',
    inference_image_read_start: 'READING IMAGE LOCALLY',
    prompt_sent: 'ENCODING IMAGE + PROMPT',
    response_headers: 'WAITING FOR FIRST TOKEN',
    first_token: 'STREAMING ANSWER',
    provider_invocation_end: 'FINALIZING METRICS'
  })[event.stage]
  if (label) setStage(label, 'running')
  if (Number.isFinite(event.timeToFirstTokenMs)) $('#showcase-kpi-ttft').textContent = formatDuration(event.timeToFirstTokenMs)
}

function applyLiveTelemetry(sample) {
  const max = (key, value) => { if (Number.isFinite(value)) showcase.livePeaks[key] = Math.max(showcase.livePeaks[key] || 0, value) }
  max('rss', sample.processRssBytes)
  max('cpu', sample.processCpuPercent)
  max('gpu', sample.gpuUtilizationPercent)
  max('gpuMemory', sample.gpuMemoryUsedBytes)
  if (showcase.livePeaks.rss) $('#showcase-kpi-ram').textContent = formatBytes(showcase.livePeaks.rss)
  if (showcase.livePeaks.cpu) $('#showcase-kpi-cpu').textContent = `${showcase.livePeaks.cpu.toFixed(0)}%`
  if (Number.isFinite(showcase.livePeaks.gpu)) $('#showcase-kpi-gpu').textContent = `${showcase.livePeaks.gpu.toFixed(0)}%`
  if (showcase.livePeaks.gpuMemory) $('#showcase-kpi-gpu-memory').textContent = formatBytes(showcase.livePeaks.gpuMemory)
}

function applyFinalMetrics(metrics) {
  const resources = metrics.resources || {}
  $('#showcase-kpi-ttft').textContent = formatDuration(metrics.timeToFirstTokenMs)
  $('#showcase-kpi-latency').textContent = formatDuration(metrics.latencyMs)
  $('#showcase-kpi-tps').textContent = Number.isFinite(metrics.tokensPerSecond) ? metrics.tokensPerSecond.toFixed(1) : '—'
  $('#showcase-kpi-tokens').textContent = Number.isFinite(metrics.outputTokens) ? String(metrics.outputTokens) : '—'
  $('#showcase-kpi-ram').textContent = formatBytes(resources.processRssPeakBytes)
  $('#showcase-kpi-cpu').textContent = Number.isFinite(resources.processCpuPeakPercent) ? `${resources.processCpuPeakPercent.toFixed(0)}%` : '—'
  $('#showcase-kpi-gpu').textContent = Number.isFinite(resources.gpuUtilizationPeakPercent) ? `${resources.gpuUtilizationPeakPercent.toFixed(0)}%` : '—'
  $('#showcase-kpi-gpu-memory').textContent = formatBytes(resources.gpuMemoryUsedPeakBytes)
  $('#showcase-run-footnote').textContent = `${metrics.serverReused ? 'Warm model reuse' : 'Cold model start'}${Number.isFinite(metrics.coldStartMs) ? ` · load ${formatDuration(metrics.coldStartMs)}` : ''} · ${metrics.backend || 'local backend'}${Number.isFinite(metrics.gpuLayers) ? ` · ${metrics.gpuLayers} GPU layers` : ''}${Number.isFinite(metrics.promptTokens) ? ` · ${metrics.promptTokens} prompt-evaluated tokens` : ''}${metrics.preprocessPolicy ? ` · ${metrics.preprocessPolicy}` : ''} · ${resources.sampleCount || 0} telemetry samples. GPU values are system-wide macOS IOAccelerator samples.`
}

function renderConversation() {
  const conversation = $('#showcase-conversation')
  if (!showcase.messages.length) {
    conversation.innerHTML = `<div class="showcase-chat-empty"><span>VP</span><div><b>VisionPsy is ready.</b><p>Choose or drop an image, then send a message. Follow-up questions will keep the local conversation context.</p></div></div>`
    return
  }
  conversation.innerHTML = showcase.messages.map(message => {
    if (message.role === 'user') {
      const image = message.imageUrl ? `<img src="${escapeHtml(message.imageUrl)}" alt="${escapeHtml(message.imageTitle || 'Attached image')}">` : ''
      return `<article class="showcase-message user"><div class="showcase-message-label">YOU</div><div class="showcase-message-body">${image}<div><small>${escapeHtml(message.imageTitle || 'Current image')}</small><p>${escapeHtml(message.content)}</p></div></div></article>`
    }
    const resources = message.metrics?.resources || {}
    const verdict = message.evaluation ? `<span class="showcase-inline-verdict ${message.evaluation.status.toLowerCase()}">${escapeHtml(message.evaluation.status)} · expected ${escapeHtml(message.evaluation.expectedAnswer)}</span>` : ''
    const metrics = message.metrics ? `<div class="showcase-message-metrics">${verdict}<span>TTFT ${formatDuration(message.metrics.timeToFirstTokenMs)}</span><span>${Number.isFinite(message.metrics.tokensPerSecond) ? `${message.metrics.tokensPerSecond.toFixed(1)} tok/s` : 'tok/s —'}</span><span>${formatBytes(resources.processRssPeakBytes)} RSS</span></div>` : ''
    const content = message.content ? escapeHtml(message.content) : 'Waiting for the local model…'
    return `<article class="showcase-message assistant ${message.pending ? 'streaming' : ''} ${message.error ? 'error' : ''}"><div class="showcase-message-label"><span>VP</span>VISIONPSY · LOCAL</div><div class="showcase-message-body"><p>${content}</p></div>${metrics}</article>`
  }).join('')
  conversation.scrollTop = conversation.scrollHeight
}

function activeAssistantMessage() {
  return showcase.messages.find(message => message.id === showcase.activeAssistantId) || null
}

function clearConversation() {
  showcase.messages = []
  showcase.activeAssistantId = null
  showcase.output = ''
  renderConversation()
  setStage('READY', '')
  $('#showcase-live-time').textContent = '0.00 s'
  for (const id of ['ttft', 'latency', 'tps', 'tokens', 'ram', 'cpu', 'gpu', 'gpu-memory']) $(`#showcase-kpi-${id}`).textContent = '—'
  $('#showcase-run-footnote').textContent = 'No measurement yet. The first run may include model cold start.'
}

async function startLiveDemo(mode = 'benchmark') {
  if (liveDemo.running || showcase.running || showcase.autoplay) return
  const replayingDogResults = mode === 'dogs-replay'
  const dogMode = mode === 'dogs' || replayingDogResults
  const scenes = await buildLiveDemoScenes(dogMode ? 'dogs' : mode)
  const readyProviders = COMPARISON_PROVIDER_IDS.map(id => showcase.providers.find(item => item.id === id)).filter(item => item?.ready)
  const expectedSceneCount = dogMode ? 4 : 3
  if (scenes.length !== expectedSceneCount) throw new Error(`The ${expectedSceneCount} prepared live-demo scenes are unavailable.`)
  if (!replayingDogResults && readyProviders.length !== COMPARISON_PROVIDER_IDS.length) throw new Error('All four local VisionPsy variants must be ready before the live demo starts.')

  liveDemo.running = true
  liveDemo.mode = mode
  liveDemo.abort = false
  liveDemo.sceneIndex = 0
  liveDemo.scenes = scenes
  liveDemo.activeCase = scenes[0]
  liveDemo.finalCard = false
  liveDemo.results = []
  liveDemo.introCard = false
  liveDemo.introPage = 0
  liveDemo.introPageStartedAt = null
  liveDemo.introTransition = 'in'
  liveDemo.introTransitionStartedAt = null
  liveDemo.phase = `PREPARING ${expectedSceneCount} REAL IMAGES`
  liveDemo.typedQuestion = ''
  liveDemo.cards = emptyLiveDemoCards()
  liveDemo.cursor = { x: 1460, y: 62, clickAt: 0 }
  liveDemo.startedAt = performance.now()
  liveDemo.completedElapsedMs = null
  liveDemo.recordingChunks = []
  $('#showcase-demo-overlay').classList.remove('hidden')
  $('#showcase-demo-canvas').classList.remove('hidden')
  $('#showcase-demo-video').classList.add('hidden')
  $('#showcase-demo-stop').classList.remove('hidden')
  $('#showcase-demo-replay').classList.add('hidden')
  $('#showcase-demo-download').classList.add('hidden')
  for (const button of ['#showcase-live-demo', '#showcase-live-demo-3']) $(button).disabled = true
  $('#showcase-demo-heading').textContent = dogMode ? 'Scenario 1 · Dog stories' : 'Scenario 2 · RealWorldQA cycle'
  $('#showcase-demo-mode-label').lastChild.textContent = replayingDogResults ? 'REPLAY · PREVIOUSLY RECORDED RESULTS' : 'LIVE · NEW LOCAL INFERENCE'
  $('.showcase-demo-window').classList.toggle('replay', replayingDogResults)
  $('#showcase-demo-note').textContent = `Preparing ${expectedSceneCount} real images…`
  document.body.classList.add('showcase-demo-open')
  startLiveDemoRenderLoop()

  try {
    await preloadLiveDemoImages(scenes)
    if (dogMode) {
      liveDemo.introCard = true
      liveDemo.introPage = 0
      liveDemo.introPageStartedAt = performance.now()
      liveDemo.introTransition = 'in'
      liveDemo.phase = 'INTRO · FOUR REAL PHOTOS · FOUR NATURAL QUESTIONS'
      drawLiveDemoFrame()
    }
    await beginLiveDemoRecording()
    liveDemo.recordingStartedAt = performance.now()
    if (dogMode) liveDemo.introPageStartedAt = liveDemo.recordingStartedAt
    await startLocalFrameCapture()
    liveDemo.introEndedAtMs = null
    liveDemo.popupStartedAtMs = null
    $('#showcase-demo-note').textContent = 'REC · canvas recording active · all inference stays local'

    if (dogMode) {
      await moveLiveDemoCursor(1470, 70, 420)
      await waitForLiveDemo(7200)
      liveDemo.introTransition = 'out'
      liveDemo.introTransitionStartedAt = performance.now()
      await waitForLiveDemo(700)
      liveDemo.introPage = 1
      liveDemo.introPageStartedAt = performance.now()
      liveDemo.introTransition = 'in'
      liveDemo.introTransitionStartedAt = null
      liveDemo.phase = 'INTRO · FOUR LOCAL VARIANTS · ONE FAIR COMPARISON'
      await waitForLiveDemo(7200)
      await moveLiveDemoCursor(800, 754, 820)
      await pulseLiveDemoClick()
      await waitForLiveDemo(900)
      liveDemo.introCard = false
      liveDemo.introEndedAtMs = performance.now() - liveDemo.recordingStartedAt
    }

    for (let index = 0; index < scenes.length; index += 1) {
      if (liveDemo.abort) throw new DOMException('Live demo stopped', 'AbortError')
      const item = scenes[index]
      liveDemo.sceneIndex = index
      liveDemo.activeCase = item
      liveDemo.typedQuestion = ''
      liveDemo.cards = emptyLiveDemoCards()
      liveDemo.phase = `SCENE ${index + 1} · SELECTING REAL IMAGE`
      const compactThumbnails = scenes.length > 3
      const thumbnailStep = compactThumbnails ? LIVE_DEMO_COMPACT_LAYOUT.thumbnailStep : 160
      const firstThumbnailCenter = compactThumbnails ? LIVE_DEMO_COMPACT_LAYOUT.thumbnailStartX + (LIVE_DEMO_COMPACT_LAYOUT.thumbnailWidth / 2) : 104
      await moveLiveDemoCursor(firstThumbnailCenter + (index * thumbnailStep), 128, 650)
      await pulseLiveDemoClick()
      await waitForLiveDemo(420)

      liveDemo.phase = item.demoKind === 'official'
        ? 'INSERTING OFFICIAL REALWORLDQA QUESTION'
        : item.demoKind === 'open'
          ? 'INSERTING OPEN VISUAL QUESTION'
          : item.demoKind === 'dog-rubric'
            ? 'INSERTING NATURAL PERSONAL-PHOTO QUESTION'
            : 'INSERTING TWO-POINT CHART QUESTION'
      await moveLiveDemoCursor(205, 802, 720)
      await pulseLiveDemoClick()
      await typeLiveDemoQuestion(item.prompt)
      await waitForLiveDemo(350)

      liveDemo.phase = 'CLICKING RUN · SAME INPUT FOR ALL MODELS'
      await moveLiveDemoCursor(360, 802, 620)
      await pulseLiveDemoClick()
      await waitForLiveDemo(300)

      const providerOrder = rotate(COMPARISON_PROVIDER_IDS, index)
      for (const providerId of providerOrder) {
        if (liveDemo.abort) throw new DOMException('Live demo stopped', 'AbortError')
        if (replayingDogResults) await replayLiveDemoProvider(item, providerId)
        else await runLiveDemoProvider(item, providerId)
      }
      liveDemo.results.push({
        id: item.id,
        title: item.title,
        providers: Object.fromEntries(COMPARISON_PROVIDER_IDS.map(providerId => {
          const card = liveDemo.cards[providerId]
          return [providerId, { ...card, metrics: { ...(card.metrics || {}) }, evaluation: card.evaluation ? { ...card.evaluation } : null }]
        }))
      })
      liveDemo.phase = `SCENE ${index + 1} COMPLETE · 4/4 LOCAL ANSWERS`
      await moveLiveDemoCursor(1470, 70, 520)
      await waitForLiveDemo(1500)
    }

    if (dogMode) {
      liveDemo.completedElapsedMs = replayingDogResults ? 99_740 : performance.now() - liveDemo.startedAt
      liveDemo.popupStartedAtMs = performance.now() - liveDemo.recordingStartedAt
      liveDemo.finalCard = 'kpis'
      liveDemo.phase = replayingDogResults ? 'FINAL POPUP · RECORDED FOUR-SCENE KPIS' : 'FINAL POPUP · MEASURED FOUR-SCENE KPIS'
      await moveLiveDemoCursor(1470, 70, 520)
      await waitForLiveDemo(8500)
    }
    liveDemo.phase = replayingDogResults ? 'REPLAY COMPLETE · 4 PERSONAL PHOTOS · 16 RECORDED RESULTS' : dogMode ? 'SCENARIO 1 COMPLETE · 4 PERSONAL PHOTOS · 16 LIVE INFERENCES' : 'SCENARIO 2 COMPLETE · 3 IMAGES · 12 LIVE INFERENCES'
    await waitForLiveDemo(2200)
    $('#showcase-demo-note').textContent = 'Complete · the downloadable recording was generated locally.'
  } catch (error) {
    if (error.name === 'AbortError') {
      liveDemo.phase = 'DEMO STOPPED'
      $('#showcase-demo-note').textContent = 'Demo stopped. A partial recording is available.'
    } else {
      liveDemo.phase = 'LIVE DEMO ERROR'
      $('#showcase-demo-note').textContent = error.message
      throw error
    }
  } finally {
    liveDemo.controller?.abort()
    liveDemo.controller = null
    stopLiveDemoRecording()
    liveDemo.running = false
    $('#showcase-demo-stop').classList.add('hidden')
    $('#showcase-live-demo').disabled = !showcase.dataset?.complete
    $('#showcase-live-demo-3').disabled = false
    drawLiveDemoFrame()
    await stopLocalFrameCapture()
  }
}

async function startLiveDemo3() {
  return startLiveDemo('dogs')
}

async function startLiveDemo3Replay() {
  return startLiveDemo('dogs-replay')
}

async function buildLiveDemoScenes(mode) {
  if (mode === 'dogs') {
    return Promise.all(LIVE_DEMO_3_SCENES.map(async item => ({
      ...item,
      caseId: item.id,
      imageDataUrl: await showcaseImageDataUrl(item.imageUrl),
      sourceLabel: 'PERSONAL REAL PHOTO · LOCAL ONLY',
      maxTokens: 80
    })))
  }
  return LIVE_DEMO_CASE_IDS.map(id => showcase.cases.find(item => item.id === id)).filter(Boolean).map(item => ({
    ...item,
    caseId: item.id,
    demoKind: 'official',
    questionLabel: 'OFFICIAL QUESTION · INSERTED AUTOMATICALLY',
    sourceLabel: 'REALWORLDQA · REAL IMAGE',
    maxTokens: 16
  }))
}

async function showcaseImageDataUrl(imageUrl) {
  const response = await fetch(imageUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Unable to load personal demo image (${response.status}).`)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Unable to prepare personal demo image.'))
    reader.readAsDataURL(blob)
  })
}

function emptyLiveDemoCards() {
  return Object.fromEntries(COMPARISON_PROVIDER_IDS.map(id => [id, { status: 'ready', output: '', metrics: null, evaluation: null }]))
}

async function preloadLiveDemoImages(cases) {
  await Promise.all(cases.map(item => new Promise((resolve, reject) => {
    const cached = liveDemo.images.get(item.id)
    if (cached?.complete) return resolve(cached)
    const image = new Image()
    image.onload = () => { liveDemo.images.set(item.id, image); resolve(image) }
    image.onerror = () => reject(new Error(`Unable to load demo image: ${item.title}`))
    image.src = item.imageUrl
  })))
}

async function runLiveDemoProvider(item, providerId) {
  const provider = showcase.providers.find(candidate => candidate.id === providerId)
  const card = liveDemo.cards[providerId]
  card.status = 'running'
  card.output = ''
  card.metrics = null
  card.evaluation = null
  liveDemo.phase = `RUNNING ${PROVIDER_BADGES[providerId]} · REAL LOCAL STREAM`
  liveDemo.controller = new AbortController()
  try {
    const response = await fetch('/api/showcase/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: liveDemo.controller.signal,
      body: JSON.stringify({
        caseId: item.caseId || item.id,
        imageDataUrl: item.imageDataUrl || null,
        filename: item.filename || null,
        prompt: item.prompt,
        conversation: [],
        imageTitle: item.title,
        providerId,
        maxTokens: item.maxTokens || 16
      })
    })
    const result = await consumeNdjson(response, event => {
      if (event.type === 'token') card.output += event.token || ''
      if (event.type === 'trace' && event.event?.stage === 'first_token') liveDemo.phase = `STREAMING ${PROVIDER_BADGES[providerId]} · FIRST TOKEN RECEIVED`
      if (event.type === 'complete') {
        card.output = event.output || card.output
        card.metrics = event.metrics || {}
        card.evaluation = evaluateLiveDemoAnswer(item, card.output, event.evaluation)
      }
    })
    if (!response.ok || result.error) throw new Error(result.error?.error || `${provider?.model || providerId} failed (${response.status})`)
    if (!result.complete) throw new Error(`${provider?.model || providerId} closed without a completion event.`)
    card.status = 'complete'
  } catch (error) {
    if (error.name === 'AbortError') throw error
    card.status = 'error'
    card.output = error.message
  } finally {
    liveDemo.controller = null
  }
}

async function replayLiveDemoProvider(item, providerId) {
  const replay = LIVE_DEMO_3_REPLAY_RESULTS[item.id]?.[providerId]
  if (!replay) throw new Error(`Missing recorded Demo 3 result for ${item.id} / ${providerId}.`)
  const card = liveDemo.cards[providerId]
  card.status = 'running'
  card.output = ''
  card.metrics = null
  card.evaluation = null
  liveDemo.phase = `RUNNING ${PROVIDER_BADGES[providerId]} · RECORDED REAL LOCAL STREAM`
  const acceleratedLatencyMs = replay.latencyMs / liveDemoReplaySpeed
  const firstTokenDelayMs = Math.min(acceleratedLatencyMs * .72, replay.timeToFirstTokenMs / liveDemoReplaySpeed)
  await wait(firstTokenDelayMs)
  liveDemo.phase = `STREAMING ${PROVIDER_BADGES[providerId]} · FIRST TOKEN RECEIVED`
  const words = replay.output.split(/(\s+)/)
  const streamDurationMs = Math.max(220, acceleratedLatencyMs - firstTokenDelayMs)
  const wordDelayMs = Math.max(12, streamDurationMs / Math.max(1, words.length))
  for (const word of words) {
    if (liveDemo.abort) throw new DOMException('Live demo stopped', 'AbortError')
    card.output += word
    await wait(wordDelayMs)
  }
  card.metrics = {
    timeToFirstTokenMs: replay.timeToFirstTokenMs,
    latencyMs: replay.latencyMs,
    tokensPerSecond: replay.tokensPerSecond,
    outputTokens: replay.outputTokens
  }
  card.evaluation = evaluateLiveDemoAnswer(item, replay.output, null)
  card.status = 'complete'
}

function evaluateLiveDemoAnswer(item, output, serverEvaluation) {
  if (item.demoKind === 'open') return { status: 'OPEN', detail: 'Illustrative answer · human review' }
  if (item.demoKind === 'dog-rubric') return evaluateDogDemoAnswer(item, output)
  if (item.demoKind !== 'chart-rubric') return serverEvaluation || null
  const text = String(output || '').toLowerCase()
  const categoryPoint = /beauty\s*(?:and|&)\s*cosmetics/.test(text) ? 1 : 0
  const percentagePoint = /(?:^|\D)28(?:\.0+)?\s*(?:%|percent)/.test(text) ? 1 : 0
  const points = categoryPoint + percentagePoint
  return { status: `${points}/2`, detail: `${categoryPoint ? 'category ✓' : 'category ✕'} · ${percentagePoint ? '28% ✓' : '28% ✕'}`, points }
}

function evaluateDogDemoAnswer(item, output) {
  const text = String(output || '').toLowerCase()
  const rules = {
    'personal-dog-3': [
      ['left white + brown', /left[^.]{0,120}(?:(?:white[^.]{0,40}brown)|(?:brown[^.]{0,40}white))/],
      ['clear coat contrast', /(?:(?:long|fluffy|wavy)[^.]{0,140}(?:short|smooth))|(?:right[^.]{0,100}(?:tan|reddish))/]
    ],
    'personal-dog-1': [
      ['asleep', /\b(?:asleep|sleeping|napping|nap)\b/],
      ['tiled floor', /\b(?:tile|tiled|tiles)\b/]
    ],
    'personal-dog-2': [
      ['blanket', /\b(?:blanket|picnic rug|throw)\b/],
      ['orange harness', /(?:orange[^.]{0,50}harness)|(?:harness[^.]{0,50}orange)/]
    ],
    'personal-dog-5': [
      ['two dogs', /\b(?:two|2)\s+dogs?\b/],
      ['leash', /\b(?:leash|lead|retractable lead)\b/]
    ]
  }[item.id] || []
  const checks = rules.map(([label, pattern]) => ({ label, pass: pattern.test(text) }))
  const points = checks.filter(check => check.pass).length
  return {
    status: `${points}/${checks.length || 2}`,
    detail: checks.map(check => `${check.label} ${check.pass ? '✓' : '✕'}`).join(' · '),
    points,
    maxPoints: checks.length || 2
  }
}

async function beginLiveDemoRecording() {
  if (useLocalFrameCapture) return
  const canvas = $('#showcase-demo-canvas')
  if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
    $('#showcase-demo-note').textContent = 'Live autoplay is active; this browser cannot encode the canvas recording.'
    return
  }
  const mimeType = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/webm;codecs=vp9',
    'video/mp4'
  ].find(type => MediaRecorder.isTypeSupported?.(type)) || ''
  const canvasStream = canvas.captureStream(30)
  let recordingStream = canvasStream
  if (liveDemo.mode === 'dogs') {
    const musicTrack = await createDogDemoMusicTrack()
    if (musicTrack) recordingStream = new MediaStream([...canvasStream.getVideoTracks(), musicTrack])
  } else if (liveDemo.mode === 'dogs-replay') {
    const musicTrack = await createDogDemoReplayMusicTrack()
    if (musicTrack) recordingStream = new MediaStream([...canvasStream.getVideoTracks(), musicTrack])
  }
  const recorderOptions = {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: liveDemo.mode === 'dogs-replay' ? 16_000_000 : 8_000_000,
    audioBitsPerSecond: 128_000,
    ...(liveDemo.mode === 'dogs-replay' ? { videoKeyFrameIntervalCount: 1 } : {})
  }
  const recorder = new MediaRecorder(recordingStream, recorderOptions)
  liveDemo.recorder = recorder
  recorder.ondataavailable = event => { if (event.data?.size) liveDemo.recordingChunks.push(event.data) }
  recorder.onstop = () => {
    if (!liveDemo.recordingChunks.length) return
    if (liveDemo.videoUrl) URL.revokeObjectURL(liveDemo.videoUrl)
    const blob = new Blob(liveDemo.recordingChunks, { type: recorder.mimeType || 'video/webm' })
    liveDemo.videoUrl = URL.createObjectURL(blob)
    const video = $('#showcase-demo-video')
    const download = $('#showcase-demo-download')
    video.src = liveDemo.videoUrl
    video.load()
    download.href = liveDemo.videoUrl
    download.dataset.introEndedAt = Number.isFinite(liveDemo.introEndedAtMs) ? (liveDemo.introEndedAtMs / 1000).toFixed(3) : ''
    download.dataset.popupStartedAt = Number.isFinite(liveDemo.popupStartedAtMs) ? (liveDemo.popupStartedAtMs / 1000).toFixed(3) : ''
    const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
    const demoName = ['dogs', 'dogs-replay'].includes(liveDemo.mode) ? 'dog-stories' : 'realworldqa'
    download.download = `visionpsy-live-demo-${demoName}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`
    download.classList.remove('hidden')
    $('#showcase-demo-replay').classList.remove('hidden')
    void stopLiveDemoMusic()
  }
  recorder.start(1000)
}

async function startLocalFrameCapture() {
  if (!useLocalFrameCapture || liveDemo.mode !== 'dogs-replay') return
  localFrameCapture.running = true
  localFrameCapture.runId = `dog-demo-${Date.now()}`
  localFrameCapture.frameIndex = 0
  localFrameCapture.startedAt = performance.now()
  localFrameCapture.timestampsMs = []
  const canvas = $('#showcase-demo-canvas')
  const intervalMs = 50
  localFrameCapture.loopPromise = (async () => {
    while (localFrameCapture.running) {
      const targetAt = localFrameCapture.startedAt + (localFrameCapture.frameIndex * intervalMs)
      const waitMs = targetAt - performance.now()
      if (waitMs > 1) await wait(waitMs)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (!blob) throw new Error('The clean canvas frame could not be encoded.')
      const elapsedMs = performance.now() - localFrameCapture.startedAt
      const index = localFrameCapture.frameIndex
      const response = await fetch(`/api/showcase/capture-frame?run=${encodeURIComponent(localFrameCapture.runId)}&index=${index}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob
      })
      if (!response.ok) throw new Error(`Clean frame capture failed (${response.status}).`)
      localFrameCapture.timestampsMs.push(elapsedMs)
      localFrameCapture.frameIndex += 1
    }
  })()
}

async function stopLocalFrameCapture() {
  if (!localFrameCapture.running) return
  localFrameCapture.running = false
  await localFrameCapture.loopPromise
  const elapsedMs = performance.now() - localFrameCapture.startedAt
  await fetch(`/api/showcase/capture-frame?run=${encodeURIComponent(localFrameCapture.runId)}&kind=manifest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      runId: localFrameCapture.runId,
      frameCount: localFrameCapture.frameIndex,
      targetFps: 20,
      elapsedMs,
      timestampsMs: localFrameCapture.timestampsMs,
      introEndedAtMs: liveDemo.introEndedAtMs,
      popupStartedAtMs: liveDemo.popupStartedAtMs
    })
  })
}

async function createDogDemoMusicTrack() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  const context = new AudioContextClass({ sampleRate: 48_000 })
  await context.resume()
  const destination = context.createMediaStreamDestination()
  const master = context.createGain()
  master.gain.value = 0.34
  master.connect(destination)

  const dry = context.createGain()
  const wet = context.createGain()
  const reverb = context.createConvolver()
  const impulseLength = Math.floor(context.sampleRate * 3.2)
  const impulse = context.createBuffer(2, impulseLength, context.sampleRate)
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel)
    for (let index = 0; index < impulseLength; index += 1) data[index] = (Math.random() * 2 - 1) * Math.pow(1 - (index / impulseLength), 3.8)
  }
  reverb.buffer = impulse
  dry.gain.value = 0.72
  wet.gain.value = 0.24
  dry.connect(master)
  reverb.connect(wet).connect(master)

  const connectSoftly = (source, pan = 0) => {
    const filter = context.createBiquadFilter()
    const panner = context.createStereoPanner()
    filter.type = 'lowpass'
    filter.frequency.value = 1650
    filter.Q.value = 0.35
    panner.pan.value = pan
    source.connect(filter).connect(panner)
    panner.connect(dry)
    panner.connect(reverb)
  }

  const chords = [
    [130.81, 164.81, 196.00, 246.94],
    [110.00, 130.81, 164.81, 196.00],
    [87.31, 130.81, 174.61, 220.00],
    [98.00, 146.83, 196.00, 246.94]
  ]
  const softNotes = [392.00, 440.00, 493.88, 329.63, 392.00, 293.66, 329.63, 261.63]
  const start = context.currentTime + 0.05
  const duration = 125
  liveDemo.musicNodes = []

  for (let chordIndex = 0; chordIndex * 8 < duration; chordIndex += 1) {
    const at = start + (chordIndex * 8)
    for (const [toneIndex, frequency] of chords[chordIndex % chords.length].entries()) {
      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      oscillator.detune.value = (toneIndex - 1.5) * 1.7
      envelope.gain.setValueAtTime(0.0001, at)
      envelope.gain.linearRampToValueAtTime(0.034, at + 1.8)
      envelope.gain.setValueAtTime(0.034, at + 5.2)
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 8.8)
      connectSoftly(envelope, (toneIndex - 1.5) * 0.12)
      oscillator.connect(envelope)
      oscillator.start(at)
      oscillator.stop(at + 9)
      liveDemo.musicNodes.push(oscillator)
    }
  }

  for (let noteIndex = 0; noteIndex * 4.1 < duration; noteIndex += 1) {
    const at = start + 2.3 + (noteIndex * 4.1)
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = softNotes[noteIndex % softNotes.length]
    envelope.gain.setValueAtTime(0.0001, at)
    envelope.gain.linearRampToValueAtTime(0.042, at + 0.16)
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 2.9)
    connectSoftly(envelope, noteIndex % 2 ? 0.18 : -0.18)
    oscillator.connect(envelope)
    oscillator.start(at)
    oscillator.stop(at + 3.1)
    liveDemo.musicNodes.push(oscillator)
  }

  liveDemo.audioContext = context
  return destination.stream.getAudioTracks()[0] || null
}

async function createDogDemoReplayMusicTrack() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  const context = new AudioContextClass({ sampleRate: 48_000 })
  await context.resume()
  const destination = context.createMediaStreamDestination()
  const gain = context.createGain()
  const audio = new Audio('/showcase/music-previews/real/01-soul-jazz-francisco-alvear.mp3')
  audio.preload = 'auto'
  try {
    await new Promise((resolve, reject) => {
      audio.addEventListener('canplaythrough', resolve, { once: true })
      audio.addEventListener('error', () => reject(new Error('Optional Soul Jazz track is unavailable.')), { once: true })
      audio.load()
    })
  } catch {
    await context.close().catch(() => {})
    return createDogDemoMusicTrack()
  }
  const source = context.createMediaElementSource(audio)
  const now = context.currentTime
  source.connect(gain)
  gain.connect(destination)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.18, now + 1.6)
  gain.gain.setValueAtTime(0.18, now + 76)
  gain.gain.linearRampToValueAtTime(0, now + 80)
  await audio.play()
  liveDemo.musicElement = audio
  liveDemo.musicNodes = []
  liveDemo.audioContext = context
  return destination.stream.getAudioTracks()[0] || null
}

async function stopLiveDemoMusic() {
  if (liveDemo.musicElement) {
    liveDemo.musicElement.pause()
    liveDemo.musicElement.removeAttribute('src')
    liveDemo.musicElement.load()
  }
  liveDemo.musicElement = null
  for (const node of liveDemo.musicNodes) { try { node.stop() } catch {} }
  liveDemo.musicNodes = []
  if (liveDemo.audioContext && liveDemo.audioContext.state !== 'closed') await liveDemo.audioContext.close().catch(() => {})
  liveDemo.audioContext = null
}

function stopLiveDemoRecording() {
  if (liveDemo.recorder?.state === 'recording') liveDemo.recorder.stop()
  liveDemo.recorder = null
}

function stopLiveDemo() {
  liveDemo.abort = true
  liveDemo.controller?.abort()
  liveDemo.phase = 'STOPPING LIVE DEMO…'
}

function closeLiveDemo() {
  if (liveDemo.running) stopLiveDemo()
  $('#showcase-demo-overlay').classList.add('hidden')
  document.body.classList.remove('showcase-demo-open')
  if (liveDemo.animationFrame) cancelAnimationFrame(liveDemo.animationFrame)
  liveDemo.animationFrame = null
  $('#showcase-demo-video').pause()
}

function replayLiveDemo() {
  if (!liveDemo.videoUrl) return
  $('#showcase-demo-canvas').classList.add('hidden')
  const video = $('#showcase-demo-video')
  video.classList.remove('hidden')
  video.currentTime = 0
  void video.play()
}

function showLiveDemoError(error) {
  liveDemo.running = false
  liveDemo.phase = 'LIVE DEMO ERROR'
  $('#showcase-demo-overlay').classList.remove('hidden')
  $('#showcase-demo-note').textContent = error.message
  $('#showcase-demo-stop').classList.add('hidden')
  $('#showcase-live-demo').disabled = !showcase.dataset?.complete
  $('#showcase-live-demo-3').disabled = false
  drawLiveDemoFrame()
}

async function typeLiveDemoQuestion(text) {
  liveDemo.typedQuestion = ''
  for (let index = 0; index < text.length; index += 1) {
    if (liveDemo.abort) throw new DOMException('Live demo stopped', 'AbortError')
    liveDemo.typedQuestion += text[index]
    await wait(/[?.!,]/.test(text[index]) ? 24 : 7)
  }
}

async function moveLiveDemoCursor(targetX, targetY, duration = 500) {
  const started = performance.now()
  const fromX = liveDemo.cursor.x
  const fromY = liveDemo.cursor.y
  while (true) {
    if (liveDemo.abort) throw new DOMException('Live demo stopped', 'AbortError')
    const progress = Math.min(1, (performance.now() - started) / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    liveDemo.cursor.x = fromX + ((targetX - fromX) * eased)
    liveDemo.cursor.y = fromY + ((targetY - fromY) * eased)
    if (progress >= 1) break
    await wait(16)
  }
}

async function pulseLiveDemoClick() {
  liveDemo.cursor.clickAt = performance.now()
  await wait(180)
}

function startLiveDemoRenderLoop() {
  if (liveDemo.animationFrame) cancelAnimationFrame(liveDemo.animationFrame)
  const tick = () => {
    drawLiveDemoFrame()
    if (!$('#showcase-demo-overlay').classList.contains('hidden')) liveDemo.animationFrame = requestAnimationFrame(tick)
  }
  tick()
}

function drawLiveDemoFrame() {
  const canvas = $('#showcase-demo-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const item = liveDemo.activeCase
  const cases = liveDemo.scenes
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = LIVE_DEMO_THEME.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  drawLiveDemoBackdrop(ctx)

  ctx.fillStyle = LIVE_DEMO_THEME.text
  ctx.font = '800 24px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText('QVAC VISION LAB', 48, 52)
  const replaying = liveDemo.mode === 'dogs-replay'
  ctx.fillStyle = LIVE_DEMO_THEME.primary
  ctx.font = '800 13px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(replaying ? 'EXPERIMENT 06 · AUTOMATED RECORDED REPLAY' : 'EXPERIMENT 06 · AUTOMATED LIVE DEMO', 48, 77)
  ctx.fillStyle = '#8e8e93'
  ctx.fillText(`SCENE ${Math.min(cases.length, liveDemo.sceneIndex + 1)} / ${cases.length} · SAME IMAGE · SAME QUESTION`, 590, 55)
  ctx.fillStyle = replaying ? LIVE_DEMO_THEME.blue : '#ff453a'
  ctx.beginPath(); ctx.arc(1335, 49, 7, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = LIVE_DEMO_THEME.text
  ctx.fillText(replaying ? 'REPLAY' : liveDemo.recorder?.state === 'recording' || localFrameCapture.running ? 'REC' : 'LIVE', 1352, 54)
  ctx.fillStyle = '#8e8e93'
  const elapsed = liveDemo.startedAt ? (performance.now() - liveDemo.startedAt) / 1000 : 0
  ctx.fillText(`${elapsed.toFixed(1)} s`, 1430, 54)
  ctx.fillStyle = LIVE_DEMO_THEME.primary
  ctx.font = '800 11px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`QVAC SDK ${LIVE_DEMO_RUNTIME.sdk} · LLAMA.CPP ${LIVE_DEMO_RUNTIME.backend} · ${LIVE_DEMO_RUNTIME.accelerator.toUpperCase()}`, 1552, 78)
  ctx.textAlign = 'left'

  if (liveDemo.introCard) {
    drawLiveDemoIntroCard(ctx)
    drawLiveDemoCursor(ctx)
    return
  }

  if (liveDemo.finalCard) {
    if (liveDemo.finalCard === 'kpis') drawLiveDemoKpiCard(ctx)
    else drawLiveDemoFinalCard(ctx)
    drawLiveDemoCursor(ctx)
    return
  }

  drawLiveDemoThumbnails(ctx, cases)
  drawLiveDemoImage(ctx, item)
  drawLiveDemoQuestion(ctx, item)
  COMPARISON_PROVIDER_IDS.forEach((providerId, index) => drawLiveDemoCard(ctx, providerId, index))

  ctx.fillStyle = '#8e8e93'
  ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(liveDemo.phase, 590, 88)
  drawLiveDemoCursor(ctx)
}

function drawLiveDemoBackdrop(ctx) {
  const primaryGlow = ctx.createRadialGradient(1510, 20, 0, 1510, 20, 470)
  primaryGlow.addColorStop(0, 'rgba(22,227,193,.15)')
  primaryGlow.addColorStop(1, 'rgba(22,227,193,0)')
  ctx.fillStyle = primaryGlow
  ctx.fillRect(1010, 0, 590, 480)

  const blueGlow = ctx.createRadialGradient(40, 880, 0, 40, 880, 520)
  blueGlow.addColorStop(0, 'rgba(75,184,255,.08)')
  blueGlow.addColorStop(1, 'rgba(75,184,255,0)')
  ctx.fillStyle = blueGlow
  ctx.fillRect(0, 420, 600, 480)

  ctx.save()
  ctx.strokeStyle = 'rgba(22,227,193,.035)'
  ctx.lineWidth = 1
  for (let x = 0; x <= 1600; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 92); ctx.lineTo(x, 900); ctx.stroke()
  }
  for (let y = 100; y <= 900; y += 80) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1600, y); ctx.stroke()
  }
  ctx.restore()
}

function drawLiveDemoIntroCard(ctx) {
  const pageMotion = liveDemoIntroMotion()
  ctx.save()
  ctx.globalAlpha = pageMotion.alpha
  ctx.translate(800, 470)
  ctx.scale(pageMotion.scale, pageMotion.scale)
  ctx.translate(-800, -470 + pageMotion.offsetY)
  if (liveDemo.introPage === 0) {
    drawLiveDemoIntroReveal(ctx, .05, 58, 134, () => {
      ctx.fillStyle = '#8e8e93'
      ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText('BEFORE WE GO LIVE · THE VISUAL SETUP', 58, 134)
    })
    ctx.font = '800 58px -apple-system, BlinkMacSystemFont, sans-serif'
    const photosTitle = '4 real photos.'
    drawLiveDemoIntroReveal(ctx, .15, 58, 205, () => {
      ctx.fillStyle = '#f5f5f7'
      ctx.fillText(photosTitle, 58, 205)
    })
    const photosTitleWidth = ctx.measureText(`${photosTitle} `).width
    drawLiveDemoIntroReveal(ctx, .62, 58 + photosTitleWidth, 205, () => {
      ctx.fillStyle = '#64d2ff'
      ctx.fillText('4 natural questions.', 58 + photosTitleWidth, 205)
    })
    drawLiveDemoIntroReveal(ctx, .95, 60, 245, () => {
      ctx.fillStyle = '#a1a1a6'
      ctx.font = '600 22px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillText('No multiple choice: every scene asks for two visible facts.', 60, 245)
    })

    liveDemo.scenes.forEach((item, index) => {
      const x = 58 + (index * 381)
      drawLiveDemoIntroBlock(ctx, x, 290, 350, 432, .30 + (index * .85), index, () => {
        drawLiveDemoPanel(ctx, x, 290, 350, 432, 24, LIVE_DEMO_THEME.surface, index === 0 ? LIVE_DEMO_THEME.primary : LIVE_DEMO_THEME.border, index === 0 ? 2 : 1)
        const image = liveDemo.images.get(item.id)
        if (image) drawLiveDemoImageCover(ctx, image, x + 12, 302, 326, 242, 16)
        ctx.fillStyle = LIVE_DEMO_THEME.primary
        ctx.font = '800 11px ui-monospace, SFMono-Regular, Menlo, monospace'
        ctx.fillText(`0${index + 1} · PERSONAL REAL PHOTO`, x + 24, 578)
        ctx.fillStyle = '#f5f5f7'
        ctx.font = '800 22px -apple-system, BlinkMacSystemFont, sans-serif'
        ctx.fillText(item.title, x + 24, 613)
        ctx.fillStyle = '#a1a1a6'
        ctx.font = '700 15px ui-monospace, SFMono-Regular, Menlo, monospace'
        const concepts = ['POSITION + COAT', 'STATE + SURFACE', 'OBJECT + COLOR', 'COUNT + OBJECT ID']
        ctx.fillText(concepts[index], x + 24, 650)
        ctx.fillStyle = '#6e6e73'
        ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif'
        wrapLiveDemoText(ctx, item.prompt, x + 24, 683, 302, 18, 2)
      })
    })

    drawLiveDemoIntroReveal(ctx, 4.05, 58, 790, () => {
      ctx.fillStyle = LIVE_DEMO_THEME.blue
      ctx.font = '800 13px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText('NEXT · THE FOUR LOCAL VARIANTS', 58, 790)
      ctx.fillStyle = '#8e8e93'
      ctx.font = '600 16px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillText('Each answer will be streamed and scored fact by fact.', 58, 820)
    })
    ctx.restore()
    return
  }

  drawLiveDemoIntroReveal(ctx, .10, 58, 134, () => {
    ctx.fillStyle = '#8e8e93'
    ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText('THE COMPARISON · SAME INPUT FOR EVERY MODEL', 58, 134)
  })
  ctx.font = '800 54px -apple-system, BlinkMacSystemFont, sans-serif'
  const samePhoto = 'Same photo.'
  const sameQuestion = 'Same question.'
  drawLiveDemoIntroReveal(ctx, .25, 58, 200, () => {
    ctx.fillStyle = '#f5f5f7'
    ctx.fillText(samePhoto, 58, 200)
  })
  const samePhotoWidth = ctx.measureText(`${samePhoto} `).width
  drawLiveDemoIntroReveal(ctx, .65, 58 + samePhotoWidth, 200, () => {
    ctx.fillStyle = LIVE_DEMO_THEME.primary
    ctx.fillText(sameQuestion, 58 + samePhotoWidth, 200)
  })
  const sameQuestionWidth = ctx.measureText(`${sameQuestion} `).width
  drawLiveDemoIntroReveal(ctx, 1.05, 58 + samePhotoWidth + sameQuestionWidth, 200, () => {
    ctx.fillStyle = LIVE_DEMO_THEME.blue
    ctx.fillText('Four local variants.', 58 + samePhotoWidth + sameQuestionWidth, 200)
  })
  drawLiveDemoIntroReveal(ctx, 1.35, 60, 239, () => {
    ctx.fillStyle = '#a1a1a6'
    ctx.font = '600 21px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('Execution order rotates by scene. No cloud inference.', 60, 239)
  })

  COMPARISON_PROVIDER_IDS.forEach((providerId, index) => {
    const x = 58 + (index * 381)
    const provider = showcase.providers.find(item => item.id === providerId)
    drawLiveDemoIntroBlock(ctx, x, 286, 350, 260, 1.65 + (index * .70), index, () => {
      drawLiveDemoPanel(ctx, x, 286, 350, 260, 23, LIVE_DEMO_THEME.surface, index === 0 ? LIVE_DEMO_THEME.primary : LIVE_DEMO_THEME.border, index === 0 ? 2 : 1)
      ctx.fillStyle = index === 0 ? LIVE_DEMO_THEME.primary : LIVE_DEMO_THEME.blue
      ctx.font = '800 13px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText(PROVIDER_BADGES[providerId], x + 28, 327)
      ctx.fillStyle = '#f5f5f7'
      ctx.font = '800 21px -apple-system, BlinkMacSystemFont, sans-serif'
      wrapLiveDemoText(ctx, provider?.model || providerId, x + 28, 370, 294, 27, 2)
      ctx.fillStyle = '#6e6e73'
      ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace'
      wrapLiveDemoText(ctx, compactVersion(provider?.modelVersion), x + 28, 439, 294, 18, 2)
      ctx.fillStyle = '#a1a1a6'
      ctx.font = '600 15px -apple-system, BlinkMacSystemFont, sans-serif'
      const notes = ['Standard · Q8_0', 'Standard · Q4_K_M imatrix', 'Flash · Q8_0', 'Flash · Q4_K_M imatrix']
      ctx.fillText(notes[index], x + 28, 502)
    })
  })

  drawLiveDemoIntroReveal(ctx, 4.20, 58, 588, () => {
    drawLiveDemoPanel(ctx, 58, 588, 1484, 100, 20, 'rgba(22,227,193,.07)', LIVE_DEMO_THEME.primaryMuted, 1)
    ctx.fillStyle = LIVE_DEMO_THEME.primary
    ctx.font = '800 11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText('WHAT HAPPENS NEXT', 86, 622)
    ctx.fillStyle = '#d1d1d6'
    ctx.font = '700 17px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('Select photo  →  insert question  →  stream 4 answers  →  reveal aggregate KPI popup', 86, 660)
  })

  const introElapsed = (performance.now() - (liveDemo.introPageStartedAt || performance.now())) / 1000
  const buttonScale = 1 + (Math.sin(introElapsed * 3.1) * 0.014)
  drawLiveDemoIntroReveal(ctx, 5.0, 526, 718, () => {
    ctx.save()
    ctx.translate(800, 756)
    ctx.scale(buttonScale, buttonScale)
    ctx.translate(-800, -756)
    drawLiveDemoPanel(ctx, 526, 718, 548, 76, 18, '#0c8f7b', LIVE_DEMO_THEME.primary, 2)
    ctx.fillStyle = '#fff'
    ctx.font = '900 18px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('START LIVE COMPARISON  →', 800, 765)
    ctx.textAlign = 'left'
    ctx.restore()
  })
  drawLiveDemoIntroReveal(ctx, 5.55, 58, 837, () => {
    ctx.fillStyle = '#8e8e93'
    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText(`Local inference · QVAC SDK ${LIVE_DEMO_RUNTIME.sdk} · llama.cpp ${LIVE_DEMO_RUNTIME.backend} · ${LIVE_DEMO_RUNTIME.accelerator}`, 58, 837)
  })
  ctx.restore()
}

function liveDemoIntroMotion() {
  const now = performance.now()
  const elapsed = (now - (liveDemo.introPageStartedAt || now)) / 1000
  const enter = liveDemo.introPage === 0 ? 1 : Math.min(1, Math.max(0, elapsed / 0.55))
  const easedEnter = 1 - Math.pow(1 - enter, 3)
  const outElapsed = liveDemo.introTransition === 'out' ? (now - (liveDemo.introTransitionStartedAt || now)) / 700 : 0
  const exit = Math.min(1, Math.max(0, outElapsed))
  return {
    alpha: easedEnter * (1 - exit),
    scale: (0.965 + (easedEnter * 0.035)) * (1 - (exit * 0.035)),
    offsetY: (1 - easedEnter) * 18
  }
}

function drawLiveDemoIntroBlock(ctx, x, y, width, height, delay, index, draw) {
  const elapsed = Math.max(0, ((performance.now() - (liveDemo.introPageStartedAt || performance.now())) / 1000) - delay)
  const progress = Math.min(1, elapsed / 0.85)
  const back = 1 + (2.70158 * Math.pow(progress - 1, 3)) + (1.70158 * Math.pow(progress - 1, 2))
  const scale = 0.91 + (back * 0.09)
  const floatY = progress === 1 ? Math.sin((elapsed * 1.15) + index) * 2.2 : 0
  ctx.save()
  ctx.globalAlpha *= progress
  ctx.translate(x + (width / 2), y + (height / 2) + floatY)
  ctx.scale(scale, scale)
  ctx.translate(-(x + (width / 2)), -(y + (height / 2)))
  draw()
  ctx.restore()
}

function drawLiveDemoIntroReveal(ctx, delay, x, y, draw) {
  const elapsed = Math.max(0, ((performance.now() - (liveDemo.introPageStartedAt || performance.now())) / 1000) - delay)
  const progress = Math.min(1, elapsed / .68)
  const eased = 1 - Math.pow(1 - progress, 3)
  ctx.save()
  ctx.globalAlpha *= eased
  ctx.translate(x, y)
  ctx.translate(0, (1 - eased) * 18)
  ctx.scale(.975 + (eased * .025), .975 + (eased * .025))
  ctx.translate(-x, -y)
  draw()
  ctx.restore()
}

function drawLiveDemoThumbnails(ctx, cases) {
  const compact = cases.length > 3
  const startX = compact ? LIVE_DEMO_COMPACT_LAYOUT.thumbnailStartX : 50
  const step = compact ? LIVE_DEMO_COMPACT_LAYOUT.thumbnailStep : 160
  const width = compact ? LIVE_DEMO_COMPACT_LAYOUT.thumbnailWidth : 145
  cases.forEach((item, index) => {
    const x = startX + (index * step)
    const selected = item.id === liveDemo.activeCase?.id
    drawLiveDemoPanel(ctx, x, 98, width, 61, 12, LIVE_DEMO_THEME.surfaceRaised, selected ? LIVE_DEMO_THEME.primary : LIVE_DEMO_THEME.border, selected ? 3 : 1)
    const image = liveDemo.images.get(item.id)
    if (image) drawLiveDemoImageCover(ctx, image, x + 4, 102, width - 8, 53, 9)
    ctx.beginPath()
    ctx.arc(x + 17, 115, 10, 0, Math.PI * 2)
    ctx.fillStyle = selected ? LIVE_DEMO_THEME.primary : 'rgba(7,10,9,.82)'
    ctx.fill()
    ctx.fillStyle = selected ? '#07100d' : LIVE_DEMO_THEME.text
    ctx.font = '900 9px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`0${index + 1}`, x + 17, 118)
    ctx.textAlign = 'left'
  })
}

function drawLiveDemoImage(ctx, item) {
  drawLiveDemoPanel(ctx, 48, 174, 390, 292, 22, '#0b0b0d', '#2c2c2e', 1)
  const image = item ? liveDemo.images.get(item.id) : null
  if (image) drawLiveDemoImageCover(ctx, image, 58, 184, 370, 272, 15)
  ctx.fillStyle = 'rgba(0,0,0,.72)'
  ctx.fillRect(58, 404, 370, 52)
  ctx.fillStyle = LIVE_DEMO_THEME.primary
  ctx.font = '800 11px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(item?.sourceLabel || 'REALWORLDQA · REAL IMAGE', 76, 427)
  ctx.fillStyle = '#f5f5f7'
  ctx.font = '700 16px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText(item?.title || 'Preparing image…', 76, 448)
}

function drawLiveDemoQuestion(ctx, item) {
  drawLiveDemoPanel(ctx, 48, 480, 390, 370, 22, '#0b0b0d', '#2c2c2e', 1)
  ctx.fillStyle = LIVE_DEMO_THEME.primary
  ctx.font = '800 11px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(item?.questionLabel || 'OFFICIAL QUESTION · INSERTED AUTOMATICALLY', 72, 510)
  ctx.fillStyle = '#f5f5f7'
  ctx.font = '600 17px ui-monospace, SFMono-Regular, Menlo, monospace'
  const shown = liveDemo.typedQuestion || (liveDemo.phase.includes('SELECTING') ? 'Waiting for the visible cursor…' : '')
  wrapLiveDemoText(ctx, shown, 72, 546, 342, 24, 8)
  ctx.fillStyle = '#5ee478'
  ctx.font = '800 11px ui-monospace, SFMono-Regular, Menlo, monospace'
  const expectedLabel = item?.demoKind === 'official' ? `EXPECTED · ${item.expectedLetter || item.expectedAnswer || '—'}` : item?.demoKind === 'open' ? item.expectedAnswer : `EXPECTED · ${item?.expectedAnswer || '—'}`
  wrapLiveDemoText(ctx, expectedLabel, 72, 744, 342, 16, 2)
  drawLiveDemoPanel(ctx, 72, 778, 342, 50, 13, '#0c8f7b', LIVE_DEMO_THEME.primary, 1)
  ctx.fillStyle = '#fff'
  ctx.font = '800 13px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(liveDemo.mode === 'dogs-replay' ? 'REPLAY ALL 4 RECORDED RESULTS' : 'RUN ALL 4 VARIANTS · LIVE', 243, 809)
  ctx.textAlign = 'left'
}

function drawLiveDemoCard(ctx, providerId, index) {
  const x = LIVE_DEMO_COMPACT_LAYOUT.firstModelX + (index * 273)
  const y = 112
  const width = 263
  const height = 738
  const card = liveDemo.cards[providerId] || { status: 'ready', output: '' }
  const provider = showcase.providers.find(item => item.id === providerId)
  const active = card.status === 'running'
  drawLiveDemoPanel(ctx, x, y, width, height, 21, LIVE_DEMO_THEME.surface, active ? LIVE_DEMO_THEME.primary : LIVE_DEMO_THEME.border, active ? 3 : 1)
  ctx.fillStyle = LIVE_DEMO_THEME.primary
  ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(PROVIDER_BADGES[providerId], x + 24, y + 31)
  ctx.fillStyle = '#f5f5f7'
  ctx.font = '800 16px -apple-system, BlinkMacSystemFont, sans-serif'
  wrapLiveDemoText(ctx, provider?.model || providerId, x + 20, y + 61, width - 40, 21, 2)
  ctx.fillStyle = '#6e6e73'
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace'
  wrapLiveDemoText(ctx, compactVersion(provider?.modelVersion), x + 20, y + 97, width - 40, 15, 2)

  const verdict = card.evaluation?.status || (card.status === 'running' ? 'STREAMING' : card.status === 'error' ? 'ERROR' : card.status === 'complete' ? 'DONE' : 'READY')
  ctx.fillStyle = ['PASS', '2/2'].includes(verdict) ? LIVE_DEMO_THEME.primary : ['FAIL', 'ERROR', '0/2'].includes(verdict) ? '#ff6961' : verdict === '1/2' || active ? '#ffd166' : verdict === 'OPEN' ? LIVE_DEMO_THEME.blue : '#8e8e93'
  ctx.font = '900 13px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.textAlign = 'right'
  ctx.fillText(verdict, x + width - 20, y + 35)
  ctx.textAlign = 'left'

  if (card.evaluation?.detail) {
    ctx.fillStyle = '#8e8e93'
    ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace'
    wrapLiveDemoText(ctx, card.evaluation.detail, x + 20, y + 137, width - 40, 15, 2)
  }

  ctx.fillStyle = '#f5f5f7'
  ctx.font = '700 15px ui-monospace, SFMono-Regular, Menlo, monospace'
  const output = card.output || (active ? 'Waiting for the first token…' : 'Same image and question queued.')
  wrapLiveDemoText(ctx, output, x + 20, y + 190, width - 40, 21, 15)

  ctx.strokeStyle = '#242426'
  ctx.beginPath(); ctx.moveTo(x + 20, y + 540); ctx.lineTo(x + width - 20, y + 540); ctx.stroke()
  const metrics = card.metrics || {}
  const metricItems = [
    ['TTFT', formatDuration(metrics.timeToFirstTokenMs)],
    ['LATENCY', formatDuration(metrics.latencyMs)],
    ['SPEED', Number.isFinite(metrics.tokensPerSecond) ? `${metrics.tokensPerSecond.toFixed(1)} tok/s` : '—'],
    ['OUTPUT', Number.isFinite(metrics.outputTokens) ? `${metrics.outputTokens} tok` : '—']
  ]
  metricItems.forEach(([label, value], metricIndex) => {
    const metricX = x + 20 + ((metricIndex % 2) * 121)
    const metricY = y + 580 + (Math.floor(metricIndex / 2) * 78)
    ctx.fillStyle = '#6e6e73'
    ctx.font = '800 9px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(label, metricX, metricY)
    ctx.fillStyle = '#d1d1d6'
    ctx.font = '800 14px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(value, metricX, metricY + 25)
  })
}

function drawLiveDemoFinalCard(ctx) {
  ctx.fillStyle = '#8e8e93'
  ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText('FINAL CARD · EXACT MATCHING ARTIFACTS', 48, 126)
  ctx.fillStyle = '#f5f5f7'
  ctx.font = '800 56px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('Local replication vs QVAC/Tether', 48, 195)
  ctx.fillStyle = '#a1a1a6'
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('RealWorldQA · 765 questions · accuracy · same GGUF quantization column', 50, 233)

  LIVE_DEMO_OFFICIAL_RESULTS.forEach((result, index) => {
    const y = 270 + (index * 122)
    const delta = result.local - result.official
    drawLiveDemoPanel(ctx, 48, y, 1504, 102, 18, '#0b0b0d', index === 0 ? '#ff9f0a' : '#2c2c2e', index === 0 ? 2 : 1)
    ctx.fillStyle = index === 0 ? '#ffb340' : '#64d2ff'
    ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(PROVIDER_BADGES[result.providerId], 76, y + 34)
    ctx.fillStyle = '#f5f5f7'
    ctx.font = '800 22px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText(result.artifact, 76, y + 67)

    const columns = [
      ['OUR LOCAL RUN', `${result.local.toFixed(2)}%`],
      ['OFFICIAL QVAC', `${result.official.toFixed(1)}%`],
      ['DELTA', `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} pp`]
    ]
    columns.forEach(([label, value], columnIndex) => {
      const x = 740 + (columnIndex * 250)
      ctx.fillStyle = '#6e6e73'
      ctx.font = '800 10px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText(label, x, y + 34)
      ctx.fillStyle = columnIndex === 2 ? (Math.abs(delta) < .5 ? '#5ee478' : delta > 0 ? '#64d2ff' : '#ffb340') : '#f5f5f7'
      ctx.font = '900 29px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText(value, x, y + 75)
    })
  })

  drawLiveDemoPanel(ctx, 48, 784, 1504, 72, 18, 'rgba(10,132,255,.10)', 'rgba(100,210,255,.35)', 1)
  ctx.fillStyle = '#64d2ff'
  ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText('READ WITH CARE', 76, 814)
  ctx.fillStyle = '#d1d1d6'
  ctx.font = '600 16px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('Replication-style comparison, not an official leaderboard submission; harness and prompt path are documented separately.', 76, 839)
}

function summarizeLiveDemoProvider(providerId) {
  const rows = liveDemo.results.map(result => result.providers[providerId]).filter(Boolean)
  const finite = read => rows.map(read).filter(Number.isFinite)
  const sum = values => values.reduce((total, value) => total + value, 0)
  const average = values => values.length ? sum(values) / values.length : null
  return {
    providerId,
    points: sum(finite(row => row.evaluation?.points)),
    maxPoints: sum(finite(row => row.evaluation?.maxPoints)),
    avgTtftMs: average(finite(row => row.metrics?.timeToFirstTokenMs)),
    avgLatencyMs: average(finite(row => row.metrics?.latencyMs)),
    avgTokensPerSecond: average(finite(row => row.metrics?.tokensPerSecond)),
    totalTokens: sum(finite(row => row.metrics?.outputTokens))
  }
}

function drawLiveDemoKpiCard(ctx) {
  const summaries = COMPARISON_PROVIDER_IDS.map(summarizeLiveDemoProvider)
  const totalInferences = liveDemo.results.length * COMPARISON_PROVIDER_IDS.length
  const elapsed = liveDemo.completedElapsedMs

  ctx.fillStyle = 'rgba(0,0,0,.68)'
  ctx.fillRect(0, 92, 1600, 808)
  drawLiveDemoPanel(ctx, 48, 112, 1504, 744, 28, LIVE_DEMO_THEME.surface, LIVE_DEMO_THEME.primary, 2)

  ctx.fillStyle = LIVE_DEMO_THEME.primary
  ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(liveDemo.mode === 'dogs-replay' ? 'FINAL POPUP · PREVIOUSLY RECORDED RUN' : 'FINAL POPUP · MEASURED AFTER EVERY INFERENCE COMPLETED', 82, 153)
  ctx.fillStyle = '#f5f5f7'
  ctx.font = '800 47px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('4 personal photos · 16 local inferences', 82, 210)
  ctx.fillStyle = '#a1a1a6'
  ctx.font = '600 18px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('Fact points are summed. TTFT, latency and generation speed are averaged per model.', 84, 243)

  drawLiveDemoPanel(ctx, 82, 270, 1436, 76, 17, 'rgba(10,132,255,.10)', 'rgba(100,210,255,.32)', 1)
  const cycleItems = [
    ['FULL WALL-CLOCK CYCLE', formatDuration(elapsed)],
    ['REAL PHOTOS', `${liveDemo.results.length}`],
    [liveDemo.mode === 'dogs-replay' ? 'RECORDED RESULTS' : 'SEQUENTIAL INFERENCES', `${totalInferences}`],
    ['RUNTIME', `SDK ${LIVE_DEMO_RUNTIME.sdk} · LLAMA.CPP ${LIVE_DEMO_RUNTIME.backend}`]
  ]
  cycleItems.forEach(([label, value], index) => {
    const x = 108 + (index * 350)
    ctx.fillStyle = '#6e6e73'
    ctx.font = '800 9px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(label, x, 297)
    ctx.fillStyle = index === 0 ? '#64d2ff' : '#f5f5f7'
    ctx.font = '900 20px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(value, x, 327)
  })

  summaries.forEach((summary, index) => {
    const x = 82 + (index * 359)
    const y = 370
    const provider = showcase.providers.find(item => item.id === summary.providerId)
    drawLiveDemoPanel(ctx, x, y, 335, 406, 19, LIVE_DEMO_THEME.surfaceRaised, index === 0 ? LIVE_DEMO_THEME.primary : LIVE_DEMO_THEME.border, index === 0 ? 2 : 1)
    ctx.fillStyle = index === 0 ? LIVE_DEMO_THEME.primary : LIVE_DEMO_THEME.blue
    ctx.font = '800 11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(PROVIDER_BADGES[summary.providerId], x + 24, y + 32)
    ctx.fillStyle = '#f5f5f7'
    ctx.font = '800 18px -apple-system, BlinkMacSystemFont, sans-serif'
    wrapLiveDemoText(ctx, provider?.model || summary.providerId, x + 24, y + 64, 287, 22, 2)
    ctx.fillStyle = '#6e6e73'
    ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace'
    wrapLiveDemoText(ctx, compactVersion(provider?.modelVersion), x + 24, y + 108, 287, 15, 2)

    const metrics = [
      ['FACT POINTS', summary.maxPoints ? `${summary.points}/${summary.maxPoints} · ${((summary.points / summary.maxPoints) * 100).toFixed(1)}%` : '—'],
      ['AVG TTFT', formatDuration(summary.avgTtftMs)],
      ['AVG LATENCY', formatDuration(summary.avgLatencyMs)],
      ['AVG SPEED', Number.isFinite(summary.avgTokensPerSecond) ? `${summary.avgTokensPerSecond.toFixed(1)} tok/s` : '—'],
      ['TOTAL OUTPUT', `${summary.totalTokens} tok`]
    ]
    metrics.forEach(([label, value], metricIndex) => {
      const metricY = y + 165 + (metricIndex * 45)
      ctx.fillStyle = '#6e6e73'
      ctx.font = '800 9px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText(label, x + 24, metricY)
      ctx.fillStyle = metricIndex === 0 ? LIVE_DEMO_THEME.primary : '#f5f5f7'
      ctx.font = '900 15px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'right'
      ctx.fillText(value, x + 311, metricY)
      ctx.textAlign = 'left'
    })
  })

  ctx.fillStyle = '#8e8e93'
  ctx.font = '700 13px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillText('Exploratory personal-photo audit · four scenes are illustrative and are not an official benchmark or ranking.', 84, 824)
}

function drawLiveDemoPanel(ctx, x, y, width, height, radius, fill, stroke, lineWidth = 1) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = stroke
  ctx.stroke()
}

function drawLiveDemoImageCover(ctx, image, x, y, width, height, radius) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const sourceWidth = width / scale
  const sourceHeight = height / scale
  const sourceX = (image.naturalWidth - sourceWidth) / 2
  const sourceY = (image.naturalHeight - sourceHeight) / 2
  ctx.save()
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.clip()
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height)
  ctx.restore()
}

function wrapLiveDemoText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const paragraphs = String(text || '').split(/\n/)
  const lines = []
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word } else line = candidate
    }
    if (line) lines.push(line)
  }
  const visible = lines.slice(0, maxLines)
  if (lines.length > maxLines && visible.length) visible[visible.length - 1] = `${visible[visible.length - 1].replace(/[.\s]+$/, '')}…`
  visible.forEach((line, index) => ctx.fillText(line, x, y + (index * lineHeight)))
  return y + (visible.length * lineHeight)
}

function drawLiveDemoCursor(ctx) {
  const { x, y, clickAt } = liveDemo.cursor
  const clickAge = performance.now() - clickAt
  if (clickAge >= 0 && clickAge < 420) {
    const radius = 12 + (clickAge / 420) * 34
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(255,159,10,${1 - (clickAge / 420)})`
    ctx.lineWidth = 5
    ctx.stroke()
  }
  ctx.save()
  ctx.translate(x, y)
  ctx.shadowColor = 'rgba(0,0,0,.8)'
  ctx.shadowBlur = 12
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(0, 31); ctx.lineTo(8, 23); ctx.lineTo(15, 40); ctx.lineTo(24, 36); ctx.lineTo(17, 20); ctx.lineTo(31, 20); ctx.closePath()
  ctx.fillStyle = '#fff'; ctx.fill()
  ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke()
  ctx.restore()
}

async function startRecordingAssist() {
  if (showcase.running || showcase.autoplay) return
  openShowcase()
  const cycleCases = [...activeCases()]
  showcase.autoplay = true
  $('#showcase').classList.add('demo-mode')
  $('#showcase-autoplay').textContent = `Running ${cycleCases.length}-scene · four-variant cycle…`
  showcase.history = []
  showcase.cycle = { results: [], startedAt: performance.now(), elapsedMs: null, total: cycleCases.length, suite: showcase.suite }
  renderHistory()
  renderCycle()
  clearConversation()
  clearComparison()
  try {
    for (let index = 0; index < cycleCases.length; index += 1) {
      if (!showcase.autoplay) throw new DOMException('Full cycle cancelled', 'AbortError')
      const item = cycleCases[index]
      selectCase(item.id, { clearQuestion: true })
      $('#showcase-question').value = item.prompt
      $('#showcase-cycle-status').textContent = `SCENE ${index + 1} OF ${cycleCases.length} · ${item.title.toUpperCase()}`
      renderCycle()
      await wait(300)
      const comparison = await runComparison({ orderOffset: index })
      showcase.cycle.results.push({
        caseId: item.id,
        title: item.title,
        imageUrl: item.imageUrl,
        prompt: item.prompt,
        expectedAnswer: item.expectedAnswer,
        scoring: item.scoring,
        group: item.group,
        sourceDataset: item.sourceDataset || null,
        sourceIndex: item.sourceIndex ?? null,
        executionOrder: [...showcase.comparisonOrder],
        providers: Object.fromEntries(Object.entries(comparison).map(([id, result]) => [id, {
          output: result.output,
          metrics: result.metrics,
          evaluation: result.evaluation,
          status: result.status
        }]))
      })
      renderCycle()
      await wait(450)
    }
    showcase.cycle.elapsedMs = performance.now() - showcase.cycle.startedAt
    renderCycle()
    setStage(`FULL ${cycleCases.length}-SCENE · FOUR-VARIANT CYCLE COMPLETE`, 'complete')
  } catch (error) {
    showcase.cycle.elapsedMs = performance.now() - showcase.cycle.startedAt
    renderCycle()
    if (error.name !== 'AbortError') failUi(`Full cycle stopped: ${error.message}`)
  } finally {
    showcase.autoplay = false
    $('#showcase').classList.remove('demo-mode')
    updateSuiteUi()
    setRunningUi(false)
  }
}

function renderCycle() {
  const section = $('#showcase-cycle')
  const results = showcase.cycle.results || []
  const total = showcase.cycle.total || activeCases().length || 20
  section.classList.toggle('hidden', !showcase.cycle.startedAt)
  const percentComplete = Math.min(100, total ? (results.length / total) * 100 : 0)
  $('#showcase-cycle-progress').innerHTML = `<i style="width:${percentComplete}%"></i><span>${results.length} / ${total} scenes · ${results.length * COMPARISON_PROVIDER_IDS.length} / ${total * COMPARISON_PROVIDER_IDS.length} inferences</span>`
  $('#showcase-cycle-status').textContent = showcase.cycle.elapsedMs != null
    ? `COMPLETE · ${formatDuration(showcase.cycle.elapsedMs)}`
    : showcase.autoplay ? `RUNNING · ${results.length} OF ${total} COMPLETE` : results.length ? `STOPPED · ${results.length} OF ${total}` : 'READY'
  $('#showcase-cycle-results').innerHTML = results.map((item, index) => {
    const cards = COMPARISON_PROVIDER_IDS.map(providerId => {
      const provider = showcase.providers.find(candidate => candidate.id === providerId)
      const result = item.providers[providerId] || {}
      const metrics = result.metrics || {}
      const verdict = result.evaluation?.status || 'UNSCORED'
      return `<article class="showcase-cycle-provider">
        <header><div><span>${escapeHtml(PROVIDER_BADGES[providerId] || providerId)}</span><b>${escapeHtml(provider?.model || providerId)}</b></div><strong class="${verdict.toLowerCase()}">${escapeHtml(verdict)}</strong></header>
        <p>${escapeHtml(result.output || 'No output')}</p>
        <footer><span>TTFT <b>${formatDuration(metrics.timeToFirstTokenMs)}</b></span><span>Latency <b>${formatDuration(metrics.latencyMs)}</b></span><span>Speed <b>${Number.isFinite(metrics.tokensPerSecond) ? `${metrics.tokensPerSecond.toFixed(1)} tok/s` : '—'}</b></span><span>Output <b>${Number.isFinite(metrics.outputTokens) ? metrics.outputTokens : '—'} tok</b></span><span>Prompt eval <b>${Number.isFinite(metrics.promptTokens) ? metrics.promptTokens : '—'} tok</b></span></footer>
      </article>`
    }).join('')
    return `<section class="showcase-cycle-row">
      <div class="showcase-cycle-scene"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}"><div><span>SCENE ${String(index + 1).padStart(2, '0')} · ${escapeHtml(item.sourceDataset || 'CURATED')}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.prompt)}</p><small>${item.scoring === 'multiple_choice' ? 'EXACT OPTION' : 'CONCEPT CHECK'} · expected: ${escapeHtml(item.expectedAnswer)} · order ${item.executionOrder.map(id => PROVIDER_BADGES[id]).join(' → ')}</small></div></div>
      <div class="showcase-cycle-pair">${cards}</div>
    </section>`
  }).join('')
  $('#showcase-cycle-summary').innerHTML = results.length === total ? renderCycleSummaries(results) : ''
}

function renderCycleSummaries(results) {
  const cycleDuration = formatDuration(showcase.cycle.elapsedMs)
  const summaries = COMPARISON_PROVIDER_IDS.map(providerId => summarizeCycleProvider(results, providerId))
  const sceneCount = results.length
  return `<div class="showcase-cycle-total"><span>FULL WALL-CLOCK CYCLE</span><b>${cycleDuration}</b><small>${sceneCount} scenes · ${sceneCount * COMPARISON_PROVIDER_IDS.length} sequential local inferences · execution order rotated by scene</small></div>${summaries.map(summary => `<article class="showcase-cycle-summary-card">
    <header><div><span>${escapeHtml(PROVIDER_BADGES[summary.providerId] || summary.providerId)}</span><h3>${escapeHtml(summary.model)}</h3></div><b>${summary.passes}/${summary.scored} PASS</b></header>
    <div class="showcase-cycle-summary-kpis">
      <span>Auto accuracy <b>${summary.scored ? `${((summary.passes / summary.scored) * 100).toFixed(0)}%` : '—'}</b></span>
      <span>Wilson 95% CI <b>${summary.interval ? `${summary.interval[0].toFixed(0)}–${summary.interval[1].toFixed(0)}%` : '—'}</b></span>
      <span>Failures <b>${summary.failures}</b></span>
      <span>Total latency <b>${formatDuration(summary.totalLatencyMs)}</b></span>
      <span>Avg latency <b>${formatDuration(summary.avgLatencyMs)}</b></span>
      <span>Avg TTFT <b>${formatDuration(summary.avgTtftMs)}</b></span>
      <span>Avg speed <b>${Number.isFinite(summary.avgTokensPerSecond) ? `${summary.avgTokensPerSecond.toFixed(1)} tok/s` : '—'}</b></span>
      <span>Total tokens <b>${summary.totalTokens}</b></span>
      <span>Avg prompt eval <b>${Number.isFinite(summary.avgPromptTokens) ? summary.avgPromptTokens.toFixed(0) : '—'}</b></span>
      <span>Peak process RSS <b>${formatBytes(summary.peakRamBytes)}</b></span>
      <span>Peak system RAM Δ <b>${formatBytes(summary.peakSystemRamDeltaBytes)}</b></span>
      <span>Peak CPU <b>${Number.isFinite(summary.peakCpuPercent) ? `${summary.peakCpuPercent.toFixed(0)}%` : '—'}</b></span>
      <span>Peak GPU <b>${Number.isFinite(summary.peakGpuPercent) ? `${summary.peakGpuPercent.toFixed(0)}%` : '—'}</b></span>
      <span>Preprocess <b>${escapeHtml(summary.preprocessPolicy || '—')}</b></span>
    </div>
  </article>`).join('')}<div class="showcase-pairwise"><span>PAIRED QUALITY · EXACT McNEMAR</span>${renderPairwiseComparisons(results)}</div>`
}

function summarizeCycleProvider(results, providerId) {
  const rows = results.map(item => item.providers[providerId]).filter(Boolean)
  const values = (read) => rows.map(read).filter(Number.isFinite)
  const sum = list => list.reduce((total, value) => total + value, 0)
  const average = list => list.length ? sum(list) / list.length : null
  const peak = list => list.length ? Math.max(...list) : null
  const scored = rows.filter(row => row.evaluation).length
  const passes = rows.filter(row => row.evaluation?.status === 'PASS').length
  const provider = showcase.providers.find(item => item.id === providerId)
  return {
    providerId,
    model: provider?.model || providerId,
    scored,
    passes,
    failures: scored - passes,
    interval: scored ? wilsonInterval(passes, scored) : null,
    totalLatencyMs: sum(values(row => row.metrics?.latencyMs)),
    avgLatencyMs: average(values(row => row.metrics?.latencyMs)),
    avgTtftMs: average(values(row => row.metrics?.timeToFirstTokenMs)),
    avgTokensPerSecond: average(values(row => row.metrics?.tokensPerSecond)),
    avgPromptTokens: average(values(row => row.metrics?.promptTokens)),
    totalTokens: sum(values(row => row.metrics?.outputTokens)),
    peakRamBytes: peak(values(row => row.metrics?.resources?.processRssPeakBytes)),
    peakSystemRamDeltaBytes: peak(values(row => row.metrics?.resources?.systemRamDeltaBytes)),
    peakCpuPercent: peak(values(row => row.metrics?.resources?.processCpuPeakPercent)),
    peakGpuPercent: peak(values(row => row.metrics?.resources?.gpuUtilizationPeakPercent)),
    preprocessPolicy: rows.map(row => row.metrics?.preprocessPolicy).find(Boolean) || null
  }
}

function renderPairwiseComparisons(results) {
  const pairs = []
  for (let leftIndex = 0; leftIndex < COMPARISON_PROVIDER_IDS.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < COMPARISON_PROVIDER_IDS.length; rightIndex += 1) pairs.push([COMPARISON_PROVIDER_IDS[leftIndex], COMPARISON_PROVIDER_IDS[rightIndex]])
  }
  return pairs.map(([leftId, rightId]) => {
    let leftOnly = 0
    let rightOnly = 0
    for (const result of results) {
      const leftPass = result.providers[leftId]?.evaluation?.status === 'PASS'
      const rightPass = result.providers[rightId]?.evaluation?.status === 'PASS'
      if (leftPass && !rightPass) leftOnly += 1
      if (!leftPass && rightPass) rightOnly += 1
    }
    const p = exactMcnemarP(leftOnly, rightOnly)
    return `<div><b>${escapeHtml(PROVIDER_BADGES[leftId])} ↔ ${escapeHtml(PROVIDER_BADGES[rightId])}</b><small>${leftOnly} vs ${rightOnly} unique wins · p ${p.toFixed(3)}</small></div>`
  }).join('')
}

function exactMcnemarP(leftOnly, rightOnly) {
  const discordant = leftOnly + rightOnly
  if (!discordant) return 1
  const tail = Math.min(leftOnly, rightOnly)
  let probability = 0
  for (let index = 0; index <= tail; index += 1) probability += binomialCoefficient(discordant, index) * (0.5 ** discordant)
  return Math.min(1, probability * 2)
}

function binomialCoefficient(n, k) {
  let value = 1
  for (let index = 1; index <= k; index += 1) value = value * (n - index + 1) / index
  return value
}

function wilsonInterval(successes, total, z = 1.959963984540054) {
  const proportion = successes / total
  const denominator = 1 + (z ** 2) / total
  const center = (proportion + (z ** 2) / (2 * total)) / denominator
  const halfWidth = z * Math.sqrt((proportion * (1 - proportion) / total) + (z ** 2) / (4 * total ** 2)) / denominator
  return [(center - halfWidth) * 100, (center + halfWidth) * 100]
}

function rotate(items, offset) {
  const normalized = ((Number(offset) || 0) % items.length + items.length) % items.length
  return [...items.slice(normalized), ...items.slice(0, normalized)]
}

async function humanType(text) {
  const field = $('#showcase-question')
  field.value = ''
  field.focus()
  for (let index = 0; index < text.length; index += 1) {
    if (!showcase.autoplay) throw new DOMException('Recording assist cancelled', 'AbortError')
    field.value += text[index]
    field.scrollTop = field.scrollHeight
    const punctuationPause = /[?.!,]/.test(text[index]) ? 110 : 0
    await wait(18 + ((text.charCodeAt(index) + index) % 24) + punctuationPause)
  }
}

function cancelRun() {
  showcase.autoplay = false
  showcase.controller?.abort()
}

function setRunningUi(running) {
  $('#showcase-run').disabled = running
  $('#showcase-compare').disabled = running
  $('#showcase-autoplay').disabled = running || showcase.autoplay || activeCases().length === 0
  $('#showcase-provider').disabled = running
  $('#showcase-question').disabled = running
  $('#showcase-clear-chat').disabled = running
  $('#showcase-cancel').classList.toggle('hidden', !running)
}

function setStage(label, state = '') {
  const element = $('#showcase-stage')
  element.className = state
  element.innerHTML = `<i></i>${escapeHtml(label)}`
}

function resetKpis() {
  for (const id of ['ttft', 'latency', 'tps', 'tokens', 'ram', 'cpu', 'gpu', 'gpu-memory']) $(`#showcase-kpi-${id}`).textContent = '—'
  $('#showcase-run-footnote').textContent = 'Measuring this run now. The first request may include a cold model start.'
}

function updateElapsed() {
  const elapsed = showcase.startedAt == null ? 0 : (performance.now() - showcase.startedAt) / 1000
  $('#showcase-live-time').textContent = `${elapsed.toFixed(2)} s`
  if (showcase.running) $('#showcase-kpi-latency').textContent = `${elapsed.toFixed(2)} s`
}

function addHistory(item) {
  showcase.history.unshift(item)
  showcase.history = showcase.history.slice(0, 5)
  renderHistory()
}

function renderHistory() {
  $('#showcase-history-wrap').classList.toggle('hidden', !showcase.history.length)
  $('#showcase-history').innerHTML = showcase.history.map(item => `<article class="showcase-history-card"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}"><div><span>${escapeHtml(item.title)}</span><p>${escapeHtml(item.output)}</p><small>${item.evaluation ? `${escapeHtml(item.evaluation.status)} · expected ${escapeHtml(item.evaluation.expectedAnswer)} · ` : ''}TTFT ${formatDuration(item.metrics.timeToFirstTokenMs)} · ${Number.isFinite(item.metrics.tokensPerSecond) ? `${item.metrics.tokensPerSecond.toFixed(1)} tok/s` : 'tok/s unavailable'} · ${formatBytes(item.metrics.resources?.processRssPeakBytes)} RSS</small></div></article>`).join('')
}

async function consumeNdjson(response, onEvent) {
  const reader = response.body?.getReader()
  if (!reader) return { error: { error: 'Streaming response body unavailable' }, complete: null }
  const decoder = new TextDecoder()
  let buffer = ''
  const result = { error: null, complete: null }
  const consume = line => {
    if (!line.trim()) return
    const event = JSON.parse(line)
    onEvent(event)
    if (event.type === 'error') result.error = event
    if (event.type === 'complete') result.complete = event
  }
  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) consume(line)
    if (done) break
  }
  if (buffer.trim()) consume(buffer)
  return result
}

function selectedCase() { return showcase.cases.find(item => item.id === showcase.selectedCaseId) || null }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
function waitForLiveDemo(ms) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now()
    const tick = () => {
      if (liveDemo.abort) return reject(new DOMException('Live demo stopped', 'AbortError'))
      const remaining = ms - (performance.now() - startedAt)
      if (remaining <= 0) return resolve()
      setTimeout(tick, Math.min(50, remaining))
    }
    tick()
  })
}
function readDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }) }
function formatDuration(value) { if (!Number.isFinite(value)) return '—'; return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s` }
function formatBytes(value) { if (!Number.isFinite(value) || value <= 0) return '—'; return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(0)} MB` }
function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]) }
function failUi(message) { setStage('ATTENTION', 'error'); $('#showcase-run-footnote').textContent = message; return Object.assign(new Error(message), { shown: true }) }

initialize()
