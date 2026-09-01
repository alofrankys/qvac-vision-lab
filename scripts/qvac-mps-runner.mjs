#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { buildReferenceArgs, loadProtocol } from './qvac-official-replication.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PYTHON = path.join(ROOT, '.venv-vlmeval', 'bin', 'python')
const VLM_ROOT = path.join(ROOT, '.third_party', 'VLMEvalKit-qvac')
const STATE_ROOT = path.join(ROOT, 'data', 'qvac-official-replication')
const RUN_ROOT = path.join(STATE_ROOT, 'runs')
const CURRENT_RUN = path.join(STATE_ROOT, 'current-run.json')
const INVENTORY_SCRIPT = path.join(ROOT, 'scripts', 'qvac-benchmark-inventory.mjs')

function parseOptions(argv) {
  const options = {
    suite: 'scienceQA',
    models: ['VisionPsy-Nano-460M', 'LFM2.5-VL-450M', 'SmolVLM2-500M'],
    mode: 'all',
    judge: false
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--suite') options.suite = argv[++i]
    else if (argv[i] === '--models') options.models = argv[++i].split(',').filter(Boolean)
    else if (argv[i] === '--mode') options.mode = argv[++i]
    else if (argv[i] === '--judge') options.judge = true
    else throw new Error(`Unknown option: ${argv[i]}`)
  }
  return options
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'EPERM') return true
    return false
  }
}

function loadCurrent() {
  if (!fs.existsSync(CURRENT_RUN)) return null
  return JSON.parse(fs.readFileSync(CURRENT_RUN, 'utf8'))
}

function collectStatuses(directory) {
  if (!fs.existsSync(directory)) return []
  const found = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...collectStatuses(target))
    else if (entry.name === 'status.json') {
      try {
        found.push({ path: target, status: JSON.parse(fs.readFileSync(target, 'utf8')) })
      } catch {
        found.push({ path: target, status: 'UNREADABLE' })
      }
    }
  }
  return found
}

function tail(file, characters = 6000) {
  if (!file || !fs.existsSync(file)) return ''
  const content = fs.readFileSync(file, 'utf8')
  return content.slice(-characters).replaceAll('\r', '\n').split('\n').filter(Boolean).slice(-12).join('\n')
}

function parseActiveProgress(file) {
  if (!file || !fs.existsSync(file)) return null
  const content = fs.readFileSync(file, 'utf8').slice(-1_000_000).replace(/\u001b\[[0-9;]*m/g, '').replaceAll('\r', '\n')
  const pattern = /Infer ([^/\n]+)\/([^,\n]+), Rank[^\n]*?\|\s*(\d+)\/(\d+)\s*\[([^\]<]*)<([^,\]]+)/g
  let match
  let active = null
  while ((match = pattern.exec(content))) {
    active = {
      model: match[1],
      dataset: match[2],
      completed: Number(match[3]),
      total: Number(match[4]),
      percent: Number((100 * Number(match[3]) / Number(match[4])).toFixed(2)),
      elapsed: match[5].trim(),
      activeEta: match[6].trim()
    }
  }
  return active
}

function compactRunStatuses(state) {
  const started = Date.parse(state.startedAt) || 0
  const latest = new Map()
  for (const found of collectStatuses(state.outputRoot)) {
    if (found.status === 'UNREADABLE') continue
    const model = found.status.model_name
    for (const [dataset, detail] of Object.entries(found.status.datasets || {})) {
      const updated = Date.parse(detail.updated_at || found.status.updated_at || found.status.created_at || 0) || 0
      if (updated + 1000 < started) continue
      const key = `${model}\0${dataset}`
      if (!latest.has(key) || updated > latest.get(key).updated) {
        latest.set(key, {
          model,
          dataset,
          status: detail.status,
          primaryMetric: detail.primary_metric || null,
          score: detail.primary_metric ? detail.metrics?.[detail.primary_metric] ?? null : null,
          updatedAt: detail.updated_at || null,
          updated
        })
      }
    }
  }
  return [...latest.values()].map(({ updated, ...item }) => item)
}

