import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { lookupCode } from '@/syllabus';
import { setResult } from '@/coverage/result';
import { readReportLanguage, REPORT_LANGUAGE_KEY, writeReportLanguage } from '@/coverage/reportLanguagePref';
import { reportFileName } from '@/coverage/reportText';
import type { QuestionResult } from '@/coverage/types';
import { CoverageReportSheets } from './CoverageReportSheets';

/**
 * k-0503 (u-2mvu): the downloaded report's own words follow the teacher's English / 中文
 * pick; syllabus names keep the paper's language.
 */
const result = (number: string, code: string): QuestionResult => ({
  questionId: `Q${number}`,
  number,
  ok: true,
  units: [{ key: `q${number}`, label: '', marks: 2, outside: '', picks: [{ code, w: 2, band: 'apply', conf: 'high', why: '因為。' }] }],
});
const paperIn = (language: 'en' | 'zh') =>
  setResult({ language, title: 'Mock', scope: 'set', at: '2026-11-23T00:00:00Z', pageSize: 'A4' }, [
    { paper: 1, title: 'P1', results: [result('1', 'C.ped')], sent: 1 },
    { paper: 2, title: 'P2', results: [result('1', 'C.ped')], sent: 1 },
  ]);
const ped = lookupCode('C.ped')!.keyPoint;
const sheets = (language: 'en' | 'zh', text?: 'en' | 'zh') => renderToStaticMarkup(<CoverageReportSheets coverage={paperIn(language)} text={text} />);

describe('report language pick (k-0503)', () => {
  it('a Chinese paper in English words: English headings, Chinese syllabus names', () => {
    const html = sheets('zh', 'en');
    expect(html).toContain('Syllabus coverage report');
    expect(html).toContain('Gaps and suggestions');
    expect(html).toContain('Whole set: Paper 1, Paper 2');
    expect(html).toContain('P2 Q1');
    expect(html).toContain(ped.zh);
    expect(html).not.toContain(ped.en);
    expect(html).not.toContain('課程覆蓋報告');
    expect(html).toContain('lang="en"');
  });

  it('an English paper in 中文 words: Chinese headings, English syllabus names', () => {
    const html = sheets('en', 'zh');
    expect(html).toContain('課程覆蓋報告');
    expect(html).toContain('缺口及建議');
    expect(html).toContain('卷二第 1 題');
    expect(html).toContain(ped.en);
    expect(html).not.toContain(ped.zh);
    expect(html).not.toContain('Syllabus coverage report');
    expect(html).toContain('lang="zh-HK"');
  });

  it('without a pick, the words follow the paper as before', () => {
    expect(sheets('zh')).toContain('課程覆蓋報告');
    expect(sheets('en')).toContain('Syllabus coverage report');
  });

  it('the file name follows the words', () => {
    expect(reportFileName('Mock', 'zh')).toBe('Mock 課程覆蓋報告.pdf');
    expect(reportFileName('Mock', 'en')).toBe('Mock - Syllabus coverage.pdf');
  });
});

describe('the last pick is remembered on this device (k-0503)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts on the paper language, then keeps the last pick', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
    expect(readReportLanguage('zh')).toBe('zh');
    writeReportLanguage('en');
    expect(store.get(REPORT_LANGUAGE_KEY)).toBe('en');
    expect(readReportLanguage('zh')).toBe('en');
    store.set(REPORT_LANGUAGE_KEY, 'fr');
    expect(readReportLanguage('zh')).toBe('zh');
  });

  it('blocked storage falls back to the paper language and does not throw', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } });
    expect(readReportLanguage('en')).toBe('en');
    expect(() => writeReportLanguage('zh')).not.toThrow();
  });
});
