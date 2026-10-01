'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { isRichTextEmpty } from '@/model/text';
import { fieldNeedsFill } from '@/model/textWalk';
import { sameRuns, type Side } from '@/model/textSlots';
import type { BiText, RichText } from '@/model/types';
import { RichTextEditable } from '@/components/preview/RichTextEditable';
import { isModalLayerOpen } from '@/components/ui/modalLayer';
import { SparkleIcon } from '@/components/ui/icons';
import {
  afterNoProvider,
  canApplyFill,
  FILL_STALE,
  fillButton,
  INSERT_ANYWAY,
  runFieldFill,
  switchButton,
  type FieldFillDeps,
  type FieldFillOutcome,
  type FieldTranslate,
} from '@/components/translate/fieldFill';
import type { ProviderId } from '@/ai/types';
import { peekSecret } from '@/platform/secrets';
import { AI_SETTINGS, useAiStatus } from '@/settings/aiSettings';
import { appSettings } from '@/settings/store';
import { useAppDialogs } from '@/store/appDialogs';
import { useFieldScope } from './fieldScope';
import { useMessages } from '@/i18n/language';
import { BITEXT_MESSAGES } from './BiTextField.messages';

/**
 * Bilingual input (§5.2).
 *
 * Which boxes are visible follows the selected language mode: English-only shows
 * just the EN box, 中文-only just the 中文 box, bilingual shows both. Switching mode
 * only changes visibility — the hidden language's content is never cleared, because
 * the value object is always patched rather than replaced.
 *
 * In bilingual mode each box carries a small EN/中文 tag. Without it the two
 * side-by-side boxes are indistinguishable when both happen to be empty, which
 * was a real source of "which box am I in?" confusion.
 *
 * The boxes are `RichTextEditable`, not textareas, so a bold phrase reads as bold here
 * exactly as it does on the page. A textarea can only hold a string, which forced the
 * model's `**bold**` storage form into the teacher's view — and, worse, made every
 * keystroke re-parse it, silently dropping the per-run size, colour and font that the
 * marker string cannot spell.
 */

interface Props {
  label?: string;
  value: BiText;
  onChange: (value: BiText) => void;
  rows?: number;
  placeholderEn?: string;
  placeholderZh?: string;
  /**
   * Accessible name when the visible label lives outside this component — a field
   * inside a settings `Field` group already shows its name above, so repeating it
   * would print the word twice. Without this the textarea is announced as bare
   * "English", which is the same name every other bilingual field on screen has.
   */
  ariaLabel?: string;
  /** What the field holds, for the inline AI fill (§A.4). Without it there is no fill
   *  button: a guessed kind would drop the wording rules. */
  translate?: FieldTranslate;
}

/** The fill's transient line: a result (6 s, or until the side changes) or an error
 *  (until the field changes). */
type FillStatus =
  | { kind: 'busy'; side: Side }
  | { kind: 'done'; side: Side; runs: RichText; text: string; tone: 'ok' | 'warn' }
  /** A proposal the review would leave unticked: shown, not written. */
  | { kind: 'look'; side: Side; sent: BiText; runs: RichText; text: string }
  | { kind: 'error'; side: Side; sent: BiText; text: string; switchTo: ProviderId[] };

/*
 * The box grows with its content on its own: a contenteditable is sized by what is in
 * it, so the `scrollHeight` dance a textarea needed is gone. `min-h` keeps an empty
 * field the height of the two rows the old `rows={2}` reserved, so a column of empty
 * fields does not collapse into a row of thin slots.
 */
const INPUT_CLASS =
  'block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent';

/** Shown in place of an empty field — authoring guidance, so it must not be content. */
function Placeholder({ text }: { text: string }) {
  return (
    <span className="pointer-events-none absolute left-2 top-1.5 select-none text-sm text-ink-subtle">
      {text}
    </span>
  );
}

