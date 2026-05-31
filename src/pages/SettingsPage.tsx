import React, { useState, useRef } from 'react';
import { useStore } from '../data/store';
import { Plus, Trash2, Save, ChevronUp, ChevronDown, Shield, Sun, Moon, Copy, Check, Link2, Download, Upload, HardDrive } from 'lucide-react';
import { Stage, User, Contractor, ContractorCategory, ContractorAssignment } from '../types';
import { Toast } from '../components/ui/Toast';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';

type Tab = 'stages' | 'users' | 'contractors' | 'app';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#f43f5e', '#64748b', '#0f172a', '#b8860b', '#1e3a5f',
];

export function SettingsPage() {
  const { stages, users, updateStage, addStage, deleteStage, updateUser, addUser, lightTheme, setLightTheme } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('stages');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
  }

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  const TAB_LABELS: Record<Tab, string> = {
    stages: 'Stages',
    users: 'Users',
    contractors: 'Contractors',
    app: 'App',
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 flex-wrap">
        {(['stages', 'users', 'contractors', 'app'] as Tab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'stages' && (
        <StageSettings stages={sortedStages} updateStage={updateStage} addStage={addStage} deleteStage={deleteStage} onToast={showToast} />
      )}
      {activeTab === 'users' && (
        <UserSettings users={users} updateUser={updateUser} addUser={addUser} onToast={showToast} />
      )}
      {activeTab === 'contractors' && (
        <ContractorsTab onToast={showToast} />
      )}
      {activeTab === 'app' && (
        <AppSettingsTab lightTheme={lightTheme} setLightTheme={setLightTheme} onToast={showToast} />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Color picker with presets ────────────────────────────────────────────────
interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

function ColorPickerWithPresets({ value, onChange }: ColorPickerProps) {
  return (
    <div className="space-y-2">
      {/* Native picker + current swatch */}
      <div className="flex items-center gap-2">
        <div className="relative w-9 h-9 flex-shrink-0">
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-lg"
          />
          <div
            className="w-9 h-9 rounded-lg border-2 border-white shadow-md cursor-pointer ring-1 ring-gray-200"
            style={{ backgroundColor: value }}
            title="Click to open color picker"
          />
        </div>
        <input
          value={value}
          onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)}
          className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          maxLength={7}
          placeholder="#000000"
        />
      </div>
      {/* Preset swatches */}
      <div className="grid grid-cols-10 gap-1">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            title={c}
            className="w-6 h-6 rounded-md transition-transform hover:scale-110 focus:outline-none"
            style={{
              backgroundColor: c,
              border: value === c ? '2px solid white' : '1px solid rgba(0,0,0,0.1)',
              boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Stage settings ───────────────────────────────────────────────────────────
function StageSettings({ stages, updateStage, addStage, deleteStage, onToast }: {
  stages: Stage[];
  updateStage: (id: string, c: Partial<Stage>) => void;
  addStage: (s: Stage) => void;
  deleteStage: (id: string) => void;
  onToast: (msg: string) => void;
}) {
  const [edits, setEdits] = useState<Record<string, Partial<Stage>>>({});
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#6366f1');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function getEdit(id: string): Partial<Stage> { return edits[id] ?? {}; }
  function setEdit(id: string, changes: Partial<Stage>) {
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...changes } }));
  }

  function saveStage(stage: Stage) {
    updateStage(stage.id, edits[stage.id] ?? {});
    setEdits(prev => { const n = { ...prev }; delete n[stage.id]; return n; });
    onToast(`Stage "${stage.name}" saved`);
  }

  function moveStage(id: string, dir: -1 | 1) {
    const idx = stages.findIndex(s => s.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= stages.length) return;
    updateStage(stages[idx].id, { order: stages[swapIdx].order });
    updateStage(stages[swapIdx].id, { order: stages[idx].order });
  }

  function handleAddStage() {
    if (!newStageName.trim()) return;
    const maxOrder = stages.reduce((m, s) => Math.max(m, s.order), 0);
    addStage({
      id: 's' + Math.random().toString(36).substr(2, 6),
      name: newStageName.trim(),
      color: newStageColor,
      order: maxOrder + 1,
      active: true,
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setNewStageName('');
    onToast('Stage added');
  }

  return (
    <div>
      <div className="space-y-2 mb-6">
        {stages.map((stage, i) => {
          const edit = getEdit(stage.id);
          const name = edit.name ?? stage.name;
          const color = edit.color ?? stage.color;
          const active = edit.active ?? stage.active;
          const isExpanded = expandedId === stage.id;

          return (
            <div key={stage.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Row header */}
              <div className="flex items-center gap-3 p-3">
                {/* Order */}
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveStage(stage.id, -1)} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20">
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={() => moveStage(stage.id, 1)} disabled={i === stages.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20">
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Color swatch — click to expand picker */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : stage.id)}
                  className="w-8 h-8 rounded-lg border-2 border-white shadow-md flex-shrink-0 ring-1 ring-gray-200 hover:scale-105 transition-transform"
                  style={{ backgroundColor: color }}
                  title="Change color"
                />

                {/* Name */}
                <input
                  value={name}
                  onChange={e => setEdit(stage.id, { name: e.target.value })}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />

                {/* Active toggle */}
                <button
                  onClick={() => setEdit(stage.id, { active: !active })}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all whitespace-nowrap ${
                    active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'
                  }`}
                >
                  {active ? 'Active' : 'Hidden'}
                </button>

                <button onClick={() => saveStage(stage)} className="p-2 text-[#1e3a5f] hover:bg-[#1e3a5f]/5 rounded-lg">
                  <Save size={16} />
                </button>
                <button onClick={() => { if (confirm(`Delete "${stage.name}"?`)) deleteStage(stage.id); }}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Expanded color picker */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3 bg-gray-50">
                  <p className="text-xs font-medium text-gray-500 mb-2">Pick a color:</p>
                  <ColorPickerWithPresets
                    value={color}
                    onChange={c => setEdit(stage.id, { color: c })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add new stage */}
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add New Stage</h3>
        <div className="space-y-3">
          <div className="flex gap-3 items-start">
            <div>
              <ColorPickerWithPresets value={newStageColor} onChange={setNewStageColor} />
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <input
                value={newStageName}
                onChange={e => setNewStageName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddStage()}
                placeholder="Stage name..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
              />
              <button
                onClick={handleAddStage}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
              >
                <Plus size={16} />
                Add Stage
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── User settings ────────────────────────────────────────────────────────────
function UserSettings({ users, updateUser, addUser, onToast }: {
  users: User[];
  updateUser: (id: string, c: Partial<User>) => void;
  addUser: (u: User) => void;
  onToast: (msg: string) => void;
}) {
  const [newUser, setNewUser] = useState({ name: '', role: '', code: '' });

  return (
    <div>
      <div className="space-y-3 mb-6">
        {users.map(user => (
          <div key={user.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold flex-shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 grid grid-cols-3 gap-3">
              <input defaultValue={user.name} onBlur={e => updateUser(user.id, { name: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" placeholder="Name" />
              <input defaultValue={user.role} onBlur={e => updateUser(user.id, { role: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" placeholder="Role" />
              <input defaultValue={user.code} onBlur={e => updateUser(user.id, { code: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" placeholder="6-digit code" maxLength={6} />
            </div>
            <button onClick={() => updateUser(user.id, { active: !user.active })}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all flex-shrink-0 ${
                user.active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'
              }`}>
              {user.active ? 'Active' : 'Inactive'}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add New User</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <input value={newUser.name} onChange={e => setNewUser(n => ({ ...n, name: e.target.value }))}
            placeholder="Name *" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
          <input value={newUser.role} onChange={e => setNewUser(n => ({ ...n, role: e.target.value }))}
            placeholder="Role" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
          <input value={newUser.code} onChange={e => setNewUser(n => ({ ...n, code: e.target.value.replace(/\D/g, '') }))}
            placeholder="6-digit code *" maxLength={6}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
        </div>
        <button
          onClick={() => {
            if (!newUser.name.trim() || !newUser.code.trim()) return;
            addUser({ id: 'u' + Math.random().toString(36).substr(2, 6), name: newUser.name.trim(), role: newUser.role.trim() || 'User', code: newUser.code.trim(), active: true, createdAt: new Date().toISOString() });
            setNewUser({ name: '', role: '', code: '' });
            onToast('User added');
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
        >
          <Plus size={16} />
          Add User
        </button>
      </div>
    </div>
  );
}

// ─── Contractors settings ────────────────────────────────────────────────────
const CAT_COLORS: Record<ContractorCategory, string> = { drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981' };
const CAT_LABELS: Record<ContractorCategory, string> = { drywall: 'Drywall', ac: 'AC / HVAC', general: 'General' };

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-[#4aa8d8] hover:text-[#4aa8d8] transition-all">
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}

function ContractorsTab({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const {
    contractors, contractorAssignments, apartments, stages,
    addContractor, updateContractor, deleteContractor,
    addContractorAssignment, deleteContractorAssignment,
  } = useStore();

  const [form, setForm] = useState({ name: '', email: '', category: 'ac' as ContractorCategory });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assForm, setAssForm] = useState<Record<string, { aptId: string; task: string; dueDate: string; stageId: string }>>({});

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);
  const grouped = (['drywall', 'ac', 'general'] as ContractorCategory[]).map(cat => ({
    cat,
    items: contractors.filter(c => c.category === cat),
  }));

  function handleAdd() {
    if (!form.name.trim()) return;
    addContractor({ name: form.name.trim(), email: form.email.trim(), category: form.category, active: true });
    setForm({ name: '', email: '', category: 'ac' });
    onToast('Contractor added');
  }

  function handleAddAssignment(contractorId: string, buildingApts: typeof apartments) {
    const f = assForm[contractorId];
    if (!f?.aptId || !f?.task?.trim()) return;
    const apt = buildingApts.find(a => a.id === f.aptId);
    if (!apt) return;
    addContractorAssignment({
      contractorId,
      apartmentId: f.aptId,
      buildingId: apt.buildingId,
      taskDescription: f.task.trim(),
      dueDate: f.dueDate || null,
      stageId: f.stageId || null,
      completedAt: null,
      createdBy: '',
      createdByName: 'Office',
    });
    setAssForm(prev => ({ ...prev, [contractorId]: { aptId: '', task: '', dueDate: '', stageId: '' } }));
    onToast('Assignment added');
  }

  const portalBase = `${window.location.origin}/c/`;

  return (
    <div className="space-y-6">
      {grouped.map(({ cat, items }) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CAT_COLORS[cat] }} />
            <h2 className="font-semibold text-gray-800">{CAT_LABELS[cat]}</h2>
            <span className="text-xs text-gray-400">{items.length} contractor{items.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="space-y-3">
            {items.map(c => {
              const cAssignments = contractorAssignments.filter(a => a.contractorId === c.id);
              const isExpanded = expandedId === c.id;
              const af = assForm[c.id] ?? { aptId: '', task: '', dueDate: '', stageId: '' };
              const resApts = apartments.filter(a => !a.isUnnamed && a.floor > 0).sort((a, b) => a.buildingId.localeCompare(b.buildingId) || (Number(a.apartmentNumber) - Number(b.apartmentNumber)));

              return (
                <div key={c.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Contractor row */}
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                      style={{ backgroundColor: CAT_COLORS[cat] }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{c.name}</span>
                        {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500">{cAssignments.length} assignment{cAssignments.length !== 1 ? 's' : ''} · {cAssignments.filter(a => a.completedAt).length} done</span>
                        <CopyButton text={portalBase + c.token} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => updateContractor(c.id, { active: !c.active })}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${c.active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                        {c.active ? 'Active' : 'Off'}
                      </button>
                      <button onClick={() => setExpandedId(isExpanded ? null : c.id)} className="p-1.5 rounded-lg hover:bg-gray-50">
                        {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                      </button>
                      <button onClick={() => { if (confirm(`Delete "${c.name}"?`)) { deleteContractor(c.id); onToast('Deleted'); } }}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded: assignments */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4 bg-gray-50">
                      {/* Portal link */}
                      <div className="flex items-center gap-2 mb-4 p-3 bg-white rounded-lg border border-gray-200">
                        <Link2 size={14} className="text-[#4aa8d8] flex-shrink-0" />
                        <span className="text-xs text-gray-500 truncate flex-1">{portalBase + c.token}</span>
                        <CopyButton text={portalBase + c.token} />
                      </div>

                      {/* Assignment list */}
                      {cAssignments.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {cAssignments.map(a => {
                            const apt = apartments.find(ap => ap.id === a.apartmentId);
                            const stage = stages.find(s => s.id === a.stageId);
                            return (
                              <div key={a.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.completedAt ? 'bg-green-400' : 'bg-amber-400'}`} />
                                <span className="font-medium text-gray-800">{a.buildingId} · Apt {apt?.displayName || apt?.apartmentNumber}</span>
                                {stage && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: stage.color + '22', color: stage.color }}>{stage.name}</span>}
                                <span className="flex-1 text-gray-500 truncate text-xs">{a.taskDescription}</span>
                                {a.dueDate && <span className="text-xs text-gray-400">{format(new Date(a.dueDate), 'MMM d')}</span>}
                                <button onClick={() => { if (confirm('Remove this assignment?')) deleteContractorAssignment(a.id); }}
                                  className="text-red-400 hover:text-red-600 flex-shrink-0">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add assignment form */}
                      <div className="bg-white rounded-lg border border-dashed border-gray-300 p-3">
                        <h4 className="text-xs font-semibold text-gray-600 mb-2">Add Assignment</h4>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <select
                            value={af.aptId}
                            onChange={e => setAssForm(p => ({ ...p, [c.id]: { ...af, aptId: e.target.value } }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 col-span-2"
                          >
                            <option value="">Select apartment…</option>
                            {['A1', 'A2', 'A3'].map(bid => (
                              <optgroup key={bid} label={`Building ${bid}`}>
                                {resApts.filter(a => a.buildingId === bid).map(a => (
                                  <option key={a.id} value={a.id}>Apt {a.displayName || a.apartmentNumber} (Floor {a.floor})</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <select
                            value={af.stageId}
                            onChange={e => setAssForm(p => ({ ...p, [c.id]: { ...af, stageId: e.target.value } }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                          >
                            <option value="">Stage (optional)</option>
                            {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <input
                            type="date"
                            value={af.dueDate}
                            onChange={e => setAssForm(p => ({ ...p, [c.id]: { ...af, dueDate: e.target.value } }))}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                          />
                        </div>
                        <textarea
                          value={af.task}
                          onChange={e => setAssForm(p => ({ ...p, [c.id]: { ...af, task: e.target.value } }))}
                          rows={2}
                          placeholder="Task description…"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none mb-2"
                        />
                        <button
                          onClick={() => handleAddAssignment(c.id, apartments)}
                          disabled={!af.aptId || !af.task?.trim()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-medium disabled:opacity-40"
                        >
                          <Plus size={14} /> Add Assignment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Add contractor form */}
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add New Contractor</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Full name *"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
          <input
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email address"
            type="email"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value as ContractorCategory }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          >
            <option value="ac">AC / HVAC</option>
            <option value="drywall">Drywall</option>
            <option value="general">General</option>
          </select>
        </div>
        <button
          onClick={handleAdd}
          disabled={!form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] disabled:opacity-40 transition-colors"
        >
          <Plus size={16} /> Add Contractor
        </button>
      </div>
    </div>
  );
}

// ─── App settings ─────────────────────────────────────────────────────────────
function AppSettingsTab({ lightTheme, setLightTheme, onToast }: {
  lightTheme: boolean;
  setLightTheme: (v: boolean) => void;
  onToast: (msg: string) => void;
}) {
  const { users } = useStore();

  return (
    <div className="space-y-5">
      {/* Theme */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          {lightTheme ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-blue-500" />}
          Display Theme
        </h2>
        <div className="flex gap-3">
          <button
            onClick={() => { setLightTheme(false); onToast('Dark theme applied'); }}
            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              !lightTheme ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="w-16 h-10 rounded-lg bg-[#1e3a5f] flex items-center gap-1 px-2">
              <div className="w-2 h-6 rounded bg-[#162d4a]" />
              <div className="flex-1 h-6 rounded bg-[#162d4a]/50" />
            </div>
            <div className="flex items-center gap-1.5">
              <Moon size={14} className="text-[#4aa8d8]" />
              <span className="text-sm font-medium text-gray-700">Dark</span>
            </div>
            {!lightTheme && <span className="text-xs text-[#1e3a5f] font-semibold">Active</span>}
          </button>

          <button
            onClick={() => { setLightTheme(true); onToast('Light theme applied'); }}
            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
              lightTheme ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="w-16 h-10 rounded-lg bg-white border border-gray-200 flex items-center gap-1 px-2">
              <div className="w-2 h-6 rounded bg-gray-100 border border-gray-200" />
              <div className="flex-1 h-6 rounded bg-gray-50" />
            </div>
            <div className="flex items-center gap-1.5">
              <Sun size={14} className="text-amber-500" />
              <span className="text-sm font-medium text-gray-700">Light</span>
            </div>
            {lightTheme && <span className="text-xs text-[#1e3a5f] font-semibold">Active</span>}
          </button>
        </div>
      </div>

      {/* Access codes */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-[#1e3a5f]" />
          <h2 className="font-semibold text-gray-800">Access Codes</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Edit codes in the Users tab. Changes take effect on next login.</p>
        <div className="space-y-2">
          {users.filter(u => u.active).map(u => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold text-sm">
                  {u.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-800">{u.name}</div>
                  <div className="text-xs text-gray-400">{u.role}</div>
                </div>
              </div>
              <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">{u.code}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Backup & Restore */}
      <BackupRestoreSection onToast={onToast} />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="font-semibold text-amber-800 mb-2 text-sm">Data Storage</h3>
        <p className="text-sm text-amber-700">
          Data is stored in localStorage and synced to Firebase if configured.
          See <code className="font-mono bg-amber-100 px-1 rounded">.env.example</code> for Firebase setup.
        </p>
      </div>
    </div>
  );
}

function BackupRestoreSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { exportData, importData } = useStore();
  const importRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, `wolfson-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`);
    onToast('Backup downloaded');
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const json = ev.target?.result as string;
      const result = importData(json);
      if (result.ok) {
        onToast('Backup restored successfully');
      } else {
        onToast(result.error ?? 'Import failed', 'error');
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <HardDrive size={18} className="text-[#1e3a5f]" />
        <h2 className="font-semibold text-gray-800">Backup &amp; Restore</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Export all data (apartments, stages, notes, contractors, photos) to a JSON file.
        Import it later to fully restore the system — including all contractor photos stored as compressed images.
      </p>
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
        >
          <Download size={16} />
          Export Backup
        </button>
        <button
          onClick={() => importRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <Upload size={16} />
          Import Backup
        </button>
        <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
      </div>
    </div>
  );
}
