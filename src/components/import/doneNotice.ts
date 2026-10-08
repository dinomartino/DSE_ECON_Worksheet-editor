import type { Messages } from '@/i18n/catalogue';
import type { NoticeInput } from '@/store/notices';
import type { IMPORT_MESSAGES } from './messages';

type Text = Messages<typeof IMPORT_MESSAGES>;

/** Papers the done notice lists by name; the rest are counted. */
export const NOTICE_PAPER_ROWS = 4;

export interface MadePaper {
  name: string;
  /** "Classroom worksheet", in the interface language. */
  kind: string;
  questions: number;
}

/**
 * The notice once papers are saved: a short headline, then one row per paper (name on one
 * line, kind and count under it). The first is open already; each other gets an Open link.
 * One paper gets no link and no tag: it is the one on screen.
 */
export function papersDoneNotice(text: Text, papers: readonly MadePaper[], open: (index: number) => void, noAnswer = 0): NoticeInput {
  const one = papers.length === 1;
  return {
    tone: 'success',
    body: text.importedPapers(papers.length),
    rows: papers.slice(0, NOTICE_PAPER_ROWS).map((paper, k) => ({
      label: paper.name,
      meta: text.paperMeta(paper.kind, paper.questions),
      ...(one ? {} : k === 0 ? { tag: text.openNow } : { action: { label: text.openPaper, run: () => open(k) } }),
    })),
    ...(papers.length > NOTICE_PAPER_ROWS ? { rowsNote: text.morePapers(papers.length - NOTICE_PAPER_ROWS) } : {}),
    ...(noAnswer > 0 ? { details: [text.noAnswer(noAnswer)] } : {}),
    autoHide: true,
  };
}
