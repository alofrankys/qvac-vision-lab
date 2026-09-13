import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import sharp from 'sharp'

test('real HTTP boundary: origin, token, explicit provider and streamed provenance', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qvac-showcase-api-test-'))
  const child = spawn(process.execPath, ['src/server.mjs'], { env: { ...process.env, PORT: '0', PAWVAULT_DATA_DIR: directory, NODE_ENV: 'test-showcase', QVAC_ARENA_TEST_FAKE_PROVIDERS: '1', QVAC_ENABLE_FRAME_CAPTURE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  try {
    // Server must report its actual assigned port, not the requested zero.
    let base
    for (let i = 0; i < 100; i++) {
      base = output.match(/http:\/\/127\.0\.0\.1:(\d+)/)?.[0]
      if (base) break
      if (child.exitCode !== null) throw new Error(output)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(base, output)
    assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'http://localhost:9999' } })).status, 403)
    const post = (body, headers = {}) => fetch(`${base}/api/showcase/run`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) })
    assert.equal((await post({})).status, 403)
    const { token } = await (await fetch(`${base}/api/session`)).json()
    const headers = { 'X-QVAC-Session': token }
    assert.equal((await post({ prompt: 'Question', providerId: 'typo' }, headers)).status, 400)
    const pixels = Buffer.from(Array.from({ length: 128 * 128 * 3 }, (_, i) => (i * 37 + Math.floor(i / 128)) % 256))
    const bytes = await sharp(pixels, { raw: { width: 128, height: 128, channels: 3 } }).jpeg().toBuffer()
    const response = await post({ prompt: 'Describe the image', providerId: 'qvac-visionpsy-standard-q8', imageDataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}` }, headers)
    const events = (await response.text()).trim().split('\n').map(JSON.parse)
    assert.equal(response.status, 200, JSON.stringify(events))
    assert.equal(events.at(-1).type, 'complete', JSON.stringify(events))
    assert.equal(events.at(-1).provider.id, 'qvac-visionpsy-standard-q8')
    assert.equal(events.at(-1).metrics.backend, 'fake')
    assert.deepEqual((await (await fetch(`${base}/api/health`)).json()).activeRunIds, [])
    const delayed = await post({ prompt: '[FAKE_DELAY] Describe', providerId: 'qvac-visionpsy-standard-q8', imageDataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}` }, headers)
    assert.equal((await (await fetch(`${base}/api/health`)).json()).inferenceActive, true)
    assert.equal((await post({ prompt: 'Concurrent', providerId: 'qvac-visionpsy-standard-q8' }, headers)).status, 409)
    assert.equal((await fetch(`${base}/api/analyze`, { method: 'POST', headers: { Origin: base, ...headers } })).status, 409)
    await delayed.text()
  } finally {
    if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit') }
    // Keep disposable fixture for inspection; never touch the user's data directory.
  }
})
