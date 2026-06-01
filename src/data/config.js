// config.js — all gameplay tunables in one place. Values reflect the
// adversarial balance review (see notes) so a full run fits ~15-20 minutes.

export const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'BOSS'];

export const RARITY_LABEL = {
  COMMON: 'COMMON', UNCOMMON: 'UNCOMMON', RARE: 'RARE',
  EPIC: 'EPIC', LEGENDARY: 'LEGENDARY', BOSS: 'BOSS',
};

export const CONFIG = {
  levelCap: 25,            // review: short-run cap (was 50)
  startLevel: 5,

  // ---- individual values (IV) / "genome" ----
  iv: { min: 8, max: 31, stats: ['hp', 'atk', 'def', 'spd'] }, // floor 8 so an avg pull feels good
  genome: { cleanBuild: 85, flaky: 45 }, // >=85 CLEAN BUILD, 45-84 FLAKY, <45 CORRUPTED HEAP
  shinyOdds: 0.01,         // review: 1/100 (was 1/20); cosmetic only, no stat lies

  // ---- gacha ("CRATE") ----
  gacha: {
    odds: { UNCOMMON: 0.45, RARE: 0.30, EPIC: 0.18, LEGENDARY: 0.07 }, // COMMON removed (wild-only)
    softRareEvery: 4,      // every Nth pull without a RARE+ is forced to RARE+
    hardLegendaryAt: 12,   // pulls since last LEGENDARY that forces a LEGENDARY
    costSingle: 40,
    costTen: 360,
  },

  tokens: { start: 240, perWin: (lvl) => 8 + lvl * 4, cache: 70 },

  // release ("방출") scrap value: tokens refunded when you let a creature go.
  // rarity-scaled, doubled for shiny. kept below pull cost so it isn't a farm.
  release: {
    refund: { COMMON: 4, UNCOMMON: 8, RARE: 18, EPIC: 40, LEGENDARY: 80, BOSS: 0 },
    shinyMult: 2,
  },

  // fusion ("강화"): feed a same-species duplicate to raise +n. each + adds a flat
  // stat bonus to every stat. +5 => +30% stats.
  fusion: { statBonus: 0.06, maxPlus: 5 },

  // evolution ("진화"): a creature becomes its next-generation species (codex
  // evolveTo). gated by the TARGET rarity's min level + a token cost.
  evolve: {
    cost: { UNCOMMON: 25, RARE: 70, EPIC: 180, LEGENDARY: 450 },
    minLevel: { UNCOMMON: 6, RARE: 10, EPIC: 15, LEGENDARY: 20 },
  },

  // recycle ("재활용"): consume N creatures for one gacha pull whose odds tilt
  // toward higher rarity as the fed material's total value rises.
  recycle: {
    inputs: 5,
    value: { COMMON: 1, UNCOMMON: 2, RARE: 4, EPIC: 8, LEGENDARY: 16 },
    refValue: 20,   // total fed value at which EPIC+ weights roughly double
  },

  // ---- progression ----
  xp: {
    toNext: (L) => Math.round(5 * Math.pow(L, 1.25)),                 // review-flattened curve
    winAward: (enemyLevel, rarityMult) => Math.round(enemyLevel * 10 * rarityMult),
    cleanBonus: 1.5,       // no-faint multiplier
  },
  rarityMult: { COMMON: 1.0, UNCOMMON: 1.2, RARE: 1.5, EPIC: 1.8, LEGENDARY: 2.2, BOSS: 2.5 },

  // ---- catching ("patching") ----
  // 영입 라이선스: mult = 확률 배수, cost = 시도당 크레딧 (성공/실패와 무관하게 소모)
  balls: [
    { id: 'oss', name: '오픈소스 라이선스', mult: 1.0, cost: 0, desc: '무료 · 확률 ×1.0' },
    { id: 'pro', name: '프로 라이선스', mult: 1.6, cost: 25, desc: '확률 ×1.6' },
    { id: 'ent', name: '엔터프라이즈 계약', mult: 2.6, cost: 70, desc: '확률 ×2.6 · 좀처럼 거절당하지 않는다' },
  ],
  catch: {
    base: 0.15,            // HP-independent factor so fresh-target throws aren't always 0.02
    hpFactor: 0.85,
    hpExp: 1.15,
    rateScale: 255,        // codex catchRate is on a 0..255 scale; normalize
    statusMult: { none: 1.0, poison: 1.5, slow: 1.3, weaken: 1.15, shield: 1.0, crit_up: 1.0 },
    floor: 0.02, ceil: 0.95,
    shakes: 3,
  },

  // ---- battle ----
  // 4-class cycle: 개발자(DEV) > 코드(LOGIC) > 언어(MEMORY) > 비전(CONCURRENCY) > 개발자
  // each beats the next (×1.5) and is resisted by the previous (×0.75); the two
  // facing pairs (DEV↔MEMORY, LOGIC↔CONCURRENCY) are neutral. CORRUPT (boss) is neutral.
  effectiveness: {
    DEV: { LOGIC: 1.5, CONCURRENCY: 0.75 },          // 개발자 > 코드, 비전 > 개발자
    LOGIC: { MEMORY: 1.5, DEV: 0.75 },               // 코드 > 언어, 개발자 > 코드
    MEMORY: { CONCURRENCY: 1.5, LOGIC: 0.75 },        // 언어 > 비전, 코드 > 언어
    CONCURRENCY: { DEV: 1.5, MEMORY: 0.75 },          // 비전 > 개발자, 언어 > 비전
    CORRUPT: {},
  },
  // same-class attack bonus ("자속"): a move whose class matches its user's
  // class hits 1.5x. Off-class "coverage" moves get no bonus but can hit a
  // matchup the user's own class is resisted by.
  stab: 1.25,
  crit: { chance: 0.0625, mult: 1.8, critUpBonus: 0.28 },

  // per-move use limit ("토큰", PP-like). refills to full at the start of every
  // battle, so it's a per-battle budget — strong moves get fewer uses. items can
  // top it up mid-fight. tiers are keyed by move power.
  pp: { status: 5, tiers: [[60, 6], [85, 4], [105, 3], [Infinity, 2]] },
  statusEffect: {
    poison: { dotPercent: 0.08, turns: 999 },  // % max HP per turn
    slow:   { spdMult: 0.6, turns: 4 },
    weaken: { atkMult: 0.75, turns: 4 },
    shield: { defMult: 1.6, turns: 3 },
    crit_up: { turns: 3 },
  },

  // ---- overworld encounters ----
  encounter: {
    chancePerStep: 0.16,
    levelByDistance: true,  // deeper grass => higher level
    baseLevel: 3,
    levelSpread: 5,
  },

  // wild rarity pool scales with the lead's level: as you grow, commons thin out
  // and rares surge. weight = base[rarity] * max(0.05, 1 + bias[rarity]*t), where
  // t = leadLv/levelCap (0..1). (within the inWild species only.)
  wild: {
    base: { COMMON: 100, UNCOMMON: 42, RARE: 11, EPIC: 4, LEGENDARY: 2 },
    bias: { COMMON: -0.7, UNCOMMON: 0.2, RARE: 4.0, EPIC: 5.0, LEGENDARY: 5.0 },
  },
};

