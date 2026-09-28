import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { presetFor } from '@/ai/providers';
import type { AiErrorInfo, ProviderId } from '@/ai/types';
import { emptyGlossary } from '@/glossary/load';
import { rt } from '@/model/text';
import type { TextSlot } from '@/model/textSlots';
import type { AiStatus } from '@/settings/aiSettings';
import type { TermRow, TranslationPlan } from '@/translate/types';
import { PAPER_REQUEST, counts, fakePlan, job, result, reviewRun, seeded } from './sessionFixtures';
import type { TranslateView } from './SetupPanel';
import { TranslateDialog } from './TranslateDialog';
import type { TranslateController } from './translateController';
import type { TranslateSession } from './translateSession';

const actions = new Proxy({}, { get: () => () => {} }) as TranslateController;

const status = (configured = true, provider: ProviderId = 'gemini'): AiStatus => {
  const preset = presetFor(provider);
  return { provider, preset, model: preset.models[0]?.id ?? '', baseUrl: preset.baseUrl, configured, keyStore: null };
};

const setupPlan = (): TranslationPlan => ({
  ...fakePlan([job('t1', 'Supply falls.'), job('t2', 'Demand rises.')]),
  counts: counts({ toZh: 43, toEn: 3, teacher: 12, diagramLabels: 9, symbols: { toZh: 6, toEn: 0 }, contextLines: 6, requests: 2 }),
});

const view = (over: Partial<TranslateView> = {}): TranslateView => ({
  status: status(),
  desktop: false,
  plan: setupPlan(),
  probe: setupPlan(),
  scopeChoices: [{ scope: { kind: 'paper' }, label: 'Whole paper' }],
  glossary: null,
  glossaryFailed: false,
  ...over,
});

const render = (session: TranslateSession, v: TranslateView = view(), termRows: TermRow[] | null = null) =>
  renderToStaticMarkup(<TranslateDialog session={session} view={v} actions={actions} termRows={termRows} />);

/** `<li data-row="key">…</li>` for one review row. */
const row = (markup: string, key: string) => markup.match(new RegExp(`<li[^>]*data-row="${key}"[^>]*>.*?</li>`, 's'))?.[0] ?? '';

/** The rejected dock: no text field of any kind in a review or check screen. */
function expectNoEditable(markup: string) {
  expect(markup).not.toMatch(/<textarea/);
  expect(markup).not.toMatch(/contenteditable/i);
  expect(markup).not.toMatch(/<input(?![^>]*type="(checkbox|radio)")[^>]*>/);
}

