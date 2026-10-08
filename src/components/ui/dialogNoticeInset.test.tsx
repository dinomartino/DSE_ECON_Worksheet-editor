import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog, noticeInsetFor } from './Dialog';

describe("a dialog's notices never hide its last control", () => {
  it('a scroller ends past the stack while one is up, and not otherwise', () => {
    expect(noticeInsetFor(0)).toBe(0);
    expect(noticeInsetFor(64.4)).toBe(65 + 20);
  });

  it('measures its stack in a box of its own and leaves no gap with none up', () => {
    const markup = renderToStaticMarkup(
      <Dialog title="Export" onClose={() => {}}>
        <p>Body</p>
      </Dialog>,
    );
    expect(markup).toMatch(/class="pointer-events-none absolute bottom-3 right-3[^"]*"/);
    expect(markup).not.toContain('data-notice-inset');
  });

  it('every dialog that scrolls its own body ends each scroller with the spacer', () => {
    const root = path.resolve(__dirname, '..');
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return files(full);
        return name.endsWith('.tsx') && !name.includes('.test.') ? [full] : [];
      });
    const own = files(root).filter((file) => readFileSync(file, 'utf8').includes('scrollBody={false}'));
    expect(own.length).toBeGreaterThan(0);
    const missing = own.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return !source.includes('<DialogTabs') && !source.includes('<NoticeInsetSpacer');
    });
    expect(missing.map((file) => path.relative(root, file))).toEqual([]);
  });
});
