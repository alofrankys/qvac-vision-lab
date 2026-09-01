import test from 'node:test'
import assert from 'node:assert/strict'
import { TASKS, normalizeOutput, normalizeDogCountOutput, normalizeTaskOutput, promptVersionForTask } from '../src/domain/tasks.mjs'

test('all prompts are closed-label, single-task prompts with unclear fallback', () => {
  const legacyTasks = TASKS.slice(0, 11)
  assert.equal(legacyTasks.length, 11)
  for (const task of legacyTasks) {
    assert.ok(task.labels.includes('unclear'))
    assert.match(task.prompt, /Return exactly one allowed label\./)
    if (task.id !== 'dog_count') assert.match(task.prompt, /If ambiguous, return unclear\./)
    for (const label of task.labels) assert.match(task.prompt, new RegExp(`^${label}$`, 'm'))
  }
})

test('normalization accepts harmless wrappers but rejects explanations', () => {
  assert.deepEqual(normalizeOutput(' "outdoor". ', ['indoor', 'outdoor', 'unclear']), { normalized: 'outdoor', validationResult: 'VALID' })
  assert.deepEqual(normalizeOutput('The image is outdoor.', ['indoor', 'outdoor', 'unclear']), { normalized: null, validationResult: 'INVALID_OUTPUT' })
})

test('dog count normalization is conservative and has no one/two substring collision', () => {
  assert.deepEqual(normalizeDogCountOutput('one'), { normalized: 'one', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('one dog'), { normalized: 'one', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('two'), { normalized: 'two', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('two dogs'), { normalized: 'two', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('2 dogs'), { normalized: 'two', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('there are two dogs'), { normalized: 'two', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('The image shows two dogs, one of which is brown.'), { normalized: 'two', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('The image features a single dog, which is a spaniel.'), { normalized: 'one', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('The image shows a scene in a park. There are two dogs visible:'), { normalized: 'two', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('unclear'), { normalized: 'unclear', validationResult: 'VALID' })
  assert.deepEqual(normalizeDogCountOutput('multiple dogs'), { normalized: null, validationResult: 'INVALID_OUTPUT' })
  assert.deepEqual(normalizeDogCountOutput('someone sees two dogs'), { normalized: null, validationResult: 'INVALID_OUTPUT' })
  assert.deepEqual(normalizeDogCountOutput('One dog is visible and perhaps another is hidden'), { normalized: null, validationResult: 'INVALID_OUTPUT' })
})

test('only dog_count uses the task-specific v2 prompt version', () => {
  assert.equal(promptVersionForTask('dog_count'), 'pawvault-dog-count-v2')
  assert.equal(promptVersionForTask('environment'), 'pawvault-closed-label-v1')
})

test('dog_count uses the tested explicit-separation prompt and is experimental', () => {
  const dogCount = TASKS.find(task => task.id === 'dog_count')
  assert.equal(dogCount.defaultStatus, 'EXPERIMENTAL')
  assert.match(dogCount.prompt, /Count distinct visible dogs, not faces or body parts/)
  assert.match(dogCount.prompt, /If two separate dogs are visible, return two/)
})

test('safe yes/no aliases are task-specific', () => {
  assert.deepEqual(normalizeTaskOutput('person', 'NO', ['person_visible', 'no_person_visible', 'unclear']), { normalized: 'no_person_visible', validationResult: 'VALID' })
  assert.deepEqual(normalizeTaskOutput('person', 'Yes', ['person_visible', 'no_person_visible', 'unclear']), { normalized: 'person_visible', validationResult: 'VALID' })
  assert.deepEqual(normalizeTaskOutput('toy', 'no', ['toy_visible', 'no_toy_visible', 'unclear']), { normalized: 'no_toy_visible', validationResult: 'VALID' })
  assert.deepEqual(normalizeTaskOutput('bowl', 'yes', ['bowl_visible', 'no_bowl_visible', 'unclear']), { normalized: 'bowl_visible', validationResult: 'VALID' })
  assert.deepEqual(normalizeTaskOutput('surface', 'dog', ['sofa', 'bed', 'floor', 'grass', 'dirt', 'other', 'unclear']), { normalized: null, validationResult: 'INVALID_OUTPUT' })
  assert.deepEqual(normalizeTaskOutput('environment', 'no', ['indoor', 'outdoor', 'unclear']), { normalized: null, validationResult: 'INVALID_OUTPUT' })
})
