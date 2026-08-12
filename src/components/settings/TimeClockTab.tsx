import React, { useMemo, useState } from 'react';
import {
  Plus, Trash2, Printer, FileSpreadsheet, ChevronLeft, ChevronRight,
  AlertTriangle, Clock, UserPlus,
} from 'lucide-react';
import { useStore } from '../../data/store';
import { Employee, personColor } from '../../types';
import {
  monthReport, daysInMonth, asHours, asDecimalHours, hhmm, dayOf, atOn, shiftsOf,
} from '../../data/timeClock';
import { downloadXlsx } from '../../data/xlsx';
import { printSheet, printEsc } from '../../data/printing';

/**
 * The office end of the tap-in board.
 *
 * Three jobs, in the order they matter: keep the list of people, correct the
 * days somebody got wrong, and get the month out as something payroll can use.
 *
 * The corrections screen is not an afterthought. A time clock that cannot be
 * corrected is a time clock nobody trusts, and one that can be corrected
 * without saying so is worse — so every figure the app wrote itself is marked,
 * and stays marked after it has been looked at.
 */

const thisMonth = () => new Date().toISOString().slice(0, 7);

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const weekdayOf = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

const isWeekend = (day: string) => {
  const wd = new Date(`${day}T00:00:00`).getDay();
  return wd === 5 || wd === 6;   // Friday and Saturday
};

