import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { EXPERIMENTS } from '../src/lab/index.mjs'
import { buildShowcaseConversationPrompt, extractMultipleChoiceLetter, formatMultipleChoicePrompt, normalizeShowcaseConversation, parseIoregSample, parsePsSample, REALWORLDQA_CASES, REALWORLDQA_DATASET_STATUS, REALWORLDQA_REMAINDER_CASES, REALWORLDQA_VALIDATION_B_CASES, REALWORLDQA_VALIDATION_CASES, REALWORLDQA_VALIDATION_C_CASES, sameImageConversation, scoreShowcaseAnswer, SHOWCASE_CASES, summarizeSamples } from '../src/showcase/index.mjs'
import { buildPatchedChatRequest, buildPatchedServerEnvironment, readChatCompletionStream } from '../src/vision/visionpsy-patched-provider.mjs'
import { parseQvacWorkerPid } from '../src/vision/qvac-provider.mjs'

test('live showcase ships no third-party dataset and optionally loads the checksum-locked complete RealWorldQA set', () => {
  assert.equal(EXPERIMENTS.at(-1).id, 'experiment_06_showcase')
  assert.equal(EXPERIMENTS.at(-1).number, 'Experiment 06')
  assert.ok([0, 20].includes(REALWORLDQA_CASES.length))
  assert.ok([0, 765].includes(SHOWCASE_CASES.length))
  assert.equal(REALWORLDQA_DATASET_STATUS.installedCases, SHOWCASE_CASES.length)
  assert.equal(REALWORLDQA_DATASET_STATUS.complete, SHOWCASE_CASES.length === 765)
  assert.ok([0, 20].includes(SHOWCASE_CASES.filter(item => item.group === 'official-real').length))
  if (REALWORLDQA_DATASET_STATUS.complete) {
    assert.equal(REALWORLDQA_VALIDATION_CASES.length, 50)
    assert.equal(REALWORLDQA_VALIDATION_B_CASES.length, 50)
    assert.equal(REALWORLDQA_VALIDATION_C_CASES.length, 150)
    assert.equal(REALWORLDQA_REMAINDER_CASES.length, 495)
  } else {
    assert.equal(REALWORLDQA_VALIDATION_CASES.length + REALWORLDQA_VALIDATION_B_CASES.length + REALWORLDQA_VALIDATION_C_CASES.length + REALWORLDQA_REMAINDER_CASES.length, 0)
  }
  if (SHOWCASE_CASES.length) assert.equal(SHOWCASE_CASES[0].id, 'realworldqa-5')
  for (const item of [...REALWORLDQA_CASES, ...REALWORLDQA_VALIDATION_CASES, ...REALWORLDQA_VALIDATION_B_CASES, ...REALWORLDQA_VALIDATION_C_CASES, ...REALWORLDQA_REMAINDER_CASES]) {
    assert.equal(item.scoring, 'multiple_choice')
    assert.match(item.prompt, /^Question:/)
    assert.match(item.prompt, /Options:/)
    assert.match(item.prompt, /Please select the correct answer from the options above\./)
    assert.match(item.imageUrl, /^\/showcase\/realworldqa(?:-validation-(?:50(?:-b)?|150-c)|-remainder-495)?\//)
  }
  const realCases = [...REALWORLDQA_CASES, ...REALWORLDQA_VALIDATION_CASES, ...REALWORLDQA_VALIDATION_B_CASES, ...REALWORLDQA_VALIDATION_C_CASES, ...REALWORLDQA_REMAINDER_CASES]
  assert.equal(new Set(realCases.map(item => item.sourceIndex)).size, SHOWCASE_CASES.length)
  if (REALWORLDQA_DATASET_STATUS.complete) assert.equal(new Set(realCases.map(item => item.imageSha256)).size, 762)
  assert.deepEqual(new Set(SHOWCASE_CASES.map(item => item.sourceDataset)), SHOWCASE_CASES.length ? new Set(['RealWorldQA']) : new Set())
})

test('screen-recording demos expose one 16:9 canvas, two public scenarios, replay and download', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  const script = readFileSync(new URL('../public/showcase.js', import.meta.url), 'utf8')
  assert.match(html, /id="showcase-live-demo"/)
  assert.match(html, /id="showcase-live-demo-3"/)
  assert.doesNotMatch(html, /id="showcase-live-demo-2"/)
  assert.match(html, /id="showcase-demo-canvas" width="1600" height="900"/)
  assert.match(html, /id="showcase-demo-replay"/)
  assert.match(html, /id="showcase-demo-download"/)
  assert.match(script, /LIVE_DEMO_CASE_IDS = Object\.freeze\(\['realworldqa-48', 'realworldqa-41', 'realworldqa-53'\]\)/)
  assert.match(script, /LIVE_DEMO_3_SCENES = Object\.freeze/)
  assert.match(script, /4 personal photos · 12 local inferences/)
  assert.match(script, /drawLiveDemoIntroCard/)
  assert.match(script, /START LIVE COMPARISON/)
  assert.match(script, /createDogDemoMusicTrack/)
  assert.match(script, /mp4a\.40\.2/)
  assert.match(script, /official: 59\.1/)
  assert.match(script, /official: 56\.7/)
  assert.match(script, /official: 54\.9/)
  assert.match(script, /requiresCompleteDataset = button\.dataset\.showcaseSuite === 'official-all' && !showcase\.dataset\?\.complete/)
  assert.match(script, /canvas\.captureStream\(30\)/)
  assert.match(script, /await runLiveDemoProvider\(item, providerId\)/)
  assert.ok(script.indexOf("'video/webm;codecs=vp8'") < script.indexOf("'video/webm;codecs=vp9'"))
})

