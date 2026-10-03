import { describe, expect, it } from 'vitest';
import { createPart, createWorksheet } from '@/model/factories';
import {
  applyDeleteTarget,
  applyEditTarget,
  describeDelete,
  editTargetKey,
  targetQuestionId,
  textOfTarget,
} from '@/model/edits';
import { migrate, serializeWorksheet } from '@/model/migrations';
import { checkPaper } from '@/model/paperHealth';
import { collectTexts } from '@/model/textWalk';
import { bi, plain } from '@/model/text';
import type { MarkScheme } from '@/model/markSchemeTypes';
import type { AnswerLeaf } from '@/model/answerLeaves';
import type { LanguageMode, LqKeyLayout, OutputMode, StructuredQuestion, Worksheet } from '@/model/types';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { buildAnswerKeyDocxParts, buildDocxParts } from '@/export/docx';
import { answerKeyView } from '@/render/answerKey';
import type { EditTarget, RenderNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { structuredType } from './structured';

/** An essay: a structured question with no parts carries its own answer and scheme. */

const ANSWER = 'ESSAY-ANSWER-SECRET';
const POINT = 'ESSAY-POINT-SECRET';
const LEVEL = 'ESSAY-LEVEL-SECRET';
const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];

const scheme = (marks: number): MarkScheme => ({
  routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi(POINT, `${POINT}中`), marks }] }] }],
  levels: [{ id: 'l1', min: 1, max: marks, descriptor: bi(LEVEL, `${LEVEL}中`) }],
});

