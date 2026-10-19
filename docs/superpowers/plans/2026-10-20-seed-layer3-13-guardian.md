# SEED ③층 13/15 보호자(`/guardian`, `/g`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보호자 링크 만들기(`/guardian`)와 열기(`/g`)를 설계서 6.2 13번 배치로 바꾼다.
- **바탕:** 흰 바탕 한 장. 섹션 카드(`.card`)를 걷어 낸다.
- **만들기:** 담기는 것·담기지 않는 것 목록(앞 아이콘) → 안내 Callout → 동의 → PIN 입력 → 하단 고정 바의 '링크 만들기'.
- **열기:** PIN 입력 → 하단 고정 바의 '열기'. 받은 사본은 흰 바탕 위 구역으로 보인다.

**Architecture:** 링크 만들기·암호화·PIN 잠금·로그인 왕복·사본 저장의 동작과 문구는 그대로 두고 표시만 바꾼다.
- **카드:** 섹션 카드(`.card`)를 걷어 낸다.
- **흐름 버튼:** 흐름을 끝내는 버튼은 ②층 하단 고정 바(`.sticky-return.is-flow`)로 옮긴다.
- **왼쪽 띠 상자:** 안내(`.guardian-note`)·다시 보내기(`.guardian-resend`)·주의(`.guardian-warning`)를 Callout 모양으로 바꾼다.
- **오류 문장:** 체류 설정과 같은 '경고 아이콘 + 굵은 긴급 빨강'으로 바꾼다.

오류·주의 문장에 아이콘을 붙이는 작은 부품 두 개를 `components/guardian/Feedback.js`에 새로 둔다. 새 화면 테스트는 `e2e/screen-guardian.spec.js`다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 5.1(버튼), 5.2(입력·오류), 5.5(목록), 5.6(Callout)
- 6.1(바탕 두 가지, 하단 고정 바, 화면 끝 56px), 6.2 13번 행
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`(git 제외). 13번 몫은 `.sticky-return.is-flow` 사용과 `.app-shell:has(.sticky-return) main.page`(152px) 실측 테스트다.

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`에만 둔다. 이 계획은 새 문구를 만들지 않는다.
- **글쓰기:** 새로 쓰는 주석·문서·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다. 기존 문구·주석은 그대로 둔다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA)이다.
  - 본문은 16px 이상, 터치 대상은 44px 이상이다.
  - 상태는 색 + 문구 + 아이콘으로 보인다.
  - 320px부터 1280px까지 가로 스크롤이 없어야 한다.
