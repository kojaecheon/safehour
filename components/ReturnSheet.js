'use client';

// SCR008 — 즉시 복귀 안내
// 경로 API 승인 전이므로 지도 연결 대신 기준점 좌표 복사 + 병원 연락 안내를 제공한다 (D04-F012 BLOCKED).

import { useState } from 'react';
import { fmtTime } from '@/lib/format.js';
import { useModalSheet } from '@/lib/useModalSheet.js';

export default function ReturnSheet({ origin, returnBy, latestDepartureAt, onClose }) {
  const [copyState, setCopyState] = useState('idle'); // idle | ok | fail
  // 즉시 복귀는 안전 지시다. 뒤로가기로 페이지를 떠나 지시를 잃지 않도록
  // 모든 닫기가 같은 경로(requestClose)를 거친다 (ADR-0001 보완 조건 3)
  const { sheetRef, requestClose } = useModalSheet(onClose);

  async function copyCoords() {
    try {
      await navigator.clipboard.writeText(`${origin.lat}, ${origin.lng}`);
      setCopyState('ok');
    } catch {
      setCopyState('fail');
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="return-sheet-h">
      <div className="sheet" ref={sheetRef} tabIndex={-1}>
        <h2 id="return-sheet-h">지금 복귀하세요</h2>
        <p lang="en" style={{ color: 'var(--ink-soft)', fontSize: 14 }}>
          Return to your hospital or accommodation now.
        </p>
        <p style={{ marginTop: 6, marginBottom: 14 }}>
          아래 기준점으로 이동하세요. 몸 상태에 이상이 느껴지면 이동 전에 병원에 먼저 연락하세요.
        </p>

        <div className="card" style={{ marginBottom: 10 }}>
          <h3>{origin.label}</h3>
          <p style={{ fontSize: 14 }}>
            좌표 {origin.lat}, {origin.lng}
          </p>
          <div className="meta" style={{ marginTop: 8 }}>
            {returnBy && <span>복귀 마감 {fmtTime(returnBy)}</span>}
          </div>
        </div>

        <button type="button" className="btn btn-secondary" onClick={copyCoords}>
          기준점 좌표 복사 (지도 앱에 붙여넣기)
        </button>
        <p role="status" style={{ fontSize: 14, marginTop: 6, minHeight: 20 }}>
          {copyState === 'ok' && '좌표를 복사했습니다.'}
          {copyState === 'fail' && '복사에 실패했습니다. 위 좌표를 직접 확인해 주세요.'}
        </p>

        <p className="source-note" style={{ marginTop: 8 }}>
          경로 안내 연결은 위치정보 검토 완료 후 제공됩니다. 긴급 상황이면 119 또는 병원에 바로
          연락하세요.
        </p>

        <button type="button" className="btn" style={{ marginTop: 4 }} onClick={requestClose}>
          확인
        </button>
      </div>
    </div>
  );
}
