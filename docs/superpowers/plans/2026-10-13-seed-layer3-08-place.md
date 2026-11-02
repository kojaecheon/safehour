# SEED ③층 8/15 장소 상세(`/place/[id]`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 장소 상세를 설계서 6.2 8번 배치로 바꾼다. 회색 바탕 위에 흰 블록을 놓는다.
- 그림과 이름·체류·배지는 한 블록이다.
- 지도 버튼 [구글][카카오]는 회색 반반이다.
- 그 뒤에 출처 블록(SafeHour 추정 / 관광공사 원문)이 온다.

**Architecture:** 정거장 찾기, 상세 조회, 길찾기 막힘 조건은 그대로 두고 표시만 바꾼다. 부품 모양은 그대로 쓰고 화면 배치만 바꾼다.
- 장소 카드: `CourseCard` → `PlaceCard`(feature).
- 출처 영역: `SourceArea`.
- 지도 링크: `MapLinks`.

새 화면 테스트는 `e2e/screen-place.spec.js`다. 7번에서 넘긴 작은 일(진행 현황 7/15 줄 정정, 오늘 화면 병원 안내 블록 위치 단언)을 Task 2에 함께 싣는다.

**Tech Stack:** Next.js 16 App Router · React 19 · 순수 CSS 변수 · Playwright(e2e, axe)

**Spec:** `docs/superpowers/specs/2026-09-24-seed-design-adoption-design.md`
- 4.5(층), 5.1(버튼 neutralWeak), 5.5(흰 블록), 5.6(출처 영역)
- 6.1, 6.2 8번 행
- 넘김 메모: `.superpowers/sdd/_tools/carry-over.md`의 '7번(오늘)에서 넘긴 것' 절(git 제외)

## Global Constraints

- **의존성:** 새 패키지를 설치하지 않는다. `package.json`·`package-lock.json`을 고치지 않는다. `npx`로 새 도구를 내려받지 않는다.
- **토큰:** 정본은 `app/globals.css` `:root` 한 곳이다. 기능 스타일(`app/styles/*.css`)에는 hex 색과 새 글자 크기를 쓰지 않는다. 이 계획은 새 토큰을 만들지 않는다.
- **문구:** `src/i18n/messages/`에만 둔다. 이 계획은 새 문구를 만들지 않는다.
- **글쓰기:** 새로 쓰는 주석·문서·커밋 메시지에 엠대시(—)·엔대시(–)를 쓰지 않는다.
- **대비·크기:**
  - 대비는 글자 4.5:1, UI 경계·아이콘 3:1(WCAG 2.1 AA)이다.
  - 본문은 16px 이상, 터치 대상은 44px 이상이다.
  - 상태는 색 + 문구 + 아이콘으로 보인다.
  - 320px부터 1280px까지 가로 스크롤이 없어야 한다.
- **코발트(`--accent`):** 화면당 주 버튼 하나, 링크, 타임라인 선, '오늘' 표시, 키보드 초점 링에만 쓴다.
- **눌림·호버:** 눌림은 면 색만 바꾼다(`--pressed*`). 호버는 `@media (hover: hover) and (pointer: fine)` 안에서만 쓴다.
- **안전 규칙:**
  - 의료 판단을 만들지 않고, '안전합니다'라고 쓰지 않는다.
  - 출처 영역 구분을 지킨다. 관광공사 원문(이중 왼쪽 띠)과 SafeHour 추정(점선 회색 면)은 다른 영역이다. 원문은 번역하지 않고 원문 언어를 `lang`으로 밝힌다.
  - 운영 시간 원문을 영업 여부로 바꾸지 않는다.
  - '운영 확인 필요', '추정', 출처 'ⓒ한국관광공사' 표시를 지킨다.
  - 지도 링크는 목적지 이름·좌표만 넘긴다. 매일 확인 전인 오늘 장소면 길찾기를 막고 이유를 보인다.
- **표시만 바꾼다:** 다음은 그대로 둔다.
  - 정거장 찾기(`findPlaceStop`)와 상세 조회(`/api/place`, 캐시, 실패 처리).
  - 문구와 조건.
  - 사진 참조 방식(내려받기·가공 금지).
- **기존 화면 테스트:** 역할·이름 단언을 고치지 않는다.
  - `e2e/core-flow.spec.js`: 길찾기 비활성 버튼 이름, '매일 확인을 마치면 길찾기를 쓸 수 있어요.'
  - `e2e/editing.spec.js`: 지도 링크 이름과 주소, '목적지(이 장소)의 이름과 좌표만 넘겨요.'
  - `e2e/accessibility.spec.js`(axe), `e2e/responsive.spec.js`, `e2e/network.spec.js`.
