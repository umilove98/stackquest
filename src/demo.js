// demo.js — headless smoke test of the *rendering* paths (gacha reveal, battle,
// dialogue, repo) driven by a scripted fake input. Catches runtime/draw errors
// without needing a TTY. Run via `node game.js --demo`. Honors SQ_FAST.

import { Screen } from './render.js';
import { newGame, addCreature } from './state.js';
import { makeInstance } from './systems/creatureInstance.js';
import { reveal, pull } from './systems/gacha.js';
import { runBattle, awardSpoils } from './systems/battle.js';
import { openRepo } from './systems/collection.js';
import { openInfo } from './systems/infoscreen.js';
import { chooseStarterByGacha } from './main.js';
import { say } from './ui.js';
import { PAL } from './ansi.js';

class FakeInput {
  constructor() { this.queue = []; this.fallback = 'enter'; }
  start() {} stop() {} on() {}
  drain() {} // no-op: keep the scripted queue intact across drain() calls
  next() { return Promise.resolve(this.queue.length ? this.queue.shift() : this.fallback); }
}

export async function runDemo() {
  process.env.SQ_FAST = '1';
  const screen = new Screen(80, 24);
  const input = new FakeInput();
  const state = newGame();
  addCreature(state, makeInstance('COPILOT', 20, { iv: { hp: 31, atk: 31, def: 31, spd: 31 } }));
  addCreature(state, makeInstance('GPT35', 18, { iv: { hp: 20, atk: 22, def: 14, spd: 28 } }));
  const ctx = { screen, input, state };

  const step = async (name, fn) => {
    try { await fn(); process.stderr.write(`  ok: ${name}\n`); }
    catch (e) { process.stderr.write(`  FAIL: ${name}\n${e && e.stack ? e.stack : e}\n`); throw e; }
  };

  await step('starter gacha pull + pick screen', () => chooseStarterByGacha(ctx));
  await step('full reveal (legendary shiny)', () => reveal(ctx, { rarity: 'LEGENDARY', speciesId: 'CLAUDE_OPUS', shiny: true, inst: makeInstance('CLAUDE_OPUS', 12, { shiny: true }) }));
  await step('full reveal (epic)', () => reveal(ctx, { rarity: 'EPIC', speciesId: 'GPT4', shiny: false, inst: makeInstance('GPT4', 11) }));
  await step('quick reveal (uncommon)', () => reveal(ctx, { rarity: 'UNCOMMON', speciesId: 'GPT2', shiny: false, inst: makeInstance('GPT2', 10) }, { fast: true }));
  await step('pull() + reveal', async () => { const r = pull(state); await reveal(ctx, r, { fast: true }); addCreature(state, r.inst); });

  await step('dialogue box', () => say(screen, input, () => screen.clear(PAL.bgDeep), ['This is a typewriter dialogue test.', 'Second page, then it returns.'], { speaker: 'TEST' }));

  await step('battle vs weak wild', async () => {
    const enemy = makeInstance('GREP', 2);
    const out = await runBattle(ctx, enemy, {});
    if (out.result === 'win') awardSpoils(state, enemy);
    process.stderr.write(`     battle outcome: ${out.result}\n`);
  });

  await step('repo / collection (inspect + back)', async () => {
    input.queue = ['enter', 'esc', 'esc'];
    await openRepo(ctx);
  });

  await step('info: 상성표 + 도감 상세', async () => {
    input.queue = ['enter', 'esc', 'down', 'enter', 'enter', 'esc', 'esc', 'esc'];
    await openInfo(ctx);
  });

  process.stderr.write('\nDEMO COMPLETE — no runtime errors.\n');
}
