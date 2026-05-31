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
  rows.push({ floorLabel: '16', type: 'wide', aptNums: [55, 56], height: 52 });
  rows.push({ floorLabel: '15', type: 'wide', aptNums: [53, 54], height: 52 });

  for (let fl = 14; fl >= 2; fl--) {
    const base = (fl - 2) * 4 + 1;
    rows.push({ floorLabel: String(fl), type: 'normal', aptNums: [base, base + 1, base + 2, base + 3], height: 52 });
  }

  rows.push({ floorLabel: '1', type: 'lobby', height: 40 });
  rows.push({ floorLabel: 'קרקע', type: 'ground', height: 40 });

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
  isMerged?: boolean;
}

function AptCell({ apt, stage, isHighlighted, isDimmed, showShinuiBadge, onClick, isDuplex, isBasement, isMerged }: AptCellProps) {
  const hasStage = !!stage;
  const bgColor = hasStage
    ? stage!.color
    : isBasement
      ? '#eef3f9'
      : '#ffffff';

  const borderColor = hasStage
    ? stage!.color
    : isBasement ? '#c8d8ec' : '#e2e8f0';

  const textColor = hasStage ? getTextColor(stage!.color) : '#374151';
  const label = apt ? (apt.displayName || (apt.isUnnamed ? '' : apt.apartmentNumber)) : '';

  const opacity = isDimmed ? 0.28 : 1;
  const scale = isHighlighted && !isDimmed ? 'scale-[1.04] z-10' : '';

  return (
    <div
      className={`relative flex flex-col items-center justify-center cursor-pointer select-none rounded-md overflow-hidden transition-all duration-100 hover:brightness-105 hover:shadow-md ${scale}`}
      style={{
        backgroundColor: bgColor,
        color: textColor,
        flex: 1,
        border: `1.5px solid ${borderColor}`,
        minWidth: 0,
        opacity,
        boxShadow: hasStage ? `0 1px 3px ${borderColor}55` : '0 1px 2px rgba(0,0,0,0.06)',
      }}
      onClick={apt ? onClick : undefined}
      title={label
        ? `${isBasement ? 'Basement' : 'Apt'} ${label}${isDuplex ? ' (duplex)' : ''}`
        : isBasement ? 'Click to label this slot' : ''}
    >
      {label ? (
        <span className="text-[12px] font-bold leading-tight text-center px-0.5 overflow-hidden w-full block text-center">{label}</span>
      ) : (
        <span className="opacity-20 italic" style={{ fontSize: '11px' }}>–</span>
      )}
      {isDuplex && label && (
        <span className="text-[7px] opacity-50 leading-none mt-0.5">↑</span>
      )}

      {showShinuiBadge && apt?.classification === 'shinui' && (
        <div
          className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#f59e0b', border: '1px solid rgba(255,255,255,0.9)' }}
        >
          <span style={{ fontSize: '6px', color: 'white', fontWeight: 'bold', lineHeight: 1 }}>C</span>
        </div>
      )}
      {isMerged && (
        <div
          className="absolute bottom-0.5 left-0.5 w-3 h-3 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#3b82f6', border: '1px solid rgba(255,255,255,0.9)' }}
          title="Connected unit"
        >
          <span style={{ fontSize: '6px', color: 'white', fontWeight: 'bold', lineHeight: 1 }}>⛓</span>
        </div>
      )}
    </div>
  );
}

// Thin stairwell separator between the two halves of each floor
function Stairwell() {
  return (
    <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '10px' }}>
      <div
        className="rounded-full"
        style={{
          width: '3px',
          height: '100%',
          backgroundColor: '#f59e0b',
          opacity: 0.55,
        }}
      />
    </div>
  );
}

