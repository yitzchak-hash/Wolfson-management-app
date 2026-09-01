import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CircleHelp, X, Printer, Sparkles,
} from 'lucide-react';
import { useStore } from '../../data/store';
import { printSheet } from '../../data/printing';

/**
 * TUTORIAL MODE — a training session, the game-tutorial manner (the owner's
 * ask, named after NBA 2K): a little PRACTICE BOARD with a few tiles, and the
 * app walks you through every gesture one step at a time — "now click here,
 * now drag that — great job, next" — validating that the hand really did it
 * before moving on. It ends with a printable control sheet, TzviAir-themed,
 * in a size the person picks (sticky note / A5 / A4) to keep beside the desk.
 *
 * Everything here is SELF-CONTAINED and fake on purpose: the mini canvas is
 * its own state, so nothing a trainee does can touch a real job, a real
 * notebook or the cloud. The gestures it teaches are the board's real ones —
 * including the two newest (right-drag lasso, right-click + scroll zoom) and
 * the quick-assign drop box.
 *
 * Bilingual by a local EN/HE table rather than 60 new MainUiStrings keys:
 * these strings are preset-only (never user-edited), so a table keyed off
 * `isRtl` keeps the same guarantee with none of the interface churn.
 */

// ── The practice board's furniture ──────────────────────────────────────────

interface FakeTile { id: string; name: string; stage: string; color: string; x: number; y: number }

const START_TILES: FakeTile[] = [
  { id: 't1', name: 'Artzi', stage: 'Piping', color: '#0ea5e9', x: 70, y: 60 },
  { id: 't2', name: 'Goldman', stage: 'Geves', color: '#8b5cf6', x: 320, y: 120 },
  { id: 't3', name: 'Cohen', stage: 'Done', color: '#22c55e', x: 150, y: 250 },
];

// ── The lesson plan ─────────────────────────────────────────────────────────

type StepEvent = 'select' | 'drag' | 'open' | 'pan' | 'zoom' | 'lasso' | 'menu' | 'delete';

interface Step {
  /** What the mini canvas must report for this step to pass; info/print steps have none. */
  waitFor?: StepEvent;
  kind?: 'info' | 'print';
  en: { title: string; body: string };
  he: { title: string; body: string };
}

