import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  answerKeyFileName,
  buildAnswerKeyDocxParts,
  exportAnswerKeyDocxBuffer,
} from '@/export/docx';
import { createMcqQuestion, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { bi, plain } from '@/model/text';
import type { McqQuestion, StructuredQuestion, Worksheet } from '@/model/types';
import { parseWorksheet } from '@/storage/document';
import { withFlow } from '@/test/fixtures';
import {
  answerKeyPartTitle,
  coverPaperLabel,
  renderAnswerKey,
  renderCombinedAnswerKey,
} from './answerKey';
import type { RenderNode, TableNode, TextNode } from './ir';

function mcq(answerIndex: number): McqQuestion {
  const question = createMcqQuestion();
  question.answerIndex = answerIndex;
  return question;
}

function structured(answer: string): StructuredQuestion {
  const question = createStructuredQuestion();
  question.parts[0].answer = bi(answer, `答${answer}`);
  return question;
}

/** Paper 1: a cover naming the paper, three MCQs. */
function paper1(title = 'Mock 2026'): Worksheet {
  const worksheet = createWorksheetFrom({ documentType: 'paper1', title, seedSample: false });
  return withFlow(worksheet, [mcq(0), mcq(1), mcq(2)]);
}

/** Paper 2: the booklet's cover, two long questions. */
function paper2(title = 'Mock 2026'): Worksheet {
  const worksheet = createWorksheetFrom({ documentType: 'lqMock', title, seedSample: false });
  return withFlow(worksheet, [structured('first'), structured('second')], { replaceLayout: true });
}

const titles = (nodes: RenderNode[]) =>
  nodes
    .filter((node): node is TextNode => node.kind === 'text' && node.style === 'Worksheet Title')
    .map((node) => plain(node.text.en));

const headings = (nodes: RenderNode[], style: TextNode['style']) =>
  nodes
    .filter((node): node is TextNode => node.kind === 'text' && node.style === style)
    .map((node) => plain(node.text.en));

describe('combined answer key IR', () => {
  it('puts each paper under its own heading, in order, the second from a new page', () => {
    const one = paper1();
    const two = paper2();
    const nodes = renderCombinedAnswerKey([one, two], 'en');

    expect(titles(nodes)).toEqual([
      'Mock 2026, Paper 1 — Answer key',
      'Mock 2026, Paper 2 — Answer key',
    ]);
    const breaks = nodes.flatMap((node, index) => (node.kind === 'pageBreak' ? [index] : []));
    expect(breaks).toHaveLength(1);
    // Paper 1's grid before the break, Paper 2's schemes after it.
    const grid = nodes.findIndex((node) => node.kind === 'table');
    expect(grid).toBeLessThan(breaks[0]);
    const after = nodes.slice(breaks[0] + 1);
    expect(after[0]).toMatchObject({ kind: 'text', style: 'Worksheet Title' });
    // Each part numbers as its own paper prints: Paper 2 starts again at Question 1.
    expect(headings(after, 'Question Stem')).toEqual(['Question 1', 'Question 2']);
    expect(after.some((node) => node.kind === 'table')).toBe(false);
  });

  it('is exactly the single key for one document', () => {
    const one = paper1();
    expect(renderCombinedAnswerKey([one], 'bilingual')).toEqual(renderAnswerKey(one, 'bilingual'));
    expect(renderCombinedAnswerKey([], 'en')).toEqual([]);
  });

  it('keeps each paper’s versions to itself: grids and map only in the versioned part', () => {
    const one = { ...paper1(), versions: { count: 2, seed: 11 } };
    const two = paper2();
    const nodes = renderCombinedAnswerKey([one, two], 'en');
    const split = nodes.findIndex((node) => node.kind === 'pageBreak');
    const [first, second] = [nodes.slice(0, split), nodes.slice(split + 1)];

    expect(headings(first, 'Section Heading')).toEqual(
      expect.arrayContaining(['Version A', 'Version B', 'Version map']),
    );
    expect(first).toEqual(renderAnswerKey(one, 'en', { title: answerKeyPartTitle(one) }));
    expect(headings(second, 'Section Heading')).not.toContain('Version map');
    expect(headings(second, 'Section Heading').some((text) => text.startsWith('Version'))).toBe(false);
  });

  it('applies the chosen language to every part', () => {
    const nodes = renderCombinedAnswerKey([paper1('模擬考'), paper2('模擬考')], 'zh');
    const zhTitles = nodes
      .filter((node): node is TextNode => node.kind === 'text' && node.style === 'Worksheet Title')
      .map((node) => plain(node.text.zh));
    expect(zhTitles).toEqual(['模擬考，試卷一 — 答案及評分參考', '模擬考，試卷二 — 答案及評分參考']);
  });
});

describe('a paper’s heading', () => {
  it('reads the paper off the cover', () => {
    expect(coverPaperLabel(paper1())).toEqual({ en: 'Paper 1', zh: '試卷一' });
    expect(coverPaperLabel(paper2())).toEqual({ en: 'Paper 2', zh: '試卷二' });
    expect(coverPaperLabel(createWorksheet())).toBeUndefined();
  });

  it('does not repeat a paper the title already names', () => {
    const named = paper2('DSE Mock Paper 2');
    expect(plain(answerKeyPartTitle(named).en)).toBe('DSE Mock Paper 2 — Answer key');
  });

  it('falls back to the document name without a cover, and to the paper when unnamed', () => {
    const plainSheet = { ...createWorksheet(), title: bi('', ''), name: 'Unit 3 quiz' };
    expect(plain(answerKeyPartTitle(plainSheet).en)).toBe('Unit 3 quiz — Answer key');
    const unnamed = createWorksheetFrom({ documentType: 'paper1', seedSample: false });
    expect(plain(answerKeyPartTitle(unnamed).en)).toBe('Paper 1 — Answer key');
    expect(plain(answerKeyPartTitle(unnamed).zh)).toBe('試卷一 — 答案及評分參考');
  });
});

describe('combined answer key .docx', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T09:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('a single key is byte-identical with and without the combined path', async () => {
    const corpus = parseWorksheet(readFileSync('src/test/corpus/v1-published.json', 'utf8'));
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      expect(await exportAnswerKeyDocxBuffer(corpus, language, [])).toEqual(
        await exportAnswerKeyDocxBuffer(corpus, language),
      );
    }
  });

  it('writes one well-formed file with both papers and no edit targets', async () => {
    const one = paper1();
    const two = { ...paper2(), versions: { count: 2, seed: 3 } };
    const { documentXml } = buildAnswerKeyDocxParts(one, 'bilingual', [two]);
    expect(documentXml.match(/w:type="page"/g)).toHaveLength(1);
    expect(documentXml.indexOf('Paper 1 — Answer key')).toBeLessThan(documentXml.indexOf('Paper 2 — Answer key'));
    expect(documentXml).not.toMatch(/data-edit|blockText|partAnswer/);

    const { XMLValidator } = await import('fast-xml-parser');
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(one, 'bilingual', [two]));
    for (const path of Object.keys(zip.files)) {
      if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue;
      expect(XMLValidator.validate(await zip.file(path)!.async('string')), path).toBe(true);
    }
  });

  it('keeps an old-schema document’s content once migrated', () => {
    const corpus = parseWorksheet(readFileSync('src/test/corpus/v1-published.json', 'utf8'));
    const alone = buildAnswerKeyDocxParts(corpus, 'en').documentXml;
    const combined = buildAnswerKeyDocxParts(paper1(), 'en', [corpus]).documentXml;
    // Everything after the corpus's own title paragraph is the same XML.
    const tail = alone.slice(alone.indexOf('</w:p>') + 6, alone.indexOf('<w:sectPr'));
    expect(tail.length).toBeGreaterThan(0);
    expect(combined).toContain(tail);
  });
});

