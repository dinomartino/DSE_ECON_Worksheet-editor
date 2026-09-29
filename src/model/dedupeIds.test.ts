import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { buildAcceptanceWorksheet, TINY_PNG, withFlow } from '@/test/fixtures';
import { richMcq, richStructured } from '@/test/idFixture';
import { buildDocxParts } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { parseWorksheet, stringifyWorksheet } from '@/storage/document';
import { dedupeIds } from './dedupeIds';
import { applyEditTarget, replaceBlockById } from './edits';
import { createParagraphBlock, createWorksheet, newId } from './factories';
import { createStimulusElement, createTextElement, resolveFlow } from './flow';
import { questionIdOwners } from './lineage';
import { migrate } from './migrations';
import { bi, plain } from './text';
import type {
  ContentBlock,
  DiagramBlock,
  McqQuestion,
  OutputMode,
  Question,
  StructuredQuestion,
  Worksheet,
} from './types';

/** Duplicate exactly as builds before the fix did: question, part and sub-part ids only. */
function legacyDuplicate<Q extends Question>(question: Q): Q {
  const next = { ...question, id: newId() } as Q;
  const parts = (next as { parts?: Array<Record<string, unknown>> }).parts;
  if (parts) {
    (next as { parts: unknown }).parts = parts.map((part) => ({
      ...part,
      id: newId(),
      subParts: (part.subParts as Array<Record<string, unknown>> | undefined)?.map((sub) => ({
        ...sub,
        id: newId(),
      })),
    }));
  }
  return next;
}

/** A saved document an older build produced by duplicating two questions, reopened. */
function damagedDocument(): { saved: string; original: Worksheet } {
  const structured = richStructured();
  const mcq = richMcq();
  const stimulus = { ...createStimulusElement(), blocks: [createParagraphBlock(bi('Shared', '共用'))] };
  // A stimulus pasted from a stem: its block shares the stem paragraph's id.
  const pasted = { ...createStimulusElement(), blocks: [structuredClone(structured.blocks[0])] };
  const worksheet = withFlow(createWorksheet(), [
    structured,
    legacyDuplicate(structured),
    stimulus,
    mcq,
    legacyDuplicate(mcq),
    pasted,
  ]);
  const saved = stringifyWorksheet(worksheet);
  return { saved, original: migrate(JSON.parse(saved)) };
}

/** `space:id` for every id the repair is responsible for, duplicates included. */
function ownedIds(worksheet: Worksheet): string[] {
  const out: string[] = [];
  for (const question of worksheet.questions) {
    for (const { space, owner } of questionIdOwners(question)) out.push(`${space}:${owner.id}`);
  }
  for (const element of worksheet.layout) {
    if ('blocks' in element) for (const block of element.blocks) out.push(`block:${block.id}`);
  }
  return out;
}

function diagramImages(worksheet: Worksheet): Map<string, string> {
  const images = new Map<string, string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    const record = value as { kind?: string; id?: string };
    if (record.kind === 'diagram' && record.id) images.set(record.id, TINY_PNG);
    Object.values(value).forEach(walk);
  };
  walk(worksheet.questions);
  walk(worksheet.layout);
  return images;
}

const TEACHER: OutputMode = { language: 'bilingual', version: 'teacher' };
const stem = (question: Question) => question.blocks[0] as Extract<ContentBlock, { kind: 'paragraph' }>;

describe('dedupeIds: nothing to repair', () => {
  it('returns the same object for the frozen v1 corpus', () => {
    const loaded = migrate(structuredClone(v1Corpus));
    expect(dedupeIds(loaded)).toBe(loaded);
    expect(parseWorksheet(JSON.stringify(v1Corpus))).toEqual(loaded);
  });

  it('returns the same object for a fresh and a full document', () => {
    for (const worksheet of [createWorksheet(), buildAcceptanceWorksheet()]) {
      expect(dedupeIds(worksheet)).toBe(worksheet);
    }
  });
});

