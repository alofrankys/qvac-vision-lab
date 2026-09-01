import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SEMANTIC_EXTRACTION_PRESET, SEMANTIC_PROMPT_VERSION, SEMANTIC_REVIEW_VERDICTS, SEMANTIC_TASKS, deriveSearchToken, normalizeSemanticOutput, selectSemanticQuickPhotoIds, semanticMetrics } from '../src/semantic/index.mjs'
import { TASKS, promptVersionForTask } from '../src/domain/tasks.mjs'
import { assertVisionTaskInput } from '../src/vision/provider-contract.mjs'

const expectedPrompts = [
  `Look at the dog and identify what it is physically on, inside, or directly touching.

Examples may include:
floor
grass
sofa
armchair
dog bed
blanket
car seat
sand
pavement

Return one short factual phrase only.

Do not describe the whole image.
Do not infer emotion, intent, location, or activity.
If you cannot determine it visually, return:
unclear`,
  `List up to three clearly visible objects that are directly next to, touching, held by, or clearly associated with the dog.

Examples may include:
toy
ball
rope toy
bowl
blanket
leash
bed
cushion

Return only short object names separated by commas.

Do not describe the room.
Do not infer hidden objects.
Do not name an object unless it is clearly visible.

If no relevant object is clearly visible, return:
none`,
  `Briefly describe the dog's visible body posture.

Examples:
standing
sitting
lying on side
lying curled up
lying on back
crouching

Return one short factual phrase only.

Do not infer emotion, intention, pain, sleep, or activity.

If the posture is visually ambiguous, return:
unclear`
]

test('Semantic Extraction v1 is Base-only and contains exactly three open-output tasks', () => {
  assert.equal(SEMANTIC_EXTRACTION_PRESET.providerId, 'visionpsy-patched-base')
  assert.equal(SEMANTIC_EXTRACTION_PRESET.quickLimit, 20)
  assert.deepEqual(SEMANTIC_TASKS.map(task => task.prompt), expectedPrompts)
  assert.deepEqual(SEMANTIC_TASKS.map(task => task.labels), [[], [], []])
  assert.ok(SEMANTIC_TASKS.every(task => promptVersionForTask(task.id) === SEMANTIC_PROMPT_VERSION))
  assert.ok(SEMANTIC_TASKS.every(task => TASKS.includes(task)))
  assert.doesNotThrow(() => assertVisionTaskInput({ imagePath: '/tmp/photo.jpg', prompt: 'semantic prompt', allowedLabels: [], outputMode: 'semantic' }))
})

test('semantic normalization is textual and conservative', () => {
  assert.deepEqual(normalizeSemanticOutput('physical_context', '  Lying on a Blue Sofa. '), { normalized: 'lying on a blue sofa', validationResult: 'VALID', searchToken: 'sofa' })
  assert.deepEqual(normalizeSemanticOutput('associated_objects', ' Rope toy, blanket. '), { normalized: 'rope toy, blanket', validationResult: 'VALID', searchToken: 'unknown' })
  assert.equal(normalizeSemanticOutput('associated_objects', 'ball, bowl, leash, blanket').validationResult, 'INVALID_OUTPUT')
  assert.equal(deriveSearchToken('pet bed'), 'dog_bed')
  assert.equal(deriveSearchToken('unmapped thing'), 'unknown')
})

test('quick semantic subset is deterministic, varied and capped at 20', () => {
  const photos = Array.from({ length: 30 }, (_, index) => `p${index + 1}`)
  const annotations = [
    { photoId: 'p8', taskId: 'surface', correctLabel: 'sofa' }, { photoId: 'p9', taskId: 'dog_on_dog_bed', correctLabel: 'yes' },
    { photoId: 'p10', taskId: 'surface', correctLabel: 'grass' }, { photoId: 'p11', taskId: 'surface', correctLabel: 'floor' },
    { photoId: 'p12', taskId: 'toy', correctLabel: 'toy_visible' }, { photoId: 'p13', taskId: 'toy', correctLabel: 'no_toy_visible' },
    { photoId: 'p14', taskId: 'posture', correctLabel: 'standing' }, { photoId: 'p15', taskId: 'posture', correctLabel: 'sitting' }, { photoId: 'p16', taskId: 'posture', correctLabel: 'lying' }
  ]
  const first = selectSemanticQuickPhotoIds(photos, annotations)
  assert.deepEqual(first, selectSemanticQuickPhotoIds(photos, annotations))
  assert.equal(first.length, 20)
  for (const id of ['p8','p9','p10','p11','p12','p13','p14','p15','p16']) assert.ok(first.includes(id))
})

test('semantic usefulness keeps strict and useful rates separate', () => {
  const inferences = [{ id: 'i1', taskId: 'physical_context', validationResult: 'VALID' }, { id: 'i2', taskId: 'physical_context', validationResult: 'VALID' }, { id: 'i3', taskId: 'physical_context', validationResult: 'INVALID_OUTPUT' }]
  const reviews = [{ inferenceId: 'i1', verdict: 'CORRECT' }, { inferenceId: 'i2', verdict: 'PARTIALLY_CORRECT' }, { inferenceId: 'i3', verdict: 'HALLUCINATED' }]
  const metric = semanticMetrics(inferences, reviews)[0]
  assert.equal(metric.strictCorrectness, 1 / 3)
  assert.equal(metric.usefulRate, 2 / 3)
  assert.equal(metric.invalid_output, 1)
  assert.deepEqual(SEMANTIC_REVIEW_VERDICTS, ['CORRECT', 'PARTIALLY_CORRECT', 'WRONG', 'HALLUCINATED', 'UNCLEAR_IMAGE'])
})

test('semantic UI exposes preset, Quick 20, review verdicts and result views', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  for (const text of ['Semantic Extraction Benchmark v1', 'Quick semantic test — 20 photos', 'Start Semantic Benchmark', 'Most useful outputs', 'Hallucinations / failures']) assert.match(html, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  for (const verdict of SEMANTIC_REVIEW_VERDICTS) assert.match(app, new RegExp(verdict))
})