describe('a combined key’s file name', () => {
  const named = (name: string): Worksheet => ({ ...createWorksheet(), name });

  it('is unchanged for one document', () => {
    expect(answerKeyFileName(named('P1'), 'en')).toBe('P1 (Answer key) (EN).docx');
    expect(answerKeyFileName(named('P1'), 'en', [])).toBe('P1 (Answer key) (EN).docx');
  });

  it('names the papers it joins, then counts the rest', () => {
    expect(answerKeyFileName(named('P1'), 'zh', [named('P2')])).toBe('P1 + P2 (Answer key) (ZH).docx');
    expect(answerKeyFileName(named('P1'), 'en', [named('P2'), named('P3')])).toBe(
      'P1 + P2 + P3 (Answer key) (EN).docx',
    );
    expect(answerKeyFileName(named('P1'), 'bilingual', [named('P2'), named('P3'), named('a/b')])).toBe(
      'P1 + P2 + 2 more (Answer key) (Bilingual).docx',
    );
  });
});

/** Grids stay per paper: Paper 1's numbers, never continued into another paper. */
it('numbers each paper’s grid from its own 1', () => {
  const nodes = renderCombinedAnswerKey([paper1(), paper1('Second')], 'en');
  const grids = nodes.filter((node): node is TableNode => node.kind === 'table');
  expect(grids).toHaveLength(2);
  for (const grid of grids) expect(plain(grid.rows[0][0].text.en)).toBe('1');
});
