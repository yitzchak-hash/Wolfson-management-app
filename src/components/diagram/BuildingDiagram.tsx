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

interface FloorRowDef {
  floorLabel: string;
  type: 'roof' | 'duplex' | 'wide' | 'normal' | 'lobby' | 'ground' | 'basement';
  aptNums?: number[];
  height: number;
}

function getFloorRows(buildingId: BuildingId): FloorRowDef[] {
  const rows: FloorRowDef[] = [];

  rows.push({ floorLabel: 'גג', type: 'roof', height: 26 });

  // Floors 17 and 16: duplex
  rows.push({ floorLabel: '17', type: 'duplex', aptNums: [55, 56], height: 52 });
  rows.push({ floorLabel: '16', type: 'duplex', aptNums: [55, 56], height: 52 });

  // Floor 15: wide
  rows.push({ floorLabel: '15', type: 'wide', aptNums: [53, 54], height: 52 });

  // Floors 14 down to 2: 4 apartments each
  for (let fl = 14; fl >= 2; fl--) {
    const base = (fl - 2) * 4 + 1;
    rows.push({ floorLabel: String(fl), type: 'normal', aptNums: [base, base + 1, base + 2, base + 3], height: 52 });
  }

  // Lobby and Ground
  rows.push({ floorLabel: '1', type: 'lobby', height: 40 });
  rows.push({ floorLabel: 'קרקע', type: 'ground', height: 40 });

  // Basement floors with clickable slots (4 per floor)
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
    rows.push({ floorLabel: b.label, type: 'basement', aptNums: b.aptNums, height: 48 })
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
  height: number;
}

function AptCell({ apt, stage, isHighlighted, isDimmed, showShinuiBadge, onClick, isDuplex, isBasement, height }: AptCellProps) {
  const bgColor = stage
    ? stage.color
    : isBasement
      ? '#dde6f5'
      : '#e5e7eb';
  const textColor = getTextColor(bgColor);
  const label = apt ? (apt.displayName || (apt.isUnnamed ? '' : apt.apartmentNumber)) : '';

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
        border: `1px solid ${bgColor === '#e5e7eb' || bgColor === '#dde6f5' ? (isBasement ? '#c8d6ea' : '#d1d5db') : bgColor}`,
        minWidth: 0,
      }}
      onClick={apt ? onClick : undefined}
      title={label ? `${isBasement ? 'Basement' : 'Apt'} ${label}${isDuplex ? ' (duplex)' : ''}` : isBasement ? 'Click to label this basement slot' : ''}
    >
      <div className="text-center leading-tight px-0.5 overflow-hidden w-full">
        {label ? (
          <span className="text-[12px] font-bold block">{label}</span>
        ) : (
          <span className="opacity-30 italic" style={{ fontSize: '10px' }}>–</span>
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
          <span style={{ fontSize: '7px', color: 'white', fontWeight: 'bold', lineHeight: 1 }}>C</span>
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
}: {
  buildingId: BuildingId;
  apartments: Apartment[];
  stages: Stage[];
  activeStageIds: string[];
  classFilter: 'all' | 'standard' | 'shinui';
  searchQuery: string;
  onApartmentClick: (apt: Apartment) => void;
  showShinuiBadge: boolean;
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

  const STAIRWELL_W = 14;
  const LABEL_W = 36;

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Building header */}
      <div
        className="text-center py-2 font-bold text-white text-sm tracking-widest rounded-t mb-0.5"
        style={{ backgroundColor: '#1e3a5f' }}
      >
        {buildingId}
      </div>

      {/* Floor rows */}
      <div className="flex flex-col border border-gray-300 rounded-b overflow-hidden bg-white">
        {floorRows.map((row, ri) => {
          const isNonApt =
            row.type === 'roof' ||
            row.type === 'lobby' ||
            row.type === 'ground';

          return (
            <div
              key={ri}
              className="flex items-stretch border-b border-gray-200 last:border-0"
              style={{ height: `${row.height}px`, minHeight: `${row.height}px` }}
            >
              {/* Floor label */}
              <div
                className="flex items-center justify-center flex-shrink-0 border-r border-gray-200 text-gray-600"
                style={{
                  width: `${LABEL_W}px`,
                  backgroundColor:
                    row.type === 'ground'   ? '#fef9c3' :
                    row.type === 'basement' ? '#dde6f5' :
                    row.type === 'roof'     ? '#dbeafe' :
                    row.type === 'lobby'    ? '#f0fdf4' :
                    '#f8fafc',
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

              {/* Cell area */}
              <div className="flex flex-1 gap-px p-px items-stretch min-w-0">
                {isNonApt ? (
                  <div
                    className="flex-1 flex items-center justify-center rounded-sm"
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
                    {row.type === 'ground' && <span>Ground / Commercial</span>}
                    {row.type === 'lobby' && <span>Lobby</span>}
                  </div>
                ) : row.type === 'normal' || row.type === 'basement' ? (
                  <>
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
                          isBasement={row.type === 'basement'}
                          height={row.height - 2}
                        />
                      );
                    })}
                    <div
                      className="flex-shrink-0"
                      style={{ width: `${STAIRWELL_W}px`, backgroundColor: '#f59e0b', opacity: 0.85, borderRadius: '1px' }}
                    />
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
                          isBasement={row.type === 'basement'}
                          height={row.height - 2}
                        />
                      );
                    })}
                  </>
                ) : (row.type === 'wide' || row.type === 'duplex') ? (
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
                    <div
                      className="flex-shrink-0"
                      style={{ width: `${STAIRWELL_W}px`, backgroundColor: '#f59e0b', opacity: 0.85, borderRadius: '1px' }}
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

  return (
    <div
      className={`flex gap-6 p-6 ${single ? 'justify-center' : 'w-full'}`}
      style={single ? { maxWidth: '600px', margin: '0 auto' } : {}}
    >
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
        />
      ))}
    </div>
  );
}
