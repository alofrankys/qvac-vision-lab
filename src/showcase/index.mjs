import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const SHOWCASE_PROVIDER_IDS = Object.freeze(['qvac-visionpsy-standard-q8', 'qvac-visionpsy-standard-q4', 'qvac-visionpsy', 'qvac-visionpsy-flash-q4'])

const realWorldQaManifest = readOptionalManifest('../../public/showcase/realworldqa/manifest.json')
const realWorldQaValidationManifest = readOptionalManifest('../../public/showcase/realworldqa-validation-50/manifest.json')
const realWorldQaValidationBManifest = readOptionalManifest('../../public/showcase/realworldqa-validation-50-b/manifest.json')
const realWorldQaValidationCManifest = readOptionalManifest('../../public/showcase/realworldqa-validation-150-c/manifest.json')
const realWorldQaRemainderManifest = readOptionalManifest('../../public/showcase/realworldqa-remainder-495/manifest.json')
export const REALWORLDQA_CASES = Object.freeze(realWorldQaManifest.cases.map(item => officialRealWorldCase(item, realWorldQaManifest, 'official-real')))
export const REALWORLDQA_VALIDATION_CASES = Object.freeze(realWorldQaValidationManifest.cases.map(item => officialRealWorldCase(item, realWorldQaValidationManifest, 'validation-real')))
export const REALWORLDQA_VALIDATION_B_CASES = Object.freeze(realWorldQaValidationBManifest.cases.map(item => officialRealWorldCase(item, realWorldQaValidationBManifest, 'validation-real-b')))
export const REALWORLDQA_VALIDATION_C_CASES = Object.freeze(realWorldQaValidationCManifest.cases.map(item => officialRealWorldCase(item, realWorldQaValidationCManifest, 'validation-real-c')))
export const REALWORLDQA_REMAINDER_CASES = Object.freeze(realWorldQaRemainderManifest.cases.map(item => officialRealWorldCase(item, realWorldQaRemainderManifest, 'official-remainder')))
export const SHOWCASE_CASES = Object.freeze([...REALWORLDQA_CASES, ...REALWORLDQA_VALIDATION_CASES, ...REALWORLDQA_VALIDATION_B_CASES, ...REALWORLDQA_VALIDATION_C_CASES, ...REALWORLDQA_REMAINDER_CASES])
export const REALWORLDQA_DATASET_STATUS = Object.freeze({
  installedCases: SHOWCASE_CASES.length,
  expectedCases: 765,
  complete: SHOWCASE_CASES.length === 765,
  sourceMd5: [realWorldQaManifest, realWorldQaValidationManifest, realWorldQaValidationBManifest, realWorldQaValidationCManifest, realWorldQaRemainderManifest].find(item => item.sourceMd5)?.sourceMd5 || null,
  setup: 'Download the official RealWorldQA TSV and run the checksum-locked showcase installers documented in README.md.'
})

function readOptionalManifest(relativeUrl) {
  try {
    const manifest = JSON.parse(readFileSync(new URL(relativeUrl, import.meta.url), 'utf8'))
    return { ...manifest, cases: Array.isArray(manifest.cases) ? manifest.cases : [] }
  } catch (error) {
    if (error.code === 'ENOENT') return { sourceMd5: null, cases: [] }
    throw error
  }
}

export function scoreShowcaseAnswer(showcaseCase, output) {
  if (!showcaseCase?.expectedAnswer) return null
  if (showcaseCase.scoring === 'multiple_choice') {
    const predictedLetter = extractMultipleChoiceLetter(output, showcaseCase.options)
    const pass = predictedLetter === showcaseCase.expectedLetter
    return {
      status: pass ? 'PASS' : 'FAIL',
      score: pass ? 1 : 0,
      expectedAnswer: showcaseCase.expectedAnswer,
      expectedLetter: showcaseCase.expectedLetter,
      predictedLetter,
      scoring: 'RealWorldQA multiple-choice exact'
    }
  }
  return null
}

