import type { ReactNode } from 'react';
import { GLOSSARY_ATTRIBUTION } from '@/glossary/attribution';
import type { Glossary } from '@/glossary/types';
import { plain } from '@/model/text';
import type { TextPath, TextSlot } from '@/model/textSlots';
import type { AiStatus } from '@/settings/aiSettings';
import type { TranslateScope, TranslationPlan } from '@/translate/types';
import { Button, Segmented } from '@/components/ui';
import * as copy from './copy';
import type { TranslateController } from './translateController';
import { sameScope, type SessionMode, type TranslateSession } from './translateSession';

/** Everything the dialog shows that is not session state: computed by the host. */
export interface TranslateView {
  status: AiStatus;
  desktop: boolean;
  /** The plan for the chosen options (the button, the privacy line). */
  plan: TranslationPlan | null;
  /** Every option on: the row counts, and whether anything needs filling at all. */
  probe: TranslationPlan | null;
  scopeChoices: ReadonlyArray<{ scope: TranslateScope; label: string }>;
  glossary: Glossary | null;
  glossaryFailed: boolean;
  /** "Question 3 · (b)" for a slot path: where a deduped row's copies print. */
  slotWhere: ReadonlyMap<TextPath, string>;
}

export type SetupState = 'nothing' | 'onlySymbols' | 'noProvider' | 'ready';

/** Symbol gaps count only as the copies the session's options write: in EN+中 none are
 *  on by default, since a copied symbol would print twice. */
export function setupState(view: TranslateView): SetupState {
  if (planTexts(view.probe) === 0) return copiesCount(view.plan) > 0 ? 'onlySymbols' : 'nothing';
  return view.status.configured ? 'ready' : 'noProvider';
}

export const planTexts = (plan: TranslationPlan | null): number => (plan ? plan.counts.toZh + plan.counts.toEn : 0);
const copiesCount = (plan: TranslationPlan | null): number => plan?.counts.copied ?? 0;

/** The editor's own selection, which a paper-wide entry (the pill, the ⋯ menu) does not carry. */
export interface EditorSelection {
  questionId?: string;
  /** A layout element selected on the page. */
  elementId?: string;
}

/** Only scopes that exist, each once: the whole paper, the request's own scope, then the
 *  selected question and page element. Labels come from the walker's groups. */
export function scopeChoices(
  scope: TranslateScope,
  slots: readonly TextSlot[],
  selection: EditorSelection = {},
): Array<{ scope: TranslateScope; label: string }> {
  const choices: Array<{ scope: TranslateScope; label: string }> = [{ scope: { kind: 'paper' }, label: copy.SCOPE_PAPER }];
  const add = (next: TranslateScope, label: string) => {
    if (!choices.some((choice) => sameScope(choice.scope, next))) choices.push({ scope: next, label });
  };
  const questionLabel = (id: string) => slots.find((s) => s.questionId === id)?.group.label ?? copy.scopeQuestions(1);
  switch (scope.kind) {
    case 'paper':
      break;
    case 'questions':
      add(scope, scope.ids.length === 1 ? questionLabel(scope.ids[0]) : copy.scopeQuestions(scope.ids.length));
      break;
    case 'flowItems':
      add(scope, copy.scopeSelected(scope.ids.length));
      break;
    case 'paths':
      add(scope, scope.paths.length === 1 ? copy.SCOPE_TEXT : copy.scopeSelected(scope.paths.length));
      break;
    case 'block':
      add(scope, copy.SCOPE_FIGURE);
      break;
  }
  const { questionId, elementId } = selection;
  if (questionId) add({ kind: 'questions', ids: [questionId] }, questionLabel(questionId));
  if (elementId) add({ kind: 'flowItems', ids: [elementId] }, copy.scopeSelected(1));
  return choices;
}

/** Distinct glossary entries found in the sources this plan sends. */
export function glossaryTermCount(plan: TranslationPlan | null, glossary: Glossary | null): number {
  if (!plan || !glossary) return 0;
  const ids = new Set<number>();
  for (const job of plan.jobs.values()) {
    const text = plain(job.source);
    if (job.direction === 'toZh') for (const m of glossary.matchEn(text)) ids.add(m.entryId);
    else for (const m of glossary.matchZh(text)) for (const id of m.entryIds) ids.add(id);
  }
  return ids.size;
}

