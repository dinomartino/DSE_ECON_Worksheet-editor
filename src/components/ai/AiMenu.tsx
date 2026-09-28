'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAiMenu, type AiMenuOpen } from '@/assist/menuStore';
import { verbById } from '@/assist/registry';
import { useAiRun } from '@/assist/runStore';
import { scopeChoices, type ScopeChoice } from '@/assist/scope';
import type { VerbContext, VerbInput } from '@/assist/types';
import { Button } from '@/components/ui';
import { ChevronDownIcon, ChevronRightIcon, SparkleIcon } from '@/components/ui/icons';
import { useModalLayer } from '@/components/ui/modalLayer';
import { useAiStatus, type AiStatus } from '@/settings/aiSettings';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { countLabel, highlighted, menuGroups, stepFor, stepHighlight, type MenuGroup, type MenuStep } from './aiMenuModel';
import { SetupCard } from './SetupCard';

export const AI_MENU_WIDTH = 360;
/** Opened by ⌘J (no anchor): centred, just under the toolbar. */
const TOOLBAR_BOTTOM = 56;
const GAP = 8;

/** The one AI door: every verb offered for the menu's scope. Nothing when read-only. */
export function AiMenu() {
  const open = useAiMenu((s) => s.open);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  return open && !readOnly ? <AiMenuPopover open={open} /> : null;
}

const run = (verbId: string, input?: string) => void useAiRun.getState().startVerb(verbId, input);

/** Opens below its anchor, clamped into the viewport; too low → flips above it. */
function place(anchor: AiMenuOpen['anchor'], box: DOMRect): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const at = anchor ?? { x: (vw - box.width) / 2, y: TOOLBAR_BOTTOM };
  const below = at.y + box.height + GAP <= vh;
  const y = below ? at.y : Math.max(GAP, at.y - box.height);
  return { x: Math.max(GAP, Math.min(at.x, vw - box.width - GAP)), y: Math.max(GAP, y) };
}

