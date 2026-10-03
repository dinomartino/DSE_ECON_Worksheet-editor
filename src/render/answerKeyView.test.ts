/**
 * The Marking scheme view's contract: it shows the very nodes the `.docx` key is built
 * from; the edit targets it adds (answers, MCQ notes, scheme text) write the one stored
 * copy the Teacher version prints; and none of them reaches an exported byte.
 */
import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { buildAnswerKeyDocxParts, buildDocxParts } from '@/export/docx';
import { renderNodeXml, type BodyContext } from '@/export/docx/body';
import {
  answerKeyClipboardHtml,
  answerKeyPlainText,
  clipboardNodeHtml,
  worksheetClipboardHtml,
} from '@/export/clipboard';
import { applyEditTarget, editTargetKey, targetQuestionId, textOfTarget } from '@/model/edits';
import { createMcqQuestion, newId } from '@/model/factories';
import { migrate } from '@/model/migrations';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { bi, plain } from '@/model/text';
import type { BiText, LanguageMode, McqQuestion, StructuredQuestion, Worksheet } from '@/model/types';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { withFlow } from '@/test/fixtures';
import { answerKeyView, renderAnswerKey, renderCombinedAnswerKey } from './answerKey';
import type { EditSegment, EditTarget, RenderNode, TextNode } from './ir';
import { renderWorksheet } from './worksheet';

const LANGUAGES: LanguageMode[] = ['en', 'zh', 'bilingual'];

/** The scheme fixture plus an MCQ carrying an explanation, a rationale and a source note. */
function fixture(): Worksheet {
  const base = buildMarkSchemeWorksheet();
  const mcq = createMcqQuestion() as McqQuestion;
  mcq.answerIndex = 2;
  mcq.explanation = bi('Supply shifts left.', '供應減少。');
  mcq.provenance = bi('DSE 2019 Q3', 'DSE 2019 第3題');
  mcq.options = mcq.options.map((option, index) =>
    index === 0 ? { ...option, rationale: bi('Confuses demand with supply.', '混淆需求與供應。') } : option,
  );
  return withFlow(base, [mcq, ...base.questions]);
}

/** Every edit target in a node list, nested cells and segments included. */
function targetsIn(nodes: RenderNode[]): EditTarget[] {
  const out: EditTarget[] = [];
  const segment = (pieces: EditSegment[]) => {
    for (const piece of pieces) if ('edit' in piece) out.push(piece.edit);
  };
  for (const node of nodes) {
    if (node.kind === 'text') {
      if (node.edit) out.push(node.edit);
      if (node.segments) {
        segment(node.segments.en);
        segment(node.segments.zh);
      }
    } else if (node.kind === 'columns') {
      for (const cell of node.cells) if (cell.edit) out.push(cell.edit);
    }
  }
  return out;
}

const KIND_ORDER = (targets: EditTarget[]) => [...new Set(targets.map((target) => target.kind))].sort();

/** The node with every preview-only key removed: what an export must not depend on. */
function strip<T>(value: T): T {
  if (Array.isArray(value)) return value.map(strip) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'edit' && key !== 'segments' && key !== 'questionId')
      .map(([key, entry]) => [key, strip(entry)]),
  ) as T;
}
const stripped = (node: RenderNode): RenderNode => strip(node);

function bodyContext(worksheet: Worksheet, language: LanguageMode): BodyContext {
  let id = 1;
  return {
    fonts: worksheet.fonts,
    language,
    contentWidth: 9026,
    numIds: new Map(),
    imageRelId: () => undefined,
    diagramSrc: () => undefined,
    nextDrawingId: () => (id += 1),
  };
}

const teacherNodes = (worksheet: Worksheet, language: LanguageMode) =>
  renderWorksheet(worksheet, { language, version: 'teacher' }).questions.flatMap((entry) => entry.nodes);

function schemeOf(worksheet: Worksheet, path: { part: number; sub?: number }): MarkScheme {
  const question = worksheet.questions.find((entry) => entry.type === 'structured') as StructuredQuestion;
  const part = question.parts[path.part];
  return (path.sub === undefined ? part.scheme : part.subParts![path.sub].scheme)!;
}

