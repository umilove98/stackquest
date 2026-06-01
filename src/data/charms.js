// charms.js — 행운 부적 (luck relics). Rolled from a per-map charm gacha; owned
// charms are passive, run-wide buffs that stack (duplicates add up). Stored in
// state.charms as an array of ids. Pure data + the effect aggregator (no imports
// so state.js can use charmTotals without a cycle).

export const CHARMS = {
  vitality: { id: 'vitality', name: '생명의 부적', glyph: '♥', color: [120, 230, 150], desc: '내 모든 캐릭터의 최대 HP +10' },
  power:    { id: 'power',    name: '예리함의 부적', glyph: '▲', color: [255, 170, 90],  desc: '모든 기술의 공격력 +5' },
  capture:  { id: 'capture',  name: '포획의 부적', glyph: '◆', color: [120, 200, 255], desc: '영입(포획) 확률 ×2' },
  phoenix:  { id: 'phoenix',  name: '불사조의 부적', glyph: '✦', color: [255, 210, 110], desc: '전투당 1회, 치명상을 입은 캐릭터를 부활' },
  fortune:  { id: 'fortune',  name: '행운의 부적', glyph: '★', color: [255, 224, 130], desc: '뽑기에서 고레어도 등장 확률 증가' },
};

export const CHARM_IDS = Object.keys(CHARMS);
export const charmById = (id) => CHARMS[id];

// aggregate the effects of a list of owned charm ids (stacking)
export function charmTotals(charms = []) {
  const t = { hp: 0, power: 0, catchMult: 1, reviveCharges: 0, rarityBoost: 0 };
  for (const id of charms) {
    if (id === 'vitality') t.hp += 10;
    else if (id === 'power') t.power += 5;
    else if (id === 'capture') t.catchMult *= 2;
    else if (id === 'phoenix') t.reviveCharges += 1;
    else if (id === 'fortune') t.rarityBoost += 1;
  }
  return t;
}

// fortune charm: tilt gacha odds toward EPIC/LEGENDARY (weights need not sum to 1)
export function fortuneOdds(baseOdds, rarityBoost) {
  if (!rarityBoost) return baseOdds;
  return {
    ...baseOdds,
    EPIC: baseOdds.EPIC * (1 + 0.4 * rarityBoost),
    LEGENDARY: baseOdds.LEGENDARY * (1 + 0.7 * rarityBoost),
  };
}
