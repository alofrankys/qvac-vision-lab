#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadProtocol } from './qvac-official-replication.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_ROOT = path.join(ROOT, 'data', 'qvac-official-replication', 'outputs')
const INVENTORY_PATH = path.join(ROOT, 'data', 'qvac-official-replication', 'dataset-inventory.json')
const DEFAULT_MODELS = ['VisionPsy-Nano-460M', 'LFM2.5-VL-450M', 'SmolVLM2-500M']

function parseOptions(argv) {
  const options = { suite: 'full', models: DEFAULT_MODELS }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--suite') options.suite = argv[++i]
    else if (argv[i] === '--models') options.models = argv[++i].split(',').filter(Boolean)
    else throw new Error(`Unknown option: ${argv[i]}`)
  }
  return options
}

function walkStatusFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const result = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...walkStatusFiles(target))
    else if (entry.name === 'status.json') result.push(target)
  }
  return result
}

function loadStatuses() {
  const latest = new Map()
  for (const file of walkStatusFiles(OUTPUT_ROOT)) {
    let status
    try {
      status = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    for (const [dataset, detail] of Object.entries(status.datasets || {})) {
      const key = `${status.model_name}\0${dataset}`
      const timestamp = Date.parse(detail.updated_at || status.updated_at || status.created_at || 0) || 0
      const prior = latest.get(key)
      if (!prior || timestamp > prior.timestamp || (timestamp === prior.timestamp && file.split(path.sep).length < prior.file.split(path.sep).length)) {
        latest.set(key, { file, status, detail, timestamp })
      }
    }
  }
  return latest
}

function displayScore(dataset, raw) {
  if (!Number.isFinite(raw)) return { raw: null, value: null, scale: null }
  const percentLike = dataset.metric.includes('percent') || dataset.metric.includes('accuracy') || dataset.metric.includes('f1')
  if (percentLike && raw >= 0 && raw <= 1) return { raw, value: raw * 100, scale: 'fraction_to_percent' }
  return { raw, value: raw, scale: 'native' }
}

function loadInventory() {
  if (!fs.existsSync(INVENTORY_PATH)) return null
  try {
    return JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'))
  } catch {
    return null
  }
}

function main(options) {
  const protocol = loadProtocol()
  const suiteNames = protocol.executionSuites[options.suite]
  if (!suiteNames) throw new Error(`Unknown suite: ${options.suite}`)
  const allowedModels = new Set(protocol.profiles.reference.models.map(item => item.id))
  for (const model of options.models) if (!allowedModels.has(model)) throw new Error(`Unknown model: ${model}`)

  const datasetByVlmeval = new Map(protocol.datasets.map(item => [item.vlmeval, item]))
  const statuses = loadStatuses()
  const inventory = loadInventory()
  const lockedByName = new Map((inventory?.datasets || []).map(item => [item.vlmeval, item]))
  const datasets = []

  for (const vlmeval of suiteNames) {
    const dataset = datasetByVlmeval.get(vlmeval)
    const models = []
    for (const model of options.models) {
      const found = statuses.get(`${model}\0${vlmeval}`)
      const primaryMetric = found?.detail?.primary_metric || null
      const raw = primaryMetric ? found.detail.metrics?.[primaryMetric] : null
      const score = displayScore(dataset, raw)
      const published = dataset.published[model]
      models.push({
        model,
        status: found?.detail?.status || 'not_started',
        primaryMetric,
        score: score.value === null ? null : Number(score.value.toFixed(4)),
        rawScore: score.raw,
        scoreTransform: score.scale,
        publishedQVACReference: published,
        deltaFromPublished: score.value === null ? null : Number((score.value - published).toFixed(4)),
        evaluatedAt: found?.detail?.updated_at || null,
        statusFile: found?.file ? path.relative(ROOT, found.file) : null,
        predictionFile: found?.detail?.prediction_file || null
      })
    }
    const locked = lockedByName.get(vlmeval)
    const completeForAllModels = models.every(item => item.status === 'done' && item.score !== null)
    const ranking = completeForAllModels
      ? [...models].sort((a, b) => b.score - a.score || options.models.indexOf(a.model) - options.models.indexOf(b.model)).map((item, index) => ({ rank: index + 1, model: item.model, score: item.score }))
      : []
    datasets.push({
      dataset: dataset.name,
      vlmeval,
      questionFormat: dataset.questionFormat,
      scoring: dataset.scoring,
      judgeDependent: dataset.scoring.includes('judge'),
      expectedEvaluationUnits: locked?.evaluationUnits ?? dataset.n ?? null,
      datasetLocked: Boolean(locked?.locked),
      models,
      comparison: {
        final: completeForAllModels,
        rule: completeForAllModels ? 'FULL_LOCKED_DATASET_ALL_MODELS' : 'NO_RANKING_UNTIL_ALL_MODELS_COMPLETE',
        ranking
      }
    })
  }

  const allComplete = datasets.every(item => item.comparison.final)
  const fullSuite = options.suite === 'full'
  const aggregateAllowed = fullSuite && allComplete
  console.log(JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    protocolId: protocol.id,
    executionProfile: process.platform === 'darwin' ? 'MPS_PORT_NOT_CUDA_REFERENCE' : 'REFERENCE',
    suite: options.suite,
    models: options.models,
    safeguards: {
      publishedScoresAreReferenceOnly: true,
      judgeAndStrictResultsSeparated: true,
      perDatasetRankingRequiresEverySelectedModelComplete: true,
      partialCrossModelRanking: 'USE_DATASET_SPECIFIC_COMMON_COMPLETED_INDICES_ONLY',
      aggregateStatus: aggregateAllowed ? 'ELIGIBLE_BUT_NORMALIZATION_FORMULA_MUST_BE_LOCKED' : 'FORBIDDEN_INCOMPLETE_SUITE'
    },
    completedDatasets: datasets.filter(item => item.comparison.final).length,
    requiredDatasets: datasets.length,
    allComplete,
    datasets
  }, null, 2))
}

try {
  main(parseOptions(process.argv.slice(2)))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
