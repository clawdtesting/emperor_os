#!/usr/bin/env node

import { discover } from './agent/discover.js';

async function runTest() {
  console.log('Running job discovery test...');
  try {
    await discover();
    console.log('Discovery completed successfully');
  } catch (error) {
    console.error('Discovery failed:', error);
    process.exit(1);
  }
}

runTest();