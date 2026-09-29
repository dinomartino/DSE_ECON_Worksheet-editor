import { describe, expect, it } from 'vitest';
import { groupRows } from '@/library/group';
import { row } from '@/library/testKit';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import { activeFilters, clearFilter, coverage, DEFAULT_FILTERS, filterRows, hasTopic, traySummary } from './bankPage';
import { levelUp, parseLevel, railOrder, railSections, serializeLevel, suggestTopics, TOPICS_LEVEL, type BankLevel } from './bankScreen';

const MCQ = createMcqQuestion().type;
const LQ = createStructuredQuestion().type;

describe('the review rail by 題型', () => {
  const groups = groupRows([
    row({ rootId: 'none', typeId: MCQ, tags: ['C.ped'] }),
    row({ rootId: 'calc', typeId: MCQ, tags: ['C.ped', 'C.ped::Calculate PED'] }),
    row({ rootId: 'lq', typeId: LQ, tags: ['C.ped', 'C.ped::Calculate PED'] }),
    row({ rootId: 'fac', typeId: MCQ, tags: ['C.ped', 'C.ped::Factors'] }),
    row({ rootId: 'calc2', typeId: MCQ, tags: ['C.ped', 'C.ped::calculate ped'] }),
    row({ rootId: 'pes', typeId: MCQ, tags: ['C.pes'] }),
  ]);

  it('groups a sub-topic by 題型 (MCQ, then LQ), with the questions without one last', () => {
    const sections = railSections(groups, 'C');
    const ped = sections.find((s) => s.key === 'C.ped')!;
    expect(ped.parts!.map((p) => [p.label, p.kind, p.groups.map((g) => g.rootId)])).toEqual([
      ['Calculate PED', 'MCQ', ['calc', 'calc2']],
      ['Factors', 'MCQ', ['fac']],
      ['Calculate PED', 'LQ', ['lq']],
      ['No 題型', undefined, ['none']],
    ]);
    // Reading order follows the parts, so ↑ ↓ walk what the rail shows.
    expect(ped.groups.map((g) => g.rootId)).toEqual(['calc', 'calc2', 'fac', 'lq', 'none']);
    expect(railOrder(sections).map((g) => g.rootId)).toEqual(['calc', 'calc2', 'fac', 'lq', 'none', 'pes']);
    // A sub-topic with no 題型 at all is not split.
    expect(sections.find((s) => s.key === 'C.pes')!.parts).toBeUndefined();
  });

  it('inside one sub-topic too; never in the coarse sections of All questions', () => {
    expect(railSections(groups, 'C.ped')[0].parts).toHaveLength(4);
    expect(railSections(groups, 'all').every((s) => s.parts === undefined)).toBe(true);
  });
});

describe('the 題型 filter', () => {
  const rows = [
    row({ rootId: 'a', typeId: MCQ, tags: ['C.ped', 'C.ped::Factors'] }),
    row({ rootId: 'b', typeId: LQ, tags: ['C.ped', 'C.ped::Factors'] }),
    row({ rootId: 'c', typeId: MCQ, tags: ['C.ped'] }),
  ];
  const pattern = { topic: 'C.ped', typeId: MCQ, name: 'factors' };

  it('keeps the questions of that type carrying it, and names itself', () => {
    const filters = { ...DEFAULT_FILTERS, topic: 'C.ped', pattern };
    expect(filterRows(rows, filters).map((r) => r.rootId)).toEqual(['a']);
    expect(activeFilters(filters).map((f) => f.label)).toContain('題型 factors');
    expect(clearFilter(filters, 'pattern').pattern).toBeUndefined();
  });
});

describe('a 題型 is not a topic', () => {
  it('does not tag a question, fill a coverage bar, join the tray mix or get suggested', () => {
    const only = row({ rootId: 'x', tags: ['C.ped::Orphan'] });
    expect(hasTopic(only)).toBe(false);
    const cover = coverage([only, row({ rootId: 'y', tags: ['C.ped', 'C.ped::Factors'] })]);
    expect(cover.untagged).toBe(1);
    expect(cover.bars.find((bar) => bar.code === 'C')!.total).toBe(1);
    expect(traySummary([row({ tags: ['C.ped', 'C.ped::Factors'] })]).mix.map((m) => m.code)).toEqual(['C.ped']);
    const target = row({ docId: 'd', rootId: 't', number: 2 });
    expect(suggestTopics(target, [row({ docId: 'd', rootId: 'u', number: 1, tags: ['C.ped', 'C.ped::Factors'] })])).toEqual(['C.ped']);
  });
});

describe('the 題型 level', () => {
  it('round-trips, scoped or not, and goes up to the topics', () => {
    for (const level of [{ kind: 'patterns' }, { kind: 'patterns', topic: 'C' }, { kind: 'patterns', topic: 'C.ped' }] as BankLevel[]) {
      expect(parseLevel(serializeLevel(level))).toEqual(level);
    }
    expect(parseLevel('{"kind":"patterns","topic":"Z.nope"}')).toEqual({ kind: 'patterns' });
    expect(levelUp({ kind: 'patterns' })).toEqual(TOPICS_LEVEL);
  });
});
