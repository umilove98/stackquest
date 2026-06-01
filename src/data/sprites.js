// sprites.js — truecolor half-block (▀/▄) pixel-art for the collectible DEV
// TOOLS & AI MODELS. Symmetric creatures are authored as 8/9-wide LEFT halves
// and mirrored with sym() (fill the centerline or the body splits in two!);
// asymmetric ones use raw() with full rows. Palette keys per sprite:
//   o outline · a/b/c body+shade+highlight · e eye-white · p pupil · + accents

const mir = (h) => h + [...h].reverse().join('');
const sym = (pal, halves, shiny) => ({ pal, shiny: shiny || null, px: halves.map(mir) });
const raw = (pal, px, shiny) => ({ pal, shiny: shiny || null, px });

// shared human silhouette for the 개발자(DEV) class. `feat` overrides specific
// half-rows (0..13) so each developer can add hair/cap/beard/glasses/collar.
// palette keys used by the base: s skin · k skin-shade · h hair · p pupil · c clothes
const personBase = [
  '...hhhhh', '..hhhhhh', '.hhhhhhh', '.hssssss', '.hssssss',
  '.hsspsss', '.hssssss', '..ksssss', '...kssss', '......ss',
  '...ccccc', '..cccccc', '.ccccccc', '.ccccccc',
];
const person = (pal, feat = {}, shiny) => {
  const half = personBase.slice();
  for (const k of Object.keys(feat)) half[+k] = feat[k];
  return sym(pal, half, shiny);
};

