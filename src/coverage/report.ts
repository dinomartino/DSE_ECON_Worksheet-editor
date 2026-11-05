import { keyPointHours, lookupCode, SYLLABUS, type SyllabusTopic } from '@/syllabus';
import { BANDS, CONFIDENCES, type Band, type Confidence, type QuestionResult } from './types';

/**
 * The coverage report (the C13 grid, IDEAS § C), built from the per-question results once
 * the run is over. Pure: no AI, no storage. Denominators are named (design § 8.2): breadth
 * by count (key points, points) and by lesson hours (a topic's hours spread over its key
 * points by their point counts), over the Compulsory Part plus at most one Elective Part.
 */

export type ElectiveCode = 'EL1' | 'EL2';
/** 'auto': the elective part with more marks, when the paper has any. */
export type ElectiveChoice = 'auto' | ElectiveCode;

type ByBand = Record<Band, number>;
const noBands = (): ByBand => ({ know: 0, apply: 0, evaluate: 0 });

export interface PointRow {
  code: string;
  en: string;
  zh: string;
  marks: number;
}

export interface KeyPointRow {
  code: string;
  en: string;
  zh: string;
  /** Its share of the topic's lesson hours. */
  hours: number;
  marks: number;
  bands: ByBand;
  /** Any unit tests it (marks may still be 0 on a paper without marks). */
  hit: boolean;
  /** Points inside it that were tested, in guide order. */
  points: PointRow[];
  /** "3", "12(b)(ii)": the units that test it, in print order. */
  where: string[];
}

export interface TopicRow {
  code: string;
  en: string;
  zh: string;
  elective: boolean;
  /** False for an Elective Part that is shown but not counted. */
  counted: boolean;
  hours: number;
  /** Its lesson hours ÷ the scope's; null when not counted. */
  hoursShare: number | null;
  marks: number;
  /** Its marks ÷ every analysed mark on the paper; null when the paper has no marks. */
  marksShare: number | null;
  bands: ByBand;
  keyPoints: KeyPointRow[];
}

export interface Ratio {
  hit: number;
  of: number;
}

export interface UnitRow {
  where: string;
  marks: number;
  ok: boolean;
  picks: Array<{ code: string; main: boolean; band: Band; conf: Confidence; why: string }>;
}

export interface CoverageReport {
  syllabus: string;
  /** Questions sent, and those whose result came back. */
  questions: number;
  analysed: number;
  marks: {
    /** Marks of every unit with a result (tagged or not). */
    total: number;
    /** On units the AI could not tag (no valid code) or whose request failed. */
    untagged: number;
  };
  /** Questions with no result: the run stopped or their request failed. */
  missing: number;
  elective: { found: ElectiveCode[]; counted: ElectiveCode | null };
  breadth: { keyPoints: Ratio; points: Ratio; hours: Ratio };
  bands: ByBand;
  confidence: Record<Confidence, number>;
  topics: TopicRow[];
  units: UnitRow[];
}

const where = (number: string, label: string) => `${number}${label.replace(/\s+/g, '')}`;