export function BiTextField({
  label,
  value,
  onChange,
  rows = 2,
  placeholderEn,
  placeholderZh,
  ariaLabel,
  translate,
}: Props) {
  const m = useMessages(BITEXT_MESSAGES);
  const name = ariaLabel ?? label;
  const id = useId();
  const { language, readOnly } = useFieldScope();

  const showEn = language === 'en' || language === 'bilingual';
  const showZh = language === 'zh' || language === 'bilingual';
  const bothVisible = showEn && showZh;
  // Symbol-only text prints fine in both editions (a copy would print twice), so it
  // gets neither the tag nor the fill.
  const needs = fieldNeedsFill(value);
  const halfTranslated = bothVisible && needs !== null;
  const fill = useFieldFill(value, onChange, translate, needs, language, readOnly);

  // One line of the field's own text, times the requested rows, plus its padding.
  const minHeight = `${rows * 1.25 + 0.75}rem`;

  const tag = (text: string) => (
    <span className="pointer-events-none absolute right-1.5 top-1 select-none text-[9px] font-medium uppercase tracking-wide text-ink-subtle ">
      {text}
    </span>
  );

  const box = (side: 'en' | 'zh', placeholder: string, langTag: string) => {
    // The language names the box when nothing else does — never the `lang` tag, which
    // announces as "en" and says nothing about what the field is for.
    const sideName = side === 'en' ? m.sideEn : m.sideZh;
    return (
    <div className="relative">
      <RichTextEditable
        id={`${id}-${side}`}
        value={(value[side] ?? []) as RichText}
        // Patching keeps the hidden language's runs intact (§5.2).
        onChange={(next) => onChange({ ...value, [side]: next })}
        className={INPUT_CLASS}
        style={{ minHeight }}
        lang={langTag}
        ariaLabel={name ? `${name} (${sideName})` : sideName}
      />
      {isRichTextEmpty(value[side]) && <Placeholder text={placeholder} />}
      {bothVisible && tag(side === 'en' ? 'en' : '中')}
    </div>
    );
  };

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center gap-1.5">
          <label
            htmlFor={`${id}-${showEn ? 'en' : 'zh'}`}
            className="text-[11px] font-medium text-ink-muted "
          >
            {label}
          </label>
          {halfTranslated && (
            <span
              className="rounded bg-warn-soft px-1 py-px text-[9px] font-medium text-warn-ink"
              title={m.oneMissing}
            >
              {m.needsTranslation}
            </span>
          )}
        </div>
      )}
      <div className={bothVisible ? 'grid grid-cols-2 gap-1.5' : ''}>
        {showEn && box('en', placeholderEn ?? m.placeholderEn, 'en')}
        {showZh && box('zh', placeholderZh ?? m.placeholderZh, 'zh-HK')}
      </div>
      {fill}
    </div>
  );
}

const FILL_BUTTON_CLASS =
  'inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded px-1 text-[11px] font-medium text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';

/** The pipeline loads on the first fill, so it stays out of the editor's first load. */
async function loadFillDeps(): Promise<FieldFillDeps> {
  const [{ createRunDeps }, { translateOne }] = await Promise.all([
    import('@/translate/deps'),
    import('@/translate/run'),
  ]);
  return { createRunDeps, translateOne };
}

/** A key is saved for this provider (memory, web storage, or a desktop Keychain flag). */
function keySaved(provider: ProviderId): boolean {
  return peekSecret(`ai:${provider}`) !== null || appSettings.read(AI_SETTINGS).keychainSaved[provider] === true;
}

/**
 * The inline fill under the field's missing side (§A.4): one field, the same pipeline as
 * Translate, written through the field's own `onChange` (one commit, one undo) and only
 * over the same source and a still-empty side. It never opens a dialog over a modal.
 */
