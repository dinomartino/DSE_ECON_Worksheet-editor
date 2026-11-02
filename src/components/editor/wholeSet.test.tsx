import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createMockSet } from '@/model/mockSet';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { withPaperSet } from '@/model/paperSet';
import type { Worksheet } from '@/model/types';
import { setKeyFileName, setZipFileName } from '@/export/docx/fileNames';
import { summarize } from '@/storage';
import { SetKeyPreview } from '@/components/preview/SetKeyPreview';
import { ExportDialog, type WholeSet } from './ExportDialog';
import { exportKinds, uniqueNames } from './exportSession';
import { isWholeSet, setPapersInOrder } from './setMembers';

const SET = { id: 'set-1', name: 'S6 Mock 2026-27' };
const p1 = () => withPaperSet({ ...createWorksheetFrom({ documentType: 'paper1' }), id: 'p1', name: 'S6 Mock Paper 1' }, SET);
const p2 = () => withPaperSet({ ...createWorksheetFrom({ documentType: 'lqMock' }), id: 'p2', name: 'S6 Mock Paper 2' }, SET);
const rows = (papers: Worksheet[]) => papers.map((paper) => summarize(paper));

describe('the whole set, in set order (k-0299 step C)', () => {
  it('Paper 1 first, the open paper as the editor holds it, from either paper', () => {
    const one = p1();
    const two = p2();
    const fromTwo = setPapersInOrder(two, rows([one, two]), [one])!;
    expect(fromTwo.papers.map((paper) => paper.id)).toEqual(['p1', 'p2']);
    expect(fromTwo.papers[1]).toBe(two);
    expect(isWholeSet(fromTwo)).toBe(true);
  });

  it('leaves a blank paper out, and is then no whole set', () => {
    const { chosen, blank } = createMockSet({ documentType: 'paper1', name: 'S6 Mock Paper 1' });
    const set = setPapersInOrder(chosen, rows([chosen, blank]), [blank])!;
    expect(set.papers.map((paper) => paper.id)).toEqual([chosen.id]);
    expect(set.blank.map((paper) => paper.id)).toEqual([blank.id]);
    expect(isWholeSet(set)).toBe(false);
  });

  it('a partner not read yet is counted missing, not shown', () => {
    const set = setPapersInOrder(p1(), rows([p1(), p2()]), [])!;
    expect(set.missing).toBe(1);
    expect(isWholeSet(set)).toBe(false);
  });

  it('is nothing for a paper in no set', () => {
    expect(setPapersInOrder(createWorksheetFrom({ documentType: 'paper1' }), [], [])).toBeUndefined();
  });
});

describe('Export → Whole set', () => {
  const whole: WholeSet = { name: SET.name, papers: [p1(), p2()], blank: [] };
  const render = (format: 'docx' | 'pdf', wholeSet: WholeSet | null = whole) =>
    renderToStaticMarkup(
      <ExportDialog
        worksheet={whole.papers[0]}
        mode={{ language: 'en', version: 'student' }}
        onClose={() => {}}
        onExported={() => {}}
        initialWhat="set"
        initialFormat={format}
        documents={[]}
        wholeSet={wholeSet ?? undefined}
      />,
    );

  it('lists each paper, then the set’s marking scheme, named for the set', () => {
    const markup = render('docx');
    expect(markup).toContain('Whole set');
    expect(markup).toContain('S6 Mock Paper 1 (Student) (EN).docx');
    expect(markup).toContain('S6 Mock Paper 2 (Student) (EN).docx');
    expect(markup).toContain('S6 Mock 2026-27 (Answer key) (EN).docx');
    expect(markup.indexOf('Paper 1 (Student)')).toBeLessThan(markup.indexOf('Paper 2 (Student)'));
    // The web writes one .zip.
    expect(markup).toContain('Export .zip');
  });

  it('as PDF on the web, one Print per file', () => {
    const markup = render('pdf');
    expect(markup).toContain('S6 Mock 2026-27 (Answer key) (EN).pdf');
    expect(markup.match(/>Print<\/button>/g)?.length ?? markup.match(/Print<\/button>/g)?.length).toBe(3);
  });

  it('is not offered without a whole set, and opens on the paper then', () => {
    const markup = render('docx', null);
    expect(markup).not.toContain('Whole set');
    expect(markup).not.toContain('data-set-files');
  });

  it('names its files apart, and plans them outside exportKinds', () => {
    expect(uniqueNames(['a.docx', 'A.docx', 'b.docx', 'a.docx'])).toEqual(['a.docx', 'A (2).docx', 'b.docx', 'a (3).docx']);
    expect(setKeyFileName('S6: Mock', whole.papers, 'zh')).toBe('S6- Mock (Answer key) (ZH).docx');
    expect(setZipFileName('S6 Mock', { language: 'bilingual', version: 'teacher' })).toBe('S6 Mock (Teacher) (Bilingual).zip');
    expect(exportKinds('set')).toEqual([]);
  });
});

describe('Marking scheme → Whole set', () => {
  it('one #print-root holding a part per paper, each under its title', () => {
    const markup = renderToStaticMarkup(<SetKeyPreview worksheets={[p1(), p2()]} language="en" />);
    expect(markup.match(/id="print-root"/g)).toHaveLength(1);
    expect(markup.match(/data-key-part="/g)).toHaveLength(2);
    expect(markup.indexOf('data-key-part="p1"')).toBeLessThan(markup.indexOf('data-key-part="p2"'));
    expect(markup).toContain('Answer key');
  });
});
