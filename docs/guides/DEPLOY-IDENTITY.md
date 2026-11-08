# Who a commit is stamped by decides whether Vercel deploys it

Found 2026-11-08 (practice D19, commit 7db1f90): the owner saw the practice
deployment fail. A clean build of the same commit (fresh `npm ci`, no `.env`
files, `VERCEL_GIT_COMMIT_REF=claude/practice`, `npm run build`) passes here,
and every `/api` file loads. The one thing different from every practice
commit that deployed: its **committer** was `noreply@anthropic.com` (its
author was `info@tzviair.com`). Vercel only deploys a commit from someone on
the project's account; the Finance app's deployments show `BLOCKED` the same
way.

The rule for every commit that will be pushed to this repo:

- author **and** committer `TzviAir <info@tzviair.com>`:
  `git -c user.name=TzviAir -c user.email=info@tzviair.com commit -F <file>`
- never re-stamp a commit to another committer before a push (a local check
  may ask for `noreply@anthropic.com`; for this repo that blocks the deploy).
- the HEAD commit of a push is the one Vercel judges: a correctly stamped
  commit on top deploys everything under it.
