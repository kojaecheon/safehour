'use client';

// 보호자 화면의 안전 문구 한 덩이 (AX-320 · spec 4.17)
//
// 안전 문구는 safetyPair() 의 주 언어로 보인다 — ja·zh 는 검수 스위치가 켜지기 전까지 영어다.
// 줄마다 lang 속성을 붙여 스크린리더가 맞는 음성으로 읽게 한다. both 면 병기 줄(한국어, ko 면 영어)을 함께 그린다.
// 모양은 공용 Callout(.ui-callout, 띠 없는 회색 면)이다. 아이콘이 있으면 has-icon 으로 앞 20px 아이콘 칸을 두고,
// 없으면 문장 칸 하나다.

import { useLang } from '@/components/LanguageProvider.js';
import Icon from '@/components/ui/Icon.js';

/**
 * @param {object} props
 * @param {string} props.messageKey  guardian 이름공간의 safety 키
 * @param {object} [props.vars]
 * @param {boolean} [props.both]      병기 줄까지 그린다
 * @param {string} [props.icon]       앞에 붙는 아이콘(Icon.js 이름)
 * @param {'note'|'alert'|'status'|null} [props.role]
 * @param {string} [props.className]
 */
export default function SafetyNote({ messageKey, vars, both = false, icon, role = 'note', className = '' }) {
  const { pair } = useLang();
  const text = pair(messageKey, vars);
  return (
    <div className={`ui-callout${icon ? ' has-icon' : ''} guardian-note ${className}`.trim()} role={role ?? undefined}>
      {icon && (
        <span className="ui-callout-icon guardian-note-icon" aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
      )}
      <div className="guardian-note-text">
        <p lang={text.primary.lang}>{text.primary.text}</p>
        {both && (
          <p lang={text.secondary.lang} className="guardian-note-secondary">
            {text.secondary.text}
          </p>
        )}
      </div>
    </div>
  );
}
