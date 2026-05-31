import React, { useState } from 'react';
import { X, Plus, CheckCircle2, Clock, CalendarDays, ArrowRight, User2 } from 'lucide-react';
import { Apartment, User, ContractorCategory } from '../../types';
import { useStore } from '../../data/store';
import { format, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';

const CAT_COLORS: Record<ContractorCategory, string> = {
  drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981',
};

function getDueBadge(dueDate: string | null) {
  if (!dueDate) return null;
  const days = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
  if (days < 0) return { text: 'Overdue', cls: 'bg-red-100 text-red-700 border-red-200' };
  if (days === 0) return { text: 'Today', cls: 'bg-orange-100 text-orange-700 border-orange-200' };
  if (days === 1) return { text: 'Tomorrow', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (days <= 3) return { text: `${days} days`, cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return { text: format(parseISO(dueDate), 'MMM d'), cls: 'bg-gray-100 text-gray-500 border-gray-200' };
}

interface Props {
  apartment: Apartment;
  onClose: () => void;
  currentUser: User;
  onToast: (msg: string) => void;
}

export function QuickAddTaskPanel({ apartment, onClose, currentUser, onToast }: Props) {
  const { stages, contractors, contractorAssignments, updateContractorAssignment, addContractorAssignment } = useStore();

  const [contractorId, setContractorId] = useState('');
  const [task, setTask] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [stageId, setStageId] = useState(apartment.currentStageId ?? '');
  const [showForm, setShowForm] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);
  const currentStage = stages.find(s => s.id === apartment.currentStageId);
  const currentIdx = sortedStages.findIndex(s => s.id === apartment.currentStageId);
  const nextStage = currentIdx >= 0 && currentIdx < sortedStages.length - 1
    ? sortedStages[currentIdx + 1]
    : currentIdx === -1 && sortedStages.length > 0
      ? sortedStages[0]
      : null;

  const aptTasks = contractorAssignments
    .filter(a => a.apartmentId === apartment.id)
    .sort((a, b) => {
      if (!!a.completedAt !== !!b.completedAt) return a.completedAt ? 1 : -1;
      return (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z');
    });

  const pendingCount = aptTasks.filter(a => !a.completedAt).length;
  const completedCount = aptTasks.filter(a => !!a.completedAt).length;
  const visibleTasks = hideCompleted ? aptTasks.filter(a => !a.completedAt) : aptTasks;

  function handleAdd() {
    if (!contractorId || !task.trim()) return;
    addContractorAssignment({
      contractorId,
      apartmentId: apartment.id,
      buildingId: apartment.buildingId,
      taskDescription: task.trim(),
      dueDate: dueDate || null,
      stageId: stageId || null,
      completedAt: null,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    });
    setTask('');
    setContractorId('');
    setDueDate('');
    onToast('Task added');
  }

  const aptLabel = apartment.displayName || apartment.apartmentNumber;

  return (
    <>
      <div className="drawer-overlay fixed inset-0 bg-black/25 z-40" onClick={onClose} />

      <div className="drawer-panel fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1e3a5f] text-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col">
              <span className="font-bold text-lg">Apt {aptLabel}</span>
              <span className="text-[#4aa8d8] text-xs font-medium">{apartment.buildingId}</span>
            </div>
            {/* Stage breadcrumb */}
            {(currentStage || nextStage) && (
              <div className="flex items-center gap-1.5 ml-2 bg-white/10 rounded-lg px-2.5 py-1.5">
                {currentStage ? (
                  <span className="text-xs font-medium" style={{ color: currentStage.color }}>{currentStage.name}</span>
                ) : (
                  <span className="text-xs text-white/50 italic">Not started</span>
                )}
                {nextStage && (
                  <>
                    <ArrowRight size={11} className="text-white/40 flex-shrink-0" />
                    <span className="text-xs text-white/60">{nextStage.name}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">

          {/* Task list */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Clock size={14} className="text-gray-400" />
                Tasks
                {pendingCount > 0 && (
                  <span className="text-xs bg-[#1e3a5f]/10 text-[#1e3a5f] px-1.5 py-0.5 rounded-full font-medium">
                    {pendingCount} pending
                  </span>
                )}
              </h3>
              {completedCount > 0 && (
                <button
                  onClick={() => setHideCompleted(v => !v)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
                    hideCompleted ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  <CheckCircle2 size={11} />
                  {hideCompleted ? `${completedCount} hidden` : 'Hide done'}
                </button>
              )}
            </div>

            {aptTasks.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <User2 size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No tasks assigned yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleTasks.map(a => {
                  const contractor = contractors.find(c => c.id === a.contractorId);
                  const stage = stages.find(s => s.id === a.stageId);
                  const dueBadge = getDueBadge(a.dueDate);
                  return (
                    <div
                      key={a.id}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                        a.completedAt ? 'border-green-100 bg-green-50/50 opacity-70' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <button
                        onClick={() => updateContractorAssignment(a.id, { completedAt: a.completedAt ? null : new Date().toISOString() })}
                        className="mt-0.5 flex-shrink-0"
                      >
                        {a.completedAt
                          ? <CheckCircle2 size={16} className="text-green-500" />
                          : <div className="w-4 h-4 rounded-full border-2 border-gray-300 hover:border-green-400 transition-colors" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          {contractor && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: CAT_COLORS[contractor.category] + '22', color: CAT_COLORS[contractor.category] }}
                            >
                              {contractor.name}
                            </span>
                          )}
                          {stage && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: stage.color + '20', color: stage.color }}>
                              {stage.name}
                            </span>
                          )}
                        </div>
                        <p className={`text-xs leading-snug ${a.completedAt ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {a.taskDescription}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {a.dueDate && (
                            <span className="flex items-center gap-1 text-[10px] text-gray-400">
                              <CalendarDays size={9} /> {format(parseISO(a.dueDate), 'MMM d')}
                            </span>
                          )}
                          {dueBadge && !a.completedAt && (
                            <span className={`text-[10px] px-1 py-0.5 rounded border font-medium ${dueBadge.cls}`}>
                              {dueBadge.text}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add task form */}
          <div className="px-5 pb-5">
            <div
              className={`rounded-xl border-2 overflow-hidden transition-all ${showForm ? 'border-[#1e3a5f]/20 bg-blue-50/50' : 'border-dashed border-gray-200'}`}
            >
              {!showForm ? (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-gray-500 hover:text-[#1e3a5f] transition-colors"
                >
                  <Plus size={15} /> Add Task
                </button>
              ) : (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-[#1e3a5f]">New Task</h3>
                    <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>

                  <select
                    value={contractorId}
                    onChange={e => setContractorId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                  >
                    <option value="">Select contractor *</option>
                    {(['drywall', 'ac', 'general'] as ContractorCategory[]).map(cat => {
                      const items = contractors.filter(c => c.category === cat && c.active);
                      if (!items.length) return null;
                      return (
                        <optgroup key={cat} label={cat === 'ac' ? 'AC / HVAC' : cat.charAt(0).toUpperCase() + cat.slice(1)}>
                          {items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>

                  <textarea
                    value={task}
                    onChange={e => setTask(e.target.value)}
                    rows={2}
                    placeholder="Task description *"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={stageId}
                      onChange={e => setStageId(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    >
                      <option value="">Stage (optional)</option>
                      {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    />
                  </div>

                  <button
                    onClick={handleAdd}
                    disabled={!contractorId || !task.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] disabled:opacity-40 transition-colors"
                  >
                    <Plus size={15} /> Create Task
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
