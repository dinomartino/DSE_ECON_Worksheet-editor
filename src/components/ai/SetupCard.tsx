'use client';

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { presetFor } from '@/ai/providers';
import type { ProviderId } from '@/ai/types';
import { useAiMenu } from '@/assist/menuStore';
import { Button, CheckField } from '@/components/ui';
import { canTest, TOP_PROVIDERS, type AiSetupState } from '@/components/settings/sections/aiSection/aiSetup';
import { liveDeps, secretPlatform } from '@/components/settings/sections/aiSection/aiSetupLive';
import { createAiSetupRunner } from '@/components/settings/sections/aiSection/aiSetupRunner';
import { HkNote, ProviderBadges } from '@/components/settings/sections/aiSection/providerBadges';
import {
  createSetupCardFlow,
  initialSetupCard,
  regionLine,
  type SetupCardFlow,
} from '@/components/settings/sections/aiSection/setupCardFlow';
import { isDesktop, openExternal } from '@/platform';
import { peekSecret, secretStoreLabel } from '@/platform/secrets';
import { AI_SETTINGS } from '@/settings/aiSettings';
import { appSettings } from '@/settings/store';
import { useAppDialogs } from '@/store/appDialogs';

/**
 * First-run AI setup inside the menu: pick a provider, paste a key, Save & continue.
 * Shares the Settings AI section's reducer and runner; nothing is sent before the click.
 * A passing test saves the key, commits the provider and calls `onReady` (the verb runs).
 */

export interface SetupCardProps {
  verb?: { id: string; label: string };
  // Optional only while the contract-step AiMenu mounts `<SetupCard />` bare.
  onReady?(): void;
  onCancel?(): void;
}

const closeMenu = () => useAiMenu.getState().close();

export function SetupCard({ verb, onReady = closeMenu, onCancel = closeMenu }: SetupCardProps) {
  const [env] = useState(() => ({ desktop: isDesktop() }));
  const [runner] = useState(() =>
    createAiSetupRunner(liveDeps(env), initialSetupCard(appSettings.read(AI_SETTINGS), env, (p) => peekSecret(`ai:${p}`))),
  );
  const state = useSyncExternalStore(runner.subscribe, runner.current, runner.current);
  const flow = useMemo(() => createSetupCardFlow(runner, onReady), [runner, onReady]);
  useEffect(() => () => runner.dispose(), [runner]);

  return (
    <SetupCardView
      verbLabel={verb?.label}
      state={state}
      desktop={env.desktop}
      platform={secretPlatform(env.desktop)}
      flow={flow}
      onCancel={onCancel}
      onMore={() => {
        closeMenu();
        useAppDialogs.getState().openSettings({ section: 'ai' });
      }}
      onGetKey={(url) => void openExternal(url)}
    />
  );
}

export interface SetupCardViewProps {
  verbLabel?: string;
  state: AiSetupState;
  desktop: boolean;
  platform: 'mac' | 'windows' | 'web';
  flow: SetupCardFlow;
  onCancel(): void;
  onMore(): void;
  onGetKey(url: string): void;
}

/** Where the key is kept, in one line under the header. */
export function keepsLine(desktop: boolean, platform: 'mac' | 'windows' | 'web'): string {
  const where = desktop ? secretStoreLabel('keychain', platform) : 'this browser';
  return `Uses your own AI account. Your key stays on this computer, in ${where}.`;
}

/** "Gemini", "DeepSeek", "Qwen". */
const shortName = (id: ProviderId) => presetFor(id).label.replace(/^Google /, '').split(' ')[0];

