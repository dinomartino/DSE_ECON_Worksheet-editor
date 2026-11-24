import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportDocxBuffer } from '@/export/docx';
import { createWorksheet } from '@/model/factories';
import type { Worksheet } from '@/model/types';
import '@/registry';
import { materialize } from './deliver';
import { studioBuilds } from './insert';
import { checkNearCopy, EMPTY_CORPUS } from './nearCopy';
import { corpusDocOfDraft, corpusDocOfSource } from './source';
import { cellsOf, hasStemTable, segmentsOf, stemBlocks } from './stemTable';
import type { SourceQuestion, StudioDraft } from './types';
import { cleanMcq, localChecks, parseWriteReply, statusOf } from './validate';
import type { TableBlock } from '@/model/types';
import { plain } from '@/model/text';

/**
 * k-0531 (u-p8bn): drafts with a table were "easily rejected" and printed their table as pipes.
 *
 * REAL_REPLY is a real model reply (Claude Sonnet standing in for Gemini, 2026-11-24) to the
 * studio's real write request (`buildWriteRequest`) for C.intervention with TABLE_REF as the
 * example: the exact system prompt and payload the app sends. Kept as the model wrote it.
 */
const bi = (en: string, zh: string) => ({ en, zh });
const TABLE_REF: SourceQuestion = {
  id: 'BANK/table1',
  label: 'Invented table question',
  stem: bi(
    'The table below shows the market demand for and supply of good X.\nPrice ($) | Quantity demanded (units) | Quantity supplied (units)\n10 | 500 | 200\n12 | 450 | 300\n14 | 400 | 400\n16 | 350 | 500\nIf the government sets a price ceiling at $12, there will be a',
    '下表顯示物品 X 的市場需求及供應。\n價格（$）| 需求量（單位）| 供應量（單位）\n10 | 500 | 200\n12 | 450 | 300\n14 | 400 | 400\n16 | 350 | 500\n若政府把價格上限定於 $12，市場會出現',
  ),
  statements: [],
  options: [bi('shortage of 150 units.', '短缺 150 單位。'), bi('surplus of 150 units.', '過剩 150 單位。'), bi('shortage of 50 units.', '短缺 50 單位。'), bi('surplus of 100 units.', '過剩 100 單位。')],
  answerIndex: 0,
  hasFigure: false,
};