- **커밋:** 로컬에만 한다. 한국어 메시지로 쓰고, 끝에 `Co-Authored-By:` 한 줄을 둔다(커밋을 만든 에이전트의 하네스가 정한 모델 표기).
- **관문:** `npm run lint` · `npm test` · `npm run build` · `npm run e2e`가 모두 exit 0이어야 한다(build 뒤에 e2e).
  - e2e는 지금 138건이고 Task 1 뒤 142 → Task 2 뒤 146건이 된다.
  - 시간대에 따라 건너뛸 수 있는 테스트는 두 건이다: `e2e/demo-events.spec.js` 한 건, 이 계획의 '오늘 정거장 길찾기 막힘' 테스트.
  - 색 단언은 `expect.poll`로 쓴다(색 전환 150ms).
- **테스트 날짜:** 요일 휴무로 어떤 날은 식사 칸만 있다. 장소는 `findEditableStop(tripPlan, { meal })`로 고르고 '내일'로 고정하지 않는다.

## Review Focus

설계서가 함의하지만 태스크 테스트가 따로 묶지 않으면 사람이 먼저 부딪힐 입력 다섯 가지와, 그 테스트를 맡은 태스크다.
1. **320px 영어:** 'Open in Google Maps'·'Open in KakaoMap'이 두 줄이어도 두 버튼이 한 줄 반반이고 가로 스크롤이 없어야 한다(Task 1·2).
2. **매일 확인 전인 오늘 장소:** 막힌 두 버튼도 반반이고, 막은 이유 문장이 지도 블록 안에 보여야 한다(Task 2).
3. **상세 불러오기 실패:** 실패 안내 문장이 관광공사 원문 블록 안에 보이고, 일정 속 정보(추정 블록)는 그대로여야 한다(Task 2).
4. **식사 장소:** 주문 카드 블록의 회색 버튼이 흰 면 위에서 버튼으로 보여야 한다(Task 2).
5. **사진·접근성 정보가 없는 장소:** 내용 없는 빈 흰 블록이 생기면 안 된다(Task 1).

## 이 계획이 정한 것

| 무엇 | 설계서·넘김 | 이 계획 | 이유 |
| --- | --- | --- | --- |
| 바탕과 블록 순서 | 6.2 8번 '그림 / 이름·체류·배지 블록 / 지도 버튼 / 출처 블록' | `main`에 `is-basement`. 블록 순서는 아래와 같다. 각 블록은 내용이 있을 때만 그린다. 출처 문장은 블록 밖 회색 바탕 위 맺음 줄이다 | 설계서 순서를 따르고, 출처가 다른 내용은 다른 블록에 둔다 |
| 그림과 이름 | 6.2 8번 | 장소 카드(feature)를 흰 블록 하나에 넣는다. 블록 안쪽 여백을 0으로 두고 카드의 테두리·모서리를 없애, 그림이 화면 폭 끝까지 차고 이름·체류·배지가 바로 아래에 온다 | 흰 블록 안 카드는 겹면이다 |
| 지도 버튼 | 6.2 8번 '[구글][카카오] neutralWeak 반반' | 장소 상세에서만 두 버튼을 늘 반반 grid(`minmax(0, 1fr)` 두 칸)로. 회색 작은 버튼(`btn-secondary btn-small`)은 그대로 | 지금은 `flex: 1 1 140px`라 폭이 좁으면 두 줄로 갈린다. 다른 화면의 지도 링크는 이번 범위 밖 |
| 출처 블록 | 5.6 출처 영역 구분 | SafeHour 추정 영역(점선 회색 면)은 자기 블록에 둔다. 관광공사 원문 영역들(한국어 이름, 개요, 운영 시간)과 상세 불러오기 안내 문장은 한 블록에 모은다. 출처 영역의 테두리 모양은 바꾸지 않는다 | 출처가 다른 내용을 한 블록에 섞지 않는다. 출처 표시 모양은 안전 원칙이다 |
| 주문 카드·접근성 정보·사진 | 5.5 | 테두리 상자(`.place-block`)를 테두리 없는 블록 구역으로. 클래스 이름은 시안 보드 견본이 쓰므로 그대로 두고 규칙만 바꾼다 | 흰 블록 안 카드는 겹면이다. 회색 버튼이 흰 면 위에서 보인다 |
| 7번 넘김 | carry-over | 진행 현황 7/15 줄의 블록 목록을 실제와 맞춘다. 오늘 화면 병원 안내 블록이 상태 블록 바로 다음인지 단언을 더한다 | 7번 최종 검토의 남은 일 |

