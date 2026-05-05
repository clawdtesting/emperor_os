// agent/test_job_id_normalization.js
// Test for jobId normalization

import { normalizeJobId } from './state.js';

function test(input, description) {
  try {
    const output = normalizeJobId(input);
    return { ok: true, output };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

console.log('Testing jobId normalization:');
console.log('');

const testCases = [
  { input: 0, description: '0 (number)' },
  { input: '0', description: '"0" (string)' },
  { input: ' 0 ', description: '" 0 " (string with spaces)' },
  { input: '0\n', description: '"0\\n" (string with newline)' },
  { input: null, description: 'null' },
  { input: undefined, description: 'undefined' },
  { input: '', description: 'empty string' },
  { input: 'abc', description: '"abc"' },
  { input: '1', description: '"1"' },
  { input: 1, description: '1 (number)' },
  { input: '11', description: '"11"' },
  { input: 11, description: '11 (number)' },
  { input: '0.0', description: '"0.0"' },
  { input: '-1', description: '"-1"' },
];

for (const { input, description } of testCases) {
  const result = test(input, description);
  if (result.ok) {
    console.log(`${description}: OK -> "${result.output}"`);
  } else {
    console.log(`${description}: INVALID -> ${result.error}`);
  }
}