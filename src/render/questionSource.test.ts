import { beforeEach, describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import v1Mcq from '@/test/corpus/v1-mcq.json';
import { useBankSession } from '@/components/bank/bankSession';
import { buildAnswerKeyDocxParts, buildDocxParts } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { createMcqQuestion, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { computeNumbering, listIndentScheme } from '@/model/numbering';
import { bi } from '@/model/text';
import type { LanguageMode, McqQuestion, OutputMode, Question, Worksheet } from '@/model/types';
import { insertIntoOpen } from '@/pastpapers/actions';
import type { PastPaperItem } from '@/pastpapers/pack';
import { sourceOf as tagOf } from '@/pastpapers/pack';
import { useWorksheetStore } from '@/store/worksheetStore';
import { renderAnswerKey } from './answerKey';
import { DEFAULT_PAGE_METRICS, trailLabel, type RenderNode, type TextNode } from './ir';
import { hasQuestionSources, lastLineReach, printsQuestionSources, sourceFits, sourceTrail, withQuestionSources } from './questionSource';
import { renderWorksheet } from './worksheet';

/**
 * A question's source on the paper (user u-w7gs): `Worksheet.showQuestionSources` puts each
 * question's `provenance` in brackets at the right of its numbered line, in every backend,
 * and off (the default, and every saved paper) changes nothing at all.
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

describe('off: the default, and every saved paper', () => {
  it('prints exactly what it printed before (IR, .docx, clipboard, answer key) in every language and copy', () => {
    const off = paper();
    expect(withQuestionSources(off, false)).toBe(off);
    for (const mode of MODES) {
      const ir = renderWorksheet(off, mode);
      for (const question of ir.questions) expect(numbered(question.nodes).trail).toBeUndefined();
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
      }
    }
  });
});

describe('on', () => {
  const on = paper(undefined, { showQuestionSources: true });

  it('puts the bracketed source on the numbered line, each language its own side', () => {
    const ir = renderWorksheet(on, { language: 'en', version: 'student' });
    const [first, second] = ir.questions.map((q) => numbered(q.nodes));
    expect(label(first.trail, 'en')).toBe('(HKDSE 2019 Paper 1 Q12)');
    expect(label(first.trail, 'zh')).toBe('（香港中學文憑考試 2019 卷一 第 12 題）');
    expect(label(second.trail, 'en')).toBe('(HKCEE 2006 Paper 2 Q32)');
    expect(label(second.trail, 'zh')).toBe('（香港中學會考 2006 卷二 第 32 題）');
    // The stem's own words are untouched: the source is beside them, not in them.
    expect(first.text).toEqual(Q1.blocks[0].kind === 'paragraph' ? Q1.blocks[0].text : undefined);
  });

  it('adds no node, so numbering, keeps and the page flow stay as they were', () => {
    const off = paper();
    for (const mode of MODES) {
      const before = renderWorksheet(off, mode);
      const after = renderWorksheet(on, mode);
      expect(after.questions.map((q) => q.number)).toEqual(before.questions.map((q) => q.number));
      after.questions.forEach((question, index) => {
        const stripped = question.nodes.map((node) => (node.kind === 'text' && node.trail ? { ...node, trail: undefined, trailOwnLine: undefined } : node));
        expect(stripped).toEqual(before.questions[index].nodes.map((node) => (node.kind === 'text' && node.trail ? { ...node, trail: undefined, trailOwnLine: undefined } : node)));
      });
    }
    expect(computeNumbering(on)).toEqual(computeNumbering(off));
  });

  it('prints in the .docx and the clipboard, English and Chinese, student and teacher', () => {
    for (const version of ['student', 'teacher'] as const) {
      const en = buildDocxParts(on, { language: 'en', version }).documentXml;
      expect(en).toContain(nb('(HKDSE 2019 Paper 1 Q12)'));
      expect(en).toContain(nb('(HKCEE 2006 Paper 2 Q32)'));
      // On the question's numbered line, after a tab, as a marks label rides.
      expect(en).toMatch(/<w:tab\/><\/w:r><w:r>(?:(?!<\/w:p>).)*\(HKDSE 2019 Paper 1 Q12\)/);
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
        expect(label(numbered(question.nodes).trail, 'en')).toBe(`(${original.provenance!.en[0].text})`);
      }
    }
  });

  it('prints nothing for a question without a source, and never over a marks label', () => {
    const plainMcq = { ...pastMcq('X/P1/Q1', '', ''), provenance: undefined };
    const structured = createStructuredQuestion();
    const ws = paper([plainMcq, structured, Q1], { showQuestionSources: true });
    const ir = renderWorksheet(ws, { language: 'en', version: 'student' });
    expect(numbered(ir.questions[0].nodes).trail).toBeUndefined();
    expect(numbered(ir.questions[1].nodes)?.trail).toBeUndefined();
    expect(numbered(ir.questions[2].nodes).trail).toBeDefined();
  });

  it('a stem opening with a picture still gets it on its number line', () => {
    const q = pastMcq('DSE2024/P1/Q23', 'HKDSE 2024 Paper 1 Q23', '香港中學文憑考試 2024 卷一 第 23 題');
    q.blocks = [{ kind: 'image', id: 'img', src: 'data:image/png;base64,iVBORw0KGgo=', widthPx: 100, heightPx: 50 } as McqQuestion['blocks'][number], ...q.blocks];
    const ir = renderWorksheet(paper([q], { showQuestionSources: true }), { language: 'en', version: 'student' });
    expect(label(numbered(ir.questions[0].nodes).trail, 'en')).toBe('(HKDSE 2024 Paper 1 Q23)');
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

describe('a label that does not fit goes on a line of its own, in every backend', () => {
  const page = { ...DEFAULT_PAGE_METRICS };
  const indents = listIndentScheme('classroom');
  const width = page.textWidth - indents.question[0].left;

  it('a short stem keeps it beside its words; a full last line moves it down', () => {
    const short = renderWorksheet(paper([Q2], { showQuestionSources: true }), { language: 'en', version: 'student' });
    expect(numbered(short.questions[0].nodes).trailOwnLine).toBeUndefined();
    // Words up to just short of the margin: the label cannot fit after them.
    let words = 'Which';
    while (lastLineReach([{ text: `${words} word` }], width, page.fontSize, page.latinFont) > lastLineReach([{ text: words }], width, page.fontSize, page.latinFont)) words += ' word';
    const full = pastMcq('DSE2020/P1/Q1', 'HKDSE 2020 Paper 1 Q1', '香港中學文憑考試 2020 卷一 第 1 題', `${words}?`);
    const ws = paper([full], { showQuestionSources: true });
    const node = numbered(renderWorksheet(ws, { language: 'en', version: 'student' }).questions[0].nodes);
    expect(node.trailOwnLine).toBe(true);
    // The .docx breaks the line before the label's tab, so Word cannot tear it or leave it short.
    expect(buildDocxParts(ws, { language: 'en', version: 'student' }).documentXml).toMatch(/<w:br\/><\/w:r><w:r><w:tab\/><\/w:r><w:r>(?:(?!<\/w:p>).)*HKDSE\u00a02020/);
    expect(worksheetClipboardHtml(ws, { language: 'en', version: 'student' })).toMatch(/<br><span style="float:right">\(HKDSE\u00a02020/);
  });

  it('Chinese, which breaks anywhere, is judged the same way', () => {
    const zh = pastMcq('CE2006/P2/Q32', 'HKCEE 2006 Paper 2 Q32', '香港中學會考 2006 卷二 第 32 題');
    zh.blocks = [{ kind: 'paragraph', id: 'zh-stem', text: bi('x', '下列哪項最有可能導致一個經濟體系的潛在本地生產總值 (即最大生產能力) 增加？') }];
    const node = numbered(renderWorksheet(paper([zh], { showQuestionSources: true }), { language: 'zh', version: 'student' }).questions[0].nodes);
    expect(node.trailOwnLine).toBe(true);
    const shortZh = { ...zh, blocks: [{ kind: 'paragraph' as const, id: 'zh-stem', text: bi('x', '下列哪項正確？') }] };
    expect(numbered(renderWorksheet(paper([shortZh], { showQuestionSources: true }), { language: 'zh', version: 'student' }).questions[0].nodes).trailOwnLine).toBeUndefined();
  });

  it('a bilingual paper always gives it its own line', () => {
    const node = numbered(renderWorksheet(paper([Q2], { showQuestionSources: true }), { language: 'bilingual', version: 'student' }).questions[0].nodes);
    expect(node.trailOwnLine).toBe(true);
  });

  it('the reach of a wrapped line', () => {
    const one = lastLineReach([{ text: 'Short line' }], width, page.fontSize, page.latinFont);
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(width / 4);
    const long = lastLineReach([{ text: 'word '.repeat(200) }], width, page.fontSize, page.latinFont);
    expect(long).toBeLessThanOrEqual(width);
    // Without the fit check, a label on a full line would not be flagged.
    expect(sourceFits(numbered(renderWorksheet(paper([Q2]), { language: 'en', version: 'student' }).questions[0].nodes), '(HKCEE 2006 Paper 2 Q32)', 'en', page, indents)).toBe(true);
  });
});
