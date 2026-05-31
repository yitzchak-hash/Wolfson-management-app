import React, { useMemo } from 'react';
import { Apartment, BuildingId, Stage } from '../../types';

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
  highlightedApartmentIds?: Set<string>; // contractor view: highlight these, dim others
  aptSubLabels?: Map<string, string>; // aptId → schedule label ("Today", "Tomorrow", "Overdue", etc.)
  compact?: boolean; // smaller row heights for embedded views
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
    : { roof: 26, wide: 52, normal: 52, basement: 48, lobby: 40, ground: 40 };

  const rows: FloorRowDef[] = [];

  rows.push({ floorLabel: 'גג', type: 'roof', height: h.roof });
  rows.push({ floorLabel: '16', type: 'wide', aptNums: [55, 56], height: h.wide });
  rows.push({ floorLabel: '15', type: 'wide', aptNums: [53, 54], height: h.wide });

  for (let fl = 14; fl >= 2; fl--) {
    const base = (fl - 2) * 4 + 1;
    rows.push({ floorLabel: String(fl), type: 'normal', aptNums: [base, base + 1, base + 2, base + 3], height: h.normal });
  }

  rows.push({ floorLabel: '1', type: 'lobby', height: h.lobby });
  rows.push({ floorLabel: 'קרקע', type: 'ground', height: h.ground });

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
  isBasement?: boolean;
  isMerged?: boolean;
  mergedLabel?: string; // "A/B" label when two apartments are connected
  isBulkSelected?: boolean;
  isContractorHighlighted?: boolean; // gold glow in contractor view
  aptSubLabel?: string; // schedule countdown shown in contractor map cells
  compact?: boolean;
}

function AptCell({
  apt, stage, isHighlighted, isDimmed, showShinuiBadge, onClick,
  isDuplex, isBasement, isMerged, mergedLabel, isBulkSelected, isContractorHighlighted, aptSubLabel, compact,
}: AptCellProps) {
  const hasStage = !!stage;
  const bgColor = hasStage ? stage!.color : isBasement ? '#eef3f9' : '#ffffff';

  const borderColor = isMerged ? '#3b82f6' : hasStage ? stage!.color : isBasement ? '#c8d8ec' : '#e2e8f0';
  const borderWidth = isMerged ? '2px' : '1.5px';

  const textColor = hasStage ? getTextColor(stage!.color) : '#374151';

  // Merged label takes priority; fall back to normal label
  const displayLabel = mergedLabel || (apt ? (apt.displayName || (apt.isUnnamed ? '' : apt.apartmentNumber)) : '');

  const opacity = isDimmed ? 0.28 : 1;
  const scale = isHighlighted && !isDimmed ? 'scale-[1.04] z-10' : '';

  const boxShadow = isContractorHighlighted
    ? `0 0 0 2px #f59e0b, 0 2px 10px ${borderColor}88`
    : hasStage ? `0 1px 3px ${borderColor}55` : '0 1px 2px rgba(0,0,0,0.06)';

  const fontSize = compact
    ? '9px'
    : mergedLabel ? '10px' : '12px';

  return (
    <div
      className={`relative flex flex-col items-center justify-center cursor-pointer select-none rounded-md overflow-hidden transition-all duration-100 hover:brightness-105 hover:shadow-md ${scale}`}
      style={{
        backgroundColor: bgColor,
        color: textColor,
        flex: 1,
        border: `${borderWidth} solid ${borderColor}`,
        minWidth: 0,
        opacity,
        boxShadow,
      }}
      onClick={apt ? onClick : undefined}
      title={displayLabel ? `${isBasement ? 'Basement' : 'Apt'} ${displayLabel}` : ''}
    >
      {displayLabel ? (
        <span
          className="font-bold leading-tight text-center overflow-hidden w-full block text-center"
          style={{ fontSize, padding: '0 1px' }}
        >
          {displayLabel}
        </span>
      ) : (
        <span className="opacity-20 italic" style={{ fontSize: compact ? '8px' : '11px' }}>–</span>
      )}
      {isDuplex && displayLabel && (
        <span className="text-[7px] opacity-50 leading-none mt-0.5">↑</span>
      )}

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

      {showShinuiBadge && apt?.classification === 'shinui' && (
        <div
          className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#f59e0b', border: '1px solid rgba(255,255,255,0.9)' }}
        >
          <span style={{ fontSize: '6px', color: 'white', fontWeight: 'bold', lineHeight: 1 }}>C</span>
        </div>
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
  isContractorHighlighted, isBulkSelected, getAptSubLabel, showShinuiBadge, onApartmentClick, isBasement = false, compact,
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
  showShinuiBadge: boolean;
  onApartmentClick: (a: Apartment) => void;
  isBasement?: boolean;
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
              isBasement={isBasement}
              isMerged={isMerged(apt)}
              mergedLabel={getMergedLabel(apt)}
              isBulkSelected={isBulkSelected(apt)}
              isContractorHighlighted={isContractorHighlighted(apt)}
              aptSubLabel={getAptSubLabel(apt)}
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
              isBasement={isBasement}
              isMerged={isMerged(apt)}
              mergedLabel={getMergedLabel(apt)}
              isBulkSelected={isBulkSelected(apt)}
              isContractorHighlighted={isContractorHighlighted(apt)}
              aptSubLabel={getAptSubLabel(apt)}
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
  onApartmentClick, showShinuiBadge, bulkSelected, highlightedApartmentIds, aptSubLabels, compact,
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
  compact?: boolean;
}) {
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
          const isNonApt = row.type === 'roof' || row.type === 'lobby' || row.type === 'ground';

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
                  <span style={{ fontSize: '7px', textAlign: 'center', lineHeight: 1.1 }}>קרקע</span>
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
                      backgroundColor:
                        row.type === 'ground' ? '#fef08a' :
                        row.type === 'roof'   ? '#bfdbfe' :
                        row.type === 'lobby'  ? '#dcfce7' :
                        '#f1f5f9',
                      fontSize: '9px',
                      color: '#6b7280',
                      fontStyle: 'italic',
                    }}
                  >
                    {!compact && row.type === 'ground' && 'Ground / Commercial'}
                    {!compact && row.type === 'lobby' && 'Lobby'}
                  </div>
                ) : row.type === 'normal' || row.type === 'basement' ? (
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
                    showShinuiBadge={showShinuiBadge}
                    onApartmentClick={onApartmentClick}
                    isBasement={row.type === 'basement'}
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

export function BuildingDiagram({
  apartments, stages, activeStageIds, classFilter, searchQuery, selectedBuilding,
  onApartmentClick, showShinuiBadge, bulkSelected, highlightedApartmentIds, aptSubLabels, compact,
}: BuildingDiagramProps) {
  const buildingOrder: BuildingId[] = ['A3', 'A2', 'A1'];
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
  }, [apartments]);

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
      {visibleBuildings.map(bId => (
        <BuildingColumn
          key={bId}
          buildingId={bId}
          apartments={aptsByBuilding.get(bId) ?? []}
          mergedLabels={mergedLabels}
          stages={stages}
          activeStageIds={activeStageIds}
          classFilter={classFilter}
          searchQuery={searchQuery}
          onApartmentClick={onApartmentClick}
          showShinuiBadge={showShinuiBadge}
          bulkSelected={bulkSelected}
          highlightedApartmentIds={highlightedApartmentIds}
          aptSubLabels={aptSubLabels}
          compact={compact}
        />
      ))}
    </div>
  );
}
