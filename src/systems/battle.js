// battle.js — turn-based battle with truecolor sprites, animated HP drains, hit
// flashes, status effects, the class triangle, catching ("patching"), and
// level-up rewards. Entry point: runBattle(ctx, enemy, opts).

import { PAL, classColor, rarityColor } from '../ansi.js';
import { sleep, flash } from '../fx/anim.js';
import { SPRITES } from '../data/sprites.js';
import {
  CONFIG, effectiveness, catchChance, genomeVerdict, movePp,
} from '../data/config.js';
import { speciesById, moveByName } from '../data/creatures.js';
import { gainXp, healInstance, isFainted } from './creatureInstance.js';
import { addCreature, markSeen, removeItem, itemCount } from '../state.js';
import { itemById } from '../data/items.js';
import { charmTotals } from '../data/charms.js';
import {
  drawCreature, hpBar, panel, menu, rarityTag, RARITY_GLYPH,
} from '../ui.js';
import { CLASS_KO, STATUS_KO, RARITY_KO, EFFECT_KO } from '../data/i18n.js';

const EFF_TXT = { hi: '효과가 굉장했다!', lo: '효과가 별로인 듯하다...' };

// --- layout (assumes an ~80x24 stage) ---
const L = {
  enemyPanel: { x: 2, y: 1, w: 36, h: 5 },
  playerPanel: { x: 42, y: 11, w: 36, h: 5 },
  msg: { x: 2, y: 18, w: 76, h: 6 },
};

function monoPalette(id, color) {
  const s = SPRITES[id]; const p = {};
  if (s) for (const k of Object.keys(s.pal)) p[k] = color;
  return p;
}

