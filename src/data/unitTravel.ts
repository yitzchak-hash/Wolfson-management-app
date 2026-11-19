/**
 * The RETURN TICKET for a glance at another workspace's unit.
 *
 * Tapping a foreign unit (a Building Progress cell, a notebook card, a unit
 * card) travels to its workspace and opens the real drawer there — the
 * owner's ruling. His follow-up: closing that drawer should put you straight
 * back where you were standing. The ticket holds where that was; the drawer
 * close redeems it ONLY when the apartment being closed is the one the
 * travel opened — opening a different apartment over there means you decided
 * to stay, and the ticket is torn up.
 *
 * Module state, never persisted: a ticket is about the journey in this tab,
 * this minute. It is also torn up by the browser's Back button (its own way
 * home — a stale ticket after it would teleport a later close) and by a
 * manual workspace switch in the header.
 */
let ticket: { projectId: string; path: string; aptId: string } | null = null;

export function rememberReturn(projectId: string, path: string, aptId: string): void {
  ticket = { projectId, path, aptId };
}

/**
 * The drawer for `aptId` is closing: where to go back to, if anywhere.
 * A ticket for a DIFFERENT apartment means the user wandered — cleared, no
 * journey.
 */
export function redeemReturn(aptId: string): { projectId: string; path: string } | null {
  const t = ticket;
  ticket = null;
  if (!t || t.aptId !== aptId) return null;
  return { projectId: t.projectId, path: t.path };
}

export function clearReturnTicket(): void { ticket = null; }

/**
 * An open apartment window owns one history entry, so the phone's Back CLOSES it (ProjectDiagramPage). That Back is
 * not "the browser's own way home" — the close it causes must still find the ticket and take the office home.
 */
let held = false;
export function holdTicketThroughBack(on: boolean): void { held = on; }

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => { if (!held) ticket = null; });
}
