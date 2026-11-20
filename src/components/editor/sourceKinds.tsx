import type { ReactNode } from 'react';
import type { Messages } from '@/i18n/catalogue';
import type { SourceKind } from '@/model/drq';
import { SOURCE_KINDS } from '@/model/drq';
import { plain } from '@/model/text';
import type { ContentBlock, LanguageMode } from '@/model/types';
import {
  BarChartIcon,
  ForumIcon,
  ImageIcon,
  LineChartIcon,
  StakeholderIcon,
  StimulusIcon,
  TableIcon,
  TextIcon,
  ViewsIcon,
} from '@/components/ui/icons';
import type { DRQ_PANEL_MESSAGES } from './drqPanel.messages';

type DrqMessages = Messages<typeof DRQ_PANEL_MESSAGES>;

/** One entry of Add → Source ▾ (the panel) and Insert → Source… (the rail). */
export interface SourceKindOption {
  /** A body kind, or a picture from a file, or an empty frame. */
  kind: SourceKind | 'picture' | 'empty';
  label: string;
  hint: string;
  icon: ReactNode;
}

const TEXT: Record<SourceKind, [keyof DrqMessages, keyof DrqMessages]> = {
  table: ['kindTable', 'kindTableHint'],
  barChart: ['kindBarChart', 'kindBarChartHint'],
  lineChart: ['kindLineChart', 'kindLineChartHint'],
  text: ['kindText', 'kindTextHint'],
  views: ['kindViews', 'kindViewsHint'],
  forum: ['kindForum', 'kindForumHint'],
  stakeholders: ['kindStakeholders', 'kindStakeholdersHint'],
};

const ICON: Record<SourceKind, ReactNode> = {
  table: <TableIcon size={16} />,
  barChart: <BarChartIcon size={16} />,
  lineChart: <LineChartIcon size={16} />,
  text: <TextIcon size={16} />,
  views: <ViewsIcon size={16} />,
  forum: <ForumIcon size={16} />,
  stakeholders: <StakeholderIcon size={16} />,
};

/** The source kinds in menu order, then Picture (a file) and Empty. */
export function sourceKindOptions(m: DrqMessages, { picture = true }: { picture?: boolean } = {}): SourceKindOption[] {
  const kinds: SourceKindOption[] = SOURCE_KINDS.map((kind) => ({
    kind,
    label: m[TEXT[kind][0]] as string,
    hint: m[TEXT[kind][1]] as string,
    icon: ICON[kind],
  }));
  if (picture) kinds.push({ kind: 'picture', label: m.kindPicture, hint: m.kindPictureHint, icon: <ImageIcon size={16} /> });
  kinds.push({ kind: 'empty', label: m.kindEmpty, hint: m.kindEmptyHint, icon: <StimulusIcon size={16} /> });
  return kinds;
}

/** What one body block is, in a word for the source card's header. */
function blockNoun(inner: ContentBlock, m: DrqMessages): string {
  if (inner.kind === 'table') return m.holdsTable;
  if (inner.kind === 'image') return m.holdsPicture;
  if (inner.kind === 'figureRow') return m.holdsDiagram;
  if (inner.kind !== 'diagram') return m.holdsText;
  const diagram = inner.diagram;
  if (diagram.chart) return diagram.chart.kind === 'line' ? m.kindLineChart : m.kindBarChart;
  if (diagram.stakeholder) return m.kindStakeholders;
  if (diagram.forum) return m.kindForum;
  return m.holdsDiagram;
}

/** What a source holds, for its card's header: "Table", "Bar chart", "Mixed"… */
export function sourceHolds(block: Extract<ContentBlock, { kind: 'source' }>, m: DrqMessages): string {
  const nouns = new Set(block.blocks.map((inner) => blockNoun(inner, m)));
  if (nouns.size === 0) return m.holdsText;
  if (nouns.size > 1) return m.holdsMixed;
  return [...nouns][0];
}

/**
 * A source's caption without its "Source B:" lead, for the folded card's one line:
 * "Source B · Bar chart · Visitor arrivals by region". The language the paper is shown in,
 * falling back to the other when that side is still empty.
 */
export function sourceCaption(block: Extract<ContentBlock, { kind: 'source' }>, language: LanguageMode): string {
  if (!block.label) return '';
  const en = plain(block.label.en).replace(/^\s*Source\s+[A-Z]\s*[:：]\s*/, '').trim();
  const zh = plain(block.label.zh).replace(/^\s*資料\s*[A-Z]\s*[:：]\s*/, '').trim();
  return language === 'zh' ? zh || en : en || zh;
}
