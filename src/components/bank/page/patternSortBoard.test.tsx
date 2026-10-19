/**
 * The 題型 sort board, as first drawn: a section per sub-topic of the topic, the
 * questions still to sort as cards, the 題型 already there as numbered buckets. Selecting,
 * naming and the keys are checked in a browser (`docs/design/question-types-empty-state.md`).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { listPatterns } from '@/library/patterns';
import { row } from '@/library/testKit';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import type { UiLanguage } from '@/settings/language';
import { levelUp, parseLevel, serializeLevel } from './bankScreen';
import { PatternSortBoard } from './PatternSortBoard';

const MCQ = createMcqQuestion().type;
const LQ = createStructuredQuestion().type;
const noop = () => {};

const rows = [
  row({ rootId: 'a', typeId: MCQ, tags: ['C.ped'], excerpt: { en: 'Price rises from $8 to $10', zh: '價格由 $8 升至 $10' }, languages: ['en', 'zh'] }),
  row({ rootId: 'b', typeId: LQ, marks: 6, hasDiagram: true, tags: ['C.ped'], excerpt: { en: 'Explain the change in TR', zh: '' }, languages: ['en'] }),
  row({ rootId: 'c', typeId: MCQ, tags: ['C.ped', 'C.ped::Calculate PED'], excerpt: { en: 'Sorted one', zh: '' } }),
  row({ rootId: 'd', typeId: MCQ, tags: ['D.structure'], excerpt: { en: 'Another topic', zh: '' } }),
];

const board = (ui: UiLanguage, topic = 'C') =>
  renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <PatternSortBoard
        topic={topic}
        rows={rows}
        items={listPatterns(rows, { patterns: [] })}
        language="en"
        busy={false}
        onSortInto={noop}
        onUnsort={noop}
        onNext={noop}
        onDone={noop}
      />
    </UiLanguageOverride.Provider>,
  );

describe('the 題型 sort board', () => {
  it('shows one topic: its unsorted questions as cards, its 題型 as numbered buckets', () => {
    const out = board('en');
    expect(out).toContain('data-board-section="C.ped"');
    expect(out).not.toContain('data-board-section="D.structure"');
    expect(out).toContain('data-board-card="a"');
    expect(out).toContain('data-board-card="b"');
    expect(out).not.toContain('data-board-card="c"');
    expect(out).toContain('data-board-bucket="Calculate PED"');
    expect(out).toContain('2 not sorted · 1 sorted');
    expect(out).toContain('6 marks');
    expect(out).toContain('Diagram');
    // Nothing selected: no tray, and a bucket says why it cannot be clicked.
    expect(out).not.toContain('data-board-tray');
    expect(out).toContain('Select questions first');
  });

  it('reads in 中文, topic names too', () => {
    const out = board('zh-HK');
    expect(out).toContain('選取相似的題目，然後為它們命名');
    expect(out).toContain('需求價格彈性');
  });

  it('says so when a topic has no sub-topic questions', () => {
    expect(board('en', 'J')).toContain('No question in this topic has a sub-topic yet');
  });
});

describe('the sort board as a bank level', () => {
  it('is kept and read back for a coarse topic only, and goes up to the 題型 map', () => {
    expect(parseLevel(serializeLevel({ kind: 'sort', topic: 'C' }))).toEqual({ kind: 'sort', topic: 'C' });
    expect(parseLevel('{"kind":"sort","topic":"C.ped"}')).toEqual({ kind: 'topics' });
    expect(parseLevel('{"kind":"sort","topic":"Z"}')).toEqual({ kind: 'topics' });
    expect(levelUp({ kind: 'sort', topic: 'C' })).toEqual({ kind: 'patterns' });
  });
});
