import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import type { SourceQuestion } from '@/questionStudio/types';
import type { Chat } from './chatTypes';
import { Composer } from './Composer';

const source = { id: 'DSE2099/P1/Q12', label: 'DSE2099/P1/Q12', stem: { en: 'Q', zh: '題' }, statements: [], options: [], answerIndex: 0 } as unknown as SourceQuestion;
const chat = (withRef: boolean): Chat => ({
  v: 1,
  id: 'c1',
  createdAt: '2026-11-24T00:00:00Z',
  updatedAt: '2026-11-24T00:00:00Z',
  refs: withRef ? [{ source, who: 'you' }] : [],
  turns: [],
  drafts: [],
  picks: [],
  settings: { count: 3, level: 'same', language: 'en' },
  lastText: '',
});

function render(props: { withRef: boolean; text?: string; hint?: { text: string; at: number }; lang?: 'en' | 'zh-HK' }) {
  const noop = () => {};
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={props.lang ?? 'en'}>
      <Composer
        chat={chat(props.withRef)}
        running={false}
        text={props.text ?? ''}
        onText={noop}
        onClearDraft={noop}
        onSend={noop}
        onStop={noop}
        onAddReference={noop}
        onRemoveReference={noop}
        onSettings={noop}
        suggestions={[]}
        hint={props.hint}
      />
    </UiLanguageOverride.Provider>,
  );
}

const textarea = (html: string) => html.match(/<textarea[^>]*>([^<]*)<\/textarea>/)!;
const sendButton = (html: string) => html.match(/<button[^>]*data-chat-send[^>]*>/)![0];

describe('Composer: nothing is typed into the box for the teacher (k-0528, u-5ev0)', () => {
  it('with a reference the box stays empty, the placeholder says what Send does, and Send works', () => {
    const html = render({ withRef: true });
    expect(textarea(html)[1]).toBe('');
    expect(textarea(html)[0]).toContain('placeholder="Send as it is to write 3 like this, or add what you want…"');
    expect(sendButton(html)).not.toContain(' disabled=""');
  });

  it('in 中文 too', () => {
    const html = render({ withRef: true, lang: 'zh-HK' });
    expect(textarea(html)[0]).toContain('可以直接傳送（仿照這題擬 3 題），或補充要求…');
  });

  it('what the teacher typed stays as typed', () => {
    expect(textarea(render({ withRef: true, text: 'Use a price ceiling' }))[1]).toBe('Use a price ceiling');
  });

  it('with no reference and an empty box, Send waits; ✎ Describe is a placeholder, not text', () => {
    expect(sendButton(render({ withRef: false }))).toContain(' disabled=""');
    const html = render({ withRef: false, hint: { text: 'e.g. 3 MC on unit tax', at: 1 } });
    expect(textarea(html)[1]).toBe('');
    expect(textarea(html)[0]).toContain('placeholder="e.g. 3 MC on unit tax"');
  });

  it('the ⚙ button says it opens a popover and starts closed', () => {
    const html = render({ withRef: false });
    expect(html).toMatch(/data-chat-settings[^>]*|aria-haspopup="dialog"/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-chat-settings-pop');
  });
});
