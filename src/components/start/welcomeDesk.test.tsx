/** The empty desk: a card per kind of paper, no em dashes, and the file routes. */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DocumentType } from '@/model/newWorksheet';
import { START_KINDS } from './startKinds';
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

  it('says nothing with an em dash (teacher-facing copy)', () => {
    const copy = [...START_KINDS.map((kind) => kind.caption), markup.replace(/<[^>]+>/g, ' ')].join(' ');
    expect(copy).not.toContain('—');
  });
});
