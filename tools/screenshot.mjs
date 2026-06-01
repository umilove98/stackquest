// screenshot.mjs — dev tool. Runs the REAL game flows with a never-resolving
// input so each draws its scene then pauses on the first keypress; then it
// rasterizes the Screen cell buffer to a PNG. Sprites/box-lines/bars render
// faithfully; text renders as colored marker blocks (legibility isn't the goal —
// layout, color and sprite composition are). Run: node tools/screenshot.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.js';
import { Screen } from '../src/render.js';
import { newGame, addCreature } from '../src/state.js';
import { makeInstance } from '../src/systems/creatureInstance.js';
import { reveal } from '../src/systems/gacha.js';
import { runBattle } from '../src/systems/battle.js';
import { openRepo } from '../src/systems/collection.js';
import { runOverworld } from '../src/systems/overworld.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CW = 8, CH = 14;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function neverInput() {
  return { queue: [], start() {}, stop() {}, on() {}, drain() {}, next() { return new Promise(() => {}); } };
}

const HBOX = new Set('─═━'.split(''));
const VBOX = new Set('│║┃'.split(''));
const CORNER = new Set('┌┐└┘╔╗╚╝╭╮╰╯┏┓┗┛'.split(''));

function rasterize(screen) {
  const W = screen.w * CW, H = screen.h * CH;
  const buf = Buffer.alloc(W * H * 3);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; };
  const fillRect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c); };
  const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  for (let cy = 0; cy < screen.h; cy++) {
    for (let cx = 0; cx < screen.w; cx++) {
      const cell = screen.buf[cy * screen.w + cx];
      const bg = cell.bg || [12, 14, 20];
      const fg = cell.fg || [200, 206, 220];
      const px = cx * CW, py = cy * CH;
      fillRect(px, py, px + CW, py + CH, bg);
      const ch = cell.ch;
      if (!ch || ch === ' ') continue;
      if (ch === '█' || ch === '▰') fillRect(px, py, px + CW, py + CH, fg);
      else if (ch === '▀') fillRect(px, py, px + CW, py + CH / 2, fg);
      else if (ch === '▄') fillRect(px, py + CH / 2, px + CW, py + CH, fg);
      else if (ch === '▌') fillRect(px, py, px + CW / 2, py + CH, fg);
      else if (ch === '▐') fillRect(px + CW / 2, py, px + CW, py + CH, fg);
      else if (ch === '░') fillRect(px, py, px + CW, py + CH, mix(bg, fg, 0.25));
      else if (ch === '▒') fillRect(px, py, px + CW, py + CH, mix(bg, fg, 0.5));
      else if (ch === '▓') fillRect(px, py, px + CW, py + CH, mix(bg, fg, 0.72));
      else if (ch === '▱') fillRect(px + 1, py + CH / 2 - 1, px + CW - 1, py + CH / 2 + 1, mix(bg, fg, 0.4));
      else if (HBOX.has(ch)) fillRect(px, py + CH / 2 - 1, px + CW, py + CH / 2 + 1, fg);
      else if (ch === '▁') fillRect(px, py + CH - 2, px + CW, py + CH, fg);
      else if (VBOX.has(ch)) fillRect(px + CW / 2 - 1, py, px + CW / 2 + 1, py + CH, fg);
      else if (CORNER.has(ch)) { fillRect(px, py + CH / 2 - 1, px + CW, py + CH / 2 + 1, fg); fillRect(px + CW / 2 - 1, py, px + CW / 2 + 1, py + CH, fg); }
      else if (ch === '·') fillRect(px + CW / 2 - 1, py + CH / 2 - 1, px + CW / 2 + 1, py + CH / 2 + 1, mix(bg, fg, 0.7));
      else if (ch === '≈' || ch === '~') { fillRect(px + 1, py + CH / 2 - 1, px + 3, py + CH / 2 + 1, fg); fillRect(px + 4, py + CH / 2, px + CW - 1, py + CH / 2 + 2, fg); }
      else fillRect(px + 2, py + 3, px + CW - 2, py + CH - 3, fg); // glyph/text marker
    }
  }
  return { buf, W, H };
}

async function capture(label, run, delay) {
  const screen = new Screen(80, 24);
  screen.flush = () => {}; // capture from buffer; don't spew ANSI to stdout
  const input = neverInput();
  const state = newGame();
  addCreature(state, makeInstance('COPILOT', 12, { iv: { hp: 28, atk: 24, def: 22, spd: 20 } }));
  addCreature(state, makeInstance('GPT35', 11, { iv: { hp: 14, atk: 26, def: 12, spd: 30 } }));
  addCreature(state, makeInstance('GREP', 9));
  const ctx = { screen, input, state };
  run(ctx).catch((e) => process.stderr.write(`  [${label}] flow error before pause: ${e && e.stack ? e.stack : e}\n`));
  await sleep(delay);
  process.stderr.write(`  captured: ${label}\n`);
  return rasterize(screen);
}

const shots = [];
process.env.SQ_FAST = '1';
shots.push(['overworld', await capture('overworld', (ctx) => runOverworld(ctx), 500)]);
shots.push(['battle', await capture('battle', (ctx) => runBattle(ctx, makeInstance('STABLE_DIFF', 10), {}), 900)]);
shots.push(['gacha', await capture('gacha', (ctx) => reveal(ctx, { rarity: 'LEGENDARY', speciesId: 'CLAUDE_OPUS', shiny: true, inst: makeInstance('CLAUDE_OPUS', 12, { shiny: true }) }), 2600)]);
shots.push(['repo', await capture('repo', (ctx) => openRepo(ctx), 500)]);

// stack vertically with gaps
const gap = 12;
const W = shots[0][1].W;
const H = shots.reduce((a, s) => a + s[1].H + gap, gap);
const out = Buffer.alloc(W * H * 3);
for (let i = 0; i < out.length; i += 3) { out[i] = 8; out[i + 1] = 9; out[i + 2] = 14; }
let oy = gap;
for (const [, s] of shots) {
  for (let y = 0; y < s.H; y++) s.buf.copy(out, ((oy + y) * W) * 3, y * s.W * 3, y * s.W * 3 + s.W * 3);
  oy += s.H + gap;
}
fs.writeFileSync(path.join(ROOT, 'shots.png'), encodePNG(W, H, out));
process.stderr.write(`\nwrote shots.png (${W}x${H}) — order: ${shots.map((s) => s[0]).join(', ')}\n`);
process.exit(0);
