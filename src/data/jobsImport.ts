import { extractFolderId } from './driveApi';

/**
 * Importing jobs onto the Job Board from the app's OWN template.
 *
 * The first version parsed Zoho's deals export and carried the CRM's stage
 * names in a hardcoded routing table. The owner replaced that with a wizard:
 * download a template, fill it, upload it back — so the columns are ours, the
 * stages and groups are whatever the office types, and nothing about another
 * system's export format is baked in.
 *
 * Everything here is PURE — no store, no DOM, no network — so the arithmetic
 * is testable offline. Fetching family names from Drive folder titles is the
 * CARD's job (it needs the backend); rows arrive here already enriched.
 */

// ── The template ────────────────────────────────────────────────────────────

/** Column order in the downloadable template. Matching on upload is by
 *  HEADER NAME (case-insensitive), so reordering columns cannot break it. */
export const TEMPLATE_COLUMNS = [
  'Drive folder link',
  'Family name',
  'Address',
  'Phone',
  'Zoho link',
  'Stage',
  'Group',
  'General notes',
] as const;

/** The file the wizard hands out: headers plus one worked example row. */
export function templateCsv(): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const example = [
    'https://drive.google.com/drive/folders/EXAMPLE_ID',
    '(leave blank to pull from the folder name)',
    'Herzl 12, Jerusalem',
    '052-1234567',
    'https://crm.zoho.com/...',
    'AC installation',
    'Ready to Start',
    'Anything worth remembering about this job',
  ];
  return TEMPLATE_COLUMNS.join(',') + '\n' + example.map(esc).join(',') + '\n';
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/**
 * A real quoted-CSV walk — split(',') dies on the first quoted comma.
 * Handles quoted fields, doubled quotes inside them, and \r\n endings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export interface TemplateRow {
  driveUrl: string;
  family: string;
  address: string;
  phone: string;
  zoho: string;
  stage: string;
  group: string;
  notes: string;
}

/** Read a filled template. The header row is found by its column names, so a
 *  file with preamble lines above it still parses. */
export function parseTemplateCsv(text: string): TemplateRow[] {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const hi = rows.findIndex(r =>
    r.some(c => /drive folder/i.test(c)) && r.some(c => /family/i.test(c)));
  if (hi === -1) return [];
  const header = rows[hi].map(c => c.trim().toLowerCase());
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const iDrive = col(/drive folder/);
  const iFamily = col(/family/);
  const iAddress = col(/address/);
  const iPhone = col(/phone/);
  const iZoho = col(/zoho/);
  const iStage = col(/^stage$/);
  const iGroup = col(/^group$/);
  const iNotes = col(/notes/);
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const out: TemplateRow[] = [];
  for (const r of rows.slice(hi + 1)) {
    const row: TemplateRow = {
      driveUrl: cell(r, iDrive),
      family: cell(r, iFamily),
      address: cell(r, iAddress),
      phone: cell(r, iPhone),
      zoho: cell(r, iZoho),
      stage: cell(r, iStage),
      group: cell(r, iGroup),
      notes: cell(r, iNotes),
    };
    // The example row ships in the template; it must never import.
    if (row.driveUrl.includes('EXAMPLE_ID')) continue;
    if (row.family.startsWith('(leave blank')) row.family = '';
    if (Object.values(row).every(v => !v)) continue;
    out.push(row);
  }
  return out;
}

// ── Field rules ─────────────────────────────────────────────────────────────

/**
 * The CRM and spreadsheets strip the leading zero off some Israeli numbers.
 * Put it back — and ONLY there. Anything international (+…), anything already
 * starting with 0, and anything American (leading 1, or a bare 10+ digit
 * number) is left exactly as typed. An Israeli number missing its zero has at
 * most 9 digits.
 */
export function normalizePhone(raw: string): string {
  const p = raw.trim();
  if (!p) return '';
  if (p.startsWith('+')) return p;
  const first = p[0];
  if (first === '0' || first === '1') return p;
  const digits = p.replace(/\D/g, '');
  if (digits.length > 0 && digits.length <= 9) return '0' + p;
  return p;
}

