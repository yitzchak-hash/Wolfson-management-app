import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Loader2, Check, Maximize2 } from 'lucide-react';
import { MessageBox } from '../ui/MessageBox';
import { ReportDef, ReportData, runReport, subjectOf, newReport, Cell } from '../../data/reportModel';
import { askReportAi, ChatLine } from '../../data/reportAi';

/**
 * The window a green report tile opens (owner, 2026-11-17): say or type the report you want, the AI builds it, and
 * it is saved on the tile straight away — every answer that comes with a report is saved, so closing the window
 * never loses it. The mic is the message box's own (keeps listening until Stop, adds to what is typed).
 *
 * The preview under the conversation is the app's own report engine running the definition — the same numbers the
 * full report below the tiles shows.
 */

const GREEN = '#16a34a';
const NAVY = '#1e3a5f';
const CHAT_KEEP = 30;

const WORDS = {
  en: {
    title: (n: number) => `Report tile ${n}`,
    hello: 'Tell me what report you want — press the microphone and just say it. For example: "all jobs in Wolfson with overdue tasks, grouped by worker".',
    thinking: 'Building your report…',
    off: 'The AI is not switched on for this app, so I cannot build reports by chat yet.',
    failed: 'The AI did not answer just now. Press Send again to retry.',
    saved: (n: number) => `Saved on tile ${n}`,
    rows: (n: number, noun: string) => `${n} ${noun}`,
    open: 'Open the full report',
    none: 'Nothing matches this report right now.',
    placeholder: 'Say or type the report you want',
    empty: 'No report yet',
  },
  he: {
    title: (n: number) => `אריח דוח ${n}`,
    hello: 'ספרו לי איזה דוח אתם רוצים — לחצו על המיקרופון ופשוט תגידו. למשל: "כל העבודות בוולפסון עם משימות באיחור, לפי עובד".',
    thinking: 'בונה את הדוח…',
    off: 'ה-AI לא מופעל באפליקציה, אז עדיין אי אפשר לבנות דוחות בצ׳אט.',
    failed: 'ה-AI לא ענה הפעם. לחצו שוב על שליחה כדי לנסות שוב.',
    saved: (n: number) => `נשמר באריח ${n}`,
    rows: (n: number, noun: string) => `${n} ${noun}`,
    open: 'פתיחת הדוח המלא',
    none: 'אין כרגע שורות שמתאימות לדוח הזה.',
    placeholder: 'אמרו או הקלידו את הדוח שאתם רוצים',
    empty: 'עוד אין דוח',
  },
};

