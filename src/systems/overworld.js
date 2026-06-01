// overworld.js — walk the codebase: tile map + player, random encounters in the
// tall grass, and POI interactions (CRATE, clinic, REPO, NPCs, the boss arena).

import { PAL } from '../ansi.js';
import { vlen } from '../render.js';
import { sleep } from '../fx/anim.js';
import {
  MAPS, mapById, LEGEND, tileInfo, isWalkable, BRIDGE_OPEN,
} from '../data/worldmap.js';
import { speciesById } from '../data/creatures.js';
import { makeInstance, healInstance, isFainted } from './creatureInstance.js';
import { weightedPick, randInt, chance } from './rng.js';
import { CONFIG, wildWeight } from '../data/config.js';
import { runBattle, awardSpoils } from './battle.js';
import { openCrate } from './gacha.js';
import { openRepo } from './collection.js';
import { openInfo } from './infoscreen.js';
import {
  panel, say, menu, hpBar, confirm, drawCreature, rarityTag,
} from '../ui.js';
import {
  save, addCreature, markSeen, dexCaughtCount, dexTotal, removeItem, itemCount, addItem, syncCharms,
} from '../state.js';
import { itemById, GIFT_TABLE } from '../data/items.js';
import { openShop } from './shop.js';
import { rollCharm, openCharmDex } from './charms.js';

const MAP_X = 1, MAP_Y = 2;
const HUD_X = 43, HUD_Y = 2, HUD_W = 35;

