'use client';

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

/**
 * Shared UI primitives.
 *
 * Before these existed, every file declared its own `btn` string and used it for
 * *every* action — a destructive delete looked exactly like a move-up arrow, and a
 * cryptic `W` looked like both. Variants exist so that weight on screen matches
 * consequence: `primary` for the one action a screen is about, `danger` for
 * destructive ones, `subtle` for the row actions that should recede until wanted.
 *
 * Everything below draws from the semantic tokens in `globals.css` rather than naming
 * a palette directly. That is what lets dark mode be one block of variable overrides
 * instead of a `dark:` twin on every className, and it stops a stray `slate-400` from
 * quietly failing contrast in one theme while passing in the other.
 */

type Variant = 'primary' | 'default' | 'subtle' | 'danger' | 'ghostAccent';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary:
    'border-transparent bg-accent text-on-accent shadow-sm hover:bg-accent-hover active:scale-[0.97]',
  default:
    'border-line bg-surface text-ink hover:bg-surface-hover hover:border-line-strong active:scale-[0.97]',
  subtle:
    'border-transparent bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink active:scale-[0.97]',
  danger:
    'border-transparent bg-transparent text-ink-muted hover:bg-danger-soft hover:text-danger-ink active:scale-[0.97]',
  ghostAccent:
    'border-transparent bg-accent-soft text-accent-ink hover:brightness-95 active:scale-[0.97]',
};

/*
 * Sizes are floors, not suggestions. The old `sm` was a 24px box holding 11px text —
 * under the 44px touch guidance and fiddly even with a mouse, which is why row actions
 * felt like they needed aiming. `sm` is now 28px, `md` 34px, and `lg` 40px for the
 * primary actions that should feel confidently clickable.
 */
const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2 text-xs gap-1.5',
  md: 'h-[34px] px-3 text-[13px] gap-1.5',
  lg: 'h-10 px-4 text-sm gap-2',
};

const BASE =
  'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border font-medium ' +
  'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-[var(--ease-out-soft)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
  'disabled:pointer-events-none disabled:opacity-40';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: these buttons show a glyph only, so the name has to come from here. */
  label: string;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  /** React 19 passes refs as an ordinary prop. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A glyph-only button. `label` is mandatory and becomes both the tooltip and the
 * accessible name — the old UI shipped bare `⧉` and `W` buttons with no name at all.
 */
