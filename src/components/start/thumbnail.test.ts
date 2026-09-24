import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoverPage } from '@/model/cover';
import { createDiagramBlock, createParagraphBlock, createWorksheet } from '@/model/factories';
import { createPageBreakElement } from '@/model/flow';
import { bi } from '@/model/text';
import type { Worksheet } from '@/model/types';
import { buildAcceptanceWorksheet, withFlow } from '@/test/fixtures';
import {
  clearThumbnailCache,
  loadThumbnail,
  thumbnailHtml,
  thumbnailLanguage,
  thumbnailPage,
  thumbnailShowsCover,
} from './thumbnail';

beforeEach(() => clearThumbnailCache());

describe('thumbnailHtml', () => {
  it('prints the first question of the acceptance worksheet', async () => {
    const html = await thumbnailHtml(buildAcceptanceWorksheet());
    expect(html).toContain('What happens when demand falls?');
    expect(html).toContain('S5 Economics Test');
  });

  it('is the student version: no answers, no teacher banner', async () => {
    const html = await thumbnailHtml(buildAcceptanceWorksheet());
    expect(html).not.toContain('Teacher Version');
    expect(html).not.toContain('Demand shifts left.');
  });

  it('prints at the document body size, not the clipboard paste size', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const html = await thumbnailHtml(worksheet);
    const family = `font-family:'${worksheet.fonts.latin}','${worksheet.fonts.eastAsia}',serif;`;
    // If the clipboard respells its prefix, this fails rather than printing at 12pt.
    expect(html).not.toContain(`${family}font-size:12pt;`);
    expect(html).toContain(`${family}font-size:11pt;`);

    worksheet.baseFontSize = 10;
    expect(await thumbnailHtml(worksheet)).toContain(`${family}font-size:10pt;`);
  });

  it('carries no script, handler or link', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.title = bi('<script>alert(1)</script><img onerror=x>', '');
    const html = await thumbnailHtml(worksheet);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img[^>]*\son\w+=/i);
    expect(html).not.toMatch(/<a\s/i);
  });

  it('stops at the first forced page break', async () => {
    const [before, after] = buildAcceptanceWorksheet().questions;
    before.blocks = [createParagraphBlock(bi('Page one words.', ''))];
    after.blocks = [createParagraphBlock(bi('Page two words.', ''))];
    const worksheet = withFlow(createWorksheet(), [before, createPageBreakElement(), after]);

    const html = await thumbnailHtml(worksheet);
    expect(html).toContain('Page one words.');
    expect(html).not.toContain('Page two words.');
  });

  it('draws a diagram as an SVG image without a canvas', async () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.questions[0].blocks.push(createDiagramBlock('blank'));
    const html = await thumbnailHtml(worksheet);
    expect(html).toContain('src="data:image/svg+xml');
  });

  it('shows the Chinese side of a Chinese-only paper, English otherwise', async () => {
    expect(thumbnailLanguage(buildAcceptanceWorksheet())).toBe('en');

    const worksheet = buildAcceptanceWorksheet();
    worksheet.title = bi('', '中五經濟科測驗');
    worksheet.instructions = bi('', '回答全部問題。');
    for (const question of worksheet.questions) {
      question.blocks = [createParagraphBlock(bi('', '當需求下降時市場會出現甚麼變化？'))];
    }
    // Strip every English side the fixture authored, as a Chinese-only teacher would.
    const zhOnly = JSON.parse(
      JSON.stringify(worksheet, (key, value) => (key === 'en' ? [] : value)),
    ) as Worksheet;
    expect(thumbnailLanguage(zhOnly)).toBe('zh');
    const html = await thumbnailHtml(zhOnly);
    expect(html).toContain('當需求下降時市場會出現甚麼變化？');
    expect(html).toContain('lang="zh-HK"');
  });

  it('renders an empty document as a blank page without throwing', async () => {
    const worksheet = withFlow(createWorksheet(), [], { replaceLayout: true });
    worksheet.instructions = bi('', '');
    const html = await thumbnailHtml(worksheet);
    expect(html).toContain('class="page"');
  });
});