const REAL_REPLY = "{\"questions\":[{\"stem\":{\"en\":\"The table below shows the market demand for and supply of good Y.\\nPrice ($) | Quantity demanded (units) | Quantity supplied (units)\\n20 | 100 | 40\\n25 | 85 | 55\\n30 | 70 | 70\\n35 | 55 | 85\\nIf the government sets a price floor at $35, there will be a\",\"zh\":\"下表顯示物品 Y 的市場需求及供應。\\n價格（$）| 需求量（單位）| 供應量（單位）\\n20 | 100 | 40\\n25 | 85 | 55\\n30 | 70 | 70\\n35 | 55 | 85\\n若政府把價格下限定於 $35，市場會出現\"},\"statements\":[],\"options\":[{\"en\":\"no surplus or shortage.\",\"zh\":\"沒有過剩或短缺。\"},{\"en\":\"surplus of 15 units.\",\"zh\":\"過剩 15 單位。\"},{\"en\":\"surplus of 30 units.\",\"zh\":\"過剩 30 單位。\"},{\"en\":\"surplus of 85 units.\",\"zh\":\"過剩 85 單位。\"}],\"answer\":2,\"explanation\":{\"en\":\"The equilibrium price is $30, so a floor at $35 is binding. At $35, quantity supplied is 85 units and quantity demanded is 55 units, so the surplus is 30 units. 'No surplus or shortage' wrongly treats the floor as non-binding; 15 units counts only the fall in quantity demanded from equilibrium; 85 units is just the quantity supplied.\",\"zh\":\"均衡價格為 $30，所以 $35 的價格下限具約束力。在 $35 時，供應量為 85 單位，需求量為 55 單位，過剩為 30 單位。「沒有過剩或短缺」誤以為價格下限沒有約束力；15 單位只計算了需求量相對均衡的跌幅；85 單位只是供應量。\"},\"angle\":\"Price floor read from a table instead of a price ceiling\",\"changes\":[{\"aspect\":\"varies\",\"note\":{\"en\":\"Price floor above equilibrium instead of a price ceiling below it\",\"zh\":\"價格下限（高於均衡價格）取代價格上限（低於均衡價格）\"}},{\"aspect\":\"numbers\",\"note\":{\"en\":\"New table figures, floor at $35, surplus of 30 units\",\"zh\":\"表中數字更新，價格下限為 $35，過剩 30 單位\"}},{\"aspect\":\"key\",\"note\":{\"en\":\"Key is now option C (the example's was A)\",\"zh\":\"答案改為 C（範例為 A）\"}}]},{\"stem\":{\"en\":\"A unit tax is imposed on the sellers of a good in a competitive market with a downward-sloping demand curve and an upward-sloping supply curve. Which of the following statements are correct?\",\"zh\":\"在一個競爭市場中，需求曲線向右下傾斜，供應曲線向右上傾斜，政府向某物品的賣方徵收從量稅。以下哪些陳述是正確的？\"},\"statements\":[{\"en\":\"The supply curve shifts upward by the amount of the tax.\",\"zh\":\"供應曲線向上移動，幅度等於稅額。\"},{\"en\":\"The price paid by buyers rises by the full amount of the tax.\",\"zh\":\"買方支付的價格上升，幅度等於全部稅額。\"},{\"en\":\"The equilibrium quantity decreases.\",\"zh\":\"均衡數量減少。\"}],\"options\":[{\"en\":\"(1) and (2) only\",\"zh\":\"只有(1)及(2)\"},{\"en\":\"(1) and (3) only\",\"zh\":\"只有(1)及(3)\"},{\"en\":\"(2) and (3) only\",\"zh\":\"只有(2)及(3)\"},{\"en\":\"(1), (2) and (3)\",\"zh\":\"(1)、(2)及(3)\"}],\"answer\":1,\"explanation\":{\"en\":\"A unit tax on sellers raises their cost per unit, so supply shifts upward by the tax and the equilibrium quantity falls. Statement (2) is wrong because with a downward-sloping demand curve and an upward-sloping supply curve, buyers pay only part of the tax and sellers bear the rest.\",\"zh\":\"向賣方徵收從量稅會提高賣方每單位成本，所以供應曲線向上移動，幅度等於稅額，均衡數量下降，故(1)及(3)正確。(2)錯誤，因為需求曲線向右下傾斜而供應曲線向右上傾斜，買方只承擔部分稅款，其餘由賣方承擔。\"},\"angle\":\"Combination item on unit tax effects, with the slip of full tax passed to buyers\",\"changes\":[{\"aspect\":\"varies\",\"note\":{\"en\":\"Unit tax and tax burden instead of a price control\",\"zh\":\"考核從量稅及稅負，而非價格管制\"}},{\"aspect\":\"format\",\"note\":{\"en\":\"Combination item with three statements instead of a plain question with a table\",\"zh\":\"改為三項陳述的組合題，不用表格\"}},{\"aspect\":\"key\",\"note\":{\"en\":\"Key is now option B (the example's was A)\",\"zh\":\"答案改為 B（範例為 A）\"}}]},{\"stem\":{\"en\":\"In the market for a certain good in Hong Kong, the equilibrium price is $50 and the equilibrium quantity is 1 000 units. The government now sets a quota of 700 units on the total quantity that can be sold. Which of the following will happen?\",\"zh\":\"在香港某物品的市場中，均衡價格為 $50，均衡數量為 1 000 單位。政府現規定可出售的總數量配額為 700 單位。以下哪項會出現？\"},\"statements\":[],\"options\":[{\"en\":\"The price falls below $50 and 700 units are traded.\",\"zh\":\"價格下降至 $50 以下，成交 700 單位。\"},{\"en\":\"The price stays at $50 and 700 units are traded.\",\"zh\":\"價格維持在 $50，成交 700 單位。\"},{\"en\":\"The price rises above $50 and 1 000 units are traded.\",\"zh\":\"價格上升至 $50 以上，成交 1 000 單位。\"},{\"en\":\"The price rises above $50 and 700 units are traded.\",\"zh\":\"價格上升至 $50 以上，成交 700 單位。\"}],\"answer\":3,\"explanation\":{\"en\":\"The quota is below the equilibrium quantity, so it is binding: only 700 units can be traded, and buyers who want more bid the price above $50. A fall in price ignores the shortage; an unchanged price ignores the shortage created at $50; 1 000 units traded would exceed the quota.\",\"zh\":\"配額低於均衡數量，所以具約束力：只可成交 700 單位，想買更多的買方會把價格推高至 $50 以上。價格下降忽略了短缺；價格不變忽略了 $50 時出現的短缺；成交 1 000 單位則超出配額。\"},\"angle\":\"Quota effect on price and quantity traded, in words without a table\",\"changes\":[{\"aspect\":\"varies\",\"note\":{\"en\":\"Quantity intervention (quota) instead of a price control\",\"zh\":\"數量干預（配額）取代價格管制\"}},{\"aspect\":\"numbers\",\"note\":{\"en\":\"No table; equilibrium $50 and 1 000 units, quota of 700 units\",\"zh\":\"不用表格；均衡為 $50 及 1 000 單位，配額 700 單位\"}},{\"aspect\":\"key\",\"note\":{\"en\":\"Key is now option D (the example's was A)\",\"zh\":\"答案改為 D（範例為 A）\"}}]}]}";

