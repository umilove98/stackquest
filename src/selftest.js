// selftest.js — headless logic checks (no terminal, no input). Run via
// `node game.js --selftest`. Validates data integrity, the balance-review
// formulas, gacha odds + pity, XP, map connectivity, and save/load.

import { ALL_SPECIES, SPECIES, MOVES, WILD_TABLE, GACHA_BY_RARITY, BOSS_ID, dexCount } from './data/creatures.js';
import { SPRITES } from './data/sprites.js';
import { CONFIG, catchChance, genomeIntegrity, genomeVerdict, effectiveness, recycleOdds, movePp, wildWeight } from './data/config.js';
import { ITEMS, SHOP_STOCK, GIFT_TABLE, itemById } from './data/items.js';
import { addItem, removeItem, itemCount } from './state.js';
import { makeInstance, computeStats, gainXp, xpToNext, rollIVs, enhanceInstance, evolveInstance, evolveInfo, setCharmHp } from './systems/creatureInstance.js';
import { CHARMS, CHARM_IDS, charmTotals, fortuneOdds } from './data/charms.js';
import { VERSION } from './data/version.js';
import { PATCH_NOTES } from './data/patchnotes.js';
import { rollRarity, pull } from './systems/gacha.js';
import { MAPS, MAP_ORDER, isWalkable, tileInfo } from './data/worldmap.js';
import { newGame, save, load, hasSave, deleteSave, addCreature } from './state.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m ${msg}`); } };
const approx = (a, b, tol) => Math.abs(a - b) <= tol;
const section = (s) => console.log(`\n— ${s} —`);

// ---- data integrity ----
section('data integrity');
ok(ALL_SPECIES.length === 34, `34 species (got ${ALL_SPECIES.length})`);
ok(dexCount() === 32, `dex excludes bosses (got ${dexCount()})`);
for (const c of ALL_SPECIES) {
  ok(c.moves.some((m) => m.power > 0), `${c.id} has a damaging move`);
  ok(['LOGIC', 'MEMORY', 'CONCURRENCY', 'DEV', 'CORRUPT'].includes(c.classTag), `${c.id} class valid`);
  ok(c.moves.length <= 4, `${c.id} has <= 4 moves (got ${c.moves.length})`);
  ok(!!SPRITES[c.id], `${c.id} has a sprite`); // guards against invisible creatures on swap
}
ok(ALL_SPECIES.filter((c) => c.classTag === 'DEV').length >= 5, '개발자(DEV) class lineup present');
ok(SPECIES.TECH_DEBT.base.hp === 180 && SPECIES.TECH_DEBT.base.atk === 125 && SPECIES.TECH_DEBT.base.def === 130 && SPECIES.TECH_DEBT.base.spd === 85, '기술부채 BST = review fix (180/125/130/85)');
const bosses = ALL_SPECIES.filter((c) => c.role === 'boss');
ok(bosses.length === 2 && bosses.every((b) => b.catchRate === 0), 'two bosses, both uncatchable');
ok(!!SPECIES.DEADLOCK && SPECIES.DEADLOCK.classTag === 'CORRUPT', 'DEADLOCK (map-2 boss) present');
ok(Object.keys(MOVES).length > 20, `move registry built (${Object.keys(MOVES).length})`);
ok(PATCH_NOTES[0].version === `v${VERSION}`, `version.js (${VERSION}) matches latest patchnote (${PATCH_NOTES[0].version})`);

// ---- stat computation ----
section('stats');
const a10 = computeStats(SPECIES.COPILOT.base, { hp: 20, atk: 20, def: 20, spd: 20 }, 10);
const a20 = computeStats(SPECIES.COPILOT.base, { hp: 20, atk: 20, def: 20, spd: 20 }, 20);
ok(a20.maxHp > a10.maxHp && a20.atk > a10.atk, 'stats grow with level');
const fresh = makeInstance('GREP', 5);
ok(fresh.hp === fresh.maxHp, 'fresh instance at full HP');

