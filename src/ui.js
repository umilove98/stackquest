// ui.js — shared widgets: panels, creature sprites, HP/genome bars, rarity
// tags, typewriter dialogue boxes, and arrow-key menus. Everything draws into a
// Screen and (for interactive bits) reads from an Input.

import { Screen, vlen, charWidth } from './render.js';
import { PAL, rarityColor, classColor, scaleColor, lerpColor } from './ansi.js';
import { sleep } from './fx/anim.js';
import { SPRITES } from './data/sprites.js';
import { genomeVerdict, CONFIG } from './data/config.js';
import { rarityKo, classKo } from './data/i18n.js';

export const RARITY_GLYPH = { COMMON: '·', UNCOMMON: '+', RARE: '◆', EPIC: '★', LEGENDARY: '✦', BOSS: '☠' };
const CONFIRM = new Set(['enter', 'space', 'z']);
const CANCEL = new Set(['esc', 'x', 'back']);

export const toneColor = (tone) => (tone === 'good' ? PAL.good : tone === 'warn' ? PAL.warn : tone === 'bad' ? PAL.bad : PAL.ink);

export function clearStage(screen, bg = PAL.bgDeep) { screen.clear(bg); }

export function panel(screen, x, y, w, h, opts = {}) {
  const { title = null, style = 'round', fg = PAL.inkFaint, bg = PAL.bgPanel, titleFg = PAL.accent } = opts;
  screen.box(x, y, w, h, { style, fg, bg, fill: bg, title, titleFg });
}

// ---- sprites ----
export function creatureCellSize(id) {
  const s = SPRITES[id];
  if (!s) return { w: 0, h: 0 };
  return Screen.pixelSize(s.px);
}

export function drawCreature(screen, x, y, id, opts = {}) {
  const s = SPRITES[id];
  if (!s) return;
  const pal = opts.shiny && s.shiny ? s.shiny : s.pal;
  screen.pixelBlit(x, y, s.px, pal, { bg: opts.bg != null ? opts.bg : null });
}

// fade a sprite up from faint to full (materialize)
export async function materializeCreature(screen, x, y, id, opts = {}, steps = 7, delay = 34, onFrame = null) {
  const s = SPRITES[id];
  if (!s) return;
  const basePal = opts.shiny && s.shiny ? s.shiny : s.pal;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const pal = {};
    for (const key of Object.keys(basePal)) pal[key] = lerpColor(scaleColor(basePal[key], 0.18), basePal[key], t);
    if (onFrame) onFrame();
    screen.pixelBlit(x, y, s.px, pal, { bg: opts.bg != null ? opts.bg : null });
    screen.flush();
    await sleep(delay);
  }
}

// ---- bars ----
export function hpBar(screen, x, y, width, cur, max, opts = {}) {
  const bg = opts.bg != null ? opts.bg : PAL.bgPanel2;
  const f = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  const col = f > 0.5 ? PAL.good : f > 0.22 ? PAL.warn : PAL.bad;
  const filled = Math.ceil(width * f);
  for (let i = 0; i < width; i++) {
    if (i < filled) screen.put(x + i, y, '█', col, bg);
    else screen.put(x + i, y, '─', PAL.inkFaint, bg);
  }
}

export function genomeBar(screen, x, y, width, pct, opts = {}) {
  const bg = opts.bg != null ? opts.bg : PAL.bgPanel;
  const f = Math.max(0, Math.min(1, pct / 100));
  const v = genomeVerdict(pct);
  const col = toneColor(v.tone);
  const filled = Math.round(width * f);
  for (let i = 0; i < width; i++) {
    if (i < filled) screen.put(x + i, y, '▰', col, bg);
    else screen.put(x + i, y, '▱', PAL.inkFaint, bg);
  }
}

export function rarityTag(screen, x, y, rarity, opts = {}) {
  const col = rarityColor(rarity);
  const g = RARITY_GLYPH[rarity] || '·';
  const txt = `${g} ${rarityKo(rarity)}`;
  screen.text(x, y, txt, col, opts.bg != null ? opts.bg : null);
  return vlen(txt);
}

export function classTag(screen, x, y, cls, opts = {}) {
  const col = classColor(cls);
  const txt = classKo(cls);
  screen.text(x, y, txt, col, opts.bg != null ? opts.bg : null);
  return vlen(txt);
}

