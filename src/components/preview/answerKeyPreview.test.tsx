import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import v1Corpus from '@/test/corpus/v1-published.json';
import { migrate } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { answerKeyView } from '@/render/answerKey';
import type { RenderNode } from '@/render/ir';
import { AnswerKeyPreview, keepTogetherRuns, keyUnits, runNodes } from './AnswerKeyPreview';

const text = (keepNext?: boolean): RenderNode => ({
  kind: 'text',
  style: 'Body',
  text: { en: [{ text: 'x' }], zh: [] },
  ...(keepNext ? { keepNext } : {}),
});

describe('the Marking scheme view', () => {
  it('cuts the key where Word may break it: after every node that does not keep with the next', () => {
    expect(keepTogetherRuns([text(true), text(), text(), text(true), text(true), text()])).toEqual([
      { from: 0, to: 1 },
      { from: 2, to: 2 },
      { from: 3, to: 5 },
    ]);
    // A trailing keepNext has nothing to keep with: it still closes the last run.
    expect(keepTogetherRuns([text(), text(true)])).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 1 },
    ]);
  });

  it('packs a table that may break between rows row by row, its heading on a sheet it opens', () => {
    const cell = (text: string) => ({
      text: { en: [{ text }], zh: [] },
      colSpan: 1,
      rowSpan: 1,
      align: 'left' as const,
      covered: false,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const table: RenderNode = {
      kind: 'table',
      rows: ['Head', 'a1', 'a2', 'b1'].map((text) => [cell(text)]),
      columnCount: 1,
      columnWidths: [1],
      width: 1,
      indent: 0,
      align: 'left',
      borders: 'all',
      rowHeights: [undefined, undefined, undefined, undefined],
      blockId: 't',
      captionPlacement: 'below',
      headerRows: 1,
      rowKeepNext: [false, true, false, false],
    };
    const units = keyUnits([text(true), table, text()]);
    // The heading keeps with a1, a1 with a2; the text before keeps with the heading.
    expect(units.map((unit) => [unit.index, unit.row, unit.keepNext])).toEqual([
      [0, undefined, true],
      [1, 0, true],
      [1, 1, true],
      [1, 2, false],
      [1, 3, false],
      [2, undefined, false],
    ]);
    const nodes = [text(true), table, text()];
    // The first run: text and the table's first rows, its heading in place; no lead.
    const first = runNodes(nodes, units.slice(0, 4));
    expect((first.nodes[1] as typeof table & { kind: 'table' }).rows.map((r) => r[0].text.en[0].text)).toEqual(['Head', 'a1', 'a2']);
    expect(first.continues).toEqual([false, true]);
    expect(first.lead).toBeUndefined();
    // A run opening mid-table joins the piece above; opening a sheet it shows the heading.
    const later = runNodes(nodes, units.slice(4, 5));
    expect(later.joins).toBe(true);
    expect((later.nodes[0] as typeof table & { kind: 'table' }).rows.map((r) => r[0].text.en[0].text)).toEqual(['b1']);
    expect((later.lead![0] as typeof table & { kind: 'table' }).rows.map((r) => r[0].text.en[0].text)).toEqual(['Head', 'b1']);
    expect((later.head as typeof table & { kind: 'table' }).rows).toHaveLength(1);
    expect(later.continues).toEqual([false]);
  });

  it('draws every node of the key, on sheets inside #print-root, with a page-number footer', () => {
    const worksheet = buildMarkSchemeWorksheet();
    const markup = renderToStaticMarkup(
      <AnswerKeyPreview worksheet={worksheet} language="en" onEdit={() => {}} />,
    );
    expect(markup).toContain('id="print-root"');
    expect(markup).toContain('data-page-index="0"');
    expect(markup).toContain('class="paper paper-shadow');
    expect(markup).toContain('data-band-box="footer"');
    expect(markup).toContain('Taxation — structured question — Answer key');
    expect(markup).toContain('Supply decreases');
    expect(markup).toContain('Level 1: ');
    // Editable in place: the scheme's own text is a textbox; the paper's chrome is absent.
    expect(markup).toContain('role="textbox"');
    expect(markup).not.toContain('data-drag-grip');
    expect(markup).not.toContain('data-bank-ghost');
    // Each entry names its question, so a click selects it for the sidebar.
    expect(markup).toContain(`data-question-id="${worksheet.questions[0].id}"`);
  });

  it('read-only (print preview, a newer file) has no textbox', () => {
    const markup = renderToStaticMarkup(
      <AnswerKeyPreview worksheet={buildMarkSchemeWorksheet()} language="bilingual" />,
    );
    expect(markup).toContain('Supply decreases');
    expect(markup).not.toContain('role="textbox"');
  });

  it('HKEAA style: a "Marks" head on the sheet, a Marks column, the title typed in place', () => {
    const worksheet: Worksheet = {
      ...buildMarkSchemeWorksheet(),
      answerKeyLayout: { preset: 'hkeaa', subtitle: { en: [{ text: 'Form 5' }], zh: [] } },
    };
    const markup = renderToStaticMarkup(<AnswerKeyPreview worksheet={worksheet} language="en" onEdit={() => {}} />);
    expect(markup).toContain('data-band-box="header"');
    expect(markup).toMatch(/data-band-box="header"[^>]*>Marks</);
    expect(markup).toContain('padding-right:54pt');
    expect(markup).toContain('Taxation — structured question — Marking scheme');
    expect(markup).toContain('Form 5');
    // Classic has no head.
    const classic = renderToStaticMarkup(
      <AnswerKeyPreview worksheet={buildMarkSchemeWorksheet()} language="en" onEdit={() => {}} />,
    );
    expect(classic).not.toContain('data-band-box="header"');
  });

  it('opens the frozen v1 corpus', () => {
    const worksheet = migrate(structuredClone(v1Corpus)) as Worksheet;
    const markup = renderToStaticMarkup(
      <AnswerKeyPreview worksheet={worksheet} language="bilingual" onEdit={() => {}} />,
    );
    expect(markup).toContain('id="print-root"');
    const answered = answerKeyView(worksheet, 'bilingual').owners.filter(Boolean);
    expect(answered.length).toBeGreaterThan(0);
    for (const id of new Set(answered)) expect(markup).toContain(`data-question-id="${id}"`);
  });
});
