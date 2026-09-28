import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PILL_TITLE } from '@/components/translate/copy';
import { createMcqQuestion, createParagraphBlock, createWorksheet } from '@/model/factories';
import { withFlow } from '@/test/fixtures';

// A server render reads zustand's initial state; read the live one so setState shows.
vi.mock('@/store/worksheetStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/store/worksheetStore')>();
  const store = real.useWorksheetStore;
  const live = <T,>(select: (s: ReturnType<typeof store.getState>) => T): T => select(store.getState());
  return { ...real, useWorksheetStore: Object.assign(live, store) };
});

const { useWorksheetStore } = await import('@/store/worksheetStore');
const { Toolbar, UntranslatedPill } = await import('./Toolbar');

const initial = useWorksheetStore.getState();
afterEach(() => useWorksheetStore.setState(initial, true));

describe('Toolbar entry points', () => {
  it('the untranslated pill is a button that opens Translate, and a plain pill when read-only', () => {
    const editable = renderToStaticMarkup(<UntranslatedPill count={46} onOpen={() => {}} />);
    expect(editable).toMatch(new RegExp(`^<button type="button" title="${PILL_TITLE}"[^>]*><span[^>]*>46 untranslated</span></button>$`));
    // Toolbar passes no handler in a read-only document.
    const readOnly = renderToStaticMarkup(<UntranslatedPill count={46} />);
    expect(readOnly).toMatch(/^<span[^>]*>46 untranslated<\/span>$/);
    expect(renderToStaticMarkup(<UntranslatedPill count={0} onOpen={() => {}} />)).toBe('');
  });

  it('shows the page-setup icon, not the gear, on Setup', () => {
    const markup = renderToStaticMarkup(<Toolbar onOpenSettings={() => {}} onOpenFiles={() => {}} />);
    const end = markup.indexOf('>Setup<');
    const setup = markup.slice(markup.lastIndexOf('<button', end), end);
    expect(setup).toContain('M14.5 2.5V7H19');
    expect(setup).not.toContain('<circle cx="12" cy="12" r="3"');
  });

  it('renders the pill as a plain label, not a Translate button, in a read-only document', () => {
    const oneSided = createMcqQuestion();
    oneSided.blocks = [createParagraphBlock({ en: [{ text: 'Only English' }], zh: [] })];
    const worksheet = withFlow(createWorksheet(), [oneSided], { replaceLayout: true });
    const mode = { ...initial.mode, language: 'bilingual' as const };
    const render = (readOnly: boolean) => {
      useWorksheetStore.setState({ worksheet, mode, readOnly });
      return renderToStaticMarkup(<Toolbar onOpenSettings={() => {}} onOpenFiles={() => {}} />);
    };
    expect(render(false)).toMatch(new RegExp(`<button type="button" title="${PILL_TITLE}"`));
    const readOnly = render(true);
    expect(readOnly).toMatch(/untranslated<\/span>/);
    expect(readOnly).not.toContain(`title="${PILL_TITLE}"`);
  });
});
