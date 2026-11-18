import React, { useState } from 'react';
import { Copy, Check, Link2, Loader2, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { useStore } from '../../data/store';
import { createSharedLink, turnOffSharedLink, useSharedLinks, type SharedLink } from '../../data/sharedLinks';

/**
 * PROJECT SETTINGS → SHARED (owner, 2026-11-18): "type a name → a link is created".
 *
 * The link shows an outside person this one project — the board and the building as the office sees them, and each
 * apartment's details (no address, no phone), photos, stages and plan, read-only. On the plan they may add their own
 * pins. No notes, no tasks, no history, no settings, no Drive.
 *
 * The full address is shown ONCE, right after it is made: only a fingerprint of it is kept, so nobody — not the
 * office, not a backup, not someone reading the database — can rebuild a working link later.
 */
export function SharedLinksSettings({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const projectId = useStore(st => st.currentProjectId);
  const userName = useStore(st => st.currentUser?.name ?? '');
  const domain = useStore(st => st.boardSettings.__tv?.portalDomain);
  const links = useSharedLinks(projectId);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [askOff, setAskOff] = useState<string | null>(null);

  const create = async () => {
    const v = name.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      const { link, url } = await createSharedLink(projectId, v, userName, domain);
      setFresh({ id: link.id, url });
      setCopied(false);
      setName('');
    } catch (e) {
      onToast((e as Error).message || 'The link could not be made', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); onToast('Copy did not work — select the address and copy it by hand', 'error'); }
  };

  const off = async (l: SharedLink) => {
    setAskOff(null);
    await turnOffSharedLink(l, userName);
    if (fresh?.id === l.id) setFresh(null);
    onToast(`"${l.name}" is turned off`);
  };

  const when = (iso?: string | null) => { try { return iso ? format(new Date(iso), 'd MMM yyyy, HH:mm') : ''; } catch { return ''; } };
  const live = (links ?? []).filter(l => !l.revokedAt);
  const offList = (links ?? []).filter(l => l.revokedAt);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 md:p-5 mb-4 md:mb-5" data-shared-links>
      <h2 className="font-semibold text-gray-800 mb-1">Shared links</h2>
      <p className="text-sm text-gray-600 mb-3">
        A link lets someone outside the office look at this project: the board and the building, and each apartment's
        details (no address or phone), photos, stages and plan. They can add their own pins to a plan. They cannot
        change anything else, and they never see notes, tasks, history, settings or Drive.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <input data-shared-name data-enter-own value={name} maxLength={80}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void create(); }}
          placeholder="Who is it for? (e.g. Developer — Yossi)"
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
        <button data-shared-create onClick={() => void create()} disabled={!name.trim() || busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[#1e3a5f] text-white disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Create link
        </button>
      </div>

      {fresh && (
        <div data-shared-fresh className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 mb-3 space-y-2">
          <div className="text-sm font-semibold text-emerald-900">The link is ready. Copy it now.</div>
          <div className="flex items-center gap-2">
            <input readOnly value={fresh.url} onFocus={e => e.target.select()} data-shared-url
              className="flex-1 min-w-0 border border-emerald-200 rounded-lg px-3 py-2 text-xs font-mono bg-white" />
            <button data-shared-copy onClick={() => void copy(fresh.url)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-emerald-900/80 m-0">
            For safety the app keeps only a fingerprint of this address, so it can't be shown again after you leave
            this page. If it gets lost, turn this one off and create a new link.
          </p>
        </div>
      )}

      {links === null ? (
        <div className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : live.length === 0 && offList.length === 0 ? (
        <div className="text-sm text-gray-400">No links yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {[...live, ...offList].map(l => (
            <li key={l.id} data-shared-link={l.id} data-shared-off={l.revokedAt ? '1' : '0'} className="py-2.5 flex items-center gap-3">
              <div className={`min-w-0 flex-1 ${l.revokedAt ? 'opacity-50' : ''}`}>
                <div className="text-sm font-semibold text-gray-800 truncate">{l.name || 'Unnamed link'}</div>
                <div className="text-xs text-gray-500">
                  Made {when(l.createdAt)}{l.createdBy ? ` by ${l.createdBy}` : ''} ·{' '}
                  {l.openCount ? `opened ${l.openCount} time${l.openCount === 1 ? '' : 's'}, last ${when(l.lastOpenedAt)}` : 'not opened yet'}
                  {l.revokedAt ? ` · turned off ${when(l.revokedAt)}` : ''}
                </div>
              </div>
              {!l.revokedAt && (askOff === l.id ? (
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <button data-shared-off-yes onClick={() => void off(l)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white">Turn off for good</button>
                  <button onClick={() => setAskOff(null)} className="px-2 py-1.5 rounded-lg text-xs text-gray-500">Keep</button>
                </span>
              ) : (
                <button data-shared-off onClick={() => setAskOff(l.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 flex-shrink-0">
                  <EyeOff size={13} /> Turn off
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
