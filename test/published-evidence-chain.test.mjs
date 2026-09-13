import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const json = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'))

test('published chart is computed from all preserved raw answers, without duplicates', async () => {
  const primary = await json('../reports/visionpsy-three-way-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json')
  const addendum = await json('../reports/visionpsy-standard-q4-realworldqa-765-qvac-sdk-vlmevalkit-470e517.json')
  const chart = await json('../public/showcase/visionpsy-four-way-realworldqa-765.json')
  const rows = [...primary.results, ...addendum.results]
  assert.equal(rows.length, 3060)
  assert.equal(new Set(rows.map(r => `${r.caseId}:${r.providerId}`)).size, 3060)
  const expectedCases = new Set(primary.results.map(r => r.caseId))
  assert.equal(expectedCases.size, 765)
  for (const provider of chart.providers) {
    const records = rows.filter(r => r.providerId === provider.providerId)
    assert.equal(records.length, 765)
    assert.deepEqual(new Set(records.map(r => r.caseId)), expectedCases)
    const passed = records.filter(r => r.evaluation?.status === 'PASS').length
    assert.equal(provider.real.passed, passed)
    assert.equal(provider.real.failed, 765 - passed)
    assert.equal(provider.real.accuracy, passed / 765)
  }
  assert.deepEqual(primary.dataset.sourceIndices, addendum.dataset.sourceIndices)
  assert.deepEqual(primary.dataset.inputManifest, addendum.dataset.inputManifest)
})
