// 목록 행 (SEED List Item · 설계서 5.5)
//
//   <ListHeader>도구</ListHeader>
//   <ListGroup>
//     <li><ListItem title="전체 일정" description="날짜별 상태" leading={<Icon name="navTrip" size={22} />} trailing="chevron" href="/trip" /></li>
//     <li><ListItem title="언어" trailing={<span>한국어</span>} onClick={open} /></li>
//   </ListGroup>
//
// - 위아래 12 · 좌우 16. 제목 16/22, 설명 14/19 보조 글자(SEED 13px·옅은 회색을 하한으로 올림).
//   제목만이면 46px, 설명까지 66px 안팎 — 터치 44px 이상.
// - href 면 링크, onClick 이면 버튼, 둘 다 없으면 누를 수 없는 행(div).
// - 누르면 바탕이 좌우 6px 안으로 들어온 모서리 10 면으로 바뀌고 내용만 조금 줄어든다.
// - 행 안에서 따로 누를 것은 3개까지. 뒤에 버튼을 두는 행은 행 자체에 href·onClick 을 주지 않는다(누르는 곳이 겹친다).
// - 앞 아이콘은 장식이다(aria-hidden). 뜻은 제목이 전한다.

import Link from 'next/link';
import Icon from './Icon.js';

/** 목록 묶음 — 자식은 <li>. 반복 행 사이에 좌우 16px 들여쓴 1px 선 */
export function ListGroup({ label, children }) {
  return (
    <ul className="ui-list" role="list" aria-label={label}>
      {children}
    </ul>
  );
}

/** 목록 머리 — 14/19 굵게 */
export function ListHeader({ as: Heading = 'h2', id, children }) {
  return (
    <Heading className="ui-list-header" id={id}>
      {children}
    </Heading>
  );
}

/**
 * @param {object} props
 * @param {React.ReactNode} props.title
 * @param {string} [props.titleLang]
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.leading]            22px 아이콘·그림
 * @param {'chevron'|React.ReactNode} [props.trailing] 'chevron' 이면 오른쪽 화살표
 * @param {string} [props.href]
 * @param {() => void} [props.onClick]
 */
export default function ListItem({ title, titleLang, description, leading, trailing, href, onClick }) {
  const interactive = Boolean(href || onClick);
  const className = interactive ? 'ui-list-item is-interactive' : 'ui-list-item';
  const body = (
    <span className="ui-list-item-inner">
      {leading && (
        <span className="ui-list-item-leading" aria-hidden="true">
          {leading}
        </span>
      )}
      <span className="ui-list-item-text">
        <span className="ui-list-item-title" lang={titleLang}>
          {title}
        </span>
        {description && <span className="ui-list-item-desc">{description}</span>}
      </span>
      {trailing && (
        <span className="ui-list-item-trailing">
          {trailing === 'chevron' ? <Icon name="chevronRight" size={18} /> : trailing}
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
