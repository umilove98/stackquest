// anim.js — reusable timed effects that operate on a Screen. Each effect draws
// frames and flushes; callers pass a `drawBase` callback that repaints the
// scene between/under the effect so we never leave artifacts.

import { PAL, scaleColor, lerpColor, hsl, gradientColors } from '../ansi.js';
import { charWidth } from '../render.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, process.env.SQ_FAST ? Math.min(ms, 3) : ms));

// reveal a string one glyph at a time
export async function typeLine(screen, x, y, text, opts = {}) {
  const { fg = PAL.ink, bg = null, cps = 90, onChar = null, skip = () => false } = opts;
  const chars = Array.from(text);
  const delay = 1000 / cps;
  for (let i = 0; i < chars.length; i++) {
    screen.put(x + i, y, chars[i], fg, bg);
    screen.flush();
    if (onChar) onChar(chars[i], i);
    if (skip()) {
      // dump the rest instantly
      for (let j = i + 1; j < chars.length; j++) screen.put(x + j, y, chars[j], fg, bg);
      screen.flush();
      return;
    }
    if (chars[i] !== ' ') await sleep(delay);
  }
}

// full-screen color flash, restoring the scene via drawBase between blinks
export async function flash(screen, drawBase, opts = {}) {
  const { color = PAL.white, times = 2, on = 45, off = 55 } = opts;
  for (let t = 0; t < times; t++) {
    screen.tint(color);
    screen.flush();
    await sleep(on);
    drawBase();
    screen.flush();
    await sleep(off);
  }
}

// jitter the whole scene a few frames (impact). drawBase(dx, dy) must honor offset.
export async function shake(screen, drawBase, opts = {}) {
  const { frames = 6, mag = 2, delay = 28 } = opts;
  for (let f = 0; f < frames; f++) {
    const decay = 1 - f / frames;
    const dx = Math.round((Math.random() * 2 - 1) * mag * decay);
    const dy = Math.round((Math.random() * 2 - 1) * Math.max(0, mag - 1) * decay);
    screen.clear(PAL.bgDeep);
    drawBase(dx, dy);
    screen.flush();
    await sleep(delay);
  }
  screen.clear(PAL.bgDeep);
  drawBase(0, 0);
  screen.flush();
}

// twinkle random sparkles over a region for `frames` frames
export async function sparkle(screen, drawBase, region, opts = {}) {
  const {
    colors = [PAL.white, [255, 255, 190], [190, 220, 255]],
    frames = 12, density = 0.10, delay = 55,
    chars = ['*', '+', '·', '✦', '.', '✧'],
  } = opts;
  const { x, y, w, h } = region;
  for (let f = 0; f < frames; f++) {
    drawBase();
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (Math.random() < density) {
          const ch = chars[(Math.random() * chars.length) | 0];
          const col = colors[(Math.random() * colors.length) | 0];
          screen.put(xx, yy, ch, col, null);
        }
      }
    }
    screen.flush();
    await sleep(delay);
  }
  drawBase();
  screen.flush();
}

// ramp a line of text from dark to full color (fade-in)
export async function fadeInText(screen, x, y, text, color = PAL.ink, opts = {}) {
  const { steps = 8, delay = 28, bg = null } = opts;
  for (let s = 0; s <= steps; s++) {
    const c = scaleColor(color, 0.12 + 0.88 * (s / steps));
    screen.text(x, y, text, c, bg);
    screen.flush();
    await sleep(delay);
  }
}

export async function fadeOutText(screen, x, y, text, color = PAL.ink, opts = {}) {
  const { steps = 8, delay = 24, bg = null } = opts;
  for (let s = steps; s >= 0; s--) {
    const c = scaleColor(color, 0.06 + 0.94 * (s / steps));
    screen.text(x, y, text, c, bg);
    screen.flush();
    await sleep(delay);
  }
}

// horizontal wipe of a solid color across the screen (scene transition)
export async function wipeAcross(screen, opts = {}) {
  const { color = PAL.black, delay = 6, step = 3, reverse = false } = opts;
  const W = screen.w, H = screen.h;
  const cols = [];
  for (let x = 0; x < W; x++) cols.push(reverse ? W - 1 - x : x);
  for (let i = 0; i < W; i += step) {
    for (let s = 0; s < step && i + s < W; s++) {
      const x = cols[i + s];
      for (let y = 0; y < H; y++) screen.put(x, y, ' ', null, color);
    }
    screen.flush();
    await sleep(delay);
  }
}

// diamond/checker dissolve into a solid color (classic JRPG battle-start)
export async function dissolveTo(screen, opts = {}) {
  const { color = PAL.black, passes = 4, delay = 30 } = opts;
  const W = screen.w, H = screen.h;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (((x + y * 2 + p) % (passes + 1)) === 0 || (((x * 3 + y) % (passes * 2)) === p)) {
          screen.put(x, y, ' ', null, color);
        }
      }
    }
    screen.flush();
    await sleep(delay);
  }
  screen.tint(color);
  screen.flush();
  await sleep(delay);
}

// a horizontal bar that smoothly animates from `from` to `to` fraction.
// drawBar(frac) is responsible for painting the bar at a given fill fraction.
export async function tween(from, to, opts, drawFrac) {
  const { steps = 16, delay = 18, ease = (t) => t } = opts || {};
  for (let s = 0; s <= steps; s++) {
    const t = ease(s / steps);
    drawFrac(from + (to - from) * t);
    await sleep(delay);
  }
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// rainbow shimmer over a string (returns nothing; draws once at phase p)
export function rainbowText(screen, x, y, text, p = 0, opts = {}) {
  const { spread = 18, sat = 0.7, light = 0.62, bg = null } = opts;
  let cx = x, i = 0;
  for (const ch of Array.from(text)) {
    const col = hsl((p + i * spread) % 360, sat, light);
    screen.text(cx, y, ch, col, bg); // text() handles wide glyphs + continuation
    cx += charWidth(ch); i++;
  }
}

// draw a gradient-filled horizontal bar; returns the painted width
export function gradientBar(screen, x, y, width, frac, stops, opts = {}) {
  const { bgColor = PAL.bgPanel2, ch = '█', emptyCh = '░', emptyColor = PAL.inkFaint } = opts;
  const filled = Math.round(width * Math.max(0, Math.min(1, frac)));
  const cols = gradientColors(Math.max(2, width), stops);
  for (let i = 0; i < width; i++) {
    if (i < filled) screen.put(x + i, y, ch, cols[i], bgColor);
    else screen.put(x + i, y, emptyCh, emptyColor, bgColor);
  }
  return filled;
}
