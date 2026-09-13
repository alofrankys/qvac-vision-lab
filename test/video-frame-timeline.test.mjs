import assert from 'node:assert/strict'
import test from 'node:test'
import { frameTimeline } from '../scripts/video-frame-timeline.mjs'

test('busy captures retain elapsed time and hold prior frames without looking ahead', () => {
  assert.deepEqual(frameTimeline([0, 50, 170, 220], 4, 300), [0, 1, 1, 1, 2, 3])
  assert.deepEqual(frameTimeline([20, 150], 2, 250), [0, 0, 0, 1, 1])
})

test('regular captures retain every frame and invalid timing fails closed', () => {
  assert.deepEqual(frameTimeline([0, 50, 100, 150], 4, 200), [0, 1, 2, 3])
  for (const args of [[[], 0, 100], [[0, 0], 2, 100], [[0, 40], 1, 100], [[0, NaN], 2, 100], [[0, 200], 2, 100], [[0], 1, -1]]) {
    assert.throws(() => frameTimeline(...args), /invalid capture timestamps/)
  }
})