- **코발트(`--accent`):** 화면당 주 버튼 하나, 링크, '오늘' 표시, 키보드 초점 링에만 쓴다. 채운 강조 버튼(주·critical)은 화면당 하나다. 하단 긴급 바(`/g`)의 빨강은 셸 몫이라 세지 않는다.
- **눌림·호버:** 눌림은 면 색(`--pressed*`)을 바꾸고, 버튼·칩·탭은 요소 전체가 조금 줄어든다(설계서 4.6). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 공유 동의는 링크를 만들 때마다 받고 저장하지 않는다.
  - PIN은 화면 상태에만 두고 저장·기록하지 않는다.
  - 암호문은 `#` 뒤에만 있고 어떤 요청에도 싣지 않는다.
  - 병원 복귀는 '병원'으로만 보인다.
  - 보기 전용이면 만들기를 막는다.
  - 사본의 '○월 ○일 ○시 기준'과 '자동으로 바뀌지 않아요' 고지는 늘 보인다.
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/guardian.spec.js`: 라벨 'PIN (숫자 6자리)'·'PIN 확인 (한 번 더)'·'환자에게 받은 PIN (숫자 6자리)'·'링크', 버튼 '링크 만들기'·'열기'(exact), 링크 '로그인하고 열기', `alert` 필터 'PIN이 맞지 않아요'·'이 기기에서 이 링크가 잠겼어요', 제목 'PIN 입력'·'받은 일정'·'로그인하면 링크를 열 수 있어요', 링크 이름 `/119/`의 `href="tel:119"`.
  - `e2e/accessibility.spec.js`: '/guardian (오류)'·'(링크 결과)'·'/g (PIN 입력 · 오류)'·'(사본 보기)' axe 검사, 글자 200%·터치 44px.
  - `e2e/offline.spec.js`: '보기 전용 상태에서는 링크를 만들 수 없어요.' 보임, '링크 만들기' `toBeDisabled`.
  - `e2e/privacy.spec.js`·`e2e/network.spec.js`·`e2e/responsive.spec.js`의 /guardian 흐름.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 176건이고 Task 1 뒤 183 → Task 2 뒤 187건이 된다.
  - 시간대에 따라 건너뛸 수 있는 기존 테스트가 있다.
  - 색 단언은 `expect.poll`로 쓴다(색 전환 150ms).

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **고정 바가 입력칸을 덮음:** 화면 끝까지 내리면 마지막 PIN 칸이 바 위에 다 보여야 한다. 아래 여백은 하단 내비 + 152px이다(Task 1).
2. **보기 전용(로그인 만료):** 만들 수 없는 이유 문장이 바 안 버튼 위에 보이고 버튼이 막혀야 한다(Task 1).
3. **320px 일본어·중국어:** 고정 바 안의 긴 이유 문장과 버튼이 넘치지 않고, 가로 스크롤이 없어야 한다(Task 1).
4. **보낸 뒤 일정이 바뀜:** 다시 보내기 안내가 코발트 띠 상자가 아니라 회색 Callout으로 보여야 한다(Task 1).
5. **동행 필수인 날:** 사본의 동행 안내가 왼쪽 띠 없는 분홍 Callout으로, 두 언어가 함께 보여야 한다(Task 2).

## 이 계획이 정한 것

| 무엇 | 설계서·넘김 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 바탕 | 6.2 13번 '흰' | 두 화면 모두 흰 바탕 한 장. `.card`를 걷어 내고 섹션 사이는 간격으로 나눈다 | 설계서 그대로 |
| ↳ 만들기 섹션 | 6.1 | 동의 섹션과 PIN 섹션 사이에 1px `--line-section` 구역선 하나(위 여백 24) | 구역 경계 표시는 화면당 1~2개 |
| ↳ 사본 구역 | 6.1 | `.guardian-copy` 안 구역(기준 시각·긴급 연락·날짜별)은 선 없이 32px 간격. 날짜 제목은 20px 굵게 그대로 | 날짜 수만큼 선이 늘어나지 않게 |
| 담기는 것·담기지 않는 것 | 6.2 13번, 5.5 | 점 목록을 아이콘 목록으로. 담기는 것은 앞 20px `check`(`--ink`), 담기지 않는 것은 `close`(`--ink-soft`). 항목 글자는 16/22 | 색만이 아니라 아이콘 모양으로도 갈린다 |
| 안내(`SafetyNote`) | 5.6 '일반 안내 상자: 왼쪽 색 띠 제거 → 옅은 바탕 + 아이콘' | `--surface-alt` 면, 모서리 10, 안쪽 14/16, 앞 20px 아이콘 칸(첫 줄 가운데), 테두리·띠 없음. `guardian-note-strong`(PIN 한계 고지)은 띠 대신 굵은 글자 | 로그인·설정 Callout과 같은 짝 |
| ↳ 동행 필요 | 같은 행 | `--support-soft` 면 그대로, 테두리·띠 없음 | 분홍 면 자체가 동행 표시다 |
| 다시 보내기 | 5.6 | 코발트 면·6px 코발트 띠 → 회색 Callout(면 `--surface-alt`, 모서리 10, 안쪽 14/16). 안의 안내 문장은 상자 없이 | 코발트 쓰임 제한(주 버튼·링크·오늘·초점) |
| 오류 문장 | 5.2, 4번 넘김 '오류 표시 통일' | 분홍 4px 띠 + 분홍 글자 → 20px `alert` 아이콘 + 16/22 굵은 `--emergency`, 띠 없음(체류 설정 `.onboarding-field-error`와 같은 배치). 입력칸 빨간 테두리는 globals 공통 규칙 그대로 | 오류 표시를 앱 전체에서 하나로 |
| 주의 문장(`.guardian-warning`) | 5.6 | 대기 색 면 + 1px 대기 선 + 모서리 10 + 안쪽 14/16 + 앞 20px `alert` 아이콘, 왼쪽 4px 띠 없음 | 일정 화면 실패 알림(`TripNotice` `error`)과 같은 모양 |
| 하단 고정 버튼 | 6.1 '흐름을 끝내는 버튼은 하단 고정 바', 6.2 13번 | '링크 만들기'(/guardian)와 '열기'(/g)를 `<div className="guardian-bar sticky-return is-flow">`에. 만들 수 없는 이유(보기 전용)·만들기 실패 문장은 바 안 버튼 위에 | 체류 설정 하단 바와 같은 처리 |
| ↳ 로그인 버튼 | 6.1 | '로그인하고 열기'는 흐름 안에 그대로(바에 넣지 않는다) | 입력칸이 없는 짧은 안내라 덮일 것이 없다 |
| 링크 결과 | 5.1 | 카드만 걷어 낸다. '링크 복사'(주)·'다른 앱으로 보내기'(보조)·'새 링크 만들기'(조용한) 그대로 | 채운 강조 버튼은 하나 |
| 기준 시각 | 5.6 | 분할 상태 색 상자 → 상자 없이 제목 + 기준 시각(18px 굵게, `--ink`) + 자동 갱신 안내 Callout(`info`) + 만료·한국 시각 줄 | 상태 4색은 판정 상태에만 쓴다 |
| 긴급 연락 119·1330 | 5.1, 10번 결정(119는 긴급 빨강 채움) | 2px 빨간 테두리 알약 → 회색 채움 52px 버튼(`btn btn-secondary`), 앞 20px 전화 아이콘. 119 아이콘만 `--emergency` | /g는 하단 긴급 바(빨강 채움)가 늘 보인다. 119까지 채우면 빨강 채움이 둘이다 |
| 복귀 마감 시각 | 4.1 코발트 쓰임 | `--accent-strong` → `--ink`. 행 면 모서리 12 → 10 | 코발트 쓰임 제한 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `components/guardian/Feedback.js` | **새** 오류 문장·주의 문장 부품 | T1 |
| `components/guardian/GuardianCreate.js` | 링크 만들기 | 섹션·목록·바·오류·주의(T1) |
| `components/guardian/SafetyNote.js` | 안내 한 덩이 | 아이콘 칸 클래스(T1) |
| `components/guardian/GuardianOpen.js` | 링크 열기 | 섹션·바·오류·주의(T2) |
| `components/guardian/GuardianCopyView.js` | 사본 보기 | 기준 시각·긴급 연락(T2) |
| `app/styles/guardian.css` | 보호자 배치 | T1 공통·/guardian 절, T2 /g 절 |
| `e2e/screen-guardian.spec.js` | **새** 보호자 모양 테스트 | T1이 만들고 T2가 더한다 |
| `docs/tracking/status.md` | 진행 현황 | 한 줄(T2) |

---

### Task 1: 공통 Callout·오류·주의, 링크 만들기(/guardian) 흰 바탕·아이콘 목록·하단 고정 바

**Files:**
- Create: `components/guardian/Feedback.js`
- Create: `e2e/screen-guardian.spec.js`
- Modify: `components/guardian/GuardianCreate.js`(`ResendNotice`, `LinkResult`, `ShareForm`)
- Modify: `components/guardian/SafetyNote.js`(아이콘 칸)
- Modify: `app/styles/guardian.css`(공통 절, /guardian 절)

**Interfaces:**
- Consumes: `startTrip`, `buildStay`(`e2e/helpers.js`), `Icon`, `Button`, `.sticky-return.is-flow`(globals).
- Produces:
  - `components/guardian/Feedback.js`
    - `export function ErrorText({ id, children })`: `children`가 있으면 `<p id className="guardian-error" role="alert">`(앞 `Icon alert 20`, 글자 `<span>`). 없으면 `<p id className="guardian-error is-empty" role="alert" />`(늘 DOM에 남는 알림 자리).
    - `export function WarningNote({ role = 'note', className = '', children })`: `<div className="guardian-warning …" role>`(앞 `span.guardian-warning-icon` 안 `Icon alert 20`, 글자 `<p>`).
  - 클래스: `guardian-section`, `guardian-list-icon`, `guardian-bar`, `guardian-warning-icon`.
  - 테스트 도우미(`e2e/screen-guardian.spec.js`): `styles(locator, props)`, `gapBetween(upper, lower)`, `createLink(page)`(링크 문자열을 돌려준다).

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-guardian.spec.js`)**

