/**
 * Test-only helpers for the answer writer: a small paper and a canned model that answers
 * any payload validly. Never imported by app code.
 */
import type { CompletionRequest } from '@/ai/types';
import { createMcqQuestion, createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { McqQuestion, StructuredQuestion, Worksheet } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import type { AnswersPayload } from './prompt';
import type { ReplyItem } from './validate';

const para = (en: string, zh = '') => createParagraphBlock(bi(en, zh));

/** Q1: (a) 4 marks; (b)(i) 2 marks, (b)(ii) 3 marks answered by the teacher. Q2: an MCQ keyed B, option A explained. */
export function answersPaper(zh = false): { ws: Worksheet; structured: StructuredQuestion; mcq: McqQuestion } {
  const z = (text: string) => (zh ? text : '');
  const structured: StructuredQuestion = {
    ...createStructuredQuestion(),
    id: 'Q1',
    blocks: [para('A tax is imposed on cigarettes.', z('政府向香煙徵稅。'))],
    parts: [
      { id: 'PA', blocks: [para('Explain why the price level rises.', z('解釋為何物價水平上升。'))], marks: 4 },
      {
        id: 'PB',
        blocks: [para('Refer to the tax.', z('參考該稅項。'))],
        subParts: [
          { id: 'S1', blocks: [para('State the tax incidence.', z('指出稅收承擔。'))], marks: 2 },
          { id: 'S2', blocks: [para('Explain.', z('解釋。'))], marks: 3, answer: bi('Teacher wrote this.', '') },
        ],
      },
    ],
  };
  const mcq: McqQuestion = {
    ...createMcqQuestion(),
    id: 'Q2',
    blocks: [para('Which is a public good?', z('下列哪項是公共財品？'))],
    options: ['Bread', 'Street lighting', 'A bus ride', 'Petrol'].map((text, index) => ({
      id: `O${index}`,
      text: bi(text, ''),
      ...(index === 0 ? { rationale: bi('Teacher: rival.', '') } : {}),
    })),
    answerIndex: 1,
  };
  const ws = withFlow(createWorksheet(), [structured, mcq]);
  ws.id = 'WS';
  return { ws, structured, mcq };
}

export const payloadOf = (req: CompletionRequest): AnswersPayload => JSON.parse(req.turns[req.turns.length - 1].content);

/** A valid reply to every item: 1-mark points that total the marks, a rationale per letter. */
export function cannedItems(payload: AnswersPayload, tweak: (item: ReplyItem) => ReplyItem = (i) => i): ReplyItem[] {
  const zh = payload.languages.includes('zh');
  return payload.questions.flatMap((q) =>
    q.items.map((item) => {
      if (item.type === 'choice') {
        return tweak({
          key: item.key, answerEn: '', answerZh: '', points: [],
          rationales: item.write.map((letter) => ({ option: letter, en: `Why ${letter}.`, zh: zh ? `${letter} 的原因。` : '' })),
        });
      }
      const writesAnswer = item.write.includes('answer');
      const points = item.write.includes('scheme')
        ? Array.from({ length: item.marks ?? 0 }, (_, n) => ({ en: `Point ${n + 1}`, zh: zh ? `要點${n + 1}` : '', marks: 1 }))
        : [];
      return tweak({
        key: item.key,
        answerEn: writesAnswer ? `Answer ${item.label}` : '',
        answerZh: writesAnswer && zh ? `答案${item.label}` : '',
        points,
        rationales: [],
      });
    }),
  );
}

export const cannedReply = (req: CompletionRequest, tweak?: (item: ReplyItem) => ReplyItem) =>
  JSON.stringify({ items: cannedItems(payloadOf(req), tweak) });
