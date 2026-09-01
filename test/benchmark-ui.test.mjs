import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')

test('new run has a clear three-step empty state', () => {
  assert.match(html, /NEW RUN/)
  assert.match(html, /No photos loaded yet\./)
  assert.match(html, /1\. Add photos/)
  assert.match(html, /2\. Choose a benchmark preset/)
  assert.match(html, /3\. Start analysis/)
})

test('focused benchmark confirmation card exposes required workflow state', () => {
  for (const text of ['FOCUSED STANDARD BENCHMARK V1', 'VisionPsy-Nano-460M', 'Estimated predictions', 'Quick validation', 'Full benchmark', 'Start Benchmark']) assert.match(html, new RegExp(text))
  assert.match(html, /benchmark-experimental/)
  assert.match(app, /preset\.coreTaskIds/)
  assert.match(app, /state\.selectedProviderId = 'visionpsy-patched-base'/)
})

test('advanced controls and review filters remain available', () => {
  assert.match(html, /Advanced \/ Custom Benchmark/)
  assert.match(html, /Only incorrect \/ unreviewed/)
  assert.match(html, /All labels/)
})

test('new runs preserve history and keep previous data behind explicit controls', () => {
  assert.match(html, /View old photos/)
  assert.match(html, /PREVIOUS RUNS/)
  assert.match(app, /Earlier photos remain in the archive/)
})
