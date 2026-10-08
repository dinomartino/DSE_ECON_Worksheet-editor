'use client';

import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { cssFontFamilies } from '@/model/fonts';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { Worksheet } from '@/model/types';
import type { Side } from '@/model/textSlots';
import type { RenderNode } from '@/render/ir';
import { NodeView } from '@/components/preview/Preview';
import { WarningIcon } from '@/components/ui/icons';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { PASTE_IMPORT_MESSAGES } from './messages';
import { optionIndexAt, optionPlace } from './pasteSession';
import type { PreviewItem } from './previewDoc';

/**
 * The right pane: each question on a strip of paper as it will print (the editor's own
 * `NodeView`, read-only), at the open paper's column width, zoomed to fit. A click on an
 * option makes it the answer. Answer marks and hover tints are screen-only chrome inside
 * the dialog: literal hex, like everything else on the paper.
 */

/** The strip's own margin around the text column, px at print size. */
const PAD_X = 22;
const PAD_Y = 14;

/** Answer wash and hover tint on the paper; a row of options marks its cell. */
const PAPER_CSS =
  '.pi-strip [data-option-node],.pi-strip [data-option-row]>div>span{cursor:pointer;border-radius:2px;transition:background-color 120ms}' +
  '.pi-strip [data-option-node]:hover,.pi-strip [data-option-row]>div>span:hover{background-color:#f1f4f8}' +
  '.pi-strip [data-answer-node],' +
  [0, 1, 2, 3, 4, 5, 6, 7].map((c) => `.pi-strip [data-answer-cell="${c}"]>div>span:nth-child(${c + 1})`).join(',') +
  '{background-color:#e7f3e1!important;box-shadow:-4px 0 0 #e7f3e1,4px 0 0 #e7f3e1,-7px 0 0 #4f8a3c}';

export interface PreviewCard {
  item: PreviewItem;
  /** The batch question's start line (links back to the paste). */
  start: number;
  answer?: number;
  side: Side;
  /** The worded flags for this question, one per line. */
  flags: string;
  isMc: boolean;
}

export function ReviewPreview({
  cards,
  base,
  selected,
  scrollRef,
  onSelect,
  onAnswer,
  onLanguage,
  end,
}: {
  cards: PreviewCard[];
  base: Worksheet;
  /** The selected question's index, if any. */
  selected?: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  onSelect: (question: number | undefined, start: number) => void;
  onAnswer: (question: number, index: number) => void;
  onLanguage: (question: number, side: Side) => void;
  /** Last in the scroller: the dialog's notice spacer. */
  end?: React.ReactNode;
}) {
  const m = useMessages(PASTE_IMPORT_MESSAGES);
  const column = Math.round(contentWidth(pageSetupOf(base)) / 15);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => setWidth(entries[entries.length - 1]?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef]);
  const strip = column + 2 * PAD_X;
  // Room for the pane's own gutter; never larger than print size.
  const zoom = width > 0 ? Math.min(1, (width - 40) / strip) : 1;
  const paper = {
    fontFamily: `${cssFontFamilies(base.fonts)}, serif`,
    ...(base.baseFontSize !== undefined ? { fontSize: `${base.baseFontSize}pt` } : {}),
  };

  return (
    <div ref={scrollRef} data-preview-scroll className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-desk px-5 py-4">
      <style>{PAPER_CSS}</style>
      <div className="mx-auto flex flex-col gap-3" style={{ width: strip * zoom }}>
        {cards.map((card) => (
          <Card
            key={card.item.question ?? 'lead'}
            card={card}
            selected={card.item.question !== undefined && card.item.question === selected}
            zoom={zoom}
            width={strip}
            paper={paper}
            text={m}
            onSelect={onSelect}
            onAnswer={onAnswer}
            onLanguage={onLanguage}
          />
        ))}
      </div>
      {end}
    </div>
  );
}

type Text = Messages<typeof PASTE_IMPORT_MESSAGES>;

