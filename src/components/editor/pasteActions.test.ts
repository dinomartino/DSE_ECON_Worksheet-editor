import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import '@/registry';
import { resolveFlow } from '@/model/flow';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { plain, rt } from '@/model/text';
import type { McqQuestion, StructuredQuestion } from '@/model/types';
import type { EditTarget } from '@/render/ir';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import {
  acceptPasteOffer,
  isBlankQuestion,
  isPasteOfferStale,
  offerPastedQuestions,
  usePasteOffer,
} from './pasteActions';

const s = () => useWorksheetStore.getState();
const MC = readFileSync(new URL('../../import/fixtures/01-word-plain-mc.txt', import.meta.url), 'utf8');

/** Type `text` into the first paragraph of question `index` as a paste would, then offer. */
function pasteInto(index: number, text: string) {
  const question = s().worksheet.questions[index];
  const block = question.blocks[0];
  const target: EditTarget = { kind: 'blockText', blockId: block.id };
  const before = block.kind === 'paragraph' ? block.text.en : [];
  s().applyEdit(target, { en: [...before, { text }], zh: block.kind === 'paragraph' ? block.text.zh : [] });
  offerPastedQuestions({ text }, { target, side: 'en', before });
  return { question, target, before };
}

beforeEach(() => {
  useWorksheetStore.setState({
    worksheet: buildAcceptanceWorksheet(),
    past: [],
    future: [],
    readOnly: false,
    selectedQuestionId: undefined,
    insertAnchorId: undefined,
  });
  usePasteOffer.setState({ offer: undefined });
});

describe('Make these into questions', () => {
  it('a paste of numbered MC questions is offered, with how many', () => {
    pasteInto(0, MC);
    expect(usePasteOffer.getState().offer?.batch.builds.length).toBeGreaterThanOrEqual(3);
  });

  it('prose is not offered', () => {
    pasteInto(0, ' and the price rose.');
    expect(usePasteOffer.getState().offer).toBeUndefined();
  });

  it('takes the pasted text back and puts the questions after that question, in one undo step', () => {
    const { question, before } = pasteInto(0, MC);
    const count = s().worksheet.questions.length;
    const offer = usePasteOffer.getState().offer!;
    const made = offer.batch.builds.length;
    const pastLength = s().past.length;
    acceptPasteOffer(offer);
    const ws = s().worksheet;
    // The text is as it was before the paste.
    const host = ws.questions.find((q) => q.id === question.id)!;
    expect(host.blocks[0].kind === 'paragraph' && host.blocks[0].text.en).toEqual(before);
    // The new questions follow it, MC, with their options.
    expect(ws.questions).toHaveLength(count + made);
    const flow = resolveFlow(ws).filter((item) => item.type === 'question').map((item) => item.id);
    const at = flow.indexOf(question.id);
    const fresh = flow.slice(at + 1, at + 1 + made).map((id) => ws.questions.find((q) => q.id === id)!);
    expect(fresh.every((q) => q.type === 'mcq')).toBe(true);
    expect((fresh[1] as McqQuestion).options.map((o) => plain(o.text.en))).toContain('sunlight on a beach in Sai Kung');
    expect(s().selectedQuestionId).toBe(fresh[0].id);
    expect(s().past.length).toBe(pastLength + 1);
    expect(usePasteOffer.getState().offer).toBeUndefined();
    // One undo: the questions go and the pasted text is back.
    s().undo();
    expect(s().worksheet.questions).toHaveLength(count);
  });

  it('a new, empty question that held only the paste gives its place to the questions', () => {
    useWorksheetStore.setState({ worksheet: createWorksheetFrom({ documentType: 'classroom', seedSample: false }) });
    s().addQuestion('structured');
    const empty = s().worksheet.questions[0] as StructuredQuestion;
    expect(isBlankQuestion(empty)).toBe(true);
    pasteInto(0, MC);
    acceptPasteOffer(usePasteOffer.getState().offer!);
    const ws = s().worksheet;
    expect(ws.questions.some((q) => q.id === empty.id)).toBe(false);
    expect(ws.questions.every((q) => q.type === 'mcq')).toBe(true);
    expect(ws.flow.some((entry) => entry.id === empty.id)).toBe(false);
  });

  it('a question with words of its own stays', () => {
    const { question } = pasteInto(0, MC);
    acceptPasteOffer(usePasteOffer.getState().offer!);
    expect(s().worksheet.questions.some((q) => q.id === question.id)).toBe(true);
  });

  it('typing on in that text withdraws the offer', () => {
    const { target } = pasteInto(0, MC);
    const offer = usePasteOffer.getState().offer!;
    expect(isPasteOfferStale(offer, s().worksheet)).toBe(false);
    s().applyEdit(target, { en: rt('typed over'), zh: [] });
    expect(isPasteOfferStale(offer, s().worksheet)).toBe(true);
  });

  it('with no text open, the offer only inserts, at the anchor', () => {
    const count = s().worksheet.questions.length;
    offerPastedQuestions({ text: MC });
    const offer = usePasteOffer.getState().offer!;
    expect(offer.pastedInto).toBeUndefined();
    acceptPasteOffer(offer);
    expect(s().worksheet.questions.length).toBe(count + offer.batch.builds.length);
  });

  it('a read-only paper is never offered', () => {
    useWorksheetStore.setState({ readOnly: true });
    offerPastedQuestions({ text: MC });
    expect(usePasteOffer.getState().offer).toBeUndefined();
  });
});
