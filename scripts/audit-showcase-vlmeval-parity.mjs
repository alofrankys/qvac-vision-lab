import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHOWCASE_CASES, extractMultipleChoiceLetter } from '../src/showcase/index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportsDir = path.join(root, 'reports')
const reportNames = process.env.QVAC_VLMEVAL_INPUT
  ? [process.env.QVAC_VLMEVAL_INPUT]
  : [
      'visionpsy-three-way-realworldqa-20.json',
      'visionpsy-three-way-realworldqa-validation-50.json',
      'visionpsy-three-way-realworldqa-validation-50-b.json',
      'visionpsy-three-way-realworldqa-validation-150-c.json',
      'visionpsy-three-way-realworldqa-remainder-495.json'
    ]
const outputStem = process.env.QVAC_VLMEVAL_OUTPUT_STEM || 'visionpsy-realworldqa-vlmeval-parity'
const reports = await Promise.all(reportNames.map(async filename => JSON.parse(await readFile(path.join(reportsDir, filename), 'utf8'))))
const results = reports.flatMap(report => report.results)
const cases = SHOWCASE_CASES.filter(item => Number.isInteger(item.sourceIndex))
const caseLookup = new Map(cases.map(item => [item.id, item]))
const providerIds = [...new Set(results.map(item => item.providerId))]

if (cases.length !== 765) throw new Error(`Expected 765 official cases, received ${cases.length}`)
if (results.length !== 765 * providerIds.length) throw new Error(`Expected ${765 * providerIds.length} official results, received ${results.length}`)

const audited = results.map(result => {
  const showcaseCase = caseLookup.get(result.caseId)
  if (!showcaseCase) throw new Error(`Missing showcase case ${result.caseId}`)
  const localLetter = extractMultipleChoiceLetter(result.output, showcaseCase.options)
  const vlmevalLetter = vlmevalCanInfer(result.output, showcaseCase.options) || null
  return {
    caseId: result.caseId,
    sourceIndex: result.sourceIndex,
    providerId: result.providerId,
    output: result.output,
    expectedLetter: showcaseCase.expectedLetter,
    localLetter,
    vlmevalLetter,
    sameExtraction: localLetter === vlmevalLetter,
    localPass: localLetter === showcaseCase.expectedLetter,
    vlmevalPass: vlmevalLetter === showcaseCase.expectedLetter
  }
})

const providers = Object.fromEntries(providerIds.map(providerId => {
  const rows = audited.filter(item => item.providerId === providerId)
  const localPassed = rows.filter(item => item.localPass).length
  const vlmevalPassed = rows.filter(item => item.vlmevalPass).length
  const extractionDisagreements = rows.filter(item => !item.sameExtraction)
  return [providerId, {
    cases: rows.length,
    localPassed,
    localAccuracy: localPassed / rows.length,
    vlmevalPassed,
    vlmevalAccuracy: vlmevalPassed / rows.length,
    scoreDelta: (vlmevalPassed - localPassed) / rows.length,
    extractionDisagreements: extractionDisagreements.length,
    passVerdictChanges: rows.filter(item => item.localPass !== item.vlmevalPass).length,
    examples: extractionDisagreements.slice(0, 20)
  }]
}))

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: 'All 765 official RealWorldQA questions and all three local VisionPsy providers.',
  officialImplementation: {
    repository: 'https://github.com/open-compass/VLMEvalKit',
    promptSource: 'vlmeval/dataset/image_mcq.py ImageMCQDataset.build_prompt',
    scorerSource: 'vlmeval/utils/matching_util.py can_infer',
    evaluationSource: 'vlmeval/dataset/utils/multiple_choice.py mcq_vanilla_eval',
    scorerMode: 'deterministic can_infer prefetch / exact_matching; no judge fallback'
  },
  protocolDifferences: {
    imageOrder: 'Both send image before text.',
    officialPrompt: 'Question: <question>\\nOptions:\\nA. ...\\nPlease select the correct answer from the options above.',
    localPrompt: '<question>\\nA. ...\\nAnswer with only the letter of the correct option.',
    runtime: process.env.QVAC_VLMEVAL_INPUT
      ? 'All three providers use QVAC SDK with the qvac-fabric-llm.cpp backend. This audit establishes scorer parity; Standard and Flash intentionally retain their official, model-specific image preprocessing.'
      : 'Local providers use separate QVAC SDK and patched llama.cpp runtimes and quantized GGUFs; this audit only establishes scorer parity, not preprocessing/runtime parity.'
  },
  providers,
  totalExtractionDisagreements: audited.filter(item => !item.sameExtraction).length,
  totalPassVerdictChanges: audited.filter(item => item.localPass !== item.vlmevalPass).length
}

