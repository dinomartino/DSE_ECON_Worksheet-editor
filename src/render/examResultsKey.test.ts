/**
 * Exam results in the answer key (k-0471, GitHub #6): each MC answer's % correct as
 * "A (65%)" in every MC layout, a Candidates' performance section at the end, both off by
 * their switches, and nothing at all printed (byte for byte) when nothing is entered.
 */
import { describe, expect, it } from 'vitest';
import { buildAnswerKeyDocxParts } from '@/export/docx';
import { clipboardNodeHtml } from '@/export/clipboard';
import { withAnswerKeyPreset, withAnswerKeySetting } from '@/model/answerKeyLayout';
import { createMcqQuestion } from '@/model/factories';
import { bi, plain } from '@/model/text';
import type { AnswerKeyLayout, ExamResults, LanguageMode, McqQuestion, McKeyLayout, Worksheet } from '@/model/types';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { withFlow } from '@/test/fixtures';
import { renderAnswerKey } from './answerKey';
import type { RenderNode } from './ir';
import { EXAM_RESULTS_WORDING } from './examResultsKey';

/** Three MC questions (keys B, C, unset) before the scheme fixture's structured ones. */
function fixture(examResults?: ExamResults, layout?: AnswerKeyLayout): Worksheet {
  const base = buildMarkSchemeWorksheet();
  const mcqs = [1, 2, undefined].map((answerIndex) => {
    const mcq = createMcqQuestion() as McqQuestion;
    if (answerIndex === undefined) delete (mcq as { answerIndex?: number }).answerIndex;
    else mcq.answerIndex = answerIndex;
    mcq.explanation = bi('Because.', '因為。');
    mcq.options = mcq.options.map((option, index) =>
      index === 0 ? { ...option, rationale: bi('Not this one.', '不是這個。') } : option,
    );
    return mcq;
  });
  const worksheet = withFlow(base, [...mcqs, ...base.questions]);
  if (examResults) worksheet.examResults = examResults;
  if (layout) worksheet.answerKeyLayout = layout;
  return worksheet;
}

const ids = (worksheet: Worksheet) => worksheet.questions.filter((q) => q.type === 'mcq').map((q) => q.id);

/** A fixture whose first and third MC questions have a % entered, plus both comments. */
function withResults(layout?: AnswerKeyLayout): Worksheet {
  const worksheet = fixture(undefined, layout);
  const [first, , third] = ids(worksheet);
  worksheet.examResults = {
    mcPercent: { [first]: 65, [third]: 42.5 },
    mcComments: bi('Q2 was the hardest.\nMany chose D.', '第2題最難。\n很多考生選D。'),
    sqComments: bi('Diagrams were weak.', ''),
  };
  return worksheet;
}

/** Every printed string of a key, a cell or a line each, on one side. */
function printed(nodes: RenderNode[], side: 'en' | 'zh' = 'en'): string[] {
  return nodes.flatMap((node): string[] => {
    if (node.kind === 'text') return [plain(node.text[side])];
    if (node.kind === 'columns') return [node.cells.map((cell) => plain(cell.text[side])).join(' ')];
    if (node.kind === 'table') return node.rows.flat().map((cell) => plain(cell.text[side]));
    return [];
  });
}

const MC_LAYOUTS: McKeyLayout[] = ['grid', 'hkeaaTable', 'list', 'rationaleTable'];

