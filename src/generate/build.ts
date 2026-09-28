import { createParagraphBlock, createPart, createSourceBlock } from '@/model/factories';
import { createStimulusElement } from '@/model/flow';
import { createMarkGroup, createMarkPoint, createMarkRoute } from '@/model/markScheme';
import type { MarkScheme } from '@/model/markSchemeTypes';
import type { Side } from '@/model/textSlots';
import type { BiText, ContentBlock, LayoutElement, McqQuestion, ParagraphBlock, QuestionPart, StructuredQuestion } from '@/model/types';
import type { QuestionBuild } from '@/store/worksheetStore';
import { answerSpaceFor } from './recipe';
import type { BiDraft, GeneratedItem, McqDraft, PartDraft, Recipe, StructuredDraft } from './types';
import { toRuns } from './validate';

/**
 * Checked drafts → what the store inserts. The store builds each question with its
 * type's own `create()` (ids, defaults); this fills it. Type-specific construction lives
 * here, never in a shared module (§ Question-type registry).
 */

const biText = (draft: BiDraft): BiText => ({ en: toRuns(draft.en), zh: toRuns(draft.zh) });
const hasText = (draft: BiDraft) => draft.en.trim() !== '' || draft.zh.trim() !== '';
const paragraph = (draft: BiDraft): ParagraphBlock => createParagraphBlock(biText(draft));

/** The pasted source, verbatim, one paragraph per blank-line-separated block, on its own side. */
export function sourceParagraphs(source: string, side: Side): ParagraphBlock[] {
  return source
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((text) => text.replace(/^\n+|\s+$/g, ''))
    .filter((text) => text.trim() !== '')
    .map((text) => createParagraphBlock({ en: side === 'en' ? [{ text }] : [], zh: side === 'zh' ? [{ text }] : [] }));
}

function fillMcq(draft: McqDraft): QuestionBuild['fill'] {
  return (fresh) => {
    const q = fresh as McqQuestion;
    return {
      ...q,
      blocks: [paragraph(draft.stem)],
      ...(draft.statements.length ? { statements: draft.statements.map(biText) } : {}),
      options: q.options.map((option, i) => ({ ...option, text: biText(draft.options[i]) })),
      answerIndex: draft.answerIndex,
      ...(hasText(draft.explanation) ? { explanation: biText(draft.explanation) } : {}),
    } satisfies McqQuestion;
  };
}

function schemeOf(part: PartDraft): MarkScheme | undefined {
  if (!part.points.length) return undefined;
  const points = part.points.map((p) => ({ ...createMarkPoint(p.marks), text: biText(p.text) }));
  return { routes: [{ ...createMarkRoute(), groups: [createMarkGroup(points)] }] };
}

function fillStructured(draft: StructuredDraft, recipe: Recipe, source: ContentBlock[]): QuestionBuild['fill'] {
  return (fresh) => {
    const q = fresh as StructuredQuestion;
    const parts = draft.parts.map((p): QuestionPart => {
      const scheme = schemeOf(p);
      return {
        ...createPart(),
        blocks: [paragraph(p.stem)],
        marks: p.marks,
        ...(hasText(p.answer) ? { answer: biText(p.answer) } : {}),
        ...(scheme ? { scheme } : {}),
        ...(recipe.answerSpace ? { answerSpace: answerSpaceFor(p.marks) } : {}),
      };
    });
    return { ...q, blocks: [paragraph(draft.stem), ...source], parts } satisfies StructuredQuestion;
  };
}

export interface Batch {
  /** Keyed by `GeneratedItem.key`, in insertion order. */
  builds: Array<{ key: string; build: QuestionBuild }>;
  lead?: LayoutElement;
}

/**
 * The inserted batch: every item that is not `failed`. The source prints once — as a
 * shared stimulus spanning the batch, or as an unlabelled source panel under the
 * structured question's lead-in.
 */
export function buildBatch(items: readonly GeneratedItem[], recipe: Recipe, source: string, sourceSide: Side): Batch {
  const kept = items.filter((item): item is GeneratedItem & { draft: NonNullable<GeneratedItem['draft']> } => item.status !== 'failed' && !!item.draft);
  const panel = (): ContentBlock[] => {
    if (recipe.sourceAs !== 'sourceBlock') return [];
    const { label: _label, ...block } = createSourceBlock();
    void _label;
    return [{ ...block, blocks: sourceParagraphs(source, sourceSide) }];
  };
  const builds = kept.map(({ key, draft }) => ({
    key,
    build: draft.kind === 'mcq'
      ? { typeId: 'mcq', fill: fillMcq(draft) }
      : { typeId: 'structured', fill: fillStructured(draft, recipe, panel()) },
  }));
  if (recipe.sourceAs !== 'stimulus' || !builds.length) return { builds };
  const lead: LayoutElement = { ...createStimulusElement(), span: builds.length, blocks: sourceParagraphs(source, sourceSide) };
  return { builds, lead };
}
