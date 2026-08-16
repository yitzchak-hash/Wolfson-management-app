import React, { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { Apartment, BuildingId, Stage } from '../../types';
import { useStore } from '../../data/store';

interface BuildingDiagramProps {
  apartments: Apartment[];
  stages: Stage[];
  activeStageIds: string[];
  classFilter: 'all' | 'standard' | 'shinui';
  searchQuery: string;
  selectedBuilding: BuildingId | 'all';
  onApartmentClick: (apt: Apartment) => void;
  showShinuiBadge: boolean;
  bulkMode?: boolean;
  bulkSelected?: Set<string>;
  highlightedApartmentIds?: Set<string>;
  aptSubLabels?: Map<string, string>;
  aptTaskData?: Map<string, string>;     // aptId → formatted task string e.g. "John · 2"
  nextStageLabels?: Map<string, string>; // aptId → next stage name
  onAddTask?: (apt: Apartment) => void;  // opens quick-add task panel
  aptCompletedData?: Map<string, boolean>; // aptId → true if all tasks complete
  compact?: boolean;
  /** Larger rows and type for a one-building-at-a-time phone view. */
  phone?: boolean;
  onNameUnnamed?: (apt: Apartment) => void; // opens naming dialog for unnamed slots
}

// Darkens a hex colour. Used to outline stage-coloured cells so two neighbours
// sharing the same stage still read as two distinct apartments.
function darken(hex: string, amount = 0.26): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(num)) return hex;
  const ch = (shift: number) => Math.max(0, Math.round(((num >> shift) & 255) * (1 - amount)));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

function getTextColor(bgHex: string): string {
  const hex = bgHex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.52 ? '#1a202c' : '#ffffff';
}

interface FloorRowDef {
  floorLabel: string;
  type: 'roof' | 'duplex' | 'wide' | 'normal' | 'lobby' | 'ground' | 'basement';
  aptNums?: number[];
  height: number;
}

function getFloorRows(buildingId: BuildingId, compact = false, phone = false): FloorRowDef[] {
  const h = compact
    ? { roof: 16, wide: 36, normal: 36, basement: 30, lobby: 26, ground: 26 }
    : phone
    ? { roof: 22, wide: 78, normal: 78, basement: 64, lobby: 48, ground: 48 }
    : { roof: 26, wide: 68, normal: 68, basement: 58, lobby: 44, ground: 44 };

  const rows: FloorRowDef[] = [];

  rows.push({ floorLabel: 'Roof', type: 'roof', height: h.roof });
  rows.push({ floorLabel: '15', type: 'wide', aptNums: [55, 56], height: h.wide });
  rows.push({ floorLabel: '14', type: 'wide', aptNums: [53, 54], height: h.wide });

  for (let fl = 14; fl >= 2; fl--) {
    const base = (fl - 2) * 4 + 1;
    rows.push({ floorLabel: String(fl - 1), type: 'normal', aptNums: [base, base + 1, base + 2, base + 3], height: h.normal });
  }

  const groundAptNums = buildingId === 'A1' ? [77, 78, 79, 80] : [73, 74, 75, 76];
  const firstAptNums  = buildingId === 'A1' ? [81, 82, 83, 84] : [77, 78, 79, 80];
  rows.push({ floorLabel: '1', type: 'lobby', aptNums: firstAptNums, height: h.lobby });
  rows.push({ floorLabel: 'Ground', type: 'ground', aptNums: groundAptNums, height: h.ground });

  const basementDef = buildingId === 'A1'
    ? [
        { label: '-0.5', aptNums: [57, 58, 59, 60] },
        { label: '-1',   aptNums: [61, 62, 63, 64] },
        { label: '-2',   aptNums: [65, 66, 67, 68] },
        { label: '-3',   aptNums: [69, 70, 71, 72] },
        { label: '-4',   aptNums: [73, 74, 75, 76] },
      ]
    : [
        { label: '-1', aptNums: [57, 58, 59, 60] },
        { label: '-2', aptNums: [61, 62, 63, 64] },
        { label: '-3', aptNums: [65, 66, 67, 68] },
        { label: '-4', aptNums: [69, 70, 71, 72] },
      ];

  basementDef.forEach(b =>
    rows.push({ floorLabel: b.label, type: 'basement', aptNums: b.aptNums, height: h.basement })
  );

  return rows;
}

interface AptCellProps {
  apt: Apartment | undefined;
  stage: Stage | null;
  isHighlighted: boolean;
  isDimmed: boolean;
  showShinuiBadge: boolean;
  onClick: () => void;
  isDuplex?: boolean;
  rowFloorType?: 'basement' | 'ground' | 'lobby';
  isMerged?: boolean;
  mergedLabel?: string;
  isBulkSelected?: boolean;
  isContractorHighlighted?: boolean;
  aptSubLabel?: string;
  taskInfo?: string;
  nextStageName?: string;
  onAddTask?: () => void;
  allTasksDone?: boolean;
  compact?: boolean;
  phone?: boolean;
  onNameUnnamed?: () => void;
  /** 'connector' draws a link chip in the gap toward the partner on the right. */
  mergeLink?: 'connector' | 'badge' | null;
  /** Extra layout styles — used to make a duplex span two floor rows. */
  extraStyle?: React.CSSProperties;
  /** True when this cell is hovered OR its merged partner is. */
  isHoverGroup?: boolean;
  onHover?: (id: string | null) => void;
}