export async function runOverworld(ctx) {
  const { screen, input, state } = ctx;
  let map = mapById(state.mapId);
  // the 프로덕션 bridge is blocked until the gatekeeper quest is cleared
  const bridgeOpen = () => map.id === 'prod' && !!state.flags.prodBridge;
  const walkableAt = (x, y) => (tileInfo(map, x, y).kind === 'bridge' ? bridgeOpen() : isWalkable(map, x, y));

  const render = () => {
    screen.clear(PAL.bgDeep);
    // title bar — show the current map name
    screen.text(1, 0, 'STACK QUEST', PAL.accent);
    screen.text(15, 0, `— ${map.name}`, PAL.inkDim);
    screen.textRight(0, `${state.tokens} ◈`, PAL.gold, null, 0, screen.w - 1);
    // map
    const open = bridgeOpen();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const info = tileInfo(map, x, y);
        // a built bridge renders as walkable planks; otherwise as the broken gap
        const isBridge = info.kind === 'bridge';
        const glyph = isBridge && open ? BRIDGE_OPEN.glyph : info.glyph;
        const fg = isBridge && open ? BRIDGE_OPEN.fg : info.fg;
        const bg = isBridge && open ? BRIDGE_OPEN.bg : info.bg;
        if (x === state.pos.x && y === state.pos.y) screen.put(MAP_X + x, MAP_Y + y, '@', PAL.white, bg);
        else screen.put(MAP_X + x, MAP_Y + y, glyph, fg, bg);
      }
    }
    // HUD
    drawHud();
    // legend strip + controls (below the map) — glyphs colored like on the map
    const here = tileInfo(map, state.pos.x, state.pos.y);
    const ly = MAP_Y + map.height;
    const legendRow = (x, y, items) => {
      let cx = x;
      for (const it of items) {
        screen.put(cx, y, it.g, it.gc, PAL.bgDeep);
        screen.text(cx + 2, y, it.t, PAL.inkDim, PAL.bgDeep);
        cx += 2 + vlen(it.t) + 2;
      }
      return cx;
    };
    legendRow(MAP_X, ly, [
      { g: '@', gc: PAL.white, t: '나' },
      { g: 'G', gc: LEGEND.G.fg, t: '크레이트' },
      { g: 'H', gc: LEGEND.H.fg, t: '클리닉' },
      { g: 'M', gc: LEGEND.M.fg, t: '상점' },
      { g: 'N', gc: LEGEND.N.fg, t: 'NPC' },
      { g: 'B', gc: LEGEND.B.fg, t: '보스' },
      { g: 'P', gc: LEGEND.P.fg, t: '포털' },
    ]);
    const ex = legendRow(MAP_X, ly + 1, [
      { g: '▓', gc: LEGEND['#'].fg, t: '벽' },
      { g: '≈', gc: LEGEND['~'].fg, t: '물' },
      { g: '"', gc: LEGEND.t.fg, t: '풀숲(야생)' },
      ...(map.questNpc ? [{ g: 'Q', gc: LEGEND.Q.fg, t: '관문지기' }] : []),
    ]);
    screen.text(ex + 1, ly + 1, `◆ 현재: ${here.name}`, PAL.inkDim);
    screen.text(MAP_X, ly + 2, '이동 WASD/방향키 · [Enter] 메뉴 · [Q] 저장', PAL.inkFaint);
  };

  const drawHud = () => {
    panel(screen, HUD_X, HUD_Y, HUD_W, map.height, { title: '파티', fg: PAL.inkFaint, bg: PAL.bgPanel, titleFg: PAL.accent });
    let row = HUD_Y + 1;
    if (state.party.length === 0) {
      screen.text(HUD_X + 2, row, '(아직 동료가 없다)', PAL.inkDim, PAL.bgPanel);
    }
    for (const c of state.party) {
      const nm = (c.name + (c.shiny ? ' ✦' : '')).slice(0, 16);
      screen.text(HUD_X + 2, row, nm, isFainted(c) ? PAL.bad : (c.shiny ? PAL.shiny : PAL.ink), PAL.bgPanel);
      screen.text(HUD_X + HUD_W - 7, row, `Lv.${c.level}`.padStart(5), PAL.inkDim, PAL.bgPanel);
      hpBar(screen, HUD_X + 2, row + 1, HUD_W - 12, c.hp, c.maxHp, { bg: PAL.bgPanel });
      screen.text(HUD_X + HUD_W - 9, row + 1, `${Math.max(0, c.hp)}/${c.maxHp}`.padStart(8), PAL.inkDim, PAL.bgPanel);
      row += 2;
    }
    // footer stats
    const fy = HUD_Y + map.height - 4;
    screen.hline(HUD_X + 1, fy - 1, HUD_W - 2, '─', PAL.inkFaint, PAL.bgPanel);
    screen.text(HUD_X + 2, fy, `크레딧 ${state.tokens} ◈`, PAL.gold, PAL.bgPanel);
    screen.text(HUD_X + 2, fy + 1, `도감   ${dexCaughtCount(state)}/${dexTotal()} 패치`, PAL.good, PAL.bgPanel);
    screen.text(HUD_X + 2, fy + 2, `걸음   ${state.stats.steps}`, PAL.inkDim, PAL.bgPanel);
  };

  const flash2 = async () => { render(); screen.flush(); };

  // ---- interactions ----
  async function blackout(reason) {
    await say(screen, input, render, [reason, '리팩터 클리닉에서 재부팅했다. 파티가 모두 회복됐다.'], { speaker: '시스템' });
    for (const c of state.party) healInstance(c);
    const h = map.poi.healer || map.spawn;
    state.pos = { x: h.x, y: h.y };
  }

  async function postBattle(outcome, enemy, opts = {}) {
    if (outcome.result === 'win') {
      const spoils = awardSpoils(state, enemy);
      const lines = [`${enemy.name} 격퇴! +${spoils.xp} 경험치, +${spoils.tokens} ◈${spoils.clean ? ' (클린 커밋 보너스!)' : ''}`];
      for (const lu of spoils.levelUps) lines.push(`${lu.name} 레벨 업! → Lv.${lu.to}`);
      await say(screen, input, render, lines, { speaker: '전투' });
      return true;
    }
    if (outcome.result === 'caught') {
      healInstance(outcome.creature); // recruited allies join clean
      const where = addCreature(state, outcome.creature);
      const dest = where === 'party' ? '파티' : '보관함';
      const inst = outcome.creature;
      await say(screen, input, render, [
        `영입 성공! ${inst.name}이(가) 팀에 합류했다${inst.shiny ? ' — 게다가 샤이니 ✦!' : ''}.`,
        `게놈 무결성 ${inst.genome}%. ${dest}(으)로 보냈다.`,
      ], { speaker: '전투' });
      state.tokens += Math.round(CONFIG.tokens.cache / 3);
      return true;
    }
    if (outcome.result === 'lose') { await blackout(opts.boss ? `${enemy.name}이(가) 파티를 집어삼켰다...` : '파티 전원이 다운됐다...'); return false; }
    return true; // run
  }

  async function startWild() {
    const lead = state.party.find((c) => !isFainted(c)) || state.party[0];
    const leadLv = lead ? lead.level : 5;
    const bonus = map.wild.levelBonus || 0;
    // current map's pool; rarity weight scales with (level + map bonus) so deeper
    // maps surface higher rarities (and let EPICs appear in the wild).
    const pool = map.wild.pool.map(speciesById).filter(Boolean);
    const speciesId = weightedPick(pool, (c) => wildWeight(c.rarity, leadLv + bonus)).id;
    const level = Math.max(3 + bonus, Math.min(CONFIG.levelCap, randInt(leadLv - 2, leadLv + 2) + (bonus ? Math.floor(bonus / 2) : 0)));
    const enemy = makeInstance(speciesId, Math.min(CONFIG.levelCap, level));
    const outcome = await runBattle(ctx, enemy, {});
    await postBattle(outcome, enemy);
    screen.invalidate();
  }

  async function fightBoss() {
    const bossId = map.bossId;
    const isFinal = bossId === 'DEADLOCK';
    const already = isFinal ? state.flags.deadlockDefeated : state.flags.bossDefeated;
    const bossSp = speciesById(bossId);
    if (already) {
      await say(screen, input, render, [isFinal ? '데드락은 풀렸다. 프로덕션은 다시 흐른다.' : '기술부채는 리팩터링됐다. 포털은 열려 있다.'], { speaker: '코어' });
      return;
    }
    const ready = await confirm(screen, input, render, `${bossSp.name}와(과) 맞선다? 도망칠 수 없다.`);
    if (!ready) return;
    const lead = state.party.find((c) => !isFainted(c)) || state.party[0];
    const floor = isFinal ? 22 : 16;
    const level = Math.max(floor, Math.min(CONFIG.levelCap, (lead ? lead.level : floor) + 2));
    const boss = makeInstance(bossId, level);
    markSeen(state, boss.id);
    const outcome = await runBattle(ctx, boss, { isBoss: true, canRun: false });
    if (outcome.result === 'win') {
      awardSpoils(state, boss);
      if (isFinal) {
        state.flags.deadlockDefeated = true; save(state);
        await ending(ctx);
      } else {
        state.flags.bossDefeated = true; save(state);
        await say(screen, input, render, ['기술부채가 무너졌다! 빌드가 초록불이다.', '보스 아레나에 영역 포털(P)이 열렸다 — 더 깊은 프로덕션 서버로 통한다.'], { speaker: '코어' });
      }
    } else {
      await postBattle(outcome, boss, { boss: true });
    }
    screen.invalidate();
  }

  // ---- 영역 포털: boss-gated unlock, then free 1<->2 travel ----
  async function enterMap(destId) {
    const dest = mapById(destId);
    map = dest; state.mapId = destId;
    const p = dest.portal || dest.spawn;
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
      .find((c) => { const t = tileInfo(dest, c.x, c.y); return t.walkable && t.kind !== 'portal' && t.kind !== 'bridge'; });
    const land = adj || dest.spawn;
    state.pos = { x: land.x, y: land.y };
    if (!state.flags.visited) state.flags.visited = {};
    if (!state.flags.visited[destId]) {
      state.flags.visited[destId] = true; save(state);
      await rollCharm(ctx, { reason: `${dest.name}에 들어서며 행운 부적을 하나 뽑는다!` });
    }
    screen.invalidate();
  }

  async function usePortal() {
    if (map.id === 'codebase' && !state.flags.bossDefeated) {
      await say(screen, input, render, ['영역 포털이 잠겨 있다.', '기술부채(B)를 먼저 물리쳐야 열린다.'], { speaker: '포털' });
      return;
    }
    const destId = map.id === 'codebase' ? 'prod' : 'codebase';
    await say(screen, input, render, [`영역 포털이 빛난다 — ${mapById(destId).name}(으)로 이동한다.`], { speaker: '포털' });
    await enterMap(destId);
  }

  // ---- 관문지기(릴리스 매니저): a DEV-class duo guarding the bridge ----
  async function questBattle() {
    if (state.flags.prodBridge) {
      await say(screen, input, render, ['다리는 이미 내려놨어. 프로덕션, 조심하라고.'], { speaker: '릴리스 매니저' });
      return;
    }
    await say(screen, input, render, [
      '거기 서. 이 다리 너머는 진짜 프로덕션이야.',
      '검증 안 된 빌드는 못 보내 — 내 파이프라인을 통과해봐.',
      '내 개발자 팀(개발자 클래스 2)을 이기면, 다리를 내려주지.',
    ], { speaker: '릴리스 매니저' });
    const ready = await confirm(screen, input, render, '관문지기와 대결한다? (개발자 클래스 2마리)');
    if (!ready) return;
    const lead = state.party.find((c) => !isFainted(c)) || state.party[0];
    const lv = Math.max(12, Math.min(CONFIG.levelCap, lead ? lead.level + 1 : 12));
    const team = [['HOPPER', '그레이스 호퍼'], ['STACKOVF', '스택 오버플로우']];
    let won = true;
    for (let i = 0; i < team.length; i++) {
      const [id, nm] = team[i];
      const mon = makeInstance(id, lv); mon.catchRate = 0; markSeen(state, id);
      await say(screen, input, render, [i === 0 ? `릴리스 매니저: "가라, ${nm}!"` : `릴리스 매니저: "아직 멀었어 — ${nm}!"`], { speaker: '릴리스 매니저' });
      const outcome = await runBattle(ctx, mon, { isBoss: true, canRun: false });
      if (outcome.result !== 'win') { won = false; if (outcome.result === 'lose') await blackout('관문지기에게 패배했다...'); break; }
      awardSpoils(state, mon);
    }
    if (won) {
      state.flags.prodBridge = true; save(state);
      await say(screen, input, render, ['...통과 승인. 빌드 그린.', '약속대로 다리를 내려주마 — 프로덕션은 이제 네 손에 달렸어.'], { speaker: '릴리스 매니저' });
    }
    screen.invalidate();
  }

  async function heal() {
    await say(screen, input, render, ['리팩터 클리닉이 윙윙거린다. 잠시만...'], { speaker: '클리닉' });
    // animate HP refill
    for (let t = 0; t <= 10; t++) {
      for (const c of state.party) c.hp = Math.round((c.maxHp) * (t / 10));
      render(); screen.flush(); await sleep(60);
    }
    for (const c of state.party) healInstance(c);
    render(); screen.flush();
    await say(screen, input, render, ['올 그린. 파티가 완전히 회복됐다.'], { speaker: '클리닉' });
  }

  async function talk(x, y) {
    const lines = (map.npcs[`${x},${y}`] || ['...']).slice();
    // occasionally gift an item, gated by a step cooldown so you can't farm it
    const key = `${x},${y}`;
    const last = state.npcGifts[key];
    const ready = last == null || (state.stats.steps - last) >= 12;
    if (ready && chance(0.5)) {
      const id = weightedPick(GIFT_TABLE, (g) => g.weight).id;
      addItem(state, id, 1);
      state.npcGifts[key] = state.stats.steps;
      lines.push(`…이거 가져가. 「${itemById(id).name}」 하나 챙겨뒀어.`);
    }
    await say(screen, input, render, lines, { speaker: '개발자' });
  }

  // field bag: use HP / revive items out of battle (토큰 items are battle-only)
  async function fieldBag() {
    for (;;) {
      const ids = Object.keys(state.inventory || {}).filter((id) => itemCount(state, id) > 0 && itemById(id) && itemById(id).kind !== 'pp');
      if (!ids.length) { await say(screen, input, render, ['가방에 필드에서 쓸 아이템이 없다. (토큰 충전기는 전투 전용)'], { speaker: '가방' }); return; }
      const items = ids.map((id) => { const it = itemById(id); return { label: `${it.name}  ×${itemCount(state, id)}`, hint: it.desc }; });
      const ii = await menu(screen, input, render, items, { x: 4, y: 6, width: 56, allowCancel: true, bg: PAL.bgDeep, title: '가방' });
      if (ii < 0) return;
      const it = itemById(ids[ii]);
      const cand = state.party.filter((c) => it.kind === 'revive' ? isFainted(c) : (!isFainted(c) && c.hp < c.maxHp));
      if (!cand.length) { await say(screen, input, render, [it.kind === 'revive' ? '다운된 동료가 없다.' : '회복이 필요한 동료가 없다.'], { speaker: '가방' }); continue; }
      const targets = cand.map((c) => ({ label: `${c.name}  Lv.${c.level}  ${Math.max(0, c.hp)}/${c.maxHp}`, color: isFainted(c) ? PAL.bad : PAL.ink }));
      const ti = await menu(screen, input, render, targets, { x: 4, y: 6, width: 56, allowCancel: true, bg: PAL.bgDeep, title: it.kind === 'revive' ? '누구를 부활?' : '누구를 회복?' });
      if (ti < 0) continue;
      const target = cand[ti];
      if (it.kind === 'revive') { target.hp = Math.max(1, Math.round(target.maxHp * it.amount)); target.status = null; target.statusTurns = 0; target.buffs = {}; }
      else { const before = target.hp; target.hp = it.amount === 'full' ? target.maxHp : Math.min(target.maxHp, target.hp + it.amount); }
      removeItem(state, it.id, 1);
      await say(screen, input, render, [`${it.name} 사용 — ${target.name}${it.kind === 'revive' ? ' 부활!' : ' 회복!'} (HP ${Math.max(0, target.hp)}/${target.maxHp})`], { speaker: '가방' });
    }
  }

  async function openMenu() {
    const items = [
      { label: '파티 & 리포지토리', hint: '동료를 살펴보고 팀을 편성한다' },
      { label: '가방', hint: 'HP·부활 아이템을 쓴다' },
      { label: '행운 부적', hint: '보유한 부적과 전체 목록을 확인한다' },
      { label: '도감 & 상성', hint: '도구·모델 스탯과 클래스 상성 확인' },
      { label: '저장', hint: 'savegame.json에 진행 상황을 쓴다' },
      { label: '종료 (자동 저장)', hint: '타이틀로 나간다' },
      { label: '닫기', hint: '코드베이스로 돌아간다' },
    ];
    const pick = await menu(screen, input, render, items, { x: 4, y: 6, width: 44, allowCancel: true, bg: PAL.bgDeep, title: '메뉴' });
    if (pick === 0) { await openRepo(ctx); screen.invalidate(); }
    else if (pick === 1) { await fieldBag(); screen.invalidate(); }
    else if (pick === 2) { await openCharmDex(ctx); screen.invalidate(); }
    else if (pick === 3) { await openInfo(ctx); screen.invalidate(); }
    else if (pick === 4) { save(state); await say(screen, input, render, ['진행 상황을 저장했다.'], { speaker: '시스템' }); }
    else if (pick === 5) { save(state); return 'quit'; }
    return null;
  }

  // trigger the POI under the player after a move
  async function onEnter(kind, x, y) {
    if (kind === 'grass') { if (chance(CONFIG.encounter.chancePerStep)) await startWild(); }
    else if (kind === 'gacha') { await openCrate(ctx); screen.invalidate(); }
    else if (kind === 'healer') { await heal(); }
    else if (kind === 'shop') { await openShop(ctx); screen.invalidate(); }
    else if (kind === 'npc') { await talk(x, y); }
    else if (kind === 'quest') { await questBattle(); }
    else if (kind === 'portal') { await usePortal(); }
    else if (kind === 'boss') { await fightBoss(); }
    else if (kind === 'gate') { await say(screen, input, render, ['sudo 게이트. 당신의 커밋을 알아보고 스르륵 열린다.'], { speaker: '게이트' }); }
  }

  // ---- main loop ----
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  // apply owned charms on entry (new game or resume), then the start-of-run roll
  syncCharms(state);
  if (!state.flags.visited) state.flags.visited = {};
  if (!state.flags.firstCharm) {
    state.flags.firstCharm = true;
    state.flags.visited[map.id] = true; // starting map counts as visited (no double roll)
    await rollCharm(ctx, { reason: '모험을 시작하며 행운 부적을 하나 뽑는다!' });
    screen.invalidate();
  }
  render(); screen.flush();
  for (;;) {
    const k = await input.next();
    if (k === 'q') {
      const yes = await confirm(screen, input, render, '저장하고 타이틀로 나갈까?');
      if (yes) { save(state); return 'quit'; }
      render(); screen.flush(); continue;
    }
    if (k === 'enter' || k === 'space') {
      const r = await openMenu();
      if (r === 'quit') return 'quit';
      render(); screen.flush();
      continue;
    }
    if (DIRS[k]) {
      state.facing = k;
      const [dx, dy] = DIRS[k];
      const nx = state.pos.x + dx, ny = state.pos.y + dy;
      if (walkableAt(nx, ny)) {
        state.pos.x = nx; state.pos.y = ny;
        state.stats.steps += 1;
        render(); screen.flush();
        const kind = tileInfo(map, nx, ny).kind;
        await onEnter(kind, nx, ny);
        render(); screen.flush();
      } else {
        // small "bump": redraw (could add a nudge later)
        render(); screen.flush();
      }
    }
  }
}

