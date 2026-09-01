import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { MINIMAL_SEMANTIC_PROMPT_VERSION, MINIMAL_SEMANTIC_TASKS, MINIMAL_SMART_SEMANTIC_PRESET, minimalSemanticIssues, normalizeMinimalSemanticOutput, selectMinimalSmartPhotoIds, semanticMetrics } from '../src/semantic/index.mjs'
import { TASKS, promptVersionForTask } from '../src/domain/tasks.mjs'

const expectedPrompts = [
  `What is each clearly visible dog physically on or directly supported by?

Answer briefly and factually.
If there are multiple dogs, describe each separately.
If one dog is much more visible than the others, describe that dog first.
Do not describe the whole scene.
Do not infer anything that is not clearly visible.`,
  `What clearly visible objects are directly touching, held by, or immediately next to each dog?

Answer briefly.
If there are multiple dogs, distinguish them when possible.
Do not list background objects.
Do not guess.`,
  `Describe the visible posture of each clearly visible dog.

Answer briefly and factually.
If there are multiple dogs, describe each separately.
Describe the most visible dog first.
Do not infer emotion, intention, sleep, pain, or activity.`
]

test('Minimal Smart Semantic Test v2 is Base-only with three exact unprimed prompts', () => {
  assert.equal(MINIMAL_SMART_SEMANTIC_PRESET.providerId, 'visionpsy-patched-base')
  assert.equal(MINIMAL_SMART_SEMANTIC_PRESET.quickLimit, 10)
  assert.equal(MINIMAL_SMART_SEMANTIC_PRESET.mode, 'minimal-semantic')
  assert.deepEqual(MINIMAL_SEMANTIC_TASKS.map(task => task.prompt), expectedPrompts)
  assert.deepEqual(MINIMAL_SEMANTIC_TASKS.map(task => task.labels), [[], [], []])
  assert.ok(MINIMAL_SEMANTIC_TASKS.every(task => TASKS.includes(task)))
  assert.ok(MINIMAL_SEMANTIC_TASKS.every(task => promptVersionForTask(task.id) === MINIMAL_SEMANTIC_PROMPT_VERSION))
  for (const prompt of expectedPrompts) {
    assert.doesNotMatch(prompt, /examples?|allowed labels?|return exactly|such as|including:/i)
    assert.doesNotMatch(prompt, /\b(toy|bowl|blanket|leash|sofa|grass|floor|standing|sitting|lying)\b/i)
  }
})

test('minimal subset is deterministic, varied and exactly ten when enough photos exist', () => {
  const photos = Array.from({ length: 14 }, (_, index) => ({ id: `p${index + 1}`, imagePipeline: { ready: true } }))
  const annotations = [
    ['p1', 'dog_count', 'two'], ['p2', 'dog_count', 'one'], ['p3', 'environment', 'outdoor'], ['p4', 'environment', 'indoor'],
    ['p5', 'surface', 'sofa'], ['p6', 'dog_on_dog_bed', 'yes'], ['p7', 'surface', 'grass'], ['p8', 'surface', 'floor'],
    ['p9', 'toy', 'toy_visible'], ['p10', 'posture', 'standing']
  ].map(([photoId, taskId, correctLabel]) => ({ photoId, taskId, correctLabel }))
  const ids = photos.map(photo => photo.id)
  const first = selectMinimalSmartPhotoIds(ids, annotations, photos)
  assert.deepEqual(first, selectMinimalSmartPhotoIds(ids, annotations, photos))
  assert.deepEqual(first, ids.slice(0, 10))
  assert.equal(first.length, 10)
})

test('minimal semantic output stays natural and metrics avoid closed-label accuracy', () => {
  assert.deepEqual(normalizeMinimalSemanticOutput('Main dog: sofa\nSecond dog: floor'), { normalized: 'Main dog: sofa\nSecond dog: floor', validationResult: 'VALID', searchToken: 'unknown' })
  assert.equal(normalizeMinimalSemanticOutput('  ').validationResult, 'INVALID_OUTPUT')
  const inferences = [{ id: 'i1', taskId: 'minimal_visible_posture', validationResult: 'VALID' }, { id: 'i2', taskId: 'minimal_visible_posture', validationResult: 'VALID' }, { id: 'i3', taskId: 'minimal_visible_posture', validationResult: 'VALID' }]
  const reviews = [{ inferenceId: 'i1', verdict: 'CORRECT' }, { inferenceId: 'i2', verdict: 'PARTIALLY_CORRECT' }, { inferenceId: 'i3', verdict: 'HALLUCINATED' }]
  const metric = semanticMetrics(inferences, reviews, MINIMAL_SEMANTIC_TASKS).find(item => item.taskId === 'minimal_visible_posture')
  assert.equal(metric.usefulRate, 2 / 3)
  assert.equal(metric.hallucinationRate, 1 / 3)
})

test('minimal diagnostics flag leakage, generic repetition, second-dog omission, hallucination and inference', () => {
  const inferences = [
    { id: 'i1', photoId: 'p1', taskId: 'minimal_associated_objects', rawOutput: 'Answer briefly. The dog is happy.', normalizedOutput: 'generic' },
    { id: 'i2', photoId: 'p2', taskId: 'minimal_associated_objects', rawOutput: 'generic', normalizedOutput: 'generic' },
    { id: 'i3', photoId: 'p3', taskId: 'minimal_associated_objects', rawOutput: 'generic', normalizedOutput: 'generic' }
  ]
  const issues = minimalSemanticIssues(inferences, [{ inferenceId: 'i1', verdict: 'HALLUCINATED' }], [{ photoId: 'p1', taskId: 'dog_count', correctLabel: 'two' }])
  for (const code of ['PROMPT_LEAKAGE', 'REPEATED_GENERIC_OUTPUT', 'IGNORED_SECOND_DOG', 'HALLUCINATED_OBJECTS', 'BEHAVIOR_OR_EMOTION_INFERENCE']) assert.ok(issues.some(issue => issue.code === code), code)
})

test('minimal semantic UI exposes selection, prompts, review note and no full-run control', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8')
  for (const text of ['Minimal Smart Semantic Test v2', 'SELECTED 10 PHOTOS', 'Human note (optional)', 'Start Minimal Smart Semantic Test', 'STANDARD · METAL ON']) assert.match(`${html}\n${app}`, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(app, /minimalQuickPhotoIds/)
  assert.match(app, /humanNote/)
  assert.doesNotMatch(html.match(/id="minimal-semantic-confirmation"[\s\S]*?<\/section>/)?.[0] || '', /Full semantic test/)
})
