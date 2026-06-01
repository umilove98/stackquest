// i18n.js — Korean term maps. Creature/move strings now live (already in Korean)
// directly in codex.json, so NAME_KO/FLAVOR_KO/MOVE_KO are empty fallbacks.

export const RARITY_KO = { COMMON: '일반', UNCOMMON: '고급', RARE: '희귀', EPIC: '영웅', LEGENDARY: '전설', BOSS: '보스' };
// internal class keys stay LOGIC/MEMORY/CONCURRENCY but DISPLAY as 코드/언어/비전
export const CLASS_KO = { LOGIC: '코드', MEMORY: '언어', CONCURRENCY: '비전', DEV: '개발자', CORRUPT: '오염' };
export const STATUS_KO = { poison: '버그유출', slow: '둔화', weaken: '약화', shield: '방어막', crit_up: '집중' };
export const EFFECT_KO = { poison: '버그유출', slow: '둔화', weaken: '약화', shield: '방어막', crit_up: '집중', heal: '회복' };
export const VERDICT_KO = { 'CLEAN BUILD': '클린 빌드', FLAKY: '불안정', 'CORRUPTED HEAP': '힙 손상' };

export const rarityKo = (r) => RARITY_KO[r] || r;
export const classKo = (c) => CLASS_KO[c] || c;
export const verdictKo = (l) => VERDICT_KO[l] || l;

// creature/move text is authored in Korean inside codex.json; these stay empty
export const NAME_KO = {};
export const FLAVOR_KO = {};
export const MOVE_KO = {};

export const moveNameKo = (en) => (MOVE_KO[en] ? MOVE_KO[en][0] : en);
export const moveDescKo = (en) => (MOVE_KO[en] ? MOVE_KO[en][1] : '');
