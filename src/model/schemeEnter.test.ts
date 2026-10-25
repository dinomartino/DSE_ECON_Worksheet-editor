import { beforeEach, describe, expect, it } from 'vitest';
// The registry loads first: the model modules below reach back into it and need it whole.
import '@/registry';
import JSZip from 'jszip';
import { exportAnswerKeyDocxBuffer } from '@/export/docx';
import { answerKeyView, renderAnswerKey } from '@/render/answerKey';
import type { EditTarget, RenderNode, TextNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { enterBreaksLine } from '@/components/preview/fieldEnter';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { dropEmptySchemePoint, joinSchemePoint, splitSchemePoint } from './edits';
import { schemeMax } from './markScheme';
import type { MarkPoint, MarkScheme } from './markSchemeTypes';
import { migrate, serializeWorksheet } from './migrations';
import { bi, plain } from './text';
import type { OutputMode, StructuredQuestion, Worksheet } from './types';

/**
 * k-0200, the Marking scheme view: Enter in a mark point starts a new point, as Enter in
 * question text starts a new paragraph; Backspace / Delete join; a field of one text (an
 * answer, a descriptor) takes a line break. The model's halves; the keys are driven in
 * Chrome by `scripts/word-typing-verify.mjs --part=scheme`.
 */

const fixture = () => {
  const worksheet = buildMarkSchemeWorksheet();
  const question = worksheet.questions[0] as StructuredQuestion;
  const part = question.parts[0];
  const sub = question.parts[1].subParts![0];
  return { worksheet, question, part, sub };
};

type Leaf = { scheme?: MarkScheme };
const pointsOf = (leaf: Leaf, group = 0, route = 0): MarkPoint[] => leaf.scheme!.routes[route].groups[group].points;
const partA = (worksheet: Worksheet) => (worksheet.questions[0] as StructuredQuestion).parts[0];
const subI = (worksheet: Worksheet) => (worksheet.questions[0] as StructuredQuestion).parts[1].subParts![0];
const words = (points: MarkPoint[], side: 'en' | 'zh' = 'en') => points.map((point) => plain(point.text[side]));

function pointTarget(questionId: string, partId: string, pointId: string, subPartId?: string) {
  return { kind: 'schemePoint', questionId, partId, ...(subPartId ? { subPartId } : {}), pointId } as const;
}

describe('Enter splits a mark point', () => {
  it('at the caret: the words after it are a new point with the same mark, straight after it', () => {
    const { worksheet, question, part } = fixture();
    const second = pointsOf(part)[1];
    const at = 'At the original price'.length;
    const split = splitSchemePoint(worksheet, pointTarget(question.id, part.id, second.id), 'en', at, at, 'new');
    const points = pointsOf(partA(split));
    expect(words(points)).toEqual([
      'Supply decreases',
      'At the original price',
      ' there is a shortage',
      'The equilibrium price rises',
    ]);
    expect(points.map((point) => point.marks)).toEqual([1, 1, 1, 1]);
    expect(points[2].id).toBe('new');
    // The total rises with the new mark, which the panel's mismatch note reports.
    expect(schemeMax(partA(split).scheme!)).toBe(schemeMax(part.scheme!) + 1);
  });

  it('keeps the Chinese and the / alternatives with the first point', () => {
    const { worksheet, question, part } = fixture();
    const first = pointsOf(part)[0];
    const split = splitSchemePoint(worksheet, pointTarget(question.id, part.id, first.id), 'en', 6, 6, 'new');
    const [a, b] = pointsOf(partA(split));
    expect(plain(a.text.zh)).toBe('供應減少');
    expect(a.alternatives).toHaveLength(1);
    expect(plain(b.text.zh)).toBe('');
    expect(b.alternatives).toBeUndefined();
  });

  it('in Chinese moves the Chinese, and over a selection drops the selected words', () => {
    const { worksheet, question, part } = fixture();
    const third = pointsOf(part)[2];
    const split = splitSchemePoint(worksheet, pointTarget(question.id, part.id, third.id), 'zh', 2, 4, 'new');
    const points = pointsOf(partA(split));
    expect(words(points, 'zh').slice(2)).toEqual(['均衡', '上升']);
    expect(words(points).slice(2)).toEqual(['The equilibrium price rises', '']);
  });

  it('in a group marked by a rule, the new point is marked by the same rule', () => {
    const { worksheet, question, sub } = fixture();
    const target = pointTarget(question.id, question.parts[1].id, pointsOf(sub)[3].id, sub.id);
    const split = splitSchemePoint(worksheet, target, 'en', 99, 99, 'new');
    const group = subI(split).scheme!.routes[0].groups[0];
    expect(group.points).toHaveLength(5);
    expect(group.points[4]).toEqual({ id: 'new', text: { en: [], zh: [] } });
    // "any TWO @1, max 2": a new point adds nothing to the total.
    expect(schemeMax(subI(split).scheme!)).toBe(schemeMax(sub.scheme!));
  });

  it('changes nothing for a point that is not there', () => {
    const { worksheet, question, part } = fixture();
    expect(splitSchemePoint(worksheet, pointTarget(question.id, part.id, 'gone'), 'en', 0, 0, 'new')).toBe(worksheet);
  });
});

describe('Backspace and Delete join mark points', () => {
  it('Backspace at a point’s start joins it into the one before, the caret where they meet', () => {
    const { worksheet, question, part } = fixture();
    const [first, second] = pointsOf(part);
    const joined = joinSchemePoint(worksheet, pointTarget(question.id, part.id, second.id), 'en', 'backward')!;
    expect(joined.pointId).toBe(first.id);
    expect(joined.caret).toBe('Supply decreases'.length);
    const points = pointsOf(partA(joined.worksheet));
    expect(words(points)[0]).toBe('Supply decreasesAt the original price there is a shortage');
    // The other side keeps both texts, a line break apart; the first point's mark and both alternatives stay.
    expect(plain(points[0].text.zh)).toBe('供應減少\n在原來價格下出現短缺');
    expect(points[0].marks).toBe(1);
    expect(points[0].alternatives).toHaveLength(1);
    expect(points).toHaveLength(2);
  });

  it('Delete at a point’s end pulls the next one in', () => {
    const { worksheet, question, part } = fixture();
    const second = pointsOf(part)[1];
    const joined = joinSchemePoint(worksheet, pointTarget(question.id, part.id, second.id), 'en', 'forward')!;
    expect(joined.pointId).toBe(second.id);
    expect(words(pointsOf(partA(joined.worksheet)))[1]).toBe('At the original price there is a shortageThe equilibrium price rises');
  });

  it('never crosses a group or an OR route: nothing to join at the first point, the last, or across', () => {
    const { worksheet, question, part } = fixture();
    const points = pointsOf(part);
    const target = (id: string) => pointTarget(question.id, part.id, id);
    expect(joinSchemePoint(worksheet, target(points[0].id), 'en', 'backward')).toBeUndefined();
    expect(joinSchemePoint(worksheet, target(points[2].id), 'en', 'forward')).toBeUndefined();
    const other = pointsOf(part, 0, 1)[0];
    expect(joinSchemePoint(worksheet, target(other.id), 'en', 'backward')).toBeUndefined();
  });

  it('a split joined straight back is the scheme it was', () => {
    const { worksheet, question, part } = fixture();
    const first = pointsOf(part)[0];
    const split = splitSchemePoint(worksheet, pointTarget(question.id, part.id, first.id), 'en', 6, 6, 'new');
    const joined = joinSchemePoint(split, pointTarget(question.id, part.id, 'new'), 'en', 'backward')!;
    expect(partA(joined.worksheet).scheme).toEqual(part.scheme);
  });
});

describe('Enter on an empty mark point ends the list', () => {
  it('removes the point, so no stray "(1)" adds to the total', () => {
    const { worksheet, question, part } = fixture();
    const last = pointsOf(part)[2];
    const split = splitSchemePoint(worksheet, pointTarget(question.id, part.id, last.id), 'en', 99, 99, 'new');
    const dropped = dropEmptySchemePoint(split, pointTarget(question.id, part.id, 'new'));
    expect(partA(dropped).scheme).toEqual(part.scheme);
  });

  it('keeps a point with words on the other side, with alternatives, or alone in its group', () => {
    const { worksheet, question, part } = fixture();
    const [first, second] = pointsOf(part);
    const lone = pointsOf(part, 0, 1)[0];
    const emptied = (w: Worksheet, id: string, text = bi('', '')) => {
      const scheme = structuredClone(partA(w).scheme!);
      for (const route of scheme.routes) for (const group of route.groups) for (const p of group.points) if (p.id === id) p.text = text;
      const copy = structuredClone(w);
      partA(copy).scheme = scheme;
      return copy;
    };
    const target = (id: string) => pointTarget(question.id, part.id, id);
    const zhOnly = emptied(worksheet, second.id, bi('', '只有中文'));
    expect(dropEmptySchemePoint(zhOnly, target(second.id))).toBe(zhOnly);
    const withAlternative = emptied(worksheet, first.id);
    expect(dropEmptySchemePoint(withAlternative, target(first.id))).toBe(withAlternative);
    const alone = emptied(worksheet, lone.id);
    expect(dropEmptySchemePoint(alone, target(lone.id))).toBe(alone);
  });
});

describe('a split scheme prints, saves and undoes', () => {
  const split = () => {
    const { worksheet, question, part } = fixture();
    part.answer = bi('Answers are for reference only.\nAccept other relevant answers.', '答案僅供參考。\n其他合理答案亦可。');
    const second = pointsOf(part)[1];
    const at = 'At the original price'.length;
    return splitSchemePoint(worksheet, pointTarget(question.id, part.id, second.id), 'en', at, at, 'new');
  };

  const docxLines = async (worksheet: Worksheet, language: 'en' | 'bilingual') => {
    const zip = await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(worksheet, language));
    const xml = await zip.file('word/document.xml')!.async('string');
    return xml
      .split('</w:p>')
      .map((p) => p.replace(/<w:br\/>/g, '⏎').replace(/<w:tab\/>/g, '⇥').replace(/<[^>]+>/g, ''))
      .filter((line) => /price|shortage|reference|僅供|短缺/.test(line));
  };

  it('each point has its own mark in the Marks column, on the page and in the .docx', async () => {
    const view = answerKeyView(split(), 'en');
    const rows = view.nodes.flatMap((node) =>
      node.kind === 'text' && /original price|shortage|price rises/.test(plain(node.text.en)) ? [[plain(node.text.en), node.trail && plain(node.trail.en)]] : [],
    );
    expect(rows).toEqual([
      ['At the original price', '(1)'],
      [' there is a shortage', '(1)'],
      ['The equilibrium price rises', '(1)'],
    ]);
    const lines = await docxLines(split(), 'en');
    expect(lines.filter((line) => line.endsWith('(1)'))).toHaveLength(3);
    // The answer's line break is Word's line break, not a new paragraph.
    expect(lines).toContain('Answers are for reference only.⏎Accept other relevant answers.');
  });

  it('the bilingual key prints the Chinese under its English, and the new point in English alone', async () => {
    const lines = await docxLines(split(), 'bilingual');
    expect(lines.some((line) => line.startsWith('At the original price⏎在原來價格下出現短缺'))).toBe(true);
    expect(lines.some((line) => /^ there is a shortage⇥?\(1\)$/.test(line))).toBe(true);
    expect(lines).toContain(
      'Answers are for reference only.⏎Accept other relevant answers.⏎答案僅供參考。⏎其他合理答案亦可。',
    );
  });

  it('reopens with both points, and needs no new schema version', () => {
    const worksheet = split();
    const saved = serializeWorksheet(worksheet);
    expect(saved.schemaVersion).toBe(1);
    const reopened = migrate(JSON.parse(JSON.stringify(saved)));
    expect(partA(reopened).scheme).toEqual(partA(worksheet).scheme);
    expect(reopened.__unknown).toBeUndefined();
  });

  describe('in the store', () => {
    beforeEach(() => {
      useWorksheetStore.setState({ worksheet: fixture().worksheet, past: [], future: [], readOnly: false });
    });

    it('is one undo step, and redo puts it back', () => {
      const store = useWorksheetStore.getState();
      const before = store.worksheet;
      const question = before.questions[0] as StructuredQuestion;
      const target = pointTarget(question.id, question.parts[0].id, pointsOf(question.parts[0])[1].id);
      store.commit((draft) => splitSchemePoint(draft, target, 'en', 3, 3, 'new'));
      expect(pointsOf(partA(useWorksheetStore.getState().worksheet))).toHaveLength(4);
      useWorksheetStore.getState().undo();
      expect(useWorksheetStore.getState().worksheet).toBe(before);
      useWorksheetStore.getState().redo();
      expect(pointsOf(partA(useWorksheetStore.getState().worksheet))).toHaveLength(4);
    });
  });
});

