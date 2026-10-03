/**
 * "Bump only when used" (§ `writtenSchemaVersion`). v0.5.0 reads schema 1 and opens any
 * higher `schemaVersion` read-only, never overwriting it. It ignores the diagram answer
 * layer (teacher answers on the student copy), `answerKeyLayout` (the key as Classic), a
 * section's `answerCount` (every question totalled) and an essay's own `answer`/`scheme`
 * (left out of its teacher copy and key), so a document using any must be written above 1.
 * Everything else, a section's `targetMarks` and bank metadata included, stays at 1:
 * v0.5.0 keeps it and prints the same.
 */
import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { buildAnswerLayerWorksheet, ppfAnswerDiagram } from '@/test/answerLayerFixture';
import { CURRENT_SCHEMA_VERSION, isNewerThanBuild, migrate, serializeWorksheet, writtenSchemaVersion } from './migrations';
import { hasAnswerLayer, setAnswer } from './diagramAnswers';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from './diagramTemplates';
import {
  createDiagramBlock,
  createFigureRowBlock,
  createMcqQuestion,
  createPart,
  createSourceBlock,
  createStructuredQuestion,
  createSubPart,
  createWorksheet,
} from './factories';
import { createSectionElement, createStimulusElement } from './flow';
import { applyDeleteTarget } from './edits';
import { copyQuestion } from './lineage';
import { bi } from './text';
import type { MarkScheme } from './markSchemeTypes';
import { createGraph, migrateGraph, serializeGraph } from './graph';
import { withAnswerKeyLayout, withAnswerKeyPreset } from './answerKeyLayout';
import { editableCopy } from '@/storage/document';
import type { Diagram } from './diagram';
import type { DiagramBlock, LayoutElement, StructuredQuestion, Worksheet } from './types';

/** v0.5.0's `CURRENT_SCHEMA_VERSION`: it opens anything written above this read-only. */
const V050_READS = 1;

const written = (worksheet: Worksheet) => serializeWorksheet(worksheet).schemaVersion;
const reloaded = (worksheet: Worksheet) => migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));

/** Every element id in a diagram's answer-capable lists. */
function elementIds(diagram: Diagram): string[] {
  return [diagram.curves, diagram.points, diagram.labels, diagram.arrows, diagram.areas ?? [], diagram.spans ?? []]
    .flat()
    .map((element) => element.id);
}

function answeredBlock(): DiagramBlock {
  return { ...createDiagramBlock('blank'), diagram: ppfAnswerDiagram() };
}

const plainBlock = () => createDiagramBlock('supply-demand');

