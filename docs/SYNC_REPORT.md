# Database Sync, Offline Persistence, and Conflict Resolution: How the Major Platforms Do It — and How the Wolfson Management App Compares

*A technical report for developers. Prepared June 2026.*

---

## Executive Summary

Every collaborative or multi-device application eventually confronts the same three intertwined problems:

1. **Sync** — getting changes from one client to the server and back out to other clients.
2. **Offline persistence** — letting a client keep working (read *and* write) when the network is gone, then reconciling on reconnect.
3. **Conflict resolution** — deciding what happens when two clients change the same thing at roughly the same time.

There is no single correct answer. The right design depends almost entirely on **what you are syncing** and **how concurrently it is edited**. A collaborative rich-text editor (Google Docs), a vector canvas (Figma), and a structured project tracker (this app) sit at very different points on that spectrum, and their architectures reflect it.

The industry has converged on a small number of techniques:

- **Operational Transformation (OT)** — used by Google Docs. A central server transforms incoming operations against concurrent ones so character-level edits converge. Powerful for rich text, notoriously hard to implement correctly.
- **CRDTs (Conflict-free Replicated Data Types)** — used by Figma (a custom, server-assisted variant), Notion (for offline pages), and offline-first libraries like RxDB. Data types whose operations are mathematically guaranteed to converge regardless of order.
- **Last-Writer-Wins (LWW)** — the pragmatic default. Used by Firestore out of the box, by Figma at the *property* level, by CloudKit's simplest path, and by this app via an `updatedAt` timestamp tiebreaker. Simple, lossy under true concurrency.
- **Field/property-level merge** — instead of replacing whole records, merge only the fields that changed. Used by Airtable, Figma (per-property), and recommended by Google for Firestore when LWW is too coarse.
- **Persistent local mutation queues** — the bedrock of true offline-first behavior. Used by Firestore's offline mode, CloudKit, PouchDB, WatermelonDB, and Realm. Writes are durably queued locally and replayed on reconnect, so nothing is lost.

**This app** uses a hand-rolled sync layer over Firebase Firestore: load-all-collections-on-login, `onSnapshot` real-time listeners, `fsBatchSet` for first-run seeding, binary data offloaded to Firebase Storage, and an `updatedAt` LWW tiebreaker that was recently added to the merge logic. This is a reasonable, low-complexity design that fits the app's workload well: ~156 apartment records, 10–30 contractors, and a small number of admins who rarely edit the *same* record simultaneously. Its one material weakness is the **absence of any offline write queue** — because Firestore's built-in IndexedDB persistence is not enabled, writes made while offline are simply dropped. This is acceptable for the current single-/few-admin usage but becomes a real liability if the app grows to many concurrent editors or relies on contractors editing in the field on flaky cellular connections.

This report surveys seven approaches, tabulates them, then analyzes this app specifically and gives concrete scale-up recommendations.

---

## 1. Google Docs / Drive — Operational Transformation

**Sync strategy.** Google Docs is the canonical real-time collaborative editor and, contrary to popular belief, it does **not** use CRDTs — it uses **Operational Transformation (OT)** mediated by a central server. Each keystroke or edit is modeled as an *operation* (e.g. `insert "x" at position 5`, `delete chars 2–4`). Clients send operations to the server; the server is the single source of truth for the canonical operation order.

**Conflict resolution.** OT's core idea is *transformation against concurrent operations*. If Alice inserts at position 5 while Bob deletes positions 2–4, the server transforms Alice's operation so it lands at the correct adjusted position (3 instead of 5). The transformation functions are designed so that applying `A` then `transform(B, A)` yields the same document as `B` then `transform(A, B)` — convergence regardless of arrival order. There is no "loser": both edits survive, correctly merged at character granularity.

**Offline support.** The browser client keeps a local model and applies edits optimistically, buffering unacknowledged operations. On reconnect it replays them through the transform pipeline. Google Drive (the file layer) is coarser — whole-file LWW with version history rather than operational merge.

**Suitability to scale.** OT shines for high-frequency, fine-grained, single-document concurrency (dozens of cursors in one doc). The cost is enormous implementation complexity: the number of operation-pair transform cases grows combinatorially, and edge cases (rich-text formatting, tables, comments anchored to ranges) are famously bug-prone. It requires an always-available central server, which Google obviously has. **This complexity is wildly disproportionate to a project tracker** where the unit of edit is "set apartment 14B's stage to Drywall," not "insert a character."