// ---- catch formula (review fixes) ----
section('catch formula');
ok(catchChance(200, 1.0, 1.0, 'none') >= 0.02 && catchChance(200, 0, 1.0, 'none') <= 0.95, 'catch clamped to [0.02,0.95]');
ok(catchChance(200, 0.05, 1.0, 'none') > catchChance(70, 0.05, 1.0, 'none'), 'higher catchRate => easier');
ok(catchChance(70, 1.0, 1.0, 'none') < catchChance(70, 0.1, 1.0, 'none'), 'lower HP => easier');
ok(catchChance(10, 0.0, 2.6, 'none') <= 0.15, `legendary stays hard (got ${catchChance(10, 0.0, 2.6, 'none').toFixed(2)})`);
ok(catchChance(70, 1.0, 1.0, 'none') > 0.02, 'full-HP throw has a nonzero base chance');
// regression: instances must carry catchRate so the recruit % isn't NaN
{
  const wild = makeInstance('GREP', 6);
  ok(typeof wild.catchRate === 'number', 'instance carries catchRate');
  ok(!Number.isNaN(catchChance(wild.catchRate, wild.hp / wild.maxHp, 1.0, wild.status)), 'recruit chance from an instance is a real number (not NaN)');
}

// ---- IV / genome ----
section('genome');
ok(genomeIntegrity({ hp: 31, atk: 31, def: 31, spd: 31 }) === 100, 'perfect IV = 100%');
ok(genomeVerdict(100).label === 'CLEAN BUILD', 'verdict 100 = CLEAN BUILD');
ok(genomeVerdict(60).label === 'FLAKY', 'verdict 60 = FLAKY');
ok(genomeVerdict(20).label === 'CORRUPTED HEAP', 'verdict 20 = CORRUPTED HEAP');
let ivMinOk = true;
for (let i = 0; i < 200; i++) { const iv = rollIVs(); for (const s of CONFIG.iv.stats) if (iv[s] < CONFIG.iv.min || iv[s] > CONFIG.iv.max) ivMinOk = false; }
ok(ivMinOk, `IVs within [${CONFIG.iv.min},${CONFIG.iv.max}]`);

// ---- effectiveness 4-cycle: DEV > LOGIC > MEMORY > CONCURRENCY > DEV ----
section('class cycle');
ok(effectiveness('DEV', 'LOGIC') === 1.5 && effectiveness('LOGIC', 'DEV') === 0.75, '개발자 > 코드');
ok(effectiveness('LOGIC', 'MEMORY') === 1.5 && effectiveness('MEMORY', 'LOGIC') === 0.75, '코드 > 언어');
ok(effectiveness('MEMORY', 'CONCURRENCY') === 1.5 && effectiveness('CONCURRENCY', 'MEMORY') === 0.75, '언어 > 비전');
ok(effectiveness('CONCURRENCY', 'DEV') === 1.5 && effectiveness('DEV', 'CONCURRENCY') === 0.75, '비전 > 개발자');
ok(effectiveness('DEV', 'MEMORY') === 1.0 && effectiveness('LOGIC', 'CONCURRENCY') === 1.0, 'facing pairs neutral');
ok(effectiveness('CONCURRENCY', 'LOGIC') === 1.0, 'old 비전>코드 edge now neutral');
ok(effectiveness('CORRUPT', 'LOGIC') === 1.0, 'CORRUPT neutral');

