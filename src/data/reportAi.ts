/**
 * THE REPORT TILES' AI (owner, 2026-11-17: "when I click on the tile, a window opens up with an AI chat. And in this
 * AI chat, I can explain what report I want with a microphone … and then it will create the report and save it on
 * that green tile").
 *
 * The AI never sees a record and never runs anything. It is handed the LIST OF THINGS A REPORT CAN BE MADE OF — the
 * subjects, their columns, the filter operators, and the choice lists the filter boxes already offer (stage names,
 * worker names, buildings) — plus the conversation, and it answers with a report DEFINITION. That definition is then
 * checked here against the same list (an unknown column or operator is dropped, never trusted) and run by the app's
 * own report engine, so the numbers on the tile are the app's arithmetic, not the AI's.
 */
import {
  SUBJECTS, SubjectId, ReportDef, Rule, Op, OPS_FOR, subjectOf, newReport, ReportData, fieldsOf,
} from './reportModel';

const API_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';

export interface ChatLine { role: 'user' | 'ai'; text: string }

/** What a report can be made of, in the shape the AI reads. Choice lists are capped — a hint, not a dump. */
export function reportCatalog(data: ReportData) {
  return SUBJECTS.map(s => ({
    id: s.id,
    label: s.label,
    about: s.blurb,
    fields: fieldsOf(s, data).map(f => {
      // A stage's status words are the same for every stage and are spelled out in the instructions instead —
      // repeated per stage per subject they would be most of the list.
      const stageStatus = /(^|\.)st\./.test(f.key);
      let choices: string[] | undefined;
      try { choices = stageStatus ? undefined : f.choices?.(data).map(c => c.label).filter(Boolean).slice(0, 60); } catch { choices = undefined; }
      return {
        key: f.key, label: f.label, type: f.type,
        ...(f.sum ? { totalable: true } : {}),
        ...(choices && choices.length ? { choices } : {}),
      };
    }),
  }));
}

/** The parts of a report the AI may set — never its id, its tile or who saved it. */
function shapeOf(def: ReportDef) {
  const { name, subject, columns, rules, match, groupBy, sortBy, sortDir, show, metric } = def;
  return { name, subject, columns, rules, match, groupBy, sortBy, sortDir, show, metric };
}

/**
 * Whatever came back, made safe: a subject that exists, columns and rules on fields that exist, operators that fit
 * the field's type. Anything else is quietly dropped, so a confused answer gives a smaller report, never a broken one.
 */
export function cleanReport(raw: unknown, base: ReportDef, data: ReportData): ReportDef {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const subjectId = SUBJECTS.some(s => s.id === r.subject) ? (r.subject as SubjectId) : base.subject;
  const subject = subjectOf(subjectId);
  const fields = new Map(fieldsOf(subject, data).map(f => [f.key, f]));
  const fresh = subjectId === base.subject ? base : { ...newReport(subjectId), id: base.id };

  const columns = Array.isArray(r.columns)
    ? [...new Set(r.columns.map(String).filter(k => fields.has(k)))]
    : fresh.columns;

  const rules: Rule[] = Array.isArray(r.rules)
    ? (r.rules as Record<string, unknown>[]).flatMap(x => {
      const f = fields.get(String(x?.field ?? ''));
      if (!f) return [];
      const op = String(x?.op ?? '') as Op;
      if (!OPS_FOR[f.type].some(o => o.op === op)) return [];
      const rule: Rule = { field: f.key, op, value: String(x?.value ?? '') };
      if (op === 'between') rule.value2 = String(x?.value2 ?? x?.value ?? '');
      return [rule];
    })
    : fresh.rules;

  const groupBy = typeof r.groupBy === 'string' && fields.has(r.groupBy) && fields.get(r.groupBy)!.type !== 'number'
    ? r.groupBy : undefined;
  const sortBy = typeof r.sortBy === 'string' && fields.has(r.sortBy) ? r.sortBy : undefined;
  const metric = typeof r.metric === 'string' && fields.get(r.metric)?.type === 'number' ? r.metric : 'count';
  const show = r.show === 'chart' || r.show === 'summary' ? (groupBy ? r.show : 'table') : 'table';

  return {
    ...base,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 80) : base.name,
    subject: subjectId,
    columns: columns.length ? columns : fresh.columns,
    rules,
    match: r.match === 'any' ? 'any' : 'all',
    groupBy,
    sortBy,
    sortDir: r.sortDir === 'desc' ? 'desc' : 'asc',
    show,
    metric,
  };
}

export type AskResult =
  | { ok: true; reply: string; report: ReportDef | null }
  | { ok: false; reason: 'off' | 'failed'; detail?: string };

/** One turn: the conversation so far (last line is the person's) → the AI's words and, usually, a report. */
export async function askReportAi(
  chat: ChatLine[], current: ReportDef, data: ReportData, lang: 'en' | 'he',
): Promise<AskResult> {
  if (!API_KEY) return { ok: false, reason: 'off' };
  const body = {
    reportAi: {
      lang,
      today: data.today,
      catalog: reportCatalog(data),
      current: shapeOf(current),
      chat: chat.slice(-16).map(l => ({ role: l.role, text: l.text.slice(0, 2000) })),
    },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify(body),
      });
      if (r.status === 501 || r.status === 401) return { ok: false, reason: 'off' };
      if (!r.ok) {
        if (attempt === 0) { await new Promise(res => setTimeout(res, 800)); continue; }
        return { ok: false, reason: 'failed', detail: (await r.text()).slice(0, 200) };
      }
      const got = await r.json() as { reply?: unknown; report?: unknown };
      return {
        ok: true,
        reply: String(got.reply ?? '').trim(),
        report: got.report ? cleanReport(got.report, current, data) : null,
      };
    } catch (e) {
      if (attempt === 0) { await new Promise(res => setTimeout(res, 800)); continue; }
      return { ok: false, reason: 'failed', detail: String((e as Error)?.message ?? e) };
    }
  }
  return { ok: false, reason: 'failed' };
}