function AptCell({
  apt, stage, isHighlighted, isDimmed, showShinuiBadge, onClick,
  isDuplex, rowFloorType, isMerged, mergedLabel, isBulkSelected, isContractorHighlighted,
  aptSubLabel, taskInfo, nextStageName, onAddTask, allTasksDone, compact, phone, onNameUnnamed,
  mergeLink, extraStyle, isHoverGroup, onHover,
}: AptCellProps) {
  const ui = useStore(state => state.mainUiStrings);
  const hasStage = !!stage;
  const floorBg =
    rowFloorType === 'basement' ? '#eef3f9' :
    rowFloorType === 'ground'   ? '#fefce8' :
    rowFloorType === 'lobby'    ? '#f0fdf4' :
    '#ffffff';
  const floorBorder =
    rowFloorType === 'basement' ? '#c8d8ec' :
    rowFloorType === 'ground'   ? '#fde68a' :
    rowFloorType === 'lobby'    ? '#bbf7d0' :
    '#e2e8f0';
  // Dimmed cells use a gray palette to make the filter visually obvious
  const bgColor = isDimmed ? '#e5e7eb' : (hasStage ? stage!.color : floorBg);
  // Stage-coloured cells get a darker outline of their own colour so adjacent
  // apartments at the same stage don't blur into one block.
  const borderColor = isDimmed ? '#d1d5db' : (isMerged ? '#3b82f6' : hasStage ? darken(stage!.color) : floorBorder);
  const borderWidth = isMerged && !isDimmed ? '2px' : '1.5px';
  const textColor = isDimmed ? '#9ca3af' : (hasStage ? getTextColor(stage!.color) : '#374151');

  // The apartment number is always the primary label — a family name never replaces
  // it, it renders on its own line underneath.
  const numberLabel = mergedLabel || (apt && !apt.isUnnamed ? apt.apartmentNumber : '');
  const rawName = apt?.displayName?.trim() ?? '';
  // Only a *real* name counts — displayName defaults to the apartment number.
  const nameLabel = rawName && rawName !== apt?.apartmentNumber?.trim() ? rawName : '';
  const displayLabel = numberLabel || nameLabel;

  const scale = isHighlighted && !isDimmed ? 'scale-[1.04] z-10' : '';

  const boxShadow = isDimmed ? 'none'
    : isHoverGroup ? `0 0 0 2px #2563eb, 0 3px 12px ${borderColor}99`
    : isContractorHighlighted ? `0 0 0 2px #f59e0b, 0 2px 10px ${borderColor}88`
    : hasStage ? `0 1px 3px ${borderColor}55`
    : '0 1px 2px rgba(0,0,0,0.06)';

  const numFontSize = compact ? '9px' : phone ? (mergedLabel ? '10.5px' : '11.5px') : mergedLabel ? '10px' : '11px';

  // Pending task indicator: orange dot when has tasks but NOT all done
  const hasPendingTask = !!taskInfo && !allTasksDone;

  return (
    // Outer wrapper is not clipped, so the merge connector can sit in the gap
    // between two linked apartments. It also carries the duplex two-row span.
    <div className="relative flex" style={{ flex: 1, minWidth: 0, ...extraStyle }}>
    <div
      className={`relative flex flex-col items-center justify-center cursor-pointer select-none rounded-md overflow-hidden transition-all duration-100 ${scale}`}
      onMouseEnter={() => apt && onHover?.(apt.id)}
      onMouseLeave={() => onHover?.(null)}
      style={{
        filter: isHoverGroup && !isDimmed ? 'brightness(1.07)' : undefined,
        backgroundColor: bgColor,
        color: textColor,
        flex: 1,
        border: `${borderWidth} solid ${borderColor}`,
        minWidth: 0,
        boxShadow,
        padding: compact ? '1px 1px' : '2px 2px',
        gap: compact ? undefined : '1px',
      }}
      onClick={apt ? onClick : undefined}
      title={displayLabel
        ? `${rowFloorType === 'basement' ? ui.basement : ui.aptShort} ${displayLabel}${nameLabel && numberLabel ? ` — ${nameLabel}` : ''}`
        : ''}
    >
      {displayLabel ? (
        <>
          <span
            // flex-shrink-0 is the whole fix for "the name covers the number":
            // the cell is a fixed-height flex column, so once the family name
            // wrapped to two lines the number — a flex item like any other —
            // was shrunk to 0px high and the name drew straight over it.
            className="font-bold leading-tight text-center w-full block truncate flex-shrink-0"
            style={{ fontSize: numFontSize, padding: '0 1px' }}
          >
            {displayLabel}
          </span>
          {/* Family name — always shown *in addition to* the apartment number */}
          {nameLabel && numberLabel && (
            <span
              // Same reason as the stage line: a family name is the thing the
              // office reads the grid for, so on a phone it wraps instead of
              // being cut to three letters and an ellipsis.
              className={`w-full text-center block px-0.5 ${phone ? 'leading-tight min-h-0' : 'leading-none truncate'}`}
              style={{
                fontSize: compact ? '9.5px' : phone ? '9.5px' : '12px',
                opacity: isDimmed ? 0.55 : 0.97,
                fontWeight: 600,
                // overflow-wrap, NOT word-break. word-break: break-word splits
                // eagerly and gave "Weinstei / n, Steven"; overflow-wrap only
                // breaks a word that cannot fit on a line of its own.
                ...(phone ? { overflowWrap: 'break-word' as const } : null),
              }}
            >
              {nameLabel}
            </span>
          )}
        </>
      ) : apt?.isUnnamed && onNameUnnamed ? (
        // The whole empty square is the button on a phone, and a small plus in
        // the middle of it on a pointer device. Unlike the add-task corner
        // there is nothing else in this cell to hit by mistake, so the target
        // can simply be the cell.
        <button
          // Explicit minimums rather than w-full: inside the cell's flex line
          // "full" resolved to 20px, which is no better than the 21px button
          // this was meant to replace. Measured at 20x30 before, 44x36 after.
          className="min-w-[44px] min-h-[36px] sm:min-w-0 sm:min-h-0 sm:w-5 sm:h-5 rounded-full
                     flex items-center justify-center
                     transition-all hover:scale-110 active:scale-95 hover:bg-white/60"
          style={{ fontSize: '14px', fontWeight: 'bold', color: '#9ca3af', lineHeight: 1 }}
          onClick={e => { e.stopPropagation(); onNameUnnamed(); }}
          title="Name this space"
        >
          +
        </button>
      ) : (
        <span className="opacity-20 italic" style={{ fontSize: compact ? '8px' : '10px' }}>–</span>
      )}

      {/* Stage name with inline completion indicator */}
      {!compact && displayLabel && (
        <span
          // On a phone the stage name WRAPS rather than truncating. A four-across
          // row is ~77px wide and "— Not Started —" needs 92px, so truncating
          // clipped the stage off every cell in the grid — the one thing the
          // diagram exists to show. The row is taller to pay for it.
          className={`w-full text-center block px-0.5 ${phone ? 'leading-tight min-h-0' : 'leading-none truncate'}`}
          style={{
            fontSize: phone ? '8.5px' : '9px',
            opacity: isDimmed ? 0.5 : (hasStage ? 0.9 : 0.45),
            fontStyle: hasStage ? 'normal' : 'italic',
            ...(phone ? { overflowWrap: 'break-word' as const } : null),
          }}
        >
          {hasStage ? stage!.name : ui.notStartedOption}
          {allTasksDone && <span style={{ color: isDimmed ? '#9ca3af' : '#22c55e', fontStyle: 'normal', marginLeft: '1px' }}>✓</span>}
        </span>
      )}

      {/* Task info — non-compact only */}
      {!compact && displayLabel && taskInfo && (
        <span
          className="w-full text-center leading-none block truncate px-0.5"
          style={{ fontSize: phone ? '10.5px' : '9px', opacity: isDimmed ? 0.4 : 0.9, color: isDimmed ? undefined : (allTasksDone ? '#22c55e' : '#f97316'), fontWeight: 600 }}
        >
          {allTasksDone ? ui.doneIndicator : `⏳ ${taskInfo}`}
        </span>
      )}

      {isDuplex && displayLabel && !compact && (
        <span style={{ fontSize: '6px', opacity: 0.4, lineHeight: 1 }}>↑</span>
      )}

      {/* Contractor sub-label (contractor map view) */}
      {aptSubLabel && (
        <span
          className="absolute bottom-0.5 left-0 right-0 text-center leading-none truncate px-0.5"
          style={{
            fontSize: '6px',
            fontWeight: 700,
            color:
              aptSubLabel === 'Overdue' ? '#ef4444' :
              aptSubLabel === 'Today'   ? '#ea580c' :
              aptSubLabel === 'Tomorrow'? '#d97706' :
              '#6b7280',
          }}
        >
          {aptSubLabel}
        </span>
      )}

      {/* Changes badge */}
      {showShinuiBadge && apt?.classification === 'shinui' && (
        <div
          className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
          title={ui.shinuiTooltip}
          style={{ backgroundColor: '#f59e0b', border: '1px solid rgba(255,255,255,0.9)' }}
        >
          <span style={{ fontSize: '7.5px', color: 'white', fontWeight: 'bold', lineHeight: 1 }}>C</span>
        </div>
      )}

      {/*
        Add-task "+". Pointer devices only.

        It is a 21-pixel target in the corner of a cell, and on a phone that
        means every attempt to open the apartment is a coin flip between the
        apartment and this — in both directions. There is no room to make it
        bigger without covering the number, and a task can be added from inside
        the apartment in one more tap, which is where a thumb should be doing
        it anyway. `hidden sm:flex`, not a touch test: a small window on a
        laptop has the same problem.
      */}
      {!compact && onAddTask && apt && (
        <button
          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full hidden sm:flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          style={{
            backgroundColor: 'rgba(255,255,255,0.42)',
            color: textColor,
            fontSize: '15px',
            lineHeight: 1,
            fontWeight: 'bold',
          }}
          onClick={e => { e.stopPropagation(); onAddTask(); }}
          title={ui.addTaskTooltip}
        >
          +
        </button>
      )}


      {isBulkSelected && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-md"
          style={{ backgroundColor: 'rgba(30,58,95,0.55)' }}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>✓</span>
        </div>
      )}
    </div>

    {/* Merge connector — a blue link badge centred in the gap toward the partner */}
    {mergeLink === 'connector' && !isDimmed && (() => {
      const size = compact ? 15 : 21;
      return (
        <div
          className="absolute flex items-center justify-center pointer-events-none"
          title={ui.linkedToApt}
          style={{
            right: `-${size / 2}px`,
            top: '50%',
            transform: 'translateY(-50%)',
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '9999px',
            backgroundColor: '#2563eb',
            border: '2px solid #ffffff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            zIndex: 20,
          }}
        >
          <Link2 size={compact ? 8 : 12} color="#ffffff" strokeWidth={2.75} />
        </div>
      );
    })()}
    </div>
  );
}

