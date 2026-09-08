# Search — what it does today, and how to make it materially better

Reference written 2026-09-08 after the owner's report: he searched a word that
appears in a job's **Google Drive folder title** ("Cohen, David - 5555 - Ramat
Gan") and the job did not come up. The app only keeps the family name it derived
from that title ("Cohen, David"); the title itself was fetched, shown once, and
thrown away. **A fix for exactly that is being landed in this working tree as
this is written** (uncommitted: `Apartment.driveFolderName`, see 1.3) — this
file records what was true before it, what that change covers, and what it
does not. The audit found the same shape of gap on a dozen other fields, and a
ranking/latency design that will not hold up on a board of 1,650 jobs.

Line numbers are as of this date on `claude/ui-widget-fixes-fosqdk`, working
tree INCLUDING the uncommitted `driveFolderName` change.

---

## 1. This codebase — six search sites, no shared index

There is no search index. Every site re-scans the records on every keystroke
with its own copy of the tiers. Six places search, and they do not agree on
what a job can be found by:

| Site | File | What a JOB is found by | Forgiveness |
|---|---|---|---|
| Header search (Ctrl+K) | `src/components/ui/GlobalSearch.tsx` 379–395 | `displayName`, `apartmentNumber`, `driveFolderName` (tiers + skeleton); `generalNotes`, `address`, `phone` **fuzzy-only** | prefix / word-prefix / substring / Fuse 0.45 / skeleton Fuse 0.34, wrong-layout swap |
| Search tile (board + TV) | `src/components/board/SearchTileWidget.tsx` 200–286 | `aptLabel`, `driveFolderName`, `address`, `phone`, `generalNotes`, task text (substring + skeleton); Fuse 0.4 over the **label only** | same variants |
| Job list (`/list`, phone) | `src/pages/JobListPage.tsx` 84–97 | `aptLabel`, `driveFolderName`, `generalNotes`, `address`, `phone` | substring + skeleton, **no fuzzy** |
| TV group window | `src/pages/TvPresentationPage.tsx` 1807–1818 | `displayName`, `address`, `phone`, `generalNotes` | substring + skeleton |
| Board group window | `src/components/board/BinBoard.tsx` 314–315 | `displayName`, `address` | **plain substring only** — no variants, no Hebrew |
| Find-a-job widget | `src/data/widgets.tsx` 2691–2707 | `displayName`, `apartmentNumber`, `address` | a DIFFERENT phonetic scheme (`hebrewSearch.ts` `soundScore`), threshold 0.55 |

So the same query answers differently depending on which box it was typed
into, and a job findable by its phone from the tile is not findable by its
phone from the header.

### 1.1 What the header search indexes today (`GlobalSearch.tsx`)

`hunt()` (281–306) is called once per record kind per workspace. The
prefix/word-prefix/substring tiers and the skeleton pass read `textOf(it)`;
Fuse reads `keys`. Those two are NOT the same text:

| Kind | Fuse `keys` | `textOf` (tiers + skeleton) | Cap per workspace | Lines |
|---|---|---|---|---|
| Jobs / apartments | displayName, apartmentNumber, generalNotes, driveFolderName, address, phone | `displayName apartmentNumber driveFolderName` | 6 | 379–395 |
| Tasks | taskDescription | taskDescription | 3 | 396–410 |
| Stage notes | noteText (flat join of entries) | noteText | 3 | 412–425 |
| Worker messages | text | text | 3 | 428–440 |
| Groups (bins) | name | name | 4 | 443–456 |
| Board nodes | text, kind (text = `el.text` + `docName` + every string in `data`) | text | 3 | 458–477 |
| Plan markups | planName, createdBy, note | planName | 4 | 480–493 |
| Workers (global, once) | name, email | name | 4 | 506–516 |
| Stages (global, once) | name, nameHe, description | `name nameHe` | 4 | 521–536 |

