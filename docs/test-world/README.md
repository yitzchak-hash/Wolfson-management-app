# The test world

His words (2026-11-10): "other than the Wolfson real database that's live that we're not touching ... no one's using
anything for real ... We're only testing." And: "the entire CRM ... Finance app and all the other apps should show the
same fields and info for testing ... 10 of each different types of job ... a list of cold leads ... all the types of
information to be filled in ... in the admin, try to use our real names of users with made up email addresses."

**One description, every app.** `world.json` is the only source. The CRM, Admin, Photos, the phone app and the
Assistant get it from the seed script below (one Supabase database); Finance and the practice job board load the same
file themselves. Same job numbers, same customers, same amounts everywhere.

Everything is made up: names, phones `050-000xxxx`, emails `@test.tzviair.local`, house numbers 201-299 on real
Israeli streets, supplier and subcontractor names ending "(test)". Drive ids are fake (`TEST-WORLD-...`), so a photo
or a plan shows as a missing file; that is expected.

## What is in it (world.json, version 1, its day 2026-11-10)

| Kind (CRM type) | Job numbers | What the ten cover |
|---|---|---|
| Private installation (`residential`) | 10000-10009 | call, site visit, pricing, proposal sent, babysitting (deposit expected), won at deposit, equipment ordered, installing (**bounced cheque**, 10007), completed (**error cost**, 10008), lost (price) |
| Project, tower with units (`installation_project`) | 10010-10019 | call, waiting for plans, plans ready, pricing, proposal sent, won at deposit, equipment ordered, installing (piping done), installing (units in, **error cost**, 10018), completed with all four milestones and **5% retention** (10019) |
| Upgrade in a project flat (`upgrade`) | 10020-10029 | each on a real flat of a test tower; open, babysitting, won, completed, lost (stopped answering), completed and **written off** (10029); payer split buyer 70% / developer 30% |
| Renovation (`renovation`) | 10030-10039 | call to completed, lost (cancelled) |
| Maintenance contract (`maintenance`) | 10040-10049 | open, won, completed, lost (other company) |
| Planning only (`residential`, planning first) | 10050-10059 | planning fee paid, plans delivered (three), one **fee still waiting** (10057), one won the installation after the plans (10058), lost |
| Service calls | SC-9001 to SC-9010 | open, sent to a technician, sent to a subcontractor, fixed, closed; fault ours/customer/unknown; some charged |

Plus: 63 customers (people and companies, he/en/ru/uk) with 86 contacts; 10 towers with 101 flats and an upgrade price
list each; 3 referrers with commission terms (25 commissions: waiting, owed, paid); 23 won jobs and 6 planning jobs;
payment schedules on 30 deals (81 parts, some paid, some billed, some waiting) and 30 deposits; proposals with 2-3 options
and a revised one; 131 photos and videos (before, during, after, problems, one hidden screenshot, office notes), 14
before/after pairs, best shots, share links (some stopped); 47 plans; 132 tasks (and a "raise the bill" task on each
billed, unpaid part); 121 visits and meetings (install,
hafala, keys, errands, cleaning, close job, one cancelled); 101 calls (office line and the phone app, with summaries);
103 notes; 60 WhatsApp drafts; 10 maintenance plans (overdue, due, later; three with a drafted message); a cold list of
20 leads (new, no answer, call back, interested, not interested, one graduated into a deal); 6 Intake items; reminders;
questions to a colleague. Admin: 4 suppliers, 18 models with two dated prices each, day rates for 5 workers and 4
subcontractors.

