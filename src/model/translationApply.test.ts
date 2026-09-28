import { describe, expect, it } from 'vitest';
import { diagramSize } from '@/render/diagram';
import { buildTranslateFixture } from '@/test/translateFixture';
import { mapDiagramTexts } from './diagramText';
import { createDiagramBlock, createWorksheet } from './factories';
import { bi, rt } from './text';
import type { TranslationWrite } from './textSlots';
import { collectTexts, mapWorksheetTexts } from './textWalk';
import { applyTranslationBatch } from './translationApply';
import type { DiagramBlock, McqQuestion, RichText, Worksheet } from './types';

const STEM = 'q:mcq1/blocks/b:mcq1-stem';

/** The kitchen sink with the stem's 中文 cleared: a fill to write. */
function withEmptyStem(zh: RichText = []): Worksheet {
  return mapWorksheetTexts(buildTranslateFixture(), (slot) => (slot.path === STEM ? { ...slot.text, zh } : slot.text));
}

const fill = (path: string, source: RichText, next: RichText, target: RichText = []): TranslationWrite => ({
  path, side: 'zh', sourceSnapshot: source, targetSnapshot: target, next,
});
const textAt = (ws: Worksheet, path: string) => collectTexts(ws).find((slot) => slot.path === path)!.text;

describe('applyTranslationBatch', () => {
  it('writes only the target side, normalised, with fresh runs', () => {
    const ws = withEmptyStem();
    const next: RichText = [{ text: '哪項' }, { text: '正確？' }];
    const { worksheet, report } = applyTranslationBatch(ws, [fill(STEM, rt('Which is correct?'), next)]);
    expect(report).toEqual({ applied: 1, skipped: [], resized: 0 });
    const text = textAt(worksheet, STEM);
    expect(text.zh).toEqual(rt('哪項正確？'));
    expect(text.en).toBe(textAt(ws, STEM).en);
    expect(text.zh[0]).not.toBe(next[0]);
    expect(worksheet.questions[1]).toBe(ws.questions[1]);
  });

  it('skips a changed source, a changed target and a vanished path, keeping identity', () => {
    const ws = withEmptyStem();
    const writes = [
      fill(STEM, rt('Which is right?'), rt('哪項？')),
      fill('q:mcq1/option:o1/text', rt('(1) only'), rt('只有(1)'), rt('舊')),
      fill('q:gone/blocks/b:x', rt('x'), rt('x')),
    ];
    const { worksheet, report } = applyTranslationBatch(ws, writes);
    expect(worksheet).toBe(ws);
    expect(report.applied).toBe(0);
    expect(report.skipped).toEqual([
      { path: STEM, reason: 'sourceChanged' },
      { path: 'q:mcq1/option:o1/text', reason: 'targetChanged' },
      { path: 'q:gone/blocks/b:x', reason: 'gone' },
    ]);
  });

  it('fills a side holding only whitespace, read as it was', () => {
    for (const blank of [rt(' '), rt('\n')]) {
      const ws = withEmptyStem(blank);
      const { worksheet, report } = applyTranslationBatch(ws, [fill(STEM, rt('Which is correct?'), rt('哪項正確？'), blank)]);
      expect(report.applied).toBe(1);
      expect(textAt(worksheet, STEM).zh).toEqual(rt('哪項正確？'));
    }
  });

  it('catches a statement reorder: the index now names another statement', () => {
    const ws = buildTranslateFixture();
    const mcq = ws.questions[0] as McqQuestion;
    mcq.statements = [bi('Price rises', ''), bi('Output falls', '')];
    const write = fill('q:mcq1/statements/1', rt('Output falls'), rt('產量下降'));
    const reordered = { ...ws, questions: [{ ...mcq, statements: [...mcq.statements].reverse() }, ...ws.questions.slice(1)] };
    const { worksheet, report } = applyTranslationBatch(reordered, [write]);
    expect(worksheet).toBe(reordered);
    expect(report.skipped).toEqual([{ path: 'q:mcq1/statements/1', reason: 'sourceChanged' }]);
  });
});