Consequences of the `keys` ≠ `textOf` split:
- A word in `generalNotes`, `address` or `phone` can only ever match through
  the FUZZY tier (rank ≥ 200), never as a substring or skeleton — so a
  Hebrew address is not found by an English query, a phone fragment is
  matched by bitap distance rather than by containment, and an exact note
  word ranks below a misspelled name. (The uncommitted change put these
  three into `keys` but not into `textOf`.)
- `apartmentNumber` is in `textOf` but the search refuses anything under two
  characters (262), so unit "7" is unreachable by number; "47" works only
  because it happens to be two digits.

### 1.2 Fields that EXIST and are never searched (header search)

On the job record (`src/types/index.ts`, `Apartment` 585–751):

| Field | Line | Why it matters |
|---|---|---|
| **Drive folder title** | `driveFolderName` 731 — **new, uncommitted** | The owner's report. Was fetched at 8 places and discarded; now stored and searched by the header, tile and list (see 1.3 for what still discards it). Holds first name, a number, the city — but is indexed as ONE string, not by its segments. |
| `address` | 743 | Every imported job has one; the tile and list search it as a substring, the header only through Fuse (fuzzy tier). |
| `phone` | 749 | 459 imported jobs carry one. Header: fuzzy tier only. A phone is typed in fragments ("054…", "…4567"), which is containment, not edit distance. |
| `tipus` | 595 | In `aptLabel` (so in the tile's label) but not in the header's `textOf`. |
| `driveLink` / `zohoLink` / `plansPdfLink` | 724, 742, 733 | Pasting a Drive folder URL or Zoho deal URL into search should land on the job that owns it. `extractFolderId` / `extractFileId` already exist in `driveApi.ts`. |
| `noteEntries[].byName`, `.at` | 619 | "what did Esther write about" — the author is on the entry, not in the flat join. |
| `buildingId` + `floor` | 587, 597 | "A2 47", "floor 12" — the diagram's own vocabulary. |
| `stageMarks` / `boardBin` / `problem` | 723, 628, — | A job's STATE is not a word anybody can type ("pending", "in trash", "problem") — could be filter words. |
| `contentUpdatedAt` / `createdAt` | 641, 758 | Not in the ranking at all (see 1.4). |

On related records:

| Record | Unsearched fields | Lines |
|---|---|---|
| `ContractorAssignment` | attachment filenames (`TaskAttachment.filename` 1191) and their `transcript` (1197); `general.projectId` (1246 — a general job has `apartmentId: ''`, so its subtitle shows nothing and it cannot be found by its workspace); `problem` (1262); the WORKER's name is shown in the subtitle but not matched | 1202–1262 |
| `ContractorNote` | `attachmentFilename` 1308, `transcript` 1326 (a voice memo's words are stored and never searched), `authorName` 1305 | 1297–1326 |
| `StageNote` | `attachments[].filename` 582, entry authors 561, `attachmentFilename` 576 | 565–582 |
| `OfficeNoteFile` | `filename` 1389, `transcript` 1397 — **not searched at all**, no kind for it | 1385–1397 |
| `PlanPin` | `text` 917, `audioTranscript` 931, `files[].filename` 939 — **not searched at all** (the punch list is invisible to search) | 911–933 |
| `ContractorPhoto` | `filename` 1367 — not searched | 1361– |
| `Contractor` | `phone` does not exist on the record; `category` shown but not matched | 1075– |
| `ActivityLog` | not searched (fine — it is a log) | 1023– |
| Buildings, workspaces | not searched; "Netiv" typed into search finds nothing | — |

### 1.3 The Drive folder title: fetched everywhere, kept nowhere — until today

`familyNameFromFolderName` (`src/data/driveApi.ts` 271–274) keeps everything
before the first `" -"`. Until today the full title was read by
`getFolderNameViaBackend` at eight places and dropped at every one of them.

**What the uncommitted change in this working tree does** (a parallel session,
same day): `Apartment.driveFolderName` (`types/index.ts` 731, riding
`apartments` — no new store key, no backup-audit change); it is in the store's
`CANVAS_ONLY` set (`store.ts` 1154) so writing it never bumps "last edited";
a `setDriveFolderNames(projectId, id→title)` action (`store.ts` 1312–1335)
batch-writes titles for ANY workspace — live or snapshot — with one
`fsBatchSet`; it is written back by the drawer on open (`ApartmentDetailDrawer.tsx`
583–584) and on link save (1024, 1028) and by paste-to-create
(`GeneralJobsPage.tsx` 3127); it is searched by the header, the tile and the
job list; `scratchpad/gsearch.mjs` grew a "word only in the folder title"
check.

**What still discards the title** (as of this tree):
- `src/pages/GeneralJobsPage.tsx` 500–503 (the Add Job lookup) and
  8178–8179 (the blank-name heal);
- `src/components/settings/ImportJobsCard.tsx` 147–148 (the wizard);
- `src/data/autoJobs.ts` 81, 122 (the Drive sweep — it has the title of
  every new job in hand and is the natural BACKFILL for the ~1,000 existing
  linked jobs);
- `src/pages/SettingsPage.tsx` 1708–1714 (Pull Family Names still derives
  the name and drops the title);
- the store action exists but **no caller of `setDriveFolderNames` is wired
  yet**, so nothing backfills the ~1,000 existing linked jobs until one is —
  today's change covers jobs OPENED or LINKED from now on.
- The TV group window, the board group window and the Find-a-job widget do
  not read it (section 1 table).

The office's folder convention is `Family, First - <number> - <City>`. The
number and the city are exactly what somebody types when they cannot remember
the family name. The title is currently indexed as ONE string — "Ramat Gan"
is found as a substring (rank 100), "gan" as a word prefix (rank 5) but
"5555" competes with every other digit run through bitap; see section 2 for
the segment tokenising that makes each part a first-class field.

### 1.4 Where the ranking misleads

1. **No recency, no liveness.** A job finished in 2023 and filed in Done ties
   with the live job of the same name; the tie goes to gather order. With
   546 jobs in Done and 151 in Archive, a common family name returns mostly
   finished work. `contentUpdatedAt` is on every record and unused.
2. **Per-kind, per-workspace caps of 6/3/3/3** (379, 396, 412, 428) decide
   WHICH six before ranking across kinds. Fifteen Cohens on the Job Board
   show six, chosen by tier then insertion order.
3. **One query = one string.** "cohen ramat" is matched as the 11-character
   string "cohen ramat" against each field; two words that live in two fields
   (name + folder title / address) can only meet through Fuse's bitap, which
   will happily match "cohen ramat" against a long note instead. There is no
   per-token AND.
4. **Fuzzy over long text.** `generalNotes` (6 lines of import text on a
   thousand jobs) is in the Fuse keys at threshold 0.45 with
   `ignoreLocation`. Bitap on a 32-char window inside a 300-char field finds
   "lev" almost anywhere — and `address`/`phone` now sit in the same fuzzy
   net. The subtitle then prints the note's FIRST line (383–385) whatever
   field matched — a hit on the folder title or the phone is invisible.
5. **The learned pick is a hammer.** `pickBoost` (175–183) gives −10000 when
   a remembered query `startsWith` / is-a-prefix-of the current one. Having
   once picked "Cohen, David" for "cohen", typing "cohen ramat" — a
   different Cohen — still puts David first. No decay, no per-workspace
   scope, and a pick for a job now in Trash is still remembered.
6. **Two phonetic schemes.** `translit.ts` `skeleton()` (38–66: ה→h kept,
   ו→v only, no geresh digraphs, c→k always) versus `hebrewSearch.ts`
   `soundKeys()` (78–83: h dropped, vav read BOTH ways, ג׳/ז׳/צ׳ handled,
   tz/z folded). "יוסף" skeletons to `vsp` and "Yosef" to `sp` in
   translit.ts — they only meet through the 0.34 fuzzy on skeletons. The
   Find-a-job widget and the header search therefore disagree on Hebrew.
7. **No Hebrew normalisation before the plain tiers.** Niqqud, maqaf (־),
   gershayim (״) and final-letter forms are compared raw in
   `text.includes(ql)`; only the skeleton pass folds finals. A name typed
   "כהן" against a stored "כהן" is fine; "לוי-כהן" vs "לוי כהן" is not.
8. **Substring vs word-prefix.** `text.split(/[\s,.·—/()-]+/)` (296) does
   not split on `'`, `"`, `״`, `׳`, `_` or Hebrew punctuation, so a word
   after an apostrophe is only a substring (rank 100).
9. **Workers rank by the OPEN workspace's task count** (507) and are
   returned once — fine — but a worker's subtitle "0 open tasks here" reads
   as "wrong worker" when their work is in another workspace.

### 1.5 Latency — the per-keystroke rebuild

`hunt()` constructs **two `new Fuse(...)`** and computes `skeleton()` for
every record, per kind, per workspace, on every keystroke (282–284), and the
whole effect re-runs whenever any store slice in its deps changes (564–565)
— a Firestore echo mid-typing re-searches. The snapshots are parsed once
(CLAUDE.md is right about that); the indexes are not.

Measured in Node on this container with the office's shape (1,650 jobs with
import notes, 600 tasks, 300 messages; `scratchpad` bench, one workspace):

| | ms |
|---|---|
| One keystroke, one workspace, three kinds (as `hunt` does it) | **42–50** |
| of which Fuse `search()` over the 1,650 jobs alone | 27 |
| Fuse index build for the jobs | 1.9 |

Three workspaces plus the other kinds lands at roughly 100–150 ms per key on
a fast desktop, more on the office touchscreen — over the 100 ms line where
as-you-type search reads as laggy. Note the cost is Fuse's bitap SCAN, not
the index build: pre-building Fuse would not fix it. An inverted index
answers the same query in ~1 ms (section 3).

---

## 2. What good looks like for a small CRM (research)

Distilled from Algolia's and MiniSearch/Orama's documentation, the HebMorph
notes on Hebrew IR, and the 2026 client-side library comparisons (sources at
the end).

**Tokenise, then match tokens — not the whole string.** Split every field
on whitespace and punctuation (including `,` `-` `–` `—` `/` `'` `״` `׳`
`·`), index each token, and match each QUERY token independently with
`AND` across tokens. "cohen ramat" then means: a document with a token
starting with `cohen` AND a token starting with `ramat`, in any field, any
order. This is the single biggest quality change and it is what every
CRM search (Zoho, HubSpot, Pipedrive) does.

**Prefix by default, fuzzy as the fallback, substring only for digits.**
Search-as-you-type is prefix matching: `coh` → `cohen`. Fuzzy (edit
distance) catches "coen" but must be BOUNDED — the accepted rule is one edit
for terms of 4–7 characters, two for 8+, none under 4 (Algolia's
default; Orama's `tolerance: 1`; MiniSearch's `fuzzy: 0.2` = 20% of the
term length rounded). Unbounded fuzz on short terms is what produced
"concealed" for "lev". Substring (infix) matching is needed for ONE thing
in this app: digit fragments of phone numbers and folder numbers — index
those as their own field of digit n-grams (or keep a plain `includes` pass
over digits only).

**Weight the fields, and let exactness beat fuzz.** Typical CRM weights:
name ×10, other identifying fields (folder title, first name, city) ×5,
address/phone ×3, notes/messages ×1. Then, in order: exact token > prefix >
fuzzy, and a match in a high-weight field beats several in low-weight
ones. BM25 (which MiniSearch and Orama use) already discounts terms that
appear in every document ("residence", "deal") — the note boilerplate the
import wrote on a thousand jobs stops being a match at all.

**Recency and usage as tiebreakers, never as the score.** Multiply the
relevance by a mild recency factor (e.g. `1 + 0.3 × e^(−days/90)`) and by a
mild usage factor (picked before ×1.2, picked for this query ×2). Never a
flat −10000: a learned pick should win a TIE, not overrule a better match.
Decay picks (halve the weight every 30 days) and drop them when the record
is gone or trashed.

**Hebrew.** Normalise BEFORE indexing and apply the same function to the
query: strip niqqud and cantillation (`NFKD`, then remove `\p{Mn}`, i.e.
U+0591–U+05C7), fold final letters to base (ך→כ ם→מ ן→נ ף→פ ץ→צ),
normalise geresh/gershayim/maqaf to ASCII, and treat the geresh digraphs
(ג׳ ז׳ צ׳) as their own consonants. Keep the consonant skeleton as a SECOND
indexed field so that cross-alphabet matching is an ordinary prefix match on
that field (weighted below the plain one) instead of a fuzzy scan. Read
vav both ways and index both skeletons — `hebrewSearch.ts` already does
this; `translit.ts` does not. Do not stem Hebrew (HebMorph's own
conclusion for names: prefixes ה/ו/ב/ל/מ/ש can be stripped as an EXTRA
token, never in place).

**Names like "Cohen, David - 5555 - Ramat Gan".** Split on ` - ` into
segments first (family+first / number / city), then tokenise each
segment. Index: `family` = "Cohen" (weight 10), `first` = "David" (6),
`folderNumber` = "5555" (exact match only), `city` = "Ramat Gan" (4), and
the whole title as one lower-weight field so a query for the literal
string still hits. Keep the family name the app already derives; the
title is additive.

**Latency budget.** Under 50 ms end-to-end reads as instant, 100 ms as
laggy (Algolia). With a pre-built inverted index a 5k-record query is
1–5 ms, so a debounce is unnecessary for the search itself; a 60–80 ms
trailing debounce is still worth keeping for the RENDER of a 30-row list
during fast typing. Build the index once per workspace on open and update
it incrementally on record changes (`replace`/`discard`), never rebuild
per keystroke.

**Show why it matched.** A result whose match is in a hidden field must
say so ("Drive folder: Cohen, David - 5555 - Ramat Gan", "phone", "note:
…the geves…") with the matched term highlighted. Otherwise a correct
result reads as a wrong one.

---

## 3. Library recommendation: MiniSearch

| | Fuse.js 7 (now) | **MiniSearch** | FlexSearch | Orama | Lunr |
|---|---|---|---|---|---|
| Model | bitap scan of every record per query | inverted index, BM25+ | inverted/contextual index | inverted index + schema | inverted index, tf-idf |
| Prefix | no (only via fuzz) | yes, per token | yes | yes | trailing `*` |
| Fuzzy | yes, unbounded threshold | edit-distance, bounded (fraction or int, `maxFuzzy`) | **no** | yes, Levenshtein `tolerance` | edit distance `~1` |
| Field weights | yes | yes (`boost`), plus `boostDocument` for recency/usage | no | yes | field boost at build |
| Multi-token AND | no | yes (`combineWith: 'AND'`) | yes | yes | yes |
| Incremental add/remove/replace | rebuild | yes (`add`/`replace`/`discard`/`vacuum`) | add yes | yes | **no** (static) |
| Custom tokenizer / term normaliser, different at index vs query time | no | yes (`tokenize`, `processTerm`, `searchOptions.processTerm`) | limited | via `components` | pipeline |
| Size | ~4 KB | ~7 KB, zero deps, TS | ~6 KB | ~22 KB | ~8 KB |
| 10k-doc query (published) | ~800 ms | ~5 ms class | ~5 ms | ~8 ms | ~10 ms |

MiniSearch fits because everything this app needs is a first-class option:
per-field boost, bounded fuzz, prefix, AND across tokens, incremental
updates for the live workspace's Firestore echoes, a `processTerm` hook
where the Hebrew normaliser lives, and `boostDocument` for the recency and
learned-pick multipliers. It is 7 KB with no dependencies and is written in
TypeScript. FlexSearch is faster still but has no fuzzy matching and no
field weights, which are two of the three things this search exists for.
Orama would also work but is three times the size and its schema/vector
machinery buys nothing here. Lunr cannot update an index in place, and the
board changes under the search every few seconds.

What MiniSearch does NOT do, and what to keep beside it:
- **Infix matching** — a query matches the START of a token only. Keep one
  cheap pass for digit fragments (phone, folder number) — a `digits` field
  holding 3–4-gram tokens, or a plain `includes` over a pre-joined digit
  string per job (1,650 `includes` calls is under a millisecond).
- **The wrong-keyboard swap** — stays exactly as it is: run
  `layoutSwap(query)` and search both.
- **Skeleton matching** — becomes a second indexed field (`sk`), so it
  costs nothing per keystroke.

Fuse.js can then be removed. Nothing else in the app uses it.

---

## 4. Concrete improvements, in priority order

Effort is rough: S = an hour or two, M = a day, L = two to three days.

| # | Change | Effect | Effort |
|---|---|---|---|
| 1 | **Finish the Drive folder title** (`driveFolderName` — the type, the store action and three write sites are in the working tree, see 1.3). Remaining: write it from the Add Job lookup (`GeneralJobsPage.tsx` 500), the heal (8178), the wizard (`ImportJobsCard.tsx` 147) and the Drive sweep (`autoJobs.ts` 81, 122); **wire a caller for `setDriveFolderNames`** — the sweep is the natural hourly backfill for the ~1,000 linked jobs, or the "Pull Family Names" card (`SettingsPage.tsx` 1708) as a one-press one; read it in the TV group window, the board group window and Find-a-job; add `driveFolderName` to the `gsearch` seed's other workspaces so the cross-workspace case is covered too. Sync means one machine's fetch serves all. | The owner's report, fixed at the root for EXISTING jobs, not only ones opened after today; first names, folder numbers and cities searchable everywhere. | S |
| 2 | **One index module**: `src/data/searchIndex.ts` — one MiniSearch per workspace holding a document per record kind (`kind`, `id`, `projectId`, fields), built from the live store (open workspace) and `loadProjectSnapshot` (others), updated with `replace`/`discard` from the store's own mutation paths or a cheap diff on `snapshotTick`. Every one of the six sites in section 1 queries it. Tokeniser + `processTerm` = the Hebrew normaliser from #5 + lowercase; a second `sk` field per document carries the skeleton. | One answer everywhere; ~1 ms queries; the BinBoard and TV group windows get Hebrew and fuzz for free. | L |
| 3 | **Index the missing fields** (section 1.2): `address` and `phone` as real tiers (normalised digits + local form), `tipus`, `driveFolderName` split into family / first / number / city segments, the Drive folder id and Zoho deal id (so a pasted URL finds the job), `buildingId`+`floor` tokens ("a2", "47", "floor12"), task attachment/note attachment/office-file/photo filenames, every `transcript`, `PlanPin.text` + `audioTranscript` (a new `pin` result kind opening the job's plan), note-entry authors, general jobs' workspace name, the worker's name on a task. | Voice memos, punch-list pins and attachments become findable; a URL from a chat message lands on the job. | M (after #2) |
| 4 | **Ranking**: field boosts (name 10, folder family 8, first name/city 5, address 4, phone 3, tipus 3, task/notes 1); `combineWith: 'AND'` with `prefix: true` and `fuzzy: 0.2` (max 2); an exact-token bonus; `boostDocument` = recency (`contentUpdatedAt`, mild) × liveness (Done/Archive/Ready ×0.7) × learned pick (×1.2 any, ×2 for this query, decayed 30 days, dropped for trashed ids). Replace the per-kind caps with one global top-40 and a per-kind ceiling of 15. | The live Cohen outranks the 2023 one; "cohen ramat" finds the one job; the learned pick stops overruling better matches. | M |
| 5 | **One Hebrew normaliser** (`src/data/hebrewNormalize.ts`): NFKD + strip `\p{Mn}`, fold finals, geresh digraphs, maqaf/gershayim → ASCII; apply at index AND query. Merge `translit.ts` and `hebrewSearch.ts` into one skeleton with vav both ways and h dropped (the `hebrewSearch` rules — they were tuned against real names); keep `layoutSwap`. Extend the offline worked-pairs tests. | The Find-a-job widget, duplicates detector and header search agree; "יוסף" meets "Yosef" without fuzz. | M |
| 6 | **Show the why**: each result carries `matchedField` + a snippet with the term highlighted; the subtitle says "Drive folder: …", "phone: 054…", "note: …", "memo: …" instead of the first note line. | A correct hit in a hidden field no longer reads as a wrong hit. | S (after #2) |
| 7 | **Digit search**: single-character queries allowed when the query is all digits (unit "7"); a `digits` field of 3-grams for phones and folder numbers so "4567" finds 050-123-4567. | Units by number, phones by fragment. | S |
| 8 | **Filter words**: `ws:netiv`, `stage:geves`, `in:done`, `worker:yossi`, `problem`, `pending` parsed off the query and turned into MiniSearch `filter`. The stage/worker/group kinds keep their own rows too. | The diagram's and board's own vocabulary works in the box. | M |
| 9 | **Latency hygiene**: 60–80 ms trailing debounce on the RENDER only; the effect must not re-run on unrelated store slices (index updates are pushed, not pulled); measure on the office touchscreen with the `smoulder`/`boardperf` manner and keep a `searchperf` probe at 1,650 jobs. | Under 50 ms per key everywhere. | S (after #2) |
| 10 | **Recent + picks per workspace** and a "clear learned picks" control; picks keyed by `kind:id`, decayed. | Learning helps instead of sticking. | S |

**#1 is DONE (2026-09-08, the round after this document)**: Add Job (submit +
the raced heal), the wizard and the sweep write the title; the sweep backfills
every linked job it lists in any workspace (the only caller of
`setDriveFolderNames`); Find-a-job, the board group window and the TV group
window read it. Probes: `foldertitle-probe.mjs`, `autojobs-probe.mjs`. The
`gsearch` cross-workspace seed is the one sub-item not touched.

**#2–#10 are BUILT (2026-09-08, the same day, owner: "go ahead and build the
search rebuild")** — `src/data/searchIndex.ts` (one MiniSearch index per
workspace, kept between keystrokes and re-synced record by record; a WeakMap
ad-hoc index for a bare job list), `src/data/hebrewNormalize.ts` (the one
normaliser + sound key; `translit.ts` and `hebrewSearch.ts` delegate to it),
`src/data/searchMemory.ts` (recent queries, learned picks keyed per workspace,
30-day half-life, `clearPicks`). All six sites read the index. Fields indexed:
name, folder title split into family / first / number / city, address, phone
(+ digits), tipus, unit tokens (`A1 47 A147 floor3`), Drive folder / plan file
/ Zoho ids, notes, note authors + open-task workers, office file names, memo
transcripts; tasks, stage notes, messages, groups, board nodes, markups, pins
and office files are documents of their own. Tiers a whole tier apart
(start · exact · prefix · contains · digits · fuzzy · sound); recency,
liveness (a grouped job +8) and picks move a hit only inside its tier, a pick
for the SAME query goes to the top. Filter words: `stage:` `group:` `worker:`
`ws:` `is:problem` `is:pending` (Hebrew twins). "Why it matched" on the header
rows and the tile. Probes: `hebnorm-test.mjs`, `searchindex-test.mjs`,
`searchperf.mjs` (3,736 docs index in ~215ms, worst keystroke 22ms), `gsearch`
(+6). `fuse.js` is gone from the dependencies. Not done, by decision: ranking
by Drive activity (CRM-CHECKLIST).

---

## 5. Rules to keep (settled, do not re-litigate)

- **Trash never appears; Done/Ready/Archive appear, labelled** with their
  group. Confirmed by the owner. Demote binned jobs in ranking; never hide.
- **The open workspace ranks first on a TIE**, never above a better match
  elsewhere — and every result carries its own `projectId`.
- **Switch-then-intent**: `setCurrentProject` clears `pendingFocus`, so the
  intent is handed over AFTER the switch (`goTo`, `GlobalSearch.tsx`
  592–609). A page consumes only the kinds AND the workspace it can show.
- **Typed-as-written beats sounds-alike beats fuzz**: exact > prefix >
  word-prefix > substring > fuzzy > skeleton/translit. A learned pick breaks
  ties inside a tier; it does not jump tiers.
- **Recent searches and learned picks are per machine** (`search_recent`,
  `search_picks` in localStorage) — never the store, the export or
  Firestore; therefore never in the backup audit.
- **Only the open workspace is live**; the others come from
  `loadProjectSnapshot` (re-read on `snapshotTick`) and the footer says so.
  An index for a snapshot workspace is rebuilt on `snapshotTick`, not per
  keystroke.
- **A job row is draggable** out of the results (`ResultRow` +
  `usePlannerDrag`); the dialog stands aside while a drag is live. Keep the
  row a `div role=button` — a button inside a button is flattened.
- **The crosshair reveals without opening** on every result that has a
  place (`reveal: true` on the apartment intent).
- **No hardcoded English in new UI strings** — result-kind labels and
  "why it matched" prefixes go through `MainUiStrings` (both presets) or the
  portal's three-way `w()`.
- **Every search site reads the same index** once #2 lands; a seventh
  scanner is the bug.
- **`driveFolderName` is bookkeeping, not content**: it stays in
  `CANVAS_ONLY` (never bumps `contentUpdatedAt`, never shows as "edited") and
  is written only from a Drive read, never typed.
- Harnesses to keep green and extend: `scratchpad/gsearch.mjs` (cross-
  workspace, now with the folder-title check), `round20.mjs` (tiers +
  learned pick), `searchtile-probe.mjs`,
  and an offline worked-pairs test for the normaliser/skeleton (the
  `translit` idiom: tested against examples, not trusted).

---

## Sources

- MiniSearch README and API — https://github.com/lucaong/minisearch ,
  https://lucaong.github.io/minisearch/types/MiniSearch.SearchOptions.html
- Fuse.js scoring, bitap and performance —
  https://www.fusejs.io/concepts/scoring-theory.html ,
  https://www.fusejs.io/performance.html
- Client-side library comparison (2026) —
  https://www.pkgpulse.com/guides/fusejs-vs-flexsearch-vs-orama-client-side-search-2026 ,
  https://npm-compare.com/elasticlunr,flexsearch,fuse.js,minisearch
- Orama typo tolerance and boosting —
  https://www.mintlify.com/oramasearch/orama/search/typo-tolerance ,
  https://github.com/oramasearch/orama
- Hebrew indexing (HebMorph) — https://code972.com/blog/2010/05/challenges-with-indexing-hebrew-texts-hebmorph-part-1-18 ,
  https://code972.com/blog/2010/06/open-source-hebrew-information-retrieval-hebmorph-part-3-20 ;
  niqqud stripping — https://www.ezrabrand.com/p/how-to-programatically-strip-hebrew ,
  https://github.com/linkaiil1234/hebrew-text-utils
- As-you-type latency thresholds — https://www.algolia.com/blog/engineering/algolia-v-elasticsearch-latency ,
  https://www.algolia.com/doc/guides/building-search-ui/going-further/improve-performance/js ,
  https://www.tutorialpedia.org/blog/how-long-should-you-debounce-text-input/
