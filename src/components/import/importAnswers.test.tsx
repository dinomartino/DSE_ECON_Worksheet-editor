import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { makeDocx, para } from '@/import/fixtures/docx';
import { bufferOf, makePdf, type PdfText } from '@/import/fixtures/pdfWriter';
import { addToBank } from '@/library/bankDocs';
import { createWorksheet } from '@/model/factories';
import type { McqQuestion, Question, StructuredQuestion, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { resolveMessages } from '@/i18n/catalogue';
import { UiLanguageOverride } from '@/i18n/language';
import { createImportedDocuments, readPaperFile } from './fileImport';
import {
  NO_ANSWERS,
  NO_LINKS,
  OWN_ANSWERS,
  answerChoices,
  answerFilesOf,
  answerSource,
  answerSummary,
  examineFile,
  linkedAnswers,
  needsLinking,
  paperRead,
  paperReview,
  paperState,
  papersOf,
  sheetPinKey,
  type BatchFile,
  type Links,
} from './importBatch';
import { LinkStep } from './LinkStep';
import { IMPORT_MESSAGES } from './messages';
import { materialize, previewBase, previewItems } from './previewDoc';
import { ReviewLines } from './ReviewLines';
import { ReviewStep, answerRowText, undoFix } from './ReviewStep';
import { SaveManyStep } from './SaveManyStep';

// Invented papers and answer files only: the repo is public.

const en = resolveMessages(IMPORT_MESSAGES, 'en');
const zh = resolveMessages(IMPORT_MESSAGES, 'zh-HK');
const docx = (lines: string[]) => makeDocx({ body: lines.map((l) => para(l)).join('') });
const text = (runs: ReadonlyArray<{ text: string }> | undefined) => (runs ?? []).map((r) => r.text).join('');

/** S5 Test 1: Part A three MC (Q1 starred B in the paper), Part B two written. */
const TEST1 = [
  'Part A',
  '1.\tWhich of the following is a free good?',
  'A.\tAir in the countryside',
  '*B.\tBottled water',
  'C.\tA school textbook',
  'D.\tA cinema ticket',
  '2.\tWhich of the following is a stock concept?',
  'A.\tSavings in a bank account',
  'B.\tMonthly income',
  'C.\tDaily output',
  'D.\tAnnual exports',
  '3.\tA rise in the price of tea will',
  'A.\traise the demand for coffee.',
  'B.\tlower the supply of tea.',
  'C.\traise the demand for tea.',
  'D.\tlower the demand for coffee.',
  'Part B',
  '1.\tExplain what is meant by opportunity cost.\t(2 marks)',
  '2.\tMs Wong runs a bakery in Sha Tin.',
  '(a)\tExplain why the price of bread may rise.\t(2 marks)',
  '(b)\tState what happens to the fixed cost if the rent rises.\t(1 mark)',
];

/** Its answers: Q1 A (the paper says B), Q3 E (out of range), Part B Q2(b) left out. */
const TEST1_ANS = [
  'Marking Scheme',
  'Part A',
  '1. A\t2. D\t3. E',
  'Part B',
  '1.\tOpportunity cost is the highest-valued option forgone (1)',
  '\tIt is the cost of making a choice. (1)',
  '2(a)\tDemand for bread rises (1) so its price rises (1)',
];

/** S5 Test 2, a one-page PDF with two MC. */
function test2Pdf(): ArrayBuffer {
  const texts: PdfText[] = [];
  const q = (n: number, top: number, stem: string, options: string[]) => {
    texts.push({ text: `${n}.`, x: 42, y: top }, { text: stem, x: 66, y: top });
    options.forEach((o, k) => texts.push({ text: `${String.fromCharCode(65 + k)}.`, x: 66, y: top - 18 - k * 14 }, { text: o, x: 90, y: top - 18 - k * 14 }));
  };
  q(1, 760, 'Which of the following is a free good?', ['air', 'bread', 'tea', 'rice']);
  q(2, 640, 'Which of the following raises the supply of rice?', ['a lower wage', 'a higher tax', 'a flood', 'a drought']);
  return bufferOf(makePdf([{ texts }]));
}

const scanPdf = () => {
  const page = { images: [{ x: 20, y: 20, w: 555, h: 800 }] };
  return bufferOf(makePdf([page, page]));
};

async function readAll(files: Array<[string, ArrayBuffer | Promise<ArrayBuffer>]>): Promise<BatchFile[]> {
  const out: BatchFile[] = [];
  for (const [k, [name, bytes]] of files.entries()) out.push(examineFile(`f${k}`, name, await readPaperFile(name, await bytes)));
  return out;
}

const byName = (files: BatchFile[], name: string) => files.find((f) => f.name === name)!;

describe('several files: read, classify, pair', () => {
  it('reads each file, guesses its role with reasons, and suggests the answers for each paper', async () => {
    const files = await readAll([
      ['S5 Test 1.docx', docx(TEST1)],
      ['S5 Test 2.pdf', test2Pdf()],
      ['S5 Test 1 ans.docx', docx(TEST1_ANS)],
      ['S5 Test 2 ans.pdf', scanPdf()],
    ]);
    expect(files.map((f) => [f.name, f.outcome.kind, f.guess.role])).toEqual([
      ['S5 Test 1.docx', 'ok', 'questions'],
      ['S5 Test 2.pdf', 'ok', 'questions'],
      ['S5 Test 1 ans.docx', 'ok', 'answers'],
      ['S5 Test 2 ans.pdf', 'problem', 'answers'],
    ]);
    expect(byName(files, 'S5 Test 1 ans.docx').guess.reasons).toEqual(expect.arrayContaining(['nameSaysAnswers', 'keyEntries']));
    expect(needsLinking(files)).toBe(true);
    // The scanned answers file links nothing: it is no choice for any paper.
    expect(answerFilesOf(files, NO_LINKS).map((f) => f.name)).toEqual(['S5 Test 1 ans.docx']);
    expect(papersOf(files, NO_LINKS).map((f) => f.name)).toEqual(['S5 Test 1.docx', 'S5 Test 2.pdf']);
    expect(linkedAnswers(files, NO_LINKS)).toEqual({ f0: 'f2', f1: NO_ANSWERS });

    const html = renderToStaticMarkup(
      <LinkStep text={en} files={files} links={NO_LINKS} answers={linkedAnswers(files, NO_LINKS)} counts={{ f0: 5, f1: 2 }} onRole={() => {}} onAnswers={() => {}} onRemove={() => {}} />,
    );
    expect(html).toContain('name says answers · has an answer key');
    expect(html).toContain('Answers cannot be read from a scan yet (text recognition is coming), so it links to no paper.');
    expect(html).toContain('2 pages');
    expect(html).toMatch(/aria-label="Answers from: S5 Test 1\.docx"[^>]*>.*?<option value="f2" selected="">S5 Test 1 ans\.docx<\/option>/);
    expect(html).toContain('aria-label="Leave S5 Test 2 ans.pdf out of the import"');
    const zhHtml = renderToStaticMarkup(
      <UiLanguageOverride.Provider value="zh-HK">
        <LinkStep text={zh} files={files} links={NO_LINKS} answers={linkedAnswers(files, NO_LINKS)} counts={{}} onRole={() => {}} onAnswers={() => {}} onRemove={() => {}} />
      </UiLanguageOverride.Provider>,
    );
    expect(zhHtml).toContain('答案來自');
    expect(zhHtml).toContain('文字辨識功能即將推出');
  });

  it('follows a relink, a role changed and a file removed', async () => {
    const files = await readAll([
      ['S5 Test 1.docx', docx(TEST1)],
      ['S5 Test 2.pdf', test2Pdf()],
      ['S5 Test 1 ans.docx', docx(TEST1_ANS)],
    ]);
    let links: Links = { ...NO_LINKS, answers: { f1: 'f2', f0: NO_ANSWERS } };
    expect(linkedAnswers(files, links)).toEqual({ f0: NO_ANSWERS, f1: 'f2' });
    // The answers file called a paper: three papers, no answers to pick.
    links = { ...NO_LINKS, roles: { f2: 'questions' } };
    expect(papersOf(files, links)).toHaveLength(3);
    expect(answerChoices(files[0], files, links)).toEqual([NO_ANSWERS]);
    // A paper said to hold its own answers may take them.
    links = { ...NO_LINKS, roles: { f1: 'both' } };
    expect(answerChoices(files[1], files, links)).toEqual([NO_ANSWERS, OWN_ANSWERS, 'f2']);
    links = { ...NO_LINKS, removed: ['f2'] };
    expect(linkedAnswers(files, links)).toEqual({ f0: NO_ANSWERS, f1: NO_ANSWERS });
  });

  it('lets one answers file serve two papers', async () => {
    const p1 = ['1.\tWhich of the following is a free good?', 'A.\tair', 'B.\tbread', 'C.\ttea', 'D.\trice'];
    const p2 = ['1.\tExplain what is meant by opportunity cost.\t(2 marks)'];
    const files = await readAll([
      ['2025-26 S5 mock paper I.docx', docx(p1)],
      ['2025-26 S5 mock paper II.docx', docx(p2)],
      ['2025-2026 S5 Mock marking scheme.docx', docx(['Paper 1', '1. C', 'Paper 2', '1.\tThe highest-valued option forgone (1)', '\tThe cost of a choice (1)'])],
    ]);
    const links = linkedAnswers(files, NO_LINKS);
    expect(links).toEqual({ f0: 'f2', f1: 'f2' });
    for (const paper of papersOf(files, NO_LINKS)) {
      const source = answerSource(paper, links[paper.id], files)!;
      const result = paperReview(paperRead(paper), paperState('auto'), source.sheet);
      const built = result.batch.builds.map(materialize) as Question[];
      if (paper.id === 'f0') expect((built[0] as McqQuestion).answerIndex).toBe(2);
      else expect((built[0] as StructuredQuestion).scheme?.routes[0].groups[0].points.map((p) => text(p.text.en))).toEqual(['The highest-valued option forgone', 'The cost of a choice']);
    }
  });

  it('splits a paper with its own answers after it, and applies them in the single-file flow', async () => {
    const files = await readAll([
      ['Quiz 3.docx', docx([...TEST1.slice(16), '-- End of Paper --', 'Answers:', '1.\tThe value of the best option given up (1)', '\tIt is a cost. (1)', '2(a)\tDemand rises (1) so price rises (1)', '(b)\tIt rises. (1)'])],
    ]);
    expect(files[0].guess.role).toBe('both');
    expect(needsLinking(files)).toBe(false);
    expect(linkedAnswers(files, NO_LINKS)).toEqual({ f0: OWN_ANSWERS });
    const source = answerSource(files[0], OWN_ANSWERS, files)!;
    const result = paperReview(paperRead(files[0]), paperState('auto'), source.sheet);
    expect(result.analysis.outline.questions).toHaveLength(2);
    expect(answerSummary(result, source.sheet)).toMatchObject({ mc: 0, schemes: 3, rows: [] });
  });
});

describe('one paper reviewed with its answers file', () => {
  async function test1() {
    const files = await readAll([
      ['S5 Test 1.docx', docx(TEST1)],
      ['S5 Test 1 ans.docx', docx(TEST1_ANS)],
    ]);
    const paper = files[0];
    const source = answerSource(paper, linkedAnswers(files, NO_LINKS)[paper.id], files)!;
    return { files, paper, source };
  }

  it('sets the answers and schemes first, and says what to check in words', async () => {
    const { paper, source } = await test1();
    const result = paperReview(paperRead(paper), paperState('auto'), source.sheet);
    const built = result.batch.builds.map(materialize) as Question[];
    expect((built[0] as McqQuestion).answerIndex).toBe(0); // the file's A wins over the paper's starred B
    expect((built[1] as McqQuestion).answerIndex).toBe(3);
    const q4 = built[3] as StructuredQuestion;
    expect(q4.scheme?.routes[0].groups[0].points.map((p) => [text(p.text.en), p.marks])).toEqual([
      ['Opportunity cost is the highest-valued option forgone', 1],
      ['It is the cost of making a choice.', 1],
    ]);
    const summary = answerSummary(result, source.sheet);
    expect(summary).toMatchObject({ mc: 3, mcSet: 2, schemes: 2 });
    expect(summary.rows.map((r) => answerRowText(en, r))).toEqual([
      'Q1 (Part A): the paper marks B, the answers file says A. Using A.',
      'Q3 (Part A): answer E, but the question has 4 options',
      'Q2(b) (Part B): no answer in the answers file',
    ]);
    expect(summary.rows.map((r) => answerRowText(zh, r))).toEqual([
      '第 1 題（A 部）：試卷標示 B，答案檔寫 A，現採用 A。',
      '第 3 題（A 部）：答案是 E，但題目只有 4 個選項',
      '第 2(b) 題（B 部）：答案檔沒有這題的答案',
    ]);
  });

  it('lets a teacher’s click win over the answers file, and settles that row', async () => {
    const { paper, source } = await test1();
    const first = paperReview(paperRead(paper), paperState('auto'), source.sheet).analysis.outline.questions[0];
    const state = { ...paperState('auto' as const), pins: [{ kind: 'answer' as const, line: first.start, index: 2 }], undo: ['pin' as const] };
    const result = paperReview(paperRead(paper), state, source.sheet);
    expect(result.analysis.outline.questions[0].answer).toEqual({ index: 2, from: 'pin' });
    expect(answerSummary(result, source.sheet).rows.map((r) => r.kind)).toEqual(['outOfRange', 'missingPart']);
  });

  it('shows each scheme as a badge on its question that leaves it out, and ⌘Z brings it back', async () => {
    const { paper, source } = await test1();
    const result = paperReview(paperRead(paper), paperState('auto'), source.sheet);
    const scheme = result.sheetPins.find((p) => p.kind === 'scheme' && p.part === 0)!;
    expect(scheme).toBeDefined();
    const html = renderToStaticMarkup(
      <ReviewStep text={en} result={result} state={paperState('auto')} update={() => {}} answers={{ name: 'S5 Test 1 ans.docx', summary: answerSummary(result, source.sheet) }} base={previewBase()} cache={new Map()} notify={() => {}} />,
    );
    expect(html).toContain('2 of 3 MC answers set from S5 Test 1 ans.docx · 2 marking schemes');
    expect(html).toContain('3 to check');
    expect(html).toContain('Scheme (a) ×');
    expect(html).toContain('aria-label="Scheme (a) from the answers file: leave it out"');
    // The scheme prints under its part, framed as teacher-only; no "Answer: A" line.
    expect(html).toContain('Teacher copy only');
    expect(html).toContain('Demand for bread rises');
    expect(html).not.toContain('Answer: A');

    const dropped = { ...paperState('auto'), dropped: [sheetPinKey(scheme)], undo: ['drop' as const] };
    const without = paperReview(paperRead(paper), dropped, source.sheet);
    expect(without.analysis.outline.questions[4].parts[0].scheme).toBeUndefined();
    expect(paperReview(paperRead(paper), undoFix(dropped), source.sheet).analysis.outline.questions[4].parts[0].scheme).toBeDefined();
  });

  it('keeps the preview and the line badges in the teacher’s language', async () => {
    const { paper, source } = await test1();
    const result = paperReview(paperRead(paper), paperState('auto'), source.sheet);
    const items = previewItems(previewBase(), result.analysis, result.preview, new Map());
    expect(items.flatMap((i) => i.nodes).some((n) => 'teacherOnly' in n && n.teacherOnly)).toBe(true);
    const html = renderToStaticMarkup(
      <ReviewLines
        rows={result.analysis.lines.map((line, i) => ({
          line,
          role: result.analysis.roles[i].role,
          pinned: false,
          pins: result.sheetPins.filter((p) => p.kind === 'scheme' && p.line === i),
          ...(result.sheetPins.some((p) => p.kind === 'scheme' && p.line === i) ? { pinLabels: [zh.schemeBadge] } : {}),
          flags: '',
        }))}
        scrollRef={{ current: null }}
        text={zh}
        onSelectLine={() => {}}
        onChip={() => {}}
        onRemovePin={() => {}}
      />,
    );
    expect(html).toContain('評卷參考 ×');
  });
});

describe('Save as for several papers', () => {
  beforeEach(() => useWorksheetStore.getState().replaceWorksheet(createWorksheet()));

  it('makes each paper with its answers, writes them one at a time, and opens the first', async () => {
    const files = await readAll([
      ['S5 Test 1.docx', docx(TEST1)],
      ['S5 Test 2.pdf', test2Pdf()],
      ['S5 Test 1 ans.docx', docx(TEST1_ANS)],
    ]);
    const links = linkedAnswers(files, NO_LINKS);
    const papers = papersOf(files, NO_LINKS).map((paper) => {
      const source = answerSource(paper, links[paper.id], files);
      return { batch: paperReview(paperRead(paper), paperState('auto'), source?.sheet).batch, documentType: 'classroom' as const, name: paper.name };
    });
    const opened: Worksheet[] = [];
    const saved: Worksheet[] = [];
    let writing = 0;
    const made = await createImportedDocuments(
      papers,
      (worksheet) => {
        opened.push(worksheet);
        useWorksheetStore.getState().replaceWorksheet(worksheet);
      },
      async (w) => {
        expect(writing).toBe(0);
        writing++;
        await new Promise((r) => setTimeout(r, 1));
        saved.push(w);
        writing--;
      },
    );
    expect(made.map((d) => [d.worksheet.name, d.questions])).toEqual([
      ['S5 Test 1.docx', 5],
      ['S5 Test 2.pdf', 2],
    ]);
    expect(opened.map((w) => w.name)).toEqual(['S5 Test 1.docx']);
    expect(saved.map((w) => w.name)).toEqual(['S5 Test 2.pdf', 'S5 Test 1.docx']);
    expect(useWorksheetStore.getState().worksheet.id).toBe(made[0].worksheet.id);
    const test1 = saved[1];
    expect((test1.questions[0] as McqQuestion).answerIndex).toBe(0);
    expect((test1.questions.find((q) => q.type === 'structured') as StructuredQuestion).scheme?.routes[0].groups[0].points).toHaveLength(2);
  });

  it('puts every paper’s questions into one bank for 題庫 only', async () => {
    const files = await readAll([
      ['S5 Test 1.docx', docx(TEST1)],
      ['S5 Test 2.pdf', test2Pdf()],
    ]);
    const map = new Map<string, Worksheet>();
    const store = { load: async (id: string) => map.get(id), save: async (w: Worksheet) => void map.set(w.id, structuredClone(w)) } as unknown as WorksheetStore;
    const questions = papersOf(files, NO_LINKS).flatMap((p) => paperReview(paperRead(p), paperState('auto')).batch.builds.map(materialize)) as Question[];
    const { bank, copied } = await addToBank(questions, { name: 'Imported' }, { store, openDocId: '' });
    expect(copied).toBe(7);
    expect(map.get(bank.id)!.questions).toHaveLength(7);
  });

  it('shows a row per paper with its suggested type, or the bank choice', () => {
    const papers = [
      { id: 'f0', fileName: 'S5 Test 1.docx', name: 'S5 Test 1', type: 'classroom' as const, suggested: 'classroom' as const, questions: 5, answered: 4 },
      { id: 'f1', fileName: 'Mock P1.pdf', name: 'Mock P1', type: 'classroom' as const, suggested: 'paper1' as const, questions: 2, answered: 0, misfit: undefined },
    ];
    const html = renderToStaticMarkup(
      <SaveManyStep text={en} papers={papers} bankOnly={false} onBankOnly={() => {}} onName={() => {}} onType={() => {}} banks={[]} bankTarget="" newBankName="Bank 1" onBankTarget={() => {}} onSubmit={() => {}} />,
    );
    expect(html).toContain('2 new papers');
    expect(html).toContain('5 questions · 4 with answers');
    expect(html).toContain('Paper 1 mock · MCQ (suggested)');
    expect(html).toContain('Nothing is saved until you press Save.');
    const bank = renderToStaticMarkup(
      <SaveManyStep text={en} papers={papers} bankOnly onBankOnly={() => {}} onName={() => {}} onType={() => {}} banks={[]} bankTarget="" newBankName="Bank 1" onBankTarget={() => {}} onSubmit={() => {}} />,
    );
    expect(bank).toContain('New bank: Bank 1');
    expect(bank).toContain('7 questions');
  });
});