**Staff are slots, not names.** `owner, admin, office, accounts, sales1, sales2, site, tech1-tech4`. The seed gives
each slot a real person from Admin (`core.people`) by role, and writes the answer to `test_world.staff`
(slot, person_id, name_he, name_en). Finance and the job board read that table (Finance's `finance_reader` may) or take
the list the seed prints, so the work is under the company's real names everywhere.

### For Finance (per job: `deals[].finance`)

`jobNo`, `customer`, `dealValue {beforeVat, vat, withVat}`, `bills[]` (number, part, date, before/VAT/with, paid or
waiting), `payments[]` (date, amount, method, reference, bill; the bounced cheque has `bounced`, `bouncedOn`,
`bankFee`, and its replacement `replaces`), `supplierCosts[]` (supplier key, what, invoice number, date, before/VAT/with,
paid), `splits[]` (payer customer or contact, percent, why), `errorCosts[]` (worker slot, what, amounts), `retention`
(percent, amounts, release date), `writtenOff` (date, amount, reason), `commissions[]`, `paidWithVat`, `balanceWithVat`.
Suppliers, subcontractors and the price list are top-level (`suppliers`, `subcontractors`, `priceList`, `dayRates`).
On every line `beforeVat + vat = withVat` (VAT 18%).

Note for Finance: the seed writes the deposits and commissions straight into the CRM's tables (no events), so they
also show in `core.finance_inbox_v` as waiting. Load them **either** from world.json **or** from the inbox, not both.

### For the practice job board (per won job: `deals[].board`)

`jobNo`, `building`, `address`, `flat`, `floor`, `stage` (Quote sent, Piping, Units installed, Job completed),
`workers[]` (staff slots and subcontractor keys), `tasks[]` (title, worker, date, status, problem).

## The scripts (scripts/test-world/out, made by build-scripts.mjs)

Each is ONE transaction ending in `__COMMIT__`: rehearse with it replaced by `rollback`, then run with `commit`.
Nothing was run against the live database by the session that wrote them.

| Order | File | What it does |
|---|---|---|
| 1 | `01-count-real.sql` | Reads only, always rolls back: the real-looking rows of the CRM, Photos, the phone app and Admin's price list, table by table and app by app; the people by status |
| 2 | `02-save-and-clear-real.sql` | Copies those rows, whole, into `public.crm_records_real_20261110` (and rows whose pointer the database would empty), then removes them, so the apps show the test world only |
| 3 | `03-seed-test-world.sql` | Loads the world. Notes every row first, and at the end writes every row it made (also by triggers) to `test_world.rows` and every row it changed to `test_world.before_rows`. CRM records also carry the CRM's practice mark (`crm.imported_records`, source `practice`, key `tw:...`) |
| later | `04-remove-test-world.sql` | Takes the test world out exactly, with whatever people made on test records meanwhile (listed), puts back what the seed changed, drops `test_world` |
| only if wanted | `05-restore-real.sql` | Puts the saved real rows back exactly (refused while the test world is loaded) |

What is never cleared or changed: people (except the email below), roles, rights, every app's settings, the CRM's
stages, types, sources, reasons, templates and fact fields, the WhatsApp number, the catalog, people's own views and
devices, the Assistant's knowledge and chats, internal messages, the audit and backup logs, Photos' company albums,
the import ledger. Wolfson is never touched. Admin's settings get a value only where empty (company phone and number).

**Emails.** Nobody's sign-in email changes. Only people who were invited and never signed in (no sign-in, no
confirmed email, not owner or admin) get a made-up `name.xxxx@test.tzviair.local` in Admin's list; `auth.users`
is never touched, and 04 puts the old email back.

**Watch on live:** if Admin's price sheet sync is on, it may bring the real price list back after 02; the projects
app filler may bring back customers and jobs it filled (01 counts them). The Drive files of real photos stay in Drive;
only their rows move to the saved table.

## Proof (local database built from the migrations)

`bash scripts/local-stack/build-db.sh` then `bash scripts/test-world/test-local.sh`: copies the local database (every
migration, the seed, local people and the made-up demo customers standing in for real rows), adds two invited people,
then runs 01; 02 rehearsed (database unchanged) and run; 03 rehearsed (unchanged) and run; every view of the apps reads
the world; the fields still empty are listed (`scripts/test-world/sql/check-coverage.sql`); a note, a task and a moved
follow-up are made on test records as if somebody tested; 04 rehearsed and run, and a fingerprint of every table equals
the one after 02; 05 run, and it equals the one before 02. Fields left empty on purpose are machine-only (robot claim
times, Drive checks, AI sorter marks, hashes, thumbnails, merges).

To change the world: edit `scripts/test-world/make-world.mjs`, run it, then `build-scripts.mjs`, then `test-local.sh`
(it refuses if world.json is not what make-world makes). Tell Finance and the job board when world.json changes.
