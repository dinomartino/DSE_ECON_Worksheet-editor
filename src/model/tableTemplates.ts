import { nanoid } from 'nanoid';
import { bi } from './text';
import type { BiText, TableBlock, TableCell, TableRow } from './types';

// Its own id source rather than `factories.newId`, for the reason `diagramTemplates`
// records: factories imports this module for the template-backed table factory, and
// importing back would make the cycle load-order dependent.
const newId = () => nanoid(10);

/**
 * Starting shapes for a table — what the syllabus draws the same way every year,
 * traced from the reference papers. **A template is only an initial value**: fresh
 * ids, never looked up again, deliberately no `templateId`. Headings ship filled (in
 * both languages — a template seeding English alone is a half-translated table);
 * figures ship empty (a seeded number is one a teacher can miss).
 */
export interface TableTemplate {
  id: string;
  name: BiText;
  /** One-line note shown under the name in the picker. */
  hint: BiText;
  build: () => TableBlock;
}

function cell(text: BiText | undefined, extra: Partial<TableCell> = {}): TableCell {
  return { id: newId(), text: text ?? { en: [], zh: [] }, ...extra };
}

function row(cells: TableCell[], minHeight?: number): TableRow {
  return { id: newId(), cells, ...(minHeight !== undefined ? { minHeight } : {}) };
}

/**
 * The reference's own row height for a balance sheet: `w:trHeight w:val="340"`, on every
 * row of DSE 2019 P2 Q6's table. A floor, like every stored height — a cell whose text
 * wraps still grows (§`TableRow.minHeight`).
 */
const BALANCE_ROW_TWIPS = 340;

/**
 * A bank's balance sheet — the T-account. **Four columns, not two**: each side is a
 * label column and a figure column with no rule between (two columns cannot place the
 * figures without ruling name from number or relying on typed spaces). Header cells
 * span 2+2; `headerRule` borders. Labels ship (Reserves/Loans against Deposits is
 * what the account *is*); figures stay empty.
 */
function balanceSheet(): TableBlock {
  const assets = bi('Assets ($ million)', '資產（百萬元）');
  const liabilities = bi('Liabilities ($ million)', '負債（百萬元）');
  const reserves = bi('Reserves', '儲備');
  const loans = bi('Loans', '貸款');
  const deposits = bi('Deposits', '存款');

  return {
    kind: 'table',
    id: newId(),
    borders: 'headerRule',
    /*
     * The reference's own grid (1321/696/916/1102 twips), renormalised so the two sides
     * are exact halves — its numbers come to 49.99%/50.01%, which is a rounding artefact
     * of the width it happened to be dragged to, not a shape anyone chose. Fractions of
     * the table, so the proportions survive a paper or margin change.
     */
    columnWidths: [0.3275, 0.1725, 0.3275, 0.1725],
    /*
     * Narrower than the text column and centred, as the reference prints it: a balance
     * sheet is a small block of figures, and run to the full width its two sides drift
     * so far apart they stop reading as one account. Centred rather than indented, so it
     * stays centred when the paper or margins change (§ alignment and indent are
     * alternatives).
     */
    width: 0.62,
    align: 'center',
    rows: [
      row(
        [
          cell(assets, { colSpan: 2, align: 'center' }),
          cell(undefined, { covered: true }),
          cell(liabilities, { colSpan: 2, align: 'center' }),
          cell(undefined, { covered: true }),
        ],
        BALANCE_ROW_TWIPS,
      ),
      /*
       * The two entry rows, labelled as the account always is: Reserves and Loans on the
       * assets side, Deposits on the liabilities side. Labels left, figures right — the
       * reference's own alignment, and what makes a column of numbers comparable down the
       * page. Only the figures are the teacher's to fill in.
       */
      row(
        [
          cell(reserves, { align: 'left' }),
          cell(undefined, { align: 'right' }),
          cell(deposits, { align: 'left' }),
          cell(undefined, { align: 'right' }),
        ],
        BALANCE_ROW_TWIPS,
      ),
      row(
        [
          cell(loans, { align: 'left' }),
          cell(undefined, { align: 'right' }),
          // The liabilities side has one entry, so its second row stays blank — as the
          // reference prints it.
          cell(undefined, { align: 'left' }),
          cell(undefined, { align: 'right' }),
        ],
        BALANCE_ROW_TWIPS,
      ),
    ],
  };
}

/**
 * A two-period comparison — DSE 2019 P2 Q2 and Q3 both print one.
 *
 * An ordinary ruled grid, and the plainest table in the paper: a row of period headings
 * over a row of figures. Its value as a template is not the borders but the shape — a
 * corner cell that stays empty so the headings sit over their own columns.
 */
function twoPeriodComparison(): TableBlock {
  return {
    kind: 'table',
    id: newId(),
    // `all` is the default and stays unstored, so this exports byte-identically to a
    // hand-built grid of the same size.
    columnWidths: [0.4, 0.3, 0.3],
    width: 0.72,
    align: 'center',
    rows: [
      row([
        // The corner stays empty: the row headings name what the figures measure, and
        // the columns name when.
        cell(undefined),
        cell(bi('Year 1', '第一年'), { align: 'center' }),
        cell(bi('Year 2', '第二年'), { align: 'center' }),
      ]),
      row([cell(undefined), cell(undefined, { align: 'center' }), cell(undefined, { align: 'center' })]),
      row([cell(undefined), cell(undefined, { align: 'center' }), cell(undefined, { align: 'center' })]),
    ],
  };
}

/**
 * A boxed stimulus — the framed extract DSE 2021 P1 sets four times.
 *
 * One column, one row, `box` borders: a frame around material that is set apart rather
 * than a table of cells. It is a template because the *combination* is not obvious —
 * "insert a 1×1 table and set its rules to Box" is not how a teacher thinks about
 * quoting a news extract.
 */
function boxedExtract(): TableBlock {
  return {
    kind: 'table',
    id: newId(),
    borders: 'box',
    width: 0.9,
    align: 'center',
    rows: [row([cell(undefined, { align: 'left' })])],
  };
}

export const TABLE_TEMPLATES: TableTemplate[] = [
  {
    id: 'balanceSheet',
    name: bi("A bank's balance sheet", '銀行的資產負債表'),
    hint: bi('Assets and liabilities, T-account rules', '資產與負債，T 型帳戶格式'),
    build: balanceSheet,
  },
  {
    id: 'twoPeriod',
    name: bi('Two-period comparison', '兩期比較'),
    hint: bi('Figures for two years side by side', '兩年數據並列'),
    build: twoPeriodComparison,
  },
  {
    id: 'boxedExtract',
    name: bi('Boxed extract', '方框資料'),
    hint: bi('One framed block for a quoted source', '單一方框，用於引述資料'),
    build: boxedExtract,
  },
];

export function findTableTemplate(id: string): TableTemplate | undefined {
  return TABLE_TEMPLATES.find((template) => template.id === id);
}

/**
 * Build a template's table, or a plain one if the id is unknown.
 *
 * Unknown ids resolve rather than throw, for the reason the diagram builder does: a
 * template list is a thing that changes between builds, and a caller holding a stale id
 * should get a usable table rather than a broken document.
 */
export function buildTableFromTemplate(id: string): TableBlock {
  return (findTableTemplate(id) ?? TABLE_TEMPLATES[0]).build();
}