export function buildShowcaseConversationPrompt(messages, currentPrompt, imageTitle = 'current image') {
  const history = sameImageConversation(messages, imageTitle)
  const prompt = String(currentPrompt || '').trim()
  if (!history.length) return prompt
  const transcript = history.map(message => {
    const speaker = message.role === 'assistant' ? 'VisionPsy' : 'User'
    const attachment = message.role === 'user' && message.imageTitle ? ` [image: ${message.imageTitle}]` : ''
    return `${speaker}${attachment}: ${message.content}`
  }).join('\n')
  return [
    'Continue this visual conversation.',
    'Answer the final user message about the currently attached image. Previous image names are context only; do not treat them as the current image.',
    transcript,
    `User [current image: ${String(imageTitle || 'current image').slice(0, 120)}]: ${prompt}`,
    'VisionPsy:'
  ].join('\n')
}

export function sameImageConversation(messages, imageTitle) {
  const currentImageTitle = String(imageTitle || '').trim()
  let keepAssistant = false
  return normalizeShowcaseConversation(messages).flatMap(message => {
    if (message.role === 'user') {
      keepAssistant = Boolean(currentImageTitle && message.imageTitle === currentImageTitle)
      return keepAssistant ? [message] : []
    }
    return keepAssistant ? [message] : []
  })
}

export function normalizeShowcaseConversation(messages) {
  if (!Array.isArray(messages)) return []
  return messages.slice(-6).flatMap(message => {
    const role = message?.role === 'assistant' ? 'assistant' : message?.role === 'user' ? 'user' : null
    const content = String(message?.content || '').trim().slice(0, 600)
    if (!role || !content) return []
    return [{ role, content, imageTitle: role === 'user' ? String(message.imageTitle || '').trim().slice(0, 120) : null }]
  })
}

export class ResourceSampler {
  constructor({ getPid = () => null, onSample = () => {}, intervalMs = 400 } = {}) {
    this.getPid = getPid
    this.onSample = onSample
    this.intervalMs = intervalMs
    this.samples = []
    this.timer = null
    this.sampling = false
  }

