import { describe, expect, it } from 'vitest';
import { duplicateWorksheet, parseWorksheet, stringifyWorksheet } from '@/storage/document';
import { coverageRecord, coverageFromSaved, changedRuns } from '@/coverage/result';
import type { QuestionResult } from '@/coverage/types';
import { duplicateSetPapers } from './duplicateSet';
import {
  MAX_COVERAGE_REPORTS,
  normalizeCoverageReports,
  savedCoverageReports,
  withCoverageReport,
  withoutCoverageReport,
} from './coverageReports';
import { createWorksheet } from './factories';
import { migrate, serializeWorksheet } from './migrations';
import type { SavedCoverageReport, Worksheet } from './types';

const result = (number: string, code: string): QuestionResult => ({
  questionId: `q-${number}`,
  number,
  ok: true,
  units: [{ key: `q${number}`, label: '', marks: 2, picks: [{ code, w: 2, band: 'apply', conf: 'high', why: 'Because.' }], outside: 'x' }],
});

const record = (worksheetId: string, minute: number, extra: Partial<SavedCoverageReport> = {}): SavedCoverageReport => ({
  ...coverageRecord(
    { id: `r${minute}`, language: 'en', title: 'Mock', scope: 'paper', at: `2026-11-22T10:${String(minute).padStart(2, '0')}:00.000Z`, pageSize: 'A4' },
    [{ worksheetId, title: 'Mock', sent: 2, fingerprint: 'fp', results: [result('1', 'C.ped'), result('2', 'B.factors')] }],
  ),
  ...extra,
});

describe('saved coverage checks (k-0489 v2)', () => {
  it('keeps only what the report needs, and builds the same report again', () => {
    const r = record('W', 1);
    expect(r.runs[0].results[0]).toEqual({ number: '1', ok: true, units: [{ label: '', marks: 2, picks: [{ code: 'C.ped', w: 2, band: 'apply', conf: 'high', why: 'Because.' }] }] });
    const coverage = coverageFromSaved(r);
    expect(coverage).toMatchObject({ id: 'r1', language: 'en', title: 'Mock', scope: 'paper' });
    expect(coverage.report.breadth.keyPoints.hit).toBe(2);
    expect(coverage.report.units.map((u) => u.where.at)).toEqual(['1', '2']);
  });

  it('keeps only the latest check (u-vouw): a new one replaces it; delete removes the field', () => {
    let ws: Worksheet = { ...createWorksheet(), id: 'W' };
    expect(MAX_COVERAGE_REPORTS).toBe(1);
    for (let minute = 1; minute <= 3; minute += 1) ws = withCoverageReport(ws, record('W', minute));
    expect(savedCoverageReports(ws).map((r) => r.id)).toEqual(['r3']);
    expect(ws.coverageReports).toHaveLength(1);
    // The same check kept again stays one; an older one arriving late does not replace it.
    ws = withCoverageReport(ws, record('W', 3));
    ws = withCoverageReport(ws, record('W', 2));
    expect(savedCoverageReports(ws).map((r) => r.id)).toEqual(['r3']);
    ws = withoutCoverageReport(ws, 'r3');
    expect(ws).not.toHaveProperty('coverageReports');
    expect(withoutCoverageReport(ws, 'nope')).toBe(ws);
  });

  it('tidies a paper saved with several checks to the latest of its own on load', () => {
    const newer = { v: 2, id: 'future' };
    const stored = [record('W', 2), record('W', 5), record('OTHER', 9), newer, record('W', 3)];
    expect(normalizeCoverageReports(stored, 'W')).toEqual([record('W', 5), newer]);
    const ws = migrate({ ...JSON.parse(stringifyWorksheet({ ...createWorksheet(), id: 'W' })), coverageReports: stored });
    expect(ws.coverageReports).toEqual([record('W', 5), newer]);
    expect(savedCoverageReports(ws).map((r) => r.id)).toEqual(['r5']);
  });

  it('survives a save and reload, and does not raise the written schema version', () => {
    const ws = withCoverageReport({ ...createWorksheet(), id: 'W', schemaVersion: 1 }, record('W', 1));
    expect(serializeWorksheet(ws).schemaVersion).toBe(1);
    const back = parseWorksheet(stringifyWorksheet(ws));
    expect(savedCoverageReports(back)).toEqual([record('W', 1)]);
  });

  it('an older build carries the field untouched: it is just an unknown top-level key there', () => {
    // What 0.10.0 does with a key it does not know: stash it, write it back as it was.
    const raw = JSON.parse(stringifyWorksheet(withCoverageReport({ ...createWorksheet(), id: 'W' }, record('W', 1)))) as Record<string, unknown>;
    const { coverageReports, ...rest } = raw;
    const heldByOld = { ...migrate(rest), __unknown: { coverageReports } };
    const writtenByOld = JSON.parse(JSON.stringify(serializeWorksheet(heldByOld))) as Record<string, unknown>;
    expect(writtenByOld.coverageReports).toEqual(coverageReports);
    expect(savedCoverageReports(migrate(writtenByOld))).toHaveLength(1);
  });

  it('reads tolerantly: a malformed record is dropped, a newer format kept and never shown', () => {
    const newer = { v: 2, id: 'future', anything: true };
    const kept = normalizeCoverageReports([record('W', 1), { v: 1, id: 'broken' }, 'junk', newer], 'W');
    expect(kept).toEqual([record('W', 1), newer]);
    expect(normalizeCoverageReports('nope', 'W')).toBeUndefined();
    expect(normalizeCoverageReports([{ v: 1 }], 'W')).toBeUndefined();
    const ws = migrate({ ...JSON.parse(stringifyWorksheet({ ...createWorksheet(), id: 'W' })), coverageReports: [record('W', 1), newer, 42] });
    expect(ws.coverageReports).toEqual([record('W', 1), newer]);
    expect(savedCoverageReports(ws).map((r) => r.id)).toEqual(['r1']);
    // A new check never drops a newer build's record, nor counts it as this build's one.
    const more = withCoverageReport(ws, record('W', 2));
    expect(more.coverageReports).toEqual([record('W', 2), newer]);
  });

  it('shows only checks of this paper; a duplicate leaves them behind', () => {
    // A record of another paper (an older build's copy) is never shown.
    const ws: Worksheet = { ...withCoverageReport({ ...createWorksheet(), id: 'W' }, record('W', 1)), coverageReports: [record('W', 1), record('OTHER', 2)] };
    expect(savedCoverageReports(ws).map((r) => r.id)).toEqual(['r1']);
    expect(duplicateWorksheet(ws, 'copy')).not.toHaveProperty('coverageReports');
    const [copy] = duplicateSetPapers([ws], { set: { id: 's2', name: 'Copy' }, bumpYear: false, lang: 'en', newId: () => 'c1' });
    expect(copy).not.toHaveProperty('coverageReports');
  });

  it('says which papers read differently now; a paper not at hand is not called changed', () => {
    const set: SavedCoverageReport = {
      ...record('P1', 1),
      scope: 'set',
      runs: [
        { worksheetId: 'P1', paper: 1, title: 'P1', sent: 1, fingerprint: 'a', results: [] },
        { worksheetId: 'P2', paper: 2, title: 'P2', sent: 1, fingerprint: 'b', results: [] },
      ],
    };
    expect(changedRuns(set, (id) => (id === 'P1' ? 'a' : 'b2'))).toEqual([1]);
    expect(changedRuns(set, (id) => (id === 'P1' ? 'a' : undefined))).toEqual([]);
    expect(coverageFromSaved(set).papers?.map((p) => p.paper)).toEqual([1, 2]);
  });
});
