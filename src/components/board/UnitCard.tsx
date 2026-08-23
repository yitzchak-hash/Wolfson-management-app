import React, { useMemo } from 'react';
import { CanvasElement, Apartment, Stage, aptLabel, projectColor } from '../../types';
import { useStore, loadProjectSnapshot } from '../../data/store';
import type { WidgetCtx } from '../../data/widgets';
import { MapPin } from 'lucide-react';

/**
 * A UNIT CARD — one apartment from ANOTHER workspace, standing on this board.
 *
 * The board's tiles are this workspace's own job records, so a Wolfson
 * apartment dragged out of a Building Progress square had nothing it could
 * become here — the drop was refused, silently, which read as "dragging does
 * nothing at all". This is the board's twin of the notebook's cross-workspace
 * entry: a POINTER, not a copy. The unit stays in its own workspace, keeps
 * its own diagram cell and every count; the card only shows it — resolved
 * from the live store when its workspace is the open one, from that
 * workspace's last snapshot on this machine otherwise — and clicking it
 * travels there and opens it (`openUnit`).
 */
export function UnitCard({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = (el.data ?? {}) as Record<string, unknown>;
  const pid = String(data.projectId ?? '');
  const aptId = String(data.aptId ?? '');
  const isSample = !!data.sample;

  const projects = useStore(st => st.projects);
  const currentProjectId = useStore(st => st.currentProjectId);
  const liveApartments = useStore(st => st.apartments);
  const liveStages = useStore(st => st.stages);
  // Re-resolve when a missing workspace snapshot arrives from the cloud.
  const snapTick = useStore(st => st.snapshotTick);

  const { apt, stage, wsName, color } = useMemo(() => {
    const wsName = projects.find(p => p.id === pid)?.name ?? (pid || 'Workspace');
    const color = projectColor(projects, pid) || '#b8860b';
    if (isSample) {
      // The store shelf has no snapshot to read — a canned unit, marked so.
      return {
        apt: { apartmentNumber: '37', displayName: 'Artzi', buildingId: 'A1', address: '' } as Apartment,
        stage: { name: 'Piping', color: '#0ea5e9' } as Stage,
        wsName: wsName === pid ? 'Wolfson' : wsName,
        color,
      };
    }
    const src = pid === currentProjectId
      ? { apartments: liveApartments, stages: liveStages }
      : loadProjectSnapshot(pid);
    const apt = src.apartments.find(a => a.id === aptId);
    const stage = apt?.currentStageId
      ? (src.stages ?? []).find(s => s.id === apt.currentStageId)
      : undefined;
    return { apt, stage, wsName, color };
  }, [pid, aptId, currentProjectId, liveApartments, liveStages, projects, isSample, snapTick]);

  return (
    <button
      data-no-drag data-el-action
      onClick={() => { if (!isSample && pid && aptId) c.openUnit?.(pid, aptId); }}
      title={apt ? `Open ${aptLabel(apt)} in ${wsName}` : undefined}
      className="w-full h-full text-left flex flex-col justify-center px-3 py-2 rounded-xl min-w-0"
      style={{ borderLeft: `5px solid ${color}` }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wide flex-shrink-0"
          style={{ backgroundColor: `${color}22`, color }}>
          {wsName.toUpperCase()}
        </span>
        {apt?.buildingId && apt.buildingId !== 'G' && (
          <span className="text-[9.5px] font-bold text-gray-400 flex-shrink-0">{apt.buildingId}</span>
        )}
        {isSample && (
          <span className="text-[8.5px] text-gray-300 flex-shrink-0">sample</span>
        )}
      </div>

      {apt ? (
        <>
          <div className="font-bold text-[14px] text-gray-900 truncate mt-1">
            {aptLabel(apt) || 'Unit'}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: stage?.color ?? '#cbd5e1' }} />
            <span className="text-[11px] text-gray-500 truncate">
              {stage?.name ?? 'Not started'}
            </span>
          </div>
          {apt.address && (
            <div className="flex items-center gap-1 text-[10px] text-gray-400 truncate mt-0.5">
              <MapPin size={9} className="flex-shrink-0" />
              <span className="truncate">{apt.address}</span>
            </div>
          )}
        </>
      ) : (
        // Not "removed" — this machine has not opened that workspace, so its
        // snapshot is not here to read. The planner card says the same thing.
        <div className="text-[11px] text-gray-400 leading-snug mt-1">
          Open {wsName} once on this computer and this unit will show here.
        </div>
      )}
    </button>
  );
}
