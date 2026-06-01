// collection.js — the REPO: browse caught creatures (party + box), inspect full
// stats/IVs/genome/moves with the sprite, and reorganize your team.

import { PAL, rarityColor, classColor, gradientColors, scaleColor } from '../ansi.js';
import { CONFIG, genomeVerdict, refundValue, recycleOdds } from '../data/config.js';
import { moveByName, GACHA_BY_RARITY } from '../data/creatures.js';
import { rarityKo, verdictKo, CLASS_KO, EFFECT_KO } from '../data/i18n.js';
import { isFainted, enhanceInstance, evolveInstance, evolveInfo, plusTag, makeInstance } from './creatureInstance.js';
import { PARTY_MAX, markCaught, addCreature } from '../state.js';
import { pick, weightedPick, randInt } from './rng.js';
import { reveal } from './gacha.js';
import {
  panel, menu, drawCreature, hpBar, genomeBar, rarityTag, RARITY_GLYPH, toneColor, say, confirm, waitConfirm,
} from '../ui.js';

const STATS = [['hp', '체력'], ['atk', '공격'], ['def', '방어'], ['spd', '속도']];
const BG = [12, 14, 20];

function entries(state) {
  const list = [];
  state.party.forEach((c) => list.push({ c, loc: 'party' }));
  state.box.forEach((c) => list.push({ c, loc: 'box' }));
  return list;
}

function drawListBase(screen, state) {
  screen.clear(BG);
  panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.accent, bg: BG, title: '리포지토리 // git stash', titleFg: PAL.accent });
  screen.text(4, 2, `파티 ${state.party.length}/${PARTY_MAX}   ·   보관함 ${state.box.length}`, PAL.inkDim, BG);
  // column headers (align with listItemDraw offsets; list is drawn at x=4)
  screen.text(4 + 7, 3, '이름', PAL.inkFaint, BG);
  screen.text(4 + 25, 3, 'Lv', PAL.inkFaint, BG);
  screen.text(4 + 32, 3, '등급', PAL.inkFaint, BG);
  screen.text(4 + 44, 3, '무결성', PAL.inkFaint, BG);
  screen.text(4 + 51, 3, '클래스', PAL.inkFaint, BG);
  screen.text(4, screen.h - 3, '[↑↓] 선택  ·  [Enter] 상세  ·  [Esc] 나가기', PAL.inkFaint, BG);
}

function listItemDraw(screen, it, sx, sy, selected) {
  if (it.action) {
    screen.text(sx, sy, selected ? '▶' : ' ', PAL.accent, BG);
    screen.text(sx + 2, sy, `⚡ ${it.label}`, selected ? PAL.white : PAL.gold, BG);
    return;
  }
  const c = it.c;
  const rc = rarityColor(c.rarity);
  const tag = it.loc === 'party' ? '[파]' : '[보]';
  screen.text(sx, sy, selected ? '▶' : ' ', PAL.accent, BG);
  screen.text(sx + 2, sy, tag, it.loc === 'party' ? PAL.good : PAL.inkDim, BG);
  const nm = c.name + (plusTag(c) ? ' ' + plusTag(c) : '') + (c.shiny ? ' ✦' : '');
  screen.text(sx + 7, sy, nm, isFainted(c) ? PAL.bad : (c.shiny ? PAL.shiny : (selected ? PAL.white : PAL.ink)), BG);
  screen.text(sx + 25, sy, `Lv.${c.level}`.padStart(5), PAL.inkDim, BG);
  screen.text(sx + 32, sy, `${RARITY_GLYPH[c.rarity]} ${rarityKo(c.rarity)}`, rc, BG);
  const v = genomeVerdict(c.genome);
  screen.text(sx + 44, sy, `${c.genome}%`.padStart(4), toneColor(v.tone), BG);
  screen.text(sx + 51, sy, CLASS_KO[c.classTag] || c.classTag, classColor(c.classTag), BG);
}

