'use client';

import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
} from 'react';
import { Button } from '@/components/ui';
import { Dialog, DialogTabs } from '@/components/ui/Dialog';
import type {
  CloseGuard,
  SettingsSectionDef,
  SettingsSectionProps,
} from '@/settings/sections';
import { appSettings } from '@/settings/store';
import type { SettingsEnv } from '@/settings/types';
import type { SettingsRequest } from '@/store/appDialogs';

/**
 * App Settings: this browser or computer, every worksheet — never the document (that is
 * Setup). Built like `DocumentSettings`: a fixed-height tabbed dialog whose panes scroll
 * on their own. Each pane loads only when shown.
 */

export const settingsDescription = (env: SettingsEnv): string =>
  `Saved ${env.desktop ? 'on this computer' : 'in this browser'}. Applies to every worksheet; never saved in a worksheet.`;
export const STORAGE_BLOCKED =
  "Settings can't be saved in this browser (private mode?). They last until you close the tab.";

/** A deep link to an unknown or unavailable section opens the first one. */
export function initialSection(
  sections: readonly SettingsSectionDef[],
  requested?: string,
): string {
  return sections.find((s) => s.id === requested)?.id ?? sections[0]?.id ?? '';
}

export type CloseIntent = 'done' | 'resume';
export type CloseInput = CloseIntent | 'dismiss' | { answered: boolean };
export type CloseStep =
  | { close: true; resume: boolean }
  | { close: false; asking: CloseIntent | null };

/**
 * Every route out of the dialog. Done, Continue, and 'dismiss' (Escape, ✕, the scrim) ask
 * first over an unsaved key; a second dismiss drops the question; an answer closes only
 * when Discard or the save succeeded. Nothing moves while a save runs.
 */
export function closeStep(
  at: { asking: CloseIntent | null; saving: boolean; guarded: boolean; ready: boolean },
  input: CloseInput,
): CloseStep {
  const stay = (asking: CloseIntent | null): CloseStep => ({ close: false, asking });
  if (at.saving) return stay(at.asking);
  if (typeof input === 'object') {
    if (!at.asking) return stay(null);
    return input.answered ? { close: true, resume: at.asking === 'resume' } : stay(null);
  }
  if (input === 'dismiss' && at.asking) return stay(null);
  const intent = input === 'dismiss' ? 'done' : input;
  if (intent === 'resume' && !at.ready) return stay(at.asking);
  if (at.guarded) return stay(intent);
  return { close: true, resume: intent === 'resume' };
}

/** Runs the guard's answer: Discard proceeds; Save proceeds only when the save succeeded. */
export async function answerGuard(
  guard: CloseGuard,
  answer: 'discard' | 'save',
): Promise<boolean> {
  if (answer === 'discard') return true;
  try {
    return await guard.save.run();
  } catch {
    return false;
  }
}

/** Loads the shown section's pane (only that one) and renders it. */
function SectionPane({
  def,
  ...props
}: { def: SettingsSectionDef } & SettingsSectionProps) {
  const [loaded, setLoaded] = useState<{
    def: SettingsSectionDef;
    Pane: ComponentType<SettingsSectionProps> | null;
  }>();
  useEffect(() => {
    let live = true;
    def.load().then(
      (m) => live && setLoaded({ def, Pane: m.default }),
      () => live && setLoaded({ def, Pane: null }),
    );
    return () => {
      live = false;
    };
  }, [def]);
  if (!loaded || loaded.def !== def)
    return <p className="text-xs text-ink-subtle">Loading…</p>;
  if (!loaded.Pane)
    return (
      <p className="text-xs text-danger-ink">
        This section couldn&rsquo;t load. Close Settings and try again.
      </p>
    );
  const Pane = loaded.Pane;
  return <Pane {...props} />;
}

