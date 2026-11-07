'use client';

// 즉시 복귀 시트 (AX-317 · spec 4.9 즉시 복귀 · 규칙 13 · 기존 AX-220·AX-011)
//
// 두 갈래로 **자동으로** 열린다. 이 동작은 끌 수 없다. 앱 전체에 한 번 다는 components/trip/TripRuntime.js 가 연다.
//   - CLEARED(기본): 환자 호출(데모 사건)·외출 중 지침 철회·만료·외출 중 재계획으로 이미 늦음(OUTING_OVERDUE)으로
//     오늘 남은 일정이 비워졌다(returnNow). 원인 목록은 src/domain/states.js RETURN_NOW_CAUSES 다.
//   - PASSED: 시간이 흘러 외출의 복귀 마감이 지났다(마감 지남 설계서 4.2 경우 1). 저장 일정은 그대로고 원인 줄이 없다.
//     '복귀 마감 시각이 지났어요'라고만 쓴다. 환자가 돌아왔는지, 돌아오지 않았는지 단정하지 않는다.
//   - 복귀 지시는 안전 문구다 — 주 언어 + 병기 언어 두 줄(safetyPair). ja·zh 는 검수 전까지 영어+한국어.
//   - 돌아갈 곳은 이름·주소 **글자만** 보인다. 좌표·지도 링크를 넣지 않는다(spec 4.14 · 규칙 39).
//     숙소(그날 숙소) · 병원(hospitalId 로만 찾은 병원) · 정해 둔 장소(찾지 못함, 추측하지 않는다) 중 하나다
//     (viewModel.returnTargetOf). PASSED 와 OUTING_OVERDUE 는 그 외출의 returnPlace 를, 다른 원인은 숙소를 보인다.
//     택시 기사에게 보여 줄 한국어 복귀 카드(/cards)는 숙소 카드라 숙소일 때만 잇는다.
//   - 긴급 연락: 119 전화 걸기와 /emergency.
//   - 닫기(X)는 없다. '확인했어요' · Escape · 뒤로 가기가 모두 시트만 닫는다(useModalSheet — 페이지를 떠나지 않는다).
//     닫아도 저장 일정의 returnNow 는 그대로다. 오늘 화면이 '복귀 안내 다시 보기'를 계속 보인다.

import Link from 'next/link';
import { useLang } from './LanguageProvider.js';
import { Icon, Sheet } from './ui/index.js';
import { REASON } from '@/src/domain/states.js';
import { overdueOutingOf, returnTargetOf } from './trip/viewModel.js';

const PLACE_ICON = Object.freeze({ LODGING: 'bed', HOSPITAL: 'hospital', PLANNED: 'flag' });

/** 시트가 보일 돌아갈 곳과 본문 키, 판정을 새로 하지 않고 저장된 외출의 returnPlace 만 따른다 */
function sheetContent({ variant, day, stay, cause, outingId }) {
  if (variant === 'PASSED') {
    const outing = (day?.outings ?? []).find((o) => o?.id === outingId) ?? null;
    // 외출을 찾지 못하면 숙소로 추측하지 않는다
    const place = outing ? returnTargetOf({ day, stay, outing }) : { kind: 'PLANNED', name: null, address: null };
    return { titleKey: 'return.passedTitle', bodyKey: 'return.passedBody', place, showCause: false };
  }
  if (cause === REASON.OUTING_OVERDUE) {
    const place = returnTargetOf({ day, stay, outing: overdueOutingOf(day) });
    return { titleKey: 'return.title', bodyKey: place.kind === 'LODGING' ? 'return.body' : 'return.bodyPlace', place, showCause: true };
  }
  return { titleKey: 'return.title', bodyKey: 'return.body', place: returnTargetOf({ day, stay }), showCause: true };
}

/**
 * @param {object} props
 * @param {object|null} props.day        오늘 저장 일정(DayPlan)
 * @param {object|null} props.stay
 * @param {string|null} [props.cause]    CLEARED 일 때 원인, RETURN_NOW_CAUSES(src/domain/states.js) 중 하나
 *                                       (PATIENT_RECALLED | PLAN_REVOKED | PLAN_EXPIRED | OUTING_OVERDUE)
 * @param {'CLEARED'|'PASSED'} [props.variant]  CLEARED: 즉시 복귀(returnNow) · PASSED: 복귀 마감 지남(일정 유지)
 * @param {string} [props.outingId]      PASSED 일 때 마감이 지난 환자 외출 id
 * @param {() => void} props.onClose
 */
export default function ReturnSheet({ day, stay, cause = null, variant = 'CLEARED', outingId, onClose }) {
  const { t, pair, safety, lang, reasonText } = useLang();
  const content = sheetContent({ variant, day, stay, cause, outingId });
  const title = pair(content.titleKey);
  const body = pair(content.bodyKey);
  const note = pair('return.note');
  const { place } = content;
  const reasonLang = safety.primary === lang ? undefined : safety.primary;

  return (
    <Sheet
      title={title.primary.text}
      titleLang={title.primary.lang === lang ? undefined : title.primary.lang}
      onClose={onClose}
      showClose={false}
      footer={({ requestClose }) => (
        <button type="button" className="btn btn-return" onClick={requestClose}>
          {t('return.confirm')}
        </button>
      )}
    >
      <div className="trip-return">
        <p className="trip-pair-secondary" lang={title.secondary.lang}>
          {title.secondary.text}
        </p>
        {content.showCause && cause && (
          <p className="trip-return-cause" lang={reasonLang}>
            {reasonText(cause)}
          </p>
        )}
        <p lang={body.primary.lang}>{body.primary.text}</p>
        <p className="trip-pair-secondary" lang={body.secondary.lang}>
          {body.secondary.text}
        </p>

        <section className="trip-return-place" aria-labelledby="trip-return-place-h">
          <h3 id="trip-return-place-h">
            <Icon name={PLACE_ICON[place.kind]} size={18} /> {t('return.placeTitle')}
          </h3>
          {place.name || place.address ? (
            <>
              {place.name && <p className="trip-return-name">{place.name}</p>}
              {place.address && (
                <p className="trip-return-address" lang="ko">
                  {place.address}
                </p>
              )}
            </>
          ) : place.kind === 'LODGING' ? (
            <p>{t('return.noLodging')}</p>
          ) : (
            <p className="trip-return-name">{t('return.placePlanned')}</p>
          )}
          {place.kind === 'LODGING' && (
            <Link className="trip-inline-link" href="/cards#cards-return">
              {t('return.cardLink')}
            </Link>
          )}
        </section>

        <div className="trip-return-emergency">
          <a className="btn btn-secondary" href="tel:119">
            <Icon name="phone" size={20} />
            <span>{t('return.call119')}</span>
          </a>
          <Link className="trip-inline-link" href="/emergency">
            {t('return.emergencyLink')}
          </Link>
        </div>

        <p className="trip-return-note" lang={note.primary.lang}>
          {note.primary.text}
        </p>
        <p className="trip-pair-secondary" lang={note.secondary.lang}>
          {note.secondary.text}
        </p>
      </div>
    </Sheet>
  );
}