export function IconButton({
  label,
  variant = 'subtle',
  size = 'sm',
  className = '',
  children,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const square = size === 'sm' ? 'h-7 w-7 px-0' : size === 'md' ? 'h-[34px] w-[34px] px-0' : 'h-10 w-10 px-0';
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`${BASE} ${SIZE[size]} ${square} ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Small uppercase region label. One consistent treatment for every section header. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-subtle ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * A group heading inside an editor panel.
 *
 * Replaces `Eyebrow` for anything that names a *region a user works in*, as opposed to
 * a passive label. 10px uppercase with wide tracking is a typographic texture: at that
 * size the letterforms stop resolving into words and the eye reads a grey band, which
 * is why a panel of five such headings scanned as one undifferentiated column. This is
 * sentence case at a size that can actually be read, with the optional `hint` carrying
 * the explanation that used to be crammed alongside in 10px grey.
 */
export function GroupHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        {hint && <span className="ml-1.5 text-[11px] font-normal text-ink-subtle">{hint}</span>}
      </div>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}

/**
 * A titled card. `tone` distinguishes nesting depth without adding more borders:
 * blocks sit on `sunken`, parts on `raised`, so a four-level structure stays legible.
 */
export function Card({
  title,
  badge,
  actions,
  tone = 'raised',
  children,
  className = '',
}: {
  title?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  tone?: 'raised' | 'sunken';
  children: ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === 'raised' ? 'border-line bg-surface-raised' : 'border-line/70 bg-surface-sunken';

  return (
    <section className={`rounded-xl border ${toneClass} ${className}`}>
      {(title || actions || badge) && (
        <header className="flex items-center gap-2 px-3 py-2">
          {title && <span className="min-w-0 flex-1 truncate">{title}</span>}
          {badge}
          {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
        </header>
      )}
      <div className="px-3 pb-3 pt-0">{children}</div>
    </section>
  );
}

/** Neutral count/marks pill. */
export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warn' | 'accent';
}) {
  const tones = {
    neutral: 'bg-surface-hover text-ink-muted',
    warn: 'bg-warn-soft text-warn-ink',
    accent: 'bg-accent-soft text-accent-ink',
  };
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

interface NumberFieldBase {
  label: string;
  min?: number;
  /** Upper bound, clamped on the way out so a caller never sees an out-of-range value. */
  max?: number;
  suffix?: string;
  placeholder?: string;
}

/**
 * `clearable` decides the field's *type*, not just its behaviour.
 *
 * A caller that cannot be emptied keeps the plain `number` signature it always had, so
 * it never has to handle an `undefined` its model has no room for. Only a caller that
 * opts in is asked to — which is what keeps "absent" from leaking into the many places
 * where a marks box genuinely means zero.
 */
type NumberFieldProps = NumberFieldBase &
  (
    | { clearable: true; value: number | undefined; onChange: (value: number | undefined) => void }
    | { clearable?: false; value: number; onChange: (value: number) => void }
  );

/** A labelled number input — used for marks at every level. */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  suffix,
  clearable = false,
  placeholder,
}: NumberFieldProps) {
  // `shrink-0` because a number input has a *correct* width — squeezing it until the
  // digits clip is worse than wrapping the row it sits in. Rows that hold one must
  // therefore be `flex-wrap`, or the field pushes past the 400px sidebar.
  return (
    <label className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        placeholder={placeholder}
        className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-xs tabular-nums text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        onChange={(event) => {
          // An emptied box is only "no value" where the caller says so; everywhere else
          // it stays the 0 this field has always reported.
          if (clearable && event.target.value.trim() === '') {
            (onChange as (value: number | undefined) => void)(undefined);
            return;
          }
          const raw = Math.max(min, Number(event.target.value) || 0);
          onChange(max === undefined ? raw : Math.min(max, raw));
        }}
      />
      {suffix && <span className="text-ink-subtle">{suffix}</span>}
    </label>
  );
}

/**
 * A labelled dropdown. One treatment for every select in the app.
 *
 * `label` is optional because a select inside a `Field` already has a heading above
 * it — repeating the word beside the control makes the row read as two labels.
 */
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-muted">
      {label && <span className="shrink-0">{label}</span>}
      <select
        className="h-8 min-w-0 flex-1 cursor-pointer rounded-lg border border-line bg-surface px-2 text-xs text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
        value={value}
        onChange={(event) => {
          const match = options.find((option) => String(option.value) === event.target.value);
          if (match) onChange(match.value);
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A checkbox with a label, for the many on/off design switches. */
export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted transition-colors hover:text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-line text-accent accent-[var(--accent)] focus:ring-2 focus:ring-accent/40"
      />
      {label}
    </label>
  );
}

/** Mutually exclusive choice, replacing rows of look-alike toggle buttons. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-xl bg-surface-sunken p-1 ring-1 ring-inset ring-line"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title ?? option.label}
            onClick={() => onChange(option.value)}
            className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ease-[var(--ease-out-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Where a figure sits in the content column — `w:jc` on the picture's paragraph.
 *
 * Centre is the default and every figure in the reference papers uses it, so this exists
 * for the exception rather than the rule. One component serves both picture kinds: an
 * image and a diagram answer the identical question, and two controls would be two
 * chances to spell the same choice differently. It lives here rather than in
 * `BlockEditor` because `DiagramEditor` needs it too and is imported *by* `BlockEditor` —
 * reaching back up would close a cycle.
 */
export function FigureAlignField({
  value,
  onChange,
}: {
  value: 'left' | 'center' | 'right' | undefined;
  onChange: (align: 'left' | 'center' | 'right' | undefined) => void;
}) {
  return (
    <Segmented<'left' | 'center' | 'right'>
      label="Position"
      value={value ?? 'center'}
      options={[
        { value: 'left', label: 'Left', title: 'Align the figure with the text column' },
        { value: 'center', label: 'Centre', title: 'Centre the figure (the usual choice)' },
        { value: 'right', label: 'Right', title: 'Align the figure to the right margin' },
      ]}
      // Centre is written as *nothing*, so an untouched figure stores no alignment and
      // exports byte-identically to what it did before this control existed.
      onChange={(align) => onChange(align === 'center' ? undefined : align)}
    />
  );
}
