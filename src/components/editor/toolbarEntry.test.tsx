import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PILL_TITLE } from '@/components/translate/copy';
import { Toolbar, UntranslatedPill } from './Toolbar';

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
});
