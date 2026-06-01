// One-off: pull the workflow-generated codex/systems/map out of the task output
// JSON into committed data files, applying the balance-review boss-stat fix.
// Usage: node tools/extract-codex.mjs <path-to-workflow-output.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '..', 'src', 'data');

const src = process.argv[2];
if (!src) { console.error('need workflow output path'); process.exit(1); }
const o = JSON.parse(fs.readFileSync(src, 'utf8'));
const r = o.result || o;

const creatures = r.codex.creatures;
// Balance review (high/low): tame the KERNEL_PANIC BST spike for a short run.
const boss = creatures.find((c) => c.id === 'KERNEL_PANIC');
if (boss) boss.base = { hp: 180, atk: 125, def: 130, spd: 85 };

fs.writeFileSync(path.join(dataDir, 'codex.json'), JSON.stringify(creatures, null, 2));
fs.writeFileSync(path.join(dataDir, 'systems.json'), JSON.stringify(r.systems, null, 2));
fs.writeFileSync(path.join(dataDir, 'mapdraft.json'), JSON.stringify(r.mapDraft, null, 2));
console.log(`extracted ${creatures.length} creatures + systems + map draft`);
