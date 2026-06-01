// release.mjs — one-command release.
//   node tools/release.mjs            build a versioned win exe + sha256 + notes
//   node tools/release.mjs --publish  also publish to GitHub Releases (needs `gh`)
// Writes to dist/releases/ so it never fights the running dist/stackquest.exe lock.

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { VERSION, REPO } from '../src/data/version.js';
import { PATCH_NOTES } from '../src/data/patchnotes.js';

const tag = `v${VERSION}`;
const top = PATCH_NOTES[0];
if (top.version.replace(/^v/, '') !== VERSION) {
  console.error(`✗ 버전 불일치: version.js=${VERSION} vs patchnotes=${top.version}. 둘을 맞춰주세요.`);
  process.exit(1);
}

const out = 'dist/releases';
mkdirSync(out, { recursive: true });
const exeName = `stackquest-${tag}-win-x64.exe`;
const exe = `${out}/${exeName}`;

console.log(`▶ STACK QUEST release ${tag} — ${top.title}`);
console.log('• selftest…');
execSync('node game.js --selftest', { stdio: 'inherit' });
console.log('• build (bun --compile)…');
execSync(`bun build ./game.js --compile --target=bun-windows-x64 --outfile ${exe}`, { stdio: 'inherit' });

const buf = readFileSync(exe);
const sha = createHash('sha256').update(buf).digest('hex');
writeFileSync(`${exe}.sha256`, `${sha}  ${exeName}\n`);
const notes = `## STACK QUEST ${tag} — ${top.title}\n\n`
  + top.changes.map((c) => (c.startsWith('  ') ? `  ${c.trim()}` : `- ${c}`)).join('\n') + '\n';
const notesPath = `${out}/notes-${tag}.md`;
writeFileSync(notesPath, notes);

console.log(`\n✅ ${exe}  (${(buf.length / 1048576).toFixed(1)} MB)`);
console.log(`   sha256 ${sha.slice(0, 16)}…  ·  notes ${notesPath}`);

if (!process.argv.includes('--publish')) {
  console.log('\n게시하려면:  npm run release -- --publish   (gh 로그인 + REPO 필요)');
  process.exit(0);
}

if (!REPO) { console.error('✗ REPO 미설정 (src/data/version.js)'); process.exit(1); }
console.log(`• gh release create ${tag} → ${REPO}…`);
execSync(`gh release create ${tag} "${exe}" "${exe}.sha256" --repo ${REPO} --title "${tag} ${top.title}" --notes-file "${notesPath}"`, { stdio: 'inherit' });
console.log(`🚀 https://github.com/${REPO}/releases/tag/${tag}`);
