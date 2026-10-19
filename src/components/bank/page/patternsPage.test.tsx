/**
 * The 題型 map: what a first-time teacher sees (intro, a greyed example, where to start),
 * the in-use lists (one per sub-topic, type badges, the questions without one), and the
 * links every 題型 mention becomes (card count, rail heading, fact row, editor row).
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { listPatterns, subTopicTallies } from '@/library/patterns';
import { row } from '@/library/testKit';
import { NO_FILTERS } from '@/library/tabFilters';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import type { UiLanguage } from '@/settings/language';
import { ViewLanguageProvider } from '@/settings/paperLanguage';
import type { PatternRegistry } from '@/storage/patterns';
import { BankRow } from '../BankRow';
import { emptySentence } from '../tabText';
import { coverage } from './bankPage';
import { PatternsPage } from './PatternsPage';
import { TopicCards } from './TopicCards';

const MCQ = createMcqQuestion().type;
const LQ = createStructuredQuestion().type;
const noop = () => {};

function render(ui: UiLanguage, node: ReactNode): string {
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <ViewLanguageProvider value="en">{node}</ViewLanguageProvider>
    </UiLanguageOverride.Provider>,
  );
}

const page = (ui: UiLanguage, rows: ReturnType<typeof row>[], registry: PatternRegistry = { patterns: [] }) =>
  render(
    ui,
    <PatternsPage
      items={listPatterns(rows, registry)}
      tallies={subTopicTallies(rows)}
      hasQuestions={rows.length > 0}
      scope={undefined}
      busy={false}
      onScope={noop}
      onCreate={noop}
      onRename={noop}
      onMerge={noop}
      onDelete={noop}
      onShow={noop}
      onReview={noop}
      onStartNew={noop}
    />,
  );

const unsorted = [
  row({ rootId: 'a', typeId: MCQ, tags: ['C.ped'] }),
  row({ rootId: 'b', typeId: MCQ, tags: ['C.ped'] }),
  row({ rootId: 'c', typeId: LQ, tags: ['C.intervention'] }),
];

describe('the 題型 map, first run', () => {
  it('with no questions: the intro, the greyed example, and a way to start, but no form', () => {
    const out = page('en', []);
    expect(out).toContain('data-patterns-intro');
    expect(out).toContain('question pattern');
    expect(out).toContain('data-patterns-example');
    expect(out).toContain('PED and total revenue');
    expect(out).toContain('Start a classroom worksheet');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('data-patterns-starts');
  });

  it('with questions: where most of them are first, each with Review these and + New 題型 here', () => {
    const out = page('en', unsorted);
    expect(out).toContain('Start where you have the most questions');
    expect(out.indexOf('data-pattern-topic="C.ped"')).toBeLessThan(out.indexOf('data-pattern-topic="C.intervention"'));
    expect(out).toContain('data-patterns-to-sort');
    expect(out).toContain('2 questions<');
    expect(out).toContain('Review these →');
    expect(out).toContain('+ New 題型 here');
    expect(out).toContain('Or name one for any sub-topic');
  });

  it('reads in 中文, with 題目類型 never 題型 for MCQ / LQ', () => {
    const out = page('zh-HK', unsorted);
    expect(out).toContain('從題目最多的子課題開始');
    expect(out).toContain('+ 在此新增題型');
    expect(out).not.toContain('MCQ 題型');
  });
});

describe('the 題型 map, in use', () => {
  const rows = [
    ...unsorted,
    row({ rootId: 'd', typeId: MCQ, tags: ['C.ped', 'C.ped::PED and total revenue'] }),
    row({ rootId: 'e', typeId: LQ, tags: ['C.ped', 'C.ped::PED and total revenue'] }),
  ];
  const registry = { patterns: [{ topic: 'C.ped', typeId: LQ, name: 'Explain TR with a diagram' }] };

  it('lists each sub-topic once, MCQ and LQ in one list with badges, and what is left to sort', () => {
    const out = page('en', rows, registry);
    expect(out).toContain('2 題型 in use · 1 not used yet');
    expect(out.match(/data-pattern-topic="C.ped"/g)).toHaveLength(1);
    expect(out.match(/data-pattern-name="PED and total revenue"/g)).toHaveLength(2);
    expect(out).toContain('data-pattern-type="' + LQ + '"');
    expect(out).toContain('4 questions · 2 without a 題型');
    expect(out).toContain('Not used yet');
    // A sub-topic with questions and no 題型 is listed too: the to-do list.
    expect(out).toContain('data-pattern-topic="C.intervention"');
    expect(out).not.toContain('Start where you have the most questions');
  });
});

describe('every 題型 mention is a link', () => {
  const rows = [row({ rootId: 'd', typeId: MCQ, tags: ['C.ped', 'C.ped::PED and total revenue'] })];

  it('the topic card counts what the map lists (unused too), as a link of its own', () => {
    const items = listPatterns(rows, { patterns: [{ topic: 'C.ped', typeId: MCQ, name: 'Unused one' }] });
    const out = render(
      'en',
      <TopicCards
        coverage={coverage(rows)}
        patterns={new Map([['C', items]])}
        onPatterns={noop}
        onTopic={noop}
        onUntagged={noop}
        onAll={noop}
        onClassGap={noop}
      />,
    );
    expect(out).toContain('2 題型 →');
    // Not nested in the card's own button.
    expect(out).not.toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/);
  });

  it('the editor 題庫 row names its 題型 apart from its topics, as a link when it can filter', () => {
    const plain = render('en', <BankRow row={rows[0]} />);
    expect(plain).toContain('data-row-pattern="PED and total revenue"');
    expect(plain).not.toContain('<button');
    const linked = render('en', <BankRow row={rows[0]} onPattern={noop} />);
    expect(linked).toContain('題型 <button');
  });

  it('the tab’s empty line names the 題型 filter', () => {
    expect(emptySentence({ ...NO_FILTERS, topic: 'C.ped', pattern: 'PED and total revenue' }, undefined, 'en', 'en')).toContain(
      'filed under 題型 “PED and total revenue”',
    );
  });
});
