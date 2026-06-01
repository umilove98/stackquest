// shop.js — the item shop ("M"). Buy consumables with 크레딧 (◈). Stock and
// prices live in data/items.js.

import { PAL } from '../ansi.js';
import { panel, menu, say } from '../ui.js';
import { ITEMS, SHOP_STOCK } from '../data/items.js';
import { addItem, itemCount } from '../state.js';

const BG = [16, 14, 24];

export async function openShop(ctx) {
  const { screen, input, state } = ctx;
  const draw = () => {
    screen.clear(BG);
    panel(screen, 2, 1, screen.w - 4, screen.h - 2, { style: 'double', fg: PAL.gold, bg: BG, title: '아이템 상점 // shop.exe', titleFg: PAL.gold });
    screen.text(4, 3, `크레딧: ${state.tokens} ◈`, PAL.gold, BG);
    screen.text(4, screen.h - 3, '[↑↓] 선택  ·  [Enter] 구매  ·  [Esc] 나가기', PAL.inkFaint, BG);
  };
  for (;;) {
    const items = SHOP_STOCK.map((id) => {
      const it = ITEMS[id];
      const afford = state.tokens >= it.price;
      return {
        label: `${it.name}  ${it.price}◈`,
        hint: `보유 ${itemCount(state, id)} — ${it.desc}`,
        color: afford ? PAL.ink : PAL.inkFaint,
        disabled: !afford,
      };
    });
    const pick = await menu(screen, input, draw, items, { x: 4, y: 5, width: screen.w - 10, rowGap: 1, allowCancel: true, bg: BG });
    if (pick < 0) return;
    const it = ITEMS[SHOP_STOCK[pick]];
    if (state.tokens < it.price) continue; // safety (disabled blocks this anyway)
    state.tokens -= it.price;
    addItem(state, it.id, 1);
    await say(screen, input, draw, [`${it.name} 구매! (−${it.price}◈ · 보유 ${itemCount(state, it.id)})`], { speaker: '상점' });
  }
}
