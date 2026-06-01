// charms.js (system) — the 행운 부적 roll (a one-pull luck gacha you get on
// entering a new map) and the charm 도감. Effects live in data/charms.js and are
// applied by state.syncCharms / battle / gacha.

import { PAL } from '../ansi.js';
import { flash } from '../fx/anim.js';
import { panel } from '../ui.js';
import { pick } from './rng.js';
import { CHARMS, CHARM_IDS } from '../data/charms.js';
import { syncCharms } from '../state.js';

const BG = [14, 12, 24];
const waitKey = async (input, draw, keys) => { draw(); input.drain(); for (;;) { const k = await input.next(); if (keys.includes(k)) return k; draw(); } };

// roll one random charm, grant it, and reveal it. returns the charm id.
export async function rollCharm(ctx, opts = {}) {
  const { screen, input, state } = ctx;
  const id = pick(CHARM_IDS);
  state.charms = state.charms || [];
  state.charms.push(id);
  syncCharms(state); // apply HP bonus + recompute now
  const ch = CHARMS[id];
  const owned = state.charms.filter((x) => x === id).length;
  const cy = Math.floor(screen.h / 2);
  const draw = () => {
    screen.clear(BG);
    panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.gold, bg: BG, title: '행운 부적 // luck.roll', titleFg: PAL.gold });
    screen.textCenter(3, opts.reason || '행운 부적을 하나 뽑는다...', PAL.inkDim, BG, 2, screen.w - 4);
    screen.textCenter(cy - 3, ch.glyph, ch.color, BG, 2, screen.w - 4);
    screen.textCenter(cy - 1, `『 ${ch.name} 』`, ch.color, BG, 2, screen.w - 4);
    screen.textCenter(cy + 1, ch.desc, PAL.ink, BG, 2, screen.w - 4);
    if (owned > 1) screen.textCenter(cy + 2, `중첩 ×${owned}`, PAL.gold, BG, 2, screen.w - 4);
    screen.textCenter(screen.h - 3, '[Enter] 계속', PAL.inkFaint, BG, 2, screen.w - 4);
    screen.flush();
  };
  await flash(screen, draw, { color: ch.color, times: 2, on: 70, off: 70 });
  await waitKey(input, draw, ['enter', 'space', 'z', 'esc', 'x']);
  return id;
}

// the charm 도감: the full list, with how many of each you hold.
export async function openCharmDex(ctx) {
  const { screen, input, state } = ctx;
  const counts = {};
  for (const id of (state.charms || [])) counts[id] = (counts[id] || 0) + 1;
  const draw = () => {
    screen.clear(BG);
    panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.gold, bg: BG, title: '행운 부적 도감', titleFg: PAL.gold });
    screen.text(4, 3, `보유 부적 ${(state.charms || []).length}개  ·  종류 ${Object.keys(counts).length}/${CHARM_IDS.length}`, PAL.inkDim, BG);
    let y = 5;
    for (const id of CHARM_IDS) {
      const ch = CHARMS[id]; const n = counts[id] || 0; const on = n > 0;
      screen.text(4, y, ch.glyph, on ? ch.color : PAL.inkFaint, BG);
      screen.text(6, y, ch.name, on ? ch.color : PAL.inkFaint, BG);
      screen.text(22, y, on ? `×${n}` : '미보유', on ? PAL.gold : PAL.inkFaint, BG);
      screen.text(30, y, ch.desc, on ? PAL.ink : PAL.inkFaint, BG);
      y += 2;
    }
    screen.text(4, screen.h - 3, '[Esc] 닫기', PAL.inkFaint, BG);
    screen.flush();
  };
  await waitKey(input, draw, ['esc', 'x', 'back', 'enter', 'space', 'z']);
}
