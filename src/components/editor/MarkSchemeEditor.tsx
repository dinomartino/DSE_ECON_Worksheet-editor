'use client';

import type { ReactNode } from 'react';
import {
  createMarkEc,
  createMarkGroup,
  createMarkLevel,
  createMarkPoint,
  createMarkRoute,
  createMarkScheme,
  groupMax,
  groupPoints,
  routeGroups,
  routesDisagree,
  schemeLevels,
  schemeMismatch,
  schemeMax,
  schemeRoutes,
} from '@/model/markScheme';
import type {
  MarkEcDescriptor,
  MarkGroup,
  MarkLevel,
  MarkPoint,
  MarkRoute,
  MarkScheme,
} from '@/model/markSchemeTypes';
import { newId } from '@/model/factories';
import { emptyBiText } from '@/model/text';
import type { BiText } from '@/model/types';
import { Button, CheckField, IconButton, Pill } from '@/components/ui';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { useWorksheetStore } from '@/store/worksheetStore';
import { BiTextField } from './BiTextField';
import { MiniNumber } from './panelRows';
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

function PointRow({
  point,
  group,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  point: MarkPoint;
  group: MarkGroup;
  index: number;
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
  const menu: MenuItem[] = [
    { label: m.addAlternative, onSelect: () => setAlternatives([...alternatives, emptyBiText()]) },
    { label: m.moveUp, onSelect: () => onMove(-1), disabled: index === 0 },
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
    </div>
  );
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
  return (
    <div className="space-y-1.5 rounded-md border border-line bg-surface-sunken/40 p-1.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
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
        <Rule label="max">
          <MiniNumber
            label={m.groupMax(index + 1)}
            value={group.max}
            placeholder="–"
            onChange={(max) => onChange(withRule(group, 'max', max))}
          />
        </Rule>
        <span className="ml-auto flex items-center gap-1">
          <Pill>{m.marksShort(groupMax(group))}</Pill>
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
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[11px] font-medium text-ink-muted">{m.effectiveCommunication}</span>
        <Rule label="max">
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
      {rows.map((row, index) => (
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
      <Button
        size="sm"
        variant="subtle"
        onClick={() => setRows([...rows, { id: newId(), marks: 0, text: emptyBiText() }])}
      >
        {m.addEcRow}
      </Button>
    </div>
  );
}

export function MarkSchemeEditor({
  scheme,
  printedMarks,
  onChange,
}: {
  scheme: MarkScheme | undefined;
  /** The marks the paper prints for this leaf, to check the scheme's total against. */
  printedMarks: number | undefined;
  /** `undefined` removes the scheme. */
  onChange: (scheme: MarkScheme | undefined) => void;
}) {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  if (!scheme) {
    return (
      <Button size="sm" variant="subtle" onClick={() => onChange(createMarkScheme())}>
        {m.addMarkingPoints}
      </Button>
    );
  }

  const routes = schemeRoutes(scheme);
  const levels = schemeLevels(scheme);
  const setRoutes = (next: MarkRoute[]) => onChange({ ...scheme, routes: next });
  const mismatch = schemeMismatch(scheme, printedMarks);
  const total = schemeMax(scheme);

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
    <div className="space-y-2 rounded-md border border-line p-2">
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
    </div>
  );
}