function FourCellRow({
  aptNums, getApt, getStage, isHighlighted, isDimmed, isMerged, showShinuiBadge, onApartmentClick, isBasement = false,
}: {
  aptNums: number[];
  getApt: (n: number) => Apartment | undefined;
  getStage: (a: Apartment | undefined) => Stage | null;
  isHighlighted: (a: Apartment | undefined) => boolean;
  isDimmed: (a: Apartment | undefined) => boolean;
  isMerged: (a: Apartment | undefined) => boolean;
  showShinuiBadge: boolean;
  onApartmentClick: (a: Apartment) => void;
  isBasement?: boolean;
}) {
  return (
    <>
      {/* Left pair */}
      <div className="flex flex-1 gap-1 min-w-0">
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
            />
          );
        })}
      </div>

      <Stairwell />

      {/* Right pair */}
      <div className="flex flex-1 gap-1 min-w-0">
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
            />
          );
        })}
      </div>
    </>
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

  const getApt = (num: number) => aptMap.get(String(num));
  const getStage = (apt: Apartment | undefined): Stage | null =>
    apt?.currentStageId ? stageMap.get(apt.currentStageId) ?? null : null;

  function isHighlighted(apt: Apartment | undefined): boolean {
    if (!apt) return false;
    if (searchQuery) return (apt.displayName || apt.apartmentNumber).toLowerCase().includes(searchQuery.toLowerCase());
    if (activeStageIds.length === 0) return true;
    if (!apt.currentStageId) return activeStageIds.includes('__none__');
    return activeStageIds.includes(apt.currentStageId);
  }

  function isDimmed(apt: Apartment | undefined): boolean {
    if (!apt) return false;
    if (classFilter !== 'all' && apt.classification !== classFilter) return true;
    if (searchQuery) return !(apt.displayName || apt.apartmentNumber).toLowerCase().includes(searchQuery.toLowerCase());
    if (activeStageIds.length === 0) return false;
    if (!apt.currentStageId) return !activeStageIds.includes('__none__');
    return !activeStageIds.includes(apt.currentStageId);
  }

  function isMerged(apt: Apartment | undefined): boolean {
    return !!apt?.mergedWith;
  }

  const LABEL_W = 34;

  return (
    <div className="flex flex-col flex-1" style={{ minWidth: '180px' }}>
      {/* Building header */}
      <div
        className="text-center py-2 font-bold text-white text-sm tracking-widest rounded-t-lg mb-0.5"
        style={{ backgroundColor: '#1e3a5f' }}
      >
        {buildingId}
      </div>

      {/* Floor rows */}
      <div
        className="flex flex-col rounded-b-lg overflow-hidden"
        style={{ border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}
      >
        {floorRows.map((row, ri) => {
          const isNonApt =
            row.type === 'roof' ||
            row.type === 'lobby' ||
            row.type === 'ground';

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
              {/* Floor label */}
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

              {/* Cell area */}
              <div className="flex flex-1 items-stretch p-1 gap-1 min-w-0">
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
                    {row.type === 'ground' && 'Ground / Commercial'}
                    {row.type === 'lobby' && 'Lobby'}
                  </div>
                ) : row.type === 'normal' || row.type === 'basement' ? (
                  <FourCellRow
                    aptNums={row.aptNums!}
                    getApt={getApt}
                    getStage={getStage}
                    isHighlighted={isHighlighted}
                    isDimmed={isDimmed}
                    isMerged={isMerged}
                    showShinuiBadge={showShinuiBadge}
                    onApartmentClick={onApartmentClick}
                    isBasement={row.type === 'basement'}
                  />
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
                      isMerged={isMerged(getApt(row.aptNums![0]))}
                    />
                    <Stairwell />
                    <AptCell
                      apt={getApt(row.aptNums![1])}
                      stage={getStage(getApt(row.aptNums![1]))}
                      isHighlighted={isHighlighted(getApt(row.aptNums![1]))}
                      isDimmed={isDimmed(getApt(row.aptNums![1]))}
                      showShinuiBadge={showShinuiBadge}
                      onClick={() => { const a = getApt(row.aptNums![1]); if (a) onApartmentClick(a); }}
                      isDuplex={row.type === 'duplex'}
                      isMerged={isMerged(getApt(row.aptNums![1]))}
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
      className={`flex gap-5 p-5 ${single ? 'justify-center' : 'w-full'}`}
      style={single ? { maxWidth: '560px', margin: '0 auto' } : {}}
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