export function TimeClockTab({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const employees = useStore(s => s.employees);
  const punches = useStore(s => s.timePunches);
  const settings = useStore(s => s.timeClock);
  const addEmployee = useStore(s => s.addEmployee);
  const updateEmployee = useStore(s => s.updateEmployee);
  const deleteEmployee = useStore(s => s.deleteEmployee);
  const setTimeClock = useStore(s => s.setTimeClock);
  const addPunch = useStore(s => s.addPunch);
  const updatePunch = useStore(s => s.updatePunch);
  const deletePunch = useStore(s => s.deletePunch);
  const currentUser = useStore(s => s.currentUser);

  const [month, setMonth] = useState(thisMonth);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [editing, setEditing] = useState<{ employeeId: string; day: string } | null>(null);

  const sorted = useMemo(() => [...employees]
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.name.localeCompare(b.name)),
    [employees]);

  const report = useMemo(
    () => monthReport(sorted.filter(e => e.active), punches, month, settings),
    [sorted, punches, month, settings]);

  const days = daysInMonth(month);
  const grandTotal = report.reduce((s, r) => s + r.totalMinutes, 0);
  const flaggedTotal = report.reduce((s, r) => s + r.flaggedDays, 0);

  // ── adding somebody ────────────────────────────────────────────────────────
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    addEmployee({
      name, role: newRole.trim() || undefined, active: true,
      sortOrder: employees.length,
    });
    setNewName(''); setNewRole('');
    onToast(`${name} added to the time clock`);
  };

  // ── correcting a day ───────────────────────────────────────────────────────
  /**
   * Rewrite one person's one day.
   *
   * Everything already on that day is removed and replaced by exactly the two
   * punches typed in. Patching the existing records instead would leave a day
   * with three clock-ins on it half-corrected, which is precisely the mess
   * somebody is here to clean up.
   */
  const saveDay = (employeeId: string, day: string, inHHMM: string, outHHMM: string) => {
    const mine = punches.filter(p => p.employeeId === employeeId && dayOf(p.at) === day);
    mine.forEach(p => deletePunch(p.id));
    const who = currentUser?.name || 'office';
    if (inHHMM) {
      addPunch({ employeeId, day, at: atOn(day, inHHMM).toISOString(), kind: 'in', source: who });
    }
    if (outHHMM) {
      addPunch({ employeeId, day, at: atOn(day, outHHMM).toISOString(), kind: 'out', source: who });
    }
    setEditing(null);
    onToast(inHHMM || outHHMM ? 'Day corrected' : 'Day cleared');
  };

  // ── the month, on paper ────────────────────────────────────────────────────
  const printMonth = () => {
    const head = `<tr><th style="width:150px">Name</th>`
      + days.map(d => `<th style="text-align:center">${Number(d.slice(8))}<br>`
        + `<span style="font-weight:400;color:#b0b7c3">${printEsc(weekdayOf(d)[0])}</span></th>`).join('')
      + `<th style="text-align:right;width:60px">Total</th></tr>`;

    const body = report.map(r => {
      const cells = r.days.map(dr => {
        if (!dr.minutes && !dr.flagged) {
          return `<td style="text-align:center;color:${isWeekend(dr.day) ? '#e5e7eb' : '#d1d5db'}">·</td>`;
        }
        return `<td style="text-align:center;${dr.flagged ? 'background:#fef3c7' : ''}">`
          + `${printEsc(asHours(dr.minutes))}</td>`;
      }).join('');
      return `<tr><td><b>${printEsc(r.employee.name)}</b>`
        + (r.employee.role ? `<br><span class="muted" style="font-size:9px">${printEsc(r.employee.role)}</span>` : '')
        + `</td>${cells}<td style="text-align:right"><b>${printEsc(asHours(r.totalMinutes))}</b></td></tr>`;
    }).join('');

    const ok = printSheet(
      `Timesheet — ${monthLabel(month)}`,
      `<table style="font-size:9px"><thead>${head}</thead><tbody>${body}</tbody></table>`
      + `<p style="margin-top:12px;font-size:10px;color:#6b7280">`
      + `Total ${printEsc(asHours(grandTotal))} across ${report.length} `
      + `${report.length === 1 ? 'person' : 'people'}.`
      + (flaggedTotal
        ? ` <span style="background:#fef3c7;padding:1px 5px;border-radius:4px">`
          + `${flaggedTotal} shaded ${flaggedTotal === 1 ? 'day was' : 'days were'} completed by the app `
          + `because a tap was missing — check them.</span>`
        : ' Every day was tapped in and out.')
      + `</p>`,
      { landscape: true, subtitle: `${monthLabel(month)} · hours and minutes` },
    );
    if (!ok) onToast('The browser blocked the print window — allow popups for this site.', 'error');
  };

  // ── the month, as a spreadsheet ────────────────────────────────────────────
  const exportMonth = () => {
    /**
     * Two sheets, because payroll and a query are different questions.
     *
     * The summary is the grid somebody signs off. The detail is one row per
     * day with the actual in and out times, which is what gets opened when
     * somebody says "I was there until six on the ninth".
     */
    const summary = [
      ['Name', 'Role', ...days.map(d => `${Number(d.slice(8))} ${weekdayOf(d)}`), 'Total hours'],
      ...report.map(r => [
        r.employee.name,
        r.employee.role ?? '',
        ...r.days.map(dr => (dr.minutes ? asDecimalHours(dr.minutes) : null)),
        asDecimalHours(r.totalMinutes),
      ]),
      [],
      ['Total', '', ...days.map(() => null), asDecimalHours(grandTotal)],
    ];

    const detail: (string | number | null)[][] = [
      ['Name', 'Date', 'Day', 'In', 'Out', 'Hours', 'Written by the app?'],
    ];
    for (const r of report) {
      for (const dr of r.days) {
        if (!dr.minutes && !dr.flagged) continue;
        detail.push([
          r.employee.name, dr.day, weekdayOf(dr.day),
          dr.inAt ? hhmm(dr.inAt) : '',
          dr.outAt ? hhmm(dr.outAt) : '',
          asDecimalHours(dr.minutes),
          dr.flagged ? 'yes — check' : '',
        ]);
      }
    }

    downloadXlsx(`timesheet-${month}`, [
      {
        name: monthLabel(month), header: true, rows: summary,
        widths: [22, 14, ...days.map(() => 6), 11],
      },
      {
        name: 'Detail', header: true, rows: detail,
        widths: [22, 12, 7, 8, 8, 8, 20],
      },
    ]);
    onToast(`timesheet-${month}.xlsx downloaded`);
  };

  return (
    <div className="space-y-5">
      {/* ── who is on the payroll ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <UserPlus size={17} className="text-[#1e3a5f]" />
          <h3 className="font-bold text-gray-900">People</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Its own list, separate from the app's users and from your contractors — somebody who taps in
          every morning does not need a login and does not take assignments.
        </p>

        <div className="flex gap-2 mb-4 flex-wrap">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="Name"
            className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#4aa8d8]"
          />
          <input
            value={newRole} onChange={e => setNewRole(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="Installer, office, driver…"
            className="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#4aa8d8]"
          />
          <button onClick={add} disabled={!newName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 flex items-center gap-1.5"
            style={{ backgroundColor: '#1e3a5f' }}>
            <Plus size={15} /> Add
          </button>
        </div>

        <div className="space-y-1.5">
          {sorted.length === 0 && (
            <p className="text-sm text-gray-400">Nobody yet. Add your first person above.</p>
          )}
          {sorted.map(e => <EmployeeRow key={e.id} e={e}
            onChange={c => updateEmployee(e.id, c)}
            onDelete={() => {
              const mine = punches.filter(p => p.employeeId === e.id).length;
              const warn = mine
                ? `Remove ${e.name}? This also removes ${mine} clock-in${mine === 1 ? '' : 's'}. `
                  + `To keep their hours, switch them off instead.`
                : `Remove ${e.name}?`;
              if (window.confirm(warn)) { deleteEmployee(e.id); onToast(`${e.name} removed`); }
            }} />)}
        </div>
      </div>

      {/* ── the rules ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={17} className="text-[#1e3a5f]" />
          <h3 className="font-bold text-gray-900">When somebody forgets</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          A day left open is closed at the end time below rather than running into the next one, and a
          clock-out with no clock-in gets a start written at the start time. Both get shaded on the
          report so you can check them — the app never quietly invents hours.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Day starts at" hint="used when a clock-in is missing">
            <input type="time" value={settings.dayStart}
              onChange={e => setTimeClock({ dayStart: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#4aa8d8]" />
          </Field>
          <Field label="Day ends at" hint="used to close a forgotten day">
            <input type="time" value={settings.dayEnd}
              onChange={e => setTimeClock({ dayEnd: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#4aa8d8]" />
          </Field>
          <Field label="Unpaid break" hint="minutes off any day with time on it">
            <input type="number" min={0} max={180} value={settings.breakMinutes}
              onChange={e => setTimeClock({ breakMinutes: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#4aa8d8]" />
          </Field>
          <Field label="Round to" hint="0 keeps the exact minutes">
            <select value={settings.roundMinutes}
              onChange={e => setTimeClock({ roundMinutes: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#4aa8d8]">
              <option value={0}>Exact</option>
              <option value={5}>5 minutes</option>
              <option value={15}>Quarter hour</option>
              <option value={30}>Half hour</option>
            </select>
          </Field>
        </div>
      </div>

      {/* ── the month ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))}
            className="p-1.5 rounded-lg hover:bg-gray-100" title="Previous month">
            <ChevronLeft size={17} />
          </button>
          <h3 className="font-bold text-gray-900 min-w-[150px] text-center">{monthLabel(month)}</h3>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100" title="Next month">
            <ChevronRight size={17} />
          </button>
          {month !== thisMonth() && (
            <button onClick={() => setMonth(thisMonth())}
              className="text-xs font-semibold text-[#4aa8d8]">this month</button>
          )}

          <span className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-500">
              total <b className="text-gray-800 tabular-nums">{asHours(grandTotal)}</b>
            </span>
            <button onClick={printMonth}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700
                         hover:bg-gray-50 flex items-center gap-1.5">
              <Printer size={15} /> Print
            </button>
            <button onClick={exportMonth}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5"
              style={{ backgroundColor: '#16a34a' }}>
              <FileSpreadsheet size={15} /> Excel
            </button>
          </span>
        </div>

        {flaggedTotal > 0 && (
          <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              {flaggedTotal} {flaggedTotal === 1 ? 'day was' : 'days were'} completed by the app because
              a tap was missing. They are shaded below and on the printout — click one to correct it.
            </span>
          </div>
        )}

        {report.length === 0 ? (
          <p className="text-sm text-gray-400">Nobody active to report on.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-[11px] border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white text-left px-2 py-1 min-w-[130px] border-b border-gray-200">
                    Name
                  </th>
                  {days.map(day => (
                    <th key={day} className="px-1 py-1 border-b border-gray-200 font-semibold"
                      style={{ minWidth: 34, color: isWeekend(day) ? '#cbd5e1' : '#64748b' }}>
                      <div>{Number(day.slice(8))}</div>
                      <div className="font-normal text-[8px] text-gray-300">{weekdayOf(day)[0]}</div>
                    </th>
                  ))}
                  <th className="px-2 py-1 border-b border-gray-200 text-right min-w-[52px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.map(r => (
                  <tr key={r.employee.id}>
                    <td className="sticky left-0 bg-white px-2 py-1 border-b border-gray-100 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: personColor(r.employee.name, r.employee.color) }} />
                        <b>{r.employee.name}</b>
                      </span>
                    </td>
                    {r.days.map(dr => (
                      <td key={dr.day} className="px-0.5 py-1 border-b border-gray-100 text-center">
                        <button
                          onClick={() => setEditing({ employeeId: r.employee.id, day: dr.day })}
                          className="w-full rounded px-0.5 py-0.5 tabular-nums hover:ring-1 hover:ring-[#4aa8d8]"
                          title={`${r.employee.name} — ${dr.day}${dr.flagged ? ' (the app filled this in)' : ''}`}
                          style={{
                            backgroundColor: dr.flagged ? '#fef3c7' : 'transparent',
                            color: dr.minutes ? '#334155' : (isWeekend(dr.day) ? '#e2e8f0' : '#cbd5e1'),
                          }}
                        >
                          {dr.minutes ? asHours(dr.minutes) : '·'}
                        </button>
                      </td>
                    ))}
                    <td className="px-2 py-1 border-b border-gray-100 text-right tabular-nums font-bold">
                      {asHours(r.totalMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <DayEditor
          employee={employees.find(e => e.id === editing.employeeId)!}
          day={editing.day}
          shifts={shiftsOf(punches, editing.employeeId, settings).filter(s => s.day === editing.day)}
          onClose={() => setEditing(null)}
          onSave={(i, o) => saveDay(editing.employeeId, editing.day, i, o)}
        />
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

function EmployeeRow({ e, onChange, onDelete }: {
  e: Employee;
  onChange: (c: Partial<Employee>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
      <label className="relative flex-shrink-0" title="Their colour on the board">
        <span className="block w-6 h-6 rounded-full border border-white shadow-sm"
          style={{ backgroundColor: personColor(e.name, e.color) }} />
        <input type="color" value={personColor(e.name, e.color)}
          onChange={ev => onChange({ color: ev.target.value })}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
      </label>
      <input
        value={e.name}
        onChange={ev => onChange({ name: ev.target.value })}
        className="flex-1 min-w-0 px-2 py-1 rounded border border-transparent hover:border-gray-200
                   focus:border-[#4aa8d8] text-sm font-semibold outline-none bg-transparent"
      />
      <input
        value={e.role ?? ''}
        placeholder="role"
        onChange={ev => onChange({ role: ev.target.value })}
        className="w-32 px-2 py-1 rounded border border-transparent hover:border-gray-200
                   focus:border-[#4aa8d8] text-xs text-gray-500 outline-none bg-transparent"
      />
      <label className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0"
        title="Switching somebody off takes them off the board and keeps every hour they worked">
        <input type="checkbox" checked={e.active} onChange={ev => onChange({ active: ev.target.checked })} />
        on the board
      </label>
      <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 text-red-500 flex-shrink-0"
        title="Remove — this also removes their clock-ins">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/** Correcting one person's one day. */
function DayEditor({ employee, day, shifts, onClose, onSave }: {
  employee: Employee;
  day: string;
  shifts: { inAt: string; outAt: string | null; autoIn: boolean; autoOut: boolean }[];
  onClose: () => void;
  onSave: (inHHMM: string, outHHMM: string) => void;
}) {
  const first = shifts[0];
  const last = shifts[shifts.length - 1];
  const [inV, setInV] = useState(first ? hhmm(first.inAt) : '');
  const [outV, setOutV] = useState(last?.outAt ? hhmm(last.outAt) : '');

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,.45)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={ev => ev.stopPropagation()}>
        <h3 className="font-bold text-gray-900">{employee.name}</h3>
        <p className="text-xs text-gray-500 mb-4">
          {new Date(`${day}T00:00:00`).toLocaleDateString(undefined,
            { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>

        {shifts.length > 1 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mb-3">
            There are {shifts.length} separate shifts on this day. Saving replaces all of them with the
            one pair of times below.
          </p>
        )}
        {(first?.autoIn || last?.autoOut) && (
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mb-3">
            {first?.autoIn && 'The clock-in was written by the app. '}
            {last?.autoOut && 'The clock-out was written by the app.'}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Clocked in">
            <input type="time" value={inV} onChange={e => setInV(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#4aa8d8]" />
          </Field>
          <Field label="Clocked out">
            <input type="time" value={outV} onChange={e => setOutV(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#4aa8d8]" />
          </Field>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600">
            Cancel
          </button>
          <button onClick={() => onSave('', '')}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-red-600">
            Clear day
          </button>
          <button onClick={() => onSave(inV, outV)}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#1e3a5f' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
