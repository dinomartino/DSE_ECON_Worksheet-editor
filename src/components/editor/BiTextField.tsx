'use client';

import { useId } from 'react';
import { isRichTextEmpty, plain } from '@/model/text';
import type { BiText, RichText } from '@/model/types';
import { RichTextEditable } from '@/components/preview/RichTextEditable';
import { useWorksheetStore } from '@/store/worksheetStore';

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
}

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
}: Props) {
  const name = ariaLabel ?? label;
  const id = useId();
  const language = useWorksheetStore((s) => s.mode.language);

  const showEn = language === 'en' || language === 'bilingual';
  const showZh = language === 'zh' || language === 'bilingual';
  const bothVisible = showEn && showZh;
  const halfTranslated =
    bothVisible && isRichTextEmpty(value.en) !== isRichTextEmpty(value.zh);

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
    </div>
  );
}
