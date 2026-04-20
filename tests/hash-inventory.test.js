import assert from 'assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { buildHashInventory } from '../agent/hash-inventory.js'

const root = mkdtempSync(path.join(tmpdir(), 'emperor-hash-'))
mkdirSync(path.join(root, 'jobs/1/deliverables'), { recursive: true })
const file = path.join(root, 'jobs/1/deliverables/out.md')
writeFileSync(file, '# hi')
const inv = buildHashInventory([{ path: 'jobs/1/deliverables/out.md', absolutePath: file }])
assert.equal(inv.length, 1)
assert.equal(inv[0].path, 'jobs/1/deliverables/out.md')
assert.equal(typeof inv[0].sha256, 'string')
rmSync(root, { recursive: true, force: true })
console.log('hash-inventory.test.js passed')