describe('the Marking scheme view shows the .docx key', () => {
  it('is the same IR the .docx key is built from, in every language', () => {
    const worksheet = fixture();
    for (const language of LANGUAGES) {
      const view = answerKeyView(worksheet, language);
      expect(view.nodes).toEqual(renderAnswerKey(worksheet, language));
      expect(view.nodes).toEqual(renderCombinedAnswerKey([worksheet], language));
      expect(view.owners).toHaveLength(view.nodes.length);
    }
  });

  it('names each entry’s question, and every target in it belongs to that question', () => {
    const worksheet = fixture();
    const view = answerKeyView(worksheet, 'bilingual');
    view.nodes.forEach((node, index) => {
      for (const target of targetsIn([node])) {
        expect(view.owners[index]).toBe(targetQuestionId(worksheet, target));
      }
    });
    // The title is nobody's; both questions own their entries.
    expect(view.owners[0]).toBeUndefined();
    expect(new Set(view.owners.filter(Boolean))).toEqual(new Set(worksheet.questions.map((q) => q.id)));
  });

  it('carries the answer, MCQ note and scheme targets, in the key and in the Teacher version alike', () => {
    const worksheet = fixture();
    const key = KIND_ORDER(targetsIn(answerKeyView(worksheet, 'bilingual').nodes));
    expect(key).toEqual([
      'mcqExplanation',
      'mcqProvenance',
      'mcqRationale',
      'partAnswer',
      'schemeAlternative',
      'schemeEc',
      'schemeLevel',
      'schemePoint',
    ]);
    const teacher = KIND_ORDER(targetsIn(teacherNodes(worksheet, 'bilingual')));
    for (const kind of key) expect(teacher).toContain(kind);
  });

  it('joins a segmented line back to exactly the text that prints', () => {
    const worksheet = fixture();
    const nodes = [...answerKeyView(worksheet, 'bilingual').nodes, ...teacherNodes(worksheet, 'bilingual')];
    const segmented = nodes.filter((node): node is TextNode => node.kind === 'text' && Boolean(node.segments));
    expect(segmented.length).toBeGreaterThan(0);
    for (const node of segmented) {
      expect(node.edit).toBeUndefined();
      for (const side of ['en', 'zh'] as const) {
        const joined = node.segments![side]
          .map((piece) => plain('runs' in piece ? piece.runs : piece.value[side]))
          .join('');
        expect(joined).toBe(plain(node.text[side]));
      }
    }
  });

  it('renders a key for the frozen v1 corpus, with its answers editable in place', () => {
    const worksheet = migrate(structuredClone(v1Corpus)) as Worksheet;
    const view = answerKeyView(worksheet, 'bilingual');
    expect(view.nodes.length).toBeGreaterThan(1);
    expect(view.owners.some(Boolean)).toBe(true);
    const answers = targetsIn(view.nodes).filter((target) => target.kind === 'partAnswer');
    expect(answers.length).toBeGreaterThan(0);
    for (const target of answers) expect(textOfTarget(worksheet, target)).toBeDefined();
  });
});

describe('scheme text edit targets', () => {
  const find = (nodes: RenderNode[], kind: EditTarget['kind']) => {
    const target = targetsIn(nodes).find((entry) => entry.kind === kind);
    expect(target, kind).toBeDefined();
    return target!;
  };

  it('a point typed on the key’s sheet changes the stored scheme, and the Teacher version prints it', () => {
    const worksheet = fixture();
    const target = find(answerKeyView(worksheet, 'en').nodes, 'schemePoint');
    const before = textOfTarget(worksheet, target)!;
    const next = applyEditTarget(worksheet, target, { ...before, en: [{ text: 'Supply falls' }] });

    const scheme = schemeOf(next, { part: 0 });
    expect(plain(scheme.routes[0].groups[0].points[0].text.en)).toBe('Supply falls');
    // The Chinese side is untouched (patch, never replace).
    expect(scheme.routes[0].groups[0].points[0].text.zh).toEqual(before.zh);
    // One source of truth: the Teacher version and the key both print the new wording.
    const teacher = teacherNodes(next, 'en').map((node) => (node.kind === 'text' ? plain(node.text.en) : ''));
    expect(teacher.some((line) => line.startsWith('Supply falls'))).toBe(true);
    expect(answerKeyPlainText(next, 'en')).toContain('Supply falls');
  });

  it('the same point edited from the Teacher version writes the same field', () => {
    const worksheet = fixture();
    const fromKey = find(answerKeyView(worksheet, 'en').nodes, 'schemePoint');
    const fromPaper = targetsIn(teacherNodes(worksheet, 'en')).find(
      (target) => editTargetKey(target) === editTargetKey(fromKey),
    );
    expect(fromPaper).toEqual(fromKey);
  });

  it('writes an alternative, a level descriptor and an EC row, each in place', () => {
    const worksheet = fixture();
    const nodes = answerKeyView(worksheet, 'en').nodes;
    const text: BiText = bi('typed on the page', '在頁面輸入');

    const alternative = applyEditTarget(worksheet, find(nodes, 'schemeAlternative'), text);
    expect(schemeOf(alternative, { part: 0 }).routes[0].groups[0].points[0].alternatives).toEqual([text]);

    const level = applyEditTarget(worksheet, find(nodes, 'schemeLevel'), text);
    expect(schemeOf(level, { part: 1, sub: 1 }).levels![0].descriptor).toEqual(text);

    const ec = applyEditTarget(worksheet, find(nodes, 'schemeEc'), text);
    expect(schemeOf(ec, { part: 1, sub: 1 }).ec!.descriptors[0].text).toEqual(text);
    // Nothing else moved.
    expect(schemeOf(ec, { part: 0 })).toEqual(schemeOf(worksheet, { part: 0 }));
  });

  it('a stale target changes nothing', () => {
    const worksheet = fixture();
    const target = find(answerKeyView(worksheet, 'en').nodes, 'schemePoint');
    const stale = { ...target, pointId: newId() };
    expect(applyEditTarget(worksheet, stale, bi('x', 'x'))).toBe(worksheet);
    expect(textOfTarget(worksheet, stale)).toBeUndefined();
  });

  it('edited scheme text never reaches the student copy', () => {
    const worksheet = fixture();
    const target = find(answerKeyView(worksheet, 'en').nodes, 'schemePoint');
    const next = applyEditTarget(worksheet, target, bi('SECRET-SCHEME-POINT', '秘密評分要點'));
    for (const language of LANGUAGES) {
      const student = buildDocxParts(next, { language, version: 'student' });
      expect(student.documentXml).not.toContain('SECRET-SCHEME-POINT');
      expect(student.documentXml).not.toContain('秘密評分要點');
      expect(worksheetClipboardHtml(next, { language, version: 'student' })).not.toContain('SECRET-SCHEME-POINT');
    }
    expect(buildDocxParts(next, { language: 'en', version: 'teacher' }).documentXml).toContain('SECRET-SCHEME-POINT');
    expect(buildAnswerKeyDocxParts(next, 'en').documentXml).toContain('SECRET-SCHEME-POINT');
  });
});

