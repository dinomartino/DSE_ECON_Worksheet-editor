/** The empty desk: a card per kind of paper, the only way in, no em dashes, and the file routes. */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentType } from '@/model/newWorksheet';
import { START_KINDS } from './startKinds';
import { StartNewSection, StartScreen } from './StartScreen';
import { WelcomeDesk } from './WelcomeDesk';

const TYPES: DocumentType[] = ['classroom', 'lqWorksheet', 'paper1', 'lqMock'];
const markup = renderToStaticMarkup(
  <WelcomeDesk onCreate={() => {}} onOpenFile={() => {}} onRestore={() => {}} />,
);

describe('the welcome desk', () => {
  it('offers every document type once, in the start rows’ order', () => {
    expect(START_KINDS.map((kind) => kind.type)).toEqual(TYPES);
    let at = -1;
    for (const kind of START_KINDS) {
      const next = markup.indexOf(`>${kind.title}<`);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
  });

  it('brings existing work in by file or backup', () => {
    expect(markup).toContain('Open a file…');
    expect(markup).toContain('Restore a backup…');
  });

  it('is the one way in while empty: the panel drops its start rows and Open a file', () => {
    const panel = (empty: boolean) =>
      renderToStaticMarkup(<StartNewSection empty={empty} onCreate={() => {}} onOpenFile={() => {}} />);
    expect(panel(true)).toBe('');
    const full = panel(false);
    expect(full).toContain('Start new');
    expect(full).toContain('Open a file…');
    for (const kind of START_KINDS) expect(full).toContain(`>${kind.title}<`);
  });

  it('keeps the panel rows until storage is read (no flash for a returning teacher)', () => {
    // Before the index loads, `empty` is false: the screen renders as it always has.
    const screen = renderToStaticMarkup(<StartScreen onOpen={() => {}} />);
    expect(screen).toContain('Start new');
    expect(screen).not.toContain('Welcome to Econ Studio');
  });

  it('says nothing with an em dash (teacher-facing copy)', () => {
    const copy = [...START_KINDS.map((kind) => kind.caption), markup.replace(/<[^>]+>/g, ' ')].join(' ');
    expect(copy).not.toContain('—');
  });
});