---

## 2. Notion — Block Model with CRDT-backed Offline

**Sync strategy.** Notion's data model is uniform: *everything* — a paragraph, a heading, an image, a database row, a whole page — is a **block**, stored as a row in PostgreSQL (sharded; ~96 RDS servers across 5 logical shards as of 2023). The sync pipeline is a **transaction model**: the client applies an edit optimistically to its local store, sends the transaction to the server for validation, and the server fans the validated change out to other subscribed clients.

**Conflict resolution & offline.** For years Notion was effectively online-only. Its offline mode dynamically **migrates pages marked "available offline" to a CRDT data model** specifically for conflict resolution. On reconnect, Notion compares the local timestamp against the server's `lastUpdatedTime` per page and only refetches pages where the server version is newer — a delta-sync optimization that avoids re-pulling unchanged content. The hard problems Notion had to solve were structural: blocks get moved, reparented, deleted, and inline databases added/removed, so the offline system has to track references and reconcile tree structure, not just text.

**Suitability to scale.** The block model is elegant and uniform but its sync machinery is heavyweight — justified by Notion serving millions of users editing shared documents. The relevant lesson for a small app is the **per-page `lastUpdatedTime` delta check**: only fetch what changed. This app, by contrast, refetches *entire collections* on login and re-receives full snapshots through `onSnapshot`.

---

## 3. Figma — Custom Server-Assisted CRDT

**Sync strategy.** Figma runs a dedicated **multiplayer service** that clients connect to over **WebSockets**. The document is a tree of objects modeled conceptually as `Map<ObjectID, Map<Property, Value>>` — a root, pages beneath it, and a hierarchy of shapes beneath each page (much like the DOM).

