/** The AI check's row in words (k-0501, user u-2ywo): every finished run says what it did. Invented outcomes. */
import { describe, expect, it } from 'vitest';
import { GEMINI_REGION_MESSAGE } from '@/ai/errors';
import type { AiErrorInfo } from '@/ai/types';
import { localizedErrorMessage } from '@/components/ai/errorCopy';
import type { AiCheckOutcome } from './ai';
import { aiBarLabel, aiReport, aiTiming, type AiRun } from './aiSummary';
import { checkMessages } from './text';
import type { ImportFinding } from './types';

const en = checkMessages('en');
const zh = checkMessages('zh');
const time = () => '14:32';
const why = (lang: 'en' | 'zh-HK') => (e: AiErrorInfo) => localizedErrorMessage(e, lang);

const outcome = (o: Partial<AiCheckOutcome> = {}): AiCheckOutcome => ({
  findings: [],
  total: 30,
  failed: 0,
  stopped: false,
  done: 30,
  checked: { questions: 30, options: 96, statements: 8, pictures: 4, tables: 2, marks: 0 },
  dropped: 0,
  ms: 41000,
  ...o,
});
const done = (o: Partial<AiCheckOutcome> = {}): Extract<AiRun, { state: 'done' }> => ({ state: 'done', at: 0, outcome: outcome(o) });
const finding = (issue: string, fix = false): ImportFinding => ({
  id: `ai:${issue}`,
  kind: 'ai',
  q: 0,
  place: '',
  params: { text: 'x', issue },
  ...(fix ? { fix: { op: { op: 'setMarks', q: 'Q', owner: { owner: 'question' }, marks: 2, expect: null } } } : {}),
  safe: false,
  from: 'ai',
} as ImportFinding);
const region: AiErrorInfo = { kind: 'region', provider: 'gemini', message: GEMINI_REGION_MESSAGE, fatal: true, actions: [] };

describe('a finished AI check in words', () => {
  it('nothing found: says so plainly, with when, what it checked and what it looked for', () => {
    const r = aiReport(en, done(), time, why('en'));
    expect(r.tone).toBe('ok');
    expect(r.headline).toBe('AI checked the whole paper (30 questions) at 14:32: no problems found');
    expect(r.lines[0]).toBe('Checked: 30 questions · 96 MC options · 8 statements · 4 pictures and diagrams · 2 tables');
    expect(r.lines[1]).toMatch(/^Looked for missing or garbled words.*none found\.$/);
    expect(r.lines).toContain('Pictures and diagrams are checked for their place only: the AI does not see the image.');
    const z = aiReport(zh, done(), time, why('zh-HK'));
    expect(z.headline).toBe('AI 已於 14:32 檢查整份試卷（30 條題目）：沒有發現問題');
    expect(z.lines[0]).toBe('檢查了：30 條題目、96 個 MC 選項、8 句陳述、4 張圖片或圖表、2 個表格');
  });

  it('findings: counts them by issue, and how many carry a fix', () => {
    const r = aiReport(en, done({ findings: [finding('garbled', true), finding('garbled'), finding('marks', true)], dropped: 1 }), time, why('en'));
    expect(r.tone).toBe('found');
    expect(r.headline).toBe('AI checked the whole paper (30 questions) at 14:32: 3 things to look at, listed below');
    expect(r.lines[1]).toBe('Found: garbled words (2) · marks (1) · 2 with a fix to apply');
    expect(r.lines).toContain('1 more suggestion was left out: it named nothing on this paper.');
  });

  it('some questions failed: says how many were checked, how many not, and why', () => {
    const timeout: AiErrorInfo = { kind: 'timeout', provider: 'openai', message: 'x took too long', fatal: false, actions: [] };
    const r = aiReport(en, done({ done: 25, failed: 5, lastError: timeout }), time, why('en'));
    expect(r.tone).toBe('warn');
    expect(r.headline).toBe('AI checked 25 of 30 questions at 14:32: no problems found in those');
    expect(r.lines).toContain('Could not check 5 questions: x took too long. Ask again to retry.');
  });

  it('nothing came back: the reason is the headline, in the interface language (Gemini without a VPN)', () => {
    const r = aiReport(en, done({ done: 0, fatal: region, findings: [] }), time, why('en'));
    expect(r).toMatchObject({ tone: 'failed', headline: `AI check failed: ${GEMINI_REGION_MESSAGE}`, lines: ['The rule check above still stands.'] });
    const z = aiReport(zh, done({ done: 0, fatal: region }), time, why('zh-HK'));
    expect(z.headline.startsWith('AI 檢查失敗：')).toBe(true);
    expect(z.headline).not.toContain('VPN and try');
    expect(aiReport(en, done({ done: 0, failed: 30 }), time, why('en')).headline).toBe(`AI check failed: ${en.aiUnreadable}`);
  });

  it('it never started (no key): fails with the reason', () => {
    const noKey: AiErrorInfo = { kind: 'notConfigured', provider: 'openai', message: 'Add your OpenAI key in Settings → AI.', fatal: true, actions: [] };
    const r = aiReport(en, { state: 'failed', at: 0, error: noKey }, time, why('en'));
    expect(r.headline).toBe('AI check failed: Add your OpenAI key in Settings → AI.');
  });

  it('stopped: how far it got', () => {
    expect(aiReport(en, done({ done: 10, stopped: true }), time, why('en')).headline).toBe('AI check stopped: 10 of 30 questions checked');
  });
});

describe('while it runs', () => {
  const run = (d: number): Extract<AiRun, { state: 'running' }> => ({ state: 'running', done: d, total: 30, batches: 6, concurrency: 2, startedAt: 0 });
  it('a rough guess before the first batch, then its own pace', () => {
    expect(aiTiming(en, run(0), 3000)).toBe('0:03 so far · usually about 45 s in all');
    expect(aiTiming(en, run(10), 20000)).toBe('0:20 so far · about 40 s left');
    expect(aiTiming(zh, run(10), 20000)).toBe('已用 0:20 · 約剩 40 秒');
  });

  it('the bar button tells the state at a glance', () => {
    expect(aiBarLabel(en, { state: 'idle' })).toBe('✦ AI check');
    expect(aiBarLabel(en, { state: 'connecting' })).toBe('✦ AI connecting…');
    expect(aiBarLabel(en, run(5))).toBe('✦ AI checking 5/30');
    expect(aiBarLabel(en, done())).toBe('✦ AI: no problems');
    expect(aiBarLabel(en, done({ findings: [finding('garbled')] }))).toBe('✦ AI: 1 to look at');
    expect(aiBarLabel(en, done({ done: 0, fatal: region }))).toBe('✦ AI check failed');
  });
});