export function ReportAiChat({ tile, existing, data, isRtl, onSave, onOpen, onClose }: {
  tile: number;
  existing: ReportDef | undefined;
  data: ReportData;
  isRtl: boolean;
  onSave: (def: ReportDef) => void;
  onOpen: (def: ReportDef) => void;
  onClose: () => void;
}) {
  const lang = isRtl ? 'he' : 'en';
  const W = WORDS[lang];
  const [def, setDef] = useState<ReportDef>(() => existing ?? { ...newReport('jobs'), tile });
  const [hasReport, setHasReport] = useState(!!existing);
  const [chat, setChat] = useState<ChatLine[]>(() => existing?.chat ?? []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [chat, busy]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const result = useMemo(() => (hasReport ? runReport(def, data) : null), [def, data, hasReport]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const asked: ChatLine[] = [...chat, { role: 'user', text }];
    setChat(asked);
    setDraft('');
    setBusy(true);
    const got = await askReportAi(asked, def, data, lang);
    setBusy(false);
    if (!got.ok) {
      // A failed turn is not kept in the saved conversation — only shown.
      setChat([...asked, { role: 'ai', text: got.reason === 'off' ? W.off : W.failed }]);
      return;
    }
    const answered: ChatLine[] = [...asked, { role: 'ai' as const, text: got.reply || '…' }].slice(-CHAT_KEEP);
    setChat(answered);
    const next = got.report ?? (hasReport ? def : null);
    if (next) {
      const saved: ReportDef = { ...next, id: def.id, tile, chat: answered };
      setDef(saved);
      setHasReport(true);
      onSave(saved);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2200);
    }
  }

  const subject = subjectOf(def.subject);

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/40"
      onClick={onClose} dir={isRtl ? 'rtl' : 'ltr'}>
      <div data-report-ai-chat
        className="bg-white w-full md:max-w-2xl h-[92vh] md:h-[85vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* ── top ── */}
        <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ backgroundColor: GREEN }}>
          <Sparkles size={18} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold opacity-80">{W.title(tile + 1)}</div>
            <div className="text-[15px] font-bold truncate">{hasReport ? def.name : W.empty}</div>
          </div>
          {savedFlash && (
            <span className="flex items-center gap-1 text-[11.5px] font-bold bg-white/20 rounded-full px-2 py-0.5">
              <Check size={13} /> {W.saved(tile + 1)}
            </span>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20" title="Close"><X size={18} /></button>
        </div>

        {/* ── conversation ── */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5 bg-[#f6f9f7]">
          <Bubble role="ai" text={W.hello} />
          {chat.map((l, i) => <Bubble key={i} role={l.role} text={l.text} />)}
          {busy && (
            <div className="flex items-center gap-2 text-[13px] text-gray-500 px-1">
              <Loader2 size={15} className="animate-spin" /> {W.thinking}
            </div>
          )}

          {/* ── what the report gives right now ── */}
          {result && (
            <div data-report-ai-preview className="bg-white border border-green-200 rounded-xl overflow-hidden mt-3">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-green-100 bg-green-50">
                <span className="text-[13px] font-bold" style={{ color: GREEN }}>
                  {W.rows(result.rows.length, subject.nounPlural)}
                </span>
                <span className="flex-1" />
                <button onClick={() => onOpen(def)}
                  className="flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg text-white"
                  style={{ backgroundColor: NAVY }}>
                  <Maximize2 size={12} /> {W.open}
                </button>
              </div>
              {result.rows.length === 0 ? (
                <p className="px-3 py-4 text-[12.5px] text-gray-400">{W.none}</p>
              ) : def.groupBy && def.show !== 'table' ? (
                <div className="p-3 space-y-1.5">
                  {result.groups.slice(0, 10).map(g => {
                    const max = Math.max(1, ...result.groups.map(x => x.value));
                    return (
                      <div key={g.key} className="flex items-center gap-2">
                        <div className="w-28 text-[12px] text-gray-600 truncate" title={g.key}>{g.key}</div>
                        <div className="flex-1 h-5 bg-gray-50 rounded overflow-hidden">
                          <div className="h-full rounded flex items-center justify-end px-1.5"
                            style={{ width: `${Math.max(4, (g.value / max) * 100)}%`, backgroundColor: GREEN }}>
                            <span className="text-[10.5px] font-bold text-white">{g.value.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead className="bg-gray-50">
                      <tr>{result.columns.map(c => (
                        <th key={c.key} className="px-2 py-1.5 text-start font-bold text-gray-500 whitespace-nowrap">{c.label}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {result.rows.slice(0, 8).map(r => (
                        <tr key={r.id}>{r.cells.map((c, i) => (
                          <td key={i} className="px-2 py-1 text-gray-700 max-w-[180px] truncate">{cellText(c)}</td>
                        ))}</tr>
                      ))}
                    </tbody>
                  </table>
                  {result.rows.length > 8 && (
                    <div className="px-2 py-1 text-[11px] text-gray-400">+{result.rows.length - 8}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── the box: type, or the mic inside it ── */}
        <div className="border-t border-gray-100 p-2.5 bg-white">
          <MessageBox
            value={draft}
            onChange={setDraft}
            onSend={() => void send()}
            busy={busy}
            lang={lang}
            placeholder={W.placeholder}
            hook="report-ai-box"
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

const cellText = (c: Cell) => (c === null || c === undefined || c === '' ? '—' : String(c));

function Bubble({ role, text }: { role: 'user' | 'ai'; text: string }) {
  const mine = role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] px-3 py-2 rounded-2xl text-[13.5px] leading-snug whitespace-pre-wrap"
        style={mine
          ? { backgroundColor: NAVY, color: '#fff', borderEndEndRadius: 6 }
          : { backgroundColor: '#fff', color: '#1f2937', border: '1px solid #dcfce7', borderEndStartRadius: 6 }}>
        {text}
      </div>
    </div>
  );
}
