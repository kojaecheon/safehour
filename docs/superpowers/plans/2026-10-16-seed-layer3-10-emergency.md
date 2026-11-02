# SEED ③층 10/15 긴급(`/emergency`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 긴급 화면을 설계서 6.2 10번 배치로 바꾼다. 흰 바탕 한 장 위에 아래 요소를 둔다.
- 안내 Callout
- 119: 긴급 빨강 채움, 52px
- 1330: 회색 채움(neutralWeak)
- 해외 발신 링크
- 병원 목록

**Architecture:** 번호, 전화 링크(`contacts.js`), 오프라인·로그인 전 동작, 병원 전화 읽기는 그대로 두고 표시만 바꾼다.
- 전화 버튼은 ②층 버튼(`.btn` 52px · 모서리 12)을 쓴다. 119는 `btn-critical`(긴급 빨강 채움), 1330과 병원은 `btn-secondary`다.
- 번호 설명은 버튼 아래 문장으로 내리고 `aria-describedby`로 잇는다. 버튼 이름은 '119 전화 걸기'처럼 짧게 남는다.

새 화면 테스트는 `e2e/screen-emergency.spec.js`다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 4.6(눌림), 5.1(버튼: neutralWeak·critical, 채운 강조 버튼은 화면당 하나), 5.6(Callout), 6.1, 6.2 10번 행
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`(git 제외)

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`에만 둔다. 이 계획은 새 문구를 만들지 않는다.
- **글쓰기:** 새로 쓰는 주석·문서·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다. 기존 문구는 그대로 둔다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA)이다.
  - 본문은 16px 이상, 터치 대상은 44px 이상이다. 긴급 전화 버튼은 52px 이상이다.
  - 상태는 색 + 문구 + 아이콘으로 보인다.
  - 320px부터 1280px까지 가로 스크롤이 없어야 한다.
- **코발트(`--accent`):** 화면당 주 버튼 하나, 링크, '오늘' 표시, 키보드 초점 링에만 쓴다. 이 화면의 채운 강조 버튼은 119(긴급 빨강) 하나뿐이다.
- **눌림·호버:** 눌림은 면 색(`--pressed*`, 긴급은 `--emergency-strong`)을 바꾸고, 버튼은 요소 전체가 조금 줄어든다(설계서 4.6). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 번호와 `tel:` 링크(119, 1330, +82-2-1330, 병원 전화)를 바꾸지 않는다.
  - 안내 문장의 두 언어 병기를 지킨다.
  - 로그인 전·만료·오프라인에서도 화면이 열리고, 서버를 부르지 않으며, 저장소에 쓰지 않는다.
  - 병원은 사용자가 등록한 병원만 보인다(목록·추천 아님).
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/offline.spec.js`: '119 전화 걸기' 링크(`tel:119`), `/1330 전화 걸기/` 링크.
  - `e2e/accessibility.spec.js`: /emergency axe.
  - `e2e/design-board-components.spec.js`: 셸 긴급 버튼.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 158건이고 Task 1 뒤 165건이 된다(새 테스트 7건).
  - 시간대에 따라 건너뛸 수 있는 기존 테스트가 있다.
  - 색 단언은 `expect.poll`로 쓴다(색 전환 150ms).

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **로그인 전·체류 없음:** 119·1330이 바로 보이고, 병원 자리에는 '등록한 병원이 없어요' 안내가 보여야 한다(Task 1).
2. **화면 읽기 프로그램:** 119 버튼 이름은 '119 전화 걸기'이고, 설명('화재·구급 …')은 버튼의 설명으로 읽혀야 한다(Task 1).
3. **320px 영어:** 'Call 119'와 설명, 1330과 해외 발신 링크, 병원 버튼에 가로 스크롤이 없어야 한다(Task 1).
4. **병원 전화가 없는 병원:** '전화번호가 없어요' 문장이 보이고 버튼이 생기지 않아야 한다. 데이터상 드물어 테스트 대신 코드 경로를 유지한다(Task 1, 리뷰에서 확인).
5. **119 버튼 초점:** 빨강 면 위에서도 키보드 초점이 보여야 한다. 먹색 초점 링이다(Task 1).

## 이 계획이 정한 것

| 무엇 | 설계서 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 안내 | 6.2 10번 '안내 Callout', 5.6 | 왼쪽 빨강 띠 상자를 Callout으로 바꾼다. 회색 면, 모서리 10, 안쪽 14/16, 앞 20px `alert` 아이콘(긴급 빨강) | 5.6 띠 상자는 옅은 면 + 아이콘으로 바꾼다. 긴급 화면이라 아이콘은 긴급 빨강이다 |
| 119 | 6.2 10번 '긴급 채움, 52px' | `btn btn-critical`(52px, 모서리 12, 긴급 빨강 면, 흰 글자). 안에는 전화 아이콘과 '119 전화 걸기'만 둔다. 설명은 버튼 아래 문장이고 `aria-describedby`로 잇는다. 초점 링은 먹색 | 52px 안에 설명 두 줄은 들어가지 않는다. 버튼 이름이 짧아져 화면 읽기 프로그램에도 낫다 |
| 1330 | '1330(neutralWeak)' | `btn btn-secondary`(52px, 회색 면, 먹색 글자). 설명은 버튼 아래, 해외 발신 링크는 그 아래 코발트 링크 | 채운 강조 버튼은 화면당 하나다(119) |
| 병원 목록 | '병원 목록' | 카드 상자를 1px 선으로 나눈 행으로 바꾼다. 행에는 병원 이름(16 굵게)과 작은 회색 전화 버튼(`btn btn-secondary btn-small`)이 있다. 전화가 없으면 안내 문장을 둔다 | 흰 바탕 한 장 화면이라 카드 테두리가 겹면이다 |
| 버튼 그림자·테두리 | 5.1 | 없앤다(`.emergency-call`의 2px 테두리·그림자·64px 높이 제거) | SEED 버튼은 채움만 쓴다 |
| 시안 보드 | carry-over | `EmergencyScreen` 견본이 같은 클래스를 쓴다. 15번에서 다시 맞춘다 | 범위 |

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/emergency/page.js` | 긴급 화면 | 안내 아이콘, 전화 버튼 마크업, 병원 행 |
| `app/styles/emergency.css` | 긴급 배치 | 다시 씀 |
| `e2e/screen-emergency.spec.js` | **새** 긴급 모양 테스트 | 만든다 |
| `docs/tracking/status.md` | 진행 현황 | 한 줄 |

