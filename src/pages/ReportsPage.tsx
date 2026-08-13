import React, { useState, useMemo, useEffect } from 'react';
import {
  Download, Printer, Plus, Trash2, Save, RefreshCw, Table2, BarChart3, ListTree,
  ChevronDown, ChevronRight, X, FileSpreadsheet, Copy, Search,
} from 'lucide-react';
import { useStore } from '../data/store';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';
import { printTable } from '../data/printing';
import { downloadXlsx } from '../data/xlsx';
import { isCountableApartment } from '../types';
import {
  SUBJECTS, SubjectId, ReportDef, ReportField, Rule, Op, OPS_FOR,
  runReport, subjectOf, newReport, ReportData, Cell,
} from '../data/reportModel';

/**
 * The report builder.
 *
 * What was here before could answer exactly one question — "list the
 * apartments, with these columns" — and everything else came back as "export
 * it and open it in Excel". This is the four-part thing a CRM gives you: pick
 * what a row IS, pick the columns (including ones reached across to a related
 * record), narrow it with rules, and group it. The grouping is the part that
 * turns a list into an answer.
 *
 * All the arithmetic lives in `reportModel.ts` and is pure, so it can be — and
 * is — tested against hand-worked numbers. A report is the kind of thing that
 * goes wrong QUIETLY: a filter that drops binned jobs looks like a report with
 * fewer rows, not like a fault. This file is only the controls and the drawing.
 */

const NAVY = '#1e3a5f';

