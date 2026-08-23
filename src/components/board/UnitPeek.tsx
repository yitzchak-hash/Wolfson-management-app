import React, { useEffect, useMemo } from 'react';
import { X, MapPin, Phone, FolderOpen, ExternalLink, FileText, ArrowRight } from 'lucide-react';
import { aptLabel, projectColor, getStageName } from '../../types';
import { useStore, loadProjectSnapshot } from '../../data/store';

/**
 * A PEEK at a unit in another workspace, without leaving this one.
 *
 * Clicking a Building Progress cell or a unit card used to travel: switch
 * workspace, open the drawer there — and closing the drawer left you standing
 * in Wolfson, a workspace away from the board you were arranging. The owner's
 * rule: opening a foreign unit from the job board stays ON the job board.
 *
 * So this is a read-only window over the unit's SNAPSHOT — the same
 * `loadProjectSnapshot` the unit card and the planner's foreign entries
 * already read, because only the open workspace is live. Editing needs the
 * real drawer in the real workspace, and the one button at the bottom does
 * exactly that travel for whoever actually wants it.
 */
export function UnitPeek({ pid, aptId, onClose, onOpenFull }: {
  pid: string;
  aptId: string;
  onClose: () => void;
  onOpenFull: () => void;
}) {
  const projects = useStore(st => st.projects);
  const contractors = useStore(st => st.contractors);
  const currentProjectId = useStore(st => st.currentProjectId);
  const liveApartments = useStore(st => st.apartments);
  const liveStages = useStore(st => st.stages);
  const liveAssignments = useStore(st => st.contractorAssignments);
  const isRtl = !!useStore(st => st.mainUiStrings)?.isRtl;
  // Re-resolve when a missing workspace snapshot arrives from the cloud.
  const snapTick = useStore(st => st.snapshotTick);

  const wsName = projects.find(p => p.id === pid)?.name ?? pid;
  const color = projectColor(projects, pid) || '#b8860b';

  const { apt, stage, tasks } = useMemo(() => {
    const src = pid === currentProjectId
      ? { apartments: liveApartments, stages: liveStages, assignments: liveAssignments }
      : loadProjectSnapshot(pid);
    const apt = src.apartments.find(a => a.id === aptId);
    const stage = apt?.currentStageId
      ? (src.stages ?? []).find(s => s.id === apt.currentStageId)
      : undefined;
    const tasks = apt
      ? (src.assignments ?? [])
          .filter(t => t.apartmentId === apt.id && !t.completedAt)
          .sort((a, b) => (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z'))
      : [];
    return { apt, stage, tasks };
  }, [pid, aptId, currentProjectId, liveApartments, liveStages, liveAssignments, snapTick]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  const linkBtn = (href: string, icon: React.ReactNode, label: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12px]
                 font-semibold text-gray-600 hover:text-[#4aa8d8] hover:border-[#4aa8d8]">
      {icon} {label}
    </a>
  );

  return (
    <>
      {/* The board's own chrome floats at z-40/50; this must sit above it. */}
      <div className="fixed inset-0 z-[120] bg-black/40" onClick={onClose} />
      <div
        className="fixed z-[121] bg-white rounded-2xl overflow-hidden flex flex-col"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(540px, 94vw)', maxHeight: '86vh',
          boxShadow: '0 28px 70px -14px rgba(15,23,42,.5)',
        }}
        data-unit-peek
      >
        <div className="flex items-center gap-2 px-4 py-3 text-white flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${color}, #1e3a5f)` }}>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide bg-white/20">
            {wsName.toUpperCase()}
          </span>
          <span className="font-bold text-[15px] truncate flex-1">
            {apt ? aptLabel(apt) || apt.displayName || 'Unit' : 'Unit'}
            {apt?.buildingId && apt.buildingId !== 'G' && (
              <span className="text-white/70 font-semibold text-[12px] ms-2">{apt.buildingId}</span>
            )}
          </span>
          <button onClick={onClose} title="Close" className="p-1.5 rounded-lg hover:bg-white/15">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!apt ? (
            // Not "removed" — this machine has not opened that workspace, so
            // its snapshot is not here to read. Same wording as the unit card.
            <p className="text-[13px] text-gray-500">
              Open {wsName} once on this computer and this unit's details will show here.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stage?.color ?? '#cbd5e1' }} />
                <span className="text-[13px] font-semibold text-gray-700">
                  {stage ? getStageName(stage, isRtl) : 'Not started'}
                </span>
              </div>

              {(apt.address || apt.phone) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-[12.5px] text-gray-600">
                  {apt.address && (
                    <span className="flex items-center gap-1.5 min-w-0">
                      <MapPin size={13} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">{apt.address}</span>
                    </span>
                  )}
                  {apt.phone && (
                    <a href={`tel:${apt.phone}`} className="flex items-center gap-1.5 hover:text-[#4aa8d8]">
                      <Phone size={13} className="text-gray-400" /> {apt.phone}
                    </a>
                  )}
                </div>
              )}

              {(apt.driveLink || apt.zohoLink || apt.plansPdfLink) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {apt.driveLink && linkBtn(apt.driveLink, <FolderOpen size={13} />, 'Drive folder')}
                  {apt.zohoLink && linkBtn(apt.zohoLink, <ExternalLink size={13} />, 'Zoho')}
                  {apt.plansPdfLink && linkBtn(apt.plansPdfLink, <FileText size={13} />, 'Plan')}
                </div>
              )}

              {apt.generalNotes && (
                <div className="mb-3">
                  <div className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</div>
                  <div className="text-[12.5px] text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-3">
                    {apt.generalNotes}
                  </div>
                </div>
              )}

              <div className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                Open tasks {tasks.length > 0 && `· ${tasks.length}`}
              </div>
              {tasks.length === 0 ? (
                <p className="text-[12px] text-gray-400">Nothing open.</p>
              ) : (
                <div className="space-y-1.5">
                  {tasks.map(t => (
                    <div key={t.id} className="flex items-start gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                      <span className="text-[12px] text-gray-700 flex-1 min-w-0">{t.taskDescription || '—'}</span>
                      <span className="text-[10.5px] text-gray-400 flex-shrink-0">
                        {contractors.find(c => c.id === t.contractorId)?.name ?? ''}
                        {t.dueDate ? ` · ${t.dueDate}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 flex-shrink-0">
          {pid !== currentProjectId && (
            <span className="text-[10.5px] text-gray-400 flex-1">
              What this computer last saw of {wsName}. Editing happens in its own workspace.
            </span>
          )}
          <button
            onClick={onOpenFull}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-white ms-auto"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}
            data-peek-open-full
          >
            Open in {wsName} <ArrowRight size={13} className={isRtl ? 'rotate-180' : ''} />
          </button>
        </div>
      </div>
    </>
  );
}
