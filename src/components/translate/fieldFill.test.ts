import { describe, expect, it, vi } from 'vitest';
import { AiError } from '@/ai/types';
import { presetFor } from '@/ai/providers';
import type { BiText } from '@/model/types';
import type { TermCheck } from '@/glossary/types';
import type { JobResult, RunDeps, RunDepsResult } from '@/translate/types';
import {
  afterNoProvider,
  canApplyFill,
  fillButton,
  runFieldFill,
  SETUP_IN_SETTINGS_TITLE,
  switchButton,
  type FieldFillDeps,
} from './fieldFill';

const t = (en: string, zh: string): BiText => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const base = { translate: { kind: 'answer' as const }, language: 'bilingual' as const, readOnly: false, needs: 'zh' as const };

describe('fillButton', () => {
  it('is hidden without the translate prop, when nothing needs filling, read-only or one box shown', () => {
    const on = { ...base, configured: true, modalOpen: false };
    expect(fillButton({ ...on, translate: undefined })).toEqual({ show: false });
    expect(fillButton({ ...on, needs: null })).toEqual({ show: false });
    expect(fillButton({ ...on, readOnly: true })).toEqual({ show: false });
    expect(fillButton({ ...on, language: 'zh' })).toEqual({ show: false });
    expect(fillButton(on)).toEqual({ show: true, side: 'zh', action: 'fill', label: 'Fill 中文' });
    expect(fillButton({ ...on, needs: 'en' })).toMatchObject({ action: 'fill', label: 'Fill English' });
  });

  it('without a provider, deep-links only when no modal layer is open', () => {
    expect(fillButton({ ...base, configured: false, modalOpen: false })).toMatchObject({
      action: 'setup',
      label: 'Set up translation…',
    });
    expect(fillButton({ ...base, configured: false, modalOpen: true })).toEqual({
      show: true,
      side: 'zh',
      action: 'blocked',
      label: 'Fill 中文',
      title: SETUP_IN_SETTINGS_TITLE,
    });
  });
});

describe('canApplyFill', () => {
  it('writes only over the same source and a still-empty target', () => {
    const sent = t('Supply falls', '');
    expect(canApplyFill(sent, sent, 'zh')).toBe(true);
    expect(canApplyFill(t('Supply falls', ' \n'), sent, 'zh')).toBe(true);
    expect(canApplyFill(t('Supply rises', ''), sent, 'zh')).toBe(false);
    expect(canApplyFill(t('Supply falls', '供應'), sent, 'zh')).toBe(false);
  });
});

