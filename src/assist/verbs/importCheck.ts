import { prepareImportImage, readPaperFile } from '@/components/import/fileImport';
import { localizedErrorMessage } from '@/components/ai/errorCopy';
import { copyMessages } from '@/components/translate/text';
import { runAiCheck } from '@/importCheck/ai';
import { importSourceFor, rememberImport } from '@/importCheck/sources';
import { checkMessages, findingMessage, fixLabel } from '@/importCheck/text';
import type { CheckOp } from '@/importCheck/ops';
import { checkPaper, paperQuestions, paperRecipe, safeFixes, sortFindings, type ImportSource } from '@/importCheck/run';
import type { ImportFinding } from '@/importCheck/types';
import { uiLanguage } from '@/i18n/language';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { Worksheet } from '@/model/types';
import { isDesktop, pickFile } from '@/platform';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { createRunDeps } from '@/translate/deps';
import { registerVerb } from '../registry';
import type { AiVerb, FindingsRefresh, ReviewItem, VerbContext, VerbOutcome } from '../types';
import { commitUndo } from './translateShared';

/**
 * ✦ AI → Check import (k-0494, user u-t17b): the open paper against the file it was
 * imported from — the rules first (no AI, instant), then, when a provider is set up in
 * Settings → AI, each question with its stretch of the file to the AI for what the rules
 * cannot see. Nothing is written by the check: each finding offers its fix (one commit,
 * one ⌘Z), and Apply all safe fixes applies the safe ones in one commit. The file is the
 * one this session imported the paper from, or the one the teacher picks.
 */

const maxWidthOf = (ws: Worksheet) => Math.round(contentWidth(pageSetupOf(ws)) / 15);

/** The question ids a scope narrows the check to; undefined = the whole paper. */
function scopeIds(scope: VerbContext['scope']): ReadonlySet<string> | undefined {
  if (scope.kind === 'questions' || scope.kind === 'flowItems') return new Set(scope.ids);
  if (scope.kind === 'block' && scope.questionId) return new Set([scope.questionId]);
  return undefined;
}

const inScope = (ws: Worksheet, ids: ReadonlySet<string> | undefined) => {
  if (!ids) return () => true;
  const questions = paperQuestions(ws);
  return (f: ImportFinding) => ids.has(questions[f.q]?.id ?? '');
};

/** The paper's file: remembered from this session's import, or picked now. */
async function sourceFor(ws: Worksheet): Promise<ImportSource | 'cancelled' | 'unreadable'> {
  const known = importSourceFor(ws.id);
  if (known) return known;
  const picked = await pickPaperFile();
  if (!picked) return 'cancelled';
  const outcome = await readPaperFile(picked.name, picked.bytes, { prepareImage: prepareImportImage }).catch(() => undefined);
  if (!outcome || outcome.kind !== 'ok') return 'unreadable';
  const source: ImportSource = { name: picked.name, read: outcome.read };
  rememberImport(ws.id, source);
  return source;
}

/** The open sheet on the desktop; a file input on the web. */
async function pickPaperFile(): Promise<{ name: string; bytes: ArrayBuffer } | undefined> {
  if (isDesktop()) {
    const file = await pickFile([{ name: 'Word, PDF', extensions: ['docx', 'pdf'] }]);
    return file ? { name: file.name, bytes: file.bytes.slice().buffer as ArrayBuffer } : undefined;
  }
  if (typeof document === 'undefined') return undefined;
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve(undefined);
      void file.arrayBuffer().then((bytes) => resolve({ name: file.name, bytes }), () => resolve(undefined));
    });
    input.addEventListener('cancel', () => resolve(undefined));
    input.click();
  });
}

function apply(ops: readonly CheckOp[]): boolean {
  const store = useWorksheetStore.getState();
  const before = store.worksheet;
  store.commit(paperRecipe(ops));
  return useWorksheetStore.getState().worksheet !== before;
}

export function reviewItems(ws: Worksheet, findings: readonly ImportFinding[]): ReviewItem[] {
  const m = checkMessages(uiLanguage());
  const questions = paperQuestions(ws);
  return findings.map((f) => {
    const label = fixLabel(m, f);
    const op = f.fix && 'op' in f.fix ? f.fix.op : undefined;
    return {
      id: f.id,
      tone: 'finding',
      ...(questions[f.q] ? { questionId: questions[f.q].id } : {}),
      where: m.where(f.q + 1, f.place),
      notes: [
        findingMessage(m, f),
        ...(f.before !== undefined ? [`${m.before}: ${f.before || m.removed}`] : []),
        ...(f.after !== undefined ? [`${m.after}: ${f.after || m.removed}`] : []),
        ...(!label ? [m.noFix] : []),
      ],
      ...(op && label
        ? {
            action: {
              label,
              run: () => {
                if (apply([op])) return true;
                useAppDialogs.getState().notify(m.staleN(1));
                return false;
              },
            },
          }
        : {}),
    };
  });
}

