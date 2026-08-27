/**
 * Retired widget ids, and where each one went.
 *
 * The owner's 2026-08-27 dedupe ruling: 38 of the store's 94 widgets were 17
 * widgets wearing two or three coats — most of them TV-prefixed big-type
 * copies from before the wall learned to scale ordinary widgets. Each retired
 * id stays REGISTERED forever as an alias that draws its survivor, so a
 * widget somebody placed months ago keeps working, keeps its settings, and
 * simply picks up the survivor's new switches. Nothing is migrated, nothing
 * is written: the translation happens at render time, which is what makes it
 * impossible for a Firestore echo or an old backup to resurrect a broken id.
 *
 * `map` translates the OLD element's data bag into the survivor's options —
 * the mapped value goes FIRST and the stored bag is spread over it, so a
 * setting the office later changes through the pencil always wins over the
 * translation ("Tomorrow" can be re-pointed at today).
 *
 * In its own module with no imports, because three registries need it
 * (the widget registry, the pencil fields, the store shelf) and two of those
 * must not import each other.
 */

export interface WidgetAlias {
  to: string;
  map?: (dd: Record<string, unknown>) => Record<string, unknown>;
}

export const WIDGET_ALIASES: Record<string, WidgetAlias> = {
  // Two widgets literally both named "Find a job" — the forgiving one wins.
  'job-search': { to: 'job-find' },

  // Straight TV twins of ordinary widgets.
  'tv-late': { to: 'overdue-list' },
  'tv-new': { to: 'recent-jobs' },
  'tv-feed': { to: 'activity-feed' },
  'tv-clock': { to: 'clock', map: dd => ({ hebrew: '1', holiday: '1', ...dd }) },

  // Same question, different window.
  'week-ahead': { to: 'due-today', map: dd => ({ window: 'week', ...dd }) },
  'tv-out-today': { to: 'team-today', map: dd => ({ source: 'planner', ...dd }) },
  'tv-tomorrow': { to: 'team-today', map: dd => ({ source: 'planner', day: 'tomorrow', ...dd }) },
  'tv-week-done': { to: 'tv-done-today', map: dd => ({ period: 'week', ...dd }) },
  'contractor-load': { to: 'tv-load', map: dd => ({ show: 'one', ...dd }) },

  // The stage picture.
  'stage-funnel': { to: 'stage-legend', map: dd => ({ look: 'bars', ...dd }) },
  'tv-stage-spread': { to: 'stage-legend', map: dd => ({ look: 'bars', ...dd }) },
  'progress-ring': { to: 'count-by-stage', map: dd => ({ show: 'ring', ...dd }) },

  // Pictures and the calendar.
  'tv-photo': { to: 'recent-photos', map: dd => ({ look: 'one', ...dd }) },
  'tv-photo-wall': { to: 'recent-photos', map: dd => ({ look: 'wall', ...dd }) },
  'tv-month': { to: 'calendar-mini', map: dd => ({ shade: '1', ...dd }) },

  // The quiet-problem family and the manual meter.
  'tv-waiting': { to: 'nobody-booked', map: dd => ({ scope: 'never', ...dd }) },
  'tv-drive': { to: 'no-plan' },
  'progress-bar': { to: 'weekly-goal', map: dd => ({ asPct: '1', ...dd }) },

  // The workspace card: "this workspace" became a choice on the picker.
  'tv-workspace': {
    to: 'project-glance',
    map: dd => (dd.projectId ? dd : { ...dd, projectId: 'this' }),
  },
};

export const RETIRED_WIDGET_IDS = Object.keys(WIDGET_ALIASES);
