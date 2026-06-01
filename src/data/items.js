// items.js — consumable items. HP / 토큰(PP) recovery + revive. Bought with
// 크레딧 at the shop or gifted by NPCs. Held in state.inventory as { id: count }.
//   kind: 'hp'     -> restore HP (amount number, or 'full')
//         'pp'     -> refill every move's 토큰 to full
//         'revive' -> bring back a fainted ally (amount = fraction of maxHp)

export const ITEMS = {
  hotfix:     { id: 'hotfix',     name: '핫픽스 패치',  kind: 'hp',     amount: 40,     price: 30,  desc: '급한 대로 붙이는 반창고. HP를 40 회복.' },
  stacktrace: { id: 'stacktrace', name: '스택 트레이스', kind: 'hp',     amount: 120,    price: 80,  desc: '원인을 추적해 제대로 고친다. HP를 120 회복.' },
  reboot:     { id: 'reboot',     name: '리부트',       kind: 'hp',     amount: 'full', price: 200, desc: '끄고 켜면 대부분 해결된다. HP를 완전 회복.' },
  recharge:   { id: 'recharge',   name: '토큰 충전기',  kind: 'pp',     amount: 'full', price: 60,  desc: '고갈된 기술 토큰을 모두 가득 채운다.' },
  rollback:   { id: 'rollback',   name: '롤백',         kind: 'revive', amount: 0.5,    price: 150, desc: '다운된 동료를 이전 커밋으로 되돌린다. HP 절반으로 부활.' },
};

// what the shop sells, in display order
export const SHOP_STOCK = ['hotfix', 'stacktrace', 'reboot', 'recharge', 'rollback'];

// items an NPC can gift, weighted toward the cheap ones
export const GIFT_TABLE = [
  { id: 'hotfix', weight: 50 },
  { id: 'recharge', weight: 30 },
  { id: 'stacktrace', weight: 16 },
  { id: 'rollback', weight: 4 },
];

export const itemById = (id) => ITEMS[id];
export const ALL_ITEM_IDS = Object.keys(ITEMS);
