// 빈 상태 (AX-304 · docs/platform/DESIGN_SYSTEM.md '부품 (`components/ui/`)')
//
//   <EmptyState icon="navTrip" title="아직 일정이 없어요" body="체류 정보를 넣으면 날짜별 일정을 만들어요."
//               action={<Button href="/onboarding">체류 정보 넣기</Button>} />
//
// 빈 화면은 다음에 할 일을 알려 주는 자리다 — 무엇이 없는지와 무엇을 하면 되는지를 함께 쓴다.
// 오류 표시가 아니므로 빨강·경고 아이콘을 쓰지 않는다. 문구는 화면이 자기 이름공간에서 넘긴다.

import Icon from './Icon.js';

/**
 * @param {object} props
 * @param {string} [props.icon]            Icon.js 이름 (기본: 지도)
 * @param {string} props.title
 * @param {string} [props.body]
 * @param {React.ReactNode} [props.action]
 * @param {2|3} [props.headingLevel]
 */
export default function EmptyState({ icon = 'map', title, body, action, headingLevel = 2 }) {
  const Heading = `h${headingLevel}`;
  return (
    <section className="ui-empty">
      <span className="ui-empty-art">
        <Icon name={icon} size={30} />
      </span>
      <Heading className="ui-empty-title">{title}</Heading>
      {body && <p>{body}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </section>
  );
}