function drawDetail(screen, c) {
  screen.clear(BG);
  panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: rarityColor(c.rarity), bg: BG, title: c.name + (c.shiny ? '  ✦ 샤이니' : ''), titleFg: c.shiny ? PAL.shiny : rarityColor(c.rarity) });
  // sprite
  drawCreature(screen, 6, 4, c.id, { shiny: c.shiny, bg: BG });
  // identity
  const ix = 26;
  rarityTag(screen, ix, 4, c.rarity, { bg: BG });
  screen.text(ix, 5, CLASS_KO[c.classTag] || c.classTag, classColor(c.classTag), BG);
  screen.text(ix + 12, 5, `Lv.${c.level}`, PAL.inkDim, BG);
  if ((c.plus || 0) > 0) screen.text(ix + 19, 5, `${plusTag(c)} (+${Math.round(CONFIG.fusion.statBonus * c.plus * 100)}%)`, PAL.gold, BG);
  screen.text(ix, 6, 'HP', PAL.inkDim, BG);
  hpBar(screen, ix + 4, 6, 18, c.hp, c.maxHp, { bg: BG });
  screen.text(ix + 24, 6, `${Math.max(0, c.hp)}/${c.maxHp}`, PAL.inkDim, BG);

  // stat / IV bars
  const gy = 8, barX = ix + 6, barW = 16;
  screen.text(ix, gy - 1, '스탯 & 게놈 (IV/31)', PAL.inkDim, BG);
  const cols = gradientColors(barW, [scaleColor(rarityColor(c.rarity), 0.5), rarityColor(c.rarity), PAL.white]);
  for (let i = 0; i < STATS.length; i++) {
    const [k, lbl] = STATS[i];
    const y = gy + i;
    const val = k === 'hp' ? c.maxHp : c[k];
    screen.text(ix, y, lbl, PAL.inkDim, BG);
    const frac = c.iv[k] / CONFIG.iv.max;
    const filled = Math.round(barW * frac);
    for (let b = 0; b < barW; b++) screen.put(barX + b, y, b < filled ? '▰' : '▱', b < filled ? cols[b] : PAL.inkFaint, BG);
    screen.text(barX + barW + 1, y, `${String(c.iv[k]).padStart(2)}/31`, PAL.ink, BG);
    screen.text(barX + barW + 8, y, `(${val})`, PAL.inkDim, BG);
  }
  const iy = gy + STATS.length + 1;
  const v = genomeVerdict(c.genome);
  screen.text(ix, iy, '무결성', PAL.inkDim, BG);
  genomeBar(screen, barX, iy, barW, c.genome, { bg: BG });
  screen.text(barX + barW + 1, iy, `${c.genome}% « ${verdictKo(v.label)} »`, toneColor(v.tone), BG);

  // moves
  const my = 16;
  screen.text(6, my - 1, '기술', PAL.inkDim, BG);
  c.moves.forEach((mn, i) => {
    const m = moveByName(mn);
    const col = i % 2, row = Math.floor(i / 2);
    const x = 6 + col * 36, y = my + row;
    screen.text(x, y, `• ${m.nameKo}`, classColor(m.classTag), BG);
    screen.text(x + 16, y, `${m.power ? '위력 ' + m.power : '상태'} · 명중 ${m.acc}${m.effect ? ' · ' + (EFFECT_KO[m.effect] || m.effect) : ''}`, PAL.inkDim, BG);
  });
}

export async function openRepo(ctx) {
  const { screen, input, state } = ctx;
  if (state.party.length + state.box.length === 0) {
    await say(screen, input, () => { screen.clear(BG); panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.accent, bg: BG, title: '리포지토리', titleFg: PAL.accent }); }, ['리포지토리가 비었다. 풀숲에서 버그를 좀 잡아오자!'], { speaker: '리포지토리' });
    return;
  }
  let sel = 0;
  for (;;) {
    const list = entries(state);
    // action rows first; creature rows follow (offset by the action-row count)
    const actionRows = [
      { action: 'bulk', label: '일괄 방출 (여러 개 선택)' },
      { action: 'recycle', label: `재활용 (${CONFIG.recycle.inputs}마리 → 뽑기 1)` },
    ];
    const items = [...actionRows, ...list.map((e) => ({ ...e, label: e.c.name }))];
    if (sel >= items.length) sel = items.length - 1;
    const idx = await menu(screen, input, () => drawListBase(screen, state), items, {
      x: 4, y: 4, width: screen.w - 10, rowGap: 1, startIndex: sel,
      maxVisible: screen.h - 8, allowCancel: true, bg: BG, drawItem: listItemDraw,
    });
    if (idx < 0) return;
    sel = idx;
    if (items[idx].action === 'bulk') { await bulkRelease(ctx); sel = 0; continue; }
    if (items[idx].action === 'recycle') { await recycle(ctx); sel = 0; continue; }
    await detailActions(ctx, list[idx - actionRows.length]);
  }
}

