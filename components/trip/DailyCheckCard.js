'use client';

// 매일 확인 카드 (AX-317 · spec 4.6 · 규칙 32·49)
//
// 오늘을 덮는 본인 체크 기간이 있는 날, 그날 처음 오늘 화면에 오면 맨 위에 고정한다.
//   - 오늘 적용 항목 **요약**과 동반 보호자 여부를 함께 보인다(spec 4.6).
//     외출·복귀는 늘 펼쳐 두고(필수 항목이고 외출 가능 여부를 정한다), 나머지 제한 항목은 접는다.
//     13행을 모두 펼치면 확인 카드가 홈의 61%(1,414px)를 차지하고 배지가 28개 붙어,
//     같은 모양이 반복되는 바람에 정작 바뀐 항목이 눈에 띄지 않는다.
//   - '그대로예요' → 오늘 확인 완료(자정까지). '바뀌었어요' → 조건 편집(/conditions)으로 간다.
//     조건을 저장하면 동기화 모듈이 오늘을 다시 판정한 뒤 확인 완료로 바꾼다.
//   - 확인 전에는 오늘 일정은 보이되 길찾기·장소 이동과 편집을 막는다(오늘 게이트 덧씌우기 — 저장 일정은 그대로).
//   - 보기 전용이면 두 버튼을 막고 이유를 보인다.

import { useId } from 'react';
import { useLang } from '../LanguageProvider.js';
import { Badge, Button, Icon, SourceTag } from '../ui/index.js';
import { ITEM_LABEL_KEY, formatEffectiveValue } from '../conditions/values.js';
import { dailyCheckSummary } from './viewModel.js';

function Row({ row, hospitals }) {
  const { t } = useLang();
  return (
    <div className="today-check-row">
      <dt>{t(ITEM_LABEL_KEY[row.key])}</dt>
      <dd>
        <span>{formatEffectiveValue(row.key, row.value, t, hospitals)}</span>
        <span className="today-check-tags">
          {row.sources.map((source) => (
            <SourceTag key={source} source={source === 'HOSPITAL' ? 'hospital' : 'self'} />
          ))}
          {row.defaulted && <Badge kind="defaulted" />}
        </span>
      </dd>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.day       오늘 저장 일정(합성 결과 effective)
 * @param {object|null} props.stay
 * @param {boolean} props.readOnly
 * @param {() => void} props.onSame
 * @param {() => void} props.onChanged
 * @param {2|3|4} [props.headingLevel] 제목 단계. 오늘 화면은 맨 위 블록이라 2, 시안 보드 견본은 소제목(h3) 아래라 4
 */
export default function DailyCheckCard({ day, stay, readOnly, onSame, onChanged, headingLevel = 2 }) {
  const { t } = useLang();
  const headingId = useId();
  const Heading = `h${headingLevel}`;
  const summary = dailyCheckSummary(day?.effective);
  const hospitals = stay?.hospitals ?? [];

  return (
    <section className="today-check" aria-labelledby={headingId}>
      <p className="today-check-flag">
        <Icon name="clockQuestion" size={18} /> {t('today.checkFlag')}
      </p>
      <Heading id={headingId} className="today-check-title">
        {t('today.checkTitle')}
      </Heading>
      <p className="today-check-lead">{t('today.checkLead')}</p>
      {summary.main.length > 0 && (
        <dl className="today-check-list">
          {summary.main.map((row) => (
            <Row key={row.key} row={row} hospitals={hospitals} />
          ))}
        </dl>
      )}
      {summary.restrictions.length > 0 && (
        <details className="today-check-more">
          <summary>{t('today.checkMoreItems', { n: summary.restrictions.length })}</summary>
          <dl className="today-check-list">
            {summary.restrictions.map((row) => (
              <Row key={row.key} row={row} hospitals={hospitals} />
            ))}
          </dl>
        </details>
      )}
      {summary.noneCount > 0 && <p className="today-check-note">{t('today.checkOthersNone', { n: summary.noneCount })}</p>}
      <p className="today-check-companion">
        <Icon name="stateTogether" size={18} /> {stay?.hasCompanion ? t('today.checkCompanionYes') : t('today.checkCompanionNo')}
      </p>
      <div className="today-check-actions">
        <Button onClick={onSame} disabled={readOnly}>
          {t('today.checkSame')}
        </Button>
        <Button variant="secondary" onClick={onChanged} disabled={readOnly}>
          {t('today.checkChanged')}
        </Button>
      </div>
      {readOnly && <p className="today-check-note">{t('today.checkReadOnly')}</p>}
    </section>
  );
}
