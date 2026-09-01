#!/usr/bin/env node

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import {
  SDK_LOG_ID,
  VERBOSITY,
  completion,
  loadModel,
  loggingStream,
  unloadModel
} from '@qvac/sdk'

const require = createRequire(import.meta.url)

const args = parseArgs(process.argv.slice(2))
if (!args.model || !args.projector || !args.image) {
  console.error('Usage: node scripts/qvac-multimodal-repro.mjs --model PATH --projector PATH --image PATH [--prompt TEXT] [--timeout-ms N]')
  process.exit(2)
}

const prompt = args.prompt || 'Describe the main visible subject in one short factual sentence.'
const timeoutMs = positiveInteger(args['timeout-ms'], 120_000)
const contextSize = positiveInteger(args['ctx-size'], 4096)
let modelId
let sdkLogTask
let modelLogTask
let exitCode = 0

const stamp = (stage, detail = {}) => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), stage, ...detail }))
}

try {
  stamp('repro_start', {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    packages: {
      '@qvac/sdk': packageVersion('@qvac/sdk'),
      '@qvac/llm-llamacpp': packageVersion('@qvac/llm-llamacpp'),
      '@qvac/fabric': packageVersion('@qvac/fabric'),
      'bare-runtime': packageVersion('bare-runtime')
    },
    model: args.model,
    projector: args.projector,
    image: args.image,
    prompt,
    timeoutMs,
    contextSize
  })

  sdkLogTask = mirrorLogs('SDK', SDK_LOG_ID)
  const loadStarted = performance.now()
  stamp('load_model_start')
  modelId = await loadModel({
    modelSrc: args.model,
    modelType: 'llamacpp-completion',
    modelConfig: {
      ctx_size: contextSize,
      projectionModelSrc: args.projector,
      gpu_layers: 99,
      device: 'gpu',
      image_tile_mode: 'sequential',
      verbosity: VERBOSITY.DEBUG
    },
    onProgress: progress => stamp('load_progress', {
      percentage: progress.percentage,
      downloaded: progress.downloaded,
      total: progress.total
    })
  }, { timeout: timeoutMs })
  stamp('load_model_end', { modelId, durationMs: Math.round(performance.now() - loadStarted) })

  modelLogTask = mirrorLogs('MODEL', modelId)
  const inferenceStarted = performance.now()
  stamp('inference_start', { modelId })
  const result = completion({
    modelId,
    history: [{ role: 'user', content: prompt, attachments: [{ path: args.image }] }],
    stream: true,
    generationParams: { temp: 0, top_p: 1, top_k: 40, seed: 42, predict: 32 }
  })
  let rawOutput = ''
  let firstTokenMs = null
  for await (const token of result.tokenStream) {
    if (firstTokenMs === null) {
      firstTokenMs = Math.round(performance.now() - inferenceStarted)
      stamp('first_token', { durationMs: firstTokenMs })
    }
    rawOutput += token
  }
  const stats = await result.stats
  stamp('inference_end', {
    durationMs: Math.round(performance.now() - inferenceStarted),
    firstTokenMs,
    rawOutput,
    stats
  })
} catch (error) {
  exitCode = 1
  stamp('repro_error', {
    name: error?.name,
    code: error?.code,
    message: error?.message || String(error),
    stack: error?.stack
  })
} finally {
  if (modelId) {
    const unloadStarted = performance.now()
    try {
      await unloadModel({ modelId, clearStorage: false, autoClose: true })
      stamp('unload_model_end', { durationMs: Math.round(performance.now() - unloadStarted) })
    } catch (error) {
      exitCode = 1
      stamp('unload_model_error', { message: error?.message || String(error) })
    }
  }
  await settleBriefly(sdkLogTask, modelLogTask)
  stamp('repro_end', { exitCode })
  process.exit(exitCode)
}

function mirrorLogs(label, id) {
  return (async () => {
    try {
      for await (const log of loggingStream({ id })) {
        stamp('qvac_log', {
          source: label,
          logTimestamp: new Date(log.timestamp).toISOString(),
          level: log.level,
          namespace: log.namespace,
          message: log.message
        })
      }
    } catch (error) {
      stamp('qvac_log_stream_end', { source: label, message: error?.message || String(error) })
    }
  })()
}

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) continue
    parsed[key.slice(2)] = argv[index + 1]
    index += 1
  }
  return parsed
}

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function packageVersion(name) {
  try {
    let directory = dirname(require.resolve(name))
    const root = parse(directory).root
    while (directory !== root) {
      try {
        return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version
      } catch {
        directory = dirname(directory)
      }
    }
    return null
  } catch {
    return null
  }
}

async function settleBriefly(...tasks) {
  const active = tasks.filter(Boolean)
  if (!active.length) return
  await Promise.race([
    Promise.allSettled(active),
    new Promise(resolve => setTimeout(resolve, 250))
  ])
}