export const SPRITES = {
  // ---- GREP : a cyan magnifying-glass with one eye + a handle ----
  GREP: sym(
    { o: [38, 44, 60], r: [150, 166, 192], g: [104, 206, 236], w: [236, 250, 255], p: [28, 40, 60], h: [120, 92, 60] },
    [
      '....rrrr',
      '..rrgggg',
      '.rgggggg',
      '.rggwpgg',
      '.rggppgg',
      '.rgggggg',
      '.rgggggg',
      '..rrgggg',
      '...rrrgg',
      '......hh',
      '......hh',
      '.....ohh',
      '........',
      '........',
    ],
    { o: [60, 40, 30], r: [200, 170, 120], g: [240, 196, 110], w: [255, 252, 235], p: [60, 40, 20], h: [120, 92, 60] },
  ),

  // ---- PRINTF : a chatty speech-bubble with a >_ prompt ----
  PRINTF: sym(
    { o: [40, 60, 92], a: [232, 240, 250], b: [176, 192, 220], t: [60, 110, 190] },
    [
      '..oooooo',
      '.oaaaaaa',
      'oaaaaaaa',
      'oattaaaa',
      'oatttaaa',
      'oattaaaa',
      'oaaaaaaa',
      'oabaaaaa',
      '.oaaaaaa',
      '..ooooo o',
    ].map((s) => s.slice(0, 8)).concat(['..ooooo.', '....oo..', '........', '........']).slice(0, 14),
    { o: [70, 60, 30], a: [248, 244, 228], b: [212, 204, 170], t: [200, 150, 60] },
  ),

  // ---- ELIZA : a vintage CRT terminal that asks you questions ----
  ELIZA: sym(
    { o: [36, 40, 36], a: [120, 150, 120], b: [80, 108, 84], c: [170, 200, 160], s: [120, 240, 150], p: [24, 40, 28] },
    [
      '.oooooo o',
      '.obbbbbb',
      '.obccccb',
      '.obspssb',
      '.obsssssb',
      '.obssssb',
      '.obccccb',
      '.obbbbbb',
      '.oooooo o',
      '..o.bb.o',
      '..oo..oo',
      '........',
      '........',
      '........',
    ].map((s) => s.slice(0, 8)),
    { o: [40, 34, 36], a: [150, 120, 150], b: [108, 80, 108], c: [200, 170, 200], s: [240, 150, 240], p: [40, 28, 40] },
  ),

  // ---- VIM : a dark-green terminal with a blinking block cursor ----
  VIM: sym(
    { o: [22, 40, 26], a: [34, 70, 44], b: [24, 52, 32], g: [120, 240, 140], c: [60, 110, 72] },
    [
      'oooooooo',
      'oaaaaaaa',
      'oaggaaaa',
      'oaaaaaaa',
      'oaaaaagg',
      'oaaaaagg',
      'oaaaaaaa',
      'oaccaaaa',
      'oaaaaaaa',
      'oooooooo',
      '.o.aa.o.',
      '.oo..oo.',
      '........',
      '........',
    ],
    { o: [40, 26, 22], a: [70, 44, 34], b: [52, 32, 24], g: [240, 160, 120], c: [110, 72, 60] },
  ),

  // ---- GIT : an orange branching commit-tree ----
  GIT: sym(
    { o: [70, 40, 20], a: [240, 150, 70], b: [180, 100, 44], c: [255, 196, 120], n: [255, 224, 160] },
    [
      '.......n',
      '......nn',
      '.....oan',
      '..n..oaa',
      '.nn.ooaa',
      '..oaooaa',
      '...oaoaa',
      '....oaaa',
      '....oaaa',
      '...ocaaa',
      '...oaaaa',
      '...obbba',
      '....ooob',
      '........',
    ],
    { o: [20, 50, 60], a: [80, 190, 220], b: [44, 130, 160], c: [150, 230, 250], n: [200, 245, 255] },
  ),

  // ---- DOCKER : a friendly blue whale carrying containers ----
  DOCKER: sym(
    { o: [26, 50, 86], a: [70, 150, 220], b: [46, 110, 180], c: [150, 200, 245], w: [240, 248, 255], p: [20, 36, 60], k: [120, 200, 235] },
    [
      '........',
      '..k..k..',
      '..k..k..',
      '.oooooo o',
      '.okkkkkk',
      '.oaaaaaa',
      'oaawpaaa',
      'oaaaaaaa',
      'oaaaaaaa',
      'oaaaaaab',
      '.obbbbbb',
      '..ooooo o',
      '...c..c.',
      '........',
    ].map((s) => s.slice(0, 8)),
    { o: [80, 50, 26], a: [220, 150, 70], b: [180, 110, 46], c: [245, 200, 150], w: [255, 248, 240], p: [60, 36, 20], k: [235, 200, 120] },
  ),

  // ---- CLIPPY : the paperclip assistant (asymmetric bent wire + eyes) ----
  CLIPPY: raw(
    { a: [186, 198, 218], e: [245, 248, 255], p: [24, 28, 40] },
    [
      '..aaaaaaa...',
      '.a.......a..',
      'a..aaaaa..a.',
      'a.a.....a.a.',
      'a.a.ee..a.a.',
      'a.a.pp..a.a.',
      'a.a.....a.a.',
      'a.a.....a.a.',
      'a.a.....a.a.',
      'a.a.aaaaa.a.',
      '.a.a......a.',
      '..a.aaaaaaa.',
      '..aaa.......',
      '............',
    ],
    { a: [222, 196, 130], e: [255, 250, 235], p: [40, 30, 18] },
  ),

  // ---- GPT2 : an early, chunky language-model robot head ----
  GPT2: sym(
    { o: [40, 44, 52], a: [150, 158, 172], b: [104, 112, 128], c: [196, 204, 220], e: [120, 220, 235], y: [250, 220, 110] },
    [
      '......y.',
      '......o.',
      '...oooo.',
      '..oaaaaa',
      '.oaaaaaa',
      '.oaeebaa',
      '.oaeebaa',
      '.oaaaaaa',
      '.oabbbaa',
      '..oaaaaa',
      '..obbbba',
      '..o.aa.o',
      '..oo..oo',
      '........',
    ],
    { o: [52, 44, 40], a: [172, 158, 150], b: [128, 112, 104], c: [220, 204, 196], e: [235, 150, 120], y: [250, 220, 110] },
  ),

  // ---- COPILOT : a small ghostly cursor-bird that finishes your code ----
  COPILOT: sym(
    { o: [30, 60, 64], a: [90, 210, 200], b: [56, 150, 144], c: [170, 245, 235], e: [245, 252, 250], p: [22, 50, 50], k: [200, 250, 245] },
    [
      '........',
      '....ooo.',
      '...oaaa.',
      '..oaeeb.',
      '..oaepb.',
      '.oaaaaab',
      'kaaaaaab',
      '.oaaaaab',
      '..obaaa.',
      '...obba.',
      '....oo.k',
      '........',
      '........',
      '........',
    ],
    { o: [60, 40, 64], a: [200, 110, 230], b: [150, 70, 180], c: [240, 190, 250], e: [252, 245, 252], p: [50, 28, 56], k: [245, 210, 250] },
  ),

  // ---- GPT35 : a sleek green chat-robot ----
  GPT35: sym(
    { o: [26, 60, 48], a: [70, 190, 150], b: [44, 140, 110], c: [150, 235, 200], e: [245, 252, 248], p: [22, 50, 42], w: [236, 250, 244] },
    [
      '....oo o.',
      '...oaaaa',
      '..oaaaaa',
      '.oaaeeaa',
      '.oaaeppa',
      '.oaaaaaa',
      '.oawwwaa',
      '.oaaaaaa',
      '..oaaaaa',
      '..obbbba',
      '...ooo.a',
      '...o.aa.',
      '...oo.oo',
      '........',
    ].map((s) => s.slice(0, 8)),
    { o: [60, 40, 26], a: [200, 150, 70], b: [150, 110, 44], c: [240, 200, 150], e: [252, 248, 245], p: [50, 40, 22], w: [250, 244, 236] },
  ),

  // ---- STABLE_DIFF : a square of noise resolving into an image ----
  STABLE_DIFF: raw(
    { o: [60, 40, 90], n: [120, 110, 140], m: [180, 170, 200], a: [120, 200, 245], b: [150, 240, 170], c: [250, 210, 120], s: [240, 240, 250] },
    [
      'oooooooooooooooo',
      'onmnmnaabbcccsso',
      'omnmnmaaabccssso',
      'onmnmnaabbcccsso',
      'omnmnmaaabccssso',
      'onmnmnaabbcccsso',
      'omnmnmaaabccssso',
      'onmnmnaabbcccsso',
      'omnmnmaaabccssso',
      'onmnmnaabbcccsso',
      'omnmnmaaabccssso',
      'onmnmnaabbcccsso',
      'omnmnmaaabccssso',
      'oooooooooooooooo',
    ],
    { o: [40, 60, 90], n: [110, 120, 140], m: [170, 180, 200], a: [245, 200, 120], b: [240, 150, 170], c: [120, 200, 245], s: [250, 250, 240] },
  ),

  // ---- DALLE2 : a painter-robot at an easel ----
  DALLE2: sym(
    { o: [50, 44, 40], a: [200, 150, 110], b: [150, 108, 78], c: [240, 200, 160], e: [40, 30, 24], r: [235, 90, 90], y: [250, 210, 90], g: [110, 200, 130] },
    [
      '...oooo.',
      '..oaaaa.',
      '.oaeeaa.',
      '.oaaaaa.',
      '.oaaaaa.',
      'ooooooooo',
      'orygrygo',
      'oryg rygo',
      'orygrygo',
      'ooooooooo',
      '...oo...',
      '...oo...',
      '..oooo..',
      '........',
    ].map((s) => s.slice(0, 8)),
    { o: [40, 44, 50], a: [110, 150, 200], b: [78, 108, 150], c: [160, 200, 240], e: [24, 30, 40], r: [90, 200, 235], y: [200, 150, 250], g: [240, 160, 110] },
  ),

  // ---- GPT4 : a large luminous brain-robot ----
  GPT4: sym(
    { o: [34, 36, 60], a: [120, 130, 230], b: [80, 88, 180], c: [180, 190, 255], e: [240, 245, 255], p: [26, 28, 50], g: [180, 240, 255] },
    [
      '...gg...',
      '..gaag..',
      '.ocaaaca',
      '.oaaaaaa',
      'oacaaaca',
      'oaaeebaa',
      'oaaeepaa',
      'oaaaaaaa',
      'oacaaaca',
      'oaaaaaaa',
      '.oaaaaaa',
      '.oabbba a',
      '..ooo.oo',
      '........',
    ].map((s) => s.slice(0, 8)),
    { o: [60, 40, 34], a: [230, 150, 120], b: [180, 100, 80], c: [255, 200, 180], e: [255, 248, 245], p: [50, 30, 26], g: [255, 220, 180] },
  ),

  // ---- GEMINI : twin faces sharing one glowing core ----
  GEMINI: sym(
    { o: [30, 50, 70], a: [90, 170, 235], b: [56, 120, 180], c: [170, 220, 250], e: [245, 250, 255], p: [22, 44, 66], g: [250, 230, 140] },
    [
      '..oo....',
      '.oaao...',
      '.oaeao..',
      '.oapao..',
      '.oaaaog.',
      '.oaaaagg',
      '.oaaaagg',
      '.oaaaog.',
      '.oapao..',
      '.oaeao..',
      '.oaao...',
      '..oo....',
      '........',
      '........',
    ],
    { o: [70, 50, 30], a: [235, 170, 90], b: [180, 120, 56], c: [250, 220, 170], e: [255, 250, 245], p: [66, 44, 22], g: [250, 230, 140] },
  ),

  // ---- MIDJOURNEY : a sailboat woven from painted light ----
  MIDJOURNEY: sym(
    { o: [50, 36, 70], a: [180, 130, 235], b: [130, 90, 180], c: [235, 200, 255], y: [250, 220, 120], w: [245, 240, 255] },
    [
      '.......y',
      '......yy',
      '.....yay',
      '....yaay',
      '...yaaay',
      '..yaaaay',
      '.yaaaaay',
      'yaaaaaay',
      '........',
      'wwwwwwww',
      '.cbbbbbb',
      '..ccbbbb',
      '...ooooo',
      '........',
    ],
    { o: [36, 50, 70], a: [130, 180, 235], b: [90, 130, 180], c: [200, 235, 255], y: [250, 220, 120], w: [240, 245, 255] },
  ),

  // ---- SORA : a swirling film reel of moving frames ----
  SORA: sym(
    { o: [24, 28, 40], a: [40, 48, 66], b: [28, 34, 48], c: [90, 220, 230], w: [230, 248, 250], h: [60, 70, 92] },
    [
      '...oooo.',
      '..occcco',
      '.occwwcc',
      '.ocwaacw',
      'occaohac',
      'ocwahaoc',
      'occaohac',
      '.ocwaacw',
      '.occwwcc',
      '..occcco',
      '...oooo.',
      '........',
      '........',
      '........',
    ],
    { o: [40, 28, 24], a: [66, 48, 40], b: [48, 34, 28], c: [240, 180, 90], w: [250, 240, 220], h: [92, 70, 60] },
  ),

  // ---- CLAUDE_OPUS : the radiant orange frontier mascot, crowned ----
  CLAUDE_OPUS: sym(
    { o: [120, 56, 24], a: [240, 130, 70], b: [200, 96, 48], c: [255, 184, 120], e: [60, 28, 16], w: [255, 240, 224], g: [255, 214, 96], s: [255, 248, 220] },
    [
      '..s.g.g.s',
      '...ggggg.',
      '..oooooo o',
      '.ocaaaaaa',
      '.oaaaaaaa',
      '.oaaeebaa',
      '.oaaeebaa',
      '.oaawwbaa',
      '.oaaaaaaa',
      '.oaccacaa',
      '.oaaaaaaa',
      '..obaaaab',
      '..o.aa.o.',
      '..oo..oo.',
    ].map((s) => s.slice(0, 9)),
    { o: [24, 70, 120], a: [80, 170, 240], b: [48, 120, 200], c: [150, 210, 255], e: [16, 30, 60], w: [224, 240, 255], g: [120, 220, 255], s: [220, 244, 255] },
  ),

  // ---- TECH_DEBT : the final boss — a glitched legacy monolith ----
  TECH_DEBT: sym(
    { o: [18, 20, 30], a: [54, 50, 70], b: [38, 34, 52], r: [236, 70, 82], y: [230, 200, 90], w: [220, 226, 240], m: [12, 12, 20] },
    [
      'r.r.r.r.r',
      'ooooooooo',
      'obbabbaba',
      'obrwbbwrb',
      'obbabbaba',
      'obabbabab',
      'obmmbmmba',
      'obwmwmwmb',
      'obmmbmmba',
      'obabyabab',
      'obbabbaba',
      'obabbabab',
      'ooooooooo',
      '.r.r.r.r.',
    ],
    { o: [30, 18, 20], a: [70, 50, 54], b: [52, 34, 38], r: [90, 150, 240], y: [120, 220, 200], w: [240, 226, 220], m: [20, 12, 12] },
  ),

  // ==== gacha additions (code/vision lines) ====
  // ---- CURSOR : an editor I-beam text caret on a dark panel ----
  CURSOR: sym(
    { o: [70, 78, 104], w: [24, 28, 40], c: [120, 220, 150] },
    ['oooooooo', 'owwwwwww', 'owwwwccc', 'owwwwwwc', 'owwwwwwc', 'owwwwwwc', 'owwwwwwc', 'owwwwwwc', 'owwwwwwc', 'owwwwccc', 'owwwwwww', 'oooooooo', '........', '........'],
  ),
  // ---- DEVIN : an autonomous-agent robot head with a visor + antenna ----
  DEVIN: sym(
    { o: [40, 46, 64], m: [120, 130, 150], M: [170, 182, 205], e: [110, 230, 245], a: [235, 200, 110] },
    ['......aa', '......Ma', '..oooooo', '.ommmmmm', '.omMMMMM', '.omeeeee', '.omeeeee', '.ommmmmm', '.ommmmmm', '..oooooo', '...mmmmm', '..MMMMMM', '.mmmmmmm', '.mmmmmmm'],
  ),
  // ---- VEO : a film clapperboard (video generation) ----
  VEO: sym(
    { o: [20, 22, 30], k: [34, 36, 46], b: [60, 64, 84], w: [235, 238, 246] },
    ['.bbbbbbb', 'bwbwbwbw', '.kkkkkkk', '.kkkkkkk', '.wwwkkkk', '.kkkkkkk', '.wwwwwkk', '.kkkkkkk', '.wwwkkkk', '.kkkkkkk', '.kkkkkkk', '.kkkkkkk', '..kkkkkk', '...kkkkk'],
  ),

  // ==== 개발자(DEV) class — human legends ====
  // ---- WOZNIAK : brown hair + beard, green shirt ----
  WOZNIAK: person(
    { s: [235, 200, 170], k: [205, 165, 140], h: [110, 80, 55], p: [45, 35, 30], c: [90, 150, 110], b: [92, 66, 44] },
    { 7: '..bbbbbb', 8: '...bbbbb', 9: '......bs' },
  ),
  // ---- HOPPER : navy admiral cap + gold brim, gray hair ----
  HOPPER: person(
    { s: [235, 200, 170], k: [205, 165, 140], h: [180, 182, 188], p: [40, 35, 35], c: [28, 38, 80], n: [34, 46, 96], g: [214, 180, 96] },
    { 0: '..nnnnnn', 1: '.nnnnnnn', 2: '.ggggggg' },
  ),
  // ---- VON_NEUMANN : dark slick hair + glasses, gray suit ----
  VON_NEUMANN: person(
    { s: [230, 196, 166], k: [200, 160, 135], h: [46, 42, 46], p: [35, 30, 30], c: [96, 98, 110], f: [56, 62, 76] },
    { 4: '.hsffsss', 5: '.hsfpfss' },
  ),
  // ---- GATES : brown hair + glasses, sweater ----
  GATES: person(
    { s: [235, 202, 172], k: [205, 165, 140], h: [125, 98, 62], p: [35, 30, 30], c: [150, 120, 162], f: [72, 74, 84] },
    { 4: '.hsffsss', 5: '.hsfpfss' },
  ),
  // ---- MUSK : short dark hair, dark jacket ----
  MUSK: person(
    { s: [230, 196, 166], k: [200, 160, 135], h: [58, 48, 44], p: [35, 30, 30], c: [40, 44, 58] },
  ),
  // ---- ADA : Victorian updo + lace collar ----
  ADA: person(
    { s: [238, 206, 178], k: [208, 170, 144], h: [80, 55, 42], H: [120, 90, 65], p: [40, 32, 30], c: [120, 70, 110], l: [238, 238, 248] },
    { 0: '..hhhhhh', 1: '.hhhhhhh', 2: '.hhHhhhh', 4: 'hhssssss', 5: 'hhsspsss', 10: '...lllll' },
  ),
  // ---- TURING : brown hair, white formal collar ----
  TURING: person(
    { s: [233, 200, 170], k: [203, 163, 138], h: [98, 72, 52], p: [38, 30, 28], c: [70, 90, 120], l: [235, 238, 245] },
    { 10: '...lllll' },
  ),

  // ==== map-2 (프로덕션 서버) natives ====
  // ---- NULLPTR : a crossed-out void box (null reference) ----
  NULLPTR: sym(
    { o: [120, 130, 152], x: [206, 92, 112] },
    ['oooooooo', 'o.......', 'o.x.....', 'o..x....', 'o...x...', 'o....x..', 'o....x..', 'o...x...', 'o..x....', 'o.x.....', 'o.......', 'oooooooo', '........', '........'],
  ),
  // ---- ZOMBIE : a glitched process monitor with X-eyes ----
  ZOMBIE: sym(
    { o: [40, 62, 44], s: [126, 184, 114], x: [222, 84, 84], z: [28, 42, 30] },
    ['oooooooo', 'osssssss', 'osssssss', 'osxsssss', 'osssssss', 'osssssss', 'oszsszss', 'osssssss', 'oooooooo', '..o..o..', '..s..s..', '..s..s..', '........', '........'],
  ),
  // ---- RACE : clashing arrows (race condition) ----
  RACE: sym(
    { a: [120, 200, 255] },
    ['........', '..a.....', '..aa....', '..aaa...', '..aaaa..', '..aaaaa.', '..aaaaaa', '..aaaaaa', '..aaaaa.', '..aaaa..', '..aaa...', '..aa....', '..a.....', '........'],
  ),
  // ---- STACKOVF : a teetering stack of frames ----
  STACKOVF: sym(
    { o: [50, 46, 40], a: [206, 164, 92], b: [150, 120, 70] },
    ['...aaa..', '...aaa..', '..bbb...', '..bbb...', '...aaa..', '...aaa..', '..bbbb..', '..bbbb..', '.aaaaa..', '.aaaaa..', 'bbbbbbb.', 'bbbbbbb.', 'oooooooo', '........'],
  ),
  // ---- KPANIC : a kernel-panic skull ----
  KPANIC: sym(
    { o: [40, 30, 30], s: [230, 230, 236], e: [30, 28, 32] },
    ['...sssss', '..ssssss', '.sssssss', '.sssssss', '.seessss', '.seessss', '.sssssss', '..ssssss', '..ssssss', '..s.s.ss', '..ssssss', '...sssss', '........', '........'],
  ),
  // ---- DEADLOCK : an interlocked padlock (map-2 boss) ----
  DEADLOCK: sym(
    { o: [30, 20, 28], m: [158, 64, 96], M: [206, 96, 128], s: [120, 122, 142], k: [18, 12, 16] },
    ['...sssss', '...s....', '...s....', '...s....', 'ommmmmmm', 'oMMMMMMM', 'ommmmmmm', 'ommmmmmk', 'ommmmmmk', 'ommmmmmm', 'oMMMMMMM', 'ommmmmmm', 'oooooooo', '........'],
  ),
};

export const SPRITE_ORDER = [
  'GREP', 'PRINTF', 'ELIZA',
  'VIM', 'GIT', 'DOCKER', 'CLIPPY', 'GPT2',
  'COPILOT', 'GPT35', 'STABLE_DIFF', 'DALLE2',
  'GPT4', 'GEMINI', 'MIDJOURNEY', 'SORA',
  'CLAUDE_OPUS', 'TECH_DEBT',
  'CURSOR', 'DEVIN', 'VEO',
  'WOZNIAK', 'HOPPER', 'VON_NEUMANN', 'GATES', 'MUSK', 'ADA', 'TURING',
  'NULLPTR', 'ZOMBIE', 'RACE', 'STACKOVF', 'KPANIC', 'DEADLOCK',
];

export function paletteFor(id, shiny) {
  const s = SPRITES[id];
  if (!s) return null;
  return shiny && s.shiny ? s.shiny : s.pal;
}