const CITATION = `${GLOSSARY_ATTRIBUTION.title} (${GLOSSARY_ATTRIBUTION.publisher}, ${GLOSSARY_ATTRIBUTION.year}). ${GLOSSARY_ATTRIBUTION.notice}. ${GLOSSARY_ATTRIBUTION.licence}`;

/** The footer's left edge: the glossary credit, full citation on hover. */
export function Attribution({ short = false, children }: { short?: boolean; children?: ReactNode }) {
  return (
    <span className="mr-auto min-w-0 truncate text-[11px] text-ink-muted">
      <span title={CITATION} className="cursor-help underline decoration-dotted underline-offset-2">
        {short ? copy.FOOTER_ATTRIBUTION_SHORT : copy.FOOTER_ATTRIBUTION}
      </span>
      {children}
    </span>
  );
}

function OptionRow({
  label,
  hint,
  count,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  count: number;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-start gap-2.5 py-1 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)] disabled:cursor-default"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-ink-muted">{count}</span>
    </label>
  );
}

export function SetupPanel({
  session,
  view,
  actions,
}: {
  session: TranslateSession;
  view: TranslateView;
  actions: TranslateController;
}) {
  const state = setupState(view);
  return (
    <div className="space-y-5">
      <ModeSwitch mode={session.mode} onChange={actions.setMode} />
      {state === 'nothing' && <p className="text-[13px] text-ink">{copy.NOTHING_TO_FILL}</p>}
      {state === 'onlySymbols' && (
        <p className="text-[13px] text-ink">{copy.onlySymbols(copiesCount(view.plan))}</p>
      )}
      {state === 'noProvider' && <NoProvider actions={actions} />}
      {state === 'ready' && <SetupOptions session={session} view={view} actions={actions} />}
    </div>
  );
}

function NoProvider({ actions }: { actions: TranslateController }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink">{copy.NO_PROVIDER_LEAD}</p>
      <p className="max-w-[60ch] text-[13px] text-ink-muted">{copy.NO_PROVIDER_HK}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={() => actions.setUp('gemini')}>{copy.setUpProvider('Gemini')}</Button>
        <Button onClick={() => actions.setUp('deepseek')}>{copy.setUpProvider('DeepSeek')}</Button>
        <Button onClick={() => actions.setUp('qwen')}>{copy.setUpProvider('Qwen')}</Button>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => actions.setMode('check')}
          className="cursor-pointer text-xs text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {copy.CHECK_WITHOUT_KEY}
        </button>
      </div>
    </div>
  );
}