// ── Planning ────────────────────────────────────────────────────────────────

export interface PlannedJob {
  family: string;
  driveUrl: string;
  folderId: string | null;
  address: string;
  phone: string;
  zoho: string;
  stageName: string | null;
  /** '' = the open board; otherwise a group LABEL matched or created at apply. */
  groupName: string;
  notes: string;
  /** Things worth a human glance before Apply. Never blocks on its own. */
  warnings: string[];
}

export interface SkippedRow {
  label: string;
  reason: string;
}

export interface ImportPlan {
  planned: PlannedJob[];
  skipped: SkippedRow[];
  /** Stage names the workspace does not have yet and Apply would create. */
  stagesToCreate: string[];
  /** Group labels (beyond existing ones) Apply would create. */
  groupsToCreate: string[];
}

export interface PlanContext {
  /**
   * Drive folder id → workspace name, for every OTHER workspace's apartments.
   * A row whose Drive folder is already an apartment's folder in Wolfson or
   * Netiv is that workspace's job and must not become a board tile.
   */
  otherWorkspaceFolders: Map<string, string>;
  /** Drive folder ids already on jobs in THIS workspace — re-running an import must not duplicate. */
  existingFolderIds: Set<string>;
  /** Names of stages that already exist for this workspace, as typed. */
  existingStageNames: string[];
  /** Labels of groups that already exist on the board (built-ins included). */
  existingGroupNames: string[];
}

const OTHER_WORKSPACE_NAME = /wolfson|netiv|neve shamir/i;

export function planImport(rows: TemplateRow[], ctx: PlanContext): ImportPlan {
  const planned: PlannedJob[] = [];
  const skipped: SkippedRow[] = [];
  const seenFolders = new Map<string, string>();

  for (const row of rows) {
    const label = row.family || row.driveUrl || row.address || '(empty row)';
    const folderId = row.driveUrl ? extractFolderId(row.driveUrl) : null;
    if (row.driveUrl && !folderId) {
      skipped.push({ label, reason: 'that is not a Drive FOLDER link' });
      continue;
    }
    if (folderId) {
      const owner = ctx.otherWorkspaceFolders.get(folderId);
      if (owner) {
        skipped.push({ label, reason: `Drive folder belongs to ${owner}` });
        continue;
      }
      if (ctx.existingFolderIds.has(folderId)) {
        skipped.push({ label, reason: 'already on the board (same Drive folder)' });
        continue;
      }
    }
    if (!row.family && !folderId) {
      skipped.push({ label, reason: 'no family name and no Drive folder to read one from' });
      continue;
    }

    const warnings: string[] = [];
    const m = (row.family + ' ' + row.notes).match(OTHER_WORKSPACE_NAME);
    if (m) warnings.push(`mentions "${m[0]}" — check it is not that workspace's job`);
    if (!folderId) warnings.push('no Drive link');
    if (folderId) {
      const dup = seenFolders.get(folderId);
      if (dup) warnings.push(`same Drive folder as "${dup}"`);
      else seenFolders.set(folderId, row.family || label);
    }

    planned.push({
      family: row.family,
      driveUrl: row.driveUrl,
      folderId,
      address: row.address,
      phone: normalizePhone(row.phone),
      zoho: row.zoho,
      stageName: row.stage || null,
      groupName: row.group,
      notes: row.notes,
      warnings,
    });
  }

  const stageNamesLower = new Set(ctx.existingStageNames.map(n => n.trim().toLowerCase()));
  const stagesToCreate = [...new Set(
    planned.map(p => p.stageName).filter((n): n is string => !!n && !stageNamesLower.has(n.toLowerCase()))
  )];
  const groupNamesLower = new Set(ctx.existingGroupNames.map(n => n.trim().toLowerCase()));
  const groupsToCreate = [...new Set(
    planned.map(p => p.groupName).filter(g => g && !groupNamesLower.has(g.toLowerCase()))
  )];

  return { planned, skipped, stagesToCreate, groupsToCreate };
}
