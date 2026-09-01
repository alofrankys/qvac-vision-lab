import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const runnerSource = fs.readFileSync(
  new URL('../scripts/qvac-mps-runner.mjs', import.meta.url),
  'utf8'
)

test('macOS benchmark keeps the system awake while allowing display sleep', () => {
  assert.match(runnerSource, /\['-ims', PYTHON, \.\.\.args\]/)
  assert.doesNotMatch(runnerSource, /-dimsu/)
})
