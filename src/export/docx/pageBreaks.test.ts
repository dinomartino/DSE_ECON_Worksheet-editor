import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  buildAnswerKeyDocxParts,
  buildDocxParts,
  exportAnswerKeyDocxBuffer,
  exportDocxBuffer,
} from '.';
import { joinWithPageBreaks, PAGE_BREAK_RUN, type BodyUnit } from './pageBreaks';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { packPages, pageStarts, type PackItem, type PageStart } from '@/components/preview/pagination';
import { pageNodes } from '@/components/preview/pageNodes';
import { breakAfterNodes, keepsWithNext } from '@/components/preview/Preview';
import { createParagraphBlock, createStructuredQuestion, createTableBlock, createWorksheet } from '@/model/factories';
import { createPageBreakElement } from '@/model/flow';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { bi, plain } from '@/model/text';
import type { OutputMode, StructuredQuestion, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { buildAcceptanceWorksheet, withFlow } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';

/**
 * The `.docx` breaks its pages where the preview does, as plain page breaks, and carries
 * no keep flag at all (§ `joinWithPageBreaks`): Word marks every `keepNext` / `keepLines` /
 * `pageBreakBefore` paragraph with a black square beside it.
 */

const EN: OutputMode = { language: 'en', version: 'student' };
const KEEP_FLAG = /<w:keepNext|<w:keepLines|<w:pageBreakBefore/;
const BREAK = PAGE_BREAK_RUN;

/** Every XML part of a package, by name. */
async function parts(bytes: Uint8Array): Promise<Array<[string, string]>> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((name) => name.endsWith('.xml') || name.endsWith('.rels'));
  return Promise.all(names.map(async (name) => [name, await zip.file(name)!.async('string')] as [string, string]));
}

/** The words of a run of XML, in order. */
const words = (xml: string) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

function question(stem: string, extra: Partial<StructuredQuestion> = {}): StructuredQuestion {
  return { ...createStructuredQuestion(), blocks: [createParagraphBlock(bi(stem, stem))], parts: [], ...extra };
}

function paper(questions: StructuredQuestion[]): Worksheet {
  return withFlow({ ...createWorksheet(), instructions: bi('', '') }, questions);
}

/** A question's nodes as the sheets draw and break them (`pageNodes`). */
function questionNodes(worksheet: Worksheet, id: string) {
  const item = renderWorksheet(worksheet, EN).items.find(
    (entry) => entry.type === 'question' && entry.question.questionId === id,
  );
  return pageNodes(item?.type === 'question' ? item.question.nodes : []);
}

describe('no keep flags anywhere in the file', () => {
  const documents: Array<[string, Worksheet]> = [
    ['classroom', buildAcceptanceWorksheet()],
    ['Paper 1', createWorksheetFrom({ documentType: 'paper1', seedSample: true })],
    ['LQ booklet', createWorksheetFrom({ documentType: 'lqMock', seedSample: true })],
    ['LQ worksheet', createWorksheetFrom({ documentType: 'lqWorksheet', seedSample: true })],
    ['mark scheme', buildMarkSchemeWorksheet()],
  ];
  const modes: OutputMode[] = [
    { language: 'bilingual', version: 'student' },
    { language: 'bilingual', version: 'teacher' },
    { language: 'en', version: 'student' },
    { language: 'zh', version: 'teacher' },
  ];

  it.each(documents)('the %s paper, in every language and copy, every part', async (_, worksheet) => {
    for (const mode of modes) {
      for (const [name, xml] of await parts(await exportDocxBuffer(worksheet, mode))) {
        expect(xml, `${name} ${mode.language}/${mode.version}`).not.toMatch(KEEP_FLAG);
      }
    }
  });

  it.each(documents)('the %s answer key, alone and combined', async (_, worksheet) => {
    for (const others of [[], [buildMarkSchemeWorksheet(), buildAcceptanceWorksheet()]]) {
      for (const language of ['en', 'bilingual'] as const) {
        for (const [name, xml] of await parts(await exportAnswerKeyDocxBuffer(worksheet, language, others))) {
          expect(xml, `${name} ${language} +${others.length}`).not.toMatch(KEEP_FLAG);
        }
      }
    }
  });

  it('with the page breaks written in', () => {
    const worksheet = buildAcceptanceWorksheet();
    const rendered = renderWorksheet(worksheet, EN);
    const starts = rendered.items.slice(1).map((item) => ({
      key: item.type === 'question' ? item.question.questionId : item.layout.elementId,
      node: 0,
    }));
    const xml = buildDocxParts(worksheet, EN, new Map(), starts).documentXml;
    expect(xml).toContain(BREAK);
    expect(xml).not.toMatch(KEEP_FLAG);
  });

  it('nor on the clipboard, which has no pages and so no page breaks either', () => {
    const worksheet = buildAcceptanceWorksheet();
    const broken = withFlow(worksheet, [...worksheet.questions.slice(0, 1), createPageBreakElement(), ...worksheet.questions.slice(1)]);
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      // The page break element leaves only a comment, for the start screen's card.
      const html = worksheetClipboardHtml(broken, { language, version: 'teacher' }).replace(/<!--[\s\S]*?-->/g, '');
      expect(html).not.toMatch(/page-break|break-before|break-after|keep-with-next|keep-together|mso-pagination/i);
    }
  });
});

