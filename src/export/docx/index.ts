import {
  bandsAreEmpty,
  bandsHeight,
  contentWidth,
  defaultFooter,
  defaultHeader,
  firstPageHeaderFooter,
  headerFooterOf,
  headerFooterOffsets,
  isHeaderFooterActive,
  pageDimensions,
  pageSetupOf,
} from '@/model/page';
import { zonesOf } from '@/model/bands';
import { documentShape } from '@/model/documentShape';
import { listIndentScheme } from '@/model/numbering';
import { bandFieldSegments } from '@/model/bandSegments';
import { worksheetMarks } from '@/model/marks';
import { furnitureHeaderXml } from './furniture';
import { documentName, plain } from '@/model/text';
import type { Band, BandField, FontPair, HeaderFooter, LanguageMode, OutputMode, Worksheet } from '@/model/types';
import type { RenderNode } from '@/render/ir';
import { bandFieldText, collectListStreams, renderWorksheet } from '@/render/worksheet';
import { collectDiagramNodes, renderDiagramImages, type DiagramImageMap } from '../diagramImage';
import { coverFooterBodyXml, coverXml, renderNodeXml, type BodyContext } from './body';
import { assignNumIds, buildNumberingXml } from './numbering';
import {
  buildCorePropsXml,
  buildCoverFooterXml,
  buildDocumentXml,
  pageGeometryXml,
  REL_FOOTER_COVER,
  buildEmptyHeaderXml,
  buildFontTableXml,
  buildFooterXml,
  buildHeaderXml,
  fieldRuns,
  REL_IMAGE_BASE,
  zipPackage,
  zipPackageBuffer,
  type HeaderFooterLayout,
  type HeaderFooterParts,
  type ImageAsset,
  type PackageParts,
} from './package';
import { biTextRuns, formatRunOptions, rFonts, run, runProperties } from './runs';
import { buildStylesXml, STYLE_IDS } from './styles';

/**
 * .docx export orchestration (§7). Consumes the neutral render IR, so it does not
 * know about any specific question type — new types flow through unchanged (§9).
 */

const DATA_URL = /^data:(image\/(png|jpeg|jpg|gif));base64,(.+)$/i;

/**
 * Decode a base64 image payload without depending on any Node-only global.
 *
 * `atob` exists in browsers, in the Edge runtime and in modern Node, so this path
 * covers client-side export, a Vercel Edge/Node function, and the test runner
 * alike; the `Buffer` branch is a last resort for older Node and never reaches the
 * client bundle.
 */
