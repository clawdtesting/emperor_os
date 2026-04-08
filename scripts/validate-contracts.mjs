import { promises as fs } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const CONTRACTS_DIR = path.resolve('contracts');
const TARGETS = [
  { name: 'AGIJobManager-v1', adapter: 'contracts/AGIJobManager-v1/adapter.js', abi: 'contracts/AGIJobManager-v1/AGIJobManager.v1.json' },
  { name: 'AGIJobManager-v2', adapter: 'contracts/AGIJobManager-v2/adapter.js', abi: 'contracts/AGIJobManager-v2/AGIJobManager.v2.json' },
  { name: 'AGIJobPrime-v1', adapter: 'contracts/AGIJobPrime-v1/adapter.js', abi: 'contracts/AGIJobPrime-v1/AGIJobPrime.v1.json' }
];

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function validateAdapter(file) {
  const issues = [];
  if (!(await exists(file))) {
    issues.push('missing file');
    return { ok: false, issues };
  }

  const raw = await fs.readFile(file, 'utf8');
  if (!raw.trim()) {
    issues.push('file is empty');
    return { ok: false, issues };
  }

  try {
    const mod = await import(pathToFileURL(path.resolve(file)).href);
    if (typeof mod.tagJob !== 'function' && typeof mod.default?.tagJob !== 'function') {
      issues.push('missing exported tagJob(entry) function');
    }
  } catch (err) {
    issues.push(`module import failed: ${err.message}`);
  }

  return { ok: issues.length === 0, issues };
}

async function validateAbi(file) {
  const issues = [];
  if (!(await exists(file))) {
    issues.push('missing file');
    return { ok: false, issues };
  }

  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    issues.push(`invalid JSON: ${err.message}`);
    return { ok: false, issues };
  }

  const abi = Array.isArray(parsed) ? parsed : parsed?.abi;
  if (!Array.isArray(abi)) {
    issues.push('ABI must be an array or object with abi[]');
    return { ok: false, issues };
  }

  const fnCount = abi.filter((e) => e?.type === 'function').length;
  if (fnCount === 0) {
    issues.push('ABI has no functions');
  }

  return { ok: issues.length === 0, issues, entries: abi.length, functionCount: fnCount };
}

async function run() {
  if (!(await exists(CONTRACTS_DIR))) {
    console.error('contracts directory is missing');
    process.exit(1);
  }

  let failures = 0;
  for (const t of TARGETS) {
    const [adapterResult, abiResult] = await Promise.all([
      validateAdapter(t.adapter),
      validateAbi(t.abi)
    ]);

    console.log(`\n[${t.name}]`);
    if (adapterResult.ok) {
      console.log(`  adapter: OK (${t.adapter})`);
    } else {
      failures += 1;
      console.log(`  adapter: FAIL (${t.adapter})`);
      for (const issue of adapterResult.issues) console.log(`    - ${issue}`);
    }

    if (abiResult.ok) {
      console.log(`  abi: OK (${t.abi}) entries=${abiResult.entries} functions=${abiResult.functionCount}`);
    } else {
      failures += 1;
      console.log(`  abi: FAIL (${t.abi})`);
      for (const issue of abiResult.issues) console.log(`    - ${issue}`);
    }
  }

  if (failures > 0) {
    console.error(`\nvalidation failed: ${failures} issue group(s)`);
    process.exit(1);
  }

  console.log('\nvalidation passed');
}

run();
