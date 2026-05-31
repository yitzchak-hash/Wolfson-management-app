import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Save, Calendar, User, MessageSquare } from 'lucide-react';
import { Stage, User as UserType } from '../../types';
import { useStore } from '../../data/store';
import { format } from 'date-fns';

interface StageNotesSectionProps {
  apartmentId: string;
  stages: Stage[];
  currentUser: UserType;
  onSaved: () => void;
}

export function StageNotesSection({ apartmentId, stages, currentUser, onSaved }: StageNotesSectionProps) {
  const {
    upsertStageNote, getStageNote,
    apartments, contractors, contractorAssignments, contractorNotes,
    addContractorAssignment, updateContractorAssignment, deleteContractorAssignment,
  } = useStore();

  const [openStage, setOpenStage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const apt = apartments.find(a => a.id === apartmentId);
  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);
  const activeContractors = contractors.filter(c => c.active);

  function handleSave(stageId: string) {
    const text = drafts[stageId] ?? (getStageNote(apartmentId, stageId)?.noteText ?? '');
    upsertStageNote(apartmentId, stageId, text, currentUser);
    onSaved();
  }

  function getDraft(stageId: string): string {
    if (drafts[stageId] !== undefined) return drafts[stageId];
    return getStageNote(apartmentId, stageId)?.noteText ?? '';
  }

  function getAssignment(stageId: string) {
    return contractorAssignments.find(
      a => a.apartmentId === apartmentId && a.stageId === stageId
    );
  }

  function handleContractorChange(stageId: string, contractorId: string) {
    const existing = getAssignment(stageId);
    if (!contractorId) {
      if (existing) deleteContractorAssignment(existing.id);
      return;
    }
    const contractor = contractors.find(c => c.id === contractorId);
    if (!contractor || !apt) return;
    if (existing) {
      updateContractorAssignment(existing.id, { contractorId });
    } else {
      addContractorAssignment({
        contractorId,
        apartmentId,
        buildingId: apt.buildingId,
        taskDescription: `${stages.find(s => s.id === stageId)?.name ?? 'Stage'} work`,
        dueDate: null,
        stageId,
        completedAt: null,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
      });
    }
  }

  return (
    <div className="space-y-1.5">
      {sortedStages.map(stage => {
        const note = getStageNote(apartmentId, stage.id);
        const isOpen = openStage === stage.id;
        const hasNote = note && note.noteText.trim();
        const stageDate = apt?.stageDates?.[stage.id];
        const assignment = getAssignment(stage.id);
        const assignedContractor = assignment ? contractors.find(c => c.id === assignment.contractorId) : null;

        return (
          <div key={stage.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setOpenStage(isOpen ? null : stage.id)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-medium text-gray-800">{stage.name}</span>
                {hasNote && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Note</span>
                )}
                {stageDate && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Calendar size={9} />
                    {format(new Date(stageDate), 'MMM d, yyyy')}
                  </span>
                )}
                {assignedContractor && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    <User size={9} />
                    {assignedContractor.name}
                  </span>
                )}
              </div>
              {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="p-3 space-y-3 bg-white">
                {/* Stage date display */}
                {stageDate && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <Calendar size={12} className="text-[#4aa8d8]" />
                    Stage reached: <strong>{format(new Date(stageDate), 'MMMM d, yyyy · HH:mm')}</strong>
                  </div>
                )}

                {/* Contractor assignment */}
                {activeContractors.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                      <User size={11} />
                      Assign Contractor
                    </label>
                    <select
                      value={assignment?.contractorId ?? ''}
                      onChange={e => handleContractorChange(stage.id, e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    >
                      <option value="">— None —</option>
                      {['drywall', 'ac', 'general'].map(cat => {
                        const catContractors = activeContractors.filter(c => c.category === cat);
                        if (!catContractors.length) return null;
                        const labels: Record<string, string> = { drywall: 'Drywall', ac: 'AC / HVAC', general: 'General' };
                        return (
                          <optgroup key={cat} label={labels[cat]}>
                            {catContractors.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Office notes */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Office Notes</p>
                  <textarea
                    value={getDraft(stage.id)}
                    onChange={e => setDrafts(d => ({ ...d, [stage.id]: e.target.value }))}
                    placeholder={`Office notes for ${stage.name}...`}
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />
                  <div className="flex items-center justify-between mt-1">
                    {note ? (
                      <span className="text-xs text-gray-400">
                        {note.updatedByName} · {format(new Date(note.updatedAt), 'MMM d, yyyy HH:mm')}
                      </span>
                    ) : <span />}
                    <button
                      onClick={() => handleSave(stage.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-medium hover:bg-[#162d4a] transition-colors"
                    >
                      <Save size={12} />
                      Save
                    </button>
                  </div>
                </div>

                {/* Contractor notes for this stage */}
                {(() => {
                  const assignmentIds = contractorAssignments
                    .filter(a => a.apartmentId === apartmentId && a.stageId === stage.id)
                    .map(a => a.id);
                  const cNotes = contractorNotes.filter(
                    n => assignmentIds.includes(n.assignmentId) && n.authorType === 'contractor',
                  );
                  if (!cNotes.length) return null;
                  return (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <MessageSquare size={9} /> Contractor Notes
                      </p>
                      <div className="space-y-1.5">
                        {cNotes.map(n => (
                          <div key={n.id} className="px-2.5 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="font-medium text-gray-700">{n.authorName}</span>
                              <span className="text-gray-400 ml-auto">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</span>
                            </div>
                            <p className="text-gray-600 leading-snug">{n.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