블록 순서는 다음과 같다.
1. 그림·이름·체류·배지
2. 지도
3. 이 장소의 일정(SafeHour 추정)
4. 주문 카드(식사 장소)
5. 관광공사 원문(한국어 이름·불러오기 안내·개요·운영 시간·부분 실패)
6. 접근성 정보
7. 사진

## 파일 구조

| 파일 | 역할 | 이 계획에서 |
| --- | --- | --- |
| `app/place/[candidateId]/page.js` | 장소 상세 | 블록 감싸기(T1) |
| `app/styles/place.css` | 장소 배치 | 블록·그림·구역(T1), 지도 반반(T2) |
| `e2e/screen-place.spec.js` | **새** ③층 장소 모양 테스트 | T1이 만들고 T2가 더한다 |
| `e2e/screen-today.spec.js` | 오늘 테스트 | 병원 안내 위치 단언 한 줄(T2) |
| `docs/tracking/status.md` | 진행 현황 | 7/15 줄 정정과 8/15 줄(T2) |

---

### Task 1: 회색 바탕·흰 블록, 그림 블록, 출처 블록

**Files:**
- Create: `e2e/screen-place.spec.js`
- Modify: `app/place/[candidateId]/page.js`(불러오는 중·빈 상태 두 분기의 `<main>`, 본문 `return (` 안)
- Modify: `app/styles/place.css`(`.place-page` 아래 블록 규칙, `.place-block` 무리)

**Interfaces:**
- Consumes:
  - `startTrip`, `findEditableStop`, `readRecord`, `kstDate`, `stopsOf`(`e2e/helpers.js`).
  - `.ui-block`, `main.page.is-basement`(`app/styles/ui.css`).
- Produces:
  - 블록 클래스 `place-hero`, `place-maps`, `place-plan-block`, `place-source-block`.
  - 테스트 도우미 `styles`, `gapBetween`, `placeHrefOf(stop)`, `openPlace(page, { meal, confirmToday })`.

- [ ] **Step 1: 실패하는 화면 테스트를 쓴다 (`e2e/screen-place.spec.js`)**

