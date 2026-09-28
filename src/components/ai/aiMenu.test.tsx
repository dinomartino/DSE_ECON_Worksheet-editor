import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import { presetFor } from '@/ai/providers';
import type { AiStatus } from '@/settings/aiSettings';
import type { AiVerb, VerbContext } from '@/assist/types';
import { withFlow } from '@/test/fixtures';

// A server render reads zustand's initial state; read the live one so setState shows.
vi.mock('@/store/worksheetStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/store/worksheetStore')>();
  const store = real.useWorksheetStore;
  const live = <T,>(select: (s: ReturnType<typeof store.getState>) => T): T => select(store.getState());
  return { ...real, useWorksheetStore: Object.assign(live, store) };
});
vi.mock('@/assist/menuStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/assist/menuStore')>();
  const store = real.useAiMenu;
  const live = <T,>(select: (s: ReturnType<typeof store.getState>) => T): T => select(store.getState());
  return { ...real, useAiMenu: Object.assign(live, store) };
});
const gemini = presetFor('gemini');
let status: AiStatus = { provider: 'gemini', preset: gemini, model: gemini.models[0].id, baseUrl: gemini.baseUrl, configured: false, keyStore: null };
vi.mock('@/settings/aiSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/settings/aiSettings')>()),
  useAiStatus: () => status,
}));

const { useWorksheetStore } = await import('@/store/worksheetStore');
const { useAiMenu } = await import('@/assist/menuStore');
const { registerVerb, resetVerbsForTest } = await import('@/assist/registry');
const { scopeChoices } = await import('@/assist/scope');
const { AiMenu, AiMenuPopover, InputStep } = await import('./AiMenu');
const { AiButton } = await import('./AiButton');
const { highlighted, menuGroups, stepFor, stepHighlight } = await import('./aiMenuModel');

function verb(id: string, over: Partial<AiVerb> = {}): AiVerb {
  return {
    id,
    group: 'translate',
    order: 0,
    needsKey: true,
    label: () => id,
    available: () => ({}),
    run: async () => ({ kind: 'nothing', summary: '' }),
    ...over,
  };
}

const initial = useWorksheetStore.getState();
const q1 = createStructuredQuestion();
q1.blocks = [createParagraphBlock(bi('Explain demand.', ''))];
const worksheet = withFlow(createWorksheet(), [q1]);
const paper = { scope: { kind: 'paper' as const }, scopeLabel: 'Whole paper' };
const ctx = (): VerbContext => ({ worksheet, mode: initial.mode, ...paper });
const render = (open = paper as Parameters<typeof AiMenuPopover>[0]['open']) =>
  renderToStaticMarkup(<AiMenuPopover open={open} />);

beforeEach(() => {
  resetVerbsForTest();
  useWorksheetStore.setState({ worksheet, readOnly: false });
  registerVerb(verb('create.src', { group: 'create', label: () => 'Questions from a source…', input: { kind: 'text', label: 'Paste a source', placeholder: 'An article…', minChars: 200 } }));
  registerVerb(verb('check.terms', { group: 'check', label: () => 'Check terms', needsKey: false, available: () => ({ count: 4, unit: 'terms' }) }));
  registerVerb(verb('fill.zh', { order: 0, label: () => 'Fill missing 中文', available: () => ({ count: 52, unit: 'texts' }), sendsLine: (_c, p) => `Sends 52 texts to ${p} with your key` }));
  registerVerb(verb('fill.en', { order: 1, label: () => 'Fill missing English', available: () => ({ disabledReason: 'Nothing to fill here' }) }));
  registerVerb(verb('retranslate', { order: 2, available: () => null }));
});
afterEach(() => {
  useWorksheetStore.setState(initial, true);
  useAiMenu.getState().close();
  status = { ...status, configured: false };
});

