/**
 * "Bump only when used" (§ `writtenSchemaVersion`). v0.5.0 reads schema 1 and opens any
 * higher `schemaVersion` read-only, never overwriting it. It ignores the diagram answer
 * layer (it would print teacher answers on the student copy) and `answerKeyLayout` (it
 * would print the key as Classic), so a document using either must be written above 1,
 * and every other document must stay written at 1.
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
import { createStimulusElement } from './flow';
import { createGraph, migrateGraph, serializeGraph } from './graph';
import { withAnswerKeyLayout, withAnswerKeyPreset } from './answerKeyLayout';
import { editableCopy } from '@/storage/document';
import type { Diagram } from './diagram';
import type { DiagramBlock, Worksheet } from './types';

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
