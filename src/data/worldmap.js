// worldmap.js — overworld maps as a registry. Each map has its own tiles, spawn,
// portal, POIs (gacha/healer/shop/gate/boss), NPCs, wild species pool, and boss.
// state.mapId selects the active map. The REPO is menu-only, so no 'R' tiles.
// Connectivity (spawn -> every POI + grass) is asserted by selftest, per map.

// shared tile kinds: glyph + colors. POIs are bright letters on tinted pads.
export const LEGEND = {
  '#': { kind: 'wall',   walkable: false, glyph: '▓', fg: [74, 82, 108], bg: [28, 31, 42], name: '스택 프레임 벽' },
  '.': { kind: 'floor',  walkable: true,  glyph: '·', fg: [54, 60, 78],  bg: [20, 22, 30], name: '열린 코드패스' },
  '~': { kind: 'water',  walkable: false, glyph: '≈', fg: [96, 150, 214], bg: [24, 42, 72], name: '메모리 풀' },
  't': { kind: 'grass',  walkable: true,  glyph: '"', fg: [120, 204, 120], bg: [24, 44, 30], name: '레거시 코드 (야생)' },
  'S': { kind: 'spawn',  walkable: true,  glyph: '·', fg: [54, 60, 78],  bg: [20, 22, 30], name: '진입점' },
  'G': { kind: 'gacha',  walkable: true,  glyph: 'G', fg: [255, 204, 92], bg: [56, 46, 20], name: '크레이트 단말기' },
  'H': { kind: 'healer', walkable: true,  glyph: 'H', fg: [122, 230, 150], bg: [22, 50, 32], name: '리팩터 클리닉' },
  'N': { kind: 'npc',    walkable: true,  glyph: 'N', fg: [244, 222, 122], bg: [44, 40, 24], name: '안내 개발자' },
  'M': { kind: 'shop',   walkable: true,  glyph: 'M', fg: [120, 220, 210], bg: [20, 44, 44], name: '아이템 상점' },
  'D': { kind: 'gate',   walkable: true,  glyph: 'D', fg: [206, 156, 255], bg: [44, 30, 60], name: 'sudo 게이트' },
  'B': { kind: 'boss',   walkable: true,  glyph: 'B', fg: [255, 96, 96],  bg: [58, 24, 28], name: '보스' },
  'P': { kind: 'portal', walkable: true,  glyph: 'P', fg: [240, 130, 220], bg: [50, 24, 48], name: '영역 포털' },
  'Q': { kind: 'quest',  walkable: true,  glyph: 'Q', fg: [255, 150, 90],  bg: [52, 34, 20], name: '관문지기' },
  // bridge: blocked until the quest is cleared. overworld swaps walkability/look by flag.
  'b': { kind: 'bridge', walkable: false, glyph: '≈', fg: [96, 150, 214], bg: [24, 42, 72], name: '끊긴 다리' },
};
// how a built bridge tile looks (overworld renders this when the bridge flag is set)
export const BRIDGE_OPEN = { glyph: '=', fg: [180, 150, 110], bg: [40, 34, 26] };

// ---- map 1: 코드베이스 ----
const CODEBASE = [
  '########################################',
  '#S..................tttttttttttt.......#',
  '#...................tttttttttttt.......#',
  '#.H.................tttttttttttt.......#',
  '#...................tttttttttttt.......#',
  '#...................tttttttttttt.......#',
  '#.G.................tttttttttttt.......#',
  '#.M....................................#',
  '#.........N............................#',
  '#......................................#',
  '#..~~~~~...............................#',
  '#..~~~~~......................##########',
  '#..~~~~~......................#........#',
  '#.............................D...B....#',
  '#...........N.................#........#',
  '#.............................#.....P..#',
  '#.............................##########',
  '########################################',
];