describe('Enter in a field of one text is a new line', () => {
  it('in an answer, a level or EC descriptor, an explanation or an alternative; a title still finishes', () => {
    const q = { questionId: 'q' };
    const lines: EditTarget[] = [
      { kind: 'questionAnswer', ...q },
      { kind: 'partAnswer', ...q, partId: 'p' },
      { kind: 'subPartAnswer', ...q, partId: 'p', subPartId: 's' },
      { kind: 'schemeAlternative', ...q, pointId: 'x', index: 0 },
      { kind: 'schemeLevel', ...q, levelId: 'l' },
      { kind: 'schemeEc', ...q, descriptorId: 'e' },
      { kind: 'mcqExplanation', ...q },
      { kind: 'mcqRationale', ...q, optionId: 'o' },
    ];
    for (const target of lines) expect(enterBreaksLine(target), target.kind).toBe(true);
    const finishes: EditTarget[] = [
      { kind: 'answerKeyTitle' },
      { kind: 'answerKeySubtitle' },
      { kind: 'schemePoint', ...q, pointId: 'x' },
      { kind: 'blockText', blockId: 'b' },
      { kind: 'mcqProvenance', ...q },
      { kind: 'worksheetTitle' },
    ];
    for (const target of finishes) expect(enterBreaksLine(target), target.kind).toBe(false);
  });
});

