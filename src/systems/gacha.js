// gacha.js — the CRATE: pity-aware rarity rolls and a multi-stage truecolor
// reveal (charge -> escalating beams -> fakeout -> flare -> shiny check ->
// materialize -> animated genome/IV readout). RARE+ gets the full cinematic;
// commons and ten-pull items get a compressed reveal. Everything is skippable.

import {
  PAL, rarityColor, classColor, scaleColor, lerpColor, gradientColors, hsl,
} from '../ansi.js';
import { sleep, flash, sparkle, rainbowText } from '../fx/anim.js';
import { CONFIG, genomeVerdict } from '../data/config.js';
import { GACHA_BY_RARITY } from '../data/creatures.js';
import { SPRITES } from '../data/sprites.js';
import { makeInstance } from './creatureInstance.js';
import { chance, pick, randInt, weightedPick } from './rng.js';
import { addCreature } from '../state.js';
import { charmTotals, fortuneOdds } from '../data/charms.js';
import {
  panel, drawCreature, materializeCreature, genomeBar, rarityTag, RARITY_GLYPH, toneColor, menu, waitConfirm,
} from '../ui.js';
import { rarityKo, verdictKo, classKo } from '../data/i18n.js';
import { vlen } from '../render.js';

const RANK = { UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };
const TIER_ORDER = ['UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];

// ---- pity-aware rarity + pull ----
export function rollRarity(state) {
  // 행운의 부적: tilt the table toward EPIC/LEGENDARY
  const o = fortuneOdds(CONFIG.gacha.odds, charmTotals(state.charms || []).rarityBoost);
  state.pity.sinceRare += 1;
  state.pity.sinceLegendary += 1;
  let rarity;
  if (state.pity.sinceLegendary >= CONFIG.gacha.hardLegendaryAt) {
    rarity = 'LEGENDARY';
  } else {
    rarity = weightedPick(Object.keys(o), (k) => o[k]);
    if (RANK[rarity] < 2 && state.pity.sinceRare >= CONFIG.gacha.softRareEvery) {
      const pool = { RARE: o.RARE, EPIC: o.EPIC, LEGENDARY: o.LEGENDARY };
      rarity = weightedPick(Object.keys(pool), (k) => pool[k]);
    }
  }
  if (rarity !== 'UNCOMMON') state.pity.sinceRare = 0;
  if (rarity === 'LEGENDARY') state.pity.sinceLegendary = 0;
  return rarity;
}

export function pull(state) {
  const rarity = rollRarity(state);
  const sp = pick(GACHA_BY_RARITY[rarity]);
  const shiny = chance(CONFIG.shinyOdds);
  const inst = makeInstance(sp.id, randInt(8, 14), { shiny });
  state.stats.pulls += 1;
  return { rarity, speciesId: sp.id, shiny, inst };
}

// one-off opening pull for picking a starter: no pity, fixed to start level,
// drawn from the full gacha pool (which now includes the tool-familiars).
export function pullStarter() {
  const o = CONFIG.gacha.odds;
  const rarity = weightedPick(Object.keys(o), (k) => o[k]);
  const sp = pick(GACHA_BY_RARITY[rarity]);
  const shiny = chance(CONFIG.shinyOdds);
  const inst = makeInstance(sp.id, CONFIG.startLevel, { shiny });
  return { rarity, speciesId: sp.id, shiny, inst };
}

// ---- reveal helpers ----
const center = (screen) => ({ cx: Math.floor(screen.w / 2), cy: Math.floor(screen.h / 2) - 1 });

function keyPressed(input) { return input.queue.length > 0; }

function beams(screen, cx, cy, color, len, glyph) {
  // 8-direction rays, brighter near the core
  for (let r = 1; r <= len; r++) {
    const c = scaleColor(color, 0.35 + 0.65 * (1 - r / (len + 1)));
    const ry = Math.round(r / 2);
    screen.put(cx + r, cy, glyph, c);
    screen.put(cx - r, cy, glyph, c);
    screen.put(cx, cy - ry, glyph, c);
    screen.put(cx, cy + ry, glyph, c);
    const dy = Math.round(r / 2.6);
    screen.put(cx + r, cy - dy, '·', c);
    screen.put(cx - r, cy - dy, '·', c);
    screen.put(cx + r, cy + dy, '·', c);
    screen.put(cx - r, cy + dy, '·', c);
  }
}

const STATS = [['hp', '체력'], ['atk', '공격'], ['def', '방어'], ['spd', '속도']];

function drawCard(screen, result, reveal) {
  const inst = result.inst;
  const rc = rarityColor(result.rarity);
  const W = 48, H = 22;
  const x = Math.floor((screen.w - W) / 2);
  const y = Math.floor((screen.h - H) / 2);
  panel(screen, x, y, W, H, { style: 'heavy', fg: rc, bg: PAL.bgPanel, titleFg: rc });
  // rarity banner
  const banner = `${RARITY_GLYPH[result.rarity] || ''} ${rarityKo(result.rarity)} 패치`;
  const bx = x + Math.floor((W - vlen(banner)) / 2);
  if (result.rarity === 'LEGENDARY' || result.rarity === 'EPIC') {
    rainbowText(screen, bx, y + 1, banner, reveal.shimmer || 0, { light: 0.66 });
  } else {
    screen.textCenter(y + 1, banner, rc, PAL.bgPanel, x, W);
  }
  if (result.shiny) screen.textCenter(y + 2, '✦ 샤이니 개체 ✦', PAL.shiny, PAL.bgPanel, x, W);

  // sprite
  const sp = SPRITE_DIMS(result.speciesId);
  const sx = x + Math.floor((W - sp.w) / 2);
  const sy = y + 3;
  if (reveal.sprite) drawCreature(screen, sx, sy, result.speciesId, { shiny: result.shiny });

  // name + class (fixed rows so tall sprites can't overflow the card)
  const ny = y + 11;
  screen.textCenter(ny, inst.name, PAL.white, PAL.bgPanel, x, W);
  screen.textCenter(ny + 1, `${classKo(inst.classTag)}  ·  Lv.${inst.level}`, classColor(inst.classTag), PAL.bgPanel, x, W);

  // IV / genome readout
  const gy = y + 14;
  screen.text(x + 3, gy - 1, '게놈 (IV)', PAL.inkDim, PAL.bgPanel);
  const barX = x + 9, barW = 18;
  for (let i = 0; i < STATS.length; i++) {
    const [k, lbl] = STATS[i];
    const ry = gy + i;
    screen.text(x + 3, ry, lbl, PAL.inkDim, PAL.bgPanel);
    const shown = i < (reveal.ivShown || 0);
    const frac = shown ? inst.iv[k] / CONFIG.iv.max : 0;
    const cols = gradientColors(barW, [scaleColor(rc, 0.5), rc, PAL.white]);
    const filled = Math.round(barW * frac);
    for (let b = 0; b < barW; b++) {
      if (b < filled) screen.put(barX + b, ry, '▰', cols[b], PAL.bgPanel);
      else screen.put(barX + b, ry, '▱', PAL.inkFaint, PAL.bgPanel);
    }
    screen.text(barX + barW + 1, ry, shown ? String(inst.iv[k]).padStart(2) + '/31' : '  ?  ', shown ? PAL.ink : PAL.inkFaint, PAL.bgPanel);
  }
  // integrity verdict
  const iy = gy + STATS.length;
  if (reveal.integrity) {
    const v = genomeVerdict(inst.genome);
    screen.text(x + 3, iy, '무결성', PAL.inkDim, PAL.bgPanel);
    genomeBar(screen, barX, iy, barW, inst.genome, { bg: PAL.bgPanel });
    screen.text(barX + barW + 1, iy, `${inst.genome}%`, toneColor(v.tone), PAL.bgPanel);
    screen.textCenter(iy + 1, `« ${verdictKo(v.label)} »`, toneColor(v.tone), PAL.bgPanel, x, W);
  }
  if (reveal.prompt) screen.textCenter(y + H - 2, ' 리포지토리에 합류 — [Enter] ', PAL.accent, PAL.bgPanel, x, W);
}

function SPRITE_DIMS(id) {
  const s = SPRITES[id];
  if (!s) return { w: 0, h: 0 };
  let w = 0; for (const r of s.px) w = Math.max(w, r.length);
  return { w, h: Math.ceil(s.px.length / 2) };
}

// ---- full reveal sequence ----
async function fullReveal(ctx, result) {
  const { screen, input } = ctx;
  const { cx, cy } = center(screen);
  const rc = rarityColor(result.rarity);
  const targetRank = RANK[result.rarity];
  input.drain();
  const skip = () => keyPressed(input);

  // PHASE 1 — charge
  for (let i = 0; i < 12 && !skip(); i++) {
    screen.clear(PAL.bgDeep);
    const b = 0.4 + 0.6 * Math.abs(Math.sin(i * 0.55));
    screen.put(cx, cy, i % 2 ? '*' : '_', scaleColor(PAL.white, b));
    // inward sparks
    for (let s = 0; s < 10; s++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 6 + Math.random() * 10 * (1 - i / 12);
      const px = cx + Math.round(Math.cos(ang) * rad);
      const py = cy + Math.round(Math.sin(ang) * rad / 2);
      screen.put(px, py, '.', scaleColor(PAL.white, 0.5));
    }
    screen.textCenter(cy + 4, '의존성 해석 중...', PAL.inkDim);
    screen.flush();
    await sleep(70);
  }

  // PHASE 2 — escalating beams through tiers (with a fakeout)
  if (!skip()) {
    const climbTo = Math.min(targetRank + (targetRank < 4 ? 1 : 0), 4); // tease one tier higher
    for (let t = 1; t <= climbTo && !skip(); t++) {
      const col = rarityColor(TIER_ORDER[t - 1]);
      for (let g = 0; g < 3 && !skip(); g++) {
        screen.clear(PAL.bgDeep);
        beams(screen, cx, cy, col, 8 + g * 4 + t, g % 2 ? '+' : '*');
        screen.put(cx, cy, '◆', PAL.white);
        screen.textCenter(cy + 5, t > targetRank ? '!!' : '등급 추첨 중...', t > targetRank ? PAL.gold : PAL.inkDim);
        screen.flush();
        await sleep(t > targetRank ? 120 : 90);
      }
    }
    // FAKEOUT settle: if we teased higher, collapse back down to the true color
    if (climbTo > targetRank && !skip()) {
      for (let s = 0; s <= 6 && !skip(); s++) {
        const col = lerpColor(rarityColor(TIER_ORDER[climbTo - 1]), rc, s / 6);
        screen.clear(PAL.bgDeep);
        beams(screen, cx, cy, scaleColor(col, 0.8 - s * 0.06), 14 - s, '·');
        screen.put(cx, cy, '◆', col);
        screen.textCenter(cy + 5, s < 3 ? '어… 잠깐—' : '', PAL.inkDim);
        screen.flush();
        await sleep(70);
      }
    }
  }

  // PHASE 3 — flare burst
  if (!skip()) {
    await flash(screen, () => { screen.clear(PAL.bgDeep); beams(screen, cx, cy, rc, 16, '*'); screen.put(cx, cy, '✦', PAL.white); }, { color: rc, times: 2, on: 55, off: 60 });
  }

  // PHASE 4 — shiny check
  if (!skip()) {
    const base = () => { screen.clear(PAL.bgDeep); };
    if (result.shiny) {
      await sparkle(screen, base, { x: cx - 12, y: cy - 4, w: 24, h: 8 }, { colors: [PAL.shiny, PAL.white, [180, 255, 245]], frames: 10, density: 0.18, delay: 50 });
      screen.clear(PAL.bgDeep);
      screen.textCenter(cy, '✦ ✧  샤이니 개체  ✧ ✦', PAL.shiny);
      screen.flush(); await sleep(700);
    } else {
      await sparkle(screen, base, { x: cx - 10, y: cy - 3, w: 20, h: 6 }, { colors: [PAL.shiny], frames: 4, density: 0.08, delay: 45 });
    }
  }

  // PHASE 5 — materialize + card
  const reveal = { sprite: false, ivShown: 0, integrity: false, prompt: false, shimmer: 0 };
  const drawBase = () => drawCard(screen, result, reveal);
  if (!skip()) {
    const sp = SPRITE_DIMS(result.speciesId);
    const W = 48, x = Math.floor((screen.w - W) / 2), y = Math.floor((screen.h - 22) / 2);
    const sx = x + Math.floor((W - sp.w) / 2), sy = y + 3;
    reveal.sprite = false;
    await materializeCreature(screen, sx, sy, result.speciesId, { shiny: result.shiny, bg: PAL.bgPanel }, 7, 34, drawBase);
  }
  reveal.sprite = true;

  // PHASE 6 — genome readout (bars tick up)
  for (let i = 1; i <= STATS.length; i++) {
    reveal.ivShown = i;
    drawBase(); screen.flush();
    await sleep(skip() ? 30 : 170);
  }
  reveal.integrity = true;
  drawBase(); screen.flush();
  await sleep(skip() ? 40 : 420);

  reveal.prompt = true;
  // gentle shimmer loop until confirm
  drawBase(); screen.flush();
  input.drain();
  await waitConfirm(input);
}

// ---- compressed reveal (commons / ten-pull) ----
async function quickReveal(ctx, result, opts = {}) {
  const { screen, input } = ctx;
  const { cx, cy } = center(screen);
  const rc = rarityColor(result.rarity);
  input.drain();
  // tiny flash + pop
  screen.clear(PAL.bgDeep);
  beams(screen, cx, cy, rc, 8, '*');
  screen.flush(); await sleep(opts.fast ? 90 : 150);
  await flash(screen, () => { screen.clear(PAL.bgDeep); }, { color: rc, times: 1, on: 50, off: 30 });
  const reveal = { sprite: true, ivShown: 4, integrity: true, prompt: !opts.fast, shimmer: 0 };
  drawCard(screen, result, reveal);
  screen.flush();
  if (opts.fast) { await sleep(620); if (keyPressed(input)) input.drain(); }
  else { input.drain(); await waitConfirm(input); }
}

export async function reveal(ctx, result, opts = {}) {
  const full = RANK[result.rarity] >= 2 && !opts.fast && !ctx.state.settings.fastReveal;
  if (full) await fullReveal(ctx, result);
  else await quickReveal(ctx, result, opts);
}

// ---- the CRATE terminal UI ----
export async function openCrate(ctx, drawHubBase) {
  const { screen, input, state } = ctx;
  for (;;) {
    const g = CONFIG.gacha;
    const canSingle = state.tokens >= g.costSingle;
    const canTen = state.tokens >= g.costTen;
    const items = [
      { label: `단챔     (-${g.costSingle} ◈)`, disabled: !canSingle, color: canSingle ? PAL.ink : PAL.inkFaint },
      { label: `10연챔   (-${g.costTen} ◈)   [희귀+ 1개 확정]`, disabled: !canTen, color: canTen ? PAL.gold : PAL.inkFaint },
      { label: '나가기', color: PAL.inkDim },
    ];
    const drawBase = () => {
      clearCrate(screen, state);
    };
    const pick2 = await menu(screen, input, drawBase, items, { x: 6, y: 11, width: 60, allowCancel: true, bg: [14, 16, 24] });
    if (pick2 < 0 || pick2 === 2) return;

    if (pick2 === 0) {
      state.tokens -= g.costSingle;
      const r = pull(state);
      await reveal(ctx, r);
      addCreature(state, r.inst);
    } else if (pick2 === 1) {
      state.tokens -= g.costTen;
      // guarantee at least one RARE+: track and if none, upgrade the last
      const results = [];
      for (let i = 0; i < 10; i++) results.push(pull(state));
      if (!results.some((r) => RANK[r.rarity] >= 2)) {
        // force-upgrade a random slot to RARE
        const slot = randInt(0, 9);
        const sp = pick(GACHA_BY_RARITY.RARE);
        results[slot] = { rarity: 'RARE', speciesId: sp.id, shiny: chance(CONFIG.shinyOdds), inst: makeInstance(sp.id, randInt(8, 14)) };
      }
      // rapid compressed reveals
      for (const r of results) { await reveal(ctx, r, { fast: true }); }
      // full reveal the single best
      const best = results.reduce((a, b) => (RANK[b.rarity] > RANK[a.rarity] ? b : a));
      if (RANK[best.rarity] >= 2) { screen.clear(PAL.bgDeep); screen.textCenter(Math.floor(screen.h / 2), '이번 판 최고는...', PAL.inkDim); screen.flush(); await sleep(500); await fullReveal(ctx, best); }
      for (const r of results) addCreature(state, r.inst);
      await summary(ctx, results);
    }
  }
}

function clearCrate(screen, state) {
  screen.clear([10, 12, 18]);
  panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.gold, bg: [14, 16, 24], title: '크레이트 // 가챠.exe', titleFg: PAL.gold });
  screen.textCenter(3, '의존성 뽑기에 운을 걸어보자. 부디 게놈 무결성이 높길.', PAL.inkDim, [14, 16, 24]);
  screen.text(6, 6, `크레딧: ${state.tokens} ◈`, PAL.gold, [14, 16, 24]);
  screen.text(26, 6, `천장 → 희귀+까지 ${Math.max(0, CONFIG.gacha.softRareEvery - state.pity.sinceRare)} · 전설까지 ${Math.max(0, CONFIG.gacha.hardLegendaryAt - state.pity.sinceLegendary)}`, PAL.accent, [14, 16, 24]);
  const o = CONFIG.gacha.odds;
  screen.text(6, 8, `확률:`, PAL.inkDim, [14, 16, 24]);
  let ox = 13;
  for (const k of TIER_ORDER) { const t = `${rarityKo(k)} ${(o[k] * 100).toFixed(0)}%`; screen.text(ox, 8, t, rarityColor(k), [14, 16, 24]); ox += vlen(t) + 3; }
}

async function summary(ctx, results) {
  const { screen, input } = ctx;
  screen.clear([10, 12, 18]);
  panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.gold, bg: [14, 16, 24], title: '10연챔 결과', titleFg: PAL.gold });
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const col = i % 2, row = Math.floor(i / 2);
    const x = 8 + col * 34, y = 4 + row * 3;
    const rc = rarityColor(r.rarity);
    panel(screen, x, y, 30, 3, { fg: rc, bg: [18, 20, 30] });
    screen.text(x + 2, y + 1, `${RARITY_GLYPH[r.rarity]} ${r.inst.name}${r.shiny ? ' ✦' : ''}`, r.shiny ? PAL.shiny : rc, [18, 20, 30]);
    screen.text(x + 24, y + 1, `${r.inst.genome}%`, toneColor(genomeVerdict(r.inst.genome).tone), [18, 20, 30]);
  }
  screen.textCenter(screen.h - 3, '[Enter] 계속', PAL.accent, [14, 16, 24]);
  screen.flush();
  input.drain();
  await waitConfirm(input);
}