```js
// ③층 장소 상세(/place/[id]): SEED 화면 배치 (설계서 6.2 8번)
//
// 회색 바탕 위 흰 블록: 그림·이름·체류·배지 / 지도 / 이 장소의 일정(SafeHour 추정) / 주문 카드 / 관광공사 원문 / 접근성 / 사진.
// 장소는 e2e 도우미 findEditableStop 으로 고른다(요일 휴무로 어떤 날은 식사 칸만 있다).
// 색은 getComputedStyle 의 rgb() 로 비교한다: --layer-basement·--surface-alt rgb(243, 244, 245), 흰 면 rgb(255, 255, 255).

import { test, expect } from './fixtures.js';
import { findEditableStop, startTrip } from './helpers.js';

async function styles(locator, props) {
  return locator.evaluate(
    (el, names) => Object.fromEntries(names.map((name) => [name, getComputedStyle(el).getPropertyValue(name)])),
    props,
  );
}

const gapBetween = (upper, lower) => Math.round(lower.y - (upper.y + upper.height));

/** 장소 상세 주소 (components/CourseCard.js placeHref 와 같다) */
const placeHrefOf = (stop) =>
  `/place/${encodeURIComponent(String(stop.candidateId ?? stop.contentId))}?stop=${encodeURIComponent(String(stop.id))}`;

/** 체류를 심고, 오늘 이후 식사(meal=true) 또는 식사 아닌(meal=false) 첫 정거장의 장소 상세를 연다 */
async function openPlace(page, { meal = false } = {}) {
  const { tripPlan } = await startTrip(page, {}, { path: '/trip' });
  const found = findEditableStop(tripPlan, { meal });
  expect(found, meal ? '식사 정거장이 있어야 한다' : '식사 아닌 정거장이 있어야 한다').not.toBeNull();
  await page.goto(placeHrefOf(found.stop));
  await expect(page.locator('main .ui-source').first()).toBeVisible();
  return found;
}

test.describe('③층 장소 상세, 회색 바탕과 블록', () => {
  test('회색 바탕 위 흰 블록: 그림 블록이 상단 바 바로 아래, 카드 테두리 없이 화면 폭, 블록 사이 8px', async ({ page }) => {
    await openPlace(page);
    const main = page.locator('main.place-page');
    expect((await styles(main, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
    const blocks = main.locator(':scope > .ui-block');
    expect(await blocks.count()).toBeGreaterThanOrEqual(4);
    const hero = blocks.first();
    await expect(hero).toHaveClass(/place-hero/);
    expect(gapBetween(await page.locator('.top-bar').boundingBox(), await hero.boundingBox())).toBe(0);
    expect(gapBetween(await blocks.nth(0).boundingBox(), await blocks.nth(1).boundingBox())).toBe(8);
    const card = hero.locator('.ui-place');
    expect(await styles(card, ['border-top-width', 'border-top-left-radius'])).toEqual({
      'border-top-width': '0px',
      'border-top-left-radius': '0px',
    });
    // 그림이 블록(= main 의 바깥 폭) 끝까지 찬다
    expect(Math.round((await hero.locator('.ui-place-media').boundingBox()).width)).toBe(Math.round((await main.boundingBox()).width));
  });

  test('출처 블록: SafeHour 추정과 관광공사 원문은 서로 다른 흰 블록, 출처 영역 테두리는 그대로', async ({ page }) => {
    await openPlace(page);
    const plan = page.locator('main.place-page > .place-plan-block');
    const source = page.locator('main.place-page > .place-source-block');
    await expect(plan.locator('.ui-source-estimate')).toHaveCount(1);
    await expect(plan.locator('.ui-source-tourism')).toHaveCount(0);
    expect(await source.locator('.ui-source-tourism').count()).toBeGreaterThanOrEqual(1);
    await expect(source.locator('.ui-source-estimate')).toHaveCount(0);
    expect((await styles(plan.locator('.ui-source-estimate'), ['border-top-style']))['border-top-style']).toBe('dotted');
    expect((await styles(source.locator('.ui-source-tourism').first(), ['border-left-style']))['border-left-style']).toBe('double');
  });

  test('빈 흰 블록이 없다', async ({ page }) => {
    await openPlace(page);
    const texts = await page
      .locator('main.place-page > .ui-block')
      .evaluateAll((els) => els.map((el) => el.innerText.trim().length));
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((n) => n > 0), `빈 블록: ${JSON.stringify(texts)}`).toBe(true);
  });

  test('320px English: 장소 상세에 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await openPlace(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
```

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-place.spec.js
```

Expected:
- 앞의 세 건은 FAIL이어야 한다.
  - 첫 건: 바탕이 흰색이고 `.ui-block`이 없다.
  - 둘째 건: `.place-plan-block`이 없다.
  - 셋째 건: `texts.length`가 0이다.
- 넷째 건(320px)은 지금도 통과할 수 있다(회귀 가드).

- [ ] **Step 3: 블록 감싸기 (`app/place/[candidateId]/page.js`)**

3-a. 파일 머리 주석 `//   - 상세는 보강이다. …` 줄 아래에 한 줄을 더한다.

```js
//   - SEED ③층(설계서 6.2 8번): 회색 바탕 위 흰 블록. 그림·이름 / 지도 / 이 장소의 일정(추정) / 주문 카드 / 관광공사 원문 / 접근성 / 사진.
```

3-b. 불러오는 중(`if (!today)`)과 정거장 없음(`if (!stop)`) 두 분기의 `<main className="page place-page">`를 `<main className="page place-page is-basement">`로 바꾼다. 안의 `p.place-loading`과 `EmptyState`를 각각 `<div className="ui-block"> … </div>`로 감싼다.

3-c. 본문 `return (`의 `<main>` 안을 아래로 바꾼다. **요소의 조건·속성·문구는 그대로** 두고 묶음만 나눈다. 바뀌는 점은 다음과 같다.
- 지도·주문 카드·접근성·사진 구역이 `ui-block place-block` 흰 블록이 된다.
- 관광공사 원문 영역들과 불러오기 안내 문장, 부분 실패 문장이 `place-source-block` 하나에 모인다.

