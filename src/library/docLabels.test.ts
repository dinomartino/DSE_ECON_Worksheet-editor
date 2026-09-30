import { describe, expect, it } from 'vitest';
import { dayOf, distinctDocLabels } from './docLabels';
import { row } from './testKit';

describe('distinctDocLabels', () => {
  it('leaves a title no other document shares as it is', () => {
    const labels = distinctDocLabels([row({ docId: 'a', docTitle: 'Mock 2026 Paper 1' }), row({ docId: 'b', docTitle: 'Quiz' })]);
    expect(labels.get('a')).toBe('Mock 2026 Paper 1');
    expect(labels.get('b')).toBe('Quiz');
  });

  it('adds the day to two papers of one title, ignoring case and spacing', () => {
    const labels = distinctDocLabels([
      row({ docId: 'a', docTitle: 'Quiz', usedOn: '2025-11-03' }),
      row({ docId: 'a', docTitle: 'Quiz', usedOn: '2025-11-03' }),
      row({ docId: 'b', docTitle: ' quiz ', usedOn: '2026-03-12T09:00:00.000Z' }),
    ]);
    expect(labels.get('a')).toBe('Quiz · 3 Nov 2025');
    expect(labels.get('b')).toBe('quiz · 12 Mar 2026');
  });

  it('then the classes, then a number, until no two read alike', () => {
    const labels = distinctDocLabels([
      row({ docId: 'a', docTitle: 'Quiz', usedOn: '2026-03-12', classes: ['5A'] }),
      row({ docId: 'b', docTitle: 'Quiz', usedOn: '2026-03-12', classes: ['5B', '5C'] }),
      row({ docId: 'c', docTitle: 'Quiz', usedOn: '2026-01-01' }),
    ]);
    expect(labels.get('a')).toBe('Quiz · 12 Mar 2026 · 5A');
    expect(labels.get('b')).toBe('Quiz · 12 Mar 2026 · 5B, 5C');
    expect(labels.get('c')).toBe('Quiz · 1 Jan 2026');
    const twins = distinctDocLabels([
      row({ docId: 'y', docTitle: 'Quiz', usedOn: '2026-03-12' }),
      row({ docId: 'x', docTitle: 'Quiz', usedOn: '2026-03-12' }),
    ]);
    expect(twins.get('x')).toBe('Quiz · 12 Mar 2026 · (1)');
    expect(twins.get('y')).toBe('Quiz · 12 Mar 2026 · (2)');
  });

  it('reads a date it cannot parse as none', () => {
    expect(dayOf('nonsense')).toBe('');
    const labels = distinctDocLabels([row({ docId: 'a', docTitle: 'Quiz', usedOn: 'x' }), row({ docId: 'b', docTitle: 'Quiz', usedOn: 'y' })]);
    expect([labels.get('a'), labels.get('b')]).toEqual(['Quiz · (1)', 'Quiz · (2)']);
  });
});
