'use client';

// /settings: 언어·알림·동의 철회·이 기기에서 내 정보 지우기 (AX-318 · docs/platform/IA_AND_FLOWS.md '경로'·'동의 철회와 데이터 삭제', docs/business-rules.md '알림과 카드'·'언어', docs/security.md '민감정보 동의'·'기기 저장소와 계정 이름공간')
// 본문은 components/settings/SettingsScreen.js 에 있다.

import { useLang } from '@/components/LanguageProvider.js';
import SettingsScreen from '@/components/settings/SettingsScreen.js';
import { TopBar } from '@/components/ui/index.js';

export default function SettingsPage() {
  const { t } = useLang();
  return (
    <>
      <TopBar title={t('settings.header')} backHref="/more" />
      <main className="page settings-page is-basement">
        <SettingsScreen />
      </main>
    </>
  );
}