// multi-select batch release. space toggles, tab toggles all, enter releases.
async function bulkRelease(ctx) {
  const { screen, input, state } = ctx;
  const selected = new Set(); // creature object refs (stable across rebuilds)
  let cursor = 0, top = 0;
  input.drain();

  const draw = () => {
    const list = entries(state);
    const rows = screen.h - 8;
    if (cursor >= list.length) cursor = Math.max(0, list.length - 1);
    if (cursor < top) top = cursor;
    if (cursor >= top + rows) top = cursor - rows + 1;
    const total = [...selected].reduce((a, c) => a + refundValue(c), 0);

    screen.clear(BG);
    panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.bad, bg: BG, title: '일괄 방출 // batch rm', titleFg: PAL.bad });
    screen.text(4, 2, `선택 ${selected.size}마리  ·  환급 +${total}◈`, selected.size ? PAL.gold : PAL.inkDim, BG);
    // headers
    screen.text(4 + 4, 3, '이름', PAL.inkFaint, BG);
    screen.text(4 + 30, 3, '등급', PAL.inkFaint, BG);
    screen.text(4 + 40, 3, '클래스', PAL.inkFaint, BG);
    screen.text(4 + 47, 3, '무결성', PAL.inkFaint, BG);
    screen.text(4 + 54, 3, '환급', PAL.inkFaint, BG);

    for (let r = 0; r < rows; r++) {
      const i = top + r;
      if (i >= list.length) break;
      const { c, loc } = list[i];
      const y = 4 + r, sx = 4;
      const isCur = i === cursor, isSel = selected.has(c);
      screen.text(sx, y, isCur ? '▶' : ' ', PAL.accent, BG);
      screen.text(sx + 1, y, isSel ? '[x]' : '[ ]', isSel ? PAL.good : PAL.inkFaint, BG);
      const tag = loc === 'party' ? '[파]' : '[보]';
      screen.text(sx + 5, y, tag, loc === 'party' ? PAL.good : PAL.inkDim, BG);
      const nm = c.name + (c.shiny ? ' ✦' : '');
      screen.text(sx + 9, y, nm, isSel ? PAL.white : (c.shiny ? PAL.shiny : PAL.ink), BG);
      screen.text(sx + 30, y, `${RARITY_GLYPH[c.rarity]} ${rarityKo(c.rarity)}`, rarityColor(c.rarity), BG);
      screen.text(sx + 40, y, CLASS_KO[c.classTag] || c.classTag, classColor(c.classTag), BG);
      const v = genomeVerdict(c.genome);
      screen.text(sx + 47, y, `${c.genome}%`.padStart(4), toneColor(v.tone), BG);
      screen.text(sx + 54, y, `+${refundValue(c)}◈`, PAL.gold, BG);
    }
    screen.text(4, screen.h - 3, '[↑↓] 이동  ·  [Space] 선택  ·  [Tab] 전체  ·  [Enter] 방출  ·  [Esc] 취소', PAL.inkFaint, BG);
    screen.flush();
  };

  for (;;) {
    const list = entries(state);
    if (list.length === 0) return;
    draw();
    const k = await input.next();
    if (k === 'up') cursor = (cursor - 1 + list.length) % list.length;
    else if (k === 'down') cursor = (cursor + 1) % list.length;
    else if (k === 'space') { const c = list[cursor].c; selected.has(c) ? selected.delete(c) : selected.add(c); }
    else if (k === 'tab') { if (selected.size === list.length) selected.clear(); else list.forEach((e) => selected.add(e.c)); }
    else if (k === 'esc') return;
    else if (k === 'enter') {
      if (selected.size === 0) continue;
      if (state.party.every((c) => selected.has(c))) {
        await say(screen, input, draw, ['파티에 최소 1마리는 남겨둬야 한다.'], { speaker: '리포지토리' });
        continue;
      }
      const total = [...selected].reduce((a, c) => a + refundValue(c), 0);
      const yes = await confirm(screen, input, draw, `${selected.size}마리를 /dev/null로 방출할까? (+${total}◈ 환급, 되돌릴 수 없다)`, { default: false });
      if (!yes) continue;
      for (const c of selected) {
        let i = state.box.indexOf(c);
        if (i >= 0) { state.box.splice(i, 1); continue; }
        i = state.party.indexOf(c);
        if (i >= 0) state.party.splice(i, 1);
      }
      state.tokens += total;
      const n = selected.size;
      selected.clear();
      await say(screen, input, draw, [`${n}마리 방출 완료. 스크랩 크레딧 +${total}◈ 획득.`], { speaker: '리포지토리' });
      return;
    }
  }
}

