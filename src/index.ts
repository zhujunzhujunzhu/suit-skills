#!/usr/bin/env node

import { runCliProcess } from './cli/run.js';
import { error } from './utils/output.js';

runCliProcess().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  error(msg);
  process.exit(1);
});
