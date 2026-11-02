// 보호자 화면의 오류 문장·주의 안내 (③층 13번, 설계서 6.2)
//
//   - 오류 문장은 체류 설정과 같은 배치(경고 아이콘 + 굵은 긴급 빨강, 왼쪽 띠 없음).
//   - 주의 문장은 일정 화면 실패 알림과 같은 대기 색 Callout(대기 색 면 + 1px 대기 선 + 앞 20px 경고 아이콘).
//   - 아이콘은 장식이라 읽히지 않는다(aria-hidden). 읽히는 글자는 문장 그대로다.

import { Icon } from '@/components/ui/index.js';

/**
 * 입력 오류 한 줄. role=alert 라이브 영역은 늘 DOM 에 남는다: 문장이 없으면 빈 요소만 둔다(.is-empty).
 * @param {object} props
 * @param {string} [props.id]
 * @param {import('react').ReactNode} [props.children]
 */
export function ErrorText({ id, children }) {
  const empty = children === null || children === undefined || children === false || children === '';
  if (empty) return <p id={id} className="guardian-error is-empty" role="alert" />;
  return (
    <p id={id} className="ui-field-error guardian-error" role="alert">
      <Icon name="alert" size={20} />
      <span>{children}</span>
    </p>
  );
}

/**
 * 주의 안내 한 덩이(긴 링크, 저장 실패).
 * @param {object} props
 * @param {string} [props.role]
 * @param {string} [props.className]
 * @param {import('react').ReactNode} props.children
 */
export function WarningNote({ role = 'note', className = '', children }) {
  return (
    <div className={`guardian-warning ${className}`.trim()} role={role}>
      <span className="guardian-warning-icon" aria-hidden="true">
        <Icon name="alert" size={20} />
      </span>
      <p>{children}</p>
    </div>
  );
}
