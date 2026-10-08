'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChromeLeftover, PageChrome } from '@/import';
import { planChrome } from '@/import/chromePlan';
import type { Band, HeaderFooter, LanguageMode } from '@/model/types';
import { renderBand } from '@/render/worksheet';
import { NodeView } from '@/components/preview/Preview';
import { Button, CheckField } from '@/components/ui';
import type { Messages } from '@/i18n/catalogue';
import type { IMPORT_MESSAGES } from './messages';

/**
 * The file's header, footer and title block in the review (`docs/design/paste-import.md`
 * § 12): drawn small with the editor's own band rows, the switch that keeps the paper
 * type's preset instead, and what could not be brought in, as text to copy.
 */

type Text = Messages<typeof IMPORT_MESSAGES>;

/** The strip's own margin around the text column, px at print size (as the question cards). */
const PAD_X = 22;
const PAD_Y = 8;

export function leftoverNote(m: Text, leftover: ChromeLeftover): string {
  const where = leftover.where === 'header' ? m.whereHeader : leftover.where === 'footer' ? m.whereFooter : m.whereMasthead;
  switch (leftover.reason) {
    case 'picture':
      return m.leftoverPicture(where);
    case 'table':
      return m.leftoverTable(where);
    case 'textBox':
      return m.leftoverTextBox(where);
    case 'tooMany':
      return m.leftoverTooMany(where);
    case 'evenPages':
      return m.leftoverEvenPages(where);
    case 'otherSection':
      return m.leftoverOtherSection(where);
    case 'pageCount':
      return m.leftoverPageCount;
    case 'marksDiffer':
      return m.leftoverMarksDiffer(leftover.marks?.stated ?? 0, leftover.marks?.counted ?? 0);
    case 'noCoverPlace':
      return m.leftoverNoCoverPlace;
    case 'noHeader':
      return m.leftoverNoHeader;
  }
}

/** Parts that could not be brought in: a note each, and the text with a Copy button. */
export function ChromeLeftovers({ text: m, leftovers }: { text: Text; leftovers: readonly ChromeLeftover[] }) {
  if (!leftovers.length) return null;
  return (
    <div data-chrome-leftovers>
      <p className="mb-1 text-[11.5px] font-medium text-ink-muted">{m.retypeTitle(leftovers.length)}</p>
      <ul className="space-y-1.5">
        {leftovers.map((leftover, k) => (
          <LeftoverRow key={`${leftover.where}:${leftover.reason}:${k}`} text={m} leftover={leftover} />
        ))}
      </ul>
    </div>
  );
}

function LeftoverRow({ text: m, leftover }: { text: Text; leftover: ChromeLeftover }) {
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLPreElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () => {
    const done = () => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    };
    const select = () => {
      // No clipboard access (an old webview): select the text so ⌘C takes it.
      const range = document.createRange();
      if (box.current) range.selectNodeContents(box.current);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(leftover.text).then(done, select);
    else select();
  };
  return (
    <li className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
      <p className="text-[11.5px] leading-snug text-ink-muted">{leftoverNote(m, leftover)}</p>
      {leftover.text && (
        <div className="mt-1 flex items-start gap-2">
          <pre
            ref={box}
            className="scroll-slim max-h-24 min-w-0 flex-1 select-text overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface-sunken px-2 py-1 font-sans text-[12px] leading-snug text-ink"
          >
            {leftover.text}
          </pre>
          <Button size="sm" variant="subtle" aria-live="polite" onClick={copy} className="shrink-0">
            {copied ? m.copied : m.copy}
          </Button>
        </div>
      )}
    </li>
  );
}

interface Strip {
  key: string;
  label: string;
  bands: Band[];
  /** "None on page 1". */
  blank?: boolean;
  rule?: boolean;
  /** A rule above (a footer's) rather than below. */
  ruleAbove?: boolean;
  dim?: boolean;
}

