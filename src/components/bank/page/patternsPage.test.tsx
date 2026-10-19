/**
 * The 題型 map: what a first-time teacher sees (where the library stands, the topics to
 * start sorting, an example), the in-use lists (one per sub-topic, type badges, the
 * questions not sorted) without a row per sub-topic, and the links every 題型 mention
 * becomes (card count, rail heading, fact row, editor row).
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { listPatterns, sortProgress, subTopicTallies } from '@/library/patterns';
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
      progress={sortProgress(rows)}
      hasQuestions={rows.length > 0}
      scope={undefined}
      busy={false}
      onScope={noop}
      onCreate={noop}
      onRename={noop}
      onMerge={noop}
      onDelete={noop}
      onShow={noop}
      onSort={noop}
      onStartNew={noop}
    />,
  );

const unsorted = [
  row({ rootId: 'a', typeId: MCQ, tags: ['C.ped'] }),
  row({ rootId: 'b', typeId: MCQ, tags: ['C.ped'] }),
  row({ rootId: 'c', typeId: LQ, tags: ['C.intervention'] }),
];

describe('the 題型 map, nothing named yet', () => {
  it('with no questions: the heading, a way to start and the example, but no form or sort', () => {
    const out = page('en', []);
    expect(out).toContain('Sort your questions into 題型');
    expect(out).toContain('data-patterns-intro');
    expect(out).toContain('data-patterns-example');
    expect(out).toContain('Start a classroom worksheet');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('data-patterns-starts');
    expect(out).not.toContain('data-patterns-summary');
  });

  it('with questions: where the library stands, then topic cards, most to sort first, one primary', () => {
    const rows = [...unsorted, row({ rootId: 'f', typeId: MCQ, tags: ['D.structure'] })];
    const out = page('en', rows);
    expect(out).toContain('4 questions · none sorted yet');
    expect(out).toContain('Pick a topic to start');
    expect(out.indexOf('data-pattern-start="C"')).toBeLessThan(out.indexOf('data-pattern-start="D"'));
    expect(out).toContain('3 to sort · 2 sub-topics');
    expect(out).toContain('Sort C →');
    expect(out.match(/bg-cta text-on-cta/g)).toHaveLength(1);
    // The example shows the three shapes of a name, not a list to adopt, and is not greyed.
    expect(out).toContain('計算需求價格彈性');
    expect(out).toContain('Elastic demand → a price rise cuts TR');
    expect(out).not.toContain('border-dashed');
    // The 40-option sub-topic form is gone: naming happens on the board.
    expect(out).not.toContain('<select');
  });

  it('reads in 中文, topic names too, with 題目類型 never 題型 for MCQ / LQ', () => {
    const out = page('zh-HK', unsorted);
    expect(out).toContain('把題目分成不同題型');
    expect(out).toContain('選一個課題開始');
    expect(out).toContain('市場與價格');
    expect(out).not.toContain('Market and Price');
    expect(out).not.toContain('MCQ 題型');
  });
});

describe('the 題型 map, in use', () => {
  const rows = [
    ...unsorted,
    row({ rootId: 'd', typeId: MCQ, tags: ['C.ped', 'C.ped::PED and total revenue'] }),
    row({ rootId: 'e', typeId: LQ, tags: ['C.ped', 'C.ped::PED and total revenue'] }),
    row({ rootId: 'g', typeId: MCQ, tags: ['D.structure'] }),
    row({ rootId: 'h', typeId: MCQ, tags: ['A.scarcity'] }),
    row({ rootId: 'i', typeId: MCQ, tags: ['B.ownership'] }),
    row({ rootId: 'j', typeId: MCQ, tags: ['E.efficiency'] }),
  ];
  const registry = { patterns: [{ topic: 'C.ped', typeId: LQ, name: 'Explain TR with a diagram' }] };

  it('lists each sub-topic with 題型 once, MCQ and LQ in one list with badges, and what is left to sort', () => {
    const out = page('en', rows, registry);
    expect(out).toContain('9 questions · 2 sorted · 2 題型');
    expect(out.match(/data-pattern-topic="C.ped"/g)).toHaveLength(1);
    expect(out.match(/data-pattern-name="PED and total revenue"/g)).toHaveLength(2);
    expect(out).toContain('data-pattern-type="' + LQ + '"');
    expect(out).toContain('4 questions · 2 not sorted');
    // A name no question carries yet leads to the board, not to a grey "not used".
    expect(out).toContain('Sort into it →');
    expect(out).not.toContain('Not used yet');
  });

  it('never a row per sub-topic: a topic’s others on one line, other topics on one line', () => {
    const out = page('en', rows, registry);
    expect(out).toContain('data-patterns-to-sort="C"');
    expect(out).toContain('data-pattern-topic="C.intervention"');
    expect(out).toContain('data-patterns-other');
    expect(out).not.toContain('data-pattern-topic="D.structure"');
    expect(out).toContain('data-patterns-keep-going');
    expect(out).not.toContain('Pick a topic to start');
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
