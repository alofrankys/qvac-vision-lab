import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { PRIMARY_ARENA_PROVIDER_IDS, QUESTION_CATEGORIES, computeBenchmarkLockHash, validateBenchmarkEntries } from './index.mjs'

export const MODEL_LOCK_PATH = path.resolve('config/fair-arena-model-lock.json')

export async function readModelLock(lockPath = MODEL_LOCK_PATH) {
  const bytes = await readFile(lockPath)
  return { lock: JSON.parse(bytes), lockHash: createHash('sha256').update(bytes).digest('hex'), lockPath }
}

export async function sha256File(filePath) {
  const bytes = await readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}

export function expandHome(value) { return value.replace('${HOME}', os.homedir()) }

export function hardwareFingerprint() {
  let osVersion = os.release()
  let model = os.cpus()[0]?.model || 'unknown'
  try { osVersion = execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim() } catch {}
  try {
    const profile = execFileSync('system_profiler', ['SPHardwareDataType', '-json'], { encoding: 'utf8' })
    const hardware = JSON.parse(profile).SPHardwareDataType?.[0] || {}
    model = hardware.machine_model || hardware.chip_type || model
  } catch {}
  const publicFacts = { model, arch: os.arch(), cpuCores: os.cpus().length, ramBytes: os.totalmem(), os: `${os.platform()} ${osVersion}` }
  return { ...publicFacts, fingerprint: createHash('sha256').update(JSON.stringify(publicFacts)).digest('hex') }
}

export async function auditFairArena({ providerStatuses = [], state = {}, verifyHashes = true, modelLockRecord = null, benchmarkSetId = 'real_world_vision_arena_v1', level = 'ranking', questionIds = null } = {}) {
  const ranking = level === 'ranking'
  const { lock, lockHash } = modelLockRecord || await readModelLock()
  const checks = []
  const check = (id, ok, detail, blocking = true) => checks.push({ id, ok: Boolean(ok), detail, blocking })
  check('PRIMARY_ROSTER_LOCKED', JSON.stringify(lock.primaryModels.map(item => item.providerId)) === JSON.stringify(PRIMARY_ARENA_PROVIDER_IDS), lock.primaryModels.map(item => item.providerId).join(', '))
  check('PRECISION_MATCHED', lock.primaryModels.every(item => item.model.quantization === 'Q8_0' && item.projector.quantization === 'Q8_0'), lock.precisionPolicy.status)
  for (const model of lock.primaryModels) for (const artifactName of ['model','projector']) {
    const artifact = model[artifactName]
    if (!verifyHashes) { check(`${model.providerId}:${artifactName}`, Boolean(artifact.bytes && artifact.sha256), `${artifact.bytes} bytes · declared sha256 ${artifact.sha256}`); continue }
    const filePath = expandHome(artifact.path)
    try {
      const info = await stat(filePath)
      const hash = await sha256File(filePath)
      check(`${model.providerId}:${artifactName}`, info.size === artifact.bytes && hash === artifact.sha256, `${info.size} bytes · sha256 ${hash}`)
    } catch (error) { check(`${model.providerId}:${artifactName}`, false, error.message) }
  }
  for (const id of PRIMARY_ARENA_PROVIDER_IDS) {
    const status = providerStatuses.find(item => item.id === id)
    check(`PROVIDER_READY:${id}`, status?.ready || status?.state === 'READY', status?.reason || status?.modelVersion || 'provider status unavailable')
    const locked = lock.primaryModels.find(item => item.providerId === id)
    check(`PROVIDER_IDENTITY:${id}`, Boolean(status && locked && String(status.modelVersion || '').includes(locked.revision)), status?.modelVersion || 'provider status unavailable')
  }
  const benchmark = state.arenaBenchmarkSets?.find(item => item.id === benchmarkSetId)
  check('DATASET_VERSIONED', Boolean(benchmark?.version), benchmark?.version || 'missing benchmark version', ranking)
  check('DATASET_LOCKED', benchmark?.locked && Boolean(benchmark?.lockHash), benchmark?.locked ? benchmark.lockHash || 'missing lock hash' : 'benchmark set remains mutable', ranking)
  const selectedIds = questionIds?.length ? [...new Set(questionIds)] : benchmark?.questionIds || []
  const uniqueQuestionCount = new Set(selectedIds).size
  check('MINIMUM_30_QUESTIONS', uniqueQuestionCount >= 30 && uniqueQuestionCount === selectedIds.length, `${uniqueQuestionCount}/30 unique questions`, ranking)
  check('BLIND_REVIEW_PROTOCOL', true, 'identities withheld until explicit reveal')
  try {
    const entries = selectedIds.map(id => state.questionBank?.find(item => item.id === id)).filter(Boolean)
    check('QUESTION_REFERENCES_VALID', entries.length === selectedIds.length && entries.length > 0 && validateBenchmarkEntries(entries, state), `${entries.length} linked inference-ready questions`)
    const policy = benchmark?.rankingPolicy || { minQuestions: 30, minUniqueImages: 30, requireExpectedAnswers: true, categoryMinimums: Object.fromEntries(QUESTION_CATEGORIES.map(category => [category, 1])) }
    const uniqueImages = new Set(entries.map(item => item.photoId)).size
    check('MINIMUM_UNIQUE_IMAGES', uniqueImages >= policy.minUniqueImages, `${uniqueImages}/${policy.minUniqueImages} unique images`, ranking)
    const expectedAnswers = entries.filter(item => item.expectedAnswer).length
    check('OBJECTIVE_GROUND_TRUTH', !policy.requireExpectedAnswers || expectedAnswers === entries.length, `${expectedAnswers}/${entries.length} expected answers`, ranking)
    const gaps = Object.entries(policy.categoryMinimums || {}).filter(([category, minimum]) => entries.filter(item => item.category === category).length < minimum)
    check('CATEGORY_QUOTAS', gaps.length === 0, gaps.length ? gaps.map(([category, minimum]) => `${category}<${minimum}`).join(', ') : 'all required category quotas met', ranking)
    const digest = benchmark?.version ? computeBenchmarkLockHash(benchmark, state, benchmark.version) : null
    check('DATASET_LOCK_INTEGRITY', Boolean(benchmark?.locked && digest && digest === benchmark.lockHash), digest ? `recomputed ${digest}` : 'dataset is not versioned', ranking)
  } catch (error) {
    check('QUESTION_REFERENCES_VALID', false, error.message)
    check('DATASET_LOCK_INTEGRITY', false, error.message, ranking)
  }
  const blockingFailures = checks.filter(item => item.blocking && !item.ok)
  return { verdict: blockingFailures.length ? 'BLOCKED' : ranking ? 'BENCHMARK_READY' : 'EXPLORATORY_READY', auditLevel: ranking ? 'RANKING' : 'EXPLORATORY', benchmarkSetId, questionCount: uniqueQuestionCount, auditedAt: new Date().toISOString(), modelLockId: lock.id, modelLockHash: lockHash, hardware: hardwareFingerprint(), checks, blockers: blockingFailures.map(item => `${item.id}: ${item.detail}`) }
}
