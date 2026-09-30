import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
const { HomeCrumb, Toolbar } = await import('./Toolbar');

const initial = useWorksheetStore.getState();
afterEach(() => useWorksheetStore.setState(initial, true));

describe('Toolbar entry points', () => {
  it('shows the page-setup icon, not the gear, on Setup', () => {
    const markup = renderToStaticMarkup(<Toolbar onOpenSettings={() => {}} onOpenFiles={() => {}} onClearAll={async () => {}} />);
    const end = markup.indexOf('>Setup<');
    const setup = markup.slice(markup.lastIndexOf('<button', end), end);
    expect(setup).toContain('M14.5 2.5V7H19');
    expect(setup).not.toContain('<circle cx="12" cy="12" r="3"');
  });

  it('carries the untranslated count on the ✦ AI button, and has no AI entry when read-only', () => {
    const oneSided = createMcqQuestion();
    oneSided.blocks = [createParagraphBlock({ en: [{ text: 'Only English' }], zh: [] })];
    const worksheet = withFlow(createWorksheet(), [oneSided], { replaceLayout: true });
    const mode = { ...initial.mode, language: 'bilingual' as const };
    const render = (readOnly: boolean) => {
      useWorksheetStore.setState({ worksheet, mode, readOnly });
      return renderToStaticMarkup(<Toolbar onOpenSettings={() => {}} onOpenFiles={() => {}} onClearAll={async () => {}} />);
    };
    const editable = render(false);
    expect(editable).toMatch(/<button type="button" title="AI tools \(Ctrl\+J\) · \d+ untranslated" aria-label="AI tools, \d+ untranslated"/);
    expect(editable).toMatch(/<span>AI<\/span><span[^>]*>\d+<\/span><\/button>/);
    expect(editable).not.toContain('Translate…');
    expect(editable).not.toContain('untranslated</span>');
    const readOnly = render(true);
    expect(readOnly).not.toContain('AI tools');
    expect(readOnly).not.toContain('data-ai-door');
  });

  it('leads with an Econ Studio crumb home, read-only documents included', () => {
    type Home = ReactElement<{ 'aria-label': string; onClick: () => void }>;
    const onOpenFiles = vi.fn();
    const crumb = HomeCrumb({ onOpenFiles }) as ReactElement<{ children: Home[] }>;
    const home = crumb.props.children[0];
    expect(home.props['aria-label']).toBe('Econ Studio home');
    home.props.onClick();
    expect(onOpenFiles).toHaveBeenCalledOnce();

    useWorksheetStore.setState({ readOnly: true });
    const markup = renderToStaticMarkup(<Toolbar onOpenSettings={() => {}} onOpenFiles={() => {}} onClearAll={async () => {}} />);
    expect(markup).toMatch(/<nav aria-label="Breadcrumb"[^>]*><button type="button" aria-label="Econ Studio home"/);
    // Word and chevron fold away below 1440px, where the bar has no width to spare.
    expect(markup).toContain('<span class="hidden min-[1440px]:inline">Econ Studio</span>');
  });

  it('stays one row from lg up: nothing wraps, the name is what gives way', () => {
    useWorksheetStore.setState({ worksheet: { ...createWorksheet(), name: 'Unit 3 · Demand and supply practice' } });
    const markup = renderToStaticMarkup(<Toolbar onOpenSettings={() => {}} onOpenFiles={() => {}} onClearAll={async () => {}} />);
    expect(markup).toMatch(/<div class="[^"]*\bwhitespace-nowrap lg:flex-nowrap\b/);
    expect(markup).toMatch(/<button type="button" title="Unit 3 · Demand and supply practice. Click to rename" class="min-w-0 [^"]*\btruncate\b/);
    // Icon-only controls keep their names.
    expect(markup).toMatch(/<button[^>]*aria-label="Setup"[^>]*title="Setup: [^"]*"/);
    expect(markup).toContain('<span class="sr-only xl:not-sr-only">Saved</span>');
  });
});
