import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildDiagnosticBundle, buildDiagnosticRun } from '../src/export/diagnostic-export.mjs'

const run = { id: 'run-test', status: 'COMPLETED', benchmarkPreset: 'focused_base_v1', startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z', durationMs: 1000, providerId: 'visionpsy-patched-base', photoIds: ['p1'], taskIds: ['dog_count'], providerDiagnostics: { backend: 'Metal' } }
const lifecycle = { server_pid: 42, server_started_at: run.startedAt, server_restart_count: 1, request_started_at: run.startedAt, request_finished_at: run.finishedAt, timeout_triggered: false, retry_count: 1 }
const state = { runs: [run], photos: [{ id: 'p1', filename: 'dog.jpg', sourcePath: 'dog.jpg', storedFilename: 'stored.jpg', inferenceFilename: 'p1.jpg', fileSizeBytes: 3, mimeType: 'image/jpeg', detectedFormat: 'jpeg', imagePipeline: { ready: true, pipeline: { imageDecode: { status: 'ok' }, normalizedDecode: { status: 'ok' }, preview: { status: 'ok' } }, original: { colorspace: 'srgb' }, normalized: { width: 10, height: 10, maxDimension: 2048, crop: 'full-image' } }, exifCaptureDate: null, exifGps: null, petIdentity: 'Unknown', manualLocation: '' }], inferences: [{ id: 'i1', runId: run.id, photoId: 'p1', taskId: 'dog_count', prompt: 'unchanged prompt', startedAt: run.startedAt, finishedAt: run.finishedAt, latencyMs: 900, rawOutput: 'There appears to be one dog.', normalizedOutput: 'one', validationResult: 'VALID', error: null, runtimeStats: lifecycle }], reviews: [{ inferenceId: 'i1', verdict: 'WRONG', correctLabel: 'two' }] }

test('diagnostic JSON contains provider, photo, raw output, normalized output and review', () => {
  const diagnostic = buildDiagnosticRun(state, run)
  assert.equal(diagnostic.benchmark_preset, 'focused_base_v1')
  assert.equal(diagnostic.provider.backend, 'Metal')
  assert.equal(diagnostic.photos[0].predictions[0].rawOutput, 'There appears to be one dog.')
  assert.equal(diagnostic.photos[0].predictions[0].normalizedOutput, 'one')
  assert.equal(diagnostic.photos[0].predictions[0].humanReview.correctLabel, 'two')
  assert.deepEqual(diagnostic.photos[0].predictions[0].runtimeStats, lifecycle)
})

test('diagnostic ZIP contains run, summary, privacy README and only run photos', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pawvault-export-'))
  await writeFile(path.join(directory, 'stored.jpg'), Buffer.from([1, 2, 3]))
  const inferenceDirectory = path.join(directory, 'inference-images')
  await import('node:fs/promises').then(fs => fs.mkdir(inferenceDirectory))
  await writeFile(path.join(inferenceDirectory, 'p1.jpg'), Buffer.from([4, 5, 6]))
  const zip = await buildDiagnosticBundle(state, run, directory, inferenceDirectory)
  assert.equal(zip.readUInt32LE(0), 0x04034b50)
  const text = zip.toString('latin1')
  for (const name of ['run.json', 'summary.json', 'README.txt', 'photos/original/dog.jpg', 'photos/inference/dog.jpg']) assert.ok(text.includes(name))
  assert.ok(text.includes('PRIVACY WARNING'))
  assert.ok(text.includes('benchmark_preset = focused_base_v1'))
})

test('minimal semantic diagnostic preserves exact inference evidence and human note', () => {
  const minimalRun = { ...run, id: 'run-minimal', benchmarkPreset: 'minimal_smart_semantic_v2', taskIds: ['minimal_visible_posture'] }
  const minimalState = {
    ...state,
    runs: [minimalRun],
    inferences: [{ id: 'minimal-i1', runId: minimalRun.id, photoId: 'p1', taskId: 'minimal_visible_posture', providerId: 'visionpsy-patched-base', runtime: 'patched llama.cpp server', runtimeVersion: 'test-runtime', model: 'VisionPsy-Nano-460M', modelVersion: 'test-model', projection: 'test-mmproj', promptVersion: 'minimal-smart-semantic-v2', prompt: 'Describe the visible posture of each clearly visible dog.', startedAt: run.startedAt, finishedAt: run.finishedAt, latencyMs: 875, rawOutput: 'Main dog is standing. Second dog is sitting.', normalizedOutput: 'Main dog is standing. Second dog is sitting.', semanticPhrase: 'Main dog is standing. Second dog is sitting.', validationResult: 'VALID', error: null, runtimeStats: lifecycle }],
    reviews: [{ inferenceId: 'minimal-i1', verdict: 'PARTIALLY_CORRECT', humanNote: 'Second dog is partly occluded.', groundTruthSource: 'HUMAN_SEMANTIC_REVIEW' }]
  }
  const prediction = buildDiagnosticRun(minimalState, minimalRun).photos[0].predictions[0]
  assert.equal(prediction.prompt, 'Describe the visible posture of each clearly visible dog.')
  assert.equal(prediction.rawOutput, 'Main dog is standing. Second dog is sitting.')
  assert.equal(prediction.latencyMs, 875)
  assert.equal(prediction.providerId, 'visionpsy-patched-base')
  assert.equal(prediction.runtime, 'patched llama.cpp server')
  assert.equal(prediction.model, 'VisionPsy-Nano-460M')
  assert.equal(prediction.review.humanNote, 'Second dog is partly occluded.')
  assert.equal(buildDiagnosticRun(minimalState, minimalRun).photos[0].inferenceInput.image, 'photos/inference/dog.jpg')
})