// recycle ("재활용"): consume exactly N creatures for one gacha pull whose odds
// tilt toward higher rarity by the fed material's total value.
async function recycle(ctx) {
  const { screen, input, state } = ctx;
  const N = CONFIG.recycle.inputs;
  if (state.party.length + state.box.length < N) {
    await say(screen, input, () => drawListBase(screen, state), [`재활용하려면 최소 ${N}마리가 필요하다. (현재 ${state.party.length + state.box.length}마리)`], { speaker: '재활용' });
    return;
  }
  const selected = new Set();
  let cursor = 0, top = 0;
  input.drain();

  const oddsLine = () => {
    const w = recycleOdds([...selected].map((c) => c.rarity));
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    const epicPlus = sum ? Math.round(((w.EPIC + w.LEGENDARY) / sum) * 100) : 0;
    return `영웅+ 확률 ≈ ${epicPlus}%`;
  };

  const draw = () => {
    const list = entries(state);
    const rows = screen.h - 8;
    if (cursor >= list.length) cursor = Math.max(0, list.length - 1);
    if (cursor < top) top = cursor;
    if (cursor >= top + rows) top = cursor - rows + 1;

    screen.clear(BG);
    panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.accent, bg: BG, title: '재활용 // recycle bin', titleFg: PAL.accent });
    const ready = selected.size === N;
    screen.text(4, 2, `투입 ${selected.size}/${N}마리  ·  ${selected.size ? oddsLine() : '재료를 고르면 확률이 오른다'}`, ready ? PAL.gold : PAL.inkDim, BG);
    screen.text(4 + 4, 3, '이름', PAL.inkFaint, BG);
    screen.text(4 + 30, 3, '등급', PAL.inkFaint, BG);
    screen.text(4 + 40, 3, '클래스', PAL.inkFaint, BG);
    screen.text(4 + 47, 3, '무결성', PAL.inkFaint, BG);

    for (let r = 0; r < rows; r++) {
      const i = top + r;
      if (i >= list.length) break;
      const { c, loc } = list[i];
      const y = 4 + r, sx = 4;
      const isCur = i === cursor, isSel = selected.has(c);
      screen.text(sx, y, isCur ? '▶' : ' ', PAL.accent, BG);
      screen.text(sx + 1, y, isSel ? '[x]' : '[ ]', isSel ? PAL.good : PAL.inkFaint, BG);
      const tag = loc === 'party' ? '[파]' : '[보]';
      screen.text(sx + 5, y, tag, loc === 'party' ? PAL.good : PAL.inkDim, BG);
      const nm = c.name + (plusTag(c) ? ' ' + plusTag(c) : '') + (c.shiny ? ' ✦' : '');
      screen.text(sx + 9, y, nm, isSel ? PAL.white : (c.shiny ? PAL.shiny : PAL.ink), BG);
      screen.text(sx + 30, y, `${RARITY_GLYPH[c.rarity]} ${rarityKo(c.rarity)}`, rarityColor(c.rarity), BG);
      screen.text(sx + 40, y, CLASS_KO[c.classTag] || c.classTag, classColor(c.classTag), BG);
      const v = genomeVerdict(c.genome);
      screen.text(sx + 47, y, `${c.genome}%`.padStart(4), toneColor(v.tone), BG);
    }
    screen.text(4, screen.h - 3, `[↑↓] 이동  ·  [Space] 선택(${N}마리)  ·  [Enter] 재활용  ·  [Esc] 취소`, PAL.inkFaint, BG);
    screen.flush();
  };

  for (;;) {
    const list = entries(state);
    if (list.length === 0) return;
    draw();
    const k = await input.next();
    if (k === 'up') cursor = (cursor - 1 + list.length) % list.length;
    else if (k === 'down') cursor = (cursor + 1) % list.length;
    else if (k === 'space') {
      const c = list[cursor].c;
      if (selected.has(c)) selected.delete(c);
      else if (selected.size < N) selected.add(c);
    } else if (k === 'esc') return;
    else if (k === 'enter') {
      if (selected.size !== N) { await say(screen, input, draw, [`정확히 ${N}마리를 투입해야 한다. (현재 ${selected.size}마리)`], { speaker: '재활용' }); continue; }
      if (state.party.every((c) => selected.has(c))) { await say(screen, input, draw, ['파티에 최소 1마리는 남겨둬야 한다.'], { speaker: '재활용' }); continue; }
      const yes = await confirm(screen, input, draw, `${N}마리를 녹여 뽑기 1회로 재활용할까? (되돌릴 수 없다)`, { default: false });
      if (!yes) continue;
      // consume the fed creatures
      const fedRarities = [...selected].map((c) => c.rarity);
      for (const c of selected) {
        let i = state.box.indexOf(c);
        if (i >= 0) { state.box.splice(i, 1); continue; }
        i = state.party.indexOf(c);
        if (i >= 0) state.party.splice(i, 1);
      }
      // roll a tilted pull
      const w = recycleOdds(fedRarities);
      const rarity = weightedPick(Object.keys(w), (kk) => w[kk]);
      const sp = pick(GACHA_BY_RARITY[rarity]);
      const inst = makeInstance(sp.id, randInt(8, 14));
      state.stats.pulls += 1;
      await reveal(ctx, { rarity, speciesId: sp.id, shiny: inst.shiny, inst });
      addCreature(state, inst);
      return;
    }
  }
}