function verifyDevice(device, env) {
  if (device !== 'mps') return { device, available: true, check: 'not_required' }
  try {
    const output = execFileSync(PYTHON, ['-c', [
      'import json, torch',
      "available = bool(torch.backends.mps.is_built() and torch.backends.mps.is_available())",
      "assert available, 'Apple MPS is not available to this process'",
      "tensor = torch.ones(1, device='mps')",
      "print(json.dumps({'device':'mps','available':available,'tensorDevice':str(tensor.device),'torch':torch.__version__}))"
    ].join('; ')], { encoding: 'utf8', env })
    return JSON.parse(output.trim())
  } catch (error) {
    throw new Error(`MPS preflight failed before inference: ${error.stderr?.toString().trim() || error.message}`)
  }
}

function start(options) {
  const existing = loadCurrent()
  if (existing && isAlive(existing.pid)) {
    throw new Error(`A replication is already running with PID ${existing.pid}. Use npm run qvac:replica:progress.`)
  }
  if (!fs.existsSync(PYTHON)) throw new Error('Python replication environment is missing; run the setup first.')

  fs.mkdirSync(RUN_ROOT, { recursive: true })
  const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const logPath = path.join(RUN_ROOT, `${runId}.log`)
  const protocol = loadProtocol()
  const inventory = JSON.parse(execFileSync(process.execPath, [INVENTORY_SCRIPT, '--suite', options.suite], { encoding: 'utf8' }))
  if (!inventory.ready) {
    const missing = inventory.datasets.filter(item => !item.locked).map(item => `${item.vlmeval}:${item.reason}`).join(', ')
    throw new Error(`Dataset lock failed for suite ${options.suite}: ${missing}. Run npm run qvac:replica:datasets -- ${options.suite}`)
  }
  const args = buildReferenceArgs(protocol, options)
  const env = {
    ...process.env,
    LMUData: path.join(ROOT, 'data', 'vlmeval'),
    HF_HOME: path.join(ROOT, 'data', 'hf-cache'),
    HF_HUB_OFFLINE: '1',
    PYTHONPATH: path.join(ROOT, 'scripts', 'vlmeval_compat'),
    VLMEVAL_DEVICE: process.env.VLMEVAL_DEVICE || 'mps'
  }
  const devicePreflight = verifyDevice(env.VLMEVAL_DEVICE, env)
  const protocolBytes = fs.readFileSync(path.join(ROOT, 'config', 'qvac-official-replication.json'))
  const manifestPath = path.join(RUN_ROOT, `${runId}.manifest.json`)
  const manifest = {
    schemaVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    protocolId: protocol.id,
    protocolSha256: createHash('sha256').update(protocolBytes).digest('hex'),
    suite: options.suite,
    models: protocol.profiles.reference.models.filter(item => options.models.includes(item.id)),
    datasets: inventory.datasets,
    evaluationUnits: inventory.datasets.reduce((sum, item) => sum + (item.evaluationUnits || 0), 0),
    inferenceRows: inventory.datasets.reduce((sum, item) => sum + (item.rows || 0), 0),
    harness: {
      repository: protocol.harness.repository,
      baseCommit: protocol.harness.baseCommit,
      requiredPullRequests: protocol.harness.requiredPullRequests,
      localShims: protocol.harness.localReproductionShim
    },
    execution: {
      device: env.VLMEVAL_DEVICE,
      devicePreflight,
      profile: process.platform === 'darwin' ? 'MPS_PORT_NOT_CUDA_REFERENCE' : 'REFERENCE',
      generation: 'greedy',
      mode: options.mode,
      judgeEnabled: options.judge,
      judgeIdentityStatus: protocol.judge.status,
      argv: [PYTHON, ...args]
    },
    rankingRules: {
      requireCompleteDatasetForFinalRanking: true,
      partialCrossModelComparison: 'COMMON_COMPLETED_INDICES_ONLY',
      failedInferencePolicy: 'COUNT_AS_FAILURE_AND_REPORT_SEPARATELY',
      strictAndJudgeScoresNeverMixed: true
    }
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const logFd = fs.openSync(logPath, 'a')
  const executable = process.platform === 'darwin' ? '/usr/bin/caffeinate' : PYTHON
  // Keep long benchmark runs alive without forcing the Mac display to remain on.
  // `-d` prevents display sleep and `-u` declares user activity; neither is
  // required for an unattended run. `-ims` preserves the system/disk sleep
  // assertions while allowing the user's normal display timeout to apply.
  const executableArgs = process.platform === 'darwin' ? ['-ims', PYTHON, ...args] : args
  const child = spawn(executable, executableArgs, {
    cwd: VLM_ROOT,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd]
  })
  fs.closeSync(logFd)
  child.unref()

  const state = {
    runId,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    device: env.VLMEVAL_DEVICE,
    offlineModelLock: true,
    options,
    logPath,
    outputRoot: path.join(STATE_ROOT, 'outputs'),
    manifestPath
  }
  fs.writeFileSync(CURRENT_RUN, `${JSON.stringify(state, null, 2)}\n`)
  console.log(JSON.stringify({ ...state, alive: true }, null, 2))
}

