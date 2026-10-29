# TzviAir job board

The office app for TzviAir, an HVAC installer in Israel: a job board, building
diagrams (Wolfson, Netiv), tasks, a notebook planner, plan markup, and a
phone portal for workers (`/c/<token>`).

React 19 + TypeScript + Vite, Zustand (`src/data/store.ts`), Firestore,
Vercel serverless functions in `/api`.

## Running it
- `npm run dev` — dev server on 5173.
- `npx tsc --noEmit -p .` and `npx vite build` before pushing.

## Facts worth knowing
- **Push ONLY to the production branch, and push rarely** (owner, 2026-10-29 — Vercel's build minutes):
  one push when a round is finished, never a work branch beside it (every branch push is a Vercel build).
- **Never let an on-open repair write before the workspace's records have arrived from the cloud**
  (`cloudSyncedProject`, 2026-10-29): a new browser's starter copy once wrote empty progress over every
  Wolfson flat. A write that would DELETE a field the cloud has (`undefined` → deleteField) needs a reason.
- Production is the branch `claude/blissful-cray-spTFY`; pushing it deploys
  wolfson-management-app.vercel.app.
- Vercel's plan allows at most 12 files in `/api`. A 13th breaks every deploy.
- Never commit real client data or secrets.
- **EVERYTHING lives in the cloud and is in the full backup** (owner, 2026-10-29: "any new features we add
  should also be added to these backup systems. Everything."). A new feature that saves anything saves it
  to Firestore, through `fsPatch` (only what changed, never a whole record from this computer's copy) or
  `fsSet` for a brand-new record. A new collection goes into `lib/fullBackup.js` (WORKSPACE_COLLECTIONS or
  GLOBAL_COLLECTIONS). Nothing a person would expect on a new computer is kept only in the browser; the only
  browser keys allowed are in `src/data/deviceOnly.ts`, each with its reason. `npm run build` runs
  `scripts/check-backup-coverage.mjs` first and FAILS if a collection or a browser key breaks this rule.
- The history of every past round is in `docs/archive/` if you need it.

## How to reply to the owner
He doesn't code. Plain language, no code in the reply. Use this shape:

1. **What's actually wrong** (or what was found) — short numbered points.
2. What was done / what's worth knowing — short sections with bullets.
3. **What I need from you** — only real questions or actions, or "nothing".
4. The link: https://wolfson-management-app.vercel.app
5. Last line, bold, with an emoji: **👉 Needs you: …** or **✅ Nothing needed from you — …**
