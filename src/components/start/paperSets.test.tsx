/**
 * Paper sets on the start screen (k-0299): the frame, the menu entries, the dialogs' picks,
 * and the new-paper form remembering the school.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorksheetSummary } from '@/storage';
import { dashboardEntries, DEFAULT_QUERY, visibleSummaries } from './dashboard';
import { FileDashboard, type DocumentActions } from './FileDashboard';
import { setCandidates } from './SetDialogs';
import { readLastSchool, writeLastSchool } from './startKinds';

const at = (minute: number) => `2026-11-02T08:${String(minute).padStart(2, '0')}:00.000Z`;
const MOCK = { id: 'set-1', name: 'S6 Mock 2026-27' };
const row = (id: string, title: string, minute: number, extra: Partial<WorksheetSummary> = {}): WorksheetSummary => ({
  id,
  title,
  updatedAt: at(minute),
  hasCover: !!extra.paper,
  indexRev: 3,
  ...extra,
});

// Newest first, as the index keeps them.
const ROWS = [
  row('p2', 'S6 Mock Paper 2 2026-27', 9, { paper: 'paper2', set: MOCK }),
  row('unit', 'Unit 3 Demand', 8),
  row('s5', 'S5 Final Paper 1', 7, { paper: 'paper1' }),
  row('p1', 'S6 Mock Paper 1 2026-27', 5, { paper: 'paper1', set: MOCK }),
  row('p2b', 'S5 Final Paper 2', 3, { paper: 'paper2' }),
];

describe('the dashboard shows a set as one unit', () => {
  it('frames the set where its newest paper stands, Paper 1 before Paper 2', () => {
    const entries = dashboardEntries(ROWS, ROWS, ROWS);
    expect(entries.map((entry) => (entry.kind === 'doc' ? entry.summary.id : `set:${entry.group.id}`))).toEqual([
      'set:set-1',
      'unit',
      's5',
      'p2b',
    ]);
    const frame = entries[0];
    expect(frame.kind === 'set' && frame.members.map((m) => m.id)).toEqual(['p1', 'p2']);
    expect(frame.kind === 'set' && frame.elsewhere).toBe(0);
  });

  it('a search that finds one paper shows its whole set', () => {
    const shown = visibleSummaries(ROWS, { ...DEFAULT_QUERY, search: 'Paper 1 2026' });
    expect(shown.map((r) => r.id)).toEqual(['p1']);
    const [frame] = dashboardEntries(shown, ROWS, ROWS);
    expect(frame.kind === 'set' && frame.members.map((m) => m.id)).toEqual(['p1', 'p2']);
  });

  it('in a folder, counts the papers filed elsewhere instead of showing them', () => {
    const inFolder = ROWS.filter((r) => r.id === 'p1');
    const [frame] = dashboardEntries(inFolder, inFolder, ROWS);
    expect(frame.kind === 'set' && frame.members.map((m) => m.id)).toEqual(['p1']);
    expect(frame.kind === 'set' && frame.elsewhere).toBe(1);
  });

  it('a row with a malformed set is an ordinary card', () => {
    const broken = [row('x', 'X', 1, { set: { id: '' } as never }), row('y', 'Y', 0, { set: 'set-1' as never })];
    expect(dashboardEntries(broken, broken, broken).map((e) => e.kind)).toEqual(['doc', 'doc']);
  });
});

const noop = () => {};
const ACTIONS: DocumentActions = {
  open: noop,
  rename: noop,
  duplicate: noop,
  download: noop,
  remove: noop,
  makeSet: noop,
  addToSet: noop,
  leaveSet: noop,
};

describe('the set frame on the grid', () => {
  const markup = renderToStaticMarkup(
    <FileDashboard
      summaries={ROWS}
      loaded
      actions={ACTIONS}
      setActions={{ details: noop, addPapers: noop, ungroup: noop }}
    />,
  );

  it('names the set, says Set and how many papers, and holds both cards', () => {
    const frame = markup.slice(markup.indexOf('data-paper-set="set-1"'));
    const end = frame.indexOf('</ul></div></li>');
    const inside = frame.slice(0, end);
    expect(inside).toContain('S6 Mock 2026-27');
    expect(inside).toContain('Set');
    expect(inside).toContain('2 papers');
    expect(inside).toContain('S6 Mock Paper 1 2026-27');
    expect(inside).toContain('S6 Mock Paper 2 2026-27');
    // Inside the frame a card names its paper, not "Mock exam paper".
    expect(inside.indexOf('Paper 1</span>')).toBeGreaterThan(-1);
    expect(inside).not.toContain('Mock exam paper');
    expect(inside).not.toContain('Unit 3 Demand');
    expect(inside).toContain('Actions for the set S6 Mock 2026-27');
  });

  it('keeps every other document an ordinary card', () => {
    expect(markup).toContain('Unit 3 Demand');
    expect(markup.match(/data-paper-set=/g)).toHaveLength(1);
  });
});

describe('Make a set… picks', () => {
  it('ticks the paper whose name pairs with this one, lists other free exam papers, never a member or a worksheet', () => {
    const s5 = ROWS.find((r) => r.id === 's5')!;
    const { rows, suggested } = setCandidates(ROWS, [s5]);
    expect(rows.map((r) => r.id)).toEqual(['p2b']);
    expect([...suggested]).toEqual(['p2b']);
  });

  it('adding to a set lists free exam papers in set order, suggesting none that only resembles it', () => {
    const free = row('p3', 'S6 Mock Paper 2 2026-27 (copy)', 1, { paper: 'paper2' });
    const pair = row('p1x', 'S6 Mock Paper 1 2026-27 v2', 1, { paper: 'paper1' });
    const { rows, suggested } = setCandidates([...ROWS, free, pair], [ROWS[0], ROWS[3]]);
    // Paper 1s, then Paper 2s, by name; a copy or a renamed version is not suggested.
    expect(rows.map((r) => r.id)).toEqual(['s5', 'p1x', 'p2b', 'p3']);
    expect(suggested.size).toBe(0);
  });
});

describe('the new-paper form remembers the school', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads back what the last exam paper was made with; an emptied box forgets it', () => {
    const map = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
      },
    });
    expect(readLastSchool()).toBe('');
    writeLastSchool('  St Mary College ');
    expect(readLastSchool()).toBe('St Mary College');
    // Never under the documents' prefix.
    expect([...map.keys()]).toEqual(['econgen.lastSchool']);
    writeLastSchool('');
    expect(readLastSchool()).toBe('');
  });

  it('starts empty when storage is blocked', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(readLastSchool()).toBe('');
  });
});

describe('a new mock set (k-0311)', () => {
  it('a set’s paper with no question says Blank on its card', () => {
    const rows = ROWS.map((r) => (r.id === 'p2' ? { ...r, questionCount: 0 } : r));
    const markup = renderToStaticMarkup(<FileDashboard summaries={rows} loaded actions={ACTIONS} />);
    expect(markup.match(/data-blank-paper/g)).toHaveLength(1);
    expect(markup).toContain('Blank, not started');
  });

  it('the New worksheet form offers Just this paper / Mock set on Paper 1 and Paper 2 only', async () => {
    const { NewWorksheetForm } = await import('./NewWorksheetForm');
    for (const type of ['paper1', 'lqMock'] as const) {
      const markup = renderToStaticMarkup(<NewWorksheetForm initialType={type} onCreate={noop} />);
      expect(markup).toContain('Just this paper');
      expect(markup).toContain('Mock set (Paper 1 + Paper 2)');
      // Just this paper is the default.
      expect(markup).toMatch(/aria-checked="true"[^>]*data-make="paper"/);
      expect(markup).not.toContain('data-mock-set-preview');
    }
    for (const type of ['classroom', 'lqWorksheet'] as const) {
      expect(renderToStaticMarkup(<NewWorksheetForm initialType={type} onCreate={noop} />)).not.toContain('data-make=');
    }
  });
});
