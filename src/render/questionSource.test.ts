import { beforeEach, describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import v1Mcq from '@/test/corpus/v1-mcq.json';
import { useBankSession } from '@/components/bank/bankSession';
import { buildAnswerKeyDocxParts, buildDocxParts } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { createMcqQuestion, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { computeNumbering } from '@/model/numbering';
import { bi } from '@/model/text';
import type { LanguageMode, McqQuestion, OutputMode, Question, Worksheet } from '@/model/types';
import { emptyPaperFor, insertIntoOpen } from '@/pastpapers/actions';
import type { PastPaperItem } from '@/pastpapers/pack';
import { sourceOf as tagOf } from '@/pastpapers/pack';
import { useWorksheetStore } from '@/store/worksheetStore';
import { renderAnswerKey } from './answerKey';
import { breakAfterNodes } from '@/components/preview/Preview';
import { documentShape } from '@/model/documentShape';
import { trailLabel, type RenderNode, type TextNode } from './ir';
import {
  hasQuestionSources,
  printsQuestionSources,
  questionSourceFormat,
  shortSource,
  sourceParts,
  sourceTrail,
  withQuestionSourceFormat,
  withQuestionSources,
} from './questionSource';
import { renderWorksheet } from './worksheet';

/**
 * A question's source on the paper (user u-w7gs): `Worksheet.showQuestionSources` puts each
 * question's `provenance` in brackets on a line of its own above the question, at the left
 * edge of its number (u-tchj), in every backend, and off (the default, and every saved
 * paper) changes nothing at all.
 */

const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];
const MODES: OutputMode[] = LANGUAGES.flatMap((language) => [
  { language, version: 'student' as const },
  { language, version: 'teacher' as const },
]);

function pastMcq(tag: string, en: string, zh: string, stem = 'Which of the following is correct?'): McqQuestion {
  const question = createMcqQuestion();
  question.id = `pp-${tag.replaceAll('/', '_')}`;
  question.blocks = [{ kind: 'paragraph', id: `${question.id}-stem`, text: bi(stem, '下列哪項正確？') }];
  question.options = ['w', 'x', 'y', 'z'].map((text, index) => ({ id: `${question.id}-${index}`, text: bi(text, text) }));
  question.answerIndex = 2;
  question.tags = [tag];
  question.provenance = bi(en, zh);
  question.lineage = { rootId: `pp:${tag}` };
  return question;
}

const Q1 = pastMcq('DSE2019/P1/Q12', 'HKDSE 2019 Paper 1 Q12', '香港中學文憑考試 2019 卷一 第 12 題');
const Q2 = pastMcq('CE2006/P2/Q32', 'HKCEE 2006 Paper 2 Q32', '香港中學會考 2006 卷二 第 32 題');

function paper(questions: Question[] = [Q1, Q2], extra: Partial<Worksheet> = {}): Worksheet {
  const base = createWorksheet();
  return {
    ...base,
    questions,
    layout: [],
    flow: questions.map((q) => ({ type: 'question' as const, id: q.id })),
    ...extra,
  };
}

/** The label as printed: its spaces are no-break spaces. */
const nb = (text: string) => text.replace(/ /g, '\u00a0');
const label = (trail: TextNode['trail'], language: LanguageMode) => trailLabel(trail!, language).replace(/\u00a0/g, ' ');

const numbered = (nodes: RenderNode[]) =>
  nodes.find((n): n is TextNode => n.kind === 'text' && n.listRef?.definition === 'question' && n.listRef.level === 0)!;

/** The source line: the question's first node, a plain paragraph before its numbered line. */
const sourceLine = (nodes: RenderNode[]): TextNode | undefined => {
  const first = nodes[0];
  return first?.kind === 'text' && first.listRef === undefined && nodes.indexOf(numbered(nodes)) > 0 ? first : undefined;
};
/** What the source line prints on a paper in `language` (both sides once on a bilingual paper). */
const printed = (nodes: RenderNode[], language: LanguageMode) => {
  const line = sourceLine(nodes);
  if (!line) return undefined;
  const side = language === 'zh' ? line.text.zh : line.text.en;
  return side.map((run) => run.text).join('').replace(/\u00a0/g, ' ');
};

describe('off: the default, and every saved paper', () => {
  it('prints exactly what it printed before (IR, .docx, clipboard, answer key) in every language and copy', () => {
    const off = paper();
    expect(withQuestionSources(off, false)).toBe(off);
    for (const mode of MODES) {
      const ir = renderWorksheet(off, mode);
      for (const question of ir.questions) {
        expect(numbered(question.nodes).trail).toBeUndefined();
        expect(sourceLine(question.nodes)).toBeUndefined();
      }
    }
    // The student copy never had the source; it still has none.
    const studentXml = buildDocxParts(off, { language: 'en', version: 'student' }).documentXml;
    expect(studentXml).not.toMatch(/HKDSE.2019/);
    expect(worksheetClipboardHtml(off, { language: 'en', version: 'student' })).not.toMatch(/HKDSE.2019/);
  });

  it('the published corpus opens without the switch and renders as before', () => {
    for (const corpus of [v1Corpus, v1Mcq]) {
      const loaded = migrate(structuredClone(corpus));
      expect(loaded.showQuestionSources).toBeUndefined();
      expect(printsQuestionSources(loaded)).toBe(false);
      const ir = renderWorksheet(loaded, { language: 'bilingual', version: 'student' });
      for (const question of ir.questions) {
        const line = numbered(question.nodes);
        if (line && line.marks === undefined) expect(line.trail).toBeUndefined();
        if (line) expect(sourceLine(question.nodes)).toBeUndefined();
      }
    }
  });
});

describe('on', () => {
  const on = paper(undefined, { showQuestionSources: true });

  it('puts the bracketed source on its own line above the question, each language its own side', () => {
    const en = renderWorksheet(on, { language: 'en', version: 'student' });
    const zh = renderWorksheet(on, { language: 'zh', version: 'student' });
    expect(en.questions.map((q) => printed(q.nodes, 'en'))).toEqual(['(HKDSE 2019 Paper 1 Q12)', '(HKCEE 2006 Paper 2 Q32)']);
    expect(zh.questions.map((q) => printed(q.nodes, 'zh'))).toEqual(['（香港中學文憑考試 2019 卷一 第 12 題）', '（香港中學會考 2006 卷二 第 32 題）']);
    const [line, number] = en.questions[0].nodes as TextNode[];
    // Right above the numbered line, unnumbered, at the number's left edge (the margin), in its style.
    expect(number).toBe(numbered(en.questions[0].nodes));
    expect(line.listRef).toBeUndefined();
    expect(line.indent).toBeUndefined();
    expect(line.style).toBe(number.style);
    // The numbered line carries nothing at its right any more, and its words are untouched.
    expect(number.trail).toBeUndefined();
    expect(number.trailOwnLine).toBeUndefined();
    expect(number.text).toEqual(Q1.blocks[0].kind === 'paragraph' ? Q1.blocks[0].text : undefined);
  });

  it('adds only that line: numbering and the question below it stay as they were', () => {
    const off = paper();
    // The gap between questions rides the first paragraph (`withLeadingGap`): now the source line.
    const unspaced = (node: RenderNode) => {
      if (node.kind !== 'text' || !node.boundaryGap) return node;
      const { boundaryGap: _gap, format, ...rest } = node;
      const { spaceBefore: _before, ...kept } = format ?? {};
      void _gap;
      void _before;
      return Object.keys(kept).length > 0 ? { ...rest, format: kept } : rest;
    };
    for (const mode of MODES) {
      const before = renderWorksheet(off, mode);
      const after = renderWorksheet(on, mode);
      expect(after.questions.map((q) => q.number)).toEqual(before.questions.map((q) => q.number));
      after.questions.forEach((question, index) => {
        expect(question.nodes.slice(1).map(unspaced)).toEqual(before.questions[index].nodes.map(unspaced));
        // The gap above the question now sits above its source.
        const gap = (before.questions[index].nodes[0] as TextNode).format?.spaceBefore;
        expect((question.nodes[0] as TextNode).format?.spaceBefore).toBe(gap);
      });
    }
    expect(computeNumbering(on)).toEqual(computeNumbering(off));
  });

  it('never ends a page: the paginator offers no break after the source, on every shape', () => {
    for (const shape of ['classroom', 'paper1'] as const) {
      const ws = { ...emptyPaperFor(shape, 'Sources'), ...paper(undefined, { showQuestionSources: true }), cover: emptyPaperFor(shape, 'Sources').cover };
      expect(documentShape(ws)).toBe(shape);
      for (const mode of MODES) {
        for (const question of renderWorksheet(ws, mode).questions) {
          expect(sourceLine(question.nodes)?.keepNext).toBe(true);
          expect(breakAfterNodes(question.nodes)).not.toContain(0);
        }
      }
    }
  });

  it('prints in the .docx and the clipboard, English and Chinese, student and teacher', () => {
    for (const version of ['student', 'teacher'] as const) {
      const en = buildDocxParts(on, { language: 'en', version }).documentXml;
      expect(en).toContain(nb('(HKDSE 2019 Paper 1 Q12)'));
      expect(en).toContain(nb('(HKCEE 2006 Paper 2 Q32)'));
      // A paragraph of its own, with no tab and no number, right before the numbered one.
      const paragraphs = en.match(/<w:p[ >](?:(?!<\/w:p>).)*<\/w:p>/g) ?? [];
      const at = paragraphs.findIndex((p) => p.includes(nb('(HKDSE 2019 Paper 1 Q12)')));
      expect(paragraphs[at]).not.toContain('<w:tab/>');
      expect(paragraphs[at]).not.toContain('<w:numPr>');
      expect(paragraphs[at].replace(/<[^>]+>/g, '')).toBe(nb('(HKDSE 2019 Paper 1 Q12)'));
      expect(paragraphs[at + 1]).toContain('Which of the following is correct?');
      const zh = buildDocxParts(on, { language: 'zh', version }).documentXml;
      expect(zh).toContain(nb('（香港中學文憑考試 2019 卷一 第 12 題）'));
      expect(zh).not.toContain(nb('(HKDSE 2019 Paper 1 Q12)'));
      expect(worksheetClipboardHtml(on, { language: 'en', version })).toContain(nb('(HKDSE 2019 Paper 1 Q12)'));
      expect(worksheetClipboardHtml(on, { language: 'zh', version })).toContain(nb('（香港中學會考 2006 卷二 第 32 題）'));
    }
  });

  it('leaves the answer key exactly as it was', () => {
    const off = paper();
    for (const language of LANGUAGES) {
      expect(renderAnswerKey(on, language)).toEqual(renderAnswerKey(off, language));
      expect(buildAnswerKeyDocxParts(on, language).documentXml).toBe(
        buildAnswerKeyDocxParts(off, language).documentXml,
      );
    }
  });

  it('keeps the source with its question in a shuffled version', () => {
    const versioned = paper(undefined, { showQuestionSources: true, versions: { count: 2, seed: 7 } });
    for (const variant of ['A', 'B']) {
      const ir = renderWorksheet(versioned, { language: 'en', version: 'student', variant });
      for (const question of ir.questions) {
        const original = versioned.questions.find((q) => q.id === question.questionId) as McqQuestion;
        expect(printed(question.nodes, 'en')).toBe(`(${original.provenance!.en[0].text})`);
      }
    }
  });

  it('prints nothing for a question without a source', () => {
    const plainMcq = { ...pastMcq('X/P1/Q1', '', ''), provenance: undefined };
    const structured = createStructuredQuestion();
    const ws = paper([plainMcq, structured, Q1], { showQuestionSources: true });
    const ir = renderWorksheet(ws, { language: 'en', version: 'student' });
    expect(ir.questions[0].nodes[0]).toBe(numbered(ir.questions[0].nodes));
    expect(sourceLine(ir.questions[1].nodes)).toBeUndefined();
    expect(printed(ir.questions[2].nodes, 'en')).toBe('(HKDSE 2019 Paper 1 Q12)');
  });

  it('a stem opening with a picture has it above the picture, at the top of the question', () => {
    const q = pastMcq('DSE2024/P1/Q23', 'HKDSE 2024 Paper 1 Q23', '香港中學文憑考試 2024 卷一 第 23 題');
    q.blocks = [{ kind: 'image', id: 'img', src: 'data:image/png;base64,iVBORw0KGgo=', widthPx: 100, heightPx: 50 } as McqQuestion['blocks'][number], ...q.blocks];
    const ir = renderWorksheet(paper([q], { showQuestionSources: true }), { language: 'en', version: 'student' });
    expect(printed(ir.questions[0].nodes, 'en')).toBe('(HKDSE 2024 Paper 1 Q23)');
  });

  it('a side with no words falls back to the other, as every trail does', () => {
    expect(label(sourceTrail(bi('HKDSE 2019 Paper 1 Q12', '')), 'zh')).toBe('(HKDSE 2019 Paper 1 Q12)');
  });
});

describe('the stored switch', () => {
  it('is stored only as true and survives save and reload (KNOWN_KEYS)', () => {
    const on = withQuestionSources(paper(), true);
    expect(on.showQuestionSources).toBe(true);
    expect('showQuestionSources' in withQuestionSources(on, false)).toBe(false);
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(on))));
    expect(reloaded.showQuestionSources).toBe(true);
    expect(reloaded.__unknown).toBeUndefined();
  });

  it('knows when a paper has a source to print', () => {
    expect(hasQuestionSources(paper())).toBe(true);
    expect(hasQuestionSources(paper([createStructuredQuestion()]))).toBe(false);
  });
});

