'use client';

import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { cssFontFamilies } from '@/model/fonts';
import { isBiTextEmpty } from '@/model/text';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { Worksheet } from '@/model/types';
import type { Side } from '@/model/textSlots';
import type { RenderNode } from '@/render/ir';
import { previewFigure } from '@/import';
import { NodeView } from '@/components/preview/Preview';
import { CloseIcon, ImageIcon, WarningIcon } from '@/components/ui/icons';
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

/** What the figure chrome on the paper does. Stable across renders. */
export interface FigureActions {
  /** Select a slot: the next pasted picture goes there. */
  select: (line: number) => void;
  choose: (line: number) => void;
  dismiss: (line: number) => void;
  remove: (pinId: string) => void;
}

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
  figures,
  selectedLine,
  dropLine,
  end,
}: {
  cards: PreviewCard[];
  base: Worksheet;
  /** The selected question's index, if any. */
  selected?: number;
  figures: FigureActions;
  /** The selected line and the line an image is dragged over: a slot at either lights up. */
  selectedLine?: number;
  dropLine?: number;
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
        {cards.map((card) => {
          const slots = slotLines(card.item.nodes);
          return (
          <Card
            key={card.item.question ?? 'lead'}
            card={card}
            selected={card.item.question !== undefined && card.item.question === selected}
            slotSelected={selectedLine !== undefined && slots.includes(selectedLine) ? selectedLine : undefined}
            slotDrop={dropLine !== undefined && slots.includes(dropLine) ? dropLine : undefined}
            figures={figures}
            zoom={zoom}
            width={strip}
            paper={paper}
            text={m}
            onSelect={onSelect}
            onAnswer={onAnswer}
            onLanguage={onLanguage}
          />
          );
        })}
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
    slotSelected,
    slotDrop,
    figures,
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
    slotSelected?: number;
    slotDrop?: number;
    figures: FigureActions;
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
      const slot = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]');
      if (slot) {
        figures.select(Number(slot.dataset.slot));
        return;
      }
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
              <PaperNode
                node={node}
                language={item.language}
                figures={figures}
                slotSelected={slotSelected}
                slotDrop={slotDrop}
                text={m}
                underLetter={n > 0 && isBareOption(item.nodes[n - 1])}
              />
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
    a.slotSelected === b.slotSelected &&
    a.slotDrop === b.slotDrop &&
    a.figures === b.figures &&
    a.zoom === b.zoom &&
    a.width === b.width &&
    a.text === b.text &&
    a.paper.fontFamily === b.paper.fontFamily &&
    a.paper.fontSize === b.paper.fontSize,
);

/** An option line with a letter and no words: its picture (or slot) prints under the letter. */
const isBareOption = (node: RenderNode): boolean =>
  node.kind === 'text' && node.edit?.kind === 'mcqOption' && isBiTextEmpty(node.text);

function optionAttrs(node: RenderNode, isMc: boolean): Record<string, string> {
  if (!isMc) return {};
  if (node.kind === 'text' && node.edit?.kind === 'mcqOption') return { 'data-option-node': '' };
  if (node.kind === 'columns' && node.cells.some((c) => c.edit?.kind === 'mcqOption')) return { 'data-option-row': '' };
  return {};
}

/** The lines of the figure slots among the nodes, panels included. */
function slotLines(nodes: readonly RenderNode[]): number[] {
  return nodes.flatMap((node): number[] => {
    if (node.kind === 'source') return slotLines(node.nodes);
    const figure = node.kind === 'image' ? previewFigure(node.blockId) : undefined;
    return figure && 'slot' in figure ? [figure.slot] : [];
  });
}

const hasFigure = (nodes: readonly RenderNode[]): boolean =>
  nodes.some((node) => (node.kind === 'source' ? hasFigure(node.nodes) : node.kind === 'image' && previewFigure(node.blockId) !== undefined));

/**
 * A node on the strip. Slots and placed pictures (`previewFigure`) get their chrome,
 * literal hex like the rest of the paper; a source panel holding one is framed here as
 * `NodeView` frames it, so the figure inside gets its chrome too.
 */
function PaperNode({
  node,
  language,
  figures,
  slotSelected,
  slotDrop,
  text: m,
  underLetter = false,
}: {
  node: RenderNode;
  language: PreviewItem['language'];
  figures: FigureActions;
  slotSelected?: number;
  slotDrop?: number;
  text: Text;
  /** Right after an option's bare letter, whose empty line takes no height: clear it. */
  underLetter?: boolean;
}) {
  if (node.kind === 'source' && hasFigure(node.nodes)) {
    return (
      <div
        style={{
          border: node.framed ? '1px solid #000' : undefined,
          padding: node.framed ? '5.65pt' : undefined,
          ...(node.indent ? { marginLeft: `${node.indent / 20}pt` } : undefined),
        }}
      >
        {node.nodes.map((child, index) => (
          <PaperNode key={index} node={child} language={language} figures={figures} slotSelected={slotSelected} slotDrop={slotDrop} text={m} />
        ))}
      </div>
    );
  }
  const figure = node.kind === 'image' ? previewFigure(node.blockId) : undefined;
  if (node.kind !== 'image' || !figure) return <NodeView node={node} language={language} />;
  if ('slot' in figure) {
    const line = figure.slot;
    const lit = slotSelected === line || slotDrop === line;
    return (
      <div
        data-slot={line}
        data-print-hide
        // The chrome's own face, not the paper's.
        style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif', ...(underLetter ? { marginTop: '1.5em' } : {}) }}
        className={`my-1 flex cursor-pointer flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-md border-2 px-3 py-2.5 text-[13px] leading-snug transition-colors duration-150 ease-out-soft ${
          lit ? 'border-solid border-[#2f6fd6] bg-[#eef4fd] text-[#1d4f9e]' : 'border-dashed border-[#a9b4c2] bg-[#f6f8fa] text-[#4b5563] hover:border-[#7d8a9b]'
        }`}
      >
        <p className="flex min-w-0 items-center gap-2">
          <ImageIcon size={16} className="shrink-0 opacity-70" />
          <span>{m.slotMissing}</span>
        </p>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              figures.choose(line);
            }}
            className="cursor-pointer rounded-md border border-[#c3ccd7] bg-white px-2 py-0.5 text-[12px] text-[#1f2937] transition-colors duration-150 ease-out-soft hover:bg-[#eef1f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fd6]"
          >
            {m.choosePicture}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              figures.dismiss(line);
            }}
            className="cursor-pointer rounded-md px-2 py-0.5 text-[12px] text-[#4b5563] transition-colors duration-150 ease-out-soft hover:bg-[#eef1f5] hover:text-[#1f2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fd6]"
          >
            {m.noPictureNeeded}
          </button>
        </div>
      </div>
    );
  }
  const align = node.align === 'center' ? 'text-center' : node.align === 'right' ? 'text-right' : 'text-left';
  return (
    <div className={align}>
      <span className="relative inline-block" style={{ lineHeight: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={node.src} alt="" width={node.widthPx} height={node.heightPx} className="inline-block" />
        <button
          type="button"
          data-print-hide
          aria-label={m.removePicture}
          title={m.removePicture}
          onClick={(event) => {
            event.stopPropagation();
            figures.remove(figure.pin);
          }}
          className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[#c3ccd7] bg-white text-[#374151] shadow-sm transition-colors duration-150 ease-out-soft hover:bg-[#fdecec] hover:text-[#b42318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6fd6]"
        >
          <CloseIcon size={12} />
        </button>
      </span>
    </div>
  );
}
