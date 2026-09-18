// 버튼 (AX-304 · spec 7장)
//
//   <Button>다음</Button>                                 주 버튼 (포인트 색 한 가지)
//   <Button variant="secondary">나중에</Button>           보조 버튼 (흰 바탕 + 테두리)
//   <Button variant="quiet">자세히</Button>               조용한 버튼 (글자 + 밑줄)
//   <Button href="/trip">전체 일정</Button>               링크 모양 버튼 (next/link)
//   <Button disabled>저장</Button>                        비활성 — 색 교체로 표시(투명도 감산 금지)
//
// - 높이는 늘 44px 이상이다(size="small" 도 44px).
// - 비활성 링크는 링크를 만들지 않고 aria-disabled 버튼으로 그린다 — 눌러도 이동하지 않는다.
// - 기존 화면의 `.btn` · `.btn-secondary` · `.btn-small` 클래스를 그대로 쓴다. 모양은 app/globals.css 가 정한다.

import Link from 'next/link';
import Icon from './Icon.js';

const VARIANT_CLASS = {
  primary: '',
  secondary: 'btn-secondary',
  quiet: 'btn-quiet',
};

/**
 * @param {object} props
 * @param {'primary'|'secondary'|'quiet'} [props.variant]
 * @param {'normal'|'small'} [props.size]   small 은 폭이 내용에 맞춰진다
 * @param {boolean} [props.block]            true 면 폭 100% (기본: normal 은 100%, small 은 내용 폭)
 * @param {string} [props.href]              있으면 링크로 그린다
 * @param {string} [props.icon]              앞에 붙는 아이콘 이름 (Icon.js)
 * @param {boolean} [props.disabled]
 */
export default function Button({
  variant = 'primary',
  size = 'normal',
  block,
  href,
  icon,
  disabled = false,
  type = 'button',
  className,
  children,
  ...rest
}) {
  const classes = ['btn', VARIANT_CLASS[variant] ?? '', size === 'small' ? 'btn-small' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const style = block === false ? { width: 'auto' } : block === true ? { width: '100%' } : undefined;
  const content = (
    <>
      {icon && <Icon name={icon} size={20} />}
      <span>{children}</span>
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={classes} style={style} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      style={style}
      // 비활성 링크는 포커스를 남겨 둔다(키보드 위치 보존). 진짜 버튼은 disabled 로 막는다.
      disabled={href ? undefined : disabled}
      aria-disabled={href && disabled ? 'true' : undefined}
      {...rest}
    >
      {content}
    </button>
  );
}
