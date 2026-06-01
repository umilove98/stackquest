// main.js — entry orchestration: terminal lifecycle, animated title, starter
// selection, and the title <-> overworld loop. Dispatches --selftest / --demo.

import { Screen } from './render.js';
import { Input } from './input.js';
import { cursor, screen as SCR, sgr, PAL, classColor, rarityColor, gradientColors, hsl, scaleColor } from './ansi.js';
import { sleep, sparkle, rainbowText } from './fx/anim.js';
import { newGame, load, hasSave, save, addCreature } from './state.js';
import { STARTERS, SPECIES } from './data/creatures.js';
import { SPRITES } from './data/sprites.js';
import { makeInstance } from './systems/creatureInstance.js';
import { CONFIG, genomeVerdict } from './data/config.js';
import { runOverworld } from './systems/overworld.js';
import { pullStarter, reveal } from './systems/gacha.js';
import { openPatchNotes } from './systems/patchnotes.js';
import { panel, menu, say, drawCreature, rarityTag, RARITY_GLYPH, classTag, genomeBar, toneColor } from './ui.js';
import { rarityKo, verdictKo, classKo } from './data/i18n.js';

function spriteDims(id) {
  const s = SPRITES[id];
  if (!s) return { w: 0, h: 0 };
  let w = 0; for (const r of s.px) w = Math.max(w, r.length);
  return { w, h: Math.ceil(s.px.length / 2) };
}

function enterFull() { process.stdout.write(SCR.altOn + cursor.hide); }
function exitFull() { process.stdout.write(sgr.reset + cursor.show + SCR.altOff); }

const BANNER = 'STACK QUEST';

async function titleScreen(ctx) {
  const { screen, input } = ctx;
  const decoIds = ['GREP', 'GIT', 'DOCKER', 'GPT4', 'MIDJOURNEY', 'CLAUDE_OPUS'];
  const positions = [];
  for (let i = 0; i < decoIds.length; i++) {
    positions.push({ id: decoIds[i], x: 4 + (i % 3) * 26, y: i < 3 ? 2 : screen.h - 8 });
  }
  let phase = 0;
  input.drain();
  for (;;) {
    screen.clear([10, 11, 17]);
    // scattered dim creatures
    for (const p of positions) {
      const s = SPRITES[p.id];
      if (!s) continue;
      const dim = {}; for (const k of Object.keys(s.pal)) dim[k] = scaleColor(s.pal[k], 0.32);
      screen.pixelBlit(p.x, p.y, s.px, dim, { bg: null });
    }
    // big-ish banner: letters spaced, hue-cycling
    const big = BANNER.split('').join(' ');
    const bx = Math.floor((screen.w - big.length) / 2);
    const by = Math.floor(screen.h / 2) - 3;
    rainbowText(screen, bx, by, big, phase, { spread: 26, sat: 0.55, light: 0.66 });
    // underline gradient rule
    const cols = gradientColors(big.length, [PAL.accent, PAL.epicish || PAL.shiny, PAL.gold]);
    for (let i = 0; i < big.length; i++) screen.put(bx + i, by + 1, '─', cols[i % cols.length], [10, 11, 17]);
    screen.textCenter(by + 3, '디버깅 가챠 RPG — 버그가 당신을 잡기 전에, 당신이 먼저 잡아라', PAL.inkDim, [10, 11, 17]);
    // blinking prompt
    if (Math.floor(phase / 30) % 2 === 0) screen.textCenter(by + 5, '▶  ENTER 를 누르세요  ◀', PAL.white, [10, 11, 17]);
    screen.textCenter(screen.h - 1, hasSave() ? '저장된 게임이 있습니다' : '새 코드베이스가 당신을 기다립니다', PAL.inkFaint, [10, 11, 17]);
    screen.flush();
    await sleep(50);
    phase += 6;
    if (input.queue.length) { const k = input.next ? await input.next() : 'enter'; if (k === 'esc' || k === 'q') return 'quit'; break; }
  }
  // menu
  const items = [
    { label: '이어하기', disabled: !hasSave(), hint: '저장된 게임을 불러온다' },
    { label: '새 게임', hint: '처음부터 시작 (저장 덮어쓰기)' },
    { label: '패치노트', hint: '업데이트 변경 내역을 본다' },
    { label: '종료', hint: '터미널로 나간다' },
  ];
  const drawBase = () => {
    screen.clear([10, 11, 17]);
    const big = BANNER.split('').join(' ');
    rainbowText(screen, Math.floor((screen.w - big.length) / 2), 4, big, phase, { spread: 26, light: 0.66 });
    screen.textCenter(6, '디버깅 가챠 RPG', PAL.inkDim, [10, 11, 17]);
  };
  for (;;) {
    const pick = await menu(screen, input, drawBase, items, { x: Math.floor(screen.w / 2) - 8, y: 10, width: 24, allowCancel: false, bg: [10, 11, 17] });
    if (pick === 2) { await openPatchNotes(ctx); continue; } // view notes, then back to menu
    return pick === 0 ? 'continue' : pick === 1 ? 'new' : 'quit';
  }
}