// ---- STAB ("자속") + coverage moves ----
section('stab & coverage');
ok(typeof CONFIG.stab === 'number' && CONFIG.stab > 1, `stab configured (${CONFIG.stab})`);
// replicate the battle damage core to prove on-class STAB beats equal-power off-class on a neutral target
const dmgCore = (attackerClass, move, defenderClass) => {
  const base = (((2 * 20) / 5 + 2) * move.power * (100 / 100)) / 50 + 2;
  const eff = effectiveness(move.classTag, defenderClass);
  const stab = move.classTag === attackerClass ? CONFIG.stab : 1.0;
  return base * eff * stab;
};
{
  const onClass = dmgCore('LOGIC', { classTag: 'LOGIC', power: 80 }, 'CORRUPT'); // neutral target
  const offClass = dmgCore('LOGIC', { classTag: 'MEMORY', power: 80 }, 'CORRUPT');
  ok(onClass > offClass, 'on-class move (STAB) > equal-power off-class on neutral target');
  // coverage payoff: off-class super-effective beats on-class resisted at equal power
  // (MEMORY creature vs a 코드 defender: DEV coverage is super, on-class MEMORY is resisted)
  const onResisted = dmgCore('MEMORY', { classTag: 'MEMORY', power: 80 }, 'LOGIC'); // stab 1.25 * 0.75 eff
  const offSuper = dmgCore('MEMORY', { classTag: 'DEV', power: 80 }, 'LOGIC');       // 1.0 stab * 1.5 eff
  ok(offSuper > onResisted, 'off-class coverage (super-eff) beats on-class resisted at equal power');
}
// every RARE+ gacha species carries exactly one off-class coverage move
for (const c of GACHA_POOL_RARE_PLUS()) {
  const off = c.moves.filter((m) => m.power > 0 && m.classTag !== c.classTag);
  ok(off.length === 1, `${c.id} has exactly one off-class coverage move (got ${off.length})`);
}
function GACHA_POOL_RARE_PLUS() {
  return ALL_SPECIES.filter((c) => c.inGacha && ['RARE', 'EPIC', 'LEGENDARY'].includes(c.rarity));
}

// ---- gacha pool variety (dup-pull fix) ----
section('gacha variety');
ok(GACHA_BY_RARITY.LEGENDARY.length >= 3, `legendary pool >= 3 (got ${GACHA_BY_RARITY.LEGENDARY.length})`);
ok(GACHA_BY_RARITY.EPIC.length >= 5, `epic pool >= 5 (got ${GACHA_BY_RARITY.EPIC.length})`);
ok(new Set(GACHA_BY_RARITY.LEGENDARY.map((c) => c.classTag)).size >= 3, 'legendaries span >= 3 classes');

// ---- fusion (+n) / evolution / recycle ----
section('fusion & evolution & recycle');
{
  const base = SPECIES.COPILOT.base, iv = { hp: 20, atk: 20, def: 20, spd: 20 };
  const s0 = computeStats(base, iv, 20, 0);
  const s5 = computeStats(base, iv, 20, CONFIG.fusion.maxPlus);
  ok(s5.atk > s0.atk && s5.maxHp > s0.maxHp, '+n raises all stats');
  ok(Math.abs(s5.atk / s0.atk - (1 + CONFIG.fusion.statBonus * CONFIG.fusion.maxPlus)) < 0.05,
    `+${CONFIG.fusion.maxPlus} ≈ +${Math.round(CONFIG.fusion.statBonus * CONFIG.fusion.maxPlus * 100)}% atk`);
  ok(computeStats(base, iv, 20).atk === s0.atk, 'computeStats defaults plus to 0 (back-compat)');
  const f = makeInstance('GPT4', 15);
  let cnt = 0; while (enhanceInstance(f)) cnt++;
  ok(f.plus === CONFIG.fusion.maxPlus && cnt === CONFIG.fusion.maxPlus, `enhance caps at +${CONFIG.fusion.maxPlus}`);
}
{
  const rank = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, BOSS: 5 };
  let evoOk = true, climbs = true;
  for (const c of ALL_SPECIES) {
    if (!c.evolveTo) continue;
    const to = SPECIES[c.evolveTo];
    if (!to) evoOk = false;
    else if (rank[to.rarity] < rank[c.rarity]) climbs = false;
  }
  ok(evoOk, 'every evolveTo points to a real species');
  ok(climbs, 'evolution never lowers rarity');
  ok(!SPECIES.DEVIN.evolveTo && !SPECIES.CLAUDE_OPUS.evolveTo && !SPECIES.VEO.evolveTo, 'top-tier legends are terminal');
  const g = makeInstance('GREP', 12, { iv: { hp: 25, atk: 25, def: 25, spd: 25 } });
  g.plus = 2; const lvl = g.level, ivAtk = g.iv.atk, genome = g.genome;
  const info = evolveInfo(g);
  ok(info && info.toId === 'COPILOT', 'GREP -> COPILOT lineage');
  evolveInstance(g);
  ok(g.id === 'COPILOT' && g.rarity === 'RARE', 'evolve swaps species + rarity');
  ok(g.level === lvl && g.iv.atk === ivAtk && g.plus === 2 && g.genome === genome, 'evolve keeps level/iv/plus/genome');
  ok(g.hp === g.maxHp, 'evolve heals to full');
}
{
  const epicShare = (w) => (w.EPIC + w.LEGENDARY) / Object.values(w).reduce((a, b) => a + b, 0);
  const low = recycleOdds(['COMMON', 'COMMON', 'COMMON', 'COMMON', 'COMMON']);
  const high = recycleOdds(['RARE', 'RARE', 'RARE', 'EPIC', 'EPIC']);
  ok(epicShare(high) > epicShare(low), 'recycle: higher fed value => more EPIC+');
}

