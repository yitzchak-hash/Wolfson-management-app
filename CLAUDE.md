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
- **Build on the PREVIEW branch first, push live only on his word** (owner, 2026-11-03: "only build in this preview branch
  before you push live"). The preview branch is `claude/magical-darwin-6py813`; Vercel builds it at its own preview address.
  He looks there, and when the day's round is done it is merged into production (`claude/blissful-cray-spTFY`) in ONE push.
  **ONE push per finished chunk of work** (owner, 2026-11-03: "Why did you do five builds in the past 40 minutes? Why
  don't you finish one chunk of work and then send it to build?"): commit locally as you go, test locally, and push only
  when everything he asked for in that round is done. Every push is a Vercel build. Never a third branch.
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
