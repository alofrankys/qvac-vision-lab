#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

const root = path.resolve(import.meta.dirname, '..')
const samplePath = path.join(root, 'data/qvac-official-replication/audit-prompt-sample-20260822.json')
const outputPath = path.join(root, 'data/qvac-official-replication/audit-prompt-ablation-20260822.json')
const serverPath = path.join(os.homedir(), 'Projects/visionpsy-twinpaws/vendor/llama-mtmd-metal/bin/llama-server')
const modelPath = path.join(os.homedir(), '.qvac/models/194207cdb1a218aa_visionpsy-nano-460m-q8_0.gguf')
const mmprojPath = path.join(os.homedir(), '.qvac/models/4abdf8c5183110ba_mmproj-visionpsy-nano-460m-q8.gguf')
const port = 8897

const rows = JSON.parse(await readFile(samplePath, 'utf8'))

function stock(row) {
  let text = row.hint ? `Hint: ${row.hint}\n` : ''
  text += `Question: ${row.question}\nOptions:\n${row.options.map(([k, v]) => `${k}. ${v}`).join('\n')}\n`
  text += 'Please select the correct answer from the options above. \n'
  return text
}

const prompts = {
  qvac_pr: row => stock(row)
    .replace('\nOptions:', '\nChoices:')
    .replace('Please select the correct answer from the options above.', 'Answer with the letter.') + '\nAnswer:',
  stock_vlmeval: stock,
  qvac_no_suffix: row => stock(row)
    .replace('\nOptions:', '\nChoices:')
    .replace('Please select the correct answer from the options above.', 'Answer with the letter.'),
  terse_letter_only: row => `${row.hint ? `Hint: ${row.hint}\n` : ''}Question: ${row.question}\nChoices:\n${row.options.map(([k, v]) => `${k}. ${v}`).join('\n')}\nRespond with only the single letter of the correct choice.\nAnswer:`,
}

function normalize(text, options) {
  const upper = String(text).toUpperCase()
  const matches = [...upper.matchAll(/(?:ANSWER\s*(?:IS|:)?\s*|^|[\s(])([A-E])(?:[\s).,:;!?]|$)/g)]
  if (matches.length) return matches.at(-1)[1]
  const cleaned = String(text).trim().toLowerCase().replace(/[.\s]+$/g, '')
  const hit = options.find(([, value]) => String(value).trim().toLowerCase().replace(/[.\s]+$/g, '') === cleaned)
  return hit?.[0] ?? null
}

const child = spawn(serverPath, ['-m', modelPath, '--mmproj', mmprojPath, '--host', '127.0.0.1', '--port', String(port), '-c', '8192', '-ngl', '99', '--parallel', '1'], {
  env: { ...process.env, MTMD_NO_UPSCALE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
})
let logs = ''
const capture = chunk => { logs = `${logs}${chunk}`.slice(-12000) }
child.stdout.on('data', capture)
child.stderr.on('data', capture)

async function ready() {
  for (let i = 0; i < 300; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`server failed to start: ${logs}`)
}

async function infer(row, prompt) {
  const bytes = await readFile(path.join(root, 'data/vlmeval/images/ScienceQA_TEST', `${row.index}.png`))
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelPath,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` } },
        { type: 'text', text: prompt },
      ] }],
      temperature: 0, max_tokens: 32, stream: false,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(-1000)}`)
  return (await res.json()).choices?.[0]?.message?.content ?? ''
}

const results = { sampleSize: rows.length, samplePath, modelPath, mmprojPath, variants: {} }
try {
  await ready()
  for (const [name, makePrompt] of Object.entries(prompts)) {
    const items = []
    let correct = 0
    for (const [i, row] of rows.entries()) {
      const raw = await infer(row, makePrompt(row))
      const predicted = normalize(raw, row.options)
      const hit = predicted === row.answer
      if (hit) correct++
      items.push({ index: row.index, answer: row.answer, predicted, raw, hit })
      if ((i + 1) % 50 === 0 || i + 1 === rows.length) {
        process.stdout.write(`${JSON.stringify({ variant: name, progress: i + 1, total: rows.length, correct, accuracy: correct / (i + 1) })}\n`)
      }
    }
    results.variants[name] = { correct, accuracy: correct / rows.length, items }
    await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`)
  }
} finally {
  try { process.kill(-child.pid, 'SIGTERM') } catch { try { child.kill('SIGTERM') } catch {} }
}

process.stdout.write(`${JSON.stringify({ final: true, outputPath, scores: Object.fromEntries(Object.entries(results.variants).map(([k, v]) => [k, { correct: v.correct, accuracy: v.accuracy }])) })}\n`)
