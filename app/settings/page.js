'use client';

// /settings — 언어·알림·동의 철회·이 기기에서 내 정보 지우기 (AX-318 · spec 3.1 · 4.13 · 4.17 · 4.19 · 규칙 41)
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
