import { executePatchedProcess } from '../src/vision/visionpsy-patched-provider.mjs'

const attempts = 10
const timeoutMs = 80
const durations = []
const pids = []

for (let index = 0; index < attempts; index += 1) {
  const started = performance.now()
  try {
    await executePatchedProcess('/bin/sh', ['-c', 'sleep 5'], process.env, { timeoutMs, onSpawn: child => pids.push(child.pid) })
    throw new Error('Synthetic blocked process unexpectedly completed')
  } catch (error) {
    if (error.code !== 'MODEL_TIMEOUT') throw error
    durations.push(Math.round(performance.now() - started))
  }
}

await new Promise(resolve => setTimeout(resolve, 100))
const survivors = pids.filter(pid => { try { process.kill(pid, 0); return true } catch { return false } })
const report = { attempts, timeoutMs, maxDurationMs: Math.max(...durations), averageDurationMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length), survivors }
console.log(JSON.stringify(report, null, 2))
if (survivors.length || report.maxDurationMs > 2000) process.exitCode = 1
