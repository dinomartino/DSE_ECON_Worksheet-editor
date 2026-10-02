import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import {
  ANSWER_KEY_PRESETS,
  hasAnswerKeyChanges,
  normalizeAnswerKeyLayout,
  resetAnswerKeyLayout,
  resolveAnswerKeyLayout,
  withAnswerKeyPreset,
  withAnswerKeySetting,
  withAnswerKeyText,
} from './answerKeyLayout';
import { applyDeleteTarget, applyEditTarget } from './edits';
import { createWorksheet } from './factories';
import { migrate, serializeWorksheet } from './migrations';
import { bi } from './text';
import type { AnswerKeyLayout, Worksheet } from './types';

/** Save → load, through the same path the storage layer takes. */
const roundTrip = (worksheet: Worksheet): Worksheet =>
  migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));

describe('answer key layout: stored as deltas', () => {
  it('reads an absent field as Classic, and Classic as the key before layouts existed', () => {
    expect(resolveAnswerKeyLayout(undefined)).toEqual({ preset: 'classic', ...ANSWER_KEY_PRESETS.classic });
    expect(ANSWER_KEY_PRESETS.classic).toMatchObject({ mcLayout: 'grid', lqLayout: 'compact', showStems: false });
  });

  it('a preset sets every setting; a change after it is one delta', () => {
    const hkeaa = withAnswerKeyPreset(undefined, 'hkeaa');
    expect(hkeaa).toEqual({ preset: 'hkeaa' });
    expect(resolveAnswerKeyLayout(hkeaa)).toMatchObject({ mcLayout: 'hkeaaTable', lqLayout: 'marksColumn' });

    const changed = withAnswerKeySetting(hkeaa, 'showStems', true);
    expect(changed).toEqual({ preset: 'hkeaa', showStems: true });
    expect(hasAnswerKeyChanges(changed)).toBe(true);
    // Set back by hand: no delta left.
    expect(withAnswerKeySetting(changed, 'showStems', false)).toEqual({ preset: 'hkeaa' });
  });

  it('Classic with nothing changed stores nothing at all', () => {
    expect(withAnswerKeyPreset({ preset: 'hkeaa', showLegend: false }, 'classic')).toBeUndefined();
    expect(withAnswerKeySetting(undefined, 'mcLayout', 'grid')).toBeUndefined();
  });

  it('choosing a preset and resetting keep the title and subtitle', () => {
    const title = bi('Mock', '模擬試');
    const stored: AnswerKeyLayout = { preset: 'hkeaa', showStems: true, title, subtitle: bi('', '') };
    expect(withAnswerKeyPreset(stored, 'classic')).toEqual({ title, subtitle: bi('', '') });
    expect(resetAnswerKeyLayout(stored)).toEqual({ preset: 'hkeaa', title, subtitle: bi('', '') });
    expect(hasAnswerKeyChanges(resetAnswerKeyLayout(stored))).toBe(false);
  });

  it('unknown presets and layouts print as Classic, and are kept for the build that wrote them', () => {
    const newer = { preset: 'omrSheet', mcLayout: 'bubbles', lqLayout: 'boxes', showStems: true };
    const resolved = resolveAnswerKeyLayout(newer as unknown as AnswerKeyLayout);
    expect(resolved).toMatchObject({ preset: 'classic', mcLayout: 'grid', lqLayout: 'compact', showStems: true });
    expect(normalizeAnswerKeyLayout(newer)).toEqual(newer);
  });

  it('garbage never crashes the load, and loses only what is malformed', () => {
    for (const garbage of [null, 3, 'hkeaa', [], true]) {
      expect(normalizeAnswerKeyLayout(garbage)).toBeUndefined();
      expect(resolveAnswerKeyLayout(garbage as unknown as AnswerKeyLayout).preset).toBe('classic');
    }
    expect(
      normalizeAnswerKeyLayout({ preset: 7, showLegend: 'yes', title: 'Mock', subtitle: { en: 'x' }, paperTotal: true }),
    ).toEqual({ paperTotal: true });
  });
});

describe('answer key layout: persistence', () => {
  it('survives save → reload (KNOWN_KEYS)', () => {
    const worksheet: Worksheet = {
      ...createWorksheet(),
      answerKeyLayout: { preset: 'hkeaa', showStems: true, title: bi('Key', '答案'), subtitle: bi('5A', '5A') },
    };
    const loaded = roundTrip(worksheet);
    expect(loaded.answerKeyLayout).toEqual(worksheet.answerKeyLayout);
    expect(loaded.__unknown).toBeUndefined();
  });

  it('a garbage field is dropped on load and the document still opens', () => {
    const raw = { ...serializeWorksheet(createWorksheet()), answerKeyLayout: 'nonsense' };
    const loaded = migrate(raw);
    expect(loaded.answerKeyLayout).toBeUndefined();
    expect(loaded.questions).toEqual([]);
  });

  it('the frozen v1 corpus loads with no layout, so it prints Classic', () => {
    const loaded = migrate(JSON.parse(JSON.stringify(v1Corpus)));
    expect(loaded.answerKeyLayout).toBeUndefined();
    expect(Object.keys(serializeWorksheet(loaded))).not.toContain('answerKeyLayout');
  });
});