describe('Translate dialog · Setup', () => {
  it('shows live counts, the provider, the privacy line and the glossary credit', () => {
    const markup = render(seeded());
    for (const text of [
      'Fill the missing language. Nothing changes until you insert.',
      'English → 中文',
      '中文 → English',
      'Answers, mark schemes and alt text (teacher version)',
      'Diagram labels',
      'Numbers and symbols → 中文 (copied as they are)',
      'For a 中文-only paper. In EN+中 they would print twice.',
      'Google Gemini',
      'Gemini 3.5 Flash-Lite',
      'Change…',
      'Sends these 46 texts, plus 6 already-translated lines from the same questions for context, from this browser to Google Gemini with your key.',
      presetFor('gemini').privacy.replace(/'/g, '&#x27;'),
      'Terms: EDB Economics glossary (2020)',
      'Translate 46',
      'Check terms',
    ]) {
      expect(markup).toContain(text);
    }
    // "Replace existing" is only for a question, selection, path or block.
    expect(markup).not.toContain('Also replace existing');
  });

  it('lists only scopes that exist, and locks Replace existing for a re-translate', () => {
    const request = { ...PAPER_REQUEST, scope: { kind: 'questions' as const, ids: ['Q3'] }, retranslate: 'zh' as const };
    const plan = { ...setupPlan(), counts: { ...setupPlan().counts, replaceable: 38 } };
    const markup = render(
      seeded({ request, scope: request.scope, options: { ...seeded().options!, retranslate: 'zh' } }),
      view({
        plan,
        probe: plan,
        scopeChoices: [
          { scope: { kind: 'paper' }, label: 'Whole paper' },
          { scope: request.scope, label: 'Question 3' },
        ],
      }),
    );
    expect(markup).toContain('Whole paper');
    expect(markup).toMatch(/<input type="radio"[^>]*checked=""[^>]*>Question 3/);
    const replace = markup.match(/<label[^>]*>(?:(?!<\/label>).)*Also replace existing 中文.*?<\/label>/s)?.[0] ?? '';
    expect(replace).toMatch(/<input type="checkbox"[^>]*disabled=""[^>]*checked=""/);
    expect(replace).toContain('38');
  });

  it('counts the glossary terms the sources will follow; says so when the glossary fails', () => {
    const glossary = {
      ...emptyGlossary(),
      matchEn: (text: string) => (text.includes('Supply') ? [{ entryId: 1, start: 0, end: 6, viaAbbreviation: false }] : []),
    };
    expect(render(seeded(), view({ glossary }))).toContain('1 economics term will follow the EDB glossary.');
    expect(render(seeded(), view({ glossaryFailed: true }))).toContain('Terminology check unavailable');
    expect(render(seeded())).not.toContain('will follow the EDB glossary');
  });

  it('a local provider says nothing leaves the computer', () => {
    const markup = render(seeded(), view({ status: status(true, 'ollama') }));
    expect(markup).toContain('Sent to Ollama on this computer. Nothing leaves it.');
    expect(markup).not.toContain('with your key');
  });

  it('with no provider: the three set-up buttons, the Hong Kong note, and Check terms', () => {
    const markup = render(seeded(), view({ status: status(false) }));
    for (const text of ['Set up Gemini', 'Set up DeepSeek', 'Set up Qwen', 'Check terms works without a key →', 'Close']) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain('In Hong Kong, Google doesn&#x27;t offer Gemini&#x27;s key or API: use DeepSeek or Qwen.');
    expect(markup).not.toContain('Translate 46');
  });

  it('nothing to fill; only symbols to fill (no AI needed)', () => {
    const none = { ...setupPlan(), counts: counts() };
    expect(render(seeded(), view({ plan: none, probe: none }))).toContain('Every text has both English and 中文.');
    const symbols = { ...setupPlan(), counts: counts({ symbols: { toZh: 6, toEn: 0 } }) };
    const markup = render(seeded(), view({ plan: symbols, probe: symbols, status: status(false) }));
    expect(markup).toContain('6 numbers and symbols can be copied as they are — no AI needed.');
    expect(markup).toContain('Copy 6');
  });
});

describe('Translate dialog · Running', () => {
  const running = (over: Partial<TranslateSession> = {}) =>
    seeded({
      phase: 'running',
      run: { ...reviewRun(), results: new Map() },
      progress: { phase: 'checking', requestsDone: 1, requestsTotal: 2 },
      ...over,
    });

  it('shows the texts, the request steps and the phase, with Stop', () => {
    const markup = render(running());
    expect(markup).toContain('Translating 4 texts with Google Gemini…');
    expect(markup).toContain('1 of 2 requests');
    expect(markup).toContain('Checking terms…');
    expect(markup).toMatch(/scale:0.5 1/);
    expect(markup).toMatch(/>Stop<\/button>/);
    expect(markup).not.toContain('Change…');
  });

  it('says what it is waiting for', () => {
    const markup = render(running({ progress: { phase: 'waiting', requestsDone: 0, requestsTotal: 1, waitMs: 12000 } }));
    expect(markup).toContain('Waiting for Google Gemini&#x27;s rate limit (12 s)');
  });

  it('a first close only asks', () => {
    const markup = render(running({ confirm: { kind: 'stop' } }));
    expect(markup).toContain('Stop translating? Finished rows are kept.');
    expect(markup).toContain('Keep going');
  });
});

describe('Translate dialog · Review', () => {
  const review = (over: Partial<TranslateSession> = {}) => seeded({ phase: 'review', run: reviewRun(), ...over });

  it('heads with the run, filters by state and offers Insert with the ticked count', () => {
    const markup = render(review());
    expect(markup).toContain('English → 中文 · 4 texts · Gemini 3.5 Flash-Lite · 11 s');
    for (const text of ['All 4', 'Needs a look 2', 'Couldn&#x27;t translate 1', 'QUESTION 3', 'Insert 2', 'Retry failed', 'Back']) {
      expect(markup.toUpperCase()).toContain(text.toUpperCase());
    }
    expect(markup).toContain('Edit any line on the page after inserting.');
  });

  it('ticks follow the policy; a failed row has no checkbox; notes only on rows that are not ok', () => {
    const markup = render(review());
    expect(row(markup, 't1')).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(row(markup, 't1')).not.toContain('data-note');
    expect(row(markup, 't2')).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(row(markup, 't2')).toContain('Term fixed: 供給 → 供應 (EDB)');
    expect(row(markup, 't3')).toMatch(/type="checkbox"/);
    expect(row(markup, 't3')).not.toMatch(/checked=""/);
    expect(row(markup, 't3')).toContain('Meaning reversed? 低彈性需求 is “inelastic demand”');
    expect(row(markup, 't3')).toContain('data-note="warn"');
    expect(row(markup, 't4')).not.toContain('type="checkbox"');
    expect(row(markup, 't4')).toContain('Couldn&#x27;t translate this text safely (lost the subscript).');
    expect(row(markup, 't2')).toContain('lang="zh-HK"');
  });

  it('dock guard: review has no editable element', () => {
    expectNoEditable(render(review()));
    expectNoEditable(render(review({ filter: 'look' })));
  });

  it('renders proposed text as text, never markup', () => {
    const r = reviewRun();
    const results = new Map(r.results);
    results.set('t1', result('t1', '<script>alert(1)</script><img src=x onerror=alert(1)>'));
    const markup = render(review({ run: { ...r, results } }));
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<img');
    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('draws formatting, blanks and breaks from the runs', () => {
    const r = reviewRun();
    const results = new Map(r.results);
    results.set('t1', result('t1', '', { runs: [{ text: '舉出' }, { text: '兩個', bold: true }, { text: '    ', underline: true }, { text: '\nP' }, { text: '1', vertAlign: 'subscript' }] }));
    const markup = row(render(review({ run: { ...r, results } })), 't1');
    expect(markup).toContain('<span class="font-semibold">兩個</span>');
    expect(markup).toContain('<span class="underline underline-offset-2">    </span>');
    expect(markup).toContain('<br/>P<sub>1</sub>');
  });

  it('shows duplicates, re-translations, the stopped note and copied symbols', () => {
    const r = reviewRun();
    const dup = job('t1', 'Price ($)', { where: 'Question 3 · Stem', slots: [...r.plan.jobs.get('t1')!.slots, { path: 'q:Q3/x', side: 'zh', sourceSnapshot: rt('Price ($)'), targetSnapshot: [] }] });
    const redo = job('t2', 'Supply decreases.', { where: 'Question 3 · (b)', replacing: true, slots: [{ path: 'q:Q3/t2', side: 'zh', sourceSnapshot: rt('Supply decreases.'), targetSnapshot: rt('供給減少') }] });
    const copies = [{ path: 'q:Q3/c', side: 'zh' as const, sourceSnapshot: rt('E₀'), targetSnapshot: [], next: rt('E₀') }];
    const plan = fakePlan([dup, redo, ...[...r.plan.jobs.values()].slice(2)], copies);
    const markup = render(review({ run: { ...r, plan, stopped: true } }));
    expect(markup).toContain('title="Appears 2 times in this scope"');
    expect(markup).toContain('×2');
    expect(row(markup, 't2')).toMatch(/line-through[^>]*>.*供給減少/s);
    expect(markup).toContain('Stopped · 3 of 4 translated');
    expect(markup.toUpperCase()).toContain('NUMBERS AND SYMBOLS · COPIED AS THEY ARE (1)');
    expect(markup).toContain('Insert 3');
    expect(markup).toContain('Retry failed');
  });

  it('closing with rows pending asks; all-stale shows Nothing inserted', () => {
    expect(render(review({ confirm: { kind: 'discard', then: 'close' } }))).toContain('Discard 3 translations?');
    const stale = render(review({ nothingInserted: true }));
    expect(stale).toContain('Nothing inserted — these texts changed while translating.');
    expect(stale).not.toContain('Insert ');
  });

  it('without a provider, nothing can be re-sent', () => {
    expect(render(review(), view({ status: status(false) }))).not.toContain('Retry failed');
  });

  it('after a Stop, the unsent rest can be sent', () => {
    const r = reviewRun();
    const results = new Map(r.results);
    results.delete('t3');
    expect(render(review({ run: { ...r, results, stopped: true } }))).toContain('Translate the other 2');
  });
});

describe('Translate dialog · Error', () => {
  const REGION: AiErrorInfo = {
    kind: 'region',
    provider: 'gemini',
    status: 400,
    message: "Google's Gemini API doesn't serve your location.",
    detail: '400 FAILED_PRECONDITION: User location is not supported for the API use. <b>x</b>',
    fatal: true,
    actions: ['switchProvider', 'retry'],
  };
  const errored = (over: Partial<TranslateSession> = {}) =>
    seeded({ phase: 'error', error: REGION, run: { ...reviewRun(), results: new Map([['t1', result('t1', '政府')]]) }, ...over });

  it('region: says whose rule it is and offers the Hong Kong providers', () => {
    const markup = render(errored());
    for (const text of [
      'Google&#x27;s Gemini API doesn&#x27;t serve your location.',
      'This is Google&#x27;s rule for Hong Kong, not a problem with your key.',
      'Use DeepSeek',
      'Use Qwen',
      'Both work from Hong Kong.',
      'Technical detail',
      'Review the 1 finished',
      'Try again',
      'Open Settings',
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('shows only the actions the error names', () => {
    const quota: AiErrorInfo = { ...REGION, kind: 'quota', message: 'Google Gemini’s limit was reached.', detail: undefined, actions: ['useFallbackModel', 'switchProvider'] };
    const markup = render(errored({ error: quota, run: { ...reviewRun(), results: new Map() } }));
    expect(markup).toContain('Switch to gemini-3.5-flash-lite');
    expect(markup).toContain('Switch provider…');
    expect(markup).not.toContain('Use DeepSeek');
    expect(markup).not.toContain('Try again');
    expect(markup).not.toContain('Review the');
    expect(markup).not.toContain('Technical detail');
  });

  it('closing with finished rows asks first', () => {
    expect(render(errored({ confirm: { kind: 'discard', then: 'close' } }))).toContain('Discard 1 translation?');
  });
});

describe('Translate dialog · Check terms', () => {
  const check = (over: Partial<TermRow['checks'][number]> = {}): TermRow['checks'][number] => ({
    entryId: 1,
    en: 'supply',
    source: { text: 'Supply', start: 0, end: 6 },
    state: 'missing',
    severity: 'warn',
    expected: '供應',
    found: { text: '供給', start: 0, end: 2, rank: 0 },
    ...over,
  });
  const slot = (label: string, target?: TextSlot['target']) =>
    ({ group: { kind: 'question', id: 'Q1', label }, target }) as unknown as TextSlot;
  const rows: TermRow[] = [
    {
      path: 'q:Q1/stem',
      slot: slot('Question 1'),
      en: rt('Supply falls, so the price rises.'),
      zh: rt('供給下降，價格上升。'),
      checks: [check({ fix: { start: 0, end: 2, to: '供應', kind: 'deny', denyKind: 'wrong' } })],
    },
    {
      path: 'q:Q2/stem',
      slot: slot('Question 2'),
      en: rt('Show the deadweight loss.'),
      zh: rt('標示無謂損失。'),
      checks: [check({ en: 'deadweight loss', expected: '效率損失', state: 'not-preferred', severity: 'note', found: { text: '無謂損失', start: 2, end: 6, rank: 1 }, fix: { start: 2, end: 6, to: '效率損失', kind: 'lowerRank' } })],
    },
    {
      path: 'q:Q4/stem',
      slot: slot('Question 4', { kind: 'questionStem', questionId: 'Q4' } as unknown as TextSlot['target']),
      en: rt('Demand is inelastic.'),
      zh: rt('需求缺乏彈性。'),
      checks: [check({ en: 'inelastic demand', expected: '低彈性需求', found: { text: '需求缺乏彈性', start: 0, end: 6, rank: 0 } })],
    },
  ];
  const checking = () => seeded({ mode: 'check' });

  it('loading, unavailable and nothing-to-fix states', () => {
    expect(render(checking())).toContain('Loading the glossary…');
    expect(render(checking(), view({ glossaryFailed: true }))).toContain('Terminology check unavailable');
    expect(render(checking(), view(), [])).toContain('No term differs from the EDB glossary.');
    expect(render(checking())).toContain('Compare the Chinese with the EDB Economics glossary. No key needed.');
  });

  it('wrong forms pre-ticked with a preview; lower ranks and manual finds grouped apart', () => {
    const markup = render(checking(), view(), rows);
    expect(markup).toContain('1 to fix · 1 acceptable but not the first choice · 1 to check by hand');
    expect(markup).toMatch(/type="checkbox"[^>]*checked=""/);
    expect(markup).toContain('→ 供應下降，價格上升。');
    expect(markup).toContain('Acceptable, not the first choice (1)');
    expect(markup).toContain('Can&#x27;t fix automatically (1)');
    expect(markup).toContain('Replace 1 term');
    expect(markup).toContain('Terms: EDB (2020)');
  });

  it('dock guard: Check terms has no editable element', () => {
    expectNoEditable(render(checking(), view(), rows));
  });
});

