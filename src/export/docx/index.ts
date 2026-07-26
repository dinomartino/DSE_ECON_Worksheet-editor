import {
  contentWidth,
  defaultFooter,
  defaultHeader,
  headerFooterOf,
  isHeaderFooterActive,
  pageDimensions,
  pageNumberPlaceholder,
  pageSetupOf,
} from '@/model/page';
import { zonesOf } from '@/model/bands';
import { worksheetMarks } from '@/model/marks';
import { plain } from '@/model/text';
import type { BandField, FontPair, HeaderFooter, LanguageMode, OutputMode, Worksheet } from '@/model/types';
import type { RenderNode } from '@/render/ir';
import { bandFieldText, collectListStreams, renderWorksheet } from '@/render/worksheet';
import { renderDiagramImages, type DiagramImageMap } from '../diagramImage';
import { renderNodeXml, type BodyContext } from './body';
import { assignNumIds, buildNumberingXml } from './numbering';
import {
  buildCorePropsXml,
  buildDocumentXml,
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
import { biTextRuns, rFonts, run } from './runs';
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
    }
  };

  for (const section of rendered.sections) {
    for (const item of section.items) {
      const nodes = item.type === 'question' ? item.question.nodes : item.layout.nodes;
      nodes.forEach(visit);
    }
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
  const runProps = `<w:rPr>${rFonts(fonts)}</w:rPr>`;
  return fields
    .map((field) => {
      if (field.kind === 'pageNumber') {
        // Split the template on its placeholders so the literal parts stay authored
        // text and only the numbers become fields.
        return pageNumberPlaceholder(field.pattern)
          .split(/(#|N)/)
          .map((chunk: string) => {
            if (chunk === '#') return fieldRuns('PAGE', runProps, '1');
            if (chunk === 'N') return fieldRuns('NUMPAGES', runProps, '1');
            return chunk ? run(chunk, fonts) : '';
          })
          .join('');
      }
      return biTextRuns(bandFieldText(field, totalMarks), fonts, language);
    })
    .join('');
}

function headerFooterLayout(
  value: HeaderFooter,
  fonts: FontPair,
  language: LanguageMode,
  width: number,
  ruleEdge: 'top' | 'bottom',
  totalMarks: number,
): HeaderFooterLayout {
  return {
    rows: (value.bands ?? []).map((band) => {
      const zones = zonesOf(band);
      return {
        left: zoneRuns(zones.left, fonts, language, totalMarks),
        center: zoneRuns(zones.center, fonts, language, totalMarks),
        right: zoneRuns(zones.right, fonts, language, totalMarks),
      };
    }),
    contentWidth: width,
    rule: value.rule,
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

  // Routed through the shared node renderer rather than hand-built here, so
  // per-element formatting reaches the title, instructions and section headings the
  // same way it reaches question content.
  //
  // A worksheet with a masthead prints its bands instead of the bare title: the title is
  // one of the fields inside them, so emitting both would print it twice.
  if (rendered.bands.length > 0) {
    for (const band of rendered.bands) chunks.push(renderNodeXml(band, context));
  } else {
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

  for (const section of rendered.sections) {
    if (section.heading) {
      chunks.push(renderNodeXml(section.heading, context));
    }
    // Walk the interleaved flow so layout elements land where the teacher put them.
    for (const item of section.items) {
      const nodes = item.type === 'question' ? item.question.nodes : item.layout.nodes;
      for (const node of nodes) {
        chunks.push(renderNodeXml(node, context));
      }
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
    header, fonts, mode.language, textWidth, 'bottom', worksheetMarks(worksheet),
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

  const hasHeader = isHeaderFooterActive(header) || Boolean(teacherMark);
  const hasFooter = isHeaderFooterActive(footer);

  const footerLayout = headerFooterLayout(
    footer, fonts, mode.language, textWidth, 'top', worksheetMarks(worksheet),
  );

  const suppressHeaderFirst = hasHeader && header.showOnFirstPage === false;
  const suppressFooterFirst = hasFooter && footer.showOnFirstPage === false;
  const differentFirstPage = suppressHeaderFirst || suppressFooterFirst;

  // `w:titlePg` switches page 1 to the "first" references wholesale, so once either
  // part suppresses, BOTH need a first-page part — the one that should still appear
  // on page 1 gets its real content, not an empty placeholder.
  const headerFooter: HeaderFooterParts = {
    ...(hasHeader ? { header: buildHeaderXml(headerLayout) } : {}),
    ...(hasFooter ? { footer: buildFooterXml(footerLayout) } : {}),
    ...(differentFirstPage && hasHeader
      ? { headerFirst: suppressHeaderFirst ? buildEmptyHeaderXml('hdr') : buildHeaderXml(headerLayout) }
      : {}),
    ...(differentFirstPage && hasFooter
      ? { footerFirst: suppressFooterFirst ? buildEmptyHeaderXml('ftr') : buildFooterXml(footerLayout) }
      : {}),
  };

  return {
    documentXml: buildDocumentXml(chunks.join(''), {
      pageWidth,
      pageHeight,
      margins: setup.margins,
      landscape: setup.orientation === 'landscape',
      hasHeader,
      hasFooter,
      differentFirstPage,
    }),
    stylesXml: buildStylesXml(fonts),
    numberingXml: buildNumberingXml(streams, fonts),
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
  return zipPackage(buildParts(worksheet, mode, diagramImages));
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

/** `<title> (<Student|Teacher>) (<EN|ZH|Bilingual>).docx` per §7.1. */
export function docxFileName(worksheet: Worksheet, mode: OutputMode): string {
  const rawTitle =
    plain(worksheet.title.en) || plain(worksheet.title.zh) || 'Worksheet';
  // Strip characters that are illegal in Windows/macOS filenames.
  const title = rawTitle.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Worksheet';
  const version = mode.version === 'teacher' ? 'Teacher' : 'Student';
  return `${title} (${version}) (${LANGUAGE_TAG[mode.language]}).docx`;
}