---

### Task 1: 안내 Callout, 119·1330 버튼, 병원 행, 진행 현황

**Files:**
- Create: `e2e/screen-emergency.spec.js`
- Modify: `app/emergency/page.js`
- Modify: `app/styles/emergency.css`(`/* ── /emergency (AX-318) ── */` 절 전체)
- Modify: `docs/tracking/status.md`(한 줄)

**Interfaces:**
- Consumes:
  - `startTrip`, `HOSPITAL_NAME`, `HOSPITAL_PHONE`(`e2e/helpers.js`).
  - `Icon`(`@/components/ui/index.js`).
  - `.btn`·`.btn-critical`·`.btn-secondary`·`.btn-small`(`app/globals.css`).
- Produces: 없음

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-emergency.spec.js`)**

```js
// ③층 긴급(/emergency): SEED 화면 배치 (설계서 6.2 10번)
//
// 흰 바탕 한 장: 안내 Callout / 119(긴급 빨강 채움 52px) / 1330(회색 채움) + 해외 발신 링크 / 등록한 병원 목록.
// 색은 getComputedStyle 의 rgb() 로 비교한다: --surface-alt rgb(243, 244, 245), --emergency rgb(200, 16, 46),
// --ink rgb(26, 28, 32), 흰 글자 rgb(255, 255, 255).

