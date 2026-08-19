import React, { useEffect, useRef, useState } from 'react';
import {
  Bold, List, CheckSquare, Palette, Undo2, Redo2, Check, X, Plus,
} from 'lucide-react';
import { CanvasElement } from '../../types';

/**
 * The sticky note pad, and the cork board behind it.
 *
 * Brought over from the finance app whole — the colours, the tape, the ruled
 * lines, the curled corner that folds up into a new page, the cork board with
 * its pins. Two things were changed, and only two:
 *
 *  1. **The notes live in the board element**, not in a localStorage key of
 *     their own. Everything on a board is a `CanvasElement`, which is what
 *     makes it sync between machines, ride along in a backup, and come back on
 *     a restore. A private key would have been none of those things — the notes
 *     would exist on one computer and vanish on a restore, which is exactly the
 *     failure this app has a standing rule against.
 *  2. **The five labels** come from the app's own strings rather than a
 *     dictionary it does not have.
 *
 * There is no explicit save button: this app saves as you go everywhere else,
 * and a button that means "do the thing that already happened" is a button
 * people press wondering what they got wrong.
 */

export interface StickyNoteRecord {
  id: string;
  text: string;
  colour: string;
  updatedAt?: string;
}

export const NOTE_COLOURS: Record<
  string,
  { bg: string; bg2: string; fold: string; text: string; line: string; tape: string }
> = {
  yellow: { bg: '#FEF6DF', bg2: '#FBE7B0', fold: '#F5C86B', text: '#4A2E04', line: '#E7CE93', tape: '#F2D79Bcc' },
  pink:   { bg: '#FDEFF4', bg2: '#F8D7E3', fold: '#EFA3C0', text: '#4E1226', line: '#EFC3D5', tape: '#F6CBDCcc' },
  blue:   { bg: '#EEF6FE', bg2: '#D3E7FA', fold: '#8FC0EF', text: '#0B2C4E', line: '#BFD9F2', tape: '#CBE0F7cc' },
  green:  { bg: '#F1F8E6', bg2: '#DCEDC3', fold: '#A8CE7A', text: '#1B3406', line: '#C9E0A8', tape: '#D8ECBCcc' },
  orange: { bg: '#FEF1E6', bg2: '#FBDCC2', fold: '#F0A868', text: '#4A2405', line: '#F0CFAE', tape: '#F8D9BDcc' },
  purple: { bg: '#F5F1FD', bg2: '#E3D8F8', fold: '#B79BE8', text: '#2C1450', line: '#D6C7F0', tape: '#E2D6F7cc' },
};
const COLOUR = (c: string) => NOTE_COLOURS[c] ?? NOTE_COLOURS.yellow;

