import React, { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, X, Link2, FolderOpen, Trash2, Upload } from 'lucide-react';
import { useStore } from '../../data/store';
import {
  extractFileId, extractFolderId, getDriveMetaViaBackend, findOrCreateFolderOnce, uploadFileViaResumableSession,
  shareFileToDrive, isUploadBackendConfigured,
} from '../../data/driveApi';
import type { StandardPlan } from '../../types';
import { sharePlanFile } from '../../data/sharePlan';
import { PlanPicker } from '../plans/PlanPicker';

const PlanAnnotator = React.lazy(() =>
  import('../plans/PlanAnnotator').then(m => ({ default: m.PlanAnnotator })));

/**
 * THE STANDARD PLAN BUTTON (owner, recording 2026-11-10 144934): under each building's number in the Building view —
 * "one button, two button, three button" — and as a small bubble on top of a single building. A press opens the
 * building's plan full screen in the same viewer the File Tray uses (zoom, pages, Share: "very well coded"); a
 * RIGHT-click (a long press on a phone) opens the box that sets it — paste a Drive link, or browse the Drive with the
 * plan picker and choose the plan with the star. Kept per workspace and building (BoardSetting.standardPlans), so
 * Wolfson, Netiv and every workspace after them each have their own.
 *
 * PER FLOOR (owner, 2026-11-11: "the plan changes every floor. So every floor has to have its own"): the button
 * speaks for the floor the building view stands on — its plan is that floor's (standardPlansByFloor), and a floor
 * with none falls back to the building's. Pasting a link opens the Plan Finder on that folder (a file link: the
 * folder it lives in, the file lit), "so I can search the exact file" (recording 2026-11-11 094048).
 */
export function StandardPlanButton({ buildingId, buildingTitle, bubble, floorKey, floorLabel }: {
  buildingId: string;
  /** The floor the view stands on — the plan is kept per floor. */
  floorKey: string;
  floorLabel: string;
  /** "1", "B2" — said in the viewer's and the box's title. */
  buildingTitle: string;
  /** The single-building view's small round bubble, rather than the trio's label-width button. */
  bubble?: boolean;
}) {
  const rtl = useStore(st => !!st.mainUiStrings.isRtl);
  const own = useStore(st => st.boardSettings[st.currentProjectId]?.standardPlansByFloor?.[buildingId]?.[floorKey]);
  const whole = useStore(st => st.boardSettings[st.currentProjectId]?.standardPlans?.[buildingId]);
  const plan = own ?? whole;
  const where = `${buildingTitle} · ${rtl ? 'קומה' : 'Floor'} ${floorLabel}`;
  const [view, setView] = useState(false);
  const [setup, setSetup] = useState(false);
  const press = useRef<{ t: number; timer: number } | null>(null);
  const word = rtl ? 'תוכנית טיפוסית' : 'Standard plan';

  const openSetup = () => { setView(false); setSetup(true); };
  return (
    <>
      <button type="button" data-standard-plan={buildingId} data-standard-plan-floor={floorKey} data-standard-plan-set={plan ? '1' : '0'}
        title={plan ? `${word} · ${where} — ${plan.name}` : `${word} · ${where}`}
        onClick={e => { e.stopPropagation(); if (press.current?.t === -1) { press.current = null; return; } if (plan) setView(true); else openSetup(); }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openSetup(); }}
        // A finger has no right-click: a long press opens the box.
        onPointerDown={e => {
          if (e.pointerType === 'mouse') return;
          const timer = window.setTimeout(() => { press.current = { t: -1, timer: 0 }; openSetup(); }, 550);
          press.current = { t: Date.now(), timer };
        }}
        onPointerUp={() => { if (press.current && press.current.t !== -1) { window.clearTimeout(press.current.timer); press.current = null; } }}
        onPointerLeave={() => { if (press.current && press.current.t !== -1) { window.clearTimeout(press.current.timer); press.current = null; } }}
        className={bubble ? 'bv-plan-btn bv-plan-bubble' : 'bv-plan-btn'}>
        <FileText size={bubble ? 13 : 12} />
        <span>{word}</span>
        {!plan && <span className="bv-plan-dot" aria-hidden />}
      </button>
      {view && plan && <PlanViewer plan={plan} title={`${word} · ${where}`} onClose={() => setView(false)} onChange={openSetup} rtl={rtl} />}
      {setup && <PlanSetup buildingId={buildingId} buildingTitle={where} floorKey={floorKey} current={plan} ownFloor={!!own} onClose={() => setSetup(false)} rtl={rtl}
        onOpen={() => { setSetup(false); setView(true); }} />}
    </>
  );
}

