'use client';

// 병원 회복 안내 — 채널 B, 읽기 전용 (AX-218 → AX-315 · spec 4.20, 5.1 LinkedPlan, 규칙 56)
//
// 화면 원칙
//   - 병원 원문(채널 B)을 **그대로** 출력한다. 요약·편집·재배열·번역하지 않는다.
//     원문 언어를 `lang` 으로 표기하고, 브라우저 자동 번역도 막는다(translate="no").
//   - 병원 원문은 '병원 발행' 출처 영역 안에만 둔다. 지침 발행·갱신 시각과 안내 작성 시각을 붙인다.
//   - 데모 지침은 '병원 연동 데모' 배지를 늘 붙인다.
//   - '확인했습니다'는 LinkedPlan.acknowledged 에 `${id}@${updatedAt}` 키로 남긴다.
//     내용이 바뀌어 updatedAt 이 달라지면 다시 확인해야 한다(규칙 56).
//   - 확인하지 않은 중요 안내 수를 보여준다. 오늘 화면의 대기 덧씌우기는 오늘 화면 작업이 한다.
//   - 안내문은 판정에 쓰지 않는다. 이 화면은 저장소에만 쓴다.

import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/components/LanguageProvider.js';
import { Badge, Button, EmptyState, Icon, SourceArea, TopBar, useStoreStatus } from '@/components/ui/index.js';
import useStay, { useHydrated, useNowMs } from '@/components/conditions/useStay.js';
import { acknowledgeAllMap, guideEntries, planState } from '@/components/conditions/linkPlan.js';
import { getStore } from '@/lib/store/index.js';
import { fmtDateTime } from '@/lib/format.js';

const CATEGORY_KEY = {
  activity: 'guide.catActivity',
  medication: 'guide.catMedication',
  food: 'guide.catFood',
  lifestyle: 'guide.catLifestyle',
  escort: 'guide.catEscort',
  emergency: 'guide.catEmergency',
  visit: 'guide.catVisit',
};

const STATE_KEY = {
  ACTIVE: 'link.stateACTIVE',
  EXPIRED: 'link.stateEXPIRED',
  REVOKED: 'link.stateREVOKED',
};