function essay(extra: Partial<StructuredQuestion> = {}): Worksheet {
  const question: StructuredQuestion = {
    id: 'q1',
    type: 'structured',
    blocks: [{ kind: 'paragraph', id: 'stem', text: bi('Discuss the minimum wage.', '討論最低工資。') }],
    parts: [],
    marks: 8,
    answer: bi(ANSWER, `${ANSWER}中`),
    scheme: scheme(8),
    answerSpace: 10,
    ...extra,
  };
  const worksheet = createWorksheet();
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

const nodesOf = (worksheet: Worksheet, mode: OutputMode): RenderNode[] =>
  renderWorksheet(worksheet, mode).items.flatMap((item) => (item.type === 'question' ? item.question.nodes : []));

const textOf = (nodes: RenderNode[]) =>
  nodes.map((node) => (node.kind === 'text' ? plain(node.text.en) : node.kind)).join('|');

/** Every edit target on text nodes, segments included. */
const targets = (nodes: RenderNode[]): EditTarget[] =>
  nodes.flatMap((node) => {
    if (node.kind !== 'text') return [];
    const segments = [...(node.segments?.en ?? []), ...(node.segments?.zh ?? [])];
    return [
      ...(node.edit ? [node.edit] : []),
      ...segments.flatMap((segment) => ('edit' in segment ? [segment.edit] : [])),
    ];
  });

describe('an essay with no parts — the paper', () => {
  it('prints its answer then its scheme under the stem in the teacher version, before the writing room', () => {
    const nodes = nodesOf(essay(), { language: 'en', version: 'teacher' });
    const text = textOf(nodes);
    expect(text.indexOf(ANSWER)).toBeGreaterThan(text.indexOf('Discuss'));
    expect(text.indexOf(POINT)).toBeGreaterThan(text.indexOf(ANSWER));
    expect(text.indexOf('answerSpace')).toBeGreaterThan(text.indexOf(LEVEL));
    const kinds = targets(nodes).map((target) => target.kind);
    expect(kinds).toContain('questionAnswer');
    expect(kinds).toContain('schemePoint');
    expect(kinds).toContain('schemeLevel');
  });

  it('never reaches the student copy in any backend', () => {
    const worksheet = essay();
    for (const language of LANGUAGES) {
      const mode: OutputMode = { language, version: 'student' };
      expect(textOf(nodesOf(worksheet, mode))).not.toContain('SECRET');
      expect(buildDocxParts(worksheet, mode).documentXml).not.toContain('SECRET');
      expect(worksheetClipboardHtml(worksheet, mode)).not.toContain('SECRET');
    }
    expect(buildDocxParts(worksheet, { language: 'en', version: 'teacher' }).documentXml).toContain(ANSWER);
  });

  it('is not printed once the question has parts (the parts carry the answers then)', () => {
    const worksheet = essay({ parts: [createPart()] });
    expect(textOf(nodesOf(worksheet, { language: 'en', version: 'teacher' }))).not.toContain('SECRET');
    expect(JSON.stringify(answerKeyView(worksheet, 'en').nodes)).not.toContain('SECRET');
  });

  it('a question with neither prints as before', () => {
    const worksheet = essay({ answer: undefined, scheme: undefined });
    const teacher = nodesOf(worksheet, { language: 'en', version: 'teacher' });
    expect(teacher.filter((node) => node.kind === 'text' && node.style === 'Marking Scheme')).toEqual([]);
  });

  it('survives a save and reload', () => {
    const worksheet = essay();
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    const question = reloaded.questions[0] as StructuredQuestion;
    expect(question.answer).toEqual(bi(ANSWER, `${ANSWER}中`));
    expect(question.scheme).toEqual(scheme(8));
  });
});

describe('an essay with no parts — the answer key', () => {
  it('prints the answer and scheme under the question number in every long-question layout', () => {
    const layouts: LqKeyLayout[] = ['compact', 'marksColumn', 'table', 'answers'];
    for (const lqLayout of layouts) {
      const worksheet = { ...essay(), answerKeyLayout: { lqLayout } };
      const json = JSON.stringify(answerKeyView(worksheet, 'en').nodes);
      expect(json, lqLayout).toContain(ANSWER);
      if (lqLayout !== 'answers') expect(json, lqLayout).toContain(POINT);
    }
    // Suggested answers is a student handout: the answer, never the levels.
    const handout = JSON.stringify(answerKeyView({ ...essay(), answerKeyLayout: { preset: 'suggested' } }, 'en').nodes);
    expect(handout).toContain(ANSWER);
    expect(handout).not.toContain(LEVEL);
  });

  it('types the answer and scheme in place, writing the one stored copy', () => {
    const worksheet = essay();
    const view = answerKeyView(worksheet, 'en');
    const found = targets(view.nodes);
    const answer = found.find((target) => target.kind === 'questionAnswer')!;
    const point = found.find((target) => target.kind === 'schemePoint')!;
    expect(answer).toEqual({ kind: 'questionAnswer', questionId: 'q1' });
    expect(point).toEqual({ kind: 'schemePoint', questionId: 'q1', pointId: 'p' });
    // Every target belongs to the essay's own entry.
    view.nodes.forEach((node, index) => {
      for (const target of targets([node])) expect(view.owners[index]).toBe(targetQuestionId(worksheet, target));
    });

    const typed = applyEditTarget(applyEditTarget(worksheet, answer, bi('New answer', '新答案')), point, bi('New point', '新要點'));
    const question = typed.questions[0] as StructuredQuestion;
    expect(textOfTarget(typed, answer)).toEqual(bi('New answer', '新答案'));
    expect(textOfTarget(typed, point)).toEqual(bi('New point', '新要點'));
    expect(question.scheme?.routes?.[0].groups[0].points[0].marks).toBe(8);
    expect(textOf(nodesOf(typed, { language: 'en', version: 'teacher' }))).toContain('New point');
    expect(buildAnswerKeyDocxParts(typed, 'en').documentXml).toContain('New answer');

    expect(editTargetKey(answer)).toBe('questionAnswer:q1');
    expect(describeDelete(answer)?.kind).toBe('answer');
    expect((applyDeleteTarget(typed, answer).questions[0] as StructuredQuestion).answer).toBeUndefined();
  });

  it('a stale scheme target changes nothing', () => {
    const worksheet = essay({ scheme: undefined });
    const stale: EditTarget = { kind: 'schemePoint', questionId: 'q1', pointId: 'p' };
    expect(applyEditTarget(worksheet, stale, bi('x', 'x'))).toBe(worksheet);
    expect(textOfTarget(worksheet, stale)).toBeUndefined();
  });
});

describe('an essay with no parts — checks, translation and the AI answer writer', () => {
  it('counts as unanswered without an answer, and checks its scheme against its marks', () => {
    const blank = checkPaper(essay({ answer: undefined, scheme: undefined }));
    expect(blank.findings.find((f) => f.id === 'unanswered')?.questions).toHaveLength(1);
    const answered = checkPaper(essay());
    expect(answered.findings.map((f) => f.id)).not.toContain('unanswered');
    expect(answered.findings.map((f) => f.id)).not.toContain('schemeMarks');
    expect(checkPaper(essay({ scheme: scheme(6) })).findings.map((f) => f.id)).toContain('schemeMarks');
  });

  it('offers its answer and scheme to translation, as teacher text', () => {
    const slots = collectTexts(essay()).filter((slot) => slot.role === 'teacher');
    expect(slots.map((slot) => slot.kind)).toEqual(expect.arrayContaining(['answer', 'schemePoint', 'schemeLevel']));
    expect(slots.find((slot) => slot.kind === 'answer')?.target).toEqual({ kind: 'questionAnswer', questionId: 'q1' });
  });

  it('is one written leaf for the AI answer writer, filled only where empty', () => {
    const leaves: AnswerLeaf[] = [];
    const question = essay({ answer: undefined }).questions[0] as StructuredQuestion;
    const filled = structuredType.mapAnswers!(question, (leaf) => {
      leaves.push(leaf);
      return { shape: 'written', answer: bi('Filled', '已填'), scheme: scheme(2) };
    });
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ shape: 'written', key: 'question', label: '', marks: 8 });
    expect(filled.answer).toEqual(bi('Filled', '已填'));
    // A teacher's scheme is never replaced.
    expect(filled.scheme).toEqual(scheme(8));
  });
});
