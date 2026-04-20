import assert from 'assert'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { assertSafeRelativePath, resolveScopedPath, rejectSymlinkPath } from '../agent/file-scope.js'

const root = mkdtempSync(path.join(tmpdir(), 'emperor-scope-'))
mkdirSync(path.join(root, 'jobs/1/deliverables'), { recursive: true })
writeFileSync(path.join(root, 'jobs/1/deliverables/a.md'), 'ok')

assert.throws(() => assertSafeRelativePath('../x'), /path traversal/)
assert.throws(() => assertSafeRelativePath('/etc/passwd'), /absolute path/)
const resolved = resolveScopedPath(root, 'jobs/1/deliverables/a.md')
assert.equal(resolved.relativePath, 'jobs/1/deliverables/a.md')

const linkPath = path.join(root, 'jobs/1/deliverables/link.md')
symlinkSync(path.join(root, 'jobs/1/deliverables/a.md'), linkPath)
assert.throws(() => rejectSymlinkPath(linkPath), /symlink/)

rmSync(root, { recursive: true, force: true })
console.log('file-scope.test.js passed')
