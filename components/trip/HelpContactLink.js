'use client';

// 운영자에게 닿는 길 (findings 16): 사용자가 기다려도 풀리지 않는 관광공사 실패(AUTH · SELF_LIMIT)에만 보인다.
//
// 판단은 viewModel.js needsOperatorContact 하나다(갱신 실패 알림·첫 일정 빈 상태의 '운영자에게 알려 주세요' 문구와 같은 함수).
// 문의 창구 값(NEXT_PUBLIC_SAFEHOUR_CONTACT)이 빌드에 있으면 도움말의 문의 구역(/help#contact)으로 '문의하기',
// 없으면 도움말(/help)로 '도움말 보기'다. 도움말 화면도 같은 값이 있을 때만 문의 구역을 그린다(app/help/page.js).
// 공개 환경변수는 이름을 글자 그대로 써야 빌드 때 새겨진다. 문의 값 자체는 여기서 보이지 않는다(도움말이 보인다).

import Link from 'next/link';
import { contactLink } from '../help/contact.js';
import { useLang } from '../LanguageProvider.js';
import { needsOperatorContact } from './viewModel.js';

const HAS_CONTACT = contactLink(process.env.NEXT_PUBLIC_SAFEHOUR_CONTACT) !== null;

/**
 * @param {object} props
 * @param {string|null} [props.upstream]  관광공사 실패 분류(trip.lastUpstream)
 */
export default function HelpContactLink({ upstream = null }) {
  const { t } = useLang();
  if (!needsOperatorContact(upstream)) return null;
  return (
    <Link className="trip-inline-link trip-contact-link" href={HAS_CONTACT ? '/help#contact' : '/help'}>
      {t(HAS_CONTACT ? 'today.contactLink' : 'today.helpLink')}
    </Link>
  );
}
