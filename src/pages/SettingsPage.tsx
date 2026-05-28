import React, { useState } from 'react';
import { useStore } from '../data/store';
import { Plus, Trash2, Save, ChevronUp, ChevronDown, Shield } from 'lucide-react';
import { Stage, User } from '../types';
import { Toast } from '../components/ui/Toast';

type Tab = 'stages' | 'users' | 'app';

export function SettingsPage() {
  const { stages, users, updateStage, addStage, deleteStage, updateUser, addUser } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('stages');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
  }

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {(['stages', 'users', 'app'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'app' ? 'App Settings' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'stages' && (
        <StageSettings stages={sortedStages} updateStage={updateStage} addStage={addStage} deleteStage={deleteStage} onToast={showToast} />
      )}

      {activeTab === 'users' && (
        <UserSettings users={users} updateUser={updateUser} addUser={addUser} onToast={showToast} />
      )}

      {activeTab === 'app' && (
        <AppSettingsTab onToast={showToast} />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

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

  function getEdit(id: string): Partial<Stage> {
    return edits[id] ?? {};
  }

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
    const current = stages[idx];
    const swap = stages[swapIdx];
    updateStage(current.id, { order: swap.order });
    updateStage(swap.id, { order: current.order });
  }

  function handleAddStage() {
    if (!newStageName.trim()) return;
    const id = 's' + Math.random().toString(36).substr(2, 6);
    const maxOrder = stages.reduce((m, s) => Math.max(m, s.order), 0);
    addStage({
      id,
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
          return (
            <div key={stage.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
              {/* Order buttons */}
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveStage(stage.id, -1)} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => moveStage(stage.id, 1)} disabled={i === stages.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20">
                  <ChevronDown size={14} />
                </button>
              </div>

              {/* Color picker */}
              <div className="relative">
                <input
                  type="color"
                  value={color}
                  onChange={e => setEdit(stage.id, { color: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="w-8 h-8 rounded-lg border-2 border-white shadow-md" style={{ backgroundColor: color }} />
              </div>

              {/* Name */}
              <input
                value={name}
                onChange={e => setEdit(stage.id, { name: e.target.value })}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
              />

              {/* Active toggle */}
              <button
                onClick={() => setEdit(stage.id, { active: !active })}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'
                }`}
              >
                {active ? 'Active' : 'Hidden'}
              </button>

              {/* Save */}
              <button
                onClick={() => saveStage(stage)}
                className="p-2 text-[#1e3a5f] hover:bg-[#1e3a5f]/5 rounded-lg transition-colors"
                title="Save"
              >
                <Save size={16} />
              </button>

              {/* Delete */}
              <button
                onClick={() => {
                  if (confirm(`Delete stage "${stage.name}"?`)) deleteStage(stage.id);
                }}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add new stage */}
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add New Stage</h3>
        <div className="flex gap-3 items-center">
          <div className="relative">
            <input
              type="color"
              value={newStageColor}
              onChange={e => setNewStageColor(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="w-10 h-10 rounded-lg border-2 border-white shadow-md" style={{ backgroundColor: newStageColor }} />
          </div>
          <input
            value={newStageName}
            onChange={e => setNewStageName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddStage()}
            placeholder="Stage name..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
          <button
            onClick={handleAddStage}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
          >
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function UserSettings({ users, updateUser, addUser, onToast }: {
  users: User[];
  updateUser: (id: string, c: Partial<User>) => void;
  addUser: (u: User) => void;
  onToast: (msg: string) => void;
}) {
  const [newUser, setNewUser] = useState({ name: '', role: '', code: '' });

  function handleAdd() {
    if (!newUser.name.trim() || !newUser.code.trim()) return;
    addUser({
      id: 'u' + Math.random().toString(36).substr(2, 6),
      name: newUser.name.trim(),
      role: newUser.role.trim() || 'User',
      code: newUser.code.trim(),
      active: true,
      createdAt: new Date().toISOString(),
    });
    setNewUser({ name: '', role: '', code: '' });
    onToast('User added');
  }

  return (
    <div>
      <div className="space-y-3 mb-6">
        {users.map(user => (
          <div key={user.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold flex-shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 grid grid-cols-3 gap-3">
              <input
                defaultValue={user.name}
                onBlur={e => updateUser(user.id, { name: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                placeholder="Name"
              />
              <input
                defaultValue={user.role}
                onBlur={e => updateUser(user.id, { role: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                placeholder="Role"
              />
              <input
                defaultValue={user.code}
                onBlur={e => updateUser(user.id, { code: e.target.value })}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 font-mono"
                placeholder="Access code"
                maxLength={6}
              />
            </div>
            <button
              onClick={() => updateUser(user.id, { active: !user.active })}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all flex-shrink-0 ${
                user.active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-500'
              }`}
            >
              {user.active ? 'Active' : 'Inactive'}
            </button>
          </div>
        ))}
      </div>

      {/* Add user */}
      <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Add New User</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <input
            value={newUser.name}
            onChange={e => setNewUser(n => ({ ...n, name: e.target.value }))}
            placeholder="Name *"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
          <input
            value={newUser.role}
            onChange={e => setNewUser(n => ({ ...n, role: e.target.value }))}
            placeholder="Role"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
          <input
            value={newUser.code}
            onChange={e => setNewUser(n => ({ ...n, code: e.target.value.replace(/\D/g, '') }))}
            placeholder="6-digit code *"
            maxLength={6}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
        >
          <Plus size={16} />
          Add User
        </button>
      </div>
    </div>
  );
}

function AppSettingsTab({ onToast }: { onToast: (msg: string) => void }) {
  const { users } = useStore();

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={18} className="text-[#1e3a5f]" />
          <h2 className="font-semibold text-gray-800">Access Codes</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Current user access codes. Change them in the Users tab.</p>
        <div className="space-y-2">
          {users.map(u => (
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
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">{u.code}</code>
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {u.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="font-semibold text-amber-800 mb-2 text-sm">Data Storage</h3>
        <p className="text-sm text-amber-700">
          All data is stored in your browser's localStorage under the key <code className="font-mono bg-amber-100 px-1 rounded">wolfson_app_data</code>.
          Data persists across sessions but is browser-specific. For multi-device sync, connect a Firebase or Supabase backend.
        </p>
      </div>
    </div>
  );
}
