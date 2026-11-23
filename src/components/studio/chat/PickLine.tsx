'use client';

import { useMemo, useState } from 'react';
import { useMessages } from '@/i18n/language';
import { topicNamesFor } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import { lookupCode, SYLLABUS } from '@/syllabus';
import { syllabusName } from '../studioView';
import { STUDIO_CHAT_MESSAGES } from './chat.messages';
import type { KeyPick } from './engine';

/** "C · Price elasticity of demand", named in the drafts' language (syllabus names are paper words, k-0500). */
export function keyPointName(code: string, language: LanguageMode): string {
  const hit = lookupCode(code);
  if (!hit) return code;
  return `${hit.topic.code} · ${syllabusName(hit.keyPoint, topicNamesFor(language, 'wide'))}`;
}

/**
 * The AI's pick of the key point, as a step of its reply (u-lm1c: there is no topic picker;
 * the teacher may change the pick afterwards, never has to). Change opens a short list: the
 * AI's other pick, the key points of the same topic, and a search over all of them.
 */
export function PickLine({
  picks,
  by,
  language,
  editable,
  onChange,
}: {
  picks: readonly KeyPick[];
  by: 'ai' | 'you' | 'computer' | 'draft';
  language: LanguageMode;
  editable: boolean;
  onChange: (code: string) => void;
}) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const [open, setOpen] = useState(false);
  const main = picks[0];
  if (!main) return null;
  const also = picks[1];
  return (
    <span className="min-w-0" data-pick={main.code}>
      <span className="text-ink">
        {by === 'you' || by === 'draft' ? m.stepKeyPoint : m.stepPicked} <b className="font-semibold">{keyPointName(main.code, language)}</b>
      </span>
      {editable && (
        <button
          type="button"
          title={m.changeTitle}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          data-pick-change
          className="ml-1.5 cursor-pointer text-[12px] text-accent underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {m.change}
        </button>
      )}
      {also && (
        <span className="block text-[12px] text-ink-muted">
          {m.alsoTouches} {keyPointName(also.code, language)}
        </span>
      )}
      {by === 'you' || by === 'draft' ? (
        <span className="block text-[12px] text-ink-muted">{by === 'you' ? m.byYou : m.sameAsDraft}</span>
      ) : (
        (main.reason || main.basis) && (
          <span className="block text-[12px] leading-snug text-ink-muted">
            {m.because}{' '}
            {main.reason ||
              (main.basis?.kind === 'tag' ? m.basisTag(main.basis.label) : main.basis?.kind === 'words' ? m.basisWords(main.basis.hit) : main.basis ? m.basisExample(main.basis.hit) : '')}
            {by === 'computer' && <span className="text-ink-subtle"> · {m.byComputer}</span>}
          </span>
        )
      )}
      {open && (
        <PickMenu
          current={main.code}
          others={picks.slice(1).map((p) => p.code)}
          language={language}
          onPick={(code) => {
            setOpen(false);
            onChange(code);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

function PickMenu({ current, others, language, onPick, onClose }: { current: string; others: string[]; language: LanguageMode; onPick: (code: string) => void; onClose: () => void }) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const [query, setQuery] = useState('');
  const names = topicNamesFor(language, 'wide');
  const list = useMemo(() => {
    const all = SYLLABUS.topics.flatMap((topic) => topic.keyPoints.map((kp) => ({ code: kp.code, topic: topic.code, text: `${kp.en} ${kp.zh}`.toLowerCase() })));
    const q = query.trim().toLowerCase();
    if (q) return all.filter((k) => k.text.includes(q) || k.code.toLowerCase().includes(q)).slice(0, 8).map((k) => k.code);
    const topic = lookupCode(current)?.topic.code;
    const near = all.filter((k) => k.topic === topic && k.code !== current).map((k) => k.code);
    return [current, ...others.filter((c) => c !== current), ...near.filter((c) => !others.includes(c))].slice(0, 7);
  }, [query, current, others]);
  return (
    <span
      role="dialog"
      aria-label={m.pickMenuTitle}
      className="mt-1.5 block rounded-xl border border-line bg-surface p-2 shadow-lg"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
      data-pick-menu
    >
      <span className="block px-1.5 pb-1 text-[11px] text-ink-subtle">{m.pickMenuTitle}</span>
      {list.map((code) => {
        const hit = lookupCode(code);
        return (
          <button
            key={code}
            type="button"
            onClick={() => (code === current ? onClose() : onPick(code))}
            className={`block w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${code === current ? 'bg-accent-soft text-accent-ink' : 'text-ink'}`}
          >
            {hit ? `${hit.topic.code} · ${syllabusName(hit.keyPoint, names)}` : code}
            {code === current && ' ✓'}
          </button>
        );
      })}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={m.pickSearch}
        aria-label={m.pickSearch}
        autoFocus
        className="mt-1.5 h-7 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <span className="mt-1 block px-1.5 text-[11px] text-ink-subtle">{m.pickMenuNote}</span>
    </span>
  );
}
