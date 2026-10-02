import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { loadGlossary } from '@/glossary/load';
import { buildBackup, readBackup, TERMS_ENTRY } from '@/storage/backup';
import { parseTermsCsv, termsToCsv, type CsvTermRow } from '@/settings/termsCsv';
import { applyImport, previewImport } from './termsImport';
import { EMPTY_PREFERENCES, type Prefs } from './termRows';

const GDP = 'Gross Domestic Product (GDP)';
const prefsOf = (p: Partial<Prefs>): Prefs => ({ ...EMPTY_PREFERENCES, ...p });
const rowsOf = (text: string) => {
  const parsed = parseTermsCsv(text);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed.rows;
};

const MINE = prefsOf({
  choices: { [GDP]: '國內生產總值', 'aggregate expenditure': '總開銷' },
  related: { [GDP]: true },
  own: { 'aggregate expenditure': ['總開銷'] },
  terms: {
    t1: { en: 'carbon tax', forms: ['carbon levy'], zh: ['碳稅', '碳排放稅'] },
    // A comma, quotes and a line-break-free but tricky name.
    t2: { en: 'tax, "green" style', abbreviation: 'GTS', zh: ['綠色稅，「環保」式'] },
  },
});

describe('Translation terms CSV', () => {
  it('round-trips choices, own wordings and terms, with commas, quotes and Chinese', () => {
    const csv = termsToCsv(MINE);
    expect(csv.startsWith('﻿english,abbreviation,other_forms,chinese,chosen,related\r\n')).toBe(true);
    // Quoted for the ASCII comma and quotes; the full-width ， needs none.
    expect(csv).toContain('"tax, ""green"" style",GTS,,綠色稅，「環保」式,綠色稅，「環保」式,\r\n');
    const rows = rowsOf(csv);
    expect(rows.map((r) => [r.english, r.abbreviation, r.forms, r.chinese, r.chosen, r.related])).toEqual([
      ['aggregate expenditure', '', [], ['總開銷'], '總開銷', false],
      [GDP, '', [], [], '國內生產總值', true],
      ['carbon tax', '', ['carbon levy'], ['碳稅', '碳排放稅'], '碳稅', false],
      ['tax, "green" style', 'GTS', [], ['綠色稅，「環保」式'], '綠色稅，「環保」式', false],
    ]);
  });

  it('reads columns by name in any order, LF or CRLF, quoted line breaks, and refuses a file without english', () => {
    const rows = rowsOf('Chosen,English,Chinese\n碳稅,"carbon\ntax",碳稅 / 碳排放稅\n\n,,\n');
    expect(rows).toEqual([
      { line: 2, english: 'carbon\ntax', abbreviation: '', forms: [], chinese: ['碳稅', '碳排放稅'], chosen: '碳稅', related: false },
    ]);
    expect(parseTermsCsv('chinese,chosen\n碳稅,碳稅')).toEqual({ error: 'missingHeader' });
    expect(parseTermsCsv('')).toEqual({ error: 'missingHeader' });
  });
});

describe('Import CSV preview and merge', async () => {
  const base = await loadGlossary(EMPTY_PREFERENCES);
  const rows = new Map(base.terms.map((t) => [t.en, t]));
  const preview = (csv: CsvTermRow[], current: Prefs = MINE) => previewImport(csv, rows, base.edbKeyFor, current);
  const file = rowsOf(
    [
      'english,abbreviation,other_forms,chinese,chosen,related',
      'carbon tax,,carbon levy,碳稅 / 碳排放稅,碳稅,', // same as mine
      'Gross Domestic Product (GDP),,,,本地生產總值,', // a different choice than mine
      'gross domestic product,,,,國內生產總值,', // repeats line 3 (same EDB entry)
      'aggregate expenditure,,,總花費,總花費,', // a choice that differs, plus a new own wording
      'blue economy,,,藍色經濟,,', // new term
      'capital,,,本錢,本錢,', // EDB term: a new own wording, chosen
      'green bond,GDP,,綠色債券,,', // names an EDB abbreviation
      'green tax,,,,,', // no Chinese
      'nothing here,,,,,', // no Chinese
      ',,,碳稅,,', // no English
      'credit,,,,貸款,', // chosen is not one of its wordings
    ].join('\n'),
  );

  it('classifies each row: new, already here, different, can’t use', () => {
    const p = preview(file);
    expect(p.items.map((i) => [i.line, i.kind, i.reason ?? ''])).toEqual([
      [2, 'same', ''],
      [3, 'conflict', ''],
      [4, 'invalid', 'repeat'],
      [5, 'conflict', ''],
      [6, 'add', ''],
      [7, 'add', ''],
      [8, 'invalid', 'namesEdb'],
      [9, 'invalid', 'noChinese'],
      [10, 'invalid', 'noChinese'],
      [11, 'invalid', 'noEnglish'],
      [12, 'invalid', 'badChosen'],
    ]);
    expect(p.counts).toEqual({ add: 2, same: 1, conflict: 2, invalid: 6 });
    expect(p.items.find((i) => i.line === 8)?.detail).toBe(GDP);
  });

  it('merge adds what is new and keeps mine where they differ; replace makes the file the list', () => {
    const p = preview(file);
    const merged = applyImport(p, MINE, 'merge');
    expect(merged.choices).toEqual({ [GDP]: '國內生產總值', 'aggregate expenditure': '總開銷', capital: '本錢' });
    expect(merged.own).toEqual({ 'aggregate expenditure': ['總開銷', '總花費'], capital: ['本錢'] });
    expect(Object.values(merged.terms).map((t) => t.en)).toEqual(['carbon tax', 'tax, "green" style', 'blue economy']);
    const replaced = applyImport(p, MINE, 'replace');
    expect(replaced.choices).toEqual({ [GDP]: '本地生產總值', 'aggregate expenditure': '總花費', capital: '本錢' });
    expect(replaced.own).toEqual({ 'aggregate expenditure': ['總花費'], capital: ['本錢'] });
    expect(replaced.related).toEqual({});
    expect(Object.values(replaced.terms).map((t) => t.en)).toEqual(['carbon tax', 'blue economy']);
  });

  it('an export imports back into an empty app as exactly the same terms', () => {
    const p = preview(rowsOf(termsToCsv(MINE)), EMPTY_PREFERENCES);
    expect(p.counts).toEqual({ add: 4, same: 0, conflict: 0, invalid: 0 });
    const back = applyImport(p, EMPTY_PREFERENCES, 'merge');
    expect(back.choices).toEqual(MINE.choices);
    expect(back.related).toEqual(MINE.related);
    expect(back.own).toEqual(MINE.own);
    expect(Object.values(back.terms)).toEqual(Object.values(MINE.terms));
  });
});

describe('the app backup', () => {
  it('carries the terms CSV as a .csv entry, which a shipped build ignores', async () => {
    const csv = termsToCsv(MINE);
    const zip = await JSZip.loadAsync(await buildBackup([], '2026-10-02T00:00:00.000Z', undefined, undefined, [], csv));
    expect(Object.keys(zip.files)).toContain(TERMS_ENTRY);
    expect(TERMS_ENTRY.endsWith('.json')).toBe(false);
    const read = await readBackup(await buildBackup([], '2026-10-02T00:00:00.000Z', undefined, undefined, [], csv));
    expect(read.terms).toBe(csv);
    expect(read.worksheets).toEqual([]);
    expect(read.failures).toEqual([]);
    expect((await readBackup(await buildBackup([]))).terms).toBeUndefined();
  });
});
