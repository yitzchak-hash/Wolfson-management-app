import React, { useMemo, useRef, useState } from 'react';
import { Upload, AlertTriangle, ChevronDown, ChevronRight, CheckCircle2, Phone, FolderOpen } from 'lucide-react';
import { useStore } from '../../data/store';
import { Apartment, CanvasElement, binLabelOf, binKeyOf } from '../../types';
import { extractFolderId } from '../../data/driveApi';
import {
  parseZohoCsv, planImport, routeLabel, ImportPlan, PlannedJob, PlanContext,
} from '../../data/jobsImport';

/**
 * Settings → Job Board: bring the CRM's deal export onto the board.
 *
 * Preview-first, exactly like the Drive family-name tool: choosing a file
 * writes NOTHING. The plan is laid out destination by destination — every row
 * with a tick you can take away — and only the Apply button creates anything.
 * Run it again next quarter and rows already on the board are skipped, so the
 * same file twice cannot mean the same job twice.
 *
 * The arithmetic (family names, phone zeros, stage routing, the guards) lives
 * in data/jobsImport.ts, pure and tested against the real export offline.
 */

const TILE_W = 215, TILE_H = 132, GAP = 22, PER_ROW = 4;
const BIN_W = 178, BIN_H = 92;

/** Colours for the stages Apply may need to create. */
const STAGE_COLORS: Record<string, string> = {
  'job completed': '#16a34a',
  'ac installation': '#3b82f6',
  'installation of geves': '#f59e0b',
};