describe('the version a document is written at', () => {
  it('stays 1 for a document using neither feature, from new or from the v1 corpus', () => {
    expect(written(createWorksheet())).toBe(V050_READS);
    expect(written(migrate(structuredClone(v1Corpus)))).toBe(V050_READS);
    const withDiagram = createWorksheet();
    const question = createStructuredQuestion();
    question.blocks = [plainBlock()];
    withDiagram.questions = [question];
    expect(written(withDiagram)).toBe(V050_READS);
  });

  it('is above what v0.5.0 reads once any diagram, anywhere, carries an answer', () => {
    const places: Array<[string, (worksheet: Worksheet, block: DiagramBlock) => void]> = [
      ['question stem', (w, b) => (w.questions[0] as ReturnType<typeof createStructuredQuestion>).blocks.push(b)],
      ['part', (w, b) => (w.questions[0] as ReturnType<typeof createStructuredQuestion>).parts[0].blocks.push(b)],
      ['part interlude', (w, b) => ((w.questions[0] as ReturnType<typeof createStructuredQuestion>).parts[0].blocksBefore = [b])],
      [
        'sub-part',
        (w, b) => {
          const sub = createSubPart();
          sub.blocks.push(b);
          (w.questions[0] as ReturnType<typeof createStructuredQuestion>).parts[0].subParts = [sub];
        },
      ],
      ['model answer diagram', (w, b) => ((w.questions[0] as ReturnType<typeof createStructuredQuestion>).parts[0].answerDiagram = b)],
      [
        'source',
        (w, b) => {
          const source = createSourceBlock();
          source.blocks.push(b);
          (w.questions[0] as ReturnType<typeof createStructuredQuestion>).blocks.push(source);
        },
      ],
      ['figure row', (w, b) => (w.questions[0] as ReturnType<typeof createStructuredQuestion>).blocks.push(createFigureRowBlock(b))],
      [
        'MC option',
        (w, b) => {
          const mcq = createMcqQuestion();
          mcq.options[0] = { ...mcq.options[0], blocks: [b] };
          w.questions.push(mcq);
          w.flow.push({ type: 'question', id: mcq.id });
        },
      ],
      [
        'shared stimulus',
        (w, b) => {
          const stimulus = { ...createStimulusElement(), blocks: [b] };
          w.layout.push(stimulus);
          w.flow.push({ type: 'layout', id: stimulus.id });
        },
      ],
    ];
    for (const [place, put] of places) {
      const worksheet = createWorksheet();
      const question = createStructuredQuestion();
      question.parts = [createPart()];
      worksheet.questions = [question];
      worksheet.flow = [{ type: 'question', id: question.id }];
      put(worksheet, plainBlock());
      expect(written(worksheet), `${place}, unflagged`).toBe(V050_READS);

      const marked = createWorksheet();
      const again = createStructuredQuestion();
      again.parts = [createPart()];
      marked.questions = [again];
      marked.flow = [{ type: 'question', id: again.id }];
      put(marked, answeredBlock());
      expect(written(marked), place).toBeGreaterThan(V050_READS);
      expect(written(marked), place).toBe(2);
    }
  });

  it('agrees with `hasAnswerLayer` on every template, flagged per element, and on a pie', () => {
    for (const template of DIAGRAM_TEMPLATES) {
      const diagram = buildFromTemplate(template.id);
      if (diagram.curves.some((c) => c.derive?.kind === 'importQuota')) continue;
      expect(writtenSchemaVersion(1, { kind: 'diagram', diagram })).toBe(1);
      for (const id of elementIds(diagram)) {
        const flagged = setAnswer(diagram, [id], true);
        expect(writtenSchemaVersion(1, { kind: 'diagram', diagram: flagged }), `${template.id}:${id}`).toBe(
          hasAnswerLayer(flagged) ? 2 : 1,
        );
      }
    }
    // A pie never draws the answer layer, so v0.5.0 prints it the same: no mark.
    const pie: Diagram = { ...ppfAnswerDiagram(), pie: { slices: [] } };
    expect(hasAnswerLayer(pie)).toBe(false);
    expect(writtenSchemaVersion(1, { kind: 'diagram', diagram: pie })).toBe(1);
  });

  // v0.5.0 draws the stored points but throws on deleting or group-moving around a
  // derive kind it does not know.
  it('is above 1 with an import-quota supply, and back to 1 once it is detached', () => {
    const diagram = buildFromTemplate('import-quota');
    expect(writtenSchemaVersion(1, { kind: 'diagram', diagram })).toBe(2);
    const detached = { ...diagram, curves: diagram.curves.map(({ derive: _d, ...c }) => (_d?.kind === 'importQuota' ? c : { ...c, ...(_d ? { derive: _d } : {}) })) };
    expect(writtenSchemaVersion(1, { kind: 'diagram', diagram: detached })).toBe(1);
  });

  it('is above 1 with an answer key layout, and back to 1 when the key returns to Classic', () => {
    const worksheet = migrate(structuredClone(v1Corpus));
    const suggested = withAnswerKeyLayout(worksheet, withAnswerKeyPreset(undefined, 'suggested'));
    expect(written(suggested)).toBe(2);
    const classic = withAnswerKeyLayout(suggested, withAnswerKeyPreset(suggested.answerKeyLayout, 'classic'));
    expect(classic.answerKeyLayout).toBeUndefined();
    expect(written(classic)).toBe(1);
    expect(JSON.stringify(serializeWorksheet(classic))).toBe(JSON.stringify(serializeWorksheet(worksheet)));
  });

  it('drops back to 1 when the last answer element is cleared', () => {
    const worksheet = buildAnswerLayerWorksheet();
    expect(written(worksheet)).toBe(2);
    const question = worksheet.questions[0] as ReturnType<typeof createStructuredQuestion>;
    const block = question.parts[0].blocks[1] as DiagramBlock;
    const cleared = setAnswer(block.diagram, elementIds(block.diagram), false);
    question.parts[0].blocks[1] = { ...block, diagram: cleared };
    expect(written(worksheet)).toBe(1);
  });

  it('keeps a newer build’s version, whatever the content', () => {
    const newer = { ...createWorksheet(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(written(newer)).toBe(CURRENT_SCHEMA_VERSION + 1);
    expect(written(migrate(serializeWorksheet(newer)))).toBe(CURRENT_SCHEMA_VERSION + 1);
  });

  it('marks an editable copy of a newer document by its content, never below what it uses', () => {
    const newer = { ...buildAnswerLayerWorksheet(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    const copy = editableCopy(migrate(serializeWorksheet(newer)), 'copy');
    expect(isNewerThanBuild(copy)).toBe(false);
    expect(written(copy)).toBe(2);
  });
});

describe('documents a develop build saved before the mark existed', () => {
  // Those builds wrote both features under schemaVersion 1.
  const developDoc = () => {
    const worksheet = withAnswerKeyLayout(buildAnswerLayerWorksheet(), { preset: 'suggested' as const });
    return { ...JSON.parse(JSON.stringify(worksheet)), schemaVersion: 1 };
  };

  it('open editable here, with the answer layer and the key layout intact', () => {
    const raw = developDoc();
    const loaded = migrate(structuredClone(raw));
    expect(isNewerThanBuild(loaded)).toBe(false);
    expect(loaded.__unknown).toBeUndefined();
    expect(loaded.answerKeyLayout).toEqual({ preset: 'suggested' });
    expect(loaded.questions).toEqual(raw.questions);
  });

  it('are marked on their next save, and reload unchanged', () => {
    const loaded = migrate(developDoc());
    expect(written(loaded)).toBe(2);
    expect(reloaded(loaded)).toEqual(loaded);
  });
});

describe('saved graphs follow the same rule', () => {
  it('a graph without answers is written at 1, one with an answer at 2', () => {
    const graph = createGraph('supply-demand');
    expect(serializeGraph(graph).schemaVersion).toBe(1);
    const diagram = setAnswer(graph.block.diagram, [graph.block.diagram.curves[0].id], true);
    const answered = { ...graph, block: { ...graph.block, diagram } };
    expect(serializeGraph(answered).schemaVersion).toBe(2);
    const back = migrateGraph(JSON.parse(JSON.stringify(serializeGraph(answered))));
    expect(back.block.diagram.curves[0].answer).toBe(true);
    expect(back.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

type Section = Extract<LayoutElement, { kind: 'section' }>;

/** Section A, then Section B holding two LQs; `extra` goes on Section B. */
function sectionedPaper(extra: Partial<Section> = {}): Worksheet {
  const worksheet = createWorksheet();
  const a = createSectionElement(bi('Section A', '甲部'));
  const b: Section = { ...(createSectionElement(bi('Section B', '乙部')) as Section), ...extra };
  const questions = [createStructuredQuestion(), createStructuredQuestion(), createStructuredQuestion()];
  worksheet.questions = questions;
  worksheet.layout = [a, b];
  worksheet.flow = [
    { type: 'layout', id: a.id },
    { type: 'question', id: questions[0].id },
    { type: 'layout', id: b.id },
    { type: 'question', id: questions[1].id },
    { type: 'question', id: questions[2].id },
  ];
  return worksheet;
}

const withSection = (worksheet: Worksheet, patch: Partial<Section>): Worksheet => ({
  ...worksheet,
  layout: worksheet.layout.map((element, i) => (i === 1 ? ({ ...element, ...patch } as LayoutElement) : element)),
});

describe('optional sections ("answer any ONE") and section targets', () => {
  // v0.5.0 keeps both fields. It totals every question despite an answer count ("(22 marks)"
  // for "(12 marks)"), but prints a marks target the same, so only the count raises the mark.
  it('are written at 1 without either field', () => {
    expect(written(sectionedPaper())).toBe(V050_READS);
  });

  it('are written at 1 with a marks target alone', () => {
    expect(written(sectionedPaper({ targetMarks: 20 }))).toBe(V050_READS);
    expect(written(reloaded(sectionedPaper({ targetMarks: 20 })))).toBe(V050_READS);
  });

  it('are written at 2 with an answer count, alone or with a marks target', () => {
    expect(written(sectionedPaper({ answerCount: 1 }))).toBe(2);
    expect(written(sectionedPaper({ answerCount: 1, targetMarks: 12 }))).toBe(2);
  });

  it('drop back to 1 when the Inspector clears them, and reload unchanged at 2', () => {
    const optional = sectionedPaper({ answerCount: 1, targetMarks: 12 });
    expect(reloaded(optional).layout[1]).toMatchObject({ answerCount: 1, targetMarks: 12 });
    expect(written(reloaded(optional))).toBe(2);
    const cleared = withSection(optional, { answerCount: undefined, targetMarks: undefined });
    expect(written(cleared)).toBe(V050_READS);
    expect(written(reloaded(cleared))).toBe(V050_READS);
  });

  it('only a section marks it: the field on any other layout element is not read', () => {
    const other = sectionedPaper();
    other.layout = [...other.layout, { kind: 'text', id: 'stray', text: bi('', ''), answerCount: 1 } as unknown as LayoutElement];
    expect(written(other)).toBe(V050_READS);
  });
});

const POINTS: MarkScheme = {
  routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi('Define it', '定義'), marks: 2 }] }] }],
};

/** One structured question with no parts: an essay. */
function essayPaper(extra: Partial<StructuredQuestion> = {}): Worksheet {
  const worksheet = createWorksheet();
  const question: StructuredQuestion = { ...createStructuredQuestion(), parts: [], marks: 12, ...extra };
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

describe('an essay’s own answer and scheme', () => {
  // v0.5.0 keeps both but prints neither: its teacher copy and key lose what was typed.
  it('is written at 1 with neither, or with only blank ones', () => {
    expect(written(essayPaper())).toBe(V050_READS);
    expect(written(essayPaper({ answer: bi('  ', '') }))).toBe(V050_READS);
    expect(written(essayPaper({ scheme: { routes: [] } }))).toBe(V050_READS);
    const blankPoint: MarkScheme = { routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi('', ''), marks: 2 }] }] }] };
    expect(written(essayPaper({ scheme: blankPoint }))).toBe(V050_READS);
  });

  it('is written at 2 with an answer, a worded point, an alternative, a level or an EC block', () => {
    expect(written(essayPaper({ answer: bi('', '提高工資') }))).toBe(2);
    expect(written(essayPaper({ scheme: POINTS }))).toBe(2);
    const alternative: MarkScheme = {
      routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p', text: bi('', ''), alternatives: [bi('Or', '或')] }] }] }],
    };
    expect(written(essayPaper({ scheme: alternative }))).toBe(2);
    expect(written(essayPaper({ scheme: { routes: [], levels: [{ id: 'l', min: 1, max: 4, descriptor: bi('', '') }] } }))).toBe(2);
    expect(written(essayPaper({ scheme: { routes: [], ec: { max: 2, descriptors: [] } } }))).toBe(2);
  });

  it('drops back to 1 when the answer is deleted and the scheme removed', () => {
    const worksheet = essayPaper({ answer: bi('Raises wages', '提高工資'), scheme: POINTS });
    expect(written(reloaded(worksheet))).toBe(2);
    const questionId = worksheet.questions[0].id;
    const noAnswer = applyDeleteTarget(worksheet, { kind: 'questionAnswer', questionId });
    expect(written(noAnswer)).toBe(2);
    const neither = { ...noAnswer, questions: noAnswer.questions.map((q) => ({ ...q, scheme: undefined })) };
    expect(written(neither)).toBe(V050_READS);
  });

  it('is not read on a question with parts, which prints it in neither build', () => {
    const question = { ...createStructuredQuestion(), answer: bi('Stale', '舊'), scheme: POINTS };
    expect(question.parts.length).toBeGreaterThan(0);
    const worksheet = createWorksheet();
    worksheet.questions = [question];
    worksheet.flow = [{ type: 'question', id: question.id }];
    expect(written(worksheet)).toBe(V050_READS);
  });
});

describe('what v0.5.0 keeps and prints the same stays at 1', () => {
  // Proven against the v0.5.0 tag: each survives its load, edits, translation and save.
  it('topics, 題型, tag stamps, lineage, part and sub-part roots', () => {
    const worksheet = createWorksheet();
    const question = copyQuestion(createStructuredQuestion(), 'doc-source');
    question.tags = ['C', 'C.ped::Calculate PED', 'past paper'];
    question.tagsAt = '2026-09-30T01:02:03.000Z';
    question.parts[0] = { ...question.parts[0], tags: ['C.ped'], subParts: [{ ...createSubPart(), tags: ['D'], rootId: 'root-sub' }] };
    const mcq = { ...copyQuestion(createMcqQuestion(), 'doc-source'), tags: ['B'] };
    worksheet.questions = [question, mcq];
    worksheet.flow = worksheet.questions.map((q) => ({ type: 'question' as const, id: q.id }));
    expect(written(worksheet)).toBe(V050_READS);
  });

  it('the bank fields: kind, classes, satOn, bankHidden', () => {
    const bank = { ...createWorksheet(), kind: 'bank' as const, classes: ['5A'], satOn: '2025-11-03', bankHidden: true };
    expect(written(bank)).toBe(V050_READS);
  });
});
