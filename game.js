#!/usr/bin/env node
// STACK QUEST — entry point. Restores the terminal on any crash.
import { main } from './src/main.js';

main().catch((err) => {
  try { process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l'); } catch {}
  console.error('\nSTACK QUEST crashed:\n', err && err.stack ? err.stack : err);
  process.exit(1);
});
