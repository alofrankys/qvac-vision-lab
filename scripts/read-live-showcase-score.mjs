#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const inspectorUrl = process.env.QVAC_INSPECTOR_URL || 'http://127.0.0.1:9229/json/list'
const [target] = await (await fetch(inspectorUrl)).json()
if (!target?.webSocketDebuggerUrl) throw new Error('Live benchmark inspector is unavailable')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 1
const pending = new Map()
const scripts = []
let resolvePaused
let rejectPaused
const paused = new Promise((resolve, reject) => {
  resolvePaused = resolve
  rejectPaused = reject
})
const timeout = setTimeout(() => rejectPaused(new Error('Timed out waiting for the next completed inference')), 30_000)

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
  if (message.method === 'Debugger.scriptParsed') scripts.push(message.params)
  if (message.method === 'Debugger.paused') resolvePaused(message.params)
})

function call(method, params = {}) {
  const id = nextId
  nextId += 1
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise(resolve => pending.set(id, resolve))
}

await call('Debugger.enable')
await new Promise(resolve => setTimeout(resolve, 250))
const runner = scripts.find(item => item.url.endsWith('/scripts/run-showcase-three-way-api.mjs'))
if (!runner) throw new Error('Live three-way runner was not found')
const sourceResponse = await call('Debugger.getScriptSource', { scriptId: runner.scriptId })
const breakpointLine = sourceResponse.result.scriptSource.split('\n').findIndex(line => line.includes('results.push(checkpointed)'))
if (breakpointLine < 0) throw new Error('Live result checkpoint line was not found')
const breakpoint = await call('Debugger.setBreakpoint', { location: { scriptId: runner.scriptId, lineNumber: breakpointLine, columnNumber: 4 } })

let remainder
try {
  const state = await paused
  clearTimeout(timeout)
  const frame = state.callFrames.find(item => item.url.endsWith('/scripts/run-showcase-three-way-api.mjs')) || state.callFrames[0]
  const expression = `JSON.stringify((()=>{const ids=['visionpsy-patched-base','qvac-visionpsy','visionpsy-patched'];const grouped=results.reduce((out,item)=>{(out[item.caseId]||(out[item.caseId]=[])).push(item);return out},{});const complete=Object.values(grouped).filter(items=>ids.every(id=>items.some(item=>item.providerId===id)));return {cases:complete.length,providers:Object.fromEntries(ids.map(id=>{const items=complete.map(group=>group.find(item=>item.providerId===id));const passed=items.filter(item=>item.evaluation?.status==='PASS').length;return [id,{passed,cases:items.length}]}))}})())`
  const evaluated = await call('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression, returnByValue: true })
  remainder = JSON.parse(evaluated.result?.result?.value)
} finally {
  await call('Debugger.resume')
  if (breakpoint.result?.breakpointId) await call('Debugger.removeBreakpoint', { breakpointId: breakpoint.result.breakpointId })
  socket.close()
}

const root = path.resolve(import.meta.dirname, '..')
const priorReports = await Promise.all([
  'visionpsy-three-way-realworldqa-20.json',
  'visionpsy-three-way-realworldqa-validation-50.json',
  'visionpsy-three-way-realworldqa-validation-50-b.json',
  'visionpsy-three-way-realworldqa-validation-150-c.json'
].map(async filename => JSON.parse(await readFile(path.join(root, 'reports', filename), 'utf8'))))
const providerIds = ['visionpsy-patched-base', 'qvac-visionpsy', 'visionpsy-patched']
const providers = Object.fromEntries(providerIds.map(providerId => {
  const priorItems = priorReports.flatMap(report => report.results).filter(item => item.providerId === providerId)
  const current = remainder.providers[providerId]
  const priorPassed = priorItems.filter(item => item.evaluation?.status === 'PASS').length
  const passed = priorPassed + current.passed
  const cases = priorItems.length + current.cases
  return [providerId, {
    label: priorReports[0].summaries[providerId].label,
    priorPassed,
    remainderPassed: current.passed,
    passed,
    cases,
    accuracy: passed / cases
  }]
}))

process.stdout.write(`${JSON.stringify({ remainderCases: remainder.cases, officialCases: 270 + remainder.cases, providers }, null, 2)}\n`)
