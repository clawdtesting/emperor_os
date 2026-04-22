import Ajv from 'ajv'

export const STRICT_JOB_SPEC_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'category',
    'objective',
    'inputs',
    'deliverables',
    'constraints',
    'evaluationCriteria',
    'payout',
    'duration',
  ],
  properties: {
    title: { type: 'string', minLength: 1 },
    category: { type: 'string', minLength: 1 },
    objective: { type: 'string', minLength: 1 },
    inputs: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    deliverables: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    constraints: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    evaluationCriteria: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1 },
    },
    payout: { type: 'string', pattern: '^[0-9]+$' },
    duration: { type: 'integer', minimum: 1 },
  },
})

const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(STRICT_JOB_SPEC_SCHEMA)

const FORBIDDEN_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /system\s+prompt/i,
  /<\s*tool\s*>/i,
  /<\s*\/\s*tool\s*>/i,
]

const TXT_SECTIONS = Object.freeze([
  'TITLE',
  'CATEGORY',
  'OBJECTIVE',
  'INPUTS',
  'DELIVERABLES',
  'CONSTRAINTS',
  'EVALUATION',
  'PAYOUT',
  'DURATION',
])

export const JSON_EXAMPLE_TEMPLATE = `{
  "title": "Build deterministic validator",
  "category": "development",
  "objective": "Implement a strict validator for Prime procurement artifacts.",
  "inputs": ["procurement_state.json", "review_manifest.json"],
  "deliverables": ["validator.js", "validator.test.js"],
  "constraints": ["No LLM calls", "Deterministic checks only"],
  "evaluationCriteria": ["All schema checks pass", "Coverage >= 90%"],
  "payout": "100000000000000000000",
  "duration": 604800
}`

export const TXT_EXAMPLE_TEMPLATE = `TITLE: Build deterministic validator
CATEGORY: development
OBJECTIVE: Implement a strict validator for Prime procurement artifacts.
INPUTS:
- procurement_state.json
- review_manifest.json
DELIVERABLES:
- validator.js
- validator.test.js
CONSTRAINTS:
- No LLM calls
- Deterministic checks only
EVALUATION:
- All schema checks pass
- Coverage >= 90%
PAYOUT: 100000000000000000000
DURATION: 604800`

function hasForbiddenPattern(value) {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(String(value || '')))
}

function normalizeArray(values) {
  return values.map((item) => String(item || '').trim()).filter(Boolean)
}

export function parseStrictTxtTemplate(rawText) {
  const lines = String(rawText || '').replace(/\r\n/g, '\n').split('\n')
  const sections = new Map()

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i += 1
      continue
    }

    const headerMatch = line.match(/^([A-Z]+):\s*(.*)$/)
    if (!headerMatch) {
      throw new Error(`Invalid line format at line ${i + 1}: ${line}`)
    }

    const header = headerMatch[1]
    if (!TXT_SECTIONS.includes(header)) {
      throw new Error(`Unsupported section '${header}' at line ${i + 1}`)
    }
    if (sections.has(header)) {
      throw new Error(`Duplicate section '${header}'`)
    }

    if (['INPUTS', 'DELIVERABLES', 'CONSTRAINTS', 'EVALUATION'].includes(header)) {
      const items = []
      const inlineValue = headerMatch[2].trim()
      if (inlineValue) {
        throw new Error(`${header} must be list-only and start on the next line with '- ' items`)
      }

      i += 1
      while (i < lines.length) {
        const current = lines[i].trim()
        if (!current) {
          i += 1
          continue
        }
        if (/^[A-Z]+:/.test(current)) break
        if (!current.startsWith('- ')) {
          throw new Error(`${header} list item must start with '- ' at line ${i + 1}`)
        }
        items.push(current.slice(2).trim())
        i += 1
      }
      sections.set(header, items)
      continue
    }

    const value = headerMatch[2].trim()
    if (!value) {
      throw new Error(`Section '${header}' cannot be empty`)
    }
    sections.set(header, value)
    i += 1
  }

  for (const section of TXT_SECTIONS) {
    if (!sections.has(section)) throw new Error(`Missing required section '${section}'`)
  }

  return {
    title: String(sections.get('TITLE') || '').trim(),
    category: String(sections.get('CATEGORY') || '').trim(),
    objective: String(sections.get('OBJECTIVE') || '').trim(),
    inputs: normalizeArray(sections.get('INPUTS') || []),
    deliverables: normalizeArray(sections.get('DELIVERABLES') || []),
    constraints: normalizeArray(sections.get('CONSTRAINTS') || []),
    evaluationCriteria: normalizeArray(sections.get('EVALUATION') || []),
    payout: String(sections.get('PAYOUT') || '').trim(),
    duration: Number(sections.get('DURATION')),
  }
}

export function validateStructuredJobSpec(candidate) {
  const errors = []

  if (hasForbiddenPattern(JSON.stringify(candidate || {}))) {
    errors.push('Input contains forbidden prompt-injection pattern.')
  }

  const valid = validate(candidate)
  if (!valid) {
    for (const error of validate.errors || []) {
      const field = error.instancePath || '/'
      errors.push(`${field} ${error.message}`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  }
}

export function canonicalizeStructuredJobSpec(spec) {
  return {
    title: String(spec.title).trim(),
    category: String(spec.category).trim(),
    objective: String(spec.objective).trim(),
    inputs: normalizeArray(spec.inputs || []),
    deliverables: normalizeArray(spec.deliverables || []),
    constraints: normalizeArray(spec.constraints || []),
    evaluationCriteria: normalizeArray(spec.evaluationCriteria || []),
    payout: String(spec.payout).trim(),
    duration: Number(spec.duration),
  }
}