const sides = ['en', 'zh'] as const;
const realDrafts = () => parseWriteReply(REAL_REPLY)!.map((raw) => cleanMcq(raw.draft, sides));
const ctx = (extra = [corpusDocOfSource(TABLE_REF)]) => ({ sides, keyPoint: 'C.intervention', asked: 'any' as const, glossary: null, corpus: EMPTY_CORPUS, extra });

describe('a table in a draft (k-0531)', () => {
  it('the real reply keeps its table through cleaning: one row per line, cells joined by |', () => {
    const [table] = realDrafts();
    expect(table.stem.en.split('\n')).toHaveLength(7);
    expect(hasStemTable(table.stem)).toBe(true);
    expect(segmentsOf(table.stem.zh).map((s) => s.kind)).toEqual(['text', 'table', 'text']);
  });

  it('is drawn as a real table between its words, English and 中文 cell by cell', () => {
    const [table] = realDrafts();
    const blocks = stemBlocks(table.stem);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    const grid = blocks[1] as TableBlock;
    expect(grid.rows).toHaveLength(5);
    expect(grid.rows.every((r) => r.cells.length === 3)).toBe(true);
    expect(plain(grid.rows[0].cells[0].text.en)).toBe('Price ($)');
    expect(plain(grid.rows[0].cells[1].text.zh)).toBe('需求量（單位）');
    expect(plain(grid.rows[4].cells[2].text.en)).toBe('85');
    expect(plain((blocks[2] as { text: { en: unknown[] } }).text.en as never)).toBe('If the government sets a price floor at $35, there will be a');
  });

  it('the question the card and the paper draw holds the table, not pipes', () => {
    const [table] = realDrafts();
    const draft = { id: 'd1', draft: table, angle: '', attempt: 1, checks: [], status: 'ok' } as unknown as StudioDraft;
    const question = materialize(studioBuilds([draft], 'C.intervention')[0])!;
    expect(question.blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(JSON.stringify(question.blocks)).not.toContain('|');
  });

  it('an accepted table draft goes into the paper and the .docx as a real Word table, English and 中文', async () => {
    const [table] = realDrafts();
    const draft = { id: 'd1', draft: table, angle: '', attempt: 1, checks: [], status: 'ok' } as unknown as StudioDraft;
    const question = materialize(studioBuilds([draft], 'C.intervention')[0])!;
    const worksheet: Worksheet = { ...createWorksheet(), questions: [question], flow: [{ type: 'question', id: question.id }] };
    for (const language of ['en', 'zh'] as const) {
      const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, { language, version: 'student' }, new Map()));
      const xml = await zip.file('word/document.xml')!.async('string');
      const tbl = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)?.[0] ?? '';
      expect(tbl.match(/<w:tr>/g)).toHaveLength(5);
      expect(tbl).toContain(language === 'en' ? 'Quantity supplied (units)' : '供應量（單位）');
      expect(xml).not.toMatch(/\d+ \| \d+/);
    }
  });

  it('reads Markdown tables too (outer pipes, a |---| rule), and keeps a lone pipe line as words', () => {
    const md = 'Look at the table.\n\n| Output | Total cost ($) |\n|---|:---:|\n| 1 | 10 |\n| 2 | 18 |\n\nWhat is the marginal cost of the 2nd unit?';
    const blocks = stemBlocks({ en: md, zh: '' });
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'paragraph']);
    expect((blocks[1] as TableBlock).rows).toHaveLength(3);
    expect(cellsOf('A | B')).toEqual(['A', 'B']);
    expect(stemBlocks({ en: 'Either A | or B, which is right?', zh: '' }).map((b) => b.kind)).toEqual(['paragraph']);
  });

  it('a stem with no table, or English and 中文 laid out differently, stays one paragraph as before', () => {
    expect(stemBlocks(bi('A plain stem.', '一個題幹。')).map((b) => b.kind)).toEqual(['paragraph']);
    const odd = stemBlocks(bi('Price | Qd\n10 | 5\n12 | 4\nWhich?', '價格 10 時需求量 5。哪一項？'));
    expect(odd.map((b) => b.kind)).toEqual(['paragraph']);
  });
});

