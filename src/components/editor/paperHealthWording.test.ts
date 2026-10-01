import { describe, expect, it } from 'vitest';
import { resolveMessages } from '@/i18n/catalogue';
import { createMcqQuestion, createParagraphBlock, createStructuredQuestion, createWorksheet, newId } from '@/model/factories';
import { checkPaper } from '@/model/paperHealth';
import { bi } from '@/model/text';
import { withFlow } from '@/test/fixtures';
import { wording } from './PaperHealthPanel';
import { PAPER_CHECK_MESSAGES } from './shell.messages';

function mcq(answer: number | undefined, tag: string) {
  const q = createMcqQuestion();
  q.blocks = [createParagraphBlock(bi(`Which ${tag}?`, `哪項${tag}？`))];
  q.options = ['a', 'b', 'c', 'd'].map((w) => ({ id: newId(), text: bi(`${w} ${tag}`, `${w}${tag}`) }));
  q.answerIndex = answer as number;
  return q;
}

describe('the Paper check wording', () => {
  const questions = [...Array.from({ length: 10 }, (_, i) => mcq(0, `q${i}`)), mcq(undefined, 'x'), createStructuredQuestion()];
  const worksheet = withFlow(createWorksheet(), questions, { replaceLayout: true });
  worksheet.target = { marks: 3, counts: { mcq: 40 } };
  const report = checkPaper(worksheet);
  const en = resolveMessages(PAPER_CHECK_MESSAGES, 'en');
  const zh = resolveMessages(PAPER_CHECK_MESSAGES, 'zh-HK');

  it('says in English exactly what the model says', () => {
    expect(report.findings.length).toBeGreaterThan(4);
    for (const finding of report.findings) expect(wording(finding, report.summary, en, false)).toBe(finding.message);
  });

  it('says every finding in Chinese', () => {
    for (const finding of report.findings) {
      expect(wording(finding, report.summary, zh, true), finding.id).toMatch(/[一-鿿]/);
    }
  });
});