describe('MC table cells select their question', () => {
  /** Every key table cell naming a question, as [questionId, printed text]. */
  const ownedCells = (nodes: RenderNode[]) =>
    nodes.flatMap((node) =>
      node.kind === 'table'
        ? node.rows.flat().flatMap((cell) => (cell.questionId ? [[cell.questionId, plain(cell.text.en)]] : []))
        : [],
    );

  it('the number and key cells of every MC layout name their question; headings and padding none', () => {
    const worksheet = fixture();
    const mcq = worksheet.questions.find((q) => q.type === 'mcq')!;
    for (const mcLayout of ['grid', 'hkeaaTable', 'rationaleTable'] as const) {
      const doc: Worksheet = { ...worksheet, answerKeyLayout: { mcLayout } };
      const cells = ownedCells(answerKeyView(doc, 'en').nodes);
      // The grid prints "1" and "C"; the tables "1." and "C".
      expect(cells.map(([id]) => id)).toEqual([mcq.id, mcq.id]);
      expect(cells[1][1]).toBe('C');
    }
  });

  it('with versions on, each version’s table names the same question', () => {
    const worksheet = { ...fixture(), versions: { count: 3, seed: 7 } };
    const mcq = worksheet.questions.find((q) => q.type === 'mcq')!;
    const cells = ownedCells(answerKeyView(worksheet, 'en').nodes);
    expect(cells).toHaveLength(6);
    expect(new Set(cells.map(([id]) => id))).toEqual(new Set([mcq.id]));
  });
});

describe('edit targets are inert in export', () => {
  it('every node exports the same .docx XML and clipboard HTML with its targets removed', () => {
    const worksheet = fixture();
    const versioned = { ...worksheet, versions: { count: 3, seed: 7 } };
    for (const doc of [worksheet, versioned]) {
      for (const language of LANGUAGES) {
        const nodes = [...answerKeyView(doc, language).nodes, ...teacherNodes(doc, language)];
        expect(targetsIn(nodes).length).toBeGreaterThan(0);
        for (const node of nodes) {
          const bare = stripped(node);
          expect(renderNodeXml(node, bodyContext(doc, language))).toBe(renderNodeXml(bare, bodyContext(doc, language)));
          expect(clipboardNodeHtml(node, language, '', new Map(), 9026)).toBe(
            clipboardNodeHtml(bare, language, '', new Map(), 9026),
          );
        }
      }
    }
  });

  it('copies the key for Word from the same nodes', () => {
    const worksheet = fixture();
    const html = answerKeyClipboardHtml(worksheet, 'en');
    expect(html).toContain('Supply decreases');
    expect(html).toContain('Supply shifts left.');
    expect(html).not.toContain('data-');
  });
});
