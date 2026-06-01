# STACK QUEST 🤖

터미널에서 돌아가는 **개발 도구·AI 모델 수집형 가챠 JRPG** (한국어). 당신은 '디버거'가 되어 코드베이스를 탐험하고, 야생의 **개발 도구와 AI 모델**(grep·vim·Docker·Copilot·GPT-4·Stable Diffusion·Midjourney…)을 잡아 **영입**하거나 **크레이트(가챠)** 에서 뽑아 팀을 키운 뒤, 그 힘으로 버그를 잡으며 최종 보스 **기술부채(TECH_DEBT)** 를 물리쳐 빌드를 초록불로 만듭니다.

순수 Node.js, **외부 의존성 0개**. 트루컬러(24bit) 반블록 픽셀아트 + 깜빡임 없는 diff 렌더러 + 한글(전각) 정렬 지원.

## 실행

```bash
node game.js
```

> Windows Terminal 등 **트루컬러 지원 터미널**에서, 최소 **80 × 24** 크기로 실행하세요.

## 조작

| 화면 | 키 |
|------|----|
| 이동 | `WASD` / 방향키 |
| 메뉴 / 결정 | `Enter` 또는 `Space` |
| 취소 / 뒤로 | `Esc` |
| 저장 후 종료 | `Q` |
| 연출 스킵 | 가챠/대사 중 아무 키 |

진행은 `savegame.json` 에 자동 저장됩니다.

## 핵심 시스템

- **시작도 뽑기로** — 새 게임을 시작하면 크레이트에서 **첫 동료를 뽑습니다.** 마음에 들 때까지 무제한 리롤 가능.
- **수집 대상 = 진짜 도구·모델** — 레어도 티어:
  - 일반: `grep` · `printf` · `ELIZA`
  - 고급: `vim` · `git` · `Docker` · `Clippy` · `GPT-2`
  - 희귀: `Copilot` · `GPT-3.5` · `Stable Diffusion` · `DALL·E 2`
  - 영웅: `GPT-4` · `Gemini` · `Midjourney` · `Sora`
  - 전설: **`Claude Opus`** (이 게임을 돌리는 바로 그 모델)
- **가챠(크레이트)** — 단챔/10연챔. 소프트 천장(4뽑마다 희귀+) · 하드 천장(12뽑 내 전설). 등급별 빛줄기 색이 차오르고, **페이크아웃** 후 확정 → 샤이니 체크 → 등장 → 게놈 판독.
- **레어도 · 개체값(IV) · 게놈 무결성** — 잡거나 뽑은 개체마다 4스탯 IV(8~31)를 굴려 `게놈 무결성 %` → `클린 빌드` / `불안정` / `힙 손상` 판정.
- **샤이니** — 1/100, 대체 팔레트 + 전용 반짝임 (스탯 영향 없음).
- **클래스 상성 삼각형** — `코드 > 언어 > 비전 > 코드` (오염은 중립, 보스 전용).
- **영입("패치"가 아니라 라이선스로!)** — 야생 도구·모델을 약하게 만든 뒤 오픈소스/프로/엔터프라이즈 라이선스로 영입. 전설은 끝까지 까다롭게.
- **전투** — 턴제. 데미지/크리티컬/명중, 상태효과(버그유출·둔화·약화·방어막·집중), HP 드레인/피격 플래시 애니메이션, 레벨업.

한 판(맵 하나) 분량은 대략 **15~20분**. 밸런스는 적대적 리뷰 패스로 검증해 천장/확률/경험치 곡선을 짧은 플레이에 맞췄습니다.

## 개발용 도구

```bash
node game.js --selftest        # 헤드리스 로직 검증 (데이터/확률/천장/맵 연결성/세이브)
node game.js --demo            # 렌더링 경로 스모크 테스트 (TTY 불필요)
node tools/spritesheet.js      # 18종 스프라이트를 preview.png / preview-shiny.png 로 출력
node tools/screenshot.mjs      # 실제 화면(오버월드/전투/가챠/REPO)을 shots.png 로 래스터화
node tools/dump.mjs            # 화면 버퍼를 텍스트로 덤프 (한글 정렬 점검)
```

## 배포 (단일 실행파일)

Node 설치가 필요 없는 **독립 실행파일**로 빌드합니다 (빌드할 때만 Bun 필요):

```bash
npm run build:win     # → dist/stackquest.exe   (Windows, 받는 사람은 Node 불필요)
npm run build:mac     # → dist/stackquest-mac
npm run build:linux   # → dist/stackquest-linux
```

- `dist/stackquest.exe` **하나만** 복사해 어디서든 실행하면 됩니다 (~110MB, Bun 런타임 포함).
- **세이브는 exe 바로 옆**에 `savegame.json`으로 생성됩니다 — USB·공유폴더째 들고 다녀도 진행도가 따라옵니다. (`STACKQUEST_HOME` 환경변수로 위치 변경 가능.)
- 첫 실행 시 Windows SmartScreen이 "알 수 없는 게시자" 경고를 띄울 수 있습니다 → **추가 정보 → 실행**. (서명 안 된 exe라서 그렇습니다.)

받는 사람에게 Node가 있다면 더 가벼운 방법:
- **폴더째 zip** → `node game.js` (Node 18+ 필요, 수십 KB).
- 또는 npm 퍼블리시 후 `npx`.

## 구조

```
game.js                 진입점 (터미널 복구 포함)
src/
  ansi.js   render.js   input.js   ui.js   state.js
  fx/anim.js            연출 프리미티브 (타이프라이터·플래시·스파클·트윈)
  data/
    sprites.js          18종 도구·모델 픽셀아트 (반블록, 손작업 + PNG 검증)
    config.js           모든 밸런스 수치 + 공식
    creatures.js        도감 로더 + 무브/풀 레지스트리
    codex.json          생성된 크리처 데이터 (한국어)
    i18n.js             용어 한글 맵
    worldmap.js         오버월드 타일맵
  systems/
    rng.js  creatureInstance.js  battle.js  gacha.js  overworld.js  collection.js
  selftest.js  demo.js
```

도감/스탯/스킬/플레이버는 멀티에이전트 워크플로우로 한국어 생성 후 적대적 리뷰로 검증했고, 스프라이트는 PNG 미리보기 루프로 손수 다듬었습니다. 렌더러는 한글 전각 문자를 2칸으로 처리해 박스 정렬이 깨지지 않습니다.
