/**
 * Paper sets in the editor (k-0299): the strip under the toolbar, and Export's "Also include"
 * ticking the set's other papers.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { withPaperSet } from '@/model/paperSet';
import type { Worksheet } from '@/model/types';
import type { WorksheetSummary } from '@/storage';
import { setKeyPicks } from './exportSession';
import { keyDocumentChoices } from './KeyDocumentsField';
import { PaperSetBar, stripPapers } from './PaperSetStrip';

const MOCK = { id: 'set-1', name: 'S6 Mock 2026-27' };
const at = (minute: number) => `2026-11-02T08:${String(minute).padStart(2, '0')}:00.000Z`;
const paper2 = (): Worksheet => ({
  ...withPaperSet(createWorksheetFrom({ documentType: 'lqMock', name: 'S6 Mock Paper 2' }), MOCK),
  id: 'p2',
  updatedAt: at(5),
});
const ROWS: WorksheetSummary[] = [
  { id: 'p2', title: 'stale index title', updatedAt: at(4), paper: 'paper2', set: MOCK },
  { id: 'unit', title: 'Unit 3', updatedAt: at(3) },
  { id: 'p1', title: 'S6 Mock Paper 1', updatedAt: at(2), paper: 'paper1', set: MOCK },
  { id: 'other', title: 'S5 Quiz Paper 1', updatedAt: at(1), paper: 'paper1', set: { id: 'set-2', name: 'S5 Quiz' } },
];

describe('the strip lists the set’s papers', () => {
  it('in set order, the open paper as the editor holds it', () => {
    const shown = stripPapers(paper2(), ROWS)!;
    expect(shown.name).toBe('S6 Mock 2026-27');
    expect(shown.papers).toEqual([
      { id: 'p1', title: 'S6 Mock Paper 1', role: 'paper1', current: false },
      { id: 'p2', title: 'S6 Mock Paper 2', role: 'paper2', current: true },
    ]);
  });

  it('shows nothing for a paper in no set', () => {
    expect(stripPapers(createWorksheetFrom({ documentType: 'paper1' }), ROWS)).toBeUndefined();
  });

  it('the newest member names the set', () => {
    const renamed = ROWS.map((row) => (row.id === 'p1' ? { ...row, updatedAt: at(9), set: { ...MOCK, name: 'S6 Mock 2027' } } : row));
    expect(stripPapers(paper2(), renamed)!.name).toBe('S6 Mock 2027');
  });

  it('renders as print-hidden chrome naming the set, the open paper current', () => {
    const shown = stripPapers(paper2(), ROWS)!;
    const markup = renderToStaticMarkup(<PaperSetBar name={shown.name} papers={shown.papers} onOpen={() => {}} />);
    expect(markup).toContain('data-print-hide');
    expect(markup).toContain('S6 Mock 2026-27');
    expect(markup).toMatch(/aria-current="page"[^>]*>Paper 2/);
    expect(markup).toContain('aria-label="Open S6 Mock Paper 1"');
    expect(markup).not.toContain('Only this paper so far');
  });

  it('says when the set holds only this paper, and names twin roles', () => {
    const alone = stripPapers(paper2(), [])!;
    expect(renderToStaticMarkup(<PaperSetBar {...alone} onOpen={() => {}} />)).toContain('Only this paper so far');
    const twins = stripPapers(paper2(), [...ROWS, { id: 'p2c', title: 'S6 Mock Paper 2 old', updatedAt: at(0), paper: 'paper2', set: MOCK }])!;
    const markup = renderToStaticMarkup(<PaperSetBar {...twins} onOpen={() => {}} />);
    expect(markup).toContain('S6 Mock Paper 2 old');
  });
});

describe('Export ticks the set’s other papers', () => {
  it('Paper 1 from Paper 2, never another set’s paper or this one', () => {
    expect(setKeyPicks(paper2(), ROWS)).toEqual([{ id: 'p1', title: 'S6 Mock Paper 1' }]);
    expect(setKeyPicks(createWorksheetFrom({ documentType: 'paper1' }), ROWS)).toEqual([]);
  });

  it('lists the set’s papers first in Also include, then newest first', () => {
    const others = ROWS.filter((row) => row.id !== 'p2');
    expect(keyDocumentChoices(others, '', new Set(['p1'])).map((row) => row.id)).toEqual(['p1', 'unit', 'other']);
    expect(keyDocumentChoices(others, '').map((row) => row.id)).toEqual(['unit', 'p1', 'other']);
  });
});
