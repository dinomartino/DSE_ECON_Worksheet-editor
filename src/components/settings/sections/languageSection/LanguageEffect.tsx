'use client';

import { useEffect } from 'react';
import { useUiLanguage } from '@/i18n/language';
import { applyLanguage } from '@/settings/language';

/** Keeps `<html lang>` in step with the choice (en / zh-HK). */
export function LanguageEffect() {
  const lang = useUiLanguage();
  useEffect(() => applyLanguage(document.documentElement, lang), [lang]);
  return null;
}
