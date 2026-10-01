'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { looksLikeKey } from '@/ai/keyShape';
import { PRESETS, presetFor } from '@/ai/providers';
import { PROVIDER_IDS, type ModelInfo, type ProviderId, type ProviderPreset } from '@/ai/types';
import { Button, CheckField, Pill } from '@/components/ui';
import { Collapsible } from '@/components/ui/Collapsible';
import { GLOSSARY_ATTRIBUTION } from '@/glossary/attribution';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import type { AiSettings } from '@/settings/aiSettings';
import type { SettingsEnv } from '@/settings/types';
import type { AiSectionActions } from './AiSection';
import {
  canTest,
  canTestSaved,
  qwenWorkspaceUrl,
  shownTest,
  TOP_PROVIDERS,
  type AiSetupState,
  type SavedKeyRow,
  type TestState,
} from './aiSetup';
import { AI_SECTION_MESSAGES, SHORT_ERROR_KEYS, storeLabel } from './messages';
import { HkNote, ProviderBadges, type RowKeyStatus } from './providerBadges';
import { regionBanner } from './setupCardFlow';

/**
 * The AI section's markup, driven entirely by props so each state renders in a test.
 * "Your keys" lists every saved key (masked to its last 4) with its own Test and Forget.
 * The selected provider's key, model and base URL sit inside its card; unselected cards
 * are one line. Chrome uses semantic tokens; every "not in Hong Kong" note is warn ink.
 */

const TOP = TOP_PROVIDERS;
const MORE = PROVIDER_IDS.filter((id) => PRESETS[id].group === 'more');
const MORE_NAMES = MORE.map((id) => PRESETS[id].label.split(' ')[0]).join(', ');
const OTHER_MODEL = '__other__';
const INPUT =
  'h-8 min-w-0 rounded-lg border border-line bg-surface px-2 text-xs text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25';

export interface AiSectionViewProps {
  env: SettingsEnv;
  focus?: string;
  state: AiSetupState;
  settings: AiSettings;
  /** Every provider with a saved key: store and last 4 only. */
  keys: SavedKeyRow[];
  configured: boolean;
  /** "Models from your account", once List my models succeeded for the shown provider. */
  listed: ModelInfo[] | null;
  platform: 'mac' | 'windows' | 'web';
  actions: AiSectionActions;
}

export function AiSectionView(props: AiSectionViewProps) {
  const { state, settings, actions } = props;
  const m = useMessages(AI_SECTION_MESSAGES);
  const keyRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLSelectElement>(null);
  const hkRef = useRef<HTMLButtonElement>(null);

  // A deep link's focus field scrolls into view; a region error moves focus to DeepSeek.
  useEffect(() => {
    const target = props.focus === 'model' ? modelRef.current : props.focus === 'key' ? keyRef.current : null;
    target?.scrollIntoView({ block: 'center' });
    target?.focus();
  }, [props.focus]);
  const refusedBy = state.regionRefusedBy;
  const regionFocus = refusedBy !== null && props.focus === undefined;
  useEffect(() => {
    if (regionFocus) hkRef.current?.focus();
  }, [regionFocus]);

  const selectedInMore = PRESETS[state.provider]?.group === 'more';
  const keyed = new Set(props.keys.map((k) => k.provider));
  const card = (id: ProviderId) => (
    <ProviderCard
      key={id}
      preset={presetFor(id)}
      keyStatus={keyed.has(id) ? 'saved' : presetFor(id).keyRequired ? null : 'keyless'}
      selected={id === state.provider}
      highlight={refusedBy !== null && presetFor(id).hk.status === 'available'}
      buttonRef={id === 'deepseek' ? hkRef : undefined}
      onSelect={() => actions.selectProvider(id)}
    >
      {id === state.provider && <CardDetails {...props} keyRef={keyRef} modelRef={modelRef} />}
    </ProviderCard>
  );

  return (
    <div className="space-y-4">
      {refusedBy && (
        <p role="status" className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-ink">
          ⚠ {regionBanner(refusedBy)}
        </p>
      )}
      <YourKeys {...props} />
      <div role="radiogroup" aria-label={m.providerGroup} className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {TOP.map(card)}
      </div>
      <div className="-mx-3">
        <Collapsible
          plain
          title={
            <>
              {m.moreProviders} <span className="font-normal text-ink-muted">{MORE_NAMES}</span>
            </>
          }
          defaultOpen={selectedInMore}
        >
          <div role="radiogroup" aria-label={m.moreProviderGroup} className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {MORE.map(card)}
          </div>
        </Collapsible>
      </div>
      <CheckField
        label={m.includeTeacher}
        checked={settings.includeTeacherText}
        onChange={actions.includeTeacher}
      />
      <div className="-mx-3 -mt-2">
        <Collapsible plain title={m.privacyAndTerms} keepMounted>
          <About {...props} />
        </Collapsible>
      </div>
    </div>
  );
}

