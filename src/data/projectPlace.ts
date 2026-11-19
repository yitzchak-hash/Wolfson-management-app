/**
 * WHERE YOU STOOD in each project, on this screen (owner, 2026-11-19: "when I go in and out, to come back to the same
 * floor and the same place where I was … I want him to remember where I worked, where I stayed, and go back exactly
 * over there till I don't change").
 *
 * The project page keeps, per workspace: the building tab, Board or Building, and the floor the building view was
 * on. It is read when the page opens and written the moment any of them changes — so leaving for Tasks, closing an
 * apartment, a refresh or opening the app again all land on the same spot.
 *
 * A browser key on purpose (registered in deviceOnly.ts): like `active_project` it is about what THIS screen is
 * looking at — a phone on the fourth floor must not drag the office computer there.
 */
const KEY = 'project_place';

export interface ProjectPlace {
  /** The building tab, or 'all'. */
  building?: string;
  view?: 'board' | 'building';
  /** The building view's floor: a tower floor as its record number ("5"), a shared lower level as "L:<key>". */
  floorKey?: string;
}

function readAll(): Record<string, ProjectPlace> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

export function readPlace(projectId: string): ProjectPlace {
  const p = readAll()[projectId];
  return p && typeof p === 'object' ? p : {};
}

export function savePlace(projectId: string, patch: ProjectPlace): void {
  try {
    const all = readAll();
    all[projectId] = { ...(all[projectId] ?? {}), ...patch };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* private mode: the place simply is not kept */ }
}

/** How a building-view row is named in `floorKey`. */
export const floorKeyOf = (row: { floor: number; lower?: { key: string } | null }): string =>
  row.lower ? `L:${row.lower.key}` : String(row.floor);