describe('an empty point has a line to type in, on the editing page only', () => {
  const withEmptyPoint = () => {
    const { worksheet, question, part } = fixture();
    const last = pointsOf(part)[2];
    const split = splitSchemePoint(worksheet, pointTarget(question.id, part.id, last.id), 'en', 99, 99, 'new');
    return { before: worksheet, worksheet: split };
  };
  const emptyLines = (nodes: RenderNode[]) =>
    nodes.filter((node): node is TextNode => node.kind === 'text' && node.edit?.kind === 'schemePoint' && node.edit.pointId === 'new');

  it('the Marking scheme view draws it, editOnly, with its (1); the exported key never has it', async () => {
    const { before, worksheet } = withEmptyPoint();
    const [line] = emptyLines(answerKeyView(worksheet, 'en', { editing: true }).nodes);
    expect(line?.editOnly).toBe(true);
    expect(line?.trail && plain(line.trail.en)).toBe('(1)');
    expect(emptyLines(answerKeyView(worksheet, 'en').nodes)).toEqual([]);
    expect(emptyLines(renderAnswerKey(worksheet, 'en'))).toEqual([]);
    // The .docx is the key it was before the empty point: the same paragraphs.
    const xml = async (w: Worksheet) =>
      (await JSZip.loadAsync(await exportAnswerKeyDocxBuffer(w, 'en'))).file('word/document.xml')!.async('string');
    expect(await xml(worksheet)).toBe(await xml(before));
  });

  it('the paper’s Teacher view draws it while typing, and print, Student and export renders do not', () => {
    const { worksheet } = withEmptyPoint();
    const nodesOf = (mode: OutputMode) => renderWorksheet(worksheet, mode).questions.flatMap((q) => q.nodes);
    expect(emptyLines(nodesOf({ language: 'en', version: 'teacher', editing: true }))).toHaveLength(1);
    expect(emptyLines(nodesOf({ language: 'en', version: 'teacher' }))).toEqual([]);
    expect(emptyLines(nodesOf({ language: 'en', version: 'student', editing: true }))).toEqual([]);
  });
});
