import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { StateStore } from '../src/storage/store.mjs'

test('StateStore update is atomic when a mutator fails', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qvac-store-'))
  try {
    const file = path.join(directory, 'state.json')
    const store = await new StateStore(file).init()
    const before = store.snapshot()
    await assert.rejects(store.update(state => { state.runs.push({ id: 'must-not-survive' }); throw new Error('synthetic failure') }), /synthetic failure/)
    assert.deepEqual(store.snapshot(), before)
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), before)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('StateStore serializes concurrent updates without losing changes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qvac-store-'))
  try {
    const store = await new StateStore(path.join(directory, 'state.json')).init()
    await Promise.all([
      store.update(async state => { await new Promise(resolve => setTimeout(resolve, 20)); state.runs.push({ id: 'first' }) }),
      store.update(state => { state.runs.push({ id: 'second' }) })
    ])
    assert.deepEqual(store.snapshot().runs.map(item => item.id), ['first','second'])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
