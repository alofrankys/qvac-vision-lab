export const SEMANTIC_PROMPT_VERSION = 'semantic-extraction-v1'
export const MINIMAL_SEMANTIC_PROMPT_VERSION = 'minimal-smart-semantic-v2'

export const SEMANTIC_TASKS = Object.freeze([
  semanticTask('physical_context', 'Physical context', `Look at the dog and identify what it is physically on, inside, or directly touching.

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
unclear`),
  semanticTask('associated_objects', 'Associated objects', `List up to three clearly visible objects that are directly next to, touching, held by, or clearly associated with the dog.

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
none`),
  semanticTask('visible_posture', 'Visible posture', `Briefly describe the dog's visible body posture.

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
unclear`)
])

export const SEMANTIC_TASK_IDS = Object.freeze(SEMANTIC_TASKS.map(task => task.id))
export const SEMANTIC_EXTRACTION_PRESET = Object.freeze({ id: 'semantic_extraction_v1', name: 'Semantic Extraction Benchmark v1', providerId: 'visionpsy-patched-base', coreTaskIds: SEMANTIC_TASK_IDS, experimentalTaskIds: [], quickLimit: 20, mode: 'semantic' })
export const SEMANTIC_REVIEW_VERDICTS = Object.freeze(['CORRECT', 'PARTIALLY_CORRECT', 'WRONG', 'HALLUCINATED', 'UNCLEAR_IMAGE'])

export const MINIMAL_SEMANTIC_TASKS = Object.freeze([
  semanticTask('minimal_physical_support', 'Physical support / context', `What is each clearly visible dog physically on or directly supported by?

Answer briefly and factually.
If there are multiple dogs, describe each separately.
If one dog is much more visible than the others, describe that dog first.
Do not describe the whole scene.
Do not infer anything that is not clearly visible.`),
  semanticTask('minimal_associated_objects', 'Directly associated objects', `What clearly visible objects are directly touching, held by, or immediately next to each dog?

Answer briefly.
If there are multiple dogs, distinguish them when possible.
Do not list background objects.
Do not guess.`),
  semanticTask('minimal_visible_posture', 'Visible posture', `Describe the visible posture of each clearly visible dog.

Answer briefly and factually.
If there are multiple dogs, describe each separately.
Describe the most visible dog first.
Do not infer emotion, intention, sleep, pain, or activity.`)
])
export const MINIMAL_SEMANTIC_TASK_IDS = Object.freeze(MINIMAL_SEMANTIC_TASKS.map(task => task.id))
export const MINIMAL_SMART_SEMANTIC_PRESET = Object.freeze({ id: 'minimal_smart_semantic_v2', name: 'Minimal Smart Semantic Test v2', providerId: 'visionpsy-patched-base', coreTaskIds: MINIMAL_SEMANTIC_TASK_IDS, experimentalTaskIds: [], quickLimit: 10, mode: 'minimal-semantic' })
export const SEARCH_TOKEN_RULES = Object.freeze([
  ['rope toy', 'toy'], ['pet bed', 'dog_bed'], ['dog bed', 'dog_bed'], ['couch', 'sofa'], ['sofa', 'sofa'], ['armchair', 'armchair'],
  ['lawn', 'grass'], ['grass', 'grass'], ['ball', 'toy'], ['toy', 'toy'], ['floor', 'floor'], ['blanket', 'blanket'], ['bowl', 'bowl'],
  ['leash', 'leash'], ['bed', 'bed'], ['cushion', 'cushion'], ['car seat', 'car_seat'], ['sand', 'sand'], ['pavement', 'pavement']
])

export function normalizeSemanticOutput(taskId, rawOutput) {
  const raw = String(rawOutput ?? '')
  let phrase = raw.trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').replace(/[.!;:]+$/g, '').trim().toLowerCase()
  if (!phrase) return { normalized: null, validationResult: 'INVALID_OUTPUT', searchToken: 'unknown' }
  if (taskId === 'associated_objects') {
    const items = phrase.split(',').map(item => item.trim()).filter(Boolean)
    if (!items.length || items.length > 3 || items.some(item => item.split(/\s+/).length > 5)) return { normalized: phrase, validationResult: 'INVALID_OUTPUT', searchToken: 'unknown' }
    phrase = items.join(', ')
  } else if (phrase.split(/\s+/).length > 8) return { normalized: phrase, validationResult: 'INVALID_OUTPUT', searchToken: 'unknown' }
  return { normalized: phrase, validationResult: 'VALID', searchToken: deriveSearchToken(phrase) }
}

