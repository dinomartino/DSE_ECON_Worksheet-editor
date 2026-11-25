import JSZip from 'jszip';
import { escapeXml, sanitizeText } from '@/export/docx/xml';
import type { ExportOrigin } from '@/export/origin';
import {
  APP_PROPS_CONTENT_TYPE,
  APP_PROPS_REL_TYPE,
  CORE_PROPS_CONTENT_TYPE,
  CORE_PROPS_REL_TYPE,
  CUSTOM_PROPS_CONTENT_TYPE,
  CUSTOM_PROPS_PART,
  CUSTOM_PROPS_REL_TYPE,
  appPropsXml,
  corePropsXml,
  customPropsXml,
} from '@/export/origin/docxProps';

/**
 * The smallest `.xlsx` Excel and importers open: one sheet of inline strings and
 * numbers, no styles. Row `i` of `rows` is sheet row `i + 1`; an empty row is skipped.
 * With an `origin` (k-0558) it also carries the document properties a `.docx` does:
 * core, app (Application, AppVersion) and the custom origin properties.
 */

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

export function sheetXml(rows: Array<Array<string | number>>): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${columnName(c)}${r + 1}`;
          if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`;
          if (value === '') return '';
          const text = escapeXml(sanitizeText(value));
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
        })
        .join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${MAIN}"><sheetData>${body}</sheetData></worksheet>`;
}

export function buildXlsxZip(rows: Array<Array<string | number>>, sheetName = 'Sheet1', origin?: ExportOrigin): JSZip {
  const zip = new JSZip();
  const props = origin
    ? {
        types:
          `<Override PartName="/docProps/core.xml" ContentType="${CORE_PROPS_CONTENT_TYPE}"/>` +
          `<Override PartName="/docProps/app.xml" ContentType="${APP_PROPS_CONTENT_TYPE}"/>` +
          `<Override PartName="/${CUSTOM_PROPS_PART}" ContentType="${CUSTOM_PROPS_CONTENT_TYPE}"/>`,
        rels:
          `<Relationship Id="rId2" Type="${CORE_PROPS_REL_TYPE}" Target="docProps/core.xml"/>` +
          `<Relationship Id="rId3" Type="${APP_PROPS_REL_TYPE}" Target="docProps/app.xml"/>` +
          `<Relationship Id="rId4" Type="${CUSTOM_PROPS_REL_TYPE}" Target="${CUSTOM_PROPS_PART}"/>`,
      }
    : { types: '', rels: '' };
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${props.types}</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>${props.rels}</Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  zip.file('xl/worksheets/sheet1.xml', sheetXml(rows));
  if (origin) {
    zip.file('docProps/core.xml', corePropsXml(origin));
    zip.file('docProps/app.xml', appPropsXml(origin));
    zip.file(CUSTOM_PROPS_PART, customPropsXml(origin));
  }
  return zip;
}

export async function buildXlsx(
  rows: Array<Array<string | number>>,
  sheetName = 'Sheet1',
  origin?: ExportOrigin,
): Promise<Blob> {
  return buildXlsxZip(rows, sheetName, origin).generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
}