async function detailActions(ctx, entry) {
  const { screen, input, state } = ctx;
  const c = entry.c;
  for (;;) {
    const inParty = state.party.includes(c);
    const actions = [];
    if (inParty) {
      actions.push({ id: 'lead', label: '선두로', disabled: state.party[0] === c });
      actions.push({ id: 'tobox', label: '보관함으로', disabled: state.party.length <= 1 });
    } else {
      actions.push({ id: 'toparty', label: '파티에 추가', disabled: state.party.length >= PARTY_MAX });
      actions.push({ id: 'release', label: '방출 (삭제)', color: PAL.bad });
    }
    // 강화 (fusion): consume a same-species duplicate to raise +n
    const mats = materialsFor(state, c);
    const maxed = (c.plus || 0) >= CONFIG.fusion.maxPlus;
    actions.push({
      id: 'enhance', color: PAL.gold,
      label: maxed ? '강화 (최대)' : `강화 +${(c.plus || 0) + 1}`,
      disabled: maxed || mats.length === 0,
      hint: maxed ? `이미 최대 강화 +${CONFIG.fusion.maxPlus}` : (mats.length ? `같은 종 ${mats.length}마리 보유 · 1마리 소모` : '같은 종 중복이 없다'),
    });
    // 진화 (evolution): become the next-gen species
    const evo = evolveInfo(c);
    if (evo) {
      const ready = c.level >= evo.minLevel && state.tokens >= evo.cost;
      actions.push({
        id: 'evolve', color: PAL.epicish || PAL.shiny,
        label: `진화 → ${evo.toName}`,
        disabled: !ready,
        hint: `${RARITY_GLYPH[evo.toRarity]} ${rarityKo(evo.toRarity)} · Lv.${evo.minLevel}+ · ${evo.cost}◈` + (ready ? '' : (c.level < evo.minLevel ? `  (레벨 부족)` : `  (크레딧 부족)`)),
      });
    }
    actions.push({ id: 'back', label: '뒤로' });
    const a = await menu(screen, input, () => drawDetail(screen, c), actions, {
      x: 6, y: screen.h - 6, width: 60, cols: 3, colW: 20, allowCancel: true, bg: BG,
    });
    if (a < 0 || actions[a].id === 'back') return;
    const id = actions[a].id;
    if (id === 'lead') {
      const i = state.party.indexOf(c);
      state.party.splice(i, 1); state.party.unshift(c);
    } else if (id === 'tobox') {
      const i = state.party.indexOf(c);
      state.party.splice(i, 1); state.box.push(c);
      return;
    } else if (id === 'toparty') {
      const i = state.box.indexOf(c);
      state.box.splice(i, 1); state.party.push(c);
      return;
    } else if (id === 'release') {
      const refund = refundValue(c);
      const yes = await confirm(screen, input, () => drawDetail(screen, c), `${c.name}을(를) /dev/null로 방출할까? (+${refund}◈ 환급, 되돌릴 수 없다)`, { default: false });
      if (yes) {
        const i = state.box.indexOf(c); if (i >= 0) state.box.splice(i, 1);
        state.tokens += refund;
        await say(screen, input, () => drawListBase(screen, state), [`${c.name} 방출. 스크랩 크레딧 +${refund}◈ 획득.`], { speaker: '리포지토리' });
        return;
      }
    } else if (id === 'enhance') {
      await enhanceFlow(ctx, c);
    } else if (id === 'evolve') {
      const evo = evolveInfo(c);
      const yes = await confirm(screen, input, () => drawDetail(screen, c), `${c.name}을(를) ${evo.toName}(으)로 진화? (${evo.cost}◈ 소모, 되돌릴 수 없다)`, { default: false });
      if (yes) {
        state.tokens -= evo.cost;
        const before = c.name;
        evolveInstance(c);
        markCaught(state, c.id);
        await say(screen, input, () => drawDetail(screen, c), [`${before}이(가) ${c.name}(으)로 진화했다!`, `세대가 올라가 ${rarityKo(c.rarity)} 등급이 되었다.`], { speaker: '진화' });
      }
    }
  }
}

