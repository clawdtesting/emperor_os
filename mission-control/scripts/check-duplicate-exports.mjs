import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const target = path.resolve('src/api.js')
const source = await fs.readFile(target, 'utf8')

const regex = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g
const counts = new Map()
let match
while ((match = regex.exec(source)) !== null) {
  const name = match[1]
  counts.set(name, (counts.get(name) ?? 0) + 1)
}

const duplicates = [...counts.entries()].filter(([, count]) => count > 1)
if (duplicates.length > 0) {
  for (const [name, count] of duplicates) {
    console.error(`[duplicate-export] ${name} declared ${count} times in src/api.js`)
  }
  process.exit(1)
}

console.log('No duplicate async function exports found in src/api.js.')