// ---- map 2: 프로덕션 서버 (boss-gated, higher level) ----
// A river ('~') splits the map; the quest trainer 'Q' guards the bridge 'b'.
// Beat them and the bridge opens, revealing the grass field + DEADLOCK's chamber.
const PROD = [
  '########################################',
  '#P..S...........~~....tttttttt.........#',
  '#...............~~....tttttttt.........#',
  '#...G...H...M...~~....tttttttt.........#',
  '#...............~~....tttttttt.........#',
  '#......N........~~....tttttttt.........#',
  '#...............~~.....................#',
  '#...............~~.........#####.......#',
  '#..........Q...bb.........#.....#......#',
  '#...............~~........#..B..#......#',
  '#...............~~........#.....#......#',
  '#..~~~~........~~.........##.####......#',
  '#..~~~~........~~......................#',
  '#..~~~~........~~......................#',
  '#...............~~.....................#',
  '#...............~~.....................#',
  '#...............~~.....................#',
  '########################################',
];

const NPC_LINES = {
  codebase: [
    ['코드베이스에 온 걸 환영해, 디버거.', '저 풀숲엔 야생 도구와 모델이 돌아다녀.', '잡아서 영입하면 버그 잡기가 훨씬 수월해져.'],
    ['sudo 게이트(D) 너머에 기술부채가 똬리를 틀었대.', '레벨 낮을 때 들어가면 위험해.', '크레이트(G)에서 최신 모델을 뽑아 팀을 키우고 가.'],
  ],
  prod: [
    ['여긴 프로덕션 서버야. 여기 야생들은 한 수 위라고.', '저 안쪽에 데드락이 모든 걸 멈춰 세우고 있어.', '토큰과 부적을 든든히 챙겨서 들어가.'],
  ],
};

function makeMap(id, name, tiles, wild, bossId) {
  const width = tiles[0].length, height = tiles.length;
  const find = (ch) => {
    for (let y = 0; y < height; y++) { const x = tiles[y].indexOf(ch); if (x >= 0) return { x, y }; }
    return null;
  };
  const findAll = (ch) => {
    const out = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (tiles[y][x] === ch) out.push({ x, y });
    return out;
  };
  const npcs = {};
  const lines = NPC_LINES[id] || [['...']];
  let i = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (tiles[y][x] === 'N') { npcs[`${x},${y}`] = lines[i % lines.length]; i++; }
  }
  return {
    id, name, tiles, width, height,
    spawn: find('S') || { x: 1, y: 1 },
    portal: find('P'),
    questNpc: find('Q'),
    bridges: findAll('b'),
    poi: { gacha: find('G'), healer: find('H'), boss: find('B'), gate: find('D'), shop: find('M'), portal: find('P') },
    npcs,
    wild,   // { pool: [speciesId...], levelBonus }
    bossId,
  };
}

export const MAPS = {
  codebase: makeMap('codebase', '코드베이스',
    CODEBASE,
    { pool: ['GREP', 'PRINTF', 'ELIZA', 'VIM', 'GIT', 'DOCKER', 'CLIPPY', 'GPT2', 'COPILOT', 'GPT35', 'STABLE_DIFF'], levelBonus: 0 },
    'TECH_DEBT'),
  prod: makeMap('prod', '프로덕션 서버',
    PROD,
    { pool: ['NULLPTR', 'ZOMBIE', 'RACE', 'STACKOVF', 'KPANIC'], levelBonus: 8 },
    'DEADLOCK'),
};

export const MAP_ORDER = ['codebase', 'prod'];
export const FIRST_MAP = 'codebase';
export const mapById = (id) => MAPS[id] || MAPS[FIRST_MAP];

export function tileChar(map, x, y) {
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) return '#';
  return map.tiles[y][x];
}
export function tileInfo(map, x, y) { return LEGEND[tileChar(map, x, y)] || LEGEND['.']; }
export function isWalkable(map, x, y) { return tileInfo(map, x, y).walkable; }