const STEPS: Step[] = [
  {
    kind: 'info',
    en: {
      title: 'Welcome to the training board',
      body: 'This little board is a PRACTICE copy — nothing you do here touches a real job. '
        + 'We will walk through every gesture the real board understands, one at a time.',
    },
    he: {
      title: 'ברוכים הבאים ללוח האימון',
      body: 'הלוח הקטן הזה הוא עותק לתרגול — שום דבר כאן לא נוגע בעבודה אמיתית. '
        + 'נעבור יחד על כל תנועה שהלוח האמיתי מבין, אחת אחת.',
    },
  },
  {
    waitFor: 'select',
    en: { title: 'Click a tile once', body: 'One click SELECTS a job — it does not open it. Try clicking any tile.' },
    he: { title: 'לחצו פעם אחת על משבצת', body: 'לחיצה אחת בוחרת עבודה — היא לא פותחת אותה. נסו ללחוץ על משבצת כלשהי.' },
  },
  {
    waitFor: 'drag',
    en: { title: 'Drag a tile', body: 'Press a tile and drag it somewhere else. Arranging the board is just picking things up.' },
    he: { title: 'גררו משבצת', body: 'לחצו על משבצת וגררו אותה למקום אחר. לסדר את הלוח זה פשוט להרים דברים.' },
  },
  {
    waitFor: 'open',
    en: { title: 'Double-click to open', body: 'Two quick clicks OPEN the job window. On a touch screen: tap once to pick, tap again to open.' },
    he: { title: 'לחיצה כפולה פותחת', body: 'שתי לחיצות מהירות פותחות את חלון העבודה. במסך מגע: נגיעה בוחרת, נגיעה שנייה פותחת.' },
  },
  {
    waitFor: 'pan',
    en: { title: 'Move the board', body: 'Drag the EMPTY board to pan around. Space-drag and middle-button drag do the same.' },
    he: { title: 'הזיזו את הלוח', body: 'גררו את הרקע הריק כדי לנוע על הלוח. גרירה עם רווח או עם הגלגלת עושות אותו דבר.' },
  },
  {
    waitFor: 'zoom',
    en: {
      title: 'Zoom in and out',
      body: 'Hold Ctrl (⌘ on a Mac) and scroll — or hold the RIGHT mouse button and scroll. The board zooms towards your pointer.',
    },
    he: {
      title: 'התקרבו והתרחקו',
      body: 'החזיקו Ctrl וגלגלו — או החזיקו את הכפתור הימני של העכבר וגלגלו. הלוח מתקרב לכיוון הסמן.',
    },
  },
  {
    waitFor: 'lasso',
    en: {
      title: 'Select several at once',
      body: 'Hold Ctrl and drag a box around two tiles — or simply drag with the RIGHT mouse button. Everything inside the box gets selected.',
    },
    he: {
      title: 'בחרו כמה ביחד',
      body: 'החזיקו Ctrl וגררו מסגרת סביב שתי משבצות — או פשוט גררו עם הכפתור הימני. כל מה שבתוך המסגרת נבחר.',
    },
  },
  {
    waitFor: 'menu',
    en: {
      title: 'The right-click menu',
      body: 'Right-click a tile (without moving) for its menu — colour, duplicate, Trash and more. '
        + 'With several selected, the menu speaks for all of them, including Arrange, which tidies them into a neat grid.',
    },
    he: {
      title: 'תפריט קליק ימני',
      body: 'קליק ימני על משבצת (בלי לזוז) פותח את התפריט שלה — צבע, שכפול, אשפה ועוד. '
        + 'כשכמה נבחרו, התפריט מדבר בשם כולן — כולל "סידור" שמסדר אותן ברשת מסודרת.',
    },
  },
  {
    waitFor: 'delete',
    en: {
      title: 'Delete files into Trash',
      body: 'With a tile selected, press Delete. Nothing is ever destroyed — the job moves into the Trash group and can come right back.',
    },
    he: {
      title: 'מחיקה מעבירה לאשפה',
      body: 'כשמשבצת נבחרה, לחצו Delete. שום דבר לא נהרס — העבודה עוברת לקבוצת האשפה ואפשר להחזיר אותה מיד.',
    },
  },
  {
    kind: 'info',
    en: {
      title: 'The rest of the toolbox',
      body: '• The + on the left rail opens the WIDGET STORE — clocks, planners, maps, photos.\n'
        + '• Drag a job onto the weekly notebook to plan a day — or onto the drop box that appears at the top of the screen mid-drag, to pick any day and person.\n'
        + '• Ctrl+K searches everything, and forgives spelling.\n'
        + '• Ctrl+Z undoes, Ctrl+C / X / V copy, cut and paste.\n'
        + '• Press 0 while resizing to snap back to the standard size.',
    },
    he: {
      title: 'שאר הכלים',
      body: '• ה-+ בסרגל השמאלי פותח את חנות הווידג׳טים — שעונים, יומנים, מפות, תמונות.\n'
        + '• גררו עבודה אל היומן השבועי כדי לשבץ יום — או אל תיבת השחרור שמופיעה בראש המסך בזמן גרירה, לבחירת כל יום ואיש.\n'
        + '• Ctrl+K מחפש בכל מקום, וסולח לשגיאות כתיב.\n'
        + '• Ctrl+Z מבטל, Ctrl+C / X / V מעתיק, גוזר ומדביק.\n'
        + '• לחצו 0 בזמן שינוי גודל כדי לחזור לגודל הרגיל.',
    },
  },
  {
    kind: 'print',
    en: {
      title: 'Great job — keep the cheat sheet',
      body: 'Print the control sheet and stick it next to the screen. Pick a size:',
    },
    he: {
      title: 'כל הכבוד — קחו את דף הקיצורים',
      body: 'הדפיסו את דף השליטה והדביקו אותו ליד המסך. בחרו גודל:',
    },
  },
];

// ── The printable control sheet ─────────────────────────────────────────────

type SheetSize = 'sticky' | 'a5' | 'a4';

const SHEET_PAGE: Record<SheetSize, string> = {
  sticky: '100mm 100mm',
  a5: '148mm 210mm',
  a4: '210mm 297mm',
};