```jsx
      <main className="page place-page is-basement">
        <div className="ui-block place-hero">
          <CourseCard stop={stop} link={false} variant="feature" headingLevel={2} showTime={false} />
        </div>

        <section className="ui-block place-block place-maps" aria-labelledby="place-maps-h">
          <h2 id="place-maps-h">{t('place.mapsTitle')}</h2>
          <MapLinks stop={stop} disabled={gated} disabledKey={trip.dailyCheckPending ? 'today.gatedMaps' : 'today.gatedHospital'} showNote />
        </section>

        <div className="ui-block place-plan-block">
          <SourceArea source="estimate" title={t('place.planTitle')} note={t('place.estimateNote')}>
            <dl className="place-facts">
              <div>
                <dt>{t('place.visit')}</dt>
                <dd>
                  {formatDate(found.date, locale)} · {stop.arriveAt}–{stop.leaveAt} · {role}
                </dd>
              </div>
              <div>
                <dt>{t('place.stay')}</dt>
                <dd>
                  {t('trip.stayMin', { n: stop.stayMin })}
                  {stop.shortened ? ` · ${t('trip.shortened')}` : ''}
                </dd>
              </div>
              {leg && (
                <div>
                  <dt>{t('place.leg')}</dt>
                  <dd>
                    {leg} <Badge kind="estimate" />
                  </dd>
                </div>
              )}
              {Number.isFinite(stop.walkBurdenMin) && (
                <div>
                  <dt>{t('place.walk')}</dt>
                  <dd>
                    {t('place.walkValue', { n: stop.walkBurdenMin })} <Badge kind="estimate" />
                  </dd>
                </div>
              )}
              <div>
                <dt>{t('place.indoor')}</dt>
                <dd>{t(stop.indoor === true ? 'trip.indoor' : stop.indoor === false ? 'trip.outdoor' : 'trip.indoorUnknown')}</dd>
              </div>
              {stop.pinned && (
                <div>
                  <dt>{t('place.picked')}</dt>
                  <dd>{t('trip.pinned')}</dd>
                </div>
              )}
            </dl>
            {flags.badges.includes('hoursUnconfirmed') && <p className="place-note">{t('place.hoursNote')}</p>}
            {flags.dietEstimated && <p className="place-note">{t('place.dietNote')}</p>}
          </SourceArea>
        </div>

        {flags.orderCard && (
          <section className="ui-block place-block" aria-labelledby="place-order-h">
            <h2 id="place-order-h">{t('trip.orderCard')}</h2>
            <p>{t('place.orderCardBody')}</p>
            <Button href="/cards#cards-diet" variant="secondary">
              {t('place.orderCardCta')}
            </Button>
          </section>
        )}

        <div className="ui-block place-source-block">
          <SourceArea source="tourism" title={t('place.koTitle')} lang="ko">
            {stop.ko?.title ? (
              <>
                <p className="place-ko-name">{stop.ko.title}</p>
                {stop.ko.address && <p>{stop.ko.address}</p>}
              </>
            ) : (
              <p lang={lang}>
                {stop.address} — {t('place.koMissing')}
              </p>
            )}
            <p>
              <Link className="trip-inline-link" href="/cards#cards-move" lang={lang}>
                {t('place.moveCard')}
              </Link>
            </p>
          </SourceArea>

          {current.status === 'loading' && (
            <p className="place-loading" role="status">
              {t('place.loadingDetails')}
            </p>
          )}
          {(current.status === 'error' || (!canFetch && trip.readOnly)) && (
            <p className="place-note" role="status">
              {t(current.errorKey ?? 'place.errDetailOffline')}
            </p>
          )}

          {details?.overview && (
            <SourceArea source="tourism" title={`${t('place.overviewTitle')} · ${t(OVERVIEW_LANG_KEY[overviewLang] ?? 'place.langKo')}`} note={t('place.source')}>
              <p lang={overviewLang} className="place-overview">
                {details.overview}
              </p>
            </SourceArea>
          )}

          {details && (
            <SourceArea source="tourism" title={t('place.scheduleTitle')} note={t('place.scheduleNote')}>
              {scheduleEntries.length > 0 ? (
                <dl className="place-schedule">
                  {scheduleEntries.map(([field, value]) => (
                    <div key={field}>
                      <dt lang={lang}>{SCHEDULE_FIELD_KEY[field] ? t(SCHEDULE_FIELD_KEY[field]) : field}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p lang={lang}>{t('place.scheduleEmpty')}</p>
              )}
            </SourceArea>
          )}

          {details?.errors?.length > 0 && <p className="place-note">{t('place.partialErrors', { count: details.errors.length })}</p>}
        </div>

        {stop.sourceIds?.barrierFree && (
          <section className="ui-block place-block" aria-labelledby="place-access-h">
            <h2 id="place-access-h">{t('place.accessTitle')}</h2>
            <p>{t('place.accessBody')}</p>
          </section>
        )}

        {details?.images?.length > 0 && (
          <section className="ui-block place-block" aria-labelledby="place-photos-h">
            <h2 id="place-photos-h">{t('place.photosTitle')}</h2>
            <div className="place-photos">
              {details.images.slice(0, 4).map((image) => (
                <figure key={image.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 관광공사 원본 URL 을 참조만 한다(내려받기·가공 금지, spec 9.1) */}
                  <img src={image.url} alt={image.name ? `${stop.title} — ${image.name}` : stop.title} loading="lazy" referrerPolicy="no-referrer" />
                  <figcaption>
                    {t('place.source')} ·{' '}
                    {COPYRIGHT_KEY[image.copyrightDivisionCode]
                      ? t(COPYRIGHT_KEY[image.copyrightDivisionCode])
                      : image.copyrightDivisionCode
                        ? t('place.copyrightOther', { code: image.copyrightDivisionCode })
                        : t('place.copyrightUnknown')}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <p className="trip-footer" lang={safetyLang}>
          {t('place.footer')}
        </p>
      </main>
```

