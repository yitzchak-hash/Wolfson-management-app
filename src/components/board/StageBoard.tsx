import React, { useMemo, useState } from 'react';
import { useStore } from '../../data/store';
import { Apartment, Stage } from '../../types';
import { DriveIcon, ZohoIcon, PlanIcon } from '../ui/BrandIcons';

/**
 * The same jobs as the free canvas, snapped into stage columns.
 *
 * Dragging a card across columns CHANGES THE STAGE — it is the same data, read
 * a second way, not a separate system. Canvas positions are untouched, so
 * switching back to the board restores the arrangement exactly.
 *
 * Within a column, newest-modified sits at the top so the jobs you are actually
 * working on are the ones you see first.
 */
export function StageBoard({ onOpenJob }: { onOpenJob: (a: Apartment) => void }) {
  const { apartments, stages, currentProjectId, currentUser, updateApartment, contractorAssignments } = useStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const projectStages = useMemo(
    () => stages
      .filter(st => st.active && (currentProjectId === 'general' ? st.projectId === 'general' : !st.projectId))
      .sort((a, b) => a.order - b.order),
    [stages, currentProjectId],
  );

  const jobs = useMemo(
    () => apartments.filter(a => !a.isUnnamed && a.buildingId === 'G' && !a.boardBin),
    [apartments],
  );

  /** Newest content change first — an unset timestamp sorts last. */
  const byRecency = (a: Apartment, b: Apartment) =>
    (b.contentUpdatedAt ?? b.updatedAt ?? '').localeCompare(a.contentUpdatedAt ?? a.updatedAt ?? '');

  const columns: { stage: Stage | null; items: Apartment[] }[] = [
    { stage: null, items: jobs.filter(j => !j.currentStageId).sort(byRecency) },
    ...projectStages.map(st => ({
      stage: st,
      items: jobs.filter(j => j.currentStageId === st.id).sort(byRecency),
    })),
  ];

  function drop(stageId: string | null) {
    if (!dragId || !currentUser) return;
    const job = jobs.find(j => j.id === dragId);
    if (job && job.currentStageId !== stageId) {
      updateApartment(dragId, { currentStageId: stageId }, currentUser);
    }
    setDragId(null);
    setOverStage(null);
  }

  const pending = (a: Apartment) =>
    contractorAssignments.filter(x => x.apartmentId === a.id && !x.completedAt).length;

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3">
      <div className="flex gap-3 h-full" style={{ minWidth: 'min-content' }}>
        {columns.map(({ stage, items }) => {
          const color = stage?.color ?? '#94a3b8';
          const key = stage?.id ?? '__none__';
          return (
            <div
              key={key}
              onDragOver={e => { e.preventDefault(); setOverStage(key); }}
              onDragLeave={() => setOverStage(s => (s === key ? null : s))}
              onDrop={() => drop(stage?.id ?? null)}
              className="flex flex-col rounded-xl transition-colors flex-shrink-0"
              style={{
                width: 258,
                backgroundColor: overStage === key ? `${color}14` : '#f8fafc',
                border: `1px solid ${overStage === key ? color : '#e2e8f0'}`,
              }}
            >
              <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                style={{ borderBottom: `3px solid ${color}` }}>
                <span className="font-bold text-[12.5px] text-gray-800 truncate">
                  {stage?.name ?? 'Not started'}
                </span>
                <span className="ml-auto text-[11px] font-bold text-gray-400">{items.length}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                {items.map(job => (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={() => setDragId(job.id)}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}
                    onClick={() => onOpenJob(job)}
                    className="rounded-lg bg-white p-2 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md"
                    style={{
                      border: `3px solid ${color}`,
                      opacity: dragId === job.id ? 0.45 : 1,
                    }}
                  >
                    <div className="font-bold text-[12px] text-gray-900 leading-tight">
                      {job.displayName || 'Job'}
                    </div>
                    {job.address && (
                      <div className="text-[10px] text-gray-500 truncate mt-0.5">{job.address}</div>
                    )}
                    <div className="flex items-center gap-1 mt-1.5">
                      {job.driveLink && <span className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center"><DriveIcon size={11} /></span>}
                      {job.zohoLink && <span className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center"><ZohoIcon size={11} /></span>}
                      {job.plansPdfLink && <span className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600"><PlanIcon size={11} /></span>}
                      {pending(job) > 0 && (
                        <span className="ml-auto text-[10px] font-bold text-amber-600">{pending(job)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-[11px] text-gray-300 text-center py-4 select-none">Drop here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
