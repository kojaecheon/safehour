'use client';

// /design-board — 디자인 시안 보드 (AX-304 토큰·부품 · AX-321 화면 시안 · spec 7장)
//
// - 토큰 견본(색·대비, 글자, 간격·모서리·그림자)과 부품의 상태별 견본을 보여준다.
// - 고정 데모 데이터(./demoData.js + designBoard 이름공간 문구)만 쓴다. 저장소·세션·서버를 부르지 않는다.
// - 대비 수치는 globals.css 의 토큰 값을 브라우저에서 읽어 **그 자리에서 계산**한다 — 토큰이 바뀌면 수치도 따라 바뀐다.
// - '화면 시안' 절(AX-321)은 ./ScreenPreviews.js 가 주요 화면 8개를 실제 부품 + 고정 데모 데이터(./screenData.js)로 그린다.
// - 내비에 노출하지 않는다(BottomNav 에 없음).

import { useEffect, useState } from 'react';
import StateBanner from '@/components/StateBanner.js';
import { useLang } from '@/components/LanguageProvider.js';
import {
  AnswerInput,
  ART_CATEGORIES,
  Badge,
  BADGE_KINDS,
  BottomNav,
  Button,
  CATEGORY_KEY,
  CategoryArt,
  DateChip,
  DayTimeline,
  EmergencyButton,
  EmptyState,
  Icon,
  KoreanCard,
  MealSlot,
  PeriodEditor,
  PlaceCard,
  ReadOnlyBanner,
  Sheet,
  SourceArea,
  SourceTag,
  STATE_ICON,
  TopBar,
} from '@/components/ui/index.js';
import { LANGS, LANG_NAMES, translate } from '@/src/i18n/index.js';
import {
  BROKEN_PHOTO,
  CONTRAST_GROUPS,
  DEMO_DAYS,
  DEMO_PHOTO,
  DEMO_STATES,
  RADII,
  SHADOWS,
  SPACING,
  TYPE_SCALE,
} from './demoData.js';
import ScreenPreviews from './ScreenPreviews.js';

// ── 대비 계산 (WCAG 2.1 상대 휘도) ──