export function normalizeMinimalSemanticOutput(rawOutput) {
  const normalized = String(rawOutput ?? '').trim().replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
  return { normalized: normalized || null, validationResult: normalized ? 'VALID' : 'INVALID_OUTPUT', searchToken: 'unknown' }
}

export function deriveSearchToken(phrase) {
  const value = String(phrase ?? '').toLowerCase()
  if (['', 'unclear', 'none'].includes(value)) return value === 'none' ? 'none' : 'unknown'
  const matches = SEARCH_TOKEN_RULES.filter(([source]) => new RegExp(`(^|[^a-z])${escapeRegex(source)}([^a-z]|$)`).test(value))
  if (!matches.length) return 'unknown'
  const specific = matches.filter(([source]) => !matches.some(([other]) => other.length > source.length && other.includes(source)))
  const tokens = [...new Set(specific.map(([, token]) => token))]
  return tokens.length === 1 ? tokens[0] : 'unknown'
}

export function selectSemanticQuickPhotoIds(photoIds, annotations, limit = 20) {
  const ordered = [...new Set(photoIds)]
  const allowed = new Set(ordered)
  const byPhoto = new Map()
  for (const annotation of annotations || []) {
    if (!allowed.has(annotation.photoId)) continue
    const values = byPhoto.get(annotation.photoId) || new Set()
    values.add(`${annotation.taskId}:${annotation.correctLabel}`)
    byPhoto.set(annotation.photoId, values)
  }
  const strata = [
    ['dog_on_human_furniture:yes', 'surface:sofa'], ['dog_on_dog_bed:yes'], ['dog_on_grass:yes', 'surface:grass'], ['surface:floor'],
    ['focused_toy_visible:yes', 'toy:toy_visible'], ['focused_toy_visible:no', 'toy:no_toy_visible'],
    ['posture:standing', 'focused_posture:standing'], ['posture:sitting', 'focused_posture:sitting'], ['posture:lying', 'focused_posture:lying']
  ]
  const selected = []
  for (const candidates of strata) {
    const candidate = ordered.find(id => !selected.includes(id) && candidates.some(value => (byPhoto.get(id) || new Set()).has(value)))
    if (candidate) selected.push(candidate)
  }
  for (const id of ordered) if (selected.length < Math.min(limit, ordered.length) && !selected.includes(id)) selected.push(id)
  return selected.slice(0, limit)
}

export function selectMinimalSmartPhotoIds(photoIds, annotations, photos = [], limit = 10) {
  const ordered = [...new Set(photoIds)]
  const allowed = new Set(ordered)
  const byPhoto = new Map()
  for (const annotation of annotations || []) {
    if (!allowed.has(annotation.photoId)) continue
    const values = byPhoto.get(annotation.photoId) || new Set()
    values.add(`${annotation.taskId}:${annotation.correctLabel}`)
    byPhoto.set(annotation.photoId, values)
  }
  const photoMap = new Map((photos || []).map(photo => [photo.id, photo]))
  const matches = (id, values) => values.some(value => (byPhoto.get(id) || new Set()).has(value))
  const strata = [
    id => matches(id, ['dog_count:two', 'dog_count:more_than_two']),
    id => matches(id, ['dog_count:one']),
    id => matches(id, ['environment:outdoor']),
    id => matches(id, ['environment:indoor']),
    id => matches(id, ['dog_on_human_furniture:yes', 'surface:sofa']),
    id => matches(id, ['dog_on_dog_bed:yes']),
    id => matches(id, ['dog_on_grass:yes', 'surface:grass']),
    id => matches(id, ['surface:floor']),
    id => matches(id, ['focused_toy_visible:yes', 'toy:toy_visible', 'bowl:bowl_visible']),
    id => matches(id, ['posture:standing', 'focused_posture:standing', 'posture:sitting', 'focused_posture:sitting', 'posture:lying', 'focused_posture:lying', 'posture:unclear'])
  ]
  const selected = []
  for (const predicate of strata) {
    const candidate = ordered.find(id => !selected.includes(id) && predicate(id))
    if (candidate) selected.push(candidate)
  }
  for (const id of ordered) {
    if (selected.length >= Math.min(limit, ordered.length)) break
    if (!selected.includes(id) && photoMap.get(id)?.imagePipeline?.ready !== false) selected.push(id)
  }
  return selected.slice(0, limit)
}