// ---- gacha odds + pity ----
section('gacha odds & pity');
ok(!('COMMON' in CONFIG.gacha.odds), 'no COMMON in pull odds');
{
  const st = newGame();
  const counts = { UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0, COMMON: 0 };
  let sinceRare = 0, sinceLeg = 0, pityRareOk = true, pityLegOk = true;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const r = rollRarity(st);
    counts[r]++;
    // pity audit
    sinceRare = (r === 'UNCOMMON') ? sinceRare + 1 : 0;
    sinceLeg = (r === 'LEGENDARY') ? 0 : sinceLeg + 1;
    if (sinceRare > CONFIG.gacha.softRareEvery) pityRareOk = false;
    if (sinceLeg > CONFIG.gacha.hardLegendaryAt) pityLegOk = false;
  }
  ok(counts.COMMON === 0, 'pulls never yield COMMON');
  ok(pityRareOk, `soft pity: never > ${CONFIG.gacha.softRareEvery} pulls without RARE+`);
  ok(pityLegOk, `hard pity: never > ${CONFIG.gacha.hardLegendaryAt} pulls without LEGENDARY`);
  // legendary frequency should be clearly elevated by pity over base 0.07
  ok(counts.LEGENDARY / N > 0.07, `legendary rate boosted by pity (${(counts.LEGENDARY / N * 100).toFixed(1)}%)`);
}
{
  const st = newGame();
  const p = pull(st);
  ok(GACHA_BY_RARITY[p.rarity].some((s) => s.id === p.speciesId), 'pulled species matches rolled rarity');
  ok(p.inst.level >= 8 && p.inst.level <= 14, 'pulled level in [8,14]');
}

// ---- wild rarity scaling with level ----
section('wild scaling');
{
  const cap = CONFIG.levelCap;
  ok(wildWeight('RARE', cap) > wildWeight('RARE', 1), 'RARE weight rises with level');
  ok(wildWeight('COMMON', cap) < wildWeight('COMMON', 1), 'COMMON weight falls with level');
  ok(wildWeight('COMMON', cap) > 0 && wildWeight('RARE', 1) > 0, 'weights stay positive');
  // RARE share clearly higher at cap than at level 1 (within the wild pool)
  const rares = ['COMMON', 'UNCOMMON', 'RARE'];
  const share = (lv) => wildWeight('RARE', lv) / rares.reduce((a, r) => a + wildWeight(r, lv), 0);
  ok(share(cap) > share(1) * 2, `RARE share grows a lot by cap (${(share(1) * 100).toFixed(1)}% -> ${(share(cap) * 100).toFixed(1)}%)`);
}

