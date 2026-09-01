import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FOCUSED_BASE_CORE_TASK_IDS,
  FOCUSED_BASE_EXPERIMENTAL_TASK_IDS,
  FOCUSED_BASE_PRESET,
  FOCUSED_BASE_PROMPT_VERSION,
  TASKS,
  promptVersionForTask
} from '../src/domain/tasks.mjs'

const expected = {
  focused_posture: `What is the main visible posture of the dog?\n\nAllowed labels:\nstanding\nsitting\nlying\nunclear\n\nReturn exactly one label.\nIf the posture is ambiguous, return unclear.`,
  dog_on_human_furniture: `Is the dog visibly on a sofa, couch, armchair, chair, or similar human seating furniture?\n\nAllowed labels:\nyes\nno\nunclear\n\nReturn exactly one label.`,
  dog_on_dog_bed: `Is the dog visibly lying, sitting, or standing on a dog bed or pet bed?\n\nAllowed labels:\nyes\nno\nunclear\n\nReturn exactly one label.`,
  focused_toy_visible: `Is a dog toy clearly visible in the image?\n\nAllowed labels:\nyes\nno\nunclear\n\nReturn exactly one label.`,
  dog_near_bowl: `Is the dog visibly close to a food or water bowl?\n\nAllowed labels:\nyes\nno\nunclear\n\nReturn exactly one label.`,
  dog_on_grass: `Is the dog visibly standing, sitting, or lying on grass?\n\nAllowed labels:\nyes\nno\nunclear\n\nReturn exactly one label.`,
  dog_with_toy: `Is the dog visibly holding, touching, or directly interacting with a dog toy?\n\nAllowed labels:\nyes\nno\nunclear`
}

test('Focused Base Benchmark v1 has exactly six core tasks and one opt-in experiment', () => {
  assert.equal(FOCUSED_BASE_PRESET.id, 'focused_base_v1')
  assert.equal(FOCUSED_BASE_PRESET.providerId, 'visionpsy-patched-base')
  assert.equal(FOCUSED_BASE_CORE_TASK_IDS.length, 6)
  assert.deepEqual(FOCUSED_BASE_EXPERIMENTAL_TASK_IDS, ['dog_with_toy'])
  assert.equal(new Set([...FOCUSED_BASE_CORE_TASK_IDS, ...FOCUSED_BASE_EXPERIMENTAL_TASK_IDS]).size, 7)
})

test('focused prompts and prompt provenance are exact', () => {
  for (const [id, prompt] of Object.entries(expected)) {
    assert.equal(TASKS.find(task => task.id === id)?.prompt, prompt)
    assert.equal(promptVersionForTask(id), FOCUSED_BASE_PROMPT_VERSION)
  }
})