export function buildReport(results: QuestionResult[], sent: number, choice: ElectiveChoice = 'auto'): CoverageReport {
  const kpMarks = new Map<string, { marks: number; bands: ByBand; hit: boolean; where: string[] }>();
  const pointMarks = new Map<string, number>();
  const topicMarks = new Map<string, number>();
  const bands = noBands();
  const confidence: Record<Confidence, number> = { high: 0, medium: 0, low: 0 };
  let total = 0;
  let untagged = 0;
  const units: UnitRow[] = [];

  for (const result of results) {
    for (const unit of result.units) {
      total += unit.marks;
      const picks = result.ok ? unit.picks.filter((p) => lookupCode(p.code)) : [];
      units.push({
        where: where(result.number, unit.label),
        marks: unit.marks,
        ok: result.ok,
        picks: picks.map((p) => ({ code: p.code, main: p.w === 2, band: p.band, conf: p.conf, why: p.why })),
      });
      if (picks.length === 0) {
        untagged += unit.marks;
        continue;
      }
      const weight = picks.reduce((n, p) => n + p.w, 0);
      const seenKp = new Set<string>();
      for (const pick of picks) {
        const hit = lookupCode(pick.code)!;
        const share = (unit.marks * pick.w) / weight;
        const kp = kpMarks.get(hit.keyPoint.code) ?? { marks: 0, bands: noBands(), hit: false, where: [] };
        kp.marks += share;
        kp.bands[pick.band] += share;
        kp.hit = true;
        if (!seenKp.has(hit.keyPoint.code)) kp.where.push(where(result.number, unit.label));
        seenKp.add(hit.keyPoint.code);
        kpMarks.set(hit.keyPoint.code, kp);
        if (hit.point) pointMarks.set(hit.point.code, (pointMarks.get(hit.point.code) ?? 0) + share);
        topicMarks.set(hit.topic.code, (topicMarks.get(hit.topic.code) ?? 0) + share);
        bands[pick.band] += share;
        confidence[pick.conf] += share;
      }
    }
  }

  const electiveMarks = (code: ElectiveCode) =>
    SYLLABUS.topics.find((t) => t.code === code)!.keyPoints.some((kp) => kpMarks.get(kp.code)?.hit) ? (topicMarks.get(code) ?? 0) : -1;
  const found = (['EL1', 'EL2'] as const).filter((code) => electiveMarks(code) >= 0);
  const counted: ElectiveCode | null =
    found.length === 0 ? null
      : choice !== 'auto' && found.includes(choice) ? choice
        : found.length === 1 ? found[0]
          : electiveMarks('EL2') > electiveMarks('EL1') ? 'EL2' : 'EL1';

  const inScope = (topic: SyllabusTopic) => topic.part === 'compulsory' || topic.code === counted;
  const scopeHours = SYLLABUS.hours.compulsory + (counted ? SYLLABUS.hours.elective : 0);
  const breadth = { keyPoints: { hit: 0, of: 0 }, points: { hit: 0, of: 0 }, hours: { hit: 0, of: scopeHours } };

  const topics: TopicRow[] = [];
  for (const topic of SYLLABUS.topics) {
    const shown = inScope(topic) || found.includes(topic.code as ElectiveCode);
    if (!shown) continue;
    const counts = inScope(topic);
    const keyPoints = topic.keyPoints.map((kp): KeyPointRow => {
      const got = kpMarks.get(kp.code);
      const hours = keyPointHours(topic, kp);
      const points = kp.points.filter((p) => pointMarks.has(p.code)).map((p) => ({ code: p.code, en: p.en, zh: p.zh, marks: pointMarks.get(p.code)! }));
      if (counts) {
        breadth.keyPoints.of += 1;
        breadth.points.of += kp.points.length;
        breadth.points.hit += points.length;
        if (got?.hit) {
          breadth.keyPoints.hit += 1;
          breadth.hours.hit += hours;
        }
      }
      return { code: kp.code, en: kp.en, zh: kp.zh, hours, marks: got?.marks ?? 0, bands: got?.bands ?? noBands(), hit: !!got?.hit, points, where: got?.where ?? [] };
    });
    const marks = topicMarks.get(topic.code) ?? 0;
    const topicBands = noBands();
    for (const kp of keyPoints) for (const band of BANDS) topicBands[band] += kp.bands[band];
    topics.push({
      code: topic.code,
      en: topic.en,
      zh: topic.zh,
      elective: topic.part === 'elective',
      counted: counts,
      hours: topic.hours,
      hoursShare: counts ? topic.hours / scopeHours : null,
      marks,
      marksShare: total > 0 ? marks / total : null,
      bands: topicBands,
      keyPoints,
    });
  }
  for (const c of CONFIDENCES) confidence[c] = round(confidence[c]);

  return {
    syllabus: SYLLABUS.id,
    questions: sent,
    analysed: results.filter((r) => r.ok).length,
    marks: { total, untagged },
    missing: Math.max(0, sent - results.filter((r) => r.ok).length),
    elective: { found, counted },
    breadth,
    bands,
    confidence,
    topics,
    units,
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** 0.634 → "63%"; null → "—". */
export function percent(share: number | null): string {
  return share === null || !Number.isFinite(share) ? '—' : `${Math.round(share * 100)}%`;
}

/** Marks to one decimal, never false precision: 2 → "2", 0.6667 → "0.7". */
export function marksText(marks: number): string {
  const r = Math.round(marks * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
