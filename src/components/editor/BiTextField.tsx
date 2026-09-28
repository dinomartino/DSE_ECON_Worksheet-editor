'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { isRichTextEmpty, plain } from '@/model/text';
import { fieldNeedsFill } from '@/model/textWalk';
import { sameRuns, type Side } from '@/model/textSlots';
import type { BiText, RichText } from '@/model/types';
import { RichTextEditable } from '@/components/preview/RichTextEditable';
import { isModalLayerOpen } from '@/components/ui/modalLayer';
import {
  canApplyFill,
  FILL_STALE,
  fillButton,
  runFieldFill,
  type FieldTranslate,
} from '@/components/translate/fieldFill';
import { useAiStatus } from '@/settings/aiSettings';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { createRunDeps } from '@/translate/deps';
import { translateOne } from '@/translate/run';

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
  | { kind: 'done'; side: Side; runs: RichText; text: string }
  | { kind: 'error'; side: Side; sent: BiText; text: string };

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
  placeholderEn = 'English…',
  placeholderZh = '中文…',
  ariaLabel,
  translate,
}: Props) {
  const name = ariaLabel ?? label;
  const id = useId();
  const language = useWorksheetStore((s) => s.mode.language);
  const readOnly = useWorksheetStore((s) => s.readOnly);

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
    const sideName = side === 'en' ? 'English' : '中文';
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
              title="One language is missing"
            >
              needs translation
            </span>
          )}
        </div>
      )}
      <div className={bothVisible ? 'grid grid-cols-2 gap-1.5' : ''}>
        {showEn && box('en', placeholderEn, 'en')}
        {showZh && box('zh', placeholderZh, 'zh-HK')}
      </div>
      {fill}
    </div>
  );
}

const FILL_BUTTON_CLASS =
  'h-5 cursor-pointer rounded px-1 text-[11px] font-medium text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';

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
  const configured = useAiStatus().configured;
  const [status, setStatus] = useState<FillStatus | undefined>();
  // Read after the request, so a late answer sees what the teacher has typed since.
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  // A panel inside Setup or a canvas: its modal layer is claimed after this mounts.
  const [modalOpen, setModalOpen] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setModalOpen(isModalLayerOpen()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const button = fillButton({ translate, language, readOnly, needs, configured, modalOpen });

  const openSetup = () => {
    // Checked again at the click: never stack an app dialog over a modal one.
    if (!isModalLayerOpen()) useAppDialogs.getState().openSettings({ section: 'ai', focus: 'key' });
  };

  const run = async (side: Side) => {
    if (!translate) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const sent = latest.current.value;
    setStatus({ kind: 'busy', side });
    const outcome = await runFieldFill(sent, side, translate, () => latest.current.value, abort.signal, {
      createRunDeps,
      translateOne,
    });
    if (abort.signal.aborted) return;
    if (outcome.kind === 'filled') {
      latest.current.onChange(outcome.value);
      const done: FillStatus = { kind: 'done', side, runs: outcome.value[side], text: outcome.note };
      setStatus(done);
      setTimeout(() => setStatus((current) => (current === done ? undefined : current)), 6000);
    } else if (outcome.kind === 'noProvider') {
      setStatus(undefined);
      openSetup();
    } else if (outcome.kind !== 'cancelled') {
      const text = outcome.kind === 'stale' ? FILL_STALE : outcome.message;
      setStatus({ kind: 'error', side, sent, text });
    }
  };

  // A result shows while the filled side is unchanged; an error until the field changes.
  const line =
    status?.kind === 'done' && sameRuns(value[status.side], status.runs)
      ? { side: status.side, text: `✓ ${status.text}`, tone: 'text-ok' }
      : status?.kind === 'error' && canApplyFill(value, status.sent, status.side)
        ? { side: status.side, text: status.text, tone: 'text-danger-ink' }
        : undefined;
  if (!button.show && !line) return null;

  const side = button.show ? button.side : line!.side;
  const busy = status?.kind === 'busy';
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <div className={`flex min-w-0 items-center gap-1.5 ${side === 'zh' ? 'col-start-2' : 'col-start-1'}`}>
        {button.show && (
          <button
            type="button"
            className={FILL_BUTTON_CLASS}
            disabled={busy || button.action === 'blocked'}
            title={button.title}
            onClick={() => (button.action === 'fill' ? void run(button.side) : openSetup())}
          >
            {busy ? 'Filling…' : button.label}
          </button>
        )}
        {line && !busy && <span className={`min-w-0 truncate text-[11px] ${line.tone}`}>{line.text}</span>}
      </div>
    </div>
  );
}