// ---- victory sequence ----
async function ending(ctx) {
  const { screen, input, state } = ctx;
  screen.clear([8, 10, 16]);
  screen.flush();
  await sleep(300);
  const lines = [
    '', '', '',
    '데드락이 풀린다. 멈춰 있던 프로세스들이 일제히 다시 흐른다.',
    '', '0', '',
    '코드베이스도, 프로덕션도 안정됐다. 모든 빌드가 초록불이다.',
    '당신은 기어이, 진짜 디버거가 되었다.',
  ];
  for (let i = 0; i < lines.length; i++) {
    screen.textCenter(4 + i, lines[i], lines[i] === '0' ? PAL.good : PAL.ink, [8, 10, 16]);
    screen.flush();
    await sleep(220);
  }
  screen.textCenter(screen.h - 6, `도감 ${dexCaughtCount(state)}/${dexTotal()}종  ·  버그 ${state.stats.battlesWon}마리 처치  ·  샤이니 ${state.stats.shinies}`, PAL.gold, [8, 10, 16]);
  screen.textCenter(screen.h - 3, '[Enter] 계속 플레이 — 도감 완성은 당신의 몫', PAL.accent, [8, 10, 16]);
  screen.flush();
  input.drain();
  for (;;) { const k = await input.next(); if (k === 'enter' || k === 'space') break; }
}
