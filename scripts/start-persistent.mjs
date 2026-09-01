import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'data')
const logPath = path.join(dataDir, 'qvac-server.log')
const pidPath = path.join(dataDir, 'qvac-server.pid')
const port = String(process.env.PORT || 8878)

mkdirSync(dataDir, { recursive: true })

try {
  const existingPid = Number(readFileSync(pidPath, 'utf8').trim())
  if (Number.isInteger(existingPid) && existingPid > 0) {
    process.kill(existingPid, 0)
    console.log(JSON.stringify({ status: 'already-running', pid: existingPid, port, logPath }))
    process.exit(0)
  }
} catch {}

const logFd = openSync(logPath, 'a')
const child = spawn(process.execPath, ['src/server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: port },
  detached: true,
  stdio: ['ignore', logFd, logFd]
})

child.unref()
writeFileSync(pidPath, `${child.pid}\n`)
closeSync(logFd)
console.log(JSON.stringify({ status: 'started', pid: child.pid, port, logPath }))
