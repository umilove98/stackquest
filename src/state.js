// state.js — the persistent game state plus JSON save/load. State is plain data
// (creatures are plain objects) so (de)serialization is trivial.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRST_MAP, MAPS } from './data/worldmap.js';
import { dexCount, speciesById } from './data/creatures.js';
import { peekUid, setUid, setCharmHp, recomputeStats } from './systems/creatureInstance.js';
import { CONFIG } from './data/config.js';
import { charmTotals } from './data/charms.js';

// Where to read/write the save. For a packaged standalone exe the source dir is
// inside the (read-only) bundle, so save NEXT TO the executable; for `node
// game.js` save in the project root. Override with STACKQUEST_HOME.
let ROOT = process.cwd();
try { ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); } catch {}

function resolveSaveDir() {
  if (process.env.STACKQUEST_HOME) return process.env.STACKQUEST_HOME;
  try {
    const exe = path.basename(process.execPath || '').toLowerCase();
    if (exe && !exe.startsWith('node') && !exe.startsWith('bun')) return path.dirname(process.execPath);
  } catch {}
  return ROOT;
}

export const SAVE_PATH = path.join(resolveSaveDir(), 'savegame.json');
const SAVE_VERSION = 1;

export function newGame() {
  return {
    version: SAVE_VERSION,
    party: [],          // active team (max 6)
    box: [],            // stored creatures (the REPO)
    tokens: CONFIG.tokens.start,
    pity: { sinceRare: 0, sinceLegendary: 0 },
    dex: { seen: {}, caught: {} },
    mapId: FIRST_MAP,
    pos: { x: MAPS[FIRST_MAP].spawn.x, y: MAPS[FIRST_MAP].spawn.y },
    facing: 'down',
    flags: { starterChosen: false, bossDefeated: false },
    stats: { steps: 0, battlesWon: 0, pulls: 0, catches: 0, shinies: 0, escapes: 0 },
    settings: { fastReveal: false },
    caches: {},         // collected credit caches keyed by "x,y"
    inventory: {},      // consumable items: { itemId: count }
    npcGifts: {},       // anti-farm cooldown for NPC gifts: { "x,y": stepLastGifted }
    charms: [],         // owned 행운 부적 ids (passive run-wide buffs; can repeat)
  };
}

// apply owned charms' passive bonuses: set the run-wide HP bonus and recompute
// every owned creature's stats. call on load, on new-game entry, and after a roll.
export function syncCharms(state) {
  const t = charmTotals(state.charms || []);
  setCharmHp(t.hp);
  for (const c of [...(state.party || []), ...(state.box || [])]) recomputeStats(c);
}

export const PARTY_MAX = 6;

// ---- inventory helpers ----
export function addItem(state, id, n = 1) {
  if (!state.inventory) state.inventory = {};
  state.inventory[id] = (state.inventory[id] || 0) + n;
}
export function removeItem(state, id, n = 1) {
  if (!state.inventory || !state.inventory[id]) return false;
  state.inventory[id] -= n;
  if (state.inventory[id] <= 0) delete state.inventory[id];
  return true;
}
export const itemCount = (state, id) => (state.inventory && state.inventory[id]) || 0;

export function markSeen(state, id) { state.dex.seen[id] = true; }
export function markCaught(state, id) { state.dex.caught[id] = true; state.dex.seen[id] = true; }

// add a freshly obtained creature to party (if room) else to the box; returns where
export function addCreature(state, inst) {
  markCaught(state, inst.id);
  if (inst.shiny) state.stats.shinies += 1;
  if (state.party.length < PARTY_MAX) { state.party.push(inst); return 'party'; }
  state.box.push(inst);
  return 'box';
}

export const dexSeenCount = (state) => Object.keys(state.dex.seen).length;
export const dexCaughtCount = (state) => Object.keys(state.dex.caught).length;
export const dexTotal = () => dexCount();

export function hasSave() { return existsSync(SAVE_PATH); }
export function deleteSave() { try { if (existsSync(SAVE_PATH)) unlinkSync(SAVE_PATH); } catch {} }

export function save(state) {
  const data = { ...state, nextUid: peekUid() };
  try { writeFileSync(SAVE_PATH, JSON.stringify(data)); return true; }
  catch { return false; }
}

export function load() {
  try {
    const data = JSON.parse(readFileSync(SAVE_PATH, 'utf8'));
    if (data.nextUid) setUid(data.nextUid);
    if (!data.inventory) data.inventory = {}; // migrate pre-item saves
    if (!data.npcGifts) data.npcGifts = {};
    if (!data.charms) data.charms = []; // migrate pre-charm saves
    if (!data.mapId) data.mapId = FIRST_MAP; // migrate pre-multimap saves
    // guard the uid counter against any loaded instance
    let maxUid = peekUid();
    for (const c of [...(data.party || []), ...(data.box || [])]) {
      maxUid = Math.max(maxUid, (c.uid || 0) + 1);
      if (c.plus == null) c.plus = 0; // migrate pre-fusion saves
      // resync moves to the species' current move set — heals saves made before a
      // move/coverage rebalance (stale names would otherwise crash on attack).
      const sp = speciesById(c.id);
      if (sp) c.moves = sp.moves.map((m) => m.name);
    }
    setUid(maxUid);
    delete data.nextUid;
    syncCharms(data); // apply owned charms' HP bonus + recompute stats
    return data;
  } catch {
    return null;
  }
}
