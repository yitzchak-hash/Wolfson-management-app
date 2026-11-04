// THE PRACTICE COPY (owner, 2026-11-04). The practice deploy (branch
// `claude/practice`) sets PRACTICE_MODE=1 as a branch-only variable. There,
// everything that reaches the company's real Google Drive (uploads, folders,
// backups, restores, sheets) and every message to a real person (phone push)
// is switched off. Unset on the real site, so nothing changes there.

// The branch name too, so the practice deploy is practice even without its variable.
export const PRACTICE = process.env.PRACTICE_MODE === '1' || process.env.VERCEL_GIT_COMMIT_REF === 'claude/practice';

/** Answers the request with a plain refusal on practice; returns true when it did. */
export function refuseOnPractice(res, what = 'Google Drive') {
  if (!PRACTICE) return false;
  res.status(503).json({ error: `${what} is switched off on the practice copy`, practice: true });
  return true;
}
