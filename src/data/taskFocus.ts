/**
 * "Open the job window ON this task" — the last step of a notification.
 *
 * A `FocusIntent` of kind `task` gets the page to open the right job; the
 * drawer then opens on its Details tab, and the message that rang sits two
 * taps away on Tasks. This is the hand-over for that last step: the
 * notification remembers the task here, the drawer takes it on mount when
 * the task belongs to the job it is showing, opens the Tasks tab and lights
 * the card. Module-level and session-only — a pointer into a gesture that is
 * already under way, not the office's data, so it never reaches persist,
 * export or Firestore.
 */
let pending: { taskId: string; at: number } | null = null;

export function rememberTaskFocus(taskId: string): void {
  pending = { taskId, at: Date.now() };
}

/** The remembered task, if it is one of `taskIds` and still fresh (20s) — NOT consumed. */
export function peekTaskFocus(taskIds: string[]): string | null {
  if (!pending) return null;
  if (Date.now() - pending.at > 20_000) { pending = null; return null; }
  return taskIds.includes(pending.taskId) ? pending.taskId : null;
}

/**
 * Take it. Kept apart from the peek because StrictMode runs a mount effect
 * twice (mount → cleanup → mount): consuming in the first run left the
 * second with nothing, and the task was never lit. Peek in the effect,
 * take in the deferred callback that actually acts.
 */
export function takeTaskFocus(taskIds: string[]): string | null {
  const id = peekTaskFocus(taskIds);
  if (id) pending = null;
  return id;
}