// level-scaled wild encounter weight for a rarity (t = leadLv / levelCap).
// higher level => commons fade, rares climb. floored so nothing hits zero.
export function wildWeight(rarity, leadLv) {
  const t = Math.max(0, Math.min(1, leadLv / CONFIG.levelCap));
  const base = CONFIG.wild.base[rarity] ?? 1;
  const bias = CONFIG.wild.bias[rarity] ?? 0;
  return Math.max(0.05, base * (1 + bias * t));
}

// catch ("patch") chance for a target at curHp/maxHp with a given ball + status
export function catchChance(catchRate, hpFrac, ballMult, status) {
  const c = CONFIG.catch;
  const hpTerm = c.base + c.hpFactor * Math.pow(1 - hpFrac, c.hpExp);
  const statusMult = c.statusMult[status || 'none'] ?? 1.0;
  const raw = (catchRate / c.rateScale) * hpTerm * statusMult * ballMult;
  return Math.max(c.floor, Math.min(c.ceil, raw));
}

// genome integrity % from an IV object (4 stats, each 0..ivMax)
export function genomeIntegrity(iv) {
  const stats = CONFIG.iv.stats;
  const sum = stats.reduce((a, s) => a + (iv[s] || 0), 0);
  return Math.round((sum / (stats.length * CONFIG.iv.max)) * 100);
}

export function genomeVerdict(pct) {
  if (pct >= CONFIG.genome.cleanBuild) return { label: 'CLEAN BUILD', tone: 'good' };
  if (pct >= CONFIG.genome.flaky) return { label: 'FLAKY', tone: 'warn' };
  return { label: 'CORRUPTED HEAP', tone: 'bad' };
}

// max uses ("토큰"/PP) for a move, by power. status moves (power 0) use the flat
// status value; damaging moves fall into the first tier whose cap they're under.
export function movePp(move) {
  const power = move.power || 0;
  if (power <= 0) return CONFIG.pp.status;
  for (const [cap, n] of CONFIG.pp.tiers) if (power <= cap) return n;
  return CONFIG.pp.tiers[CONFIG.pp.tiers.length - 1][1];
}

// tokens refunded for releasing ("방출") a creature: rarity scrap value, x2 if shiny
export function refundValue(inst) {
  const base = CONFIG.release.refund[inst.rarity] ?? CONFIG.release.refund.COMMON;
  return Math.round(base * (inst.shiny ? CONFIG.release.shinyMult : 1));
}

// recycle ("재활용"): given the rarities fed in, return tilted pull weights (need
// not sum to 1; weightedPick normalizes). Higher fed value => more EPIC/LEGENDARY.
export function recycleOdds(fedRarities) {
  const totalVal = fedRarities.reduce((a, r) => a + (CONFIG.recycle.value[r] || 1), 0);
  const boost = totalVal / CONFIG.recycle.refValue; // ~1.0 at refValue
  const o = CONFIG.gacha.odds;
  return {
    UNCOMMON: o.UNCOMMON,
    RARE: o.RARE,
    EPIC: o.EPIC * (1 + boost),
    LEGENDARY: o.LEGENDARY * (1 + 1.5 * boost),
  };
}

// class effectiveness multiplier of atk-class vs def-class
export function effectiveness(atkClass, defClass) {
  const row = CONFIG.effectiveness[atkClass];
  if (!row) return 1.0;
  return row[defClass] ?? 1.0;
}
