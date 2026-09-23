/**
 * LIVE FROM SITE — every workspace's pictures and films, one list.
 *
 * The photo widgets read `c.photos`, which is the OPEN workspace's uploads
 * and nothing else. The wall stands on the Job Board while the workers close
 * their tasks on Wolfson and Netiv, so a picture that came in seconds ago
 * landed in `wolfson_contractorPhotos` and a Job Board widget never saw it
 * — the owner's "nothing shows up there the second it comes in" (2026-09-23).
 *
 * This reads the open workspace live from the store and every other one
 * from its snapshot, which the foreign sync keeps current (it carries
 * `contractorPhotos` now), re-reading on `snapshotTick`. A shot knows its
 * workspace, its job and who sent it, so a tile can say all three.
 */
import { useMemo } from 'react';
import type { Apartment, ContractorAssignment, ContractorPhoto, Contractor, Project } from '../types';
import { aptLabel, projectColor, projectShortName } from '../types';
import { useStore, loadProjectSnapshot } from './store';
import { photoSrcOf } from './photoSrc';
import { mediaKindOf } from './mediaKind';
import type { ViewerItem } from '../components/ui/MediaViewer';

export type ShotKind = 'image' | 'video';

export interface SiteShot {
  id: string;
  photo: ContractorPhoto;
  kind: ShotKind;
  projectId: string;
  /** The workspace's short name, in the reader's language. */
  projectLabel: string;
  projectColor: string;
  jobId: string;
  jobName: string;
  who: string;
  /** ISO — when it came in. */
  at: string;
  /** An address a tile can draw: a real image for a picture, a first-frame thumbnail for a Drive film. */
  thumb: string;
  /** An address a <video> can play — Firebase Storage or a local data URL; a Drive film has none (its bytes are fetched on open). */
  playable: string;
}

/**
 * A picture or a film — never a document. The record's own `fileType` wins;
 * without one the NAME decides (Drive's mime lies about CAD, the standing
 * rule), and a nameless, typeless record is an old picture.
 */
export function shotKindOf(p: Pick<ContractorPhoto, 'fileType' | 'mimeType' | 'filename'>): ShotKind | null {
  if (p.fileType === 'video') return 'video';
  if (p.fileType === 'file') return null;
  if (p.fileType === 'image') return 'image';
  const k = mediaKindOf(p.filename, p.mimeType);
  if (k === 'video') return 'video';
  if (k === 'image') return 'image';
  return p.mimeType ? null : 'image';
}

/** A time that sorts: the upload stamp, or nothing. */
function stampOf(p: ContractorPhoto): string { return p.uploadedAt ?? ''; }

export function collectSiteShots(src: {
  photos: ContractorPhoto[];
  assignments: ContractorAssignment[];
  apartments: Apartment[];
  contractors: Contractor[];
  projectId: string;
  projectLabel: string;
  projectColor: string;
}): SiteShot[] {
  const asgById = new Map(src.assignments.map(a => [a.id, a]));
  const aptById = new Map(src.apartments.map(a => [a.id, a]));
  const conById = new Map(src.contractors.map(c => [c.id, c.name]));
  const out: SiteShot[] = [];
  for (const p of src.photos) {
    const kind = shotKindOf(p);
    if (!kind) continue;
    const playable = p.storageUrl || p.dataUrl || '';
    const thumb = photoSrcOf(p);
    if (!thumb && !playable) continue;
    const a = asgById.get(p.assignmentId);
    const apt = aptById.get(p.apartmentId || a?.apartmentId || '');
    const jobName = apt ? (apt.buildingId === 'G' ? (apt.displayName || 'Job') : aptLabel(apt)) : (a?.general ? src.projectLabel : '');
    out.push({
      id: p.id, photo: p, kind,
      projectId: src.projectId, projectLabel: src.projectLabel, projectColor: src.projectColor,
      jobId: apt?.id ?? a?.apartmentId ?? '', jobName,
      who: conById.get(p.contractorId) ?? '',
      at: stampOf(p), thumb, playable,
    });
  }
  return out;
}

