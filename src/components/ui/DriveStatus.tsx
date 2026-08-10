import React from 'react';
import { Apartment } from '../../types';
import { DriveIcon } from './BrandIcons';

/**
 * How a job's Drive folder is doing, at a glance.
 *
 * The projects have carried this for a while as a list of green ticks and red
 * crosses behind a "Status" button. Jobs had nothing, so the only way to find
 * out whether a job's folder was set up was to open it and look.
 *
 * Two rules keep it cheap enough to sit on every tile of a board:
 *
 *  - It is derived from what is already in the record — is a folder linked, is
 *    a plan linked — and never makes a network call. A board of two hundred
 *    jobs would otherwise fire two hundred Drive requests on every render, and
 *    a status light is not worth that.
 *  - The deeper check (can the service account actually reach the folder, are
 *    there really plans in it) stays where it already is, inside the job
 *    window, run on demand.
 *
 * So the light means "set up or not", which is the question somebody scanning a
 * board is actually asking.
 */

export type DriveState = 'ready' | 'partial' | 'none';

export function driveStateOf(job: Pick<Apartment, 'driveLink' | 'plansPdfLink'>): DriveState {
  const folder = !!job.driveLink?.trim();
  const plan = !!job.plansPdfLink?.trim();
  if (folder && plan) return 'ready';
  if (folder) return 'partial';
  return 'none';
}

const LOOK: Record<DriveState, { dot: string; ring: string; label: string }> = {
  ready:   { dot: '#16a34a', ring: 'rgba(22,163,74,.18)',   label: 'Folder linked, plan found' },
  partial: { dot: '#d97706', ring: 'rgba(217,119,6,.18)',   label: 'Folder linked, no plan yet' },
  none:    { dot: '#cbd5e1', ring: 'rgba(148,163,184,.16)', label: 'No Drive folder linked' },
};

/**
 * The light itself.
 *
 * `size="tile"` is the one that goes on a job tile — small enough not to compete
 * with the job's name, big enough to read across a desk.
 */
export function DriveStatus({
  job, size = 'tile', withLabel = false, onClick,
}: {
  job: Pick<Apartment, 'driveLink' | 'plansPdfLink'>;
  size?: 'tile' | 'panel';
  withLabel?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const state = driveStateOf(job);
  const look = LOOK[state];
  const box = size === 'panel' ? 24 : 18;
  const dot = size === 'panel' ? 7 : 5.5;

  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' as const, 'data-el-action': true } : {})}
      title={look.label}
      aria-label={`Google Drive — ${look.label}`}
      className="inline-flex items-center gap-1.5 flex-shrink-0"
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <span
        className="relative inline-flex items-center justify-center rounded-md"
        style={{ width: box, height: box, backgroundColor: look.ring }}
      >
        <DriveIcon size={size === 'panel' ? 13 : 10} />
        {/* The state reads as a light in the corner rather than as a recolour
            of the Drive mark, which people recognise by its own colours. */}
        <span
          className="absolute rounded-full"
          style={{
            width: dot, height: dot, right: -1, bottom: -1,
            backgroundColor: look.dot,
            border: '1.5px solid var(--tile-bg, #fff)',
          }}
        />
      </span>
      {withLabel && (
        <span className="text-[10.5px] font-semibold" style={{ color: look.dot }}>
          {state === 'ready' ? 'Drive ready' : state === 'partial' ? 'No plan' : 'Not linked'}
        </span>
      )}
    </Tag>
  );
}
