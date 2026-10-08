'use client';

// 일정 화면 공용 알림 상자 (SEED Callout, 설계서 5.6): 앞 20px 아이콘 칸 + 본문 칸.
//
//   - 일반 알림은 회색 면 + info, 실패 알림(error)은 대기 색 면 + 1px 대기 선 + alert. 아이콘은 먹색이다.
//     실패 알림에도 긴급 빨강을 쓰지 않는다(판정 상태와 헷갈리지 않게 문구로 밝힌다).
//   - 아이콘은 장식이라 읽히지 않는다(aria-hidden). 읽히는 글자는 본문 칸의 문구 그대로다.
//   - 알림 자리(slot): role=status 라이브 영역은 늘 같은 요소로 DOM 에 남는다. 내용이 없으면 빈 요소만 두어
//     높이를 차지하지 않는다(.trip-notice-slot:empty). plain 이면 상자 없이 글자만 둔다(하루 일정의 진행·완료 알림).
//   - as="p" 면 본문 칸은 span 이다(문장 뒤에 링크가 이어지는 한 문단). 그 밖에는 div 라 p·버튼을 세로로 쌓는다.

import { Icon } from '../ui/index.js';

/**
 * @param {object} props
 * @param {'div'|'p'} [props.as]
 * @param {boolean} [props.error]   실패 알림 모양
 * @param {boolean} [props.slot]    알림 자리(비면 빈 요소만 남긴다)
 * @param {boolean} [props.plain]   알림 자리의 내용을 상자 없이 글자로만 둔다
 * @param {string} [props.role]
 * @param {import('react').ReactNode} props.children
 */
export default function TripNotice({ as: Tag = 'div', error = false, slot = false, plain = false, role, children }) {
  const empty = children === null || children === undefined || children === false || children === '';
  if (slot && (empty || plain)) {
    return (
      <Tag role={role} className="trip-notice-slot">
        {empty ? null : children}
      </Tag>
    );
  }
  const Body = Tag === 'p' ? 'span' : 'div';
  return (
    <Tag role={role} className={error ? 'trip-notice is-error' : 'trip-notice'}>
      <span className="trip-notice-icon" aria-hidden="true">
        <Icon name={error ? 'alert' : 'info'} size={20} />
      </span>
      <Body className="trip-notice-body">{children}</Body>
    </Tag>
  );
}
