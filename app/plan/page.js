'use client';

// SCR002~004 — 기준점·복귀시간·병원조건·역할 입력
//
// 원칙
//   - 병원이 제공한 조건을 사용자가 그대로 옮겨 적는다. 앱이 해석·완화하지 않는다.
//   - 현재 GPS 입력 방식은 제공하지 않는다. 고정 기준점만 선택할 수 있다.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toLocalInputValue } from '@/lib/format.js';

const ANCHOR_PRESETS = [
  {
    id: 'gangnam',
    label: '강남 시연 기준점 (병원 밀집 지역)',
    lat: 37.5105,
    lng: 127.059,
  },
  { id: 'custom', label: '좌표 직접 입력' },
];

/**
 * 입력 유지용 draft 키 (D03-NAV004 "브라우저 뒤로가기 시 입력값을 유지한다").
 * 병원 조건이 담기므로 sessionStorage 에만 두고(탭 종료 시 소멸), 세션 초기화 시 지운다.
 */
const DRAFT_KEY = 'safehour.planDraft';

export default function PlanPage() {
  const router = useRouter();

  const [anchorPreset, setAnchorPreset] = useState('gangnam');
  const [anchorLabel, setAnchorLabel] = useState('병원');
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');

  const [returnBy, setReturnBy] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [issuedBy, setIssuedBy] = useState('medical_staff');

  const [fasting, setFasting] = useState(false);
  // 안전 게이트 관련 항목은 허용측 기본값을 두지 않는다 — 사용자가 병원 안내를
  // 확인하고 직접 선택해야 제출할 수 있다.
  const [outingAllowed, setOutingAllowed] = useState(null);
  const [escortRequired, setEscortRequired] = useState(false);
  const [avoidUv, setAvoidUv] = useState(true);
  const [indoorOnly, setIndoorOnly] = useState(false);
  const [maxWalkMin, setMaxWalkMin] = useState('20');
  const [maxTravelMin, setMaxTravelMin] = useState('30');

  const [hasCompanion, setHasCompanion] = useState(true);
  const [patientResting, setPatientResting] = useState(false);
  const [companionSeparateAllowed, setCompanionSeparateAllowed] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [nowLocal, setNowLocal] = useState('');
  // 복원이 끝나기 전에 초기값으로 draft 를 덮어쓰지 않도록 하는 플래그
  const [draftLoaded, setDraftLoaded] = useState(false);
  const errorRef = useRef(null);

  // 하이드레이션 불일치를 피하기 위해 시간 기본값은 마운트 후에 채운다.
  // 조건 발행 시각(issuedAt)은 미리 채우지 않는다 — 실제 받은 시각을 입력해야
  // 24시간 최신성 게이트가 의미를 가진다.
  // 저장된 draft 가 있으면 기본값 대신 그것을 복원한다 (D03-NAV004).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = new Date();
      setNowLocal(toLocalInputValue(now));

      let draft = null;
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) draft = JSON.parse(raw);
      } catch {
        draft = null;
      }

      if (!draft) {
        setReturnBy(toLocalInputValue(new Date(now.getTime() + 4 * 3600000)));
        setDraftLoaded(true);
        return;
      }

      setAnchorPreset(draft.anchorPreset ?? 'gangnam');
      setAnchorLabel(draft.anchorLabel ?? '병원');
      setCustomLat(draft.customLat ?? '');
      setCustomLng(draft.customLng ?? '');
      setReturnBy(draft.returnBy || toLocalInputValue(new Date(now.getTime() + 4 * 3600000)));
      setIssuedAt(draft.issuedAt ?? '');
      setIssuedBy(draft.issuedBy ?? 'medical_staff');
      setFasting(Boolean(draft.fasting));
      // 외출 허용은 명시적 선택이 필요한 값이므로 저장된 값이 boolean 일 때만 복원한다
      setOutingAllowed(typeof draft.outingAllowed === 'boolean' ? draft.outingAllowed : null);
      setEscortRequired(Boolean(draft.escortRequired));
      setAvoidUv(Boolean(draft.avoidUv));
      setIndoorOnly(Boolean(draft.indoorOnly));
      setMaxWalkMin(draft.maxWalkMin ?? '20');
      setMaxTravelMin(draft.maxTravelMin ?? '30');
      setHasCompanion(Boolean(draft.hasCompanion));
      setPatientResting(Boolean(draft.patientResting));
      setCompanionSeparateAllowed(Boolean(draft.companionSeparateAllowed));
      setNotice('이전에 입력한 조건을 복원했습니다. 병원 안내와 다르면 수정해 주세요.');
      setDraftLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // 검증 실패 시 오류 배너로 포커스를 옮겨 스크린리더·키보드 사용자를 유도한다
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  // 입력이 바뀔 때마다 저장한다. 입력 도중 이탈해도(뒤로가기·홈) 값이 남는다.
  useEffect(() => {
    if (!draftLoaded) return;
    saveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 폼 값 전체가 저장 대상이다
  }, [
    draftLoaded,
    anchorPreset,
    anchorLabel,
    customLat,
    customLng,
    returnBy,
    issuedAt,
    issuedBy,
    fasting,
    outingAllowed,
    escortRequired,
    avoidUv,
    indoorOnly,
    maxWalkMin,
    maxTravelMin,
    hasCompanion,
    patientResting,
    companionSeparateAllowed,
  ]);

  /** 현재 입력을 draft 로 저장한다 — 결과 화면에서 돌아와도 값이 남는다 */
  function saveDraft() {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          anchorPreset,
          anchorLabel,
          customLat,
          customLng,
          returnBy,
          issuedAt,
          issuedBy,
          fasting,
          outingAllowed,
          escortRequired,
          avoidUv,
          indoorOnly,
          maxWalkMin,
          maxTravelMin,
          hasCompanion,
          patientResting,
          companionSeparateAllowed,
        }),
      );
    } catch {
      // 저장 실패는 조용히 넘긴다 — 입력 자체를 막을 이유는 없다
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    // 검증 실패로 되돌아오더라도 입력이 남도록 제출 시도 시점에 저장한다
    saveDraft();

    const preset = ANCHOR_PRESETS.find((p) => p.id === anchorPreset);
    // Number('') === 0 이므로 빈 문자열을 먼저 걸러야 (0,0) 좌표 통과를 막는다
    if (anchorPreset === 'custom' && (customLat.trim() === '' || customLng.trim() === '')) {
      setError('기준점 위도·경도를 모두 입력해 주세요.');
      return;
    }
    const lat = anchorPreset === 'custom' ? Number(customLat) : preset.lat;
    const lng = anchorPreset === 'custom' ? Number(customLng) : preset.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('기준점 좌표를 확인해 주세요.');
      return;
    }
    if (!returnBy) {
      setError('병원 복귀 시각을 입력해 주세요.');
      return;
    }
    if (!issuedAt) {
      setError('병원 조건을 받은 시각을 입력해 주세요.');
      return;
    }
    if (outingAllowed === null) {
      setError('병원 안내의 외출 허용 여부를 선택해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { lat, lng, label: anchorLabel || '기준점' },
          returnBy: new Date(returnBy).toISOString(),
          condition: {
            version: `web-${Date.now().toString(36)}`,
            issuedAt: new Date(issuedAt).toISOString(),
            issuedBy,
            fasting,
            outingAllowed,
            escortRequired,
            avoidUv,
            indoorOnly,
            // 병원이 발행한 분리 허용 여부 — escortRequired 와 동시 true 면
            // 엔진이 CONFLICTING_CONDITION 으로 차단한다
            splitAllowed: hasCompanion && companionSeparateAllowed,
            maxWalkMin: maxWalkMin === '' ? null : Number(maxWalkMin),
            maxTravelMin: maxTravelMin === '' ? null : Number(maxTravelMin),
          },
          roles: { hasCompanion, patientResting, companionSeparateAllowed: hasCompanion && companionSeparateAllowed },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? '추천을 생성하지 못했습니다.');
        return;
      }
      sessionStorage.setItem('safehour.result', JSON.stringify(data));
      router.push('/result');
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="top-bar">
        <button type="button" className="back" aria-label="뒤로 가기" onClick={() => router.push('/')}>
          ‹
        </button>
        <h1 className="brand">안심 코스 만들기</h1>
      </header>
      <main className="page">
        <div className="medical-callout" role="note">
          병원에서 받은 안내를 <strong>그대로</strong> 입력해 주세요. SafeHour는 입력된 조건을
          해석하거나 완화하지 않으며, 조건이 없거나 오래되면 관광을 추천하지 않습니다.
        </div>

        {/* noValidate — 네이티브 말풍선 대신 필드명을 명시한 커스텀 오류로 일원화 */}
        <form onSubmit={handleSubmit} noValidate>
          {/* ── 기준점 ── */}
          <section className="card" id="location" aria-labelledby="anchor-h">
            <h2 id="anchor-h">1. 병원·숙소 기준점</h2>
            <p className="hint" style={{ fontSize: 13, marginBottom: 10 }}>
              현재 위치(GPS)는 사용하지 않습니다. 복귀할 기준점을 직접 선택합니다.
            </p>
            <div className="radio-group" role="radiogroup" aria-label="기준점 선택">
              {ANCHOR_PRESETS.map((p) => (
                <label key={p.id} className={`radio-option ${anchorPreset === p.id ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="anchor"
                    checked={anchorPreset === p.id}
                    onChange={() => setAnchorPreset(p.id)}
                  />
                  <span>
                    {p.label}
                    {p.lat != null && (
                      <span className="sub">
                        {p.lat}, {p.lng}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {anchorPreset === 'custom' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="lat">위도</label>
                  <input id="lat" type="number" step="any" inputMode="decimal" value={customLat} onChange={(e) => setCustomLat(e.target.value)} placeholder="37.51" />
                </div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="lng">경도</label>
                  <input id="lng" type="number" step="any" inputMode="decimal" value={customLng} onChange={(e) => setCustomLng(e.target.value)} placeholder="127.05" />
                </div>
              </div>
            )}
            <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
              <label htmlFor="anchor-label">기준점 이름</label>
              <input id="anchor-label" type="text" value={anchorLabel} onChange={(e) => setAnchorLabel(e.target.value)} placeholder="예: 병원, 숙소" />
            </div>
          </section>

          {/* ── 복귀 시각 ── */}
          <section className="card" id="return" aria-labelledby="return-h">
            <h2 id="return-h">2. 병원 복귀 시각</h2>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="return-by">이 시각까지 기준점으로 복귀해야 합니다 (필수)</label>
              <input
                id="return-by"
                type="datetime-local"
                value={returnBy}
                min={nowLocal || undefined}
                aria-describedby="return-by-hint"
                onChange={(e) => setReturnBy(e.target.value)}
                required
              />
              <p className="hint" id="return-by-hint">진료·소독·드레싱 예약 등 병원이 안내한 복귀 시각입니다.</p>
            </div>
          </section>

          {/* ── 병원 조건 ── */}
          <section className="card" id="condition" aria-labelledby="cond-h">
            <h2 id="cond-h">3. 병원 주의조건</h2>
            <div className="field">
              <label htmlFor="issued-by">조건 제공 주체</label>
              <select id="issued-by" value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)}>
                <option value="medical_staff">의료진이 제공한 안내</option>
                <option value="coordinator">병원 코디네이터가 제공한 안내</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="issued-at">조건을 받은 시각 (필수)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="issued-at"
                  type="datetime-local"
                  style={{ flex: 1 }}
                  value={issuedAt}
                  max={nowLocal || undefined}
                  aria-describedby="issued-at-hint"
                  onChange={(e) => setIssuedAt(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => setIssuedAt(toLocalInputValue(new Date()))}
                >
                  방금 받음
                </button>
              </div>
              <p className="hint" id="issued-at-hint">실제로 안내를 받은 시각을 입력하세요. 24시간이 지난 조건으로는 추천하지 않습니다.</p>
            </div>

            <div>
              <label className="toggle-row">
                <span className="label">
                  금식 중
                  <span className="sub">식음 활동을 제외합니다</span>
                </span>
                <input type="checkbox" checked={fasting} onChange={(e) => setFasting(e.target.checked)} />
              </label>
              <fieldset style={{ border: 'none', padding: 0, margin: '4px 0 8px' }}>
                <legend style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
                  외출 허용 여부 <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(병원 안내 기준 · 필수 선택)</span>
                </legend>
                <div className="radio-group">
                  <label className={`radio-option ${outingAllowed === true ? 'selected' : ''}`}>
                    <input type="radio" name="outing" required checked={outingAllowed === true} onChange={() => setOutingAllowed(true)} />
                    <span>외출이 허용되었습니다</span>
                  </label>
                  <label className={`radio-option ${outingAllowed === false ? 'selected' : ''}`}>
                    <input type="radio" name="outing" required checked={outingAllowed === false} onChange={() => setOutingAllowed(false)} />
                    <span>
                      외출이 허용되지 않았습니다
                      <span className="sub">관광을 추천하지 않습니다</span>
                    </span>
                  </label>
                </div>
              </fieldset>
              <label className="toggle-row">
                <span className="label">
                  보호자 동행 필수
                  <span className="sub">환자 단독·보호자 분리 활동을 막습니다</span>
                </span>
                <input
                  type="checkbox"
                  checked={escortRequired}
                  onChange={(e) => {
                    setEscortRequired(e.target.checked);
                    // 상충 조건(동행 필수 + 분리 허용)은 입력 단계에서 강제로 배제한다
                    if (e.target.checked && companionSeparateAllowed) {
                      setCompanionSeparateAllowed(false);
                      setNotice('보호자 동행 필수 조건에 따라 "보호자 분리 활동 허용"이 해제되었습니다.');
                    } else if (e.target.checked) {
                      setCompanionSeparateAllowed(false);
                    }
                  }}
                />
              </label>
              <label className="toggle-row">
                <span className="label">
                  자외선 회피
                  <span className="sub">실외 노출이 큰 장소를 제외합니다</span>
                </span>
                <input type="checkbox" checked={avoidUv} onChange={(e) => setAvoidUv(e.target.checked)} />
              </label>
              <label className="toggle-row">
                <span className="label">
                  실내 활동만 허용
                  <span className="sub">실내 여부가 불확실한 장소도 제외합니다</span>
                </span>
                <input type="checkbox" checked={indoorOnly} onChange={(e) => setIndoorOnly(e.target.checked)} />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label htmlFor="max-walk">최대 보행 (분)</label>
                <input id="max-walk" type="number" min="0" max="240" inputMode="numeric" value={maxWalkMin} onChange={(e) => setMaxWalkMin(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label htmlFor="max-travel">최대 편도 이동 (분)</label>
                <input id="max-travel" type="number" min="0" max="240" inputMode="numeric" value={maxTravelMin} onChange={(e) => setMaxTravelMin(e.target.value)} />
              </div>
            </div>
          </section>

          {/* ── 역할 ── */}
          <section className="card" id="role" aria-labelledby="roles-h">
            <h2 id="roles-h">4. 동행 상황</h2>
            <label className="toggle-row">
              <span className="label">보호자가 함께 있습니다</span>
              <input type="checkbox" checked={hasCompanion} onChange={(e) => setHasCompanion(e.target.checked)} />
            </label>
            <label className="toggle-row">
              <span className="label">
                환자는 지금 휴식이 필요합니다
                <span className="sub">보호자 분리 활동을 우선 검토합니다</span>
              </span>
              <input type="checkbox" checked={patientResting} onChange={(e) => setPatientResting(e.target.checked)} />
            </label>
            {hasCompanion && (
              <label className="toggle-row">
                <span className="label">
                  병원이 보호자 분리 활동을 허용했습니다
                  <span className="sub">
                    {escortRequired
                      ? '보호자 동행 필수 조건이 켜져 있어 선택할 수 없습니다'
                      : '병원 안내에 분리 허용이 있는 경우에만 켜세요'}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={companionSeparateAllowed}
                  disabled={escortRequired}
                  onChange={(e) => setCompanionSeparateAllowed(e.target.checked)}
                />
              </label>
            )}
          </section>

          {error && (
            <div className="state-banner state-STANDBY" role="alert" tabIndex={-1} ref={errorRef}>
              <span className="state-label">확인 필요</span>
              <p style={{ color: 'inherit' }}>{error}</p>
            </div>
          )}

          {/* 상주형 라이브 리전 — 제출 진행·자동 해제 등 상태 변화를 보조기술에 고지 */}
          <p role="status" style={{ fontSize: 14, color: 'var(--ink-soft)', minHeight: 20 }}>
            {submitting ? '조건에 맞는 활동을 찾고 있습니다…' : notice}
          </p>

          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? '조건에 맞는 활동을 찾고 있습니다…' : '안전 판정으로 추천 받기'}
          </button>
          <p className="source-note">
            입력한 조건은 추천 계산에만 사용되며 서버에 저장하지 않습니다. 병원 안내문 원문은
            수집하지 않습니다.
          </p>
        </form>
      </main>
    </>
  );
}
