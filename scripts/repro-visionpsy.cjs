'use strict'

const fs = require('bare-fs')

const argv = typeof process === 'undefined' ? Bare.argv : process.argv
const packageRoot = argv[2]
const modelPath = argv[3]
const projectionModel = argv[4]
const label = argv[5] || 'model-under-test'
const imagePath = argv[6]

if (!packageRoot || !modelPath || !projectionModel) {
  throw new Error('Usage: bare scripts/repro-visionpsy.cjs <llm-package-root> <model.gguf> <mmproj.gguf> [label] [image]')
}

const selected = { model: modelPath, projectionModel }

const LlmLlamacpp = require(packageRoot)
const packageJson = require(`${packageRoot}/package.json`)
const config = {
  device: 'gpu',
  gpu_layers: '99',
  ctx_size: '2048',
  predict: '128',
  temp: '0.1',
  verbosity: '2',
  'mmproj-use-gpu': 'false'
}

console.log(JSON.stringify({ addonVersion: packageJson.version, label, files: selected, config }))

async function main() {
  const model = new LlmLlamacpp({
    files: { model: [selected.model], projectionModel: selected.projectionModel },
    config,
    logger: console,
    opts: { stats: true }
  })

  try {
    await model.load()
    console.log('LOAD_OK')
    if (imagePath) {
      const response = await model.run([
        { role: 'user', type: 'media', content: new Uint8Array(fs.readFileSync(imagePath)) },
        { role: 'user', content: 'Describe the image factually in one short sentence.' }
      ])
      const output = []
      response.onUpdate(token => output.push(token))
      await response.await()
      console.log(`OUTPUT=${output.join('').trim()}`)
    }
  } finally {
    await model.unload().catch(() => {})
  }
}

main().catch(error => {
  console.error('REPRO_ERROR', error && error.stack ? error.stack : error)
  if (typeof process === 'undefined') Bare.exitCode = 1
  else process.exitCode = 1
})
