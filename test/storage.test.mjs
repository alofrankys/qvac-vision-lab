import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { StateStore } from '../src/storage/store.mjs'

test('storage initializes schema v8 and persists evaluation runs and shared annotations', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pawvault-store-'))
  const file = path.join(directory, 'state.json')
  const store = await new StateStore(file).init()
  await store.update(state => {
    state.runs.push({ id: 'run_1', providerId: 'qvac-smolvlm2' })
    state.annotations.push({ id: 'a1', photoId: 'p1', taskId: 'environment', correctLabel: 'outdoor' })
  })
  const persisted = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(persisted.schemaVersion, 8)
  assert.equal(persisted.runs[0].providerId, 'qvac-smolvlm2')
  assert.equal(persisted.annotations[0].correctLabel, 'outdoor')
})
