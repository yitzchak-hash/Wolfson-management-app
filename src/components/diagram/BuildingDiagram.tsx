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
}

function getTextColor(bgHex: string): string {
  const hex = bgHex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.52 ? '#1a202c' : '#ffffff';
}

// Floor rows definition (top to bottom)
interface FloorRowDef {
  floorLabel: string;     // e.g. "גג", "17", "1", "קרקע", "-1"
  type: 'roof' | 'duplex' | 'wide' | 'normal' | 'lobby' | 'ground' | 'basement';
  aptNums?: number[];     // for normal: [col1,col2,col3,col4]; for wide/duplex: [left, right]
  height: number;         // row height in px
}

function getFloorRows(buildingId: BuildingId): FloorRowDef[] {
  const rows: FloorRowDef[] = [];

  // Roof
  rows.push({ floorLabel: 'גג', type: 'roof', height: 22 });

  // Floors 17 and 16: duplex (apts 55 and 56, same apartment shown twice)
  rows.push({ floorLabel: '17', type: 'duplex', aptNums: [55, 56], height: 38 });
  rows.push({ floorLabel: '16', type: 'duplex', aptNums: [55, 56], height: 38 });

  // Floor 15: wide (apts 53, 54)
  rows.push({ floorLabel: '15', type: 'wide', aptNums: [53, 54], height: 38 });

  // Floors 14 down to 2: 4 apartments each
  for (let fl = 14; fl >= 2; fl--) {
    const base = (fl - 2) * 4 + 1;
    rows.push({ floorLabel: String(fl), type: 'normal', aptNums: [base, base + 1, base + 2, base + 3], height: 38 });
  }

  // Floor 1: lobby row (blank)
  rows.push({ floorLabel: '1', type: 'lobby', height: 30 });

  // Ground / commercial
  rows.push({ floorLabel: 'קרקע', type: 'ground', height: 30 });

  // Basements
  const basements = buildingId === 'A1'
    ? ['-0.5', '-1', '-2', '-3', '-4']
    : ['-1', '-2', '-3', '-4'];
  basements.forEach(b => rows.push({ floorLabel: b, type: 'basement', height: 30 }));

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
  height: number;
}

function AptCell({ apt, stage, isHighlighted, isDimmed, showShinuiBadge, onClick, isDuplex, height }: AptCellProps) {
  const bgColor = stage ? stage.color : '#e5e7eb';
  const textColor = getTextColor(bgColor);
  const label = apt ? (apt.displayName || apt.apartmentNumber) : '';

  let extraClass = '';
  if (isHighlighted && !isDimmed) extraClass = ' apartment-block highlighted';
  if (isDimmed) extraClass = ' apartment-block dimmed';
  if (!isDimmed && !isHighlighted) extraClass = ' apartment-block';

  return (
    <div
      className={`relative flex items-center justify-center cursor-pointer select-none rounded-sm overflow-hidden${extraClass}`}
      style={{
        backgroundColor: bgColor,
        color: textColor,
        height: `${height}px`,
        flex: 1,
        border: `1px solid ${bgColor === '#e5e7eb' ? '#d1d5db' : bgColor}`,
        minWidth: 0,
      }}
      onClick={apt ? onClick : undefined}
      title={label ? `Apt ${label}${isDuplex ? ' (duplex)' : ''}` : ''}
    >
      <div className="text-center leading-tight px-0.5 overflow-hidden w-full">
        {label ? (
          <span className="text-[11px] font-bold block">{label}</span>
        ) : (
          <span className="text-gray-400 text-[9px] italic">–</span>
        )}
        {isDuplex && label && (
          <span className="text-[8px] opacity-60 block leading-none">⬆</span>
        )}
      </div>

      {showShinuiBadge && apt?.classification === 'shinui' && (
        <div
          className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#f59e0b', border: '1px solid rgba(255,255,255,0.8)' }}
        >
          <span style={{ fontSize: '7px', color: 'white', fontWeight: 'bold', lineHeight: 1 }}>S</span>
        </div>
      )}
    </div>
  );
}

