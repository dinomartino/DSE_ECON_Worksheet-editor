import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  academicYear,
  coverColumns,
  coverHasPanel,
  coverLines,
  createCoverPage,
  findCoverLine,
  setCoverLineText,
  type CoverPaperStyle,
} from './cover';
import { bi, plain } from './text';
import { createWorksheet } from './factories';
import { parseWorksheet, stringifyWorksheet } from '@/storage';
import { renderWorksheet } from '@/render/worksheet';
import { buildDocxParts } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import type { OutputMode, Worksheet } from './types';

const EN: OutputMode = { language: 'en', version: 'student' };
const STYLES: CoverPaperStyle[] = ['mcq', 'writeIn'];

/** The exporter escapes XML metacharacters, so a literal search has to as well. */
function escapeForXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function coverWorksheet(style: CoverPaperStyle): Worksheet {
  return { ...createWorksheet(), cover: createCoverPage({ paperStyle: style }) };
}

describe('mock-exam cover', () => {
  it('is a two-column page, at the reference’s own split', () => {
    // The whole reason a cover is its own model: a stack of full-width band rows cannot
    // put a panel beside the instructions (§ `model/cover.ts`).
    const cover = createCoverPage({ paperStyle: 'writeIn' });
    expect(coverColumns(cover)).toEqual({ left: 5328, gap: 144, right: 3845 });
    expect(coverHasPanel(cover)).toBe(true);
  });

  it('exports the two columns as a real Word section', () => {
    const document = buildDocxParts(coverWorksheet('writeIn'), EN).documentXml;

    // `w:cols` is the mechanism; nothing else produces side-by-side regions in Word.
    expect(document).toContain('<w:cols w:num="2" w:equalWidth="0"');
    expect(document).toContain('<w:col w:w="5328"');
    expect(document).toContain('<w:col w:w="3845"');
    // A column break is what moves the panel into the right column.
    expect(document).toContain('w:br w:type="column"');
    /*
     * The section break both returns the body to one column and starts it on the next
     * sheet — a section break *is* a page transition, which is what `w:type` names.
     *
     * This pins the fix for a real bug: the cover ended with `continuous` **and** the
     * caller emitted a `<w:br w:type="page"/>`, so the two mechanisms stacked and the
     * body began on sheet 3 with a blank sheet 2 between. Both cover styles were
     * affected. The page break must therefore be *absent*, and the assertion is written
     * that way round because "no blank page" is a statement about what is not there.
     */
    expect(document).toContain('<w:type w:val="nextPage"/>');
    expect(document).not.toContain('w:br w:type="page"');
  });

  it('restates the page geometry on the cover’s own sectPr', () => {
    // A sectPr that omits `w:pgSz`/`w:pgMar` does not inherit from the section that
    // follows — Word falls back to its application default (Letter on a US-locale
    // install), so the cover printed on different paper than the body it fronts.
    // The symptom only shows in an opened export, never on screen.
    for (const style of ['mcq', 'writeIn'] as const) {
      const document = buildDocxParts(coverWorksheet(style), EN).documentXml;
      const coverSect = document.match(
        /<w:sectPr>(?:<w:footerReference[^>]*\/>)?<w:type w:val="nextPage"\/>(.*?)<\/w:sectPr>/,
      );
      expect(coverSect, 'cover sectPr present').toBeTruthy();
      expect(coverSect![1]).toContain('<w:pgSz');
      expect(coverSect![1]).toContain('<w:pgMar');
    }
  });

  it('sets the corner block as the reference does: bold code, quiet paper line', () => {
    /*
     * Measured out of the 2019 QAB's own `document.xml` and confirmed by the manually
     * refined export (`Manually refine worksheet.docx`): "2025-26" and "ECON" are 11pt
     * Arial bold, while "PAPER 2" is **regular weight at 10.5pt with a small gap
     * above** (`sz="21"`, `w:spacing w:before="115"` — 5.75pt). The sizes are stored,
     * not inherited, because a QAB document's own body is 10pt (§ baseFontSize) and
     * the corner block must not shrink with it.
     */
    for (const style of STYLES) {
      const [code, subject, paper] = coverLines(createCoverPage({ paperStyle: style }), 'corner');
      expect(code.format).toMatchObject({ bold: true, fontSize: 11 });
      expect(subject.format).toMatchObject({ bold: true, fontSize: 11 });
      expect(paper.format?.bold).toBeUndefined();
      expect(paper.format?.fontSize).toBe(10.5);
      expect(paper.format?.spaceBefore).toBe(5.75);
    }
  });

  it('exports the paper line’s setting: sz 21, plain, spaced above', () => {
    const document = buildDocxParts(coverWorksheet('writeIn'), EN).documentXml;
    const corner = document.match(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/);
    expect(corner, 'corner textbox present').toBeTruthy();
    const paperLine = corner![1].match(/<w:p>(?:(?!<\/w:p>)[\s\S])*PAPER 2(?:(?!<\/w:p>)[\s\S])*<\/w:p>/);
    expect(paperLine, 'PAPER 2 paragraph present').toBeTruthy();
    expect(paperLine![0]).toContain('w:before="115"');
    expect(paperLine![0]).toContain('<w:sz w:val="21"/>');
    expect(paperLine![0]).not.toContain('<w:b/>');
  });

  it('sets the title pair at 14pt bold, the reference’s own size', () => {
    // `sz=28` in both the 2019 paper and the manually refined export. 16pt shipped
    // once and read visibly heavier than the reference page beside it.
    for (const style of STYLES) {
      const head = coverLines(createCoverPage({ paperStyle: style }), 'head');
      const titles = head.filter((line) => line.format?.bold);
      expect(titles).toHaveLength(2);
      for (const title of titles) expect(title.format?.fontSize).toBe(14);
      // The identity lines hold 11pt whatever the document's body size.
      expect(head[0].format?.fontSize).toBe(11);
    }
  });

  it('prints INSTRUCTIONS at the document’s own body size', () => {
    // The heading wears the Section Heading style but at the body size — the word is a
    // label, not a title (§ renderCover). "Body size" is the *document's*: a QAB body
    // is 10pt, and an 11pt label over a 10pt list read as a second title.
    const worksheet = coverWorksheet('writeIn');
    const heading = (ws: Worksheet) => {
      const node = renderWorksheet(ws, EN).cover!.instructions[0];
      if (node.kind !== 'text') throw new Error('unreachable');
      return node.format?.fontSize;
    };
    expect(heading(worksheet)).toBe(11);
    expect(heading({ ...worksheet, baseFontSize: 10 })).toBe(10);
  });

  it('survives a save/load round trip intact', () => {
    // The load path strips any key `KNOWN_KEYS` lacks into `__unknown` — a field that
    // "works" then vanishes on reload is exactly how three worksheet fields were lost
    // before (§ KNOWN_KEYS). This pins the cover, including nested fields like
    // `footNote`, through serialize → parse → migrate.
    for (const style of STYLES) {
      const worksheet = coverWorksheet(style);
      const reloaded = parseWorksheet(stringifyWorksheet(worksheet));
      expect(reloaded.cover).toEqual(worksheet.cover);
    }
  });

  it('is deliberately absent from the clipboard', () => {
    // Same rule that keeps page setup and headers out of "Copy for Word": pasting must
    // not impose this document's page furniture on the destination — and clipboard HTML
    // could not express the cover's mechanisms anyway. The .docx carries it instead.
    for (const style of STYLES) {
      const worksheet = coverWorksheet(style);
      const clip = worksheetClipboardHtml(worksheet, EN);
      for (const region of ['corner', 'head', 'instructions', 'foot'] as const) {
        for (const line of coverLines(worksheet.cover!, region)) {
          const text = plain(line.text.en);
          if (text) expect(clip).not.toContain(text);
        }
      }
      expect(clip).not.toContain('INSTRUCTIONS');
    }
  });

  it('prints as one wide column when the panel is empty', () => {
    const worksheet = coverWorksheet('writeIn');
    worksheet.cover = { ...worksheet.cover!, panelNote: undefined, panelBoxes: 0 };
    expect(coverHasPanel(worksheet.cover)).toBe(false);

    const document = buildDocxParts(worksheet, EN).documentXml;
    // A narrow column beside a blank strip would be worse than no columns at all.
    expect(document).not.toContain('w:num="2"');
    expect(document).not.toContain('w:br w:type="column"');
  });

  it('numbers instructions from position, so deleting one renumbers the rest', () => {
    const cover = createCoverPage({ paperStyle: 'writeIn' });
    const worksheet: Worksheet = { ...createWorksheet(), cover };
    const lines = coverLines(cover, 'instructions');
    // Counted from the model, not written in: the wording is editorial and the list
    // has grown before. What is being asserted is that the *last* number equals the
    // number of lines and that removing one takes the highest number away with it.
    const count = lines.length;

    expect(buildDocxParts(worksheet, EN).documentXml).toContain(`(${count})`);

    const trimmed: Worksheet = {
      ...worksheet,
      cover: { ...cover, instructions: lines.filter((line) => line.id !== lines[0].id) },
    };
    const after = buildDocxParts(trimmed, EN).documentXml;
    // One fewer, contiguous — no hole where the deleted one was.
    expect(after).toContain(`(${count - 1})`);
    expect(after).not.toContain(`(${count})`);
  });

  it('numbers each paper the way its reference does', () => {
    // Paper 1 numbers `1.`; Paper 2 numbers `(1)`. Stored, not derived, so a school can
    // change it — but the defaults follow the papers.
    const mcq = buildDocxParts(coverWorksheet('mcq'), EN).documentXml;
    expect(mcq).toContain('>1.</w:t>');
    expect(mcq).not.toContain('>(1)</w:t>');

    const writeIn = buildDocxParts(coverWorksheet('writeIn'), EN).documentXml;
    expect(writeIn).toContain('>(1)</w:t>');
  });

  it('gives an MCQ cover one full-width column and no panel', () => {
    // Answers go on a separate machine-read sheet, so there is nothing to write on the
    // cover — the reference's Paper 1 has no panel and no column split.
    const cover = createCoverPage({ paperStyle: 'mcq' });
    expect(coverHasPanel(cover)).toBe(false);

    const document = buildDocxParts(coverWorksheet('mcq'), EN).documentXml;
    expect(document).not.toContain('w:num="2"');
    expect(document).not.toContain('w:br w:type="column"');
    // And its identity lines are centred across the page, as the reference has them.
    expect(document).toContain('<w:jc w:val="center"/>');
  });

  it('centres the head lines on both papers — each within its own column', () => {
    /*
     * The reference's Paper 2 centres its head lines within the narrow left column (a
     * centre tab at the column's midpoint); Paper 1 centres across its one wide column.
     * The booklet's head once ranged left, which read as a draft beside the centred
     * candidate panel.
     */
    for (const style of ['mcq', 'writeIn'] as const) {
      const lines = createCoverPage({ paperStyle: style }).headLines ?? [];
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.format?.align, `${style} head line`).toBe('center');
      }
    }
  });

  it('draws the column rule as a line shape, at the reference’s weight', () => {
    /*
     * The reference draws no page border, no `w:sep` and no paragraph border — the rule
     * is an anchored `prstGeom prst="line"` connector. This export had *no* rule at all
     * until it was added: the preview drew one and Word drew nothing, which is exactly
     * the kind of disagreement only opening the exported file reveals.
     */
    const document = buildDocxParts(coverWorksheet('writeIn'), EN).documentXml;
    expect(document).toContain('<a:prstGeom prst="line">');
    // 19050 EMU = 1.5pt, the reference's own weight.
    expect(document).toContain('<a:ln w="19050">');
    expect(document).toContain('<wps:wsp>');

    // A one-column cover has no boundary to draw, so it draws no *divider* — though it
    // still draws the corner diagonal, which is why this asserts the weight rather than
    // the mere presence of a line shape.
    const mcq = buildDocxParts(coverWorksheet('mcq'), EN).documentXml;
    expect(mcq).not.toContain('<a:ln w="19050">');
  });

  it('floats the corner block as an anchored group, outside the text column', () => {
    /*
     * The reference anchors a `wgp` group at (-0.65in, -0.25in) holding a textbox of the
     * code lines and the diagonal beside it. Emitted as ordinary paragraphs (which this
     * did first) the lines sit *in* the column: they push the identity lines down the
     * page and can never reach the corner.
     */
    for (const style of STYLES) {
      const document = buildDocxParts(coverWorksheet(style), EN).documentXml;
      expect(document, style).toContain('<wpg:wgp>');
      expect(document, style).toContain('<w:txbxContent>');
      // Negative offsets are the point: the block hangs outside the text column.
      expect(document, style).toContain('<wp:posOffset>-591185</wp:posOffset>');
      expect(document, style).toContain('<wp:posOffset>-230505</wp:posOffset>');
      // The child coordinate space the reference's own child offsets are expressed in.
      expect(document, style).toContain('a:chExt cx="2725" cy="2710"');
    }
  });

  it('exports the corner diagonal, at the reference’s heavier weight', () => {
    /*
     * Drawn in the preview by a CSS gradient and, until this was added, **not exported at
     * all** — the corner block printed bare in Word. The reference uses a `flipH` line at
     * `a:ln w="38100"` (3pt), deliberately heavier than the 1.5pt column rule.
     */
    for (const style of STYLES) {
      const document = buildDocxParts(coverWorksheet(style), EN).documentXml;
      expect(document, style).toContain('<a:ln w="38100">');
      // `flipV` is what gives the diagonal its direction: bottom-left to top-right.
      // Settled by measuring both flips against the reference scan, not by reasoning —
      // `flipH` draws the mirror image and reads as a backslash.
      expect(document, style).toContain('flipV="1"');
    }

    // Turning the rule off removes it, rather than leaving an orphan shape behind.
    const worksheet = coverWorksheet('mcq');
    worksheet.cover = { ...worksheet.cover!, cornerRule: false };
    const off = buildDocxParts(worksheet, EN).documentXml;
    expect(off).not.toContain('flipV="1"');
    expect(off).not.toContain('<a:ln w="38100">');
  });

  it('sets each paper’s own font scheme', () => {
    /*
     * Paper 2 is Arial throughout. Paper 1 mixes: Arial for the corner block, the identity
     * lines and the paper's name — read at a glance — and Times New Roman for the timing,
     * "INSTRUCTIONS" and the instruction body, read properly. A single cover-wide font
     * could express Paper 2 and not Paper 1, which is why the face reaches a line.
     */
    const mcq = createCoverPage({ paperStyle: 'mcq' });
    const head = coverLines(mcq, 'head');
    // The paper's name is sans on both papers.
    expect(head[2].format?.fonts?.latin).toBe('Arial');
    // The timing line is serif on Paper 1.
    expect(head[4].format?.fonts?.latin).toBe('Times New Roman');
    // Unstyled lines — the instruction list among them — take the page default.
    expect(mcq.fonts?.latin).toBe('Times New Roman');

    const writeIn = createCoverPage({ paperStyle: 'writeIn' });
    expect(coverLines(writeIn, 'head')[4].format?.fonts?.latin).toBe('Arial');
    expect(writeIn.fonts?.latin).toBe('Arial');

    // The corner code block is Arial on **both** papers — it is the mark a paper is
    // recognised by, and the one line neither reference sets in serif.
    for (const cover of [mcq, writeIn]) {
      for (const corner of coverLines(cover, 'corner')) {
        expect(corner.format?.fonts?.latin).toBe('Arial');
      }
    }
  });

  it('carries each line’s font through to the .docx', () => {
    // A face that reaches the page but not Word would be the same class of bug as the
    // missing rules: right on screen, wrong in the file.
    const mcq = buildDocxParts(coverWorksheet('mcq'), EN).documentXml;
    expect(mcq).toContain('w:ascii="Arial"');
    expect(mcq).toContain('w:ascii="Times New Roman"');

    const writeIn = buildDocxParts(coverWorksheet('writeIn'), EN).documentXml;
    expect(writeIn).toContain('w:ascii="Arial"');
  });

  it('bolds the operative word in an instruction', () => {
    // "Answer ALL questions", "mark only ONE answer" — the word a candidate misreading
    // costs marks for. Per-run bold, so only those characters are heavy.
    const document = buildDocxParts(coverWorksheet('mcq'), EN).documentXml;
    expect(document).toMatch(/<w:b\/>[^]{0,200}?<w:t[^>]*>ALL<\/w:t>/);
    expect(document).toMatch(/<w:b\/>[^]{0,200}?<w:t[^>]*>ONE<\/w:t>/);
  });

  it('hangs instructions so a wrapped line keeps its column', () => {
    const document = buildDocxParts(coverWorksheet('writeIn'), EN).documentXml;
    expect(document).toContain('w:hanging="480"');
  });

  it('serves both papers, differing where the papers do', () => {
    const textOf = (style: CoverPaperStyle) =>
      coverLines(createCoverPage({ paperStyle: style }), 'instructions')
        .map((line) => plain(line.text.en))
        .join(' ');

    // The structural difference between the two papers: where the answers go.
    expect(textOf('mcq')).toContain('answer sheet');
    expect(textOf('mcq')).not.toContain('spaces provided in this booklet');
    expect(textOf('writeIn')).toContain('spaces provided in this booklet');
    expect(textOf('writeIn')).not.toContain('answer sheet provided');
  });

  it('carries every option through to the page', () => {
    const cover = createCoverPage({
      paperStyle: 'mcq',
      school: 'Test College',
      examName: 'Trial Exam 2030',
      paperName: 'ECONOMICS PAPER 9',
      timeAllowed: '2:00 pm – 3:00 pm',
      code: 'TRIAL-30',
    });
    const text = JSON.stringify(cover);
    for (const value of ['Test College', 'Trial Exam 2030', 'ECONOMICS PAPER 9', 'TRIAL-30']) {
      expect(text, value).toContain(value);
    }
  });

  it('edits a line by id, leaving every other region alone', () => {
    const cover = createCoverPage({ paperStyle: 'mcq' });
    const target = coverLines(cover, 'head')[0];

    const next = setCoverLineText(cover, target.id, bi('New School', '新校'));
    expect(plain(findCoverLine(next, target.id)!.text.en)).toBe('New School');
    // Addressed by id, so nothing else moved.
    expect(coverLines(next, 'instructions')).toEqual(coverLines(cover, 'instructions'));
    expect(coverLines(next, 'corner')).toEqual(coverLines(cover, 'corner'));
  });

  it('renders every line as an editable target, for both papers', () => {
    for (const style of STYLES) {
      const rendered = renderWorksheet(coverWorksheet(style), EN);
      expect(rendered.cover, style).toBeTruthy();
      /*
       * Without a target the cover could not be edited on the page at all.
       *
       * Only the lines that carry text: a region also holds the blank lines a line asks
       * for with `gapAfter`, and those are spacing rather than content — there is nothing
       * for a click to land on and nothing to write back to.
       */
      const authored = rendered.cover!.head.filter(
        (node) => node.kind === 'text' && (node.text.en.length > 0 || node.text.zh.length > 0),
      );
      expect(authored.length, style).toBeGreaterThan(0);
      expect(
        authored.every((node) => 'edit' in node && node.edit),
        style,
      ).toBe(true);
    }
  });

  /**
   * Every authored word on the cover must reach the .docx.
   *
   * The regions are separate lists and the exporter walks them by hand, so a region left
   * out of `coverXml` is invisible until someone opens the exported file — the page would
   * look right and the document would be missing a block. This walks the *model* and
   * asserts each line's text is in the export, so adding a region without exporting it
   * fails here rather than in Word.
   */
  it('exports every line of every region', () => {
    for (const style of STYLES) {
      const worksheet = coverWorksheet(style);
      const cover = worksheet.cover!;

      /*
       * Every line is given a unique sentinel first.
       *
       * The generated defaults repeat themselves — the school name is both a head line
       * and the foot line — so searching for the stock text finds *some* copy and passes
       * even when a whole region is missing from the exporter. (Confirmed: deleting the
       * foot from `coverXml` did not fail this test until the sentinels went in.)
       */
      let marked = cover;
      const expected: string[] = [];
      for (const region of ['corner', 'head', 'instructions', 'foot'] as const) {
        coverLines(cover, region).forEach((line, index) => {
          const sentinel = `ZZ-${region}-${index}-ZZ`;
          expected.push(sentinel);
          marked = setCoverLineText(marked, line.id, bi(sentinel, sentinel));
        });
      }
      marked = {
        ...marked,
        instructionsHeading: bi('ZZ-heading-ZZ', 'ZZ-heading-ZZ'),
        footNote: bi('ZZ-footNote-ZZ', 'ZZ-footNote-ZZ'),
        ...(coverHasPanel(cover)
          ? {
              panelNote: bi('ZZ-panelNote-ZZ', 'ZZ-panelNote-ZZ'),
              panelFieldLabel: bi('ZZ-panelLabel-ZZ', 'ZZ-panelLabel-ZZ'),
            }
          : {}),
      };
      expected.push('ZZ-heading-ZZ', 'ZZ-footNote-ZZ');
      if (coverHasPanel(cover)) expected.push('ZZ-panelNote-ZZ', 'ZZ-panelLabel-ZZ');

      /*
       * The foot block prints from the cover section's own footer part, not the body
       * (§ `coverXml`) — so the search space is the document plus that part, and the
       * footer reference must actually be on the cover's sectPr or the part is an
       * orphan Word never opens.
       */
      const parts = buildDocxParts({ ...worksheet, cover: marked }, EN);
      const searchable = parts.documentXml + (parts.headerFooter.footerCover ?? '');
      for (const sentinel of expected) {
        expect(searchable, `${style}: ${sentinel}`).toContain(sentinel);
      }
      for (const sentinel of expected.filter((name) => name.startsWith('ZZ-foot'))) {
        expect(parts.headerFooter.footerCover ?? '', `${style}: ${sentinel} in footer part`)
          .toContain(sentinel);
      }
      expect(parts.documentXml, `${style}: cover footer is referenced`).toContain(
        '<w:footerReference w:type="default" r:id="rId9"/><w:type w:val="nextPage"/>',
      );

      // The panel's write-in boxes are cells, not text — check the grid instead.
      if ((cover.panelBoxes ?? 0) > 0) {
        expect(parts.documentXml, `${style}: panel boxes`).toContain(
          'w:tblLayout w:type="fixed"',
        );
      }
    }
  });

  it('exports every line in Chinese and bilingual modes too', () => {
    // A region emitted only for one language would be a silent hole in the other.
    for (const mode of [
      { language: 'zh', version: 'student' },
      { language: 'bilingual', version: 'student' },
    ] as OutputMode[]) {
      const worksheet = coverWorksheet('writeIn');
      const document = buildDocxParts(worksheet, mode).documentXml;
      for (const line of coverLines(worksheet.cover!, 'instructions')) {
        const zh = plain(line.text.zh);
        if (!zh.trim()) continue;
        expect(document, `${mode.language}: ${zh}`).toContain(escapeForXml(zh));
      }
    }
  });

  /**
   * The point of the whole feature: reproduce the *shape* of an exam cover without
   * carrying across the HKEAA's own wording.
   */
  it('copies none of the reference paper’s distinctive wording', () => {
    const theirs = [
      'HONG KONG EXAMINATIONS AND ASSESSMENT AUTHORITY',
      'HONG KONG DIPLOMA OF SECONDARY EDUCATION EXAMINATION',
      /*
       * The Chinese edition's own authority lines, blocked for the same reason as the
       * English pair above and added with the Chinese defaults: a cover that ships
       * Chinese text needs a Chinese guard. The 6-word window below cannot supply one —
       * it splits on whitespace, and Chinese has none, so it silently passes over every
       * Chinese string. This list is the only guard that runs against them.
       */
      '香港考試及評核局',
      '香港中學文憑考試',
      '請在此貼上電腦條碼',
      '考生編號',
    ];

    for (const style of STYLES) {
      const generated = JSON.stringify(createCoverPage({ paperStyle: style })).toLowerCase();
      for (const phrase of theirs) {
        expect(generated, `${style}: ${phrase}`).not.toContain(phrase.toLowerCase());
      }
    }
  });

  /**
   * Every head line prints in Chinese too.
   *
   * The cover shipped with `zh` empty on every line it generates, so a Chinese export
   * was a blank sheet carrying a candidate panel — the English looked finished and the
   * mode this app exists for showed nothing. Asserted per line rather than by sampling:
   * one line left behind is exactly the failure this replaces, and it is invisible in
   * any English-mode check.
   */
  it('fills both language sides of every generated line', () => {
    for (const style of STYLES) {
      const cover = createCoverPage({ paperStyle: style });
      for (const region of ['corner', 'head', 'foot', 'instructions'] as const) {
        for (const line of coverLines(cover, region)) {
          const en = plain(line.text.en).trim();
          if (!en) continue; // A deliberate spacer line has neither side.
          expect(plain(line.text.zh).trim(), `${style}/${region}: "${en}"`).not.toBe('');
        }
      }
    }
  });

  /**
   * The year is derived, and derived once.
   *
   * The corner code, the examination line and the QAB footer's paper code all print it,
   * and all three were separate literals — two chances to disagree and three things to
   * remember every August. The boundary is pinned through an injected date rather than
   * the clock, or the test would pass for eight months a year.
   */
  it('derives the academic year, turning it over in September', () => {
    expect(academicYear(new Date('2026-08-31T12:00:00Z'))).toEqual({
      short: '2025-26',
      long: '2025 – 2026',
    });
    expect(academicYear(new Date('2026-09-01T12:00:00Z'))).toEqual({
      short: '2026-27',
      long: '2026 – 2027',
    });

    // And the cover spends it in both places that print it.
    const cover = createCoverPage({ paperStyle: 'writeIn', now: new Date('2026-09-01T12:00:00Z') });
    expect(plain(coverLines(cover, 'corner')[0].text.en)).toBe('2026-27');
    expect(plain(coverLines(cover, 'head')[1].text.en)).toContain('2026 – 2027');
  });

  /**
   * A booklet's cover must say which sections are compulsory.
   *
   * A QAB ships Sections A/B/C with "Answer any ONE question." on C, and the cover's
   * instructions never mentioned it — the one fact a candidate cannot recover from
   * getting wrong was reachable only by paging to the back.
   */
  it('tells a booklet’s candidate what to answer and where', () => {
    const instructions = coverLines(createCoverPage({ paperStyle: 'writeIn' }), 'instructions').map(
      (line) => plain(line.text.en),
    );
    const joined = instructions.join(' ');
    expect(joined).toContain('Section C');
    // The margin rule is a marks consequence, not a formatting preference, so it is
    // stated on the cover as well as printed down every margin as furniture.
    expect(joined).toContain('margins will not be marked');
    // An MCQ paper has neither: it has no sections to choose between and no margins to
    // write in, and carrying them over would describe a booklet that isn't there.
    const mcq = coverLines(createCoverPage({ paperStyle: 'mcq' }), 'instructions')
      .map((line) => plain(line.text.en))
      .join(' ');
    expect(mcq).not.toContain('Section C');
    expect(mcq).not.toContain('margins will not be marked');
  });

  /**
   * A stronger guard than the phrase list: no long run of words from the reference may
   * appear in a generated cover. Catches a future edit that pastes their rubric in
   * without adding it to the list above.
   */
  it('shares no long phrase with the reference paper’s own cover text', () => {
    /*
     * The reference is copyright and gitignored, so this asserts only where it is
     * present. Skipping rather than failing keeps a clean checkout green; the phrase
     * list above is the guard that always runs.
     */
    let reference: string;
    try {
      reference = readFileSync(
        new URL('../../real_life_reference/2019_Question_Paper_2.docx', import.meta.url),
      ).toString('latin1');
    } catch {
      return;
    }

    for (const style of STYLES) {
      const cover = createCoverPage({ paperStyle: style });
      const sentences = (['corner', 'head', 'instructions', 'foot'] as const).flatMap((region) =>
        coverLines(cover, region).map((line) => plain(line.text.en)),
      );

      for (const sentence of sentences) {
        const words = sentence.split(/\s+/).filter(Boolean);
        for (let i = 0; i + 6 <= words.length; i += 1) {
          const window = words.slice(i, i + 6).join(' ');
          expect(reference.includes(window), `${style}: "${window}"`).toBe(false);
        }
      }
    }
  });
});
