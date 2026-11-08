// 문의 창구 값을 링크로 바꾸는 순수 함수 (S5)
//
// 값은 빌드 때 새겨지는 공개 환경변수 NEXT_PUBLIC_SAFEHOUR_CONTACT 다(mailto: 주소, https 주소, 또는 이메일 주소).
// 허용하는 형태만 링크로 만든다. 그 밖의 값(javascript: 등)은 링크로 만들지 않고 글자로만 보여 준다.

/**
 * @param {unknown} raw
 * @returns {{ href: string | null, label: string } | null} 값이 없으면 null
 */
export function contactLink(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value === '') return null;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return { href: value, label: value.replace(/^mailto:/i, '') };
  if (/^https?:\/\/[^\s]+$/i.test(value)) return { href: value, label: value.replace(/^https?:\/\//i, '') };
  if (/^[^\s@:]+@[^\s@:]+$/.test(value)) return { href: `mailto:${value}`, label: value };
  return { href: null, label: value };
}
