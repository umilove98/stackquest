// ansi.js — low-level terminal escape codes, truecolor helpers, color math.
// Everything here is pure string-building or pure math; no I/O.

export const CSI = '\x1b[';

export const cursor = {
  hide: `${CSI}?25l`,
  show: `${CSI}?25h`,
  home: `${CSI}H`,
  to: (x, y) => `${CSI}${y};${x}H`, // 1-based: row y, col x
};

export const screen = {
  clear: `${CSI}2J`,
  clearScroll: `${CSI}3J`,
  altOn: `${CSI}?1049h`,
  altOff: `${CSI}?1049l`,
};

export const sgr = {
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  underline: `${CSI}4m`,
  inverse: `${CSI}7m`,
};

export const fg = (r, g, b) => `${CSI}38;2;${r};${g};${b}m`;
export const bg = (r, g, b) => `${CSI}48;2;${r};${g};${b}m`;
export const fgArr = (c) => fg(c[0], c[1], c[2]);
export const bgArr = (c) => bg(c[0], c[1], c[2]);

// ---- color math ----
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const lerpColor = (c1, c2, t) => [
  Math.round(lerp(c1[0], c2[0], t)),
  Math.round(lerp(c1[1], c2[1], t)),
  Math.round(lerp(c1[2], c2[2], t)),
];

export const scaleColor = (c, k) => [
  clamp(Math.round(c[0] * k), 0, 255),
  clamp(Math.round(c[1] * k), 0, 255),
  clamp(Math.round(c[2] * k), 0, 255),
];

// mix toward a target color by amount t (0..1)
export const toward = (c, target, t) => lerpColor(c, target, t);

// HSL -> RGB (h:0..360, s/l:0..1) for rainbow / cycling effects
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

// produce n colors interpolated across an array of stop colors
export function gradientColors(n, stops) {
  if (n <= 1) return [stops[0]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const seg = t * (stops.length - 1);
    const a = Math.floor(seg);
    const b = Math.min(a + 1, stops.length - 1);
    out.push(lerpColor(stops[a], stops[b], seg - a));
  }
  return out;
}

// shared palette used across the game
export const PAL = {
  bgDeep:   [14, 16, 22],
  bgPanel:  [22, 26, 35],
  bgPanel2: [30, 35, 47],
  ink:      [206, 212, 224],
  inkDim:   [120, 130, 148],
  inkFaint: [74, 82, 98],
  accent:   [122, 162, 247],
  good:     [120, 220, 150],
  warn:     [240, 200, 90],
  bad:      [240, 100, 100],
  white:    [240, 244, 252],
  black:    [10, 11, 15],
  shiny:    [120, 255, 235],
  gold:     [255, 196, 70],

  rarity: {
    COMMON:    [168, 176, 188],
    UNCOMMON:  [90, 210, 130],
    RARE:      [86, 156, 255],
    EPIC:      [192, 116, 255],
    LEGENDARY: [255, 190, 64],
    BOSS:      [255, 78, 78],
  },

  // class accent colors — 코드(LOGIC)/언어(MEMORY)/비전(CONCURRENCY)/개발자(DEV)/오염(CORRUPT)
  cls: {
    LOGIC:       [120, 220, 150],
    MEMORY:      [120, 180, 255],
    CONCURRENCY: [210, 130, 240],
    DEV:         [245, 175, 75],
    CORRUPT:     [235, 90, 130],
  },
};

export const rarityColor = (r) => PAL.rarity[r] || PAL.ink;
export const classColor = (c) => PAL.cls[c] || PAL.ink;
