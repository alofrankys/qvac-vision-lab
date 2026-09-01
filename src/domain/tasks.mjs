import { MINIMAL_SEMANTIC_PROMPT_VERSION, MINIMAL_SEMANTIC_TASKS, SEMANTIC_PROMPT_VERSION, SEMANTIC_TASKS } from '../semantic/index.mjs'

export const DOG_COUNT_PROMPT = `Look at the entire image and determine how many distinct dogs are visibly present.

Allowed labels:
none
one
two
more_than_two
unclear

Important:
- Count distinct visible dogs, not faces or body parts.
- If two separate dogs are visible, return two.
- Do not guess hidden dogs.
- Return exactly one allowed label.`

export const TASKS = Object.freeze([
  task('environment', 'Environment', ['indoor', 'outdoor', 'unclear'], 'CORE_CANDIDATE',
    'Classify only the environment visible in this image.'),
  task('surface', 'Surface', ['sofa', 'bed', 'floor', 'grass', 'dirt', 'other', 'unclear'], 'CORE_CANDIDATE',
    'Classify only the main surface supporting the visible dog or dogs.'),
  task('posture', 'Posture', ['standing', 'sitting', 'lying', 'crouching', 'unclear'], 'CORE_CANDIDATE',
    'Classify only the posture of the most prominent visible dog.'),
  task('dog_count', 'Dog count', ['none', 'one', 'two', 'more_than_two', 'unclear'], 'EXPERIMENTAL',
    'Look at the entire image and determine how many distinct dogs are visibly present.', DOG_COUNT_PROMPT),
  task('toy', 'Toy · core', ['toy_visible', 'no_toy_visible', 'unclear'], 'CORE_CANDIDATE',
    'Classify only whether a dog toy is visible in this image.'),
  task('toy_type', 'Toy · experimental', ['ball', 'rope', 'plush', 'other_toy', 'no_toy', 'unclear'], 'EXPERIMENTAL',
    'Classify only the type of dog toy visible in this image.'),
  task('bowl', 'Bowl', ['bowl_visible', 'no_bowl_visible', 'unclear'], 'CORE_CANDIDATE',
    'Classify only whether a pet bowl is visible in this image.'),
  task('food', 'Food', ['food_visible', 'no_food_visible', 'unclear'], 'EXPERIMENTAL',
    'Classify only whether food is visibly present in this image.'),
  task('person', 'Person', ['person_visible', 'no_person_visible', 'unclear'], 'CORE_CANDIDATE',
    'Classify only whether any part of a person is visible in this image.'),
  task('distance', 'Distance', ['close', 'medium', 'far', 'unclear'], 'EXPERIMENTAL',
    'Classify only the camera distance to the most prominent visible dog.'),
  task('position', 'Position', ['left', 'center', 'right', 'unclear'], 'EXPERIMENTAL',
    'Classify only the horizontal position of the most prominent visible dog.'),
  task('focused_posture', 'Posture', ['standing', 'sitting', 'lying', 'unclear'], 'CORE_CANDIDATE', '', `What is the main visible posture of the dog?

Allowed labels:
standing
sitting
lying
unclear

Return exactly one label.
If the posture is ambiguous, return unclear.`),
  task('dog_on_human_furniture', 'Dog on human furniture', ['yes', 'no', 'unclear'], 'CORE_CANDIDATE', '', `Is the dog visibly on a sofa, couch, armchair, chair, or similar human seating furniture?

Allowed labels:
yes
no
unclear

Return exactly one label.`),
  task('dog_on_dog_bed', 'Dog on dog bed', ['yes', 'no', 'unclear'], 'CORE_CANDIDATE', '', `Is the dog visibly lying, sitting, or standing on a dog bed or pet bed?

Allowed labels:
yes
no
unclear

Return exactly one label.`),
  task('focused_toy_visible', 'Toy visible', ['yes', 'no', 'unclear'], 'CORE_CANDIDATE', '', `Is a dog toy clearly visible in the image?

Allowed labels:
yes
no
unclear

Return exactly one label.`),
  task('dog_near_bowl', 'Dog near bowl', ['yes', 'no', 'unclear'], 'CORE_CANDIDATE', '', `Is the dog visibly close to a food or water bowl?

Allowed labels:
yes
no
unclear

Return exactly one label.`),
  task('dog_on_grass', 'Dog on grass', ['yes', 'no', 'unclear'], 'CORE_CANDIDATE', '', `Is the dog visibly standing, sitting, or lying on grass?

Allowed labels:
yes
no
unclear

Return exactly one label.`),
  task('dog_with_toy', 'Dog with toy · experimental', ['yes', 'no', 'unclear'], 'EXPERIMENTAL', '', `Is the dog visibly holding, touching, or directly interacting with a dog toy?

Allowed labels:
yes
no
unclear`),
  ...SEMANTIC_TASKS,
  ...MINIMAL_SEMANTIC_TASKS
])

