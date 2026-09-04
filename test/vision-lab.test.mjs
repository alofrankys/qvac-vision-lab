import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EXPERIMENTS, JUDGE_TYPES, VQA_PRESETS, arenaMetrics, createVqaDraft, migrateLabState, validateVqaDraftInput } from '../src/lab/index.mjs'

const photos = Array.from({ length: 12 }, (_, index) => ({ id: `p${index + 1}`, importedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z` }))
const legacy = { schemaVersion: 3, photos, runs: [{ id: 'old-run', photoIds: photos.map(item => item.id), promptVersion: 'legacy-prompt' }], reviews: [{ id: 'r1', reviewSource: 'USER_MANUAL' }], annotations: [] }

test('legacy PawVault evidence migrates additively into experiment 01', () => {
  const before = structuredClone(legacy)
  const state = migrateLabState(structuredClone(legacy), '2026-08-15T00:00:00Z')
  assert.equal(state.schemaVersion, 4)
  assert.equal(state.runs[0].id, before.runs[0].id)
  assert.deepEqual(state.runs[0].photoIds, before.runs[0].photoIds)
  assert.equal(state.runs[0].experimentId, 'experiment_01_pawvault')
  assert.equal(state.datasets[0].id, 'pet_photos_real_v1')
  assert.deepEqual(state.datasets.map(item => item.id), ['pet_photos_real_v1', 'screenshot_real_v1', 'document_chart_real_v1'])
  assert.deepEqual(state.datasets[0].photoIds, photos.map(item => item.id))
  assert.equal(state.runs[0].provenance.migratedWithoutRewritingEvidence, true)
})

test('experiment dashboard exposes completed PawVault and five reusable lab routes', () => {
  assert.equal(EXPERIMENTS.length, 6)
  assert.equal(EXPERIMENTS[0].status, 'COMPLETED')
  assert.deepEqual(EXPERIMENTS.slice(1, 4).map(item => item.status), ['READY', 'READY', 'READY'])
  assert.deepEqual(EXPERIMENTS.slice(4).map(item => item.status), ['READY', 'READY'])
  assert.equal(VQA_PRESETS.length, 4)
  assert.deepEqual(JUDGE_TYPES, ['USER', 'CODEX_ASSISTED', 'LOCAL_MODEL'])
})

test('manual VQA requires one exact question per image and preserves provider provenance', () => {
  const state = migrateLabState(structuredClone(legacy))
  assert.throws(() => validateVqaDraftInput({ presetId: 'real_world_vqa_quick_v1', photoIds: ['p1'], questions: {}, providerIds: ['visionpsy-patched-base'] }, state), /one manual question/)
  const input = { presetId: 'real_world_vqa_quick_v1', datasetId: 'pet_photos_real_v1', photoIds: ['p1', 'p2'], questions: { p1: 'What color is the collar?', p2: 'What is under the dog?' }, providerIds: ['visionpsy-patched-base'] }
  const { run, questions } = createVqaDraft(input, state, '2026-08-15T00:00:00Z', () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.deepEqual(questions.map(item => item.text), ['What color is the collar?', 'What is under the dog?'])
  assert.deepEqual(run.providerIds, ['visionpsy-patched-base'])
  assert.equal(run.provenance.silentFallback, false)
  assert.equal(run.expectedPredictions, 2)
})

test('arena compares the same set without publishing rankings below the review threshold', () => {
  const rows = [
    { id: 'i1', providerId: 'visionpsy-patched-base', validationResult: 'VALID', latencyMs: 100 },
    { id: 'i2', providerId: 'qvac-smolvlm2', validationResult: 'VALID', latencyMs: 60 }
  ]
  const metrics = arenaMetrics(rows, [{ inferenceId: 'i1', verdict: 'CORRECT' }, { inferenceId: 'i2', verdict: 'HALLUCINATED' }])
  assert.equal(metrics[0].rankingEligible, false)
  assert.match(metrics[0].rankingNote, /sample too small/i)
  assert.equal(metrics.find(item => item.providerId === 'qvac-smolvlm2').hallucinated, 1)
})

test('UI keeps PawVault accessible and exposes manual questions, compare, review, datasets, and no fallback', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  assert.match(html, /QVAC Vision Lab/)
  assert.match(html, /PawVault[\s\S]*historical workspace/)
  assert.match(html, /vqa-question-list/)
  assert.match(html, /DATASETS &amp; PROVENANCE/)
  assert.match(html, /Success &amp; failure gallery/)
  assert.match(html, /vqa-file-input/)
  assert.match(html, /experiment-page-menu/)
  for (const number of ['01','02','03','04','05','06']) assert.match(html, new RegExp(`/experiments/${number}/`))
  assert.match(html, /Run official real 20 · 80 inferences/)
  assert.match(html, /Standard Q8 vs Standard Q4 vs Flash Q8 vs Flash Q4/)
  assert.match(html, /Individual results \+ final aggregates/)
  assert.match(app, /applyExperimentRoute/)
  assert.match(app, /Questions are never generated automatically/)
  assert.match(app, /PARTIALLY_CORRECT/)
  assert.match(app, /qvac-smolvlm2/)
  assert.match(html, /silent provider fallback/)
})
