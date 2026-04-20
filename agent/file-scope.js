import { lstatSync, realpathSync } from 'fs'
import path from 'path'

export function assertSafeRelativePath(relPath) {
  const value = String(relPath || '')
  if (!value || value.includes('\0')) throw new Error('invalid empty/null path')
  if (path.isAbsolute(value)) throw new Error(`absolute path not allowed: ${value}`)
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'))
  if (normalized.startsWith('../') || normalized === '..') throw new Error(`path traversal not allowed: ${value}`)
  return normalized
}

export function resolveScopedPath(rootDir, relPath) {
  const safeRel = assertSafeRelativePath(relPath)
  const candidate = path.resolve(rootDir, safeRel)
  const rootReal = realpathSync(rootDir)
  const parent = path.dirname(candidate)
  const parentReal = realpathSync(parent)
  if (!parentReal.startsWith(rootReal)) throw new Error(`resolved path escapes workspace root: ${relPath}`)
  return { absolutePath: candidate, relativePath: safeRel }
}

export function assertPathInsideAllowedPrefixes(relPath, allowedPrefixes = []) {
  const safeRel = assertSafeRelativePath(relPath)
  if (!allowedPrefixes.some(prefix => safeRel.startsWith(prefix))) {
    throw new Error(`path outside allowed prefixes: ${safeRel}`)
  }
  return safeRel
}

export function rejectSymlinkPath(fullPath) {
  const stat = lstatSync(fullPath)
  if (stat.isSymbolicLink()) throw new Error(`symlink paths are not allowed: ${fullPath}`)
}
