import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportDocxBuffer } from '@/export/docx';
import { questionClipboardHtml, worksheetClipboardHtml } from '@/export/clipboard';
import { renderWorksheet } from '@/render/worksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { TOPICS } from '@/model/topics';
import type { OutputMode, StructuredQuestion } from '@/model/types';
import { freeTagIssue } from '@/model/patterns';
import { filterTopics, freeTagMessage } from './TopicRow';

const MODES: OutputMode[] = [
  { language: 'bilingual', version: 'teacher' },
  { language: 'en', version: 'student' },
];
const MARKERS = ['C.ped', 'zz-free-tag-zz', 'zz-class-zz', 'zz-pattern-zz', '題型'];

function tagged() {
  const worksheet = buildAcceptanceWorksheet();
  return {
    ...worksheet,
    classes: ['zz-class-zz'],
    satOn: '2025-11-03',
    questions: worksheet.questions.map((question, index) =>
      index === 0 ? { ...question, tags: ['C.ped', 'C.ped::zz-pattern-zz', 'zz-free-tag-zz'] } : question,
    ),
  };
}

describe('topic tags and 題型 never print', () => {
  it('are absent from the IR, the .docx and the clipboard HTML', async () => {
    const worksheet = tagged();
    for (const mode of MODES) {
      const ir = JSON.stringify(renderWorksheet(worksheet, mode));
      const html = worksheetClipboardHtml(worksheet, mode);
      const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
      const xml = await zip.file('word/document.xml')!.async('string');
      for (const marker of MARKERS) {
        expect(ir, `ir ${marker}`).not.toContain(marker);
        expect(html, `html ${marker}`).not.toContain(marker);
        expect(xml, `docx ${marker}`).not.toContain(marker);
      }
    }
  });
});

describe('topics per part never print', () => {
  it('a question with part and sub-part topics and roots prints exactly as without them', async () => {
    const plain = buildAcceptanceWorksheet();
    const index = plain.questions.findIndex((q) => ((q as StructuredQuestion).parts ?? []).some((part) => part.subParts?.length));
    expect(index).toBeGreaterThanOrEqual(0);
    const source = plain.questions[index] as StructuredQuestion;
    const taggedQ: StructuredQuestion = {
      ...source,
      parts: source.parts.map((part, i) => ({
        ...part,
        tags: ['C.ped', 'C.ped::zz-pattern-zz'],
        rootId: `zz-root-${i}`,
        subParts: part.subParts?.map((sub, j) => ({ ...sub, tags: ['D'], rootId: `zz-root-${i}.${j}` })),
      })),
    };
    const tagged = { ...plain, questions: plain.questions.map((q, i) => (i === index ? taggedQ : q)) };
    for (const mode of MODES) {
      expect(JSON.stringify(renderWorksheet(tagged, mode))).toBe(JSON.stringify(renderWorksheet(plain, mode)));
      expect(worksheetClipboardHtml(tagged, mode)).toBe(worksheetClipboardHtml(plain, mode));
      expect(questionClipboardHtml(tagged, taggedQ.id, mode)).toBe(questionClipboardHtml(plain, source.id, mode));
      const xml = async (w: typeof plain) =>
        (await JSZip.loadAsync(await exportDocxBuffer(w, mode))).file('word/document.xml')!.async('string');
      const taggedXml = await xml(tagged);
      expect(taggedXml).toBe(await xml(plain));
      expect(taggedXml).not.toContain('zz-');
    }
  });
});

describe('editing tags', () => {
  beforeEach(() => {
    useWorksheetStore.setState({
      worksheet: buildAcceptanceWorksheet(),
      past: [],
      future: [],
      dirty: false,
    });
  });

  it('is one undo step per edit', () => {
    const store = () => useWorksheetStore.getState();
    const id = store().worksheet.questions[0].id;
    store().updateQuestion(id, { tags: ['C.ped'] });
    store().updateQuestion(id, { tags: ['C.ped', 'free'] });
    expect(store().worksheet.questions[0].tags).toEqual(['C.ped', 'free']);
    store().undo();
    expect(store().worksheet.questions[0].tags).toEqual(['C.ped']);
    store().undo();
    expect(store().worksheet.questions[0].tags).toBeUndefined();
  });
});

describe('topic picker filter', () => {
  it('lists every coarse topic when empty', () => {
    expect(filterTopics('')).toHaveLength(TOPICS.length);
  });

  it('matches code and English, keeping the parent of a matching child', () => {
    const byCode = filterTopics('c.ped');
    expect(byCode[0].topic.code).toBe('C');
    expect(byCode[0].children.map((child) => child.code)).toEqual(['C.ped']);
    const byName = filterTopics('elasticity of demand');
    expect(byName.some(({ children }) => children.some((child) => child.code === 'C.ped'))).toBe(true);
    expect(filterTopics('zzzz')).toEqual([]);
  });

  it('matches 中文', () => {
    const zh = TOPICS[0].zh.slice(0, 2);
    expect(filterTopics(zh).some(({ topic }) => topic.code === TOPICS[0].code)).toBe(true);
  });
});

describe('a typed tag in a reserved form is refused, in plain words', () => {
  it.each([
    ['K', 'code'],
    ['SBA::x', 'separator'],
    ['@star', 'system'],
  ] as const)('%s', (typed, issue) => {
    expect(freeTagIssue(typed)).toBe(issue);
    const message = freeTagMessage(issue, typed);
    expect(message).not.toMatch(/[—–]/);
    expect(message.length).toBeLessThan(110);
  });

  it('lets a plain word or a listed code through', () => {
    expect(freeTagIssue('mock 2025')).toBeUndefined();
    expect(freeTagIssue('C.ped')).toBeUndefined();
  });
});