export function ReportsPage() {
  const {
    apartments: allApartments, stages: allStages, buildings, stageNotes,
    contractorAssignments, contractors, activityLogs,
    mainUiStrings: s, currentProjectId, projects, currentUser,
    savedReports, saveReport, deleteReport,
  } = useStore();
  const projectName = projects.find(p => p.id === currentProjectId)?.name ?? 'Workspace';

  /**
   * Refreshed on demand.
   *
   * "Today" decides what counts as overdue and what "days late" means, and the
   * app can sit open on a screen for a week. A report showing yesterday's
   * answer with no way to ask again is worse than one that is obviously stale,
   * so the date is state and the refresh button moves it — which also re-reads
   * everything the store has picked up from other people in the meantime.
   */
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());

  const apartments = currentProjectId === 'general'
    ? allApartments.filter(a => a.buildingId === 'G' && isCountableApartment(a))
    : allApartments;
  const stages = currentProjectId === 'general'
    ? allStages.filter(st => st.projectId === 'general')
    : allStages.filter(st => !st.projectId);

  const data: ReportData = useMemo(() => ({
    apartments, assignments: contractorAssignments, contractors, stages, buildings,
    stageNotes, activity: activityLogs, isRtl: !!s.isRtl, today: asOf,
  }), [apartments, contractorAssignments, contractors, stages, buildings,
    stageNotes, activityLogs, s.isRtl, asOf, refreshedAt]);

  const mine = savedReports[currentProjectId] ?? [];

  const [def, setDef] = useState<ReportDef>(() => newReport('jobs'));
  const [dirty, setDirty] = useState(false);
  const [openPanel, setOpenPanel] = useState<'columns' | 'filters' | 'shape' | null>('columns');
  const [colSearch, setColSearch] = useState('');

  const subject = subjectOf(def.subject);
  const result = useMemo(() => runReport(def, data), [def, data]);

  const patch = (p: Partial<ReportDef>) => { setDef(d => ({ ...d, ...p })); setDirty(true); };

  /** Switching subject cannot keep the old columns — they belong to another shape. */
  function changeSubject(id: SubjectId) {
    const fresh = newReport(id);
    setDef(d => ({ ...fresh, id: d.id, name: d.name.startsWith('Report') ? fresh.name : d.name }));
    setDirty(true);
  }

  function toggleColumn(key: string) {
    patch({ columns: def.columns.includes(key)
      ? def.columns.filter(k => k !== key)
      : [...def.columns, key] });
  }

  const isSaved = mine.some(r => r.id === def.id);

  function doSave(asNew = false) {
    const next: ReportDef = {
      ...def,
      id: asNew ? `R-${Math.random().toString(36).slice(2, 10)}` : def.id,
      name: asNew ? `${def.name} (copy)` : def.name,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name ?? '',
    };
    saveReport(next);
    setDef(next);
    setDirty(false);
  }

  // ── getting it out ─────────────────────────────────────────────────────────

  const headers = result.columns.map(c => c.label);
  const cellText = (c: Cell) => (c === null || c === undefined ? '' : String(c));

  function exportCSV() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      headers.map(esc).join(','),
      ...result.rows.map(r => r.cells.map(c => esc(cellText(c))).join(',')),
    ].join('\n');
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
      `${slug(def.name)}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }

  function exportExcel() {
    // A real workbook rather than a CSV: one sheet keeps the header bold, the
    // columns sized, and Hebrew intact — Excel's CSV import guesser mangles
    // all three.
    downloadXlsx(`${slug(def.name)}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`, [{
      name: subject.label.slice(0, 28),
      header: true,
      rows: [headers, ...result.rows.map(r => r.cells.map(c => c ?? ''))],
      widths: headers.map(h => Math.min(40, Math.max(12, h.length + 4))),
    }]);
  }

  function printReport() {
    printTable(
      `${def.name} — ${projectName}`,
      result.rows.map(r => r.cells),
      headers.map((h, i) => ({ header: h, value: (cells: Cell[]) => cellText(cells[i]) })),
      {
        landscape: result.columns.length > 5,
        rtl: !!s.isRtl,
        subtitle: describe(def, result.rows.length, result.total, subject.nounPlural, asOf),
      },
    );
  }

  // ── the page ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          value={def.name}
          onChange={e => patch({ name: e.target.value })}
          className="text-xl md:text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-transparent
                     hover:border-gray-200 focus:border-[#4aa8d8] outline-none px-1 -ml-1 min-w-[12rem]"
        />
        {dirty && <span className="text-[11px] font-semibold text-amber-600">unsaved</span>}
        <span className="flex-1" />

        <Btn onClick={() => { setRefreshedAt(new Date()); setAsOf(new Date().toISOString().slice(0, 10)); }}
          icon={RefreshCw} label="Refresh" title="Re-read everything and move the report to today" />
        <Btn onClick={printReport} icon={Printer} label={s.print} />
        <Btn onClick={exportCSV} icon={Download} label="CSV" />
        <Btn onClick={exportExcel} icon={FileSpreadsheet} label="Excel" />
        {isSaved && <Btn onClick={() => doSave(true)} icon={Copy} label="Save a copy" />}
        <button onClick={() => doSave(false)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: NAVY }}>
          <Save size={15} /> {isSaved ? 'Save' : 'Save report'}
        </button>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* ── saved reports ── */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide flex-1">
                  Saved reports
                </span>
                <button onClick={() => { setDef(newReport('jobs')); setDirty(false); }}
                  title="Start a new report"
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-[#1e3a5f]">
                  <Plus size={15} />
                </button>
              </div>
              {mine.length === 0 ? (
                <p className="px-3 py-4 text-[11.5px] text-gray-400 leading-snug">
                  Nothing saved yet. Build a report below and press Save — everybody in this
                  workspace gets it.
                </p>
              ) : (
                <div className="max-h-[52vh] overflow-y-auto divide-y divide-gray-50">
                  {mine.map(r => (
                    <div key={r.id}
                      className={`group flex items-center gap-1 px-3 py-2 text-left cursor-pointer
                        ${r.id === def.id ? 'bg-[#eef4fa]' : 'hover:bg-gray-50'}`}
                      onClick={() => { setDef(r); setDirty(false); }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] font-semibold text-gray-800 truncate">{r.name}</div>
                        <div className="text-[10.5px] text-gray-400 truncate">
                          {subjectOf(r.subject).label}
                          {r.groupBy ? ' · grouped' : ''}
                          {r.rules.length ? ` · ${r.rules.length} filter${r.rules.length === 1 ? '' : 's'}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          deleteReport(r.id);
                          if (r.id === def.id) { setDef(newReport('jobs')); setDirty(false); }
                        }}
                        title="Delete this report"
                        className="p-1 rounded opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <div className="min-w-0">
            {/* ── what a row is ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">
                One row is…
              </div>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.map(sub => {
                  const on = sub.id === def.subject;
                  return (
                    <button key={sub.id} onClick={() => changeSubject(sub.id)} title={sub.blurb}
                      className="px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors"
                      style={on
                        ? { backgroundColor: NAVY, color: '#fff', borderColor: NAVY }
                        : { backgroundColor: '#fff', color: '#475569', borderColor: '#e5e7eb' }}>
                      {sub.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-gray-400 mt-2">{subject.blurb}</p>
            </div>

            {/* ── columns ── */}
            <Panel
              title="Columns"
              summary={`${def.columns.length} shown`}
              open={openPanel === 'columns'}
              onToggle={() => setOpenPanel(p => (p === 'columns' ? null : 'columns'))}
            >
              <div className="relative mb-3 max-w-xs">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={colSearch} onChange={e => setColSearch(e.target.value)}
                  placeholder="Find a column"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none
                             focus:border-[#4aa8d8]" />
              </div>
              {groupFields(subject.fields).map(([group, fields]) => {
                const shown = fields.filter(f =>
                  !colSearch.trim() || f.label.toLowerCase().includes(colSearch.trim().toLowerCase()));
                if (!shown.length) return null;
                return (
                  <div key={group} className="mb-3 last:mb-0">
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                      {group}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {shown.map(f => {
                        const on = def.columns.includes(f.key);
                        return (
                          <button key={f.key} onClick={() => toggleColumn(f.key)}
                            className="px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors"
                            style={on
                              ? { backgroundColor: '#eef4fa', color: NAVY, borderColor: '#bcd7ec' }
                              : { backgroundColor: '#fff', color: '#94a3b8', borderColor: '#e5e7eb' }}>
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/*
                Order matters and dragging chips is fiddly, so the chosen columns
                are listed again in the order they will print, with arrows.
              */}
              {def.columns.length > 1 && (
                <div className="border-t border-gray-100 mt-3 pt-3">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                    In this order
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {def.columns.map((k, i) => {
                      const f = subject.fields.find(x => x.key === k);
                      if (!f) return null;
                      return (
                        <span key={k} className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full
                                                 text-[12px] font-medium bg-gray-50 border border-gray-200 text-gray-600">
                          {f.label}
                          <button disabled={i === 0} title="Move left"
                            onClick={() => patch({ columns: swap(def.columns, i, i - 1) })}
                            className="px-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25">‹</button>
                          <button disabled={i === def.columns.length - 1} title="Move right"
                            onClick={() => patch({ columns: swap(def.columns, i, i + 1) })}
                            className="px-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25">›</button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </Panel>

            {/* ── filters ── */}
            <Panel
              title="Filters"
              summary={def.rules.length ? `${def.rules.length} rule${def.rules.length === 1 ? '' : 's'}` : 'none'}
              open={openPanel === 'filters'}
              onToggle={() => setOpenPanel(p => (p === 'filters' ? null : 'filters'))}
            >
              {def.rules.length > 1 && (
                <div className="flex items-center gap-2 mb-3 text-[12.5px] text-gray-500">
                  Rows must match
                  <select value={def.match} onChange={e => patch({ match: e.target.value as 'all' | 'any' })}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-sm">
                    <option value="all">every rule</option>
                    <option value="any">any rule</option>
                  </select>
                </div>
              )}
              <div className="space-y-2">
                {def.rules.map((rule, i) => (
                  <RuleRow key={i} rule={rule} fields={subject.fields} data={data}
                    onChange={r => patch({ rules: def.rules.map((x, j) => (j === i ? r : x)) })}
                    onRemove={() => patch({ rules: def.rules.filter((_, j) => j !== i) })} />
                ))}
              </div>
              <button
                onClick={() => patch({
                  rules: [...def.rules,
                    { field: subject.fields[0].key, op: OPS_FOR[subject.fields[0].type][0].op, value: '' }],
                })}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed
                           border-gray-300 text-[12.5px] font-semibold text-gray-500 hover:border-[#4aa8d8]
                           hover:text-[#1e3a5f]">
                <Plus size={13} /> Add a rule
              </button>
            </Panel>

            {/* ── grouping and shape ── */}
            <Panel
              title="Group &amp; show"
              summary={def.groupBy
                ? `by ${subject.fields.find(f => f.key === def.groupBy)?.label ?? '…'}`
                : def.show}
              open={openPanel === 'shape'}
              onToggle={() => setOpenPanel(p => (p === 'shape' ? null : 'shape'))}
            >
              <div className="flex flex-wrap items-end gap-4">
                <Field label="Group by">
                  <select value={def.groupBy ?? ''}
                    onChange={e => patch({ groupBy: e.target.value || undefined })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm min-w-[10rem]">
                    <option value="">Nothing — a flat list</option>
                    {subject.fields.filter(f => f.type !== 'number').map(f =>
                      <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </Field>

                <Field label="Measure">
                  <select value={def.metric ?? 'count'} onChange={e => patch({ metric: e.target.value })}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm min-w-[10rem]">
                    <option value="count">How many {subject.nounPlural}</option>
                    {subject.fields.filter(f => f.type === 'number').map(f =>
                      <option key={f.key} value={f.key}>Total {f.label.toLowerCase()}</option>)}
                  </select>
                </Field>

                <Field label="Sort by">
                  <div className="flex gap-1.5">
                    <select value={def.sortBy ?? ''} onChange={e => patch({ sortBy: e.target.value || undefined })}
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm min-w-[9rem]">
                      <option value="">However they come</option>
                      {subject.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select value={def.sortDir} onChange={e => patch({ sortDir: e.target.value as 'asc' | 'desc' })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      <option value="asc">▲</option>
                      <option value="desc">▼</option>
                    </select>
                  </div>
                </Field>

                <Field label="Show it as">
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    {([
                      ['table', Table2, 'Table'],
                      ['summary', ListTree, 'Grouped'],
                      ['chart', BarChart3, 'Chart'],
                    ] as const).map(([v, Icon, label]) => (
                      <button key={v} onClick={() => patch({ show: v })}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold"
                        style={def.show === v
                          ? { backgroundColor: NAVY, color: '#fff' }
                          : { color: '#64748b' }}>
                        <Icon size={13} /> {label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              {def.show !== 'table' && !def.groupBy && (
                <p className="text-[11.5px] text-amber-600 mt-3">
                  Pick something to group by — a chart of one bar is just the total.
                </p>
              )}
            </Panel>

            {/* ── the numbers ── */}
            <Stats def={def} result={result} subject={subject} asOf={asOf} refreshedAt={refreshedAt} />

            {/* ── the answer ── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {result.rows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-gray-400">
                  Nothing matches. {def.rules.length > 0
                    ? 'Loosen a rule above, or switch “every rule” to “any rule”.'
                    : `There are no ${subject.nounPlural} in ${projectName} yet.`}
                </p>
              ) : def.show === 'chart' && def.groupBy ? (
                <Chart result={result} />
              ) : def.show === 'summary' && def.groupBy ? (
                <Grouped result={result} />
              ) : (
                <Flat result={result} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── little pieces ────────────────────────────────────────────────────────────

const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';

const swap = (arr: string[], a: number, b: number) => {
  const out = [...arr];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
};

/** Field list → [group heading, its fields], in the order the subject declared. */
function groupFields(fields: ReportField[]): [string, ReportField[]][] {
  const out: [string, ReportField[]][] = [];
  fields.forEach(f => {
    const row = out.find(([g]) => g === f.group);
    if (row) row[1].push(f);
    else out.push([f.group, [f]]);
  });
  return out;
}

function describe(def: ReportDef, shown: number, total: number, plural: string, asOf: string): string {
  const bits = [`${shown} of ${total} ${plural}`];
  if (def.rules.length) bits.push(`${def.rules.length} filter${def.rules.length === 1 ? '' : 's'}`);
  if (def.groupBy) bits.push('grouped');
  bits.push(`as at ${asOf}`);
  return bits.join(' · ');
}

function Btn({ onClick, icon: Icon, label, title }: {
  onClick: () => void; icon: React.ElementType; label: string; title?: string;
}) {
  return (
    <button onClick={onClick} title={title}
      className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm
                 font-medium text-gray-600 hover:bg-gray-50 transition-colors">
      <Icon size={15} /> {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</span>
      {children}
    </label>
  );
}

function Panel({ title, summary, open, onToggle, children }: {
  title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        {open ? <ChevronDown size={15} className="text-gray-400" />
          : <ChevronRight size={15} className="text-gray-400" />}
        <span className="text-sm font-bold text-gray-700">{title}</span>
        <span className="text-[11.5px] text-gray-400">{summary}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/**
 * One filter rule.
 *
 * The operator list follows the field's TYPE, so a date never offers "contains"
 * and a number never offers "is empty" — an operator that cannot apply is worse
 * than a missing one, because choosing it silently returns nothing and looks
 * like an empty report.
 */
function RuleRow({ rule, fields, data, onChange, onRemove }: {
  rule: Rule;
  fields: ReportField[];
  data: ReportData;
  onChange: (r: Rule) => void;
  onRemove: () => void;
}) {
  const field = fields.find(f => f.key === rule.field) ?? fields[0];
  const ops = OPS_FOR[field.type];
  const needsValue = !['empty', 'notempty'].includes(rule.op);
  const needsSecond = rule.op === 'between';
  const choices = field.choices?.(data);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={rule.field}
        onChange={e => {
          const next = fields.find(f => f.key === e.target.value)!;
          // The old operator may not exist for the new field's type.
          const keep = OPS_FOR[next.type].some(o => o.op === rule.op);
          onChange({ field: next.key, op: keep ? rule.op : OPS_FOR[next.type][0].op, value: '' });
        }}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] max-w-[13rem]">
        {groupFields(fields).map(([g, fs]) => (
          <optgroup key={g} label={g}>
            {fs.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </optgroup>
        ))}
      </select>

      <select value={rule.op} onChange={e => onChange({ ...rule, op: e.target.value as Op })}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]">
        {ops.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>

      {needsValue && (choices && ['is', 'isnot'].includes(rule.op) ? (
        <select value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] min-w-[8rem]">
          <option value="">…</option>
          {choices.map(c => <option key={c.value} value={c.label}>{c.label}</option>)}
        </select>
      ) : (
        <input
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          value={rule.value}
          onChange={e => onChange({ ...rule, value: e.target.value })}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] w-36 outline-none
                     focus:border-[#4aa8d8]" />
      ))}

      {needsSecond && (
        <>
          <span className="text-[12px] text-gray-400">and</span>
          <input
            type={field.type === 'date' ? 'date' : 'number'}
            value={rule.value2 ?? ''}
            onChange={e => onChange({ ...rule, value2: e.target.value })}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] w-36 outline-none
                       focus:border-[#4aa8d8]" />
        </>
      )}

      <button onClick={onRemove} title="Remove this rule"
        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50">
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * The numbers above the table.
 *
 * "How many, out of how many, and when was this true" — the three things
 * somebody reads before the rows, and the ones that were missing entirely.
 * The as-at date is stated because a report left open overnight is answering
 * yesterday's question until it is refreshed.
 */
function Stats({ def, result, subject, asOf, refreshedAt }: {
  def: ReportDef;
  result: ReturnType<typeof runReport>;
  subject: ReturnType<typeof subjectOf>;
  asOf: string;
  refreshedAt: Date;
}) {
  // Only columns that declared themselves worth totalling. "Total floor: 12"
  // across four apartments is arithmetic that is correct and says nothing.
  const numeric = result.columns.filter(c => c.sum);
  const totals = numeric.map(c => {
    const i = result.columns.indexOf(c);
    return { label: c.label, value: result.rows.reduce((sum, r) => sum + Number(r.cells[i] ?? 0), 0) };
  });

  return (
    <div className="flex flex-wrap items-stretch gap-2 mb-4">
      <Stat big={String(result.rows.length)} small={subject.nounPlural} accent />
      {result.rows.length !== result.total && (
        <Stat big={String(result.total)} small={`before ${def.rules.length === 1 ? 'the filter' : 'filters'}`} />
      )}
      {def.groupBy && <Stat big={String(result.groups.length)} small="groups" />}
      {totals.slice(0, 4).map(t => (
        <Stat key={t.label} big={t.value.toLocaleString()} small={`total ${t.label.toLowerCase()}`} />
      ))}
      <div className="flex flex-col justify-center px-3 py-2 rounded-xl border border-dashed border-gray-200">
        <span className="text-[10.5px] text-gray-400 leading-tight">as at</span>
        <span className="text-[12px] font-semibold text-gray-600 leading-tight">{asOf}</span>
        <span className="text-[10px] text-gray-300 leading-tight">
          read {format(refreshedAt, 'HH:mm')}
        </span>
      </div>
    </div>
  );
}

function Stat({ big, small, accent }: { big: string; small: string; accent?: boolean }) {
  return (
    <div className="px-4 py-2 rounded-xl border"
      style={accent
        ? { backgroundColor: '#eef4fa', borderColor: '#bcd7ec' }
        : { backgroundColor: '#fff', borderColor: '#e5e7eb' }}>
      <div className="text-xl font-bold leading-tight" style={{ color: accent ? NAVY : '#334155' }}>{big}</div>
      <div className="text-[10.5px] text-gray-400 leading-tight">{small}</div>
    </div>
  );
}

const align = (t: string) => (t === 'number' ? 'text-right' : '');
const show = (c: Cell) => (c === null || c === undefined || c === '' ? '—' : String(c));

function Flat({ result }: { result: ReturnType<typeof runReport> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {result.columns.map(c => (
              <th key={c.key}
                className={`px-3 py-2.5 text-[11px] font-bold text-gray-500 uppercase tracking-wide
                            whitespace-nowrap ${c.type === 'number' ? 'text-right' : 'text-left'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {result.rows.map(r => (
            <tr key={r.id} className="hover:bg-gray-50">
              {r.cells.map((cell, i) => (
                <td key={i}
                  className={`px-3 py-2 text-gray-700 ${align(result.columns[i].type)}`}
                  style={{ maxWidth: 320 }}>
                  <span className="block truncate" title={show(cell)}>{show(cell)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Grouped({ result }: { result: ReturnType<typeof runReport> }) {
  const [shut, setShut] = useState<Set<string>>(new Set());
  return (
    <div className="divide-y divide-gray-100">
      {result.groups.map(g => {
        const open = !shut.has(g.key);
        return (
          <div key={g.key}>
            <button
              onClick={() => setShut(prev => {
                const n = new Set(prev);
                n.has(g.key) ? n.delete(g.key) : n.add(g.key);
                return n;
              })}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50/70 hover:bg-gray-100 text-left">
              {open ? <ChevronDown size={14} className="text-gray-400" />
                : <ChevronRight size={14} className="text-gray-400" />}
              <span className="text-sm font-bold text-gray-700 flex-1 truncate">{g.key}</span>
              <span className="text-sm font-bold" style={{ color: NAVY }}>{g.value.toLocaleString()}</span>
              <span className="text-[10.5px] text-gray-400">{result.metricLabel}</span>
            </button>
            {open && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {g.rows.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        {r.cells.map((cell, i) => (
                          <td key={i} className={`px-3 py-1.5 text-gray-600 ${align(result.columns[i].type)}`}
                            style={{ maxWidth: 320 }}>
                            <span className="block truncate" title={show(cell)}>{show(cell)}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A bar chart, drawn as divs.
 *
 * No charting library: a horizontal bar per group is a width and a label, and
 * the whole reason to reach for one — axes, scales, tooltips — is absent here.
 * Bars run horizontally so a long group name has room to be read.
 */
function Chart({ result }: { result: ReturnType<typeof runReport> }) {
  const max = Math.max(1, ...result.groups.map(g => g.value));
  return (
    <div className="p-4 space-y-2">
      {result.groups.map(g => (
        <div key={g.key} className="flex items-center gap-3">
          <div className="w-40 md:w-52 text-[12.5px] text-gray-600 truncate text-right" title={g.key}>
            {g.key}
          </div>
          <div className="flex-1 h-6 rounded-md bg-gray-50 overflow-hidden">
            <div className="h-full rounded-md flex items-center justify-end px-2"
              style={{
                width: `${Math.max(2, (g.value / max) * 100)}%`,
                backgroundColor: NAVY,
              }}>
              <span className="text-[11px] font-bold text-white">{g.value.toLocaleString()}</span>
            </div>
          </div>
        </div>
      ))}
      <div className="text-[10.5px] text-gray-400 pt-1">{result.metricLabel}</div>
    </div>
  );
}
