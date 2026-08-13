import { Contractor, WorkerLevel, WorkerPermission } from '../types';

/**
 * What a worker is allowed to see and do, and the levels that bundle it up.
 *
 * The portal used to show every worker exactly the same thing, which was right
 * when everyone using it was a subcontractor doing one flat's ducts. It stopped
 * being right the moment a manager needed the planner and a technician needed
 * to see the whole building — and the answer to that is not three hard-coded
 * portals, because the next person will need a fourth combination.
 *
 * So it is fifteen switches, and a LEVEL is a saved set of them. Three levels
 * ship with the app and can be edited; more can be saved. A worker is put on a
 * level and that is normally the end of it, but any individual switch can be
 * overridden for one person without disturbing everybody else on that level.
 *
 * A note on the word: the app's storage still says "contractor" everywhere —
 * the collection, the assignment records, the portal token. Renaming that would
 * be a migration across every device and every backup for no functional gain,
 * and the standing rule here is that nothing gets lost. The word people SEE is
 * "worker"; the word on disk is unchanged and deliberately so.
 */

export interface PermissionDef {
  key: WorkerPermission;
  label: string;
  hint: string;
  group: 'Work' | 'The site' | 'Everyone else';
}

export const WORKER_PERMISSIONS: PermissionDef[] = [
  // ── Their own work ────────────────────────────────────────────────────────
  { key: 'ownTasks', label: 'See their own tasks', group: 'Work',
    hint: 'Off means the portal has nothing in it. This is the one nobody should turn off.' },
  { key: 'completeTasks', label: 'Mark work finished', group: 'Work',
    hint: 'Off means the office ticks it off instead.' },
  { key: 'uploadPhotos', label: 'Send photos and files', group: 'Work',
    hint: 'How the office sees what was done.' },
  { key: 'addNotes', label: 'Write notes back', group: 'Work' ,
    hint: 'A line of text against the task, which the office reads.' },
  { key: 'selfAssign', label: 'Give themselves a task', group: 'Work',
    hint: 'For somebody who finds work on site and needs it recorded rather than remembered. '
      + 'It behaves like any other task — it takes photos and it shows in the office.' },
  { key: 'assignOthers', label: 'Give tasks to other workers', group: 'Work',
    hint: 'The worker picker appears in their add-a-task form. Without it a task they add is '
      + 'always their own. A foreman handing out the morning, not a pair of hands.' },

  // ── The site ──────────────────────────────────────────────────────────────
  { key: 'seeDiagrams', label: 'See the building diagrams', group: 'The site',
    hint: 'The floor-by-floor map. A subcontractor on one flat rarely needs it.' },
  { key: 'seeAllApartments', label: 'See every unit, not just theirs', group: 'The site',
    hint: 'With this off the diagram shows only the units they have work in.' },
  { key: 'seePlans', label: 'Open the engineering plans', group: 'The site' ,
    hint: 'The PDF for the unit they are working in.' },
  { key: 'markUpPlans', label: 'Mark up a plan', group: 'The site',
    hint: 'Draw on it and save a new version. Rare outside the office.' },
  { key: 'seeSnags', label: 'See the punch-list pins', group: 'The site',
    hint: 'The numbered defect markers drawn on the plan.' },

  // ── Everybody else's work ─────────────────────────────────────────────────
  { key: 'allTasks', label: "See everyone's tasks", group: 'Everyone else',
    hint: 'Their own stay picked out. This is what makes somebody a manager rather than a pair '
      + 'of hands.' },
  { key: 'seePlanner', label: 'See the planner', group: 'Everyone else',
    hint: 'Read-only, always. Who is where this week.' },
  { key: 'seeSchedule', label: 'See dates beyond their own work', group: 'Everyone else',
    hint: 'Due dates and the week ahead across the site.' },
  { key: 'seeContacts', label: "See the other workers' names", group: 'Everyone else',
    hint: 'Off means other people appear as their trade rather than by name.' },
  { key: 'switchProject', label: 'Switch between workspaces', group: 'Everyone else',
    hint: 'Somebody who works on more than one site.' },
];

const on = (...keys: WorkerPermission[]): Partial<Record<WorkerPermission, boolean>> =>
  Object.fromEntries(WORKER_PERMISSIONS.map(p => [p.key, keys.includes(p.key)]));

/**
 * The three that ship.
 *
 * They are ordinary records — editable, and the starting point for saving your
 * own. Only deleting them is refused, because a worker pointing at a level that
 * no longer exists has no permissions at all, which is a portal that silently
 * shows nothing.
 */
export const DEFAULT_WORKER_LEVELS: WorkerLevel[] = [
  {
    id: 'lvl-contractor',
    name: 'Contractor',
    nameHe: 'קבלן',
    builtIn: true,
    description: 'Their own work and nothing else. The building diagrams can be switched on; '
      + 'the planner never is.',
    perms: on('ownTasks', 'completeTasks', 'uploadPhotos', 'addNotes', 'seePlans', 'seeSnags'),
  },
  {
    id: 'lvl-technician',
    name: 'General technician',
    nameHe: 'טכנאי',
    builtIn: true,
    description: 'Everything, optionally. Their own assignments stay picked out from the rest.',
    perms: on('ownTasks', 'completeTasks', 'uploadPhotos', 'addNotes', 'selfAssign',
      'seeDiagrams', 'seeAllApartments', 'seePlans', 'seeSnags',
      'allTasks', 'seeSchedule', 'seeContacts'),
  },
  {
    id: 'lvl-manager',
    name: 'Manager',
    nameHe: 'מנהל',
    builtIn: true,
    description: "The planner and everybody's work. Their own tasks stay highlighted.",
    perms: on(...WORKER_PERMISSIONS.map(p => p.key)),
  },
];

/** The level a new worker starts on, unless somebody picks another. */
export const DEFAULT_NEW_WORKER_LEVEL = 'lvl-contractor';

export type Perms = Record<WorkerPermission, boolean>;

/**
 * What THIS worker can do.
 *
 * Level first, then that person's own overrides on top. An override is stored
 * only for a switch somebody has actually flipped, so moving a worker to
 * another level moves everything they have not been given a personal answer on.
 */
export function permsOf(
  worker: Pick<Contractor, 'levelId' | 'perms'> | null | undefined,
  levels: WorkerLevel[],
): Perms {
  const level = levels.find(l => l.id === worker?.levelId)
    ?? levels.find(l => l.id === DEFAULT_NEW_WORKER_LEVEL)
    ?? levels[0];
  const base = level?.perms ?? {};
  const own = worker?.perms ?? {};
  return Object.fromEntries(
    WORKER_PERMISSIONS.map(p => [p.key, own[p.key] ?? base[p.key] ?? false]),
  ) as Perms;
}

/** How many switches this person has been given a personal answer on. */
export function overrideCount(worker: Pick<Contractor, 'perms'> | null | undefined): number {
  return Object.values(worker?.perms ?? {}).filter(v => v !== undefined).length;
}

/** The level's own name, in whichever language is up. */
export const levelName = (l: WorkerLevel | undefined, isRtl: boolean): string =>
  (isRtl && l?.nameHe) ? l.nameHe : (l?.name ?? '—');
