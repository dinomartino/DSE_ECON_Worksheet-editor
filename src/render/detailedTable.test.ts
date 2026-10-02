import { describe, expect, it } from 'vitest';
import { buildAnswerKeyDocxParts } from '@/export/docx';
import { answerKeyClipboardHtml } from '@/export/clipboard';
import { createAnswerDiagram, createMcqQuestion } from '@/model/factories';
import { bi, plain } from '@/model/text';
import type { AnswerKeyLayout, LanguageMode, StructuredQuestion, Worksheet } from '@/model/types';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { buildLeakWorksheet } from '@/test/suggestedAnswersFixture';
import { withFlow } from '@/test/fixtures';
import { answerKeyRunningHead, answerKeyTitle, renderAnswerKey } from './answerKey';
import type { RenderNode, TableNode } from './ir';

const tables = (nodes: RenderNode[]) => nodes.filter((node): node is TableNode => node.kind === 'table');
const row = (table: TableNode, index: number) => table.rows[index].map((cell) => plain(cell.text.en));
const detailed = (worksheet: Worksheet, layout: AnswerKeyLayout = {}): Worksheet => ({
  ...worksheet,
  answerKeyLayout: { preset: 'detailed', ...layout },
});

describe('Detailed table: long questions', () => {
  const key = (language: LanguageMode = 'en', layout: AnswerKeyLayout = {}) =>
    renderAnswerKey(detailed(buildMarkSchemeWorksheet(), layout), language);

  it('is Question | Answer | Marks | Guidance, its heading repeating on every page', () => {
    const [first] = tables(key());
    expect(row(first, 0)).toEqual(['Question', 'Answer', 'Marks', 'Guidance']);
    expect(first.headerRows).toBe(1);
    // It breaks between rows: every row says whether it keeps with the next.
    expect(first.rowKeepNext).toHaveLength(first.rows.length);
    expect(first.rowKeepNext![0]).toBe(true);
    // Text at the top of each cell, as a long answer reads.
    expect(first.rows[1].every((cell) => cell.vAlign === 'top')).toBe(true);
    expect(plain(answerKeyTitle(detailed(buildMarkSchemeWorksheet())).en)).toBe(
      'Taxation — structured question — Mark scheme',
    );
  });

  it('labels each part in full, a point a row with its mark, the group’s rules in Guidance', () => {
    const [rest] = tables(key());
    const rows = rest.rows.map((cells) => cells.map((cell) => plain(cell.text.en)));
    const at = (label: string) => rows.findIndex((cells) => cells[0] === label);
    // (b) only heads its sub-parts: its label rides on (b)(i)'s first row.
    expect(at('1(b)')).toBe(-1);
    const i = at('1(b)(i)');
    expect(rows.slice(i, i + 4).map((cells) => [cells[1], cells[2], cells[3]])).toEqual([
      ['To raise tax revenue', '1', 'Any TWO of the following:'],
      ['To reduce consumption of a harmful good', '1', '[Mark the FIRST TWO points only.]'],
      ['To internalise the external cost of smoking', '1', '1 mark each'],
      ['Any other relevant point', '1', 'max: 2'],
    ]);
    // An OR route is said in Guidance on its first point, with that point's own mark.
    const route = rows.find((cells) => cells[1].startsWith('Diagram:'))!;
    expect(route[2]).toBe('3');
    expect(route[3]).toBe('OR: an alternative answer. Mark one route only.');
    // A levels part with unmarked points: the part's own marks on its first row.
    expect(rows[at('1(b)(ii)')][2]).toBe('8');
    // The total closes the table.
    expect(rows[rows.length - 1].slice(1, 3)).toEqual(['Total', '13']);
  });

  it('a model diagram ends the table and prints full width under it; the table goes on', () => {
    const worksheet = buildMarkSchemeWorksheet();
    (worksheet.questions[0] as StructuredQuestion).parts[0].answerDiagram = createAnswerDiagram('supply-demand');
    const nodes = renderAnswerKey(detailed(worksheet), 'en');
    const diagram = nodes.findIndex((node) => node.kind === 'diagram');
    const before = nodes[diagram - 1] as TableNode;
    const after = nodes[diagram + 1] as TableNode;
    expect(before.kind).toBe('table');
    expect(before.keepNext).toBe(true);
    expect(after.kind).toBe('table');
    // The heading belongs to the first piece; the second goes on without it.
    expect(before.headerRows).toBe(1);
    expect(after.headerRows).toBeUndefined();
    expect(row(before, 1)[0]).toBe('1(a)');
  });

  it('levels and EC follow their question in a Level | Descriptor | Marks table, typed in place', () => {
    const levels = tables(key()).find((table) => row(table, 0).join() === 'Level,Descriptor,Marks')!;
    expect(row(levels, 1)).toEqual(['1', 'Few relevant points, little explanation.', '1–2']);
    expect(levels.rows[1][1].edit?.kind).toBe('schemeLevel');
    const ec = levels.rows.findIndex((cells) => plain(cells[0].text.en).startsWith('Effective communication'));
    expect(levels.rows[ec][0].colSpan).toBe(2);
    expect(levels.rows[ec][1].covered).toBe(true);
    expect(levels.rows[ec + 1][1].edit?.kind).toBe('schemeEc');
  });

  it('every scheme field is typed where it prints, alternatives each alone', () => {
    const cells = tables(key()).flatMap((table) => table.rows.flat());
    const kinds = new Set(
      cells.flatMap((cell) => [
        ...(cell.edit ? [cell.edit.kind] : []),
        ...(cell.segments?.en ?? []).flatMap((piece) => ('edit' in piece ? [piece.edit.kind] : [])),
      ]),
    );
    for (const kind of ['partAnswer', 'schemePoint', 'schemeAlternative', 'schemeLevel', 'schemeEc']) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
    // Stems on: the question's and the parts' wording, typed in place too.
    const withStems = tables(key('en', { showStems: true })).flatMap((table) => table.rows.flat());
    expect(withStems.some((cell) => cell.edit?.kind === 'blockText')).toBe(true);
  });

  it('has no running Marks head and prints in every language', () => {
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      const nodes = key(language);
      expect(answerKeyRunningHead(nodes, language)).toBeUndefined();
      expect(tables(nodes).length).toBeGreaterThan(1);
    }
    expect(row(tables(key('zh'))[0], 0).length).toBe(4);
    expect(plain(tables(key('zh'))[0].rows[0][3].text.zh)).toBe('評分指引');
  });
});

