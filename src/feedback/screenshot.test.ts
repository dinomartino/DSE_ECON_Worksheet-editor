import { describe, expect, it } from 'vitest';
import {
  clipboardPlan,
  fitWithin,
  formatSize,
  imageFromClipboard,
  keyboardOs,
  pasteChord,
  SCREENSHOT_ACCEPT,
  SCREENSHOT_MAX_BYTES,
  screenshotProblem,
  screenshotType,
  shrinkFactor,
} from './screenshot';

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';

describe('Feedback screenshot: what can be attached', () => {
  it('takes PNG, JPEG, GIF and WebP by type, or by name when the type is missing', () => {
    expect(screenshotType({ type: 'image/png' })).toBe('image/png');
    expect(screenshotType({ type: 'IMAGE/JPEG' })).toBe('image/jpeg');
    expect(screenshotType({ type: '', name: 'Screenshot 2026-10-15 at 16.02.11.PNG' })).toBe('image/png');
    expect(screenshotType({ name: 'shot.jpg' })).toBe('image/jpeg');
    expect(screenshotType({ name: 'shot.webp' })).toBe('image/webp');
  });

  it('refuses what is not a picture the browser reads everywhere', () => {
    expect(screenshotType({ type: 'application/pdf', name: 'shot.png' })).toBeUndefined();
    expect(screenshotType({ type: 'image/svg+xml' })).toBeUndefined();
    expect(screenshotType({ type: '', name: 'IMG_0001.HEIC' })).toBeUndefined();
    expect(screenshotType({ type: '', name: 'notes' })).toBeUndefined();
    expect(screenshotProblem({ type: 'text/plain', size: 10 })).toBe('notImage');
  });

  it('caps the size taken in', () => {
    expect(screenshotProblem({ type: 'image/png', size: SCREENSHOT_MAX_BYTES })).toBeUndefined();
    expect(screenshotProblem({ type: 'image/png', size: SCREENSHOT_MAX_BYTES + 1 })).toBe('tooLarge');
  });

  it('offers the same kinds to the file picker', () => {
    expect(SCREENSHOT_ACCEPT.split(',').sort()).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
  });

  it('finds the pasted image among the clipboard files or items', () => {
    const png = { type: 'image/png', name: 'image.png' } as File;
    const asFiles = { files: [png], items: [] } as unknown as DataTransfer;
    expect(imageFromClipboard(asFiles)).toBe(png);
    const asItems = {
      files: [],
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => png },
      ],
    } as unknown as DataTransfer;
    expect(imageFromClipboard(asItems)).toBe(png);
    const textOnly = { files: [], items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] };
    expect(imageFromClipboard(textOnly as unknown as DataTransfer)).toBeUndefined();
    expect(imageFromClipboard(null)).toBeUndefined();
  });
});

describe('Feedback screenshot: sizing', () => {
  it('scales the longest side down to the cap, never up', () => {
    expect(fitWithin(6000, 3000, 5120)).toEqual({ width: 5120, height: 2560 });
    expect(fitWithin(1000, 3000, 1500)).toEqual({ width: 500, height: 1500 });
    expect(fitWithin(800, 600, 5120)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });

  it('shrinks a PNG that is over the paste limit by enough, with margin', () => {
    expect(shrinkFactor(5, 10)).toBe(1);
    const factor = shrinkFactor(40, 10);
    expect(factor).toBeLessThan(0.5);
    // Area scales with the square of the side.
    expect(40 * factor * factor).toBeLessThan(10);
  });

  it('captions the size', () => {
    expect(formatSize(200)).toBe('1 KB');
    expect(formatSize(412 * 1024)).toBe('412 KB');
    expect(formatSize(3.4 * 1024 * 1024)).toBe('3.4 MB');
  });
});

describe('Feedback screenshot: the keyboard named', () => {
  it('is the teacher\'s own', () => {
    expect(keyboardOs(MAC)).toBe('mac');
    expect(keyboardOs(WINDOWS)).toBe('windows');
    expect(keyboardOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('other');
    expect(pasteChord('mac')).toBe('⌘V');
    expect(pasteChord('windows')).toBe('Ctrl+V');
    expect(pasteChord('other')).toBe('Ctrl+V');
  });
});

describe('Feedback screenshot: one clipboard, two things', () => {
  it('a link that carries the text: the screenshot goes on the clipboard', () => {
    expect(clipboardPlan('github', true, false)).toEqual({ now: 'image' });
    expect(clipboardPlan('mail', true, false)).toEqual({ now: 'image' });
  });

  it('a link cut short: the screenshot first, the full text offered after', () => {
    expect(clipboardPlan('github', true, true)).toEqual({ now: 'image', offer: 'text' });
    expect(clipboardPlan('mail', true, true)).toEqual({ now: 'image', offer: 'text' });
  });

  it('no screenshot: as before, the clipboard only for a cut-short link', () => {
    expect(clipboardPlan('github', false, false)).toEqual({});
    expect(clipboardPlan('mail', false, true)).toEqual({ now: 'text' });
  });

  it('the Copy route: the text first, the screenshot offered after', () => {
    expect(clipboardPlan('copy', false, false)).toEqual({ now: 'text' });
    expect(clipboardPlan('copy', true, false)).toEqual({ now: 'text', offer: 'image' });
  });
});
