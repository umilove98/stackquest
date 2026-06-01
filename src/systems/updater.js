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
  const exeAsset = assets.find((a) => a.name.toLowerCase() === 'stackquest.exe')
    || assets.find((a) => /win.*\.exe$/i.test(a.name))
    || assets.find((a) => a.name.endsWith('.exe'));
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

// non-blocking status check (swallows network errors). used by --update and the
// in-game lobby. returns { configured, isExe, current, latest, hasUpdate, info }.
export async function checkUpdate() {
  const exe = selfExe();
  const out = { configured: isConfigured(), isExe: !!exe, current: VERSION, latest: null, hasUpdate: false, info: null };
  if (!out.configured || !exe) return out;
  try {
    const info = await fetchLatest();
    out.latest = info.version;
    out.info = info;
    out.hasUpdate = !!(info.version && info.exeUrl && cmpVer(info.version, VERSION) > 0);
  } catch { /* offline / API error → just report no update */ }
  return out;
}

// download + verify + self-swap. `log(msg)` reports progress (console or screen).
// returns { ok, version, error }.
export async function performUpdate(info, log = () => {}) {
  const exe = selfExe();
  if (!exe) return { ok: false, error: '개발 모드' };
  if (!info || !info.exeUrl) return { ok: false, error: '릴리스 자산 없음' };
  log(`v${info.version} 다운로드 중...`);
  let buf;
  try { buf = await downloadBuffer(info.exeUrl); } catch (e) { return { ok: false, error: '다운로드 실패: ' + e.message }; }
  if (info.shaUrl) {
    try {
      const want = (await (await fetch(info.shaUrl, { headers: UA })).text()).trim().split(/\s+/)[0].toLowerCase();
      const got = createHash('sha256').update(buf).digest('hex');
      if (want && want !== got) return { ok: false, error: '체크섬 불일치(손상/위변조 의심)' };
    } catch { /* checksum optional */ }
  }
  log('설치 중...');
  const upd = path.join(path.dirname(exe), 'stackquest.update.exe');
  const old = exe + '.old';
  try {
    writeFileSync(upd, buf);
    if (existsSync(old)) { try { unlinkSync(old); } catch {} }
    renameSync(exe, old);   // rename the running exe (allowed on Windows)
    renameSync(upd, exe);   // move the new exe into place
    return { ok: true, version: info.version };
  } catch (e) {
    try { if (existsSync(old) && !existsSync(exe)) renameSync(old, exe); } catch {}
    try { if (existsSync(upd)) unlinkSync(upd); } catch {}
    return { ok: false, error: '파일 교체 실패: ' + e.message };
  }
}

// CLI: `stackquest --update`
export async function runUpdate() {
  console.log(`STACK QUEST 업데이트 — 현재 v${VERSION}`);
  const st = await checkUpdate();
  if (!st.configured) { console.log('릴리스 소스 미설정 (src/data/version.js 의 REPO).'); return; }
  if (!st.isExe) { console.log('개발 모드입니다. 빌드된 .exe에서만 자체 업데이트가 동작합니다 (`git pull` 후 `npm run build:win`).'); return; }
  if (!st.latest) { console.log('릴리스를 찾을 수 없습니다 (오프라인이거나 게시 전).'); return; }
  if (!st.hasUpdate) { console.log(`이미 최신 버전입니다 (v${VERSION}).`); return; }
  console.log(`새 버전 v${st.latest} 발견.`);
  const r = await performUpdate(st.info, (m) => console.log('•', m));
  if (r.ok) {
    console.log(`\n✅ v${r.version} 설치 완료! 게임을 다시 실행하세요.`);
    console.log('(이전 버전 파일은 다음 실행 때 자동 정리됩니다)');
  } else {
    console.log('업데이트 실패:', r.error);
    console.log(`수동 설치: https://github.com/${REPO}/releases/latest`);
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
