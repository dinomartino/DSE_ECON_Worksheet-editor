import '@/registry';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { groupRows } from '@/library/group';
import { rowsOf } from '@/library/indexer';
import { choiceQuestion, docWith, partsQuestion } from '@/library/testKit';
import { bi } from '@/model/text';
import type { BankSnapshot } from '@/library/bankIndex';

const fake = vi.hoisted(() => ({ snapshot: undefined as unknown }));
vi.mock('@/library/useBank', () => ({ useBank: () => ({ ...(fake.snapshot as object), refresh: () => {} }) }));

const { MyQuestionsPane } = await import('./MyQuestionsPane');

function paper(id: string, title: string, n: number, mcqs: number, lqs: number) {
  const questions = [
    ...Array.from({ length: mcqs }, (_, i) => choiceQuestion(`${title} MC ${i + 1}`, `${title} 多項選擇題 ${i + 1}`, ['C.ped'])),
    ...Array.from({ length: lqs }, (_, i) => partsQuestion(`${title} LQ ${i + 1}`)),
  ];
  return { ...docWith(questions), id, title: bi(title, title), satOn: `2026-11-${String(n).padStart(2, '0')}`, createdAt: '2026-01-01', updatedAt: '2026-11-01' };
}

function snapshot(...docs: ReturnType<typeof paper>[]): BankSnapshot {
  const rows = docs.flatMap((d) => rowsOf(d));
  return { status: { state: 'ready', done: docs.length, total: docs.length }, rows, groups: groupRows(rows) };
}

const html = (ui: 'en' | 'zh-HK' = 'en') =>
  renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <MyQuestionsPane words="" language="en" onChoice={() => {}} onPick={() => {}} />
    </UiLanguageOverride.Provider>,
  );

describe('My questions pane (k-0529)', () => {
  it('lists only MC, says how many others are left out, and draws a page at a time', () => {
    fake.snapshot = snapshot(paper('p1', 'Mock 2026', 20, 50, 3), paper('p2', 'Quiz', 2, 2, 0));
    const out = html();
    expect(out).toContain('52 multiple-choice questions');
    expect(out).toContain('Only MC for now: 3 other questions are not listed.');
    expect(out.match(/data-my-card=/g)).toHaveLength(40);
    expect(out).toContain('Show more (12 left)');
    expect(out).not.toContain('LQ 1');
    // Newest paper first (the older quiz is on the next page); the rail offers the topic.
    expect(out).toContain('Mock 2026 · Q1');
    expect(out).not.toContain('Quiz · Q1');
    expect(out).toContain('data-my-topic="C"');
    expect(out).toContain('Select a question to see it here.');
  });

  it('speaks 中文', () => {
    fake.snapshot = snapshot(paper('p1', 'Mock', 20, 1, 1));
    const out = html('zh-HK');
    expect(out).toContain('1 條多項選擇題');
    expect(out).toContain('暫時只限 MC：另有 1 條其他題目未列出。');
    expect(out).toContain('最近使用或製作');
    expect(out).toContain('所有課題');
  });

  it('says when nothing is saved yet', () => {
    fake.snapshot = snapshot();
    expect(html()).toContain('No multiple-choice questions saved yet.');
  });
});