// ---- PP (토큰) + items ----
section('pp & items');
{
  ok(movePp({ power: 0 }) === CONFIG.pp.status, 'status move pp = status tier');
  ok(movePp({ power: 45 }) >= movePp({ power: 110 }), 'weaker moves get >= pp than strong');
  ok(movePp({ power: 110 }) >= 1, 'even the strongest move has >=1 pp');
  // every codex move resolves to a positive pp
  let ppOk = true;
  for (const c of ALL_SPECIES) for (const m of c.moves) if (!(movePp(m) >= 1)) ppOk = false;
  ok(ppOk, 'every move has >=1 pp');
}
{
  // items catalog integrity
  let itemsOk = true;
  for (const id of Object.keys(ITEMS)) {
    const it = ITEMS[id];
    if (it.id !== id) itemsOk = false;
    if (!['hp', 'pp', 'revive'].includes(it.kind)) itemsOk = false;
    if (!(it.price > 0)) itemsOk = false;
  }
  ok(itemsOk, 'every item has valid id/kind/price');
  ok(SHOP_STOCK.every((id) => itemById(id)), 'shop stock ids all valid');
  ok(GIFT_TABLE.every((g) => itemById(g.id) && g.weight > 0), 'gift table ids/weights valid');
}
{
  // inventory helpers + persistence
  const st = newGame();
  ok(st.inventory && typeof st.inventory === 'object', 'newGame has inventory');
  addItem(st, 'hotfix', 2); addItem(st, 'hotfix', 1);
  ok(itemCount(st, 'hotfix') === 3, 'addItem stacks');
  removeItem(st, 'hotfix', 1);
  ok(itemCount(st, 'hotfix') === 2, 'removeItem decrements');
  removeItem(st, 'hotfix', 5);
  ok(itemCount(st, 'hotfix') === 0 && !('hotfix' in st.inventory), 'removeItem clears empty stacks');
}

// ---- luck charms (행운 부적) ----
section('luck charms');
{
  // every catalog charm contributes to totals
  for (const id of CHARM_IDS) ok(!!CHARMS[id].name && !!CHARMS[id].desc, `${id} has name+desc`);
  const t = charmTotals(['vitality', 'vitality', 'power', 'capture', 'phoenix', 'fortune']);
  ok(t.hp === 20, '2x vitality => +20 hp');
  ok(t.power === 5, 'power => +5 move power');
  ok(t.catchMult === 2, 'capture => x2 catch');
  ok(t.reviveCharges === 1, 'phoenix => 1 revive charge');
  ok(t.rarityBoost === 1, 'fortune => +1 rarity boost');
  ok(charmTotals([]).hp === 0 && charmTotals([]).catchMult === 1, 'no charms => neutral totals');
  // fortune tilts gacha odds upward
  const f = fortuneOdds(CONFIG.gacha.odds, 2);
  ok(f.EPIC > CONFIG.gacha.odds.EPIC && f.LEGENDARY > CONFIG.gacha.odds.LEGENDARY, 'fortune boosts EPIC/LEGENDARY odds');
  ok(fortuneOdds(CONFIG.gacha.odds, 0).EPIC === CONFIG.gacha.odds.EPIC, 'no fortune => base odds');
  // 생명의 부적 feeds into computeStats (then reset so other tests are unaffected)
  const base = { hp: 80, atk: 80, def: 70, spd: 80 }, iv = { hp: 20, atk: 20, def: 20, spd: 20 };
  setCharmHp(0); const noCharm = computeStats(base, iv, 15).maxHp;
  setCharmHp(20); const withCharm = computeStats(base, iv, 15).maxHp;
  setCharmHp(0);
  ok(withCharm - noCharm === 20, 'charm HP bonus adds flat maxHp');
}

// ---- xp curve ----
section('xp / progression');
{
  let cum = 0;
  for (let L = 1; L < CONFIG.levelCap; L++) cum += xpToNext(L);
  ok(cum > 200 && cum < 8000, `cum XP to cap is short-run sane (${cum})`);
  const c = makeInstance('COPILOT', 5);
  const before = c.level;
  gainXp(c, 100000); // dump huge xp
  ok(c.level === CONFIG.levelCap, `gainXp caps at level ${CONFIG.levelCap}`);
  ok(c.level > before, 'leveled up from xp');
  ok(CONFIG.xp.winAward(10, 1.5) > 0, 'win award positive');
}