import { test, expect } from './fixtures.js';
import { HOSPITAL_NAME, HOSPITAL_PHONE, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

test.describe('③층 긴급, SEED 배치', () => {
  test('안내 Callout: 왼쪽 띠 없는 회색 면 · 모서리 10 · 안쪽 14, 앞 아이콘, 두 언어 문장', async ({ page }) => {
    await page.goto('/emergency');
    const lead = page.locator('.emergency-lead');
    await expect(lead).toHaveAttribute('role', 'note');
    expect(
      await styles(lead, ['border-left-width', 'background-color', 'border-top-left-radius', 'padding-top']),
    ).toEqual({
      'border-left-width': '0px',
      'background-color': 'rgb(243, 244, 245)',
      'border-top-left-radius': '10px',
      'padding-top': '14px',
    });
    await expect(lead.locator('.emergency-lead-icon svg')).toHaveCount(1);
    await expect(lead.locator('.settings-pair-primary')).toBeVisible();
    await expect(lead.locator('.settings-pair-secondary')).toBeVisible();
  });

  test('119: 긴급 빨강 채움 52px 버튼, 이름은 짧게, 설명은 버튼 설명으로 읽힌다', async ({ page }) => {
    await page.goto('/emergency');
    const call = page.getByRole('link', { name: '119 전화 걸기', exact: true });
    await expect(call).toHaveAttribute('href', 'tel:119');
    await expect(call).toHaveAccessibleDescription('화재·구급 — 구급차가 필요할 때');
    await expect
      .poll(() => styles(call, ['background-color', 'color', 'border-top-left-radius']))
      .toEqual({ 'background-color': 'rgb(200, 16, 46)', color: 'rgb(255, 255, 255)', 'border-top-left-radius': '12px' });
    const box = await call.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(52);
    expect(box.height).toBeLessThan(64);
  });

  test('1330: 회색 채움 52px 버튼, 설명, 해외 발신 링크', async ({ page }) => {
    await page.goto('/emergency');
    const call = page.getByRole('link', { name: '1330 전화 걸기', exact: true });
    await expect(call).toHaveAttribute('href', 'tel:1330');
    await expect(call).toHaveAccessibleDescription(/관광통역안내/);
    await expect
      .poll(() => styles(call, ['background-color', 'color']))
      .toEqual({ 'background-color': 'rgb(243, 244, 245)', color: 'rgb(26, 28, 32)' });
    expect((await call.boundingBox()).height).toBeGreaterThanOrEqual(52);
    const intl = page.getByRole('link', { name: '+82-2-1330 전화 걸기' });
    await expect(intl).toHaveAttribute('href', 'tel:+82-2-1330');
  });

  test('채운 강조 버튼은 119 하나뿐이다', async ({ page }) => {
    await page.goto('/emergency');
    await expect(page.locator('main .btn-critical')).toHaveCount(1);
    await expect(page.locator('main .btn:not(.btn-secondary):not(.btn-critical):not(.btn-quiet)')).toHaveCount(0);
  });

  test('등록한 병원: 카드 없이 행, 작은 회색 전화 버튼', async ({ page }) => {
    await startTrip(page, {}, { path: '/emergency' });
    const row = page.locator('.emergency-hospital').filter({ hasText: HOSPITAL_NAME });
    await expect(row).toBeVisible();
    expect(await styles(row, ['border-left-width', 'border-top-left-radius'])).toEqual({
      'border-left-width': '0px',
      'border-top-left-radius': '0px',
    });
    const call = row.getByRole('link', { name: `${HOSPITAL_PHONE} 전화 걸기` });
    await expect(call).toHaveClass(/btn-secondary/);
    await expect(call).toHaveClass(/btn-small/);
    expect((await call.boundingBox()).height).toBeGreaterThanOrEqual(44);
  });

  test('로그인 전: 병원 자리에는 등록한 병원이 없다는 안내', async ({ page }) => {
    await page.goto('/emergency');
    await expect(page.getByText('등록한 병원이 없어요.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: '119 전화 걸기', exact: true })).toBeVisible();
  });
});
```

`toHaveAccessibleDescription`의 119 설명 문자열은 `src/i18n/messages/emergency.js`의 `emergency.desc119` ko 값과 같아야 한다. 기존 문구라 대시가 들어 있다. 다르면 실제 값으로 맞춘다.

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-emergency.spec.js
```

Expected:
- FAIL이어야 하는 건:
  - 첫 건: 4px 띠가 있다.
  - 둘째·셋째 건: 이름에 설명이 붙어 `exact` 이름이 맞지 않는다.
  - 넷째 건: `.btn-critical`이 없다.
  - 다섯째 건: 카드 테두리가 있다.
- 여섯째 건(로그인 전)은 지금도 통과할 수 있다(회귀 가드).

- [ ] **Step 3: 마크업 (`app/emergency/page.js`)**

3-a. 머리 주석 끝에 한 줄을 더한다.

```js
// - SEED ③층(설계서 6.2 10번): 흰 바탕 한 장. 안내 Callout / 119(긴급 빨강 채움 52px) / 1330(회색 채움) + 해외 발신 링크 / 등록한 병원 행.
```

3-b. `HospitalList`의 `<li>` 안을 아래로 바꾼다. 조건과 문구는 그대로 둔다.

```jsx
        <li key={contact.hospitalId} className="emergency-hospital">
          <p className="emergency-hospital-name">{contact.name}</p>
          {contact.href ? (
            <a className="btn btn-secondary btn-small emergency-hospital-call" href={contact.href}>
              <Icon name="phone" size={20} />
              <span>{t('emergency.callNumber', { number: contact.phone })}</span>
            </a>
          ) : (
            <p className="emergency-no-phone">{t('emergency.hospitalNoPhone')}</p>
          )}
        </li>
```

3-c. `EmergencyPage`의 `<main>` 안을 아래로 바꾼다.

```jsx
      <main className="page emergency-page">
        <div className="emergency-lead" role="note">
          <span className="emergency-lead-icon" aria-hidden="true">
            <Icon name="alert" size={20} />
          </span>
          <PairText k={LEAD_KEY} />
        </div>

        <ul className="emergency-lines" role="list">
          {EMERGENCY_LINES.map((line) => (
            <li key={line.id} className="emergency-line">
              <a
                className={line.id === '119' ? 'btn btn-critical emergency-call' : 'btn btn-secondary emergency-call'}
                href={line.href}
                aria-describedby={`emergency-desc-${line.id}`}
              >
                <Icon name="phone" size={22} strokeWidth={2.4} />
                <span>{t('emergency.callNumber', { number: line.number })}</span>
              </a>
              <p className="emergency-line-desc" id={`emergency-desc-${line.id}`}>
                {t(LINE_DESC[line.id])}
              </p>
              {line.intl && (
                <p className="emergency-intl">
                  <span>{t('emergency.intlLabel')}</span>
                  <a className="emergency-intl-link" href={line.intl.href}>
                    {t('emergency.callNumber', { number: line.intl.number })}
                  </a>
                </p>
              )}
            </li>
          ))}
        </ul>

        <section className="emergency-section" aria-labelledby="emergency-hospitals-title">
          <h2 id="emergency-hospitals-title">{t('emergency.hospitalsTitle')}</h2>
          <HospitalList />
        </section>
      </main>
```

`Icon`의 `strokeWidth` 속성은 지금 코드가 쓰고 있다. 그대로 둔다.

- [ ] **Step 4: 모양 (`app/styles/emergency.css`)**

`/* ── /emergency (AX-318) ── */` 제목 줄 아래의 규칙 전체(`.emergency-lead`부터 `.emergency-no-phone, .emergency-empty`까지)를 아래로 바꾼다. 파일 머리 주석은 그대로 둔다.

```css
/* ── /emergency (설계서 6.2 10번): 흰 바탕 한 장. 안내 Callout / 119 / 1330 / 해외 발신 / 등록한 병원 ── */

/* 안내 (SEED Callout, 설계서 5.6): 회색 면 · 모서리 10 · 안쪽 14/16, 앞 20px 경고 아이콘(긴급 빨강). 두 언어 병기 */
.emergency-lead {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: var(--space-2);
  align-items: start;
  padding: 14px var(--space-4);
  margin-bottom: var(--space-5);
  border-radius: var(--radius-10);
  background: var(--surface-alt);
}
.emergency-lead-icon {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: var(--lh-body);
  color: var(--emergency);
}
.emergency-lead .settings-pair-primary {
  color: var(--ink);
  font-weight: var(--weight-bold);
}

/* 전화 줄: 버튼(52px) 아래 설명, 1330 은 그 아래 해외 발신 링크 */
.emergency-lines {
  display: grid;
  gap: var(--space-5);
  list-style: none;
  margin-bottom: var(--space-6);
}
.emergency-line-desc {
  margin-top: var(--space-2);
  font-size: var(--text-body);
  color: var(--ink-soft);
}
/* 119 는 긴급 빨강 채움(btn-critical). 빨강 면 위 코발트 초점 링은 잘 안 보여 먹색으로 */
.emergency-call.btn-critical:focus-visible {
  outline-color: var(--ink);
}

.emergency-intl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 var(--space-2);
  margin-top: var(--space-1);
  font-size: var(--text-body);
  color: var(--ink-soft);
}
.emergency-intl-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-min);
  font-weight: var(--weight-bold);
  color: var(--accent-strong);
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* 등록한 병원: 카드 없이 1px 선으로 나눈 행. 이름 + 작은 회색 전화 버튼 */
.emergency-section h2 {
  margin-bottom: var(--space-2);
}
.emergency-hospitals {
  list-style: none;
}
.emergency-hospital {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) 0;
}
.emergency-hospital + .emergency-hospital {
  border-top: 1px solid var(--line);
}
.emergency-hospital-name {
  font-size: var(--text-body);
  font-weight: var(--weight-bold);
  color: var(--ink);
}
.emergency-hospital-call {
  justify-self: start;
}
.emergency-no-phone,
.emergency-empty {
  font-size: var(--text-body);
  color: var(--ink-soft);
}
```

`.btn`(52px, 모서리 12, 가운데 정렬, 전체 폭, 굵게, 눌림 축소)과 `.btn-critical`·`.btn-secondary`·`.btn-small`의 면 색·눌림·호버는 `app/globals.css`의 규칙을 그대로 쓴다. 이 파일에서 다시 정하지 않는다.

- [ ] **Step 5: 진행 현황 한 줄 (`docs/tracking/status.md`)**

`- SEED 적용 ③층 11/15 더보기: …` 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 10/15 긴급: 흰 바탕 한 장, 안내는 띠 없는 Callout(경고 아이콘), 119는 긴급 빨강 채움 52px 버튼(설명은 버튼 아래, 버튼 설명으로 연결, 초점 링 먹색), 1330은 회색 채움 버튼 + 해외 발신 링크, 등록한 병원은 카드 없이 선으로 나눈 행과 작은 회색 전화 버튼. 계획서 `docs/superpowers/plans/2026-10-16-seed-layer3-10-emergency.md`
```

- [ ] **Step 6: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-emergency.spec.js e2e/offline.spec.js e2e/accessibility.spec.js e2e/design-board-components.spec.js e2e/responsive.spec.js
```

Expected: PASS(`screen-emergency` 6건과 기존 파일).
- `offline.spec.js`의 '119 전화 걸기'(`tel:119`)와 `/1330 전화 걸기/` 단언이 그대로 통과해야 한다.
- axe 위반이 나오면 값을 느슨하게 하지 말고 보고한다.

- [ ] **Step 7: 320px 네 언어 확인 (테스트 한 건을 더 둔다)**

`e2e/screen-emergency.spec.js` 묶음 끝에 더한다.

```js
  test('320px English: 긴급 화면에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await startTrip(page, {}, { path: '/emergency' });
    await expect(page.getByRole('link', { name: 'Call 119', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
```

- [ ] **Step 8: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 165건이다(158 + 7, 시간대에 따라 skip 가능). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 9: 커밋**

```bash
git add app/emergency/page.js app/styles/emergency.css e2e/screen-emergency.spec.js docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(emergency): 긴급을 SEED 배치로, 119 긴급 빨강 52px · 1330 회색 버튼, 안내 Callout, 병원 행

- 안내는 왼쪽 빨강 띠 상자 대신 회색 Callout + 경고 아이콘(두 언어 병기 유지).
- 119 는 btn-critical 52px(초점 링 먹색), 1330 은 btn-secondary 52px. 설명은 버튼 아래 문장, aria-describedby 로 연결.
- 해외 발신 링크는 1330 아래 코발트 링크 그대로.
- 등록한 병원은 카드 없이 선으로 나눈 행, 작은 회색 전화 버튼.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 이 계획을 시작할 때의 커밋과 Task 1 뒤 커밋을 각각 빌드해 /emergency를 찍는다.
  - 360px·320px × 네 언어로 찍는다. 로그인 전과 체류 있음 두 경우를 찍는다.
  - '작업 전' 빌드는 `git worktree add` 임시 폴더에서 한다(이 체크아웃을 떼어 놓지 않는다).
- [ ] **Step 2: 비교 장면을 보여 주고 무엇이 바뀌었는지 한 줄씩 적는다.**
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 12번(설정)을 시작하지 않는다.
