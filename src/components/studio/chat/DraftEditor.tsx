'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { BiTextField } from '@/components/editor/BiTextField';
import { DiagramCanvas } from '@/components/editor/DiagramCanvas';
import { DataChartFields, PieSliceFields, StakeholderFields } from '@/components/editor/DiagramDataFields';
import { FieldScopeContext } from '@/components/editor/fieldScope';
import { FlowCanvas } from '@/components/editor/FlowCanvas';
import { ForumCanvas } from '@/components/editor/ForumCanvas';
import { isImeKeydown } from '@/components/ui/ime';
import { isModalLayerOpen } from '@/components/ui/modalLayer';
import { useMessages } from '@/i18n/language';
import { isPanelOnlyDiagram } from '@/model/diagram';
import { createWorksheet } from '@/model/factories';
import type { BiText, DiagramBlock, LanguageMode } from '@/model/types';
import type { Side } from '@/model/textSlots';
import { richOf, type DraftEdit } from '@/questionStudio/edit';
import { hasStemTable } from '@/questionStudio/stemTable';
import type { DraftRich, StudioDraft } from '@/questionStudio/types';
import { diagramSize, diagramSvg } from '@/render/diagram';
import { STUDIO_CHAT_MESSAGES } from './chat.messages';

const LETTERS = ['A', 'B', 'C', 'D'];
/** The fonts a draft's figure is drawn in: a new worksheet's, as the card's preview uses. */
const FONTS = createWorksheet().fonts;

const button =
  'cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50';

export const languageOfSides = (sides: readonly Side[]): LanguageMode => (sides.includes('en') && sides.includes('zh') ? 'bilingual' : sides.includes('zh') ? 'zh' : 'en');

interface Form {
  rich: DraftRich;
  answerIndex: number;
  diagram?: DiagramBlock;
}

/**
 * The teacher's own edit of a draft (k-0530, u-xjpd): the card turns into the editor's own
 * fields, as the right panel shows a question's (`BiTextField`: the page's rich text, bold,
 * sub/superscript, fractions, in the draft's languages), a Correct answer pick per option,
 * and the figure in the diagram editor teachers use in a worksheet. Nothing here calls the
 * AI. Undo steps back through this form's changes; Esc or Cancel leaves it unchanged;
 * Save (⌘↩) keeps it as a version of its own.
 */
