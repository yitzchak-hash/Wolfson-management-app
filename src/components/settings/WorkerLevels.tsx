import React, { useState } from 'react';
import { Plus, Trash2, Copy, ShieldCheck, ChevronDown, RotateCcw } from 'lucide-react';
import { useStore } from '../../data/store';
import { Contractor, WorkerLevel, WorkerPermission } from '../../types';
import {
  WORKER_PERMISSIONS, PermissionDef, permsOf, overrideCount, DEFAULT_NEW_WORKER_LEVEL,
} from '../../data/workerLevels';

/**
 * Levels, and the fifteen switches behind them.
 *
 * The office does not want to answer fifteen questions per worker; it wants to
 * say "he's a contractor" and move on. So the switches live on a LEVEL, and the
 * level is what a worker gets put on. The switches are still all here for the
 * one person in ten who needs something the level does not give them — but that
 * is behind a fold, because it is the exception.
 */

const GROUPS: PermissionDef['group'][] = ['Work', 'The site', 'Everyone else'];

export function WorkerLevelsPanel({ onToast }: {
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const levels = useStore(s => s.workerLevels);
  const contractors = useStore(s => s.contractors);
  const addWorkerLevel = useStore(s => s.addWorkerLevel);
  const updateWorkerLevel = useStore(s => s.updateWorkerLevel);
  const deleteWorkerLevel = useStore(s => s.deleteWorkerLevel);
  const [open, setOpen] = useState<string | null>(null);

  const countOn = (id: string) => contractors.filter(
    c => (c.levelId ?? DEFAULT_NEW_WORKER_LEVEL) === id).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={17} className="text-[#1e3a5f]" />
        <h3 className="font-bold text-gray-900">Levels</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        A level is a saved set of the fifteen switches below. Put a worker on a level and that is
        normally the end of it — you only ever open the switches for somebody who needs an
        exception.
      </p>

      <div className="space-y-2">
        {levels.map(level => {
          const isOpen = open === level.id;
          const on = WORKER_PERMISSIONS.filter(p => level.perms[p.key]).length;
          return (
            <div key={level.id} className="rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpen(o => (o === level.id ? null : level.id))}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
              >
                <span className="font-bold text-sm text-gray-800">{level.name}</span>
                {level.builtIn && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    ships with the app
                  </span>
                )}
                <span className="flex-1" />
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {on}/{WORKER_PERMISSIONS.length} on · {countOn(level.id)}{' '}
                  {countOn(level.id) === 1 ? 'worker' : 'workers'}
                </span>
                <ChevronDown size={15} className="text-gray-400 transition-transform"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[10.5px] font-bold text-gray-500 mb-1">Name</span>
                      <input value={level.name}
                        onChange={e => updateWorkerLevel(level.id, { name: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#4aa8d8]" />
                    </label>
                    <label className="block">
                      <span className="block text-[10.5px] font-bold text-gray-500 mb-1">In Hebrew</span>
                      <input value={level.nameHe ?? ''} dir="rtl"
                        onChange={e => updateWorkerLevel(level.id, { nameHe: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#4aa8d8]" />
                    </label>
                  </div>

                  {GROUPS.map(group => (
                    <div key={group}>
                      <div className="text-[10px] font-black tracking-wide text-gray-400 uppercase mb-1">
                        {group}
                      </div>
                      <div className="space-y-1">
                        {WORKER_PERMISSIONS.filter(p => p.group === group).map(p => (
                          <Switch
                            key={p.key}
                            def={p}
                            on={!!level.perms[p.key]}
                            onToggle={v => updateWorkerLevel(level.id, {
                              perms: { ...level.perms, [p.key]: v },
                            })}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => {
                        const made = addWorkerLevel({
                          name: `${level.name} (copy)`,
                          description: level.description,
                          perms: { ...level.perms },
                        });
                        setOpen(made.id);
                        onToast(`"${made.name}" saved as a new level`);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                 border border-gray-200 text-gray-600 hover:bg-gray-50">
                      <Copy size={13} /> Save a copy to change
                    </button>
                    {!level.builtIn && (
                      <button
                        onClick={() => {
                          const n = countOn(level.id);
                          const warn = n
                            ? `Remove "${level.name}"? ${n} ${n === 1 ? 'worker goes' : 'workers go'} `
                              + 'back to the starting level.'
                            : `Remove "${level.name}"?`;
                          if (window.confirm(warn)) {
                            deleteWorkerLevel(level.id);
                            onToast(`"${level.name}" removed`);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                   border border-red-100 text-red-500 hover:bg-red-50">
                        <Trash2 size={13} /> Remove this level
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => {
          const made = addWorkerLevel({
            name: 'New level',
            perms: { ownTasks: true, completeTasks: true, uploadPhotos: true },
          });
          setOpen(made.id);
        }}
        className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                   border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50">
        <Plus size={14} /> Save another level
      </button>
    </div>
  );
}

function Switch({ def, on, onToggle, inherited }: {
  def: PermissionDef; on: boolean; onToggle: (v: boolean) => void;
  /** True when this value is coming from the level rather than the person. */
  inherited?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 px-2 py-1 rounded-lg hover:bg-gray-50 cursor-pointer">
      <input type="checkbox" checked={on} onChange={e => onToggle(e.target.checked)}
        className="mt-0.5 flex-shrink-0" />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-gray-700">
          {def.label}
          {inherited && <span className="ml-1.5 text-[9px] font-normal text-gray-400">from the level</span>}
        </span>
        {def.hint && <span className="block text-[10.5px] text-gray-400 leading-snug">{def.hint}</span>}
      </span>
    </label>
  );
}

/**
 * One worker's exceptions.
 *
 * Only the switches somebody has actually flipped are stored, so moving a
 * worker to another level moves everything they have not been given a personal
 * answer on — which is what "put him on manager" ought to mean.
 */
export function WorkerPermissionOverrides({ worker }: { worker: Contractor }) {
  const levels = useStore(s => s.workerLevels);
  const updateContractor = useStore(s => s.updateContractor);
  const effective = permsOf(worker, levels);
  const level = levels.find(l => l.id === (worker.levelId ?? DEFAULT_NEW_WORKER_LEVEL));
  const overrides = overrideCount(worker);

  return (
    <div className="mt-2 rounded-xl bg-slate-50 border border-gray-100 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-500">
          Following <b>{level?.name ?? 'the starting level'}</b>
          {overrides > 0 && `, with ${overrides} changed just for ${worker.name}`}
        </span>
        <span className="flex-1" />
        {overrides > 0 && (
          <button
            onClick={() => updateContractor(worker.id, { perms: {} })}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#4aa8d8]">
            <RotateCcw size={11} /> back to the level
          </button>
        )}
      </div>

      {GROUPS.map(group => (
        <div key={group}>
          <div className="text-[10px] font-black tracking-wide text-gray-400 uppercase mb-1">{group}</div>
          <div className="space-y-1">
            {WORKER_PERMISSIONS.filter(p => p.group === group).map(p => (
              <Switch
                key={p.key}
                def={p}
                on={effective[p.key]}
                inherited={worker.perms?.[p.key] === undefined}
                onToggle={v => {
                  const fromLevel = level?.perms?.[p.key] ?? false;
                  const next = { ...(worker.perms ?? {}) };
                  // Setting it back to what the level says REMOVES the override
                  // rather than freezing that value — otherwise a worker slowly
                  // accumulates fifteen personal answers and stops following
                  // the level at all without anybody deciding that.
                  if (v === fromLevel) delete next[p.key as WorkerPermission];
                  else next[p.key as WorkerPermission] = v;
                  updateContractor(worker.id, { perms: next });
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The level dropdown that sits on a worker's row. */
export function WorkerLevelPicker({ worker }: { worker: Contractor }) {
  const levels = useStore(s => s.workerLevels);
  const updateContractor = useStore(s => s.updateContractor);
  return (
    <select
      value={worker.levelId ?? DEFAULT_NEW_WORKER_LEVEL}
      onChange={e => updateContractor(worker.id, { levelId: e.target.value })}
      title="What this worker can see and do"
      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white outline-none
                 focus:border-[#4aa8d8] max-w-[150px]"
    >
      {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  );
}