function BuildingColumn({
  buildingId,
  apartments,
  stages,
  activeStageIds,
  classFilter,
  searchQuery,
  onApartmentClick,
  showShinuiBadge,
  enlarged,
}: {
  buildingId: BuildingId;
  apartments: Apartment[];
  stages: Stage[];
  activeStageIds: string[];
  classFilter: 'all' | 'standard' | 'shinui';
  searchQuery: string;
  onApartmentClick: (apt: Apartment) => void;
  showShinuiBadge: boolean;
  enlarged: boolean;
}) {
  const stageMap = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages]);
  const aptMap = useMemo(() => {
    const m = new Map<string, Apartment>();
    apartments.forEach(a => m.set(a.apartmentNumber, a));
    return m;
  }, [apartments]);

  const floorRows = getFloorRows(buildingId);

  function getApt(num: number): Apartment | undefined {
    return aptMap.get(String(num));
  }

  function getStage(apt: Apartment | undefined): Stage | null {
    if (!apt?.currentStageId) return null;
    return stageMap.get(apt.currentStageId) ?? null;
  }

  function isHighlighted(apt: Apartment | undefined): boolean {
    if (!apt) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (apt.displayName || apt.apartmentNumber).toLowerCase().includes(q);
    }
    if (activeStageIds.length === 0) return true;
    if (!apt.currentStageId) return activeStageIds.includes('__none__');
    return activeStageIds.includes(apt.currentStageId);
  }

  function isDimmed(apt: Apartment | undefined): boolean {
    if (!apt) return false;
    if (classFilter !== 'all' && apt.classification !== classFilter) return true;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return !(apt.displayName || apt.apartmentNumber).toLowerCase().includes(q);
    }
    if (activeStageIds.length === 0) return false;
    if (!apt.currentStageId) return !activeStageIds.includes('__none__');
    return !activeStageIds.includes(apt.currentStageId);
  }

  const colW = enlarged ? 280 : 220;

  return (
    <div className="flex flex-col flex-shrink-0" style={{ width: `${colW}px` }}>
      {/* Building header */}
      <div
        className="text-center py-1.5 font-bold text-white text-sm tracking-widest rounded-t mb-0.5"
        style={{ backgroundColor: '#1e3a5f' }}
      >
        {buildingId}
      </div>

      {/* Floor rows */}
      <div className="flex flex-col border border-gray-300 rounded-b overflow-hidden bg-white">
        {floorRows.map((row, ri) => {
          const isNonApt = row.type === 'roof' || row.type === 'lobby' || row.type === 'ground' || row.type === 'basement';

          return (
            <div
              key={ri}
              className="flex items-stretch border-b border-gray-200 last:border-0"
              style={{ height: `${row.height}px`, minHeight: `${row.height}px` }}
            >
              {/* Floor label column */}
              <div
                className="flex items-center justify-center flex-shrink-0 border-r border-gray-200 text-gray-600"
                style={{
                  width: '28px',
                  backgroundColor: row.type === 'ground' ? '#fef9c3'
                    : row.type === 'basement' ? '#f1f5f9'
                    : row.type === 'roof' ? '#dbeafe'
                    : row.type === 'lobby' ? '#f0fdf4'
                    : '#f8fafc',
                  fontSize: '9px',
                  fontWeight: 600,
                  writingMode: 'horizontal-tb',
                }}
              >
                {row.type === 'ground' ? (
                  <span style={{ fontSize: '7.5px', textAlign: 'center', lineHeight: 1.1 }}>קרקע</span>
                ) : (
                  <span>{row.floorLabel}</span>
                )}
              </div>

              {/* Cell area */}
              <div className="flex flex-1 gap-px p-px items-stretch">
                {isNonApt ? (
                  // Non-apartment row: single spanning cell
                  <div
                    className="flex-1 flex items-center justify-center rounded-sm"
                    style={{
                      backgroundColor: row.type === 'ground' ? '#fef08a'
                        : row.type === 'basement' ? '#e2e8f0'
                        : row.type === 'roof' ? '#bfdbfe'
                        : row.type === 'lobby' ? '#dcfce7'
                        : '#f1f5f9',
                      fontSize: '9px',
                      color: '#6b7280',
                      fontStyle: 'italic',
                    }}
                  >
                    {row.type === 'ground' && <span>Ground / Commercial</span>}
                    {row.type === 'lobby' && <span>Lobby</span>}
                    {row.type === 'basement' && <span>{row.floorLabel}</span>}
                  </div>
                ) : row.type === 'normal' ? (
                  // 4-cell row with stairwell divider
                  <>
                    {/* Left 2 cells */}
                    {[0, 1].map(ci => {
                      const apt = getApt(row.aptNums![ci]);
                      return (
                        <AptCell
                          key={ci}
                          apt={apt}
                          stage={getStage(apt)}
                          isHighlighted={isHighlighted(apt)}
                          isDimmed={isDimmed(apt)}
                          showShinuiBadge={showShinuiBadge}
                          onClick={() => apt && onApartmentClick(apt)}
                          height={row.height - 2}
                        />
                      );
                    })}

                    {/* Stairwell divider */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{ width: '10px', backgroundColor: '#f59e0b', opacity: 0.85, borderRadius: '1px' }}
                    />

                    {/* Right 2 cells */}
                    {[2, 3].map(ci => {
                      const apt = getApt(row.aptNums![ci]);
                      return (
                        <AptCell
                          key={ci}
                          apt={apt}
                          stage={getStage(apt)}
                          isHighlighted={isHighlighted(apt)}
                          isDimmed={isDimmed(apt)}
                          showShinuiBadge={showShinuiBadge}
                          onClick={() => apt && onApartmentClick(apt)}
                          height={row.height - 2}
                        />
                      );
                    })}
                  </>
                ) : (row.type === 'wide' || row.type === 'duplex') ? (
                  // 2-cell row with stairwell divider (each cell spans 2 cols)
                  <>
                    <AptCell
                      apt={getApt(row.aptNums![0])}
                      stage={getStage(getApt(row.aptNums![0]))}
                      isHighlighted={isHighlighted(getApt(row.aptNums![0]))}
                      isDimmed={isDimmed(getApt(row.aptNums![0]))}
                      showShinuiBadge={showShinuiBadge}
                      onClick={() => { const a = getApt(row.aptNums![0]); if (a) onApartmentClick(a); }}
                      isDuplex={row.type === 'duplex'}
                      height={row.height - 2}
                    />

                    {/* Stairwell */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{ width: '10px', backgroundColor: '#f59e0b', opacity: 0.85, borderRadius: '1px' }}
                    />

                    <AptCell
                      apt={getApt(row.aptNums![1])}
                      stage={getStage(getApt(row.aptNums![1]))}
                      isHighlighted={isHighlighted(getApt(row.aptNums![1]))}
                      isDimmed={isDimmed(getApt(row.aptNums![1]))}
                      showShinuiBadge={showShinuiBadge}
                      onClick={() => { const a = getApt(row.aptNums![1]); if (a) onApartmentClick(a); }}
                      isDuplex={row.type === 'duplex'}
                      height={row.height - 2}
                    />
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
  apartments,
  stages,
  activeStageIds,
  classFilter,
  searchQuery,
  selectedBuilding,
  onApartmentClick,
  showShinuiBadge,
}: BuildingDiagramProps) {
  // A3 left, A2 middle, A1 right — matching PDF layout
  const buildingOrder: BuildingId[] = ['A3', 'A2', 'A1'];
  const visibleBuildings = selectedBuilding === 'all' ? buildingOrder : [selectedBuilding];
  const enlarged = selectedBuilding !== 'all';

  const aptsByBuilding = useMemo(() => {
    const m = new Map<BuildingId, Apartment[]>();
    buildingOrder.forEach(b => m.set(b, []));
    apartments.forEach(a => {
      const existing = m.get(a.buildingId) ?? [];
      m.set(a.buildingId, [...existing, a]);
    });
    return m;
  }, [apartments]);

  return (
    <div className="flex gap-3 p-4">
      {visibleBuildings.map(bId => (
        <BuildingColumn
          key={bId}
          buildingId={bId}
          apartments={aptsByBuilding.get(bId) ?? []}
          stages={stages}
          activeStageIds={activeStageIds}
          classFilter={classFilter}
          searchQuery={searchQuery}
          onApartmentClick={onApartmentClick}
          showShinuiBadge={showShinuiBadge}
          enlarged={enlarged}
        />
      ))}
    </div>
  );
}
