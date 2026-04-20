import { createHash } from 'crypto'
import { statSync, readFileSync } from 'fs'
import path from 'path'

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.json') return 'application/json'
  if (ext === '.md' || ext === '.txt') return 'text/markdown'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

export function buildHashInventory(entries = []) {
  return entries.map(({ path: relPath, absolutePath }) => {
    const raw = readFileSync(absolutePath)
    const stat = statSync(absolutePath)
    return {
      path: relPath,
      sha256: createHash('sha256').update(raw).digest('hex'),
      size: stat.size,
      mimeType: guessMime(absolutePath),
      modifiedTime: stat.mtime.toISOString()
    }
  })
}
