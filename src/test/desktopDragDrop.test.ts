import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The desktop window's native drag-drop handler stays off (k-0182).
 *
 * With `dragDropEnabled` on (Tauri's default), `tauri-runtime-wry` answers every native drag
 * itself, files or not, and wry's macOS web view and WebView2 on Windows then never deliver
 * `dragover` or `drop` to the page. Every HTML5 drag in the editor (the Content outline, the
 * grip on the page, the page thumbnails) did nothing in the app while working in a browser.
 * With it off the shell behaves as a browser tab: in-page drags work, and a file from Finder
 * or Explorer reaches the page as an ordinary `drop`, which is how the start screen, the
 * feedback dialog and the import review take it.
 *
 * So two things must stay true, and are checked here rather than found by a teacher:
 *  - no window turns the handler back on;
 *  - nothing new waits for the shell's native `DragDrop` event, which would never arrive.
 */

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

interface TauriConfig {
  app: { windows: Array<{ label?: string; dragDropEnabled?: boolean }> };
}

describe('the desktop window config', () => {
  const config = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')) as TauriConfig;

  it('has a window to check', () => {
    expect(config.app.windows.length).toBeGreaterThan(0);
  });

  it.each(config.app.windows.map((window, index) => [window.label ?? `window ${index}`, window] as const))(
    'turns the native drag-drop handler off on %s, so the page gets HTML5 drag events',
    (_label, window) => {
      expect(window.dragDropEnabled).toBe(false);
    },
  );
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('file drops in the page', () => {
  // The helpers themselves live in `platform/`. The feedback dialog still subscribes, to
  // events the shell no longer sends; its own `drop` handler does the work. Remove its
  // subscription, and this entry, together with `listenForFileDrops`.
  const MAY_LISTEN = [/^platform\//, /^components\/feedback\/FeedbackDialog\.tsx$/];

  it('are taken from the HTML5 drop event, never from the shell’s native drag events', () => {
    const offenders = sourceFiles(SRC)
      .map((file) => relative(SRC, file).split(sep).join('/'))
      .filter((file) => !MAY_LISTEN.some((pattern) => pattern.test(file)))
      .filter((file) => /\b(subscribeToFileDrops|listenForFileDrops)\b|tauri:\/\/drag-/.test(readFileSync(join(SRC, file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