export async function runBattle(ctx, enemy, opts = {}) {
  const { screen, input, state } = ctx;
  const isBoss = !!opts.isBoss;
  const canRun = opts.canRun !== false && !isBoss;
  markSeen(state, enemy.id);

  // active player creature
  let player = state.party.find((c) => !isFainted(c));
  if (!player) return { result: 'lose' };

  const enemySprite = SPRITES[enemy.id];
  const eW = enemySprite ? Math.max(...enemySprite.px.map((r) => r.length)) : 12;
  const eH = enemySprite ? Math.ceil(enemySprite.px.length / 2) : 6;
  const enemyPos = { x: 74 - eW, y: 1 };
  const playerPos = { x: 6, y: L.msg.y - 8 };

  let scene = { eHp: enemy.hp, pHp: player.hp, eFlash: null, pFlash: null, eDX: 0, pDX: 0, bottomFill: true };

  // 행운 부적 (luck charms): power/catch buffs + revive charges for this battle
  const charm = charmTotals(state.charms || []);
  let reviveCharges = charm.reviveCharges;

  // ---- per-move 토큰 (PP) — refills to full at battle start, per creature ----
  const ppMap = new Map(); // uid -> { moveName: remaining }
  function initPp(creature) {
    if (!creature || ppMap.has(creature.uid)) return;
    const m = {};
    for (const mn of creature.moves) { const mv = moveByName(mn); if (mv) m[mn] = movePp(mv); }
    ppMap.set(creature.uid, m);
  }
  const ppOf = (creature, mn) => { const m = ppMap.get(creature.uid); return m && m[mn] != null ? m[mn] : 0; };
  const ppMax = (mn) => { const mv = moveByName(mn); return mv ? movePp(mv) : 0; };
  function spendPp(creature, mn) { const m = ppMap.get(creature.uid); if (m && m[mn] > 0) m[mn] -= 1; }
  for (const c of state.party) initPp(c);
  initPp(enemy);
  // when 토큰 runs dry the creature flails: typeless, no STAB, modest damage
  const STRUGGLE = { name: '__struggle', nameKo: '발버둥', classTag: 'NEUTRAL', power: 30, acc: 100, effect: null, descKo: '토큰이 바닥나 무작정 몸을 던진다.' };

  function refillPp(creature) {
    const m = ppMap.get(creature.uid); if (!m) return;
    for (const mn of Object.keys(m)) m[mn] = ppMax(mn);
  }
  const bagIds = () => Object.keys(state.inventory || {}).filter((id) => itemCount(state, id) > 0 && itemById(id));

  async function pickTarget(filterFn, prompt) {
    const cand = state.party.filter(filterFn);
    if (!cand.length) return null;
    const items = cand.map((c) => ({ label: `${c.name}  Lv.${c.level}  ${Math.max(0, c.hp)}/${c.maxHp}`, color: isFainted(c) ? PAL.bad : PAL.ink }));
    const si = await menu(screen, input, () => { renderScene(); drawMsgBox(); screen.text(L.msg.x + 2, L.msg.y + 1, prompt, PAL.accent, PAL.bgPanel); },
      items, { x: L.msg.x + 3, y: L.msg.y + 2, width: 64, allowCancel: true, bg: PAL.bgPanel });
    return si < 0 ? null : cand[si];
  }

  // open the bag; returns true if an item was actually used (consumes the turn)
  async function openBag() {
    const ids = bagIds();
    if (!ids.length) { await line('가방이 비어 있다.', { ms: 700 }); return false; }
    const items = ids.map((id) => { const it = itemById(id); return { label: `${it.name}  ×${itemCount(state, id)}`, hint: it.desc, color: PAL.ink }; });
    const ii = await menu(screen, input, () => { renderScene(); drawMsgBox(); screen.text(L.msg.x + 2, L.msg.y + 1, '가방:', PAL.accent, PAL.bgPanel); },
      items, { x: L.msg.x + 3, y: L.msg.y + 2, width: 70, allowCancel: true, bg: PAL.bgPanel });
    if (ii < 0) return false;
    const it = itemById(ids[ii]);
    let target;
    if (it.kind === 'revive') { target = await pickTarget(isFainted, '누구를 부활시킬까?'); if (!target) return false; }
    else if (it.kind === 'hp') { target = await pickTarget((c) => !isFainted(c) && c.hp < c.maxHp, '누구를 회복할까?'); if (!target) { await line('회복할 대상이 없다.', { ms: 700 }); return false; } }
    else { target = await pickTarget((c) => !isFainted(c), '누구의 토큰을 채울까?'); if (!target) return false; }

    if (it.kind === 'hp') {
      const before = target.hp;
      target.hp = it.amount === 'full' ? target.maxHp : Math.min(target.maxHp, target.hp + it.amount);
      if (target === player) scene.pHp = target.hp;
      await line(`${it.name} 사용! ${target.name} HP +${target.hp - before}.`, { ms: 800, fg: PAL.good });
    } else if (it.kind === 'revive') {
      target.hp = Math.max(1, Math.round(target.maxHp * it.amount)); target.status = null; target.statusTurns = 0; target.buffs = {};
      if (target === player) scene.pHp = target.hp;
      await line(`${it.name} 사용! ${target.name} 부활 (HP ${target.hp}).`, { ms: 900, fg: PAL.good });
    } else {
      refillPp(target);
      await line(`${it.name} 사용! ${target.name}의 토큰을 가득 채웠다.`, { ms: 800, fg: PAL.accent });
    }
    removeItem(state, it.id, 1);
    return true;
  }

  function drawCombatant(p, x, y, hpShown, info, flashColor, dx) {
    // info panel
    panel(screen, info.x, info.y, info.w, info.h, { fg: PAL.inkFaint, bg: PAL.bgPanel });
    const nm = p.name + ((p.plus || 0) > 0 ? ' +' + p.plus : '') + (p.shiny ? ' ✦' : '');
    screen.text(info.x + 2, info.y + 1, nm, p.shiny ? PAL.shiny : PAL.white, PAL.bgPanel);
    screen.text(info.x + info.w - 7, info.y + 1, `Lv.${p.level}`, PAL.inkDim, PAL.bgPanel);
    screen.text(info.x + 2, info.y + 2, CLASS_KO[p.classTag] || p.classTag, classColor(p.classTag), PAL.bgPanel);
    const rc = rarityColor(p.rarity);
    screen.text(info.x + info.w - 12, info.y + 2, `${RARITY_GLYPH[p.rarity] || ''} ${RARITY_KO[p.rarity] || p.rarity}`, rc, PAL.bgPanel);
    if (p.status) screen.text(info.x + 9, info.y + 2, `[${STATUS_KO[p.status] || p.status}]`, PAL.bad, PAL.bgPanel);
    // hp bar row (one row above the bottom border)
    const barRow = info.y + info.h - 2;
    screen.text(info.x + 1, barRow, 'HP', PAL.inkDim, PAL.bgPanel);
    hpBar(screen, info.x + 4, barRow, info.w - 14, hpShown, p.maxHp, { bg: PAL.bgPanel });
    screen.text(info.x + info.w - 9, barRow, `${Math.max(0, Math.round(hpShown))}/${p.maxHp}`.padStart(8), PAL.inkDim, PAL.bgPanel);
    // sprite (with optional flash + jitter)
    if (flashColor) screen.pixelBlit(x + dx, y, SPRITES[p.id].px, monoPalette(p.id, flashColor), { bg: null });
    else drawCreature(screen, x + dx, y, p.id, { shiny: p.shiny });
  }

  function platform(cx, cy, w, color) {
    const half = Math.floor(w / 2);
    for (let i = -half; i <= half; i++) {
      const t = 1 - Math.abs(i) / (half + 1);
      if (t > 0.15) screen.put(cx + i, cy, '▁', color, null);
    }
  }

  function renderScene() {
    screen.clear(PAL.bgDeep);
    // arena bands
    for (let y = 0; y < screen.h; y++) {
      const c = y < 10 ? [16, 18, 26] : y < 17 ? [20, 22, 32] : [14, 16, 24];
      for (let x = 0; x < screen.w; x++) screen.put(x, y, ' ', null, c);
    }
    screen.hline(0, 10, screen.w, '─', [40, 44, 60], null);
    // platforms under sprites
    platform(enemyPos.x + Math.floor(eW / 2), enemyPos.y + eH, eW + 2, [50, 54, 74]);
    platform(playerPos.x + 6, playerPos.y + 7, 16, [50, 54, 74]);
    drawCombatant(enemy, enemyPos.x, enemyPos.y, scene.eHp, L.enemyPanel, scene.eFlash, scene.eDX);
    drawCombatant(player, playerPos.x, playerPos.y, scene.pHp, L.playerPanel, scene.pFlash, scene.pDX);
    // player XP sliver
    const xpInfo = L.playerPanel;
    // (xp shown in panel bottom-2 if room) — keep light
  }

  function drawMsgBox() {
    panel(screen, L.msg.x, L.msg.y, L.msg.w, L.msg.h, { fg: PAL.accent, bg: PAL.bgPanel });
  }

  // a single auto-advancing battle line
  async function line(text, opts2 = {}) {
    renderScene();
    drawMsgBox();
    screen.text(L.msg.x + 2, L.msg.y + 2, text.slice(0, L.msg.w - 4), opts2.fg || PAL.ink, PAL.bgPanel);
    screen.flush();
    const ms = opts2.ms != null ? opts2.ms : 720;
    input.drain();
    // wait ms or until a key
    const t0 = nowless(); // monotonic-ish via loop
    for (let waited = 0; waited < ms; waited += 24) {
      if (input.queue.length) { input.drain(); break; }
      await sleep(24);
    }
  }

  function nowless() { return 0; }

  async function tweenHp(side, from, to) {
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const t = 1 - Math.pow(1 - s / steps, 3);
      const v = from + (to - from) * t;
      if (side === 'enemy') scene.eHp = v; else scene.pHp = v;
      renderScene(); drawMsgBox();
      // keep current msg by leaving box blank is fine; caller draws lines around
      screen.flush();
      await sleep(18);
    }
    if (side === 'enemy') scene.eHp = to; else scene.pHp = to;
  }

  async function hitFlash(side, color = PAL.white) {
    for (let i = 0; i < 2; i++) {
      if (side === 'enemy') { scene.eFlash = color; scene.eDX = 1; } else { scene.pFlash = color; scene.pDX = 1; }
      renderScene(); drawMsgBox(); screen.flush(); await sleep(40);
      if (side === 'enemy') { scene.eFlash = null; scene.eDX = -1; } else { scene.pFlash = null; scene.pDX = -1; }
      renderScene(); drawMsgBox(); screen.flush(); await sleep(40);
    }
    scene.eFlash = scene.pFlash = null; scene.eDX = scene.pDX = 0;
  }

  function effStats(p) {
    return {
      atk: p.atk * (p.buffs.atkMult || 1),
      def: p.def * (p.buffs.defMult || 1),
      spd: p.spd * (p.buffs.spdMult || 1),
      crit: CONFIG.crit.chance + (p.buffs.critBonus || 0),
    };
  }

  function calcDamage(attacker, move, defender) {
    const A = effStats(attacker).atk;
    const D = effStats(defender).def;
    const Lv = attacker.level;
    // 예리함의 부적: +power to the player's moves only (the enemy doesn't own charms)
    const power = move.power + (attacker !== enemy ? charm.power : 0);
    const base = Math.floor((((2 * Lv) / 5 + 2) * power * (A / D)) / 50 + 2);
    const eff = effectiveness(move.classTag, defender.classTag);
    const stab = move.classTag === attacker.classTag ? CONFIG.stab : 1.0; // 자속 보정
    const isCrit = Math.random() < effStats(attacker).crit;
    const rand = 0.85 + Math.random() * 0.15;
    let dmg = Math.floor(base * eff * stab * (isCrit ? CONFIG.crit.mult : 1) * rand);
    return { dmg: Math.max(1, dmg), eff, isCrit, stab };
  }

  // execute one move from attacker -> defender. returns true if defender fainted.
  async function performMove(attacker, move, defender, atkSide) {
    const defSide = atkSide === 'enemy' ? 'player' : 'enemy';
    const who = atkSide === 'enemy' ? '야생 ' + attacker.name : attacker.name;
    spendPp(attacker, move.name); // 토큰 consumed on attempt (struggle isn't tracked)
    await line(`${who}의 ${move.nameKo}!`, { ms: 560 });
    if (Math.random() * 100 >= move.acc) { await line('...하지만 빗나갔다!', { ms: 700 }); return false; }

    if (move.power > 0) {
      const { dmg, eff, isCrit } = calcDamage(attacker, move, defender);
      await hitFlash(defSide);
      const from = defender.hp;
      defender.hp = Math.max(0, defender.hp - dmg);
      await tweenHp(defSide, from, defender.hp);
      if (isCrit) await line('급소에 맞았다!', { ms: 520, fg: PAL.warn });
      if (eff > 1) await line(EFF_TXT.hi, { ms: 600, fg: PAL.good });
      else if (eff < 1 && eff > 0) await line(EFF_TXT.lo, { ms: 600, fg: PAL.inkDim });
    }

    // effects (apply on hit)
    if (move.effect === 'heal') {
      const heal = Math.round(0.33 * attacker.maxHp);
      const from = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      await tweenHp(atkSide, from, attacker.hp);
      await line(`${attacker.name} HP를 ${attacker.hp - from} 회복했다.`, { ms: 600, fg: PAL.good });
    } else if (move.effect === 'poison') {
      if (defender.status !== 'poison') { defender.status = 'poison'; await line(`${defender.name} 버그유출 상태가 됐다!`, { ms: 700, fg: PAL.bad }); }
    } else if (move.effect === 'slow') {
      defender.buffs.spdMult = CONFIG.statusEffect.slow.spdMult;
      await line(`${defender.name}의 속도가 떨어졌다!`, { ms: 600, fg: PAL.inkDim });
    } else if (move.effect === 'weaken') {
      defender.buffs.atkMult = CONFIG.statusEffect.weaken.atkMult;
      await line(`${defender.name}의 공격이 떨어졌다!`, { ms: 600, fg: PAL.inkDim });
    } else if (move.effect === 'shield') {
      attacker.buffs.defMult = CONFIG.statusEffect.shield.defMult;
      await line(`${attacker.name}의 방어가 단단해졌다!`, { ms: 600, fg: PAL.accent });
    } else if (move.effect === 'crit_up') {
      attacker.buffs.critBonus = CONFIG.crit.critUpBonus;
      await line(`${attacker.name} 집중! 치명타 확률이 올랐다!`, { ms: 600, fg: PAL.accent });
    }
    return defender.hp <= 0;
  }

  // poison tick at end of round
  async function poisonTick(p, side) {
    if (p.status !== 'poison' || p.hp <= 0) return;
    const dmg = Math.max(1, Math.round(p.maxHp * CONFIG.statusEffect.poison.dotPercent));
    const from = p.hp;
    p.hp = Math.max(0, p.hp - dmg);
    await hitFlash(side, PAL.bad);
    await tweenHp(side, from, p.hp);
    await line(`${p.name} 버그유출 피해! (-${dmg})`, { ms: 620, fg: PAL.bad });
  }

  function enemyChooseMove() {
    // only moves with 토큰 left; flail if the enemy is fully tapped out
    const moves = enemy.moves.map(moveByName).filter(Boolean).filter((m) => ppOf(enemy, m.name) > 0);
    if (!moves.length) return STRUGGLE;
    // 65% pick a strong damaging move, else random
    if (Math.random() < 0.65) {
      const dmgers = moves.filter((m) => m.power > 0).sort((a, b) => b.power - a.power);
      if (dmgers.length) return dmgers[Math.floor(Math.random() * Math.min(2, dmgers.length))];
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // ---- catch ("patch") ----
  async function tryCatch() {
    const hpFrac = enemy.hp / enemy.maxHp;
    const items = CONFIG.balls.map((b) => {
      const pct = Math.round(Math.min(0.97, catchChance(enemy.catchRate, hpFrac, b.mult, enemy.status) * charm.catchMult) * 100);
      const afford = state.tokens >= b.cost;
      const costTxt = b.cost > 0 ? `${b.cost}◈` : '무료';
      return { label: `${b.name}  ${costTxt}  ·  영입 ${pct}%`, disabled: !afford, color: afford ? PAL.ink : PAL.inkFaint };
    });
    const ballIdx = await menu(screen, input, () => { renderScene(); drawMsgBox(); screen.text(L.msg.x + 2, L.msg.y + 1, `어떻게 영입할까?  (보유 ${state.tokens}◈)`, PAL.accent, PAL.bgPanel); },
      items, { x: L.msg.x + 3, y: L.msg.y + 2, width: 70, allowCancel: true, bg: PAL.bgPanel });
    if (ballIdx < 0) return null;
    const ball = CONFIG.balls[ballIdx];
    state.tokens -= ball.cost; // license consumed on attempt (win or lose)
    const chance = Math.min(0.97, catchChance(enemy.catchRate, hpFrac, ball.mult, enemy.status) * charm.catchMult);
    await line(`${ball.name}(으)로 영입 시도...`, { ms: 700 });
    // shake animation
    const shakes = CONFIG.catch.shakes;
    let broke = false;
    for (let s = 1; s <= shakes; s++) {
      // tilt the sprite
      for (const dx of [1, -1, 0]) {
        scene.eDX = dx; renderScene(); drawMsgBox();
        screen.text(L.msg.x + 2, L.msg.y + 2, `협상… ${s}`.padEnd(16), PAL.inkDim, PAL.bgPanel);
        screen.flush(); await sleep(150);
      }
      if (Math.random() >= Math.pow(chance, 1 / shakes)) { broke = (s < shakes) ? true : false; if (broke) break; }
    }
    // final resolution uses the real chance
    const success = Math.random() < chance;
    if (success) {
      await flash(screen, () => { renderScene(); drawMsgBox(); }, { color: rarityColor(enemy.rarity), times: 2, on: 60, off: 60 });
      return true;
    }
    await line(`아쉽! ${enemy.name}이(가) 영입을 거절했다!`, { ms: 900, fg: PAL.warn });
    return false;
  }

  // ---- main loop ----
  await line(isBoss ? `${enemy.name}이(가) 모습을 드러냈다!` : `야생 ${enemy.name} 출현!`, { ms: 1000, fg: rarityColor(enemy.rarity) });

  for (;;) {
    // ensure a living player creature
    if (isFainted(player)) {
      const next = state.party.find((c) => !isFainted(c));
      if (!next) return { result: 'lose' };
      player = next;
    }

    // ---- action menu ----
    const actions = [
      { id: 'fight', label: '공격', color: PAL.good },
      { id: 'bag', label: '가방', color: PAL.accent, disabled: bagIds().length === 0 },
      { id: 'patch', label: '영입', color: PAL.accent, disabled: isBoss || enemy.catchRate <= 0 },
      { id: 'swap', label: '교체', color: PAL.warn, disabled: state.party.filter((c) => !isFainted(c)).length <= 1 },
      { id: 'run', label: canRun ? '도망' : '도망 불가', color: PAL.inkDim, disabled: !canRun },
    ];
    const act = await menu(screen, input, () => {
      renderScene(); drawMsgBox();
      screen.text(L.msg.x + 2, L.msg.y + 1, `${player.name}, 무엇을 할까?`, PAL.accent, PAL.bgPanel);
    }, actions, { x: L.msg.x + 4, y: L.msg.y + 2, width: 60, cols: 2, colW: 24, rowGap: 1, allowCancel: false, bg: PAL.bgPanel });
    const choice = actions[act].id;

    let playerMove = null;
    let playerAction = 'fight';

    if (choice === 'fight') { // FIGHT
      // only list moves that resolve (guards against stale names from old saves)
      const validNames = player.moves.filter((mn) => moveByName(mn));
      // all 토큰 spent? no move is usable — flail with 발버둥
      if (!validNames.some((mn) => ppOf(player, mn) > 0)) {
        await line('쓸 토큰이 없다! 발버둥친다!', { ms: 700, fg: PAL.warn });
        playerMove = STRUGGLE;
      } else {
        const moveItems = validNames.map((mn) => {
          const m = moveByName(mn);
          const cur = ppOf(player, mn), mx = ppMax(mn);
          const stabTag = (m.power > 0 && m.classTag === player.classTag) ? ' · 자속' : '';
          return {
            label: `${m.nameKo}`,
            hint: `${CLASS_KO[m.classTag] || m.classTag} · 위력 ${m.power || '--'} · 토큰 ${cur}/${mx}${stabTag}${m.effect ? ' · ' + (EFFECT_KO[m.effect] || m.effect) : ''}`,
            color: classColor(m.classTag),
            disabled: cur <= 0,
          };
        });
        const mi = await menu(screen, input, () => {
          renderScene(); drawMsgBox();
          screen.text(L.msg.x + 2, L.msg.y + 1, '기술 선택:', PAL.accent, PAL.bgPanel);
        }, moveItems, { x: L.msg.x + 4, y: L.msg.y + 2, width: 70, cols: 2, colW: 34, rowGap: 1, allowCancel: true, bg: PAL.bgPanel });
        if (mi < 0) continue;
        playerMove = moveByName(validNames[mi]);
      }
    } else if (choice === 'bag') { // ITEM
      const used = await openBag();
      if (!used) continue; // cancelled / nothing usable — no turn lost
      playerAction = 'item';
    } else if (choice === 'patch') { // PATCH
      const res = await tryCatch();
      if (res === null) continue; // cancelled
      if (res === true) {
        // captured!
        enemy.hp = Math.max(1, enemy.hp);
        return { result: 'caught', creature: enemy };
      }
      playerAction = 'caught-fail'; // enemy still gets a turn
    } else if (choice === 'swap') { // SWAP
      const swapItems = state.party.map((c, i) => ({ label: `${c.name}  Lv.${c.level}  ${Math.max(0, c.hp)}/${c.maxHp}`, disabled: isFainted(c) || c === player, color: c === player ? PAL.inkDim : PAL.ink }));
      const si = await menu(screen, input, () => { renderScene(); drawMsgBox(); screen.text(L.msg.x + 2, L.msg.y + 1, '교체할 동료:', PAL.accent, PAL.bgPanel); },
        swapItems, { x: L.msg.x + 3, y: L.msg.y + 2, width: 60, allowCancel: true, bg: PAL.bgPanel });
      if (si < 0) continue;
      player = state.party[si];
      scene.pHp = player.hp;
      await line(`가라, ${player.name}!`, { ms: 700, fg: PAL.good });
      playerAction = 'swap';
    } else if (choice === 'run') { // RUN
      if (Math.random() < 0.85) { state.stats.escapes++; return { result: 'run' }; }
      await line('도망칠 수 없었다!', { ms: 800, fg: PAL.warn });
      playerAction = 'run-fail';
    }

    // ---- resolve the round ----
    const enemyMove = enemyChooseMove();
    const pSpd = effStats(player).spd;
    const eSpd = effStats(enemy).spd;
    // who acts first: only if player chose to fight do they have a move; otherwise enemy acts (player used a non-attack turn)
    const playerActsFirst = pSpd >= eSpd;

    const enemyTurn = async () => {
      if (enemy.hp <= 0) return false;
      const fainted = await performMove(enemy, enemyMove, player, 'enemy');
      return fainted;
    };
    const playerTurn = async () => {
      if (!playerMove || player.hp <= 0) return false;
      return performMove(player, playerMove, enemy, 'player');
    };

    if (playerMove) {
      if (playerActsFirst) {
        if (await playerTurn()) { /* enemy fainted */ }
        if (enemy.hp > 0) await enemyTurn();
      } else {
        await enemyTurn();
        if (player.hp > 0) await playerTurn();
      }
    } else {
      // player used a non-attack action (failed catch / failed run / swap)
      await enemyTurn();
    }

    // end-of-round poison
    await poisonTick(player, 'player');
    await poisonTick(enemy, 'enemy');

    // ---- resolution ----
    if (enemy.hp <= 0) {
      await line(`${enemy.name} 격퇴!`, { ms: 900, fg: PAL.good });
      return { result: 'win' };
    }
    if (isFainted(player)) {
      await line(`${player.name} 다운!`, { ms: 900, fg: PAL.bad });
      // 불사조의 부적: revive the fallen creature once per battle
      if (reviveCharges > 0) {
        reviveCharges -= 1;
        player.hp = Math.max(1, Math.round(player.maxHp * 0.5));
        player.status = null; player.statusTurns = 0; player.buffs = {};
        scene.pHp = player.hp;
        await hitFlash('player', PAL.gold);
        await line(`불사조의 부적이 빛난다 — ${player.name} 부활! (HP ${player.hp})`, { ms: 1100, fg: PAL.gold });
        continue;
      }
      const next = state.party.find((c) => !isFainted(c));
      if (!next) return { result: 'lose' };
      // prompt swap
      const swapItems = state.party.map((c) => ({ label: `${c.name}  Lv.${c.level}  ${Math.max(0, c.hp)}/${c.maxHp}`, disabled: isFainted(c), color: PAL.ink }));
      const si = await menu(screen, input, () => { renderScene(); drawMsgBox(); screen.text(L.msg.x + 2, L.msg.y + 1, '내보낼 동료:', PAL.accent, PAL.bgPanel); },
        swapItems, { x: L.msg.x + 3, y: L.msg.y + 2, width: 60, allowCancel: false, bg: PAL.bgPanel });
      player = state.party[si];
      scene.pHp = player.hp;
    }
  }
}

// award XP + tokens to the party after a win; returns a summary for the caller to narrate
export function awardSpoils(state, enemy) {
  const rarityMult = CONFIG.rarityMult[enemy.rarity] || 1;
  const baseXp = CONFIG.xp.winAward(enemy.level, rarityMult);
  const allFull = state.party.every((c) => c.hp >= c.maxHp || isFainted(c));
  const xp = Math.round(baseXp * (allFull ? CONFIG.xp.cleanBonus : 1));
  const tokens = CONFIG.tokens.perWin(enemy.level);
  state.tokens += tokens;
  state.stats.battlesWon += 1;
  const levelUps = [];
  for (const c of state.party) {
    if (isFainted(c)) continue;
    const reached = gainXp(c, xp);
    if (reached.length) levelUps.push({ name: c.name, levels: reached, to: c.level });
  }
  return { xp, tokens, levelUps, clean: allFull };
}
