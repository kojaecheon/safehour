'use client';

// 즉시 복귀 시트 (AX-317 · spec 4.9 즉시 복귀 · 규칙 13 · 기존 AX-220·AX-011)
//
// 환자 호출(데모 사건)·외출 중 지침 철회·만료로 오늘 남은 일정이 비워지면(returnNow) **자동으로** 열린다.
// 이 동작은 끌 수 없다. 앱 전체에 한 번 다는 components/trip/TripRuntime.js 가 연다.
//   - 복귀 지시는 안전 문구다 — 주 언어 + 병기 언어 두 줄(safetyPair). ja·zh 는 검수 전까지 영어+한국어.
//   - 돌아갈 곳은 그날 숙소의 이름·주소 **글자만** 보인다. 좌표·지도 링크를 넣지 않는다(spec 4.14 · 규칙 39).
//     택시 기사에게 보여 줄 한국어 복귀 카드(/cards)로 잇는다.
//   - 긴급 연락: 119 전화 걸기와 /emergency.
//   - 닫기(X)는 없다. '확인했어요' · Escape · 뒤로 가기가 모두 시트만 닫는다(useModalSheet — 페이지를 떠나지 않는다).
//     닫아도 저장 일정의 returnNow 는 그대로다. 오늘 화면이 '복귀 안내 다시 보기'를 계속 보인다.

import Link from 'next/link';
import { useLang } from './LanguageProvider.js';
import { Icon, Sheet } from './ui/index.js';
import { lodgingOf } from './trip/viewModel.js';

/**
 * @param {object} props
 * @param {object|null} props.day        오늘 저장 일정(DayPlan)
 * @param {object|null} props.stay
 * @param {string|null} [props.cause]    PATIENT_RECALLED | PLAN_REVOKED | PLAN_EXPIRED
 * @param {() => void} props.onClose
 */
export default function ReturnSheet({ day, stay, cause = null, onClose }) {
  const { t, pair, safety, lang, reasonText } = useLang();
  const title = pair('return.title');
  const body = pair('return.body');
  const note = pair('return.note');
  const lodging = lodgingOf(day, stay);
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
        {cause && (
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
            <Icon name="bed" size={18} /> {t('return.placeTitle')}
          </h3>
          {lodging ? (
            <>
              <p className="trip-return-name">{lodging.name}</p>
              {lodging.address && (
                <p className="trip-return-address" lang="ko">
                  {lodging.address}
                </p>
              )}
            </>
          ) : (
            <p>{t('return.noLodging')}</p>
          )}
          <Link className="trip-inline-link" href="/cards#cards-return">
            {t('return.cardLink')}
          </Link>
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
