import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldAutoScrollToStep } from './stepNavigation.js'

test('shouldAutoScrollToStep only scrolls forward when a new step opens', () => {
  assert.equal(shouldAutoScrollToStep({ previousStep: 4, nextStep: 6 }), true)
  assert.equal(shouldAutoScrollToStep({ previousStep: 6, nextStep: 7 }), true)
  assert.equal(shouldAutoScrollToStep({ previousStep: 7, nextStep: 7 }), false)
  assert.equal(shouldAutoScrollToStep({ previousStep: 8, nextStep: 6 }), false)
  assert.equal(shouldAutoScrollToStep({ previousStep: null, nextStep: 4 }), false)
})