describe('a page break where the preview starts each sheet', () => {
  it('ends the last paragraph of the sheet before, and opens nothing of its own', () => {
    const [a, b, c] = [question('Alpha'), question('Bravo'), question('Charlie')];
    const xml = buildDocxParts(paper([a, b, c]), EN, new Map(), [
      { key: b.id, node: 0 },
      { key: c.id, node: 0 },
    ]).documentXml;

    const body = xml.slice(xml.indexOf('<w:body>'));
    const sheets = body.split(BREAK);
    expect(sheets).toHaveLength(3);
    // The break is the last run of a paragraph that has text before it — no line of its
    // own to spill onto the next sheet, no empty line opening it.
    for (const sheet of sheets.slice(0, -1)) expect(sheet).toMatch(/<w:t[^>]*>[^<]*<\/w:t><\/w:r>$/);
    for (const sheet of sheets.slice(1)) expect(sheet.startsWith('</w:p>')).toBe(true);
    expect(words(sheets[0])).toContain('Alpha');
    expect(words(sheets[0])).not.toContain('Bravo');
    expect(words(sheets[1]).startsWith('Bravo')).toBe(true);
    expect(words(sheets[2]).startsWith('Charlie')).toBe(true);
  });

  it('writes nothing new without starts: Word paginates alone, byte for byte as before', () => {
    const worksheet = paper([question('Alpha'), question('Bravo')]);
    expect(buildDocxParts(worksheet, EN, new Map(), []).documentXml).toBe(buildDocxParts(worksheet, EN).documentXml);
    expect(buildDocxParts(worksheet, EN).documentXml).not.toContain(BREAK);
  });

  it('drops the boundary gap of the question that opens a sheet, as the preview does', () => {
    // A Paper 1 question's gap above it rides on its stem as `w:before` (§ withLeadingGap).
    const worksheet = createWorksheetFrom({ documentType: 'paper1', seedSample: true });
    const items = renderWorksheet(worksheet, EN).items;
    const gapped = items.find(
      (item) => item.type === 'question' && item.question.nodes[0]?.kind === 'text' && item.question.nodes[0].boundaryGap,
    );
    expect(gapped?.type).toBe('question');
    const key = gapped!.type === 'question' ? gapped!.question.questionId : '';
    const stem = gapped!.type === 'question' && gapped!.question.nodes[0].kind === 'text' ? plain(gapped!.question.nodes[0].text.en) : '';

    const paragraphWith = (xml: string) =>
      xml.split('</w:p>').find((p) => words(p).startsWith(stem.slice(0, 20)) && p.includes('w:pStyle')) ?? '';
    const free = paragraphWith(buildDocxParts(worksheet, EN).documentXml);
    const opening = paragraphWith(buildDocxParts(worksheet, EN, new Map(), [{ key, node: 0 }]).documentXml);
    expect(free).toMatch(/w:before="\d+"/);
    expect(opening).not.toMatch(/w:before=/);
  });

  it('breaks between two lines of a question’s answer space, where its sheet does', () => {
    const q = question('Explain.', { answerSpace: 6 });
    const split = questionNodes(paper([q]), q.id);
    const first = split.findIndex((node) => node.kind === 'answerSpace');
    const xml = buildDocxParts(paper([q]), EN, new Map(), [{ key: q.id, node: first + 2 }]).documentXml;
    const [before, after] = xml.split(BREAK);
    const dotted = (s: string) => s.match(/<w:pStyle w:val="LQAnswerLine"\/>|<w:u w:val="dotted"\/><\/w:rPr><w:tab\/>/g)?.length ?? 0;
    expect(dotted(before)).toBe(2);
    expect(dotted(after)).toBe(4);
  });

  it('leaves a sheet that starts inside a table to Word, which breaks between its rows', () => {
    const q = question('Study the table.');
    q.blocks.push(createTableBlock(4, 2));
    const split = questionNodes(paper([q]), q.id);
    const piece = split.findIndex((node) => node.kind === 'table' && node.piece && !node.piece.first);
    expect(piece).toBeGreaterThan(0);
    const xml = buildDocxParts(paper([q]), EN, new Map(), [{ key: q.id, node: piece }]).documentXml;
    expect(xml).not.toContain(BREAK);
    expect(xml).toContain('<w:cantSplit/>');
  });

  it('never adds a second break after a teacher’s own page break', () => {
    const units = (xml: string[]): BodyUnit[] =>
      xml.map((x, index) => ({ id: `u:${index}`, render: () => x, breakable: true }));
    const manual = `<w:p>${BREAK}</w:p>`;
    expect(joinWithPageBreaks(units(['<w:p>a</w:p>', manual, '<w:p>b</w:p>']), new Set(['u:2']))).toBe(
      `<w:p>a</w:p>${manual}<w:p>b</w:p>`,
    );
    // Nothing before the start: nothing to end, no blank first page.
    expect(joinWithPageBreaks(units(['<w:p>a</w:p>']), new Set(['u:0']))).toBe('<w:p>a</w:p>');
    // A sheet ending in a table gets a collapsed paragraph of its own for the break.
    const afterTable = joinWithPageBreaks(units(['<w:tbl></w:tbl>', '<w:p>b</w:p>']), new Set(['u:1']));
    expect(afterTable).toBe(`<w:tbl></w:tbl><w:p><w:pPr><w:spacing w:line="20" w:lineRule="exact"/></w:pPr>${BREAK}</w:p><w:p>b</w:p>`);
  });
});

