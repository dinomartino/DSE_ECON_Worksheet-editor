/**
 * Frozen MC-question corpus (`src/test/corpus/v1-mcq.json`) and the optional Chinese
 * picture (`ImageBlock.srcZh`).
 *
 * Outside stores (DSE Mentor's app bank, the KP_ECON question bank) keep questions in this
 * editor's MC type and rely on "a saved file always opens". The corpus is written once by
 * `scripts/emit-v1-mcq-corpus.test.ts`. RULE: never regenerate it to make a test pass; a
 * failure here means a saved MC question just broke, so fix the code, not the file.
 */
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import mcqCorpus from '@/test/corpus/v1-mcq.json';
import { migrate } from '@/model/migrations';
import { parseWorksheet, stringifyWorksheet } from '@/storage/document';
import { renderWorksheet } from '@/render/worksheet';
import { exportDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { createImageBlock, createMcqQuestion } from '@/model/factories';
import { withFlow } from '@/test/fixtures';
import type { ImageBlock, McqQuestion, OutputMode, Worksheet } from '@/model/types';

const PATH = 'src/test/corpus/v1-mcq.json';
const EN: OutputMode = { language: 'en', version: 'teacher' };
const ZH: OutputMode = { language: 'zh', version: 'teacher' };
const BI: OutputMode = { language: 'bilingual', version: 'teacher' };

const mcqs = (w: Worksheet) => w.questions as McqQuestion[];

function images(nodes: unknown): ImageBlock[] {
  const found: ImageBlock[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const r = v as Record<string, unknown>;
      if (r.kind === 'image' && typeof r.src === 'string') found.push(r as unknown as ImageBlock);
      Object.values(r).forEach(walk);
    }
  };
  walk(nodes);
  return found;
}

describe('the frozen MC corpus still opens (never regenerate it)', () => {
  const open = () => migrate(structuredClone(mcqCorpus));

  it('opens editable with nothing unrecognised', () => {
    const w = open();
    expect(w.__unknown).toBeUndefined();
    expect(mcqs(w)).toHaveLength(3);
    expect(w.layout.map((l) => l.kind)).toEqual(['stimulus']);
  });

  it('keeps every field of every question', () => {
    const [q1, q2, q3] = mcqs(open());
    expect(q1.statements).toHaveLength(3);
    expect(q1.options).toHaveLength(4);
    expect(q1.answerIndex).toBe(1);
    expect(q1.explanation?.zh.length).toBeGreaterThan(0);
    expect(q1.tags).toEqual(['C.ped', 'price ceiling']);
    expect(q1.provenance?.en[0].text).toContain('DSE 2022');
    expect(q1.lineage?.fromDocId).toBe('doc-source');
    expect(q1.lineage?.rootId).toBeTruthy();
    expect(q2.blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'image']);
    expect(q2.options[1].blocks?.[0].kind).toBe('image');
    expect(q2.options[1].rationale).toBeDefined();
    const pic = q2.blocks[2] as ImageBlock;
    expect(pic.srcZh).toBe((mcqCorpus.questions[1].blocks[2] as { srcZh: string }).srcZh);
    expect(pic.srcZh).not.toBe(pic.src);
    expect(q3.answerIndex).toBe(3);
  });

  it('keeps the stimulus before the two questions it covers', () => {
    const w = open();
    expect(w.flow.map((f) => f.type)).toEqual(['question', 'layout', 'question', 'question']);
  });

  it('renders in every language and round-trips byte for byte', () => {
    for (const mode of [EN, ZH, BI]) expect(renderWorksheet(open(), mode).items.length).toBeGreaterThan(0);
    const raw = readFileSync(PATH, 'utf8');
    expect(stringifyWorksheet(parseWorksheet(raw))).toBe(raw.trimEnd());
  });
});

describe('a Chinese picture (ImageBlock.srcZh)', () => {
  const sheet = (withZh: boolean): Worksheet => {
    const pic = createImageBlock('data:image/png;base64,AAAA', 20, 10);
    if (withZh) pic.srcZh = 'data:image/png;base64,BBBB';
    const q = createMcqQuestion();
    q.blocks.push(pic);
    return withFlow(open0(), [q]);
  };
  const open0 = () => migrate({ ...JSON.parse(JSON.stringify(mcqCorpus)), questions: [], layout: [], flow: [] });
  const srcs = (w: Worksheet, mode: OutputMode) => [...new Set(images(renderWorksheet(w, mode)).map((i) => i.src))];

  it('survives save and reload', () => {
    const reloaded = parseWorksheet(stringifyWorksheet(sheet(true)));
    expect(reloaded.__unknown).toBeUndefined();
    expect((mcqs(reloaded)[0].blocks[1] as ImageBlock).srcZh).toBe('data:image/png;base64,BBBB');
  });

  it('the IR picks the Chinese source for Chinese output only', () => {
    const w = sheet(true);
    expect(srcs(w, ZH)).toEqual(['data:image/png;base64,BBBB']);
    expect(srcs(w, EN)).toEqual(['data:image/png;base64,AAAA']);
    expect(srcs(w, BI)).toEqual(['data:image/png;base64,AAAA']);
  });

  it('a document without the field renders identically in every language', () => {
    const w = sheet(false);
    for (const mode of [EN, ZH, BI]) expect(srcs(w, mode)).toEqual(['data:image/png;base64,AAAA']);
    expect(renderWorksheet(w, ZH)).toEqual(renderWorksheet(structuredClone(w), ZH));
  });

  it('does not change the stored document', () => {
    const w = sheet(true);
    renderWorksheet(w, ZH);
    expect((mcqs(w)[0].blocks[1] as ImageBlock).src).toBe('data:image/png;base64,AAAA');
  });

  it('the corpus picture reaches the .docx and the clipboard for Chinese output only', async () => {
    const w = migrate(structuredClone(mcqCorpus));
    const media = async (mode: OutputMode) => {
      const zip = await JSZip.loadAsync(await exportDocxBuffer(w, mode));
      const out: string[] = [];
      for (const name of Object.keys(zip.files).filter((n) => n.startsWith('word/media/') && !zip.files[n].dir)) {
        out.push((await zip.file(name)!.async('base64')).slice(0, 400));
      }
      return out;
    };
    const zhMedia = await media(ZH);
    const enMedia = await media(EN);
    expect(zhMedia).not.toEqual(enMedia);
    const zhPng = (mcqCorpus.questions[1].blocks[2] as { srcZh: string }).srcZh.split(',')[1];
    expect(zhMedia.some((b) => zhPng.startsWith(b) || b.startsWith(zhPng))).toBe(true);
    expect(enMedia.some((b) => zhPng.startsWith(b) || b.startsWith(zhPng))).toBe(false);
    const zhHtml = worksheetClipboardHtml(w, ZH);
    expect(zhHtml).toContain(zhPng);
    expect(worksheetClipboardHtml(w, EN)).not.toContain(zhPng);
  });
});