위 코드의 요소·조건·속성·문구는 지금 파일과 같다(기존 주석의 대시 포함). 다른 점은 블록 감싸기와 위치뿐이다. 지금 파일과 한 줄씩 대조해 옮긴다.

- [ ] **Step 4: 블록 모양 (`app/styles/place.css`)**

4-a. `.place-page > * { min-width: 0; }` 규칙 바로 아래에 더한다.

```css
/* 장소 상세 (설계서 6.2 8번): 회색 바탕 위 흰 블록. 블록 틈(8px)이 간격을 주므로 화면 공통 세로 간격을 끈다 */
.place-page.is-basement {
  gap: 0;
}
/* 그림·이름 블록: 블록 안쪽 여백을 없애 그림이 화면 폭 끝까지 차고, 카드 테두리·모서리를 없앤다(흰 블록 안 카드는 겹면) */
.ui-block.place-hero {
  padding: 0;
}
.place-hero > .ui-place {
  border: 0;
  border-radius: 0;
}
/* 출처 문장: 회색 바탕 위 맺음 줄이라 위 선을 두지 않는다 */
.place-page.is-basement > .trip-footer {
  border-top: 0;
  padding-top: 0;
}
```

4-b. `.place-block { … }` 규칙을 아래로 바꾼다. `.place-block h2`, `.place-block p`는 그대로 둔다.

```css
/* 구역(지도·주문 카드·접근성·사진): 흰 블록 자체가 구역이라 테두리 상자를 두지 않는다.
   시안 보드 견본도 같은 클래스를 쓴다(15번에서 다시 맞춘다) */
.place-block {
  display: grid;
  gap: var(--space-2);
}
```

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-place.spec.js e2e/core-flow.spec.js e2e/editing.spec.js e2e/accessibility.spec.js e2e/responsive.spec.js e2e/network.spec.js
```

Expected: PASS. `screen-place` 4건과 기존 파일이 모두 통과해야 한다. 기존 단언이 깨지면 단언을 고치지 말고 멈추고 보고한다.

- [ ] **Step 6: 커밋**

```bash
git add "app/place/[candidateId]/page.js" app/styles/place.css e2e/screen-place.spec.js
git commit -m "$(cat <<'MSG'
style(place): 장소 상세를 회색 바탕 위 흰 블록으로, 그림 블록 화면 폭, 출처별 블록

- 장소 상세를 회색 바탕 위 흰 블록으로: 그림·이름 / 지도 / 이 장소의 일정(추정) / 주문 카드 / 관광공사 원문 / 접근성 / 사진.
- 그림 블록은 안쪽 여백 없이 화면 폭, 장소 카드 테두리·모서리 제거.
- SafeHour 추정과 관광공사 원문은 서로 다른 블록, 출처 영역 테두리는 그대로.
- 구역 상자(.place-block)의 테두리를 없앤다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 2: 지도 버튼 반반, 막힘·실패·주문 카드 확인, 7번 넘김, 진행 현황

**Files:**
- Modify: `e2e/screen-place.spec.js`(파일 끝에 묶음 하나, 가져오기 줄)
- Modify: `e2e/screen-today.spec.js`(병원 안내 테스트에 단언 한 줄)
- Modify: `app/styles/place.css`(지도 반반 규칙 추가)
- Modify: `docs/tracking/status.md`(7/15 줄 정정, 8/15 줄 추가)