// ---- text utilities ----
// wrap by display width (Hangul = 2 cols), hard-breaking any over-wide word
export function wrapText(text, width) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '', curW = 0;
  for (const word of words) {
    const ww = vlen(word);
    if (ww > width) {
      if (cur) { lines.push(cur); cur = ''; curW = 0; }
      let chunk = '', cw = 0;
      for (const ch of Array.from(word)) {
        const c = charWidth(ch);
        if (cw + c > width) { lines.push(chunk); chunk = ''; cw = 0; }
        chunk += ch; cw += c;
      }
      cur = chunk; curW = cw;
      continue;
    }
    const add = cur ? 1 + ww : ww;
    if (curW + add <= width) { cur = cur ? cur + ' ' + word : word; curW += add; }
    else { lines.push(cur); cur = word; curW = ww; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// ---- dialogue box (typewriter, page by page) ----
export async function say(screen, input, redrawBase, pages, opts = {}) {
  const list = Array.isArray(pages) ? pages : [pages];
  const boxH = opts.boxH || 6;
  const boxX = opts.boxX != null ? opts.boxX : 2;
  const boxW = opts.boxW != null ? opts.boxW : screen.w - 4;
  const boxY = opts.boxY != null ? opts.boxY : screen.h - boxH - 1;
  const fg = opts.fg || PAL.ink;
  const speaker = opts.speaker || null;
  const cps = opts.cps || 120;
  for (const page of list) {
    if (redrawBase) redrawBase();
    panel(screen, boxX, boxY, boxW, boxH, { title: speaker, fg: PAL.accent, bg: PAL.bgPanel });
    const wrapped = wrapText(page, boxW - 4).slice(0, boxH - 2);
    input.drain();
    let skip = false;
    for (let li = 0; li < wrapped.length; li++) {
      const chars = [...wrapped[li]];
      for (let i = 0; i < chars.length; i++) {
        if (input.queue.length) { input.drain(); skip = true; }
        if (skip) { screen.text(boxX + 2, boxY + 1 + li, wrapped[li], fg, PAL.bgPanel); break; }
        screen.text(boxX + 2, boxY + 1 + li, chars.slice(0, i + 1).join(''), fg, PAL.bgPanel);
        screen.flush();
        if (chars[i] !== ' ') await sleep(1000 / cps);
      }
    }
    screen.flush();
    blinkPrompt(screen, boxX + boxW - 3, boxY + boxH - 2);
    screen.flush();
    await waitConfirm(input);
  }
}

function blinkPrompt(screen, x, y) { screen.put(x, y, '▼', PAL.accent, PAL.bgPanel); }

export async function waitConfirm(input) {
  for (;;) { const k = await input.next(); if (CONFIRM.has(k)) return; }
}
export async function waitKey(input) { return input.next(); }

// ---- menu (grid-capable) ----
// items: [{label, hint?, disabled?, color?}]
// opts: { x, y, width, cols, rowGap, title, footer, startIndex, allowCancel,
//         maxVisible, drawItem(screen,it,sx,sy,selected) }
export async function menu(screen, input, redrawBase, items, opts = {}) {
  const cols = opts.cols || 1;
  const width = opts.width || 24;
  const x = opts.x != null ? opts.x : 2;
  const y = opts.y != null ? opts.y : 2;
  const rowGap = opts.rowGap || 1;
  const colW = opts.colW || Math.floor(width / cols);
  const allowCancel = opts.allowCancel !== false;
  const maxVisible = opts.maxVisible || items.length;
  let idx = opts.startIndex || 0;
  let top = 0;

  const bg = opts.bg != null ? opts.bg : null;
  const draw = () => {
    if (redrawBase) redrawBase();
    if (opts.title) screen.text(x, y - 1, opts.title, PAL.accent, bg);
    const rows = Math.ceil(items.length / cols);
    const visRows = Math.min(maxVisible, rows);
    const selRow = Math.floor(idx / cols);
    if (selRow < top) top = selRow;
    if (selRow >= top + visRows) top = selRow - visRows + 1;
    for (let r = 0; r < visRows; r++) {
      const row = top + r;
      for (let c = 0; c < cols; c++) {
        const i = row * cols + c;
        if (i >= items.length) continue;
        const it = items[i];
        const sx = x + c * colW;
        const sy = y + r * rowGap;
        const selected = i === idx;
        if (opts.drawItem) { opts.drawItem(screen, it, sx, sy, selected); continue; }
        const base = it.disabled ? PAL.inkFaint : (it.color || PAL.ink);
        const fg = selected ? PAL.white : base;
        screen.text(sx, sy, selected ? '▶ ' : '  ', PAL.accent, bg);
        screen.text(sx + 2, sy, it.label, fg, bg);
        if (selected && it.hint) screen.text(x, y + visRows * rowGap + 1, it.hint, PAL.inkDim, bg);
      }
    }
    if (maxVisible < rows) {
      const more = top + visRows < rows;
      const less = top > 0;
      if (less) screen.text(x + colW * cols, y, '▲', PAL.inkDim);
      if (more) screen.text(x + colW * cols, y + visRows * rowGap - 1, '▼', PAL.inkDim);
    }
    screen.flush();
  };

  for (;;) {
    draw();
    const k = await input.next();
    if (k === 'up') idx = (idx - cols + items.length) % items.length;
    else if (k === 'down') idx = (idx + cols) % items.length;
    else if (k === 'left' && cols > 1) idx = (idx - 1 + items.length) % items.length;
    else if (k === 'right' && cols > 1) idx = (idx + 1) % items.length;
    else if (CONFIRM.has(k)) { if (!items[idx].disabled) return idx; }
    else if (CANCEL.has(k) && allowCancel) return -1;
  }
}

export async function confirm(screen, input, redrawBase, question, opts = {}) {
  const boxW = opts.boxW || Math.min(screen.w - 8, Math.max(28, vlen(question) + 8));
  const boxX = Math.floor((screen.w - boxW) / 2);
  const boxY = opts.boxY || Math.floor(screen.h / 2) - 2;
  let yes = opts.default !== false;
  for (;;) {
    if (redrawBase) redrawBase();
    panel(screen, boxX, boxY, boxW, 5, { fg: PAL.accent, bg: PAL.bgPanel });
    screen.textCenter(boxY + 1, question, PAL.ink, PAL.bgPanel, boxX, boxW);
    const yLabel = yes ? '▶ 예' : '  예';
    const nLabel = !yes ? '▶ 아니오' : '  아니오';
    screen.text(boxX + Math.floor(boxW / 2) - 9, boxY + 3, yLabel, yes ? PAL.good : PAL.inkDim, PAL.bgPanel);
    screen.text(boxX + Math.floor(boxW / 2) + 2, boxY + 3, nLabel, !yes ? PAL.bad : PAL.inkDim, PAL.bgPanel);
    screen.flush();
    const k = await input.next();
    if (k === 'left' || k === 'right') yes = !yes;
    else if (CONFIRM.has(k)) return yes;
    else if (CANCEL.has(k)) return false;
  }
}