function edgeStrips(m: Text, edge: HeaderFooter | undefined, which: 'header' | 'footer', dim: boolean): Strip[] {
  if (!edge) return [];
  const later = which === 'header' ? m.chromeHeaderLater : m.chromeFooterLater;
  const every = which === 'header' ? m.chromeHeader : m.chromeFooter;
  const page1 = which === 'header' ? m.chromePage1Header : m.chromePage1Footer;
  const differs = edge.firstPage !== undefined || edge.showOnFirstPage === false;
  const out: Strip[] = [];
  const page1Strip: Strip | undefined = edge.firstPage
    ? { key: `${which}-1`, label: page1, bands: edge.firstPage.bands, rule: edge.firstPage.rule ?? edge.rule, ruleAbove: which === 'footer', dim }
    : edge.showOnFirstPage === false && edge.bands.length
      ? { key: `${which}-1`, label: page1, bands: [], blank: true, dim }
      : undefined;
  const running: Strip | undefined = edge.bands.length ? { key: which, label: differs ? later : every, bands: edge.bands, rule: edge.rule, ruleAbove: which === 'footer', dim } : undefined;
  // Page 1 first, as the pages run.
  if (page1Strip) out.push(page1Strip);
  if (running) out.push(running);
  return out;
}

export function ChromeReview({
  text: m,
  chrome,
  language,
  totalMarks,
  keepPreset,
  onKeepPreset,
  layout,
}: {
  text: Text;
  chrome: PageChrome;
  language: LanguageMode;
  totalMarks: number;
  keepPreset: boolean;
  onKeepPreset: (keep: boolean) => void;
  layout: { zoom: number; width: number; paper: React.CSSProperties };
}) {
  // What the file has, drawn as a classroom worksheet would take it; Save as decides the cover.
  const plan = useMemo(() => planChrome(chrome, { documentType: 'classroom', language, totalMarks }), [chrome, language, totalMarks]);
  const strips: Strip[] = [
    ...edgeStrips(m, plan.header, 'header', keepPreset),
    ...(plan.bands?.length ? [{ key: 'masthead', label: m.chromeTitleBlock, bands: plan.bands }] : []),
    ...edgeStrips(m, plan.footer, 'footer', keepPreset),
  ];
  const edges = Boolean(plan.header || plan.footer);
  if (!strips.length && !plan.leftovers.length) return null;
  return (
    <section data-chrome-review aria-label={m.chromeTitle} className="space-y-2 pb-2">
      <p className="flex items-baseline gap-2 text-[11.5px]">
        <span className="font-medium text-ink">{m.chromeTitle}</span>
        <span className="text-ink-subtle">{m.chromeFromFile}</span>
      </p>
      {strips.map((strip) => (
        <div key={strip.key} className={strip.dim ? 'opacity-45' : undefined}>
          <p className="mb-0.5 flex gap-2 text-[10.5px] text-ink-subtle">
            <span>{strip.label}</span>
            {strip.dim && <span className="font-medium">{m.chromeNotApplied}</span>}
          </p>
          <div
            className="paper rounded-[2px] shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
            lang={language === 'zh' ? 'zh-HK' : 'en'}
            style={{ ...layout.paper, width: layout.width, padding: `${PAD_Y}px ${PAD_X}px`, zoom: layout.zoom }}
          >
            {strip.blank ? (
              <p className="text-[11px] italic text-[#6b7280]" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif' }}>
                {m.chromePage1Blank}
              </p>
            ) : (
              <div style={strip.rule ? (strip.ruleAbove ? { borderTop: '0.5pt solid #000', paddingTop: 2 } : { borderBottom: '0.5pt solid #000', paddingBottom: 2 }) : undefined}>
                {strip.bands.map((band) => {
                  const node = renderBand(band, totalMarks, language);
                  return node ? <NodeView key={band.id} node={node} language={language} /> : null;
                })}
              </div>
            )}
          </div>
        </div>
      ))}
      {plan.bands?.length ? <p className="text-[11px] text-ink-subtle">{m.chromeCoverNote}</p> : null}
      {edges && (
        <div>
          <CheckField label={m.keepPreset} checked={keepPreset} onChange={onKeepPreset} />
          <p className="ml-6 text-[11px] text-ink-subtle">{m.keepPresetHint}</p>
        </div>
      )}
      <ChromeLeftovers text={m} leftovers={plan.leftovers} />
    </section>
  );
}
