import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../data/store';
import { contractorLoad } from '../data/contractorLoad';
import {
  Plus, Trash2, Save, Edit2, X, CheckCircle2, Clock, Paperclip, ExternalLink, Layers, Filter,
  List, CalendarDays, Printer,
} from 'lucide-react';
import { BulkAddTaskModal } from '../components/apartment/BulkAddTaskModal';
import { TaskCalendar, CalendarEvent } from '../components/tasks/TaskCalendar';
import { ContractorAssignment, ContractorCategory, TaskAttachment, TaskPriority, getStageName, aptLabel, isCountableApartment } from '../types';
import { Toast } from '../components/ui/Toast';
import { printTable, printDot, printPill } from '../data/printing';
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

export function TasksPage() {
  const {
    contractors, contractorAssignments, apartments, stages, buildings,
    addContractorAssignment, updateContractorAssignment, deleteContractorAssignment,
    updateApartment, currentUser, mainUiStrings: s, currentProjectId, projects,
    pendingFocus, setPendingFocus,
  } = useStore();
  const projectName = projects.find(p => p.id === currentProjectId)?.name ?? 'Workspace';

  const PRIORITY_CONFIG: Record<TaskPriority, { label: string; cls: string; dot: string }> = {
    urgent: { label: s.urgentPriority, cls: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-500' },
    normal: { label: s.normalPriority, cls: 'text-gray-500 bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
    low:    { label: s.lowPriority,    cls: 'text-green-600 bg-green-50 border-green-200', dot: 'bg-green-500' },
  };

  const CAT_LABELS: Record<ContractorCategory, string> = {
    drywall: s.categoryDrywall, ac: s.categoryAC, general: s.categoryGeneral,
  };

  function getDueBadge(dueDate: string | null): { text: string; cls: string } | null {
    if (!dueDate) return null;
    const days = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
    if (days < 0) return { text: s.overdue, cls: 'bg-red-100 text-red-700 border-red-200' };
    if (days === 0) return { text: s.today, cls: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (days === 1) return { text: s.tomorrow, cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (days <= 3) return { text: `${days} ${s.daysLabel}`, cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
    return { text: format(parseISO(dueDate), 'MMM d'), cls: 'bg-gray-100 text-gray-500 border-gray-200' };
  }

  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [filterContractorId, setFilterContractorId] = useState('');
  const [filterBuilding, setFilterBuilding] = useState<string>('all');
  const [filterStage, setFilterStage] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    taskDescription: string; dueDate: string; stageId: string; completedAt: string | null; priority: string;
  }>({ taskDescription: '', dueDate: '', stageId: '', completedAt: null, priority: '' });
  const [editAttachments, setEditAttachments] = useState<TaskAttachment[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [addForm, setAddForm] = useState({ contractorId: '', aptId: '', task: '', dueDate: '', stageId: '', priority: '' });
  const [addAttachments, setAddAttachments] = useState<TaskAttachment[]>([]);
  const [addUploadProgress, setAddUploadProgress] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [editUploadProgress, setEditUploadProgress] = useState<number | null>(null);

  /**
   * "Show me this worker", arriving from search.
   *
   * Their tasks, filtered to them and with the panel open so the filter is
   * visible — a list that has silently narrowed itself reads as missing data.
   * Sending them to app settings instead, as this used to, showed the row that
   * renames the worker and nothing about their work.
   */
  useEffect(() => {
    const f = pendingFocus;
    // Only what this page can show. Clearing first and checking the kind
    // afterwards means every mounted page eats every intent, including the
    // ones on their way somewhere else.
    if (f?.kind !== 'contractor') return;
    setPendingFocus(null);
    setFilterContractorId(f.id);
    setShowFilters(true);
    setView('list');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocus]);

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
          const tasksFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Tasks');
          const { fileId, webViewLink } = await uploadFileViaResumableSession(
            tasksFolderId, processed,
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

  async function handleEditFileChosen(file: File) {
    const processed = await compressImage(file);
    const id = crypto.randomUUID();
    const assignment = contractorAssignments.find(a => a.id === editingId);
    const apt = apartments.find(a => a.id === assignment?.apartmentId);
    if (isUploadBackendConfigured() && apt?.driveLink) {
      try {
        const mainFolderId = extractFolderId(apt.driveLink);
        if (mainFolderId) {
          setEditUploadProgress(1);
          const tasksFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Tasks');
          const { fileId, webViewLink } = await uploadFileViaResumableSession(
            tasksFolderId, processed,
            pct => setEditUploadProgress(pct),
          );
          await shareFileToDrive(fileId);
          setEditUploadProgress(null);
          setEditAttachments(prev => [...prev, {
            id, filename: processed.name, mimeType: processed.type,
            dataUrl: '', driveFileId: fileId, driveUrl: webViewLink,
          }]);
          return;
        }
      } catch (e) {
        console.warn('Drive upload failed for edit attachment, falling back to base64:', e);
        setEditUploadProgress(null);
      }
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string ?? '';
      setEditAttachments(prev => [...prev, { id, filename: processed.name, mimeType: processed.type, dataUrl }]);
    };
    reader.readAsDataURL(processed);
  }

  function onToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
  }

  const sortedStages = [...stages].filter(st => st.active && (currentProjectId === 'general' ? st.projectId === 'general' : !st.projectId)).sort((a, b) => a.order - b.order);
  /**
   * The units a task can be put against.
   *
   * isCountableApartment() and nothing else. The extra `floor > 0` that used to
   * be here excluded a ground-floor unit somebody had deliberately named — and
   * on the Job Board, where every job is stored at floor 0, it excluded ALL of
   * them.
   */
  const resApts = apartments
    .filter(isCountableApartment)
    .sort((a, b) => a.buildingId.localeCompare(b.buildingId) || (Number(a.apartmentNumber) - Number(b.apartmentNumber)));

  const today = new Date().toISOString().split('T')[0];
  const hasAdvancedFilters = filterBuilding !== 'all' || filterStage || filterPriority || filterOverdue || filterDateFrom || filterDateTo;

  function clearAdvancedFilters() {
    setFilterBuilding('all');
    setFilterStage('');
    setFilterPriority('');
    setFilterOverdue(false);
    setFilterDateFrom('');
    setFilterDateTo('');
  }

  const filtered = contractorAssignments
    .filter(a => {
      if (filterContractorId && a.contractorId !== filterContractorId) return false;
      if (filterBuilding !== 'all' && a.buildingId !== filterBuilding) return false;
      if (filterStage && a.stageId !== filterStage) return false;
      if (filterPriority && (a.priority ?? 'normal') !== filterPriority) return false;
      if (filterOverdue && (a.completedAt || !a.dueDate || a.dueDate >= today)) return false;
      if (filterDateFrom && a.dueDate && a.dueDate < filterDateFrom) return false;
      if (filterDateTo && a.dueDate && a.dueDate > filterDateTo) return false;
      return true;
    })
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { urgent: 0, normal: 1, low: 2 };
      const aVal = a.completedAt ? 1 : 0;
      const bVal = b.completedAt ? 1 : 0;
      if (aVal !== bVal) return aVal - bVal;
      const aPrio = priorityOrder[a.priority ?? 'normal'] ?? 1;
      const bPrio = priorityOrder[b.priority ?? 'normal'] ?? 1;
      if (aPrio !== bPrio) return aPrio - bPrio;
      return (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z');
    });

  function startEdit(a: ContractorAssignment) {
    setEditingId(a.id);
    setEditFields({
      taskDescription: a.taskDescription,
      dueDate: a.dueDate ?? '',
      stageId: a.stageId ?? '',
      completedAt: a.completedAt,
      priority: a.priority ?? 'normal',
    });
    setEditAttachments(a.attachments ?? []);
  }

  function saveEdit(id: string) {
    updateContractorAssignment(id, {
      taskDescription: editFields.taskDescription,
      dueDate: editFields.dueDate || null,
      stageId: editFields.stageId || null,
      completedAt: editFields.completedAt,
      priority: (editFields.priority as TaskPriority) || undefined,
      attachments: editAttachments.length > 0 ? editAttachments : undefined,
    });
    setEditingId(null);
    setEditAttachments([]);
    onToast(s.taskUpdated);
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
      priority: (addForm.priority as TaskPriority) || undefined,
    });
    if (addForm.stageId && addForm.stageId !== apt.currentStageId && currentUser) {
      updateApartment(apt.id, { currentStageId: addForm.stageId }, currentUser);
    }
    setAddForm({ contractorId: '', aptId: '', task: '', dueDate: '', stageId: '', priority: '' });
    setAddAttachments([]);
    setShowAdd(false);
    onToast(s.taskAdded);
  }

  const calendarEvents: CalendarEvent[] = filtered
    .filter(a => a.dueDate)
    .map(a => {
      const apt = apartments.find(ap => ap.id === a.apartmentId);
      const contractor = contractors.find(c => c.id === a.contractorId);
      return {
        id: a.id,
        date: a.dueDate!,
        title: a.taskDescription,
        subtitle: `${a.buildingId} · ${s.aptPrefix} ${aptLabel(apt)}`,
        color: contractor ? CAT_COLORS[contractor.category] : '#6b7280',
        completed: !!a.completedAt,
        onClick: () => { setView('list'); startEdit(a); },
      };
    });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <input
        ref={addFileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
        multiple
        className="hidden"
        onChange={e => {
          Array.from(e.target.files ?? []).forEach(f => handleAddFileChosen(f));
          e.target.value = '';
        }}
      />
      <input
        ref={editFileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
        multiple
        className="hidden"
        onChange={e => {
          Array.from(e.target.files ?? []).forEach(f => handleEditFileChosen(f));
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

          <Tooltip text="More filters">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                hasAdvancedFilters ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Filter size={14} />
              {hasAdvancedFilters ? 'Filtered' : 'Filter'}
            </button>
          </Tooltip>

          <span className="text-xs text-gray-400 flex-1">
            {filtered.length} task{filtered.length !== 1 ? 's' : ''} · {filtered.filter(a => a.completedAt).length} done
          </span>

          {/* A work list somebody can carry. Prints exactly what the filters
              are showing, so "print the AC jobs due this week" is two clicks. */}
          <Tooltip text="Print this list">
            <button
              onClick={() => {
                const ok = printTable(
                  `Tasks — ${projectName}`,
                  filtered,
                  [
                    { header: 'Job', value: a => {
                      const apt = apartments.find(x => x.id === a.apartmentId);
                      return apt ? aptLabel(apt) : '—';
                    } },
                    { header: 'Task', value: a => a.taskDescription || '—' },
                    { header: 'Contractor', value: a => contractors.find(c => c.id === a.contractorId)?.name ?? '—' },
                    { header: 'Stage', html: true, width: '130px', value: a => {
                      const st = stages.find(x => x.id === a.stageId);
                      return st ? printDot(st.color, getStageName(st, !!s.isRtl)) : '—';
                    } },
                    { header: 'Due', width: '86px', value: a => a.dueDate ? format(parseISO(a.dueDate), 'd MMM yyyy') : '—' },
                    { header: 'Priority', html: true, width: '72px', value: a =>
                      a.priority === 'urgent' ? printPill('#fee2e2', '#b91c1c', 'Urgent')
                      : a.priority === 'low' ? printPill('#f1f5f9', '#64748b', 'Low')
                      : printPill('#e0f2fe', '#0369a1', 'Normal') },
                    { header: 'Status', html: true, width: '72px', value: a =>
                      a.completedAt ? printPill('#dcfce7', '#15803d', 'Done')
                      : printPill('#fef3c7', '#a16207', 'Open') },
                  ],
                  {
                    landscape: true,
                    rtl: !!s.isRtl,
                    subtitle: `${filtered.length} task${filtered.length === 1 ? '' : 's'} · `
                      + `${filtered.filter(a => a.completedAt).length} done`
                      + (filterContractorId ? ` · ${contractors.find(c => c.id === filterContractorId)?.name}` : '')
                      + (hasAdvancedFilters ? ' · extra filters applied' : ''),
                  },
                );
                if (!ok) setToast({ msg: 'Your browser blocked the print window.', type: 'error' });
              }}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm font-medium hover:border-gray-300 hover:text-gray-700 transition-colors"
            >
              <Printer size={14} />
            </button>
          </Tooltip>

          {/* List / Calendar view toggle */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <Tooltip text={s.listView}>
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  view === 'list' ? 'bg-[#1e3a5f] text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <List size={15} />
              </button>
            </Tooltip>
            <Tooltip text={s.calendarView}>
              <button
                onClick={() => setView('calendar')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  view === 'calendar' ? 'bg-[#1e3a5f] text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <CalendarDays size={15} />
              </button>
            </Tooltip>
          </div>

          <button
            onClick={() => setShowBulkAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#1e3a5f] text-[#1e3a5f] rounded-lg text-sm font-medium hover:bg-[#1e3a5f]/5 transition-colors"
          >
            <Layers size={15} />
            {s.bulkAdd}
          </button>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
          >
            <Plus size={15} />
            {s.addTask}
          </button>
        </div>

        {/* Advanced filters panel */}
        {showFilters && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{s.buildingPrefix}</label>
              <div className="flex gap-1">
                {(['all', ...buildings.map(b => b.id)]).map(b => (
                  <button
                    key={b}
                    onClick={() => setFilterBuilding(b)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      filterBuilding === b ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200'
                    }`}
                  >
                    {b === 'all' ? s.all : b}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{s.stageLabel}</label>
              <select
                value={filterStage}
                onChange={e => setFilterStage(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none"
              >
                <option value="">{s.allStages}</option>
                {sortedStages.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{s.priorityLabel}</label>
              <select
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none"
              >
                <option value="">{s.allPriorities}</option>
                <option value="urgent">{s.urgentPriority}</option>
                <option value="normal">{s.normalPriority}</option>
                <option value="low">{s.lowPriority}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{s.dueFrom}</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{s.dueTo}</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={filterOverdue} onChange={e => setFilterOverdue(e.target.checked)} className="rounded" />
              {s.overdueOnly}
            </label>
            {hasAdvancedFilters && (
              <button onClick={clearAdvancedFilters} className="text-xs text-gray-400 hover:text-gray-600 underline">
                Clear
              </button>
            )}
          </div>
        )}

        {/* Add task form */}
        {showAdd && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-blue-800">{s.newTask}</h3>
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
                    {contractors.filter(c => c.category === cat && c.active).map(c => {
                      const l = contractorLoad(contractorAssignments, c.id);
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name}{l.open ? ` · ${l.open}${l.overdue ? ` (${l.overdue} late)` : ''}` : ''}
                        </option>
                      );
                    })}
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
                {/* The Job Board has no buildings, so grouping by building left
                    the whole list empty there — every job hidden behind a
                    heading that never rendered. A workspace without buildings
                    gets a flat list. */}
                {buildings.length === 0
                  ? resApts.map(a => (
                    <option key={a.id} value={a.id}>{aptLabel(a)}</option>
                  ))
                  : buildings.map(bld => (
                    <optgroup key={bld.id} label={bld.name}>
                      {resApts.filter(a => a.buildingId === bld.id).map(a => (
                        <option key={a.id} value={a.id}>
                          {s.aptPrefix} {aptLabel(a)} ({s.floorPrefix} {a.floor})
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
              <select
                value={addForm.priority}
                onChange={e => setAddForm(f => ({ ...f, priority: e.target.value }))}
                className="border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
              >
                <option value="">{s.noPriorityLabel}</option>
                <option value="urgent">{s.urgentPriority}</option>
                <option value="normal">{s.normalPriority}</option>
                <option value="low">{s.lowPriority}</option>
              </select>
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

        {/* Calendar view */}
        {view === 'calendar' && (
          <TaskCalendar
            events={calendarEvents}
            todayLabel={s.today}
            printTitle={`${s.pageTasks} — ${projectName}`}
            rtl={!!s.isRtl}
          />
        )}

        {/* Task list */}
        {view === 'list' && (filtered.length === 0 ? (
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
                    <Tooltip text={a.completedAt ? s.markIncomplete : s.markComplete} side="right">
                      <button
                        onClick={() => updateContractorAssignment(a.id, { completedAt: a.completedAt ? null : new Date().toISOString() })}
                        className="mt-0.5 flex-shrink-0 p-1.5 -m-1.5 sm:p-0 sm:m-0"
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
                          {a.buildingId} · {s.aptPrefix} {aptLabel(apt)}
                        </span>
                        {stage && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: stage.color + '22', color: stage.color }}
                          >
                            {getStageName(stage, s.isRtl)}
                          </span>
                        )}
                        {a.priority && a.priority !== 'normal' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${PRIORITY_CONFIG[a.priority].cls}`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${PRIORITY_CONFIG[a.priority].dot}`} />
                            {PRIORITY_CONFIG[a.priority].label}
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
                          <span className="text-xs text-green-600">{s.doneSuffix} {format(new Date(a.completedAt), 'MMM d')}</span>
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
                      <Tooltip text={isEditing ? s.cancel : s.editTask}>
                        <button
                          onClick={() => isEditing ? setEditingId(null) : startEdit(a)}
                          className={`p-2.5 sm:p-1.5 rounded-lg transition-colors ${isEditing ? 'bg-[#1e3a5f]/10 text-[#1e3a5f]' : 'text-gray-400 hover:bg-gray-100'}`}
                        >
                          <Edit2 size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip text={s.deleteTask}>
                        <button
                          onClick={() => { if (confirm(s.deleteTaskConfirm)) { deleteContractorAssignment(a.id); onToast(s.taskDeleted); } }}
                          className="p-2.5 sm:p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600"
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
                        placeholder={s.taskDescriptionPlaceholder}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none bg-white"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={editFields.stageId}
                          onChange={e => setEditFields(f => ({ ...f, stageId: e.target.value }))}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                        >
                          <option value="">{s.notStartedOption}</option>
                          {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <input
                          type="date"
                          value={editFields.dueDate}
                          onChange={e => setEditFields(f => ({ ...f, dueDate: e.target.value }))}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                        />
                        <select
                          value={editFields.priority}
                          onChange={e => setEditFields(f => ({ ...f, priority: e.target.value }))}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                        >
                          <option value="">{s.noPriorityLabel}</option>
                          <option value="urgent">{s.urgentPriority}</option>
                          <option value="normal">{s.normalPriority}</option>
                          <option value="low">{s.lowPriority}</option>
                        </select>
                      </div>
                      {editAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {editAttachments.map(att => (
                            <div key={att.id} className="relative group">
                              {att.mimeType?.startsWith('image/') ? (
                                att.driveFileId ? (
                                  <img
                                    src={driveThumbUrl(att.driveFileId, 200)}
                                    alt={att.filename}
                                    className="h-12 w-12 object-cover rounded-lg border border-gray-200"
                                  />
                                ) : att.dataUrl ? (
                                  <img
                                    src={att.dataUrl}
                                    alt={att.filename}
                                    className="h-12 w-12 object-cover rounded-lg border border-gray-200"
                                  />
                                ) : null
                              ) : (
                                <div className="inline-flex items-center gap-1 px-2 py-1.5 bg-gray-100 rounded-lg text-xs text-gray-600 border border-gray-200">
                                  <Paperclip size={10} />
                                  <span className="truncate max-w-[100px]">{att.filename}</span>
                                </div>
                              )}
                              <button
                                onClick={() => setEditAttachments(prev => prev.filter(a => a.id !== att.id))}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-xs items-center justify-center hidden group-hover:flex leading-none"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {editUploadProgress !== null && (
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 transition-all duration-300 rounded-full" style={{ width: `${editUploadProgress}%` }} />
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => { editFileInputRef.current?.click(); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50 transition-colors"
                          title="Attach file"
                        >
                          <Paperclip size={13} />
                        </button>
                        <button
                          onClick={() => saveEdit(a.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-medium hover:bg-[#162d4a]"
                        >
                          <Save size={13} /> {s.save}
                        </button>
                        <button onClick={() => { setEditingId(null); setEditAttachments([]); }} className="text-xs text-gray-500 hover:text-gray-700">
                          {s.cancel}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
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