describe('answer key title and subtitle edits', () => {
  it('an emptied title is no override; a subtitle stays until deleted', () => {
    const base = createWorksheet();
    const titled = applyEditTarget(base, { kind: 'answerKeyTitle' }, bi('Mock key', ''));
    expect(titled.answerKeyLayout).toEqual({ title: bi('Mock key', '') });
    expect(applyEditTarget(titled, { kind: 'answerKeyTitle' }, bi('', '')).answerKeyLayout).toBeUndefined();

    const sub = applyEditTarget(base, { kind: 'answerKeySubtitle' }, bi('', ''));
    expect(sub.answerKeyLayout).toEqual({ subtitle: bi('', '') });
    expect(applyDeleteTarget(sub, { kind: 'answerKeySubtitle' }).answerKeyLayout).toBeUndefined();
    expect('answerKeyLayout' in applyDeleteTarget(sub, { kind: 'answerKeySubtitle' })).toBe(false);
  });

  it('text overrides are presentation only and do not touch other fields', () => {
    expect(withAnswerKeyText({ preset: 'hkeaa' }, 'subtitle', bi('a', 'b'))).toEqual({
      preset: 'hkeaa',
      subtitle: bi('a', 'b'),
    });
  });
});

describe('Suggested answers and Detailed table', () => {
  it('each preset resolves to its own settings', () => {
    expect(resolveAnswerKeyLayout({ preset: 'suggested' })).toMatchObject({
      preset: 'suggested',
      lqLayout: 'answers',
      showLegend: false,
      showDisclaimer: false,
      showSources: false,
      showStems: true,
      showMcStems: false,
      showExplanations: true,
      showRationales: false,
      showPartMarks: true,
      schemeAsPoints: true,
    });
    expect(resolveAnswerKeyLayout({ preset: 'detailed' })).toMatchObject({
      preset: 'detailed',
      mcLayout: 'rationaleTable',
      lqLayout: 'table',
      showDisclaimer: true,
      showRationales: true,
      questionTotals: true,
    });
    // Classic is unchanged by the new switches.
    expect(resolveAnswerKeyLayout(undefined)).toEqual({ preset: 'classic', ...ANSWER_KEY_PRESETS.classic });
  });

  it('a setting the preset fixes ignores what is stored, stores nothing and is no change', () => {
    const stale = {
      preset: 'suggested',
      lqLayout: 'marksColumn',
      showLegend: true,
      showDisclaimer: true,
      showSources: true,
    } as AnswerKeyLayout;
    expect(resolveAnswerKeyLayout(stale)).toMatchObject({
      lqLayout: 'answers',
      showLegend: false,
      showDisclaimer: false,
      showSources: false,
    });
    expect(hasAnswerKeyChanges(stale)).toBe(false);
    expect(withAnswerKeySetting({ preset: 'suggested' }, 'showLegend', true)).toEqual({ preset: 'suggested' });
    expect(withAnswerKeySetting(stale, 'showSources', true)).not.toHaveProperty('showSources');
    // The same key is the teacher's to set in a preset that leaves it open.
    expect(withAnswerKeySetting({ preset: 'detailed' }, 'showLegend', true)).toEqual({
      preset: 'detailed',
      showLegend: true,
    });
    // Switches only Suggested answers reads are fixed elsewhere.
    expect(resolveAnswerKeyLayout({ schemeAsPoints: true } as AnswerKeyLayout).schemeAsPoints).toBe(false);
    // Choosing another preset leaves nothing stale behind.
    expect(withAnswerKeyPreset({ ...stale, schemeAsPoints: false }, 'hkeaa')).toEqual({ preset: 'hkeaa' });
  });

  it('round-trips through save and load, the new switches included', () => {
    const worksheet = {
      ...createWorksheet(),
      answerKeyLayout: { preset: 'suggested', showMcStems: true, schemeAsPoints: false, showPartMarks: false },
    } as Worksheet;
    expect(roundTrip(worksheet).answerKeyLayout).toEqual(worksheet.answerKeyLayout);
    const table = { ...createWorksheet(), answerKeyLayout: { preset: 'detailed', mcLayout: 'grid' } } as Worksheet;
    expect(roundTrip(table).answerKeyLayout).toEqual(table.answerKeyLayout);
  });
});