function Stairwell({ compact }: { compact?: boolean }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-center" style={{ width: compact ? '6px' : '10px' }}>
      <div
        className="rounded-full"
        style={{ width: '3px', height: '100%', backgroundColor: '#f59e0b', opacity: 0.55 }}
      />
    </div>
  );
}

function FourCellRow({
  aptNums, getApt, getStage, isHighlighted, isDimmed, isMerged, getMergedLabel, getMergeLink,
  hoverGroup, onHoverApt,
  isContractorHighlighted, isBulkSelected, getAptSubLabel, getTaskInfo, getNextStageName, getOnAddTask, getAllTasksDone,
  getOnNameUnnamed,
  showShinuiBadge, onApartmentClick, rowFloorType, compact, phone,
}: {
  aptNums: number[];
  getApt: (n: number) => Apartment | undefined;
  getStage: (a: Apartment | undefined) => Stage | null;
  isHighlighted: (a: Apartment | undefined) => boolean;
  isDimmed: (a: Apartment | undefined) => boolean;
  isMerged: (a: Apartment | undefined) => boolean;
  getMergedLabel: (a: Apartment | undefined) => string | undefined;
  getMergeLink?: (a: Apartment | undefined, neighbour: Apartment | undefined) => 'connector' | null;
  hoverGroup?: Set<string> | null;
  onHoverApt?: (id: string | null) => void;
  isContractorHighlighted: (a: Apartment | undefined) => boolean;
  isBulkSelected: (a: Apartment | undefined) => boolean;
  getAptSubLabel: (a: Apartment | undefined) => string | undefined;
  getTaskInfo?: (a: Apartment | undefined) => string | undefined;
  getNextStageName?: (a: Apartment | undefined) => string | undefined;
  getOnAddTask?: (a: Apartment | undefined) => (() => void) | undefined;
  getAllTasksDone?: (a: Apartment | undefined) => boolean | undefined;
  getOnNameUnnamed?: (a: Apartment | undefined) => (() => void) | undefined;
  showShinuiBadge: boolean;
  onApartmentClick: (a: Apartment) => void;
  rowFloorType?: 'basement' | 'ground' | 'lobby';
  compact?: boolean;
  phone?: boolean;
}) {
  const gapClass = compact ? 'gap-1' : 'gap-2';

  return (
    <>
      <div className={`flex flex-1 ${gapClass} min-w-0`}>
        {[0, 1].map(ci => {
          const apt = getApt(aptNums[ci]);
          return (
            <AptCell
              key={ci}
              mergeLink={ci === 0 ? getMergeLink?.(apt, getApt(aptNums[1])) ?? null : null}
              isHoverGroup={!!apt && !!hoverGroup?.has(apt.id)}
              onHover={onHoverApt}
              apt={apt}
              stage={getStage(apt)}
              isHighlighted={isHighlighted(apt)}
              isDimmed={isDimmed(apt)}
              showShinuiBadge={showShinuiBadge}
              onClick={() => apt && onApartmentClick(apt)}
              rowFloorType={rowFloorType}
              isMerged={isMerged(apt)}
              mergedLabel={getMergedLabel(apt)}
              isBulkSelected={isBulkSelected(apt)}
              isContractorHighlighted={isContractorHighlighted(apt)}
              aptSubLabel={getAptSubLabel(apt)}
              taskInfo={getTaskInfo?.(apt)}
              nextStageName={getNextStageName?.(apt)}
              onAddTask={getOnAddTask?.(apt)}
              allTasksDone={getAllTasksDone?.(apt)}
              onNameUnnamed={getOnNameUnnamed?.(apt)}
              compact={compact}
              phone={phone}
            />
          );
        })}
      </div>

      <Stairwell compact={compact} />

      <div className={`flex flex-1 ${gapClass} min-w-0`}>
        {[2, 3].map(ci => {
          const apt = getApt(aptNums[ci]);
          return (
            <AptCell
              key={ci}
              mergeLink={ci === 2 ? getMergeLink?.(apt, getApt(aptNums[3])) ?? null : null}
              isHoverGroup={!!apt && !!hoverGroup?.has(apt.id)}
              onHover={onHoverApt}
              apt={apt}
              stage={getStage(apt)}
              isHighlighted={isHighlighted(apt)}
              isDimmed={isDimmed(apt)}
              showShinuiBadge={showShinuiBadge}
              onClick={() => apt && onApartmentClick(apt)}
              rowFloorType={rowFloorType}
              isMerged={isMerged(apt)}
              mergedLabel={getMergedLabel(apt)}
              isBulkSelected={isBulkSelected(apt)}
              isContractorHighlighted={isContractorHighlighted(apt)}
              aptSubLabel={getAptSubLabel(apt)}
              taskInfo={getTaskInfo?.(apt)}
              nextStageName={getNextStageName?.(apt)}
              onAddTask={getOnAddTask?.(apt)}
              allTasksDone={getAllTasksDone?.(apt)}
              onNameUnnamed={getOnNameUnnamed?.(apt)}
              compact={compact}
              phone={phone}
            />
          );
        })}
      </div>
    </>
  );
}

