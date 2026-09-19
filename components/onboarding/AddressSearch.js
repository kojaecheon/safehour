'use client';

// 도로명주소 검색 칸 (AX-314 · spec 4.2–4.3, 6장 POST /api/address/search)
//
// - 사용자가 입력한 검색어로만 찾는다. 병원 목록·추천·순위를 보여주지 않는다(spec 4.3, 9.1).
// - 현재 위치를 쓰지 않는다. 위치 권한을 묻지 않는다(spec 9.1, 규칙 46).
// - 결과는 허용 필드(spec 5.1 Address)만 남겨 저장한다. 도로명주소는 한국어 원문 그대로 보인다(lang="ko").
// - 데모 주소(source "DEMO")는 '데모 주소' 배지를 붙인다 — 데모를 실제처럼 보이지 않게 한다.
// - 검색 상태(찾는 중·결과 수·결과 없음·실패)는 role="status" 한 곳에서 읽힌다.

import { useEffect, useId, useRef, useState } from 'react';
import { useLang } from '../LanguageProvider.js';
import { Badge, Button } from '../ui/index.js';
import { FieldErrors } from './Fields.js';
import { KEYWORD_MAX_LENGTH, fieldDomId, issuesFor, normalizeKeyword, pickAddress, searchErrorKey } from './draft.js';

const SEARCH_URL = '/api/address/search';
const RESULT_LIMIT = 10;
const IDLE = Object.freeze({ phase: 'idle', results: [], errorKey: null });

const HINT_KEY = {
  lodging: 'onboarding.addressHintLodging',
  hospital: 'onboarding.addressHintHospital',
};

/**
 * @param {object} props
 * @param {string} props.field                 검증 필드 경로 ('lodgings[0].address')
 * @param {Array} props.issues                 지금 보여줄 문제 목록
 * @param {'lodging'|'hospital'} props.kind
 * @param {object|null} props.value            고른 주소(spec 5.1 Address)
 * @param {(address: object) => void} props.onSelect
 */
export default function AddressSearch({ field, issues, kind, value, onSelect }) {
  const { t, lang } = useLang();
  const inputId = fieldDomId(field);
  const captionId = useId();
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState(IDLE);
  const [editing, setEditing] = useState(false);
  const ticketRef = useRef(0);
  const focusRef = useRef(null);
  const pickedRef = useRef(null);
  const inputRef = useRef(null);

  // 주소를 고르거나 바꾸기를 누른 뒤 초점을 다음 자리로 옮긴다(키보드 사용자가 길을 잃지 않게)
  useEffect(() => {
    const target = focusRef.current;
    if (!target) return;
    focusRef.current = null;
    (target === 'picked' ? pickedRef : inputRef).current?.focus();
  });

  const own = issuesFor(issues, field);
  const hintId = `${inputId}-hint`;
  const statusId = `${inputId}-status`;
  const errorId = own.length > 0 ? `${inputId}-error` : undefined;
  const showSearch = !value || editing;

  async function run() {
    const normalized = normalizeKeyword(keyword);
    if (!normalized) {
      setSearch({ phase: 'error', results: [], errorKey: 'onboarding.searchErrLength' });
      return;
    }
    ticketRef.current += 1;
    const ticket = ticketRef.current;
    setSearch({ phase: 'loading', results: [], errorKey: null });
    let status = 0;
    let body = null;
    try {
      const res = await fetch(SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ keyword: normalized, lang }),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      status = res.status;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    } catch {
      status = 0;
    }
    // 더 늦게 보낸 검색이 있으면 이 응답은 버린다
    if (ticket !== ticketRef.current) return;
    if (status === 200 && body?.ok === true && Array.isArray(body.results)) {
      const results = body.results.map(pickAddress).filter(Boolean).slice(0, RESULT_LIMIT);
      setSearch({ phase: 'done', results, errorKey: null });
      return;
    }
    setSearch({ phase: 'error', results: [], errorKey: searchErrorKey(status, body) });
  }

  function choose(address) {
    onSelect(address);
    setEditing(false);
    setKeyword('');
    setSearch(IDLE);
    focusRef.current = 'picked';
  }

  function change() {
    setEditing(true);
    focusRef.current = 'input';
  }

  if (!showSearch) {
    return (
      <div className="field onboarding-address">
        <div className="onboarding-picked" role="group" aria-labelledby={captionId} tabIndex={-1} ref={pickedRef}>
          <p className="onboarding-picked-caption" id={captionId}>
            <span>{t('onboarding.selectedAddress')}</span>
            {value.source === 'DEMO' && <Badge kind="demo" label={t('onboarding.demoAddress')} />}
          </p>
          {value.buildingName && (
            <p className="onboarding-picked-main" lang="ko">
              {value.buildingName}
            </p>
          )}
          <p className={value.buildingName ? 'onboarding-picked-sub' : 'onboarding-picked-main'} lang="ko">
            {value.roadAddress}
          </p>
          {value.jibunAddress && <p className="onboarding-picked-sub">{t('onboarding.jibun', { address: value.jibunAddress })}</p>}
          <Button variant="secondary" size="small" onClick={change}>
            {t('onboarding.changeAddress')}
          </Button>
        </div>
      </div>
    );
  }

  let statusText = '';
  if (search.phase === 'loading') statusText = t('onboarding.searching');
  else if (search.phase === 'done') {
    statusText =
      search.results.length > 0
        ? t('onboarding.searchResults', { n: search.results.length })
        : t('onboarding.searchEmpty');
  } else if (search.phase === 'error') statusText = t(search.errorKey);

  return (
    <div className="field onboarding-address">
      <label htmlFor={inputId}>{t('onboarding.addressSearchLabel')}</label>
      <p className="onboarding-hint" id={hintId}>
        {t(HINT_KEY[kind] ?? HINT_KEY.lodging)}
      </p>
      <div className="onboarding-search-row">
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={keyword}
          maxLength={KEYWORD_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            // 바깥 양식이 제출(다음 단계)되지 않게 막고 검색한다
            if (event.key === 'Enter') {
              event.preventDefault();
              void run();
            }
          }}
          aria-invalid={own.length > 0 ? 'true' : undefined}
          aria-describedby={[hintId, statusId, errorId].filter(Boolean).join(' ')}
        />
        <Button size="small" onClick={() => void run()} disabled={search.phase === 'loading'}>
          {t('onboarding.searchButton')}
        </Button>
      </div>
      <p id={statusId} role="status" className={search.phase === 'error' ? 'onboarding-search-status is-error' : 'onboarding-search-status'}>
        {statusText}
      </p>
      {search.results.length > 0 && (
        <ul className="onboarding-results" role="list" aria-label={t('onboarding.searchResultsAria')}>
          {search.results.map((result, index) => (
            <li key={`${result.roadAddress}-${index}`}>
              <button type="button" className="onboarding-result" onClick={() => choose(result)}>
                <span className="onboarding-result-main" lang="ko">
                  {result.buildingName ?? result.roadAddress}
                </span>
                {result.buildingName && (
                  <span className="onboarding-result-sub" lang="ko">
                    {result.roadAddress}
                  </span>
                )}
                {result.jibunAddress && (
                  <span className="onboarding-result-sub">{t('onboarding.jibun', { address: result.jibunAddress })}</span>
                )}
                {result.source === 'DEMO' && <Badge kind="demo" label={t('onboarding.demoAddress')} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <FieldErrors id={errorId} issues={own} />
    </div>
  );
}
