import { describe, expect, it, vi } from 'vitest';
import { AiError } from '@/ai/types';
import { presetFor } from '@/ai/providers';
import type { BiText } from '@/model/types';
import type { JobResult, RunDeps, RunDepsResult } from '@/translate/types';
import { canApplyFill, fillButton, runFieldFill, SETUP_IN_SETTINGS_TITLE, type FieldFillDeps } from './fieldFill';

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
    expect(out).toEqual({ kind: 'filled', value: { en: [{ text: 'There are ' }], zh: sent.zh }, note: 'Filled' });
  });

  it('names an auto-fixed term in the result line', async () => {
    const sent = t('Supply falls', '');
    const { deps } = fakeDeps(job({ runs: [{ text: '供應減少' }], fixes: [{ from: '供給', to: '供應', how: 'autoFix' }] }));
    const out = await runFieldFill(sent, 'zh', { kind: 'schemePoint' }, () => sent, signal(), deps);
    expect(out).toMatchObject({ kind: 'filled', note: 'Filled · 供給 → 供應 (EDB)' });
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
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), none.deps)).toEqual({ kind: 'noProvider' });
    expect(none.translateOne).not.toHaveBeenCalled();

    const failed = fakeDeps(job({ status: 'failed' }));
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), failed.deps)).toMatchObject({ kind: 'failed' });

    const info = { kind: 'badKey' as const, provider: 'custom' as const, message: 'Bad key.', fatal: true, actions: [] };
    const thrown = fakeDeps(new AiError(info));
    expect(await runFieldFill(sent, 'zh', { kind: 'answer' }, () => sent, signal(), thrown.deps)).toEqual({
      kind: 'failed',
      message: 'Bad key.',
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