export function SetupCardView(props: SetupCardViewProps) {
  const { state, flow, desktop } = props;
  const preset = presetFor(state.provider);
  const testing = state.test.kind === 'testing';
  const refused = state.regionRefusedBy !== null;
  return (
    <div data-setup-card className="space-y-2.5 px-2.5 pb-2.5 pt-1.5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
            <span aria-hidden className="text-accent-ink">✦</span> {props.verbLabel ?? 'Set up AI'}
          </span>
          <span className="shrink-0 rounded-full bg-surface-hover px-1.5 py-px text-[10px] text-ink-subtle">needs a key</span>
        </div>
        <p className="text-[11px] leading-snug text-ink-muted">{keepsLine(desktop, props.platform)}</p>
      </div>
      <div role="radiogroup" aria-label="AI provider" className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {TOP_PROVIDERS.map((id) => (
          <ProviderRow
            key={id}
            id={id}
            selected={id === state.provider}
            highlight={refused && presetFor(id).hk.status === 'available'}
            onPick={() => flow.pick(id)}
          />
        ))}
      </div>
      <HkNote preset={preset} />
      <div className="flex items-center justify-between gap-2 text-[11px]">
        {preset.keyUrl ? <LinkButton onClick={() => props.onGetKey(preset.keyUrl!)}>Get a {shortName(preset.id)} key ↗</LinkButton> : <span />}
        <button type="button" onClick={props.onMore} className="cursor-pointer text-ink-muted hover:text-ink hover:underline">
          More providers…
        </button>
      </div>
      <KeyField {...props} />
      <StatusLine {...props} />
      {!desktop && <CheckField label="Remember on this computer" checked={state.remember} onChange={flow.remember} />}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button size="sm" variant="subtle" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={testing || !canTest(state)} onClick={() => void flow.submit()}>
          {testing ? 'Testing…' : 'Save & continue'}
        </Button>
      </div>
    </div>
  );
}

function ProviderRow({ id, selected, highlight, onPick }: { id: ProviderId; selected: boolean; highlight: boolean; onPick(): void }) {
  const preset = presetFor(id);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-provider={id}
      onClick={onPick}
      className={`flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${highlight && !selected ? 'bg-ok-soft' : ''}`}
    >
      <span
        aria-hidden
        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${selected ? 'border-accent' : 'border-line-strong'}`}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{preset.label}</span>
      <ProviderBadges preset={preset} />
    </button>
  );
}

function KeyField({ state, flow }: SetupCardViewProps) {
  const [show, setShow] = useState(false);
  const preset = presetFor(state.provider);
  return (
    <span className="flex items-center rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
      {/* Not a login field: no form, no name, no autofill (as in Settings). */}
      <input
        type={show ? 'text' : 'password'}
        aria-label={`${preset.label} API key`}
        placeholder={`Paste your ${shortName(preset.id)} key`}
        value={state.key.kind === 'editing' ? state.key.draft : ''}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
        data-1p-ignore=""
        data-lpignore="true"
        onChange={(event) => flow.draft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void flow.submit();
        }}
        className="h-8 min-w-0 flex-1 bg-transparent px-2 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-ink-subtle"
      />
      <button type="button" onClick={() => setShow((v) => !v)} className="h-8 shrink-0 cursor-pointer px-2 text-[11px] text-ink-muted hover:text-ink">
        {show ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}

function StatusLine({ state, flow, platform }: SetupCardViewProps) {
  const shape = state.key.kind === 'editing' ? state.key.shape : undefined;
  const test = state.test;
  if (test.kind === 'testing') return <p className="text-[11px] text-ink-muted">Testing your key…</p>;
  if (shape) {
    return (
      <p className="text-[11px] text-warn-ink">
        {shape.message} <LinkButton onClick={() => void flow.testAnyway()}>Test anyway</LinkButton>
      </p>
    );
  }
  if (state.keychainError) {
    const where = platform === 'windows' ? 'Windows' : 'macOS';
    const store = secretStoreLabel('keychain', platform);
    return (
      <p role="alert" className="text-[11px] text-warn-ink">
        {state.keychainError === 'denied' ? `${where} didn’t allow access to ${store}.` : `The key couldn’t be saved in ${store}.`}{' '}
        Use it for this session only? <LinkButton onClick={() => void flow.useForSession()}>Use for this session</LinkButton> ·{' '}
        <LinkButton onClick={() => void flow.retryKeychain()}>Try again</LinkButton>
      </p>
    );
  }
  if (test.kind !== 'error') return null;
  if (test.error.kind === 'region') {
    return (
      <p role="alert" className="text-[11px] text-danger-ink">
        {regionLine(state.provider)}{' '}
        <LinkButton onClick={() => flow.pick('deepseek')}>Use DeepSeek</LinkButton> ·{' '}
        <LinkButton onClick={() => flow.pick('qwen')}>Use Qwen</LinkButton>
      </p>
    );
  }
  return (
    <p role="alert" className="text-[11px] text-danger-ink">
      {test.error.message}
    </p>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer font-medium text-accent-ink hover:underline">
      {children}
    </button>
  );
}