describe('applyTranslationBatch: diagram size', () => {
  /** An English-only copy of a template, stored at `size` (its bilingual measure by default). */
  function englishOnly(
    size?: { widthPx: number; heightPx: number },
    original = createDiagramBlock('supply-demand'),
  ): { ws: Worksheet; original: DiagramBlock } {
    const diagram = mapDiagramTexts(original.diagram, (_, text) => ({ en: text.en, zh: [] }));
    const block: DiagramBlock = { ...original, id: 'fig', diagram, ...(size ?? diagramSize(diagram, original.widthPx, 'bilingual')) };
    const ws = createWorksheet();
    ws.questions = [{ id: 'q', type: 'structured', blocks: [block], parts: [] }];
    return { ws, original };
  }
  /** Fill every diagram slot's 中文 from the template it came from. */
  function fillAll(ws: Worksheet, original: DiagramBlock, only?: (path: string) => boolean): TranslationWrite[] {
    const zh = new Map<string, RichText>();
    mapDiagramTexts(original.diagram, (segment, text) => (zh.set(segment, text.zh), text));
    return collectTexts(ws)
      .filter((slot) => slot.diagramPath && slot.kind !== 'altText' && (!only || only(slot.path)))
      .map((slot) => fill(slot.path, slot.text.en, zh.get(slot.path.replace('q:q/blocks/b:fig/d/', ''))!));
  }
  const block = (ws: Worksheet) => ws.questions[0].blocks[0] as DiagramBlock;

  it('filling 中文 into an English-only diagram grows it to its bilingual measure', () => {
    const { ws, original } = englishOnly();
    const { worksheet, report } = applyTranslationBatch(ws, fillAll(ws, original));
    const after = block(worksheet);
    expect(report.resized).toBe(1);
    expect({ widthPx: after.widthPx, heightPx: after.heightPx }).toEqual(diagramSize(after.diagram, after.widthPx, 'bilingual'));
    expect(after.heightPx).toBeGreaterThan(block(ws).heightPx);
  });

  it('whatever mode the box was last sized in, a fill lands on the bilingual size', () => {
    const { ws: bare, original } = englishOnly();
    const enSized = englishOnly(diagramSize(block(bare).diagram, original.widthPx, 'en'), original).ws;
    expect(block(enSized).heightPx).toBeLessThan(original.heightPx);
    const { worksheet } = applyTranslationBatch(enSized, fillAll(enSized, original));
    expect(block(worksheet).heightPx).toBe(original.heightPx);
  });

  it('keeps a stored size when the text needs no new room', () => {
    const legacy = { widthPx: 400, heightPx: 999 };
    const { ws, original } = englishOnly(legacy);
    // A curve label sits inside the plot: the bilingual measure does not move.
    const writes = fillAll(ws, original, (path) => path.includes('/curve:'));
    expect(writes.length).toBeGreaterThan(0);
    const { worksheet, report } = applyTranslationBatch(ws, writes);
    expect(report.applied).toBe(writes.length);
    expect(report.resized).toBe(0);
    expect(block(worksheet)).toMatchObject(legacy);
    expect(block(worksheet).diagram).not.toBe(block(ws).diagram);
  });

  it('never resizes a cropped diagram', () => {
    const { ws, original } = englishOnly();
    const cropped = { ...block(ws), diagram: { ...block(ws).diagram, crop: { left: 10, top: 10, right: 10, bottom: 10 } } };
    ws.questions[0].blocks = [cropped];
    const { worksheet, report } = applyTranslationBatch(ws, fillAll(ws, original));
    expect(report.resized).toBe(0);
    expect(block(worksheet)).toMatchObject({ widthPx: cropped.widthPx, heightPx: cropped.heightPx });
  });
});
