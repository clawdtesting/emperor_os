import { research } from './research.js'
import { creative } from './creative.js'
import { development } from './development.js'
import { fallback } from './default.js'

export const handlers = {
  research,
  analysis:    research,
  creative,
  writing:     creative,
  development,
  other:       fallback
}

export function getHandler(category) {
  return handlers[(category || 'other').toLowerCase()] || fallback
}
