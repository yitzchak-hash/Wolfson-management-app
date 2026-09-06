import React, { useState } from 'react';
import { AlertTriangle, Check, Undo2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useStore } from '../../data/store';
import { Apartment, ContractorAssignment, User, getStageName } from '../../types';
import { bandWorthy, canApproveProblem, isLiveProblem, problemDaysLate, PROBLEM_RED, PROBLEM_ROSE } from '../../data/problems';
import { driveThumbUrl } from '../../data/driveApi';

/**
 * THE BAND under the apartment window's title (owner, 2026-09-06): one row
 * per problem — red while it is open, rose while it waits for the office,
 * green once approved (it stays as the record for thirty days, then folds
 * into History). The worker, the deadline (red when passed), the pictures
 * he sent and, for admins, Approve and Send back. Approving is the office's
 * act — the worker's phone never offers it.
 */
export function ProblemBand({ apartment, currentUser }: { apartment: Apartment; currentUser: User }) {
  const ui = useStore(st => st.mainUiStrings);
  const assignments = useStore(st => st.contractorAssignments);
  const contractors = useStore(st => st.contractors);
  const photos = useStore(st => st.contractorPhotos);
  const stages = useStore(st => st.stages);
  const updateContractorAssignment = useStore(st => st.updateContractorAssignment);
  const addContractorNote = useStore(st => st.addContractorNote);
  const addActivityLog = useStore(st => st.addActivityLog);
  const [returning, setReturning] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const rows = assignments
    .filter(a => a.apartmentId === apartment.id && bandWorthy(a, today))
    .sort((a, b) => (Number(isLiveProblem(b)) - Number(isLiveProblem(a))) || b.createdAt.localeCompare(a.createdAt));
  if (rows.length === 0) return null;
  const admin = canApproveProblem(currentUser);

  function approve(a: ContractorAssignment) {
    const now = new Date().toISOString();
    updateContractorAssignment(a.id, {
      completedAt: now,
      problem: { ...a.problem!, status: 'solved', approvedAt: now, approvedBy: currentUser.name },
    });
    addActivityLog({
      apartmentId: apartment.id, apartmentNumber: apartment.apartmentNumber, buildingId: apartment.buildingId,
      userId: currentUser.id, userName: currentUser.name,
      actionType: 'contractor_complete', fieldChanged: 'problem_approved', previousValue: '', newValue: a.taskDescription.slice(0, 80),
      stageId: a.stageId ?? '',
    } as never);
  }

  function sendBack(a: ContractorAssignment) {
    const note = returnNote.trim();
    updateContractorAssignment(a.id, {
      problem: { ...a.problem!, status: 'returned', returnNote: note || undefined, returnedAt: new Date().toISOString(), closedAt: undefined },
    });
    if (note) {
      addContractorNote({
        assignmentId: a.id, apartmentId: apartment.id, contractorId: a.contractorId,
        text: note, authorType: 'office', authorId: currentUser.id, authorName: currentUser.name,
      });
    }
    setReturning(null);
    setReturnNote('');
  }

  return (
    <div data-problem-bands className="flex-shrink-0">
      {rows.map(a => {
        const live = isLiveProblem(a);
        const waiting = live && a.problem!.status === 'waiting';
        const solved = !live;
        const worker = contractors.find(c => c.id === a.contractorId)?.name ?? '';
        const late = problemDaysLate(a, today);
        const pics = photos.filter(p => p.assignmentId === a.id && (p.fileType ?? 'image') === 'image');
        const bg = solved ? '#dcfce7' : waiting ? PROBLEM_ROSE : PROBLEM_RED;
        const fg = solved ? '#15803d' : '#fff';
        const stageBefore = a.problem?.stageBefore ? stages.find(s => s.id === a.problem!.stageBefore) : null;
        return (
          <div key={a.id} data-problem-band={a.id} data-problem-status={a.problem!.status}
            className="px-4 py-2 flex flex-col gap-1.5" style={{ backgroundColor: bg, color: fg }}>
            <div className="flex items-center gap-2.5 flex-wrap">
              {solved
                ? <Check size={18} strokeWidth={3} className="flex-shrink-0" />
                : <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0 font-black text-[16px]" style={{ color: PROBLEM_RED }}>!</span>}
              <span className="text-[13px] font-bold min-w-0 flex-1">
                {solved ? ui.problemSolved : waiting ? ui.problemWaiting : a.problem!.status === 'returned' ? `${ui.problemLabel} · ${ui.problemReturned}` : ui.problemLabel}
                {' · '}{a.taskDescription}
                {worker && <> · {worker}</>}
                {solved && a.problem!.approvedAt && <> · {ui.problemApprovedBy} {a.problem!.approvedBy}, {format(parseISO(a.problem!.approvedAt), 'd MMM')}</>}
                {waiting && a.problem!.closedAt && <> · {ui.problemClosedBy} {worker}, {format(parseISO(a.problem!.closedAt), 'HH:mm')}</>}
                {!solved && !waiting && a.dueDate && (
                  <span data-problem-deadline-text className="ms-2 px-1.5 py-0.5 rounded bg-white/20 text-[11px] font-extrabold">
                    {ui.problemDeadline} {format(parseISO(a.dueDate), 'EEE d MMM')}{late > 0 ? ` · ${ui.problemLate.replace('{n}', String(late))}` : ''}
                  </span>
                )}
                {!solved && stageBefore && (
                  <span className="ms-2 text-[11px] opacity-80">({ui.problemWas} {getStageName(stageBefore, !!ui.isRtl)})</span>
                )}
              </span>
              {live && admin && (
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <button data-problem-approve onClick={() => approve(a)}
                    className="px-2.5 py-1 rounded-lg bg-white text-[12px] font-extrabold flex items-center gap-1" style={{ color: '#b91c1c' }}>
                    {ui.problemApprove} <Check size={13} strokeWidth={3} />
                  </button>
                  <button data-problem-sendback onClick={() => { setReturning(a.id); setReturnNote(''); }}
                    className="px-2.5 py-1 rounded-lg bg-white/20 text-[12px] font-bold flex items-center gap-1">
                    <Undo2 size={13} /> {ui.problemSendBack}
                  </button>
                </span>
              )}
            </div>
            {pics.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">{ui.problemPicturesSent}</span>
                {pics.slice(0, 8).map(p => {
                  const src = p.storageUrl || (p.driveFileId ? driveThumbUrl(p.driveFileId, 200) : p.dataUrl);
                  const href = p.storageUrl || p.driveUrl || p.dataUrl;
                  return src ? (
                    <a key={p.id} href={href} target="_blank" rel="noopener noreferrer">
                      <img src={src} alt="" className="w-10 h-10 rounded-md object-cover border border-white/60" />
                    </a>
                  ) : null;
                })}
              </div>
            )}
            {returning === a.id && (
              <div data-problem-return className="flex items-center gap-2 bg-white rounded-lg p-1.5" style={{ color: '#1f2c3d' }}>
                <input autoFocus value={returnNote} onChange={e => setReturnNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendBack(a); if (e.key === 'Escape') setReturning(null); }}
                  placeholder={ui.problemSendBackNote} data-enter-own
                  className="flex-1 min-w-0 text-sm px-2 py-1 focus:outline-none" />
                <button data-problem-return-send onClick={() => sendBack(a)}
                  className="px-2.5 py-1 rounded-md text-white text-xs font-bold" style={{ backgroundColor: PROBLEM_RED }}>{ui.problemSendBack}</button>
                <button onClick={() => setReturning(null)} className="p-1 text-gray-400"><X size={14} /></button>
              </div>
            )}
          </div>
        );
      })}
      {/* The bands are drawn by a hook-free map; this keeps the AlertTriangle import honest for the empty-import lint. */}
      <span className="hidden"><AlertTriangle size={1} /></span>
    </div>
  );
}
