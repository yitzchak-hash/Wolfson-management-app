import React, { useState, useRef } from 'react';
import { useStore } from '../data/store';
import {
  Plus, Trash2, Save, ChevronUp, ChevronDown, Shield, Sun, Moon,
  Copy, Check, Download, Upload, HardDrive, X, HardDriveDownload, ToggleLeft, ToggleRight,
  Languages, Clock, RotateCcw, Wifi, WifiOff, Loader, Database,
} from 'lucide-react';
import { isFirebaseConfigured, db, fsSet, fsGetAll, isStorageConfigured } from '../data/firebase';
import { Stage, User, Contractor, ContractorCategory, ContractorUiStrings, DEFAULT_CONTRACTOR_UI_STRINGS, HEBREW_CONTRACTOR_UI_STRINGS, BackupFrequency } from '../types';
import { Tooltip } from '../components/ui/Tooltip';
import { Toast } from '../components/ui/Toast';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';
import { extractFolderId, isUploadBackendConfigured } from '../data/driveApi';

type Tab = 'stages' | 'users' | 'contractors' | 'app' | 'language';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#f43f5e', '#64748b', '#0f172a', '#b8860b', '#1e3a5f',
];

const CAT_COLORS: Record<ContractorCategory, string> = { drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981' };
const CAT_LABELS: Record<ContractorCategory, string> = { drywall: 'Drywall', ac: 'AC', general: 'General' };

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
    language: 'Language',
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 flex-wrap">
        {(['stages', 'users', 'contractors', 'app', 'language'] as Tab[]).map(tab => (
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
      {activeTab === 'language' && (
        <LanguageTab onToast={showToast} />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Color picker with presets ────────────────────────────────────────────────
interface ColorPickerProps { value: string; onChange: (color: string) => void; }

function ColorPickerWithPresets({ value, onChange }: ColorPickerProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative w-9 h-9 flex-shrink-0">
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-lg" />
          <div className="w-9 h-9 rounded-lg border-2 border-white shadow-md cursor-pointer ring-1 ring-gray-200"
            style={{ backgroundColor: value }} title="Click to open color picker" />
        </div>
        <input value={value}
          onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && onChange(e.target.value)}
          className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          maxLength={7} placeholder="#000000" />
      </div>
      <div className="grid grid-cols-10 gap-1">
        {PRESET_COLORS.map(c => (
          <button key={c} onClick={() => onChange(c)} title={c}
            className="w-6 h-6 rounded-md transition-transform hover:scale-110 focus:outline-none"
            style={{
              backgroundColor: c,
              border: value === c ? '2px solid white' : '1px solid rgba(0,0,0,0.1)',
              boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
            }} />
        ))}
      </div>
    </div>
  );
}

// ─── Stage settings ───────────────────────────────────────────────────────────
function StageSettings({ stages, updateStage, addStage, deleteStage, onToast }: {
  stages: Stage[]; updateStage: (id: string, c: Partial<Stage>) => void;
  addStage: (s: Stage) => void; deleteStage: (id: string) => void; onToast: (msg: string) => void;
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
      name: newStageName.trim(), color: newStageColor,
      order: maxOrder + 1, active: true, description: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
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
              <div className="flex items-center gap-3 p-3">
                <div className="flex flex-col gap-0.5">
                  <Tooltip text="Move up" side="left">
                    <button onClick={() => moveStage(stage.id, -1)} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={14} /></button>
                  </Tooltip>
                  <Tooltip text="Move down" side="left">
                    <button onClick={() => moveStage(stage.id, 1)} disabled={i === stages.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={14} /></button>
                  </Tooltip>
                </div>
                <Tooltip text="Change color">
                  <button onClick={() => setExpandedId(isExpanded ? null : stage.id)}
                    className="w-8 h-8 rounded-lg border-2 border-white shadow-md flex-shrink-0 ring-1 ring-gray-200 hover:scale-105 transition-transform"
                    style={{ backgroundColor: color }} />
                </Tooltip>
                <input value={name} onChange={e => setEdit(stage.id, { name: e.target.value })}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
                <Tooltip text={active ? 'Click to hide stage' : 'Click to activate stage'}>
                  <button onClick={() => setEdit(stage.id, { active: !active })}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all whitespace-nowrap ${active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                    {active ? 'Active' : 'Hidden'}
                  </button>
                </Tooltip>
                <Tooltip text="Save changes">
                  <button onClick={() => saveStage(stage)} className="p-2 text-[#1e3a5f] hover:bg-[#1e3a5f]/5 rounded-lg"><Save size={16} /></button>
                </Tooltip>
                <Tooltip text="Delete stage">
                  <button onClick={() => { if (confirm(`Delete "${stage.name}"?`)) deleteStage(stage.id); }}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                </Tooltip>
              </div>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3 bg-gray-50">
                  <p className="text-xs font-medium text-gray-500 mb-2">Pick a color:</p>
                  <ColorPickerWithPresets value={color} onChange={c => setEdit(stage.id, { color: c })} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add New Stage</h3>
        <div className="flex gap-3 items-start">
          <ColorPickerWithPresets value={newStageColor} onChange={setNewStageColor} />
          <div className="flex-1 flex flex-col gap-2">
            <input value={newStageName} onChange={e => setNewStageName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddStage()}
              placeholder="Stage name..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
            <button onClick={handleAddStage}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors">
              <Plus size={16} /> Add Stage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── User settings ────────────────────────────────────────────────────────────
function UserSettings({ users, updateUser, addUser, onToast }: {
  users: User[]; updateUser: (id: string, c: Partial<User>) => void;
  addUser: (u: User) => void; onToast: (msg: string) => void;
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
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all flex-shrink-0 ${user.active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
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
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors">
          <Plus size={16} /> Add User
        </button>
      </div>
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────
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

// ─── Contractors tab (add/manage contractor records only) ─────────────────────
function ContractorsTab({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { contractors, addContractor, updateContractor, deleteContractor } = useStore();
  const [form, setForm] = useState({ name: '', email: '', category: 'ac' as ContractorCategory });

  const portalBase = `${window.location.origin}/c/`;
  const grouped = (['drywall', 'ac', 'general'] as ContractorCategory[]).map(cat => ({
    cat, items: contractors.filter(c => c.category === cat),
  }));

  function handleAdd() {
    if (!form.name.trim()) return;
    addContractor({ name: form.name.trim(), email: form.email.trim(), category: form.category, active: true });
    setForm({ name: '', email: '', category: 'ac' });
    onToast('Contractor added');
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ cat, items }) => (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CAT_COLORS[cat] }} />
            <h2 className="font-semibold text-gray-800">{CAT_LABELS[cat]}</h2>
            <span className="text-xs text-gray-400">{items.length}</span>
          </div>

          {items.length === 0 && (
            <p className="text-sm text-gray-400 italic mb-3">No contractors in this category.</p>
          )}

          <div className="space-y-2">
            {items.map(c => (
              <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                  style={{ backgroundColor: CAT_COLORS[cat] }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{c.name}</div>
                  {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400 font-mono truncate max-w-[160px]">/c/{c.token}</span>
                    <CopyButton text={portalBase + c.token} />
                  </div>
                </div>
                <Tooltip text={c.active ? 'Click to deactivate' : 'Click to activate'}>
                  <button onClick={() => updateContractor(c.id, { active: !c.active })}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium flex-shrink-0 ${c.active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                    {c.active ? 'Active' : 'Off'}
                  </button>
                </Tooltip>
                <Tooltip text="Delete contractor">
                  <button onClick={() => { if (confirm(`Delete "${c.name}"?`)) { deleteContractor(c.id); onToast('Deleted'); } }}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 flex-shrink-0">
                    <Trash2 size={15} />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add New Contractor</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Full name *"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
          <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email address" type="email"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ContractorCategory }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30">
            <option value="ac">AC</option>
            <option value="drywall">Drywall</option>
            <option value="general">General</option>
          </select>
        </div>
        <button onClick={handleAdd} disabled={!form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] disabled:opacity-40 transition-colors">
          <Plus size={16} /> Add Contractor
        </button>
      </div>
    </div>
  );
}

// ─── Firebase status tester ───────────────────────────────────────────────────
const FIREBASE_ENV_VARS = [
  { key: 'VITE_FIREBASE_API_KEY',             label: 'API Key' },
  { key: 'VITE_FIREBASE_AUTH_DOMAIN',         label: 'Auth Domain' },
  { key: 'VITE_FIREBASE_PROJECT_ID',         label: 'Project ID' },
  { key: 'VITE_FIREBASE_STORAGE_BUCKET',     label: 'Storage Bucket' },
  { key: 'VITE_FIREBASE_MESSAGING_SENDER_ID',label: 'Messaging Sender ID' },
  { key: 'VITE_FIREBASE_APP_ID',             label: 'App ID' },
] as const;

type StepState = 'pending' | 'running' | 'ok' | 'fail';
interface TestStep { id: string; label: string; detail: string; state: StepState }

const INITIAL_STEPS: TestStep[] = [
  { id: 'env',     label: 'Environment variables', detail: '', state: 'pending' },
  { id: 'sdk',     label: 'SDK initialization',    detail: '', state: 'pending' },
  { id: 'write',   label: 'Firestore write',        detail: '', state: 'pending' },
  { id: 'read',    label: 'Firestore read',         detail: '', state: 'pending' },
  { id: 'storage', label: 'Firebase Storage',       detail: '', state: 'pending' },
];

function StepRow({ step }: { step: TestStep }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 flex-shrink-0">
        {step.state === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
        {step.state === 'running' && <Loader size={16} className="text-[#4aa8d8] animate-spin" />}
        {step.state === 'ok'      && <Check  size={16} className="text-green-500" />}
        {step.state === 'fail'    && <X      size={16} className="text-red-500" />}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-medium leading-tight ${
          step.state === 'pending' ? 'text-gray-400' :
          step.state === 'ok'     ? 'text-green-700' :
          step.state === 'fail'   ? 'text-red-600'   : 'text-gray-700'
        }`}>{step.label}</p>
        {step.detail && (
          <p className={`text-xs mt-0.5 ${step.state === 'fail' ? 'text-red-500' : 'text-gray-500'}`}>
            {step.detail}
          </p>
        )}
      </div>
    </div>
  );
}

function FirebaseStatusSection() {
  const { forcePushToFirestore, apartments, stages, contractors } = useStore();
  const [pushing, setPushing]   = useState(false);
  const [pushDone, setPushDone] = useState<'ok' | 'error' | null>(null);

  async function handleForcePush() {
    setPushing(true);
    setPushDone(null);
    try {
      await forcePushToFirestore();
      setPushDone('ok');
    } catch {
      setPushDone('error');
    } finally {
      setPushing(false);
    }
  }

  const envValues: Record<string, string | undefined> = {
    VITE_FIREBASE_API_KEY:             import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN:         import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID:          import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET:      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID:              import.meta.env.VITE_FIREBASE_APP_ID,
  };

  const [steps, setSteps]     = useState<TestStep[]>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);
  const [done, setDone]       = useState(false);

  function patch(id: string, updates: Partial<TestStep>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }

  async function runTest() {
    setSteps(INITIAL_STEPS);
    setRunning(true);
    setDone(false);

    // Step 1 — env vars
    patch('env', { state: 'running' });
    await new Promise(r => setTimeout(r, 300));
    const missing = FIREBASE_ENV_VARS.filter(v => !envValues[v.key]);
    if (missing.length > 0) {
      patch('env', { state: 'fail', detail: `Missing: ${missing.map(v => v.label).join(', ')}` });
      setRunning(false); setDone(true); return;
    }
    patch('env', { state: 'ok', detail: 'All 6 variables present' });

    // Step 2 — SDK init
    patch('sdk', { state: 'running' });
    await new Promise(r => setTimeout(r, 200));
    if (!db) {
      patch('sdk', { state: 'fail', detail: 'SDK failed to initialize — values may be wrong or mismatched' });
      setRunning(false); setDone(true); return;
    }
    patch('sdk', { state: 'ok', detail: `Project: ${envValues.VITE_FIREBASE_PROJECT_ID}` });

    // Step 3 — Firestore write
    patch('write', { state: 'running' });
    try {
      await fsSet('_healthcheck', '_test_', { ts: Date.now() });
      patch('write', { state: 'ok', detail: 'Document written to _healthcheck collection' });
    } catch (e: unknown) {
      patch('write', { state: 'fail', detail: e instanceof Error ? e.message : String(e) });
      setRunning(false); setDone(true); return;
    }

    // Step 4 — Firestore read
    patch('read', { state: 'running' });
    try {
      const docs = await fsGetAll('_healthcheck');
      const found = docs.some(d => (d as { id?: string }).id === '_test_');
      if (!found) {
        patch('read', { state: 'fail', detail: 'Document not returned — check Firestore security rules (allow read, write: if true)' });
        setRunning(false); setDone(true); return;
      }
      patch('read', { state: 'ok', detail: `Read back ${docs.length} document${docs.length !== 1 ? 's' : ''}` });
    } catch (e: unknown) {
      patch('read', { state: 'fail', detail: e instanceof Error ? e.message : String(e) });
      setRunning(false); setDone(true); return;
    }

    // Step 5 — Storage
    patch('storage', { state: 'running' });
    await new Promise(r => setTimeout(r, 200));
    if (isStorageConfigured) {
      patch('storage', { state: 'ok', detail: `Bucket: ${envValues.VITE_FIREBASE_STORAGE_BUCKET}` });
    } else {
      patch('storage', { state: 'fail', detail: 'Storage not initialized — storageBucket may be wrong' });
    }

    setRunning(false);
    setDone(true);
  }

  const allOk  = done && steps.every(s => s.state === 'ok');
  const anyFail = done && steps.some(s => s.state === 'fail');
  const missingCount = FIREBASE_ENV_VARS.filter(v => !envValues[v.key]).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-[#1e3a5f]" />
          <h2 className="font-semibold text-gray-800">Firebase Connection</h2>
        </div>
        {missingCount > 0 && !running && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            {missingCount} var{missingCount > 1 ? 's' : ''} missing
          </span>
        )}
        {allOk && (
          <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex items-center gap-1">
            <Wifi size={11} /> All systems go
          </span>
        )}
        {anyFail && (
          <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 flex items-center gap-1">
            <WifiOff size={11} /> Connection issue
          </span>
        )}
      </div>

      <p className="text-xs text-gray-400 mb-4">Tests each service one by one — runs a live read/write to confirm Firestore works.</p>

      {/* Step list */}
      <div className="divide-y divide-gray-100 mb-4 rounded-lg border border-gray-100 overflow-hidden">
        {steps.map(step => (
          <div key={step.id} className={`px-3 transition-colors ${
            step.state === 'ok'   ? 'bg-green-50/60' :
            step.state === 'fail' ? 'bg-red-50/60'   :
            step.state === 'running' ? 'bg-blue-50/40' : 'bg-white'
          }`}>
            <StepRow step={step} />
          </div>
        ))}
      </div>

      <button
        onClick={runTest}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] disabled:opacity-50 transition-colors"
      >
        {running ? <Loader size={15} className="animate-spin" /> : <Wifi size={15} />}
        {running ? 'Running tests…' : done ? 'Run Again' : 'Run Connection Test'}
      </button>

      {missingCount > 0 && (
        <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Fix missing variables in Vercel → Project → Settings → Environment Variables, then redeploy.
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-2">
          If cloud data looks out of date, push your current local state to overwrite it.
          ({apartments.length} apartments · {stages.length} stages · {contractors.length} contractors)
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleForcePush}
            disabled={pushing || !isFirebaseConfigured || !db}
            className="flex items-center gap-2 px-4 py-2 border border-[#1e3a5f] text-[#1e3a5f] rounded-lg text-sm font-medium hover:bg-[#1e3a5f]/5 disabled:opacity-40 transition-colors"
          >
            {pushing ? <Loader size={15} className="animate-spin" /> : <Database size={15} />}
            {pushing ? 'Uploading…' : 'Force Push Local → Cloud'}
          </button>
          {pushDone === 'ok'    && <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Pushed successfully</span>}
          {pushDone === 'error' && <span className="text-xs text-red-500 flex items-center gap-1"><X size={12} /> Push failed — check console</span>}
        </div>
      </div>
    </div>
  );
}

// ─── App settings ─────────────────────────────────────────────────────────────
function AppSettingsTab({ lightTheme, setLightTheme, onToast }: {
  lightTheme: boolean; setLightTheme: (v: boolean) => void; onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const { users } = useStore();

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          {lightTheme ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} className="text-blue-500" />}
          Display Theme
        </h2>
        <div className="flex gap-3">
          <button onClick={() => { setLightTheme(false); onToast('Dark theme applied'); }}
            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${!lightTheme ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className="w-16 h-10 rounded-lg bg-[#1e3a5f] flex items-center gap-1 px-2">
              <div className="w-2 h-6 rounded bg-[#162d4a]" />
              <div className="flex-1 h-6 rounded bg-[#162d4a]/50" />
            </div>
            <div className="flex items-center gap-1.5"><Moon size={14} className="text-[#4aa8d8]" /><span className="text-sm font-medium text-gray-700">Dark</span></div>
            {!lightTheme && <span className="text-xs text-[#1e3a5f] font-semibold">Active</span>}
          </button>
          <button onClick={() => { setLightTheme(true); onToast('Light theme applied'); }}
            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${lightTheme ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-gray-200 hover:border-gray-300'}`}>
            <div className="w-16 h-10 rounded-lg bg-white border border-gray-200 flex items-center gap-1 px-2">
              <div className="w-2 h-6 rounded bg-gray-100 border border-gray-200" />
              <div className="flex-1 h-6 rounded bg-gray-50" />
            </div>
            <div className="flex items-center gap-1.5"><Sun size={14} className="text-amber-500" /><span className="text-sm font-medium text-gray-700">Light</span></div>
            {lightTheme && <span className="text-xs text-[#1e3a5f] font-semibold">Active</span>}
          </button>
        </div>
      </div>

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
                <div className="w-7 h-7 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold text-sm">{u.name.charAt(0)}</div>
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

      <BackupRestoreSection onToast={onToast} />

      <FirebaseStatusSection />
    </div>
  );
}

function BackupRestoreSection({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const {
    exportData, importData, getDataSummary,
    autoBackup, setAutoBackup, backupSnapshots,
    backupDriveFolderLink, setBackupDriveFolder,
    backupFrequency, setBackupFrequency, backupLogs, addBackupLog,
  } = useStore();
  const importRef = useRef<HTMLInputElement>(null);
  const [exportModal, setExportModal] = useState<ReturnType<typeof getDataSummary> & { sizeKB: number; driveUploaded?: boolean } | null>(null);
  const [importModal, setImportModal] = useState<ReturnType<typeof getDataSummary> | null>(null);
  const [driveFolderDraft, setDriveFolderDraft] = useState(backupDriveFolderLink);

  const apiKey = import.meta.env.VITE_DRIVE_API_KEY ?? '';

  async function handleExport() {
    const json = exportData();
    const sizeKB = Math.round(json.length / 1024);
    const filename = `wolfson-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, filename);

    let driveUploaded = false;
    if (backupDriveFolderLink && isUploadBackendConfigured()) {
      try {
        const parentId = extractFolderId(backupDriveFolderLink);
        if (parentId) {
          const folderRes = await fetch('/api/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ parentId, name: 'Backups' }),
          });
          if (folderRes.ok) {
            const { folderId } = await folderRes.json();
            const data = btoa(unescape(encodeURIComponent(json)));
            const uploadRes = await fetch('/api/drive-upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
              body: JSON.stringify({ folderId, filename, mimeType: 'application/json', data }),
            });
            if (uploadRes.ok) driveUploaded = true;
          }
        }
      } catch {
        // Drive upload failure is non-fatal
      }
    }

    addBackupLog({ filename, sizeKB, driveUploaded, triggeredBy: 'manual' });
    setExportModal({ ...getDataSummary(), sizeKB, driveUploaded });
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const json = ev.target?.result as string;
      const result = importData(json);
      if (result.ok) {
        setImportModal(result.summary ?? null);
        onToast('Backup restored successfully');
      } else {
        onToast(result.error ?? 'Import failed', 'error');
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
  }

  const SummaryRow = ({ label, value }: { label: string; value: number | string }) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      {/* Export summary modal */}
      {exportModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Download size={16} className="text-[#1e3a5f]" /> Export Summary
              </h3>
              <button onClick={() => setExportModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 mb-4">
              <SummaryRow label="Apartments" value={exportModal.apartments} />
              <SummaryRow label="Active stages" value={exportModal.stages} />
              <SummaryRow label="Active contractors" value={exportModal.contractors} />
              <SummaryRow label="Tasks" value={exportModal.tasks} />
              <SummaryRow label="Completed tasks" value={exportModal.completedTasks} />
              <SummaryRow label="Photos & files" value={exportModal.photos} />
              <SummaryRow label="Notes" value={exportModal.notes} />
              <SummaryRow label="Activity entries" value={exportModal.activityLogs} />
              <div className="pt-2 border-t border-gray-100">
                <SummaryRow label="File size" value={`${exportModal.sizeKB} KB`} />
              </div>
            </div>
            {exportModal.driveUploaded && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-xs text-blue-700 mb-3">
                <HardDriveDownload size={13} className="flex-shrink-0" />
                Also uploaded to Google Drive backup folder.
              </div>
            )}
            <p className="text-xs text-gray-400 text-center">
              Exported {format(new Date(), 'MMM d, yyyy · HH:mm')}
            </p>
            <button onClick={() => setExportModal(null)}
              className="mt-4 w-full py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Import summary modal */}
      {importModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Upload size={16} className="text-green-600" /> Import Successful
              </h3>
              <button onClick={() => setImportModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2 mb-4">
              <SummaryRow label="Apartments restored" value={importModal.apartments} />
              <SummaryRow label="Stages" value={importModal.stages} />
              <SummaryRow label="Contractors" value={importModal.contractors} />
              <SummaryRow label="Tasks" value={importModal.tasks} />
              <SummaryRow label="Completed tasks" value={importModal.completedTasks} />
              <SummaryRow label="Photos & files" value={importModal.photos} />
              <SummaryRow label="Notes" value={importModal.notes} />
              <SummaryRow label="Activity entries" value={importModal.activityLogs} />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg text-xs text-green-700 mb-4">
              <Check size={13} className="flex-shrink-0" />
              All data has been fully restored. This replaced the previous state.
            </div>
            <button onClick={() => setImportModal(null)}
              className="w-full py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <HardDrive size={18} className="text-[#1e3a5f]" />
        <h2 className="font-semibold text-gray-800">Backup &amp; Restore</h2>
      </div>

      {/* Auto-backup frequency */}
      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Clock size={14} className="text-[#1e3a5f]" />
              Auto-backup
            </p>
            {autoBackup ? (() => {
              const lastAuto = [...backupLogs].reverse().find(e => e.triggeredBy !== 'manual');
              const lastAny  = [...backupLogs].reverse()[0];
              const last     = lastAuto ?? lastAny;
              return (
                <p className="text-xs text-gray-500 mt-0.5">
                  {last
                    ? <>Last backup: <span className="font-medium text-gray-700">{format(new Date(last.createdAt), 'MMM d · HH:mm')}</span>
                      {last.driveUploaded && <span className="ml-1 text-[#4aa8d8]">· Drive ✓</span>}
                    </>
                    : 'No backups yet — will run on next activity.'}
                  {backupSnapshots.length > 0 && <span className="ml-1 text-gray-400">({backupSnapshots.length} snapshot{backupSnapshots.length !== 1 ? 's' : ''} stored)</span>}
                </p>
              );
            })() : (
              <p className="text-xs text-gray-500 mt-0.5">Saves a snapshot for Activity History restore.</p>
            )}
          </div>
          <button
            onClick={() => setAutoBackup(!autoBackup)}
            className="flex-shrink-0 ml-3"
          >
            {autoBackup
              ? <ToggleRight size={28} className="text-[#1e3a5f]" />
              : <ToggleLeft size={28} className="text-gray-400" />
            }
          </button>
        </div>
        {autoBackup && (
          <div className="flex gap-1 flex-wrap mt-2">
            {(['activity', 'daily', 'weekly', 'monthly'] as BackupFrequency[]).map(f => (
              <button
                key={f}
                onClick={() => setBackupFrequency(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                  (backupFrequency ?? 'activity') === f
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1e3a5f]/40'
                }`}
              >
                {f === 'activity' ? 'Every Activity' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Drive backup folder */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
          <HardDriveDownload size={14} className="text-[#4aa8d8]" />
          Google Drive Backup Folder
        </p>
        <p className="text-xs text-gray-500 mb-2">When set, exports are also saved to a "Backups" subfolder here.</p>
        <div className="flex gap-2">
          <input
            value={driveFolderDraft}
            onChange={e => setDriveFolderDraft(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
          <button
            onClick={() => { setBackupDriveFolder(driveFolderDraft.trim()); onToast('Drive backup folder saved'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-medium hover:bg-[#162d4a] transition-colors whitespace-nowrap"
          >
            <Save size={12} /> Save
          </button>
        </div>
        {backupDriveFolderLink && (
          <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
            <Check size={11} /> Folder configured — exports will upload automatically.
          </p>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Export all data to a JSON file (apartments, stages, notes, contractors, photos).
        Import to fully restore — including all media.
      </p>
      <div className="flex gap-3 flex-wrap mb-5">
        <button onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors">
          <Download size={16} /> Export Backup
        </button>
        <button onClick={() => importRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          <Upload size={16} /> Import Backup
        </button>
        <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
      </div>

      {/* Backup log */}
      {backupLogs.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Backup History</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {backupLogs.map(entry => (
              <div key={entry.id} className="flex items-center justify-between text-xs px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-2 min-w-0">
                  <HardDrive size={12} className={entry.driveUploaded ? 'text-[#4aa8d8]' : 'text-gray-400'} />
                  <span className="text-gray-700 truncate font-mono">{entry.filename}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  <span className="text-gray-400">{entry.sizeKB} KB</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    entry.triggeredBy === 'manual' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>{entry.triggeredBy}</span>
                  <span className="text-gray-400">{format(new Date(entry.createdAt), 'MMM d, HH:mm')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Language Tab ────────────────────────────────────────────────────────────

const STRING_FIELD_LABELS: { key: keyof Omit<ContractorUiStrings, 'isRtl'>; label: string; group: string }[] = [
  { key: 'myTasks',              label: 'My Tasks tab',          group: 'Navigation' },
  { key: 'buildingMap',          label: 'Building Map tab',      group: 'Navigation' },
  { key: 'taskSingular',         label: 'Task (singular)',        group: 'Navigation' },
  { key: 'taskPlural',           label: 'Task (plural)',          group: 'Navigation' },
  { key: 'doneLabel',            label: 'Done label',             group: 'Navigation' },
  { key: 'noAssignments',        label: 'No assignments title',   group: 'Task List' },
  { key: 'noAssignmentsHint',    label: 'No assignments hint',    group: 'Task List' },
  { key: 'filterAll',            label: 'Filter: All',            group: 'Task List' },
  { key: 'filterOverdue',        label: 'Filter: Overdue',        group: 'Task List' },
  { key: 'filterToday',          label: 'Filter: Today',          group: 'Task List' },
  { key: 'filterTomorrow',       label: 'Filter: Tomorrow',       group: 'Task List' },
  { key: 'filterThisWeek',       label: 'Filter: This Week',      group: 'Task List' },
  { key: 'duePrefix',            label: 'Due prefix',             group: 'Task List' },
  { key: 'noApartmentsAssigned', label: 'No apts on map',         group: 'Map' },
  { key: 'mapHint',              label: 'Map hint text',          group: 'Map' },
  { key: 'tapToExpand',          label: 'Tap to expand',          group: 'Map' },
  { key: 'sectionTask',          label: 'Task section header',    group: 'Task Detail' },
  { key: 'fromOffice',           label: 'Office notes label',     group: 'Task Detail' },
  { key: 'engineeringPlans',     label: 'Engineering Plans label', group: 'Task Detail' },
  { key: 'completed',            label: 'Completed badge',        group: 'Task Detail' },
  { key: 'undo',                 label: 'Undo button',            group: 'Task Detail' },
  { key: 'filesAndPhotos',       label: 'Files & Photos header',  group: 'Files' },
  { key: 'uploading',            label: 'Uploading label',        group: 'Files' },
  { key: 'addFile',              label: 'Add File button',        group: 'Files' },
  { key: 'tapToAddMedia',        label: 'Tap to add media hint',  group: 'Files' },
  { key: 'requiredBeforeComplete', label: 'Required before complete', group: 'Files' },
  { key: 'viewOnDrive',          label: 'View on Drive',          group: 'Files' },
  { key: 'hide',                 label: 'Hide button',            group: 'Files' },
  { key: 'view',                 label: 'View button',            group: 'Files' },
  { key: 'download',             label: 'Download button',        group: 'Files' },
  { key: 'sectionNotes',         label: 'Notes section header',   group: 'Notes' },
  { key: 'yourNotes',            label: 'Your Notes label',       group: 'Notes' },
  { key: 'addNote',              label: 'Add note placeholder',   group: 'Notes' },
  { key: 'addMediaBeforeComplete', label: 'Add media prompt',     group: 'Complete' },
  { key: 'markCompletePrompt',   label: 'Confirm dialog title',   group: 'Complete' },
  { key: 'markCompleteHint',     label: 'Confirm dialog hint',    group: 'Complete' },
  { key: 'cancel',               label: 'Cancel button',          group: 'Complete' },
  { key: 'confirmComplete',      label: 'Confirm Complete button', group: 'Complete' },
  { key: 'markingComplete',      label: 'Marking complete label', group: 'Complete' },
  { key: 'markAsComplete',       label: 'Mark as Complete button', group: 'Complete' },
  { key: 'linkNotFound',         label: 'Link not found title',   group: 'Errors' },
  { key: 'linkInvalid',          label: 'Link invalid message',   group: 'Errors' },
];

function LanguageTab({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { contractorUiStrings, updateContractorUiStrings } = useStore();
  const [draft, setDraft] = useState<ContractorUiStrings>({ ...contractorUiStrings });

  function save() {
    updateContractorUiStrings(draft);
    onToast('Language settings saved');
  }

  function resetTo(preset: ContractorUiStrings) {
    setDraft({ ...preset });
    updateContractorUiStrings(preset);
    onToast('Reset to ' + (preset.isRtl ? 'Hebrew' : 'English'));
  }

  const groups = Array.from(new Set(STRING_FIELD_LABELS.map(f => f.group)));

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Languages size={18} className="text-[#1e3a5f]" />
            <h2 className="font-semibold text-gray-800">Contractor Portal Language</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => resetTo(DEFAULT_CONTRACTOR_UI_STRINGS)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RotateCcw size={12} /> English
            </button>
            <button
              onClick={() => resetTo(HEBREW_CONTRACTOR_UI_STRINGS)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RotateCcw size={12} /> עברית
            </button>
          </div>
        </div>

        {/* RTL toggle */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 mb-5">
          <div>
            <p className="text-sm font-medium text-gray-700">Right-to-Left (RTL) layout</p>
            <p className="text-xs text-gray-500 mt-0.5">Enable for Hebrew, Arabic, and other RTL languages.</p>
          </div>
          <button onClick={() => setDraft(d => ({ ...d, isRtl: !d.isRtl }))} className="flex-shrink-0 ml-3">
            {draft.isRtl
              ? <ToggleRight size={28} className="text-[#1e3a5f]" />
              : <ToggleLeft size={28} className="text-gray-400" />
            }
          </button>
        </div>

        {/* Fields grouped by section */}
        {groups.map(group => (
          <div key={group} className="mb-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{group}</p>
            <div className="space-y-2">
              {STRING_FIELD_LABELS.filter(f => f.group === group).map(({ key, label }) => (
                <div key={key} className="flex items-start gap-3">
                  <label className="text-xs text-gray-500 w-44 flex-shrink-0 pt-2">{label}</label>
                  <input
                    value={draft[key] as string}
                    onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    dir={draft.isRtl ? 'rtl' : 'ltr'}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={save}
          className="flex items-center gap-2 px-5 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
        >
          <Save size={15} /> Save Language Settings
        </button>
      </div>
    </div>
  );
}
