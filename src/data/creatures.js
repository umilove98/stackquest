// creatures.js — loads the workflow-generated codex and derives the registries
// the game needs: species by id, a deduped move table, and wild/gacha pools.

import { NAME_KO, FLAVOR_KO, MOVE_KO } from './i18n.js';
// Imported (not fs-read) so bundlers/`bun build --compile` embed it in the exe.
import CODEX_RAW from './codex.json' with { type: 'json' };

// deep clone — the loop below mutates entries, and JSON module objects may be shared/frozen
const CODEX = JSON.parse(JSON.stringify(CODEX_RAW));

export const ALL_SPECIES = CODEX;
export const SPECIES = {};
export const MOVES = {};

for (const c of CODEX) {
  // Korean display name/flavor (English id stays as the internal key)
  c.name = NAME_KO[c.id] || c.name;
  c.flavor = FLAVOR_KO[c.id] || c.flavor;
  // starters become pullable: obtainable in the starting gacha and the CRATE
  if (c.role === 'starter') c.inGacha = true;
  SPECIES[c.id] = c;
  for (const m of c.moves) {
    if (!MOVES[m.name]) MOVES[m.name] = m;
  }
}
// attach Korean labels to the move registry (UI reads nameKo/descKo)
for (const name of Object.keys(MOVES)) {
  const t = MOVE_KO[name];
  MOVES[name].nameKo = t ? t[0] : name;
  MOVES[name].descKo = t ? t[1] : (MOVES[name].desc || '');
}

export const STARTERS = CODEX.filter((c) => c.role === 'starter').map((c) => c.id);
export const BOSS_ID = (CODEX.find((c) => c.role === 'boss') || {}).id || 'TECH_DEBT';

export const WILD_POOL = CODEX.filter((c) => c.inWild);
export const GACHA_POOL = CODEX.filter((c) => c.inGacha);

export const GACHA_BY_RARITY = {};
for (const c of GACHA_POOL) (GACHA_BY_RARITY[c.rarity] ||= []).push(c);

// how often each rarity shows up as a WILD encounter (commons common, rares rare)
const WILD_WEIGHT = { COMMON: 100, UNCOMMON: 42, RARE: 11, EPIC: 2 };
export const WILD_TABLE = WILD_POOL.map((c) => ({ id: c.id, weight: WILD_WEIGHT[c.rarity] || 1 }));

export const RARITY_RANK = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, BOSS: 5 };

export const speciesById = (id) => SPECIES[id];
export const moveByName = (name) => MOVES[name];
export const dexCount = () => CODEX.filter((c) => c.role !== 'boss').length;
