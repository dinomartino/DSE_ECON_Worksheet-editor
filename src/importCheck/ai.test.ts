/** The import check's AI half (k-0494): only checked edits are ever offered. Invented fixtures. */
import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { analyseLines, buildImport, readPaste } from '@/import';
import { plain } from '@/model/text';
import type { ParagraphBlock, Question, StructuredQuestion } from '@/model/types';
import { scriptedClient } from '@/translate/testKit';
import { IMPORT_CHECK_SCHEMA, PROMPT_VERSION, questionPayload, runAiCheck, validateProposals, type RawProposal } from './ai';
import { applyOp } from './ops';
import { materializeBatch, reviewInput } from './run';

const PAPER = [
  '1. Peter owns a noodle shop in Sham Shui Po. He employs three cooks.',
  '(a) State ONE type of business ownership of the shop. (1 mark)',
  '(b) Explain why the cooks are paid a time rate. (3 marks)',
].join('\n');

/** The review's input with the paper damaged as an import might: a garbled word, a lost mark. */
function setup() {
  const analysis = analyseLines(readPaste({ plain: PAPER }));
  const batch = buildImport(analysis);
  const qs = materializeBatch(batch);
  const q = qs[0] as StructuredQuestion;
  (q.blocks[0] as ParagraphBlock).text.en = [{ text: 'Peter owns a nood1e shop in Sham Shui Po. He employs three cooks.' }];
  q.parts = [q.parts[0], { ...q.parts[1], marks: undefined }];
  const fixed = { ...batch, builds: qs.map((x) => ({ typeId: x.type, fill: (f: Question) => ({ ...x, id: f.id }) })) };
  return reviewInput(analysis, batch, fixed, { maxWidthPx: 605 });
}

const proposal = (p: Partial<RawProposal>): RawProposal => ({ key: 'q1', ref: 'b1', issue: 'garbled', text: 'A garbled word.', op: 'none', from: '', to: '', marks: 0, ...p });

describe('what the model is sent', () => {
  it('each question with its stretch of the file and the paper by request-local refs', () => {
    const sent = questionPayload(setup(), 0, 'q1')!;
    expect(sent.file).toEqual([
      '1. Peter owns a noodle shop in Sham Shui Po. He employs three cooks.',
      '(a) State ONE type of business ownership of the shop. (1 mark)',
      '(b) Explain why the cooks are paid a time rate. (3 marks)',
    ]);
    expect(JSON.stringify(sent.payload)).not.toMatch(/"id"/);
    expect([...sent.refs.keys()]).toEqual(expect.arrayContaining(['b1', 'm(a)', 'm(b)']));
    expect(PROMPT_VERSION).toBe('ic.1');
    expect(IMPORT_CHECK_SCHEMA.required).toEqual(['items']);
  });
});

describe('validating the model’s proposals', () => {
  it('offers a replacement only with the file’s own words, and it applies', () => {
    const input = setup();
    const sent = [questionPayload(input, 0, 'q1')!];
    const [ok] = validateProposals([proposal({ op: 'replace', from: 'nood1e', to: 'noodle' })], sent, input);
    expect(ok).toMatchObject({ kind: 'ai', q: 0, safe: false, from: 'ai', after: 'Peter owns a noodle shop in Sham Shui Po. He employs three cooks.' });
    expect(ok.fix && 'op' in ok.fix && applyOp(input.paper, ok.fix.op)).toBeTruthy();
  });

  it('drops an invented word (kept as a note with no fix)', () => {
    const input = setup();
    const sent = [questionPayload(input, 0, 'q1')!];
    const [note] = validateProposals([proposal({ op: 'replace', from: 'nood1e', to: 'ramen' })], sent, input);
    expect(note.fix).toBeUndefined();
  });

  it('never removes the file’s words', () => {
    const input = setup();
    const sent = [questionPayload(input, 0, 'q1')!];
    const [note] = validateProposals([proposal({ op: 'remove', from: 'He employs three cooks.' })], sent, input);
    expect(note.fix).toBeUndefined();
  });

  it('sets only a mark the file prints, on a marks ref', () => {
    const input = setup();
    const sent = [questionPayload(input, 0, 'q1')!];
    const [good, bad, wrongRef] = validateProposals(
      [proposal({ ref: 'm(b)', op: 'marks', marks: 3, issue: 'marks' }), proposal({ ref: 'm(b)', op: 'marks', marks: 7, issue: 'marks', text: 'other' }), proposal({ ref: 'b1', op: 'marks', marks: 3, text: 'third' })],
      sent,
      input,
    );
    expect(good.fix && 'op' in good.fix ? good.fix.op : undefined).toMatchObject({ op: 'setMarks', marks: 3, expect: null });
    expect(bad.fix).toBeUndefined();
    expect(wrongRef.fix).toBeUndefined();
  });

  it('ignores a question key or ref that was not sent', () => {
    const input = setup();
    const sent = [questionPayload(input, 0, 'q1')!];
    expect(validateProposals([proposal({ key: 'q9' }), proposal({ ref: 'b99' })], sent, input)).toEqual([]);
  });
});

describe('the run', () => {
  it('asks once per chunk, keeps only checked proposals, never rejects', async () => {
    const input = setup();
    const reply = JSON.stringify({ items: [proposal({ op: 'replace', from: 'nood1e', to: 'noodle' }), proposal({ op: 'replace', from: 'Peter', to: 'Paul', text: 'x' })] });
    const client = scriptedClient([reply]);
    const outcome = await runAiCheck(input, { client, preset: { ...presetFor('openai'), concurrency: 1 }, model: 'fake' }, new AbortController().signal);
    expect(client.requests).toHaveLength(1);
    expect(outcome).toMatchObject({ total: 1, failed: 0, stopped: false });
    expect(outcome.findings.map((f) => Boolean(f.fix))).toEqual([true, false]);
    expect(plain((input.paper[0].blocks[0] as ParagraphBlock).text.en)).toContain('nood1e');
  });

  it('a reply it cannot read twice counts the question as failed', async () => {
    const input = setup();
    const client = scriptedClient(['not json', 'still not']);
    const outcome = await runAiCheck(input, { client, preset: { ...presetFor('openai'), concurrency: 1 }, model: 'fake' }, new AbortController().signal);
    expect(outcome).toMatchObject({ findings: [], failed: 1 });
  });
});