describe('Detailed table: MC with reasons', () => {
  it('a reasons column when any question has them; otherwise the HKEAA table', () => {
    const worksheet = buildLeakWorksheet();
    const [reasons] = tables(renderAnswerKey(detailed(worksheet), 'en'));
    expect(row(reasons, 0)).toEqual(['Question', 'Key', 'Explanation', 'Why the other options are wrong']);
    expect(row(reasons, 1)).toEqual([
      '1.',
      'B',
      'EXPLANATION-OK\nB. RATIONALE-OPTION-B',
      'A. RATIONALE-OPTION-A\nC. RATIONALE-OPTION-C\nD. RATIONALE-OPTION-D',
    ]);
    // Each reason is its own field.
    const others = reasons.rows[1][3].segments!.en.filter((piece) => 'edit' in piece);
    expect(others.map((piece) => ('edit' in piece ? piece.edit.kind : ''))).toEqual([
      'mcqRationale',
      'mcqRationale',
      'mcqRationale',
    ]);
    // Reasons off: the HKEAA table, the explanation listed under it.
    const [plainTable] = tables(renderAnswerKey(detailed(worksheet, { showRationales: false }), 'en'));
    expect(row(plainTable, 0)).toEqual(['Question No.', 'Key']);
  });

  it('source notes only when switched on', () => {
    const worksheet = buildLeakWorksheet();
    const text = (layout: AnswerKeyLayout) => JSON.stringify(renderAnswerKey(detailed(worksheet, layout), 'en'));
    expect(text({})).not.toContain('PROVENANCE-SENTINEL');
    expect(text({ showSources: true })).toContain('PROVENANCE-SENTINEL');
  });

  it('with versions on: the HKEAA table per version, the notes listed once', () => {
    const worksheet = { ...withFlow(buildLeakWorksheet(), [createMcqQuestion(), ...buildLeakWorksheet().questions]), versions: { count: 2, seed: 1 } };
    worksheet.title = bi('Mock', '模擬');
    const nodes = renderAnswerKey(detailed(worksheet), 'en');
    expect(tables(nodes).filter((table) => table.blockId === 'answer-key-mc-table')).toHaveLength(2);
  });
});

describe('the key’s tables in the .docx and on the clipboard', () => {
  const worksheet = detailed(buildMarkSchemeWorksheet());

  it('heading rows repeat (`w:tblHeader`), rows keep with the next where the IR says, cells top-aligned', () => {
    const xml = buildAnswerKeyDocxParts(worksheet, 'en').documentXml;
    expect(xml.match(/<w:tblHeader\/>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(xml).toContain('<w:vAlign w:val="top"/>');
    // A heading row's cells keep with the row under them.
    expect(xml).toMatch(/<w:tblHeader\/><\/w:trPr><w:tc><w:tcPr>(?:(?!<\/w:tc>).)*<w:keepNext\/>/);
    // Rows are never split across pages.
    expect(xml).toContain('<w:cantSplit/>');
  });

  it('the clipboard puts heading rows in a thead and tops the cells', () => {
    const html = answerKeyClipboardHtml(worksheet, 'en');
    expect(html).toContain('<thead>');
    expect(html).toContain('vertical-align:top');
  });
});
