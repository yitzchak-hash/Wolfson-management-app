import React, { useMemo, useState } from 'react';
import { Link2, Lock, LockOpen } from 'lucide-react';
import { Apartment, BuildingId, Stage } from '../../types';
import { useStore } from '../../data/store';
import { PROBLEM_FILL } from '../../data/problems';
import {
  FloorRow, RowMode, aptCol, aptSpan, buildFloorRows, colNameOf, positionMap, roofHeightPx, rowCells,
  rowHeightPx, rowLabelText, rowPillLabel,
} from '../../data/floorRows';

interface BuildingDiagramProps {
  apartments: Apartment[];
  stages: Stage[];
  activeStageIds: string[];
  classFilter: 'all' | 'standard' | 'shinui';
  /** Only apartments of this tipus stay lit; '' = every tipus. */
  tipusFilter?: string;
  /** aptId → live problem state — red with a '!' while open, rose while waiting (problems.ts). */
  problemStates?: Map<string, 'open' | 'waiting'>;
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
  /**
   * Every column exactly this many pixels wide — no flexing. The TV wall
   * fits the whole project to the panel by measuring a NATURAL size computed
   * from a fixed per-column width; letting the columns flex under that
   * arithmetic is what let live boards draw unequal, stretched buildings.
   */
  fixedColW?: number;
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

/*
 * Phone cell geometry.
 *
 * The phone view shows ONE building filling the screen, so every pixel between
 * the viewport edge and an apartment's text is a known constant. Deriving the
 * cell width from those constants is what lets the stage name choose its own
 * font size without measuring: a ResizeObserver would be 56 of them per
 * building, all reporting a number that only changes when the phone rotates —
 * and rotating crosses the md breakpoint, which re-renders this anyway.
 */
const PHONE_PAGE_PAD = 4;      // BuildingDiagram's own p-1, each side
const PHONE_ROW_PAD = 2;       // the floor row's p-0.5, each side
const PHONE_HALF_GAP = 2;      // gap-0.5 either side of the stairwell
const PHONE_CELL_GAP = 4;      // gap-1 between the two cells inside a half
const PHONE_STAIRWELL_W = 18;  // middle divider, which also carries the floor number
const PHONE_CELL_CHROME = 5;   // the cell's own 1.5px border + 1px padding, both sides
// A phone always shows one building, and a single building is capped at this by
// the wrapper below — so on a narrow desktop window the cells stop widening here.
const SINGLE_COL_MAX_W = 560;

/** Px of text width one apartment cell gets, given how many share the floor. */
function phoneCellTextWidth(cols: number): number {
  const vw = typeof window === 'undefined'
    ? 390
    : Math.min(window.innerWidth || 390, SINGLE_COL_MAX_W);
  const chrome =
    PHONE_PAGE_PAD * 2 +
    2 + // the column's 1px border, both sides
    PHONE_ROW_PAD * 2 +
    PHONE_HALF_GAP * 2 +
    PHONE_STAIRWELL_W +
    Math.max(0, cols - 2) * PHONE_CELL_GAP;
  return Math.max(24, (vw - chrome) / cols - PHONE_CELL_CHROME);
}

/**
 * Width of a string in ems, MEASURED.
 *
 * This was a hand-calibrated table of per-character widths, and it undershot
 * real text by about 8% — "Thermostats & Haffala" was reckoned to fit 83px when
 * it needed 90 — so every long stage name chose a size too big and then got an
 * ellipsis put through it, which is the one outcome the auto-fit exists to
 * avoid. Any such table also has to be re-tuned for every font and script it
 * meets; the Hebrew names had no entries at all and fell to the default bucket.
 *
 * A 2D canvas measures the actual font at 1px and hands back ems directly, so
 * it cannot drift from what the browser will really draw. Memoised because the
 * same seven stage names are asked for on all 168 cells.
 */
const emCache = new Map<string, number>();
let emCtx: CanvasRenderingContext2D | null | undefined;

export function emWidth(text: string): number {
  const hit = emCache.get(text);
  if (hit !== undefined) return hit;

  if (emCtx === undefined) {
    try {
      const c = document.createElement('canvas');
      emCtx = c.getContext('2d');
      if (emCtx) {
        // Whatever the cells actually render in — read off the body so a theme
        // or a system font change cannot leave this measuring the wrong face.
        const family = getComputedStyle(document.body).fontFamily
          || 'system-ui, sans-serif';
        emCtx.font = `600 100px ${family}`;
      }
    } catch {
      emCtx = null;
    }
  }

  // A crude fallback for a context that could not be made (jsdom, SSR). It is
  // deliberately GENEROUS — over-estimating picks a smaller font, which is
  // merely less pretty, while under-estimating clips the text.
  const w = emCtx
    ? emCtx.measureText(text).width / 100
    : text.length * 0.62;
  emCache.set(text, w);
  return w;
}

const PHONE_STAGE_MAX = 8.5;
const PHONE_STAGE_MIN = 6;

/**
 * Shrink the stage name until it fits on ONE line, with a floor.
 *
 * The stage is the one thing the grid exists to show, and wrapping it to three
 * lines is what made a phone cell unreadable. Below the floor no single line
 * would be legible either, so a name that long goes back to wrapping rather
 * than disappearing — a custom stage nobody anticipated still shows in full.
 */
function fitStageFont(text: string, availW: number): { size: number; wrap: boolean } {
  const ems = emWidth(text);
  if (ems <= 0 || availW <= 0) return { size: PHONE_STAGE_MAX, wrap: false };
  const ideal = availW / ems;
  if (ideal >= PHONE_STAGE_MAX) return { size: PHONE_STAGE_MAX, wrap: false };
  if (ideal < PHONE_STAGE_MIN) return { size: PHONE_STAGE_MIN, wrap: true };
  return { size: Math.floor(ideal * 10) / 10, wrap: false };
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
  /** Phone only: px of text this cell has to play with, from `phoneCellTextWidth`. */
  cellTextW?: number;
  onNameUnnamed?: () => void;
  /** 'connector' draws a link chip in the gap toward the partner on the right. */
  mergeLink?: 'connector' | 'badge' | null;
  /** Extra layout styles — used to make a duplex span two floor rows. */
  extraStyle?: React.CSSProperties;
  /** True when this cell is hovered OR its merged partner is. */
  isHoverGroup?: boolean;
  onHover?: (id: string | null) => void;
  /** The apartment wears a PROBLEM: red + '!' while open, rose while waiting. */
  problem?: 'open' | 'waiting';
}

function AptCell({
  apt, stage, isHighlighted, isDimmed, showShinuiBadge, onClick,
  isDuplex, rowFloorType, isMerged, mergedLabel, isBulkSelected, isContractorHighlighted,
  aptSubLabel, taskInfo, nextStageName, onAddTask, allTasksDone, compact, phone, cellTextW, onNameUnnamed,
  mergeLink, extraStyle, isHoverGroup, onHover, problem,
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
  /**
   * A PROBLEM paints over the stage (owner, 2026-09-06) — the stage itself is
   * untouched and comes straight back when the office approves. Red with a
   * white "!" while open, rose while waiting for approval.
   */
  const bgColor = isDimmed ? '#e5e7eb' : problem ? PROBLEM_FILL[problem] : (hasStage ? stage!.color : floorBg);
  // Stage-coloured cells get a darker outline of their own colour so adjacent
  // apartments at the same stage don't blur into one block.
  const borderColor = isDimmed ? '#d1d5db' : problem ? (problem === 'open' ? '#991b1b' : '#be123c') : (isMerged ? '#3b82f6' : hasStage ? darken(stage!.color) : floorBorder);
  const borderWidth = isMerged && !isDimmed ? '2px' : '1.5px';
  const textColor = isDimmed ? '#9ca3af' : problem ? '#ffffff' : (hasStage ? getTextColor(stage!.color) : '#374151');

  // The apartment number is always the primary label — a family name never replaces
  // it, it renders on its own line underneath.
  const numberLabel = mergedLabel || (apt && !apt.isUnnamed ? apt.apartmentNumber : '');
  const rawName = apt?.displayName?.trim() ?? '';
  // Only a *real* name counts — displayName defaults to the apartment number.
  const nameLabel = rawName && rawName !== apt?.apartmentNumber?.trim() ? rawName : '';
  /**
   * The TIPUS rides with the number (owner, 2026-09-06): "47 — A2" on the
   * desktop cell; the phone cell is 77px wide, so there it is a small line
   * under the number instead (the starred answer he let stand).
   */
  const tipus = apt?.tipus?.trim() ?? '';
  const displayLabel = (numberLabel && tipus && !phone && !mergedLabel ? `${numberLabel} — ${tipus}` : numberLabel) || nameLabel;
  const tipusLine = tipus && numberLabel && (phone || !!mergedLabel) ? tipus : '';

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
      // Addressable by id, so "show me where it is" can scroll to the cell and
      // a harness can reach one without matching on its text.
      data-apt-id={apt?.id}
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
        // A phone cell is ~86px wide, so 2px of padding and a 1px gap on every
        // line is room the number and the family name were being denied.
        padding: compact || phone ? '1px' : '2px 2px',
        gap: compact || phone ? undefined : '1px',
      }}
      onClick={apt ? onClick : undefined}
      title={displayLabel
        ? `${rowFloorType === 'basement' ? ui.basement : ui.aptShort} ${displayLabel}${nameLabel && numberLabel ? ` — ${nameLabel}` : ''}`
        : ''}
    >
      {problem && !isDimmed && (
        <span data-problem-bang
          className="absolute rounded-full bg-white flex items-center justify-center font-black leading-none"
          style={{ top: 1, right: 1, width: compact || phone ? 11 : 14, height: compact || phone ? 11 : 14,
            fontSize: compact || phone ? 8 : 10, color: PROBLEM_FILL[problem], boxShadow: '0 1px 2px rgba(0,0,0,.3)' }}>
          !
        </span>
      )}
      {displayLabel ? (
        <>
          <span
            // flex-shrink-0 is the whole fix for "the name covers the number":
            // the cell is a fixed-height flex column, so once the family name
            // wrapped to two lines the number — a flex item like any other —
            // was shrunk to 0px high and the name drew straight over it.
            className="font-bold leading-tight text-center w-full block truncate flex-shrink-0"
            style={{ fontSize: numFontSize, padding: phone ? 0 : '0 1px' }}
          >
            {displayLabel}
          </span>
          {tipusLine && (
            <span data-tipus-line className="w-full text-center block leading-none flex-shrink-0 font-bold"
              style={{ fontSize: compact ? '7.5px' : '8.5px', opacity: isDimmed ? 0.55 : 0.85 }}>
              {tipusLine}
            </span>
          )}
          {/* Family name — always shown *in addition to* the apartment number */}
          {nameLabel && numberLabel && (
            <span
              // Same reason as the stage line: a family name is the thing the
              // office reads the grid for, so on a phone it wraps instead of
              // being cut to three letters and an ellipsis.
              className={`w-full text-center block ${phone ? 'px-0 leading-tight min-h-0' : 'px-0.5 leading-none truncate'}`}
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
      {!compact && displayLabel && (() => {
        const stageText = problem === 'open'
          ? `${ui.problemLabel.toUpperCase()}${hasStage ? ` · ${ui.problemWas} ${stage!.name}` : ''}`
          : problem === 'waiting' ? ui.problemWaiting
          : hasStage ? stage!.name : ui.notStartedOption;
        // On a phone the stage name SHRINKS until it fits on one line rather
        // than wrapping to three. A four-across row is ~86px wide and
        // "Registers & Access Panels" needs 106px at 8.5px, so before this it
        // took three lines out of a cell that also has to show a number and a
        // family name. Only a name too long even at the floor size wraps.
        const fit = phone
          ? fitStageFont(stageText + (allTasksDone ? ' ✓' : ''), cellTextW ?? 0)
          : null;
        return (
          <span
            className={`w-full text-center block ${
              !fit ? 'px-0.5 leading-none truncate'
              : fit.wrap ? 'px-0 leading-tight min-h-0'
              : 'px-0 leading-tight truncate'}`}
            style={{
              fontSize: fit ? `${fit.size}px` : '9px',
              opacity: isDimmed ? 0.5 : (hasStage ? 0.9 : 0.45),
              fontStyle: hasStage || problem ? 'normal' : 'italic',
              fontWeight: problem ? 800 : undefined,
              ...(fit?.wrap ? { overflowWrap: 'break-word' as const } : null),
            }}
          >
            {stageText}
            {allTasksDone && <span style={{ color: isDimmed ? '#9ca3af' : '#22c55e', fontStyle: 'normal', marginLeft: '1px' }}>✓</span>}
          </span>
        );
      })()}

      {/* Task info — non-compact only.
          Auto-fitted exactly like the stage line above it. A worker's name is
          longer than a stage name ("⏳ Moshe Aharonov" needs 116px in an 83px
          cell), so at a fixed 10.5px this was the ONE line still ellipsizing —
          and it only showed up once the harness seed grew real assignments,
          which is the whole argument for testing on realistic data. */}
      {!compact && displayLabel && taskInfo && (() => {
        const taskText = allTasksDone ? ui.doneIndicator : `⏳ ${taskInfo}`;
        const fit = phone && cellTextW ? fitStageFont(taskText, cellTextW) : null;
        return (
          <span
            className={`w-full text-center block ${phone ? 'px-0' : 'px-0.5'} ${
              fit?.wrap ? 'leading-tight' : 'leading-none truncate'}`}
            style={{
              fontSize: fit ? `${fit.size}px` : phone ? '10.5px' : '9px',
              opacity: isDimmed ? 0.4 : 0.9,
              color: isDimmed ? undefined : (allTasksDone ? '#22c55e' : '#f97316'),
              fontWeight: 600,
              ...(fit?.wrap ? { overflowWrap: 'break-word' as const } : null),
            }}
          >
            {taskText}
          </span>
        );
      })()}

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

/**
 * The stairwell strip down the middle of a floor — and, on a phone, the floor's
 * NUMBER as well.
 *
 * The number used to sit in a 34px grey gutter down the left, which on a 390px
 * screen is 9% of the width spent on two digits, taken from the four cells that
 * actually hold the information. Here it costs nothing: the strip already
 * exists as a divider, and the middle of the row is where the eye is anyway.
 */
/**
 * Shorten a floor label to fit the phone's 17px pill.
 *
 * Floor NUMBERS ("15", "-2") fit as they are and must never be touched — they
 * are what somebody counts down. Only the named floors are too long, and those
 * are a closed set of two, so an initial is unambiguous: L over the lobby row,
 * G over the ground row. Ellipsizing them instead ("Groun…") spends the same
 * pixels saying less.
 */
function shortFloorLabel(label: string): string {
  if (/^-?\d/.test(label)) return label;      // 15, -2, …
  const first = label.trim()[0];
  return first ? first.toUpperCase() : label;
}

function Stairwell({ compact, floorLabel }: { compact?: boolean; floorLabel?: string }) {
  // `floorLabel` is only ever set on a phone, so this first branch IS the phone
  // width. It stays wide enough for the pill and not a pixel wider.
  const w = floorLabel ? `${PHONE_STAIRWELL_W}px` : compact ? '6px' : '10px';
  const shown = floorLabel ? shortFloorLabel(floorLabel) : '';
  return (
    <div className="flex-shrink-0 flex items-center justify-center relative" style={{ width: w }}>
      <div
        className="rounded-full"
        style={{ width: '3px', height: '100%', backgroundColor: '#f59e0b', opacity: 0.55 }}
      />
      {floorLabel && (
        <span
          className="absolute inset-0 flex items-center justify-center text-center pointer-events-none"
          // The full name still reaches anyone who long-presses or hovers.
          title={floorLabel}
          style={{
            fontSize: shown.length > 2 ? '6.5px' : '9px',
            fontWeight: 700, color: '#64748b', lineHeight: 1,
            // A pill behind it so the strip does not read through the digits.
            background: '#f8fafc', borderRadius: '4px',
            margin: 'auto', width: '17px', height: '17px',
          }}
        >
          {shown}
        </span>
      )}
    </div>
  );
}

/**
 * The building's name above its column.
 *
 * ONE component used by both column kinds. They each carried their own copy,
 * which is the documented two-component trap in this file: a fix applied to one
 * is invisible in the other, and that is exactly how Wolfson's bar spent months
 * a z-index behind Netiv's.
 *
 * **Pinned by default, and lockable.** It is `sticky`, but at `z-10` it tied
 * with a highlighted cell's own `z-10` — and cells come later in the DOM, so
 * the tie went to the cells and the name was scrolled OVER. `z-20` beats the
 * cells and stays far below any dialog (What's New is z-[260]).
 *
 * The padlock switches pinning off for the workspace, for anybody who would
 * rather have the extra row of screen while scrolling. Stored in
 * `boardSettings`, so it inherits persist / sync / export / import with no new
 * state key; absent means pinned, which is the behaviour that was always there.
 */
function BuildingNameBar({ buildingId, compact }: { buildingId: string; compact?: boolean }) {
  const { boardSettings, currentProjectId, setBoardSetting } = useStore();
  const pinned = boardSettings[currentProjectId]?.stickyBuildingName !== false;
  return (
    <div
      className={`${pinned ? 'sticky top-0 z-20' : 'relative'} group print:static text-center font-bold text-white tracking-widest rounded-t-lg ${
        compact ? 'py-1 pb-1.5 text-xs' : 'py-2 pb-2.5 text-sm'}`}
      style={{ backgroundColor: '#1e3a5f' }}
    >
      {buildingId}
      <button
        onClick={() => setBoardSetting('stickyBuildingName', !pinned)}
        title={pinned
          ? 'The building name stays on top while you scroll — press to let it scroll away'
          : 'The building name scrolls away — press to keep it on top'}
        className={`absolute top-1/2 -translate-y-1/2 ${compact ? 'right-1' : 'right-2'} p-1 rounded-md transition-opacity ${
          pinned ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
        style={pinned ? { color: '#ffffff99' } : { color: '#fbbf24' }}
      >
        {pinned ? <Lock size={compact ? 11 : 13} /> : <LockOpen size={compact ? 11 : 13} />}
      </button>
    </div>
  );
}

/**
 * ONE column for every building.
 *
 * There used to be two — `BuildingColumn` keyed by apartment NUMBER against a
 * hard-coded Wolfson floor list, and `NetivBuildingColumn` keyed by position —
 * and the documented trap was that a change to one was invisible in the
 * other. Both now draw the same thing from the same row model
 * (`floorRows.ts`), which the layout builder reads too, so the three can
 * never disagree about where a unit is. `NetivBuildingColumn` survives only
 * as a name.
 *
 * A row is `cols` positions with the stairwell after the first half. A unit
 * that spans several positions (`colSpan`) is ONE wide cell; when its span
 * crosses the middle, that row has no stairwell strip (and on a phone the
 * floor number becomes a small badge at the row's edge instead of riding the
 * divider). A Netiv duplex still reaches up over the row above it.
 */
interface ColumnProps {
  buildingId: BuildingId;
  apartments: Apartment[];
  mergedLabels: Map<string, string>;
  stages: Stage[];
  activeStageIds: string[];
  classFilter: 'all' | 'standard' | 'shinui';
  /** Only apartments of this tipus stay lit; '' = every tipus. */
  tipusFilter?: string;
  /** aptId → live problem state — red with a '!' while open, rose while waiting (problems.ts). */
  problemStates?: Map<string, 'open' | 'waiting'>;
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
  fixedColW?: number;
}

function BuildingColumn({
  buildingId, apartments, mergedLabels, stages, activeStageIds, classFilter, tipusFilter, problemStates, searchQuery,
  onApartmentClick, showShinuiBadge, bulkSelected, highlightedApartmentIds, aptSubLabels,
  aptTaskData, nextStageLabels, onAddTask, aptCompletedData, compact, phone, onNameUnnamed,
  hoverGroup, onHoverApt, fixedColW,
}: ColumnProps) {
  const ui = useStore(state => state.mainUiStrings);
  const heights = useStore(state => state.boardSettings[state.currentProjectId]?.floorHeights?.[buildingId]);
  const layout = useStore(state => state.boardSettings[state.currentProjectId]?.buildingLayout?.[buildingId]);
  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages]);
  const pos = useMemo(() => positionMap(buildingId, apartments), [buildingId, apartments]);
  const rows: FloorRow[] = useMemo(
    () => buildFloorRows(buildingId, apartments, heights, layout),
    [buildingId, apartments, heights, layout]);
  const mode: RowMode = compact ? 'compact' : phone ? 'phone' : 'desktop';
  const rowPx = useMemo(() => rows.map(r => rowHeightPx(r, buildingId, mode)), [rows, buildingId, mode]);
  const roofH = roofHeightPx(mode);
  const LABEL_W = compact ? 26 : 34;
  const padClass = compact || phone ? 'p-0.5 gap-0.5' : 'p-1 gap-1';
  const gapCls = compact || phone ? 'gap-1' : 'gap-2';
  const gapPx = compact || phone ? 4 : 8;
  const rowPad = compact || phone ? 2 : 4;

  const getStage = (apt: Apartment | undefined): Stage | null =>
    apt?.currentStageId ? stageMap.get(apt.currentStageId) ?? null : null;

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
    if (tipusFilter && (apt.tipus ?? '') !== tipusFilter) return true;
    if (searchQuery) return !(apt.displayName || apt.apartmentNumber).toLowerCase().includes(searchQuery.toLowerCase());
    if (activeStageIds.length === 0) return false;
    if (!apt.currentStageId) return !activeStageIds.includes('__none__');
    return !activeStageIds.includes(apt.currentStageId);
  }
  // Draw the link chip only when the merged partner is this cell's right
  // neighbour, so exactly one connector appears per pair.
  function getMergeLink(apt: Apartment | undefined): 'connector' | null {
    if (!apt?.mergedWith) return null;
    const partner = pos.get(`${apt.floor}-${aptCol(apt) + aptSpan(apt)}`);
    return partner && partner.id === apt.mergedWith ? 'connector' : null;
  }

  const rowFloorTypeOf = (row: FloorRow): 'basement' | 'ground' | 'lobby' | undefined =>
    row.kind === 'basement' ? 'basement' : row.kind === 'ground' ? 'ground' : row.kind === 'lobby' ? 'lobby' : undefined;
  const rowBgOf = (row: FloorRow) =>
    row.kind === 'ground'   ? '#fef9c3' :
    row.kind === 'basement' ? '#e8f0fb' :
    row.kind === 'lobby'    ? '#f0fdf4' : '#f1f5f9';
  /** What the row's label says — "15", "1 · Lobby", "Ground / Commercial", "-2". */
  const rowLabelOf = (row: FloorRow): string => rowLabelText(row, ui.lobby, ui.groundCommercial);

  return (
    <div className="flex flex-col flex-1"
      style={fixedColW
        ? { width: fixedColW, minWidth: fixedColW, maxWidth: fixedColW, flex: '0 0 auto' }
        : { minWidth: compact ? '110px' : '180px' }}>
      {/* Pinned while its own column is in view, so you always know which
          building you are looking at. Not drawn on a phone: there is exactly
          one building on screen there and the tabs above already name it. */}
      {!phone && <BuildingNameBar buildingId={buildingId} compact={compact} />}

      <div
        className={`flex flex-col overflow-hidden ${phone ? 'rounded-lg' : 'rounded-b-lg'}`}
        style={{ border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
      >
        {/* Roof */}
        <div className="flex items-stretch" data-floor-row="roof"
          style={{ height: `${roofH}px`, minHeight: `${roofH}px`, borderBottom: '1px solid #e9edf2' }}>
          {!phone && (
            <div className="flex items-center justify-center flex-shrink-0"
              style={{ width: `${LABEL_W}px`, borderRight: '1px solid #e2e8f0', backgroundColor: '#dbeafe' }} />
          )}
          <div className={`flex flex-1 items-stretch ${padClass}`}>
            <div className="flex-1 rounded-md" style={{ backgroundColor: '#bfdbfe' }} />
          </div>
        </div>

        {/* What the four squares across a row are CALLED, when the office
            named them in the layout studio. Drawn once under the roof — a
            heading for the columns, never repeated per floor. */}
        {(() => {
          if (compact) return null;
          const wide = Math.max(4, ...rows.map(r => r.cols));
          const names = Array.from({ length: wide }, (_, i) => colNameOf(layout, i + 1));
          if (!names.some(Boolean)) return null;
          const leftN = Math.ceil(wide / 2);
          const cellOf = (i: number) => (
            <div key={i} data-position-name={i + 1}
              className="min-w-0 text-center text-gray-500 font-semibold truncate"
              style={{ flex: '1 1 0%', fontSize: phone ? '7.5px' : '8.5px' }}>{names[i]}</div>
          );
          return (
            <div className="flex items-stretch" data-position-names
              style={{ borderBottom: '1px solid #e9edf2', backgroundColor: '#f8fafc' }}>
              {!phone && <div className="flex-shrink-0" style={{ width: `${LABEL_W}px`, borderRight: '1px solid #e2e8f0' }} />}
              <div className={`flex flex-1 items-center ${padClass} min-w-0`}>
                <div className={`flex ${gapCls} min-w-0`} style={{ flex: `${leftN} 1 0%` }}>
                  {names.slice(0, leftN).map((_, i) => cellOf(i))}
                </div>
                <div className="flex-shrink-0" style={{ width: compact || phone ? 10 : 14 }} />
                <div className={`flex ${gapCls} min-w-0`} style={{ flex: `${wide - leftN} 1 0%` }}>
                  {names.slice(leftN).map((_, i) => cellOf(i + leftN))}
                </div>
              </div>
            </div>
          );
        })()}

        {rows.map((row, ri) => {
          const h = rowPx[ri];
          const cells = rowCells(row, pos);
          const leftN = Math.ceil(row.cols / 2);
          const crossesMiddle = cells.some(c => c.col <= leftN && c.col + c.span - 1 > leftN);
          const rowFloorType = rowFloorTypeOf(row);
          const cellTextW = phone ? phoneCellTextWidth(row.cols) : undefined;
          const label = rowLabelOf(row);
          const pill = rowPillLabel(row);
          const hAbove = ri > 0 ? rowPx[ri - 1] : h;

          const drawCell = (cell: { col: number; span: number; apt?: Apartment }) => {
            const apt = cell.apt;
            const isDuplexTop = !!apt?.isDuplexApt && apt.floor !== row.floor;
            const isDuplexBase = !!apt?.isDuplexApt && apt.floor === row.floor;
            const spanStyle: React.CSSProperties = {
              flex: `${cell.span} 1 ${(cell.span - 1) * gapPx}px`,
            };
            // A duplex renders as ONE tall cell anchored on its base floor that
            // reaches up over the row above; the upper row only reserves the space.
            if (isDuplexTop) {
              return <div key={cell.col} className="min-w-0" style={spanStyle} aria-hidden="true" />;
            }
            if (isDuplexBase) {
              Object.assign(spanStyle, {
                alignSelf: 'flex-start', marginTop: `-${hAbove}px`,
                height: `${hAbove + h - rowPad * 2}px`, zIndex: 3,
              });
            }
            // A spanning cell gets the text room of every position it covers.
            const textW = cellTextW !== undefined && cell.span > 1
              ? cellTextW * cell.span + (cell.span - 1) * (PHONE_CELL_GAP + PHONE_CELL_CHROME)
              : cellTextW;
            return (
              <AptCell key={cell.col}
                problem={apt ? problemStates?.get(apt.id) : undefined}
                mergeLink={getMergeLink(apt)}
                isHoverGroup={!!apt && !!hoverGroup?.has(apt.id)}
                onHover={onHoverApt}
                extraStyle={spanStyle}
                apt={apt}
                stage={getStage(apt)}
                isHighlighted={isHighlighted(apt)}
                isDimmed={isDimmed(apt)}
                showShinuiBadge={showShinuiBadge}
                onClick={() => apt && onApartmentClick(apt)}
                rowFloorType={rowFloorType}
                isMerged={!!apt?.mergedWith}
                mergedLabel={apt?.mergedWith ? mergedLabels.get(apt.id) : undefined}
                isBulkSelected={!!apt && !!bulkSelected?.has(apt.id)}
                isContractorHighlighted={!!apt && !!highlightedApartmentIds?.has(apt.id)}
                aptSubLabel={apt ? aptSubLabels?.get(apt.id) : undefined}
                taskInfo={apt ? aptTaskData?.get(apt.id) : undefined}
                nextStageName={apt ? nextStageLabels?.get(apt.id) : undefined}
                onAddTask={apt && onAddTask ? () => onAddTask(apt) : undefined}
                allTasksDone={apt ? aptCompletedData?.get(apt.id) : undefined}
                onNameUnnamed={apt && onNameUnnamed && apt.isUnnamed ? () => onNameUnnamed(apt) : undefined}
                compact={compact}
                phone={phone}
                cellTextW={textW}
                isDuplex={false}
              />
            );
          };

          const left = cells.filter(c => c.col <= leftN);
          const right = cells.filter(c => c.col > leftN);

          return (
            <div key={row.key} className="flex items-stretch relative"
              data-floor-row={row.key} data-floor-kind={row.kind}
              style={{ height: `${h}px`, minHeight: `${h}px`, borderBottom: ri < rows.length - 1 ? '1px solid #e9edf2' : 'none' }}>
              {/* No left gutter on a phone — the floor number rides the middle
                  divider instead, giving all 34px back to the apartments. */}
              {!phone && (
                <div className="flex items-center justify-center flex-shrink-0 text-gray-500"
                  data-floor-label={label}
                  style={{ width: `${LABEL_W}px`, borderRight: '1px solid #e2e8f0', backgroundColor: rowBgOf(row), fontSize: '9px', fontWeight: 600 }}>
                  <span style={{
                    fontSize: row.kind === 'lobby' || row.kind === 'ground' ? '7px' : row.num.startsWith('-') ? '8px' : '9px',
                    textAlign: 'center', lineHeight: 1.1,
                  }}>
                    {label}
                  </span>
                </div>
              )}
              <div className={`flex flex-1 items-stretch ${padClass} min-w-0`}>
                {crossesMiddle ? (
                  <div className={`flex flex-1 ${gapCls} min-w-0`}>
                    {cells.map(drawCell)}
                  </div>
                ) : (
                  <>
                    {/* Each half takes the share of the row its COLUMNS deserve — a
                        five-column row is 3 | 2, not two equal halves, or a unit
                        spanning three positions is squeezed into half the row. */}
                    <div className={`flex ${gapCls} min-w-0`} style={{ flex: `${leftN} 1 0%` }}>{left.map(drawCell)}</div>
                    <Stairwell compact={compact} floorLabel={phone ? pill : undefined} />
                    <div className={`flex ${gapCls} min-w-0`} style={{ flex: `${row.cols - leftN} 1 0%` }}>{right.map(drawCell)}</div>
                  </>
                )}
              </div>
              {/* The phone's floor number when a wide unit took the divider's place. */}
              {phone && crossesMiddle && pill && (
                <span className="absolute pointer-events-none flex items-center justify-center"
                  title={label}
                  style={{ left: 3, top: 3, width: 17, height: 17, fontSize: pill.length > 2 ? '6.5px' : '9px',
                    // Above a highlighted cell's own z-10, or the wide cell hides the number.
                    fontWeight: 700, color: '#64748b', background: '#f8fafc', borderRadius: 4, zIndex: 12 }}>
                  {pill}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The name survives for the record; both building kinds draw the same column now. */
const NetivBuildingColumn = BuildingColumn;

export function BuildingDiagram({
  apartments, stages, activeStageIds, classFilter, tipusFilter, problemStates, searchQuery, selectedBuilding,
  onApartmentClick, showShinuiBadge, bulkSelected, highlightedApartmentIds, aptSubLabels,
  aptTaskData, nextStageLabels, onAddTask, aptCompletedData, compact, phone, onNameUnnamed,
  fixedColW,
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
  // On the phone the single building IS the page — padding is room it cannot
  // spare. Kept in step with PHONE_PAGE_PAD, which the cell-width maths reads.
  const padClass = compact ? 'p-3' : phone ? 'p-1 pb-8' : 'p-5';

  return (
    <div
      className={`flex ${gapClass} ${padClass} ${single && !compact ? 'justify-center' : 'w-full'}`}
      style={single && !compact ? { maxWidth: `${SINGLE_COL_MAX_W}px`, margin: '0 auto' } : {}}
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
          tipusFilter,
          problemStates,
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
          fixedColW,
        };
        return isWolfsonBuilding
          ? <BuildingColumn key={bId} {...colProps} />
          : <NetivBuildingColumn key={bId} {...colProps} />;
      })}
    </div>
  );
}
