import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreObjectiveAnswer } from '../src/evaluation/objective-answer.mjs'

test('objective scorer accepts safe wrappers and explicit variants', () => {
  assert.equal(scoreObjectiveAnswer('The answer is: Q4.', { expectedAnswer: 'Q4', acceptedAnswers: [], answerType: 'exact_text' }).verdict, 'CORRECT')
  assert.equal(scoreObjectiveAnswer('offline', { expectedAnswer: 'Offline mode', acceptedAnswers: ['offline'], answerType: 'exact_text' }).verdict, 'CORRECT')
  assert.equal(scoreObjectiveAnswer('The inspection status is "Passed".', { expectedAnswer: 'Passed', answerType: 'exact_text' }).verdict, 'CORRECT')
  assert.equal(scoreObjectiveAnswer('<think>The report field says Passed.</think>\nPassed', { expectedAnswer: 'Passed', answerType: 'exact_text' }).verdict, 'CORRECT')
})

test('objective scorer normalizes numeric, currency, percentage and time answers conservatively', () => {
  assert.equal(scoreObjectiveAnswer('€128,50', { expectedAnswer: '128.50', answerType: 'currency' }).verdict, 'CORRECT')
  assert.equal(scoreObjectiveAnswer('92 percent', { expectedAnswer: '92%', answerType: 'percentage' }).verdict, 'CORRECT')
  assert.equal(scoreObjectiveAnswer('4:30', { expectedAnswer: '04:30', answerType: 'time' }).verdict, 'CORRECT')
  assert.equal(scoreObjectiveAnswer('31', { expectedAnswer: '30', answerType: 'integer' }).verdict, 'WRONG')
  assert.equal(scoreObjectiveAnswer('The value shown for Q2 is 44.', { expectedAnswer: '44', answerType: 'integer' }).verdict, 'CORRECT')
  assert.equal(scoreObjectiveAnswer('North has 42 while South has 24.', { expectedAnswer: '18', answerType: 'integer' }).verdict, 'WRONG')
})

test('objective scorer never invents a score without ground truth', () => {
  assert.equal(scoreObjectiveAnswer('anything', {}).status, 'UNSCORABLE')
  assert.equal(scoreObjectiveAnswer('not a number', { expectedAnswer: '30', answerType: 'integer' }).verdict, 'WRONG')
})
