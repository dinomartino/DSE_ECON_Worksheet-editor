import { describe, expect, it } from 'vitest';
import { chromeText, planChrome } from './chromePlan';
import { PAGE_MARK, PAGES_MARK, classifyText, mastheadSpan, mastheadVerdict, rowOf, rowText, type ChromeRow, type PageChrome } from './pageChrome';

const row = (zones: Partial<ChromeRow>): ChromeRow => ({ left: [], center: [], right: [], ...zones });
const strip = <T,>(value: T): T => JSON.parse(JSON.stringify(value, (k, v) => (k === 'id' ? undefined : v)));

describe('what a piece of text is', () => {
  it('page numbers: plain with its wording, P.n, Page n of N, and a count it cannot keep', () => {
    expect(classifyText(PAGE_MARK).pieces).toEqual([{ kind: 'pageNumber', pattern: 'plain', prefix: '', suffix: '' }]);
    expect(classifyText(`2019-DSE-ECON 2–${PAGE_MARK}`).pieces).toEqual([{ kind: 'pageNumber', pattern: 'plain', prefix: '2019-DSE-ECON 2–', suffix: '' }]);
    expect(classifyText(`P. ${PAGE_MARK}`).pieces[0]).toMatchObject({ pattern: 'pDot', prefix: '', suffix: '' });
    expect(classifyText(`Page ${PAGE_MARK} of ${PAGES_MARK}`).pieces[0]).toMatchObject({ pattern: 'longForm', prefix: '', suffix: '' });
    expect(classifyText(`第 ${PAGE_MARK} 頁`).pieces[0]).toMatchObject({ pattern: 'plain', prefix: '第 ', suffix: ' 頁' });
    expect(classifyText(`${PAGE_MARK} / ${PAGES_MARK}`)).toEqual({ pieces: [{ kind: 'pageNumber', pattern: 'plain', prefix: '', suffix: '' }], pageCount: '# / N' });
  });

  it('fill-ins with their labels, English and Chinese; full marks; text', () => {
    expect(classifyText('Name: ________  Class: ____ ( )').pieces).toEqual([
      { kind: 'fillIn', prefix: 'Name:', suffix: '', widthCh: 8 },
      { kind: 'fillIn', prefix: 'Class:', suffix: ' ( )', widthCh: 4 },
    ]);
    expect(classifyText('姓名：＿＿＿＿').pieces).toEqual([{ kind: 'fillIn', prefix: '姓名：', suffix: '', widthCh: 4 }]);
    expect(classifyText('學號').pieces).toEqual([{ kind: 'fillIn', prefix: '學號', suffix: '', widthCh: 14 }]);
    expect(classifyText('Full marks: 45 marks').pieces).toEqual([{ kind: 'totalMarks', prefix: 'Full marks: ', marks: 45, suffix: ' marks' }]);
    expect(classifyText('總分：60分').pieces).toEqual([{ kind: 'totalMarks', prefix: '總分：', marks: 60, suffix: '分' }]);
    expect(classifyText('Time allowed: 1 hour', { bold: true }).pieces).toEqual([{ kind: 'text', text: 'Time allowed: 1 hour', bold: true }]);
  });

  it('one field per zone: blanks set with spaces spread over the row; words after a blank are its suffix', () => {
    const got = rowOf([{ text: 'Name: ________   Class: ____', zone: 'left' }, { text: 'Date: ______ – 1 - 2022', zone: 'right' }]);
    expect(got).toEqual({
      rows: [
        {
          left: [{ kind: 'fillIn', prefix: 'Name:', suffix: '', widthCh: 8 }],
          center: [{ kind: 'fillIn', prefix: 'Class:', suffix: '', widthCh: 4 }],
          right: [{ kind: 'fillIn', prefix: 'Date:', suffix: ' – 1 - 2022', widthCh: 6 }],
        },
      ],
    });
    const four = [{ text: 'Name: ___  Class: ___  No.: ___  Date: ___', zone: 'left' as const }];
    expect(rowOf(four)).toEqual({ tooMany: 'Name: ___  Class: ___  No.: ___  Date: ___' });
    const split = rowOf(four, { split: true });
    expect('rows' in split && split.rows.map(rowText)).toEqual(['Name:____\tClass:____\tNo.:____', 'Date:____']);
  });

  it('a masthead is the run of heading-like lines before the first question, instructions or prose', () => {
    const verdicts = ['ABC College', '', 'S.5 Economics Test', 'Name: ______', 'Answer ALL questions.', 'Date: ____'].map((t) => mastheadVerdict(t));
    expect(verdicts).toEqual(['masthead', 'skip', 'masthead', 'masthead', 'stop', 'masthead']);
    expect(mastheadSpan(verdicts)).toBe(4);
    expect(mastheadVerdict('1. Which of the following is correct?')).toBe('stop');
    expect(mastheadVerdict('Section A (40 marks)')).toBe('stop');
    expect(mastheadVerdict('Study the table below.')).toBe('stop');
    expect(mastheadVerdict('The government raised the tax on cars')).toBe('stop');
    expect(mastheadVerdict('Demand and supply', { centred: true })).toBe('masthead');
    expect(mastheadSpan(Array(10).fill('masthead'))).toBe(8);
  });
});