function parseColor(value) {
  const v = String(value ?? '').trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return m[1].split('').map((c) => parseInt(c + c, 16));
  m = v.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(fg, bg) {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function allTokenNames() {
  const names = new Set([...SPACING, ...RADII, ...SHADOWS]);
  for (const group of CONTRAST_GROUPS) {
    for (const pair of group.pairs) {
      if (pair.fg) names.add(pair.fg);
      names.add(pair.bg);
    }
  }
  for (const row of TYPE_SCALE) names.add(row.token);
  return [...names];
}

/** 브라우저에 적용된 토큰 값 — 마운트 뒤 한 번 읽는다(서버 렌더에는 값이 없다) */
function useTokenValues() {
  const [values, setValues] = useState(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const style = getComputedStyle(document.documentElement);
      const next = {};
      for (const name of allTokenNames()) next[name] = style.getPropertyValue(name).trim();
      setValues(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return values;
}

// ── 조각 ──

function Section({ id, title, lead, children }) {
  return (
    <section className="designBoard-section" aria-labelledby={`${id}-h`} id={id}>
      <h2 id={`${id}-h`}>{title}</h2>
      {lead && <p className="designBoard-lead">{lead}</p>}
      {children}
    </section>
  );
}

function Sub({ title, note, children, wide = false }) {
  return (
    <div className={wide ? 'designBoard-sub is-wide' : 'designBoard-sub'}>
      <h3>{title}</h3>
      {note && <p className="designBoard-note">{note}</p>}
      <div className="designBoard-sample">{children}</div>
    </div>
  );
}

function Swatch({ pair, values }) {
  const { t } = useLang();
  const fgVal = pair.fg ? values?.[pair.fg] : null;
  const bgVal = values?.[pair.bg];
  const ratio = pair.fg && values ? contrast(fgVal, bgVal) : null;
  const min = pair.ui ? 3 : 4.5;
  const passed = ratio !== null && ratio >= min;

  return (
    <li className="designBoard-swatch">
      <div
        className={pair.ui ? 'designBoard-chip is-ui' : 'designBoard-chip'}
        style={{
          background: `var(${pair.bg})`,
          color: pair.fg && !pair.ui ? `var(${pair.fg})` : undefined,
          borderColor: pair.ui ? `var(${pair.fg})` : undefined,
        }}
      >
        {pair.state ? (
          <span className="designBoard-chip-state">
            <Icon name={STATE_ICON[pair.state]} size={20} strokeWidth={2.2} />
            {t(`state.${pair.state}`)}
          </span>
        ) : pair.fg && !pair.ui ? (
          <span className="designBoard-chip-text">가 Aa 12:30</span>
        ) : null}
      </div>
      <p className="designBoard-tokens">
        <code>{pair.fg ?? '—'}</code> / <code>{pair.bg}</code>
      </p>
      <p className="designBoard-hex">
        {pair.fg && <code>{fgVal || '…'}</code>}
        {pair.fg && ' / '}
        <code>{bgVal || '…'}</code>
      </p>
      {pair.decorative ? (
        <p className="designBoard-verdict" data-verdict="decorative">{t('designBoard.decorative')}</p>
      ) : (
        <p
          className={passed ? 'designBoard-verdict is-pass' : 'designBoard-verdict'}
          data-verdict={ratio === null ? 'measuring' : passed ? 'pass' : 'fail'}
        >
          {ratio === null ? (
            t('designBoard.measuring')
          ) : (
            <>
              <Icon name={passed ? 'check' : 'close'} size={16} strokeWidth={2.6} />
              <strong className="num">{ratio.toFixed(2)}:1</strong>
              <span>{passed ? t('designBoard.pass') : t('designBoard.fail')}</span>
              <span className="designBoard-min">· {pair.ui ? t('designBoard.uiMin') : t('designBoard.textMin')}</span>
            </>
          )}
        </p>
      )}
    </li>
  );
}

// ── 보드 ──

export default function DesignBoard() {
  const { t, lang } = useLang();
  const values = useTokenValues();
  const [selectedDay, setSelectedDay] = useState('2026-10-02');
  const [uv, setUv] = useState(null);
  const [heat, setHeat] = useState('UNKNOWN');
  const [escort, setEscort] = useState('YES');
  const [start, setStart] = useState('2026-10-01');
  const [end, setEnd] = useState('2026-10-07');
  const [sheetOpen, setSheetOpen] = useState(false);

  const lodging = t('designBoard.demoLodging');
  const palaceCard = (
    <PlaceCard
      variant="compact"
      title={t('designBoard.demoPalace')}
      category="SPOT"
      imageUrl={DEMO_PHOTO}
      meta={[t('designBoard.demoStay'), t('designBoard.demoWalk')]}
      badges={['hoursUnconfirmed']}
      headingLevel={4}
    />
  );
  const restaurantCard = (
    <PlaceCard
      variant="compact"
      title={t('designBoard.demoRestaurant')}
      category="FOOD"
      meta={['11:40–12:40']}
      badges={['estimate']}
      headingLevel={4}
    />
  );

  const patientEntries = [
    { id: 'p-depart', kind: 'depart', time: '10:00', title: lodging },
    { id: 'p-palace', kind: 'stop', time: '10:25', endTime: '11:20', leg: { mode: 'TAXI', min: 12 }, content: palaceCard },
    {
      id: 'p-lunch',
      kind: 'meal',
      time: '11:40',
      endTime: '12:40',
      leg: { mode: 'TAXI', min: 8 },
      content: (
        <MealSlot slot="LUNCH" status="FILLED" time="11:40–12:40">
          {restaurantCard}
        </MealSlot>
      ),
    },
    { id: 'p-return', kind: 'return', time: '13:10', title: lodging, note: t('designBoard.demoReturnNote'), leg: { mode: 'TAXI', min: 10 } },
    { id: 'p-med', kind: 'medication', time: '13:30' },
    { id: 'p-rest', kind: 'rest', time: '13:45', endTime: '15:20' },
    { id: 'p-appt', kind: 'appointment', time: '16:00', endTime: '17:00', title: t('designBoard.demoHospital') },
  ];

  const guardianEntries = [
    { id: 'g-depart', kind: 'depart', time: '14:00', title: lodging },
    {
      id: 'g-shop',
      kind: 'stop',
      time: '14:15',
      endTime: '15:00',
      leg: { mode: 'WALK', min: 9 },
      content: (
        <PlaceCard variant="compact" title={t('designBoard.demoShop')} category="SHOPPING" meta={['14:15–15:00']} headingLevel={4} />
      ),
    },
    { id: 'g-return', kind: 'return', time: '15:20', title: lodging, leg: { mode: 'WALK', min: 9 } },
  ];

  return (
    <>
      <TopBar title={t('designBoard.header')} />
      <main className="page designBoard-root">
        <header className="designBoard-intro">
          <p className="designBoard-kicker">SafeHour</p>
          <p className="designBoard-intro-lead">{t('designBoard.lead')}</p>
          <p className="designBoard-note">{t('designBoard.note')}</p>
        </header>

        {/* ── 1. 색 ── */}
        <Section id="designBoard-colors" title={t('designBoard.colorsTitle')} lead={t('designBoard.colorsLead')}>
          {CONTRAST_GROUPS.map((group) => (
            <div key={group.key} className="designBoard-group">
              <h3>{t(group.key)}</h3>
              <ul className="designBoard-swatches" role="list">
                {group.pairs.map((pair) => (
                  <Swatch key={`${pair.fg}/${pair.bg}`} pair={pair} values={values} />
                ))}
              </ul>
            </div>
          ))}
        </Section>

        {/* ── 2. 글자 ── */}
        <Section id="designBoard-type" title={t('designBoard.typeTitle')} lead={t('designBoard.typeNote')}>
          <ul className="designBoard-type" role="list">
            {TYPE_SCALE.map((row) => (
              <li key={row.token}>
                <p className="designBoard-tokens">
                  <code>{row.token}</code> · <code>{values?.[row.token] || '…'}</code> · <code>{row.weight}</code>
                </p>
                <p
                  className="designBoard-type-sample"
                  lang={row.korean ? 'ko' : undefined}
                  style={{
                    fontSize: `var(${row.token})`,
                    fontWeight: `var(${row.weight})`,
                    letterSpacing: row.tight ? 'var(--tracking-tight)' : undefined,
                  }}
                >
                  {row.korean ? translate('designBoard.kcardLine1', 'ko') : t('designBoard.typeSample')}
                </p>
              </li>
            ))}
            <li>
              <p className="designBoard-tokens">{t('designBoard.typeNumeric')}</p>
              <p className="designBoard-type-sample num designBoard-numeric">
                09:30 – 14:40 · 11:11 · 10:05
              </p>
            </li>
          </ul>
          <h3 className="designBoard-subhead">{t('designBoard.typeLangs')}</h3>
          <ul className="designBoard-langs" role="list">
            {LANGS.map((code) => (
              <li key={code}>
                <span className="designBoard-lang-name" lang={code}>
                  {LANG_NAMES[code]}
                </span>
                <span className="designBoard-lang-sample" lang={code}>
                  {translate('designBoard.typeSample', code)}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── 3. 간격·모서리·그림자 ── */}
        <Section id="designBoard-space" title={t('designBoard.spaceTitle')}>
          <div className="designBoard-grid">
            <Sub title={t('designBoard.spacing')}>
              <ul className="designBoard-spacing" role="list">
                {SPACING.map((token) => (
                  <li key={token}>
                    <span className="designBoard-bar" style={{ width: `var(${token})` }} />
                    <code>{token}</code> <code>{values?.[token] || '…'}</code>
                  </li>
                ))}
              </ul>
            </Sub>
            <Sub title={t('designBoard.radius')}>
              <ul className="designBoard-radii" role="list">
                {RADII.map((token) => (
                  <li key={token}>
                    <span className="designBoard-radius-box" style={{ borderRadius: `var(${token})` }} />
                    <code>{token}</code>
                  </li>
                ))}
              </ul>
            </Sub>
            <Sub title={t('designBoard.shadow')}>
              <ul className="designBoard-shadows" role="list">
                {SHADOWS.map((token) => (
                  <li key={token} style={{ boxShadow: `var(${token})` }}>
                    <code>{token}</code>
                  </li>
                ))}
              </ul>
            </Sub>
          </div>
        </Section>

        {/* ── 4. 부품 ── */}
        <Section id="designBoard-components" title={t('designBoard.componentsTitle')}>
          <div className="designBoard-grid">
            <Sub title={t('designBoard.cButton')}>
              <div className="designBoard-stack">
                <Button>{t('designBoard.btnPrimary')}</Button>
                <Button variant="secondary">{t('designBoard.btnSecondary')}</Button>
                <Button variant="quiet">{t('designBoard.btnQuiet')}</Button>
                <Button disabled>{t('designBoard.btnDisabled')}</Button>
                <div className="designBoard-row">
                  <Button size="small" icon="plus">
                    {t('designBoard.btnSmall')}
                  </Button>
                  <Button size="small" variant="secondary" icon="map">
                    {t('designBoard.btnSmall')}
                  </Button>
                </div>
                <button type="button" className="btn btn-return">
                  {t('designBoard.btnReturn')}
                </button>
              </div>
            </Sub>

            <Sub title={t('designBoard.cBadge')}>
              <div className="designBoard-row">
                {Object.keys(BADGE_KINDS).map((kind) => (
                  <Badge key={kind} kind={kind} />
                ))}
              </div>
              <div className="designBoard-row" style={{ marginTop: 'var(--space-3)' }}>
                {['hospital', 'self', 'estimate', 'tourism', 'ai'].map((source) => (
                  <SourceTag key={source} source={source} />
                ))}
              </div>
            </Sub>

            <Sub title={t('designBoard.cState')} note={t('designBoard.stateNote')} wide>
              <div className="designBoard-states">
                {DEMO_STATES.map(({ state, reasons }) => (
                  <StateBanner key={state} state={state} reasons={reasons} />
                ))}
              </div>
            </Sub>

            <Sub title={t('designBoard.cDateChip')}>
              <ul className="ui-date-strip" role="list">
                {DEMO_DAYS.map((day) => (
                  <li key={day.date}>
                    <DateChip
                      {...day}
                      selected={selectedDay === day.date}
                      onClick={() => setSelectedDay(day.date)}
                    />
                  </li>
                ))}
              </ul>
            </Sub>

            <Sub title={t('designBoard.cTimeline')} note={t('designBoard.timelineNote')} wide>
              <div className="designBoard-grid is-two">
                <div>
                  <h4 className="designBoard-h4">{t('designBoard.tlPatient')}</h4>
                  <DayTimeline label={t('designBoard.tlPatient')} person="patient" entries={patientEntries} />
                </div>
                <div>
                  <h4 className="designBoard-h4">{t('designBoard.tlGuardian')}</h4>
                  <DayTimeline label={t('designBoard.tlGuardian')} person="guardian" entries={guardianEntries} />
                </div>
              </div>
            </Sub>

            <Sub title={t('designBoard.cPlace')} note={t('designBoard.placeNote')} wide>
              <div className="designBoard-cards" id="designBoard-place">
                <PlaceCard
                  title={t('designBoard.demoPalace')}
                  category="SPOT"
                  imageUrl={DEMO_PHOTO}
                  time="10:25–11:20"
                  meta={[t('designBoard.demoStay'), t('designBoard.demoWalk')]}
                  badges={['estimate', 'hoursUnconfirmed']}
                  credit={t('designBoard.demoCredit')}
                  href="#designBoard-place"
                  headingLevel={4}
                />
                <PlaceCard
                  title={t('designBoard.demoMuseum')}
                  category="CULTURE"
                  time="14:00–15:10"
                  meta={[t('designBoard.demoStay')]}
                  badges={['hoursUnconfirmed']}
                  headingLevel={4}
                />
                <PlaceCard
                  title={t('designBoard.demoFestival')}
                  category="FESTIVAL"
                  imageUrl={BROKEN_PHOTO}
                  time="19:00–20:00"
                  badges={['estimate']}
                  headingLevel={4}
                />
              </div>
              <h4 className="designBoard-h4">{t('designBoard.cArt')}</h4>
              <ul className="designBoard-art" role="list">
                {ART_CATEGORIES.map((category) => (
                  <li key={category}>
                    <CategoryArt category={category} />
                    <span>{t(CATEGORY_KEY[category])}</span>
                  </li>
                ))}
              </ul>
            </Sub>

            <Sub title={t('designBoard.cMeal')}>
              <div className="designBoard-stack">
                <MealSlot slot="DINNER" status="FILLED" time="18:00–19:00">
                  {restaurantCard}
                </MealSlot>
                <MealSlot slot="LUNCH" status="NONE_AVAILABLE" time="11:30–13:30" reasons={['MENU_UNKNOWN', 'DIET_RESTRICTED']} />
                <MealSlot slot="DINNER" status="CLEARED" />
                <MealSlot slot="LUNCH" status="NOT_APPLICABLE" />
              </div>
            </Sub>

            <Sub title={t('designBoard.cAnswer')}>
              <AnswerInput legend={t('designBoard.qUv')} value={uv} onChange={setUv} />
              <AnswerInput legend={t('designBoard.qHeat')} value={heat} onChange={setHeat} />
              <AnswerInput legend={t('designBoard.qEscort')} value={escort} onChange={setEscort} disallowUnknown />
              <AnswerInput
                legend={t('designBoard.qEscort')}
                hint={t('designBoard.answerHospitalNote')}
                value="NO"
                disallowUnknown
                disabled
              />
            </Sub>

            <Sub title={t('designBoard.cPeriod')} wide>
              <div className="designBoard-grid is-two">
                <PeriodEditor
                  title={t('designBoard.demoPeriodSelf')}
                  source="SELF"
                  startDate={start}
                  endDate={end}
                  onStartChange={setStart}
                  onEndChange={setEnd}
                  minDate="2026-09-28"
                  maxDate="2026-10-12"
                  actions={
                    <>
                      <Button>{t('designBoard.demoSave')}</Button>
                      <Button variant="secondary">{t('designBoard.demoCancel')}</Button>
                    </>
                  }
                >
                  <AnswerInput legend={t('designBoard.qUv')} value={uv} onChange={setUv} />
                  <AnswerInput legend={t('designBoard.qHeat')} value={heat} onChange={setHeat} />
                </PeriodEditor>
                <PeriodEditor
                  title={t('designBoard.demoPeriodHospital')}
                  source="HOSPITAL"
                  startDate="2026-09-30"
                  endDate="2026-10-06"
                  headExtra={<Badge kind="demo" />}
                >
                  <AnswerInput legend={t('designBoard.qHeat')} value="YES" disallowUnknown disabled showMeaning={false} />
                </PeriodEditor>
              </div>
            </Sub>

            <Sub title={t('designBoard.cSheet')}>
              <Button variant="secondary" onClick={() => setSheetOpen(true)}>
                {t('designBoard.sheetOpen')}
              </Button>
              {sheetOpen && (
                <Sheet
                  title={t('designBoard.sheetTitle')}
                  onClose={() => setSheetOpen(false)}
                  footer={({ requestClose }) => <Button onClick={requestClose}>{t('common.confirm')}</Button>}
                >
                  <p>{t('designBoard.sheetBody')}</p>
                </Sheet>
              )}
            </Sub>

            <Sub title={t('designBoard.cEmpty')}>
              <EmptyState
                icon="navTrip"
                headingLevel={4}
                title={t('designBoard.emptyTitle')}
                body={t('designBoard.emptyBody')}
                action={<Button href="/onboarding">{t('designBoard.emptyAction')}</Button>}
              />
            </Sub>

            <Sub title={t('designBoard.cKorean')}>
              <KoreanCard
                title={t('designBoard.kcardTitle')}
                korean={[translate('designBoard.kcardLine1', 'ko'), translate('designBoard.kcardLine2', 'ko')]}
                explanation={
                  lang === 'ko' ? undefined : `${t('designBoard.kcardLine1')} · ${t('designBoard.kcardLine2')}`
                }
              />
            </Sub>

            <Sub title={t('designBoard.cSource')} wide>
              <div className="designBoard-grid is-two">
                <SourceArea source="hospital" title={t('designBoard.demoHospital')}>
                  <p lang="ko">{translate('designBoard.srcHospitalBody', 'ko')}</p>
                </SourceArea>
                <SourceArea source="self">
                  <p>{t('designBoard.srcSelfBody')}</p>
                </SourceArea>
                <SourceArea source="estimate">
                  <p>
                    {t('designBoard.srcEstimateBody')} <Badge kind="estimate" />
                  </p>
                </SourceArea>
                <SourceArea source="tourism" title={t('designBoard.demoPalace')}>
                  <p>{t('designBoard.srcTourismBody')}</p>
                </SourceArea>
                <SourceArea source="ai" note={t('designBoard.srcAiNote')}>
                  <p>{t('designBoard.srcAiBody')}</p>
                </SourceArea>
              </div>
            </Sub>

            <Sub title={t('designBoard.cShell')} note={t('designBoard.shellNote')} wide>
              <div className="designBoard-stack">
                <ReadOnlyBanner preview="NO_SESSION" />
                <ReadOnlyBanner preview="OFFLINE" />
                <BottomNav pathname="/trip" preview />
                <div className="designBoard-row">
                  <EmergencyButton preview />
                </div>
              </div>
            </Sub>
          </div>
        </Section>

        {/* ── 5. 화면 시안 (AX-321) — 실제 화면 부품 + 고정 데모 데이터(./screenData.js)로 그린 축소 시안 ── */}
        <Section id="designBoard-screens" title={t('designBoard.screensTitle')} lead={t('designBoard.screensLead')}>
          <ScreenPreviews />
        </Section>
      </main>
    </>
  );
}