/** gesture → meaning rows, grouped. Kept once, printed in either language. */
const SHEET_ROWS: { group: { en: string; he: string }; rows: [string, string, string][] }[] = [
  {
    group: { en: 'Mouse', he: 'עכבר' },
    rows: [
      ['Click', 'Select a job', 'בחירת עבודה'],
      ['Double-click', 'Open the job', 'פתיחת העבודה'],
      ['Drag a tile', 'Move it', 'הזזה'],
      ['Drag empty board', 'Pan the view', 'הזזת התצוגה'],
      ['Ctrl+drag / right-drag', 'Select a box-full', 'בחירת מסגרת'],
      ['Ctrl+wheel / right+wheel', 'Zoom', 'זום'],
      ['Shift+wheel', 'Slide sideways', 'גלילה הצידה'],
      ['Right-click', 'The menu', 'התפריט'],
      ['Middle / Space+drag', 'Pan', 'הזזת התצוגה'],
    ],
  },
  {
    group: { en: 'Keyboard', he: 'מקלדת' },
    rows: [
      ['Delete', 'File into Trash', 'העברה לאשפה'],
      ['Escape', 'Back out one step', 'יציאה צעד אחד'],
      ['Ctrl+Z / Ctrl+Y', 'Undo / redo', 'ביטול / שחזור'],
      ['Ctrl+C / X / V', 'Copy / cut / paste', 'העתקה / גזירה / הדבקה'],
      ['Ctrl+K', 'Search everything', 'חיפוש בכל מקום'],
      ['Arrow keys', 'Nudge the selection', 'הזזה עדינה'],
      ['0 while resizing', 'Back to standard size', 'חזרה לגודל רגיל'],
    ],
  },
];

function printControlSheet(size: SheetSize, isRtl: boolean): boolean {
  const compact = size === 'sticky';
  const head = `
    <div style="display:flex;align-items:center;gap:8px;border-bottom:2.5px solid #1e3a5f;
      padding-bottom:${compact ? 4 : 8}px;margin-bottom:${compact ? 6 : 12}px;">
      <img src="${location.origin}/tzviair-logo.png" alt="TzviAir"
        style="height:${compact ? 22 : 34}px;width:auto;" />
      <div>
        <div style="font-size:${compact ? 12 : 16}px;font-weight:800;color:#1e3a5f;">
          ${isRtl ? 'לוח העבודות — שליטה' : 'The Job Board — controls'}</div>
        <div style="font-size:${compact ? 7.5 : 9}px;color:#6b7280;">TzviAir</div>
      </div>
    </div>`;
  const groups = SHEET_ROWS.map(g => `
    <div style="margin-bottom:${compact ? 5 : 10}px;">
      <div style="font-size:${compact ? 8 : 10}px;font-weight:800;letter-spacing:.06em;
        text-transform:uppercase;color:#4aa8d8;margin-bottom:${compact ? 2 : 4}px;">
        ${isRtl ? g.group.he : g.group.en}</div>
      <table style="width:100%;border-collapse:collapse;">
        ${g.rows.map(([key, en, he]) => `
          <tr>
            <td style="font:${compact ? 8 : 10.5}px/${compact ? 1.5 : 1.7} 'Segoe UI',monospace;font-weight:700;
              color:#1e3a5f;white-space:nowrap;padding:0 ${isRtl ? '0 0 8px' : '8px 0 0'};border-bottom:1px solid #eef1f5;">
              ${key}</td>
            <td style="font-size:${compact ? 8 : 10.5}px;color:#374151;border-bottom:1px solid #eef1f5;">
              ${isRtl ? he : en}</td>
          </tr>`).join('')}
      </table>
    </div>`).join('');
  return printSheet(isRtl ? 'לוח העבודות — שליטה' : 'Job Board controls', head + groups, {
    rtl: isRtl,
    css: `
      @page { size: ${SHEET_PAGE[size]}; margin: ${compact ? '5mm' : '10mm'}; }
      /* The sheet draws its own branded head — the generic chrome would eat a
         sticky note's whole height. */
      .sheet-head, .foot { display: none !important; }
      body { padding: ${compact ? '8px 10px' : '14px 18px'}; }
      @media print { body { padding: 0; } }
    `,
  });
}

