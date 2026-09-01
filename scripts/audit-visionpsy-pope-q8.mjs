#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const serverPath = path.join(os.homedir(), 'Projects/visionpsy-twinpaws/vendor/llama-mtmd-metal/bin/llama-server')
const modelPath = path.join(os.homedir(), '.qvac/models/194207cdb1a218aa_visionpsy-nano-460m-q8_0.gguf')
const mmprojPath = path.join(os.homedir(), '.qvac/models/4abdf8c5183110ba_mmproj-visionpsy-nano-460m-q8.gguf')
const imagePath = path.join(root, 'data/vlmeval/images/POPE/6.jpg')
const prompt = 'Is there a person in the image? Please answer yes or no.\nGive a very brief answer.'
const imageToken = '<|image|>'
const longTextOnlyPrefix = '<|global_image|>' + imageToken.repeat(64) +
  Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) =>
      `<row_${row + 1}_col_${column + 1}>${imageToken.repeat(64)}`
    ).join('')
  ).join('')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function runVariant({ name, port, noUpscale }) {
  const env = { ...process.env }
  delete env.MTMD_NO_UPSCALE
  if (noUpscale) env.MTMD_NO_UPSCALE = '1'
  const child = spawn(serverPath, [
    '-m', modelPath, '--mmproj', mmprojPath,
    '--host', '127.0.0.1', '--port', String(port),
    '-c', '8192', '-ngl', '99', '--parallel', '1'
  ], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  let logs = ''
  const capture = chunk => { logs = `${logs}${chunk}`.slice(-16000) }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  try {
    for (let i = 0; i < 300; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`)
        if (response.ok) break
      } catch {}
      if (i === 299) throw new Error(`server failed to start: ${logs}`)
      await delay(200)
    }
    const bytes = await readFile(imagePath)
    const complete = async content => {
      const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelPath,
          messages: [{ role: 'user', content }],
          temperature: 0,
          max_tokens: 8,
          stream: false,
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(-2000)}`)
      return response.json()
    }
    const body = await complete([
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}` } },
      { type: 'text', text: prompt },
    ])
    const textOnlyBody = await complete(prompt)
    const longTextOnlyBody = await complete(longTextOnlyPrefix + prompt)
    return {
      name,
      noUpscale,
      output: body.choices?.[0]?.message?.content || '',
      textOnlyOutput: textOnlyBody.choices?.[0]?.message?.content || '',
      longTextOnlyOutput: longTextOnlyBody.choices?.[0]?.message?.content || '',
      timings: body.timings || null,
      logEvidence: logs.split('\n').filter(line => /image|tile|upscal|token/i.test(line)).slice(-12),
    }
  } finally {
    try { process.kill(-child.pid, 'SIGTERM') } catch { try { child.kill('SIGTERM') } catch {} }
  }
}

const results = []
for (const variant of [
  { name: 'qvac_default_full_preprocess', port: 19108, noUpscale: false },
  { name: 'lab_no_upscale', port: 19109, noUpscale: true },
]) {
  const result = await runVariant(variant)
  results.push(result)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
process.stdout.write(`${JSON.stringify({ imagePath, prompt, order: ['image_url', 'text'], results }, null, 2)}\n`)
