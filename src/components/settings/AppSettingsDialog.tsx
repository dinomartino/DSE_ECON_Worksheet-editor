'use client';

import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
} from 'react';
import { Button } from '@/components/ui';
import { Dialog, DialogTabs } from '@/components/ui/Dialog';
import { localize, resolveMessages } from '@/i18n/catalogue';
import { uiLanguage, useMessages, useUiLanguage } from '@/i18n/language';
import type {
  CloseGuard,
  SettingsSectionDef,
  SettingsSectionProps,
} from '@/settings/sections';
import { appSettings } from '@/settings/store';
import type { SettingsEnv } from '@/settings/types';
import type { SettingsRequest } from '@/store/appDialogs';
import { SETTINGS_MESSAGES } from './messages';

/**
 * App Settings: this browser or computer, every worksheet — never the document (that is
 * Setup). Built like `DocumentSettings`: a fixed-height tabbed dialog whose panes scroll
 * on their own. Each pane loads only when shown.
 */

export const settingsDescription = (env: SettingsEnv, lang = uiLanguage()): string =>
  resolveMessages(SETTINGS_MESSAGES, lang).description(env.desktop);

/** A deep link to an unknown or unavailable section opens the first one. */
export function initialSection(
  sections: readonly SettingsSectionDef[],
  requested?: string,
): string {
  return sections.find((s) => s.id === requested)?.id ?? sections[0]?.id ?? '';
}

export type CloseInput = 'done' | 'dismiss' | { answered: boolean };
export type CloseStep = { close: true } | { close: false; asking: boolean };

/**
 * Every route out of the dialog. Done and 'dismiss' (Escape, ✕, the scrim) ask first over
 * an unsaved key; a second dismiss drops the question; an answer closes only when Discard
 * or the save succeeded. Nothing moves while a save runs.
 */
export function closeStep(at: { asking: boolean; saving: boolean; guarded: boolean }, input: CloseInput): CloseStep {
  const stay = (asking: boolean): CloseStep => ({ close: false, asking });
  if (at.saving) return stay(at.asking);
  if (typeof input === 'object') {
    if (!at.asking) return stay(false);
    return input.answered ? { close: true } : stay(false);
  }
  if (input === 'dismiss' && at.asking) return stay(false);
  if (at.guarded) return stay(true);
  return { close: true };
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
  const m = useMessages(SETTINGS_MESSAGES);
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
    return <p className="text-xs text-ink-subtle">{m.loading}</p>;
  if (!loaded.Pane)
    return (
      <p className="text-xs text-danger-ink">{m.loadFailed}</p>
    );
  const Pane = loaded.Pane;
  return <Pane {...props} />;
}

export function AppSettingsDialog({
  sections,
  env,
  request,
  onClose,
}: {
  /** Registered and available; never empty (the host renders nothing otherwise). */
  sections: readonly SettingsSectionDef[];
  env: SettingsEnv;
  request: SettingsRequest;
  onClose: () => void;
}) {
  const [active, setActive] = useState(() =>
    initialSection(sections, request.section),
  );
  const [guard, setGuard] = useState<CloseGuard | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const lang = useUiLanguage();
  const m = resolveMessages(SETTINGS_MESSAGES, lang);
  // Read each render: a write refused while the dialog is open shows the line on the next.
  const persistent = appSettings.persistent();

  const def = sections.find((s) => s.id === active) ?? sections[0];
  const deepLinked = def?.id === request.section;

  const setCloseGuard = useCallback((next: CloseGuard | null) => {
    setGuard(next);
    if (!next) setAsking(false);
  }, []);

  const step = (input: CloseInput, at = { asking, saving, guarded: guard !== null }) => {
    const next = closeStep(at, input);
    if (next.close) onClose();
    else setAsking(next.asking);
  };

  const answer = async (choice: 'discard' | 'save') => {
    if (!guard || !asking || saving) return;
    setSaving(true);
    const proceed = await answerGuard(guard, choice);
    setSaving(false);
    step({ answered: proceed }, { asking, saving: false, guarded: true });
  };

  return (
    <Dialog
      title={m.title}
      description={settingsDescription(env, lang)}
      onClose={() => step('dismiss')}
      size="large"
      scrollBody={false}
      footer={
        <AppSettingsFooter
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
        }}
        tabs={sections.map((s) => ({
          id: s.id,
          label: localize(s.label, lang),
          hint: s.hint === undefined ? undefined : localize(s.hint, lang),
        }))}
      >
        {!persistent && (
          <p className="mb-4 max-w-[720px] rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-ink">
            {m.storageBlocked}
          </p>
        )}
        {def && (
          // The large dialog is for long lists: a form pane keeps a form's width, so its
          // fields and option cards do not stretch across the panel.
          <section
            aria-labelledby={`settings-${def.id}`}
            className={def.wide ? undefined : 'max-w-[720px]'}
          >
            <h3
              id={`settings-${def.id}`}
              className="text-[15px] font-semibold text-ink"
            >
              {localize(def.label, lang)}
            </h3>
            <p className="mb-4 mt-0.5 max-w-[640px] text-xs text-ink-muted">
              {localize(def.description, lang)}
            </p>
            <SectionPane
              def={def}
              env={env}
              focus={deepLinked ? request.focus : undefined}
              params={deepLinked ? request.params : undefined}
              setCloseGuard={setCloseGuard}
            />
          </section>
        )}
      </DialogTabs>
    </Dialog>
  );
}

export function AppSettingsFooter({
  asking,
  guard,
  saving,
  onClose,
  onAnswer,
}: {
  /** Set while the close guard's question replaces the buttons. */
  asking: boolean;
  guard: CloseGuard | null;
  saving: boolean;
  onClose: (intent: 'done') => void;
  onAnswer: (answer: 'discard' | 'save') => void;
}) {
  const m = useMessages(SETTINGS_MESSAGES);
  if (asking && guard) {
    return (
      <>
        <span role="status" className="mr-auto text-[13px] text-ink">
          {guard.message}
        </span>
        <Button disabled={saving} onClick={() => onAnswer('discard')}>
          {m.discard}
        </Button>
        <Button
          variant="primary"
          disabled={saving}
          onClick={() => onAnswer('save')}
        >
          {saving ? m.testing : guard.save.label}
        </Button>
      </>
    );
  }
  return (
    <Button variant="primary" onClick={() => onClose('done')}>
      {m.done}
    </Button>
  );
}