export function DraftEditor({
  draft,
  sides,
  no,
  onCancel,
  onSave,
}: {
  draft: StudioDraft;
  sides: readonly Side[];
  no: number;
  onCancel: () => void;
  onSave: (edit: DraftEdit) => Promise<void> | void;
}) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const language = languageOfSides(sides);
  const start = useMemo<Form>(() => ({ rich: richOf(draft), answerIndex: draft.draft.answerIndex, ...(draft.diagram?.block ? { diagram: draft.diagram.block } : {}) }), [draft]);
  // The form and its Undo steps in one state, changed only by pure updaters: a field may call
  // back from an older render, and must never put back another field's older value.
  const [state, setState] = useState<{ form: Form; history: Form[] }>({ form: start, history: [] });
  const { form, history } = state;
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const last = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const dirty = JSON.stringify(form) !== JSON.stringify(start);

  /** A change, kept for Undo: typing in one field coalesces into one step (a pause or another field starts a new one). */
  const change = (key: string, next: (f: Form) => Form) => {
    const now = Date.now();
    const coalesce = last.current.key === key && now - last.current.at < 1200;
    last.current = { key, at: now };
    setState((s) => {
      const after = next(s.form);
      // A field that reports what it already holds (on blur, say) is no change and no Undo step.
      if (JSON.stringify(after) === JSON.stringify(s.form)) return s;
      return { form: after, history: coalesce ? s.history : [...s.history, s.form].slice(-50) };
    });
  };
  const undo = () => {
    last.current = { key: '', at: 0 };
    setState((s) => (s.history.length ? { form: s.history[s.history.length - 1], history: s.history.slice(0, -1) } : s));
  };
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave({ rich: form.rich, answerIndex: form.answerIndex, ...(form.diagram && form.diagram !== start.diagram ? { diagram: form.diagram } : {}) });
    } finally {
      setSaving(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isImeKeydown(event.nativeEvent) || isModalLayerOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  };

  const setRich = (key: string, patch: (rich: DraftRich) => DraftRich) => change(key, (f) => ({ ...f, rich: patch(f.rich) }));
  const table = hasStemTable({ en: plainLines(form.rich.stem.en), zh: plainLines(form.rich.stem.zh) });
  const block = form.diagram;

  return (
    <FieldScopeContext.Provider value={{ language, readOnly: false }}>
      <div role="group" aria-label={m.editing(no)} className="space-y-3 px-4 pb-3 pt-3" onKeyDown={onKeyDown} data-draft-editor>
        <p className="rounded-lg bg-surface-sunken px-3 py-1.5 text-[12px] text-ink-muted">{m.editFree}</p>
        <div>
          <BiTextField label={m.editStem} rows={3} value={form.rich.stem} onChange={(stem) => setRich('stem', (r) => ({ ...r, stem }))} />
          {table && <p className="mt-1 text-[11.5px] text-ink-subtle">{m.editTableHint}</p>}
        </div>
        {form.rich.statements.map((statement, i) => (
          <BiTextField
            key={`s${i}`}
            label={m.editStatement(i + 1)}
            value={statement}
            onChange={(next) => setRich(`s${i}`, (r) => ({ ...r, statements: r.statements.map((s, k) => (k === i ? next : s)) }))}
          />
        ))}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-[11px] font-medium text-ink-muted">{m.editCorrect}</legend>
          {form.rich.options.map((option, i) => (
            <div key={`o${i}`} className="flex items-start gap-2" data-edit-option={LETTERS[i]}>
              <label className="mt-6 flex shrink-0 cursor-pointer items-center gap-1 text-[12px] font-semibold text-ink" title={m.editCorrectIs(LETTERS[i])}>
                <input
                  type="radio"
                  name={`key-${draft.id}`}
                  checked={form.answerIndex === i}
                  onChange={() => change('key', (f) => ({ ...f, answerIndex: i }))}
                  aria-label={m.editCorrectIs(LETTERS[i])}
                  className="accent-[var(--color-ok,#16794c)]"
                  data-edit-key={LETTERS[i]}
                />
                {LETTERS[i]}
              </label>
              <div className="min-w-0 flex-1">
                <BiTextField label={m.editOption(LETTERS[i])} value={option} onChange={(next) => setRich(`o${i}`, (r) => ({ ...r, options: r.options.map((o, k) => (k === i ? next : o)) }))} />
              </div>
            </div>
          ))}
        </fieldset>
        <BiTextField label={m.editExplanation} value={form.rich.explanation} onChange={(explanation) => setRich('why', (r) => ({ ...r, explanation }))} />

        {draft.diagram && (
          <section aria-label={m.editDiagram} className="space-y-1.5" data-edit-diagram>
            <div className="text-[11px] font-medium text-ink-muted">{m.editDiagram}</div>
            {!block ? (
              <p className="text-[12px] text-ink-muted">{m.editDiagramNone}</p>
            ) : (
              <DiagramPart
                block={block}
                language={language}
                edited={block !== start.diagram || Boolean(draft.diagram.edited)}
                drawing={drawing}
                onDraw={setDrawing}
                onChange={(next) => change('diagram', (f) => ({ ...f, diagram: next }))}
              />
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          <button type="button" className={button} onClick={undo} disabled={history.length === 0} title={m.editUndoTitle} data-edit-undo>
            {m.editUndo}
          </button>
          <span className="flex-1" />
          <button type="button" className={button} onClick={onCancel} data-edit-cancel>
            {m.editCancel}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            title={m.editSaveTitle}
            className="cursor-pointer rounded-lg bg-cta px-3 py-1 text-[12px] font-medium text-on-cta hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-40"
            data-edit-save
          >
            {saving ? m.editSaving : m.editSave}
          </button>
        </div>
      </div>
    </FieldScopeContext.Provider>
  );
}

/** Rich text as the plain lines the table reader looks at. */
function plainLines(runs: BiText['en'] | undefined): string {
  return (runs ?? []).map((run) => run.text).join('');
}

/**
 * The figure: its picture and the way into the worksheet's own diagram editor (the canvas;
 * a flow chart's or a forum's own canvas), or, for a chart, a pie or a stakeholder diagram
 * (no drawing surface), the fields a worksheet edits its data in.
 */
function DiagramPart({
  block,
  language,
  edited,
  drawing,
  onDraw,
  onChange,
}: {
  block: DiagramBlock;
  language: LanguageMode;
  edited: boolean;
  drawing: boolean;
  onDraw: (on: boolean) => void;
  onChange: (block: DiagramBlock) => void;
}) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const diagram = block.diagram;
  const preview = useMemo(
    () => diagramSvg(diagram, { widthPx: block.widthPx, heightPx: block.heightPx, language, fonts: FONTS, answers: 'show' }),
    [diagram, block.widthPx, block.heightPx, language],
  );
  const resized = (next: typeof diagram) => onChange({ ...block, ...diagramSize(next, block.widthPx, language), diagram: next });
  const panelOnly = isPanelOnlyDiagram(diagram);
  const canvas = { block, onChange, onClose: () => onDraw(false), language, fonts: FONTS };

  return (
    <div className="space-y-1.5">
      <div className="max-w-[420px] overflow-hidden rounded border border-line bg-white [&_svg]:h-auto [&_svg]:w-full" style={{ lineHeight: 0 }} data-edit-diagram-preview>
        <span dangerouslySetInnerHTML={{ __html: preview }} />
      </div>
      {edited && <p className="text-[11.5px] text-ink-subtle">{m.editDiagramEdited}</p>}
      {panelOnly ? (
        <>
          <p className="text-[11.5px] text-ink-subtle">{m.editDiagramFields}</p>
          {diagram.pie ? (
            <PieSliceFields slices={diagram.pie.slices} onChange={(slices) => onChange({ ...block, diagram: { ...diagram, pie: { slices } } })} />
          ) : diagram.stakeholder ? (
            <StakeholderFields chart={diagram.stakeholder} onChange={(stakeholder) => resized({ ...diagram, stakeholder })} />
          ) : diagram.chart ? (
            <DataChartFields chart={diagram.chart} onChange={(chart) => resized({ ...diagram, chart })} />
          ) : null}
        </>
      ) : (
        <button type="button" className={button} onClick={() => onDraw(true)} title={m.editDiagramTitle} data-edit-diagram-open>
          {m.editDiagramOpen}
        </button>
      )}
      {drawing && !panelOnly && (diagram.flow ? <FlowCanvas {...canvas} /> : diagram.forum ? <ForumCanvas {...canvas} /> : <DiagramCanvas {...canvas} />)}
    </div>
  );
}
