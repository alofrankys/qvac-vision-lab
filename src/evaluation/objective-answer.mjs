export const OBJECTIVE_ANSWER_TYPES = Object.freeze(['exact_text', 'integer', 'decimal', 'currency', 'percentage', 'time', 'boolean'])

export function scoreObjectiveAnswer(output, question = {}) {
  const expected = String(question.expectedAnswer || '').trim()
  if (!expected) return { status: 'UNSCORABLE', verdict: null, reason: 'Missing expected answer' }
  const answerType = OBJECTIVE_ANSWER_TYPES.includes(question.answerType) ? question.answerType : 'exact_text'
  const candidates = [expected, ...(Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [])].map(value => String(value).trim()).filter(Boolean)
  const actualCandidates = normalizeOutput(output, answerType)
  const actual = actualCandidates.length === 1 ? actualCandidates[0] : actualCandidates
  const normalizedCandidates = [...new Set(candidates.map(value => normalize(value, answerType)).filter(Boolean))]
  if (!normalizedCandidates.length) return { status: 'UNSCORABLE', verdict: null, answerType, actual, accepted: normalizedCandidates, reason: 'Expected answer could not be normalized' }
  if (!actualCandidates.length) return { status: 'SCORED', verdict: 'WRONG', answerType, actual: null, accepted: normalizedCandidates, matched: false, reason: 'Model answer could not be normalized' }
  const matched = actualCandidates.some(value => normalizedCandidates.includes(value))
  return { status: 'SCORED', verdict: matched ? 'CORRECT' : 'WRONG', answerType, actual, accepted: normalizedCandidates, matched }
}

function normalizeOutput(value, type) {
  const text = String(value ?? '').normalize('NFKC').replace(/<think>[\s\S]*?<\/think>/gi, ' ').trim().toLowerCase()
  if (!text) return []
  if (type === 'integer') return numericCandidates(text, 0)
  if (type === 'decimal' || type === 'currency') return numericCandidates(text, 2)
  if (type === 'percentage') return numericCandidates(text.replace(/percent(?:age)?/g, '%'), 2)
  if (type === 'time') return [...new Set([...text.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map(match => `${match[1].padStart(2, '0')}:${match[2]}`))]
  if (type === 'boolean') { const value = normalize(text, type); return value ? [value] : [] }
  const stripped = stripWrapper(text)
  const candidates = [stripped]
  const keyed = stripped.match(/^(?:the\s+)?[\p{L}\p{N}\s_/-]{1,80}\s+(?:is|was|è|sono)\s+(.+)$/u)
  if (keyed?.[1]) candidates.push(stripWrapper(keyed[1]))
  return [...new Set(candidates.filter(Boolean))]
}

function normalize(value, type) {
  const text = String(value ?? '').normalize('NFKC').trim().toLowerCase()
  if (!text) return null
  if (type === 'integer') return numeric(text, 0)
  if (type === 'decimal' || type === 'currency') return numeric(text, 2)
  if (type === 'percentage') return numeric(text.replace(/percent(?:age)?/g, '%'), 2)
  if (type === 'time') {
    const match = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/)
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null
  }
  if (type === 'boolean') {
    if (/^(yes|true|passed|pass|sì|si)$/.test(stripWrapper(text))) return 'true'
    if (/^(no|false|failed|fail)$/.test(stripWrapper(text))) return 'false'
    return null
  }
  return stripWrapper(text)
}

function numeric(text, decimals) {
  const match = text.replace(/,/g, '.').match(/[-+]?\d+(?:\.\d+)?/)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value.toFixed(decimals) : null
}

function numericCandidates(text, decimals) {
  return [...new Set([...text.replace(/,/g, '.').matchAll(/[-+]?\d+(?:\.\d+)?/g)].map(match => Number(match[0])).filter(Number.isFinite).map(value => value.toFixed(decimals)))]
}

function stripWrapper(text) {
  return text.replace(/^[\s"'`*_]+|[\s"'`*_.!,;:]+$/g, '').replace(/^(the answer is|answer|risposta)\s*[:=-]?\s*/i, '').trim()
}
