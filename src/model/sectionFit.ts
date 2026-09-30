import { listQuestionTypes } from '@/registry';
import { plain } from './text';
import type { FlowItem, RichText, Worksheet } from './types';

/**
 * One section of the flow: its marker at `start`, its items up to `end` (the next
 * marker, or the flow's length), and the question type it is for, when that is clear.
 */
export interface SectionSpan {
  start: number;
  end: number;
  fits?: string;
}

const text = (value: RichText | string | undefined) =>
  (typeof value === 'string' ? value : plain(value)).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The words that name each question type in a heading: its registry name and its summary
 * label, both languages ("Multiple Choice", 多項選擇題, "MCQ"). Registry data, so a new
 * type is recognised with no change here.
 */
function typeWords(): Array<{ id: string; words: string[] }> {
  return listQuestionTypes().map((definition) => ({
    id: definition.id,
    words: [
      definition.displayName.en,
      definition.displayName.zh,
      definition.summary?.label.en,
      definition.summary?.label.zh,
    ]
      .map(text)
      .filter(Boolean),
  }));
}

/**
 * The sections of a flow and the type each is for, derived, never stored. What a section
 * holds decides: every question under it one type. An empty section is read by its
 * heading, when that names exactly one type ("Section B: Structured Questions",
 * 乙部：結構性問題). A mixed section fits no type, so a document a teacher filled against
 * its headings (older builds put every question under Section B) is left as it is.
 */
export function sectionSpans(worksheet: Worksheet, flow: readonly FlowItem[]): SectionSpan[] {
  const layout = new Map((worksheet.layout ?? []).map((element) => [element.id, element]));
  const questionType = new Map(worksheet.questions.map((question) => [question.id, question.type]));
  const types = typeWords();
  const spans: SectionSpan[] = [];

  flow.forEach((item, index) => {
    const element = item.type === 'layout' ? layout.get(item.id) : undefined;
    if (element?.kind !== 'section') return;
    const last = spans.at(-1);
    if (last) last.end = index;
    spans.push({ start: index, end: flow.length });
  });

  for (const span of spans) {
    const held = new Set(
      flow.slice(span.start + 1, span.end).flatMap((item) => {
        const type = item.type === 'question' ? questionType.get(item.id) : undefined;
        return type ? [type] : [];
      }),
    );
    if (held.size > 0) {
      if (held.size === 1) span.fits = [...held][0];
      continue;
    }
    const marker = layout.get(flow[span.start].id);
    const heading = marker && 'text' in marker ? `${text(marker.text.en)} ${text(marker.text.zh)}` : '';
    const named = types.filter((type) => type.words.some((word) => heading.includes(word)));
    if (named.length === 1) span.fits = named[0].id;
  }
  return spans;
}