describe('runFieldFill', () => {
  const preset = presetFor('custom');
  const runDeps: RunDeps = {
    client: { complete: () => Promise.reject(new Error('unused')), listModels: async () => [] },
    preset,
    model: 'm',
    glossary: null,
  };
  const ready: RunDepsResult = {
    ok: true,
    deps: runDeps,
    config: { provider: 'custom', apiKey: 'k', model: 'm', baseUrl: 'http://localhost' },
  };
  const job = (over: Partial<JobResult>): JobResult => ({
    key: 't1', status: 'ready', issues: [], terms: [], fixes: [], passes: 1, defaultAccepted: true, ...over,
  });
  const fakeDeps = (result: JobResult | Error, resolved: RunDepsResult = ready) => {
    const translateOne = vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
    return { deps: { createRunDeps: () => Promise.resolve(resolved), translateOne } as FieldFillDeps, translateOne };
  };
  const signal = () => new AbortController().signal;

  it('passes the field kind and wording side, and writes the result over the latest value', async () => {
    const sent = t('', '本卷共有');
    const { deps, translateOne } = fakeDeps(job({ runs: [{ text: 'There are ' }], fixes: [] }));
    const out = await runFieldFill(sent, 'en', { kind: 'wording', aroundValue: 'before' }, () => sent, signal(), deps);
    expect(translateOne).toHaveBeenCalledWith(sent, 'toEn', { kind: 'wording', aroundValue: 'before' }, runDeps, expect.anything());
    expect(out).toEqual({ kind: 'filled', value: { en: [{ text: 'There are ' }], zh: sent.zh }, note: 'Filled', tone: 'ok' });
  });

  it('names an auto-fixed term in the result line', async () => {
    const sent = t('Supply falls', '');
    const { deps } = fakeDeps(job({ runs: [{ text: '供應減少' }], fixes: [{ from: '供給', to: '供應', how: 'autoFix' }] }));
    const out = await runFieldFill(sent, 'zh', { kind: 'schemePoint' }, () => sent, signal(), deps);
    expect(out).toMatchObject({ kind: 'filled', note: 'Filled · 供給 → 供應 (EDB)' });
  });

  const term = (over: Partial<TermCheck>): TermCheck => ({
    entryId: 1, en: 'supply', source: { text: 'Supply', start: 0, end: 6 }, state: 'ok', severity: 'none', expected: '供應', ...over,
  });

  it('credits only a glossary auto-fix to the EDB, by its source term', async () => {
    const sent = t('Supply falls', '');
    const autoFixed = fakeDeps(job({
      runs: [{ text: '供應減少' }],
      terms: [term({})],
      fixes: [{ from: '繁體', to: '繁體', how: 'simplified' }, { from: '供給', to: '供應', how: 'autoFix' }],
    }));
    expect(await runFieldFill(sent, 'zh', { kind: 'schemePoint' }, () => sent, signal(), autoFixed.deps)).toMatchObject({
      kind: 'filled', note: 'Filled · supply → 供應 (EDB)', tone: 'ok',
    });
    const simplified = fakeDeps(job({ runs: [{ text: '供應減少' }], fixes: [{ from: '供应', to: '供應', how: 'simplified' }] }));
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), simplified.deps)).toMatchObject({
      kind: 'filled', note: 'Filled', tone: 'ok',
    });
  });

  it('never writes a result the review would leave unticked (a reversed term)', async () => {
    const sent = t('elastic demand', '');
    const conflict = term({
      en: 'elastic demand', expected: '高彈性需求', state: 'missing', severity: 'warn',
      conflict: { form: '低彈性需求', meansEn: 'inelastic demand' },
    });
    const latest = vi.fn(() => sent);
    const { deps } = fakeDeps(job({ status: 'flagged', runs: [{ text: '低彈性需求' }], terms: [conflict], defaultAccepted: false }));
    const out = await runFieldFill(sent, 'zh', { kind: 'answer' }, latest, signal(), deps);
    expect(out).toEqual({
      kind: 'needsLook',
      runs: [{ text: '低彈性需求' }],
      note: 'Not filled: 低彈性需求 means “inelastic demand” (elastic demand, EDB: 高彈性需求)',
    });
  });

  it('writes a flagged result the review would tick, with a warning instead of a tick', async () => {
    const sent = t('Supply **falls**', '');
    const issue = { code: 'emphasis' as const, severity: 'warn' as const, message: 'Bold text was lost.' };
    const { deps } = fakeDeps(job({ status: 'flagged', runs: [{ text: '供應減少' }], issues: [issue] }));
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), deps)).toMatchObject({
      kind: 'filled', note: 'Filled · check: Bold text was lost.', tone: 'warn',
    });
  });

  it('carries the missing-provider reason and offers DeepSeek and Qwen on a region error', async () => {
    const sent = t('Supply falls', '');
    const error = { kind: 'denied' as const, message: 'Keychain access was denied.' };
    const denied = fakeDeps(job({}), { ok: false, provider: 'deepseek', reason: 'secretError', error });
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), denied.deps)).toEqual({
      kind: 'noProvider', provider: 'deepseek', reason: 'secretError', error,
    });
    const region = { kind: 'region' as const, provider: 'gemini' as const, message: 'No.', fatal: true, actions: ['switchProvider' as const] };
    const thrown = fakeDeps(new AiError(region));
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), thrown.deps)).toEqual({
      kind: 'failed', message: 'No.', switchTo: ['deepseek', 'qwen'],
    });
  });

  it('writes nothing when the field changed while translating', async () => {
    const sent = t('Supply falls', '');
    const { deps } = fakeDeps(job({ runs: [{ text: '供應減少' }] }));
    const typedMeanwhile = await runFieldFill(sent, 'zh', { kind: 'answer' }, () => t('Supply falls', '供'), signal(), deps);
    expect(typedMeanwhile).toEqual({ kind: 'stale' });
    const sourceEdited = await runFieldFill(sent, 'zh', { kind: 'answer' }, () => t('Supply rises', ''), signal(), deps);
    expect(sourceEdited).toEqual({ kind: 'stale' });
  });

  it('reports no provider, a failed row and a thrown AiError without rejecting', async () => {
    const sent = t('Supply falls', '');
    const none = fakeDeps(job({}), { ok: false, provider: 'gemini', reason: 'noKey' });
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), none.deps)).toEqual({
      kind: 'noProvider',
      provider: 'gemini',
      reason: 'noKey',
    });
    expect(none.translateOne).not.toHaveBeenCalled();

    const failed = fakeDeps(job({ status: 'failed' }));
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), failed.deps)).toMatchObject({ kind: 'failed' });

    const info = { kind: 'badKey' as const, provider: 'custom' as const, message: 'Bad key.', fatal: true, actions: [] };
    const thrown = fakeDeps(new AiError(info));
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), thrown.deps)).toEqual({
      kind: 'failed',
      message: 'Bad key.',
      switchTo: [],
    });
  });

  it('is cancelled, not written, after an abort', async () => {
    const sent = t('Supply falls', '');
    const controller = new AbortController();
    const { deps } = fakeDeps(job({ runs: [{ text: '供應減少' }] }));
    controller.abort();
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, controller.signal, deps)).toEqual({ kind: 'cancelled' });
  });
});

describe('switchButton', () => {
  it('switches with a saved key, else deep-links — never over a modal', () => {
    expect(switchButton('deepseek', true, true)).toMatchObject({ label: 'Use DeepSeek', action: 'switch' });
    expect(switchButton('qwen', false, false)).toMatchObject({ label: 'Use Qwen', action: 'setup' });
    expect(switchButton('qwen', false, true)).toMatchObject({ action: 'blocked', title: SETUP_IN_SETTINGS_TITLE });
  });
});

describe('afterNoProvider', () => {
  it('deep-links with the reason from a panel, and only explains over a modal', () => {
    const noKey = { kind: 'noProvider' as const, provider: 'qwen' as const, reason: 'noModel' as const };
    expect(afterNoProvider(noKey, false)).toEqual({ open: { provider: 'qwen', reason: 'noModel' } });
    expect(afterNoProvider(noKey, true)).toEqual({ line: SETUP_IN_SETTINGS_TITLE });
    const error = { kind: 'denied' as const, message: 'Keychain access was denied.' };
    expect(afterNoProvider({ ...noKey, reason: 'secretError', error }, true)).toEqual({ line: 'Keychain access was denied.' });
  });
});
