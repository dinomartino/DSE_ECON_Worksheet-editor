import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiLanguageOverride } from '@/i18n/language';
import { REQUEST, studioDraft } from '@/questionStudio/fixtures';
import type { AiTurn, Chat, ChatDraft } from './chatTypes';
import { ChatTurns } from './ChatTurns';
import { Composer } from './Composer';
import type { SourceQuestion } from '@/questionStudio/types';

/** k-0535: the chip that says which draft a message edits, and "Which draft do you mean?". */

const noop = () => {};
const draft = (no: number): ChatDraft => ({ id: `id${no}`, no, entry: { draft: studioDraft(`d${no}`), request: REQUEST }, older: [], state: 'open', turnId: 't0' });
const chat = (over: Partial<Chat> = {}): Chat => ({
  v: 1,
  id: 'c1',
  createdAt: '2026-11-24T00:00:00Z',
  updatedAt: '2026-11-24T00:00:00Z',
  refs: [],
  turns: [{ id: 't0', role: 'ai', steps: [], notes: [], draftIds: ['id1', 'id2', 'id3'] }],
  drafts: [draft(1), draft(2), draft(3)],
  picks: [],
  settings: { count: 3, level: 'same', language: 'en' },
  lastText: '',
  ...over,
});

function composer(props: { text?: string; draft?: { id: string; no: number }; lang?: 'en' | 'zh-HK' }) {
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={props.lang ?? 'en'}>
      <Composer
        chat={chat()}
        running={false}
        draft={props.draft}
        text={props.text ?? ''}
        onText={noop}
        onClearDraft={noop}
        onSend={noop}
        onStop={noop}
        onAddReference={noop}
        onRemoveReference={noop}
        onSettings={noop}
        suggestions={[]}
      />
    </UiLanguageOverride.Provider>,
  );
}

describe('the composer chip (k-0535)', () => {
  it('a chosen draft (card click, Ask about this): "Editing Draft 2 ×" / 「修改第 2 題 ×」', () => {
    expect(composer({ draft: { id: 'id2', no: 2 } })).toMatch(/data-draft-chip="2"[^>]*>✦ Editing Draft 2/);
    expect(composer({ draft: { id: 'id2', no: 2 }, lang: 'zh-HK' })).toContain('修改第 2 題');
  });

  it('typed words that clearly name a draft show the guess before sending, with ✕', () => {
    const html = composer({ text: 'Q2 太易' });
    expect(html).toMatch(/data-guess-chip="2"/);
    expect(html).toContain('Editing Draft 2');
    expect(html).toContain('aria-label="Not an edit: write new questions"');
    expect(composer({ text: 'make them all easier' })).toContain('Editing Drafts 1, 2, 3');
    expect(composer({ text: '仿照第二題再擬一題', lang: 'zh-HK' })).toContain('仿照第 2 題再擬一題');
  });

  it('no guess for new requests or unclear words (the AI reads those)', () => {
    expect(composer({ text: 'write 3 more on price ceilings' })).not.toContain('data-guess-chip');
    expect(composer({ text: 'make it harder' })).not.toContain('data-guess-chip');
    expect(composer({ text: '' })).not.toContain('data-guess-chip');
  });
});

function turns(ask: AiTurn['ask'], lang: 'en' | 'zh-HK' = 'en', extra: Partial<AiTurn> = {}) {
  const c = chat({ turns: [{ id: 'u1', role: 'user', text: 'make it harder', refs: [] }, { id: 'a1', role: 'ai', steps: [], notes: [], draftIds: [], ask, ...extra }] });
  return renderToStaticMarkup(
    <UiLanguageOverride.Provider value={lang}>
      <ChatTurns chat={c} language="en" onJump={noop} onRetry={noop} onDismiss={noop} onChangePick={noop} onAnswer={noop} onWhich={noop} />
    </UiLanguageOverride.Provider>,
  );
}

describe('"Which draft do you mean?" (k-0535)', () => {
  const which = { kind: 'which' as const, text: 'make it harder', wanted: 'edit' as const, options: [1, 2, 3], how: 'harder' as const, parts: [] };

  it('a button per draft, All of them, Write new ones', () => {
    const html = turns(which);
    expect(html).toContain('Which draft do you mean?');
    for (const n of [1, 2, 3]) expect(html).toContain(`data-which="${n}"`);
    expect(html).toContain('data-which="all"');
    expect(html).toContain('data-which="new"');
    const zh = turns(which, 'zh-HK');
    expect(zh).toContain('你指哪一題？');
    expect(zh).toContain('第 2 題');
  });

  it('a question offers only drafts; once answered, the choice shows instead of buttons', () => {
    const html = turns({ ...which, wanted: 'ask' });
    expect(html).not.toContain('data-which="all"');
    expect(html).not.toContain('data-which="new"');
    const done = turns({ ...which, answer: 2 });
    expect(done).not.toContain('data-which="1"');
    expect(done).toContain('→ Draft 2');
  });

  it('the AI answer to a question is shown in its own words, with the read', () => {
    const html = turns(undefined, 'en', {
      steps: [{ kind: 'understand', state: 'done', intent: 'ask', drafts: [1], by: 'ai' }],
      notes: [{ kind: 'reply', text: 'B is the key.', draftNo: 1 }],
    });
    expect(html).toContain('A question about draft 1.');
    expect(html).toContain('B is the key.');
  });
});

const source = { id: 'DSE2099/P1/Q12', label: 'DSE2099/P1/Q12', stem: { en: 'Q', zh: '題' }, statements: [], options: [], answerIndex: 0 } as unknown as SourceQuestion;
const chatCm = (withRef: boolean): Chat => ({
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
        chat={chatCm(props.withRef)}
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
