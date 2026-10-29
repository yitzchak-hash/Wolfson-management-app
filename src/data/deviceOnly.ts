/**
 * THE DEVICE-ONLY REGISTER (owner, 2026-10-29: "I want nothing to live on the
 * computer, absolutely nothing. Everything should be living in the cloud").
 *
 * Every key the app may keep in a browser, and WHY it may stay on that one
 * computer. Nothing here is the office's data or a choice a person expects
 * on a new computer — those live in Firestore (records, settings/app,
 * userPrefs via prefs.ts) and are in the full backup.
 *
 * What may be here:
 *  - a COPY of cloud data kept for a fast start or offline use (a cache);
 *  - something about THIS device itself (its screen, its sign-in, its push
 *    subscription, its Drive-for-desktop folder);
 *  - an emergency copy whose whole point is to survive the cloud losing it.
 *
 * scripts/check-backup-coverage.mjs fails the build when the code uses a
 * browser key that is not listed here. `<x>` stands for any id.
 */
export const DEVICE_ONLY: Record<string, string> = {
  // ── copies of cloud data (caches) ─────────────────────────────────────────
  'wolfson_app_data': 'Copy of the Wolfson workspace from the cloud, for a fast start, plus who is signed in on this computer.',
  '<x>_app_data': 'Copy of another workspace from the cloud, for a fast start and for widgets that show it.',
  'wolfson_app_version': 'Version stamp of the copy above on this computer.',
  'prefs_mirror': 'Copy of the cloud userPrefs documents (personal and office choices) for an instant start.',
  'drive_activity': 'Copy of what moved in Drive lately — rebuilt from Drive.',
  'plan_aspect_cache': 'Measured page sizes of plan files — rebuilt from Drive.',
  'search_ai_cache': 'AI search answers already fetched — asked again if missing.',
  'translate_cache': 'Translations already fetched — fetched again if missing.',
  'transcript_cache': 'Voice-memo transcripts already fetched — the record keeps its own transcript.',
  'shared_plan_ids': 'Plan files this computer already asked Drive to share — asking twice is harmless.',
  'shared_job_folders': 'Job folders this computer already asked Drive to share — asking twice is harmless.',

  // ── this device itself ────────────────────────────────────────────────────
  'active_project': 'Which workspace THIS browser window is on.',
  'tv_screen_id': 'This TV panel\'s own identity (its settings live in the cloud under it).',
  'presence_tab_id': 'This browser tab\'s identity for "who is online".',
  'chunk_reload_at': 'Throttle for reloading once after a new version is published.',
  'tv_refullscreen': 'One-time flag to return this TV to full screen after a reload.',
  'drive_desktop_root': 'Where Google Drive for desktop sits on THIS computer\'s disk.',
  'drive_shared_name': 'The shared-drive folder name as Drive for desktop shows it on THIS computer.',
  'drive_drive_name': 'The drive letter/name of Drive for desktop on THIS computer.',
  'tzviair_helper_installed': 'Whether the TzviAir helper app is installed on THIS computer.',
  'markup_ui_scale': 'Button size for THIS screen (a touchscreen needs bigger ones).',
  'push_on_<x>': 'Whether THIS phone/browser is subscribed to the worker\'s push alerts.',
  'push_dismissed_<x>': 'The worker said "not now" to push alerts on THIS phone.',
  'office_notif_asked': 'This browser was already asked for notification permission.',
  'pin_push_idle_ms': 'A testing override, never set in normal use.',

  // ── emergency copies (their point is to survive the cloud losing data) ─────
  'pin_board_versions': 'Earlier versions of each pin board seen on this computer — a second safety net beside the cloud backups.',
  'rescue_marks_<x>': 'Stage ticks this computer had that the cloud lacked — a second safety net beside the cloud backups.',
};