머리 주석에 쓰는 색 값: `--surface-alt` rgb(243, 244, 245), `--ink` rgb(26, 28, 32), `--emergency` rgb(200, 16, 46), `--state-standby-bg` rgb(255, 244, 217), 흰 rgb(255, 255, 255). `styles`·`gapBetween`은 `e2e/screen-settings.spec.js`와 같은 모양으로 둔다.

```js
// ③층 보호자(/guardian, /g): SEED 화면 배치 (설계서 6.2 13번)
import { test, expect } from './fixtures.js';
import { startTrip } from './helpers.js';

const PIN = '246810';
const CONSENT = '위 내용을 보호자에게 보내는 데 동의해요 (이번 링크에만 적용돼요)';

async function styles(locator, props) { /* screen-settings 와 같다 */ }
function gapBetween(upper, lower) { return Math.round(lower.y - (upper.y + upper.height)); }

async function createLink(page) {
  await page.getByLabel(CONSENT).check();
  await page.getByLabel('PIN (숫자 6자리)').fill(PIN);
  await page.getByLabel('PIN 확인 (한 번 더)').fill(PIN);
  await page.getByRole('button', { name: '링크 만들기' }).click();
  return page.getByLabel('링크', { exact: true }).inputValue();
}

test.describe('③층 보호자 링크 만들기', () => {
  test('흰 바탕 한 장: 카드 없음, 담기는 것·담기지 않는 것은 서로 다른 앞 아이콘 목록, 두 안내는 띠 없는 회색 Callout', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    const main = page.locator('main.guardian-page');
    await expect(main).not.toHaveClass(/is-basement/);
    await expect(main.locator('.card')).toHaveCount(0);

    const inItems = main.locator('.guardian-list-in > li');
    const outItems = main.locator('.guardian-list-out > li');
    await expect(inItems).toHaveCount(5);
    await expect(outItems).toHaveCount(3);
    const inIcon = await inItems.first().locator('.guardian-list-icon svg').innerHTML();
    const outIcon = await outItems.first().locator('.guardian-list-icon svg').innerHTML();
    expect(inIcon).not.toBe(outIcon);
    expect((await styles(inItems.first(), ['list-style-type', 'font-size']))).toEqual({ 'list-style-type': 'none', 'font-size': '16px' });

    const notes = main.locator('section[aria-labelledby="guardian-consent-title"] .guardian-note');
    await expect(notes).toHaveCount(2);
    for (const note of await notes.all()) {
      expect(await styles(note, ['background-color', 'border-left-width', 'border-top-left-radius', 'padding-top'])).toEqual({
        'background-color': 'rgb(243, 244, 245)', 'border-left-width': '0px', 'border-top-left-radius': '10px', 'padding-top': '14px',
      });
    }
    // 동의 섹션과 PIN 섹션 사이 구역선 하나
    const pinSection = main.locator('section[aria-labelledby="guardian-pin-title"]');
    expect((await styles(pinSection, ['border-top-width', 'padding-top']))).toEqual({ 'border-top-width': '1px', 'padding-top': '24px' });
  });

  test('링크 만들기는 하단 고정 바(흰 면, 윗선 1px)에서 하단 내비 바로 위에 서고, 끝까지 내리면 마지막 PIN 칸이 바에 가리지 않는다', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    const bar = page.locator('.guardian-bar.sticky-return.is-flow');
    await expect(bar.getByRole('button', { name: '링크 만들기' })).toBeVisible();
    expect(await styles(bar, ['position', 'background-color', 'border-top-width'])).toEqual({
      position: 'fixed', 'background-color': 'rgb(255, 255, 255)', 'border-top-width': '1px',
    });
    expect(gapBetween(await bar.boundingBox(), await page.locator('.ui-bottom-nav').boundingBox())).toBe(0);
    // 하단 내비 65px(윗선 포함) + 고정 바 몫 152px
    expect((await styles(page.locator('main.guardian-page'), ['padding-bottom']))['padding-bottom']).toBe('217px');

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = await page.getByLabel('PIN 확인 (한 번 더)').boundingBox();
    expect(last.y + last.height).toBeLessThanOrEqual((await bar.boundingBox()).y);
  });

  test('오류: 동의 없이 누르면 경고 아이콘 + 굵은 긴급 빨강 문장(띠 없음), PIN 오류도 같은 모양', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await page.getByRole('button', { name: '링크 만들기' }).click();
    const consentError = page.getByRole('alert').filter({ hasText: '동의해야 링크를 만들 수 있어요.' });
    await expect(consentError.locator('svg')).toHaveCount(1);
    await expect.poll(async () => styles(consentError, ['color', 'font-weight', 'border-left-width', 'font-size'])).toEqual({
      color: 'rgb(200, 16, 46)', 'font-weight': '700', 'border-left-width': '0px', 'font-size': '16px',
    });

    await page.getByLabel(CONSENT).check();
    await page.getByLabel('PIN (숫자 6자리)').fill('12');
    await page.getByRole('button', { name: '링크 만들기' }).click();
    const pinError = page.getByRole('alert').filter({ hasText: 'PIN은 숫자 6자리로 넣어 주세요.' });
    await expect(pinError.locator('svg')).toHaveCount(1);
    await expect.poll(async () => (await styles(pinError, ['color']))['color']).toBe('rgb(200, 16, 46)');
    await expect(page.getByLabel('PIN (숫자 6자리)')).toHaveAttribute('aria-invalid', 'true');
  });

  test('보기 전용(로그인 만료)이면 만들 수 없는 이유가 바 안 버튼 위에 보이고 버튼이 막힌다', async ({ page, context }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await context.clearCookies();
    await page.goto('/guardian');
    const bar = page.locator('.guardian-bar');
    const note = bar.getByText('보기 전용 상태에서는 링크를 만들 수 없어요.', { exact: false });
    const button = bar.getByRole('button', { name: '링크 만들기' });
    await expect(note).toBeVisible();
    await expect(button).toBeDisabled();
    expect((await note.boundingBox()).y).toBeLessThan((await button.boundingBox()).y);
  });

  test('320px 日本語 보기 전용: 바 안 이유 문장과 버튼이 넘치지 않고 가로 스크롤이 없다', async ({ page, context }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/settings' });
    await page.getByRole('radio', { name: '日本語' }).check();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
    await context.clearCookies();
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/guardian');
    const bar = page.locator('.guardian-bar');
    await expect(bar.locator('.guardian-bar-note')).toBeVisible();
    await expect(bar.locator('button[type="submit"]')).toBeDisabled();
    expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('보낸 뒤 일정이 바뀌면 다시 보내기 안내는 회색 Callout(코발트 면·띠 없음)', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    // 깨진 지문 = 무엇을 보냈는지 알 수 없음 → 다시 보내기 안내(components/guardian/share.js isGuardianResendNeeded)
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('safehour.v2.') && k.endsWith('.stay') && !k.includes('.device.'));
      const record = JSON.parse(localStorage.getItem(key));
      record.data.guardianShare = { lastSentAt: new Date().toISOString(), planFingerprint: 'stale' };
      localStorage.setItem(key, JSON.stringify(record));
    });
    await page.reload();
    const resend = page.locator('section.guardian-resend');
    await expect(resend.getByRole('heading', { name: '보호자 링크 다시 보내기' })).toBeVisible();
    await expect.poll(async () => styles(resend, ['background-color', 'border-left-width', 'border-top-left-radius'])).toEqual({
      'background-color': 'rgb(243, 244, 245)', 'border-left-width': '0px', 'border-top-left-radius': '10px',
    });
  });

  test('링크 결과: 카드 없음, 고정 바는 사라지고 링크 복사가 화면의 주 버튼 하나다', async ({ page }) => {
    await startTrip(page, { hasCompanion: true }, { path: '/guardian' });
    await createLink(page);
    await expect(page.getByRole('heading', { name: '보호자에게 보낼 링크' })).toBeVisible();
    await expect(page.locator('.sticky-return')).toHaveCount(0);
    await expect(page.locator('main .card')).toHaveCount(0);
    // 주 버튼은 변형 클래스가 없는 .btn 이다(components/ui/Button.js VARIANT_CLASS)
    const primary = page.locator('main .btn:not(.btn-secondary):not(.btn-quiet):not(.btn-critical)');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText(/링크 복사/);
  });
});
```

