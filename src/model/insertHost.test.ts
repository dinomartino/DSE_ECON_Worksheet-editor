import { beforeEach, describe, expect, it } from 'vitest';
import '@/registry';
import { createHeadingElement, createStimulusElement, resolveFlow } from './flow';
import { createTableBlock } from './factories';
import { createWorksheetFrom } from './newWorksheet';
import { migrate, serializeWorksheet } from './migrations';
import type { ContentBlock, StructuredQuestion, Worksheet } from './types';
import { appendBlockToHost, insertHostFor } from './insertHost';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { useWorksheetStore } from '@/store/worksheetStore';

const s = () => useWorksheetStore.getState();
const table = () => createTableBlock(2, 3);
const idsOf = (blocks: ContentBlock[]) => blocks.map((block) => block.id);

describe('Insert → Table / Picture: where the block goes', () => {
  const worksheet = buildAcceptanceWorksheet();
  const structured = worksheet.questions.find((question) => question.type === 'structured') as StructuredQuestion;

  it('into the question the rail points at, after its text and before its parts', () => {
    const block = table();
    const host = insertHostFor(worksheet, structured.id)!;
    expect(host).toEqual({ kind: 'question', id: structured.id });
    const next = appendBlockToHost(worksheet, host, block);
    const after = next.questions.find((question) => question.id === structured.id) as StructuredQuestion;
    expect(idsOf(after.blocks)).toEqual([...idsOf(structured.blocks), block.id]);
    expect(after.parts).toBe(structured.parts);
    // Nothing else moved.
    expect(next.questions.filter((q) => q.id !== structured.id)).toEqual(worksheet.questions.filter((q) => q.id !== structured.id));
  });

  it('into a shared stimulus the rail points at', () => {
    const stimulus = createStimulusElement();
    const withStimulus: Worksheet = { ...worksheet, layout: [...(worksheet.layout ?? []), stimulus] };
    const host = insertHostFor(withStimulus, stimulus.id)!;
    expect(host).toEqual({ kind: 'stimulus', id: stimulus.id });
    const block = table();
    const next = appendBlockToHost(withStimulus, host, block);
    const after = next.layout!.find((element) => element.id === stimulus.id);
    expect(after?.kind === 'stimulus' && idsOf(after.blocks)).toEqual([...idsOf(stimulus.blocks), block.id]);
  });

  it('no host for a heading, a page break or no anchor: the store makes a question there', () => {
    const heading = createHeadingElement();
    const withHeading: Worksheet = { ...worksheet, layout: [...(worksheet.layout ?? []), heading] };
    expect(insertHostFor(withHeading, heading.id)).toBeUndefined();
    expect(insertHostFor(withHeading, undefined)).toBeUndefined();
    expect(insertHostFor(withHeading, 'gone')).toBeUndefined();
  });
});

describe('insertBlockAtAnchor (the store)', () => {
  beforeEach(() => {
    useWorksheetStore.setState({
      worksheet: buildAcceptanceWorksheet(),
      past: [],
      future: [],
      readOnly: false,
      selectedQuestionId: undefined,
      insertAnchorId: undefined,
    });
  });

  it('a table in the selected question is one undo step, and the question stays selected', () => {
    const target = s().worksheet.questions[1];
    s().select(target.id);
    const block = table();
    s().insertBlockAtAnchor(block);
    const after = s().worksheet.questions[1];
    expect(after.blocks.at(-1)?.id).toBe(block.id);
    expect(s().selectedQuestionId).toBe(target.id);
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().worksheet.questions[1].blocks).toEqual(target.blocks);
  });

  it('after a heading, a new structured question holds it, right after the heading', () => {
    const heading = createHeadingElement();
    s().addLayoutElement(heading, s().worksheet.questions[0].id);
    const before = s().worksheet.questions.length;
    const past = s().past.length;
    const block = table();
    s().insertBlockAtAnchor(block, heading.id);
    const flow = resolveFlow(s().worksheet);
    const at = flow.findIndex((item) => item.id === heading.id);
    const created = flow[at + 1];
    expect(created.type).toBe('question');
    expect(s().worksheet.questions).toHaveLength(before + 1);
    const question = s().worksheet.questions.find((q) => q.id === created.id)!;
    expect(question.type).toBe('structured');
    expect(question.blocks.at(-1)?.id).toBe(block.id);
    expect(s().selectedQuestionId).toBe(question.id);
    expect(s().past.length).toBe(past + 1);
  });

  it('on an empty Paper 1, the new question is an MC (all a Paper 1 holds)', () => {
    useWorksheetStore.setState({ worksheet: createWorksheetFrom({ documentType: 'paper1', seedSample: false }) });
    s().insertBlockAtAnchor(table());
    expect(s().worksheet.questions.map((q) => q.type)).toEqual(['mcq']);
  });

  it('the paper saves and reopens with the table where it was put', () => {
    const target = s().worksheet.questions[0];
    const block = table();
    s().insertBlockAtAnchor(block, target.id);
    const reopened = migrate(JSON.parse(JSON.stringify(serializeWorksheet(s().worksheet))));
    expect(reopened.questions[0].blocks.at(-1)).toEqual(block);
  });
});