describe('dedupeIds: a document an older build damaged', () => {
  it('opens with every id unique, the first owner keeping its own', () => {
    const { saved, original } = damagedDocument();
    const before = ownedIds(original);
    expect(new Set(before).size).toBeLessThan(before.length);

    const repaired = parseWorksheet(saved);
    const after = ownedIds(repaired);
    expect(after).toHaveLength(before.length);
    expect(new Set(after).size).toBe(after.length);

    // The originals are untouched; only later holders were renewed.
    expect(repaired.questions[0]).toEqual(original.questions[0]);
    expect(repaired.questions[2]).toEqual(original.questions[2]);
    expect(repaired.flow).toEqual(original.flow);
    expect(repaired.questions.map((q) => q.id)).toEqual(original.questions.map((q) => q.id));
    // The stimulus comes after the stem in flow order, so it is the one renewed.
    const pasted = repaired.layout.at(-1) as { blocks: ContentBlock[] };
    expect(pasted.blocks[0].id).not.toBe(stem(repaired.questions[0]).id);
    expect(pasted.blocks[0]).toEqual({ ...stem(original.questions[0]), id: pasted.blocks[0].id });
  });

  it('edits the copy without touching the original', () => {
    const repaired = parseWorksheet(damagedDocument().saved);
    const [original, copy] = repaired.questions as StructuredQuestion[];
    const [mcq, mcqCopy] = repaired.questions.slice(2) as McqQuestion[];

    let next = applyEditTarget(repaired, { kind: 'blockText', blockId: stem(copy).id }, bi('Edited', '已改'));
    const table = copy.blocks[1] as Extract<ContentBlock, { kind: 'table' }>;
    next = applyEditTarget(
      next,
      { kind: 'tableCell', blockId: table.id, cellId: table.rows[0].cells[0].id },
      bi('Cost', '成本'),
    );
    const answer = copy.parts[0].answerDiagram!;
    next = replaceBlockById(next, answer.id, { ...answer, widthPx: 111 });
    const optionDiagram = mcqCopy.options[0].blocks![0] as DiagramBlock;
    next = replaceBlockById(next, optionDiagram.id, { ...optionDiagram, widthPx: 99 });

    expect(next.questions[0]).toEqual(original);
    expect(next.questions[2]).toEqual(mcq);
    const edited = next.questions[1] as StructuredQuestion;
    expect(plain(stem(edited).text.en)).toBe('Edited');
    expect((edited.parts[0].answerDiagram as DiagramBlock).widthPx).toBe(111);
  });

  it('prints exactly what it printed before the repair', () => {
    const { saved, original } = damagedDocument();
    const repaired = parseWorksheet(saved);
    for (const mode of [TEACHER, { language: 'en', version: 'student' } as OutputMode]) {
      const before = buildDocxParts(original, mode, diagramImages(original));
      const after = buildDocxParts(repaired, mode, diagramImages(repaired));
      expect(after.documentXml).toBe(before.documentXml);
      expect(after.numberingXml).toBe(before.numberingXml);
      expect(after.assets).toEqual(before.assets);
      expect(worksheetClipboardHtml(repaired, mode)).toBe(worksheetClipboardHtml(original, mode));
    }
  });
});

describe('dedupeIds: two questions sharing an id', () => {
  function sharedQuestionId() {
    const first = richMcq();
    const second = { ...richMcq(), id: first.id };
    const note1 = createTextElement();
    const note2 = createTextElement();
    return withFlow(createWorksheet(), [first, note1, second, note2], { replaceLayout: true });
  }

  it('gives the later question a new id and points its flow entry at it', () => {
    const worksheet = sharedQuestionId();
    const [note1, note2] = worksheet.layout.map((element) => element.id);
    // Before: both entries anchor both questions, so each note prints twice.
    expect(resolveFlow(worksheet).map((item) => item.id)).toEqual([
      worksheet.questions[0].id, note1, note2, worksheet.questions[0].id, note1, note2,
    ]);

    const repaired = dedupeIds(worksheet);
    const [first, second] = repaired.questions;
    expect(first.id).toBe(worksheet.questions[0].id);
    expect(second.id).not.toBe(first.id);
    expect(repaired.flow.map((entry) => entry.id)).toEqual([first.id, note1, second.id, note2]);
    expect(resolveFlow(repaired).map((item) => item.id)).toEqual([first.id, note1, second.id, note2]);
  });

  it('leaves a surplus flow entry on the first owner', () => {
    const worksheet = sharedQuestionId();
    worksheet.flow.push({ type: 'question', id: worksheet.questions[0].id });
    const repaired = dedupeIds(worksheet);
    expect(repaired.flow.at(-1)!.id).toBe(repaired.questions[0].id);
  });
});
