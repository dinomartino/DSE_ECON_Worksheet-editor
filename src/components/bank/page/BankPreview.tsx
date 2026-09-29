'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Segmented } from '@/components/ui';
import { sourceLabel, usedLabel } from '@/components/bank/BankRow';
import type { BankGroup, BankRow } from '@/library/types';
import type { LanguageMode, Worksheet } from '@/model/types';
import { tagLines } from './bankPage';
import { questionPreviewHtml } from './questionPreview';

/** The smallest the paper is drawn: 11pt body reads at ~10.5px. Narrower panes reflow instead. */
const MIN_SCALE = 0.72;

/**
 * The focused question through the real renderer in Teacher mode, so diagrams and the
 * mark scheme show, then what the bank knows about it: topics (editable), where it lives,
 * where it was used. The paper is on-paper content: literal hex, never tokens.
 */
export function BankPreview({
  row,
  group,
  worksheet,
  loadFailed,
  classTag,
  onEditTopics,
  onOpen,
}: {
  row: BankRow | undefined;
  group: BankGroup | undefined;
  /** The owning document, once loaded. */
  worksheet: Worksheet | undefined;
  loadFailed: boolean;
  /** The "not used with" class, to mark its uses amber. */
  classTag?: string;
  onEditTopics?: () => void;
  onOpen: () => void;
}) {
  const bilingual = Boolean(row && row.languages.length === 2);
  const [language, setLanguage] = useState<LanguageMode>('en');
  const shownLanguage: LanguageMode = row && !row.languages.includes(language as 'en' | 'zh') ? (row.languages[0] ?? 'en') : language;

  if (!row) {
    return (
      <aside className="flex min-h-0 flex-col items-center justify-center border-l border-line bg-surface-sunken px-6 text-center">
        <p className="max-w-[220px] text-[12px] leading-relaxed text-ink-subtle">
          Choose a question to see it as it prints, with its mark scheme.
        </p>
      </aside>
    );
  }
  const uses = group?.usedIn ?? [];
  return (
    <aside aria-label="Question preview" className="scroll-slim flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-line bg-surface-sunken p-3.5">
      {bilingual && (
        <div className="-my-1 flex justify-end">
          <Segmented<LanguageMode>
            label="Preview language"
            value={shownLanguage}
            onChange={setLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'zh', label: '中文' },
            ]}
          />
        </div>
      )}
      <PaperSheet worksheet={worksheet} questionId={row.questionId} language={shownLanguage} failed={loadFailed} />
      <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[12px] leading-snug">
        <dt className="text-ink-subtle">Topics</dt>
        <dd className="min-w-0">
          {row.tags.length === 0 ? (
            <span className="text-ink-subtle">None yet</span>
          ) : (
            <ul>
              {tagLines(row.tags).map((line) => (
                <li key={line.code} className="truncate" title={line.name ? `${line.code} · ${line.name}` : line.code}>
                  <span className="tabular-nums text-ink">{line.code}</span>
                  {line.name && <span className="text-ink-muted"> {line.name}</span>}
                </li>
              ))}
            </ul>
          )}
          {onEditTopics && (
            <button
              type="button"
              onClick={onEditTopics}
              className="mt-0.5 block cursor-pointer font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {row.tags.length === 0 ? 'Add topics' : 'Edit'}
            </button>
          )}
        </dd>
        <dt className="text-ink-subtle">Lives in</dt>
        <dd className="min-w-0 truncate text-ink" title={sourceLabel(row)}>
          {sourceLabel(row)}
          {row.docKind === 'bank' && <span className="text-ink-subtle"> · bank</span>}
        </dd>
        <dt className="text-ink-subtle">Used in</dt>
        <dd className="min-w-0">
          {uses.length === 0 ? (
            <span className="text-ink-subtle">No paper yet</span>
          ) : (
            <ul className="space-y-0.5">
              {uses.slice(0, 6).map((use) => {
                const amber = classTag && use.classTag?.trim().toLowerCase() === classTag.trim().toLowerCase();
                return (
                  <li key={use.docId} className={`truncate tabular-nums ${amber ? 'text-warn-ink' : 'text-ink'}`}>
                    {amber ? `${usedLabel(use)} · ` : ''}
                    {use.docTitle}
                    {use.number !== undefined && ` · Q${use.number}`}
                  </li>
                );
              })}
              {uses.length > 6 && <li className="text-ink-subtle">and {uses.length - 6} more</li>}
            </ul>
          )}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onOpen}>
          Open worksheet
        </Button>
      </div>
    </aside>
  );
}

/**
 * The question on white paper, laid out in a shadow root (so the app's reset never reaches
 * the paper's typography) at its document's column width, scaled to fit. Below
 * `MIN_SCALE` it reflows to a narrower column rather than shrinking past reading size.
 */
function PaperSheet({
  worksheet,
  questionId,
  language,
  failed,
}: {
  worksheet: Worksheet | undefined;
  questionId: string;
  language: LanguageMode;
  failed: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const preview = useMemo(() => {
    if (!worksheet) return undefined;
    try {
      return questionPreviewHtml(worksheet, questionId, language);
    } catch {
      return undefined;
    }
  }, [worksheet, questionId, language]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => setWidth(entries[entries.length - 1]?.contentRect.width ?? 0));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const scale = preview && width > 0 ? Math.min(1, Math.max(MIN_SCALE, width / preview.widthPx)) : 0;
  const layoutWidth = preview && scale > 0 ? Math.min(preview.widthPx, width / scale) : 0;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      // innerHTML never runs scripts, and the clipboard HTML carries none.
      root.innerHTML = preview ? preview.html.replace(`width:${preview.widthPx}px;`, `width:${layoutWidth}px;`) : '';
      const sheet = root.querySelector<HTMLElement>('.sheet');
      if (!sheet || typeof ResizeObserver === 'undefined') return;
      // Diagrams are images: the height settles as they decode, so it is observed, not read once.
      const observer = new ResizeObserver(() => setHeight(sheet.offsetHeight));
      observer.observe(sheet);
      return () => observer.disconnect();
    } catch {
      // No shadow DOM: the sheet stays blank.
    }
  }, [preview, layoutWidth]);

  return (
    <div
      ref={frameRef}
      className="relative shrink-0 overflow-hidden rounded-[2px]"
      style={{
        background: '#ffffff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.18), 0 0 0 1px #e5e1d8',
        padding: 14,
        minHeight: 96,
      }}
    >
      <div style={{ height: preview ? height * scale : 0, position: 'relative' }}>
        <div
          ref={hostRef}
          aria-label="The question as it prints, Teacher version"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: layoutWidth,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            visibility: scale > 0 ? 'visible' : 'hidden',
          }}
        />
      </div>
      {!preview && (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-[11.5px]" style={{ color: '#8a857c' }}>
          {failed ? 'This question could not be read.' : 'Loading…'}
        </p>
      )}
    </div>
  );
}
