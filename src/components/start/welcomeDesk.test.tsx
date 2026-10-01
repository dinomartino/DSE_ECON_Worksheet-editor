/** The empty desk: a card per kind of paper, no em dashes, and the file routes; the panel beside it. */
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
  it('offers every document type once, in START_KINDS order', () => {
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

  it('leaves the panel one New worksheet button, empty or not; Open a file only once something is saved', () => {
    const panel = (empty: boolean) =>
      renderToStaticMarkup(<StartNewSection empty={empty} onCreate={() => {}} onOpenFile={() => {}} />);
    for (const empty of [true, false]) {
      expect(panel(empty)).toContain('New worksheet');
      for (const kind of START_KINDS) expect(panel(empty)).not.toContain(`>${kind.title}<`);
    }
    expect(panel(true)).not.toContain('Open a file…');
    expect(panel(false)).toContain('Open a file…');
  });

  it('keeps Open a file until storage is read (no flash for a returning teacher)', () => {
    // Before the index loads, `empty` is false: the screen renders as it always has.
    const screen = renderToStaticMarkup(<StartScreen onOpen={() => {}} />);
    expect(screen).toContain('Open a file…');
    expect(screen).not.toContain('Welcome to Econ Studio');
  });

  it('lists the Question bank under Library, after the button', () => {
    const screen = renderToStaticMarkup(<StartScreen onOpen={() => {}} />);
    expect(screen.indexOf('New worksheet')).toBeGreaterThan(-1);
    expect(screen.indexOf('>Library<')).toBeGreaterThan(screen.indexOf('New worksheet'));
    expect(screen.indexOf('Question bank 題庫')).toBeGreaterThan(screen.indexOf('>Library<'));
  });

  it('says nothing with an em dash (teacher-facing copy)', () => {
    const copy = [...START_KINDS.map((kind) => kind.caption), markup.replace(/<[^>]+>/g, ' ')].join(' ');
    expect(copy).not.toContain('—');
  });
});
