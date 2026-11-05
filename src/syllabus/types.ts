/**
 * The HKDSE Economics syllabus as the coverage check reads it (k-0317). Codes: a topic is
 * `A`–`J` or `EL1`/`EL2` (as `model/topics.ts`), a key point `C.ped` (a topics.ts sub-topic
 * code), a point `C.ped#arc`. The `#` keeps a point code from ever parsing as a tag.
 */
export interface SyllabusPoint {
  code: string;
  en: string;
  zh: string;
}

export interface SyllabusKeyPoint {
  code: string;
  en: string;
  zh: string;
  /** The guide's "NOT required" limits, summarised in English. */
  notRequired: string[];
  points: SyllabusPoint[];
}

export interface SyllabusTopic {
  code: string;
  part: 'compulsory' | 'elective';
  en: string;
  zh: string;
  /** Suggested lesson hours (guide p. 23). */
  hours: number;
  keyPoints: SyllabusKeyPoint[];
}

export interface SyllabusData {
  id: string;
  hours: { compulsory: number; elective: number };
  topics: SyllabusTopic[];
}
