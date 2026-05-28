import React, { useMemo } from 'react';
import { Apartment, BuildingId, Stage } from '../../types';
import { ApartmentBlock } from './ApartmentBlock';

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

interface FloorRow {
  floor: number;
  apts: Apartment[];
}

function groupByFloor(apts: Apartment[]): FloorRow[] {
  const map = new Map<number, Apartment[]>();
  apts.forEach(a => {
    const existing = map.get(a.floor) ?? [];
    map.set(a.floor, [...existing, a]);
  });
  return Array.from(map.entries())
    .map(([floor, a]) => ({ floor, apts: a }))
    .sort((a, b) => b.floor - a.floor); // top floor first
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
  const stageMap = useMemo(() => {
    const m = new Map<string, Stage>();
    stages.forEach(s => m.set(s.id, s));
    return m;
  }, [stages]);

  const floorRows = useMemo(() => groupByFloor(apartments), [apartments]);

  function isHighlighted(apt: Apartment): boolean {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (apt.displayName || apt.apartmentNumber).toLowerCase().includes(q);
    }
    if (activeStageIds.length === 0) return true;
    if (!apt.currentStageId && activeStageIds.includes('__none__')) return true;
    return apt.currentStageId ? activeStageIds.includes(apt.currentStageId) : false;
  }

  function isDimmed(apt: Apartment): boolean {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return !(apt.displayName || apt.apartmentNumber).toLowerCase().includes(q);
    }
    if (activeStageIds.length === 0) return false;
    if (!apt.currentStageId) return !activeStageIds.includes('__none__');
    return !activeStageIds.includes(apt.currentStageId);
  }

  function passesClassFilter(apt: Apartment): boolean {
    if (classFilter === 'all') return true;
    return apt.classification === classFilter;
  }

  return (
    <div className="flex flex-col">
      {/* Building header */}
      <div
        className="text-center py-2 rounded-t-lg font-bold text-white text-sm tracking-widest mb-1"
        style={{ backgroundColor: '#1e3a5f' }}
      >
        {buildingId}
      </div>

      {/* Floor rows */}
      <div className="flex flex-col gap-0.5 bg-white rounded-b-lg border border-gray-200 overflow-hidden">
        {floorRows.map(({ floor, apts }) => (
          <div key={floor} className="flex items-stretch gap-0.5">
            {/* Floor label */}
            <div className="w-8 flex-shrink-0 flex items-center justify-center bg-gray-50 border-r border-gray-200">
              <span className="text-[10px] text-gray-500 font-medium rotate-0">
                {floor === 0 ? 'G' : floor}
              </span>
            </div>

            {/* Apartments in this floor */}
            <div className="flex gap-0.5 py-0.5 pr-0.5 flex-1">
              {apts.map(apt => {
                const visible = passesClassFilter(apt);
                if (!visible) {
                  return (
                    <div
                      key={apt.id}
                      className="flex-1 h-11 rounded bg-gray-100 opacity-20"
                    />
                  );
                }
                const stage = apt.currentStageId ? stageMap.get(apt.currentStageId) ?? null : null;
                return (
                  <ApartmentBlock
                    key={apt.id}
                    apartment={apt}
                    stage={stage}
                    onClick={() => onApartmentClick(apt)}
                    isHighlighted={isHighlighted(apt)}
                    isDimmed={isDimmed(apt)}
                    showShinuiBadge={showShinuiBadge}
                  />
                );
              })}
            </div>
          </div>
        ))}
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

  const visibleBuildings = selectedBuilding === 'all'
    ? buildingOrder
    : [selectedBuilding];

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
    <div className="flex gap-4 p-4 overflow-x-auto min-h-0">
      {visibleBuildings.map(bId => (
        <div
          key={bId}
          className="flex-shrink-0"
          style={{ minWidth: selectedBuilding === 'all' ? '220px' : '280px' }}
        >
          <BuildingColumn
            buildingId={bId}
            apartments={aptsByBuilding.get(bId) ?? []}
            stages={stages}
            activeStageIds={activeStageIds}
            classFilter={classFilter}
            searchQuery={searchQuery}
            onApartmentClick={onApartmentClick}
            showShinuiBadge={showShinuiBadge}
          />
        </div>
      ))}
    </div>
  );
}
