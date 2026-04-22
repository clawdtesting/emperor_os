import { discover } from './discover.js';

discover().catch(err => {
  console.error('[run_discover] Error:', err);
  process.exit(1);
});