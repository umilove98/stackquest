// notes.mjs — write NOTES.md (release body) for a tag, pulled from patchnotes.
//   node tools/notes.mjs v0.5.0
import { writeFileSync } from 'node:fs';
import { PATCH_NOTES } from '../src/data/patchnotes.js';

const tag = process.argv[2] || PATCH_NOTES[0].version;
const v = String(tag).replace(/^v/, '');
const e = PATCH_NOTES.find((p) => p.version.replace(/^v/, '') === v) || PATCH_NOTES[0];
const body = `## STACK QUEST ${e.version} — ${e.title}\n\n`
  + e.changes.map((c) => (c.startsWith('  ') ? `  ${c.trim()}` : `- ${c}`)).join('\n') + '\n';
writeFileSync('NOTES.md', body);
console.log(`NOTES.md ← ${e.version} (${e.title})`);