export function sortNewest(shots: SiteShot[]): SiteShot[] {
  return [...shots].sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Every workspace's shots, newest first. `sample` (the store shelf) reads the
 * canned context alone — the shelf makes no store reads and shows no real
 * pictures.
 */
export function useSitePhotos(c: {
  photos: ContractorPhoto[]; assignments: ContractorAssignment[]; jobs: Apartment[]; contractors: Contractor[];
}, sample: boolean): SiteShot[] {
  const tick = useStore(s => s.snapshotTick);
  const pid = useStore(s => s.currentProjectId);
  const projects = useStore(s => s.projects);
  const contractors = useStore(s => s.contractors);
  const liveApts = useStore(s => s.apartments);
  const liveAsg = useStore(s => s.contractorAssignments);
  const livePhotos = useStore(s => s.contractorPhotos);
  const he = useStore(s => s.mainUiStrings.isRtl);
  const labelOf = (p: Project | undefined, id: string) => projectShortName(p, he, id);

  const sampleShots = useMemo(() => sample
    ? sortNewest(collectSiteShots({ photos: c.photos, assignments: c.assignments, apartments: c.jobs, contractors: c.contractors, projectId: 'sample', projectLabel: '', projectColor: '#7c3aed' }))
    : [], [sample, c.photos, c.assignments, c.jobs, c.contractors]);

  // The open workspace — live, so a picture shows the moment its record lands.
  const liveShots = useMemo(() => sample ? [] : collectSiteShots({
    photos: livePhotos, assignments: liveAsg, apartments: liveApts, contractors,
    projectId: pid, projectLabel: labelOf(projects.find(p => p.id === pid), pid), projectColor: projectColor(projects, pid),
  }), [sample, livePhotos, liveAsg, liveApts, contractors, pid, projects, he]); // eslint-disable-line react-hooks/exhaustive-deps

  // The other workspaces — their snapshots, re-read when the foreign sync
  // bumps the tick. Keyed on the tick alone: a snapshot is a JSON.parse of a
  // whole workspace and must not re-run on every live edit.
  const foreignShots = useMemo(() => {
    if (sample) return [];
    const out: SiteShot[] = [];
    for (const p of projects) {
      if (p.id === pid) continue;
      const snap = loadProjectSnapshot(p.id);
      if (!snap.photos.length) continue;
      out.push(...collectSiteShots({
        photos: snap.photos, assignments: snap.assignments, apartments: snap.apartments, contractors,
        projectId: p.id, projectLabel: labelOf(p, p.id), projectColor: p.color ?? '#1e3a5f',
      }));
    }
    return out;
  }, [sample, tick, projects, pid, contractors, he]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => sample ? sampleShots : sortNewest([...liveShots, ...foreignShots]),
    [sample, sampleShots, liveShots, foreignShots]);
}

/** A shot younger than this wears the "new" ring — a few minutes, so a glance at the wall catches it. */
export const FRESH_MS = 10 * 60 * 1000;
export function isFreshShot(s: SiteShot, now = Date.now()): boolean {
  const t = Date.parse(s.at);
  return Number.isFinite(t) && now - t < FRESH_MS;
}

/**
 * What the viewer needs for each shot. A film whose record has no
 * extension in its name is given one — the viewer decides a kind by the
 * NAME first, and a nameless film would be opened as a broken picture.
 */
export function viewerItemsOf(shots: SiteShot[]): ViewerItem[] {
  return shots.map(s => {
    const p = s.photo;
    let filename = p.filename || (s.kind === 'video' ? 'video.mp4' : 'photo.jpg');
    let mimeType = p.mimeType;
    if (s.kind === 'video' && mediaKindOf(filename, mimeType) !== 'video') { filename += '.mp4'; mimeType = mimeType || 'video/mp4'; }
    if (s.kind === 'image' && mediaKindOf(filename, mimeType) !== 'image') { filename += '.jpg'; mimeType = mimeType || 'image/jpeg'; }
    return {
      fileId: p.driveFileId,
      filename, mimeType,
      src: s.playable || undefined,
      sizeBytes: p.fileSizeBytes,
      who: s.who || undefined,
      when: s.at ? new Date(s.at).toLocaleString() : undefined,
      note: [s.jobName, s.projectLabel].filter(Boolean).join(' · ') || undefined,
    };
  });
}
