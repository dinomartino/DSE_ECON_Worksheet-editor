/**
 * Hand-run harness (k-0494): the import check on real files, both doors, written to a
 * folder outside the repo. Real paper text never enters the repo; files are named on the
 * command line:
 *
 *   IMPORT_PROBE="/path/a.docx;/path/b.docx" IMPORT_PROBE_OUT=/tmp/check \
 *     npx vitest run scripts/import-check-probe.test.ts
 *
 * For each file: the review's check (what the import review lists), every safe fix applied
 * and checked again, then the same paper as an open document (✦ AI → Check import) with a
 * few hand-made import faults planted, to show the paper door finds and fixes them.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { analyseLines, buildImport, readDocx, readPdf, isPdfReadError, type ReadPaste } from '@/import';
import { createWorksheet } from '@/model/factories';
import type { McqQuestion, Question } from '@/model/types';
import { findingText } from '@/importCheck/text';
import { applyOps } from '@/importCheck/ops';
import { batchWithFixes, checkPaper, checkReview, materializeBatch, safeFixes } from '@/importCheck/run';
import type { ImportFinding } from '@/importCheck/types';

const files = (process.env.IMPORT_PROBE ?? '').split(';').filter(Boolean);
const out = process.env.IMPORT_PROBE_OUT ?? '/tmp/import-check-probe';
const MAX = 605;

async function read(file: string): Promise<ReadPaste> {
  const bytes = readFileSync(file);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  if (/\.pdf$/i.test(file)) {
    const r = await readPdf(buf);
    if (isPdfReadError(r)) throw new Error(`${file}: ${r.kind}`);
    return r;
  }
  return readDocx(buf);
}

const line = (f: ImportFinding) =>
  `Q${f.q + 1}${f.place ? ` ${f.place}` : ''} [${f.kind}${f.safe ? ', safe' : ''}${f.fix ? ('pins' in f.fix ? ', fix: pins' : `, fix: ${f.fix.op.op}`) : ''}] ${findingText('en', f)}${f.before !== undefined ? `\n      before: ${f.before}` : ''}${f.after !== undefined ? `\n      after:  ${f.after}` : ''}`;

it('import check probe', async () => {
  mkdirSync(out, { recursive: true });
  for (const file of files) {
    const name = path.basename(file);
    const r = await read(file);
    const analysis = analyseLines(r);
    const batch = buildImport(analysis);
    const report: string[] = [`# ${name}: ${batch.builds.length} questions`];

    // 1. The review's check.
    const found = checkReview(analysis, batch, batch, { maxWidthPx: MAX });
    report.push(`\n## Import review: ${found.length} findings, ${safeFixes(found).length} safe fixes`, ...found.map(line));
    const ops = safeFixes(found).flatMap((f) => (f.fix && 'op' in f.fix ? [f.fix.op] : []));
    const fixed = batchWithFixes(batch, ops);
    const again = checkReview(analysis, batch, fixed.batch, { maxWidthPx: MAX });
    report.push(`\n## After Apply all safe fixes (${ops.length} applied, ${fixed.stale} no longer fit): ${again.length} findings left`, ...again.map(line));

    // 2. The same paper saved and checked as an open document, with faults planted.
    const questions = materializeBatch(fixed.batch);
    const planted = plant(questions);
    const worksheet = { ...createWorksheet(), questions: planted.questions, flow: planted.questions.map((q) => ({ type: 'question' as const, id: q.id })) };
    const paper = checkPaper(worksheet, { name, read: r, analysis }, { maxWidthPx: MAX });
    report.push(`\n## Open paper, ${planted.notes.length} faults planted (${planted.notes.join('; ')}): ${paper.findings.length} findings`, ...paper.findings.map(line));
    const paperOps = paper.findings.filter((f) => f.fix && 'op' in f.fix && f.from === 'check').flatMap((f) => (f.fix && 'op' in f.fix ? [f.fix.op] : []));
    const after = applyOps(paper.input.paper, paperOps);
    const ws2 = { ...worksheet, questions: after.questions };
    const left = checkPaper(ws2, { name, read: r, analysis }, { maxWidthPx: MAX }).findings;
    report.push(`\n## Open paper after applying every offered fix (${after.applied} applied, ${after.stale} stale): ${left.length} left`, ...left.map(line));
    writeFileSync(path.join(out, `${name}.check.txt`), report.join('\n'));
  }
}, 120_000);

/** Faults an import can leave, put into a copy of good questions. */
function plant(questions: Question[]): { questions: Question[]; notes: string[] } {
  const qs = questions.map((q) => structuredClone(q));
  const notes: string[] = [];
  const mc = qs.findIndex((q) => q.type === 'mcq' && (q as McqQuestion).options.length === 4);
  if (mc !== -1) {
    const q = qs[mc] as McqQuestion;
    const side = q.options[0].text.en.length ? 'en' : 'zh';
    const text = (k: number) => q.options[k].text[side].map((r) => r.text).join('');
    q.options = [{ ...q.options[0], text: { ...q.options[0].text, [side]: [{ text: `${text(0)}  B. ${text(1)}` }] } }, { ...q.options[2] }, { ...q.options[3] }];
    notes.push(`Q${mc + 1} options A+B merged`);
  }
  const para = qs.findIndex((q, k) => k > mc && q.blocks[0]?.kind === 'paragraph');
  if (para !== -1) {
    const b = qs[para].blocks[0];
    if (b.kind === 'paragraph') {
      const side = b.text.en.length ? 'en' : 'zh';
      qs[para].blocks = [{ ...b, text: { ...b.text, [side]: [...b.text[side], { text: ' - 3 -' }] } }, { kind: 'paragraph', id: 'junk1', text: { en: [{ text: 'Go on to the next page' }], zh: [] } }, ...qs[para].blocks.slice(1)];
      notes.push(`Q${para + 1} "Go on to the next page" paragraph`);
    }
  }
  const sq = qs.findIndex((q) => q.type === 'structured' && 'parts' in q && q.parts.length > 0 && q.parts[0].marks !== undefined);
  if (sq !== -1 && qs[sq].type === 'structured') {
    const q = qs[sq] as Extract<Question, { type: 'structured' }>;
    const p = q.parts[0];
    q.parts = [{ ...p, marks: undefined }, ...q.parts.slice(1)];
    notes.push(`Q${sq + 1}(a) marks removed`);
  }
  const zh = qs.findIndex((q, k) => k !== mc && k !== para && q.type === 'mcq');
  if (zh !== -1) {
    const q = qs[zh] as McqQuestion;
    const first = q.blocks[0];
    if (first?.kind === 'paragraph') {
      q.blocks = [{ ...first, text: { en: [{ text: `${first.text.en.map((r) => r.text).join('')} P\uf0ae Q` }], zh: [] } }, ...q.blocks.slice(1)];
      notes.push(`Q${zh + 1} a Symbol-font arrow`);
    }
  }
  return { questions: qs, notes };
}
