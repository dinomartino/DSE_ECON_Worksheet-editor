/**
 * Hand-run harness (k-0480): import real files and dump what the importer made, to a
 * folder outside the repo. Real paper text never enters the repo; the files are named on
 * the command line through env vars:
 *
 *   IMPORT_PROBE="/path/a.pdf;/path/b.docx" IMPORT_PROBE_OUT=/tmp/probe \
 *     npx vitest run scripts/import-probe.test.ts
 *
 * `IMPORT_PROBE_ANSWERS` (optional, same order, `;`-separated, empty = none) pairs each
 * paper with an answer file run through `readAnswerSheet` + `matchAnswers`.
 *
 * A scan: name a folder `ocr:<dir>` holding `p01.json`… (the shell's OCR output, e.g.
 * from `scripts/ocr-pages.py`) and, beside them in `<dir>/png/`, the pages rendered at
 * 200 DPI as `p-01.png`…; the app's own `recognisePages` reads them, pictures cropped
 * with sharp as the desktop app crops them.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { analyseLines, buildImport, isPdfReadError, matchAnswers, readAnswerSheet, readDocx, readPdf } from '@/import';
import type { ReadPaste } from '@/import';
import type { ContentBlock, InlineRun, StructuredQuestion, McqQuestion, Question } from '@/model/types';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { createWorksheet } from '@/model/factories';
import { getQuestionType } from '@/registry';

const files = (process.env.IMPORT_PROBE ?? '').split(';').filter(Boolean);
const answers = (process.env.IMPORT_PROBE_ANSWERS ?? '').split(';');
const out = process.env.IMPORT_PROBE_OUT ?? '/tmp/import-probe';

async function ocrRead(dir: string): Promise<ReadPaste> {
  const { readdirSync, existsSync } = await import('node:fs');
  const { recognisePages } = await import('@/components/import/scanImport');
  const sharp = (await import('sharp')).default;
  const jsons = readdirSync(dir).filter((f) => /^p\d+\.json$/.test(f)).sort();
  const results = jsons.map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
  let at = 0;
  const engine = { status: async () => ({ available: true, engine: 'replay', version: '0' }), read: async () => results[at++] };
  async function* pages() {
    for (const [k] of jsons.entries()) {
      const png = path.join(dir, 'png', `p-${String(k + 1).padStart(2, '0')}.png`);
      yield { png: existsSync(png) ? new Uint8Array(readFileSync(png)) : new Uint8Array(), page: k + 1, pages: jsons.length, scale: 200 / 72 };
    }
  }
  const raster = async (png: Uint8Array) => {
    if (!png.length) return undefined;
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return {
      width: info.width,
      height: info.height,
      rgba: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      crop: async (box: { x: number; y: number; w: number; h: number }) => {
        const left = Math.max(0, Math.round(box.x));
        const top = Math.max(0, Math.round(box.y));
        const width = Math.max(1, Math.min(info.width - left, Math.round(box.w)));
        const height = Math.max(1, Math.min(info.height - top, Math.round(box.h)));
        const out = await sharp(png).extract({ left, top, width, height }).png().toBuffer();
        return new Blob([new Uint8Array(out)], { type: 'image/png' });
      },
      close: () => undefined,
    };
  };
  const prepareImage = async (blob: Blob) => {
    const buf = Buffer.from(await blob.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const w = Math.round((meta.width ?? 300) / (200 / 96));
    const h = Math.round((meta.height ?? 200) / (200 / 96));
    return { src: `data:image/png;base64,${buf.toString('base64')}`, widthPx: w, heightPx: h, naturalWidthPx: meta.width, naturalHeightPx: meta.height };
  };
  const result = await recognisePages(pages(), engine as never, { prepareImage, raster: raster as never });
  if (result.kind !== 'ok') throw new Error(`${dir}: ${result.kind}`);
  return result.read;
}

async function read(file: string): Promise<ReadPaste> {
  if (file.startsWith('ocr:')) return ocrRead(file.slice(4));
  const bytes = readFileSync(file);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  if (/\.pdf$/i.test(file)) {
    const r = await readPdf(buf);
    if (isPdfReadError(r)) throw new Error(`${file}: ${r.kind}`);
    return r;
  }
  return readDocx(buf);
}

const t = (runs: readonly InlineRun[] | undefined, n = 70) => {
  const s = (runs ?? []).map((r) => r.text).join('').replace(/\n/g, '⏎');
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const bt = (b: { en: InlineRun[]; zh: InlineRun[] }, n = 70) => t(b.en.length ? b.en : b.zh, n);

function blocks(list: readonly ContentBlock[] | undefined, pad: string): string[] {
  return (list ?? []).flatMap((b): string[] => {
    switch (b.kind) {
      case 'paragraph':
        return [`${pad}¶ ${bt(b.text)}`];
      case 'table':
        return [`${pad}▦ table ${b.rows.length}×${b.rows[0]?.cells.length ?? 0}: ${b.rows[0]?.cells.map((c) => bt(c.text, 18)).join(' | ')}`];
      case 'source':
        return [`${pad}◇ SOURCE "${b.label ? bt(b.label) : ""}"`, ...blocks(b.blocks, `${pad}    `)];
      case 'image':
        return [`${pad}▣ image ${b.widthPx}×${b.heightPx}`];
      default:
        return [`${pad}${b.kind}`];
    }
  });
}

function dumpScheme(scheme: MarkScheme | undefined, answer: { en: InlineRun[]; zh: InlineRun[] } | undefined, pad: string): string[] {
  const out: string[] = [];
  if (answer) out.push(`${pad}ANSWER ${bt(answer, 90)}`);
  if (!scheme) return out;
  out.push(`${pad}SCHEME${scheme.display ? ` display=${scheme.display}` : ''}${scheme.contentMax !== undefined ? ` contentMax=${scheme.contentMax}` : ''}${scheme.ec ? ` EC max ${scheme.ec.max} rows ${scheme.ec.descriptors.map((d) => `${d.marks}:${bt(d.text, 30)}`).join(' / ')}` : ''}${scheme.levels ? ` levels ${scheme.levels.map((l) => `${l.min}-${l.max}`).join(',')}` : ''}`);
  scheme.routes.forEach((r, ri) => {
    if (ri) out.push(`${pad}  OR`);
    for (const g of r.groups) {
      out.push(`${pad}  group${g.heading ? ` "${bt(g.heading, 50)}"` : ''}${g.each !== undefined ? ` ${g.each}@` : ''}${g.take !== undefined ? ` take ${g.take}${g.firstOnly ? ' first' : ''}` : ''}${g.max !== undefined ? ` max ${g.max}` : ''}`);
      for (const pt of g.points) out.push(`${pad}    • ${bt(pt.text, 80)}${pt.marks !== undefined ? ` (${pt.marks})` : ''}`);
    }
  });
  return out;
}

function dumpQuestion(q: Question, k: number): string[] {
  const lines = [`Q${k + 1} [${q.type}]`];
  if (q.type === 'mcq') {
    const m = q as McqQuestion;
    lines.push(...blocks(m.blocks, '  '), ...m.options.map((o, j) => `  ${'ABCD'[j]}.${j === m.answerIndex ? '*' : ' '}${bt(o.text, 50)}`));
    if (m.explanation) lines.push(`  EXPL ${bt(m.explanation, 80)}`);
    return lines;
  }
  const s = q as StructuredQuestion;
  lines.push(...blocks(s.blocks, '  '));
  if (!s.parts.length) lines.push(`  LEAF marks=${s.marks ?? '-'}`, ...dumpScheme(s.scheme, s.answer, '  '));
  for (const p of s.parts) {
    if (p.blocksBefore?.length) lines.push(...blocks(p.blocksBefore, '  before: '));
    lines.push(`  PART marks=${p.marks ?? '-'} space=${p.answerSpace ?? '-'}${p.scheme ? ` scheme(${p.scheme.routes.length}r)` : ''}${p.answer ? ' answer' : ''}`);
    lines.push(...blocks(p.blocks, '    '));
    lines.push(...dumpScheme(p.scheme, p.answer, '    '));
    for (const sp of p.subParts ?? []) {
      lines.push(`    SUB marks=${sp.marks ?? '-'}${sp.scheme ? ' scheme' : ''}`);
      lines.push(...blocks(sp.blocks, '      '));
      lines.push(...dumpScheme(sp.scheme, sp.answer, '      '));
    }
  }
  return lines;
}

it('probes real imports', async () => {
  mkdirSync(out, { recursive: true });
  for (const [n, file] of files.entries()) {
    const read0 = await read(file);
    let analysis = analyseLines(read0);
    const answerFile = answers[n];
    if (answerFile) {
      const sheet = readAnswerSheet(await read(answerFile));
      const sheetReport = [
        `# sheet ${answerFile} kind=${sheet.kind} entries=${sheet.entries.length} sections=${sheet.sections.map((x) => `${x.index}:${x.key ?? ''}/${x.paper ?? ''}`).join(' ')}`,
        ...sheet.entries.map((e) => `${e.sectionIndex}| ${e.question}${e.part ? `(${e.part})` : ''}${e.subPart ? `(${e.subPart})` : ''}${e.letter !== undefined ? ` ${'ABCDE'[e.letter]}` : ''}${e.percent !== undefined ? ` ${e.percent}%` : ''} m=${e.marks ?? '-'}${e.each !== undefined ? ` ${e.each}@` : ''}${e.max !== undefined ? ` max${e.max}` : ''}${e.paragraph ? ' ¶' : ''}${e.contentMax !== undefined ? ` content${e.contentMax}` : ''}${e.ec ? ` EC${e.ec.max}[${e.ec.rows.map((r) => r.marks).join(',')}]` : ''} pts=${e.points?.length ?? 0} notes=${e.notes?.length ?? 0}${(e.groups ?? []).map((g) => ` {${g.heading ? t(g.heading, 30) : '-'}${g.each !== undefined ? ` ${g.each}@` : ''}${g.take !== undefined ? ` take${g.take}` : ''}${g.max !== undefined ? ` max${g.max}` : ''}}`).join('')}`),
        `comments: ${sheet.comments?.length ?? 0}`,
        ...(sheet.comments ?? []).slice(0, 60).map((c) => `  [${c.paper ?? '-'}] ${t(c.runs, 110)}`),
        '## lines',
        ...sheet.lines.map((l) => `${String(l.i).padStart(4)} ${sheet.uses[l.i].padEnd(8)} ${l.label ?? ''} ${l.cells ? `{${l.cells.map((c) => t(c, 20)).join(' | ')}}` : t(l.runs, 110)}`),
      ];
      writeFileSync(path.join(out, `${path.basename(file)}.sheet.txt`), sheetReport.join('\n'));
      const match = matchAnswers(analysis, sheet);
      analysis = analyseLines(read0, { pins: match.pins });
      writeFileSync(
        path.join(out, `${path.basename(file)}.match.txt`),
        [
          `sections ${JSON.stringify(match.sections)} unused ${match.unused.length} pins ${match.pins.length}`,
          ...match.report.map((r) => `${r.status} q${r.question ?? '-'} ${r.detail ?? ''} entries ${r.entries.join(',')}`),
        ].join('\n'),
      );
    }
    const batch = buildImport(analysis);
    const ws = createWorksheet();
    const qs = batch.builds.map((b) => b.fill(getQuestionType(b.typeId)!.create()) as Question);
    const report = [
      `# ${path.basename(file)}  source=${analysis.source} kind=${analysis.kind} lines=${analysis.lines.length} questions=${qs.length}`,
      `numbers: ${analysis.outline.questions.map((q) => q.number ?? '?').join(' ')}`,
      `flags: ${analysis.flags.map((f) => `${f.kind}@${f.line}`).join(' ')}`,
      ...qs.flatMap(dumpQuestion),
      '',
      '## lines',
      ...analysis.lines.map((l, i) => `${String(i).padStart(4)} ${analysis.roles[i].role.padEnd(10)} p${l.page ?? '-'} x${l.x !== undefined ? Math.round(l.x) : '-'} ${l.label ?? ''} ${l.trailingMarks !== undefined ? `[${l.trailingMarks}m] ` : ''}${l.cells ? `{${l.cells.length} cells} ` : ''}${t(l.runs, 100)}`),
    ];
    void ws;
    writeFileSync(path.join(out, `${path.basename(file)}.txt`), report.join('\n'));
    writeFileSync(path.join(out, `${path.basename(file)}.batch.json`), JSON.stringify({ questions: qs, lead: batch.lead, results: (batch as { results?: unknown }).results }, null, 1));
  }
}, 600_000);