/** Full screen, the File Tray's read-only studio: zoom, pages, Share. */
function PlanViewer({ plan, title, onClose, onChange, rtl }: { plan: StandardPlan; title: string; onClose: () => void; onChange: () => void; rtl: boolean }) {
  const me = useStore(st => st.currentUser?.name ?? '');
  // Share, as in the job window's plan ("with the share and everything").
  const [sharing, setSharing] = useState(false);
  const [said, setSaid] = useState('');
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    const out = await sharePlanFile(plan.fileId, plan.name, title);
    setSharing(false);
    setSaid(out === 'failed' ? (rtl ? 'השיתוף נכשל' : 'Sharing failed') : out === 'downloaded' ? (rtl ? 'הקובץ הורד' : 'Downloaded') : '');
  };
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      // A plan of several pages (owner, 2026-11-11: "each PDF has a few pages … moving between the pages"): the
      // arrows and Page Up / Down turn them, beside the bar's own buttons.
      const next = e.key === 'ArrowRight' || e.key === 'PageDown';
      const prev = e.key === 'ArrowLeft' || e.key === 'PageUp';
      if (!next && !prev) return;
      const btn = rootRef.current?.querySelector<HTMLButtonElement>(`button[title="${next ? 'Next page' : 'Previous page'}"]`);
      if (btn && !btn.disabled) { e.preventDefault(); e.stopPropagation(); btn.click(); }
    };
    window.addEventListener('keydown', key, { capture: true });
    return () => window.removeEventListener('keydown', key, { capture: true });
  }, [onClose]);
  const seal = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onWheel: (e: React.WheelEvent) => e.stopPropagation(),
    onContextMenu: (e: React.MouseEvent) => e.stopPropagation(),
  };
  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-[240] flex flex-col" data-standard-plan-viewer {...seal} style={{ backgroundColor: 'rgba(10,16,28,.88)' }}>
      <div className="flex items-center gap-2 px-3 md:px-5 py-2.5 flex-shrink-0" style={{ backgroundColor: '#1e3a5f' }}>
        <span className="text-white font-bold text-[14px] truncate">{title}</span>
        <span className="text-white/60 text-[12.5px] truncate flex-1" dir="auto">{plan.name}</span>
        {said && <span className="text-white/80 text-[12px]" data-standard-plan-said>{said}</span>}
        <button type="button" data-standard-plan-change onClick={onChange}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-white text-[12px] font-bold hover:bg-white/20">
          {rtl ? 'החלפה' : 'Change'}
        </button>
        <button type="button" onClick={onClose} aria-label={rtl ? 'סגירה' : 'Close'} data-standard-plan-close className="p-2 rounded-xl text-white/80 hover:bg-white/10"><X size={17} /></button>
      </div>
      <div className="flex-1 min-h-0 relative">
        <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center gap-2 text-white/80 text-sm"><Loader2 size={16} className="animate-spin" /> {rtl ? 'פותח…' : 'Opening…'}</div>}>
          <PlanAnnotator planFileId={plan.fileId} planName={plan.name} apartmentId={`SP-${plan.fileId}`} apartmentLabel={title}
            authorName={me} embedded readOnly onClose={onClose} onShare={() => void share()} shareBusy={sharing} />
        </Suspense>
      </div>
    </div>,
    document.body,
  );
}

