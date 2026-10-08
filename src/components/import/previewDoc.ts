import type { Analysis, ImportBatch } from '@/import';
import { createWorksheet } from '@/model/factories';
import { emptyBiText } from '@/model/text';
import type { LanguageMode, OutputMode, Question, Worksheet } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import type { RenderNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import type { QuestionBuild } from '@/store/worksheetStore';

/**
 * The review pane's paper: the batch's questions in a scratch worksheet with the open
 * paper's page, fonts and size, rendered by the real renderer. Nothing here is stored.
 *
 * A re-solve rebuilds every `QuestionBuild`, so the questions are cached by what their
 * outline says: an unchanged question keeps its object, the render cache hands back its
 * nodes, and its memoised preview does not re-render. That keeps a fix on a 60-question
 * paste to the questions it changed.
 */

/** The question as `insertQuestionBatch` would build it (its type's `create()`, filled). */
export function materialize(build: QuestionBuild): Question | undefined {
  const definition = listQuestionTypes().find((type) => type.id === build.typeId);
  if (!definition) return undefined;
  const fresh = definition.create();
  return { ...build.fill(fresh), id: fresh.id } as Question;
}

/** The open paper as a frame for previews: its page and type, none of its content or furniture. */
export function previewBase(open?: Worksheet): Worksheet {
  const from = open ?? createWorksheet();
  return {
    ...from,
    title: emptyBiText(),
    instructions: undefined,
    bands: undefined,
    cover: undefined,
    versions: undefined,
    pageFurniture: undefined,
    questions: [],
    layout: [],
    flow: [],
  };
}

export type PreviewCache = Map<string, Question>;

export interface PreviewItem {
  /** Index into the batch's questions; undefined for the lead stimulus. */
  question?: number;
  nodes: RenderNode[];
  language: LanguageMode;
}

/**
 * The teacher version, so answers and schemes from an answers file show under their
 * part (the pane frames them as teacher-only). The MC letter line is left out: the
 * option's wash already says it.
 */
const MODE: Record<'en' | 'zh', OutputMode> = {
  en: { language: 'en', version: 'teacher', omitAnswerSpace: true, omitCover: true },
  zh: { language: 'zh', version: 'teacher', omitAnswerSpace: true, omitCover: true },
};

const isAnswerLetter = (node: RenderNode) => node.kind === 'text' && node.style === 'Answer' && node.teacherOnly === true;
/** Kept by the render cache's nodes, so an unchanged question keeps its array (and its memo). */
const withoutLetters = new WeakMap<RenderNode[], RenderNode[]>();
function previewNodes(nodes: RenderNode[]): RenderNode[] {
  if (!nodes.some(isAnswerLetter)) return nodes;
  let out = withoutLetters.get(nodes);
  if (!out) withoutLetters.set(nodes, (out = nodes.filter((n) => !isAnswerLetter(n))));
  return out;
}

/**
 * The batch rendered for the preview, one item per question (and one for a lead), in
 * order. Each question prints in its own language. `cache` carries questions between
 * calls; entries no longer used are dropped.
 */
export function previewItems(base: Worksheet, analysis: Analysis, batch: ImportBatch, cache: PreviewCache): PreviewItem[] {
  const { outline } = analysis;
  const used = new Set<string>();
  const questions: Question[] = [];
  const sides: Array<'en' | 'zh'> = [];
  batch.builds.forEach((build, k) => {
    const q = outline.questions[k];
    const folded = outline.stimuli.filter((s) => s.before === k);
    const key = JSON.stringify([build.typeId, q, folded, k === 0 && batch.lead ? 'lead' : '']);
    let question = used.has(key) ? undefined : cache.get(key);
    if (!question) {
      question = materialize(build);
      if (!question) return;
      if (!used.has(key)) cache.set(key, question);
    }
    used.add(key);
    questions.push(question);
    sides.push(q?.side ?? 'en');
  });
  for (const key of [...cache.keys()]) if (!used.has(key)) cache.delete(key);

  const lead = batch.lead;
  const worksheet: Worksheet = {
    ...base,
    questions,
    layout: lead ? [lead] : [],
    flow: [...(lead ? [{ type: 'layout' as const, id: lead.id }] : []), ...questions.map((q) => ({ type: 'question' as const, id: q.id }))],
  };
  const needed = new Set(sides);
  const leadSide = lead ? leadLanguage(lead) : undefined;
  if (leadSide) needed.add(leadSide);
  const rendered = {
    en: needed.has('en') ? renderWorksheet(worksheet, MODE.en) : undefined,
    zh: needed.has('zh') ? renderWorksheet(worksheet, MODE.zh) : undefined,
  };
  const items: PreviewItem[] = [];
  if (lead && leadSide) {
    const item = rendered[leadSide]?.items.find((it) => it.type === 'layout' && it.layout.elementId === lead.id);
    if (item?.type === 'layout') items.push({ nodes: item.layout.nodes, language: leadSide });
  }
  questions.forEach((question, k) => {
    const side = sides[k];
    const found = rendered[side]?.questions.find((entry) => entry.questionId === question.id);
    if (found) items.push({ question: k, nodes: previewNodes(found.nodes), language: side });
  });
  return items;
}

/** A lead stimulus's language: the side its wording was put on. */
function leadLanguage(lead: NonNullable<ImportBatch['lead']>): 'en' | 'zh' {
  const text = JSON.stringify(lead);
  return /"zh":\[\{"text":"[^"]/.test(text) && !/"en":\[\{"text":"[^"]/.test(text) ? 'zh' : 'en';
}