export function AppSettingsDialog({
  sections,
  env,
  request,
  resume,
  onClose,
}: {
  /** Registered and available; never empty (the host renders nothing otherwise). */
  sections: readonly SettingsSectionDef[];
  env: SettingsEnv;
  request: SettingsRequest;
  /** Set when Translate waits to resume: the footer adds this primary action. */
  resume?: { label: string };
  onClose: (opts: { resume: boolean }) => void;
}) {
  const [active, setActive] = useState(() =>
    initialSection(sections, request.section),
  );
  const [ready, setReady] = useState<{ ready: boolean; hint?: string }>({
    ready: false,
  });
  const [guard, setGuard] = useState<CloseGuard | null>(null);
  const [asking, setAsking] = useState<CloseIntent | null>(null);
  const [saving, setSaving] = useState(false);
  // Read each render: a write refused while the dialog is open shows the line on the next.
  const persistent = appSettings.persistent();

  const def = sections.find((s) => s.id === active) ?? sections[0];
  const deepLinked = def?.id === request.section;

  const setResumeReady = useCallback(
    (value: boolean, hint?: string) => setReady({ ready: value, hint }),
    [],
  );
  const setCloseGuard = useCallback((next: CloseGuard | null) => {
    setGuard(next);
    if (!next) setAsking(null);
  }, []);

  const step = (input: CloseInput, at = { asking, saving, guarded: guard !== null, ready: ready.ready }) => {
    const next = closeStep(at, input);
    if (next.close) onClose({ resume: next.resume });
    else setAsking(next.asking);
  };

  const answer = async (choice: 'discard' | 'save') => {
    if (!guard || !asking || saving) return;
    setSaving(true);
    const proceed = await answerGuard(guard, choice);
    setSaving(false);
    step({ answered: proceed }, { asking, saving: false, guarded: true, ready: ready.ready });
  };

  return (
    <Dialog
      title="Settings"
      description={settingsDescription(env)}
      onClose={() => step('dismiss')}
      width={760}
      height={640}
      scrollBody={false}
      footer={
        <AppSettingsFooter
          resume={resume}
          ready={ready.ready}
          hint={ready.hint}
          asking={asking}
          guard={guard}
          saving={saving}
          onClose={step}
          onAnswer={(choice) => void answer(choice)}
        />
      }
    >
      <DialogTabs<string>
        value={def?.id ?? ''}
        onChange={(id) => {
          if (id === active || guard) return;
          setActive(id);
          setReady({ ready: false });
        }}
        tabs={sections.map((s) => ({ id: s.id, label: s.label, hint: s.hint }))}
      >
        {!persistent && (
          <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-ink">
            {STORAGE_BLOCKED}
          </p>
        )}
        {def && (
          <section aria-labelledby={`settings-${def.id}`}>
            <h3
              id={`settings-${def.id}`}
              className="text-[15px] font-semibold text-ink"
            >
              {def.label}
            </h3>
            <p className="mb-4 mt-0.5 text-xs text-ink-muted">
              {def.description}
            </p>
            <SectionPane
              def={def}
              env={env}
              focus={deepLinked ? request.focus : undefined}
              params={deepLinked ? request.params : undefined}
              resume={resume}
              setResumeReady={setResumeReady}
              setCloseGuard={setCloseGuard}
            />
          </section>
        )}
      </DialogTabs>
    </Dialog>
  );
}

export function AppSettingsFooter({
  resume,
  ready,
  hint,
  asking,
  guard,
  saving,
  onClose,
  onAnswer,
}: {
  resume?: { label: string };
  ready: boolean;
  hint?: string;
  /** Set while the close guard's question replaces the buttons. */
  asking: CloseIntent | null;
  guard: CloseGuard | null;
  saving: boolean;
  onClose: (intent: CloseIntent) => void;
  onAnswer: (answer: 'discard' | 'save') => void;
}) {
  if (asking && guard) {
    return (
      <>
        <span role="status" className="mr-auto text-[13px] text-ink">
          {guard.message}
        </span>
        <Button disabled={saving} onClick={() => onAnswer('discard')}>
          Discard
        </Button>
        <Button
          variant="primary"
          disabled={saving}
          onClick={() => onAnswer('save')}
        >
          {saving ? 'Testing…' : guard.save.label}
        </Button>
      </>
    );
  }
  const blockedHint = resume && !ready ? hint : undefined;
  return (
    <>
      {blockedHint && (
        <span className="mr-auto text-xs text-ink-muted">{blockedHint}</span>
      )}
      <Button
        variant={resume ? 'default' : 'primary'}
        onClick={() => onClose('done')}
      >
        Done
      </Button>
      {resume && (
        <Button
          variant="primary"
          disabled={!ready}
          title={blockedHint}
          onClick={() => onClose('resume')}
        >
          {resume.label}
        </Button>
      )}
    </>
  );
}