function BuildingColumn({
  buildingId, apartments, mergedLabels, stages, activeStageIds, classFilter, searchQuery,
  onApartmentClick, showShinuiBadge, bulkSelected, highlightedApartmentIds, aptSubLabels,
  aptTaskData, nextStageLabels, onAddTask, aptCompletedData, compact, phone, onNameUnnamed,
  hoverGroup, onHoverApt,
}: {
  buildingId: BuildingId;
  apartments: Apartment[];
  mergedLabels: Map<string, string>;
  stages: Stage[];
  activeStageIds: string[];
  classFilter: 'all' | 'standard' | 'shinui';
  searchQuery: string;
  onApartmentClick: (apt: Apartment) => void;
  showShinuiBadge: boolean;
  bulkSelected?: Set<string>;
  highlightedApartmentIds?: Set<string>;
  aptSubLabels?: Map<string, string>;
  aptTaskData?: Map<string, string>;
  nextStageLabels?: Map<string, string>;
  onAddTask?: (apt: Apartment) => void;
  aptCompletedData?: Map<string, boolean>;
  compact?: boolean;
  phone?: boolean;
  onNameUnnamed?: (apt: Apartment) => void;
  hoverGroup?: Set<string> | null;
  onHoverApt?: (id: string | null) => void;
}) {
  const ui = useStore(state => state.mainUiStrings);
  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages]);
  const aptMap = useMemo(() => {
    const m = new Map<string, Apartment>();
    apartments.forEach(a => m.set(a.apartmentNumber, a));
    return m;
  }, [apartments]);

  const floorRows = getFloorRows(buildingId, compact, phone);
  const LABEL_W = compact ? 26 : 34;
  const padClass = compact ? 'p-0.5 gap-0.5' : 'p-1 gap-1';

  const getApt = (num: number) => aptMap.get(String(num));
  const getStage = (apt: Apartment | undefined): Stage | null =>
    apt?.currentStageId ? stageMap.get(apt.currentStageId) ?? null : null;

  // Draw the link chip only when the merged partner is this cell's right neighbour,
  // so exactly one connector appears per pair.
  function getMergeLink(apt: Apartment | undefined, neighbour: Apartment | undefined): 'connector' | null {
    if (!apt?.mergedWith || !neighbour) return null;
    return apt.mergedWith === neighbour.id ? 'connector' : null;
  }

  function isHighlighted(apt: Apartment | undefined): boolean {
    if (!apt) return false;
    // Contractor view: only highlight assigned apartments
    if (highlightedApartmentIds) return highlightedApartmentIds.has(apt.id);
    if (searchQuery) return (apt.displayName || apt.apartmentNumber).toLowerCase().includes(searchQuery.toLowerCase());
    if (activeStageIds.length === 0) return true;
    if (!apt.currentStageId) return activeStageIds.includes('__none__');
    return activeStageIds.includes(apt.currentStageId);
  }

  function isDimmed(apt: Apartment | undefined): boolean {
    if (!apt) return false;
    if (highlightedApartmentIds) return !highlightedApartmentIds.has(apt.id);
    if (classFilter !== 'all' && apt.classification !== classFilter) return true;
    if (searchQuery) return !(apt.displayName || apt.apartmentNumber).toLowerCase().includes(searchQuery.toLowerCase());
    if (activeStageIds.length === 0) return false;
    if (!apt.currentStageId) return !activeStageIds.includes('__none__');
    return !activeStageIds.includes(apt.currentStageId);
  }

  function isMerged(apt: Apartment | undefined): boolean { return !!apt?.mergedWith; }
  function getMergedLabel(apt: Apartment | undefined): string | undefined {
    if (!apt?.mergedWith) return undefined;
    return mergedLabels.get(apt.id);
  }
  function isContractorHighlighted(apt: Apartment | undefined): boolean {
    return !!apt && !!highlightedApartmentIds?.has(apt.id);
  }
  function isBulkSelected(apt: Apartment | undefined): boolean {
    return !!apt && !!bulkSelected?.has(apt.id);
  }
  function getAptSubLabel(apt: Apartment | undefined): string | undefined {
    if (!apt) return undefined;
    return aptSubLabels?.get(apt.id);
  }
  function getTaskInfo(apt: Apartment | undefined): string | undefined {
    if (!apt) return undefined;
    return aptTaskData?.get(apt.id);
  }
  function getNextStageName(apt: Apartment | undefined): string | undefined {
    if (!apt) return undefined;
    return nextStageLabels?.get(apt.id);
  }
  function getOnAddTask(apt: Apartment | undefined): (() => void) | undefined {
    if (!apt || !onAddTask) return undefined;
    return () => onAddTask(apt);
  }
  function getAllTasksDone(apt: Apartment | undefined): boolean | undefined {
    if (!apt) return undefined;
    return aptCompletedData?.get(apt.id);
  }
  function getOnNameUnnamed(apt: Apartment | undefined): (() => void) | undefined {
    if (!apt || !onNameUnnamed) return undefined;
    if (!apt.isUnnamed) return undefined;
    return () => onNameUnnamed(apt);
  }

  return (
    <div className="flex flex-col flex-1" style={{ minWidth: compact ? '110px' : '180px' }}>
      {/* Pinned while its own column is in view, so you always know which
          building you are looking at. z-30 clears the cells (merge chip is z-20).
          The 2px gap is padding rather than margin so nothing scrolls through it. */}
      <div
        className={`sticky top-0 z-30 print:static text-center font-bold text-white tracking-widest rounded-t-lg ${compact ? 'py-1 pb-1.5 text-xs' : 'py-2 pb-2.5 text-sm'}`}
        style={{ backgroundColor: '#1e3a5f' }}
      >
        {buildingId}
      </div>

      <div
        className="flex flex-col rounded-b-lg overflow-hidden"
        style={{ border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
      >
        {floorRows.map((row, ri) => {
          const isNonApt = row.type === 'roof';

          return (
            <div
              key={ri}
              className="flex items-stretch"
              style={{
                height: `${row.height}px`,
                minHeight: `${row.height}px`,
                borderBottom: ri < floorRows.length - 1 ? '1px solid #e9edf2' : 'none',
              }}
            >
              <div
                className="flex items-center justify-center flex-shrink-0 text-gray-500"
                style={{
                  width: `${LABEL_W}px`,
                  borderRight: '1px solid #e2e8f0',
                  backgroundColor:
                    row.type === 'ground'   ? '#fef9c3' :
                    row.type === 'basement' ? '#e8f0fb' :
                    row.type === 'roof'     ? '#dbeafe' :
                    row.type === 'lobby'    ? '#f0fdf4' :
                    '#f1f5f9',
                  fontSize: '9px',
                  fontWeight: 600,
                }}
              >
                {row.type === 'ground' ? (
                  <span style={{ fontSize: '7px', textAlign: 'center', lineHeight: 1.1 }}>{ui.groundCommercial}</span>
                ) : row.type === 'lobby' ? (
                  <span style={{ fontSize: '7px', textAlign: 'center', lineHeight: 1.1 }}>{ui.lobby}</span>
                ) : (
                  <span style={{ fontSize: row.floorLabel.startsWith('-') ? '8px' : '9px' }}>
                    {row.floorLabel}
                  </span>
                )}
              </div>

              <div className={`flex flex-1 items-stretch ${padClass} min-w-0`}>
                {isNonApt ? (
                  <div
                    className="flex-1 flex items-center justify-center rounded-md"
                    style={{
                      backgroundColor: '#bfdbfe',
                      fontSize: '9px',
                      color: '#6b7280',
                      fontStyle: 'italic',
                    }}
                  />
                ) : row.type === 'normal' || row.type === 'basement' || row.type === 'ground' || row.type === 'lobby' ? (
                  <FourCellRow
                    aptNums={row.aptNums!}
                    getApt={getApt}
                    getStage={getStage}
                    isHighlighted={isHighlighted}
                    isDimmed={isDimmed}
                    isMerged={isMerged}
                    getMergedLabel={getMergedLabel}
                    getMergeLink={getMergeLink}
                    hoverGroup={hoverGroup}
                    onHoverApt={onHoverApt}
                    isContractorHighlighted={isContractorHighlighted}
                    isBulkSelected={isBulkSelected}
                    getAptSubLabel={getAptSubLabel}
                    getTaskInfo={getTaskInfo}
                    getNextStageName={getNextStageName}
                    getOnAddTask={getOnAddTask}
                    getAllTasksDone={getAllTasksDone}
                    getOnNameUnnamed={getOnNameUnnamed}
                    showShinuiBadge={showShinuiBadge}
                    onApartmentClick={onApartmentClick}
                    rowFloorType={
                      row.type === 'basement' ? 'basement' :
                      row.type === 'ground'   ? 'ground' :
                      row.type === 'lobby'    ? 'lobby' :
                      undefined
                    }
                    compact={compact}
                    phone={phone}
                  />
                ) : (row.type === 'wide' || row.type === 'duplex') ? (
                  <>
                    {[0, 1].map(idx => {
                      const apt = getApt(row.aptNums![idx]);
                      return (
                        <React.Fragment key={idx}>
                          {idx === 1 && <Stairwell compact={compact} />}
                          <AptCell
                            apt={apt}
                            stage={getStage(apt)}
                            isHighlighted={isHighlighted(apt)}
                            isDimmed={isDimmed(apt)}
                            showShinuiBadge={showShinuiBadge}
                            onClick={() => { if (apt) onApartmentClick(apt); }}
                            isDuplex={row.type === 'duplex'}
                            isHoverGroup={!!apt && !!hoverGroup?.has(apt.id)}
                            onHover={onHoverApt}
                            isMerged={isMerged(apt)}
                            mergedLabel={getMergedLabel(apt)}
                            isBulkSelected={isBulkSelected(apt)}
                            isContractorHighlighted={isContractorHighlighted(apt)}
                            aptSubLabel={getAptSubLabel(apt)}
                            taskInfo={getTaskInfo(apt)}
                            nextStageName={getNextStageName(apt)}
                            onAddTask={getOnAddTask(apt)}
                            allTasksDone={getAllTasksDone(apt)}
                            compact={compact}
                            phone={phone}
                          />
                        </React.Fragment>
                      );
                    })}
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Generic building column for non-Wolfson projects (uses floor/colPosition from apartment data)
function NetivBuildingColumn({
  buildingId, apartments, mergedLabels, stages, activeStageIds, classFilter, searchQuery,
  onApartmentClick, showShinuiBadge, bulkSelected, highlightedApartmentIds, aptSubLabels,
  aptTaskData, nextStageLabels, onAddTask, aptCompletedData, compact, phone, onNameUnnamed,
  hoverGroup, onHoverApt,
}: {
  buildingId: BuildingId;
  apartments: Apartment[];
  mergedLabels: Map<string, string>;
  stages: Stage[];
  activeStageIds: string[];
  classFilter: 'all' | 'standard' | 'shinui';
  searchQuery: string;
  onApartmentClick: (apt: Apartment) => void;
  showShinuiBadge: boolean;
  bulkSelected?: Set<string>;
  highlightedApartmentIds?: Set<string>;
  aptSubLabels?: Map<string, string>;
  aptTaskData?: Map<string, string>;
  nextStageLabels?: Map<string, string>;
  onAddTask?: (apt: Apartment) => void;
  aptCompletedData?: Map<string, boolean>;
  compact?: boolean;
  phone?: boolean;
  onNameUnnamed?: (apt: Apartment) => void;
  hoverGroup?: Set<string> | null;
  onHoverApt?: (id: string | null) => void;
}) {
  const ui = useStore(state => state.mainUiStrings);
  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages]);

  // Position-based lookup: `${floor}-${col}` → Apartment (also maps duplex tops to floor+1)
  const posMap = useMemo(() => {
    const m = new Map<string, Apartment>();
    apartments.forEach(a => {
      if (a.colPosition) {
        m.set(`${a.floor}-${a.colPosition}`, a);
        if (a.isDuplexApt) m.set(`${a.floor + 1}-${a.colPosition}`, a);
      }
    });
    return m;
  }, [apartments]);

  // All unique floors, sorted high → low
  const floorNumbers = useMemo(() => {
    const s = new Set<number>();
    apartments.forEach(a => {
      s.add(a.floor);
      if (a.isDuplexApt) s.add(a.floor + 1);
    });
    return Array.from(s).sort((a, b) => b - a);
  }, [apartments]);

  // Max column index used on any floor
  const maxCol = useMemo(() => Math.max(...apartments.map(a => a.colPosition ?? 4), 4), [apartments]);

  function getAptAtPos(floor: number, col: number): Apartment | undefined {
    return posMap.get(`${floor}-${col}`);
  }

  const getStage = (apt: Apartment | undefined): Stage | null =>
    apt?.currentStageId ? stageMap.get(apt.currentStageId) ?? null : null;

  function isHighlighted(apt: Apartment | undefined): boolean {
    if (!apt) return false;
    if (highlightedApartmentIds) return highlightedApartmentIds.has(apt.id);
    if (searchQuery) return (apt.displayName || apt.apartmentNumber).toLowerCase().includes(searchQuery.toLowerCase());
    if (activeStageIds.length === 0) return true;
    if (!apt.currentStageId) return activeStageIds.includes('__none__');
    return activeStageIds.includes(apt.currentStageId);
  }

  function isDimmedFn(apt: Apartment | undefined): boolean {
    if (!apt) return false;
    if (highlightedApartmentIds) return !highlightedApartmentIds.has(apt.id);
    if (classFilter !== 'all' && apt.classification !== classFilter) return true;
    if (searchQuery) return !(apt.displayName || apt.apartmentNumber).toLowerCase().includes(searchQuery.toLowerCase());
    if (activeStageIds.length === 0) return false;
    if (!apt.currentStageId) return !activeStageIds.includes('__none__');
    return !activeStageIds.includes(apt.currentStageId);
  }

  function isMergedFn(apt: Apartment | undefined): boolean { return !!apt?.mergedWith; }
  function getMergedLabelFn(apt: Apartment | undefined): string | undefined {
    if (!apt?.mergedWith) return undefined;
    return mergedLabels.get(apt.id);
  }
  function isContractorHighlighted(apt: Apartment | undefined): boolean {
    return !!apt && !!highlightedApartmentIds?.has(apt.id);
  }
  function isBulkSel(apt: Apartment | undefined): boolean {
    return !!apt && !!bulkSelected?.has(apt.id);
  }
  function getSubLabel(apt: Apartment | undefined): string | undefined { return apt ? aptSubLabels?.get(apt.id) : undefined; }
  function getTaskInfoFn(apt: Apartment | undefined): string | undefined { return apt ? aptTaskData?.get(apt.id) : undefined; }
  function getNextStageFn(apt: Apartment | undefined): string | undefined { return apt ? nextStageLabels?.get(apt.id) : undefined; }
  function getOnAddTaskFn(apt: Apartment | undefined): (() => void) | undefined {
    if (!apt || !onAddTask) return undefined;
    return () => onAddTask(apt);
  }
  function getAllDoneFn(apt: Apartment | undefined): boolean | undefined { return apt ? aptCompletedData?.get(apt.id) : undefined; }
  function getOnNameFn(apt: Apartment | undefined): (() => void) | undefined {
    if (!apt || !onNameUnnamed || !apt.isUnnamed) return undefined;
    return () => onNameUnnamed(apt);
  }

  // Sized against the real worst case measured on live data: number (11.5px)
  // + a two-line family name at 9.5px ("Rottenstreich, Yosef") + a two-line
  // stage at 8.5px ("Concealed Units Installed"). Scaled down from the first
  // attempt's 98 — at that height only seven floors fitted on the screen.
  const rowH = compact ? 36 : phone ? 74 : 64;
  const roofH = compact ? 16 : phone ? 22 : 26;
  const LABEL_W = compact ? 26 : 34;
  const padClass = compact ? 'p-0.5 gap-0.5' : 'p-1 gap-1';
  const gapCls = compact ? 'gap-1' : 'gap-2';

  // For each floor, determine how many columns to render
  function getColsForFloor(floor: number): number {
    const floorApts = apartments.filter(a => a.floor === floor);
    const duplexTopApts = apartments.filter(a => a.isDuplexApt && a.floor + 1 === floor);
    const all = [...floorApts, ...duplexTopApts];
    return Math.max(...all.map(a => a.colPosition ?? 4), 4);
  }

  // A merged pair sitting side by side gets one connector, drawn by the left cell.
  function getMergeLinkFn(apt: Apartment | undefined): 'connector' | null {
    if (!apt?.mergedWith) return null;
    const partner = apartments.find(a => a.id === apt.mergedWith);
    if (!partner) return null;
    const sameRow = partner.floor === apt.floor;
    const partnerIsRightNeighbour = sameRow && (partner.colPosition ?? 0) === (apt.colPosition ?? 0) + 1;
    return partnerIsRightNeighbour ? 'connector' : null;
  }

  function renderCells(floor: number, cols: number[]) {
    return cols.map(col => {
      const apt = getAptAtPos(floor, col);
      const isDuplexTop = !!apt?.isDuplexApt && apt.floor !== floor;
      const isDuplexBase = !!apt?.isDuplexApt && apt.floor === floor;

      // A duplex renders as ONE tall cell anchored on its base floor that reaches up
      // over the floor above. The upper floor therefore only reserves the space.
      if (isDuplexTop) {
        return <div key={col} className="flex-1 min-w-0" aria-hidden="true" />;
      }
      // Reach up one full row, then subtract the row padding at top and bottom
      // (p-0.5 = 2px compact, p-1 = 4px otherwise) so the cell lands flush.
      const rowPad = compact ? 2 : 4;
      const spanStyle: React.CSSProperties | undefined = isDuplexBase
        ? { alignSelf: 'flex-start', marginTop: `-${rowH}px`, height: `${rowH * 2 - rowPad * 2}px`, zIndex: 3 }
        : undefined;

      const rowFloorType: 'basement' | 'ground' | 'lobby' | undefined =
        floor < -0.5 ? 'basement' : floor === 0 ? 'ground' : floor === -1 ? 'lobby' : undefined;
      return (
        <AptCell key={col}
          mergeLink={getMergeLinkFn(apt)}
          isHoverGroup={!!apt && !!hoverGroup?.has(apt.id)}
          onHover={onHoverApt}
          extraStyle={spanStyle}
          apt={apt}
          stage={getStage(apt)}
          isHighlighted={isHighlighted(apt)}
          isDimmed={isDimmedFn(apt)}
          showShinuiBadge={showShinuiBadge}
          onClick={() => apt && onApartmentClick(apt)}
          rowFloorType={rowFloorType}
          isMerged={isMergedFn(apt)}
          mergedLabel={getMergedLabelFn(apt)}
          isBulkSelected={isBulkSel(apt)}
          isContractorHighlighted={isContractorHighlighted(apt)}
          aptSubLabel={getSubLabel(apt)}
          taskInfo={getTaskInfoFn(apt)}
          nextStageName={getNextStageFn(apt)}
          onAddTask={getOnAddTaskFn(apt)}
          allTasksDone={getAllDoneFn(apt)}
          onNameUnnamed={getOnNameFn(apt)}
          compact={compact}
          phone={phone}
          isDuplex={false}
        />
      );
    });
  }

  const totalCols = maxCol;
  const leftCols = Math.ceil(totalCols / 2);
  const rightCols = totalCols - leftCols;

  return (
    <div className="flex flex-col flex-1" style={{ minWidth: compact ? '140px' : '220px' }}>
      {/* See BuildingColumn — same pinning behaviour */}
      {/* z-10, not z-30: this is a STICKY element, so it paints above anything
          in the page flow with a lower z — including dialogs. At z-30 the
          building name sat on top of the What's New window. It only ever needs
          to beat the cells it scrolls over. */}
      <div className={`sticky top-0 z-10 print:static text-center font-bold text-white tracking-widest rounded-t-lg ${
        compact ? 'py-1 pb-1.5 text-xs' : phone ? 'py-0.5 text-[11px]' : 'py-2 pb-2.5 text-sm'}`}
        style={{ backgroundColor: '#1e3a5f' }}>
        {buildingId}
      </div>
      <div className="flex flex-col rounded-b-lg overflow-hidden" style={{ border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
        {/* Roof */}
        <div className="flex items-stretch" style={{ height: `${roofH}px`, minHeight: `${roofH}px`, borderBottom: '1px solid #e9edf2' }}>
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: `${LABEL_W}px`, borderRight: '1px solid #e2e8f0', backgroundColor: '#dbeafe' }} />
          <div className={`flex flex-1 items-stretch ${padClass}`}>
            <div className="flex-1 rounded-md" style={{ backgroundColor: '#bfdbfe' }} />
          </div>
        </div>

        {floorNumbers.map((floor, fi) => {
          const numCols = getColsForFloor(floor);
          const leftN = Math.ceil(numCols / 2);
          const rightN = numCols - leftN;
          const rowFloorType: 'basement' | 'ground' | 'lobby' | undefined =
            floor < -0.5 ? 'basement' : floor === 0 ? 'ground' : floor === -1 ? 'lobby' : undefined;
          const rowBg =
            rowFloorType === 'ground'   ? '#fef9c3' :
            rowFloorType === 'basement' ? '#e8f0fb' :
            rowFloorType === 'lobby'    ? '#f0fdf4' : '#f1f5f9';

          return (
            <div key={floor} className="flex items-stretch"
              style={{ height: `${rowH}px`, minHeight: `${rowH}px`, borderBottom: fi < floorNumbers.length - 1 ? '1px solid #e9edf2' : 'none' }}>
              <div className="flex items-center justify-center flex-shrink-0 text-gray-500"
                style={{ width: `${LABEL_W}px`, borderRight: '1px solid #e2e8f0', backgroundColor: rowBg, fontSize: '9px', fontWeight: 600 }}>
                <span style={{ fontSize: floor === -1 ? '7px' : '9px', textAlign: 'center', lineHeight: 1.1 }}>
                  {floor === -1 ? ui.lobby : floor === 0 ? ui.groundCommercial : String(floor)}
                </span>
              </div>
              <div className={`flex flex-1 items-stretch ${padClass} min-w-0`}>
                <div className={`flex flex-1 ${gapCls} min-w-0`}>
                  {renderCells(floor, Array.from({ length: leftN }, (_, i) => i + 1))}
                </div>
                <Stairwell compact={compact} />
                <div className={`flex flex-1 ${gapCls} min-w-0`}>
                  {renderCells(floor, Array.from({ length: rightN }, (_, i) => leftN + i + 1))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BuildingDiagram({
  apartments, stages, activeStageIds, classFilter, searchQuery, selectedBuilding,
  onApartmentClick, showShinuiBadge, bulkSelected, highlightedApartmentIds, aptSubLabels,
  aptTaskData, nextStageLabels, onAddTask, aptCompletedData, compact, phone, onNameUnnamed,
}: BuildingDiagramProps) {
  const { isRtl } = useStore(state => state.mainUiStrings);
  const buildings = useStore(state => state.buildings);
  const buildingOrder: BuildingId[] = isRtl ? [...buildings].reverse().map(b => b.id) : buildings.map(b => b.id);
  const visibleBuildings = selectedBuilding === 'all' ? buildingOrder : [selectedBuilding];
  const single = selectedBuilding !== 'all';

  const aptsByBuilding = useMemo(() => {
    const m = new Map<BuildingId, Apartment[]>();
    buildingOrder.forEach(b => m.set(b, []));
    apartments.forEach(a => {
      const existing = m.get(a.buildingId) ?? [];
      m.set(a.buildingId, [...existing, a]);
    });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartments, isRtl, buildings]);

  // Pre-compute combined "37/38" number labels for merged apartment pairs.
  // Only apartment NUMBERS are combined — the shared family name is rendered once,
  // separately, so a linked pair never shows the same name twice.
  const mergedLabels = useMemo(() => {
    const m = new Map<string, string>();
    apartments.forEach(apt => {
      if (!apt.mergedWith) return;
      const partner = apartments.find(a => a.id === apt.mergedWith);
      if (!partner) return;
      const numA = Number(apt.apartmentNumber) || 0;
      const numB = Number(partner.apartmentNumber) || 0;
      const labelA = apt.apartmentNumber;
      const labelB = partner.apartmentNumber;
      const label = numA <= numB ? `${labelA}/${labelB}` : `${labelB}/${labelA}`;
      m.set(apt.id, label);
    });
    return m;
  }, [apartments]);

  // Hovering either half of a linked pair highlights both.
  const [hoverAptId, setHoverAptId] = useState<string | null>(null);
  const hoverGroup = useMemo(() => {
    if (!hoverAptId) return null;
    const group = new Set<string>([hoverAptId]);
    const apt = apartments.find(a => a.id === hoverAptId);
    if (apt?.mergedWith) group.add(apt.mergedWith);
    return group;
  }, [hoverAptId, apartments]);

  const gapClass = compact ? 'gap-3' : 'gap-5';
  // On the phone the single building IS the page — padding is room it cannot spare.
  const padClass = compact ? 'p-3' : phone ? 'p-2 pb-8' : 'p-5';

  return (
    <div
      className={`flex ${gapClass} ${padClass} ${single && !compact ? 'justify-center' : 'w-full'}`}
      style={single && !compact ? { maxWidth: '560px', margin: '0 auto' } : {}}
    >
      {visibleBuildings.map(bId => {
        const isWolfsonBuilding = /^A\d/.test(bId);
        // `key` is deliberately NOT in here: React 19 warns when a key is
        // spread into JSX, and a spread key is silently ignored by the
        // reconciler. It is passed directly on the elements below instead.
        const colProps = {
          buildingId: bId,
          apartments: aptsByBuilding.get(bId) ?? [],
          mergedLabels,
          stages,
          activeStageIds,
          classFilter,
          searchQuery,
          onApartmentClick,
          showShinuiBadge,
          bulkSelected,
          highlightedApartmentIds,
          aptSubLabels,
          aptTaskData,
          nextStageLabels,
          onAddTask,
          aptCompletedData,
          compact,
          phone,
          onNameUnnamed,
          hoverGroup,
          onHoverApt: setHoverAptId,
        };
        return isWolfsonBuilding
          ? <BuildingColumn key={bId} {...colProps} />
          : <NetivBuildingColumn key={bId} {...colProps} />;
      })}
    </div>
  );
}
