import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { renderWorksheet } from '@/render/worksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { TOPICS } from '@/model/topics';
import type { OutputMode } from '@/model/types';
import { filterTopics } from './TopicRow';

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