  async start() {
    await this.#sample()
    this.timer = setInterval(() => { void this.#sample() }, this.intervalMs)
    this.timer.unref?.()
  }

  async stop() {
    clearInterval(this.timer)
    this.timer = null
    await this.#sample()
    return summarizeSamples(this.samples)
  }

  async #sample() {
    if (this.sampling) return
    this.sampling = true
    try {
      const pid = Number(this.getPid()) || null
      const [processStats, gpuStats] = await Promise.all([sampleProcess(pid), sampleGpu()])
      const sample = {
        at: new Date().toISOString(),
        pid,
        processRssBytes: processStats.rssBytes,
        processCpuPercent: processStats.cpuPercent,
        systemRamUsedBytes: os.totalmem() - os.freemem(),
        systemRamTotalBytes: os.totalmem(),
        gpuUtilizationPercent: gpuStats.utilizationPercent,
        gpuMemoryUsedBytes: gpuStats.memoryUsedBytes,
        gpuMemoryAllocatedBytes: gpuStats.memoryAllocatedBytes,
        gpuScope: gpuStats.scope
      }
      this.samples.push(sample)
      this.onSample(sample)
    } finally {
      this.sampling = false
    }
  }
}

export function summarizeSamples(samples) {
  const finite = key => samples.map(item => item[key]).filter(Number.isFinite)
  const peak = key => finite(key).length ? Math.max(...finite(key)) : null
  const first = key => finite(key)[0] ?? null
  const last = key => finite(key).at(-1) ?? null
  return {
    sampleCount: samples.length,
    processRssPeakBytes: peak('processRssBytes'),
    processRssLastBytes: last('processRssBytes'),
    processCpuPeakPercent: peak('processCpuPercent'),
    systemRamUsedPeakBytes: peak('systemRamUsedBytes'),
    systemRamDeltaBytes: first('systemRamUsedBytes') == null ? null : peak('systemRamUsedBytes') - first('systemRamUsedBytes'),
    gpuUtilizationPeakPercent: peak('gpuUtilizationPercent'),
    gpuUtilizationLastPercent: last('gpuUtilizationPercent'),
    gpuMemoryUsedPeakBytes: peak('gpuMemoryUsedBytes'),
    gpuMemoryAllocatedPeakBytes: peak('gpuMemoryAllocatedBytes'),
    gpuScope: samples.find(item => item.gpuScope)?.gpuScope || 'unavailable'
  }
}

export function parsePsSample(stdout) {
  const [rss, cpu] = String(stdout).trim().split(/\s+/).map(Number)
  return { rssBytes: Number.isFinite(rss) ? rss * 1024 : null, cpuPercent: Number.isFinite(cpu) ? cpu : null }
}

export function parseIoregSample(stdout) {
  const value = name => {
    const match = String(stdout).match(new RegExp(`"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"=([0-9]+)`))
    return match ? Number(match[1]) : null
  }
  return {
    utilizationPercent: value('Device Utilization %'),
    memoryUsedBytes: value('In use system memory'),
    memoryAllocatedBytes: value('Alloc system memory'),
    scope: 'macOS system-wide IOAccelerator sample'
  }
}

async function sampleProcess(pid) {
  if (!pid) return { rssBytes: null, cpuPercent: null }
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-o', 'rss=,%cpu=', '-p', String(pid)], { timeout: 1000 })
    return parsePsSample(stdout)
  } catch {
    return { rssBytes: null, cpuPercent: null }
  }
}

async function sampleGpu() {
  if (process.platform !== 'darwin') return { utilizationPercent: null, memoryUsedBytes: null, memoryAllocatedBytes: null, scope: 'unavailable' }
  try {
    const { stdout } = await execFileAsync('/usr/sbin/ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { timeout: 1500, maxBuffer: 4 * 1024 * 1024 })
    return parseIoregSample(stdout)
  } catch {
    return { utilizationPercent: null, memoryUsedBytes: null, memoryAllocatedBytes: null, scope: 'unavailable' }
  }
}

function officialRealWorldCase(item, manifest, group) {
  const prompt = formatMultipleChoicePrompt(item.question, item.options)
  return Object.freeze({
    id: item.id,
    title: item.title,
    capability: item.capability,
    imageUrl: item.imageUrl,
    prompt,
    question: item.question,
    options: Object.freeze({ ...item.options }),
    expectedLetter: item.answer,
    expectedAnswer: `${item.answer} · ${item.expectedAnswer}`,
    acceptedAnswerSets: Object.freeze([]),
    group,
    scoring: 'multiple_choice',
    sourceDataset: item.sourceDataset,
    sourceIndex: item.sourceIndex,
    sourceMd5: manifest.sourceMd5,
    imageSha256: item.imageSha256
  })
}

export function formatMultipleChoicePrompt(question, options) {
  return [
    `Question: ${String(question || '').trim()}`,
    'Options:',
    ...Object.entries(options || {}).map(([letter, answer]) => `${letter}. ${answer}`),
    'Please select the correct answer from the options above. '
  ].join('\n')
}

export function extractMultipleChoiceLetter(output, options = {}) {
  const text = String(output || '').trim()
  const direct = text.match(/^(?:the\s+)?answer(?:\s+is)?\s*[:\-]?\s*\(?([A-D])\)?(?:\b|[.)])/i) || text.match(/^\(?([A-D])\)?(?:\b|[.)])/i)
  if (direct) return direct[1].toUpperCase()
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const matches = Object.entries(options).filter(([, answer]) => normalized === String(answer).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
  return matches.length === 1 ? matches[0][0] : null
}