function PlanGuide({ linked, readOnly, nowMs }) {
  const { t, locale } = useLang();
  const headingId = useId();
  const plan = linked.plan ?? {};
  const entries = guideEntries(plan, linked.acknowledged);
  const unconfirmed = entries.filter((e) => e.critical && !e.acknowledged).length;
  const state = planState(plan, nowMs);
  const focusKey = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!focusKey.current) return;
    document.getElementById(focusKey.current)?.focus();
    focusKey.current = null;
  });

  function acknowledge(entry, doneId) {
    const result = getStore().acknowledgeInstruction(linked.code, entry.instruction);
    setFailed(!result.ok);
    // 저장소 변경으로 다시 그려진 뒤 '확인 완료' 문구로 포커스를 옮긴다(버튼이 사라지므로)
    if (result.ok) focusKey.current = doneId;
  }

  function acknowledgeAll() {
    const result = getStore().updateStay((current) => ({
      ...current,
      linkedPlans: (current?.linkedPlans ?? []).map((lp) =>
        lp.code === linked.code ? { ...lp, acknowledged: acknowledgeAllMap(lp.plan) } : lp,
      ),
    }));
    setFailed(!result.ok);
  }

  return (
    <section className="conditions-section conditions-guide-plan" aria-labelledby={headingId}>
      <div className="conditions-section-head">
        <h2 id={headingId}>{plan.hospital?.name ?? ''}</h2>
        <span className="conditions-tags">
          {plan.demo === true && <Badge kind="demo" />}
          <span className={`conditions-plain-tag conditions-state-${state}`}>{t(STATE_KEY[state])}</span>
        </span>
      </div>
      <div className="conditions-period-meta">
        <p>{t('link.planIssuer', { issuer: plan.issuer?.name ?? '' })}</p>
        <p>
          <time dateTime={plan.issuedAt}>{t('guide.issuedAt', { at: fmtDateTime(plan.issuedAt, locale) })}</time>
        </p>
        {plan.updatedAt && plan.updatedAt !== plan.issuedAt && (
          <p>
            <time dateTime={plan.updatedAt}>{t('guide.planUpdatedAt', { at: fmtDateTime(plan.updatedAt, locale) })}</time>
          </p>
        )}
      </div>

      <div className={unconfirmed > 0 ? 'conditions-guide-count is-pending' : 'conditions-guide-count'} role="status">
        <Icon name={unconfirmed > 0 ? 'stateStandby' : 'check'} size={20} strokeWidth={2.2} />
        <div>
          <p className="conditions-guide-count-title">
            {unconfirmed > 0 ? t('guide.unconfirmedCount', { n: unconfirmed }) : t('guide.allConfirmed')}
          </p>
          {unconfirmed > 0 && <p>{t('guide.criticalNote')}</p>}
        </div>
      </div>
      {entries.some((e) => !e.acknowledged) && (
        <div className="conditions-actions">
          <Button variant="secondary" onClick={acknowledgeAll} disabled={readOnly}>
            {t('guide.acknowledgeAll')}
          </Button>
        </div>
      )}
      {failed && (
        <p className="ui-field-error conditions-field-error" role="alert">
          <Icon name="alert" size={20} />
          <span>{t('conditions.errSave')}</span>
        </p>
      )}

      <ul className="conditions-guide-list">
        {entries.map((entry) => {
          const { instruction } = entry;
          const itemHeadingId = `${headingId}-${instruction.id}`;
          const doneId = `${headingId}-${instruction.id}-done`;
          return (
            <li key={entry.key} className="conditions-guide-item">
              <div className="conditions-section-head">
                <h3 id={itemHeadingId}>{t(CATEGORY_KEY[instruction.category] ?? 'guide.issuedBadge')}</h3>
                {entry.critical && !entry.acknowledged && (
                  <span className="conditions-critical-tag">
                    <Icon name="stateStandby" size={14} strokeWidth={2.2} />
                    <span>{t('guide.critical')}</span>
                  </span>
                )}
              </div>
              <SourceArea source="hospital" lang={instruction.lang} note={t('guide.originalNote')}>
                {/* 원문 — 편집·번역하지 않는다 */}
                <p className="conditions-guide-text" translate="no">
                  {instruction.text}
                </p>
              </SourceArea>
              <p className="conditions-hint">
                <time dateTime={instruction.updatedAt}>
                  {t('guide.updatedAt', { at: fmtDateTime(instruction.updatedAt, locale) })}
                </time>
              </p>
              {entry.acknowledged ? (
                <p className="conditions-acked" id={doneId} tabIndex={-1}>
                  <Icon name="check" size={18} strokeWidth={2.6} />
                  <span>{t('guide.acknowledged')}</span>
                </p>
              ) : (
                <Button
                  variant="secondary"
                  size="small"
                  disabled={readOnly}
                  aria-describedby={itemHeadingId}
                  onClick={() => acknowledge(entry, doneId)}
                >
                  {t('guide.acknowledge')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function GuidePage() {
  const { t } = useLang();
  const hydrated = useHydrated();
  const stay = useStay();
  const status = useStoreStatus();
  const nowMs = useNowMs();
  const linkedPlans = stay?.linkedPlans ?? [];

  return (
    <>
      <TopBar title={t('guide.header')} backHref="/conditions" />
      <main className="page conditions-page">
        <p className="conditions-lead">{t('guide.lead')}</p>
        {!hydrated ? (
          <p className="conditions-hint">{t('conditions.loading')}</p>
        ) : linkedPlans.length === 0 ? (
          <EmptyState
            icon="hospital"
            title={t('guide.empty')}
            body={t('guide.emptyBody')}
            action={<Button href="/link">{t('conditions.linkHospital')}</Button>}
          />
        ) : (
          linkedPlans.map((linked) => (
            <PlanGuide key={linked.code} linked={linked} readOnly={status.readOnly} nowMs={nowMs} />
          ))
        )}
      </main>
    </>
  );
}