// ---- map connectivity (BFS from spawn, per map) ----
section('map connectivity');
// bridges count as walkable here (fully-unlocked reachability); repo is menu-only.
function bfsMap(m) {
  const seen = new Set([`${m.spawn.x},${m.spawn.y}`]);
  const q = [[m.spawn.x, m.spawn.y]];
  let grass = 0;
  const walk = (x, y) => { const t = tileInfo(m, x, y); return t.kind === 'bridge' ? true : isWalkable(m, x, y); };
  while (q.length) {
    const [x, y] = q.shift();
    if (tileInfo(m, x, y).kind === 'grass') grass++;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height) continue;
      if (seen.has(key) || !walk(nx, ny)) continue;
      seen.add(key); q.push([nx, ny]);
    }
  }
  return { seen, grass };
}
for (const id of MAP_ORDER) {
  const m = MAPS[id];
  const { seen, grass } = bfsMap(m);
  const reach = (p) => p && seen.has(`${p.x},${p.y}`);
  for (let y = 0; y < m.height; y++) ok(m.tiles[y].length === m.width, `${id} row ${y} width == ${m.width}`);
  ok(reach(m.poi.gacha), `${id}: gacha reachable`);
  ok(reach(m.poi.healer), `${id}: healer reachable`);
  ok(reach(m.poi.shop), `${id}: shop reachable`);
  ok(reach(m.poi.boss), `${id}: boss reachable`);
  ok(reach(m.portal), `${id}: portal reachable`);
  ok(grass > 8, `${id}: grass reachable (${grass})`);
  ok(!!m.bossId, `${id}: has a boss id`);
}
// map-2 specifics: a quest gatekeeper + a bridge, and the bridge gates the boss
{
  const prod = MAPS.prod;
  ok(prod.questNpc && prod.bridges.length > 0, 'prod has quest npc + bridge');
  // with the bridge CLOSED, the boss must be unreachable (gated progression)
  const seen = new Set([`${prod.spawn.x},${prod.spawn.y}`]);
  const q = [[prod.spawn.x, prod.spawn.y]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= prod.width || ny >= prod.height) continue;
      if (seen.has(key) || !isWalkable(prod, nx, ny)) continue; // bridge 'b' is non-walkable in isWalkable
      seen.add(key); q.push([nx, ny]);
    }
  }
  ok(seen.has(`${prod.questNpc.x},${prod.questNpc.y}`), 'prod: gatekeeper reachable before bridge');
  ok(!seen.has(`${prod.poi.boss.x},${prod.poi.boss.y}`), 'prod: boss gated behind the bridge');
}

// ---- save / load roundtrip ----
section('save / load');
if (hasSave()) {
  console.log('  (existing save present — skipping disk roundtrip)');
} else {
  const st = newGame();
  addCreature(st, makeInstance('COPILOT', 7, { iv: { hp: 15, atk: 16, def: 17, spd: 18 } }));
  st.tokens = 137; st.pos = { x: 5, y: 6 };
  addItem(st, 'stacktrace', 2);
  st.charms = ['vitality', 'fortune'];
  save(st);
  const loaded = load();
  ok(loaded && loaded.tokens === 137, 'tokens persisted');
  ok(loaded.party.length === 1 && loaded.party[0].iv.spd === 18, 'party + IVs persisted');
  ok(loaded.pos.x === 5 && loaded.pos.y === 6, 'position persisted');
  ok(itemCount(loaded, 'stacktrace') === 2, 'inventory persisted');
  ok(Array.isArray(loaded.charms) && loaded.charms.length === 2, 'charms persisted');
  deleteSave();
  setCharmHp(0); // load() applied the saved charm's HP bonus — reset for cleanliness
}

console.log(`\n${fail === 0 ? '\x1b[32mALL PASS\x1b[0m' : '\x1b[31mFAILURES\x1b[0m'}  —  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
