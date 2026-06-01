// spritesheet.js — dev tool. Renders every creature sprite (normal + shiny) to
// PNG files so the art can be eyeballed and refined. Also validates sprite data
// (row widths, unknown palette chars). Run: node tools/spritesheet.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePNG } from './png.js';
import { SPRITES, SPRITE_ORDER } from '../src/data/sprites.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MISSING = [255, 0, 255]; // magenta = palette char with no color (bug marker)

function cellsOf(sprite, shiny) {
  const pal = (shiny && sprite.shiny) ? sprite.shiny : sprite.pal;
  const px = sprite.px;
  const h = px.length;
  let w = 0;
  for (const r of px) w = Math.max(w, r.length);
  const cells = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const ch = px[y][x] != null ? px[y][x] : '.';
      if (ch === '.' || ch === ' ') row.push(null);
      else row.push(pal[ch] || MISSING);
    }
    cells.push(row);
  }
  return { w, h, cells };
}

function validate() {
  const warns = [];
  for (const id of SPRITE_ORDER) {
    const s = SPRITES[id];
    if (!s) { warns.push(`${id}: MISSING sprite`); continue; }
    const widths = new Set(s.px.map((r) => r.length));
    if (widths.size > 1) warns.push(`${id}: inconsistent row widths ${[...widths].join(',')}`);
    if (s.px.length % 2 !== 0) warns.push(`${id}: odd pixel height ${s.px.length} (half-blocks pair rows)`);
    const used = new Set();
    for (const r of s.px) for (const ch of r) if (ch !== '.' && ch !== ' ') used.add(ch);
    for (const ch of used) if (!s.pal[ch]) warns.push(`${id}: char '${ch}' not in palette`);
    if (s.shiny) for (const ch of used) if (!s.shiny[ch]) warns.push(`${id}: char '${ch}' not in shiny palette`);
  }
  return warns;
}

function buildSheet(shiny) {
  const ids = SPRITE_ORDER.filter((id) => SPRITES[id]);
  const SCALE = 9;
  const PAD = 12;
  const GAP = 10;
  const COLS = 5;
  let maxW = 0, maxH = 0;
  for (const id of ids) {
    const { w, h } = cellsOf(SPRITES[id], shiny);
    maxW = Math.max(maxW, w); maxH = Math.max(maxH, h);
  }
  const tileW = maxW * SCALE + GAP;
  const tileH = maxH * SCALE + GAP;
  const rows = Math.ceil(ids.length / COLS);
  const W = PAD * 2 + COLS * tileW;
  const H = PAD * 2 + rows * tileH;
  const buf = Buffer.alloc(W * H * 3);

  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 3;
    buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
  };
  // background
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [18, 20, 27]);

  ids.forEach((id, i) => {
    const col = i % COLS, row = (i / COLS) | 0;
    const ox = PAD + col * tileW;
    const oy = PAD + row * tileH;
    const { w, h, cells } = cellsOf(SPRITES[id], shiny);
    // center sprite in tile
    const sx = ox + (((maxW - w) * SCALE) >> 1);
    const sy = oy + (((maxH - h) * SCALE) >> 1);
    // checker backdrop for the tile so transparency is visible
    for (let yy = 0; yy < maxH * SCALE; yy++) {
      for (let xx = 0; xx < maxW * SCALE; xx++) {
        const cx = (xx / SCALE) | 0, cy = (yy / SCALE) | 0;
        const chk = ((cx + cy) & 1) ? [40, 44, 54] : [30, 33, 41];
        set(ox + xx, oy + yy, chk);
      }
    }
    // sprite pixels
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const c = cells[py][px];
        if (!c) continue;
        for (let yy = 0; yy < SCALE; yy++)
          for (let xx = 0; xx < SCALE; xx++)
            set(sx + px * SCALE + xx, sy + py * SCALE + yy, c);
      }
    }
  });

  return { buf, W, H, ids };
}

const warns = validate();
if (warns.length) {
  console.log('--- sprite warnings ---');
  for (const w of warns) console.log('  ! ' + w);
} else {
  console.log('sprites: all valid');
}

for (const shiny of [false, true]) {
  const { buf, W, H, ids } = buildSheet(shiny);
  const png = encodePNG(W, H, buf);
  const out = path.join(ROOT, shiny ? 'preview-shiny.png' : 'preview.png');
  fs.writeFileSync(out, png);
  console.log(`wrote ${out} (${W}x${H}) — ${ids.length} sprites`);
  if (!shiny) {
    console.log('grid order (5 cols):');
    ids.forEach((id, i) => process.stdout.write(`${String(i).padStart(2)}:${id}  ` + ((i % 5 === 4) ? '\n' : '')));
    console.log('');
  }
}