describe('MC % correct in the key', () => {
  it.each(MC_LAYOUTS)('prints "B (65%)" in the %s layout, only where entered', (mcLayout) => {
    const nodes = renderAnswerKey(withResults({ mcLayout }), 'en');
    const text = printed(nodes).join('\n');
    expect(text).toContain('B (65%)');
    expect(text).toContain('— (42.5%)');
    // The second question has no % entered: its key is the letter alone.
    expect(text).not.toMatch(/C \(/);
    expect(text).toMatch(/(^|\s)C($|\s)/m);
  });

  it('prints it in every preset, Suggested answers included', () => {
    for (const preset of ['classic', 'hkeaa', 'suggested', 'detailed'] as const) {
      const nodes = renderAnswerKey(withResults(withAnswerKeyPreset(undefined, preset)), 'en');
      expect(printed(nodes).join('\n')).toContain('B (65%)');
    }
  });

  it('keeps the letter bold and the % plain in the grid', () => {
    const nodes = renderAnswerKey(withResults(), 'en');
    const grid = nodes.find((node) => node.kind === 'table');
    const cell = grid?.kind === 'table' ? grid.rows[0][1] : undefined;
    expect(cell!.text.en).toEqual([{ text: 'B', bold: true }, { text: ' (65%)' }]);
    expect(cell!.format?.bold).toBeUndefined();
  });

  it('prints the % once in a bilingual key, as the letter is', () => {
    const nodes = renderAnswerKey(withResults(), 'bilingual');
    const grid = nodes.find((node) => node.kind === 'table');
    const cell = grid?.kind === 'table' ? grid.rows[0][1] : undefined;
    expect(cell!.text.zh).toEqual([]);
  });

  it('prints in each version’s table when versions are on', () => {
    const worksheet = withResults();
    worksheet.versions = { count: 2, seed: 7 };
    const text = printed(renderAnswerKey(worksheet, 'en')).join('\n');
    expect(text.match(/\(65%\)/g)?.length).toBe(2);
  });

  it('is switched off by "MC % correct"', () => {
    const layout = withAnswerKeySetting(undefined, 'showMcPercent', false);
    expect(printed(renderAnswerKey(withResults(layout), 'en')).join('\n')).not.toContain('%)');
  });
});

describe('Candidates’ performance at the end of the key', () => {
  it('prints the heading, then each comment under its label, a paragraph per line', () => {
    const lines = printed(renderAnswerKey(withResults(), 'en'));
    const at = lines.indexOf(EXAM_RESULTS_WORDING.heading.en);
    expect(at).toBeGreaterThan(0);
    expect(lines.slice(at).filter((line) => line !== '')).toEqual([
      'Candidates’ performance',
      'Multiple-choice questions',
      'Q2 was the hardest.',
      'Many chose D.',
      'Structured questions',
      'Diagrams were weak.',
    ]);
  });

  it('borrows the English comment in a 中文 key when no 中文 is typed', () => {
    const lines = printed(renderAnswerKey(withResults(), 'zh'), 'zh');
    expect(lines).toContain('考生表現');
    expect(lines).toContain('第2題最難。');
    expect(lines).toContain('Diagrams were weak.');
  });

  it('closes the key even after the version map', () => {
    const worksheet = withResults();
    worksheet.versions = { count: 2, seed: 7 };
    const lines = printed(renderAnswerKey(worksheet, 'en')).filter((line) => line !== '');
    expect(lines[lines.length - 1]).toBe('Diagrams were weak.');
  });

  it('prints only the comments typed', () => {
    const worksheet = fixture({ sqComments: bi('', '圖表欠佳。') });
    const lines = printed(renderAnswerKey(worksheet, 'en'));
    expect(lines).toContain('Structured questions');
    expect(lines).not.toContain('Multiple-choice questions');
  });

  it('is switched off by "Candidates’ performance"', () => {
    const layout = withAnswerKeySetting(undefined, 'showPerformance', false);
    expect(printed(renderAnswerKey(withResults(layout), 'en'))).not.toContain(EXAM_RESULTS_WORDING.heading.en);
  });
});

describe('nothing entered prints the key as before', () => {
  const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];

  const base = fixture();
  const results = (examResults: ExamResults): Worksheet => ({ ...base, examResults });

  it.each(LANGUAGES)('in %s: no field, an empty one, a % for a question no longer on the paper', (language) => {
    const before = JSON.stringify(renderAnswerKey(base, language));
    expect(JSON.stringify(renderAnswerKey(results({}), language))).toBe(before);
    expect(JSON.stringify(renderAnswerKey(results({ mcPercent: { gone: 50 } }), language))).toBe(before);
    expect(JSON.stringify(renderAnswerKey(results({ mcComments: bi('', '') }), language))).toBe(before);
  });

  it('the .docx is byte-identical without results', () => {
    expect(buildAnswerKeyDocxParts(results({}), 'bilingual').documentXml).toBe(
      buildAnswerKeyDocxParts(base, 'bilingual').documentXml,
    );
  });
});

describe('every backend prints it', () => {
  it('the .docx key carries the % and the comments', () => {
    const xml = buildAnswerKeyDocxParts(withResults({ mcLayout: 'hkeaaTable' }), 'en').documentXml;
    expect(xml).toContain('B (65%)');
    expect(xml).toContain('Candidates’ performance');
    expect(xml).toContain('Many chose D.');
  });

  it('the grid’s .docx cell has the letter bold and the % plain', () => {
    const xml = buildAnswerKeyDocxParts(withResults(), 'en').documentXml;
    expect(xml).toMatch(/<w:b\/>[\s\S]{0,400}?<w:t[^>]*>B<\/w:t>/);
    expect(xml).toContain(' (65%)');
  });

  it('Copy for Word carries it', () => {
    const html = renderAnswerKey(withResults(), 'en')
      .map((node) => clipboardNodeHtml(node, 'en', '', new Map(), 9026))
      .join('');
    expect(html).toContain('(65%)');
    expect(html).toContain('Many chose D.');
  });
});