// same-species duplicates that can feed a fusion (everything but the target itself)
function materialsFor(state, target) {
  return [...state.party, ...state.box].filter((c) => c !== target && c.id === target.id);
}

// pick a duplicate to consume, then +1 the target
async function enhanceFlow(ctx, c) {
  const { screen, input, state } = ctx;
  const mats = materialsFor(state, c);
  if (mats.length === 0 || (c.plus || 0) >= CONFIG.fusion.maxPlus) return;
  const items = mats.map((m) => ({
    m,
    label: `${m.name}${plusTag(m) ? ' ' + plusTag(m) : ''}${m.shiny ? ' ✦' : ''}  Lv.${m.level}  ·  무결성 ${m.genome}%`,
    color: m.shiny ? PAL.shiny : PAL.ink,
  }));
  const mi = await menu(screen, input, () => {
    drawDetail(screen, c);
    screen.text(6, screen.h - 6, `강화 재료 선택 (소모됨) — ${c.name} +${(c.plus || 0)} → +${(c.plus || 0) + 1}`, PAL.gold, BG);
  }, items, { x: 6, y: screen.h - 5, width: 64, allowCancel: true, bg: BG });
  if (mi < 0) return;
  const mat = items[mi].m;
  // consume the material from wherever it lives
  let i = state.box.indexOf(mat); if (i >= 0) state.box.splice(i, 1);
  else { i = state.party.indexOf(mat); if (i >= 0) state.party.splice(i, 1); }
  enhanceInstance(c);
  await say(screen, input, () => drawDetail(screen, c), [`${mat.name}을(를) 흡수해 ${c.name}이(가) +${c.plus}(으)로 강화됐다!`, `전 스탯 +${Math.round(CONFIG.fusion.statBonus * c.plus * 100)}%.`], { speaker: '강화' });
}