export function ImportJobsCard({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const {
    apartments, stages, projects, canvasElements, currentUser, currentProjectId,
    addStage, addCanvasElement, importJobs,
  } = useStore();

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The other workspaces' Drive folders — the owner's own guard: a deal whose
   * folder is already an apartment's folder in Wolfson or Netiv is that
   * workspace's job and must not become a board tile. Built from each
   * project's stored snapshot on this machine (only the open workspace is
   * live), which is why the card says so.
   */
  const ctx: PlanContext = useMemo(() => {
    const otherWorkspaceFolders = new Map<string, string>();
    for (const p of projects) {
      if (p.id === currentProjectId) continue;
      try {
        const raw = localStorage.getItem(`${p.id}_app_data`);
        if (!raw) continue;
        const d = JSON.parse(raw) as { apartments?: Apartment[] };
        for (const a of d.apartments ?? []) {
          if (!a.driveLink) continue;
          const fid = extractFolderId(a.driveLink);
          if (fid) otherWorkspaceFolders.set(fid, p.name);
        }
      } catch { /* a corrupt snapshot must not break the import */ }
    }
    const existingFolderIds = new Set<string>();
    const existingDealNames = new Set<string>();
    for (const a of apartments) {
      if (a.driveLink) {
        const fid = extractFolderId(a.driveLink);
        if (fid) existingFolderIds.add(fid);
      }
      const firstLine = (a.generalNotes ?? '').split('\n')[0].trim().toLowerCase();
      if (firstLine) existingDealNames.add(firstLine);
    }
    return {
      otherWorkspaceFolders,
      existingFolderIds,
      existingDealNames,
      existingStageNames: stages.filter(st => st.projectId === 'general').map(st => st.name),
      existingGroupNames: canvasElements
        .filter(el => el.type === 'bin' && !el.binKind && !el.board)
        .map(el => binLabelOf(el)),
    };
  }, [projects, currentProjectId, apartments, stages, canvasElements]);

  async function pickFile(f: File | undefined | null) {
    if (!f) return;
    const text = await f.text();
    const rows = parseZohoCsv(text);
    if (!rows.length) {
      onToast('That file has no "Deal Name" column — export the deals list from the CRM as CSV', 'error');
      return;
    }
    setFileName(f.name);
    setPlan(planImport(rows, ctx));
    setExcluded(new Set());
    setDone(null);
  }

  /** Planned rows grouped by where they land, for the preview sections. */
  const sections = useMemo(() => {
    if (!plan) return [];
    const by = new Map<string, { label: string; idx: number[] }>();
    plan.planned.forEach((p, i) => {
      const label = routeLabel(p.route) + (p.route.stageName ? ` — stage "${p.route.stageName}"` : '');
      const s = by.get(label) ?? { label, idx: [] };
      s.idx.push(i);
      by.set(label, s);
    });
    return [...by.values()].sort((a, b) => b.idx.length - a.idx.length);
  }, [plan]);

  const takingCount = plan ? plan.planned.length - excluded.size : 0;
  const warnedCount = plan ? plan.planned.filter((p, i) => p.warnings.length && !excluded.has(i)).length : 0;

  function toggleRow(i: number) {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function toggleSection(label: string, idx: number[]) {
    const allOut = idx.every(i => excluded.has(i));
    setExcluded(prev => {
      const next = new Set(prev);
      idx.forEach(i => { if (allOut) next.delete(i); else next.add(i); });
      return next;
    });
  }

  function apply() {
    if (!plan || !currentUser || busy) return;
    setBusy(true);
    try {
      const taking = plan.planned.filter((_, i) => !excluded.has(i));
      const now = new Date().toISOString();

      // Stages first — matched by name among this workspace's own stages,
      // created when missing. The board's tiles read only general stages, so
      // a same-named global stage would not colour a tile.
      const generalStages = () => useStore.getState().stages.filter(st => st.projectId === 'general');
      const stageIdByName = new Map<string, string>();
      const wantedStages = [...new Set(taking.map(t => t.route.stageName).filter((n): n is string => !!n))];
      for (const name of wantedStages) {
        const have = generalStages().find(st => st.name.trim().toLowerCase() === name.toLowerCase());
        if (have) { stageIdByName.set(name, have.id); continue; }
        const id = 's' + Math.random().toString(36).slice(2, 8);
        const maxOrder = Math.max(0, ...generalStages().map(st => st.order));
        addStage({
          id, name, color: STAGE_COLORS[name.toLowerCase()] ?? '#64748b',
          order: maxOrder + 1, active: true, projectId: 'general',
          createdAt: now, updatedAt: now,
        });
        stageIdByName.set(name, id);
      }

      // Groups next. Built-ins pass through as their key; a named group is
      // found by its label or created as a real bin node beside the four that
      // ship with the board.
      const groupKeyByName = new Map<string, string>();
      const namedGroups = [...new Set(
        taking.map(t => t.route.group).filter(g => g && g !== 'done' && g !== 'ready')
      )];
      namedGroups.forEach((name, gi) => {
        const els = useStore.getState().canvasElements;
        const have = els.find(el =>
          el.type === 'bin' && !el.binKind && !el.board
          && binLabelOf(el).trim().toLowerCase() === name.toLowerCase());
        if (have) { groupKeyByName.set(name, binKeyOf(have)); return; }
        const el: CanvasElement = {
          id: 'CE-bin-' + Math.random().toString(36).slice(2, 8),
          type: 'bin',
          x: GAP + PER_ROW * (TILE_W + GAP) + 40,
          y: GAP + (4 + gi) * (BIN_H + 12),
          w: BIN_W, h: BIN_H,
          text: name,
          color: '#f59e0b',
          addedAt: now,
        };
        addCanvasElement(el);
        groupKeyByName.set(name, binKeyOf(el));
      });

      // The jobs themselves — the open-board ones take grid spots after
      // whatever is already there; filed ones keep a spot too for the day
      // somebody takes them back out.
      const onBoard = useStore.getState().apartments
        .filter(a => a.buildingId === 'G' && !a.isUnnamed && !a.boardBin).length;
      let seq = 0;
      const stamp = Date.now();
      const jobs: Apartment[] = taking.map((t, i) => {
        const slot = onBoard + seq++;
        const bin = t.route.group === ''
          ? undefined
          : (t.route.group === 'done' || t.route.group === 'ready')
            ? t.route.group
            : groupKeyByName.get(t.route.group);
        const notes = t.account && t.account.trim() && t.account.trim() !== t.dealName.trim()
          ? `${t.dealName}\nAccount: ${t.account.trim()}`
          : t.dealName;
        return {
          id: `G-imp-${stamp}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          buildingId: 'G', apartmentNumber: '',
          displayName: t.family, floor: 0, colPosition: 1, colSpan: 1,
          isDuplexApt: false,
          currentStageId: t.route.stageName ? (stageIdByName.get(t.route.stageName) ?? null) : null,
          classification: 'standard', shinuiDetails: null,
          generalNotes: notes, isUnnamed: false,
          driveLink: t.driveUrl || undefined,
          phone: t.phone || undefined,
          boardBin: bin,
          binnedAt: bin ? now : undefined,
          canvasX: GAP + (slot % PER_ROW) * (TILE_W + GAP),
          canvasY: GAP + Math.floor(slot / PER_ROW) * (TILE_H + GAP),
          createdAt: now, updatedAt: now, contentUpdatedAt: now,
          updatedBy: currentUser.id, updatedByName: currentUser.name,
        };
      });

      importJobs(jobs);
      const summary = `${jobs.length} jobs imported`
        + (wantedStages.length ? ` · stages: ${wantedStages.join(', ')}` : '');
      setDone(summary);
      setPlan(null);
      setFileName('');
      onToast(summary);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 mt-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Upload size={15} className="text-[#1e3a5f]" /> Import jobs from a CSV
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            The CRM's deals export. Family name comes from the deal name, the Drive link and
            phone come along, and each deal lands on the board or in a group by its CRM stage.
            Nothing is written until you press Apply — and a deal whose Drive folder already
            belongs to another workspace, or is already on this board, is skipped.
          </p>
        </div>
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="px-3 py-2 rounded-lg bg-[#1e3a5f] text-white text-xs font-semibold hover:bg-[#162d4a] flex-shrink-0"
        >
          Choose CSV…
        </button>
      </div>

      {done && (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle2 size={15} /> {done}
        </div>
      )}

      {plan && (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-semibold text-gray-700">{fileName}</span>
            <span className="rounded-full bg-[#4aa8d8]/15 text-[#1e3a5f] font-semibold px-2 py-0.5">
              {takingCount} will be imported
            </span>
            <button
              onClick={() => setShowSkipped(v => !v)}
              className="rounded-full bg-gray-100 text-gray-600 font-medium px-2 py-0.5 hover:bg-gray-200"
            >
              {plan.skipped.length} skipped {showSkipped ? '▴' : '▾'}
            </button>
            {warnedCount > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-800 font-medium px-2 py-0.5 inline-flex items-center gap-1">
                <AlertTriangle size={11} /> {warnedCount} worth a look
              </span>
            )}
          </div>

          {(plan.stagesToCreate.length > 0 || plan.groupsToCreate.length > 0) && (
            <p className="text-[11px] text-gray-500 mt-2">
              Apply will also create
              {plan.stagesToCreate.length > 0 && <> the stage{plan.stagesToCreate.length > 1 ? 's' : ''} <b>{plan.stagesToCreate.join(', ')}</b></>}
              {plan.stagesToCreate.length > 0 && plan.groupsToCreate.length > 0 && ' and'}
              {plan.groupsToCreate.length > 0 && <> the group{plan.groupsToCreate.length > 1 ? 's' : ''} <b>{plan.groupsToCreate.join(', ')}</b></>}.
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            The other-workspace check reads what this computer has stored for Wolfson and Netiv —
            run the import on a machine that has opened both.
          </p>

          {showSkipped && (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 max-h-44 overflow-y-auto">
              {Object.entries(
                plan.skipped.reduce<Record<string, number>>((m, s) => { m[s.reason] = (m[s.reason] ?? 0) + 1; return m; }, {})
              ).sort((a, b) => b[1] - a[1]).map(([reason, n]) => (
                <div key={reason} className="text-[11px] text-gray-600 py-0.5">
                  <b>{n}</b> — {reason}
                </div>
              ))}
              {plan.skipped.filter(s => s.reason.includes('belongs to')).map((s, i) => (
                <div key={i} className="text-[11px] text-red-700 py-0.5 truncate">{s.dealName} · {s.reason}</div>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-2">
            {sections.map(sec => {
              const open = openSections.has(sec.label);
              const inCount = sec.idx.filter(i => !excluded.has(i)).length;
              return (
                <div key={sec.label} className="rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <button
                      onClick={() => setOpenSections(prev => {
                        const next = new Set(prev);
                        if (next.has(sec.label)) next.delete(sec.label); else next.add(sec.label);
                        return next;
                      })}
                      className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 min-w-0 flex-1 text-left"
                    >
                      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <span className="truncate">{sec.label}</span>
                      <span className="text-gray-400 font-normal flex-shrink-0">{inCount}/{sec.idx.length}</span>
                    </button>
                    <button
                      onClick={() => toggleSection(sec.label, sec.idx)}
                      className="text-[11px] font-medium text-[#1e3a5f] hover:underline flex-shrink-0"
                    >
                      {sec.idx.every(i => excluded.has(i)) ? 'take all' : 'leave all out'}
                    </button>
                  </div>
                  {open && (
                    <div className="border-t border-gray-100 max-h-72 overflow-y-auto">
                      {sec.idx.map(i => <Row key={i} p={plan.planned[i]} taken={!excluded.has(i)} onToggle={() => toggleRow(i)} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={apply}
              disabled={takingCount === 0 || busy}
              className="px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold hover:bg-[#162d4a] disabled:opacity-40"
            >
              {busy ? 'Importing…' : `Import ${takingCount} job${takingCount === 1 ? '' : 's'}`}
            </button>
            <button
              onClick={() => { setPlan(null); setFileName(''); }}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One deal in the preview. Cheap on purpose — there can be six hundred. */
function Row({ p, taken, onToggle }: { p: PlannedJob; taken: boolean; onToggle: () => void }) {
  return (
    <label className={`flex items-center gap-2 px-2.5 py-1.5 border-b border-gray-50 last:border-b-0 cursor-pointer ${taken ? '' : 'opacity-45'}`}>
      <input type="checkbox" checked={taken} onChange={onToggle} className="flex-shrink-0 accent-[#1e3a5f]" />
      <span className="text-xs font-semibold text-gray-800 flex-shrink-0 max-w-[130px] truncate">{p.family}</span>
      <span className="text-[11px] text-gray-400 truncate flex-1 min-w-[80px]">{p.dealName}</span>
      {p.phone && (
        <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5 flex-shrink-0"><Phone size={10} />{p.phone}</span>
      )}
      {p.folderId && <FolderOpen size={11} className="text-green-600 flex-shrink-0" />}
      {p.warnings.length > 0 && (
        <span
          title={p.warnings.join('\n')}
          className="text-[10px] text-amber-800 bg-amber-100 rounded-full px-1.5 py-0.5 inline-flex items-center gap-0.5 flex-shrink-0"
        >
          <AlertTriangle size={10} /> {p.warnings.length}
        </span>
      )}
    </label>
  );
}