describe('cover', () => {
  const mock = (paperStyle: 'mcq' | 'writeIn') => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.cover = createCoverPage({
      paperStyle,
      school: 'ST HARBOUR COLLEGE',
      now: new Date('2026-01-01'),
    });
    return worksheet;
  };

  it('shows the cover as page 1 instead of the body', async () => {
    const worksheet = mock('mcq');
    expect(thumbnailShowsCover(worksheet)).toBe(true);
    const html = await thumbnailHtml(worksheet);
    expect(html).toContain('ST HARBOUR COLLEGE');
    expect(html).toContain('INSTRUCTIONS');
    expect(html).not.toContain('What happens when demand falls?');
  });

  it('draws the Paper 2 panel: the column rule and the write-in boxes', async () => {
    const worksheet = mock('writeIn');
    const boxes = worksheet.cover!.panelBoxes ?? 0;
    const html = await thumbnailHtml(worksheet);
    expect(html).toContain('border-left:1.5pt solid #000');
    expect(html.match(/height:0\.35in/g)?.length ?? 0).toBe(boxes);
  });

  it('is not claimed for an ordinary worksheet', () => {
    expect(thumbnailShowsCover(buildAcceptanceWorksheet())).toBe(false);
  });
});

describe('thumbnailPage', () => {
  it('sizes A4 at 96dpi with its margins', () => {
    const page = thumbnailPage(buildAcceptanceWorksheet());
    expect(page.widthPx).toBeCloseTo(794, 0);
    expect(page.heightPx).toBeCloseTo(1123, 0);
    expect(page.marginPx.left).toBe(96);
  });

  it('swaps for landscape', () => {
    const worksheet = buildAcceptanceWorksheet();
    worksheet.pageSetup = { ...worksheet.pageSetup!, orientation: 'landscape' };
    const page = thumbnailPage(worksheet);
    expect(page.widthPx).toBeCloseTo(1123, 0);
    expect(page.heightPx).toBeCloseTo(794, 0);
  });
});

describe('loadThumbnail', () => {
  it('loads once per saved version and returns the same promise on a hit', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const load = vi.fn(async () => worksheet);
    const first = loadThumbnail(worksheet.id, worksheet.updatedAt, load);
    const second = loadThumbnail(worksheet.id, worksheet.updatedAt, load);
    expect(second).toBe(first);
    const result = await first;
    expect(result?.html).toContain('What happens when demand falls?');
    expect(result?.showsCover).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);

    // A later save is a new key: rebuilt.
    await loadThumbnail(worksheet.id, 'later', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('resolves undefined for a missing document, and retries after a failure', async () => {
    expect(await loadThumbnail('gone', 't', async () => undefined)).toBeUndefined();

    const failing = vi.fn(async (): Promise<Worksheet | undefined> => {
      throw new Error('disk');
    });
    await expect(loadThumbnail('x', 't', failing)).rejects.toThrow('disk');
    await expect(loadThumbnail('x', 't', failing)).rejects.toThrow('disk');
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('builds at most two at a time', async () => {
    let active = 0;
    let peak = 0;
    const load = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return buildAcceptanceWorksheet();
    };
    await Promise.all(
      Array.from({ length: 8 }, (_, index) => loadThumbnail(`doc-${index}`, 't', load)),
    );
    expect(peak).toBe(2);
  });
});

describe('items', () => {
  it('wraps each question whole, so the card can trim at item boundaries', async () => {
    const worksheet = buildAcceptanceWorksheet();
    const html = await thumbnailHtml(worksheet);
    expect(html.match(/<div data-item>/g)?.length).toBe(worksheet.questions.length);
    // The first question's options sit inside its own item, not loose after it.
    const first = html.slice(html.indexOf('<div data-item>'));
    expect(first.indexOf('What happens when demand falls?')).toBeLessThan(
      first.indexOf('<div data-item>', 1),
    );
    expect(first.indexOf('No change')).toBeLessThan(first.indexOf('<div data-item>', 1));
  });
});