const MASK = '••••••••';

/** Every saved key, masked, with its status, Test and Forget. Absent until a key is saved. */
function YourKeys({ keys, state, settings, actions, env, platform }: AiSectionViewProps) {
  const m = useMessages(AI_SECTION_MESSAGES);
  if (keys.length === 0) return null;
  const where = env.desktop ? platform : 'web';
  return (
    <section aria-label={m.yourKeys} className="space-y-1.5">
      <div className="flex min-h-6 items-center gap-2 text-xs">
        <h4 className="text-[13px] font-medium text-ink">{m.yourKeys}</h4>
        <span className="text-ink-muted">{m.savedCount(keys.length)}</span>
        <span className="ml-auto">
          {state.confirmForget === 'all' ? (
            <span className="text-ink">
              {m.forgetAllAsk} <InlineAction onClick={() => void actions.forget()}>{m.forgetAll}</InlineAction> ·{' '}
              <InlineAction onClick={actions.cancelForget}>{m.cancel}</InlineAction>
            </span>
          ) : (
            <InlineAction tone="muted" onClick={() => actions.forgetAsked('all')}>
              {m.forgetAll}
            </InlineAction>
          )}
        </span>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {keys.map((key) => (
          <KeyRow
            key={key.provider}
            row={key}
            where={where}
            inUse={settings.provider === key.provider}
            open={state.provider === key.provider}
            test={state.savedTests[key.provider] ?? { kind: 'idle' }}
            confirming={state.confirmForget === key.provider}
            actions={actions}
          />
        ))}
      </ul>
    </section>
  );
}

function KeyRow({
  row,
  where,
  inUse,
  open,
  test,
  confirming,
  actions,
}: {
  row: SavedKeyRow;
  where: 'mac' | 'windows' | 'web';
  inUse: boolean;
  /** Its card is open, and shows a failure in full there. */
  open: boolean;
  test: TestState;
  confirming: boolean;
  actions: AiSectionActions;
}) {
  const m = useMessages(AI_SECTION_MESSAGES);
  const preset = presetFor(row.provider);
  const store = storeLabel(m, row.store, where);
  // Keychain keys stay unread until a test, so their last 4 may be unknown: name the store.
  const storeNote = !row.last4 || row.store === 'session' || row.store === 'memory' ? m.inStore(store) : null;
  return (
    <li data-key-row={row.provider} className="px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium text-ink">{preset.label}</span>
        <span title={m.savedIn(store)} className="shrink-0 font-mono text-[11px] tracking-tight text-ink-muted">
          {MASK}
          {row.last4 ?? ''}
        </span>
        {storeNote && <span className="shrink-0 text-[11px] text-ink-subtle">{storeNote}</span>}
        {inUse && <Pill tone="accent">{m.inUse}</Pill>}
        <span className="flex-1" />
        {confirming ? (
          <span className="shrink-0 text-xs text-ink">
            {m.forgetOneAsk} <InlineAction onClick={() => void actions.forget()}>{m.forget}</InlineAction> ·{' '}
            <InlineAction onClick={actions.cancelForget}>{m.cancel}</InlineAction>
          </span>
        ) : (
          <>
            <SavedStatus test={test} />
            <Button size="sm" variant="default" disabled={test.kind === 'testing'} onClick={() => actions.testSaved(row.provider)}>
              {m.test}
            </Button>
            <span className="text-xs">
              <InlineAction tone="muted" onClick={() => actions.forgetAsked(row.provider)}>
                {m.forget}
              </InlineAction>
            </span>
          </>
        )}
      </div>
      {test.kind === 'error' && !open && <p className="mt-1 text-[11px] text-danger-ink">{test.error.message}</p>}
    </li>
  );
}