function status() {
  const state = loadCurrent()
  if (!state) {
    console.log(JSON.stringify({ state: 'NOT_STARTED' }, null, 2))
    return
  }
  const active = parseActiveProgress(state.logPath)
  const runStatuses = compactRunStatuses(state)
  let manifest = null
  try {
    manifest = JSON.parse(fs.readFileSync(state.manifestPath, 'utf8'))
  } catch {}
  const unitsByDataset = new Map((manifest?.datasets || []).map(item => [item.vlmeval, item.evaluationUnits]))
  const doneCases = runStatuses.filter(item => item.status === 'done').reduce((sum, item) => sum + (unitsByDataset.get(item.dataset) || 0), 0)
  const activeAlreadyDone = active && runStatuses.some(item => item.model === active.model && item.dataset === active.dataset && item.status === 'done')
  const completedCases = doneCases + (active && !activeAlreadyDone ? active.completed : 0)
  const totalCases = manifest ? manifest.evaluationUnits * manifest.models.length : null
  console.log(JSON.stringify({
    ...state,
    alive: isAlive(state.pid),
    active,
    runProgress: {
      completedCases,
      totalCases,
      percent: totalCases ? Number((100 * completedCases / totalCases).toFixed(2)) : null
    },
    statuses: runStatuses,
    logTail: tail(state.logPath)
  }, null, 2))
}

function pause() {
  const state = loadCurrent()
  if (!state) {
    console.log(JSON.stringify({ state: 'NOT_STARTED', paused: true }, null, 2))
    return
  }
  if (isAlive(state.pid)) {
    try {
      process.kill(-state.pid, 'SIGTERM')
    } catch (error) {
      if (error?.code !== 'ESRCH') process.kill(state.pid, 'SIGTERM')
    }
  }
  const paused = { ...state, pauseRequestedAt: new Date().toISOString(), paused: true }
  fs.writeFileSync(CURRENT_RUN, `${JSON.stringify(paused, null, 2)}\n`)
  console.log(JSON.stringify(paused, null, 2))
}

const [command = 'status', ...rest] = process.argv.slice(2)
try {
  if (command === 'start') start(parseOptions(rest))
  else if (command === 'status') status()
  else if (command === 'pause') pause()
  else throw new Error('Usage: node scripts/qvac-mps-runner.mjs <start|status|pause> [--suite ...] [--models id,id] [--mode all|infer] [--judge]')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