describe('the near-copy check and tables (k-0531)', () => {
  it('two tables that share only their layout and headings are not a copy: numbers no longer count as copied words', () => {
    const [table] = realDrafts();
    // The real draft in its own words, as the prompt now asks: same headings (the economics needs them), new numbers.
    const own = {
      ...table,
      stem: bi(
        'Good Y is sold in a competitive market. Its demand and supply schedules are given below.\n' + table.stem.en.split('\n').slice(1, 6).join('\n') + '\nWhat happens in the market when a minimum price of $35 is imposed? There is a',
        '物品 Y 在競爭市場出售，其需求及供應表如下。\n' + table.stem.zh.split('\n').slice(1, 6).join('\n') + '\n當政府實施 $35 的最低價格時，市場上會有',
      ),
    };
    const copy = localChecks(own, ctx()).find((r) => r.id === 'copy')!;
    expect(copy.state).toBe('pass');
    expect(statusOf(localChecks(own, ctx()))).not.toBe('failed');
  });

  it('a long numeric table alone is never "copied word for word"', () => {
    const rows = (k: number) => Array.from({ length: 6 }, (_, i) => `${10 + i * k} | ${500 - i * 30} | ${200 + i * 40} | ${i * 7}`).join('\n');
    const a = { en: `Firm A's costs are shown below.\nOutput | Price | Cost | Profit\n${rows(2)}\nWhich output maximises profit?`, zh: '' };
    const b = { en: `The table gives a farm's weekly figures.\nOutput | Price | Cost | Profit\n${rows(3)}\nAt which output is revenue highest?`, zh: '' };
    const result = checkNearCopy(a, EMPTY_CORPUS, [{ id: 'b', kind: 'draft', ...b }]);
    expect(result.verbatim).toBe(false);
    expect(result.tooClose).toBe(false);
  });

  it('the real draft, which reuses the example\'s sentences word for word, is still warned as close (the protection stays)', () => {
    const [table, ...others] = realDrafts();
    const extra = [corpusDocOfSource(TABLE_REF), ...others.map((d, i) => corpusDocOfDraft(`d${i}`, d))];
    const copy = localChecks(table, ctx(extra)).find((r) => r.id === 'copy')!;
    expect(copy).toMatchObject({ state: 'fail', findings: [{ id: 'copy.close', params: { with: 'example', verbatim: 0 } }] });
    // Warned, never left out: the teacher sees it and decides.
    expect(statusOf(localChecks(table, ctx(extra)))).toBe('look');
  });

  it('the other two real drafts (no table) pass the copy check', () => {
    const [, ...others] = realDrafts();
    for (const d of others) expect(localChecks(d, ctx()).find((r) => r.id === 'copy')!.state).toBe('pass');
  });
});

