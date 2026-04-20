import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const SCHEMAS = {
  'agent-job-packet': path.join(ROOT, 'protocols', 'agent-job-packet.schema.json'),
  'agent-job-result': path.join(ROOT, 'protocols', 'agent-job-result.schema.json'),
  'agent-connection': path.join(ROOT, 'protocols', 'agent-connection.schema.json')
}

function readSchema(name) {
  const file = SCHEMAS[name]
  if (!file) throw new Error(`unknown schema: ${name}`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function validateObjectShape(schema, value, basePath = '$') {
  const errors = []
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${basePath} must be object`)
      return errors
    }
    for (const req of schema.required || []) {
      if (value[req] === undefined) errors.push(`${basePath}.${req} is required`)
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
          errors.push(`${basePath}.${key} is not allowed`)
        }
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) {
        errors.push(...validateObjectShape(childSchema, value[key], `${basePath}.${key}`))
      }
    }
    return errors
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${basePath} must be array`)
      return errors
    }
    for (let i = 0; i < value.length; i += 1) {
      errors.push(...validateObjectShape(schema.items || {}, value[i], `${basePath}[${i}]`))
    }
    return errors
  }

  if (Array.isArray(schema.type)) {
    const valid = schema.type.some(type => {
      if (type === 'null') return value === null
      if (type === 'array') return Array.isArray(value)
      return typeof value === type
    })
    if (!valid) errors.push(`${basePath} has invalid type`)
    return errors
  }

  if (schema.const !== undefined && value !== schema.const) errors.push(`${basePath} must equal ${schema.const}`)
  if (schema.type === 'string' && typeof value !== 'string') errors.push(`${basePath} must be string`)
  if (schema.type === 'boolean' && typeof value !== 'boolean') errors.push(`${basePath} must be boolean`)
  if (schema.type === 'integer' && !Number.isInteger(value)) errors.push(`${basePath} must be integer`)
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${basePath} must be one of ${schema.enum.join(', ')}`)
  if (schema.minLength && typeof value === 'string' && value.length < schema.minLength) errors.push(`${basePath} must have minLength ${schema.minLength}`)
  return errors
}

export function validateSchema(schemaName, payload) {
  const schema = readSchema(schemaName)
  const errors = validateObjectShape(schema, payload)
  return { valid: errors.length === 0, errors }
}
