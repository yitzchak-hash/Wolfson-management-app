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
- Production is the branch `claude/blissful-cray-spTFY`; pushing it deploys
  wolfson-management-app.vercel.app.
- Vercel's plan allows at most 12 files in `/api`. A 13th breaks every deploy.
- Never commit real client data or secrets.
- The history of every past round is in `docs/archive/` if you need it.

## How to reply to the owner
He doesn't code. Plain language, no code in the reply. Use this shape:

1. **What's actually wrong** (or what was found) — short numbered points.
2. What was done / what's worth knowing — short sections with bullets.
3. **What I need from you** — only real questions or actions, or "nothing".
4. The link: https://wolfson-management-app.vercel.app
5. Last line, bold, with an emoji: **👉 Needs you: …** or **✅ Nothing needed from you — …**