describe('the answer key’s page breaks', () => {
  it('break before each node a key sheet starts at, never inside a table', () => {
    const worksheet = buildMarkSchemeWorksheet();
    const free = buildAnswerKeyDocxParts(worksheet, 'en').documentXml;
    expect(free).not.toContain(BREAK);
    const broken = buildAnswerKeyDocxParts(worksheet, 'en', [], new Map(), [[{ node: 3 }, { node: 5, row: 2 }]]).documentXml;
    expect(broken.split(BREAK)).toHaveLength(2);
  });

  it('per document in a combined key, each in its own section', () => {
    const worksheet = buildMarkSchemeWorksheet();
    const other = buildAcceptanceWorksheet();
    const xml = buildAnswerKeyDocxParts(worksheet, 'en', [other], new Map(), [[{ node: 3 }], [{ node: 2 }]]).documentXml;
    expect(xml.split(BREAK)).toHaveLength(3);
    expect(xml).not.toMatch(KEEP_FLAG);
  });
});

describe('the preview’s sheets and the file’s pages agree', () => {
  /**
   * The paginator over the real IR, as the preview builds its blocks (§ `Preview` blocks):
   * every node one line of 20px, a sheet five lines tall, so items break across sheets.
   */
  function preview(worksheet: Worksheet, mode: OutputMode): PageStart[] {
    const rendered = renderWorksheet(worksheet, mode);
    const blocks: PackItem[] = [];
    const heights = new Map<string, number>();
    if (rendered.bands.length > 0 || rendered.title) blocks.push({ key: 'masthead', structural: true });
    if (rendered.instructions) blocks.push({ key: 'instructions', structural: true });
    for (const block of blocks) heights.set(block.key, 20);
    for (const item of rendered.items) {
      const key = item.type === 'question' ? item.question.questionId : item.layout.elementId;
      const nodes = pageNodes(item.type === 'question' ? item.question.nodes : item.layout.nodes);
      const manual = nodes.some((node) => node.kind === 'pageBreak');
      blocks.push({
        key,
        ...(manual ? { forceBreak: true, breakId: key } : {}),
        breakPoints: breakAfterNodes(nodes).map((index) => ({ index, height: (index + 1) * 20 })),
        looseBreakPoints: nodes.slice(0, -1).map((_, index) => ({ index, height: (index + 1) * 20 })),
        keepsWithNext: keepsWithNext(nodes),
      });
      heights.set(key, manual ? 0 : nodes.length * 20);
    }
    return pageStarts(packPages(blocks, heights, 100));
  }

  it.each([
    ['classroom', buildAcceptanceWorksheet()],
    ['Paper 1', createWorksheetFrom({ documentType: 'paper1', seedSample: true })],
    ['LQ booklet', createWorksheetFrom({ documentType: 'lqMock', seedSample: true })],
  ])('the %s paper breaks before the node each sheet starts with', (_, worksheet) => {
    const mode: OutputMode = { language: 'en', version: 'teacher' };
    const starts = preview(worksheet, mode);
    expect(starts.length).toBeGreaterThan(1);
    const xml = buildDocxParts(worksheet, mode, new Map(), starts).documentXml;
    const body = xml.slice(xml.indexOf('<w:body>'));

    const items = renderWorksheet(worksheet, mode).items;
    const nodeAt = (start: PageStart) => {
      const item = items.find((entry) =>
        (entry.type === 'question' ? entry.question.questionId : entry.layout.elementId) === start.key,
      )!;
      return pageNodes(item.type === 'question' ? item.question.nodes : item.layout.nodes)[start.node];
    };
    // A start inside a table is Word's to break; every other start is one break.
    const written = starts.filter((start) => {
      const node = nodeAt(start);
      return !(node.kind === 'table' && node.piece && !node.piece.first);
    });
    const sheets = body.split(BREAK);
    const manual = (body.match(/<w:p><w:r><w:br w:type="page"\/><\/w:r><\/w:p>/g) ?? []).length;
    expect(sheets.length - 1 - manual).toBe(written.length);

    // Each written sheet opens with its start node's words, where that node has words.
    for (const start of written) {
      const node = nodeAt(start);
      if (node.kind !== 'text') continue;
      const text = plain(node.text.en).trim();
      if (!text) continue;
      expect(sheets.some((sheet) => words(sheet).trimStart().startsWith(text.slice(0, 12)))).toBe(true);
    }
  });
});

