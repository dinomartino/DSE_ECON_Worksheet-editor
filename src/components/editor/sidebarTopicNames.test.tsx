/** The sidebar names topics in the open document's language, not the interface's. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiLanguageOverride } from '@/i18n/language';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import type { LanguageMode } from '@/model/types';
import type { UiLanguage } from '@/settings/language';

// A server render reads zustand's initial state; read the live one so setState shows.
vi.mock('@/store/worksheetStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/store/worksheetStore')>();
  const store = real.useWorksheetStore;
  const live = <T,>(select: (s: ReturnType<typeof store.getState>) => T): T => select(store.getState());
  return { ...real, useWorksheetStore: Object.assign(live, store) };
});

const { useWorksheetStore } = await import('@/store/worksheetStore');
const { Sidebar } = await import('./Sidebar');

const initial = useWorksheetStore.getState();
afterEach(() => useWorksheetStore.setState(initial, true));

function sidebar(ui: UiLanguage, language: LanguageMode): string {
  const worksheet = createWorksheet();
  const question = { ...createMcqQuestion(), tags: ['C.ped'] };
  useWorksheetStore.getState().replaceWorksheet({ ...worksheet, questions: [question] });
  useWorksheetStore.getState().setMode({ language });
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={ui}>
      <Sidebar pages={[]} onOpenSettings={() => {}} />
    </UiLanguageOverride.Provider>,
  );
}

describe('the sidebar’s topic names', () => {
  it('an English document under a 中文 interface: English names, 中文 chrome', () => {
    const out = sidebar('zh-HK', 'en');
    expect(out).toContain('Price elasticity of demand');
    expect(out).not.toContain('需求價格彈性');
    expect(out).toContain('內容');
  });

  it('a 中文 document under an English interface: 中文 names', () => {
    const out = sidebar('en', 'zh');
    expect(out).toContain('需求價格彈性');
    expect(out).not.toContain('Price elasticity of demand');
  });
});