test('local frame capture is disabled unless explicitly enabled', () => {
  const server = readFileSync(new URL('../src/server.mjs', import.meta.url), 'utf8')
  assert.match(server, /QVAC_ENABLE_FRAME_CAPTURE === '1'/)
  assert.match(server, /if \(!showcaseFrameCaptureEnabled\) throw httpError\(403/)
})

test('official RealWorldQA prompts and exact option scoring are deterministic', () => {
  assert.equal(formatMultipleChoicePrompt('Which one?', { A: 'Cat', B: 'Dog' }), 'Question: Which one?\nOptions:\nA. Cat\nB. Dog\nPlease select the correct answer from the options above. ')
  assert.equal(extractMultipleChoiceLetter('Answer: B', { A: 'Cat', B: 'Dog' }), 'B')
  assert.equal(extractMultipleChoiceLetter('dog', { A: 'Cat', B: 'Dog' }), 'B')
  assert.equal(extractMultipleChoiceLetter('It may be B or A.', { A: 'Cat', B: 'Dog' }), null)
  const item = REALWORLDQA_CASES[0] || { scoring: 'multiple_choice', expectedLetter: 'A', expectedAnswer: 'Cat', options: { A: 'Cat', B: 'Dog' } }
  assert.equal(scoreShowcaseAnswer(item, item.expectedLetter).status, 'PASS')
  assert.equal(scoreShowcaseAnswer(item, item.expectedLetter === 'A' ? 'B' : 'A').status, 'FAIL')
})

test('patched request enables native streaming only when explicitly requested', () => {
  const input = { modelPath: '/model.gguf', prompt: 'Question?', imageBytes: Buffer.from('image'), maxTokens: 32 }
  assert.equal(buildPatchedChatRequest(input).stream, false)
  assert.equal(buildPatchedChatRequest({ ...input, stream: true }).stream, true)
})

test('model-specific preprocessing keeps official Standard tiling and Flash native resolution', () => {
  const inherited = { MTMD_NO_UPSCALE: '1', KEEP: 'yes' }
  assert.deepEqual(buildPatchedServerEnvironment(inherited, 'base'), { KEEP: 'yes' })
  assert.deepEqual(buildPatchedServerEnvironment(inherited, 'flash'), { KEEP: 'yes', MTMD_NO_UPSCALE: '1' })
  assert.deepEqual(buildPatchedServerEnvironment(inherited, 'lfm25'), { KEEP: 'yes' })
  assert.deepEqual(buildPatchedServerEnvironment({ ...inherited, VISIONPSY_BASE_NO_UPSCALE: '1' }, 'base'), { KEEP: 'yes', VISIONPSY_BASE_NO_UPSCALE: '1', MTMD_NO_UPSCALE: '1' })
})

test('QVAC process telemetry identifies its direct Bare SDK worker only', () => {
  const processes = `  123 1 node src/server.mjs\n  456 123 /app/node_modules/bare worker.js @qvac/sdk/dist/server/worker.js\n  789 999 /app/@qvac/sdk/dist/server/worker.js\n`
  assert.equal(parseQvacWorkerPid(processes, 123), 456)
  assert.equal(parseQvacWorkerPid(processes, 999), 789)
  assert.equal(parseQvacWorkerPid(processes, 111), null)
})

test('visual conversation keeps bounded same-image context while dropping earlier scenes', () => {
  const messages = normalizeShowcaseConversation([
    { role: 'system', content: 'ignore me' },
    { role: 'user', content: 'What is missing?', imageTitle: 'Emergency kit' },
    { role: 'assistant', content: 'The first aid kit.' }
  ])
  assert.equal(messages.length, 2)
  assert.deepEqual(sameImageConversation(messages, 'Robot target'), [])
  assert.equal(buildShowcaseConversationPrompt(messages, 'What is the object on its right?', 'Robot target'), 'What is the object on its right?')

  const sameImagePrompt = buildShowcaseConversationPrompt(messages, 'Where is it?', 'Emergency kit')
  assert.match(sameImagePrompt, /User \[image: Emergency kit\]: What is missing\?/)
  assert.match(sameImagePrompt, /VisionPsy: The first aid kit\./)
  assert.match(sameImagePrompt, /current image: Emergency kit/)
  assert.match(sameImagePrompt, /Where is it\?/)
  assert.equal(buildShowcaseConversationPrompt([], 'Single turn?', 'Image'), 'Single turn?')
})

test('llama.cpp SSE chunks are combined and forwarded token by token', async () => {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"The first"}}]}\n'))
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" aid kit"}}],"usage":{"completion_tokens":3}}\n\ndata: [DONE]\n'))
      controller.close()
    }
  })
  const tokens = []
  const result = await readChatCompletionStream(body, { onToken: token => tokens.push(token) })
  assert.deepEqual(tokens, ['The first', ' aid kit'])
  assert.equal(result.rawOutput, 'The first aid kit')
  assert.equal(result.usage.completion_tokens, 3)
})