// decision screen shown under the keep/reroll menu after a starting pull
function drawStarterPick(screen, result) {
  const inst = result.inst;
  screen.clear([10, 11, 17]);
  screen.textCenter(1, '이 동료로 시작하시겠습니까?', PAL.accent, [10, 11, 17]);
  const d = spriteDims(result.speciesId);
  drawCreature(screen, Math.floor(screen.w / 2) - Math.floor(d.w / 2), 3, result.speciesId, { shiny: result.shiny, bg: [10, 11, 17] });
  const ny = 3 + d.h + 1;
  screen.textCenter(ny, inst.name + (result.shiny ? ' ✦' : ''), result.shiny ? PAL.shiny : PAL.white, [10, 11, 17]);
  const rc = rarityColor(result.rarity);
  screen.textCenter(ny + 1, `${RARITY_GLYPH[result.rarity]} ${rarityKo(result.rarity)}  ·  ${classKo(inst.classTag)}  ·  Lv.${inst.level}`, rc, [10, 11, 17]);
  const v = genomeVerdict(inst.genome);
  screen.textCenter(ny + 2, `게놈 무결성 ${inst.genome}%  « ${verdictKo(v.label)} »`, toneColor(v.tone), [10, 11, 17]);
}

// the opening gacha pull, with unlimited rerolls (reroll culture!)
export async function chooseStarterByGacha(ctx) {
  const { screen, input } = ctx;
  await say(screen, input, () => { screen.clear([10, 11, 17]); screen.textCenter(2, 'STACK QUEST', PAL.accent, [10, 11, 17]); },
    ['첫 동료는 크레이트에서 뽑습니다. 마음에 들 때까지 얼마든지 다시 뽑을 수 있어요. 행운을 빌어요!'], { speaker: '뽑기', boxY: Math.floor(screen.h / 2) - 1, boxH: 6 });
  for (;;) {
    const result = pullStarter();
    await reveal(ctx, result);
    const keep = await menu(screen, input, () => drawStarterPick(screen, result),
      [{ label: '예, 이 친구로!', color: PAL.good }, { label: '다시 뽑기', color: PAL.warn }],
      { x: Math.floor(screen.w / 2) - 11, y: screen.h - 4, width: 34, cols: 2, colW: 17, allowCancel: false, bg: [10, 11, 17] });
    if (keep === 0) return result;
    await say(screen, input, () => screen.clear([10, 11, 17]), ['다시 뽑습니다...'], { speaker: '뽑기' });
  }
}

async function intro(ctx) {
  const { screen, input } = ctx;
  const base = () => { screen.clear([10, 11, 17]); screen.textCenter(2, 'STACK QUEST', PAL.accent, [10, 11, 17]); };
  await say(screen, input, base, [
    '코드베이스가 기술부채에 잠식됐다. sudo 게이트 너머 깊은 곳에서, 오래 방치된 레거시가 거대한 괴물이 되어 깨어났다.',
    '당신은 디버거. 전설의 개발 도구와 AI 모델을 모아 팀을 꾸리고, 그 힘으로 버그를 잡아 기술부채를 물리쳐야 한다.',
    '먼저 — 크레이트에서 당신의 첫 동료(도구·모델)를 뽑자.',
  ], { speaker: '프롤로그', boxY: Math.floor(screen.h / 2) - 2, boxH: 8 });
}

export async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) { await import('./selftest.js'); return; }
  if (args.includes('--demo')) { const m = await import('./demo.js'); await m.runDemo(); return; }
  if (args.includes('--version') || args.includes('-v')) { const u = await import('./systems/updater.js'); u.printVersion(); return; }
  if (args.includes('--update')) { const u = await import('./systems/updater.js'); await u.runUpdate(); return; }
  // clean up any leftover post-update files from a previous self-update
  try { const u = await import('./systems/updater.js'); u.cleanupOld(); } catch {}

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const screen = new Screen(Math.min(cols, 200), Math.min(rows, 60));
  const input = new Input();
  const ctx = { screen, input, state: null };

  enterFull();
  input.start();
  input.on('quit', () => { exitFull(); process.exit(0); });

  try {
    if (cols < 80 || rows < 24) {
      screen.clear(PAL.bgDeep);
      screen.textCenter(Math.floor(rows / 2) - 1, '터미널을 최소 80 x 24 크기로 키워주세요', PAL.warn);
      screen.textCenter(Math.floor(rows / 2) + 1, `(현재 ${cols} x ${rows}) — 그냥 진행하려면 Enter`, PAL.inkDim);
      screen.flush();
      await input.next();
    }
    for (;;) {
      const choice = await titleScreen(ctx);
      if (choice === 'quit') break;
      if (choice === 'continue' && hasSave()) {
        ctx.state = load() || newGame();
      } else {
        ctx.state = newGame();
        await intro(ctx);
        const result = await chooseStarterByGacha(ctx);
        addCreature(ctx.state, result.inst);
        ctx.state.flags.starterChosen = true;
        save(ctx.state);
        await say(screen, input, () => { screen.clear(PAL.bgDeep); drawCreature(screen, Math.floor(screen.w / 2) - 8, 4, result.speciesId); }, [
          `${result.inst.name}와(과) 함께 모험을 시작한다!`,
          '풀숲으로 들어가면 야생 도구·모델을 만난다. 행운을 빌어, 디버거.',
        ], { speaker: '출발!' });
      }
      screen.invalidate();
      await runOverworld(ctx);
    }
  } finally {
    input.stop();
    exitFull();
  }
}