**Conflict resolution.** Figma deliberately rejected *both* OT ("a combinatorial explosion of states, very difficult to reason about") *and* pure CRDTs (designed for serverless P2P, with overhead Figma didn't need given its central server). Instead it built a **custom, CRDT-inspired, server-authoritative last-writer-wins-per-property** scheme:

- **Property changes** → LWW register. The server keeps the latest value any client sent for each `(object, property)` pair. Concurrent edits to the *same* property collide and one wins; edits to *different* properties of the same object both survive (this is the key win over whole-record LWW).
- **Object creation** → LWW set; clients prepend their client ID to generated object IDs to avoid collisions, which also enables offline creation.
- **Reparenting** → parent is stored as a child property; the server rejects updates that would create cycles. Clients may briefly show an inconsistent tree until the rejection arrives.
- **Ordering among siblings** → **fractional indexing**: a child's position is a fraction between 0 and 1; inserting between two siblings uses the average of their fractions, so concurrent reordering rarely conflicts.

**Offline support.** Clients download a full document snapshot on open, apply edits optimistically, and on reconnect re-download fresh state, reapply unacknowledged offline edits, then resume the WebSocket stream. Clients prefer their own unacknowledged local changes over conflicting server updates as the "best prediction" of the converged state.

**Suitability to scale.** This is the gold standard for *structured multiplayer* — many users dragging shapes on the same canvas in real time, with sub-frame responsiveness. **The per-property LWW idea is the single most directly applicable lesson for this app**: it is exactly how you'd want two admins editing different fields of the same apartment to *both* succeed instead of one clobbering the other.

---

## 4. Airtable — Field-Level Sync over a Relational Core

**Sync strategy.** Airtable presents a spreadsheet/database hybrid. Its real-time collaboration within a base is server-mediated and reasonably granular. Its cross-base "Sync" feature, however, is the more documented and more limited story: **native Airtable sync is one-directional** (external source → Airtable), and changes made in the destination do not flow back. Native sync also runs on a **schedule** (intervals from ~5 minutes up to hours), not true real time, and the API is rate-limited to **5 requests/second per base**.

**Conflict resolution & row locking.** Within live collaboration, Airtable performs **field-level change detection** — only the modified cell is transmitted and merged, so two users editing different fields of the same row don't collide. Practitioners "lock" a sync-source view to prevent schema drift (field-type changes) from breaking syncs. Genuinely real-time, bidirectional, sub-second sync with sophisticated conflict handling generally requires third-party tooling (e.g. Stacksync) layered on top.

**Comparison to a Firestore approach.** Airtable's **field-level granularity is strictly better than this app's whole-record LWW**: Firestore documents (and this app's merge logic) replace the *entire* record on a write, whereas Airtable merges per cell. Conversely, this app's `onSnapshot` listeners give it **lower-latency real-time fan-out than Airtable's scheduled native sync**. The two systems make opposite trade-offs: Airtable favors merge granularity, Firestore favors real-time propagation.

---

## 5. Firebase / Firestore — What Google Actually Recommends

This is the platform this app is built on, so its official guidance matters most.

**Sync strategy.** Firestore is a document store with first-class real-time listeners (`onSnapshot`). Listeners receive the initial query result plus a stream of deltas as documents change. Writes propagate to all listeners within hundreds of milliseconds.

**Offline persistence.** Firestore ships a **persistent local cache backed by IndexedDB** (on web; on by default on iOS/Android, **opt-in on web** via `persistentLocalCache` / the legacy `enableIndexedDbPersistence`). When enabled, every read is cached, and — critically — **writes made offline are durably queued in a `MutationQueue` and automatically replayed on reconnect**, with separate queues per user. The local cache survives page reloads and app restarts. **This app does not enable it** (it calls plain `getFirestore(app)`), so it gets none of this: offline reads fall back to localStorage, and offline writes are silently lost.

**Conflict resolution — Google's official guidance.**
- The **default is last-write-wins**: whichever write the server commits last overwrites earlier ones. Google explicitly warns this "may not suit all use cases."
- For finer control, Google recommends **`update()` with merge semantics** (write only changed fields, not the whole document) and **transactions** for read-modify-write flows, which provide **serializable isolation**.
- A critical caveat: **transactions fail while offline** — they require a live connection — so they are *not* a complete offline conflict strategy by themselves.
- For sophisticated needs, Google's own docs suggest **server timestamps and version fields** to detect concurrent modifications — essentially what this app now does with `updatedAt`, and what Firestore's own `_updatedAt: serverTimestamp()` (already written by `fsSet`/`fsBatchSet` in `firebase.ts`) could support more authoritatively.

**Suitability to scale.** Firestore scales to very large read/write volumes with automatic sharding, but it has **no built-in operational merge** — applications must layer their own conflict logic, exactly as this app has. For the app's scale (hundreds of documents, few writers) Firestore is more than adequate; the gap is purely in *how the app uses it*, not the platform.

---

## 6. Apple iCloud / CloudKit — Record Zones and Change Tokens

**Sync strategy.** CloudKit syncs `CKRecord` objects organized into **record zones** within databases. The engine of efficient sync is the **server change token**: a client calls `CKFetchRecordZoneChangesOperation` with the token it last received, and the server returns only the records that changed since — true delta sync — plus a new token to use next time. **Custom zones** additionally enable **atomic batch commits** across multiple records.

**Conflict resolution.** When a client tries to save a record whose server version has changed underneath it, the save fails with **`CKError.serverRecordChanged`**. Crucially, CloudKit hands the app **three copies** of the record in the error's `userInfo`: the **client** record (what you tried to save), the **server** record (current truth), and the **ancestor** record (the common base you both diverged from). This is a **three-way merge**, the same primitive `git` uses. The app decides: keep mine, keep theirs, auto-merge field-by-field, or prompt the user. CloudKit doesn't impose a policy; it gives you the materials to implement any.

**Offline support.** CloudKit is offline-tolerant by design on Apple platforms: operations queue and retry, and `CKError.serverRecordChanged` is the explicit reconnect-time conflict signal.

**Suitability to scale.** The change-token delta model is extremely bandwidth-efficient and the ancestor-based three-way merge is the most *honest* conflict model surveyed here — it never silently discards data the way LWW does. **The lesson for this app: storing a lightweight "base version" alongside `updatedAt` would let it detect — and surface to the user — genuine conflicts instead of silently letting the newer timestamp win.**

---

## 7. Offline-First Libraries — RxDB, WatermelonDB, Realm, PouchDB

These libraries exist precisely to solve the problem this app currently hand-rolls.

- **PouchDB** — A JS database speaking the CouchDB replication protocol. Every document carries a **revision tree (`_rev`)**; replication is bidirectional and conflict-aware. When two replicas edit the same doc, PouchDB keeps **both revisions** and deterministically picks a winner while preserving the loser for app-level resolution — nothing is lost. The revision-tree bookkeeping costs performance on large datasets.
- **RxDB** — A reactive client-side NoSQL DB (RxJS-based) with a pluggable replication layer (CouchDB, GraphQL, Firestore, custom). Queries are **observable**, so the UI updates automatically on sync — conceptually similar to what this app gets from `onSnapshot` + Zustand, but built in. Supports LWW, custom conflict handlers, and CRDT plugins.
- **WatermelonDB** — Built for React Native with large datasets; runs DB work on a **native thread** off the JS thread so big queries don't jank the UI. Sync is an explicit **pull/push protocol**: pull changes since a `lastPulledAt` timestamp, push local changes, server resolves. A lazy-loading, sync-anywhere model.
- **Realm** — A fast embedded object store with **MongoDB Atlas Device Sync**, including automatic conflict resolution. Note: **Atlas Device Sync was deprecated in 2024**, so Realm is no longer a forward-looking choice for new sync-backed apps.

**Common pattern.** All of them provide: (1) a **durable local store** that is the primary read/write surface, (2) a **persistent outbound change queue** that survives restarts, (3) a **sequential push/pull replication** loop keyed on a high-water-mark timestamp or revision, and (4) **pluggable conflict policies** (LWW → timestamped merge → app resolver → CRDT). This app implements (4) minimally (LWW) and **lacks (2) entirely** — which is the crux of its offline gap.

---

## Comparison Table

| Platform | Unit of sync | Conflict resolution | Offline writes | Real-time | Complexity | Best fit |
|---|---|---|---|---|---|---|
| **Google Docs** | Character-level operation | Operational Transformation (full merge) | Buffered ops, replayed | Yes (server) | Very high | High-concurrency rich text |
| **Notion** | Block | CRDT (offline pages) + per-page timestamp delta | Yes (CRDT) | Yes | High | Collaborative documents at scale |
| **Figma** | Object property | Server-authoritative per-property LWW (CRDT-inspired) + fractional indexing | Optimistic, reapplied on reconnect | Yes (WebSocket) | High | Structured multiplayer canvas |
| **Airtable** | Field/cell | Field-level merge; native cross-base sync is 1-way & scheduled | Limited | Live in-base; scheduled cross-base | Medium | Structured tabular data |
| **Firestore (recommended)** | Document (merge fields) | LWW default; transactions + version fields for more | **Yes — IndexedDB mutation queue** (opt-in on web) | Yes (`onSnapshot`) | Low–medium | General app backend |
| **CloudKit** | CKRecord (in zones) | Three-way merge via client/server/ancestor; change tokens for delta | Yes (queue + retry) | Push notifications | Medium | Apple-ecosystem sync |
| **Offline-first libs** | Document/object | Revision trees / LWW / custom / CRDT | **Yes — durable queue** | Reactive | Medium | Offline-first mobile/web |
| **This app** | Whole document | Whole-record LWW via `updatedAt` tiebreaker | **No — dropped when offline** | Yes (`onSnapshot`) | Low | Few-writer internal tool |

---

## This App's Current Approach: Analysis

### What it does

The implementation lives in `src/data/store.ts` (`startFirebaseSync`) and `src/data/firebase.ts`. The flow:

1. **On login**, `startFirebaseSync()` loads all 11 collections in parallel via `Promise.all(fsGetAll(...))`.
2. If Firestore already has data, it **merges remote into local** with a `mergeById<T>` helper that compares `updatedAt` and keeps the newer version (`rt >= lt ? r : a`), with ties going to Firestore. Binary `dataUrl` fields (photos, office files, task attachments) are re-hydrated from localStorage because they're stripped before Firestore writes.
3. If Firestore is empty, it **seeds** the entire localStorage snapshot via `fsBatchSet`.
4. It then attaches `onSnapshot` **real-time listeners** per collection. The `apartments` listener reuses the same `updatedAt` LWW merge; most other collections simply replace local state with the remote snapshot.
5. **Writes** go straight to Firestore via `fsSet`/`fsBatchSet`/`fsDelete`, each stamping `_updatedAt: serverTimestamp()`. The app also writes its own ISO `updatedAt` string on every mutation (`store.ts` lines 243, 315, etc.).
6. **Binary data** (photos/videos) is uploaded to **Firebase Storage** and referenced by URL; only metadata syncs through Firestore. This is the right call and keeps documents small.

### What it does well

- **Right-sized for the workload.** With ~156 apartments, 10–30 contractors, and a handful of office admins, simultaneous edits to the *same* record are rare. Whole-record LWW is genuinely adequate here.
- **Real-time fan-out is free.** `onSnapshot` gives instant multi-device propagation with no custom infrastructure — better latency than Airtable's scheduled native sync.
- **Binary offloading is correct.** Stripping `dataUrl` before Firestore writes and storing bytes in Firebase Storage avoids document-size limits and keeps sync payloads lean.
- **Graceful degradation.** If Firebase isn't configured, the app cleanly falls back to localStorage, and the merge logic preserves local-only records (`if (!r) return a`) rather than deleting them.
- **The `updatedAt` tiebreaker is a real improvement** over blind last-snapshot-wins: it makes the merge deterministic and direction-aware (newer timestamp wins) rather than "whatever arrived last in the listener."

### Risks and weaknesses

1. **No offline write queue — writes are silently lost.** Firestore's IndexedDB persistence is *not* enabled (the code uses plain `getFirestore(app)`), so there is no `MutationQueue`. A contractor or admin who edits while offline (common on a construction site over cellular) will see the change locally in Zustand/localStorage, but it never reaches Firestore, and the next `onSnapshot` can **overwrite their local edit with stale server data**. This is the single most serious gap.

2. **Whole-record LWW loses concurrent field edits.** Because the merge replaces the entire apartment document, if Admin A sets the stage and Admin B edits the notes within the same window, **one full record clobbers the other** — the loser's field silently vanishes. Figma (per-property) and Airtable (per-field) and CloudKit (three-way merge) all avoid this.

3. **Clock-skew sensitivity.** `updatedAt` is generated from the **client clock** (`new Date().toISOString()`), not the server. Two devices with skewed clocks can resolve conflicts incorrectly — a fast-but-wrong clock always "wins." Firestore already writes a trustworthy `_updatedAt: serverTimestamp()` that the merge logic ignores.

4. **Silent conflict discard.** LWW never tells anyone a conflict happened. Unlike CloudKit's `serverRecordChanged`, the losing edit disappears with no log entry and no user prompt.

5. **Full-collection load on every login.** `fsGetAll` pulls entire collections rather than a delta since last sync (contrast Notion's `lastUpdatedTime` check and CloudKit's change tokens). Fine at hundreds of records; wasteful at tens of thousands.

6. **Inconsistent merge discipline.** Only `apartments` use `updatedAt` LWW in the listener; `stageNotes`, `contractors`, `stages`, `users`, etc. **wholesale replace** local state with the remote snapshot, so the careful tiebreaker doesn't protect them.

---

## Recommendations

### If staying at current scale (few admins, internal tool)

These are cheap, high-value hardening steps:

1. **Enable Firestore offline persistence.** Switch `getFirestore(app)` to `initializeFirestore(app, { localCache: persistentLocalCache(...) })`. This alone fixes the dropped-write problem: offline writes durably queue in IndexedDB and replay on reconnect, and reads survive restarts — for essentially zero application code.
2. **Use the server timestamp as the LWW key.** Compare Firestore's `_updatedAt` (already written by `fsSet`/`fsBatchSet`) instead of the client-generated `updatedAt` string, eliminating clock-skew bugs.
3. **Apply the `updatedAt` merge consistently** to *all* collections in the `onSnapshot` listeners, not just `apartments`, so no collection silently regresses to last-snapshot-wins.
4. **Log conflicts.** When the merge discards a local edit because remote is newer, write an `ActivityLog` entry. Cheap, and it turns silent data loss into an auditable event.

### If scaling to 10x users or adding genuine multi-user editing

The whole-record LWW model becomes a liability; move toward field-level merge:

1. **Adopt field-level / merge writes (Figma & Airtable model).** Instead of writing the whole apartment document, write only the changed fields with Firestore `update()` / `setDoc({ merge: true })`. Combined with per-field timestamps (or sub-document structure), this lets two admins edit different fields of the same apartment without clobbering each other — the highest-impact change for true concurrency.
2. **Add optimistic concurrency / three-way merge for hot records (CloudKit model).** Carry a `version` field; reject a write whose base version is stale and surface a "this record changed — review and merge" prompt. Reserve this for genuinely contested records (e.g. apartment stage) rather than everything.
3. **Switch to delta sync (Notion / CloudKit model).** Replace the full `fsGetAll` on login with a query for documents where `_updatedAt > lastSyncedAt`, persisting `lastSyncedAt` locally. Reduces cold-start bandwidth and cost as collections grow.
4. **Consider a dedicated offline-first layer if field editing becomes central.** If contractors begin doing substantial offline editing (not just photo capture), a library like **RxDB** (observable queries + pluggable Firestore replication + custom conflict handlers) would replace the hand-rolled merge with a battle-tested, durable-queue replication engine — closing the offline gap structurally rather than patch-by-patch.
5. **For any future free-text collaborative field** (e.g. shared rich-text notes edited simultaneously), and *only* then, evaluate a CRDT library (Yjs/Automerge). Do **not** adopt OT/CRDT for the structured apartment/stage/task data — it is the wrong tool; field-level merge is the correct altitude.

### What explicitly does *not* need to change

The app should **not** adopt Operational Transformation or document-wide CRDTs for its structured records — that is the Google Docs/Figma problem space (high-frequency character/shape editing), not a project tracker's. The binary-offload-to-Storage strategy is already correct and should be kept. Real-time `onSnapshot` listeners are the right primitive and should stay.

---

## Sources / References

- Google Docs / OT vs CRDT: [Medium — How Google Docs Handles Real-Time Collaboration](https://medium.com/@anand.rishu310/how-google-docs-handles-real-time-collaboration-with-crdts-a7646b5a602b), [systemdr — CRDTs vs Operational Transformation](https://systemdr.systemdrd.com/p/crdts-vs-operational-transformation), [Akshay Ghalme — How Google Docs Real-Time Collaboration Works (2026)](https://akshayghalme.com/blogs/how-google-docs-real-time-collaboration-works/)
- Figma multiplayer: [Figma Blog — How Figma's Multiplayer Technology Works](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/), [Made by Evan — How Figma's Multiplayer Technology Works](https://madebyevan.com/figma/how-figmas-multiplayer-technology-works/), [Figma Blog — Making Multiplayer More Reliable](https://www.figma.com/blog/making-multiplayer-more-reliable/)
- Notion: [Notion Blog — How We Made Notion Available Offline](https://www.notion.com/blog/how-we-made-notion-available-offline), [HowWorks — How Notion Was Built: Block Model & Sync](https://howworks.ai/blog/how-notion-was-built), [Notion Blog — Designing Synced Blocks](https://www.notion.com/blog/designing-synced-blocks)
- Airtable: [Airtable Support — Two-way syncing in Airtable](https://support.airtable.com/docs/two-way-syncing-in-airtable), [Airtable Support — Getting Started with Airtable Sync](https://support.airtable.com/docs/getting-started-with-airtable-sync), [Stacksync — Airtable Bi-Directional Sync](https://www.stacksync.com/blog/airtable-bi-directional-sync-achieve-real-time-data-consistency)
- Firestore: [Firebase Docs — Access Data Offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline), [Firebase Docs — Transactions and Batched Writes](https://firebase.google.com/docs/firestore/manage-data/transactions), [Firebase Docs — Transaction Serializability and Isolation](https://firebase.google.com/docs/firestore/transaction-data-contention), [DeepWiki — firebase-js-sdk Local Persistence / MutationQueue](https://deepwiki.com/firebase/firebase-js-sdk/3.2-local-persistence)
- CloudKit: [Apple Developer — CKError.Code.serverRecordChanged](https://developer.apple.com/documentation/cloudkit/ckerror/code/serverrecordchanged), [Rambo Codes — CloudKit 101](https://www.rambo.codes/posts/2020-02-25-cloudkit-101), [Medium — Mastering CloudKit](https://medium.com/@serkankaraa/mastering-cloudkit-a-complete-guide-to-icloud-powered-app-sync-in-ios-775bcc296ba8)
- Offline-first libraries: [RxDB — Alternatives for Realtime Local-First JS Apps](https://rxdb.info/alternatives.html), [RxDB — The Ultimate Offline Database](https://rxdb.info/articles/offline-database.html), [Locize — Offline-First Apps: Architecture & Frameworks](https://www.locize.com/blog/offline-first-apps/)

*App implementation reviewed: `src/data/firebase.ts` (fsSet/fsGetAll/fsListen/fsBatchSet/fsUploadFile) and `src/data/store.ts` (`startFirebaseSync`, `mergeById` LWW logic, `onSnapshot` listeners). Confirmed Firestore offline IndexedDB persistence is **not** enabled (plain `getFirestore(app)`), validating the dropped-offline-write analysis.*
