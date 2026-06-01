// patchnotes.js — a scrollable changelog viewer, opened from the title screen.

import { PAL } from '../ansi.js';
import { panel, wrapText } from '../ui.js';
import { PATCH_NOTES } from '../data/patchnotes.js';

const BG = [10, 11, 17];

export async function openPatchNotes(ctx) {
  const { screen, input } = ctx;
  const innerW = screen.w - 8;
  // flatten entries into styled, wrapped display lines
  const lines = [];
  for (const e of PATCH_NOTES) {
    lines.push({ kind: 'head', t: `${e.version}  —  ${e.title}` });
    for (const c of e.changes) {
      const sub = c.startsWith('  ');
      const wrapped = wrapText(c, innerW - (sub ? 4 : 2));
      wrapped.forEach((w, i) => lines.push({ kind: sub ? 'sub' : 'bullet', t: (i === 0 ? '' : '   ') + w }));
    }
    lines.push({ kind: 'blank', t: '' });
  }

  const top0 = 3;
  const visible = Math.max(4, screen.h - 6);
  let top = 0;
  const maxTop = Math.max(0, lines.length - visible);

  const draw = () => {
    screen.clear(BG);
    panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.gold, bg: BG, title: '패치노트 // CHANGELOG', titleFg: PAL.gold });
    for (let r = 0; r < visible; r++) {
      const ln = lines[top + r];
      if (!ln) break;
      const y = top0 + r;
      if (ln.kind === 'head') {
        screen.text(4, y, ln.t, PAL.gold, BG);
      } else if (ln.kind === 'bullet') {
        screen.text(4, y, '• ' + ln.t, PAL.ink, BG);
      } else if (ln.kind === 'sub') {
        screen.text(6, y, ln.t, PAL.inkDim, BG);
      }
    }
    // scroll indicators + footer
    if (top > 0) screen.text(screen.w - 4, top0, '▲', PAL.accent, BG);
    if (top < maxTop) screen.text(screen.w - 4, top0 + visible - 1, '▼', PAL.accent, BG);
    screen.textCenter(screen.h - 2, '[↑↓] 스크롤  ·  [Esc] 닫기', PAL.inkFaint, BG, 2, screen.w - 4);
    screen.flush();
  };

  draw();
  input.drain();
  for (;;) {
    const k = await input.next();
    if (k === 'up') { top = Math.max(0, top - 1); draw(); }
    else if (k === 'down') { top = Math.min(maxTop, top + 1); draw(); }
    else if (k === 'esc' || k === 'x' || k === 'back' || k === 'enter') return;
  }
}
