'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  createMarkEc,
  createMarkGroup,
  createMarkLevel,
  createMarkPoint,
  createMarkRoute,
  createMarkScheme,
  groupMax,
  groupPoints,
  isSchemeEmpty,
  pointBlocksOf,
  isStandardEc,
  routeGroups,
  routesDisagree,
  schemeDisplay,
  schemeLevels,
  schemeMismatch,
  schemeMax,
  schemeRoutes,
  splitGroupPoint,
  statedContentMax,
  withContentMax,
  withSchemeDisplay,
  withoutEmptyGroupPoint,
  withPointBlocks,
} from '@/model/markScheme';
import {
  createSchemeFromPattern,
  patternPlan,
  SCHEME_PATTERN_IDS,
  type SchemePatternId,
} from '@/model/markSchemePatterns';
import type {
  MarkEcDescriptor,
  MarkGroup,
  MarkLevel,
  MarkPoint,
  MarkRoute,
  MarkScheme,
} from '@/model/markSchemeTypes';
import { ANSWER_DIAGRAM_WIDTH_PX, newId } from '@/model/factories';
import { emptyBiText, isBiTextEmpty } from '@/model/text';
import { setSelectionOffsets } from '@/components/preview/richTextDom';
import type { BiText, ContentBlock } from '@/model/types';
import { Button, CheckField, IconButton, Pill, Segmented } from '@/components/ui';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { useWorksheetStore } from '@/store/worksheetStore';
import { BiTextField } from './BiTextField';
import { BlockEditor } from './BlockEditor';
import { MiniNumber } from './panelRows';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { MARK_SCHEME_MESSAGES } from './MarkSchemeEditor.messages';

/**
 * The HKEAA marking scheme of one leaf (§ A marking scheme is notation, not prose):
 * points with a mark each, grouped under `n@` / "any N" / `max`, OR routes, level
 * descriptors and EC. Teacher-only text, so this panel is its editing surface.
 *
 * The totals are derived and shown, never typed: a pill compares the scheme's reach
 * with the marks the paper prints for the leaf.
 */

const replaceAt = <T,>(list: T[], index: number, next: T): T[] =>
  list.map((entry, i) => (i === index ? next : entry));
const removeAt = <T,>(list: T[], index: number): T[] => list.filter((_, i) => i !== index);
const move = <T,>(list: T[], index: number, delta: number): T[] => {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/** A copy without `key` — an optional field cleared leaves no `undefined` behind. */
function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const next = { ...value };
  delete next[key];
  return next;
}

/** Drop an emptied optional number instead of storing `undefined`. */
function withRule<K extends 'each' | 'take' | 'max'>(
  group: MarkGroup,
  key: K,
  value: number | undefined,
): MarkGroup {
  const next = { ...group };
  if (value === undefined) delete next[key];
  else next[key] = value;
  if (key === 'take' && value === undefined) delete next.firstOnly;
  return next;
}

/**
 * With both languages showing, a field splits in two, and beside a number box each half
 * wrapped a word per line — so the row's controls take a line and the text the next.
 */
function useStackedRows(): boolean {
  return useWorksheetStore((state) => state.mode.language === 'bilingual');
}

/** A small caption before an inline number input. */
function Rule({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-ink-subtle">
      {label}
      {children}
    </span>
  );
}

/**
 * The leaf's answer figures a point may take in (k-0595): a diagram, table or picture added
 * to the answer beside the scheme, offered on each point's menu as "Move … into this point".
 * Absent (the default) offers nothing; set by `MarkSchemeEditor.answerFigures`.
 */
interface AnswerFigures {
  blocks: readonly ContentBlock[];
  move: (blockId: string, pointId: string) => void;
}

const AnswerFiguresContext = createContext<AnswerFigures | undefined>(undefined);

/** The answer's blocks a point can take, each named by its kind and number among the answer's blocks of that kind. */
function answerFigureItems(
  figures: AnswerFigures | undefined,
  m: Messages<typeof MARK_SCHEME_MESSAGES>,
  pointId: string,
): MenuItem[] {
  if (!figures) return [];
  const seen = { diagram: 0, table: 0, image: 0 };
  return figures.blocks.flatMap((block, index): MenuItem[] => {
    if (block.kind !== 'diagram' && block.kind !== 'table' && block.kind !== 'image') return [];
    seen[block.kind] += 1;
    const n = seen[block.kind];
    const label = block.kind === 'diagram' ? m.moveDiagramIn(n) : block.kind === 'table' ? m.moveTableIn(n) : m.movePictureIn(n);
    return [{ label, separated: index === 0 || undefined, onSelect: () => figures.move(block.id, pointId) }];
  });
}

