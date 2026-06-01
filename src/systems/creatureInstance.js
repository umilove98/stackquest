// creatureInstance.js — turns a species into a concrete, owned creature with a
// level, rolled IVs, computed stats, and battle-volatile fields. Plain objects
// so they serialize straight to the save file.

import { speciesById } from '../data/creatures.js';
import { CONFIG, genomeIntegrity, genomeVerdict } from '../data/config.js';
import { randInt, chance } from './rng.js';

let UID = 1;
export const peekUid = () => UID;
export const setUid = (n) => { UID = n; };

// run-wide bonus maxHp from luck charms (생명의 부적). set via state.syncCharms;
// computeStats folds it into every creature's maxHp so the HUD/heal stay honest.
let CHARM_HP = 0;
export const setCharmHp = (n) => { CHARM_HP = n || 0; };

export function rollIVs() {
  const iv = {};
  for (const s of CONFIG.iv.stats) iv[s] = randInt(CONFIG.iv.min, CONFIG.iv.max);
  return iv;
}

// Pokemon-ish stat formula (no EVs, fixed nature).
// plus (+n fusion level) grants a flat % bonus to every stat (CONFIG.fusion.statBonus per +).
export function computeStats(base, iv, level, plus = 0) {
  const s = (b, i) => Math.floor(((2 * b + i) * level) / 100);
  const mult = 1 + CONFIG.fusion.statBonus * (plus || 0);
  return {
    maxHp: Math.floor((s(base.hp, iv.hp) + level + 10) * mult) + CHARM_HP,
    atk: Math.floor((s(base.atk, iv.atk) + 5) * mult),
    def: Math.floor((s(base.def, iv.def) + 5) * mult),
    spd: Math.floor((s(base.spd, iv.spd) + 5) * mult),
  };
}

export function makeInstance(speciesId, level, opts = {}) {
  const sp = speciesById(speciesId);
  if (!sp) throw new Error(`unknown species ${speciesId}`);
  const iv = opts.iv || rollIVs();
  const shiny = opts.shiny != null ? opts.shiny : chance(CONFIG.shinyOdds);
  const plus = opts.plus || 0;
  const st = computeStats(sp.base, iv, level, plus);
  return {
    uid: UID++,
    id: speciesId,
    name: sp.name,
    classTag: sp.classTag,
    rarity: sp.rarity,
    catchRate: sp.catchRate, // needed by the recruit ("영입") chance — was missing → NaN
    level,
    xp: 0,
    iv,
    shiny,
    plus,                    // +n fusion ("강화") level
    genome: genomeIntegrity(iv),
    maxHp: st.maxHp,
    hp: st.maxHp,
    atk: st.atk,
    def: st.def,
    spd: st.spd,
    moves: sp.moves.map((m) => m.name),
    // battle-volatile (reset on heal)
    status: null,
    statusTurns: 0,
    buffs: {},
  };
}

export const xpToNext = (level) => CONFIG.xp.toNext(level);

// add xp; returns array of new levels reached (for level-up fanfare)
export function gainXp(inst, amount) {
  const reached = [];
  inst.xp += amount;
  while (inst.level < CONFIG.levelCap && inst.xp >= xpToNext(inst.level)) {
    inst.xp -= xpToNext(inst.level);
    inst.level += 1;
    reached.push(inst.level);
    const sp = speciesById(inst.id);
    const before = inst.maxHp;
    const st = computeStats(sp.base, inst.iv, inst.level, inst.plus || 0);
    inst.maxHp = st.maxHp; inst.atk = st.atk; inst.def = st.def; inst.spd = st.spd;
    inst.hp = Math.min(inst.maxHp, inst.hp + (inst.maxHp - before)); // heal the gained HP
  }
  if (inst.level >= CONFIG.levelCap) inst.xp = 0;
  return reached;
}

export function healInstance(inst) {
  inst.hp = inst.maxHp;
  inst.status = null;
  inst.statusTurns = 0;
  inst.buffs = {};
}

export const isFainted = (inst) => inst.hp <= 0;
export const verdictOf = (inst) => genomeVerdict(inst.genome);

// recompute derived stats from species base + iv + level + plus. heal:true also
// refills HP and clears battle-volatile state (used by enhance/evolve).
export function recomputeStats(inst, opts = {}) {
  const sp = speciesById(inst.id);
  const st = computeStats(sp.base, inst.iv, inst.level, inst.plus || 0);
  inst.maxHp = st.maxHp; inst.atk = st.atk; inst.def = st.def; inst.spd = st.spd;
  if (opts.heal) { inst.hp = inst.maxHp; inst.status = null; inst.statusTurns = 0; inst.buffs = {}; }
  else inst.hp = Math.min(inst.hp, inst.maxHp);
}

// fusion ("강화"): +1 to plus (capped). caller verifies/consumes the material.
export function enhanceInstance(inst) {
  if ((inst.plus || 0) >= CONFIG.fusion.maxPlus) return false;
  inst.plus = (inst.plus || 0) + 1;
  recomputeStats(inst, { heal: true });
  return true;
}

// what this creature can evolve into, with gates — or null if terminal/no line.
export function evolveInfo(inst) {
  const sp = speciesById(inst.id);
  const to = sp && sp.evolveTo ? speciesById(sp.evolveTo) : null;
  if (!to) return null;
  return {
    toId: to.id, toName: to.name, toRarity: to.rarity, toClass: to.classTag,
    cost: CONFIG.evolve.cost[to.rarity] ?? 0,
    minLevel: CONFIG.evolve.minLevel[to.rarity] ?? 1,
  };
}

// evolution ("진화"): mutate inst into its next-gen species, keeping iv/level/plus/
// shiny/genome. caller verifies level + token cost and deducts tokens.
export function evolveInstance(inst) {
  const info = evolveInfo(inst);
  if (!info) return null;
  const to = speciesById(info.toId);
  inst.id = to.id;
  inst.name = to.name;
  inst.classTag = to.classTag;
  inst.rarity = to.rarity;
  inst.catchRate = to.catchRate;
  inst.moves = to.moves.map((m) => m.name);
  recomputeStats(inst, { heal: true });
  return info;
}

export const plusTag = (inst) => ((inst.plus || 0) > 0 ? `+${inst.plus}` : '');