export function AiMenuPopover({ open }: { open: AiMenuOpen }) {
  useModalLayer();
  const ref = useRef<HTMLDivElement>(null);
  const close = useAiMenu((s) => s.close);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const mode = useWorksheetStore((s) => s.mode);
  const status = useAiStatus();
  // The chip's choices come from the scope the menu opened with, not the one picked since.
  const [choices] = useState(() => scopeChoices(worksheet, open.scope));
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | undefined>();
  const [step, setStep] = useState<MenuStep>({ kind: 'list' });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const inList = useRef(true);
  useEffect(() => {
    inList.current = step.kind === 'list';
  }, [step]);

  const ctx: VerbContext = useMemo(
    () => ({ worksheet, mode, scope: open.scope, scopeLabel: open.scopeLabel }),
    [worksheet, mode, open.scope, open.scopeLabel],
  );
  const groups = useMemo(() => menuGroups(ctx, query), [ctx, query]);
  const current = highlighted(groups, active, open.preselect);

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const next = place(open.anchor, box);
    setPos((prev) => (prev && prev.x === next.x && prev.y === next.y ? prev : next));
  }, [open.anchor, step, groups.length]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element;
      // The toolbar button toggles on its own click.
      if (!ref.current?.contains(target) && !target.closest?.('[data-ai-door]')) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      // A sub-step backs out to the list first.
      if (inList.current) close();
      else setStep({ kind: 'list' });
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [close]);

  const choose = (verbId: string) => {
    const verb = verbById(verbId);
    if (!verb) return;
    const next = stepFor(verb, status.configured);
    if (next === 'run') run(verbId);
    else setStep(next);
  };
  const chooseScope = (choice: ScopeChoice) =>
    useAiMenu.setState((s) => (s.open ? { open: { ...s.open, scope: choice.scope, scopeLabel: choice.label } } : s));

  const stepVerb = step.kind === 'list' ? undefined : verbById(step.verbId);
  let body: React.ReactNode;
  if (step.kind === 'setup' && stepVerb) {
    body = (
      <SetupCard
        verb={{ id: stepVerb.id, label: stepVerb.label(ctx) }}
        onReady={() => (stepVerb.input ? setStep({ kind: 'input', verbId: stepVerb.id }) : run(stepVerb.id))}
        onCancel={() => setStep({ kind: 'list' })}
      />
    );
  } else if (step.kind === 'input' && stepVerb?.input) {
    const id = stepVerb.id;
    body = (
      <InputStep
        title={stepVerb.label(ctx)}
        input={stepVerb.input}
        value={drafts[id] ?? ''}
        onChange={(text) => setDrafts((d) => ({ ...d, [id]: text }))}
        onBack={() => setStep({ kind: 'list' })}
        onGenerate={(text) => run(id, text)}
      />
    );
  } else {
    body = (
      <>
        <div className="flex items-center gap-1.5 border-b border-line p-1.5">
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Search AI actions…"
            aria-label="Search AI actions"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActive(stepHighlight(groups, current, event.key === 'ArrowDown' ? 1 : -1));
              } else if (event.key === 'Enter' && current) {
                event.preventDefault();
                choose(current);
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-ink-subtle"
          />
          <ScopeChip label={open.scopeLabel} choices={choices} onChoose={chooseScope} />
        </div>
        <VerbList
          groups={groups}
          current={current}
          ctx={ctx}
          providerLabel={status.preset.label}
          query={query}
          onHover={setActive}
          onChoose={choose}
        />
        <ProviderFooter status={status} />
      </>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="AI tools"
      data-print-hide
      className="fixed z-[70] flex max-h-[min(34rem,calc(100vh-1rem))] animate-pop-in flex-col overflow-hidden rounded-xl border border-line bg-surface-raised text-ink shadow-2xl"
      style={{ width: AI_MENU_WIDTH, left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      {body}
    </div>
  );
}

function VerbList({
  groups,
  current,
  ctx,
  providerLabel,
  query,
  onHover,
  onChoose,
}: {
  groups: MenuGroup[];
  current: string | undefined;
  ctx: VerbContext;
  providerLabel: string;
  query: string;
  onHover(id: string): void;
  onChoose(id: string): void;
}) {
  if (groups.length === 0) {
    return (
      <p className="px-3 py-4 text-[13px] text-ink-muted">
        {query.trim() ? `No AI action matches “${query.trim()}”` : 'Nothing to do for this selection'}
      </p>
    );
  }
  return (
    <div role="menu" aria-label="AI actions" className="scroll-slim min-h-0 flex-1 overflow-y-auto p-1">
      {groups.map((group, index) => (
        <div key={group.group} className={index > 0 ? 'mt-1 border-t border-line pt-1' : ''}>
          <div className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-medium text-ink-subtle">{group.heading}</div>
          {group.rows.map(({ verb, label, availability, runnable }) => {
            const on = verb.id === current;
            const count = countLabel(availability);
            const sends = on && verb.sendsLine ? verb.sendsLine(ctx, providerLabel) : undefined;
            return (
              <button
                key={verb.id}
                type="button"
                role="menuitem"
                aria-disabled={!runnable || undefined}
                title={availability.disabledReason}
                data-verb={verb.id}
                onMouseEnter={() => runnable && onHover(verb.id)}
                onClick={() => runnable && onChoose(verb.id)}
                className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors duration-100 ease-out-soft ${
                  runnable ? 'cursor-pointer' : 'cursor-default opacity-45'
                } ${on ? 'bg-surface-hover' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {!verb.needsKey && (
                    <span className="shrink-0 rounded bg-ok-soft px-1 text-[10px] font-medium text-ok">free</span>
                  )}
                  {count && <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">{count}</span>}
                  {verb.input && <ChevronRightIcon size={13} className="text-ink-subtle" />}
                </span>
                {sends && <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{sends}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** "Whole paper ▾": the scopes this opening allows. A single choice is a plain label. */
function ScopeChip({ label, choices, onChoose }: { label: string; choices: ScopeChoice[]; onChoose(c: ScopeChoice): void }) {
  const [open, setOpen] = useState(false);
  const chip = 'flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-ink-muted';
  if (choices.length <= 1) return <span className={`${chip} bg-surface-hover`}>{label}</span>;
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Scope: ${label}`}
        onClick={() => setOpen((o) => !o)}
        className={`${chip} cursor-pointer bg-surface-hover transition-colors duration-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        {label}
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <span role="listbox" className="absolute right-0 top-full z-10 mt-1 flex min-w-[10rem] flex-col rounded-lg border border-line bg-surface-raised p-1 shadow-xl">
          {choices.map((choice) => (
            <button
              key={choice.label}
              type="button"
              role="option"
              aria-selected={choice.label === label}
              onClick={() => {
                setOpen(false);
                onChoose(choice);
              }}
              className={`cursor-pointer rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-surface-hover ${
                choice.label === label ? 'font-medium text-ink' : 'text-ink-muted'
              }`}
            >
              {choice.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** A verb that needs the teacher's text first (a pasted source). Back keeps the text. */
export function InputStep({
  title,
  input,
  value,
  onChange,
  onBack,
  onGenerate,
}: {
  title: string;
  input: VerbInput;
  value: string;
  onChange(text: string): void;
  onBack(): void;
  onGenerate(text: string): void;
}) {
  const chars = value.trim().length;
  const short = chars < input.minChars;
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-1.5 text-[13px] font-medium">
        <SparkleIcon size={13} className="text-accent" />
        {title}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] text-ink-muted">{input.label}</span>
        <textarea
          autoFocus
          rows={7}
          value={value}
          placeholder={input.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="scroll-slim resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </label>
      <div className="flex items-center gap-2">
        <span className={`flex-1 text-[11px] tabular-nums ${short && chars > 0 ? 'text-warn-ink' : 'text-ink-subtle'}`}>
          {chars} {chars === 1 ? 'character' : 'characters'}
          {short ? ` · at least ${input.minChars}` : ''}
        </span>
        <Button size="sm" variant="subtle" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" variant="primary" disabled={short} onClick={() => onGenerate(value)}>
          Generate
        </Button>
      </div>
    </div>
  );
}

function ProviderFooter({ status }: { status: AiStatus }) {
  const model = status.preset.models.find((m) => m.id === status.model)?.label ?? status.model;
  return (
    <div className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-[11px] text-ink-muted">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${status.configured ? 'bg-ok' : 'bg-line-strong'}`} />
      <span className="min-w-0 flex-1 truncate">
        {status.preset.label}
        {status.configured ? (model ? ` · ${model}` : '') : ' · not set up'}
      </span>
      <button
        type="button"
        onClick={() => {
          useAiMenu.getState().close();
          useAppDialogs.getState().openSettings({ section: 'ai' });
        }}
        className="shrink-0 cursor-pointer font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
      >
        Settings
      </button>
    </div>
  );
}