describe('AiMenu', () => {
  it('groups verbs in registry order with sentence-case headings, counts, the free tag, greyed and hidden rows', () => {
    const markup = render();
    const order = ['>Translate<', 'Fill missing 中文', 'Fill missing English', '>Check<', 'Check terms', '>Create<', 'Questions from a source…'];
    const at = order.map((s) => markup.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(markup).toContain('52 texts');
    expect(markup).toMatch(/Check terms<\/span><span[^>]*>free<\/span><span[^>]*>4 terms</);
    expect(markup.match(/>free</g)).toHaveLength(1);
    expect(markup).toMatch(/<button[^>]*aria-disabled="true" title="Nothing to fill here"/);
    expect(markup).not.toContain('retranslate');
  });

  it('highlights the first runnable verb, or the preselected one, with its sends line', () => {
    expect(render()).toContain('Sends 52 texts to Google Gemini with your key');
    const pre = render({ ...paper, preselect: 'check.terms' });
    expect(pre).not.toContain('Sends 52 texts');
    expect(pre).toMatch(/data-verb="check.terms" class="[^"]*bg-surface-hover/);
  });

  it('has a filter field, the provider footer and a Settings link', () => {
    const markup = render();
    expect(markup).toContain('placeholder="Search AI actions…"');
    expect(markup).toContain('Google Gemini · not set up');
    status = { ...status, configured: true };
    expect(render()).toContain('Google Gemini · Gemini 3.5 Flash-Lite');
    expect(render()).toMatch(/>Settings<\/button>/);
  });

  it('says so when nothing is offered, and is absent in a read-only document', () => {
    resetVerbsForTest();
    expect(render()).toContain('Nothing to do for this selection');
    useAiMenu.getState().openMenu(paper);
    useWorksheetStore.setState({ readOnly: true });
    expect(renderToStaticMarkup(<AiMenu />)).toBe('');
  });

  it('offers the opened scope, its question and the whole paper on the chip', () => {
    const block = q1.blocks[0];
    const path = { kind: 'paths' as const, paths: [`questions.${q1.id}.blocks.${block.id}.text`] };
    const choices = scopeChoices(worksheet, { kind: 'block', blockId: block.id, questionId: q1.id });
    expect(choices.map((c) => c.label)).toEqual(['This figure', 'Question 1', 'Whole paper']);
    expect(scopeChoices(worksheet, { kind: 'paper' }).map((c) => c.label)).toEqual(['Whole paper']);
    expect(scopeChoices(worksheet, { kind: 'questions', ids: [q1.id] }).map((c) => c.label)).toEqual(['Question 1', 'Whole paper']);
    expect(scopeChoices(worksheet, path).at(-1)?.label).toBe('Whole paper');
    expect(render({ scope: { kind: 'questions', ids: [q1.id] }, scopeLabel: 'Question 1' })).toMatch(/aria-label="Scope: Question 1"[^>]*>Question 1<svg/);
    // Only the paper: a plain label, no dropdown.
    expect(render()).not.toContain('aria-label="Scope:');
  });
});

describe('the menu model', () => {
  it('filters by label and walks the runnable verbs with ↑ / ↓', () => {
    expect(menuGroups(ctx(), 'TERMS').flatMap((g) => g.rows.map((r) => r.verb.id))).toEqual(['check.terms']);
    const groups = menuGroups(ctx());
    expect(highlighted(groups)).toBe('fill.zh');
    expect(highlighted(groups, 'fill.en', 'check.terms')).toBe('check.terms');
    expect(stepHighlight(groups, 'fill.zh', 1)).toBe('check.terms');
    expect(stepHighlight(groups, 'fill.zh', -1)).toBe('create.src');
  });

  it('swaps to Setup for a key-needing verb without a provider, to the input step, or runs', () => {
    const fill = verb('fill.zh');
    const source = verb('create.src', { input: { kind: 'text', label: 'x', placeholder: '', minChars: 1 } });
    expect(stepFor(fill, false)).toEqual({ kind: 'setup', verbId: 'fill.zh' });
    expect(stepFor(source, false)).toEqual({ kind: 'setup', verbId: 'create.src' });
    expect(stepFor(source, true)).toEqual({ kind: 'input', verbId: 'create.src' });
    expect(stepFor(fill, true)).toBe('run');
    expect(stepFor(verb('check.terms', { needsKey: false }), false)).toBe('run');
  });

  it('the input step counts characters and holds Generate until the minimum', () => {
    const input = { kind: 'text' as const, label: 'Paste a source', placeholder: 'An article…', minChars: 20 };
    const step = (value: string) =>
      renderToStaticMarkup(<InputStep title="Questions from a source…" input={input} value={value} onChange={() => {}} onBack={() => {}} onGenerate={() => {}} />);
    const short = step('Too short');
    expect(short).toContain('Paste a source');
    expect(short).toContain('placeholder="An article…"');
    expect(short).toContain('9 characters · at least 20');
    expect(short).toMatch(/<button[^>]*disabled=""[^>]*>Generate<\/button>/);
    const long = step('A source long enough to use.');
    expect(long).not.toContain('at least');
    expect(long).not.toMatch(/disabled=""[^>]*>Generate/);
    expect(long).toContain('>Back</button>');
  });
});

describe('AiButton', () => {
  it('is "✦ AI" with the untranslated count as a badge, and absent when read-only', () => {
    useWorksheetStore.setState({ mode: { ...initial.mode, language: 'bilingual' } });
    const markup = renderToStaticMarkup(<AiButton />);
    expect(markup).toMatch(/title="AI tools \(Ctrl\+J\) · 1 untranslated"/);
    expect(markup).toMatch(/<svg[^>]*>.*<\/svg><span>AI<\/span><span[^>]*>1<\/span><\/button>$/);
    useWorksheetStore.setState({ mode: { ...initial.mode, language: 'en' } });
    expect(renderToStaticMarkup(<AiButton />)).not.toMatch(/<span>AI<\/span><span/);
    useWorksheetStore.setState({ readOnly: true });
    expect(renderToStaticMarkup(<AiButton />)).toBe('');
  });
});
