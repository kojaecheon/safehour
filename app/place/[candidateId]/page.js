'use client';

// /place/[candidateId]: 장소 상세 (AX-317 · docs/platform/IA_AND_FLOWS.md '경로', docs/business-rules.md '장소 후보와 필터'·'알림과 카드', docs/contracts.md '`POST /api/place`')
//
// 화면 원칙
//   - 정거장은 기기에 저장된 확정 일정에서 찾는다(?stop=정거장 id 가 있으면 그 정거장). 일정에 없는 장소는 보이지 않는다
//     — 이 화면이 판정을 거치지 않은 장소로 가는 우회 경로가 되면 안 된다.
//   - 관광공사 원문(개요·운영 시간·사진)과 SafeHour 판정·추정(도착·머무름·이동·실내 여부)은 다른 출처 영역에 둔다.
//     원문은 번역하지 않고 원문 언어를 lang 으로 표시한다. 운영 시간 원문을 영업 여부로 해석하지 않는다('운영 확인 필요').
//   - 지도 링크 2개는 목적지(이 장소)의 이름·좌표만 넘긴다. 매일 확인 전인 오늘 장소면 길찾기를 막는다(docs/business-rules.md '매일 확인'·'알림과 카드').
//   - 주문 카드 라벨이면 한국어 식이 카드(/cards)로 잇는다. 한국어 원문 이름·주소는 택시 기사에게 보여 줄 수 있게 따로 둔다.
//   - 상세는 보강이다. 오프라인·로그인 만료·실패여도 일정 속 정보는 그대로 보인다. 출처 'ⓒ한국관광공사'를 늘 붙인다.
//   - SEED ③층(설계서 6.2 8번): 회색 바탕 위 흰 블록. 그림·이름 / 지도 / 이 장소의 일정(추정) / 주문 카드 / 관광공사 원문 / 접근성 / 사진.

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import CourseCard from '@/components/CourseCard.js';
import { useLang } from '@/components/LanguageProvider.js';
import { Badge, Button, EmptyState, SourceArea, TopBar } from '@/components/ui/index.js';
import MapLinks from '@/components/trip/MapLinks.js';
import { findPlaceStop, formatDate, placeDetailRequest, stopBadges } from '@/components/trip/viewModel.js';
import useTrip from '@/lib/trip/useTrip.js';
import { SCHEDULE_FIELD_KEY } from '@/src/i18n/dictionary.js';

/** 저작권 구분 코드 → 문구 키 */
const COPYRIGHT_KEY = {
  Type1: 'place.copyrightType1',
  Type3: 'place.copyrightType3',
};

/** 개요 원문 언어 → 표시 */
const OVERVIEW_LANG_KEY = {
  ko: 'place.langKo',
  en: 'place.langEn',
  ja: 'place.langJa',
  zh: 'place.langZh',
};

const LEG_KEY = { WALK: 'common.legWalk', TAXI: 'common.legTaxi', TRANSIT: 'common.legTransit' };

/** 상세 조회 — 화면을 오가도 같은 요청은 한 번만 */
const detailCache = new Map();

function loadDetails(body) {
  const key = JSON.stringify(body);
  if (!detailCache.has(key)) {
    const promise = fetch('/api/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) return { ok: true, details: data.details };
        return { ok: false, errorKey: res.status === 401 ? 'place.errDetailOffline' : 'place.errDetail' };
      })
      .catch(() => ({ ok: false, errorKey: 'place.errDetailNetwork' }));
    detailCache.set(key, promise);
    promise.then((result) => {
      if (!result.ok) detailCache.delete(key); // 실패는 다음에 다시 시도한다
    });
  }
  return detailCache.get(key);
}

function PlaceDetail() {
  const params = useParams();
  const search = useSearchParams();
  const candidateId = useMemo(() => {
    try {
      return decodeURIComponent(String(params?.candidateId ?? ''));
    } catch {
      return '';
    }
  }, [params?.candidateId]);
  const stopId = search?.get('stop') ?? null;
  const { t, lang, locale, safety } = useLang();
  const trip = useTrip();
  const [detail, setDetail] = useState({ key: null, status: 'idle', details: null, errorKey: null });

  const found = useMemo(() => findPlaceStop(trip.tripPlan, candidateId, { stopId }), [trip.tripPlan, candidateId, stopId]);
  const stop = found?.stop ?? null;
  const request = useMemo(() => (stop ? placeDetailRequest(stop, lang) : null), [stop, lang]);
  const requestKey = request ? JSON.stringify(request) : null;
  const canFetch = Boolean(request) && Object.keys(request.sourceIds).length > 0 && !trip.readOnly;

  useEffect(() => {
    if (!canFetch || !requestKey) return undefined;
    let alive = true;
    loadDetails(JSON.parse(requestKey)).then((result) => {
      if (!alive) return;
      setDetail(
        result.ok
          ? { key: requestKey, status: 'done', details: result.details, errorKey: null }
          : { key: requestKey, status: 'error', details: null, errorKey: result.errorKey },
      );
    });
    return () => {
      alive = false;
    };
  }, [canFetch, requestKey]);

  const today = trip.todayDate;
  const backHref = found ? `/trip/${found.date}` : '/trip';
  const top = <TopBar title={t('place.header')} backHref={backHref} backLabel={t('place.back')} />;

  if (!today) {
    return (
      <>
        {top}
        <main className="page place-page is-basement">
          <div className="ui-block">
            <p className="place-loading" role="status">
              {t('place.loading')}
            </p>
          </div>
        </main>
      </>
    );
  }

  if (!stop) {
    return (
      <>
        {top}
        <main className="page place-page is-basement">
          <div className="ui-block">
            <EmptyState
              icon="map"
              title={t('place.notFoundTitle')}
              body={t('place.notFoundBody')}
              action={<Button href="/trip">{t('place.notFoundCta')}</Button>}
            />
          </div>
        </main>
      </>
    );
  }

  const current = detail.key === requestKey ? detail : { status: canFetch ? 'loading' : 'idle', details: null, errorKey: null };
  const details = current.details;
  const scheduleEntries = Object.entries(details?.operatingSchedule ?? {});
  const flags = stopBadges(stop);
  const gated = found.date === today && (trip.dailyCheckPending || trip.unconfirmedHospitalUpdate);
  const overviewLang = details?.overviewLanguage ?? 'ko';
  const safetyLang = safety.primary === lang ? undefined : safety.primary;
  const role = found.role === 'G' ? t('trip.tabGuardian') : t('trip.tabPatient');
  const leg = stop.legIn && LEG_KEY[stop.legIn.mode] ? t(LEG_KEY[stop.legIn.mode], { n: stop.legIn.min }) : null;

  return (
    <>
      {top}
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
                  {/* eslint-disable-next-line @next/next/no-img-element -- 관광공사 원본 URL 을 참조만 한다(내려받기·가공 금지, docs/business-rules.md '장소 후보와 필터') */}
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
    </>
  );
}

export default function PlaceDetailPage() {
  return (
    <Suspense fallback={null}>
      <PlaceDetail />
    </Suspense>
  );
}