function PointRow({
  point,
  group,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  onEnter,
}: {
  point: MarkPoint;
  group: MarkGroup;
  index: number;
  /** Word's Enter in the point's box, as on the page (k-0482, `GroupBox.pointEnter`). */
  onEnter: (side: 'en' | 'zh', range: { start: number; end: number }) => void;
  count: number;
  onChange: (point: MarkPoint) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  const alternatives = point.alternatives ?? [];
  const setAlternatives = (next: BiText[]) => {
    const rest = omit(point, 'alternatives');
    onChange(next.length > 0 ? { ...rest, alternatives: next } : rest);
  };
  // The point's own figures (k-0595): shown once it has one, or once asked for.
  const figures = pointBlocksOf(point);
  const [figuresOpen, setFiguresOpen] = useState(false);
  const answerFigures = useContext(AnswerFiguresContext);
  const menu: MenuItem[] = [
    { label: m.addAlternative, onSelect: () => setAlternatives([...alternatives, emptyBiText()]) },
    ...(figures.length === 0 && !figuresOpen ? [{ label: m.addFigure, onSelect: () => setFiguresOpen(true) }] : []),
    ...answerFigureItems(answerFigures, m, point.id),
    { label: m.moveUp, onSelect: () => onMove(-1), disabled: index === 0, separated: true },
    { label: m.moveDown, onSelect: () => onMove(1), disabled: index === count - 1 },
    { label: m.deletePoint, danger: true, separated: true, onSelect: onRemove },
  ];
  const stacked = useStackedRows();
  return (
    <div className="space-y-1">
      <div className={`flex items-start gap-1.5 ${stacked ? 'flex-wrap' : ''}`}>
        {group.each !== undefined ? (
          // Under n@ the group sets every point's value; a per-point box would contradict it.
          <span
            className="flex h-7 w-12 shrink-0 items-center justify-end pr-1.5 text-xs tabular-nums text-ink-subtle"
            title={m.eachPointTitle(group.each)}
          >
            {group.each}@
          </span>
        ) : (
          <MiniNumber
            label={m.pointMarks(index + 1)}
            value={point.marks}
            placeholder="–"
            onChange={(marks) => {
              const rest = omit(point, 'marks');
              onChange(marks === undefined ? rest : { ...rest, marks });
            }}
          />
        )}
        <div className={stacked ? 'order-last min-w-0 basis-full' : 'min-w-0 flex-1'}>
          <BiTextField
            translate={{ kind: 'schemePoint' }}
            ariaLabel={m.markingPoint(index + 1)}
            value={point.text}
            rows={1}
            placeholderEn="Marking point…"
            placeholderZh="評分要點…"
            onChange={(text) => onChange({ ...point, text })}
            onEnter={onEnter}
            fieldKey={pointFieldKey(point.id)}
          />
        </div>
        {stacked && <span className="flex-1" />}
        <Menu items={menu} label={m.pointActions(index + 1)} />
      </div>
      {alternatives.map((alternative, altIndex) => (
        <div key={altIndex} className="flex items-start gap-1.5 pl-[3.375rem]">
          <span className="flex h-7 w-3 shrink-0 items-center text-xs font-semibold text-ink-subtle" aria-hidden>
            /
          </span>
          <div className="min-w-0 flex-1">
            <BiTextField
              translate={{ kind: 'schemePoint' }}
              ariaLabel={m.alternativeTo(altIndex + 1, index + 1)}
              value={alternative}
              rows={1}
              placeholderEn="Also accept…"
              placeholderZh="亦接受…"
              onChange={(next) => setAlternatives(replaceAt(alternatives, altIndex, next))}
            />
          </div>
          <IconButton
            label={m.removeAlternative}
            variant="danger"
            onClick={() => setAlternatives(removeAt(alternatives, altIndex))}
          >
            <span aria-hidden>✕</span>
          </IconButton>
        </div>
      ))}
      {(figures.length > 0 || figuresOpen) && (
        <div className="pl-[3.375rem]" data-point-figures={point.id}>
          <BlockEditor
            blocks={figures}
            onChange={(next) => onChange(withPointBlocks(point, next))}
            label={m.pointFigures(index + 1)}
            labelHint={m.pointFiguresHint}
            figureWidth={ANSWER_DIAGRAM_WIDTH_PX}
            figuresOnly
          />
        </div>
      )}
    </div>
  );
}

/** A point's box on the panel (`BiTextField.fieldKey`). */
function pointFieldKey(pointId: string): string {
  return `point:${pointId}`;
}

/**
 * Put the caret at the start of a panel field once it is rendered: a split's new point
 * appears after the store commits, a frame or two later.
 */
function focusPanelField(key: string, side: 'en' | 'zh', tries = 10): void {
  requestAnimationFrame(() => {
    const host = document.querySelector<HTMLElement>(
      `[data-panel-field="${CSS.escape(key)}"][data-panel-side="${side}"] .rich-text-editable`,
    );
    if (!host) {
      if (tries > 0) focusPanelField(key, side, tries - 1);
      return;
    }
    host.focus({ preventScroll: false });
    setSelectionOffsets(host, 0);
  });
}

function GroupBox({
  group,
  index,
  onChange,
  onRemove,
}: {
  group: MarkGroup;
  index: number;
  onChange: (group: MarkGroup) => void;
  onRemove?: () => void;
}) {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  const points = groupPoints(group);
  const setPoints = (next: MarkPoint[]) => onChange({ ...group, points: next });
  /*
   * Word's Enter in a point's box, exactly as on the page (k-0482, `preview/fieldEnter.ts`):
   * the point splits at the caret into a new point after it with the same mark, and the
   * caret goes to the new point's start; Enter on an empty point removes it (when it is not
   * the group's last) and finishes. Before, Enter typed a line break inside the point,
   * which is how a scheme got blank lines (GitHub #7).
   */
  const pointEnter = (point: MarkPoint, side: 'en' | 'zh', range: { start: number; end: number }) => {
    // A point holding a figure (k-0595) is not empty: Enter starts the next point.
    if (isBiTextEmpty(point.text) && (point.alternatives ?? []).length === 0 && pointBlocksOf(point).length === 0) {
      const next = withoutEmptyGroupPoint(group, point.id);
      if (next !== group) onChange(next);
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    const id = newId();
    onChange(splitGroupPoint(group, point.id, side, range.start, range.end, id));
    focusPanelField(pointFieldKey(id), side);
  };
  const hasRules = group.take !== undefined || group.each !== undefined || group.max !== undefined;
  // The rule boxes wait until asked for: most groups have none, and three empty boxes
  // on every group read as something to fill in.
  const [rulesOpen, setRulesOpen] = useState(false);
  const showRules = hasRules || rulesOpen;
  return (
    <div className="space-y-1.5 rounded-md border border-line bg-surface-sunken/40 p-1.5">
      {group.heading !== undefined && (
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <BiTextField
              translate={{ kind: 'schemePoint' }}
              ariaLabel={m.groupHeading(index + 1)}
              value={group.heading}
              rows={1}
              placeholderEn="Possible reasons:"
              placeholderZh="可能理由："
              onChange={(heading) => onChange({ ...group, heading })}
            />
          </div>
          <IconButton label={m.removeHeading} variant="danger" onClick={() => onChange(omit(group, 'heading'))}>
            <span aria-hidden>✕</span>
          </IconButton>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {!showRules && (
          <>
            {group.heading === undefined && (
              <Button size="sm" variant="subtle" onClick={() => onChange({ ...group, heading: emptyBiText() })}>
                {m.addHeading}
              </Button>
            )}
            <Button size="sm" variant="subtle" title={m.rulesHint} onClick={() => setRulesOpen(true)}>
              {m.rules}
            </Button>
          </>
        )}
        {showRules && group.heading === undefined && (
          <Button size="sm" variant="subtle" onClick={() => onChange({ ...group, heading: emptyBiText() })}>
            {m.addHeading}
          </Button>
        )}
        {showRules && (
        <>
        <Rule label={m.any}>
          <MiniNumber
            label={m.creditAny(index + 1)}
            value={group.take}
            placeholder={m.all}
            onChange={(take) => onChange(withRule(group, 'take', take))}
          />
        </Rule>
        <Rule label="n@">
          <MiniNumber
            label={m.marksPerPoint(index + 1)}
            value={group.each}
            placeholder="–"
            onChange={(each) => onChange(withRule(group, 'each', each))}
          />
        </Rule>
        <Rule label="max" /* i18n-ignore: mark scheme notation, as printed */>
          <MiniNumber
            label={m.groupMax(index + 1)}
            value={group.max}
            placeholder="–"
            onChange={(max) => onChange(withRule(group, 'max', max))}
          />
        </Rule>
        </>
        )}
        <span className="ml-auto flex items-center gap-1">
          {/* Indicative points carry no marks: a "0m" pill would read as a mistake. */}
          {(groupMax(group) > 0 || points.some((point) => point.marks !== undefined)) && (
            <Pill>{m.marksShort(groupMax(group))}</Pill>
          )}
          {onRemove && (
            <IconButton label={m.deleteGroup(index + 1)} variant="danger" onClick={onRemove}>
              <span aria-hidden>✕</span>
            </IconButton>
          )}
        </span>
      </div>
      {group.take !== undefined && (
        <CheckField
          label={m.firstOnly(group.take)}
          checked={Boolean(group.firstOnly)}
          onChange={(firstOnly) => {
            const rest = omit(group, 'firstOnly');
            onChange(firstOnly ? { ...rest, firstOnly: true } : rest);
          }}
        />
      )}
      {points.map((point, pointIndex) => (
        <PointRow
          key={point.id}
          point={point}
          group={group}
          index={pointIndex}
          count={points.length}
          onChange={(next) => setPoints(replaceAt(points, pointIndex, next))}
          onMove={(delta) => setPoints(move(points, pointIndex, delta))}
          onRemove={() => setPoints(removeAt(points, pointIndex))}
          onEnter={(side, range) => pointEnter(point, side, range)}
        />
      ))}
      <Button size="sm" variant="subtle" onClick={() => setPoints([...points, createMarkPoint()])}>
        {m.addPoint}
      </Button>
    </div>
  );
}

function RouteBlock({
  route,
  onChange,
}: {
  route: MarkRoute;
  onChange: (route: MarkRoute) => void;
}) {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  const groups = routeGroups(route);
  const setGroups = (next: MarkGroup[]) => onChange({ ...route, groups: next });
  return (
    <div className="space-y-1.5">
      {groups.map((group, groupIndex) => (
        <GroupBox
          key={group.id}
          group={group}
          index={groupIndex}
          onChange={(next) => setGroups(replaceAt(groups, groupIndex, next))}
          onRemove={groups.length > 1 ? () => setGroups(removeAt(groups, groupIndex)) : undefined}
        />
      ))}
      <Button size="sm" variant="subtle" onClick={() => setGroups([...groups, createMarkGroup()])}>
        {m.addGroup}
      </Button>
    </div>
  );
}

function LevelsBlock({
  levels,
  onChange,
}: {
  levels: MarkLevel[];
  onChange: (levels: MarkLevel[] | undefined) => void;
}) {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink-muted">{m.levelsOfPerformance}</span>
        <IconButton label={m.removeLevels} variant="danger" onClick={() => onChange(undefined)}>
          <span aria-hidden>✕</span>
        </IconButton>
      </div>
      {levels.map((level, index) => (
        // Range on its own line, descriptor full width below: beside two number boxes the
        // descriptor wrapped a word per line.
        <div key={level.id} className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-6 shrink-0 text-[11px] font-semibold text-ink-muted">L{index + 1}</span>
            <MiniNumber
              label={m.levelLowest(index + 1)}
              value={level.min}
              onChange={(min) => onChange(replaceAt(levels, index, { ...level, min: min ?? 0 }))}
            />
            <span className="text-xs text-ink-subtle" aria-hidden>
              –
            </span>
            <MiniNumber
              label={m.levelHighest(index + 1)}
              value={level.max}
              onChange={(max) => onChange(replaceAt(levels, index, { ...level, max: max ?? 0 }))}
            />
            <span className="flex-1" />
            <IconButton
              label={m.deleteLevel(index + 1)}
              variant="danger"
              onClick={() => {
                const next = removeAt(levels, index);
                onChange(next.length > 0 ? next : undefined);
              }}
            >
              <span aria-hidden>✕</span>
            </IconButton>
          </div>
          <BiTextField
            translate={{ kind: 'schemeLevel' }}
            ariaLabel={m.levelDescriptor(index + 1)}
            value={level.descriptor}
            rows={1}
            placeholderEn="Candidates at this level…"
            placeholderZh="此等級的考生…"
            onChange={(descriptor) => onChange(replaceAt(levels, index, { ...level, descriptor }))}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="subtle"
        onClick={() => onChange([...levels, createMarkLevel(levels[levels.length - 1])])}
      >
        {m.addLevel}
      </Button>
    </div>
  );
}

function EcBlock({
  scheme,
  onChange,
}: {
  scheme: MarkScheme;
  onChange: (scheme: MarkScheme) => void;
}) {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  const stacked = useStackedRows();
  const ec = scheme.ec!;
  const rows = ec.descriptors ?? [];
  const setRows = (descriptors: MarkEcDescriptor[]) => onChange({ ...scheme, ec: { ...ec, descriptors } });
  // HKEAA's standard table is twelve statements: folded to one line until its wording is
  // wanted, so the part's own points stay in view (k-0475).
  const standard = isStandardEc(ec);
  const [unfolded, setUnfolded] = useState(false);
  const folded = standard && !unfolded;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[11px] font-medium text-ink-muted">{m.effectiveCommunication}</span>
        <Rule label="max" /* i18n-ignore: mark scheme notation, as printed */>
          <MiniNumber
            label={m.ecMax}
            value={ec.max}
            onChange={(max) => onChange({ ...scheme, ec: { ...ec, max: max ?? 0 } })}
          />
        </Rule>
        <IconButton
          label={m.removeEc}
          variant="danger"
          onClick={() => onChange(omit(scheme, 'ec'))}
        >
          <span aria-hidden>✕</span>
        </IconButton>
      </div>
      {folded && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex-1 text-[11px] text-ink-muted">{m.ecStandardFolded}</span>
          <Button size="sm" variant="subtle" onClick={() => setUnfolded(true)}>
            {m.ecEditWording}
          </Button>
        </div>
      )}
      {!folded && rows.map((row, index) => (
        <div key={row.id} className={`flex items-start gap-1.5 ${stacked ? 'flex-wrap' : ''}`}>
          <MiniNumber
            label={m.ecRowMarks(index + 1)}
            value={row.marks}
            onChange={(marks) => setRows(replaceAt(rows, index, { ...row, marks: marks ?? 0 }))}
          />
          <div className={stacked ? 'order-last min-w-0 basis-full' : 'min-w-0 flex-1'}>
            <BiTextField
              translate={{ kind: 'schemeEc' }}
              ariaLabel={m.ecDescriptor(row.marks)}
              value={row.text}
              rows={1}
              onChange={(text) => setRows(replaceAt(rows, index, { ...row, text }))}
            />
          </div>
          {stacked && <span className="flex-1" />}
          <IconButton
            label={m.deleteEcRow(index + 1)}
            variant="danger"
            onClick={() => setRows(removeAt(rows, index))}
          >
            <span aria-hidden>✕</span>
          </IconButton>
        </div>
      ))}
      {!folded && <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="subtle"
          onClick={() => setRows([...rows, { id: newId(), marks: 0, text: emptyBiText() }])}
        >
          {m.addEcRow}
        </Button>
        {!isStandardEc(ec) && (
          <Button
            size="sm"
            variant="subtle"
            title={m.useStandardEcHint}
            onClick={() => onChange({ ...scheme, ec: createMarkEc() })}
          >
            {m.useStandardEc}
          </Button>
        )}
      </div>}
    </div>
  );
}

/** The hint a pattern button carries: what it will build for this part's marks. */
function usePatternHint() {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  return (id: SchemePatternId, marks: number | undefined): string => {
    const plan = patternPlan(id, marks);
    switch (id) {
      case 'points':
        return m.pattern_pointsHint(plan.points);
      case 'reasons':
        return m.pattern_reasonsHint(plan.each, plan.take, plan.max);
      case 'paragraph':
        return m.pattern_paragraphHint(plan.total);
      case 'explainDiagram':
        return m.pattern_explainDiagramHint(plan.verbal, plan.diagram);
      case 'essay':
        return m.pattern_essayHint(plan.content, plan.ec);
    }
  };
}

/**
 * The shapes HKEAA's DRQ schemes take, a click each (k-0475): offered while the part has
 * no scheme words yet, sized to the marks the paper prints for it.
 */
function PatternPicker({
  printedMarks,
  onPick,
}: {
  printedMarks: number | undefined;
  onPick: (scheme: MarkScheme) => void;
}) {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  const hint = usePatternHint();
  const label: Record<SchemePatternId, string> = {
    points: m.pattern_points,
    reasons: m.pattern_reasons,
    paragraph: m.pattern_paragraph,
    explainDiagram: m.pattern_explainDiagram,
    essay: m.pattern_essay,
  };
  return (
    <div className="space-y-1">
      <span className="text-[11px] text-ink-muted">{m.startFrom}</span>
      <div role="group" aria-label={m.patternsLabel} className="flex flex-wrap gap-1">
        {SCHEME_PATTERN_IDS.map((id) => (
          <Button
            key={id}
            size="sm"
            variant="subtle"
            title={hint(id, printedMarks)}
            onClick={() => onPick(createSchemeFromPattern(id, printedMarks))}
          >
            {label[id]}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function MarkSchemeEditor({
  scheme,
  printedMarks,
  onChange,
  ownerId,
  answerFigures,
}: {
  /** The leaf's id, so its row's scheme chip can bring this into view. */
  ownerId?: string;
  /**
   * The leaf's answer blocks and how to move one into a point (k-0595,
   * `model/answerBlocks.ts:moveAnswerBlockToPoint`): each point's menu offers the answer's
   * diagrams, tables and pictures. Absent offers none.
   */
  answerFigures?: AnswerFigures;
  scheme: MarkScheme | undefined;
  /** The marks the paper prints for this leaf, to check the scheme's total against. */
  printedMarks: number | undefined;
  /** `undefined` removes the scheme. */
  onChange: (scheme: MarkScheme | undefined) => void;
}) {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  if (!scheme) {
    return (
      <div className="space-y-1.5 rounded-md border border-dashed border-line p-2" data-scheme-editor="" data-scheme-owner={ownerId}>
        <span className="block text-[11px] font-medium text-ink-muted">
          {m.markingScheme} <span className="font-normal text-ink-subtle">{m.teacherVersion}</span>
        </span>
        <PatternPicker printedMarks={printedMarks} onPick={onChange} />
        <Button size="sm" variant="subtle" onClick={() => onChange(createMarkScheme())}>
          {m.addMarkingPoints}
        </Button>
      </div>
    );
  }

  const routes = schemeRoutes(scheme);
  const levels = schemeLevels(scheme);
  const setRoutes = (next: MarkRoute[]) => onChange({ ...scheme, routes: next });
  const mismatch = schemeMismatch(scheme, printedMarks);
  const total = schemeMax(scheme);
  const display = schemeDisplay(scheme);
  const hasGroupRules = routes.some((route) =>
    routeGroups(route).some(
      (group) => group.each !== undefined || group.take !== undefined || group.max !== undefined,
    ),
  );

  const stated = statedContentMax(scheme);
  const indicative =
    stated !== undefined &&
    routes.every((route) =>
      routeGroups(route).every((group) =>
        group.each === undefined && groupPoints(group).every((point) => point.marks === undefined),
      ),
    );
  const menu: MenuItem[] = [
    { label: m.addOrRoute, onSelect: () => setRoutes([...routes, createMarkRoute()]) },
    ...(levels.length === 0
      ? [{ label: m.addLevels, onSelect: () => onChange({ ...scheme, levels: [createMarkLevel()] }) }]
      : []),
    ...(!scheme.ec
      ? [{ label: m.addEc, onSelect: () => onChange({ ...scheme, ec: createMarkEc() }) }]
      : []),
    { label: m.removeScheme, danger: true, separated: true, onSelect: () => onChange(undefined) },
  ];

  return (
    <AnswerFiguresContext.Provider value={answerFigures}>
    <div className="space-y-2 rounded-md border border-line p-2" data-scheme-editor="" data-scheme-owner={ownerId}>
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[11px] font-medium text-ink-muted">
          {m.markingScheme} <span className="font-normal text-ink-subtle">{m.teacherVersion}</span>
        </span>
        <span
          title={
            mismatch
              ? m.mismatch(mismatch.scheme, mismatch.printed)
              : m.awardsTotal
          }
        >
          <Pill tone={mismatch ? 'warn' : 'neutral'}>
            {printedMarks !== undefined ? `${total} / ${m.marksShort(printedMarks)}` : m.marksShort(total)}
          </Pill>
        </span>
        <Menu items={menu} label={m.schemeActions} />
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5">
        <span className="text-[11px] text-ink-muted">{m.showAs}</span>
        <Segmented
          label={m.showAs}
          value={display}
          onChange={(next) => onChange(withSchemeDisplay(scheme, next))}
          options={[
            { value: 'points', label: m.showAsPoints, title: m.showAsPointsHint },
            { value: 'paragraph', label: m.showAsParagraph, title: m.showAsParagraphHint },
          ]}
        />
      </div>
      {isSchemeEmpty(scheme) && !scheme.levels && (
        <PatternPicker printedMarks={printedMarks} onPick={onChange} />
      )}
      {stated !== undefined && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Rule label={m.contentMax}>
            <MiniNumber
              label={m.contentMax}
              value={stated}
              onChange={(value) => onChange(withContentMax(scheme, value))}
            />
          </Rule>
          <IconButton label={m.removeContentMax} variant="danger" onClick={() => onChange(withContentMax(scheme, undefined))}>
            <span aria-hidden>✕</span>
          </IconButton>
          {indicative && <span className="basis-full text-[11px] text-ink-muted">{m.indicativeNote}</span>}
        </div>
      )}
      {display === 'paragraph' && (hasGroupRules || routes.some((route) => routeGroups(route).some((group) => group.heading))) && (
        <p className="text-[11px] text-ink-muted">{m.paragraphRulesHidden}</p>
      )}
      {routesDisagree(scheme) && (
        <p className="text-[11px] text-warn-ink">{m.routesDisagree}</p>
      )}
      {routes.map((route, routeIndex) => (
        <div key={route.id} className="space-y-1.5">
          {routeIndex > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{m.or}</span>
              <span className="h-px flex-1 bg-line" />
              <IconButton
                label={m.deleteRoute(routeIndex + 1)}
                variant="danger"
                onClick={() => setRoutes(removeAt(routes, routeIndex))}
              >
                <span aria-hidden>✕</span>
              </IconButton>
            </div>
          )}
          <RouteBlock route={route} onChange={(next) => setRoutes(replaceAt(routes, routeIndex, next))} />
        </div>
      ))}
      {levels.length > 0 && (
        <div className="border-t border-line pt-2">
          <LevelsBlock
            levels={levels}
            onChange={(next) => {
              const rest = omit(scheme, 'levels');
              onChange(next ? { ...rest, levels: next } : rest);
            }}
          />
        </div>
      )}
      {scheme.ec && (
        <div className="border-t border-line pt-2">
          <EcBlock scheme={scheme} onChange={onChange} />
        </div>
      )}
      {/* What a DRQ part adds, in sight rather than in the ⋯ menu (k-0475). */}
      <div className="flex flex-wrap gap-1 border-t border-line pt-2">
        <Button size="sm" variant="subtle" onClick={() => setRoutes([...routes, createMarkRoute()])}>
          {m.addOr}
        </Button>
        {!scheme.ec && (
          <Button size="sm" variant="subtle" onClick={() => onChange({ ...scheme, ec: createMarkEc() })}>
            {m.addEcTable}
          </Button>
        )}
        {stated === undefined && (
          <Button
            size="sm"
            variant="subtle"
            title={m.addContentMaxHint}
            onClick={() =>
              onChange(
                withContentMax(
                  scheme,
                  Math.max(0, (printedMarks ?? schemeMax(scheme)) - (scheme.ec ? scheme.ec.max : 0)),
                ),
              )
            }
          >
            {m.addContentMax}
          </Button>
        )}
        {levels.length === 0 && (
          <Button size="sm" variant="subtle" onClick={() => onChange({ ...scheme, levels: [createMarkLevel()] })}>
            {m.addLevelsShort}
          </Button>
        )}
      </div>
    </div>
    </AnswerFiguresContext.Provider>
  );
}
