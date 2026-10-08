import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The paginator's probe is absolutely positioned against a box outside the scrolling
 * desk, so if it keeps its full height it lengthens the document and the whole editor
 * scrolls up to an empty band. jsdom does no layout, so the class contract is the guard.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('measurement probe', () => {
  it.each(['./Preview.tsx', './AnswerKeyPreview.tsx'])('%s clips its probe to zero height', (file) => {
    const probe = read(file).match(/data-measure-probe\s+className="([^"]*)"/);
    expect(probe).not.toBeNull();
    expect(probe![1].split(' ')).toEqual(expect.arrayContaining(['absolute', 'h-0', 'overflow-hidden']));
  });

  it('the app shell never scrolls on screen', () => {
    expect(read('../../app/EditorHost.tsx')).toContain(
      'className="flex h-screen flex-col overflow-hidden print:overflow-visible"',
    );
  });
});
