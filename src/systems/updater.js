// updater.js — `stackquest --update`: a GitHub Releases self-updater.
// Checks the latest release, downloads the Windows exe, verifies its sha256, and
// swaps itself in. Windows can't overwrite a running exe but CAN rename it, so we
// rename the current exe to *.old, drop the new one in place, and clean up *.old
// on the next launch.

import { VERSION, REPO } from '../data/version.js';
import { createHash } from 'node:crypto';
import { writeFileSync, renameSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import path from 'node:path';

const UA = { 'User-Agent': 'stackquest-updater', Accept: 'application/vnd.github+json' };
export const isConfigured = () => !!REPO && REPO.includes('/') && !REPO.includes('<');

// the running compiled exe path, or null when launched via `node`/`bun` (dev)
function selfExe() {
  const exe = process.execPath || '';
  const base = path.basename(exe).toLowerCase();
  if (base.startsWith('node') || base.startsWith('bun')) return null;
  return exe;
}

const parseVer = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
function cmpVer(a, b) { const x = parseVer(a), y = parseVer(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; }

export function printVersion() { console.log(`STACK QUEST v${VERSION}`); }

async function fetchLatest() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: UA });
  if (!res.ok) throw new Error(`릴리스 조회 실패 (HTTP ${res.status})`);
  const j = await res.json();
  const assets = j.assets || [];
  const exeAsset = assets.find((a) => /win.*\.exe$/i.test(a.name)) || assets.find((a) => a.name.endsWith('.exe'));
  const shaAsset = exeAsset && assets.find((a) => a.name === `${exeAsset.name}.sha256`);
  return {
    version: (j.tag_name || '').replace(/^v/, ''),
    exeUrl: exeAsset && exeAsset.browser_download_url,
    exeName: exeAsset && exeAsset.name,
    shaUrl: shaAsset && shaAsset.browser_download_url,
  };
}

async function downloadBuffer(url) {
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error(`다운로드 실패 (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function runUpdate() {
  console.log(`STACK QUEST 업데이트 — 현재 v${VERSION}`);
  if (!isConfigured()) {
    console.log('릴리스 소스가 설정되지 않았습니다. src/data/version.js 의 REPO를 "owner/repo"로 설정하세요.');
    return;
  }
  const exe = selfExe();
  if (!exe) {
    console.log('개발 모드(node/bun 실행)입니다. 자체 업데이트는 빌드된 .exe에서만 동작합니다.');
    console.log('코드 업데이트: `git pull` 후 `npm run build:win`.');
    return;
  }
  let info;
  try { info = await fetchLatest(); } catch (e) { console.log('업데이트 확인 실패:', e.message); return; }
  if (!info.version) { console.log('아직 게시된 릴리스가 없습니다.'); return; }
  if (cmpVer(info.version, VERSION) <= 0) { console.log(`이미 최신 버전입니다 (v${VERSION}).`); return; }
  if (!info.exeUrl) { console.log(`v${info.version} 릴리스에 Windows exe 자산이 없습니다.`); return; }

  console.log(`새 버전 v${info.version} 발견 — 다운로드 중... (${info.exeName})`);
  let buf;
  try { buf = await downloadBuffer(info.exeUrl); } catch (e) { console.log('다운로드 실패:', e.message); return; }

  if (info.shaUrl) {
    try {
      const want = (await (await fetch(info.shaUrl, { headers: UA })).text()).trim().split(/\s+/)[0].toLowerCase();
      const got = createHash('sha256').update(buf).digest('hex');
      if (want && want !== got) { console.log('체크섬 불일치 — 업데이트를 중단합니다(손상/위변조 의심).'); return; }
    } catch { /* checksum optional */ }
  }

  const upd = path.join(path.dirname(exe), 'stackquest.update.exe');
  const old = exe + '.old';
  try {
    writeFileSync(upd, buf);
    if (existsSync(old)) { try { unlinkSync(old); } catch {} }
    renameSync(exe, old);   // rename the running exe (allowed on Windows)
    renameSync(upd, exe);   // move the new exe into place
    console.log(`\n✅ v${info.version} 설치 완료! 게임을 다시 실행하세요.`);
    console.log('(이전 버전 파일은 다음 실행 때 자동 정리됩니다)');
  } catch (e) {
    console.log('파일 교체 실패:', e.message);
    try { if (existsSync(old) && !existsSync(exe)) renameSync(old, exe); } catch {}
    try { if (existsSync(upd)) unlinkSync(upd); } catch {}
    console.log('수동 설치: 아래에서 새 exe를 받아 덮어쓰세요 —');
    console.log(`  https://github.com/${REPO}/releases/latest`);
  }
}

// remove leftover *.old / update files next to the exe (best-effort, on startup)
export function cleanupOld() {
  try {
    const exe = selfExe(); if (!exe) return;
    const dir = path.dirname(exe);
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.old') || f === 'stackquest.update.exe') { try { unlinkSync(path.join(dir, f)); } catch {} }
    }
  } catch { /* ignore */ }
}