`startTrip` 뒤 체류 저장 키를 찾는 방식이 `e2e/helpers.js` `readRecord`와 다르면 그 도우미 방식에 맞춘다.

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-guardian.spec.js
```

Expected: 새 일곱 건이 FAIL이어야 한다(카드·점 목록·띠 상자·분홍 오류·흐름 안 버튼이다). 실패 이유가 '요소 없음' 하나뿐이면 선택자를 다시 본다.

- [ ] **Step 3: 오류·주의 부품 (`components/guardian/Feedback.js`)**

Interfaces의 두 함수를 만든다. 머리 주석에 '오류 문장은 체류 설정과 같은 배치(경고 아이콘 + 굵은 긴급 빨강), 주의 문장은 일정 화면 실패 알림과 같은 대기 색 Callout'이라고 한 줄씩 적는다. `Icon`은 `@/components/ui/index.js`에서 가져온다.

- [ ] **Step 4: 링크 만들기 화면 (`components/guardian/GuardianCreate.js`)**

- `ShareForm`
  - 두 `section.card`의 `className`을 `guardian-section`으로 바꾼다.
  - 두 `ul`에 `role="list"`를 단다. `li`는 `<span className="guardian-list-icon" aria-hidden="true"><Icon name="check|close" size={20} /></span><span>{t(key)}</span>`로 바꾼다. 담기는 것은 `check`, 담기지 않는 것은 `close`다.
  - 오류 `<p className="guardian-error" …>` 네 곳(동의·PIN·PIN 확인·만들기 실패)을 `ErrorText`로 바꾼다. `id`는 그대로 넘긴다.
  - 맨 끝의 만들기 실패 문장, 보기 전용 문장(`guardian.readOnlyBlocked`), 제출 `Button`을 `<div className="guardian-bar sticky-return is-flow">` 하나에 넣는다. 순서는 실패 문장 → 보기 전용 문장 → 버튼이다. 보기 전용 문장의 클래스는 `guardian-meta guardian-bar-note`다.
- `LinkResult`: `section.card guardian-result` → `section.guardian-result`. 주의 `<p className="guardian-warning" role="note">` 두 곳(긴 링크, 저장 실패)을 `WarningNote`로 바꾼다.
- `ResendNotice`: 마크업은 그대로다(모양은 CSS가 바꾼다).

- [ ] **Step 5: 안내 아이콘 칸 (`components/guardian/SafetyNote.js`)**

아이콘 span의 클래스 `guardian-note-icon`은 그대로 둔다. 아이콘이 없는 안내도 같은 상자 안쪽 여백을 쓰게 CSS가 맡는다. 마크업 변경은 없다. 머리 주석에 'Callout 모양(띠 없는 회색 면, 앞 20px 아이콘 칸)'을 한 줄 덧붙인다.

- [ ] **Step 6: 스타일 (`app/styles/guardian.css` 공통 절, /guardian 절)**

- `.guardian-page`: `gap`을 `var(--space-6)`으로.
- `.guardian-note`
  - 바탕은 `--surface-alt`, 모서리는 `--radius-10`, 안쪽 여백은 `14px var(--space-4)`, 테두리·띠 없음.
  - 줄 배치는 `display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: var(--space-2)`.
  - 아이콘이 없으면 글자 칸이 첫 칸에 오므로 `.guardian-note:not(:has(> .guardian-note-icon))`는 한 칸 grid로 둔다.
- `.guardian-note-icon`: `width: 20px; height: var(--lh-body); padding-top: 0`. 첫 줄 가운데에 둔다.
- `.guardian-note-strong`: 띠 대신 `.guardian-note-strong .guardian-note-text p { font-weight: var(--weight-bold) }`.
- `.guardian-error`: `.onboarding-field-error p`와 같은 값을 쓴다. 띠·왼쪽 안쪽 여백은 지운다.
  - `display: flex; align-items: flex-start; gap: var(--space-1-5)`.
  - 글자는 `--text-body`, 줄 높이는 `--lh-body`, 굵기는 `--weight-bold`, 색은 `--emergency`.
  - 아이콘은 `flex: none; margin-top: 1px`.
- `.guardian-warning`: `.trip-notice.is-error`와 같은 모양으로, 4px 띠는 지운다.
  - 바탕은 `--state-standby-bg`, 테두리는 `1px --state-standby-line`, 모서리는 `--radius-10`, 안쪽 여백은 `14px var(--space-4)`.
  - grid 두 칸에 아이콘 칸 20px, 아이콘은 `--ink`.
- `.guardian-section + .guardian-section`: `border-top: 1px solid var(--line-section); padding-top: var(--space-6)`.
- `.guardian-list`: `list-style: none; padding-left: 0`.
- `.guardian-list li`: grid `20px minmax(0, 1fr)`, 간격 `var(--space-2)`. 아이콘 칸 높이는 `--lh-body`다.
- `.guardian-list-out .guardian-list-icon`: 색은 `--ink-soft`다.
- `.guardian-resend`: 테두리·띠·코발트 면을 지운다. 바탕 `--surface-alt`, 모서리 `--radius-10`, 안쪽 여백 `14px var(--space-4)`.
  - `.guardian-resend .guardian-note`는 상자 없이 둔다(`background: none; padding: 0`).
- `.guardian-sent`: 모서리 `--radius-10`, 안쪽 여백 `14px var(--space-4)`.
- `.guardian-bar`: `display: grid; gap: var(--space-2)`.
  - `.guardian-bar > p`(이유 문장)은 `margin: 0`.
  - 320px 일본어에서 바가 넘치지 않게 `contain: inline-size`를 단다.
- `.guardian-list-in`·`.guardian-list-out`의 `list-style` 규칙은 지운다.

- [ ] **Step 7: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-guardian.spec.js e2e/guardian.spec.js e2e/offline.spec.js e2e/accessibility.spec.js e2e/privacy.spec.js
```

