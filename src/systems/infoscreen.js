// infoscreen.js — overworld INFO menu: class-effectiveness chart (상성표) and a
// full species codex (도감) with base stats, moves, and caught status.

import { PAL, rarityColor, classColor, gradientColors, scaleColor } from '../ansi.js';
import { vlen } from '../render.js';
import { CONFIG, effectiveness } from '../data/config.js';
import { ALL_SPECIES, RARITY_RANK } from '../data/creatures.js';
import { CLASS_KO, EFFECT_KO, rarityKo } from '../data/i18n.js';
import { panel, menu, drawCreature, rarityTag, RARITY_GLYPH, wrapText } from '../ui.js';

const BG = [12, 14, 20];
const STATS = [['hp', '체력'], ['atk', '공격'], ['def', '방어'], ['spd', '속도']];
const MAIN = ['DEV', 'LOGIC', 'MEMORY', 'CONCURRENCY'];

// draw colored text segments left-to-right; returns the next x
function segs(screen, x, y, parts) {
  let cx = x;
  for (const p of parts) { screen.text(cx, y, p.t, p.fg || PAL.ink, BG); cx += vlen(p.t); }
  return cx;
}

function effInfo(cls) {
  const row = CONFIG.effectiveness[cls] || {};
  let strong = null, weak = null;
  for (const k of Object.keys(row)) { if (row[k] > 1) strong = k; else if (row[k] < 1) weak = k; }
  return { strong, weak };
}

function dexBadge(state, sp) {
  if (sp.role === 'boss') return ['보스', PAL.bad];
  if (state.dex.caught[sp.id]) return ['✓ 영입', PAL.good];
  if (state.dex.seen[sp.id]) return ['발견', PAL.warn];
  return ['미발견', PAL.inkFaint];
}

async function waitBack(input, draw) {
  draw(); input.drain();
  for (;;) {
    const k = await input.next();
    if (['esc', 'x', 'back', 'enter', 'space', 'z'].includes(k)) return;
    draw();
  }
}

// ---- 상성표 ----
async function showEffChart(ctx) {
  const { screen, input } = ctx;
  const draw = () => {
    screen.clear(BG);
    panel(screen, 2, 2, screen.w - 4, screen.h - 4, { style: 'double', fg: PAL.accent, bg: BG, title: '클래스 상성', titleFg: PAL.accent });
    screen.textCenter(4, '공격 클래스가 상대 클래스에게 주는 효과', PAL.inkDim, BG, 2, screen.w - 4);
    let y = 6;
    for (const a of MAIN) {
      const { strong, weak } = effInfo(a);
      segs(screen, 8, y, [
        { t: CLASS_KO[a], fg: classColor(a) },
        { t: '  →  ', fg: PAL.inkFaint },
        { t: CLASS_KO[strong], fg: classColor(strong) }, { t: ' 에 강함 ×1.5      ', fg: PAL.good },
        { t: CLASS_KO[weak], fg: classColor(weak) }, { t: ' 에 약함 ×0.75', fg: PAL.bad },
      ]);
      y += 2;
    }
    segs(screen, 8, y + 1, [{ t: CLASS_KO.CORRUPT, fg: classColor('CORRUPT') }, { t: ' (보스) — 상성 없음, 모든 공격 ×1.0', fg: PAL.inkDim }]);
    // grid (rows = my attack class, cols = opponent)
    const gy = y + 4;
    screen.text(8, gy - 1, '상세표  (행 = 내 공격 / 열 = 상대 클래스)', PAL.inkDim, BG);
    const hx = 20;
    for (let j = 0; j < MAIN.length; j++) screen.text(hx + j * 9, gy, CLASS_KO[MAIN[j]], classColor(MAIN[j]), BG);
    for (let i = 0; i < MAIN.length; i++) {
      const ry = gy + 1 + i;
      screen.text(8, ry, CLASS_KO[MAIN[i]], classColor(MAIN[i]), BG);
      for (let j = 0; j < MAIN.length; j++) {
        const m = effectiveness(MAIN[i], MAIN[j]);
        const col = m > 1 ? PAL.good : (m < 1 ? PAL.bad : PAL.inkDim);
        screen.text(hx + j * 9, ry, `×${m}`, col, BG);
      }
    }
    screen.textCenter(screen.h - 3, '[Esc] 돌아가기', PAL.inkFaint, BG, 2, screen.w - 4);
    screen.flush();
  };
  await waitBack(input, draw);
}

// ---- 도감 ----
function sortedSpecies() {
  return [...ALL_SPECIES].sort((a, b) => (RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]) || a.id.localeCompare(b.id));
}