function barOf(findings: readonly ImportFinding[]): FindingsRefresh {
  const m = checkMessages(uiLanguage());
  const safe = safeFixes(findings).flatMap((f) => (f.fix && 'op' in f.fix ? [f.fix.op] : []));
  return {
    summary: findings.length ? m.findingsN(findings.length, safe.length) : m.noFindings,
    ...(safe.length
      ? {
          applyAll: {
            label: m.applyAllSafe(safe.length),
            run: () => {
              if (!apply(safe)) return useAppDialogs.getState().notify(m.staleN(safe.length));
              const undo = commitUndo();
              useAppDialogs.getState().notify(m.appliedN(safe.length), { label: copyMessages().undoAction, ...undo });
            },
          },
        }
      : {}),
  };
}

export const importCheckVerb: AiVerb = {
  id: 'check.import',
  group: 'check',
  order: 25,
  needsKey: false,
  label: (ctx) => (importSourceFor(ctx.worksheet.id) ? checkMessages(uiLanguage()).checkImportLabel : checkMessages(uiLanguage()).checkImportFile),
  available: (ctx: VerbContext) => (ctx.worksheet.questions.length ? {} : null),
  // The scope chip narrows it: a selected question is checked alone.
  sendsLine: (ctx, providerLabel) => {
    const m = checkMessages(uiLanguage());
    return importSourceFor(ctx.worksheet.id) ? m.sendsImport(ctx.worksheet.questions.length, providerLabel) : m.noSourceYet;
  },

  async run(ctx, io): Promise<VerbOutcome> {
    const m = checkMessages(uiLanguage());
    io.progress(0, 0, m.checkingImport);
    const source = await sourceFor(ctx.worksheet);
    if (source === 'cancelled') return { kind: 'nothing', summary: m.needFile };
    if (source === 'unreadable') return { kind: 'nothing', summary: m.fileUnreadable };
    const ws = useWorksheetStore.getState().worksheet;
    const ids = scopeIds(ctx.scope);
    const keep = inScope(ws, ids);
    const checked = checkPaper(ws, source, { maxWidthPx: maxWidthOf(ws) });
    const input = checked.input;
    const findings = checked.findings.filter(keep);
    let all = findings;
    let tail = '';
    const resolved = await createRunDeps({ glossary: false });
    if (resolved.ok && !io.signal.aborted) {
      const { client, preset, model } = resolved.deps;
      const only = ids ? new Set(input.paper.flatMap((q, k) => (ids.has(q.id) ? [k] : []))) : undefined;
      const outcome = await runAiCheck(input, { client, preset, model }, io.signal, (done, total) => io.progress(done, total, m.aiChecking(total)), only);
      all = sortFindings([...findings, ...outcome.findings]);
      // Always a word on the AI's half (k-0501): its failure and why, or that it found nothing.
      const error = outcome.fatal ?? outcome.lastError;
      const why = error ? localizedErrorMessage(error) : '';
      if (outcome.stopped) tail = '';
      else if (outcome.total === 0) tail = m.aiNothingSent;
      else if (outcome.done === 0) tail = m.aiFailedWhy(why || m.aiUnreadable);
      else if (outcome.failed || outcome.fatal) tail = m.aiFailedNote(outcome.total - outcome.done, why);
      else if (!outcome.findings.length) tail = m.aiVerbClean(outcome.done);
    } else if (!resolved.ok) tail = m.aiNoProvider;
    const withTail = (summary: string) => (tail ? `${summary} · ${tail}` : summary);
    if (!all.length) return { kind: 'nothing', summary: withTail(m.noFindings) };
    // A card's fix re-reads the paper: the bar never counts what is already fixed (AI findings are not re-asked).
    const recheck = (): FindingsRefresh => {
      const now = useWorksheetStore.getState().worksheet;
      const again = checkPaper(now, source, { maxWidthPx: maxWidthOf(now) }).findings.filter(inScope(now, ids));
      const bar = barOf(again);
      return { ...bar, summary: withTail(bar.summary) };
    };
    const bar = barOf(all);
    return { kind: 'findings', ...bar, summary: withTail(bar.summary), items: reviewItems(ws, all), refresh: recheck };
  },
};

registerVerb(importCheckVerb);
