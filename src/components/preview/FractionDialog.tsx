'use client';

import { Fragment, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { useShortcutLabel } from '@/components/ui/useShortcutLabel';
import { useMessages } from '@/i18n/language';
import { plain } from '@/model/text';
import type { RichText } from '@/model/types';
import { FRACTION_DIALOG_MESSAGES } from './messages';
import { RichTextEditable } from './RichTextEditable';
import { toggledRange, type RunShortcut } from './runShortcuts';

/**
 * Type a stacked fraction (k-0479, GitHub #8): a numerator and a denominator, each its own
 * small rich-text field, so Q₁ and P² work inside one exactly as they do in a stem (the
 * same ⌘= / ⌘⇧= keys, and X₂ / X² buttons for a touch screen with no keyboard). What it
 * hands back is two run lists; `model/fraction.ts:fractionRuns` stores them.
 */
export function FractionDialog({
  initial,
  lang,
  onSubmit,
  onRemove,
  onClose,
}: {
  /** The fraction being edited; absent to insert a new one. */
  initial?: { num: RichText; den: RichText };
  lang: 'en' | 'zh';
  onSubmit: (num: RichText, den: RichText) => void;
  /** Offered when editing: turn the fraction back into "num/den" text. */
  onRemove?: () => void;
  onClose: () => void;
}) {
  const m = useMessages(FRACTION_DIALOG_MESSAGES);
  const subKey = useShortcutLabel('=');
  const supKey = useShortcutLabel('Shift+=').replace('⌘Shift+', '⌘⇧');
  const [num, setNum] = useState<RichText>(initial?.num ?? []);
  const [den, setDen] = useState<RichText>(initial?.den ?? []);
  const [tried, setTried] = useState(false);
  /** The field the X₂ / X² buttons act on, and its last selection. */
  const focused = useRef<{ which: 'num' | 'den'; start: number; end: number }>({ which: 'num', start: 0, end: 0 });

  const ready = plain(num).trim().length > 0 && plain(den).trim().length > 0;
  const submit = () => {
    if (!ready) {
      setTried(true);
      return;
    }
    onSubmit(oneLine(num), oneLine(den));
  };

  /*
   * A button press on a touch screen: a selection is lowered or raised; with only a caret,
   * the character just before it is (type "Q1", tap X₂, get Q₁), since a phone or iPad
   * keyboard has no ⌘= to switch on before typing.
   */
  const script = (shortcut: RunShortcut) => {
    const { which, start, end } = focused.current;
    const runs = which === 'num' ? num : den;
    const [from, to] = start < end ? [start, end] : [Math.max(0, start - 1), start];
    if (from >= to) return;
    const next = toggledRange(runs, from, to, shortcut);
    (which === 'num' ? setNum : setDen)(next);
  };

  const field = (which: 'num' | 'den') => (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-ink-muted">
        {which === 'num' ? m.numerator : m.denominator}
      </span>
      <span className="block min-h-9 rounded-md border border-line bg-white px-2 py-1.5 font-serif text-[15px] text-black focus-within:ring-2 focus-within:ring-hud-focus">
        <RichTextEditable
          value={which === 'num' ? num : den}
          onChange={which === 'num' ? setNum : setDen}
          autoFocus={which === 'num'}
          lang={lang === 'zh' ? 'zh-HK' : 'en'}
          ariaLabel={which === 'num' ? m.numerator : m.denominator}
          className="block min-h-6 outline-none"
          onSelectionChange={(range) => {
            if (range) focused.current = { which, ...range };
          }}
          onKeyDown={(event) => {
            // Enter puts the fraction in; a part is one line.
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
      </span>
    </label>
  );

  return (
    // Portal-free, so keep its keys and clicks out of the page's own handlers; Esc goes on
    // to the dialog's window listener, which closes it.
    <div
      data-print-hide
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation();
      }}
    >
      <Dialog
        title={initial ? m.editTitle : m.insertTitle}
        width={440}
        onClose={onClose}
        footer={
          <>
            {onRemove && (
              <Button variant="subtle" className="mr-auto" onClick={onRemove}>
                {m.remove}
              </Button>
            )}
            <Button variant="subtle" onClick={onClose}>
              {m.cancel}
            </Button>
            <Button variant="primary" onClick={submit}>
              {initial ? m.update : m.insert}
            </Button>
          </>
        }
      >
        <div className="space-y-3 px-5 py-4 text-[13px] text-ink">
          {field('num')}
          {field('den')}
          <div className="flex items-center gap-2">
            {(['subscript', 'superscript'] as const).map((shortcut) => (
              <button
                key={shortcut}
                type="button"
                className="flex h-8 min-w-9 items-center justify-center rounded-md border border-line bg-surface px-2 text-[13px] hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-focus"
                aria-label={shortcut === 'subscript' ? `X₂ (${subKey})` : `X² (${supKey})`}
                title={shortcut === 'subscript' ? `X₂ (${subKey})` : `X² (${supKey})`}
                // Keep the caret in the field the button acts on.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => script(shortcut)}
              >
                <span aria-hidden>
                  X{shortcut === 'subscript' ? <sub className="text-[9px]">2</sub> : <sup className="text-[9px]">2</sup>}
                </span>
              </button>
            ))}
            <span className="ml-auto text-[12px] text-ink-muted">{m.preview}</span>
            <span className="min-w-12 rounded-md border border-line bg-white px-3 py-1 text-center font-serif text-[15px] text-black">
              {ready ? (
                <span className="econ-fraction">
                  <span className="econ-fraction-num">{runsPreview(num)}</span>
                  <span className="econ-fraction-den">{runsPreview(den)}</span>
                </span>
              ) : (
                '—'
              )}
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-ink-muted">{m.hint(subKey, supKey)}</p>
          {tried && !ready && <p className="text-[12px] text-danger">{m.empty}</p>}
        </div>
      </Dialog>
    </div>
  );
}

/** A part is one line: a break typed in a field becomes a space. */
function oneLine(runs: RichText): RichText {
  return runs.map((run) => (run.text.includes('\n') ? { ...run, text: run.text.replace(/\n+/g, ' ') } : run));
}

/** The dialog's own preview of a part: emphasis and scripts, as the page draws them. */
function runsPreview(runs: RichText) {
  return runs.map((run, index) => {
    let content: React.ReactNode = run.text;
    if (run.bold) content = <strong>{content}</strong>;
    if (run.italic) content = <em>{content}</em>;
    if (run.underline) content = <u>{content}</u>;
    if (run.vertAlign === 'superscript') content = <sup>{content}</sup>;
    if (run.vertAlign === 'subscript') content = <sub>{content}</sub>;
    return <Fragment key={index}>{content}</Fragment>;
  });
}