export const PROMPT_VERSION = 'pawvault-closed-label-v1'
export const DOG_COUNT_PROMPT_VERSION = 'pawvault-dog-count-v2'
export const FOCUSED_BASE_PROMPT_VERSION = 'focused-base-v1'
export const FOCUSED_BASE_CORE_TASK_IDS = Object.freeze(['focused_posture', 'dog_on_human_furniture', 'dog_on_dog_bed', 'focused_toy_visible', 'dog_near_bowl', 'dog_on_grass'])
export const FOCUSED_BASE_EXPERIMENTAL_TASK_IDS = Object.freeze(['dog_with_toy'])
export const FOCUSED_BASE_TASK_IDS = Object.freeze([...FOCUSED_BASE_CORE_TASK_IDS, ...FOCUSED_BASE_EXPERIMENTAL_TASK_IDS])
export const FOCUSED_BASE_PRESET = Object.freeze({ id: 'focused_base_v1', name: 'Focused Standard Benchmark v1', providerId: 'visionpsy-patched-base', coreTaskIds: FOCUSED_BASE_CORE_TASK_IDS, experimentalTaskIds: FOCUSED_BASE_EXPERIMENTAL_TASK_IDS })

export function promptVersionForTask(taskId) { return MINIMAL_SEMANTIC_TASKS.some(task => task.id === taskId) ? MINIMAL_SEMANTIC_PROMPT_VERSION : SEMANTIC_TASKS.some(task => task.id === taskId) ? SEMANTIC_PROMPT_VERSION : FOCUSED_BASE_TASK_IDS.includes(taskId) ? FOCUSED_BASE_PROMPT_VERSION : taskId === 'dog_count' ? DOG_COUNT_PROMPT_VERSION : PROMPT_VERSION }

function task(id, name, labels, defaultStatus, question, promptOverride = null) {
  return {
    id,
    name,
    labels,
    defaultStatus,
    prompt: promptOverride || `${question}\n\nAllowed labels:\n${labels.join('\n')}\n\nReturn exactly one allowed label.\nIf ambiguous, return unclear.`
  }
}

export function normalizeOutput(raw, labels) {
  const normalized = String(raw ?? '')
    .trim()
    .replace(/\.$/, '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
    .toLowerCase()
  return {
    normalized: labels.includes(normalized) ? normalized : null,
    validationResult: labels.includes(normalized) ? 'VALID' : 'INVALID_OUTPUT'
  }
}

export function normalizeDogCountOutput(raw) {
  const labels = ['none', 'one', 'two', 'more_than_two', 'unclear']
  const exact = normalizeOutput(raw, labels)
  if (exact.validationResult === 'VALID') return exact
  const text = String(raw ?? '').trim().toLowerCase().replace(/[.!?]+$/, '').trim()
  const aliases = new Map([
    ['no dog', 'none'], ['no dogs', 'none'], ['zero dogs', 'none'], ['0 dogs', 'none'],
    ['one dog', 'one'], ['1 dog', 'one'], ['there is one dog', 'one'], ['there is one dog visible', 'one'],
    ['two dogs', 'two'], ['2 dogs', 'two'], ['there are two dogs', 'two'], ['there are two dogs visible', 'two'],
    ['more than two dogs', 'more_than_two'], ['three or more dogs', 'more_than_two']
  ])
  let normalized = aliases.get(text) ?? null
  if (!normalized && /^(?:the )?image (?:shows|features) (?:a )?single dog\b/.test(text)) normalized = 'one'
  if (!normalized && /^(?:the )?image (?:shows|features) two dogs\b/.test(text)) normalized = 'two'
  if (!normalized && /\bthere are two dogs visible\b/.test(text)) normalized = 'two'
  return { normalized, validationResult: normalized ? 'VALID' : 'INVALID_OUTPUT' }
}

export function normalizeTaskOutput(taskId, raw, labels) {
  if (taskId === 'dog_count') return normalizeDogCountOutput(raw)
  const exact = normalizeOutput(raw, labels)
  if (exact.validationResult === 'VALID') return exact
  const value = String(raw ?? '').trim().toLowerCase()
  const aliases = {
    person: { yes: 'person_visible', no: 'no_person_visible' },
    toy: { yes: 'toy_visible', no: 'no_toy_visible' },
    bowl: { yes: 'bowl_visible', no: 'no_bowl_visible' }
  }
  const normalized = aliases[taskId]?.[value] ?? null
  return { normalized, validationResult: normalized ? 'VALID' : 'INVALID_OUTPUT' }
}
