'use client';

// 하루 타임라인: 지하철 노선도 (AX-304 · docs/business-rules.md '하루 일정 생성')
//
// 외출은 굵은 노선, 정거장은 역, 복귀 마감은 종착역이다. 외출 밖(숙소 휴식·병원 일정·복약)은
// 노선에서 내려와 점선으로 이어진다. 화면(T15b)은 DayPlan 을 아래 항목 목록으로 바꿔 넘긴다.
//
//   <DayTimeline label="환자 일정" person="patient" entries={[
//     { id: 'd1', kind: 'depart', time: '10:00', title: '숙소' },
//     { id: 's1', kind: 'stop', time: '10:25', endTime: '11:20', title: '경복궁',
//       leg: { mode: 'TAXI', min: 12 }, badges: ['estimate', 'hoursUnconfirmed'], content: <PlaceCard … /> },
//     { id: 'm1', kind: 'meal', time: '12:00', endTime: '13:00', content: <MealSlot … /> },
//     { id: 'r1', kind: 'return', time: '14:40', title: '숙소', note: '복귀 마감 이유' },
//     { id: 'a1', kind: 'appointment', time: '16:00', endTime: '17:00', title: '병원' },
//   ]} />
//
// 항목 kind
//   kindKey 가 있으면 종류 이름을 그 키로 바꾼다(복귀 마감이 하루 활동 종료면 '오늘 활동 종료', viewModel deadlineCopyOf).
//   depart 출발(노선 시작) · stop 정거장 · meal 식사 칸 · return 복귀 마감(노선 끝)
//   appointment 병원 일정 · medication 복약 · rest 숙소에서 휴식   ← 노선 밖
//
// - 종류 이름(출발·복귀 마감·병원 일정·복약·휴식)은 늘 글자로 보인다 — 표식 모양·색만으로 구분하지 않는다.
// - 이동 시간(leg)은 늘 '추정' 배지와 함께 보인다(docs/business-rules.md '하루 일정 생성': 모든 이동시간에 '추정').
// - 시각은 'HH:MM' 문자열 그대로 보여준다(서버가 KST 로 만든 값).

import { useLang } from '../LanguageProvider.js';
import Badge from './Badge.js';
import Icon from './Icon.js';

const KIND = {
  depart: { icon: 'depart', key: 'common.tlDepart' },
  stop: { icon: null, key: null },
  meal: { icon: 'meal', key: null },
  return: { icon: 'flag', key: 'common.tlReturn' },
  appointment: { icon: 'hospital', key: 'common.tlAppointment' },
  medication: { icon: 'pill', key: 'common.tlMedication' },
  rest: { icon: 'bed', key: 'common.tlRest' },
};

const LEG = {
  WALK: { icon: 'walk', key: 'common.legWalk' },
  TAXI: { icon: 'car', key: 'common.legTaxi' },
  TRANSIT: { icon: 'transit', key: 'common.legTransit' },
};

/** 각 항목의 위·아래 선이 노선 위(on)인지 밖(off)인지 — 출발에서 켜지고 복귀 마감에서 꺼진다 */
function withSegments(entries) {
  let on = false;
  return entries.map((entry) => {
    const inOn = on;
    if (entry.kind === 'depart') on = true;
    if (entry.kind === 'return') on = false;
    return { entry, inOn: entry.kind === 'depart' ? false : inOn, outOn: on };
  });
}

/**
 * @param {object} props
 * @param {Array<object>} props.entries
 * @param {string} props.label             목록 이름(스크린리더) — 예: '환자 일정', '보호자 일정'
 * @param {'patient'|'guardian'} [props.person]  보호자는 노선 색이 다르다(이름은 label 로 따로 알린다)
 */
export default function DayTimeline({ entries = [], label, person = 'patient' }) {
  const { t } = useLang();
  return (
    <ol className={`ui-timeline ui-timeline-${person}`} aria-label={label}>
      {withSegments(entries).map(({ entry, inOn, outOn }) => {
        const kind = KIND[entry.kind] ?? KIND.stop;
        const leg = entry.leg && LEG[entry.leg.mode];
        const classes = [
          'ui-tl-item',
          `ui-tl-${entry.kind}`,
          inOn ? 'ui-tl-in-on' : 'ui-tl-in-off',
          outOn ? 'ui-tl-out-on' : 'ui-tl-out-off',
        ].join(' ');
        return (
          <li key={entry.id} className={classes}>
            <div className="ui-tl-time">
              {entry.time && <time>{entry.time}</time>}
              {entry.endTime && (
                <span className="ui-tl-end">
                  –<time>{entry.endTime}</time>
                </span>
              )}
            </div>
            <div className="ui-tl-rail" aria-hidden="true">
              <span className="ui-tl-marker">{kind.icon && <Icon name={kind.icon} size={16} strokeWidth={2.4} />}</span>
            </div>
            <div className="ui-tl-body">
              {leg && (
                <p className="ui-tl-leg">
                  <Icon name={leg.icon} size={18} />
                  <span>{t(leg.key, { n: entry.leg.min })}</span>
                  <Badge kind="estimate" />
                </p>
              )}
              {kind.key && (
                <p className="ui-tl-kind">
                  {entry.kind === 'return' && <Icon name="flag" size={14} strokeWidth={2.4} />}
                  {t(entry.kindKey ?? kind.key)}
                </p>
              )}
              {entry.title && <p className="ui-tl-title">{entry.title}</p>}
              {entry.note && <p className="ui-tl-note">{entry.note}</p>}
              {entry.badges?.length > 0 && (
                <div className="ui-tl-badges">
                  {entry.badges.map((b) => (
                    <Badge key={b} kind={b} />
                  ))}
                </div>
              )}
              {entry.content && <div className="ui-tl-content">{entry.content}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