describe('the past paper bank sets it as questions go in', () => {
  const item = (question: McqQuestion): PastPaperItem => ({
    topicId: 't',
    docId: 'pp-bank-t',
    question,
    source: tagOf(question),
    provenance: { en: question.provenance!.en[0].text, zh: question.provenance!.zh[0].text },
    excerpt: { en: '', zh: '' },
    searchText: '',
  });

  beforeEach(() => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
    useBankSession.setState({ review: null });
  });

  it('with Show source on, a paper getting its first sourced questions prints them; one ⌘Z takes both', () => {
    const before = useWorksheetStore.getState().worksheet;
    insertIntoOpen([item(Q1)], () => '', { showSources: true });
    expect(useWorksheetStore.getState().worksheet.showQuestionSources).toBe(true);
    useWorksheetStore.getState().undo();
    const undone = useWorksheetStore.getState().worksheet;
    expect(undone.showQuestionSources).toBeUndefined();
    expect(undone.questions).toEqual(before.questions);
  });

  it('with it off, nothing changes (today\'s behaviour)', () => {
    insertIntoOpen([item(Q1)], () => '');
    expect(useWorksheetStore.getState().worksheet.showQuestionSources).toBeUndefined();
    insertIntoOpen([item(Q2)], () => '', { showSources: false });
    expect(useWorksheetStore.getState().worksheet.showQuestionSources).toBeUndefined();
  });

  it('never flips what a paper that already has sourced questions prints', () => {
    insertIntoOpen([item(Q1)], () => '');
    insertIntoOpen([item(Q2)], () => '', { showSources: true });
    expect(useWorksheetStore.getState().worksheet.showQuestionSources).toBeUndefined();
  });
});

