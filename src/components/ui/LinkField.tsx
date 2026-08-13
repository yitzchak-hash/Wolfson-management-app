import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Pencil, Check, X, Link2 } from 'lucide-react';

/**
 * A link you can open, without having to look at it.
 *
 * A Drive folder URL is 80-odd characters of machine noise. Sitting in an
 * always-open text box it takes a whole row, tells you nothing you wanted to
 * know, and the one question you actually have — is there a folder, and can I
 * get to it — is buried in it.
 *
 * So the resting state is the answer: a name and a button that opens it. The
 * URL only appears while you are changing it, which is the only time it is
 * information rather than clutter.
 */
export function LinkField({
  label, icon: Icon = Link2, value, onSave, placeholder, display, accent = '#1e3a5f', hint, actions,
}: {
  label: string;
  icon?: React.ElementType;
  value: string;
  onSave: (next: string) => void;
  placeholder?: string;
  /** What to show instead of the URL — a folder's real name, usually. */
  display?: string;
  accent?: string;
  hint?: React.ReactNode;
  /**
   * Extra buttons on the row itself, beside the pencil.
   *
   * For things that act on WHAT THE LINK POINTS AT rather than on the link —
   * copying a Drive folder's local path, for one. Under the row they read as
   * unrelated; on it they read as belonging to it.
   */
  actions?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.select(), 20); }, [editing]);

  const href = value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`;

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim()) onSave(next);
  }

  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-1 flex items-center gap-1.5">
        <Icon size={11} /> {label}
      </label>

      {editing ? (
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraft(value); setEditing(false); }
            }}
            placeholder={placeholder}
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
          <button onClick={commit} title="Save"
            className="px-2.5 rounded-lg text-white flex items-center" style={{ backgroundColor: accent }}>
            <Check size={14} />
          </button>
          <button onClick={() => { setDraft(value); setEditing(false); }} title="Cancel"
            className="px-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 flex items-center">
            <X size={14} />
          </button>
        </div>
      ) : value.trim() ? (
        <div className="flex items-center gap-1.5">
          <a
            href={href} target="_blank" rel="noopener noreferrer"
            className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors group"
            style={{ borderColor: '#e2e8f0' }}
            title={value}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
            <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-700">
              {display?.trim() || 'Open'}
            </span>
            <ExternalLink size={13} className="flex-shrink-0 text-gray-300 group-hover:text-[#4aa8d8]" />
          </a>
          {actions}
          <button onClick={() => setEditing(true)} title={`Change the ${label.toLowerCase()}`}
            className="w-9 h-9 rounded-lg border border-gray-200 text-gray-400 hover:text-[#1e3a5f] hover:border-[#1e3a5f] flex items-center justify-center transition-colors">
            <Pencil size={13} />
          </button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-200 text-sm text-gray-400 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors">
          <Link2 size={13} /> {placeholder ?? `Add a ${label.toLowerCase()}`}
        </button>
      )}

      {hint && <div className="mt-1">{hint}</div>}
    </div>
  );
}
