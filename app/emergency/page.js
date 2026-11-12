'use client';

// /emergency: 긴급 연락 (AX-318 · docs/platform/IA_AND_FLOWS.md '경로'·'고정 요소'·'보기 전용 상태', docs/business-rules.md '운영 안전장치')
//
// - 119, 1330(관광통역안내), 등록한 병원 전화(병원 이름과 함께)를 전화 걸기 링크로 둔다.
//   번호와 1330 발신 형식의 공식 근거는 ./contacts.js 머리 주석에 있다.
// - 로그인 전·로그인 만료·오프라인·추천 중단 스위치에서도 동작한다. 서버를 부르지 않고, 저장소에 쓰지 않는다.
//   병원 전화는 이 기기에 마지막으로 로그인한 계정의 체류 사본에서 읽기만 한다.
// - 긴급 버튼(앱 셸)은 이 화면을 현재 위치로 표시한다(aria-current).
// - SEED ③층(설계서 6.2 10번): 흰 바탕 한 장. 안내 Callout / 119(긴급 빨강 채움 52px) / 1330(회색 채움) + 해외 발신 링크 / 등록한 병원 행.

import { useLang } from '@/components/LanguageProvider.js';
import PairText from '@/components/settings/PairText.js';
import { useHydrated, useStay } from '@/components/cards/useDeviceData.js';
import { Icon, TopBar } from '@/components/ui/index.js';
import { EMERGENCY_LINES, hospitalContacts } from './contacts.js';

/** 번호별 설명 문구 */
const LINE_DESC = Object.freeze({
  119: 'emergency.desc119',
  1330: 'emergency.desc1330',
});

const LEAD_KEY = 'emergency.lead';

function HospitalList() {
  const { t } = useLang();
  const hydrated = useHydrated();
  const stay = useStay();
  if (!hydrated) return null;
  const contacts = hospitalContacts(stay);
  if (contacts.length === 0) return <p className="emergency-empty">{t('emergency.hospitalsNone')}</p>;
  return (
    <ul className="emergency-hospitals" role="list">
      {contacts.map((contact) => (
        <li key={contact.hospitalId} className="emergency-hospital">
          <p className="emergency-hospital-name">{contact.name}</p>
          {contact.href ? (
            <a className="btn btn-secondary btn-small emergency-hospital-call" href={contact.href}>
              <Icon name="phone" size={16} />
              <span>{t('emergency.callNumber', { number: contact.phone })}</span>
            </a>
          ) : (
            <p className="emergency-no-phone">{t('emergency.hospitalNoPhone')}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function EmergencyPage() {
  const { t } = useLang();
  return (
    <>
      <TopBar title={t('emergency.header')} />
      <main className="page emergency-page">
        <div className="ui-callout has-icon emergency-lead" role="note">
          <span className="ui-callout-icon emergency-lead-icon" aria-hidden="true">
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
    </>
  );
}