describe('the line above the question, in every language and backend', () => {
  it('a bilingual paper prints the label once: both sides on one line, or the short tag alone', () => {
    const full = renderWorksheet(paper([Q2], { showQuestionSources: true }), { language: 'bilingual', version: 'student' });
    expect(printed(full.questions[0].nodes, 'bilingual')).toBe('(HKCEE 2006 Paper 2 Q32) （香港中學會考 2006 卷二 第 32 題）');
    expect(sourceLine(full.questions[0].nodes)!.text.zh).toEqual([]);
  });

  it('keeps the numbered line\'s size and fonts', () => {
    const ws = paper([Q1], { showQuestionSources: true });
    const nodes = renderWorksheet(ws, { language: 'en', version: 'student' }).questions[0].nodes;
    const { fontSize, fonts } = numbered(nodes).format ?? {};
    expect(sourceLine(nodes)!.format?.fontSize).toBe(fontSize);
    expect(sourceLine(nodes)!.format?.fonts).toEqual(fonts);
  });

  it('the clipboard has it as its own paragraph before the numbered one', () => {
    const html = worksheetClipboardHtml(paper([Q1], { showQuestionSources: true, questionSourceFormat: 'short' }), { language: 'en', version: 'student' });
    expect(html).toMatch(/<p[^>]*>\(DSE2019\/P1\/Q12\)<\/p>/);
    expect(html.indexOf('(DSE2019/P1/Q12)')).toBeLessThan(html.indexOf('Which of the following is correct?'));
    expect(html).not.toContain('float:right">(DSE2019');
  });
});