describe('pageStarts', () => {
  const item = (key: string, extra: Partial<PackItem> = {}): PackItem => ({ key, ...extra });

  it('names every sheet but the first by its first placement', () => {
    const items = [item('a'), item('b'), item('c')];
    const packed = packPages(items, new Map(items.map((i) => [i.key, 60])), 100);
    expect(pageStarts(packed)).toEqual([
      { key: 'b', node: 0 },
      { key: 'c', node: 0 },
    ]);
  });

  it('skips a sheet a manual page break opened: its own break is in the file already', () => {
    const items = [item('a'), item('brk', { forceBreak: true, breakId: 'brk' }), item('b')];
    const packed = packPages(items, new Map([['a', 10], ['brk', 0], ['b', 10]]), 100);
    expect(packed.pages).toHaveLength(2);
    expect(pageStarts(packed)).toEqual([]);
  });

  it('starts a continued item at the node its piece begins with', () => {
    const items = [
      item('a', {
        breakPoints: [0, 1, 2].map((index) => ({ index, height: (index + 1) * 40 })),
        looseBreakPoints: [0, 1, 2].map((index) => ({ index, height: (index + 1) * 40 })),
      }),
    ];
    const packed = packPages(items, new Map([['a', 160]]), 100);
    expect(pageStarts(packed)).toEqual([{ key: 'a', node: 2 }]);
  });
});