const jsonPath = path.join(reportsDir, `${outputStem}.json`)
const markdownPath = path.join(reportsDir, `${outputStem}.md`)
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
await writeFile(markdownPath, markdown(report))
process.stdout.write(markdown(report))

function vlmevalCanInfer(answer, originalChoices) {
  const choices = Object.fromEntries(Object.entries(originalChoices).map(([key, value]) => [key, String(value)]))
  const option = canInferOption(String(answer ?? ''), choices)
  return option || canInferText(String(answer ?? ''), choices)
}

function canInferOption(answer, choices) {
  if (answer.includes('Failed to obtain answer via API')) return false
  const rejections = ["Sorry, I can't help with images of people yet.", "I can't process this file.", "I'm sorry, but without the image provided", 'Cannot determine the answer']
  if (rejections.some(rejection => answer.includes(rejection))) return 'Z'
  const answerMod = answer.replace(/[.()[\],:;!*#{}]/g, ' ')
  const splits = answerMod.split(/\s+/).map(item => item.trim()).filter(Boolean)
  const presentChoices = Object.keys(choices).filter(choice => splits.includes(choice))
  if (presentChoices.length === 1) {
    const choice = presentChoices[0]
    if (splits.indexOf(choice) > splits.length - 5) return choice
  } else if (!presentChoices.length && splits.filter(item => item === 'Z').length === 1) return 'Z'
  const verbose = answer.match(/(?:correct\s+)?answer\s+is\s+\**([ABCD])\**/i)
  return verbose && choices[verbose[1].toUpperCase()] ? verbose[1].toUpperCase() : false
}

function canInferText(answer, choices) {
  const normalizedAnswer = answer.toLowerCase()
  if (normalizedAnswer.length > 2 * Object.values(choices).reduce((sum, value) => sum + value.length, 0)) return false
  const matches = Object.entries(choices).filter(([, value]) => normalizedAnswer.includes(value.toLowerCase()))
  return matches.length === 1 ? matches[0][0] : false
}

function markdown(audit) {
  const lines = [
    '# RealWorldQA scorer parity audit',
    '',
    `Generated: ${audit.generatedAt}`,
    '',
    '| Provider | Local exact | VLMEvalKit-compatible exact | Score delta | Extraction differences | Pass changes |',
    '|---|---:|---:|---:|---:|---:|'
  ]
  for (const [providerId, item] of Object.entries(audit.providers)) {
    lines.push(`| ${providerId} | ${item.localPassed}/${item.cases} (${percent(item.localAccuracy)}) | ${item.vlmevalPassed}/${item.cases} (${percent(item.vlmevalAccuracy)}) | ${signedPoints(item.scoreDelta)} | ${item.extractionDisagreements} | ${item.passVerdictChanges} |`)
  }
  lines.push('', `Total extraction differences: **${audit.totalExtractionDisagreements}**; pass/fail changes: **${audit.totalPassVerdictChanges}**.`, '', `Caveat: ${audit.protocolDifferences.runtime}`, '')
  return lines.join('\n')
}

function percent(value) { return `${(value * 100).toFixed(2)}%` }
function signedPoints(value) { return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)} pp` }