test('resource telemetry parsers preserve units and summarize peaks', () => {
  assert.deepEqual(parsePsSample(' 1024 87.5\n'), { rssBytes: 1024 * 1024, cpuPercent: 87.5 })
  assert.deepEqual(parseIoregSample('"Device Utilization %"=58,"In use system memory"=2431139840,"Alloc system memory"=8738701312'), {
    utilizationPercent: 58,
    memoryUsedBytes: 2431139840,
    memoryAllocatedBytes: 8738701312,
    scope: 'macOS system-wide IOAccelerator sample'
  })
  const summary = summarizeSamples([
    { processRssBytes: 10, processCpuPercent: 20, systemRamUsedBytes: 100, gpuUtilizationPercent: 25, gpuMemoryUsedBytes: 30, gpuMemoryAllocatedBytes: 40, gpuScope: 'system' },
    { processRssBytes: 15, processCpuPercent: 18, systemRamUsedBytes: 112, gpuUtilizationPercent: 55, gpuMemoryUsedBytes: 35, gpuMemoryAllocatedBytes: 42, gpuScope: 'system' }
  ])
  assert.equal(summary.processRssPeakBytes, 15)
  assert.equal(summary.systemRamDeltaBytes, 12)
  assert.equal(summary.gpuUtilizationPeakPercent, 55)
  assert.equal(summary.gpuMemoryUsedPeakBytes, 35)
})
