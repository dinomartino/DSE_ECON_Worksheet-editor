#!/usr/bin/env node
/**
 * Copies DSEcon Mentor's MCQ topic list into `src/model/mcqTopics.ts` (k-0569).
 *
 * Mentor is the source: `src/lib/mcq-syllabus.ts` (`SYLLABUS_SECTIONS`: sections A–J, each
 * topic's frozen `key`, `en`, `zh`, in the site's order) and `src/lib/question-bank/topics.ts`
 * (`TOPIC_CODES`: each key's EDB codes). Only those public names and codes are copied.
 *
 *   node scripts/sync-mcq-topics.mjs [path/to/DSE_Mentor]     # rewrite the copy
 *   node scripts/sync-mcq-topics.mjs --check [path]           # exit 1 when it drifted
 *
 * `src/model/mcqTopics.test.ts` runs the same check whenever Mentor sits beside this repo.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = join(HERE, '../src/model/mcqTopics.ts');
const SYLLABUS = 'src/lib/mcq-syllabus.ts';
const CODES = 'src/lib/question-bank/topics.ts';

/** Mentor beside this repo: from the main checkout, or from a worktree under `.claude/worktrees/`. */
export function findMentor(start = HERE) {
  for (const up of ['../..', '../../../../..']) {
    const dir = resolve(start, up, 'DSE_Mentor');
    if (existsSync(join(dir, SYLLABUS)) && existsSync(join(dir, CODES))) return dir;
  }
  return undefined;
}

const unquote = (s) => s.replace(/\\'/g, "'");

/** Sections with their topics and each topic's EDB codes, read from Mentor's two files. */
export function readMentorTopics(mentorDir) {
  const syllabus = readFileSync(join(mentorDir, SYLLABUS), 'utf8');
  const codesSource = readFileSync(join(mentorDir, CODES), 'utf8');
  const start = syllabus.indexOf('SYLLABUS_SECTIONS');
  if (start < 0) throw new Error('SYLLABUS_SECTIONS not found');
  const body = syllabus.slice(start);
  const sections = [];
  const sectionRe = /key:\s*'([A-J])',\s*nameEn:\s*'((?:[^'\\]|\\.)*)',\s*nameZh:\s*'((?:[^'\\]|\\.)*)'[\s\S]*?topics:\s*\[([\s\S]*?)\]\s*,?\s*\}/g;
  for (const m of body.matchAll(sectionRe)) {
    const topics = [];
    const topicRe = /\{\s*en:\s*'((?:[^'\\]|\\.)*)',\s*zh:\s*'((?:[^'\\]|\\.)*)',\s*key:\s*'([a-z0-9-]+)'\s*\}/g;
    for (const t of m[4].matchAll(topicRe)) topics.push({ key: t[3], en: unquote(t[1]), zh: unquote(t[2]) });
    sections.push({ key: m[1], en: unquote(m[2]), zh: unquote(m[3]), topics });
  }
  const codesStart = codesSource.indexOf('TOPIC_CODES');
  const codesBody = codesSource.slice(codesStart, codesSource.indexOf('\n}', codesStart));
  const codes = new Map();
  for (const m of codesBody.matchAll(/'([a-z0-9-]+)':\s*\[([^\]]*)\]/g)) {
    codes.set(m[1], [...m[2].matchAll(/'([^']+)'/g)].map((c) => c[1]));
  }
  const keys = sections.flatMap((s) => s.topics.map((t) => t.key));
  if (sections.length !== 10) throw new Error(`expected sections A–J, read ${sections.length}`);
  if (new Set(keys).size !== keys.length) throw new Error('a topic key is listed twice');
  for (const key of keys) if (!codes.get(key)?.length) throw new Error(`no EDB codes for ${key}`);
  for (const key of codes.keys()) if (!keys.includes(key)) throw new Error(`EDB codes for unknown key ${key}`);
  for (const s of sections) for (const t of s.topics) t.edb = codes.get(t.key);
  return sections;
}

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The module text: data only, one row per topic, in Mentor's order. */
export function renderModule(sections) {
  const lines = [
    '/**',
    " * DSEcon Mentor's MCQ topics (k-0569): the list the site's MCQ section, /class and the",
    " * by-topic past papers use. **Generated** by `scripts/sync-mcq-topics.mjs` from Mentor's",
    ' * `src/lib/mcq-syllabus.ts` and `src/lib/question-bank/topics.ts`; do not edit by hand.',
    " * Keys are frozen on Mentor's side (never renamed, only added); names may change.",
    ' * `edb` = the EDB C&A codes (`model/topics.ts`) each topic stands for.',
    ' */',
    '',
    'export interface McqTopicRow {',
    '  key: string;',
    '  en: string;',
    '  zh: string;',
    '  edb: readonly string[];',
    '}',
    '',
    'export interface McqSectionRow {',
    "  /** 'A'…'J'. */",
    '  key: string;',
    '  en: string;',
    '  zh: string;',
    '  topics: readonly McqTopicRow[];',
    '}',
    '',
    'export const MCQ_SECTION_ROWS: readonly McqSectionRow[] = [',
  ];
  for (const s of sections) {
    lines.push(`  {`, `    key: ${q(s.key)},`, `    en: ${q(s.en)},`, `    zh: ${q(s.zh)},`, `    topics: [`);
    for (const t of s.topics) {
      lines.push(`      { key: ${q(t.key)}, en: ${q(t.en)}, zh: ${q(t.zh)}, edb: [${t.edb.map(q).join(', ')}] },`);
    }
    lines.push(`    ],`, `  },`);
  }
  lines.push('];', '');
  return lines.join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dir = args.find((a) => !a.startsWith('--')) ?? findMentor();
  if (!dir) {
    console.error('DSE_Mentor not found beside this repo; pass its path.');
    process.exit(2);
  }
  const text = renderModule(readMentorTopics(dir));
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (check) {
    if (text !== current) {
      console.error('src/model/mcqTopics.ts differs from DSEcon Mentor: run node scripts/sync-mcq-topics.mjs');
      process.exit(1);
    }
    console.log('mcqTopics.ts matches DSEcon Mentor.');
  } else if (text === current) {
    console.log('mcqTopics.ts already matches DSEcon Mentor.');
  } else {
    writeFileSync(OUT, text);
    console.log(`Wrote ${OUT}`);
  }
}