async function speciesDetail(ctx, sp) {
  const { screen, input, state } = ctx;
  const draw = () => {
    screen.clear(BG);
    const rc = rarityColor(sp.rarity);
    panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: rc, bg: BG, title: sp.name, titleFg: rc });
    drawCreature(screen, 5, 3, sp.id, { bg: BG });
    const ix = 26;
    rarityTag(screen, ix, 3, sp.rarity, { bg: BG });
    const [bt, bc] = dexBadge(state, sp); screen.text(ix + 14, 3, bt, bc, BG);
    segs(screen, ix, 5, [{ t: '클래스  ', fg: PAL.inkDim }, { t: CLASS_KO[sp.classTag], fg: classColor(sp.classTag) }]);
    const { strong, weak } = effInfo(sp.classTag);
    if (strong) segs(screen, ix, 6, [{ t: CLASS_KO[strong], fg: classColor(strong) }, { t: ' 에 강함', fg: PAL.good }, { t: '  /  ', fg: PAL.inkFaint }, { t: CLASS_KO[weak], fg: classColor(weak) }, { t: ' 에 약함', fg: PAL.bad }]);
    else screen.text(ix, 6, '상성 없음 (중립)', PAL.inkDim, BG);
    const catchTxt = sp.role === 'boss' ? '영입 불가 (보스)' : (sp.inWild ? `야생 영입난도 ${sp.catchRate}/255` : '가챠 전용 (야생 미출현)');
    screen.text(ix, 7, catchTxt, sp.inWild ? PAL.ink : PAL.warn, BG);
    // base stats
    const gy = 9; const total = sp.base.hp + sp.base.atk + sp.base.def + sp.base.spd;
    screen.text(ix, gy - 1, `기본 스탯  (종합 ${total})`, PAL.inkDim, BG);
    const barX = ix + 6, barW = 18;
    const cols = gradientColors(barW, [scaleColor(rc, 0.5), rc, PAL.white]);
    STATS.forEach(([k, lbl], i) => {
      const v = sp.base[k]; const y = gy + i; const filled = Math.round(barW * Math.min(1, v / 150));
      screen.text(ix, y, lbl, PAL.inkDim, BG);
      for (let b = 0; b < barW; b++) screen.put(barX + b, y, b < filled ? '▰' : '▱', b < filled ? cols[b] : PAL.inkFaint, BG);
      screen.text(barX + barW + 1, y, String(v).padStart(3), PAL.ink, BG);
    });
    // flavor
    const fy = gy + 5;
    wrapText(sp.flavor, screen.w - 10).slice(0, 2).forEach((ln, i) => screen.text(5, fy + i, ln, PAL.inkDim, BG));
    // moves
    const my = fy + 3;
    screen.text(5, my - 1, '기술', PAL.inkDim, BG);
    sp.moves.forEach((m, i) => {
      const y = my + i;
      screen.text(5, y, `• ${m.name}`, classColor(m.classTag), BG);
      screen.text(22, y, `${m.power ? '위력 ' + m.power : '상태'} · 명중 ${m.acc}${m.effect ? ' · ' + (EFFECT_KO[m.effect] || m.effect) : ''}`, PAL.inkDim, BG);
    });
    screen.textCenter(screen.h - 2, '[Esc] 뒤로', PAL.inkFaint, BG, 2, screen.w - 4);
    screen.flush();
  };
  await waitBack(input, draw);
}

async function openDex(ctx) {
  const { screen, input, state } = ctx;
  const list = sortedSpecies();
  const total = list.filter((s) => s.role !== 'boss').length;
  let sel = 0;
  for (;;) {
    const caught = Object.keys(state.dex.caught).length;
    const idx = await menu(screen, input,
      () => {
        screen.clear(BG);
        panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.accent, bg: BG, title: `도감  (${caught}/${total} 영입)`, titleFg: PAL.accent });
        screen.text(4, screen.h - 3, '[↑↓] 선택  ·  [Enter] 상세  ·  [Esc] 뒤로', PAL.inkFaint, BG);
      },
      list.map((s) => ({ sp: s })),
      {
        x: 4, y: 3, width: screen.w - 10, rowGap: 1, startIndex: sel, maxVisible: screen.h - 6, allowCancel: true, bg: BG,
        drawItem: (scr, it, sx, sy, seld) => {
          const s = it.sp; const rc = rarityColor(s.rarity); const [bt, bc] = dexBadge(state, s);
          scr.text(sx, sy, seld ? '▶' : ' ', PAL.accent, BG);
          scr.text(sx + 2, sy, `${RARITY_GLYPH[s.rarity]} ${rarityKo(s.rarity)}`, rc, BG);
          scr.text(sx + 11, sy, s.name, seld ? PAL.white : PAL.ink, BG);
          scr.text(sx + 30, sy, CLASS_KO[s.classTag], classColor(s.classTag), BG);
          scr.text(sx + 40, sy, bt, bc, BG);
        },
      });
    if (idx < 0) return;
    sel = idx;
    await speciesDetail(ctx, list[idx]);
  }
}

// ---- entry ----
export async function openInfo(ctx) {
  const { screen, input } = ctx;
  for (;;) {
    const home = () => {
      screen.clear(BG);
      panel(screen, 2, 2, screen.w - 4, screen.h - 4, { style: 'double', fg: PAL.accent, bg: BG, title: '정보', titleFg: PAL.accent });
      screen.textCenter(5, '무엇을 확인할까?', PAL.ink, BG, 2, screen.w - 4);
    };
    const pick = await menu(screen, input, home, [
      { label: '클래스 상성표', hint: '개발자 / 코드 / 언어 / 비전 상성' },
      { label: '크리처 도감', hint: '전체 도구·모델 스탯·기술' },
      { label: '돌아가기' },
    ], { x: Math.floor(screen.w / 2) - 9, y: 8, width: 24, allowCancel: true, bg: BG });
    if (pick < 0 || pick === 2) return;
    if (pick === 0) await showEffChart(ctx);
    else await openDex(ctx);
  }
}
