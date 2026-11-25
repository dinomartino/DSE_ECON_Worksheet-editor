import { XML_DECL, escapeXml, sanitizeText } from '@/export/docx/xml';
import { APP_NAME, ORIGIN_KEYS, type ExportOrigin } from './index';

/**
 * The origin (k-0558) as OOXML document properties, shared by `.docx` and `.xlsx`: the
 * extended properties' `Application` / `AppVersion`, and a custom properties part holding
 * every field under `ORIGIN_KEYS` (Word: File → Info → Properties → Advanced → Custom).
 * Package parts only — nothing reaches the document body.
 */

export const CUSTOM_PROPS_PART = 'docProps/custom.xml';
export const CUSTOM_PROPS_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';
export const CUSTOM_PROPS_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';
export const CORE_PROPS_CONTENT_TYPE = 'application/vnd.openxmlformats-package.core-properties+xml';
export const APP_PROPS_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.extended-properties+xml';
export const CORE_PROPS_REL_TYPE =
  'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';
export const APP_PROPS_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties';

/** The `fmtid` every user-defined custom property carries (ECMA-376 Part 1, §22.3.2.2). */
const USER_DEFINED_FMTID = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}';

/**
 * `AppVersion` must read `XX.YYYY` (ECMA-376 Part 1, §22.2.2.3), so `0.10.0` is `00.1000`
 * (major, then minor × 100 + patch); the exact version is the `DSEconVersion` property.
 */
export function ooxmlAppVersion(version: string): string | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return undefined;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major > 99 || minor > 99 || patch > 99) return undefined;
  return `${String(major).padStart(2, '0')}.${String(minor * 100 + patch).padStart(4, '0')}`;
}

/** `docProps/app.xml`: the application, and its version when there is an origin. */
export function appPropsXml(origin?: ExportOrigin): string {
  const appVersion = origin && ooxmlAppVersion(origin.version);
  return (
    XML_DECL +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    `<Application>${escapeXml(origin?.app ?? APP_NAME)}</Application>` +
    (appVersion ? `<AppVersion>${appVersion}</AppVersion>` : '') +
    '</Properties>'
  );
}

/** `docProps/custom.xml`: each origin field as a named text (or date) property. */
export function customPropsXml(origin: ExportOrigin): string {
  const entries: Array<[string, string, 'lpwstr' | 'filetime']> = [
    [ORIGIN_KEYS.app, origin.app, 'lpwstr'],
    [ORIGIN_KEYS.version, origin.version, 'lpwstr'],
    [ORIGIN_KEYS.exportedAt, origin.exportedAt, 'filetime'],
    ...(origin.docId ? [[ORIGIN_KEYS.docId, origin.docId, 'lpwstr'] as [string, string, 'lpwstr']] : []),
  ];
  // pid 0 and 1 are reserved; user properties start at 2.
  const properties = entries
    .map(
      ([name, value, type], index) =>
        `<property fmtid="${USER_DEFINED_FMTID}" pid="${index + 2}" name="${name}">` +
        `<vt:${type}>${escapeXml(sanitizeText(value))}</vt:${type}></property>`,
    )
    .join('');
  return (
    XML_DECL +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ' +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${properties}</Properties>`
  );
}

/** `docProps/core.xml` for a package with no title of its own (the `.xlsx`). */
export function corePropsXml(origin: ExportOrigin): string {
  return (
    XML_DECL +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${origin.exportedAt}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${origin.exportedAt}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}
