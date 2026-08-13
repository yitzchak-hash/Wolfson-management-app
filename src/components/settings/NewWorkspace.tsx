import React, { useState } from 'react';
import { Plus, Building2, Trash2, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { useStore } from '../../data/store';
import { Project, Building, Apartment, Stage, BuildingId } from '../../types';
import { ProjectBuilder } from './ProjectBuilder';
import { ProjectLayout, generateGrid, layoutToApartments, countUnits } from '../../data/projectLayout';

const PRESET_COLORS = [
  '#b8860b', '#0d9488', '#ea6b13', '#2563eb', '#7c3aed',
  '#dc2626', '#16a34a', '#db2777', '#0891b2', '#65a30d',
];

/**
 * Creating a workspace.
 *
 * Three steps, because they are genuinely three decisions: what it is called,
 * roughly how many buildings and floors, then the detailed layout in the same
 * builder used to edit an existing project's buildings.
 *
 * Nothing is written until the last step is confirmed. The new workspace gets
 * its own storage key and its own Firestore collections, exactly like the three
 * built-in ones, so creating it cannot disturb anything that already exists.
 */
export function NewWorkspace({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { projects, customProjects, addProject, deleteProject, stages, setCurrentProject,
    setProjectColor } = useStore();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[3]);
  const [buildingCount, setBuildingCount] = useState(2);
  const [floors, setFloors] = useState(10);
  const [perFloor, setPerFloor] = useState(4);
  const [copyStagesFrom, setCopyStagesFrom] = useState<string>('wolfson');
  const [layout, setLayout] = useState<ProjectLayout | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const idTaken = projects.some(p => p.id === id);

  /** Building ids are the letter of the workspace plus a number: W1, W2, … */
  function buildingIds(count: number): string[] {
    const letter = (shortName || name || 'X').trim()[0]?.toUpperCase() ?? 'X';
    return Array.from({ length: count }, (_, i) => `${letter}${i + 1}`);
  }

  function buildDraftLayout(): ProjectLayout {
    const ids = buildingIds(buildingCount);
    return {
      buildings: ids.map((bid, i) => generateGrid({
        id: bid, name: bid, displayOrder: i + 1,
        floors, perFloor, startFloor: 1,
        numbering: { start: 1, direction: 'ltr', continueAcrossFloors: true },
      })),
    };
  }

  function create(finalLayout: ProjectLayout) {
    const project: Project = {
      id, name: name.trim(), shortName: (shortName || name).trim(),
      logoPath: '/general-logo.svg', type: 'building', color,
    };
    const buildings: Building[] = finalLayout.buildings.map((b, i) => ({
      id: b.id as BuildingId, name: b.name, displayOrder: i + 1,
    }));
    const apartments: Apartment[] = layoutToApartments(finalLayout, []);

    // Stages are copied rather than shared, so tuning this workspace's stages
    // can never reach into the workspace they came from.
    const now = new Date().toISOString();
    const source = stages.filter(st =>
      copyStagesFrom === 'general' ? st.projectId === 'general' : !st.projectId);
    const newStages: Stage[] = source.map((st, i) => ({
      ...st,
      id: `${id}-s${i + 1}`,
      projectId: id,
      createdAt: now, updatedAt: now,
    }));

    addProject(project, buildings, apartments, newStages);
    onToast(`${project.name} created — ${apartments.filter(a => a.apartmentNumber).length} units`);
    setStep(0); setName(''); setShortName(''); setLayout(null);
  }

  // ── Step 3: the full builder ──
  if (step === 3 && layout) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => setStep(2)} className="p-1 text-gray-400 hover:text-gray-600"><ArrowLeft size={16} /></button>
          <h2 className="font-semibold text-gray-800">Lay out {name}</h2>
          <span className="text-xs text-gray-400">{countUnits(layout)} units</span>
          <button
            onClick={() => create(layout)}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}
          >
            <Check size={15} /> Create workspace
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Draw the real building: mark the positions where there is no apartment, and join the ones that
          are really one home. Numbering re-flows through the rules, and hand-typed numbers stay put.
        </p>
        <ProjectBuilder initial={layout} onSave={setLayout} onToast={onToast} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Existing workspaces */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <Building2 size={18} className="text-[#4aa8d8]" /> Workspaces
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Each workspace keeps its own buildings, stages, jobs, tasks and board. Nothing crosses between
          them. The dot on the left is that workspace's colour — click it to change it, and it updates
          everywhere at once.
        </p>
        <div className="flex flex-col gap-2">
          {projects.map(p => {
            const isBuiltIn = !customProjects.some(c => c.id === p.id);
            return (
              <div key={p.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2.5 flex-wrap">
                {/* The colour is edited here as well as in the workspace's own
                    settings — this is the page where you can see all of them
                    together, which is when you actually want to tell them
                    apart. */}
                <span className="relative flex-shrink-0" title={`${p.shortName} colour`}>
                  <span className="block w-5 h-5 rounded-full border-2 border-white"
                    style={{ backgroundColor: p.color, boxShadow: '0 0 0 1px rgba(15,23,42,.15)' }} />
                  <input
                    type="color"
                    value={p.color}
                    onChange={e => setProjectColor(p.id, e.target.value)}
                    aria-label={`${p.name} colour`}
                    className="absolute inset-0 opacity-0 cursor-pointer w-5 h-5"
                  />
                </span>
                <span className="font-semibold text-sm text-gray-800">{p.name}</span>
                <span className="text-[11px] text-gray-400">{p.shortName}</span>
                {isBuiltIn && <span className="text-[10px] text-gray-300">built in</span>}
                <span className="flex-1" />
                <span className="flex items-center gap-1">
                  {PRESET_COLORS.slice(0, 6).map(c => (
                    <button key={c} onClick={() => setProjectColor(p.id, c)}
                      title="Use this colour"
                      className="w-8 h-8 sm:w-4 sm:h-4 rounded-full border transition-transform hover:scale-125"
                      style={{ backgroundColor: c, borderColor: p.color === c ? '#1e3a5f' : 'rgba(0,0,0,.15)' }} />
                  ))}
                </span>
                <button onClick={() => setCurrentProject(p.id)}
                  className="text-[11px] font-bold text-[#1e3a5f] hover:underline">Open</button>
                {!isBuiltIn && (
                  confirmDelete === p.id ? (
                    <button onClick={() => { deleteProject(p.id); setConfirmDelete(null); onToast('Workspace removed from the list'); }}
                      className="text-[11px] font-bold text-white bg-red-600 px-2 py-1 rounded-lg">
                      Remove
                    </button>
                  ) : (
                    <button onClick={() => setConfirmDelete(p.id)} title="Remove from the list"
                      className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  )
                )}
              </div>
            );
          })}
        </div>
        {confirmDelete && (
          <p className="text-[11px] text-amber-700 mt-2">
            Removing takes it off the list. Its jobs and history are left where they are, so re-creating
            it with the same name brings them back.
          </p>
        )}
      </div>

      {/* New workspace */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Plus size={18} className="text-[#4aa8d8]" /> New workspace
        </h2>

        {/* Step marker */}
        <div className="flex items-center gap-2 mb-4">
          {['Name it', 'Rough shape', 'Draw it'].map((label, i) => (
            <React.Fragment key={label}>
              <span className="flex items-center gap-1.5 text-[11px] font-bold"
                style={{ color: step > i ? '#16a34a' : step === i ? '#1e3a5f' : '#cbd5e1' }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white"
                  style={{ backgroundColor: step > i ? '#16a34a' : step === i ? '#1e3a5f' : '#cbd5e1' }}>
                  {step > i ? '✓' : i + 1}
                </span>
                {label}
              </span>
              {i < 2 && <span className="flex-1 h-px bg-gray-200" />}
            </React.Fragment>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Project name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Ramat Aviv Towers"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
              {name && idTaken && (
                <p className="text-[11px] text-red-600 mt-1">A workspace with that name already exists.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Short name</label>
              <input value={shortName} onChange={e => setShortName(e.target.value)}
                placeholder="shown on the header chip"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Colour</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className="w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: color === c ? '#1e3a5f' : 'rgba(0,0,0,.12)' }} />
                ))}
              </div>
            </div>
            <button disabled={!name.trim() || idTaken} onClick={() => setStep(1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
              Next <ArrowRight size={15} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              A starting grid, not the final answer — the next step is where you mark the gaps,
              stairwells and duplexes that make it the real building.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {([['Buildings', buildingCount, setBuildingCount, 1, 8],
                 ['Floors each', floors, setFloors, 1, 40],
                 ['Apartments per floor', perFloor, setPerFloor, 1, 12]] as const).map(([label, val, set, lo, hi]) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  <input type="number" min={lo} max={hi} value={val}
                    onChange={e => (set as (n: number) => void)(Math.max(lo, Math.min(hi, Number(e.target.value) || lo)))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
            <div className="text-[11px] text-gray-500">
              Buildings will be called <b>{buildingIds(buildingCount).join(', ')}</b> ·
              about <b>{buildingCount * floors * perFloor}</b> units to start with.
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Copy stages from</label>
              <select value={copyStagesFrom} onChange={e => setCopyStagesFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Copied, not shared — changing this workspace's stages later cannot affect the one they
                came from.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(0)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Back</button>
              <button onClick={() => setStep(2)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
                Next <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-sm font-bold text-gray-800 mb-1">{name}</div>
              <div className="text-xs text-gray-500">
                {buildingCount} {buildingCount === 1 ? 'building' : 'buildings'} ·
                {' '}{floors} floors · {perFloor} per floor ·
                {' '}about {buildingCount * floors * perFloor} units
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[11px] text-gray-400">{shortName || name}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Open the builder to mark gaps, stairwells and duplexes and to set the numbering, or create
              it as a plain grid and edit it later in this workspace's own settings.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600">Back</button>
              <button onClick={() => { setLayout(buildDraftLayout()); setStep(3); }}
                className="px-4 py-2 rounded-xl border-2 text-sm font-semibold"
                style={{ borderColor: '#1e3a5f', color: '#1e3a5f' }}>
                Open the builder
              </button>
              <button onClick={() => create(buildDraftLayout())}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
                <Check size={15} /> Create as a plain grid
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
