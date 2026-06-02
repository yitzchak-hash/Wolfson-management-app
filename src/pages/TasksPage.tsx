import React, { useState, useRef } from 'react';
import { useStore } from '../data/store';
import {
  Plus, Trash2, Save, Edit2, X, CheckCircle2, Clock, Paperclip, ExternalLink, Layers,
} from 'lucide-react';
import { BulkAddTaskModal } from '../components/apartment/BulkAddTaskModal';
import { ContractorAssignment, ContractorCategory, TaskAttachment } from '../types';
import { Toast } from '../components/ui/Toast';
import { Tooltip } from '../components/ui/Tooltip';
import { format, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import {
  isUploadBackendConfigured, extractFolderId,
  findOrCreateFolderViaBackend, uploadFileViaResumableSession,
  shareFileToDrive, driveThumbUrl,
} from '../data/driveApi';

const CAT_COLORS: Record<ContractorCategory, string> = {
  drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981',
};
const CAT_LABELS: Record<ContractorCategory, string> = {
  drywall: 'Drywall', ac: 'AC', general: 'General',
};

function getDueBadge(dueDate: string | null): { text: string; cls: string } | null {
  if (!dueDate) return null;
  const days = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
  if (days < 0) return { text: 'Overdue', cls: 'bg-red-100 text-red-700 border-red-200' };
  if (days === 0) return { text: 'Today', cls: 'bg-orange-100 text-orange-700 border-orange-200' };
  if (days === 1) return { text: 'Tomorrow', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
  if (days <= 3) return { text: `${days} days`, cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return { text: format(parseISO(dueDate), 'MMM d'), cls: 'bg-gray-100 text-gray-500 border-gray-200' };
}

export function TasksPage() {
  const {
    contractors, contractorAssignments, apartments, stages,
    addContractorAssignment, updateContractorAssignment, deleteContractorAssignment,
    updateApartment, currentUser, mainUiStrings: s,
  } = useStore();

  const [filterContractorId, setFilterContractorId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    taskDescription: string; dueDate: string; stageId: string; completedAt: string | null;
  }>({ taskDescription: '', dueDate: '', stageId: '', completedAt: null });
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [addForm, setAddForm] = useState({ contractorId: '', aptId: '', task: '', dueDate: '', stageId: '' });
  const [addAttachments, setAddAttachments] = useState<TaskAttachment[]>([]);
  const [addUploadProgress, setAddUploadProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  async function compressImage(file: File): Promise<File> {
    if (!file.type.startsWith('image/')) return file;
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', 0.72);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function handleAddFileChosen(file: File) {
    const processed = await compressImage(file);
    const id = crypto.randomUUID();

    const apt = apartments.find(a => a.id === addForm.aptId);
    if (isUploadBackendConfigured() && apt?.driveLink) {
      try {
        const mainFolderId = extractFolderId(apt.driveLink);
        if (mainFolderId) {
          setAddUploadProgress(1);
          const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Photos');
          const taskNotesFolderId = await findOrCreateFolderViaBackend(photosFolderId, 'Task Notes');
          const { fileId, webViewLink } = await uploadFileViaResumableSession(
            taskNotesFolderId, processed,
            pct => setAddUploadProgress(pct),
          );
          await shareFileToDrive(fileId);
          setAddUploadProgress(null);
          setAddAttachments(prev => [...prev, {
            id, filename: processed.name, mimeType: processed.type,
            dataUrl: '', driveFileId: fileId, driveUrl: webViewLink,
          }]);
          return;
        }
      } catch (e) {
        console.warn('Drive upload failed for task attachment, falling back to base64:', e);
        setAddUploadProgress(null);
      }
    }

    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string ?? '';
      setAddAttachments(prev => [...prev, { id, filename: processed.name, mimeType: processed.type, dataUrl }]);
    };
    reader.readAsDataURL(processed);
  }

  function onToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
  }

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);
  const resApts = apartments
    .filter(a => !a.isUnnamed && a.floor > 0)
    .sort((a, b) => a.buildingId.localeCompare(b.buildingId) || (Number(a.apartmentNumber) - Number(b.apartmentNumber)));

  const filtered = contractorAssignments
    .filter(a => !filterContractorId || a.contractorId === filterContractorId)
    .sort((a, b) => {
      const aVal = a.completedAt ? 1 : 0;
      const bVal = b.completedAt ? 1 : 0;
      if (aVal !== bVal) return aVal - bVal;
      return (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z');
    });

  function startEdit(a: ContractorAssignment) {
    setEditingId(a.id);
    setEditFields({
      taskDescription: a.taskDescription,
      dueDate: a.dueDate ?? '',
      stageId: a.stageId ?? '',
      completedAt: a.completedAt,
    });
  }

  function saveEdit(id: string) {
    updateContractorAssignment(id, {
      taskDescription: editFields.taskDescription,
      dueDate: editFields.dueDate || null,
      stageId: editFields.stageId || null,
      completedAt: editFields.completedAt,
    });
    setEditingId(null);
    onToast('Task updated');
  }

  function handleAdd() {
    if (!addForm.contractorId || !addForm.aptId || !addForm.task.trim()) return;
    const apt = apartments.find(a => a.id === addForm.aptId);
    if (!apt) return;
    addContractorAssignment({
      contractorId: addForm.contractorId,
      apartmentId: addForm.aptId,
      buildingId: apt.buildingId,
      taskDescription: addForm.task.trim(),
      dueDate: addForm.dueDate || null,
      stageId: addForm.stageId || null,
      completedAt: null,
      createdBy: currentUser?.id ?? '',
      createdByName: currentUser?.name ?? 'Office',
      attachments: addAttachments.length > 0 ? addAttachments : undefined,
    });
    if (addForm.stageId && addForm.stageId !== apt.currentStageId && currentUser) {
      updateApartment(apt.id, { currentStageId: addForm.stageId }, currentUser);
    }
    setAddForm({ contractorId: '', aptId: '', task: '', dueDate: '', stageId: '' });
    setAddAttachments([]);
    setShowAdd(false);
    onToast('Task added');
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <input
        ref={addFileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleAddFileChosen(file);
          e.target.value = '';
        }}
      />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{s.pageTasks}</h1>

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={filterContractorId}
            onChange={e => setFilterContractorId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          >
            <option value="">{s.allContractors}</option>
            {contractors.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({CAT_LABELS[c.category]})</option>
            ))}
          </select>

          <span className="text-xs text-gray-400 flex-1">
            {filtered.length} task{filtered.length !== 1 ? 's' : ''} · {filtered.filter(a => a.completedAt).length} done
          </span>

          <button
            onClick={() => setShowBulkAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#1e3a5f] text-[#1e3a5f] rounded-lg text-sm font-medium hover:bg-[#1e3a5f]/5 transition-colors"
          >
            <Layers size={15} />
            Bulk Add
          </button>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
          >
            <Plus size={15} />
            {s.addTask}
          </button>
        </div>

        {/* Add task form */}
        {showAdd && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-blue-800">New Task</h3>
              <button onClick={() => setShowAdd(false)} className="text-blue-400 hover:text-blue-600"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <select
                value={addForm.contractorId}
                onChange={e => setAddForm(f => ({ ...f, contractorId: e.target.value }))}
                className="col-span-2 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                <option value="">{s.selectContractor}</option>
                {(['drywall', 'ac', 'general'] as ContractorCategory[]).map(cat => (
                  <optgroup key={cat} label={CAT_LABELS[cat]}>
                    {contractors.filter(c => c.category === cat && c.active).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                value={addForm.aptId}
                onChange={e => {
                  const apt = apartments.find(a => a.id === e.target.value);
                  setAddForm(f => ({ ...f, aptId: e.target.value, stageId: apt?.currentStageId ?? '' }));
                }}
                className="col-span-2 border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                <option value="">{s.selectApartment}</option>
                {['A1', 'A2', 'A3'].map(bid => (
                  <optgroup key={bid} label={`Building ${bid}`}>
                    {resApts.filter(a => a.buildingId === bid).map(a => (
                      <option key={a.id} value={a.id}>
                        Apt {a.displayName || a.apartmentNumber} (Floor {a.floor})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                value={addForm.stageId}
                onChange={e => setAddForm(f => ({ ...f, stageId: e.target.value }))}
                className="border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                <option value="">{s.stageOptional}</option>
                {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                type="date"
                value={addForm.dueDate}
                onChange={e => setAddForm(f => ({ ...f, dueDate: e.target.value }))}
                className="border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              />
            </div>
            <textarea
              value={addForm.task}
              onChange={e => setAddForm(f => ({ ...f, task: e.target.value }))}
              rows={2}
              placeholder={s.taskDescriptionPlaceholder}
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white resize-none mb-3"
            />

            {/* Attachment previews */}
            {addAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {addAttachments.map(att => (
                  <div key={att.id} className="relative">
                    {att.mimeType.startsWith('image/') ? (
                      <>
                        <img
                          src={att.driveFileId ? driveThumbUrl(att.driveFileId, 300) : att.dataUrl}
                          alt={att.filename}
                          className="h-16 w-16 object-cover rounded-lg border border-blue-200"
                        />
                        <button
                          onClick={() => setAddAttachments(prev => prev.filter(a => a.id !== att.id))}
                          className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                        >
                          <X size={9} />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
                        <Paperclip size={10} />
                        <span className="truncate max-w-[120px]">{att.filename}</span>
                        <button
                          onClick={() => setAddAttachments(prev => prev.filter(a => a.id !== att.id))}
                          className="text-blue-400 hover:text-blue-600"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upload progress */}
            {addUploadProgress !== null && (
              <div className="mb-3 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 transition-all duration-300 rounded-full"
                  style={{ width: `${addUploadProgress}%` }}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => addFileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm hover:bg-blue-100 transition-colors"
                title="Attach file"
              >
                <Paperclip size={14} />
              </button>
              <button
                onClick={handleAdd}
                disabled={!addForm.contractorId || !addForm.aptId || !addForm.task.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium disabled:opacity-40"
              >
                <Plus size={15} /> {s.addTask}
              </button>
            </div>
          </div>
        )}

        {/* Task list */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Clock size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">{s.noTasks}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(a => {
              const apt = apartments.find(ap => ap.id === a.apartmentId);
              const stage = stages.find(s => s.id === a.stageId);
              const contractor = contractors.find(c => c.id === a.contractorId);
              const dueBadge = getDueBadge(a.dueDate);
              const isEditing = editingId === a.id;

              return (
                <div
                  key={a.id}
                  className={`bg-white border rounded-xl overflow-hidden transition-all ${a.completedAt ? 'border-green-200 opacity-80' : 'border-gray-200'}`}
                >
                  <div className="flex items-start gap-3 p-4">
                    <Tooltip text={a.completedAt ? 'Mark as incomplete' : 'Mark as complete'} side="right">
                      <button
                        onClick={() => updateContractorAssignment(a.id, { completedAt: a.completedAt ? null : new Date().toISOString() })}
                        className="mt-0.5 flex-shrink-0"
                      >
                        {a.completedAt
                          ? <CheckCircle2 size={20} className="text-green-500" />
                          : <div className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-400 transition-colors" />
                        }
                      </button>
                    </Tooltip>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {contractor && (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: CAT_COLORS[contractor.category] + '22', color: CAT_COLORS[contractor.category] }}
                          >
                            {contractor.name}
                          </span>
                        )}
                        <span className="font-medium text-gray-800 text-sm">
                          {a.buildingId} · Apt {apt?.displayName || apt?.apartmentNumber}
                        </span>
                        {stage && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: stage.color + '22', color: stage.color }}
                          >
                            {stage.name}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${a.completedAt ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                        {a.taskDescription}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {a.dueDate && (
                          <span className="text-xs text-gray-400">{format(parseISO(a.dueDate), 'MMM d, yyyy')}</span>
                        )}
                        {dueBadge && !a.completedAt && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${dueBadge.cls}`}>
                            {dueBadge.text}
                          </span>
                        )}
                        {a.completedAt && (
                          <span className="text-xs text-green-600">Done {format(new Date(a.completedAt), 'MMM d')}</span>
                        )}
                      </div>

                      {/* Task attachments */}
                      {a.attachments && a.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {a.attachments.map(att => (
                            att.mimeType?.startsWith('image/') ? (
                              att.driveFileId ? (
                                <a key={att.id} href={att.driveUrl ?? '#'} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={driveThumbUrl(att.driveFileId, 300)}
                                    alt={att.filename}
                                    className="h-14 w-14 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90"
                                  />
                                </a>
                              ) : att.dataUrl ? (
                                <img
                                  key={att.id}
                                  src={att.dataUrl}
                                  alt={att.filename}
                                  className="h-14 w-14 object-cover rounded-lg border border-gray-200"
                                />
                              ) : null
                            ) : (
                              <a
                                key={att.id}
                                href={att.driveUrl ?? '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200 transition-colors"
                              >
                                <Paperclip size={10} />
                                <span className="truncate max-w-[120px]">{att.filename}</span>
                                <ExternalLink size={9} className="text-gray-400 flex-shrink-0" />
                              </a>
                            )
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Tooltip text={isEditing ? 'Cancel edit' : 'Edit task'}>
                        <button
                          onClick={() => isEditing ? setEditingId(null) : startEdit(a)}
                          className={`p-1.5 rounded-lg transition-colors ${isEditing ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'text-gray-400 hover:bg-gray-100'}`}
                        >
                          <Edit2 size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip text="Delete task">
                        <button
                          onClick={() => { if (confirm('Delete this task?')) { deleteContractorAssignment(a.id); onToast('Task deleted'); } }}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {isEditing && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                      <textarea
                        value={editFields.taskDescription}
                        onChange={e => setEditFields(f => ({ ...f, taskDescription: e.target.value }))}
                        rows={2}
                        placeholder="Task description"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none bg-white"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={editFields.stageId}
                          onChange={e => setEditFields(f => ({ ...f, stageId: e.target.value }))}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                        >
                          <option value="">No stage</option>
                          {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <input
                          type="date"
                          value={editFields.dueDate}
                          onChange={e => setEditFields(f => ({ ...f, dueDate: e.target.value }))}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => saveEdit(a.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-medium hover:bg-[#162d4a]"
                        >
                          <Save size={13} /> Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {showBulkAdd && (
        <BulkAddTaskModal
          onClose={() => setShowBulkAdd(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