**Interfaces:**
- Consumes:
  - Task 1의 `styles`, `placeHrefOf`, `openPlace`.
  - 블록 `place-maps`, `place-plan-block`, `place-source-block`.
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 더한다 (`e2e/screen-place.spec.js` 끝)**

가져오기 줄을 `import { findEditableStop, kstDate, readRecord, startTrip, stopsOf } from './helpers.js';`로 바꾼다.

```js
test.describe('③층 장소 상세, 지도 버튼과 상태별 블록', () => {
  /** 두 버튼이 한 줄에 같은 폭으로(반반) 놓였는지 */
  async function expectHalves(row) {
    const items = row.locator(':scope > *');
    await expect(items).toHaveCount(2);
    const [a, b] = [await items.nth(0).boundingBox(), await items.nth(1).boundingBox()];
    expect(Math.round(a.y)).toBe(Math.round(b.y));
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
  }

  test('지도 버튼 [구글][카카오]: 회색 작은 버튼 반반', async ({ page }) => {
    await openPlace(page);
    const row = page.locator('main.place-page > .place-maps .trip-map-row');
    await expectHalves(row);
    const google = row.getByRole('link', { name: /구글 지도로 열기/ });
    await expect.poll(async () => (await styles(google, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
  });

  test('320px English: 두 줄 글자여도 지도 버튼은 한 줄 반반', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await openPlace(page);
    await expectHalves(page.locator('main.place-page > .place-maps .trip-map-row'));
  });

  test('매일 확인 전인 오늘 장소: 막힌 두 버튼도 반반, 막은 이유가 지도 블록 안', async ({ page }) => {
    const { tripPlan } = await startTrip(page, {}, { path: '/trip', confirmToday: false });
    const stop = stopsOf(tripPlan.days[kstDate(0)] ?? { outings: [] })[0];
    test.skip(!stop, '오늘 남은 정거장이 없는 시각이다');
    await page.goto(placeHrefOf(stop));
    const maps = page.locator('main.place-page > .place-maps');
    await expect(maps.getByRole('button', { name: /구글 지도로 열기/ })).toBeDisabled();
    await expectHalves(maps.locator('.trip-map-row'));
    await expect(maps.getByText('매일 확인을 마치면 길찾기를 쓸 수 있어요.')).toBeVisible();
  });

  test('상세 불러오기 실패: 안내 문장은 관광공사 원문 블록 안, 추정 블록은 그대로', async ({ page }) => {
    await page.route('**/api/place', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' }));
    await openPlace(page);
    const source = page.locator('main.place-page > .place-source-block');
    await expect(source.getByText('상세 정보를 불러오지 못했어요. 일정 속 정보는 그대로예요.')).toBeVisible();
    await expect(page.locator('main.place-page > .place-plan-block .ui-source-estimate')).toBeVisible();
  });

  test('식사 장소: 주문 카드는 테두리 없는 흰 블록, 회색 버튼이 흰 면 위에 보인다', async ({ page }) => {
    await openPlace(page, { meal: true });
    const order = page.getByRole('region', { name: '주문할 때 보여 줄 한국어 카드' });
    test.skip((await order.count()) === 0, '이 식사 정거장에는 주문 카드 라벨이 없다');
    await expect(order).toHaveClass(/ui-block/);
    expect(await styles(order, ['border-top-width', 'background-color'])).toEqual({
      'border-top-width': '0px',
      'background-color': 'rgb(255, 255, 255)',
    });
    const button = order.getByRole('link', { name: '식이 카드 열기' });
    await expect.poll(async () => (await styles(button, ['background-color']))['background-color']).toBe('rgb(243, 244, 245)');
  });
});
```

(`trip.orderCard`의 한국어 문구가 '주문할 때 보여 줄 한국어 카드'와 다르면 `src/i18n/messages/`의 실제 문구로 맞춘다. 단언 값은 바꾸지 않는다.)

