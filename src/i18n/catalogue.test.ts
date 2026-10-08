import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defineMessages, localize, resolveMessages } from './catalogue';
import { calendarDate, relativeTime } from './format';
import { UiLanguageOverride, useMessages } from './language';
import { LANGUAGE_BOOT_SCRIPT, LANGUAGE_SETTINGS } from '@/settings/language';

const M = defineMessages({
  save: { en: 'Save', zh: '儲存' },
  count: { en: (n: number) => (n === 1 ? '1 graph' : `${n} graphs`), zh: (n: number) => `${n} 個圖表` },
});

describe('catalogues', () => {
  it('resolves one language, keeping function entries callable', () => {
    const en = resolveMessages(M, 'en');
    const zh = resolveMessages(M, 'zh-HK');
    expect(en.save).toBe('Save');
    expect(en.count(1)).toBe('1 graph');
    expect(zh.save).toBe('儲存');
    expect(zh.count(3)).toBe('3 個圖表');
    expect(resolveMessages(M, 'en')).toBe(en);
  });

  it('types require both languages and one signature per entry', () => {
    defineMessages({
      // @ts-expect-error no zh
      a: { en: 'A' },
    });
    defineMessages({
      // @ts-expect-error zh takes fewer arguments than en
      b: { en: (n: number) => `${n}`, zh: () => '' },
    });
    defineMessages({
      // @ts-expect-error zh is a string where en is a function
      c: { en: (n: number) => `${n}`, zh: '' },
    });
    const ok = resolveMessages(M, 'en');
    // @ts-expect-error count takes a number
    void ok.count('x');
  });

  it('localizes plain strings and entries', () => {
    expect(localize('Plain', 'zh-HK')).toBe('Plain');
    expect(localize(M.save, 'zh-HK')).toBe('儲存');
  });

  it('useMessages is English unless the setting or an override says otherwise', () => {
    const Probe = () => createElement('span', null, useMessages(M).save);
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>Save</span>');
    const zh = createElement(UiLanguageOverride.Provider, { value: 'zh-HK' }, createElement(Probe));
    expect(renderToStaticMarkup(zh)).toBe('<span>儲存</span>');
  });
});

describe('language setting', () => {
  it('defaults to English and accepts only en / zh-HK', () => {
    expect(LANGUAGE_SETTINGS.defaults({ desktop: false })).toEqual({ ui: 'en', paper: 'en' });
    expect(LANGUAGE_SETTINGS.fields.ui('zh-HK')).toBe('zh-HK');
    expect(LANGUAGE_SETTINGS.fields.ui('zh-CN')).toBeUndefined();
  });

  it('boot script sets <html lang> only for a stored zh-HK, and never throws', () => {
    const boot = (stored: string | null | (() => never)) => {
      const root = { lang: 'en' };
      const localStorage = { getItem: () => (typeof stored === 'function' ? stored() : stored) };
      new Function('document', 'localStorage', LANGUAGE_BOOT_SCRIPT)({ documentElement: root }, localStorage);
      return root.lang;
    };
    expect(boot(JSON.stringify({ v: 1, ui: 'zh-HK' }))).toBe('zh-HK');
    expect(boot(JSON.stringify({ v: 1, ui: 'en' }))).toBe('en');
    expect(boot('{not json')).toBe('en');
    expect(boot(() => { throw new Error('blocked'); })).toBe('en');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  it('keeps the English wording', () => {
    expect(relativeTime('2026-09-24T11:59:30Z', now, 'en')).toBe('just now');
    expect(relativeTime('2026-09-24T11:55:00Z', now, 'en')).toBe('5 minutes ago');
    expect(relativeTime('2026-09-23T12:00:00Z', now, 'en')).toBe('yesterday');
  });
  it('speaks Hong Kong Chinese', () => {
    expect(relativeTime('2026-09-24T11:59:30Z', now, 'zh-HK')).toBe('剛剛');
    expect(relativeTime('2026-09-24T11:55:00Z', now, 'zh-HK')).toBe('5 分鐘前');
    expect(relativeTime('2026-09-23T12:00:00Z', now, 'zh-HK')).toBe('昨日');
    expect(relativeTime('2026-09-21T12:00:00Z', now, 'zh-HK')).toBe('3 日前');
    expect(relativeTime('nonsense', now, 'zh-HK')).toBe('不明');
  });
});

describe('calendarDate', () => {
  it('reads the digits in either language, and passes anything else through', () => {
    expect(calendarDate('2026-09-04', 'en')).toBe('4 September 2026');
    expect(calendarDate('2026-09-04', 'zh-HK')).toBe('2026年9月4日');
    expect(calendarDate('2026-13-01', 'en')).toBe('2026-13-01');
    expect(calendarDate(undefined, 'zh-HK')).toBeUndefined();
  });
});