function useFieldFill(
  value: BiText,
  onChange: (value: BiText) => void,
  translate: FieldTranslate | undefined,
  needs: Side | null,
  language: 'en' | 'zh' | 'bilingual',
  readOnly: boolean,
) {
  const m = useMessages(BITEXT_MESSAGES);
  const configured = useAiStatus().configured;
  const [status, setStatus] = useState<FillStatus | undefined>();
  // Read after the request, so a late answer sees what the teacher has typed since.
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  // A panel inside Setup or a canvas: its modal layer may be claimed after this mounts.
  const [modalOpen, setModalOpen] = useState(isModalLayerOpen);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setModalOpen(isModalLayerOpen()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const button = fillButton({ translate, language, readOnly, needs, configured, modalOpen });

  // Checked again at the click: never stack an app dialog over a modal one.
  const openSettings = (params?: Record<string, string>) => {
    if (isModalLayerOpen()) return false;
    useAppDialogs.getState().openSettings(params ? { section: 'ai', focus: 'key', params } : { section: 'ai', focus: 'key' });
    return true;
  };

  const showDone = (side: Side, runs: RichText, text: string, tone: 'ok' | 'warn') => {
    const done: FillStatus = { kind: 'done', side, runs, text, tone };
    setStatus(done);
    setTimeout(() => setStatus((current) => (current === done ? undefined : current)), 6000);
  };

  const run = async (side: Side) => {
    if (!translate) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const sent = latest.current.value;
    setStatus({ kind: 'busy', side });
    const outcome = await loadFillDeps().then(
      (deps) => runFieldFill(sent, side, translate, () => latest.current.value, abort.signal, deps),
      (): FieldFillOutcome => ({ kind: 'failed', message: m.loadFailed, switchTo: [] }),
    );
    if (abort.signal.aborted) return;
    if (outcome.kind === 'filled') {
      latest.current.onChange(outcome.value);
      showDone(side, outcome.value[side], outcome.note, outcome.tone);
    } else if (outcome.kind === 'needsLook') {
      setStatus({ kind: 'look', side, sent, runs: outcome.runs, text: outcome.note });
    } else if (outcome.kind === 'noProvider') {
      const next = afterNoProvider(outcome, isModalLayerOpen());
      if ('open' in next) {
        openSettings(next.open);
        setStatus(undefined);
      } else setStatus({ kind: 'error', side, sent, text: next.line, switchTo: [] });
    } else if (outcome.kind === 'stale') {
      setStatus({ kind: 'error', side, sent, text: FILL_STALE, switchTo: [] });
    } else if (outcome.kind === 'failed') {
      setStatus({ kind: 'error', side, sent, text: outcome.message, switchTo: outcome.switchTo });
    }
  };

  const insertAnyway = (look: Extract<FillStatus, { kind: 'look' }>) => {
    const now = latest.current.value;
    if (!canApplyFill(now, look.sent, look.side)) {
      setStatus({ kind: 'error', side: look.side, sent: look.sent, text: FILL_STALE, switchTo: [] });
      return;
    }
    latest.current.onChange({ ...now, [look.side]: look.runs });
    showDone(look.side, look.runs, m.inserted, 'warn');
  };

  const switchProvider = (provider: ProviderId, side: Side) => {
    if (keySaved(provider)) {
      appSettings.write(AI_SETTINGS, { provider });
      void run(side);
    } else openSettings({ provider, reason: 'region' });
  };

  // A result shows while the filled side is unchanged; a proposal or an error until the
  // field changes.
  const current =
    status?.kind === 'done'
      ? sameRuns(value[status.side], status.runs) && status
      : (status?.kind === 'look' || status?.kind === 'error') && canApplyFill(value, status.sent, status.side) && status;
  if (!button.show && !current) return null;

  const side = button.show ? button.side : (current as Exclude<FillStatus, { kind: 'busy' }>).side;
  const busy = status?.kind === 'busy';
  const tone = !current
    ? ''
    : current.kind === 'error'
      ? 'text-danger-ink'
      : current.kind === 'look' || (current.kind === 'done' && current.tone === 'warn')
        ? 'text-warn-ink'
        : 'text-ok';
  const text = !current ? '' : current.kind === 'done' && current.tone === 'ok' ? `✓ ${current.text}` : current.text;
  // Action buttons (switch provider, insert anyway) need both columns: in one half they
  // overflow the panel and the message truncates to nothing.
  const wide = !!current && !busy && (current.kind === 'look' || (current.kind === 'error' && current.switchTo.length > 0));
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <div
        className={`flex min-w-0 items-center gap-1.5 ${
          wide ? 'col-span-2 flex-wrap' : side === 'zh' ? 'col-start-2' : 'col-start-1'
        }`}
      >
        {button.show && (
          <button
            type="button"
            className={FILL_BUTTON_CLASS}
            disabled={busy || button.action === 'blocked'}
            title={button.title}
            onClick={() => (button.action === 'fill' ? void run(button.side) : openSettings())}
          >
            {/* The AI door's mark, so a field's fill reads as the same AI. */}
            <SparkleIcon size={11} className="text-accent" />
            {busy ? m.filling : button.label}
          </button>
        )}
        {current && !busy && (
          <span className={`min-w-0 text-[11px] ${tone} ${wide ? 'order-first basis-full' : 'truncate'}`} title={text}>
            {text}
          </span>
        )}
        {current && !busy && current.kind === 'look' && (
          <button type="button" className={FILL_BUTTON_CLASS} onClick={() => insertAnyway(current)}>
            {INSERT_ANYWAY}
          </button>
        )}
        {current && !busy && current.kind === 'error' &&
          current.switchTo.map((provider) => {
            const b = switchButton(provider, keySaved(provider), modalOpen);
            return (
              <button
                key={provider}
                type="button"
                className={FILL_BUTTON_CLASS}
                disabled={b.action === 'blocked'}
                title={b.title}
                onClick={() => switchProvider(provider, current.side)}
              >
                {b.label}
              </button>
            );
          })}
      </div>
    </div>
  );
}