// ── The mini canvas ─────────────────────────────────────────────────────────

const TILE_W = 128;
const TILE_H = 74;

function MiniCanvas({ onEvent, isRtl }: { onEvent: (e: StepEvent) => void; isRtl: boolean }) {
  const [tiles, setTiles] = useState<FakeTile[]>(START_TILES);
  const [trashed, setTrashed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [lasso, setLasso] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [opened, setOpened] = useState<FakeTile | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // One live gesture at a time, all through refs — the mini board is tiny and
  // fake, so nothing here needs the real board's machinery.
  const gesture = useRef<
    | { kind: 'tile'; id: string; px: number; py: number; ox: number; oy: number; moved: boolean }
    | { kind: 'pan'; px: number; py: number; ox: number; oy: number; moved: boolean }
    | { kind: 'lasso'; right: boolean; sx: number; sy: number; moved: boolean }
    | null
  >(null);
  const rightWheeled = useRef(false);

  const toLocal = (cx: number, cy: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - pan.x) / zoom, y: (cy - r.top - pan.y) / zoom };
  };

  function onTileDown(e: React.PointerEvent, t: FakeTile) {
    if (e.button === 2) return; // the menu path
    e.stopPropagation();
    setMenu(null);
    const g = { kind: 'tile' as const, id: t.id, px: e.clientX, py: e.clientY, ox: t.x, oy: t.y, moved: false };
    gesture.current = g;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCanvasDown(e: React.PointerEvent) {
    if ((e.target as Element).closest('[data-mini-tile]')) return;
    setMenu(null);
    const l = toLocal(e.clientX, e.clientY);
    if (e.button === 2 || e.ctrlKey || e.metaKey) {
      gesture.current = { kind: 'lasso', right: e.button === 2, sx: l.x, sy: l.y, moved: false };
      setLasso({ sx: l.x, sy: l.y, ex: l.x, ey: l.y });
    } else if (e.button === 0) {
      gesture.current = { kind: 'pan', px: e.clientX, py: e.clientY, ox: pan.x, oy: pan.y, moved: false };
      setSel(new Set());
    } else return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'tile') {
      const dx = (e.clientX - g.px) / zoom, dy = (e.clientY - g.py) / zoom;
      if (!g.moved && Math.hypot(dx * zoom, dy * zoom) > 4) g.moved = true;
      if (g.moved) {
        setTiles(ts => ts.map(t => t.id === g.id
          ? { ...t, x: Math.max(0, g.ox + dx), y: Math.max(0, g.oy + dy) } : t));
      }
    } else if (g.kind === 'pan') {
      const dx = e.clientX - g.px, dy = e.clientY - g.py;
      if (!g.moved && Math.hypot(dx, dy) > 4) g.moved = true;
      if (g.moved) setPan({ x: g.ox + dx, y: g.oy + dy });
    } else {
      const l = toLocal(e.clientX, e.clientY);
      if (!g.moved && Math.hypot(l.x - g.sx, l.y - g.sy) > 4) g.moved = true;
      setLasso({ sx: g.sx, sy: g.sy, ex: l.x, ey: l.y });
    }
  }

  function onUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'tile') {
      if (g.moved) { onEvent('drag'); return; }
      setSel(new Set([g.id]));
      onEvent('select');
    } else if (g.kind === 'pan') {
      if (g.moved) onEvent('pan');
    } else {
      if (lasso && g.moved) {
        const minX = Math.min(lasso.sx, lasso.ex), maxX = Math.max(lasso.sx, lasso.ex);
        const minY = Math.min(lasso.sy, lasso.ey), maxY = Math.max(lasso.sy, lasso.ey);
        const hit = tiles.filter(t => !trashed.has(t.id)
          && t.x < maxX && t.x + TILE_W > minX && t.y < maxY && t.y + TILE_H > minY);
        setSel(new Set(hit.map(t => t.id)));
        if (hit.length >= 2) onEvent('lasso');
      }
      setLasso(null);
    }
  }

  // Ctrl+wheel and right-held wheel zoom — the real board's pair. Registered
  // natively: React's onWheel is passive and preventDefault would be ignored.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const right = (e.buttons & 2) === 2;
      if (e.ctrlKey || e.metaKey || right) {
        if (right) rightWheeled.current = true;
        setZoom(z => Math.min(2, Math.max(0.5, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
        onEvent('zoom');
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
    // onEvent is stable from the parent (a ref-backed reporter).
  }, [onEvent]);

  // Delete files into "Trash" — the tile fades out and a note says where it went.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) {
        setTrashed(prev => new Set([...prev, ...sel]));
        setSel(new Set());
        onEvent('delete');
      }
      if (e.key === 'Escape') { setMenu(null); setOpened(null); setSel(new Set()); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [sel, onEvent]);

  return (
    <div
      ref={boxRef}
      data-mini-canvas
      className="relative flex-1 min-h-[300px] overflow-hidden rounded-2xl border border-gray-200 select-none"
      style={{
        backgroundColor: '#f8fafc',
        backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
        backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        cursor: 'default',
        touchAction: 'none',
      }}
      onPointerDown={onCanvasDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onContextMenu={e => {
        e.preventDefault();
        // A right press that lassoed or wheel-zoomed is a gesture, not a menu ask.
        if (rightWheeled.current) { rightWheeled.current = false; return; }
        if (gesture.current?.kind === 'lasso' && gesture.current.moved) return;
        if (lasso) return;
        const tileEl = (e.target as Element).closest('[data-mini-tile]') as HTMLElement | null;
        if (tileEl) {
          const r = boxRef.current!.getBoundingClientRect();
          setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, id: tileEl.dataset.miniTile! });
          onEvent('menu');
        }
      }}
    >
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
        className="absolute inset-0">
        {tiles.filter(t => !trashed.has(t.id)).map(t => (
          <div
            key={t.id}
            data-mini-tile={t.id}
            className="absolute rounded-xl bg-white border shadow-sm px-3 py-2 cursor-grab active:cursor-grabbing"
            style={{
              left: t.x, top: t.y, width: TILE_W, height: TILE_H,
              borderColor: sel.has(t.id) ? '#4aa8d8' : '#e5e7eb',
              boxShadow: sel.has(t.id) ? '0 0 0 2.5px rgba(74,168,216,.5)' : undefined,
            }}
            onPointerDown={e => onTileDown(e, t)}
            onDoubleClick={() => { setOpened(t); onEvent('open'); }}
          >
            <div className="text-[13px] font-bold text-[#1e3a5f] leading-tight">{t.name}</div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="text-[10px] text-gray-500">{t.stage}</span>
            </div>
          </div>
        ))}
        {lasso && (
          <div className="absolute border-2 border-[#4aa8d8] bg-[#4aa8d8]/10 rounded"
            style={{
              left: Math.min(lasso.sx, lasso.ex), top: Math.min(lasso.sy, lasso.ey),
              width: Math.abs(lasso.ex - lasso.sx), height: Math.abs(lasso.ey - lasso.sy),
            }} />
        )}
      </div>

      {/* Where the trashed ones went — honest, and it resets nothing. */}
      {trashed.size > 0 && (
        <div className="absolute bottom-2 start-2 text-[10.5px] font-bold text-gray-400 bg-white/80 rounded-lg px-2 py-1">
          {isRtl ? `${trashed.size} באשפה — שום דבר לא נהרס` : `${trashed.size} in Trash — nothing destroyed`}
        </div>
      )}

      {/* The fake right-click menu. */}
      {menu && (
        <div className="absolute z-10 bg-white rounded-xl shadow-xl border border-gray-100 py-1 w-40 text-[12px]"
          style={{ left: Math.min(menu.x, 640), top: Math.min(menu.y, 260) }}>
          {[
            isRtl ? 'שינוי צבע' : 'Change colour',
            isRtl ? 'שכפול' : 'Duplicate',
            isRtl ? 'העברה לאשפה' : 'Move to Trash',
          ].map(row => (
            <button key={row}
              className="block w-full text-start px-3 py-1.5 hover:bg-gray-50 text-gray-700"
              onClick={() => setMenu(null)}>
              {row}
            </button>
          ))}
        </div>
      )}

      {/* The fake job window a double-click opens. */}
      {opened && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/30"
          onClick={() => setOpened(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-72" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[15px] font-bold text-[#1e3a5f]">{opened.name}</span>
              <button onClick={() => setOpened(null)} className="text-gray-400 hover:text-gray-600"
                data-mini-close>
                <X size={16} />
              </button>
            </div>
            <p className="text-[12px] text-gray-500">
              {isRtl
                ? 'כאן נפתח חלון העבודה האמיתי — פרטים, משימות, שלבים, תוכניות ותמונות.'
                : 'This is where the real job window opens — details, tasks, stages, plans and photos.'}
            </p>
          </div>
        </div>
      )}

      {/* Zoom read-out, so the zoom step visibly did something. */}
      <div className="absolute top-2 end-2 text-[10.5px] font-bold tabular-nums text-gray-400 bg-white/80 rounded-lg px-2 py-1">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}

// ── The tutorial shell ──────────────────────────────────────────────────────

export function Tutorial({ onClose }: { onClose: () => void }) {
  const s = useStore(st => st.mainUiStrings);
  const isRtl = s.isRtl;
  const [at, setAt] = useState(0);
  const [flash, setFlash] = useState(false);
  const [sheetSize, setSheetSize] = useState<SheetSize>('sticky');
  const atRef = useRef(0);
  atRef.current = at;

  /**
   * The reporter the mini canvas calls. Ref-backed so the canvas's native
   * listeners never go stale, and it only advances when the event is the one
   * the CURRENT step is waiting for — practising an earlier gesture again is
   * allowed and changes nothing.
   */
  const reportRef = useRef<(e: StepEvent) => void>(() => {});
  reportRef.current = (e: StepEvent) => {
    const step = STEPS[atRef.current];
    if (!step?.waitFor || step.waitFor !== e) return;
    setFlash(true);
    window.setTimeout(() => {
      setFlash(false);
      setAt(i => Math.min(i + 1, STEPS.length - 1));
    }, 900);
  };
  const report = useRef((e: StepEvent) => reportRef.current(e)).current;

  const step = STEPS[at];
  const t = isRtl ? step.he : step.en;
  const doStep = !step.kind;

  /** A face per gesture, so every step card has its own little character. */
  const EMOJI: Record<string, string> = {
    select: '👆', drag: '✊', open: '🚪', pan: '🖐️', zoom: '🔍',
    lasso: '🤠', menu: '🖱️', delete: '🧹', info: '👋', print: '🖨️',
  };
  const stepEmoji = EMOJI[step.waitFor ?? step.kind ?? 'info'] ?? '✨';

  // PORTALLED to body: the help button lives in the Header, which is its own
  // stacking context (z-30) — rendered inline, this whole full-screen session
  // was CAPPED at the header's level and the board's floating chrome (zoom
  // cluster, tool rail, minimap) painted straight over it, which also made
  // the X unpressable. The workspace-picker disease, cured the same way.
  return createPortal(
    <div className="fixed inset-0 z-[250] flex flex-col bg-slate-900/60 p-3 md:p-8"
      dir={isRtl ? 'rtl' : 'ltr'} data-tutorial>
      <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden max-w-5xl w-full mx-auto">
        {/* Head */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-3 bg-[#1e3a5f] text-white">
          <Sparkles size={18} className="text-[#4aa8d8]" />
          <span className="font-bold text-[15px]">
            {isRtl ? 'לומדים את הלוח' : 'Learn the board'}
          </span>
          <span className="text-[12px] text-white/60 tabular-nums" data-tutorial-progress>
            {isRtl ? `שלב ${at + 1} מתוך ${STEPS.length}` : `Step ${at + 1} of ${STEPS.length}`}
          </span>
          {/* Step dots */}
          <div className="hidden md:flex items-center gap-1 ms-2">
            {STEPS.map((_, i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: i < at ? '#22c55e' : i === at ? '#4aa8d8' : 'rgba(255,255,255,.25)' }} />
            ))}
          </div>
          <button onClick={onClose} data-tutorial-close
            className="ms-auto p-1.5 rounded-lg hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {/* The practice board, with the step card FLOATING over its middle —
            the instructions ride the stage like a game's, not a settings
            form's (the owner's "funner, in the middle of the screen"). */}
        <div className="flex-1 flex flex-col p-3 md:p-5 min-h-0 relative">
          <MiniCanvas onEvent={report} isRtl={isRtl} />

          {/* Position and animation live on DIFFERENT layers: the pop/party
              animations animate transform, and a transform on the same node
              as the centring translate would fight it and throw the card
              across the panel mid-bounce. Keyed by step so every card
              bounces in fresh. */}
          <div className="absolute left-1/2 z-30 w-[min(500px,88%)]"
            style={{ top: '64%', transform: 'translate(-50%,-50%)' }}>
            <div key={`${at}-${flash ? 'y' : 'n'}`}
              data-tutorial-step
              className={`rounded-3xl px-5 py-4 flex items-start gap-3 bg-white shadow-2xl ${
                flash ? 'tut-party' : 'tut-pop'}`}
              style={{
                border: `3px solid ${flash ? '#22c55e' : '#4aa8d8'}`,
                rotate: '-1.2deg',
              }}>
            <span className="text-[30px] leading-none select-none flex-shrink-0"
              data-tutorial-done={flash ? '1' : undefined}>
              {flash ? '🎉' : stepEmoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-black text-[15px] text-[#1e3a5f]">
                {flash ? (isRtl ? 'כל הכבוד! 🙌' : 'Nailed it! 🙌') : t.title}
              </div>
              {!flash && (
                <p className="text-[12.5px] text-gray-600 whitespace-pre-line mt-0.5">{t.body}</p>
              )}

              {/* The print step's size choice. */}
              {step.kind === 'print' && (
                <div className="flex flex-wrap items-center gap-2 mt-3" data-tutorial-print>
                  {([
                    ['sticky', isRtl ? 'פתק דביק' : 'Sticky note'],
                    ['a5', 'A5'],
                    ['a4', 'A4'],
                  ] as [SheetSize, string][]).map(([sz, label]) => (
                    <button key={sz}
                      onClick={() => setSheetSize(sz)}
                      className="px-3 py-1.5 rounded-xl border text-[12px] font-bold"
                      style={sheetSize === sz
                        ? { borderColor: '#1e3a5f', backgroundColor: '#1e3a5f', color: '#fff' }
                        : { borderColor: '#e5e7eb', color: '#4b5563' }}>
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={() => { if (!printControlSheet(sheetSize, isRtl)) alert(isRtl ? 'הדפדפן חסם את החלון' : 'The browser blocked the print window'); }}
                    data-tutorial-print-btn
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#4aa8d8] text-white text-[12px] font-bold hover:bg-[#3d95c2]">
                    <Printer size={14} /> {isRtl ? 'הדפסה' : 'Print'}
                  </button>
                </div>
              )}
            </div>

            {/* Skip / next / finish for info and print steps; do-steps advance themselves. */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {doStep && !flash && (
                <button onClick={() => setAt(i => Math.min(i + 1, STEPS.length - 1))}
                  className="text-[11px] font-bold text-gray-400 hover:text-gray-600 px-2 py-1">
                  {isRtl ? 'דילוג' : 'Skip'}
                </button>
              )}
              {!doStep && at < STEPS.length - 1 && (
                <button onClick={() => setAt(i => i + 1)} data-tutorial-next
                  className="px-4 py-2 rounded-xl bg-[#1e3a5f] text-white text-[12.5px] font-bold hover:bg-[#2c4f78]">
                  {isRtl ? 'הבא' : 'Next'}
                </button>
              )}
              {step.kind === 'print' && (
                <button onClick={onClose} data-tutorial-finish
                  className="px-4 py-2 rounded-xl bg-green-600 text-white text-[12.5px] font-bold hover:bg-green-700">
                  {isRtl ? 'סיום' : 'Finish'}
                </button>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The help button beside the What's New sparkle. */
export function TutorialButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Learn the board"
        data-tutorial-button
        className="p-2 rounded-lg text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 transition-colors"
      >
        <CircleHelp size={17} />
      </button>
      {open && <Tutorial onClose={() => setOpen(false)} />}
    </>
  );
}
