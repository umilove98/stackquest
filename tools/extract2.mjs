// extract2.mjs — pull the tool/model codex out of the workflow output into
// codex.json. Unescapes HTML entities in strings and hardens the boss stats.
// Usage: node tools/extract2.mjs <workflow-output.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '..', 'src', 'data');

const unesc = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function walk(v) {
  if (typeof v === 'string') return unesc(v);
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
  return v;
}

const o = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const r = o.result || o;
let creatures = walk(r.codex.creatures);

// harden the boss (review-style: BST ~520, uncatchable)
const boss = creatures.find((c) => c.role === 'boss' || c.rarity === 'BOSS');
if (boss) { boss.base = { hp: 180, atk: 125, def: 130, spd: 85 }; boss.catchRate = 0; }

fs.writeFileSync(path.join(dataDir, 'codex.json'), JSON.stringify(creatures, null, 2));
const byR = {};
for (const c of creatures) byR[c.rarity] = (byR[c.rarity] || 0) + 1;
console.log(`extracted ${creatures.length} tools/models:`, JSON.stringify(byR));
console.log('boss:', boss && boss.id, boss && JSON.stringify(boss.base), 'catchRate', boss && boss.catchRate);
const leg = creatures.find((c) => c.rarity === 'LEGENDARY');
console.log('legendary:', leg && leg.id, leg && JSON.stringify(leg.base), 'moves', leg && leg.moves.length);
const noDmg = creatures.filter((c) => !c.moves.some((m) => m.power > 0)).map((c) => c.id);
if (noDmg.length) console.log('WARN no-damage creatures:', noDmg);
