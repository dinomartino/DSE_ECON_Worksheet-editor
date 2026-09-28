import { presetFor } from '@/ai/providers';
import type { AiErrorInfo, ProviderId } from '@/ai/types';
import { Button } from '@/components/ui';
import * as copy from './copy';
import { DiscardQuestion } from './ReviewPanel';
import type { TranslateController } from './translateController';
import { finishedCount, type TranslateSession } from './translateSession';

/** Where Hong Kong teachers go when Google refuses the region. */
const HK_PROVIDERS: ProviderId[] = ['deepseek', 'qwen'];
const SHORT_NAME: Partial<Record<ProviderId, string>> = { deepseek: 'DeepSeek', qwen: 'Qwen', gemini: 'Gemini' };
const DETAIL_MAX = 300;

/** A fatal error for the run. Finished rows stay reviewable; the key never shows. */
export function ErrorPanel({ error, actions }: { error: AiErrorInfo; actions: TranslateController }) {
  const preset = presetFor(error.provider);
  const region = error.kind === 'region';
  const has = (action: AiErrorInfo['actions'][number]) => error.actions.includes(action);
  return (
    <div className="space-y-3 pt-1" role="alert">
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-warn-ink">{error.message}</p>
        {region && error.provider === 'gemini' && <p className="text-xs text-ink-muted">{copy.REGION_GEMINI_NOTE}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {region &&
          HK_PROVIDERS.filter((id) => id !== error.provider).map((id) => (
            <Button key={id} onClick={() => actions.useProvider(id)}>
              {copy.useProvider(SHORT_NAME[id] ?? presetFor(id).label)}
            </Button>
          ))}
        {region && <span className="text-xs text-ink-muted">{copy.HK_PROVIDERS_NOTE}</span>}
        {has('openKeyPage') && preset.keyUrl && <Button onClick={actions.openKeyPage}>{copy.GET_NEW_KEY}</Button>}
        {has('openBilling') && preset.keyUrl && (
          <Button onClick={actions.openKeyPage}>{copy.openProvider(preset.label)}</Button>
        )}
        {has('useFallbackModel') && preset.quotaFallbackModel && (
          <Button onClick={actions.useFallbackModel}>{copy.switchModel(preset.quotaFallbackModel)}</Button>
        )}
        {has('chooseModel') && <Button onClick={() => actions.openSettings('model')}>{copy.CHOOSE_MODEL}</Button>}
        {!region && has('switchProvider') && (
          <Button onClick={() => actions.openSettings('key')}>{copy.SWITCH_PROVIDER}</Button>
        )}
        {(region || has('openSettings')) && (
          <Button variant="subtle" onClick={() => actions.openSettings('key')}>
            {copy.OPEN_SETTINGS}
          </Button>
        )}
      </div>
      {error.detail && (
        <details className="text-xs text-ink-muted">
          <summary className="cursor-pointer select-none">{copy.TECHNICAL_DETAIL}</summary>
          <p className="mt-1 break-words font-mono text-[11px]">{error.detail.slice(0, DETAIL_MAX)}</p>
        </details>
      )}
    </div>
  );
}

export function ErrorFooter({ session, actions }: { session: TranslateSession; actions: TranslateController }) {
  const finished = session.run ? finishedCount(session.run) : 0;
  if (session.confirm?.kind === 'discard') return <DiscardQuestion n={finished} actions={actions} />;
  const retry = !!session.error?.actions.includes('retry');
  return (
    <>
      {finished > 0 && (
        <Button variant="subtle" className="mr-auto" onClick={actions.review}>
          {copy.reviewFinished(finished)}
        </Button>
      )}
      <Button onClick={actions.requestClose}>{copy.CLOSE}</Button>
      {retry && (
        <Button variant="primary" onClick={actions.retry}>
          {copy.TRY_AGAIN}
        </Button>
      )}
    </>
  );
}