const Card = memo(
  function Card({
    card,
    selected,
    zoom,
    width,
    paper,
    text: m,
    onSelect,
    onAnswer,
    onLanguage,
  }: {
    card: PreviewCard;
    selected: boolean;
    zoom: number;
    width: number;
    paper: React.CSSProperties;
    text: Text;
    onSelect: (question: number | undefined, start: number) => void;
    onAnswer: (question: number, index: number) => void;
    onLanguage: (question: number, side: Side) => void;
  }) {
    const { item, start, answer, side, flags, isMc } = card;
    const k = item.question;
    const place = answer !== undefined ? optionPlace(item.nodes, answer) : undefined;
    const ref = useRef<HTMLDivElement>(null);

    const onClick = (event: React.MouseEvent) => {
      onSelect(k, start);
      if (k === undefined || !isMc) return;
      const wrapper = (event.target as HTMLElement).closest<HTMLElement>('[data-node]');
      if (!wrapper) return;
      const n = Number(wrapper.dataset.node);
      const node = item.nodes[n];
      let cell: number | undefined;
      if (node?.kind === 'columns') {
        const row = wrapper.firstElementChild;
        const hit = row ? [...row.children].findIndex((child) => child.contains(event.target as Node)) : -1;
        if (hit < 0) return;
        cell = hit;
      }
      const index = optionIndexAt(item.nodes, n, cell);
      if (index !== undefined) onAnswer(k, index);
    };

    return (
      <section data-q={k ?? 'lead'} data-start={start} aria-current={selected || undefined}>
        <div className="mb-1 flex min-h-[22px] items-start gap-2 text-[11.5px]">
          {k === undefined ? (
            <span className="text-ink-muted">{m.sharedStimulus}</span>
          ) : flags ? (
            <span className="flex min-w-0 flex-1 items-start gap-1.5 text-warn-ink">
              <WarningIcon size={13} className="mt-px shrink-0" />
              <span className="whitespace-pre-line leading-snug">{flags}</span>
            </span>
          ) : isMc && answer !== undefined ? (
            <span className="text-ink-subtle">{m.answerIs(String.fromCharCode(65 + answer))}</span>
          ) : null}
          {k !== undefined && (
            <span role="group" aria-label={m.languageFor(k + 1)} className="ml-auto flex shrink-0 overflow-hidden rounded-md border border-line">
              {(['en', 'zh'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={side === s}
                  onClick={() => onLanguage(k, s)}
                  className={`cursor-pointer px-1.5 py-px text-[10.5px] transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                    side === s ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-subtle hover:bg-surface-hover hover:text-ink'
                  }`}
                >
                  {s === 'en' ? m.english : m.chinese}
                </button>
              ))}
            </span>
          )}
        </div>
        <div
          ref={ref}
          onClick={onClick}
          title={isMc ? m.setAnswerHint : undefined}
          className={`pi-strip paper cursor-default rounded-[2px] shadow-[0_1px_2px_rgba(0,0,0,0.12)] ${
            selected ? 'outline outline-2 outline-offset-2 outline-accent' : ''
          }`}
          lang={item.language === 'zh' ? 'zh-HK' : 'en'}
          style={{ ...paper, width, padding: `${PAD_Y}px ${PAD_X}px`, zoom }}
        >
          {item.nodes.map((node, n) => (
            <div
              key={n}
              data-node={n}
              className={n === 0 ? 'leads-sheet' : undefined}
              {...optionAttrs(node, isMc)}
              {...(place?.node === n ? (place.cell === undefined ? { 'data-answer-node': '' } : { 'data-answer-cell': place.cell }) : {})}
            >
              <NodeView node={node} language={item.language} />
            </div>
          ))}
        </div>
      </section>
    );
  },
  (a, b) =>
    a.card.item.nodes === b.card.item.nodes &&
    a.card.item.language === b.card.item.language &&
    a.card.answer === b.card.answer &&
    a.card.side === b.card.side &&
    a.card.flags === b.card.flags &&
    a.card.start === b.card.start &&
    a.card.isMc === b.card.isMc &&
    a.selected === b.selected &&
    a.zoom === b.zoom &&
    a.width === b.width &&
    a.text === b.text &&
    a.paper.fontFamily === b.paper.fontFamily &&
    a.paper.fontSize === b.paper.fontSize,
);

function optionAttrs(node: RenderNode, isMc: boolean): Record<string, string> {
  if (!isMc) return {};
  if (node.kind === 'text' && node.edit?.kind === 'mcqOption') return { 'data-option-node': '' };
  if (node.kind === 'columns' && node.cells.some((c) => c.edit?.kind === 'mcqOption')) return { 'data-option-row': '' };
  return {};
}