describe('the source format: full, short, short with a Roman paper (user u-z6ft)', () => {
  const AL = pastMcq('AL2002/P1/Q17', 'HKALE 2002 Paper 1 Q17', '香港高級程度會考 2002 卷一 第 17 題');
  const SP = pastMcq('DSESP/P1/Q3', 'HKDSE Sample Paper Paper 1 Q3', '香港中學文憑考試 樣本試卷 卷一 第 3 題');
  const PP = pastMcq('DSEPP/P1/Q40', 'HKDSE Practice Paper Paper 1 Q40', '香港中學文憑考試 練習卷 卷一 第 40 題');
  const ALL = [Q1, Q2, AL, SP, PP];
  const SHORT = ['DSE2019/P1/Q12', 'CE2006/P2/Q32', 'AL2002/P1/Q17', 'DSESP/P1/Q3', 'DSEPP/P1/Q40'];
  const ROMAN = ['DSE2019/I/Q12', 'CE2006/II/Q32', 'AL2002/I/Q17', 'DSESP/I/Q3', 'DSEPP/I/Q40'];

  it('reads every kind of source the bank writes, from either side', () => {
    ALL.forEach((question, index) => {
      const parts = sourceParts(question.provenance!)!;
      expect(shortSource(parts, 'short')).toBe(SHORT[index]);
      expect(shortSource(parts, 'shortRoman')).toBe(ROMAN[index]);
      // The Chinese side alone reads the same.
      expect(sourceParts(bi('', question.provenance!.zh[0].text))).toEqual(parts);
    });
    expect(sourceParts(bi('Adapted from HKEAA', '改編自考評局'))).toBeUndefined();
    expect(shortSource({ exam: 'AL', when: '2002', paper: 4, number: 1 }, 'shortRoman')).toBe('AL2002/IV/Q1');
  });

  it('short prints the same label on English, Chinese and bilingual papers, in every backend', () => {
    for (const [format, expected] of [['short', SHORT], ['shortRoman', ROMAN]] as const) {
      const ws = paper(ALL, { showQuestionSources: true, questionSourceFormat: format });
      for (const language of LANGUAGES) {
        const ir = renderWorksheet(ws, { language, version: 'student' });
        expect(ir.questions.map((q) => printed(q.nodes, language))).toEqual(expected.map((tag) => `(${tag})`));
      }
      for (const language of LANGUAGES) {
        const xml = buildDocxParts(ws, { language, version: 'student' }).documentXml;
        for (const tag of expected) expect(xml).toContain(`(${tag})`);
        expect(xml).not.toContain(nb('HKDSE 2019 Paper 1'));
        expect(xml).not.toContain('香港中學文憑考試');
        const html = worksheetClipboardHtml(ws, { language, version: 'student' });
        for (const tag of expected) expect(html).toContain(`(${tag})`);
        // Once on a bilingual paper, not once per language.
        expect(html.split(`(${expected[0]})`).length - 1).toBe(1);
      }
    }
  });

  it('full is today\'s label, and a source a short form cannot read stays in full', () => {
    const own = pastMcq('X/P1/Q1', 'From our mock, 2024', '本校模擬試卷 2024');
    const ws = paper([Q1, own], { showQuestionSources: true, questionSourceFormat: 'short' });
    const ir = renderWorksheet(ws, { language: 'en', version: 'student' });
    expect(printed(ir.questions[0].nodes, 'en')).toBe('(DSE2019/P1/Q12)');
    expect(printed(ir.questions[1].nodes, 'en')).toBe('(From our mock, 2024)');
    const zhOwn = renderWorksheet(ws, { language: 'zh', version: 'student' });
    expect(printed(zhOwn.questions[1].nodes, 'zh')).toBe('（本校模擬試卷 2024）');
    const full = renderWorksheet(paper([Q1], { showQuestionSources: true }), { language: 'zh', version: 'student' });
    expect(printed(full.questions[0].nodes, 'zh')).toBe('（香港中學文憑考試 2019 卷一 第 12 題）');
  });

  it('keeps the place on every language: its own line above the question', () => {
    const ws = paper([Q2], { showQuestionSources: true, questionSourceFormat: 'shortRoman' });
    for (const language of LANGUAGES) {
      const nodes = renderWorksheet(ws, { language, version: 'student' }).questions[0].nodes;
      expect(printed(nodes, language)).toBe('(CE2006/II/Q32)');
      expect(numbered(nodes).trail).toBeUndefined();
    }
  });

  it('leaves numbering and the answer key exactly as they were', () => {
    const off = paper(ALL);
    for (const format of ['short', 'shortRoman'] as const) {
      const on = paper(ALL, { showQuestionSources: true, questionSourceFormat: format });
      expect(computeNumbering(on)).toEqual(computeNumbering(off));
      for (const language of LANGUAGES) {
        expect(renderAnswerKey(on, language)).toEqual(renderAnswerKey(off, language));
        expect(buildAnswerKeyDocxParts(on, language).documentXml).toBe(buildAnswerKeyDocxParts(off, language).documentXml);
      }
    }
  });

  it('a format with the switch off prints nothing', () => {
    const ws = paper(ALL, { questionSourceFormat: 'short' });
    for (const mode of MODES) {
      for (const question of renderWorksheet(ws, mode).questions) expect(sourceLine(question.nodes)).toBeUndefined();
    }
  });

  it('is stored only when not full, survives save and reload, and old papers read as full', () => {
    const on = withQuestionSources(paper(), true);
    expect(withQuestionSourceFormat(on, 'full')).toBe(on);
    const short = withQuestionSourceFormat(on, 'short');
    expect(short.questionSourceFormat).toBe('short');
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(short))));
    expect(reloaded.questionSourceFormat).toBe('short');
    expect(reloaded.__unknown).toBeUndefined();
    expect('questionSourceFormat' in withQuestionSourceFormat(short, 'full')).toBe(false);
    expect(questionSourceFormat(paper(undefined, { questionSourceFormat: 'tiny' as never }))).toBe('full');
    for (const corpus of [v1Corpus, v1Mcq]) {
      const loaded = migrate(structuredClone(corpus));
      expect(loaded.questionSourceFormat).toBeUndefined();
      expect(questionSourceFormat(loaded)).toBe('full');
    }
  });

  describe('the bank applies the remembered format with the switch', () => {
    const item = (question: McqQuestion): PastPaperItem => ({
      topicId: 't',
      docId: 'pp-bank-t',
      question,
      source: tagOf(question),
      provenance: { en: question.provenance!.en[0].text, zh: question.provenance!.zh[0].text },
      excerpt: { en: '', zh: '' },
      searchText: '',
    });

    beforeEach(() => {
      useWorksheetStore.getState().replaceWorksheet(createWorksheet());
      useBankSession.setState({ review: null });
    });

    it('a short format goes in with the first sourced questions; one ⌘Z takes all', () => {
      insertIntoOpen([item(Q1)], () => '', { showSources: true, sourceFormat: 'shortRoman' });
      const ws = useWorksheetStore.getState().worksheet;
      expect(ws.showQuestionSources).toBe(true);
      expect(ws.questionSourceFormat).toBe('shortRoman');
      useWorksheetStore.getState().undo();
      expect(useWorksheetStore.getState().worksheet.questionSourceFormat).toBeUndefined();
      expect(useWorksheetStore.getState().worksheet.showQuestionSources).toBeUndefined();
    });

    it('full stores nothing, and clears a stale format left on a paper with no sourced question', () => {
      insertIntoOpen([item(Q1)], () => '', { showSources: true, sourceFormat: 'full' });
      expect('questionSourceFormat' in useWorksheetStore.getState().worksheet).toBe(false);
      useWorksheetStore.getState().replaceWorksheet({ ...createWorksheet(), questionSourceFormat: 'short' });
      insertIntoOpen([item(Q2)], () => '', { showSources: true, sourceFormat: 'full' });
      const saved = JSON.parse(JSON.stringify(serializeWorksheet(useWorksheetStore.getState().worksheet)));
      expect(saved.questionSourceFormat).toBeUndefined();
      expect(questionSourceFormat(useWorksheetStore.getState().worksheet)).toBe('full');
    });

    it('with Show source off, the format changes nothing', () => {
      insertIntoOpen([item(Q1)], () => '', { showSources: false, sourceFormat: 'short' });
      expect(useWorksheetStore.getState().worksheet.questionSourceFormat).toBeUndefined();
    });
  });
});