function SavedStatus({ test }: { test: TestState }) {
  const m = useMessages(AI_SECTION_MESSAGES);
  const base = 'shrink-0 text-[11px]';
  if (test.kind === 'testing') return <span className={`${base} text-ink-muted`}>{m.testing}</span>;
  if (test.kind === 'ok') {
    return (
      <span className={`${base} font-medium text-ok`} title={`${(test.ms / 1000).toFixed(1)} s · ${test.sample}`}>
        {m.connected}
      </span>
    );
  }
  if (test.kind === 'error') {
    return (
      <span className={`${base} font-medium text-danger-ink`} title={test.error.message}>
        {m[SHORT_ERROR_KEYS[test.error.kind] ?? 'testFailed']}
      </span>
    );
  }
  return <span className={`${base} text-ink-subtle`}>{m.notTested}</span>;
}

function ProviderCard({
  preset,
  keyStatus,
  selected,
  highlight,
  buttonRef,
  onSelect,
  children,
}: {
  preset: ProviderPreset;
  keyStatus: RowKeyStatus;
  selected: boolean;
  highlight: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <div data-provider={preset.id} className={selected ? 'bg-surface-raised' : highlight ? 'bg-ok-soft' : ''}>
      <button
        ref={buttonRef}
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className="@container flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span
          aria-hidden
          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${selected ? 'border-accent' : 'border-line-strong'}`}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{preset.label}</span>
        <ProviderBadges preset={preset} keyStatus={keyStatus} />
      </button>
      {children}
    </div>
  );
}

function CardDetails({
  keyRef,
  modelRef,
  ...props
}: AiSectionViewProps & {
  keyRef: RefObject<HTMLInputElement | null>;
  modelRef: RefObject<HTMLSelectElement | null>;
}) {
  const { state, actions } = props;
  const m = useMessages(AI_SECTION_MESSAGES);
  const preset = presetFor(state.provider);
  const [show, setShow] = useState(false);
  const testing = shownTest(state).kind === 'testing';
  const draft = state.key.kind === 'editing' ? state.key.draft : '';
  const noTestLink = preset.id === 'custom' || preset.id === 'ollama';
  // A saved key and an empty field: the button tests the saved key; typing replaces it.
  const savedMode = state.key.kind === 'saved';
  const hasSaved = savedMode || (state.key.kind === 'editing' && state.key.saved !== undefined);
  const primary = savedMode ? () => actions.testSaved(state.provider) : actions.saveAndTest;
  const awaitingKey = !savedMode && !testing && draft.trim() === '';

  return (
    <div className="space-y-3 pb-3 pl-9 pr-3">
      <p className="text-xs text-ink-muted">{preset.blurb}</p>
      <HkNote preset={preset} />
      {preset.keyRequired && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-ink">{m.apiKey}</span>
            <span className="flex min-w-[220px] flex-1 items-center rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
              {/* Not a login field: no form, no name, no autofill, so no password manager
                  offers to save (and sync) it. */}
              <input
                ref={keyRef}
                type={show ? 'text' : 'password'}
                aria-label={m.apiKeyFor(preset.label)}
                placeholder={keyPlaceholder(state, m)}
                value={draft}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="off"
                data-1p-ignore=""
                data-lpignore="true"
                onChange={(event) => actions.draft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') primary();
                }}
                className="h-8 min-w-0 flex-1 bg-transparent px-2 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-ink-subtle"
              />
              <button
                type="button"
                onClick={() => setShow((value) => !value)}
                className="h-8 shrink-0 cursor-pointer px-2 text-[11px] text-ink-muted hover:text-ink"
              >
                {show ? m.hide : m.show}
              </button>
            </span>
            {/* With no key typed the button waits in the quiet outline style, not as a
                faded black block that reads as broken; the title explains. It is on the
                wrapper because a disabled button takes no pointer events. */}
            <span className="inline-flex" title={awaitingKey ? m.pasteFirst : undefined}>
              <Button
                size="sm"
                variant={awaitingKey ? 'default' : 'primary'}
                disabled={testing || !(savedMode ? canTestSaved(state) : canTest(state))}
                onClick={primary}
              >
                {testing ? m.testing : savedMode ? m.test : m.saveAndTest}
              </Button>
            </span>
            {preset.keyUrl && (
              <button
                type="button"
                onClick={() => actions.getKey(preset.keyUrl!)}
                className="cursor-pointer text-xs text-accent-ink hover:underline"
              >
                {m.getKey}
              </button>
            )}
            {preset.keyUrl && preset.keyHint && !hasSaved && <span className="text-[11px] text-ink-muted">{preset.keyHint}</span>}
          </div>
          <KeyStatus {...props} />
        </div>
      )}
      {!preset.keyRequired && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" disabled={testing || !canTest(state)} onClick={actions.saveAndTest}>
            {testing ? m.testing : m.testConnection}
          </Button>
          <TestLine test={state.test} actions={actions} retry={actions.saveAndTest} />
        </div>
      )}
      {noTestLink && (
        <button type="button" onClick={actions.saveWithoutTesting} className="cursor-pointer text-[11px] text-ink-muted hover:text-ink hover:underline">
          {preset.keyRequired ? m.saveWithoutTesting : m.useWithoutTesting}
        </button>
      )}
      {preset.keyRequired && !savedMode && <RememberField {...props} />}
      <ModelField {...props} modelRef={modelRef} />
      <BaseUrlField {...props} />
    </div>
  );
}

function KeyStatus({ state, actions, platform }: AiSectionViewProps) {
  const shape = state.key.kind === 'editing' ? state.key.shape : undefined;
  const m = useMessages(AI_SECTION_MESSAGES);
  const savedMode = state.key.kind === 'saved';
  const where = platform === 'windows' ? 'Windows' : 'macOS';
  const keychain = storeLabel(m, 'keychain', platform);
  return (
    <div className="space-y-1 text-[11px]">
      {shape && (
        <p className="text-warn-ink">
          {shape.message}{' '}
          <InlineAction onClick={actions.testAnyway}>{m.testAnyway}</InlineAction>
        </p>
      )}
      <TestLine
        test={shownTest(state)}
        actions={actions}
        retry={savedMode ? () => actions.testSaved(state.provider) : actions.saveAndTest}
      />
      {state.keychainError && (
        <p className="text-warn-ink">
          {state.keychainError === 'denied' ? m.keychainDenied(where, keychain) : m.keychainFailed(keychain)}{' '}
          {m.sessionOnlyAsk}{' '}
          <InlineAction onClick={actions.useForSession}>{m.useForSession}</InlineAction> ·{' '}
          <InlineAction onClick={actions.retryKeychain}>{m.tryAgain}</InlineAction>
        </p>
      )}
    </div>
  );
}

function TestLine({ test, actions, retry }: { test: TestState; actions: AiSectionActions; retry: () => void }) {
  const m = useMessages(AI_SECTION_MESSAGES);
  if (test.kind === 'testing') return <p className="text-[11px] text-ink-muted">{m.testing}</p>;
  if (test.kind === 'ok') {
    return (
      <p className="text-[11px] text-ink">
        <span className="text-ok">✓</span>
        {m.connectedLine((test.ms / 1000).toFixed(1), test.sample)}
        {!test.followedGlossary && <span className="text-ink-muted">{m.skippedGlossary}</span>}
      </p>
    );
  }
  if (test.kind !== 'error') return null;
  return (
    <p role="alert" className="text-[11px] text-danger-ink">
      {test.error.message}
      {test.error.kind === 'region' && (
        <>
          {' '}
          <InlineAction onClick={retry}>{m.tryAgain}</InlineAction> ·{' '}
          <InlineAction onClick={() => actions.selectProvider('deepseek')}>{m.useDeepSeek}</InlineAction> ·{' '}
          <InlineAction onClick={() => actions.selectProvider('qwen')}>{m.useQwen}</InlineAction>
        </>
      )}
    </p>
  );
}

function InlineAction({ onClick, tone = 'accent', children }: { onClick: () => void; tone?: 'accent' | 'muted'; children: ReactNode }) {
  const ink = tone === 'muted' ? 'text-ink-muted hover:text-danger-ink' : 'font-medium text-accent-ink';
  return (
    <button type="button" onClick={onClick} className={`shrink-0 cursor-pointer ${ink} hover:underline`}>
      {children}
    </button>
  );
}

function RememberField({ state, actions, env, platform }: AiSectionViewProps) {
  const m = useMessages(AI_SECTION_MESSAGES);
  const label = !env.desktop ? m.rememberBrowser : platform === 'windows' ? m.rememberWindows : m.rememberMac;
  return (
    <div
      className="flex flex-wrap items-center gap-x-2"
      title={env.desktop ? undefined : m.rememberOffTitle}
    >
      <CheckField label={label} checked={state.remember} onChange={actions.remember} />
      {!env.desktop && <span className="text-[11px] text-ink-subtle">{m.sharedComputer}</span>}
    </div>
  );
}

function ModelField({ state, listed, actions, modelRef }: AiSectionViewProps & { modelRef: RefObject<HTMLSelectElement | null> }) {
  const m = useMessages(AI_SECTION_MESSAGES);
  const preset = presetFor(state.provider);
  const listedIds = (listed ?? []).map((model) => model.id);
  const known = [...preset.models.map((model) => model.id), ...listedIds];
  const [otherOpen, setOtherOpen] = useState(false);
  const [other, setOther] = useState(known.includes(state.model) ? '' : state.model);
  const [otherBad, setOtherBad] = useState<string | null>(null);
  const [listing, setListing] = useState(false);
  const showOther = otherOpen || !known.includes(state.model);
  const chosenNote = showOther ? undefined : preset.models.find((model) => model.id === state.model)?.note;
  const commitOther = () => {
    const value = other.trim();
    if (!value) return;
    if (looksLikeKey(value)) {
      // Never stored, never left on screen.
      setOther('');
      setOtherBad(m.keyInModel);
      return;
    }
    setOtherBad(/^[A-Za-z0-9._:/@-]{1,128}$/.test(value) ? null : m.modelIdChars);
    actions.model(value);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink">{m.model}</span>
        {known.length > 0 && (
          <select
            ref={modelRef}
            aria-label={m.model}
            value={showOther ? OTHER_MODEL : state.model}
            onChange={(event) => {
              const value = event.target.value;
              setOtherOpen(value === OTHER_MODEL);
              if (value !== OTHER_MODEL) actions.model(value);
            }}
            className={`${INPUT} min-w-[220px] flex-1 cursor-pointer`}
          >
            <optgroup label={m.suggested}>
              {preset.models.map((model) => (
                <option key={model.id} value={model.id} title={model.note}>
                  {model.label}
                </option>
              ))}
            </optgroup>
            {listedIds.length > 0 && (
              <optgroup label={m.accountModels}>
                {listedIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </optgroup>
            )}
            <option value={OTHER_MODEL}>{m.otherModel}</option>
          </select>
        )}
        <Button
          size="sm"
          variant="subtle"
          disabled={listing}
          onClick={async () => {
            setListing(true);
            await actions.listModels();
            setListing(false);
          }}
        >
          {m.listModels}
        </Button>
      </div>
      {showOther && (
        <input
          aria-label={m.modelId}
          placeholder={m.modelIdPlaceholder}
          value={other}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(event) => setOther(event.target.value)}
          onBlur={commitOther}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitOther();
          }}
          className={`${INPUT} w-full font-mono`}
        />
      )}
      {/* The detail sits under the select, not in the option: a long option truncates mid-word. */}
      {chosenNote && <p className="text-[11px] text-ink-muted">{chosenNote}</p>}
      {otherBad && <p className="text-[11px] text-danger-ink">{otherBad}</p>}
      {listed && listed.length === 0 && <p className="text-[11px] text-ink-muted">{m.noModels}</p>}
    </div>
  );
}

/** Which Qwen region a stored base URL belongs to, and its workspace id. */
function qwenRegion(preset: ProviderPreset, stored: string | undefined): { index: number; workspace: string } {
  const choices = preset.baseUrlChoices ?? [];
  const url = stored ?? preset.baseUrl;
  for (const [index, choice] of choices.entries()) {
    if (!choice.template && choice.url === url) return { index, workspace: '' };
    if (choice.template) {
      const [head, tail] = choice.url.split('{WorkspaceId}');
      if (url.startsWith(head) && url.endsWith(tail)) return { index, workspace: url.slice(head.length, -tail.length || undefined) };
    }
  }
  return { index: 0, workspace: '' };
}

function BaseUrlField({ state, settings, actions }: AiSectionViewProps) {
  const m = useMessages(AI_SECTION_MESSAGES);
  const preset = presetFor(state.provider);
  const stored = settings.baseUrls[state.provider];
  const [draft, setDraft] = useState(stored ?? preset.baseUrl);
  const [bad, setBad] = useState(false);
  const initial = qwenRegion(preset, stored);
  const [region, setRegion] = useState(initial.index);
  const [workspace, setWorkspace] = useState(initial.workspace);

  if (preset.baseUrlChoices) {
    const choice = preset.baseUrlChoices[region];
    const built = choice.template ? qwenWorkspaceUrl(choice.url, workspace) : choice.url;
    return (
      <div className="space-y-1.5">
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink">{m.region}</span>
          <select
            value={region}
            onChange={(event) => {
              const index = Number(event.target.value);
              setRegion(index);
              const next = preset.baseUrlChoices![index];
              // A workspace region with no valid workspace yet blocks the test until one is typed.
              actions.baseUrl(next.template ? qwenWorkspaceUrl(next.url, workspace) : next.url);
            }}
            className={`${INPUT} min-w-[220px] flex-1 cursor-pointer`}
          >
            {preset.baseUrlChoices.map((c, index) => (
              <option key={c.url} value={index}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {choice.template && (
          <div className="space-y-1">
            <input
              aria-label={m.workspace}
              placeholder={m.workspacePlaceholder}
              value={workspace}
              spellCheck={false}
              autoCapitalize="off"
              onChange={(event) => {
                setWorkspace(event.target.value);
                actions.workspace(event.target.value);
                actions.baseUrl(qwenWorkspaceUrl(choice.url, event.target.value));
              }}
              className={`${INPUT} w-full font-mono`}
            />
            <p className={`text-[11px] ${workspace.trim() && !built ? 'text-danger-ink' : 'text-ink-subtle'}`}>
              {workspace.trim() && !built ? m.notWorkspace(m.workspaceHint) : m.workspaceHint}
            </p>
          </div>
        )}
      </div>
    );
  }
  if (!preset.baseUrlEditable) return null;
  return (
    <div className="space-y-1">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink">{m.serverAddress}</span>
        <input
          aria-label={m.serverAddress}
          placeholder="https://…/v1"
          value={draft}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setBad(draft.trim() !== '' && !actions.baseUrl(draft.trim()))}
          className={`${INPUT} min-w-[220px] flex-1 font-mono`}
        />
      </label>
      {bad && <p className="text-[11px] text-danger-ink">{m.badAddress}</p>}
    </div>
  );
}

function About({ state, env }: AiSectionViewProps) {
  const m = useMessages(AI_SECTION_MESSAGES);
  const preset = presetFor(state.provider);
  const g = GLOSSARY_ATTRIBUTION;
  return (
    <div className="space-y-3 text-xs text-ink-muted">
      <section className="space-y-1">
        <h4 className="text-[13px] font-medium text-ink">{m.whatIsSent}</h4>
        {/* One string: SWC drops the space in `{label} with` when the text wraps after it. */}
        <p>{m.sentBody(env.desktop, preset.label, preset.privacy)}</p>
      </section>
      <section className="space-y-1">
        <h4 className="text-[13px] font-medium text-ink">{m.terminology}</h4>
        <p>{m.termsBody(g.title, g.publisher, g.year, g.notice, m.licence)}</p>
      </section>
    </div>
  );
}

function keyPlaceholder(state: AiSetupState, m: Messages<typeof AI_SECTION_MESSAGES>): string {
  const saved = state.key.kind === 'saved' ? state.key : state.key.kind === 'editing' ? state.key.saved : undefined;
  return saved ? m.pasteNewKey : m.pasteKey;
}
