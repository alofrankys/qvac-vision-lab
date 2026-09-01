#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROTOCOL_PATH = path.join(ROOT, 'config', 'qvac-official-replication.json')
const MODEL_LOCK_PATH = path.join(ROOT, 'config', 'fair-arena-model-lock.json')
const VLM_ROOT = path.join(ROOT, '.third_party', 'VLMEvalKit-qvac')
const PYTHON = path.join(ROOT, '.venv-vlmeval', 'bin', 'python')
const COMPAT_PATH = path.join(ROOT, 'scripts', 'vlmeval_compat')
const LMU_DATA = path.join(ROOT, 'data', 'vlmeval')
const HF_HOME = path.join(ROOT, 'data', 'hf-cache')
export const REPLICATION_OUTPUT = path.join(ROOT, 'data', 'qvac-official-replication', 'outputs')

export function loadProtocol() {
  return JSON.parse(fs.readFileSync(PROTOCOL_PATH, 'utf8'))
}

export function validateProtocol(protocol) {
  const errors = []
  if (protocol.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (protocol.datasets?.length !== 17) errors.push(`expected 17 datasets, found ${protocol.datasets?.length || 0}`)
  const names = new Set(protocol.datasets?.map(item => item.name))
  if (names.size !== protocol.datasets?.length) errors.push('dataset names must be unique')
  const full = protocol.executionSuites?.full || []
  if (full.length !== 17 || new Set(full).size !== 17) errors.push('full suite must contain 17 unique VLMEvalKit datasets')
  for (const dataset of protocol.datasets || []) {
    if (!dataset.questionFormat) errors.push(`${dataset.name}: missing questionFormat`)
    if (!dataset.scoring) errors.push(`${dataset.name}: missing scoring policy`)
    if (!dataset.artifact?.url) errors.push(`${dataset.name}: missing dataset URL`)
    if (!/^[a-f0-9]{32}$/.test(dataset.artifact?.md5 || '')) errors.push(`${dataset.name}: invalid dataset MD5`)
    for (const model of ['VisionPsy-Nano-460M', 'LFM2.5-VL-450M', 'SmolVLM2-500M']) {
      if (!Number.isFinite(dataset.published?.[model])) errors.push(`${dataset.name}: missing published score for ${model}`)
    }
  }
  return errors
}

export function buildReferenceArgs(protocol, { suite = 'headline', models = ['VisionPsy-Nano-460M'], mode = 'all', judge = true } = {}) {
  const datasets = protocol.executionSuites[suite]
  if (!datasets) throw new Error(`Unknown suite: ${suite}`)
  const allowed = new Set(protocol.profiles.reference.models.map(item => item.id))
  for (const model of models) if (!allowed.has(model)) throw new Error(`Unknown reference model: ${model}`)
  const args = [
    path.join(VLM_ROOT, 'run.py'),
    '--data', ...datasets,
    '--model', ...models,
    '--mode', mode,
    '--work-dir', REPLICATION_OUTPUT,
    '--reuse',
    '--reuse-aux', 'all'
  ]
  if (judge) {
    const judgeName = process.env.QVAC_JUDGE_MODEL_ID || protocol.judge.referenceNameInBlog
    args.push('--judge', judgeName)
    if (process.env.QVAC_JUDGE_BASE_URL) args.push('--judge-base-url', process.env.QVAC_JUDGE_BASE_URL)
    if (process.env.QVAC_JUDGE_API_KEY) args.push('--judge-key', process.env.QVAC_JUDGE_API_KEY)
  }
  return args
}

function git(args) {
  try {
    return execFileSync('git', ['-C', VLM_ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function hasPythonModule(module) {
  if (!fs.existsSync(PYTHON)) return false
  try {
    execFileSync(PYTHON, ['-c', `import ${module}`], {
      stdio: 'ignore',
      env: { ...process.env, PYTHONPATH: COMPAT_PATH, LMUData: LMU_DATA, HF_HOME }
    })
    return true
  } catch {
    return false
  }
}

function expandHome(value) {
  return String(value).replace(/^\$\{HOME\}/, os.homedir())
}

function artifactSummary() {
  const lock = JSON.parse(fs.readFileSync(MODEL_LOCK_PATH, 'utf8'))
  return lock.primaryModels.map(item => {
    const modelPath = expandHome(item.model.path)
    const projectorPath = expandHome(item.projector.path)
    return {
      provider: item.providerId,
      model: fs.existsSync(modelPath) && fs.statSync(modelPath).size === item.model.bytes,
      projector: fs.existsSync(projectorPath) && fs.statSync(projectorPath).size === item.projector.bytes
    }
  })
}

function status(protocol) {
  const validation = validateProtocol(protocol)
  const repoReady = fs.existsSync(path.join(VLM_ROOT, 'run.py'))
  const subjectPatterns = new Map([
    [1601, 'Fix MM-IFEval rule-based scoring'],
    [1602, 'Add opt-in LLM-judge rescoring'],
    [1611, 'Fix: strip use_vllm/use_verifier'],
    [1613, 'Support VisionPsy hub-packaged checkpoints']
  ])
  const log = repoReady ? git(['log', '--format=%s', '-12']) || '' : ''
  const patches = protocol.harness.requiredPullRequests.map(item => ({
    pullRequest: item.number,
    commit: item.commit,
    applied: log.includes(subjectPatterns.get(item.number) || item.purpose)
  }))
  const lfmShim = repoReady && Boolean(git(['grep', '-n', '"LFM2.5-VL-450M"', '--', 'vlmeval/config.py']))
  const devicePortabilityShim = repoReady && Boolean(git(['grep', '-n', 'VLMEVAL_DEVICE', '--', 'vlmeval/vlm/nanovlm.py']))
  const artifacts = artifactSummary()
  const blockers = []
  if (validation.length) blockers.push('PROTOCOL_INVALID')
  if (!repoReady) blockers.push('VLMEVALKIT_NOT_BOOTSTRAPPED')
  if (!lfmShim) blockers.push('LFM2.5_450M_REGISTRATION_MISSING')
  if (!fs.existsSync(PYTHON) || !hasPythonModule('torch') || !hasPythonModule('vlmeval')) blockers.push('PYTHON_ENV_NOT_READY')
  if (process.platform === 'darwin') blockers.push('REFERENCE_ADAPTERS_REQUIRE_CUDA')
  if (!process.env.QVAC_JUDGE_BASE_URL || !process.env.QVAC_JUDGE_MODEL_ID) blockers.push('QVAC_JUDGE_ENDPOINT_NOT_CONFIGURED')
  if (protocol.judge.status !== 'RESOLVED') blockers.push('UPSTREAM_JUDGE_IDENTITY_AMBIGUOUS')
  console.log(JSON.stringify({
    protocol: protocol.id,
    datasets: protocol.datasets.length,
    validation,
    harness: { repoReady, baseCommit: protocol.harness.baseCommit, head: repoReady ? git(['rev-parse', 'HEAD']) : null, patches, lfmShim, devicePortabilityShim },
    python: { executable: PYTHON, exists: fs.existsSync(PYTHON), torch: hasPythonModule('torch'), vlmeval: hasPythonModule('vlmeval') },
    localQ8Artifacts: artifacts,
    judge: { modelConfigured: Boolean(process.env.QVAC_JUDGE_MODEL_ID), endpointConfigured: Boolean(process.env.QVAC_JUDGE_BASE_URL), upstreamIdentity: protocol.judge.status },
    blockers,
    readyForExactReferenceRun: blockers.length === 0,
    mpsPortPrepared: process.platform === 'darwin' && devicePortabilityShim && fs.existsSync(PYTHON) && hasPythonModule('torch') && hasPythonModule('vlmeval')
  }, null, 2))
}

function plan(protocol) {
  const rows = protocol.datasets.map((item, index) => `${String(index + 1).padStart(2, '0')}. ${item.name} → ${item.vlmeval} · ${item.questionFormat} · ${item.scoring} · ${item.metric}${item.n ? ` · N QVAC=${item.n}` : ' · N da bloccare sul TSV ufficiale'}${item.splitConfidence ? ` · ${item.splitConfidence}` : ''}`)
  console.log([
    'QVAC official replication — ordine di esecuzione',
    '',
    'A. Headline integrali: ScienceQA_TEST (2017), MM-IFEval (400), POPE (5127).',
    'B. Strict-first: nove benchmark senza dipendere dai punteggi semantici del giudice.',
    'C. Judge-backed: benchmark aperti con risultati strict e QVAC-judge riportati separatamente.',
    'D. Full-17: classifica aggregata solo dopo il completamento di tutti e tre i modelli.',
    'E. Local-Q8: stessa suite ripetuta coi tre artifact del laboratorio; mai fusa con la classifica reference.',
    'F. Dataset lock: ogni TSV deve coincidere col checksum VLMEvalKit; la numerosità reale viene registrata nel manifest.',
    '',
    ...rows
  ].join('\n'))
}

function parseOptions(argv) {
  const options = { suite: 'headline', models: ['VisionPsy-Nano-460M'], mode: 'all', judge: true }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--suite') options.suite = argv[++i]
    else if (argv[i] === '--models') options.models = argv[++i].split(',').filter(Boolean)
    else if (argv[i] === '--mode') options.mode = argv[++i]
    else if (argv[i] === '--no-judge') options.judge = false
    else throw new Error(`Unknown option: ${argv[i]}`)
  }
  return options
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value
  return `'${value.replaceAll("'", `'\\''`)}'`
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const protocol = loadProtocol()
  const [command = 'status', ...rest] = process.argv.slice(2)

  if (command === 'status') status(protocol)
  else if (command === 'plan') plan(protocol)
  else if (command === 'command') {
    const args = buildReferenceArgs(protocol, parseOptions(rest))
    console.log(`LMUData=${shellQuote(LMU_DATA)} HF_HOME=${shellQuote(HF_HOME)} PYTHONPATH=${shellQuote(COMPAT_PATH)} VLMEVAL_DEVICE=\${VLMEVAL_DEVICE:-cuda} ${[PYTHON, ...args].map(shellQuote).join(' ')}`)
  } else {
    console.error('Usage: node scripts/qvac-official-replication.mjs <status|plan|command> [--suite scienceQA|headline|strictFirst|full] [--models id,id] [--mode infer|all] [--no-judge]')
    process.exitCode = 2
  }
}