Expected: 모두 PASS. 새 일곱 건과 기존 보호자·오프라인·접근성·개인정보 테스트가 그대로 통과해야 한다.

- [ ] **Step 8: 커밋**

```bash
git add components/guardian/Feedback.js components/guardian/GuardianCreate.js components/guardian/SafetyNote.js app/styles/guardian.css e2e/screen-guardian.spec.js
git commit -m "$(cat <<'MSG'
style(guardian): 링크 만들기를 흰 바탕 한 장으로, 아이콘 목록·Callout·오류 문장·하단 고정 바

- 카드를 걷어 내고 동의·PIN 섹션 사이 구역선 하나.
- 담기는 것은 체크, 담기지 않는 것은 X 아이콘 목록.
- 안내·다시 보내기는 띠 없는 회색 Callout, 주의는 대기 색 Callout + 경고 아이콘.
- 오류는 경고 아이콘 + 굵은 긴급 빨강(체류 설정과 같다).
- 링크 만들기와 만들 수 없는 이유를 하단 고정 바로.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 링크 열기(/g) PIN 하단 고정 바, 사본 보기(기준 시각·긴급 연락·복귀 마감·동행 안내)

**Files:**
- Modify: `components/guardian/GuardianOpen.js`(`PinForm`, `LoginNeeded`, 들어온 링크 부분, 다른 사본)
- Modify: `components/guardian/GuardianCopyView.js`(`GuardianCopyView`, `GuardianDay`)
- Modify: `app/styles/guardian.css`(/g 절)
- Modify: `e2e/screen-guardian.spec.js`(새 `describe`)
- Modify: `docs/tracking/status.md`(한 줄)

**Interfaces:**
- Consumes: Task 1의 `ErrorText`, `WarningNote`, `.guardian-bar`, `.guardian-section`, 테스트 도우미 `styles`·`gapBetween`·`createLink`.
- Produces: 클래스 `guardian-call is-119`(119 버튼).

- [ ] **Step 1: 실패하는 화면 테스트를 더한다 (`e2e/screen-guardian.spec.js`)**

`helpers.js`에서 `selfItems`도 가져온다.

```js
test.describe('③층 보호자 링크 열기', () => {
  async function openOwnLink(page, stayOptions = { hasCompanion: true }) {
    await startTrip(page, stayOptions, { path: '/guardian' });
    const link = await createLink(page);
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'PIN 입력' })).toBeVisible();
  }

  test('PIN 입력: 카드 없음, 열기는 하단 고정 바에서 하단 긴급 바 바로 위에 선다', async ({ page }) => {
    await openOwnLink(page);
    await expect(page.locator('main .card')).toHaveCount(0);
    const bar = page.locator('.guardian-bar.sticky-return.is-flow');
    await expect(bar.getByRole('button', { name: '열기', exact: true })).toBeVisible();
    expect(gapBetween(await bar.boundingBox(), await page.locator('.ui-emergency-bar').boundingBox())).toBe(0);
    // 하단 긴급 바 69px + 고정 바 몫 152px
    expect((await styles(page.locator('main.guardian-page'), ['padding-bottom']))['padding-bottom']).toBe('221px');
  });

  test('틀린 PIN 은 경고 아이콘 + 굵은 긴급 빨강 문장(띠 없음)', async ({ page }) => {
    await openOwnLink(page);
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill('000000');
    await page.getByRole('button', { name: '열기', exact: true }).click();
    const error = page.getByRole('alert').filter({ hasText: 'PIN이 맞지 않아요' });
    await expect(error.locator('svg')).toHaveCount(1);
    await expect.poll(async () => styles(error, ['color', 'border-left-width'])).toEqual({ color: 'rgb(200, 16, 46)', 'border-left-width': '0px' });
  });

  test('사본: 기준 시각은 먹색, 자동 갱신 안내는 회색 Callout, 119·1330 은 회색 52px 버튼(119 아이콘만 긴급 빨강), 복귀 마감 시각은 먹색', async ({ page }) => {
    await openOwnLink(page);
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill(PIN);
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '받은 일정' })).toBeVisible();
    await expect(page.locator('main .card')).toHaveCount(0);

    const asOf = page.locator('.guardian-asof');
    expect(await styles(asOf, ['background-color', 'border-top-width'])).toEqual({ 'background-color': 'rgba(0, 0, 0, 0)', 'border-top-width': '0px' });
    expect((await styles(page.locator('.guardian-asof-time'), ['color']))['color']).toBe('rgb(26, 28, 32)');
    expect((await styles(asOf.locator('.guardian-note'), ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');

    const call119 = page.getByRole('link', { name: /119/ });
    const call1330 = page.getByRole('link', { name: /1330/ });
    for (const call of [call119, call1330]) {
      expect(Math.round((await call.boundingBox()).height)).toBe(52);
      await expect.poll(async () => (await styles(call, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    }
    expect((await styles(call119.locator('svg'), ['color']))['color']).toBe('rgb(200, 16, 46)');
    expect((await styles(call1330.locator('svg'), ['color']))['color']).toBe('rgb(26, 28, 32)');

    const returnTime = page.locator('.guardian-return-time').first();
    await expect(returnTime).toBeVisible();
    expect((await styles(returnTime, ['color']))['color']).toBe('rgb(26, 28, 32)');
    expect((await styles(page.locator('.guardian-return').first(), ['border-top-left-radius']))['border-top-left-radius']).toBe('10px');
  });

  test('동행이 필요한 날: 동행 안내는 띠 없는 분홍 Callout, 두 언어가 함께 보인다', async ({ page }) => {
    await openOwnLink(page, { hasCompanion: true, items: selfItems({ escortRequired: { kind: 'SET', value: true } }) });
    await page.getByLabel('환자에게 받은 PIN (숫자 6자리)').fill(PIN);
    await page.getByRole('button', { name: '열기', exact: true }).click();
    const escort = page.locator('.guardian-escort').first();
    await expect(escort).toBeVisible();
    expect(await styles(escort, ['background-color', 'border-left-width', 'border-top-left-radius'])).toEqual({
      'background-color': 'rgb(255, 233, 240)', 'border-left-width': '0px', 'border-top-left-radius': '10px',
    });
    await expect(escort.locator('p')).toHaveCount(2);
  });
});
```

동행 필수 조건으로 일정이 생기지 않아 `/guardian`이 '일정이 필요해요'를 보이면 `selfItems`에 `outing: 'ALLOWED'`가 그대로인지 확인한다. 그래도 안 되면 그 테스트만 보고서에 이유를 적고 멈춘다.

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-guardian.spec.js
```

Expected: 새 네 건이 FAIL이어야 한다. Task 1의 일곱 건은 PASS다.

- [ ] **Step 3: 링크 열기 (`components/guardian/GuardianOpen.js`)**

- `PinForm`
  - `section.card guardian-pin-card` → `section.guardian-section guardian-pin-card`.
  - 알림 자리 `<p id={errorId} className=… role="alert">`를 `<ErrorText id={errorId}>{shown ? t(shown.key, shown.vars) : null}</ErrorText>`로 바꾼다.
  - 제출 `Button`을 `<div className="guardian-bar sticky-return is-flow">` 안에 넣는다. 바는 `form` 안에 둔다(제출 버튼이다).
- `LoginNeeded`
  - `section.card guardian-login` → `section.guardian-section guardian-login`.
  - `guardian.holdFailed` 문장을 `<WarningNote role="alert">`로 바꾼다.
- 들어온 링크 부분
  - 잘못된 링크 문장을 `<ErrorText>{t('guardian.errInvalidLink')}</ErrorText>`로 바꾼다.
  - 오프라인 문장을 `<WarningNote role="status">`로 바꾼다.
- 저장 실패 `notice`를 `<WarningNote>`로 바꾼다.
- 다른 사본: `section.card guardian-others` → `section.guardian-section guardian-others`.

- [ ] **Step 4: 사본 보기 (`components/guardian/GuardianCopyView.js`)**

- 긴급 연락 링크 `className`
  - 119: `btn btn-secondary guardian-call is-119`.
  - 1330: `btn btn-secondary guardian-call`.
  - 아이콘·글자 마크업은 그대로다.
- `GuardianDay`: `article.card guardian-day` → `article.guardian-day`.
- 머리 주석에 다음 두 가지를 한 줄로 덧붙인다.
  - 긴급 연락은 회색 채움 버튼이고 119 아이콘만 긴급 빨강이다.
  - 하단 긴급 바가 이미 빨강 채움이라 그렇게 한다.

- [ ] **Step 5: 스타일 (`app/styles/guardian.css` /g 절)**

- `.guardian-pin-card .btn` 규칙은 지운다(버튼이 바로 갔다).
- `.guardian-copy`: `gap: var(--space-8)`.
- `.guardian-asof`
  - 면·테두리·모서리·안쪽 여백을 지운다.
  - `.guardian-asof .guardian-note { background: … }` 덮어쓰기도 지운다. 공통 Callout 회색 면이 쓰인다.
- `.guardian-asof-time`: 색 `--ink`(18px 굵게 그대로).
- `.guardian-call`
  - 2px 빨간 테두리·알약·흰 면·호버 규칙을 지운다. `.btn-secondary`가 회색 면·52px·모서리 12·눌림을 맡는다.
  - 남기는 값은 `justify-content: flex-start; gap: var(--space-3)`다.
  - 아이콘은 `--ink`, `.guardian-call.is-119 .ui-icon`만 `--emergency`다.
- `.guardian-calls`: 간격 `var(--space-2)`.
- `.guardian-escort`
  - 바탕 `--support-soft`, 테두리·띠는 없다(`border: 0`), 모서리는 공통 `--radius-10`이다.
  - `margin: 0 0 var(--space-3)`은 그대로 둔다.
- `.guardian-return`: 모서리 `--radius-10`, 안쪽 여백 `var(--space-3) var(--space-4)`.
- `.guardian-return-time`: 색 `--ink`.

- [ ] **Step 6: 진행 현황 한 줄 (`docs/tracking/status.md`)**

`- SEED 적용 ③층 12/15 설정: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 13/15 보호자: 링크 만들기·열기 모두 흰 바탕 한 장(카드 없음), 담기는 것·담기지 않는 것은 체크·X 아이콘 목록, 안내·다시 보내기는 띠 없는 회색 Callout, 주의는 대기 색 Callout, 오류는 경고 아이콘 + 굵은 긴급 빨강, 링크 만들기·열기는 하단 고정 바, 사본의 119·1330은 회색 버튼(119 아이콘만 빨강), 복귀 마감 시각은 먹색. 계획서 `docs/superpowers/plans/2026-10-20-seed-layer3-13-guardian.md`
```

- [ ] **Step 7: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 187건이다(시간대에 따라 skip 가능). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 8: 커밋**

```bash
git add components/guardian/GuardianOpen.js components/guardian/GuardianCopyView.js app/styles/guardian.css e2e/screen-guardian.spec.js docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(guardian): 링크 열기 PIN 을 하단 고정 바로, 사본의 기준 시각·긴급 연락·복귀 마감·동행 안내를 SEED 모양으로

- PIN 입력·로그인·다른 사본 섹션의 카드를 걷어 냄. 열기 버튼은 하단 긴급 바 위 고정 바.
- 잘못된 링크·틀린 PIN 은 경고 아이콘 + 굵은 긴급 빨강, 오프라인·저장 실패는 대기 색 Callout.
- 기준 시각은 상자 없이 먹색, 자동 갱신 안내는 회색 Callout.
- 119·1330 은 회색 52px 버튼(119 아이콘만 긴급 빨강), 복귀 마감 시각은 먹색, 동행 안내는 띠 없는 분홍 Callout.
- 진행 현황 13/15 줄.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.**
  - 이 계획을 시작할 때의 커밋이 작업 전, Task 2 뒤 커밋이 작업 후다. 작업 전 빌드는 `git worktree` 임시 폴더에서 하고, node_modules는 `cp -cR`로 복제한다.
  - /guardian: 첫 화면, 끝까지 내린 화면(고정 바), 오류, 링크 결과, 다시 보내기 안내.
  - /g: PIN 입력, 틀린 PIN, 사본 첫 화면, 사본 전체.
  - 360px·320px × 네 언어로 찍는다. 고정 바가 있는 화면은 전체 캡처와 함께 뷰포트 캡처도 찍는다.
- [ ] **Step 2: 비교 장면을 보여 주고 무엇이 바뀌었는지 한 줄씩 적는다.**
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 14번(개인정보·이용 안내·연동)을 시작하지 않는다.
