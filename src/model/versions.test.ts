import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { docxFileName } from '@/export/docx';
import { exportFileCount } from '@/components/editor/exportSession';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { bi, plain } from '@/model/text';
import type { McqQuestion, OutputMode, Worksheet } from '@/model/types';
import { mcqType } from '@/registry/mcq';
import { renderAnswerKey } from '@/render/answerKey';
import type { RenderNode, TableNode, TextNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import {
  activeVersion,
  shuffledOrder,
  versionCount,
  versionLetters,
} from './versions';

const STUDENT: OutputMode = { language: 'en', version: 'student' };

function mcq(texts: string[], answerIndex = 0): McqQuestion {
  const question = createMcqQuestion();
  question.blocks = [{ kind: 'paragraph', id: `${question.id}-stem`, text: bi('Stem', '題幹') }];
  question.options = texts.map((text, index) => ({ id: `${question.id}-${index}`, text: bi(text, text) }));
  question.answerIndex = answerIndex;
  return question;
}

function paper(questions: McqQuestion[], versions?: Worksheet['versions']): Worksheet {
  return { ...createWorksheet(), questions, ...(versions ? { versions } : {}) };
}

/** The printed option texts of one rendered question. */
function printedOptions(worksheet: Worksheet, mode: OutputMode, index = 0): string[] {
  return renderWorksheet(worksheet, mode)
    .questions[index].nodes.filter((node): node is TextNode => node.kind === 'text' && node.style === 'MCQ Option')
    .map((node) => plain(node.text.en));
}

const texts = (nodes: RenderNode[]) =>
  nodes.filter((node): node is TextNode => node.kind === 'text').map((node) => plain(node.text.en));

describe('seeded order', () => {
  const key = { seed: 12345, version: 1, id: 'q1' };

  it('is deterministic per (seed, version, id)', () => {
    const movable = [true, true, true, true];
    expect(shuffledOrder(movable, key)).toEqual(shuffledOrder(movable, key));
    const orders = new Set(
      ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map((id) => shuffledOrder(movable, { ...key, id }).join('')),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('keeps version A as authored and never prints B identical to it', () => {
    const movable = [true, true, true, true];
    expect(shuffledOrder(movable, { ...key, version: 0 })).toEqual([0, 1, 2, 3]);
    for (let seed = 1; seed < 200; seed++) {
      expect(shuffledOrder(movable, { ...key, seed })).not.toEqual([0, 1, 2, 3]);
    }
  });

  it('leaves fixed slots in place', () => {
    for (let seed = 1; seed < 100; seed++) {
      const order = shuffledOrder([true, false, true, true], { ...key, seed });
      expect(order[1]).toBe(1);
      expect([...order].sort()).toEqual([0, 1, 2, 3]);
    }
  });
});

describe('version count and letter', () => {
  it('is off when absent or 1, and clamps to 4', () => {
    expect(versionCount(paper([]))).toBe(1);
    expect(versionLetters(paper([], { count: 1, seed: 1 }))).toEqual([]);
    expect(versionLetters(paper([], { count: 9, seed: 1 }))).toEqual(['A', 'B', 'C', 'D']);
  });

  it('prints A for an unknown letter, nothing when off', () => {
    const on = paper([], { count: 3, seed: 1 });
    expect(activeVersion(on, { ...STUDENT, variant: 'C' })).toBe(2);
    expect(activeVersion(on, { ...STUDENT, variant: 'Z' })).toBe(0);
    expect(activeVersion(paper([]), { ...STUDENT, variant: 'B' })).toBeUndefined();
  });
});

describe('mcq variant', () => {
  const variantOf = (question: McqQuestion, version = 1, seed = 42) =>
    mcqType.variant!(question, { seed, version });

  it('moves the key with its option', () => {
    for (let seed = 1; seed < 50; seed++) {
      const question = mcq(['w', 'x', 'y', 'z'], 2);
      const shown = variantOf(question, 1, seed).question;
      expect(plain(shown.options[shown.answerIndex].text.en)).toBe('y');
    }
  });

  it('never reorders a combination question', () => {
    const withStatements = { ...mcq(['a', 'b', 'c', 'd']), statements: [bi('s1', 's1'), bi('s2', 's2')] };
    expect(variantOf(withStatements).question).toBe(withStatements);
    const combos = mcq(['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)']);
    expect(variantOf(combos).question).toBe(combos);
  });

  it('keeps pinned and positional options at their letter', () => {
    for (let seed = 1; seed < 50; seed++) {
      const question = mcq(['p', 'q', 'r', 'All of the above']);
      question.options[0].pinned = true;
      const shown = variantOf(question, 1, seed).question.options.map((o) => plain(o.text.en));
      expect(shown[0]).toBe('p');
      expect(shown[3]).toBe('All of the above');
    }
    for (const fixed of ['None of these', '以上皆是', '以上皆非', 'Both A and B']) {
      const shown = variantOf(mcq(['p', 'q', 'r', fixed])).question.options.map((o) => plain(o.text.en));
      expect(shown[3]).toBe(fixed);
    }
  });

  it('reports each printed option’s version A letter', () => {
    const question = mcq(['w', 'x', 'y', 'z']);
    const { question: shown, sourceLetters } = variantOf(question);
    expect(sourceLetters).toHaveLength(4);
    sourceLetters!.forEach((letter, printed) => {
      expect(shown.options[printed]).toBe(question.options[letter.charCodeAt(0) - 65]);
    });
  });
});

describe('rendered versions', () => {
  it('prints the version letter only when versions are on', () => {
    const off = paper([mcq(['w', 'x', 'y', 'z'])]);
    expect(renderWorksheet(off, { ...STUDENT, variant: 'B' }).versionLabel).toBeUndefined();
    const on = paper(off.questions as McqQuestion[], { count: 2, seed: 5 });
    const label = renderWorksheet(on, { ...STUDENT, variant: 'B' }).versionLabel as TextNode;
    expect(plain(label.text.en)).toBe('Version B');
    const zh = renderWorksheet(on, { language: 'zh', version: 'student', variant: 'B' }).versionLabel as TextNode;
    expect(plain(zh.text.zh)).toBe('版本 B');
  });

  it('prints A as authored and B shuffled, and the teacher key follows', () => {
    const question = mcq(['w', 'x', 'y', 'z'], 1);
    const worksheet = paper([question], { count: 2, seed: 99 });
    expect(printedOptions(worksheet, STUDENT)).toEqual(['w', 'x', 'y', 'z']);
    const b = printedOptions(worksheet, { ...STUDENT, variant: 'B' });
    expect(b).not.toEqual(['w', 'x', 'y', 'z']);
    expect([...b].sort()).toEqual(['w', 'x', 'y', 'z']);

    const teacher = renderWorksheet(worksheet, { language: 'en', version: 'teacher', variant: 'B' });
    const answer = texts(teacher.questions[0].nodes).find((text) => text.startsWith('Answer:'));
    expect(answer).toBe(`Answer: ${String.fromCharCode(65 + b.indexOf('x'))}`);
  });

  it('re-renders when the seed changes, though the question object did not', () => {
    const question = mcq(['w', 'x', 'y', 'z']);
    const mode = { ...STUDENT, variant: 'B' };
    const seeds = new Set<string>();
    for (let seed = 1; seed < 8; seed++) {
      seeds.add(printedOptions(paper([question], { count: 2, seed }), mode).join(''));
    }
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('names each version’s file', () => {
    const worksheet = { ...paper([], { count: 2, seed: 1 }), name: 'Quiz' };
    expect(docxFileName(worksheet, { ...STUDENT, variant: 'B' })).toBe('Quiz-B (Student) (EN).docx');
    expect(docxFileName({ ...worksheet, versions: undefined }, STUDENT)).toBe('Quiz (Student) (EN).docx');
  });

  it('exports one paper per version', () => {
    expect(exportFileCount({ what: 'both', variants: ['A', 'B', 'C'] })).toBe(4);
    expect(exportFileCount({ what: 'paper' })).toBe(1);
    expect(exportFileCount({ what: 'answerKey', variants: ['A', 'B'] })).toBe(1);
  });
});

describe('versioned answer key', () => {
  it('keys every version and maps each back to A', () => {
    const questions = [mcq(['w', 'x', 'y', 'z'], 0), mcq(['p', 'q', 'r', 'All of the above'], 3)];
    const worksheet = paper(questions, { count: 3, seed: 7 });
    const nodes = renderAnswerKey(worksheet, 'en');
    const headings = nodes
      .filter((node): node is TextNode => node.kind === 'text' && node.style === 'Section Heading')
      .map((node) => plain(node.text.en));
    expect(headings).toEqual(['Version A', 'Version B', 'Version C', 'Version map']);

    const tables = nodes.filter((node): node is TableNode => node.kind === 'table');
    expect(tables).toHaveLength(4);
    // Each version's grid letter is where that version printed the keyed option.
    ['A', 'B', 'C'].forEach((variant, index) => {
      const printed = printedOptions(worksheet, { ...STUDENT, variant });
      const letter = plain(tables[index].rows[0][1].text.en);
      expect(printed[letter.charCodeAt(0) - 65]).toBe('w');
      // Question 2's key is "All of the above", which never moves.
      expect(plain(tables[index].rows[0][3].text.en)).toBe('D');
    });

    const map = tables[3];
    expect(map.rows[0].map((cell) => plain(cell.text.en))).toEqual(['', 'B', 'C']);
    expect(plain(map.rows[1][1].text.en)).toMatch(/^A→[A-D] {2}B→[A-D] {2}C→[A-D] {2}D→[A-D]$/);
    expect(plain(map.rows[2][1].text.en)).toMatch(/D→D$/);
  });

  it('is unchanged when versions are off', () => {
    const questions = [mcq(['w', 'x', 'y', 'z'], 2)];
    expect(renderAnswerKey(paper(questions, { count: 1, seed: 7 }), 'en')).toEqual(
      renderAnswerKey(paper(questions), 'en'),
    );
  });
});

describe('the stored field', () => {
  it('survives a save and reload', () => {
    const worksheet = paper([mcq(['w', 'x', 'y', 'z'])], { count: 3, seed: 7 });
    (worksheet.questions[0] as McqQuestion).options[1].pinned = true;
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    expect(reloaded.versions).toEqual({ count: 3, seed: 7 });
    expect((reloaded.questions[0] as McqQuestion).options[1].pinned).toBe(true);
    expect(reloaded.__unknown).toBeUndefined();
  });

  it('is absent from the published corpus, which renders as it always did', () => {
    const worksheet = migrate(v1Corpus);
    expect(worksheet.versions).toBeUndefined();
    const plainRender = renderWorksheet(worksheet, STUDENT);
    expect(plainRender.versionLabel).toBeUndefined();
    expect(renderWorksheet(worksheet, { ...STUDENT, variant: 'B' })).toEqual(plainRender);
  });
});
