#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const RUNTIME_DIRS = ['agent', 'core'];
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts']);
const FORBIDDEN = [
  { re: /new\s+ethers\.Wallet\s*\(/, label: 'ethers.Wallet constructor' },
  { re: /Wallet\.fromPhrase\s*\(/, label: 'Wallet.fromPhrase' },
  { re: /Wallet\.fromMnemonic\s*\(/, label: 'Wallet.fromMnemonic' },
  { re: /signTransaction\s*\(/, label: 'signTransaction call' },
  { re: /sendTransaction\s*\(/, label: 'sendTransaction call' },
  { re: /eth_sendRawTransaction/, label: 'eth_sendRawTransaction usage' },
  { re: /process\.env\.[A-Z0-9_]*PRIVATE_KEY/, label: 'PRIVATE_KEY env usage' },
];

async function walk(dir, acc = []) {
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(p, acc);
      continue;
    }
    if (CODE_EXT.has(path.extname(entry.name))) acc.push(p);
  }
  return acc;
}

const violations = [];
for (const rel of RUNTIME_DIRS) {
  const files = await walk(path.join(ROOT, rel));
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const relPath = path.relative(ROOT, file);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const rule of FORBIDDEN) {
        if (rule.re.test(lines[i])) {
          violations.push(`${relPath}:${i + 1} -> ${rule.label}`);
        }
      }
    }
  }
}

if (violations.length) {
  console.error('Signing/broadcast guard failed. Forbidden runtime primitive(s) found:');
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log('Signing/broadcast guard passed: no forbidden primitives in canonical runtime paths.');