export function semanticMetrics(inferences, reviews, tasks = SEMANTIC_TASKS) {
  const reviewMap = new Map(reviews.map(review => [review.inferenceId, review]))
  return tasks.map(task => {
    const rows = inferences.filter(item => item.taskId === task.id)
    const counts = Object.fromEntries(SEMANTIC_REVIEW_VERDICTS.map(value => [value.toLowerCase(), 0]))
    for (const row of rows) { const verdict = reviewMap.get(row.id)?.verdict; if (verdict && counts[verdict.toLowerCase()] !== undefined) counts[verdict.toLowerCase()] += 1 }
    const reviewed = Object.values(counts).reduce((sum, value) => sum + value, 0)
    return { taskId: task.id, taskName: task.name, reviewed, ...counts, invalid_output: rows.filter(row => row.validationResult !== 'VALID').length, strictCorrectness: reviewed ? counts.correct / reviewed : null, usefulRate: reviewed ? (counts.correct + counts.partially_correct) / reviewed : null, hallucinationRate: reviewed ? counts.hallucinated / reviewed : null }
  })
}

export function minimalSemanticIssues(inferences, reviews = [], annotations = [], photos = []) {
  const issues = []
  const reviewMap = new Map(reviews.map(review => [review.inferenceId, review]))
  const multiDogPhotoIds = new Set(annotations.filter(item => item.taskId === 'dog_count' && ['two', 'more_than_two'].includes(item.correctLabel)).map(item => item.photoId))
  for (const photo of photos) if (photo.petIdentity === 'Both') multiDogPhotoIds.add(photo.id)
  const leakage = /\b(answer briefly|do not guess|do not infer|clearly visible dogs?|if there are multiple dogs|describe each separately)\b/i
  const behaviorOrEmotion = /\b(happy|sad|anxious|excited|relaxed|comfortable|afraid|scared|angry|sleeping|resting|playing|waiting|watching|guarding|trying|wants?|intends?|in pain)\b/i
  const multiDogReference = /\b(main|first|second|other|another|both|each|one dog|two dogs|dogs are|dogs:)\b/i
  for (const inference of inferences.filter(item => MINIMAL_SEMANTIC_TASK_IDS.includes(item.taskId))) {
    const raw = String(inference.rawOutput || '')
    if (leakage.test(raw)) issues.push(issue(inference, 'PROMPT_LEAKAGE', 'Response appears to repeat prompt instructions.'))
    if (raw.trim().split(/\s+/).filter(Boolean).length > 40 || raw.length > 280) issues.push(issue(inference, 'OVERLONG_RESPONSE', 'Response is longer than the requested brief description.'))
    if (behaviorOrEmotion.test(raw)) issues.push(issue(inference, 'BEHAVIOR_OR_EMOTION_INFERENCE', 'Response may infer behavior, activity, sleep, pain, or emotion.'))
    if (multiDogPhotoIds.has(inference.photoId) && !multiDogReference.test(raw)) issues.push(issue(inference, 'IGNORED_SECOND_DOG', 'Known multi-dog photo is not clearly described as multi-dog.'))
    if (inference.taskId === 'minimal_associated_objects' && reviewMap.get(inference.id)?.verdict === 'HALLUCINATED') issues.push(issue(inference, 'HALLUCINATED_OBJECTS', 'Human review marked associated objects as hallucinated.'))
  }
  for (const [taskId, rows] of Map.groupBy(inferences.filter(item => MINIMAL_SEMANTIC_TASK_IDS.includes(item.taskId)), item => item.taskId)) {
    const groups = Object.groupBy(rows, item => String(item.normalizedOutput || item.rawOutput || '').trim().toLowerCase())
    for (const [output, repeated] of Object.entries(groups)) {
      if (!output || repeated.length < 3) continue
      for (const inference of repeated) issues.push(issue(inference, 'REPEATED_GENERIC_OUTPUT', `Identical output repeated ${repeated.length} times for ${taskId}.`))
    }
  }
  return issues
}

function issue(inference, code, message) { return { inferenceId: inference.id, photoId: inference.photoId, taskId: inference.taskId, code, message } }

function semanticTask(id, name, prompt) { return { id, name, prompt, labels: [], defaultStatus: 'CORE_CANDIDATE', outputMode: 'semantic' } }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
