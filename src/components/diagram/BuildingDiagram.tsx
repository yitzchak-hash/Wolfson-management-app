import React, { useMemo } from 'react';
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
  onNameUnnamed?: (apt: Apartment) => void; // opens naming dialog for unnamed slots
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

function getFloorRows(buildingId: BuildingId, compact = false): FloorRowDef[] {
  const h = compact
    ? { roof: 16, wide: 36, normal: 36, basement: 30, lobby: 26, ground: 26 }
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
  onNameUnnamed?: () => void;
}

function AptCell({
  apt, stage, isHighlighted, isDimmed, showShinuiBadge, onClick,
  isDuplex, rowFloorType, isMerged, mergedLabel, isBulkSelected, isContractorHighlighted,
  aptSubLabel, taskInfo, nextStageName, onAddTask, allTasksDone, compact, onNameUnnamed,
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
  const borderColor = isDimmed ? '#d1d5db' : (isMerged ? '#3b82f6' : hasStage ? stage!.color : floorBorder);
  const borderWidth = isMerged && !isDimmed ? '2px' : '1.5px';
  const textColor = isDimmed ? '#9ca3af' : (hasStage ? getTextColor(stage!.color) : '#374151');

  const displayLabel = mergedLabel || (apt ? (apt.displayName || (apt.isUnnamed ? '' : apt.apartmentNumber)) : '');

  const scale = isHighlighted && !isDimmed ? 'scale-[1.04] z-10' : '';

  const boxShadow = isDimmed ? 'none'
    : isContractorHighlighted ? `0 0 0 2px #f59e0b, 0 2px 10px ${borderColor}88`
    : hasStage ? `0 1px 3px ${borderColor}55`
    : '0 1px 2px rgba(0,0,0,0.06)';

  const numFontSize = compact ? '9px' : mergedLabel ? '10px' : '11px';

  // Pending task indicator: orange dot when has tasks but NOT all done
  const hasPendingTask = !!taskInfo && !allTasksDone;

  return (
    <div
      className={`relative flex flex-col items-center justify-center cursor-pointer select-none rounded-md overflow-hidden transition-all duration-100 hover:brightness-105 hover:shadow-md ${scale}`}
      style={{
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
      title={displayLabel ? `${rowFloorType === 'basement' ? ui.basement : ui.aptShort} ${displayLabel}` : ''}
    >
      {displayLabel ? (
        <span
          className="font-bold leading-tight text-center w-full block"
          style={{ fontSize: numFontSize, padding: '0 1px' }}
        >
          {displayLabel}
        </span>
      ) : apt?.isUnnamed && onNameUnnamed ? (
        <button
          className="w-5 h-5 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 hover:bg-white/60"
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
          className="w-full text-center leading-none block truncate px-0.5"
          style={{ fontSize: '9px', opacity: isDimmed ? 0.5 : (hasStage ? 0.9 : 0.45), fontStyle: hasStage ? 'normal' : 'italic' }}
        >
          {hasStage ? stage!.name : ui.notStartedOption}
          {allTasksDone && <span style={{ color: isDimmed ? '#9ca3af' : '#22c55e', fontStyle: 'normal', marginLeft: '1px' }}>✓</span>}
        </span>
      )}

      {/* Task info — non-compact only */}
      {!compact && displayLabel && taskInfo && (
        <span
          className="w-full text-center leading-none block truncate px-0.5"
          style={{ fontSize: '9px', opacity: isDimmed ? 0.4 : 0.9, color: isDimmed ? undefined : (allTasksDone ? '#22c55e' : '#f97316'), fontWeight: 600 }}
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
          className="absolute top-0.5 left-0.5 w-3 h-3 rounded-full flex items-center justify-center"
          title={ui.shinuiTooltip}
          style={{ backgroundColor: '#f59e0b', border: '1px solid rgba(255,255,255,0.9)' }}
        >
          <span style={{ fontSize: '6px', color: 'white', fontWeight: 'bold', lineHeight: 1 }}>C</span>
        </div>
      )}

      {/* Add-task "+" button */}
      {!compact && onAddTask && apt && (
        <button
          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          style={{
            backgroundColor: 'rgba(255,255,255,0.35)',
            color: textColor,
            fontSize: '12px',
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
  aptNums, getApt, getStage, isHighlighted, isDimmed, isMerged, getMergedLabel,
  isContractorHighlighted, isBulkSelected, getAptSubLabel, getTaskInfo, getNextStageName, getOnAddTask, getAllTasksDone,
  getOnNameUnnamed,
  showShinuiBadge, onApartmentClick, rowFloorType, compact,
}: {
  aptNums: number[];
  getApt: (n: number) => Apartment | undefined;
  getStage: (a: Apartment | undefined) => Stage | null;
  isHighlighted: (a: Apartment | undefined) => boolean;
  isDimmed: (a: Apartment | undefined) => boolean;
  isMerged: (a: Apartment | undefined) => boolean;
  getMergedLabel: (a: Apartment | undefined) => string | undefined;
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
}) {
  const gapClass = compact ? 'gap-0.5' : 'gap-1';

  return (
    <>
      <div className={`flex flex-1 ${gapClass} min-w-0`}>
        {[0, 1].map(ci => {
          const apt = getApt(aptNums[ci]);
          return (
            <AptCell
              key={ci}
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
  aptTaskData, nextStageLabels, onAddTask, aptCompletedData, compact, onNameUnnamed,
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
  onNameUnnamed?: (apt: Apartment) => void;
}) {
  const ui = useStore(state => state.mainUiStrings);
  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages]);
  const aptMap = useMemo(() => {
    const m = new Map<string, Apartment>();
    apartments.forEach(a => m.set(a.apartmentNumber, a));
    return m;
  }, [apartments]);

  const floorRows = getFloorRows(buildingId, compact);
  const LABEL_W = compact ? 26 : 34;
  const padClass = compact ? 'p-0.5 gap-0.5' : 'p-1 gap-1';

  const getApt = (num: number) => aptMap.get(String(num));
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
      <div
        className={`text-center font-bold text-white tracking-widest rounded-t-lg mb-0.5 ${compact ? 'py-1 text-xs' : 'py-2 text-sm'}`}
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
  aptTaskData, nextStageLabels, onAddTask, aptCompletedData, compact, onNameUnnamed,
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
  onNameUnnamed?: (apt: Apartment) => void;
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

  const rowH = compact ? 36 : 64;
  const roofH = compact ? 16 : 26;
  const LABEL_W = compact ? 26 : 34;
  const padClass = compact ? 'p-0.5 gap-0.5' : 'p-1 gap-1';
  const gapCls = compact ? 'gap-0.5' : 'gap-1';

  // For each floor, determine how many columns to render
  function getColsForFloor(floor: number): number {
    const floorApts = apartments.filter(a => a.floor === floor);
    const duplexTopApts = apartments.filter(a => a.isDuplexApt && a.floor + 1 === floor);
    const all = [...floorApts, ...duplexTopApts];
    return Math.max(...all.map(a => a.colPosition ?? 4), 4);
  }

  function renderCells(floor: number, cols: number[]) {
    return cols.map(col => {
      const apt = getAptAtPos(floor, col);
      const isDuplexTop = apt?.isDuplexApt && apt.floor !== floor;
      const rowFloorType: 'basement' | 'ground' | 'lobby' | undefined =
        floor < -0.5 ? 'basement' : floor === 0 ? 'ground' : floor === -1 ? 'lobby' : undefined;
      return (
        <AptCell key={col}
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
          isDuplex={isDuplexTop}
        />
      );
    });
  }

  const totalCols = maxCol;
  const leftCols = Math.ceil(totalCols / 2);
  const rightCols = totalCols - leftCols;

  return (
    <div className="flex flex-col flex-1" style={{ minWidth: compact ? '140px' : '220px' }}>
      <div className={`text-center font-bold text-white tracking-widest rounded-t-lg mb-0.5 ${compact ? 'py-1 text-xs' : 'py-2 text-sm'}`}
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
  aptTaskData, nextStageLabels, onAddTask, aptCompletedData, compact, onNameUnnamed,
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

  // Pre-compute combined "A/B" labels for merged apartment pairs
  const mergedLabels = useMemo(() => {
    const m = new Map<string, string>();
    apartments.forEach(apt => {
      if (!apt.mergedWith) return;
      const partner = apartments.find(a => a.id === apt.mergedWith);
      if (!partner) return;
      const numA = Number(apt.displayName || apt.apartmentNumber) || 0;
      const numB = Number(partner.displayName || partner.apartmentNumber) || 0;
      const labelA = apt.displayName || apt.apartmentNumber;
      const labelB = partner.displayName || partner.apartmentNumber;
      const label = numA <= numB ? `${labelA}/${labelB}` : `${labelB}/${labelA}`;
      m.set(apt.id, label);
    });
    return m;
  }, [apartments]);

  const gapClass = compact ? 'gap-3' : 'gap-5';
  const padClass = compact ? 'p-3' : 'p-5';

  return (
    <div
      className={`flex ${gapClass} ${padClass} ${single && !compact ? 'justify-center' : 'w-full'}`}
      style={single && !compact ? { maxWidth: '560px', margin: '0 auto' } : {}}
    >
      {visibleBuildings.map(bId => {
        const isWolfsonBuilding = /^A\d/.test(bId);
        const colProps = {
          key: bId,
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
          onNameUnnamed,
        };
        return isWolfsonBuilding
          ? <BuildingColumn {...colProps} />
          : <NetivBuildingColumn {...colProps} />;
      })}
    </div>
  );
}