function SetupOptions({
  session,
  view,
  actions,
}: {
  session: TranslateSession;
  view: TranslateView;
  actions: TranslateController;
}) {
  const options = session.options;
  const counts = view.probe?.counts;
  if (!options || !counts) return null;
  const replaceSide = session.request?.retranslate ?? options.retranslate ?? 'zh';
  const texts = planTexts(view.plan);
  const context = view.plan?.counts.contextLines ?? 0;
  const { preset } = view.status;
  const model = preset.models.find((m) => m.id === view.status.model)?.label ?? view.status.model;
  const local = preset.hk.status === 'local';
  const terms = glossaryTermCount(view.plan, view.glossary);
  return (
    <>
      {view.scopeChoices.length > 1 && (
        <div role="radiogroup" aria-label={copy.SCOPE_LABEL} className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="text-[13px] font-medium text-ink">{copy.SCOPE_LABEL}</span>
          {view.scopeChoices.map((choice) => (
            <label key={JSON.stringify(choice.scope)} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink">
              <input
                type="radio"
                name="translate-scope"
                checked={sameScope(choice.scope, session.scope)}
                onChange={() => actions.setScope(choice.scope)}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
              />
              {choice.label}
            </label>
          ))}
        </div>
      )}

      <div className="divide-y divide-line rounded-lg border border-line px-3 py-1">
        {counts.toZh > 0 && (
          <OptionRow
            label={copy.OPTION_TO_ZH}
            count={counts.toZh}
            checked={options.directions.toZh}
            onChange={(on) => actions.setOptions({ directions: { ...options.directions, toZh: on } })}
          />
        )}
        {counts.toEn > 0 && (
          <OptionRow
            label={copy.OPTION_TO_EN}
            count={counts.toEn}
            checked={options.directions.toEn}
            onChange={(on) => actions.setOptions({ directions: { ...options.directions, toEn: on } })}
          />
        )}
        {counts.teacher > 0 && (
          <OptionRow
            label={copy.OPTION_TEACHER}
            count={counts.teacher}
            checked={options.includeTeacher}
            onChange={(on) => actions.setOptions({ includeTeacher: on })}
          />
        )}
        {counts.diagramLabels > 0 && (
          <OptionRow
            label={copy.OPTION_DIAGRAM}
            count={counts.diagramLabels}
            checked={options.includeDiagramLabels}
            onChange={(on) => actions.setOptions({ includeDiagramLabels: on })}
          />
        )}
        {(['zh', 'en'] as const).map((side) => {
          const direction = side === 'zh' ? 'toZh' : 'toEn';
          if (counts.symbols[direction] === 0) return null;
          return (
            <OptionRow
              key={side}
              label={copy.optionSymbols(side)}
              hint={copy.optionSymbolsHint(side)}
              count={counts.symbols[direction]}
              checked={options.copySymbols[direction]}
              onChange={(on) => actions.setOptions({ copySymbols: { ...options.copySymbols, [direction]: on } })}
            />
          );
        })}
        {session.scope.kind !== 'paper' && counts.replaceable > 0 && (
          <OptionRow
            label={copy.optionReplace(replaceSide)}
            count={counts.replaceable}
            checked={options.retranslate !== undefined}
            disabled={session.request?.retranslate !== undefined}
            onChange={(on) => actions.setOptions({ retranslate: on ? replaceSide : undefined })}
          />
        )}
      </div>

      {view.glossaryFailed ? (
        <p className="text-xs text-ink-muted">{copy.TERMS_UNAVAILABLE}</p>
      ) : (
        view.glossary &&
        terms > 0 && <p className="text-xs text-ok">{copy.termsLine(terms)}</p>
      )}

      <div className="space-y-1 rounded-lg bg-surface-sunken px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
            {preset.label}
            {model && <span className="font-normal text-ink-muted"> · {model}</span>}
          </span>
          <Button size="sm" variant="subtle" onClick={() => actions.openSettings('key')}>
            {copy.CHANGE_PROVIDER}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          {local
            ? copy.localPrivacyLine(preset.label)
            : `${copy.privacyLine({ texts, context, desktop: view.desktop, provider: preset.label })} ${preset.privacy}`}
        </p>
      </div>
    </>
  );
}

export function SetupFooter({
  session,
  view,
  actions,
}: {
  session: TranslateSession;
  view: TranslateView;
  actions: TranslateController;
}) {
  const state = setupState(view);
  if (state === 'onlySymbols') {
    return (
      <>
        <Button onClick={actions.close}>{copy.CLOSE}</Button>
        <Button variant="primary" onClick={actions.copySymbols}>
          {copy.copyButton(copiesCount(view.plan))}
        </Button>
      </>
    );
  }
  if (state !== 'ready') return <Button onClick={actions.close}>{copy.CLOSE}</Button>;
  const texts = planTexts(view.plan);
  return (
    <>
      <Attribution />
      <Button onClick={actions.requestClose}>{copy.CANCEL}</Button>
      <Button variant="primary" disabled={texts === 0 || session.phase !== 'setup'} onClick={actions.translate}>
        {copy.translateButton(texts)}
      </Button>
    </>
  );
}

export function ModeSwitch({ mode, onChange }: { mode: SessionMode; onChange: (mode: SessionMode) => void }) {
  return (
    <Segmented
      label="Translate or check terms"
      value={mode}
      onChange={onChange}
      options={[
        { value: 'translate', label: copy.MODE_TRANSLATE },
        { value: 'check', label: copy.MODE_CHECK },
      ]}
    />
  );
}