const newId = () => `SN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function renderLine(line: string, key: number, onToggle: (i: number) => void) {
  const bolded = line.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    (i % 2 === 1 ? <b key={i}>{part}</b> : part));
  if (line.startsWith('☐ ') || line.startsWith('☑ ')) {
    const checked = line.startsWith('☑');
    return (
      <div key={key} className="flex items-start gap-1.5">
        <button
          type="button" data-no-drag data-el-action data-note-check={key}
          className="cursor-pointer leading-6 transition-transform hover:scale-125"
          onClick={e => { e.stopPropagation(); onToggle(key); }}
        >
          {checked ? '☑' : '☐'}
        </button>
        <span className={checked ? 'line-through opacity-55' : ''}>
          {bolded.map(b => (typeof b === 'string' ? b.replace(/^[☐☑] /, '') : b))}
        </span>
      </div>
    );
  }
  return <div key={key}>{bolded}</div>;
}

export function StickyNoteWidget({ el, readOnly, isRtl, update, onSpawn }: {
  el: CanvasElement;
  readOnly?: boolean;
  isRtl?: boolean;
  update: (patch: Partial<CanvasElement>) => void;
  /**
   * Put a FRESH sticky note on the board beside this one.
   *
   * A sticky note is one sticky note — the owner's ruling. This used to be a
   * PAD holding many pages with a cork board hidden inside it, while a separate
   * Notes board widget gathered pages out of every pad: two boards, one of them
   * invisible until you found the button. Now each note is its own thing on the
   * board and the Notes board is the only board there is. Folding the corner
   * therefore makes a NEW note next to this one rather than a second page
   * inside it.
   */
  onSpawn?: (colour: string) => void;
}) {
  const he = !!isRtl;
  const data = (el.data ?? {}) as { notes?: StickyNoteRecord[]; openId?: string };
  const notes = data.notes ?? [];
  const open = notes.find(n => n.id === data.openId) ?? notes[0];

  const [editing, setEditing] = useState(false);
  const [palette, setPalette] = useState(false);
  const [folding, setFolding] = useState(false);
  const [saved, setSaved] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  /** Undo and redo over the text of the note being written. */
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const [, force] = useState(0);

  useEffect(() => { if (editing) taRef.current?.focus(); }, [editing]);

  /**
   * Write the pad back into the element.
   *
   * `el.data` is read fresh from the argument each time rather than captured,
   * because a widget's data object is replaced on every change — a helper that
   * closed over an old one would put the old notes back.
   */
  function writeNotes(next: StickyNoteRecord[], openId?: string) {
    update({ data: { ...(el.data ?? {}), notes: next, openId: openId ?? data.openId } });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  function editOpen(patch: Partial<StickyNoteRecord>, remember = true) {
    const cur = open ?? { id: newId(), text: '', colour: 'yellow' };
    if (remember && patch.text !== undefined && patch.text !== cur.text) {
      past.current = [...past.current.slice(-49), cur.text];
      future.current = [];
      force(n => n + 1);
    }
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    const rest = notes.filter(n => n.id !== next.id);
    writeNotes([next, ...rest], next.id);
  }

  function undo() {
    const prev = past.current.pop();
    if (prev === undefined || !open) return;
    future.current = [...future.current, open.text];
    force(n => n + 1);
    editOpen({ text: prev }, false);
  }

  function redo() {
    const nxt = future.current.pop();
    if (nxt === undefined || !open) return;
    past.current = [...past.current, open.text];
    force(n => n + 1);
    editOpen({ text: nxt }, false);
  }

  /** The toolbar works whether or not you were already typing. */
  function insertMarker(marker: string) {
    const cur = open ?? { id: newId(), text: '', colour: 'yellow' };
    const ta = taRef.current;
    if (!editing || !ta) {
      setEditing(true);
      const base = cur.text;
      const prefix = base === '' || base.endsWith('\n') ? '' : '\n';
      editOpen({ text: `${base}${prefix}${marker}` });
      requestAnimationFrame(() => {
        const elx = taRef.current;
        if (elx) { elx.focus(); elx.selectionStart = elx.selectionEnd = elx.value.length; }
      });
      return;
    }
    const pos = ta.selectionStart ?? cur.text.length;
    const before = cur.text.slice(0, pos);
    const after = cur.text.slice(pos);
    const prefix = before.endsWith('\n') || before === '' ? '' : '\n';
    editOpen({ text: `${before}${prefix}${marker}${after}` });
    requestAnimationFrame(() => {
      const elx = taRef.current;
      if (!elx) return;
      elx.focus();
      const caret = (before + prefix + marker).length;
      elx.selectionStart = elx.selectionEnd = caret;
    });
  }

  function toggleLine(index: number) {
    if (!open) return;
    const lines = open.text.split('\n');
    if (lines[index]?.startsWith('☐ ')) lines[index] = '☑ ' + lines[index].slice(2);
    else if (lines[index]?.startsWith('☑ ')) lines[index] = '☐ ' + lines[index].slice(2);
    editOpen({ text: lines.join('\n') });
  }

  /**
   * The folded corner: the page folds up and a fresh note lands beside it.
   *
   * The fold animation is kept — it is the nicest thing about this widget — but
   * what it produces is a new sticky note ON THE BOARD, not a second page
   * hidden inside this one.
   */
  function newNote() {
    setFolding(true);
    window.setTimeout(() => {
      setFolding(false);
      if (onSpawn) { onSpawn(open?.colour ?? 'yellow'); return; }
      // No host to spawn into (the store's preview): behave as before.
      past.current = []; future.current = [];
      const fresh: StickyNoteRecord = {
        id: newId(), text: '', colour: open?.colour ?? 'yellow',
        updatedAt: new Date().toISOString(),
      };
      writeNotes([fresh], fresh.id);
      setEditing(true);
    }, 420);
  }

  const c = COLOUR(open?.colour ?? 'yellow');
  const iconBtn =
    'rounded p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100 disabled:opacity-25';

  /**
   * There is no cork board in here any more.
   *
   * A sticky note used to carry a hidden board of its own pages, alongside the
   * separate Notes board widget that gathers notes from every note on the
   * board — two boards, one of them invisible until you found the button, and
   * no way to say which one you meant. A sticky note is now one note; the
   * Notes board widget is the board.
   */


  // ── the NOTE ──────────────────────────────────────────────────────────────
  return (
    <div className="group/note relative flex h-full min-h-0 flex-col pt-2">
      {/* the tape holding the sheet up */}
      <span aria-hidden
        className="absolute start-1/2 top-0 z-10 h-4 w-16 -translate-x-1/2 rotate-[-2deg] rounded-[2px] rtl:translate-x-1/2"
        style={{
          background: c.tape,
          boxShadow: '0 1px 2px rgba(0,0,0,.14)',
          maskImage: 'linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%)',
        }} />
      <div
        data-sticky-note
        data-folding={folding ? 'true' : undefined}
        // No hover tilt: a fractional rotate rasterises the text off the pixel
        // grid and the whole note reads blurry.
        className={`relative flex min-h-0 flex-1 flex-col rounded-[3px] ${folding ? 'note-fold' : ''}`}
        style={{
          background: `linear-gradient(160deg, ${c.bg} 0%, ${c.bg} 62%, ${c.bg2} 100%)`,
          color: c.text,
          boxShadow:
            '0 1px 1px rgba(0,0,0,.07), 0 8px 18px -8px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.65)',
        }}
      >
        {/* faint ruled paper lines */}
        <span aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[3px] opacity-45"
          style={{
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 27px, ${c.line} 27px 28px)`,
            backgroundPosition: '0 14px',
            maskImage: 'linear-gradient(to bottom, transparent 0, #000 22px)',
          }} />

        <div className="relative flex shrink-0 items-center justify-between gap-1 px-3 pt-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide opacity-75">
            <span
              data-note-saved
              className={`flex items-center gap-0.5 rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white transition-opacity duration-300 ${saved ? 'opacity-100' : 'opacity-0'}`}
            >
              <Check className="h-2.5 w-2.5" />
              {he ? 'נשמר' : 'Saved'}
            </span>
          </span>
          {!readOnly && (
            <span className="flex gap-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover/note:opacity-100">
              <button type="button" data-no-drag data-el-action data-note-bold className={iconBtn}
                title={he ? 'הדגשה' : 'Bold'} onClick={() => insertMarker(he ? '**טקסט**' : '**text**')}>
                <Bold className="h-3.5 w-3.5" />
              </button>
              <button type="button" data-no-drag data-el-action data-note-bullet className={iconBtn}
                title={he ? 'נקודה' : 'Bullet'} onClick={() => insertMarker('• ')}>
                <List className="h-3.5 w-3.5" />
              </button>
              <button type="button" data-no-drag data-el-action data-note-checkbox className={iconBtn}
                title={he ? 'משבצת סימון' : 'Checkbox'} onClick={() => insertMarker('☐ ')}>
                <CheckSquare className="h-3.5 w-3.5" />
              </button>
              <button type="button" data-no-drag data-el-action data-note-palette className={iconBtn}
                title={he ? 'צבע' : 'Colour'} onClick={() => setPalette(v => !v)}>
                <Palette className="h-3.5 w-3.5" />
              </button>
              <span className="mx-0.5 w-px bg-black/10" />
              <button type="button" data-no-drag data-el-action data-note-undo className={iconBtn}
                title={he ? 'ביטול' : 'Undo'} disabled={past.current.length === 0} onClick={undo}>
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button type="button" data-no-drag data-el-action data-note-redo className={iconBtn}
                title={he ? 'שחזור' : 'Redo'} disabled={future.current.length === 0} onClick={redo}>
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        {editing && !readOnly ? (
          <textarea
            ref={taRef}
            data-no-drag data-el-action data-note-input
            className="relative min-h-0 w-full flex-1 resize-none bg-transparent px-3.5 pb-3 text-[0.95rem] leading-7 outline-none"
            style={{ color: c.text, caretColor: c.text }}
            value={open?.text ?? ''}
            onChange={e => editOpen({ text: e.target.value })}
            onBlur={() => setEditing(false)}
          />
        ) : (
          <div
            // `data-el-action` as well as `data-no-drag`: the board's node
            // handler swallows a plain press so it can start a drag, and
            // without this the paper could not be clicked into at all.
            data-no-drag data-el-action data-wheel data-note-view
            className="relative min-h-0 flex-1 cursor-text overflow-y-auto whitespace-pre-wrap px-3.5 pb-3 text-[0.95rem] leading-7"
            onClick={() => { if (!readOnly) setEditing(true); }}
          >
            {open?.text
              ? open.text.split('\n').map((line, i) => renderLine(line, i, toggleLine))
              : <span className="opacity-45">{he ? 'לחצו כדי לכתוב פתק…' : 'Click to write a note…'}</span>}
          </div>
        )}

        {/* the curled corner IS the new-note button */}
        {!readOnly && (
          <button
            type="button" data-no-drag data-el-action data-note-new
            title={he ? 'פתק חדש' : 'New note'}
            onClick={newNote}
            // Bottom-START, not bottom-end.
            // A board node's resize grip is a 26px square in its bottom-RIGHT
            // corner, which is exactly where this used to sit — so the corner
            // that starts a new page could not be pressed at all, and grabbing
            // it to resize the pad was a coin toss. Mirrored for Hebrew, where
            // "start" is the right-hand side and the grip is still on the left
            // of the page's own reading order.
            className="absolute bottom-0 start-0 h-7 w-7 transition-transform hover:scale-110"
            style={{
              background: `linear-gradient(45deg, ${c.fold} 0 50%, transparent 50%)`,
              filter: 'drop-shadow(1px -1px 1px rgba(0,0,0,.12))',
            }}
          >
            <Plus className="absolute bottom-0.5 start-0.5 h-3 w-3 opacity-70" style={{ color: c.text }} />
          </button>
        )}

        {palette && !readOnly && (
          <div className="relative flex shrink-0 flex-wrap gap-1.5 px-3 pb-2">
            {Object.entries(NOTE_COLOURS).map(([name, cc]) => (
              <button
                key={name} type="button" data-no-drag data-el-action
                aria-label={name} data-note-color={name}
                className="h-4 w-4 rounded-full border-2 shadow-sm transition-transform hover:scale-110"
                style={{ background: cc.fold, borderColor: (open?.colour ?? 'yellow') === name ? c.text : 'transparent' }}
                onClick={() => editOpen({ colour: name }, false)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