/** The box that sets it: paste a Drive link (a file is the plan; a folder opens the picker), or browse, or remove. */
function PlanSetup({ buildingId, buildingTitle, floorKey, current, ownFloor, onClose, onOpen, rtl }: {
  buildingId: string; buildingTitle: string; floorKey: string; current?: StandardPlan; ownFloor: boolean;
  onClose: () => void; onOpen: () => void; rtl: boolean;
}) {
  const setting = useStore(st => st.boardSettings[st.currentProjectId]);
  const setBoardSetting = useStore(st => st.setBoardSetting);
  const me = useStore(st => st.currentUser?.name ?? '');
  const [link, setLink] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [browse, setBrowse] = useState<string | null>(null);   // a folder link to browse
  /** A pasted FILE: lit in the finder, in the folder it lives in. */
  const [lit, setLit] = useState<string | null>(null);
  /** "Use for every floor of this building" — the building's own plan, under any floor without one. */
  const [allFloors, setAllFloors] = useState(false);
  /** An upload going up: its percent. */
  const [upPct, setUpPct] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * UPLOAD A PDF DIRECTLY (owner, 2026-11-11: "either choose by drive link or to upload a PDF directly"). It goes
   * into the folder the standard plans were last chosen from; with none, into the office's general Drive folder
   * (Settings → Backups) › Standard plans › <workspace>. With neither, it says so — never a silent drop.
   */
  const upload = async (file: File) => {
    setErr('');
    const st = useStore.getState();
    if (!isUploadBackendConfigured()) { setErr(W('Uploading needs the Drive connection', 'להעלאה צריך חיבור ל-Drive')); return; }
    const remembered = st.boardSettings[st.currentProjectId]?.standardPlansFolder;
    const general = st.backupDriveFolderLink ? extractFolderId(st.backupDriveFolderLink) : null;
    setUpPct(0);
    try {
      let folderId = remembered ? extractFolderId(remembered) : null;
      if (!folderId && general) {
        const root = await findOrCreateFolderOnce(general, 'Standard plans');
        const ws = st.projects?.find?.((x: { id: string; name?: string }) => x.id === st.currentProjectId)?.name || st.currentProjectId;
        folderId = await findOrCreateFolderOnce(root, String(ws).replace(/[\\/:*?"<>|]+/g, '-'));
      }
      if (!folderId) {
        setUpPct(null);
        setErr(W('No Drive folder to upload into yet: paste a folder link once, or set the general folder in Settings → Backups',
          'אין עדיין תיקיית Drive להעלאה: הדביקו פעם אחת קישור לתיקייה, או הגדירו תיקייה כללית בהגדרות ← גיבויים'));
        return;
      }
      const { fileId } = await uploadFileViaResumableSession(folderId, file, pct => setUpPct(pct));
      void shareFileToDrive(fileId);
      setUpPct(null);
      save({ fileId, name: file.name, mimeType: file.type || undefined, by: me, at: new Date().toISOString() });
      onOpen();
    } catch {
      setUpPct(null);
      setErr(W('The upload failed — try again', 'ההעלאה נכשלה — נסו שוב'));
    }
  };
  const W = (en: string, he: string) => (rtl ? he : en);
  useEffect(() => {
    if (browse) return undefined;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, { capture: true });
    return () => window.removeEventListener('keydown', key, { capture: true });
  }, [onClose, browse]);

  const save = (p: StandardPlan | null, folderLink?: string) => {
    const fresh = useStore.getState().boardSettings[useStore.getState().currentProjectId] ?? {};
    const byFloor = { ...(fresh.standardPlansByFloor ?? {}) };
    const mine = { ...(byFloor[buildingId] ?? {}) };
    const whole = { ...(fresh.standardPlans ?? {}) };
    if (p && allFloors) { whole[buildingId] = p; delete mine[floorKey]; }
    else if (p) mine[floorKey] = p;
    else if (ownFloor) delete mine[floorKey];
    else delete whole[buildingId];
    byFloor[buildingId] = mine;
    setBoardSetting('standardPlansByFloor', byFloor);
    setBoardSetting('standardPlans', whole);
    if (folderLink) setBoardSetting('standardPlansFolder', folderLink);
  };

  const useLink = async (pasted?: string) => {
    setErr('');
    const raw = (pasted ?? link).trim();
    if (!raw) return;
    // A folder link (…/folders/…) opens the picker inside it; anything else is read as a file.
    const folder = /\/folders\//.test(raw) ? extractFolderId(raw) : null;
    if (folder) { setBrowse(raw); return; }
    const fileId = extractFileId(raw) ?? (/^[\w-]{20,}$/.test(raw) ? raw : null);
    if (!fileId) { setErr(W('That is not a Google Drive link', 'זה לא קישור של Google Drive')); return; }
    setBusy(true);
    const meta = await getDriveMetaViaBackend(fileId);
    setBusy(false);
    // A link to a folder that does not say /folders/ — and a file opens the folder it lives in, the file lit.
    if (meta?.mimeType === 'application/vnd.google-apps.folder') { setBrowse(`https://drive.google.com/drive/folders/${fileId}`); return; }
    if (meta?.parent) { setLit(fileId); setBrowse(`https://drive.google.com/drive/folders/${meta.parent}`); return; }
    save({ fileId, name: meta?.name ?? W('Standard plan', 'תוכנית טיפוסית'), by: me, at: new Date().toISOString() });
    onOpen();
  };

  const startFolder = browse ?? setting?.standardPlansFolder ?? null;
  return createPortal(
    <div className="fixed inset-0 z-[230] bg-black/40 flex items-center justify-center p-4" data-standard-plan-setup
      onClick={onClose} onContextMenu={e => e.preventDefault()}>
      {!browse && (
        <div className="w-full max-w-[440px] rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} dir={rtl ? 'rtl' : 'ltr'}>
          <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ backgroundColor: '#1e3a5f' }}>
            <b className="flex-1 truncate">{W(`Standard plan · Building ${buildingTitle}`, `תוכנית טיפוסית · בניין ${buildingTitle}`)}</b>
            <button type="button" onClick={onClose} aria-label={W('Close', 'סגירה')} className="p-1 rounded-lg hover:bg-white/10"><X size={16} /></button>
          </div>
          <div className="p-4 space-y-3">
            {current && (
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2" data-standard-plan-current>
                <FileText size={15} className="text-[#1e3a5f] flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate text-[13px] font-semibold" dir="auto">{current.name}</span>
                <button type="button" onClick={onOpen} className="text-[12px] font-bold text-[#1e3a5f] underline">{W('Open', 'פתיחה')}</button>
                <button type="button" data-standard-plan-remove onClick={() => { save(null); onClose(); }} title={W('Remove', 'הסרה')}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
              </div>
            )}
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{W('Paste a Drive link', 'הדביקו קישור Drive')}</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 focus-within:ring-2 focus-within:ring-[#1e3a5f]/30">
                <Link2 size={14} className="text-gray-400 flex-shrink-0" />
                <input data-standard-plan-link autoFocus value={link} onChange={e => setLink(e.target.value)} dir="ltr"
                  // "Once I paste the drive link, it should open up that folder" — no second press.
                  onPaste={e => { const t = e.clipboardData.getData('text'); if (t.trim()) { e.preventDefault(); setLink(t.trim()); void useLink(t); } }}
                  onKeyDown={e => { if (e.key === 'Enter') void useLink(); }}
                  placeholder="https://drive.google.com/…" className="flex-1 min-w-0 py-2.5 text-[13px] outline-none bg-transparent" />
              </div>
              <button type="button" data-standard-plan-use disabled={!link.trim() || busy} onClick={() => void useLink()}
                className="px-4 rounded-xl text-white text-[13px] font-bold disabled:opacity-40" style={{ backgroundColor: '#1e3a5f' }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : W('Use', 'אישור')}
              </button>
            </div>
            {err && <div className="text-[12.5px] text-red-600" data-standard-plan-err>{err}</div>}
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700">
              <input type="checkbox" data-standard-plan-all checked={allFloors} onChange={e => setAllFloors(e.target.checked)} />
              {W('Use for every floor of this building', 'לכל הקומות בבניין הזה')}
            </label>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" data-standard-plan-file
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
            <button type="button" data-standard-plan-upload disabled={upPct != null} onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-bold text-[#1e3a5f] hover:bg-gray-50 disabled:opacity-60">
              {upPct != null ? <><Loader2 size={15} className="animate-spin" /> {W(`Uploading… ${Math.round(upPct)}%`, `מעלה… ${Math.round(upPct)}%`)}</>
                : <><Upload size={15} /> {W('Upload a PDF', 'העלאת PDF')}</>}
            </button>
            {startFolder && (
              <button type="button" data-standard-plan-browse onClick={() => setBrowse(startFolder)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-[13px] font-bold text-[#1e3a5f] hover:bg-gray-50">
                <FolderOpen size={15} /> {W('Choose from Drive', 'בחירה מ-Drive')}
              </button>
            )}
          </div>
        </div>
      )}
      {browse && (
        <div onClick={e => e.stopPropagation()}>
          <PlanPicker
            driveLink={browse}
            plansFolderId={extractFolderId(browse)}
            plansFolderName={W('Drive folder', 'תיקיית Drive')}
            plans={[]}
            current={lit ?? current?.fileId}
            starredId={current?.fileId ?? null}
            onClose={() => { setBrowse(null); setLit(null); }}
            // "Choose the plan with the star" (S9) — and a plain press chooses it too.
            onStar={p => { save({ fileId: p.id, name: p.name, by: me, at: new Date().toISOString() }, browse); onOpen(); }}
            onPick={p => { save({ fileId: p.id, name: p.name, by: me, at: new Date().toISOString() }, browse); onOpen(); }}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
