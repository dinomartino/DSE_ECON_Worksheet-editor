import type { TermPreferences } from '@/glossary/types';

/**
 * Settings → Translation terms as CSV, so a teacher keeps a copy and a panel head can share
 * a department list. One row per term: an EDB term the teacher chose a wording for or added
 * to, or a term of their own. Columns:
 *
 *   english, abbreviation, other_forms, chinese, chosen, related
 *
 * `chinese` and `other_forms` hold several values joined by " / ". For an EDB term,
 * `chinese` is the teacher's own renderings and `chosen` the wording they picked; for their
 * own term, `chinese` is every rendering and `chosen` the preferred one. RFC 4180 quoting,
 * UTF-8 with a BOM so Excel shows the Chinese.
 */

export const CSV_COLUMNS = ['english', 'abbreviation', 'other_forms', 'chinese', 'chosen', 'related'] as const;
const SEP = ' / ';

export interface CsvTermRow {
  /** 1-based line of the row in the file (the header is line 1). */
  line: number;
  english: string;
  abbreviation: string;
  forms: string[];
  chinese: string[];
  chosen: string;
  related: boolean;
}

const quote = (v: string) => (/[",\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Every row the preferences hold: EDB terms by key, then the teacher's terms in order. */
export function termsToCsv(prefs: TermPreferences): string {
  const own = prefs.own ?? {};
  const keys = [...new Set([...Object.keys(prefs.choices), ...Object.keys(own), ...Object.keys(prefs.related)])].sort((a, b) =>
    a.localeCompare(b),
  );
  const rows: string[][] = [[...CSV_COLUMNS]];
  for (const key of keys) {
    rows.push([key, '', '', (own[key] ?? []).join(SEP), prefs.choices[key] ?? '', prefs.related[key] ? 'yes' : '']);
  }
  for (const term of Object.values(prefs.terms ?? {})) {
    rows.push([term.en, term.abbreviation ?? '', (term.forms ?? []).join(SEP), term.zh.join(SEP), term.zh[0], '']);
  }
  return `﻿${rows.map((r) => r.map(quote).join(',')).join('\r\n')}\r\n`;
}

/** RFC 4180 records with the line each starts on. Quotes may hold commas and line breaks. */
function records(text: string): Array<{ line: number; cells: string[] }> {
  const out: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  const end = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== '')) out.push({ line: start, cells });
    cells = [];
    cell = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === '\n') line++;
        cell += c;
      }
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      cells.push(cell);
      cell = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      end();
      line++;
      start = line;
    } else cell += c;
  }
  if (cell !== '' || cells.length) end();
  return out;
}

const list = (cell: string | undefined) =>
  (cell ?? '')
    .split(/\s*[/／]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * The rows of a CSV, or `missingHeader` when it has no `english` column. Columns are found
 * by name (any case, any order); unknown columns are ignored. Nothing is validated here: the
 * import preview says what each row would do.
 */
export function parseTermsCsv(text: string): { rows: CsvTermRow[] } | { error: 'missingHeader' } {
  const all = records(text.replace(/^﻿/, ''));
  if (!all.length) return { error: 'missingHeader' };
  const header = all[0].cells.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const at = (name: string) => header.indexOf(name);
  if (at('english') < 0) return { error: 'missingHeader' };
  const get = (cells: string[], name: string) => (at(name) >= 0 ? (cells[at(name)] ?? '') : '');
  const rows = all.slice(1).map(({ line, cells }) => ({
    line,
    english: get(cells, 'english').trim(),
    abbreviation: get(cells, 'abbreviation').trim(),
    forms: list(get(cells, 'other_forms')),
    chinese: list(get(cells, 'chinese')),
    chosen: get(cells, 'chosen').trim(),
    related: /^(yes|y|true|1|是)$/i.test(get(cells, 'related').trim()),
  }));
  return { rows };
}

/**
 * A CSV file's text. UTF-8 (with or without the BOM) as written here; else Big5, the code
 * page Excel on a Hong Kong Windows uses when a teacher saves as plain "CSV", which read
 * as UTF-8 would turn every Chinese character into U+FFFD.
 */
export function decodeTermsCsv(bytes: Uint8Array): string {
  for (const encoding of ['utf-8', 'big5']) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      // Not this encoding (or the engine lacks it): try the next.
    }
  }
  return new TextDecoder().decode(bytes);
}