function decodeBase64(base64: string): Uint8Array {
  const decode: ((input: string) => string) | undefined =
    typeof globalThis.atob === 'function' ? globalThis.atob : undefined;

  if (decode) {
    const binary = decode(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  const nodeBuffer = (globalThis as { Buffer?: { from(v: string, enc: string): Uint8Array } }).Buffer;
  if (nodeBuffer) return new Uint8Array(nodeBuffer.from(base64, 'base64'));

  throw new Error('No base64 decoder available in this runtime.');
}

/**
 * Collect every distinct image, decode it, and assign a relationship id.
 *
 * Walks the resolved flow rather than `section.questions`, so an image or diagram that
 * a teacher placed as a layout element between two questions is embedded too — reading
 * only the questions array left those pictures with no relationship, and the body
 * renderer then silently dropped them.
 *
 * A diagram contributes its rasterized PNG here like any other picture: by the time
 * this runs it is one `src` in `diagramImages`, which is what makes a diagram exactly
 * one embedded image in the package.
 */
function collectImages(
  worksheet: Worksheet,
  mode: OutputMode,
  diagramImages: DiagramImageMap,
): {
  assets: ImageAsset[];
  bySrc: Map<string, string>;
} {
  const rendered = renderWorksheet(worksheet, mode);
  const assets: ImageAsset[] = [];
  const bySrc = new Map<string, string>();

  const add = (src: string) => {
    if (bySrc.has(src)) return;
    const match = DATA_URL.exec(src);
    if (!match) return;

    const contentType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/gif' ? 'gif' : 'jpeg';
    const relId = `rId${REL_IMAGE_BASE + assets.length}`;
    const fileName = `image${assets.length + 1}.${extension}`;

    assets.push({
      relId,
      fileName,
      data: decodeBase64(match[3]),
      contentType,
      extension,
    });
    bySrc.set(src, relId);
  };

  const visit = (node: RenderNode) => {
    if (node.kind === 'image') add(node.src);
    else if (node.kind === 'diagram') {
      const src = diagramImages.get(node.blockId);
      if (src) add(src);
    } else if (node.kind === 'table') {
      // A picture inside a cell (§ a boxed stimulus with a photograph in it). Missed
      // here it would still be *emitted* by the body writer, leaving a `r:embed`
      // pointing at a relationship that does not exist — which Word reports as a
      // repair error on the whole file rather than as one missing picture.
      for (const row of node.rows) {
        for (const cell of row) if (cell.image) add(cell.image.src);
      }
    } else if (node.kind === 'figureRow') {
      // The children are ordinary nodes; the same rule about dangling `r:embed`
      // applies to the figure and to any picture inside the nested table's cells.
      visit(node.figure);
      visit(node.table);
    }
  };

  /*
   * Only the items, deliberately — unlike `allNodes` in `diagramImage.ts`, which also
   * walks the bands, the title and the instructions.
   *
   * The difference is not a bug: those three cannot contain a picture. A band renders as
   * a `columns` node and the title and instructions as `text` nodes, so there is nothing
   * for `visit` to find in them. The pre-pass is broader because it is a generic node
   * walk; widening this to match would add two dead loops and imply a case that the
   * renderer cannot produce.
   */
  for (const item of rendered.items) {
    const nodes = item.type === 'question' ? item.question.nodes : item.layout.nodes;
    nodes.forEach(visit);
  }

  return { assets, bySrc };
}

/**
 * Render one header/footer zone to runs.
 *
 * Page numbers become live PAGE / NUMPAGES fields rather than literal text, so they stay
 * correct on every page and after the teacher edits the file in Word. The pattern around
 * them ("P.5", "Page 5 of 12") comes from `pageNumberPlaceholder`, so the text Word
 * prints is assembled from the same template the preview shows rather than a second
 * spelling of it that could drift.
 */
function zoneRuns(
  fields: BandField[],
  fonts: FontPair,
  language: LanguageMode,
  totalMarks: number,
): string {
  return fields
    .map((field) => {
      // A field's own `TextFormat`, applied as direct formatting on top of the style —
      // the same layering body text uses (§ "Per-element formatting"), so a header whose
      // size was set on the page exports at that size instead of silently reverting.
      const base = formatRunOptions(field.format);
      const fieldFonts = field.format?.fonts ?? fonts;
      /*
       * The field runs carry the field's **whole** formatting, not just its fonts.
       *
       * A `PAGE` field is five runs (begin · instruction · separate · fallback · end)
       * and Word takes the displayed number's size from them — so building these from
       * fonts alone made a sized page number silently revert to the document default
       * while the authored wording beside it printed at the size the teacher set. The
       * QAB's footer is exactly that shape: "…-ECON 2–" at 9pt with the number after
       * it, and a 14pt number centred alone.
       */
      const runProps = runProperties(fieldFonts, base);

      /*
       * Walk the field's segments, which is the same decomposition the page edits.
       *
       * Page numbers stay live `PAGE`/`NUMPAGES` fields rather than literal text, so they
       * renumber per sheet and survive the teacher editing the file in Word. Everything
       * else — including the authored wording a teacher typed around a computed value —
       * exports as ordinary runs carrying the field's own formatting.
       *
       * Deriving the split from `bandFieldSegments` rather than re-splitting the pattern
       * here is what stops the exporter and the preview disagreeing about which
       * characters are authored: there is one answer, and both read it.
       */
      return bandFieldSegments(field, { totalMarks })
        .map((segment) => {
          if (segment.kind === 'value') {
            if (segment.token === 'page') {
              // A pattern literal ("Page ", " of ") rides as a `page` value too, so only
              // an actual placeholder becomes a field; the rest stays text.
              const text = plain(segment.text.en);
              return text === '#'
                ? fieldRuns('PAGE', runProps, '1')
                : run(text, fieldFonts, base);
            }
            if (segment.token === 'pageCount') return fieldRuns('NUMPAGES', runProps, '1');
          }
          return biTextRuns(segment.text, fieldFonts, language, base);
        })
        .join('');
    })
    .join('');
}

/**
 * Lay out one set of header/footer rows.
 *
 * Takes `bands` and `rule` rather than the whole `HeaderFooter` because a document can
 * need **two** layouts from the same value — the running one and page 1's own, when
 * `firstPage` is set (§ `HeaderFooter.firstPage`).
 */
function headerFooterLayout(
  bands: Band[],
  rule: boolean | undefined,
  fonts: FontPair,
  language: LanguageMode,
  width: number,
  ruleEdge: 'top' | 'bottom',
  totalMarks: number,
): HeaderFooterLayout {
  return {
    rows: (bands ?? []).map((band) => {
      const zones = zonesOf(band);
      return {
        left: zoneRuns(zones.left, fonts, language, totalMarks),
        center: zoneRuns(zones.center, fonts, language, totalMarks),
        right: zoneRuns(zones.right, fonts, language, totalMarks),
      };
    }),
    contentWidth: width,
    rule,
    ruleEdge,
  };
}

function buildParts(
  worksheet: Worksheet,
  mode: OutputMode,
  diagramImages: DiagramImageMap = new Map(),
): PackageParts {
  const rendered = renderWorksheet(worksheet, mode);
  const streams = collectListStreams(rendered);
  const numIds = assignNumIds(streams);
  const { assets, bySrc } = collectImages(worksheet, mode, diagramImages);
  const fonts = worksheet.fonts;

  const setup = pageSetupOf(worksheet);
  const { width: pageWidth, height: pageHeight } = pageDimensions(setup);
  const textWidth = contentWidth(setup);

  let drawingId = 1;
  const context: BodyContext = {
    fonts,
    language: mode.language,
    contentWidth: textWidth,
    numIds,
    imageRelId: (src) => bySrc.get(src),
    diagramSrc: (blockId) => diagramImages.get(blockId),
    nextDrawingId: () => (drawingId += 1),
  };

  const chunks: string[] = [];

  /*
   * The cover comes first, and owns its own sheet.
   *
   * `coverXml` ends it with a `nextPage` section break carrying its own column
   * geometry, which is what puts the body on sheet 2 — a cover that shares a page with
   * question 1 is not a cover. No page break is added here: a section break already
   * *is* one, and emitting both left a blank sheet between the cover and question 1.
   */
  if (rendered.cover) {
    chunks.push(
      coverXml(
        rendered.cover,
        context,
        pageGeometryXml({
          pageWidth,
          pageHeight,
          margins: setup.margins,
          landscape: setup.orientation === 'landscape',
        }),
        rendered.cover.foot.length > 0 || rendered.cover.footNote
          ? `<w:footerReference w:type="default" r:id="${REL_FOOTER_COVER}"/>`
          : '',
      ),
    );
  }

  // Routed through the shared node renderer rather than hand-built here, so
  // per-element formatting reaches the title, instructions and section headings the
  // same way it reaches question content.
  //
  // A worksheet with a masthead prints its bands instead of the bare title: the title is
  // one of the fields inside them, so emitting both would print it twice.
  if (rendered.bands.length > 0) {
    for (const band of rendered.bands) chunks.push(renderNodeXml(band, context));
  } else if (rendered.title) {
    chunks.push(renderNodeXml(rendered.title, context));
  }

  if (mode.version === 'teacher') {
    chunks.push(
      `<w:p><w:pPr><w:pStyle w:val="${STYLE_IDS.Answer}"/><w:jc w:val="center"/></w:pPr>` +
        run('Teacher Version / 教師版', fonts, {}) +
        '</w:p>',
    );
  }

  if (rendered.instructions) {
    chunks.push(renderNodeXml(rendered.instructions, context));
  }

  // Walk the interleaved flow so layout elements — section headings among them — land
  // where the teacher put them.
  for (const item of rendered.items) {
    const nodes = item.type === 'question' ? item.question.nodes : item.layout.nodes;
    for (const node of nodes) {
      chunks.push(renderNodeXml(node, context));
    }
  }

  const titleText = plain(mode.language === 'zh' ? worksheet.title.zh : worksheet.title.en) ||
    plain(worksheet.title.en) ||
    plain(worksheet.title.zh);

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const header = headerFooterOf(worksheet.header, defaultHeader);
  const footer = headerFooterOf(worksheet.footer, defaultFooter);

  // A teacher-version marker rides in the header so it is unmistakable on every
  // printed page, appended to whatever the teacher authored there.
  const teacherMark =
    mode.version === 'teacher' ? run('  —  Teacher Version / 教師版', fonts, { bold: true }) : '';

  const headerLayout = headerFooterLayout(
    header.bands, header.rule, fonts, mode.language, textWidth, 'bottom', worksheetMarks(worksheet),
  );
  if (teacherMark) {
    // Appended to the rightmost occupied zone of the LAST row, so it never displaces
    // authored content and always lands on the line nearest the document.
    if (headerLayout.rows.length === 0) {
      headerLayout.rows.push({ left: '', center: '', right: teacherMark });
    } else {
      const row = headerLayout.rows[headerLayout.rows.length - 1];
      if (row.right) row.right += teacherMark;
      else if (row.center) row.center += teacherMark;
      else row.left += teacherMark;
    }
  }

  /*
   * A part is needed when *either* the running rows or page 1's own rows would print.
   * A cover-page-only header — blank on continuation pages, "Name:____" on page 1 — has
   * empty running bands, so testing only those would drop the page-1 content entirely.
   */
  const printsOnFirstPage = (value: HeaderFooter) =>
    value.enabled && Boolean(value.firstPage) && !bandsAreEmpty(value.firstPage?.bands ?? []);

  // The page furniture rides in the running header (§ `furnitureHeaderXml`), so its
  // presence alone forces a header part even when no band would print.
  const furnitureXml = furnitureHeaderXml(
    worksheet.pageFurniture,
    pageWidth,
    pageHeight,
    setup.margins,
    fonts,
    mode.language,
  );

  const hasHeader =
    isHeaderFooterActive(header) ||
    printsOnFirstPage(header) ||
    Boolean(teacherMark) ||
    Boolean(furnitureXml);
  const hasFooter = isHeaderFooterActive(footer) || printsOnFirstPage(footer);

  const footerLayout = headerFooterLayout(
    footer.bands, footer.rule, fonts, mode.language, textWidth, 'top', worksheetMarks(worksheet),
  );

  /*
   * What page 1 prints.
   *
   * Three states per part (§ `HeaderFooter.firstPage`): the same as every page, blank,
   * or its own rows. Only the last two need `w:titlePg`, and the resolution is shared
   * with the preview via `firstPageHeaderFooter` so the page on screen and the page in
   * Word cannot disagree about which state a document is in.
   */
  const headerFirst = firstPageHeaderFooter(header);
  const footerFirst = firstPageHeaderFooter(footer);
  const differentFirstPage =
    (hasHeader && headerFirst.differs) || (hasFooter && footerFirst.differs);

  /**
   * Build the page-1 part for one edge.
   *
   * `w:titlePg` switches page 1 to the "first" references *wholesale*, so once either
   * edge differs BOTH need a first-page part — the one that should look unchanged gets
   * its running content again rather than an empty placeholder, or it would vanish from
   * page 1 as a side effect of the other edge differing.
   */
  const firstPart = (
    which: 'hdr' | 'ftr',
    resolved: ReturnType<typeof firstPageHeaderFooter>,
    running: HeaderFooterLayout,
  ) => {
    // The furniture prints on every page including page 1, so it rides on the header's
    // first-page part whatever the band state — "blank on page 1" blanks the bands, not
    // the frame, as the reference's pure answer pages show.
    const extra = which === 'hdr' ? furnitureXml : '';
    const build = which === 'hdr' ? buildHeaderXml : buildFooterXml;
    if (!resolved.differs) return build(running, extra);
    if (resolved.bands.length === 0) return buildEmptyHeaderXml(which, extra);
    // The teacher-version marker deliberately does not ride along here: it is appended
    // to the running header above, and page 1 carries its own authored rows.
    return build(
      headerFooterLayout(
        resolved.bands,
        resolved.rule,
        fonts,
        mode.language,
        textWidth,
        which === 'hdr' ? 'bottom' : 'top',
        worksheetMarks(worksheet),
      ),
      extra,
    );
  };

  const headerFooter: HeaderFooterParts = {
    ...(hasHeader ? { header: buildHeaderXml(headerLayout, furnitureXml) } : {}),
    ...(hasFooter ? { footer: buildFooterXml(footerLayout) } : {}),
    // The cover's foot block is the cover section's own footer, as the reference has
    // it — a footer is what pins it to the page bottom (§ `coverXml`). Foot lines are
    // text-only, so the part can never need an image relationship of its own.
    ...(rendered.cover && (rendered.cover.foot.length > 0 || rendered.cover.footNote)
      ? { footerCover: buildCoverFooterXml(coverFooterBodyXml(rendered.cover, context)) }
      : {}),
    ...(differentFirstPage && hasHeader
      ? { headerFirst: firstPart('hdr', headerFirst, headerLayout) }
      : {}),
    ...(differentFirstPage && hasFooter
      ? { footerFirst: firstPart('ftr', footerFirst, footerLayout) }
      : {}),
  };

  /*
   * Where the header and footer start, from the page edge.
   *
   * Sized from the **running** rows, not the tallest of the two lists. One `w:header`
   * serves the whole section, so a document whose page 1 carries a five-row exam cover
   * over a one-row running header cannot have both — and taking the max meant the cover
   * dictated the geometry of every *other* page, flattening an ordinary one-line header
   * against the paper edge on pages 2 onward. The running rows print on nearly every
   * sheet, so they are the ones the margin should be shaped around; page 1 keeps its own
   * proportions because a cover page is mostly title anyway.
   */
  const edgeOffsets = headerFooterOffsets(
    setup.margins,
    hasHeader ? bandsHeight(header.bands ?? [], header.rule) : 0,
    hasFooter ? bandsHeight(footer.bands ?? [], footer.rule) : 0,
  );

  return {
    documentXml: buildDocumentXml(chunks.join(''), {
      pageWidth,
      pageHeight,
      margins: setup.margins,
      landscape: setup.orientation === 'landscape',
      hasHeader,
      hasFooter,
      differentFirstPage,
      edgeOffsets,
    }),
    stylesXml: buildStylesXml(fonts, {
      // Conditional on the rendered IR, so a document without an answer space keeps
      // its styles.xml — and therefore its whole package — byte-identical to before
      // the style existed. The IR rather than the layout list, because an answer
      // space also comes from a question part (§ per-part answer space); keying on
      // the layout alone shipped paragraphs referencing a style the package lacked.
      answerSpace: rendered.items.some((item) =>
        (item.type === 'question' ? item.question.nodes : item.layout.nodes).some(
          (node) => node.kind === 'answerSpace',
        ),
      ),
      // The document's own body size (the QAB is 10pt); absent keeps the 11pt default
      // and a byte-identical styles.xml (§ `Worksheet.baseFontSize`).
      baseFontSize: worksheet.baseFontSize,
    }),
    numberingXml: buildNumberingXml(streams, fonts, listIndentScheme(documentShape(worksheet))),
    headerFooter,
    fontTableXml: buildFontTableXml(fonts),
    // Student exports must not leak answers into metadata either (§11.8), so the
    // title is the only content that reaches docProps.
    coreXml: buildCorePropsXml(
      `${titleText}${mode.version === 'teacher' ? ' (Teacher Version)' : ''}`,
      timestamp,
    ),
    assets,
  };
}

export async function exportDocx(worksheet: Worksheet, mode: OutputMode): Promise<Blob> {
  // Diagrams are rasterized first so the rest of the pipeline stays synchronous and
  // sees a diagram as just another embedded picture.
  const diagramImages = await renderDiagramImages(worksheet, mode);
  assertEveryDiagramRasterized(worksheet, mode, diagramImages);
  return zipPackage(buildParts(worksheet, mode, diagramImages));
}

/**
 * Refuse to export when a diagram did not become an image. Emitting nothing is
 * correct (a dangling relationship is a repair error) but silent — a missing figure
 * is indistinguishable from one never added, which once cost a full debugging
 * session. Throwing is right: the caller renders the message. `exportDocxBuffer`
 * (tests/scripts) skips this and takes its map as an argument.
 */
function assertEveryDiagramRasterized(
  worksheet: Worksheet,
  mode: OutputMode,
  diagramImages: DiagramImageMap,
): void {
  const missing = collectDiagramNodes(worksheet, mode).filter(
    (node) => !diagramImages.get(node.blockId),
  );
  if (missing.length === 0) return;

  // Named by their alt text where there is one: "diagram 2 of 5" tells a teacher nothing
  // about which picture to go and look at.
  const names = missing
    .map((node) => plain(node.altText.en) || plain(node.altText.zh))
    .filter(Boolean);

  throw new Error(
    missing.length === 1
      ? `A diagram could not be turned into an image${names[0] ? ` (${names[0]})` : ''}, so the export was stopped rather than dropping it.`
      : `${missing.length} diagrams could not be turned into images${names.length ? ` (${names.join(', ')})` : ''}, so the export was stopped rather than dropping them.`,
  );
}

/** Node-friendly variant used by the export tests. */
export async function exportDocxBuffer(
  worksheet: Worksheet,
  mode: OutputMode,
  diagramImages?: DiagramImageMap,
): Promise<Uint8Array> {
  return zipPackageBuffer(buildParts(worksheet, mode, diagramImages));
}

/** Exposed for tests that assert on the raw XML parts. */
export { buildParts as buildDocxParts };

const LANGUAGE_TAG: Record<OutputMode['language'], string> = {
  en: 'EN',
  zh: 'ZH',
  bilingual: 'Bilingual',
};

/**
 * `<name> (<Student|Teacher>) (<EN|ZH|Bilingual>).docx` per §7.1.
 *
 * The name comes from `documentName`, the same chain the file list reads. It used to
 * spell the fallback out again here, which meant a renamed document downloaded under
 * its old title — the list and the download disagreeing about what the file is called.
 */
export function docxFileName(worksheet: Worksheet, mode: OutputMode): string {
  const rawTitle = documentName(worksheet) ?? 'Worksheet';
  // Strip characters that are illegal in Windows/macOS filenames.
  const title = rawTitle.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Worksheet';
  const version = mode.version === 'teacher' ? 'Teacher' : 'Student';
  return `${title} (${version}) (${LANGUAGE_TAG[mode.language]}).docx`;
}
