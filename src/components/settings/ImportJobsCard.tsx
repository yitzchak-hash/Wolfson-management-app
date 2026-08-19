import React, { useMemo, useRef, useState } from 'react';
import {
  Upload, Download, AlertTriangle, ChevronDown, ChevronRight, CheckCircle2,
  Phone, FolderOpen, Trash2, Loader2,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import { useStore } from '../../data/store';
import { Apartment, CanvasElement, binLabelOf, binKeyOf, BIN_META } from '../../types';
import {
  extractFolderId, getFolderNameViaBackend, familyNameFromFolderName,
  isUploadBackendConfigured, shareJobFolderSurfacesNow,
} from '../../data/driveApi';
import {
  templateCsv, parseTemplateCsv, planImport, ImportPlan, PlannedJob, PlanContext,
} from '../../data/jobsImport';

/**
 * Job Board → project settings: the import wizard.
 *
 * Three steps, nothing clever hidden in any of them: download the template,
 * fill it, upload it back. Family names left blank are read from the Drive
 * folder's own title ("Family, First - …" → everything before the first
 * " -"), the same rule the rest of the app uses. Preview-first like every
 * bulk tool here: the upload writes NOTHING; every row can be unticked; only
 * Apply creates anything. Stages and groups come from the file's own columns
 * — no other system's stage names are hardcoded anywhere.
 *
 * A previous import (job ids prefixed G-imp-) can be cleared with one press,
 * touching nothing anybody made by hand.
 */

const TILE_W = 215, TILE_H = 132, GAP = 22, PER_ROW = 4;
const BIN_W = 178, BIN_H = 92;

export function ImportJobsCard({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const {
    apartments, stages, projects, canvasElements, currentUser, currentProjectId,
    addStage, addCanvasElement, importJobs, removeJobsByIdPrefix,
  } = useStore();

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * What the import is doing right now.
   *
   * An import that lands six hundred jobs and opens six hundred Drive folders
   * takes real time, and a button that just goes quiet for a minute reads as a
   * failure. The bar names the stage and counts through it, and nothing else on
   * the card can be touched until it clears.
   */
  const [step, setStep] = useState<{ label: string; done: number; total: number } | null>(null);
  const [clearing, setClearing] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);

  /**
   * Every import is its own BATCH — the ids carry the batch's timestamp
   * (G-imp-<stamp>-…), so each one gets its own row and its own Remove.
   * That is what makes removal a standing undo rather than a one-shot: a
   * new import next quarter can be taken back without touching the one from
   * August that has since become real, worked-on jobs. "Edited since" warns
   * exactly about those — contentUpdatedAt moves the first time anybody
   * changes an imported job's content.
   */
  const importBatches = useMemo(() => {
    const by = new Map<string, { count: number; edited: number; when: number }>();
    for (const a of apartments) {
      if (a.buildingId !== 'G') continue;
      const m = a.id.match(/^G-imp-(\d+)-/);
      if (!m) continue;
      const b = by.get(m[1]) ?? { count: 0, edited: 0, when: Number(m[1]) };
      b.count++;
      if (a.contentUpdatedAt && a.contentUpdatedAt !== a.createdAt) b.edited++;
      by.set(m[1], b);
    }
    // Legacy ids without a parsable stamp fall into one "earlier" bucket.
    const legacy = apartments.filter(a => a.buildingId === 'G'
      && a.id.startsWith('G-imp-') && !/^G-imp-\d+-/.test(a.id));
    const out = [...by.entries()]
      .map(([stamp, b]) => ({ stamp, ...b }))
      .sort((a, b) => b.when - a.when);
    if (legacy.length) out.push({ stamp: '', count: legacy.length, edited: 0, when: 0 });
    return out;
  }, [apartments]);

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
    for (const a of apartments) {
      if (!a.driveLink) continue;
      const fid = extractFolderId(a.driveLink);
      if (fid) existingFolderIds.add(fid);
    }
    return {
      otherWorkspaceFolders,
      existingFolderIds,
      existingStageNames: stages.filter(st => st.projectId === 'general').map(st => st.name),
      existingGroupNames: canvasElements
        .filter(el => el.type === 'bin' && !el.board)
        .map(el => binLabelOf(el)),
    };
  }, [projects, currentProjectId, apartments, stages, canvasElements]);

  function downloadTemplate() {
    saveAs(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }), 'jobs-import-template.csv');
  }

  async function pickFile(f: File | undefined | null) {
    if (!f) return;
    const rows = parseTemplateCsv(await f.text());
    if (!rows.length) {
      onToast('That file has no template columns — download the template and fill it in', 'error');
      return;
    }
    setFileName(f.name);
    setDone(null);
    setPlan(null);
    // Blank family names are read from the Drive folder titles, in gentle
    // chunks — the wizard has the service account's permission, the sheet
    // does not need retyping what Drive already knows.
    const need = rows.filter(r => !r.family && r.driveUrl && extractFolderId(r.driveUrl));
    if (need.length && isUploadBackendConfigured()) {
      setEnriching({ done: 0, total: need.length });
      const CHUNK = 5;
      for (let i = 0; i < need.length; i += CHUNK) {
        await Promise.all(need.slice(i, i + CHUNK).map(async r => {
          const fid = extractFolderId(r.driveUrl)!;
          const name = await getFolderNameViaBackend(fid).catch(() => null);
          if (name) r.family = familyNameFromFolderName(name);
        }));
        setEnriching({ done: Math.min(i + CHUNK, need.length), total: need.length });
      }
      setEnriching(null);
    }
    setPlan(planImport(rows, ctx));
    setExcluded(new Set());
  }

  const sections = useMemo(() => {
    if (!plan) return [];
    const by = new Map<string, { label: string; idx: number[] }>();
    plan.planned.forEach((p, i) => {
      const label = (p.groupName ? `${p.groupName} group` : 'Open board')
        + (p.stageName ? ` — stage "${p.stageName}"` : '');
      const sc = by.get(label) ?? { label, idx: [] };
      sc.idx.push(i);
      by.set(label, sc);
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

  async function apply() {
    if (!plan || !currentUser || busy) return;
    setBusy(true);
    setStep({ label: 'Reading the file', done: 0, total: 0 });
    try {
      const taking = plan.planned.filter((_, i) => !excluded.has(i));
      const now = new Date().toISOString();

      // Stages by name among this workspace's own, created when missing.
      const generalStages = () => useStore.getState().stages.filter(st => st.projectId === 'general');
      const stageIdByName = new Map<string, string>();
      for (const name of [...new Set(taking.map(t => t.stageName).filter((n): n is string => !!n))]) {
        const have = generalStages().find(st => st.name.trim().toLowerCase() === name.toLowerCase());
        if (have) { stageIdByName.set(name.toLowerCase(), have.id); continue; }
        const id = 's' + Math.random().toString(36).slice(2, 8);
        const maxOrder = Math.max(0, ...generalStages().map(st => st.order));
        addStage({
          id, name, color: '#64748b', order: maxOrder + 1, active: true,
          projectId: 'general', createdAt: now, updatedAt: now,
        });
        stageIdByName.set(name.toLowerCase(), id);
      }

      // Groups by label — built-ins answer to their labels too; an unknown
      // label becomes a real group beside the seeded four.
      const groupKeyByName = new Map<string, string>();
      const wantedGroups = [...new Set(taking.map(t => t.groupName).filter(Boolean))];
      wantedGroups.forEach((name, gi) => {
        const els = useStore.getState().canvasElements;
        const have = els.find(el =>
          el.type === 'bin' && !el.board
          && binLabelOf(el).trim().toLowerCase() === name.toLowerCase());
        if (have) { groupKeyByName.set(name.toLowerCase(), binKeyOf(have)); return; }
        const el: CanvasElement = {
          id: 'CE-bin-' + Math.random().toString(36).slice(2, 8),
          type: 'bin',
          x: GAP + PER_ROW * (TILE_W + GAP) + 40,
          y: GAP + (4 + gi) * (BIN_H + 12),
          w: BIN_W, h: BIN_H,
          text: name,
          // The slate the built-in Archive group wears, not amber. A group the
          // import made used to be the one yellow thing on the board, which read
          // as a warning rather than as a group.
          color: BIN_META.archive.color,
          addedAt: now,
        };
        addCanvasElement(el);
        groupKeyByName.set(name.toLowerCase(), binKeyOf(el));
      });

      const onBoard = useStore.getState().apartments
        .filter(a => a.buildingId === 'G' && !a.isUnnamed && !a.boardBin).length;
      let seq = 0;
      const stamp = Date.now();
      const jobs: Apartment[] = taking.map((t, i) => {
        const slot = onBoard + seq++;
        const bin = t.groupName ? groupKeyByName.get(t.groupName.toLowerCase()) : undefined;
        return {
          id: `G-imp-${stamp}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          buildingId: 'G', apartmentNumber: '',
          displayName: t.family, floor: 0, colPosition: 1, colSpan: 1,
          isDuplexApt: false,
          currentStageId: t.stageName ? (stageIdByName.get(t.stageName.toLowerCase()) ?? null) : null,
          classification: 'standard', shinuiDetails: null,
          generalNotes: t.notes, isUnnamed: false,
          driveLink: t.driveUrl || undefined,
          zohoLink: t.zoho || undefined,
          address: t.address || undefined,
          phone: t.phone || undefined,
          boardBin: bin,
          binnedAt: bin ? now : undefined,
          canvasX: GAP + (slot % PER_ROW) * (TILE_W + GAP),
          canvasY: GAP + Math.floor(slot / PER_ROW) * (TILE_H + GAP),
          createdAt: now, updatedAt: now, contentUpdatedAt: now,
          updatedBy: currentUser.id, updatedByName: currentUser.name,
        };
      });

      setStep({ label: 'Creating the jobs', done: 0, total: jobs.length });
      importJobs(jobs);

      /**
       * An imported job has to BE a job, and that includes its Drive folder.
       *
       * Saving a link by hand opens that job's Engineered Plans and Photos
       * folders so everyone can see them; the import used to skip it, which
       * would have left several hundred jobs whose plans only opened for
       * whoever happened to be signed in. Awaited in small groups, with the
       * count on screen, because this is the slow half and finishing quietly in
       * the background is what makes an import feel like it did not work.
       */
      const linked = jobs.map(j => j.driveLink).filter((u): u is string => !!u);
      if (linked.length) {
        setStep({ label: 'Opening their plans and photos in Drive', done: 0, total: linked.length });
        for (let i = 0; i < linked.length; i += 5) {
          await Promise.all(linked.slice(i, i + 5).map(u => shareJobFolderSurfacesNow(u)));
          setStep({
            label: 'Opening their plans and photos in Drive',
            done: Math.min(i + 5, linked.length), total: linked.length,
          });
        }
      }

      const summary = `${jobs.length} job${jobs.length === 1 ? '' : 's'} imported`;
      setDone(summary);
      setPlan(null);
      setFileName('');
      onToast(summary);
    } finally {
      setBusy(false);
      setStep(null);
    }
  }

  function clearBatch(stamp: string) {
    setClearing(stamp);
    try {
      const n = removeJobsByIdPrefix(stamp ? `G-imp-${stamp}-` : 'G-imp-');
      onToast(`${n} imported job${n === 1 ? '' : 's'} removed — everything made by hand is untouched`);
    } finally {
      setClearing(null);
      setConfirmClear(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5 mt-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Upload size={15} className="text-[#1e3a5f]" /> Import jobs
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Download the template, fill a row per job, upload it back. Leave the family name
            blank and it is read from the Drive folder&apos;s own title. Stage and Group come from
            your columns; nothing is written until you press Apply.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Download size={13} /> Template
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 py-2 rounded-lg bg-[#1e3a5f] text-white text-xs font-semibold hover:bg-[#162d4a]"
          >
            Upload filled template…
          </button>
        </div>
      </div>
      <input
        ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
        onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ''; }}
      />

      {importBatches.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 divide-y divide-amber-100">
          {importBatches.map(b => {
            const label = b.stamp
              ? new Date(b.when).toLocaleString(undefined,
                  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
              : 'earlier import';
            const asking = confirmClear === b.stamp;
            return (
              <div key={b.stamp || 'legacy'} className="flex items-center gap-2 flex-wrap text-xs px-3 py-2">
                <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
                <span className="text-amber-800 flex-1 min-w-[170px]">
                  Import from <b>{label}</b> — {b.count} job{b.count === 1 ? '' : 's'}
                  {b.edited > 0 && <> · <b>{b.edited} edited since</b></>}
                </span>
                {asking ? (
                  <span className="flex items-center gap-1.5">
                    <button onClick={() => clearBatch(b.stamp)} disabled={clearing !== null}
                      className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50">
                      {clearing === b.stamp ? 'Removing…'
                        : b.edited > 0
                          ? `Remove ${b.count} (incl. ${b.edited} edited)`
                          : `Yes, remove ${b.count}`}
                    </button>
                    <button onClick={() => setConfirmClear(null)} className="px-2 py-1.5 text-gray-500">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmClear(b.stamp)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-800 font-semibold hover:bg-amber-100">
                    <Trash2 size={12} /> Remove this import
                  </button>
                )}
              </div>
            );
          })}
          <p className="px-3 py-1.5 text-[10.5px] text-amber-700/80">
            Removing an import deletes exactly those jobs, on every device. Anything made by hand is never touched.
          </p>
        </div>
      )}

      {enriching && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
          <Loader2 size={13} className="animate-spin" />
          Reading family names from Drive folders… {enriching.done}/{enriching.total}
        </div>
      )}

      {/* The import, while it runs. A full-screen hold on purpose: it creates
          hundreds of records and opens hundreds of Drive folders, and wandering
          off to the board halfway through is how you end up with half of it. */}
      {step && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl px-6 py-5">
            <div className="flex items-center gap-2 mb-1">
              <Loader2 size={16} className="animate-spin text-[#1e3a5f]" />
              <h3 className="text-[15px] font-bold text-gray-900">Importing</h3>
            </div>
            <p className="text-[13px] text-gray-600 mb-3">{step.label}…</p>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{
                  width: step.total ? `${Math.round((step.done / step.total) * 100)}%` : '35%',
                  background: 'linear-gradient(90deg, #1e3a5f, #4aa8d8)',
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px] text-gray-500 tabular-nums">
              <span>{step.total ? `${step.done} of ${step.total}` : 'Working…'}</span>
              <span>Please leave this open until it finishes</span>
            </div>
          </div>
        </div>
      )}

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
            {plan.skipped.length > 0 && (
              <button
                onClick={() => setShowSkipped(v => !v)}
                className="rounded-full bg-gray-100 text-gray-600 font-medium px-2 py-0.5 hover:bg-gray-200"
              >
                {plan.skipped.length} skipped {showSkipped ? '▴' : '▾'}
              </button>
            )}
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

          {showSkipped && plan.skipped.length > 0 && (
            <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 max-h-44 overflow-y-auto">
              {plan.skipped.map((sk, i) => (
                <div key={i} className="text-[11px] text-gray-600 py-0.5 truncate">
                  <b>{sk.label}</b> — {sk.reason}
                </div>
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
                      onClick={() => setExcluded(prev => {
                        const allOut = sec.idx.every(i => prev.has(i));
                        const next = new Set(prev);
                        sec.idx.forEach(i => { if (allOut) next.delete(i); else next.add(i); });
                        return next;
                      })}
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

/** One row in the preview. Cheap on purpose — there can be six hundred. */
function Row({ p, taken, onToggle }: { p: PlannedJob; taken: boolean; onToggle: () => void }) {
  return (
    <label className={`flex items-center gap-2 px-2.5 py-1.5 border-b border-gray-50 last:border-b-0 cursor-pointer ${taken ? '' : 'opacity-45'}`}>
      <input type="checkbox" checked={taken} onChange={onToggle} className="flex-shrink-0 accent-[#1e3a5f]" />
      <span className="text-xs font-semibold text-gray-800 flex-shrink-0 max-w-[150px] truncate">{p.family || '(no name)'}</span>
      <span className="text-[11px] text-gray-400 truncate flex-1 min-w-[70px]">{p.address || p.notes}</span>
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