- [ ] **Step 2: 실패하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-place.spec.js
```

Expected: 새 다섯 건 중 지도 반반 두 건이 FAIL이어야 한다(320px에서 두 버튼이 두 줄로 갈리거나 폭이 다르다). 나머지 세 건은 Task 1 구조로 이미 통과할 수 있다(상태별 회귀 가드). '오늘 장소' 건은 시각에 따라 skip될 수 있다. 360px에서도 반반이 이미 맞으면, 320px 건만 FAIL이어도 된다. 보고서에 그대로 적는다.

- [ ] **Step 3: 지도 버튼 반반 (`app/styles/place.css`)**

`.place-block p { … }` 규칙 바로 아래에 더한다.

```css
/* 지도 버튼 [구글][카카오] (설계서 6.2 8번): 회색 작은 버튼을 늘 한 줄 반반으로. 글자가 길면 버튼 안에서 줄을 바꾼다 */
.place-maps .trip-map-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-2);
}
```

- [ ] **Step 4: 7번 넘김 (`e2e/screen-today.spec.js`, `docs/tracking/status.md`)**

4-a. `e2e/screen-today.spec.js`의 '확인하지 않은 병원 안내: 자기 흰 블록, …' 테스트에서 `await expect(section).toHaveClass(/today-section/);` 바로 아래에 한 줄을 더한다. 운영자가 블록 순서를 확인했다(2026-10-13).

```js
    await expect(page.locator('main.today-page > .today-status-block + .today-section')).toHaveCount(1);
```

4-b. `docs/tracking/status.md`의 `- SEED 적용 ③층 7/15 오늘 화면: 회색 바탕 위 흰 블록(동기화 / 매일 확인 / …` 줄에서 괄호 안 블록 목록을 고친다. `동기화 / 매일 확인 / 날짜·상태 / …`를 `갱신 실패(있을 때) / 매일 확인 / 날짜·상태(새로 고치는 중 줄 포함) / …`로 바꾼다. 나머지는 그대로 둔다.

4-c. 같은 파일의 7/15 줄 바로 아래에 더한다.

```markdown
- SEED 적용 ③층 8/15 장소 상세: 회색 바탕 위 흰 블록(그림·이름 / 지도 / 이 장소의 일정(추정) / 주문 카드 / 관광공사 원문 / 접근성 / 사진), 그림 블록은 화면 폭·카드 테두리 없음, 지도 버튼 [구글][카카오] 회색 반반, SafeHour 추정과 관광공사 원문은 서로 다른 블록(출처 영역 모양 유지). 계획서 `docs/superpowers/plans/2026-10-13-seed-layer3-08-place.md`
```

- [ ] **Step 5: 통과하는지 본다**

```bash
npm run build && npm run e2e -- e2e/screen-place.spec.js e2e/screen-today.spec.js e2e/core-flow.spec.js e2e/editing.spec.js
```

Expected: PASS(`screen-place` 9건, 시각·데이터에 따라 최대 2건 skip, `screen-today` 13건).

- [ ] **Step 6: 전체 관문**

```bash
npm run lint && npm test && npm run build && npm run e2e
```

Expected: 모두 exit 0이어야 한다. e2e는 146건이다(시간대에 따라 1~3건 skip). 단위 테스트는 1,736건 그대로다.

- [ ] **Step 7: 커밋**

```bash
git add app/styles/place.css e2e/screen-place.spec.js e2e/screen-today.spec.js docs/tracking/status.md
git commit -m "$(cat <<'MSG'
style(place): 지도 버튼 [구글][카카오] 회색 반반, 상태별 블록 확인, 진행 현황

- 장소 상세 지도 버튼을 늘 한 줄 반반으로(320px 영어 두 줄 글자도).
- 매일 확인 전 막힘·상세 불러오기 실패·주문 카드 블록을 테스트로 고정.
- 오늘 화면 병원 안내 블록이 상태 블록 바로 다음인지 단언(운영자 확인).
- 진행 현황: 7/15 줄 블록 목록 정정, 8/15 줄 추가.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
)"
```

(구현 에이전트의 하네스가 다른 모델 표기를 정하면 그 한 줄로 바꾼다.)

---

### Task 3: 전후 캡처와 운영자 확인 (컨트롤러가 한다)

**Files:** 없음

- [ ] **Step 1: 전후 캡처를 만든다.** 이 계획을 시작할 때의 커밋(작업 전)과 Task 2 뒤 커밋(작업 후)을 각각 빌드한다. 끝나면 브랜치로 돌아온다.
  - 도구: `.superpowers/sdd/_tools/place-shots.mjs`
  - 찍기 전에 e2e 캐시 시각을 새로 고친다.
  - 장면: 360px·320px × 네 언어의 관광 장소. 360 ko는 식사 장소와 매일 확인 전 오늘 장소도 찍는다.
  - 각 장면을 전체·맨 위·맨 아래로 찍는다.
- [ ] **Step 2: 비교 장면을 보여 주고 무엇이 바뀌었는지 한 줄씩 적는다.**
- [ ] **Step 3: 운영자 확인을 받는다.** 승인 전에는 ③층 9번(카드)과 11번(더보기) 묶음을 시작하지 않는다.
