import { Apartment, CanvasElement, BIN_META, binLabelOf, binKeyOf, AutoJobsSetting } from '../types';
import { useStore, loadProjectSnapshot } from './store';
import { fsGetTombstones, isFirebaseConfigured } from './firebase';
import {
  isUploadBackendConfigured, extractFolderId, listPlanSubfoldersViaBackend,
  familyNameFromFolderName, shareJobFolderSurfacesNow,
} from './driveApi';

/**
 * THE DRIVE SWEEP (owner, 2026-09-07): "every time a folder gets opened up in
 * Google Drive in the Potentials folder … every two hours a little sift
 * through … we copy it in as a job, and it just pulls in the info from the
 * Drive link just like it does today … a new group called New Jobs Came In".
 *
 * Every subfolder of every watched folder that no job in ANY workspace is
 * linked to becomes a Job Board job: the family from the folder's title,
 * the folder as its Drive link, its Plans and Photos surfaces shared, filed
 * into the "New Jobs Came In" group. Rules:
 *  - The job's id IS the folder's id (`G-auto-<folderId>`), so two office
 *    machines sweeping at once write the same document, never two jobs.
 *  - A job the office deleted stays deleted: the Job Board's tombstones are
 *    read first, and a tombstoned id is never re-minted.
 *  - The sweep runs from whichever workspace is open and always writes to the
 *    Job Board (`addJobsToProject`), so standing in Wolfson is no excuse.
 *  - Nothing is destroyed, ever; it only ever adds.
 */
export const AUTO_JOBS_GROUP = 'New Jobs Came In';
export const AUTO_JOBS_GROUP_ID = 'CE-bin-newjobs';
export const AUTO_JOBS_EVERY_MS = 2 * 60 * 60 * 1000;
const TILE_W = 215, TILE_H = 132, GAP = 22, PER_ROW = 4;

let running: Promise<SweepResult> | null = null;
export interface SweepResult { created: number; skipped: number; note: string; names: string[] }

export function autoJobsSetting(): AutoJobsSetting | undefined {
  return useStore.getState().boardSettings.general?.autoJobs;
}

/** True when the timer should run a sweep now. */
export function sweepDue(now = Date.now()): boolean {
  const s = autoJobsSetting();
  if (!s?.on || !s.folders?.length) return false;
  const last = s.lastRunAt ? Date.parse(s.lastRunAt) : 0;
  return now - last >= AUTO_JOBS_EVERY_MS;
}

export function sweepAutoJobs(reason: 'timer' | 'manual'): Promise<SweepResult> {
  if (running) return running;
  running = doSweep(reason).finally(() => { running = null; });
  return running;
}

async function doSweep(reason: 'timer' | 'manual'): Promise<SweepResult> {
  const st = useStore.getState();
  const setting = autoJobsSetting() ?? { on: false, folders: [] };
  const fail = (note: string): SweepResult => ({ created: 0, skipped: 0, note, names: [] });
  if (reason === 'timer' && !setting.on) return fail('off');
  const watched = (setting.folders ?? []).map(extractFolderId).filter((x): x is string => !!x);
  if (!watched.length) return fail('No folder links to watch.');
  if (!isUploadBackendConfigured()) return fail('The Drive backend is not configured on this deployment.');

  // Every folder any workspace already has a job for — the cross-workspace
  // guard the import carries too.
  const linked = new Set<string>();
  const pids = [...new Set([...st.projects.map(p => p.id), 'general'])];
  for (const pid of pids) {
    const apts = pid === st.currentProjectId ? st.apartments : loadProjectSnapshot(pid).apartments;
    for (const a of apts) { const id = a.driveLink ? extractFolderId(a.driveLink) : null; if (id) linked.add(id); }
  }
  const dead = isFirebaseConfigured ? await fsGetTombstones('general').catch(() => new Set<string>()) : new Set<string>();

  const found: { id: string; name: string }[] = [];
  let unreachable = 0;
  for (const fid of watched) {
    const kids = await listPlanSubfoldersViaBackend(fid);
    if (!kids.length) { unreachable++; continue; }
    for (const k of kids) if (!linked.has(k.id) && !dead.has(`G-auto-${k.id}`) && !found.some(f => f.id === k.id)) found.push({ id: k.id, name: k.name });
  }

  const now = new Date().toISOString();
  const general = st.currentProjectId === 'general'
    ? { apartments: st.apartments, canvasElements: st.canvasElements }
    : loadProjectSnapshot('general');
  const existing = new Set(general.apartments.map(a => a.id));
  const fresh = found.filter(f => !existing.has(`G-auto-${f.id}`));

  // The group — found by its label (built-ins answer to theirs too), else
  // minted once under a FIXED id so a Firestore echo overwrites rather than
  // duplicates (the seeded bins' idiom).
  let group = general.canvasElements.find(el => el.type === 'bin' && !el.board
    && binLabelOf(el).trim().toLowerCase() === AUTO_JOBS_GROUP.toLowerCase());
  let newGroup: CanvasElement | undefined;
  if (!group) {
    newGroup = {
      id: AUTO_JOBS_GROUP_ID, type: 'bin',
      x: GAP + PER_ROW * (TILE_W + GAP) + 40, y: GAP,
      w: 178, h: 92, text: AUTO_JOBS_GROUP, color: BIN_META.ready.color, addedAt: now,
    } as CanvasElement;
    group = newGroup;
  }
  const bin = binKeyOf(group);

  const onBoard = general.apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed && !a.boardBin).length;
  const jobs: Apartment[] = fresh.map((f, i) => {
    const slot = onBoard + i;
    return {
      id: `G-auto-${f.id}`,
      buildingId: 'G', apartmentNumber: '',
      displayName: familyNameFromFolderName(f.name) || f.name, floor: 0, colPosition: 1, colSpan: 1,
      isDuplexApt: false, currentStageId: null, classification: 'standard', shinuiDetails: null,
      generalNotes: '', isUnnamed: false,
      driveLink: `https://drive.google.com/drive/folders/${f.id}`,
      boardBin: bin, binnedAt: now,
      canvasX: GAP + (slot % PER_ROW) * (TILE_W + GAP),
      canvasY: GAP + Math.floor(slot / PER_ROW) * (TILE_H + GAP),
      createdAt: now, updatedAt: now, contentUpdatedAt: now,
    } as Apartment;
  });

  if (jobs.length || newGroup) useStore.getState().addJobsToProject('general', jobs, newGroup);

  // The folder's Plans and Photos open up for everyone, exactly as a pasted
  // link does — in threes, so a first sweep over a big folder stays gentle.
  for (let i = 0; i < jobs.length; i += 3) {
    await Promise.all(jobs.slice(i, i + 3).map(j => shareJobFolderSurfacesNow(j.driveLink).catch(() => false)));
  }

  const note = unreachable === watched.length && !found.length
    ? 'Drive would not list the watched folders — check they are shared with the service account.'
    : `${jobs.length} new job${jobs.length === 1 ? '' : 's'}${unreachable ? ` · ${unreachable} folder${unreachable === 1 ? '' : 's'} could not be read` : ''}`;
  useStore.getState().setBoardSettingFor('general', 'autoJobs', { ...setting, folders: setting.folders ?? [], lastRunAt: now, lastNote: note });
  return { created: jobs.length, skipped: found.length - fresh.length, note, names: jobs.map(j => j.displayName) };
}