const DBS: PageChrome = {
  header: { rows: [row({ left: [{ kind: 'text', text: 'Mock School Economics Assessment 1', size: 10.5 }] })] },
  firstPageHeader: {
    rows: [
      row({ center: [{ kind: 'text', text: 'Mock School Economics', bold: true, size: 14 }] }),
      row({ center: [{ kind: 'text', text: 'Assessment 1' }], right: [{ kind: 'fillIn', prefix: 'Name:', suffix: '', widthCh: 14 }] }),
    ],
  },
  footer: { rows: [row({ left: [{ kind: 'text', text: '© A Teacher' }], center: [{ kind: 'pageNumber', pattern: 'plain', prefix: '', suffix: '' }] })] },
  masthead: [row({ left: [{ kind: 'totalMarks', prefix: 'Full marks: ', marks: 45, suffix: ' marks' }] }), row({ left: [{ kind: 'text', text: 'Time allowed: 60 minutes' }] })],
  unsupported: [{ where: 'header', text: 'School crest', reason: 'picture' }],
};

describe('planChrome', () => {
  it('a classroom worksheet takes the header with its page-1 rows, the footer, and the masthead as bands', () => {
    const plan = planChrome(DBS, { documentType: 'classroom', language: 'en', totalMarks: 45 });
    expect(strip(plan.header)).toEqual({
      enabled: true,
      rule: false,
      showOnFirstPage: true,
      bands: [{ zones: { left: [{ kind: 'text', text: { en: [{ text: 'Mock School Economics Assessment 1' }], zh: [] }, format: { fontSize: 10.5 } }], center: [], right: [] } }],
      firstPage: {
        bands: [
          { zones: { left: [], center: [{ kind: 'text', text: { en: [{ text: 'Mock School Economics' }], zh: [] }, format: { bold: true, fontSize: 14 } }], right: [] } },
          {
            zones: {
              left: [],
              center: [{ kind: 'text', text: { en: [{ text: 'Assessment 1' }], zh: [] } }],
              right: [{ kind: 'fillIn', prefix: { en: [{ text: 'Name:' }], zh: [] }, suffix: { en: [], zh: [] }, widthCh: 14 }],
            },
          },
        ],
      },
    });
    expect(strip(plan.footer?.bands[0].zones.center)).toEqual([{ kind: 'pageNumber', pattern: 'plain' }]);
    expect(strip(plan.bands?.[0].zones.left)).toEqual([
      { kind: 'totalMarks', prefix: { en: [{ text: 'Full marks: ' }], zh: [] }, suffix: { en: [{ text: ' marks' }], zh: [] } },
    ]);
    expect(plan.cover).toBeUndefined();
    expect(plan.leftovers).toEqual(DBS.unsupported);
  });

  it('keeps a full marks figure the questions do not add up to as text, and says so', () => {
    const plan = planChrome(DBS, { documentType: 'classroom', language: 'en', totalMarks: 40 });
    expect(strip(plan.bands?.[0].zones.left)).toEqual([{ kind: 'text', text: { en: [{ text: 'Full marks: 45 marks' }], zh: [] } }]);
    expect(plan.leftovers).toContainEqual({ where: 'masthead', text: 'Full marks: 45 marks', reason: 'marksDiffer', marks: { stated: 45, counted: 40 } });
  });

  it('a blank page 1 is showOnFirstPage false; keeping the preset applies no edge', () => {
    const blank = planChrome({ footer: DBS.footer, firstPageFooter: { rows: [] }, unsupported: [] }, { documentType: 'classroom', language: 'en', totalMarks: 0 });
    expect(blank.footer).toMatchObject({ enabled: true, showOnFirstPage: false });
    expect(blank.footer?.firstPage).toBeUndefined();
    const kept = planChrome(DBS, { documentType: 'lqWorksheet', language: 'en', totalMarks: 45, keepPreset: true });
    expect(kept.header).toBeUndefined();
    expect(kept.footer).toBeUndefined();
    expect(kept.bands).toHaveLength(2);
  });

  it('a mock fills its cover lines from the masthead and lists what the cover cannot hold', () => {
    const masthead = [
      row({ center: [{ kind: 'text', text: 'Holy Hill College' }] }),
      row({ center: [{ kind: 'text', text: 'S.6 Mock Examination 2026' }] }),
      row({ center: [{ kind: 'text', text: 'Economics Paper 1' }] }),
      row({ left: [{ kind: 'text', text: 'Time allowed: 1 hour' }], right: [{ kind: 'totalMarks', prefix: 'Full marks: ', marks: 45, suffix: '' }] }),
    ];
    const plan = planChrome({ masthead, unsupported: [] }, { documentType: 'paper1', language: 'en', totalMarks: 45 });
    expect(plan.cover).toEqual({
      school: { en: 'Holy Hill College' },
      examName: { en: 'S.6 Mock Examination 2026' },
      paperName: { en: 'Economics Paper 1' },
      timeAllowed: { en: 'Time allowed: 1 hour' },
    });
    expect(plan.bands).toBeUndefined();
    expect(plan.leftovers).toEqual([{ where: 'masthead', text: 'Full marks: 45', reason: 'noCoverPlace' }]);
  });

  it('the Paper 2 booklet prints no header: its rows are left over; its footer is the file’s', () => {
    const plan = planChrome(DBS, { documentType: 'lqMock', language: 'en', totalMarks: 45 });
    expect(plan.header).toBeUndefined();
    expect(plan.footer?.bands).toHaveLength(1);
    expect(plan.leftovers.filter((l) => l.reason === 'noHeader').map((l) => l.text)).toEqual(['Mock School Economics Assessment 1', 'Mock School Economics\nAssessment 1\tName:______________']);
  });

  it('puts text on the side its script reads as, and on both when the paper does not print that side', () => {
    expect(chromeText('姓名：', 'zh')).toEqual({ en: [], zh: [{ text: '姓名：' }] });
    expect(chromeText('Name:', 'zh')).toEqual({ en: [{ text: 'Name:' }], zh: [{ text: 'Name:' }] });
    expect(chromeText('Name:', 'bilingual')).toEqual({ en: [{ text: 'Name:' }], zh: [] });
    expect(chromeText('2025-26', 'en')).toEqual({ en: [{ text: '2025-26' }], zh: [{ text: '2025-26' }] });
  });
});
