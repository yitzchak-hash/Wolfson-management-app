import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Undo2, Redo2, Trash2, HardDrive, AlertTriangle, SquareDashedMousePointer,
  Save, Printer, Download, ChevronLeft, ChevronRight,
  Plus, Minus, Maximize2, Minimize2, Loader2, Pen, Pencil, Highlighter, Eraser, Minus as LineIcon,
  ArrowUpRight, Square, Circle, Type, Hand, Layers, FileDown, Check, ExternalLink,
  MessageSquare, Move, Layers2, ChevronsUpDown, User as UserIcon,
  Monitor, ArrowRight, RotateCcw, RotateCw, MoreHorizontal, PenTool, Brush, Shapes,
} from 'lucide-react';
import './pdfCompat';   // must come before pdf.js
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useStore } from '../../data/store';
import { useOrientation } from '../../data/useOrientation';
import { AnnStroke, AnnTool, PlanAnnotation, aptLabel } from '../../types';
import { stampPlanToDrive, extractFolderId, isUploadBackendConfigured, listPlansViaBackend, findPlanSetViaBackend } from '../../data/driveApi';
import { filePinsNow } from '../../data/pinPush';
import { fetchPlanCached, prefetchPlans, acquirePlanCache, releasePlanCache } from '../../data/planCache';
import { printEsc } from '../../data/printing';
import {
  exportScale, drawPins, pinStamp, canvasBlob, imagesToPdf, imageBytesToPdf,
  safeFileName, saveBytes, saveMany,
} from '../../data/planExport';
import { PlanTab, PlanTabsStrip, mintTab, loadTabState, saveTabState } from './PlanTabs';
import { PenStroke, PenSample, NibWatch, samplesOf, simplify, nearSegment } from './penInput';
import { TOOLS, toolById, INK_COLORS, HIGHLIGHT_COLORS, rememberColor, isHighlighterTool, nibShape } from './annotTools';
import { recognizeShape } from './shapeSnap';
import { InkPicker } from './InkPicker';
import { notePointer, isPalm, isPen, touchWasPalm } from '../../data/pencil';
import { useMarkupScale } from '../../data/markupScale';
import { paintStroke, bubbleTextBox, REF, LINE } from './paintStroke';
import { PlanPicker } from './PlanPicker';
import { usePhone } from '../../data/usePhone';
import { DriveIcon } from '../ui/BrandIcons';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * The editor wears the company's colours, not a generic dark-grey app chrome.
 * Navy is the same one the header, the sidebar and every print sheet use; the
 * blue is the accent that marks whatever is active.
 */
const NAVY = '#1e3a5f';
const NAVY_DEEP = '#152b47';
/**
 * The coloured part of a slider's track, as a percentage.
 *
 * `.ink-slider` paints its track from `var(--fill)` — and nothing ever set it,
 * so the blue half of every slider sat frozen at the 50% default while the
 * handle moved past it. A native range input gives no way to style the filled
 * side, so the value has to be handed to CSS explicitly.
 */
function fillPct(value: number, min: number, max: number): React.CSSProperties {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return { ['--fill' as string]: `${pct}%` };
}

const ACCENT = '#4aa8d8';

/**
 * A media query, as a boolean that follows the screen.
 *
 * The studio has to answer two questions a width breakpoint cannot. How TALL
 * is the screen — a phone on its side is 844 across and 390 down, a desktop's
 * width and a quarter of its height, so `usePhone()` alone calls it a desktop
 * and lays out for one. And which way up is it, since that decides whether the
 * tool rail costs the plan its width or its height.
 */
function useMedia(query: string): boolean {
  const [on, setOn] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const go = () => setOn(mq.matches);
    go();
    mq.addEventListener('change', go);
    return () => mq.removeEventListener('change', go);
  }, [query]);
  return on;
}

/** The tools the pen flip is allowed to swap between. */
const INK_TOOLS = new Set(['pen', 'pencil', 'marker', 'fountain', 'calligraphy', 'crayon', 'brush', 'highlighter', 'highlighter-soft']);
/** What the fat end of the Samsung pen draws with. */
const FAT_NIB_TOOL = 'highlighter';

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  pen: Pen, pencil: Pencil, marker: Highlighter, highlighter: Highlighter,
  fountain: PenTool, calligraphy: PenTool, crayon: Pencil, brush: Brush,
  'highlighter-soft': Highlighter,
  line: LineIcon, arrow: ArrowUpRight, rect: Square, ellipse: Circle,
  text: Type, eraser: Eraser, 'eraser-object': SquareDashedMousePointer, pan: Hand, move: Move,
  bubble: MessageSquare,
};

interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    optionalContentConfigPromise?: Promise<unknown>;
  }): { promise: Promise<void>; cancel(): void };
  cleanup?(): void;
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }

/**
 * A picture, wearing a one-page document's clothes.
 *
 * The studio talks to pdf.js through a very small surface — numPages, getPage,
 * getViewport, render — so a photograph only has to answer the same four
 * questions to be marked up by exactly the same tools. Nothing downstream
 * learns the difference.
 */
function imageAsDoc(bmp: ImageBitmap): PdfDoc {
  const page: PdfPage = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: bmp.width * scale, height: bmp.height * scale, scale,
    }),
    render(o: unknown) {
      const { canvasContext, viewport } = o as {
        canvasContext: CanvasRenderingContext2D;
        viewport: { width: number; height: number };
      };
      let cancelled = false;
      const promise = (async () => {
        if (cancelled) return;
        canvasContext.drawImage(bmp, 0, 0, viewport.width, viewport.height);
      })();
      return { promise, cancel() { cancelled = true; } };
    },
  } as unknown as PdfPage;
  return { numPages: 1, getPage: async () => page };
}

/** Only the bits of pdf.js's optional-content config this needs. */
interface OcConfig {
  getOrder?(): unknown[];
  getGroups?(): Record<string, { name?: string }> | undefined;
  getGroup?(id: string): { name?: string } | undefined;
  setVisibility?(id: string, on: boolean): void;
}

/**
 * Every layer id in a plan's optional-content order.
 *
 * `getOrder()` is a TREE, not a list: a group of layers appears as
 * `{ name, order: [...] }` with the ids nested inside it. Keeping only the
 * top-level strings therefore found nothing at all on any plan whose layers
 * were grouped under a heading — which is most plans out of a CAD package, and
 * exactly the ones somebody wants the layer switches for.
 */
function flattenOrder(order: unknown[]): string[] {
  const out: string[] = [];
  const walk = (rows: unknown[]) => {
    for (const row of rows) {
      if (typeof row === 'string') { out.push(row); continue; }
      const nested = (row as { order?: unknown[] } | null)?.order;
      if (Array.isArray(nested)) walk(nested);
    }
  };
  walk(order);
  return out;
}

/**
 * The plan markup studio.
 *
 * Three things make this work rather than being a drawing toy:
 *
 * 1. It draws on the REAL PDF, rendered by pdf.js from bytes fetched through
 *    our own route. Drive's preview iframe cannot be measured or drawn on, so a
 *    mark placed over it would drift the moment anything resized. Here the ink
 *    canvas is pixel-locked to the page canvas, and every mark is stored as a
 *    fraction of the page — so it lands on the same duct on a phone, a PC and
 *    the 86" screen.
 *
 * 2. Saving produces a real PDF layer, not a flattened picture. The original
 *    page content is untouched and the markup sits in an optional-content group
 *    that any viewer can switch off. Whoever opens the file in Drive still has
 *    the drawing the engineer issued.
 *
 * 3. Versions are kept as vectors here as well as PDFs in Drive, which is what
 *    makes "carry on from version 2" possible. Reading ink back out of a PDF is
 *    not something a browser can do.
 */
export interface PlanChoice {
  /** Drive file id. */
  id: string;
  name: string;
  /** Originals come from the plans folder; markups from its Annotated Plans subfolder. */
  kind: 'original' | 'annotated';
  /** A picture rather than a PDF: no layers, everything else the same. */
  isImage?: boolean;
}

/**
 * What one TAB is holding, carried across tab switches and studio reopenings.
 *
 * The editor remounts per tab (`key={tab.id}`), so its per-sketch state has to
 * travel: seeded in through `initialWork`, and reported back out through
 * `workRef` — a mutable ref the editor writes every render, which costs no
 * re-renders and is always current when the wrapper stashes a tab away.
 */
/** Every writing tool in the pen drawer — they all share the one rail tile. */
const INK_TOOL_IDS = ['pen', 'fountain', 'calligraphy', 'pencil', 'crayon', 'marker', 'brush', 'highlighter', 'highlighter-soft'];
/**
 * Line, arrow, box and circle are ONE Shapes tile (the ink tile's idiom, by
 * the owner's ruling) — the tile wears whichever shape is in the hand and a
 * press while armed opens a small flyout. The bubble stays its own tile.
 */
const SHAPE_TOOL_IDS = ['line', 'arrow', 'rect', 'ellipse'];

/**
 * The connector as a SCRIBBLE — a wavy hand-drawn line, never right-angle
 * plumbing (the owner's ask: "not ninety degree angles, a fun scribbly way").
 * Waypoints along the straight line are pushed sideways by a wobble that
 * alternates sides, then smoothed Catmull-Rom-into-beziers so it reads as one
 * relaxed pen stroke. The wobble is SEEDED (by the version number), never
 * Math.random(): the line is re-measured on a slow tick, and a fresh random
 * path each second would visibly squirm — seeded, every version instead gets
 * its own signature squiggle that holds still.
 */
function scribblePath(x1: number, y1: number, x2: number, y2: number, seed: number): string {
  const rnd = (i: number) => {
    const s = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const n = Math.max(4, Math.min(9, Math.round(len / 80)));
  const px = -dy / len, py = dx / len;              // unit perpendicular
  const amp = Math.min(24, len * 0.11);
  const pts: [number, number][] = [[x1, y1]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const wob = (0.35 + rnd(i) * 0.9) * amp * (i % 2 ? -1 : 1);
    const arc = Math.sin(t * Math.PI) * amp * 0.6;  // swings out, comes home
    pts.push([x1 + dx * t + px * (wob + arc), y1 + dy * t + py * (wob + arc)]);
  }
  pts.push([x2, y2]);
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
    const p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)},`
      + ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)},`
      + ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * THE PEN DRAWER — the Samsung Notes manner, built as approved on the
 * owner's preview page: a frosted rounded drawer floating over the sheet,
 * every writing tool standing nib-up in ONE row (his ruling — no
 * pens/highlighters split), the one in the hand LIFTED on a slow spring,
 * and a scribble above them that redraws in the new pen's own handwriting.
 *
 * The scribble is drawn by the REAL ink engine (paintStroke) from a
 * synthetic stroke whose per-point widths are shaped like the pen — a
 * pulsing fountain nib, the calligraphy chisel via nibShape, a brush swell —
 * so the preview cannot drift from what the pen actually draws. Size and
 * colour live in the drawer, Samsung-style, and edit the studio's own
 * width/colour state directly.
 */
/** Darken a hex colour by f (0..1) — for wrapper shades and colour-coded caps. */
function dk(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v * (1 - f)).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}
/** Lighten a hex colour toward white by f (0..1). */
function lt(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v + (255 - v) * f).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/**
 * Each pen drawn as THE REAL OBJECT, tip up, in a 34×104 box — a Crayola-style
 * crayon with its paper wrapper, a Sharpie-style marker with its colour-coded
 * end, a wooden brush with ferrule and bristles, a gold fountain nib, a yellow
 * pencil with its sharpening collar. The ink colour `c` appears wherever the
 * real pen would show it (a crayon's whole body, a brush's dipped tip, a
 * ballpoint's ink tube) — that is the live colour feedback, so there is no
 * generic shared barrel any more.
 */
const TRAY_PENS: { id: string; head: (c: string) => string }[] = [
  { id: 'pen', head: c => `
    <path d="M17 2 L20.4 16 L13.6 16 Z" fill="#b9c2cf"/><circle cx="17" cy="3.2" r="1.2" fill="#5b6572"/>
    <rect x="12" y="16" width="10" height="72" rx="2" fill="#eef2f7" stroke="#c4ccd7" stroke-width=".8"/>
    <rect x="15.8" y="17" width="2.4" height="58" fill="${c}"/>
    <rect x="12" y="88" width="10" height="14" rx="3" fill="${c}" opacity=".85"/>` },
  { id: 'fountain', head: c => `
    <defs><linearGradient id="tpFn" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e9cf8e"/><stop offset=".5" stop-color="#f7e6b4"/><stop offset="1" stop-color="#c9a24f"/>
    </linearGradient><linearGradient id="tpFb" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2a3240"/><stop offset=".45" stop-color="#3d4757"/><stop offset="1" stop-color="#12161e"/>
    </linearGradient></defs>
    <path d="M17 2 C13.6 8 12 13 12 19 L12 27 L22 27 L22 19 C22 13 20.4 8 17 2 Z" fill="url(#tpFn)" stroke="#a8843c" stroke-width=".7"/>
    <line x1="17" y1="6" x2="17" y2="22" stroke="#a8843c" stroke-width="1"/><circle cx="17" cy="19" r="1.6" fill="#a8843c"/>
    <rect x="12.5" y="27" width="9" height="6" fill="#1f2430"/>
    <rect x="11.5" y="33" width="11" height="60" rx="5" fill="url(#tpFb)"/>
    <rect x="11.5" y="40" width="11" height="2.6" fill="#c9a24f"/>
    <rect x="11.5" y="44" width="11" height="2" fill="${c}"/>
    <rect x="20.3" y="49" width="2.1" height="30" rx="1" fill="#c9a24f"/>` },
  { id: 'calligraphy', head: c => `
    <rect x="10.5" y="2" width="13" height="3" fill="#9aa4b2"/>
    <path d="M10.5 5 L23.5 5 L21.2 21 L12.8 21 Z" fill="#cfd6df" stroke="#8b95a5" stroke-width=".7"/>
    <line x1="17" y1="6" x2="17" y2="19" stroke="#8b95a5" stroke-width="1"/>
    <rect x="12.5" y="21" width="9" height="7" fill="#8b95a5"/>
    <path d="M12.5 28 L21.5 28 L19.8 100 L14.2 100 Z" fill="#a5713d"/>
    <path d="M12.5 28 L15 28 L14 100 L14.2 100 Z" fill="#7c522a" opacity=".6"/>
    <rect x="13.2" y="58" width="7.6" height="3.5" fill="${c}"/>` },
  { id: 'pencil', head: () => `
    <path d="M17 2 L19.4 10 L14.6 10 Z" fill="#3f4753"/>
    <path d="M17 2 L23 22 L11 22 Z" fill="#e7cfa4"/>
    <path d="M11 22 Q13 19 15 21.5 Q17 18.6 19 21.5 Q21 19 23 22 L23 88 L11 88 Z" fill="#f5c542"/>
    <rect x="14.6" y="21" width="1" height="67" fill="#d9a91f"/><rect x="18.4" y="21" width="1" height="67" fill="#d9a91f"/>
    <rect x="11" y="88" width="12" height="7" fill="#b9c2cf"/>
    <line x1="11" y1="90.4" x2="23" y2="90.4" stroke="#8b95a5" stroke-width=".8"/>
    <line x1="11" y1="92.8" x2="23" y2="92.8" stroke="#8b95a5" stroke-width=".8"/>
    <rect x="11.6" y="95" width="10.8" height="8" rx="4" fill="#f2a6b3"/>` },
  { id: 'crayon', head: c => `
    <path d="M17 3 C19.6 6 21 10 21 13.5 L13 13.5 C13 10 14.4 6 17 3 Z" fill="${c}"/>
    <rect x="11.5" y="13.5" width="11" height="5" rx="2" fill="${c}"/>
    <rect x="11.5" y="18.5" width="11" height="80" fill="${dk(c, 0.22)}"/>
    <path d="M11.5 26 Q14.2 22.8 17 26 Q19.8 29.2 22.5 26" fill="none" stroke="${dk(c, 0.45)}" stroke-width="1.6"/>
    <path d="M11.5 86 Q14.2 82.8 17 86 Q19.8 89.2 22.5 86" fill="none" stroke="${dk(c, 0.45)}" stroke-width="1.6"/>
    <ellipse cx="17" cy="55" rx="7.2" ry="13" fill="#f8fafc" opacity=".88"/>
    <ellipse cx="17" cy="55" rx="7.2" ry="13" fill="none" stroke="${dk(c, 0.4)}" stroke-width="1"/>
    <ellipse cx="17" cy="55" rx="3.2" ry="5.6" fill="${c}"/>` },
  { id: 'marker', head: c => `
    <path d="M15 2 L19 2 L20.6 10 L13.4 10 Z" fill="${dk(c, 0.3)}"/>
    <path d="M13.4 10 L20.6 10 L21.8 20 L12.2 20 Z" fill="#22262d"/>
    <rect x="12" y="20" width="10" height="64" rx="2" fill="#d7dbe1"/>
    <rect x="12" y="30" width="10" height="3.4" fill="#22262d"/>
    <rect x="12" y="84" width="10" height="14" rx="3" fill="${dk(c, 0.12)}"/>` },
  { id: 'brush', head: c => `
    <defs><linearGradient id="tpBf" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b9c2cf"/><stop offset=".5" stop-color="#eef2f7"/><stop offset="1" stop-color="#98a3b3"/>
    </linearGradient></defs>
    <path d="M17 2 C14.4 7 13 13 13 20 L21 20 C21 13 19.6 7 17 2 Z" fill="#caa262"/>
    <path d="M17 2 C15.5 5 14.6 8.5 14.3 12 L19.7 12 C19.4 8.5 18.5 5 17 2 Z" fill="${c}"/>
    <rect x="12.5" y="20" width="9" height="12" fill="url(#tpBf)"/>
    <line x1="12.5" y1="24" x2="21.5" y2="24" stroke="#8b95a5" stroke-width=".8"/>
    <line x1="12.5" y1="27.4" x2="21.5" y2="27.4" stroke="#8b95a5" stroke-width=".8"/>
    <path d="M13 32 L21 32 L19.4 100 L14.6 100 Z" fill="#8b5a2b"/>
    <path d="M13 32 L15.4 32 L14.6 100 L14.6 100 Z" fill="#6e441f" opacity=".6"/>` },
  { id: 'highlighter', head: c => `
    <path d="M14 2 L20 2 L23 14 L11 14 Z" fill="${c}" opacity=".8"/>
    <rect x="10.5" y="14" width="13" height="5" rx="1" fill="#eef1f5"/>
    <rect x="10" y="19" width="14" height="70" rx="4" fill="${lt(c, 0.25)}"/>
    <rect x="10" y="42" width="14" height="16" fill="#f5f7fa" opacity=".92"/>
    <rect x="10" y="89" width="14" height="10" rx="3" fill="${dk(c, 0.15)}"/>` },
  { id: 'highlighter-soft', head: c => `
    <path d="M17 3 C20.6 3 23 7 23 12 L23 16 L11 16 L11 12 C11 7 13.4 3 17 3 Z" fill="${c}" opacity=".55"/>
    <rect x="10" y="16" width="14" height="76" rx="6" fill="${lt(c, 0.45)}"/>
    <rect x="10" y="36" width="14" height="3" fill="${c}" opacity=".5"/>
    <rect x="10" y="46" width="14" height="14" fill="#ffffff" opacity=".88"/>` },
];

/** The squiggle every pen writes, normalised 0..1 — one relaxed wave. */
const TRAY_PATH: [number, number][] = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  return [0.04 + t * 0.92, 0.5 - Math.sin(t * Math.PI * 3.1) * 0.3 - Math.sin(t * Math.PI) * 0.05];
});

/** Per-point widths in the pen's own character — the engine does the rest. */
function trayWidths(tool: string): number[] {
  return TRAY_PATH.map(([x, y], i) => {
    const t = i / (TRAY_PATH.length - 1);
    if (tool === 'fountain') return 0.55 + 0.9 * Math.abs(Math.sin(t * Math.PI * 3.1));
    if (tool === 'brush') return 0.4 + 1.3 * Math.sin(t * Math.PI);
    if (tool === 'calligraphy') {
      const prev = TRAY_PATH[Math.max(0, i - 1)];
      return nibShape('calligraphy', 1, x - prev[0], (y - prev[1]) * 0.28);
    }
    if (tool === 'pencil') return 0.85 + 0.3 * Math.sin(t * 40);   // grain
    return 1;
  });
}

function PenTray({ at, up, current, color, width, opacity, onPick, onColor, onWidth, onOpacity, onClose, ts }: {
  at: { x: number; y: number }; up: boolean; current: string; color: string; width: number;
  opacity: number;
  onPick: (id: string) => void; onColor: (c: string) => void; onWidth: (w: number) => void;
  onOpacity: (o: number) => void;
  onClose: () => void; ts: number;
}) {
  /** The custom colour picker, hung off the rainbow chip — in-app, never the OS dialog. */
  const [customAt, setCustomAt] = useState<{ x: number; y: number } | null>(null);
  // The tray owns Escape — capture + stopImmediatePropagation, or one press
  // would also put the tool down and start closing the studio (the ladder).
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  // The wall's giant button scale would make nine pens wider than the screen —
  // the drawer grows more gently than the chrome.
  const k = Math.min(ts, 1.5);
  const slotW = Math.round(44 * k);
  const penW = Math.round(34 * k);
  const penH = Math.round(104 * k);
  const W = Math.min(TRAY_PENS.length * (slotW + 4) + 40, window.innerWidth - 16);
  const H = Math.round(penH + 212 * k);   // scribble + pens + size + see-through + colours
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, up ? at.x - W / 2 : at.x));
  const top = up
    ? Math.max(8, at.y - H)
    : Math.max(8, Math.min(window.innerHeight - H - 8, at.y - H / 2));

  const preset = toolById(current);
  const palette = isHighlighterTool(current) ? HIGHLIGHT_COLORS : INK_COLORS;
  /**
   * The slider's range is the preset's neighbourhood, in the same half-point
   * steps the top bar's Width slider uses — and it WIDENS to include whatever
   * width is actually set, so a width chosen on the top bar always shows here
   * at its true position instead of pinning the thumb at an end. One shared
   * `width` state, two views of the same number.
   */
  const lo = Math.min(Math.max(0.5, Math.round(preset.width * 0.35 * 2) / 2), width);
  const hi = Math.max(Math.round(preset.width * 2.6 * 2) / 2, width);

  /**
   * The scribble, drawn by the app's own engine onto a small canvas. Re-keyed
   * per pen so the wipe reveal replays — the "draws itself" moment.
   */
  const scribRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = scribRef.current;
    if (!c) return;
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const ws = trayWidths(current);
    const pts: number[] = [];
    TRAY_PATH.forEach(([x, y], i) => { pts.push(x, y, ws[i]); });
    paintStroke(g, c, {
      id: 'tray', page: 0, tool: current as AnnTool, color,
      // widths are against the 1000-unit reference page; the canvas is far
      // narrower, so the same number draws far too thin — scale it so the
      // sample reads at the weight the sheet will show.
      width: Math.max(2, width * 2.6),
      opacity: preset.opacity, pts,
    });
  }, [current, color, width, preset.opacity]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[168]" onClick={onClose} />
      <div data-pen-tray
        className="fixed z-[169] rounded-3xl shadow-2xl"
        style={{
          left, top, width: W, padding: `${Math.round(10 * k)}px ${Math.round(14 * k)}px ${Math.round(12 * k)}px`,
          backgroundColor: 'rgba(255,255,255,.72)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.25)',
          backdropFilter: 'blur(16px) saturate(1.25)',
          border: '1px solid rgba(255,255,255,.78)',
          boxShadow: '0 22px 60px rgba(15,23,42,.30), 0 2px 8px rgba(15,23,42,.10)',
          overflowX: W >= window.innerWidth - 16 ? 'auto' : 'visible',
        }}>
        {/* the scribble stage — keyed so the wipe replays on every switch */}
        <div key={current} className="tray-reveal" style={{ height: Math.round(44 * k), margin: '0 4px' }}>
          <canvas ref={scribRef} data-tray-scribble className="w-full h-full block" />
        </div>
        {/* the pens, ONE row */}
        <div className="flex items-end justify-between" style={{ paddingBottom: Math.round(8 * k) }}>
          {TRAY_PENS.map(p => {
            const active = p.id === current;
            const label = toolById(p.id).label;
            return (
              <button key={p.id} data-pen={p.id} onClick={() => onPick(p.id)}
                title={toolById(p.id).hint}
                className="flex flex-col items-center"
                style={{ width: slotW, background: 'none', border: 0, cursor: 'pointer', gap: 4 }}>
                <span style={{
                  width: penW, height: penH, display: 'block', position: 'relative',
                  transform: active ? `translateY(${-Math.round(12 * k)}px)` : 'translateY(4px)',
                  transition: 'transform .55s cubic-bezier(.3,1.25,.35,1.02), filter .4s ease',
                  filter: active ? 'drop-shadow(0 10px 10px rgba(15,23,42,.30))' : 'saturate(.85)',
                }}>
                  {/* the whole pen is the drawing now — crayon wrapper, Sharpie
                      body, brush bristles — so there is no shared barrel */}
                  <svg viewBox="0 0 34 104" preserveAspectRatio="xMidYMin meet"
                    style={{ position: 'absolute', left: 0, top: 0, width: penW, height: penH }}>
                    <g dangerouslySetInnerHTML={{ __html: p.head(color) }} />
                  </svg>
                </span>
                <span style={{ font: `700 ${Math.max(8, 8.5 * k)}px Inter, sans-serif`,
                  color: active ? NAVY : 'rgba(31,41,55,.45)', whiteSpace: 'nowrap' }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        {/* size, the Samsung manner — the SAME number as the top bar's Width,
            so the fill and the thumb agree with the slider up top */}
        <div className="flex items-center" style={{ gap: 8, margin: `0 4px` }}>
          <button data-tray-minus onClick={() => onWidth(Math.max(lo, Math.round((width - Math.max(0.5, (hi - lo) / 9)) * 2) / 2))}
            style={{ border: 0, background: 'none', color: '#475569', font: '700 16px Inter', cursor: 'pointer', padding: '2px 6px' }}>−</button>
          <div style={{ position: 'relative', flex: 1, height: 26 }}>
            <div style={{ position: 'absolute', inset: '11px 6px', borderRadius: 4,
              backgroundImage: 'radial-gradient(circle, #cbd5e1 1.6px, transparent 1.8px)',
              backgroundSize: 'calc((100% - 4px) / 9) 4px', backgroundPosition: '2px 0', backgroundRepeat: 'repeat-x' }} />
            <input data-tray-size type="range" min={lo} max={hi} step={0.5} value={width}
              onChange={e => onWidth(+e.target.value)} className="ink-slider"
              style={{ position: 'absolute', inset: 0, width: '100%', margin: 0, ...fillPct(width, lo, hi) }}
              aria-label="Pen size" />
          </div>
          <button data-tray-plus onClick={() => onWidth(Math.min(hi, Math.round((width + Math.max(0.5, (hi - lo) / 9)) * 2) / 2))}
            style={{ border: 0, background: 'none', color: '#475569', font: '700 16px Inter', cursor: 'pointer', padding: '2px 6px' }}>+</button>
          <span data-tray-size-num className="tabular-nums"
            style={{ font: `600 ${Math.max(10, 11 * k)}px Inter`, color: '#475569', minWidth: 26, textAlign: 'right' }}>
            {width}</span>
        </div>
        {/* see-through, the Samsung manner: the track runs from nothing to the
            ink itself over a checkerboard, and it is the SAME number as the
            top bar's See-through */}
        <div className="flex items-center" style={{ gap: 8, margin: '6px 4px 0' }}>
          <span style={{ font: `600 ${Math.max(9.5, 10 * k)}px Inter`, color: '#64748b' }}>See-through</span>
          <input data-tray-alpha type="range" min={5} max={100} step={5}
            value={Math.round(opacity * 100)}
            onChange={e => onOpacity(+e.target.value / 100)}
            className="alpha-slider" aria-label="See-through"
            style={{
              flex: 1, margin: 0,
              backgroundImage: `linear-gradient(90deg, ${color}00, ${color}), `
                + 'repeating-conic-gradient(#dde3ea 0% 25%, #ffffff 0% 50%)',
              backgroundSize: '100% 100%, 12px 12px',
            }} />
          <span data-tray-alpha-num className="tabular-nums"
            style={{ font: `600 ${Math.max(10, 11 * k)}px Inter`, color: '#475569', minWidth: 32, textAlign: 'right' }}>
            {Math.round(opacity * 100)}%</span>
        </div>
        {/* the app's own colours — highlighters take the highlight shades —
            plus the rainbow chip that opens the full in-app picker */}
        <div data-tray-colors className="flex justify-center items-center" style={{ gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
          {palette.map(c => (
            <button key={c} data-tray-color={c} onClick={() => onColor(c)}
              aria-label="colour"
              style={{
                width: 22, height: 22, borderRadius: 999, border: 0, cursor: 'pointer',
                backgroundColor: c,
                boxShadow: color === c
                  ? `0 0 0 2px #fff, 0 0 0 4px ${NAVY}`
                  : 'inset 0 0 0 1px rgba(15,23,42,.15)',
                transform: color === c ? 'scale(1.15)' : 'none',
                transition: 'transform .18s ease',
              }} />
          ))}
          <button data-tray-custom
            onClick={e => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setCustomAt({ x: r.left - 120, y: r.bottom + 8 });
            }}
            title="Custom colour" aria-label="Custom colour"
            style={{
              width: 22, height: 22, borderRadius: 999, border: 0, cursor: 'pointer',
              background: 'conic-gradient(#f43f5e,#f59e0b,#facc15,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#f43f5e)',
              boxShadow: !palette.includes(color)
                ? `0 0 0 2px #fff, 0 0 0 4px ${NAVY}`
                : 'inset 0 0 0 1px rgba(15,23,42,.15)',
              transform: !palette.includes(color) ? 'scale(1.15)' : 'none',
              transition: 'transform .18s ease',
            }} />
        </div>
      </div>
      {/* The full picker, LIFTED above the tray — its usual z sits under the
          tray's backdrop, which would leave it visible but unpressable. */}
      {customAt && (
        <InkPicker value={color} palette={palette} anchor={customAt} lift
          onChange={c => { onColor(c); rememberColor(c); }}
          onClose={() => setCustomAt(null)} />
      )}
    </>,
    document.body,
  );
}

/**
 * The Shapes flyout — the pen tray's little sibling for line, arrow, box and
 * circle. Four drawn buttons, the one in the hand lifted; picking closes it
 * (there is no scribble show to watch here). Frosted like the tray so the two
 * read as one family.
 */
function ShapeTray({ at, up, current, onPick, onClose, ts }: {
  at: { x: number; y: number }; up: boolean; current: string;
  onPick: (id: string) => void; onClose: () => void; ts: number;
}) {
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  const k = Math.min(ts, 1.5);
  const slotW = Math.round(54 * k);
  const W = SHAPE_TOOL_IDS.length * (slotW + 6) + 24;
  const H = Math.round(74 * k);
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, up ? at.x - W / 2 : at.x));
  const top = up
    ? Math.max(8, at.y - H)
    : Math.max(8, Math.min(window.innerHeight - H - 8, at.y - H / 2));

  return createPortal(
    <>
      <div className="fixed inset-0 z-[168]" onClick={onClose} />
      <div data-shape-tray
        className="fixed z-[169] rounded-2xl shadow-2xl flex items-center"
        style={{
          left, top, width: W, height: H, padding: `0 ${Math.round(12 * k)}px`, gap: 6,
          backgroundColor: 'rgba(255,255,255,.72)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.25)',
          backdropFilter: 'blur(16px) saturate(1.25)',
          border: '1px solid rgba(255,255,255,.78)',
          boxShadow: '0 22px 60px rgba(15,23,42,.30), 0 2px 8px rgba(15,23,42,.10)',
        }}>
        {SHAPE_TOOL_IDS.map(id => {
          const Icon = ICONS[id] ?? LineIcon;
          const active = id === current;
          return (
            <button key={id} data-shape={id}
              onClick={() => { onPick(id); onClose(); }}
              title={toolById(id).hint}
              className="flex flex-col items-center justify-center rounded-xl"
              style={{
                width: slotW, height: Math.round(56 * k), gap: 3, border: 0, cursor: 'pointer',
                backgroundColor: active ? NAVY : 'rgba(255,255,255,.55)',
                color: active ? '#fff' : '#334155',
                transform: active ? 'translateY(-3px)' : 'none',
                transition: 'transform .3s cubic-bezier(.3,1.25,.35,1.02), background .2s ease',
                boxShadow: active ? '0 8px 16px rgba(15,23,42,.25)' : 'inset 0 0 0 1px rgba(15,23,42,.08)',
              }}>
              <Icon size={Math.round(17 * k)} />
              <span style={{ font: `700 ${Math.max(8, 8.5 * k)}px Inter, sans-serif` }}>
                {toolById(id).label}
              </span>
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}

/**
 * "Where should this marked-up plan be saved?" — the File Tray's question.
 *
 * A plan opened from the tray has no job of its own, so the FIRST save asks:
 * keep it beside the original in the tray's Drive folder, or file it into a
 * job's plans folder. Picking a job resolves its Engineered Plans folder on
 * the spot (the markup of a plan is a plan — that is where the office looks),
 * falling back to the job folder itself when there is none. Portalled and
 * SEALED (the portal-in-a-node trap), Escape closes it, capture phase.
 */
function SaveWhereDialog({ trayFolderId, jobs, onPick, onClose }: {
  trayFolderId?: string;
  jobs: { id: string; label: string; driveLink: string }[];
  onPick: (dest: { folderId: string; label: string }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [resolving, setResolving] = useState('');
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const shown = (needle ? jobs.filter(j => j.label.toLowerCase().includes(needle)) : jobs).slice(0, 40);

  async function pickJob(j: { id: string; label: string; driveLink: string }) {
    setResolving(j.id);
    try {
      const set = await findPlanSetViaBackend(j.driveLink);
      const folderId = set.plansFolderId ?? extractFolderId(j.driveLink);
      if (folderId) onPick({ folderId, label: j.label });
    } catch {
      const folderId = extractFolderId(j.driveLink);
      if (folderId) onPick({ folderId, label: j.label });
    } finally {
      setResolving('');
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[172]" style={{ backgroundColor: 'rgba(9,14,22,.5)' }} onClick={onClose} />
      <div data-save-where
        className="fixed z-[173] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                 width: 'min(380px, 94vw)', maxHeight: 'min(540px, 88vh)', backgroundColor: '#fff' }}
        onPointerDown={e => e.stopPropagation()}
        onPointerUp={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3" style={{ backgroundColor: NAVY }}>
          <div className="text-[14px] font-extrabold text-white">Where should this be saved?</div>
          <p className="text-[11.5px] mt-0.5" style={{ color: 'rgba(255,255,255,.65)' }}>
            The marked-up plan is filed in Drive — pick its home.
          </p>
        </div>
        <div className="p-3 flex flex-col gap-2 min-h-0">
          {trayFolderId && (
            <button data-save-tray
              onClick={() => onPick({ folderId: trayFolderId, label: 'the File Tray folder' })}
              className="w-full text-start rounded-xl border px-3 py-2.5 hover:bg-gray-50"
              style={{ borderColor: '#c7d4e0' }}>
              <span className="block text-[12.5px] font-bold text-gray-800">The File Tray folder</span>
              <span className="block text-[10.5px] text-gray-400">Beside the original, in Drive</span>
            </button>
          )}
          <input data-save-search
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="…or search for a job"
            className="w-full rounded-lg border px-3 py-2 text-[12px] outline-none focus:border-[#4aa8d8]"
            style={{ borderColor: '#c7d4e0' }} />
          <div className="flex-1 min-h-0 overflow-y-auto widget-scroll space-y-1">
            {shown.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-3">
                {jobs.length ? 'No job matches that.' : 'No jobs with a Drive folder in this workspace.'}
              </p>
            ) : shown.map(j => (
              <button key={j.id} data-save-job={j.id}
                onClick={() => void pickJob(j)}
                disabled={!!resolving}
                className="w-full text-start rounded-lg px-3 py-2 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-60"
                style={{ border: '1px solid #eef1f5' }}>
                <span className="flex-1 min-w-0 text-[12px] font-semibold text-gray-700 truncate">{j.label}</span>
                {resolving === j.id
                  ? <Loader2 size={12} className="animate-spin flex-shrink-0 text-gray-400" />
                  : <span className="text-[9.5px] text-gray-400 flex-shrink-0">its plans folder</span>}
              </button>
            ))}
          </div>
          <button onClick={onClose}
            className="w-full py-2 rounded-xl text-[12px] font-semibold text-gray-500 hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

export interface TabWork {
  strokes: AnnStroke[];
  redo: AnnStroke[];
  basedOn?: number;
  dirty: boolean;
  saveState: 'clean' | 'local' | 'sending' | 'sent' | 'failed';
  page: number;
  scale: number | null;
  versionId: string | null;
  sketchVersion: number | null;
  /** How many in-place Drive updates this sketch's file has had — the ".3". */
  subVersion?: number | null;
}

function PlanEditor({
  planFileId, planName, apartmentId, apartmentLabel, driveFolderUrl, plansFolderId,
  authorName, readOnly = false, askWho = false, people = [], plans = [], embedded = false,
  barExtrasRef, barInto, barInto2,
  touchScale = 1, chooseSaveFolder = false,
  tabStrip, initialWork, workRef, onOpenPlanNewTab, onUnsavedChange,
  onClose, onToast, onPickPlan, onStartMarkup, onSavedToDrive,
}: {
  planFileId: string;
  planName?: string;
  apartmentId: string;
  apartmentLabel: string;
  /** The job's Drive folder — the markup is filed in an "Annotated Plans" subfolder of it. */
  driveFolderUrl?: string;
  /**
   * The Engineered Plans folder itself. The markup belongs INSIDE it, because
   * the markup of a plan is a plan and that is where the office looks.
   */
  plansFolderId?: string;
  authorName: string;
  readOnly?: boolean;
  /**
   * The plan has no job of its own (the File Tray opens sketches like this),
   * so the FIRST save asks WHERE to file it — the tray's folder or a job's
   * plans folder — and every Drive push waits for that answer. Local keeps
   * are untouched: the marks are safe in the app from the first stroke.
   */
  chooseSaveFolder?: boolean;
  /**
   * Sit inside the page instead of covering it.
   *
   * The wallboard shows a plan as PART of a job screen rather than as a
   * full-screen studio, and it needs the plan drawn the way this draws it —
   * pdf.js onto a white canvas, fitted to its space — rather than as a Drive
   * preview, which frames every sheet in a black surround and cannot be told
   * not to.
   */
  embedded?: boolean;
  /**
   * Where the HOST can put its own buttons in this bar.
   *
   * The drawer's punch-list pin lives here, beside the file's name — see the
   * note at the slot itself.
   */
  barExtrasRef?: (el: HTMLElement | null) => void;
  /**
   * Draw this bar somewhere else entirely — the host's own bar.
   *
   * The drawer used to stack two bars over one sheet: its navy header carrying
   * the folder picker and the file chips, and this one underneath carrying the
   * file's name, the pin, Plans, Layers, Download and Print. The owner asked
   * for one row, with these controls at its LEFT-hand end, ahead of the folder
   * picker — so when a host offers a slot, the whole row is portalled into it
   * and nothing is drawn in place. Its own background and padding are dropped
   * with it: it is joining a bar, not putting a second one inside the first.
   */
  barInto?: HTMLElement | null;
  /**
   * A SECOND slot, which splits this bar across two rows.
   *
   * With both given, the file's name goes into `barInto` and everything else
   * — the pin, the pager, Plans, Layers, Download, Print — goes into
   * `barInto2`. That is the owner's own arrangement, drawn on the workbench:
   * what the sheet IS on the top row, what you can DO to it underneath.
   *
   * With only `barInto`, the whole row goes there as before.
   */
  barInto2?: HTMLElement | null;
  /**
   * The wallboard is shared — whoever walks up to it is not "the office".
   * When this is on, the editor asks who is drawing before it will let anyone
   * draw, and that name goes on the version and into the PDF.
   */
  askWho?: boolean;
  people?: string[];
  /**
   * How big the controls are, 1 being the desk size.
   *
   * The wall panel is driven with a finger and a fat passive pen, and a rail
   * laid out for a mouse is a miss more often than a hit. Everything in the
   * chrome — rail width, button size, icons, labels, the top bar — is a
   * multiple of this, so one number moves all of it together and nothing can
   * be left behind at the old size.
   */
  touchScale?: number;
  /** Every plan on this job: the originals, and the markups made from them. */
  plans?: PlanChoice[];
  /** The tab strip, rendered by the wrapper — drawn in the bar or on its own row. */
  tabStrip?: React.ReactNode;
  /** This tab's carried state — see TabWork. */
  initialWork?: TabWork;
  /** Written every render with the live TabWork, for the wrapper to stash. */
  workRef?: React.MutableRefObject<TabWork | null>;
  /** The picker's "open in new tab" — offered only when the wrapper runs tabs. */
  onOpenPlanNewTab?: (p: PlanChoice) => void;
  /** Fires when this tab's has-unsaved-marks answer changes, for its cloud. */
  onUnsavedChange?: (unsaved: boolean) => void;
  onClose: () => void;
  onToast?: (msg: string, kind?: 'success' | 'error') => void;
  onPickPlan?: (p: PlanChoice) => void;
  /** Turns a read-only viewing into an editing session, in place. */
  onStartMarkup?: () => void;
  /**
   * A markup just landed in Drive's Annotated Plans. The wrapper folds it
   * into the plan list on the spot, so the picker shows the version that was
   * saved ten seconds ago without waiting for the drawer to reopen.
   */
  onSavedToDrive?: (p: PlanChoice) => void;
}) {
  /**
   * The shape of the screen, which on a phone is two different problems.
   *
   * Stood up (390 × 844) width is what is scarce, so a 62px rail down the side
   * is a sixth of the plan; it goes across the bottom instead, where a thumb
   * reaches it. On its side (844 × 390) — the way anybody actually holds a
   * phone to read a construction drawing — height is what is scarce, so the
   * rail belongs down the side and the chrome above the plan has to shrink to
   * one row. `compact` is "either dimension is too small for the desk
   * layout", which is true in BOTH orientations of the same phone; a width
   * breakpoint on its own is false the moment the phone is turned.
   */
  const phone = usePhone();
  /**
   * The width test is deliberately part of this. A desk window dragged half
   * way up the screen is also 500px tall, and it has 1400px of width to lay
   * the header out in — collapsing that into a ⋯ menu would be the phone
   * layout arriving on a machine that never needed it.
   */
  const shortScreen = useMedia('(max-height: 540px) and (max-width: 1024px)');
  const landscape = useMedia('(orientation: landscape)');
  const compact = phone || shortScreen;
  /** The rail runs across the bottom only when the screen is taller than it is wide. */
  const railRow = compact && !landscape;

  const s = useStore(st => st.mainUiStrings);
  /**
   * The snag pins belong to the APARTMENT, not to this component — the
   * overlay that draws them on screen is the host's. Read here so a download
   * can put them in the file, which is what "with the markings" means to the
   * person asking for it.
   */
  const myPins = useStore(st => st.planPins).filter(p => p.apartmentId === apartmentId);
  const planAnnotations = useStore(s => s.planAnnotations);
  const savePlanAnnotation = useStore(s => s.savePlanAnnotation);
  const updatePlanAnnotation = useStore(s => s.updatePlanAnnotation);
  const deletePlanAnnotation = useStore(s => s.deletePlanAnnotation);
  const allApartments = useStore(s => s.apartments);

  /**
   * The ask-where flow (chooseSaveFolder — the File Tray's studio). The
   * chosen destination lives in a REF beside its state: the save that fires
   * the moment the dialog answers must see the choice before React has
   * flushed it — the standing read-through-refs rule for the save callbacks.
   */
  const [askWhere, setAskWhere] = useState(false);
  const [saveDest, setSaveDest] = useState<{ folderId: string; label: string } | null>(null);
  const saveDestRef = useRef<{ folderId: string; label: string } | null>(null);
  const saveJobs = useMemo(() =>
    chooseSaveFolder
      ? allApartments
          .filter(a => a.driveLink && !a.isUnnamed)
          .map(a => ({ id: a.id, label: aptLabel(a), driveLink: a.driveLink! }))
      : [],
    [chooseSaveFolder, allApartments]);

  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [loadErr, setLoadErr] = useState('');
  /** How much of a heavy plan has arrived, so the wait is visible. */
  const [got, setGot] = useState<{ bytes: number; total: number | null }>({ bytes: 0, total: null });
  const [page, setPage] = useState(initialWork?.page ?? 0);
  const [scale, setScale] = useState(initialWork?.scale ?? 1.25);
  // A tab coming back remembers its zoom; only a fresh one fits on open.
  const [fitting, setFitting] = useState(initialWork?.scale == null);
  /**
   * Zooming does NOT redraw the sheet. Not straight away.
   *
   * Every zoom step used to resize all three canvases — which clears them — and
   * kick off a fresh pdf.js render of the whole page. On a real A0 drawing that
   * is a second or more of blank white per step, so holding the zoom made the
   * plan strobe: the owner's "it refreshes all the layers every three seconds".
   *
   * There are two scales now. `scale` is the LAYOUT one and moves instantly:
   * the canvases keep the bitmap they already have and are simply given a new
   * CSS size, so the sheet grows under your hand with no work at all, very
   * slightly soft. `raster` is the DRAWING one and follows a moment after your
   * hand stops, at which point the page is redrawn at full resolution — once,
   * off-screen, and blitted in one go so nothing ever goes blank.
   */
  const [raster, setRaster] = useState(initialWork?.scale ?? 1.25);
  /** The page at 100%, so the CSS size can follow the zoom without a render. */
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  /** What is actually painted on the canvas right now. */
  const drawnAt = useRef<{ page: number; s: number } | null>(null);
  useEffect(() => {
    if (Math.abs(scale - raster) < 0.001) return;
    const t = setTimeout(() => setRaster(scale), 170);
    return () => clearTimeout(t);
  }, [scale, raster]);
  /** Is the SHEET wider than it is tall? Decides the turn-your-phone hint. */
  const [sheetWide, setSheetWide] = useState(false);
  const screen = useOrientation();

  const [strokes, setStrokes] = useState<AnnStroke[]>(initialWork?.strokes ?? []);
  const [redo, setRedo] = useState<AnnStroke[]>(initialWork?.redo ?? []);
  const [basedOn, setBasedOn] = useState<number | undefined>(initialWork?.basedOn);
  const [dirty, setDirty] = useState(initialWork?.dirty ?? false);

  const [tool, setTool] = useState<string>('pen');
  const [color, setColor] = useState('#dc2626');
  const [width, setWidth] = useState(3);
  const [opacity, setOpacity] = useState(1);
  /** Heavier type on the next note or balloon. */
  const [bold, setBold] = useState(false);
  const [sens, setSens] = useState(1);
  const [showPalette, setShowPalette] = useState(false);
  const [paletteAt, setPaletteAt] = useState({ x: 120, y: 120 });
  const [penSource, setPenSource] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [textDraft, setTextDraft] = useState<{ nx: number; ny: number; value: string; forId?: string } | null>(null);

  /** Where the pointer is, so the nib can be drawn at its real size under it. */
  const [nibAt, setNibAt] = useState<{ x: number; y: number } | null>(null);
  /** The move tool's current selection. */
  const [picked, setPicked] = useState<string | null>(null);
  /** Which of the PDF's own layers are switched on. */
  const [layers, setLayers] = useState<{ id: string; name: string; on: boolean }[]>([]);
  const [showLayers, setShowLayers] = useState(false);
  /**
   * A picture rather than a PDF.
   *
   * Everything else is the same — the same tools, the same versions, the same
   * saving — but an image has no optional-content groups, so the layer
   * switches are switched off rather than offered and found empty.
   */
  const [loadedIsImage, setLoadedIsImage] = useState(false);
  const isImagePlan = loadedIsImage || !!plans.find(p => p.id === planFileId)?.isImage;
  /**
   * The download sheet walks two questions, so it is a STEP rather than a
   * boolean: what goes in the file, then what kind of file, and only for a
   * set too big to render whole, how much of it.
   */
  const [dlStep, setDlStep] = useState<'what' | 'format' | 'pages' | null>(null);
  const [dlMarkup, setDlMarkup] = useState(true);
  const [dlPdf, setDlPdf] = useState(true);
  /**
   * Which errand the sheet is running. Print asks the same first question as
   * a download — "with the markings, or just the plan?" — and then goes
   * straight to the paper: printing IS the format, so there is no second
   * question for it.
   */
  const [dlMode, setDlMode] = useState<'download' | 'print'>('download');
  const [showPlans, setShowPlans] = useState(false);
  /**
   * The rest of the header, on a screen that cannot hold it.
   *
   * Eleven buttons wrap onto four rows at 390px and eat half the plan. The
   * five that are pressed while drawing stay out; everything else moves in
   * here, at a size a finger can hit.
   */
  const [showMore, setShowMore] = useState(false);
  /** On the wallboard: who is drawing. Empty means nobody has said yet. */
  const [who, setWho] = useState(askWho ? '' : authorName);

  const stageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLCanvasElement>(null);
  /** The white sheet wrapper — the pinch scales THIS as a GPU transform. */
  const sheetWrapRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<{ cancel(): void } | null>(null);
  const ocRef = useRef<OcConfig | null>(null);
  const drawing = useRef<{
    pen: PenStroke; pts: PenSample[]; startedAt: number;
    /** The tool this stroke actually started with — see nibFlip(). */
    tool?: string;
  } | null>(null);
  /** Learns this panel's two nib sizes, so flipping the pen can switch tools. */
  const nibs = useRef(new NibWatch());
  /** The ink tool to come back to when the pen is flipped the right way up. */
  const thinNibTool = useRef<string>('pen');
  /** A drag of something already drawn, rather than a new stroke. */
  const moving = useRef<{
    id: string; nx: number; ny: number; pts: number[]; grip?: 'a' | 'z';
    /** Has it actually travelled, or was this a tap that happened to land on it? */
    moved?: boolean;
    /** A finger's second tap on the mark it already picked — see onDown. */
    tapOpens?: boolean;
  } | null>(null);
  /**
   * A move-tool drag that began on EMPTY sheet — it pans the view.
   *
   * Move used to answer a press on nothing with nothing, so getting around the
   * sheet meant switching to Pan and back, twice per look. A drag that starts
   * on a mark still moves the mark; only a drag that starts on blank plan
   * scrolls it. A click that never travels still just clears the pick.
   */
  const stagePan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const erased = useRef<Set<string>>(new Set());
  const textRef = useRef<HTMLTextAreaElement>(null);
  /**
   * The nib ghost's own element, so it can be moved without a render.
   *
   * `setNibAt` on every pointermove re-renders the whole studio — a component
   * with the version list, the rail and three canvases in it — for a circle
   * that has moved four pixels. On a desk that is waste; on a phone it is the
   * difference between a line that follows your finger and one that trails it.
   * While a stroke is actually being drawn the ghost is written straight to
   * the DOM instead, and state takes over again the moment the pen lifts.
   */
  const nibElRef = useRef<HTMLSpanElement>(null);
  /**
   * What last touched the glass. A long press with a finger must not open the
   * browser's own "open image in new tab" menu over a drawing, but a right
   * click with a mouse is nobody's problem — and a contextmenu event carries
   * no pointer type of its own to tell them apart.
   */
  const lastPointerType = useRef<string>('mouse');
  /** Where a zoom should land, as a fraction of the content. See renderPage. */
  const zoomAnchor = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null);
  /** The live scale, for the pinch handler — which is registered once. */
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  /**
   * The scale at which the WHOLE sheet fits the stage with its margin.
   * Written by renderPage each time it measures the stage, so a resized
   * window or a rotated tablet moves it with them.
   *
   * OWNER REVERSAL (2026-09-01): the fit is no longer the FLOOR. His words —
   * "if I click minus, it should show the plan getting smaller with the
   * [stage] getting around it". Zooming out below the fit shrinks the sheet
   * into the stage, centred by its auto margins; the only floor left is a
   * quarter of the fit, past which the sheet is a postage stamp and minus
   * greys out honestly.
   */
  const fitScaleRef = useRef(0.1);
  const zoomFloor = useCallback(() =>
    Math.max(0.02, fitScaleRef.current * 0.25), []);
  /**
   * A touch tap moves a real step. The old ×1.08 "gentle" tap was the owner's
   * "the plus zoom thing we need to fix" — at the fit, eight taps bought one
   * wheel notch and the button read as broken. ×1.25 per tap is the pace the
   * desktop buttons move at; the pinch is there for the fine moves. Keyed off
   * what the device can DO (`any-hover: none`), never "is this a tablet".
   */
  const touchUI = useMedia('(any-hover: none)');
  const touchUIRef = useRef(touchUI);
  touchUIRef.current = touchUI;
  const zoomStep = useCallback((dir: 1 | -1, step: number, cap: number) => {
    setFitting(false);
    setScale(s => {
      const next = touchUIRef.current ? s * (dir > 0 ? 1.25 : 1 / 1.25) : s + dir * step;
      return Math.min(cap, Math.max(zoomFloor(), Math.round(next * 100) / 100));
    });
  }, [zoomFloor]);
  /** Standing on the (new, far lower) floor — minus greys out only there. */
  const atZoomFloor = scale <= zoomFloor() + 0.005;
  /**
   * REAL full screen, alongside the fit-to-page button that used to wear its
   * icon. The browser only grants it from a user gesture, and Esc leaves it
   * without asking — so the state follows `fullscreenchange` rather than the
   * button, and the same button reads "exit" once it is on.
   */
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) { void document.exitFullscreen?.(); return; }
    rootRef.current?.requestFullscreen?.()
      .catch(() => onToast?.('The browser would not allow full screen here', 'error'));
  }, [onToast]);

  /**
   * Abandon a stroke in progress without committing it.
   *
   * The offscreen buffer goes with it. On an A0 sheet that buffer is a hundred
   * megabytes, and a pinch that cancelled a stroke used to leave it allocated
   * until the next one started — which on a phone is exactly the machine that
   * can least afford it.
   */
  const cancelStroke = useCallback(() => {
    drawing.current = null;
    moving.current = null;
    stagePan.current = null;
    if (liveFrame.current) { cancelAnimationFrame(liveFrame.current); liveFrame.current = 0; }
    releaseLiveBuffer();
    const c = liveRef.current;
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  }, []);

  const preset = toolById(tool);
  const backendReady = isUploadBackendConfigured();

  /**
   * Every control size, from the one factor.
   *
   * Written as helpers rather than sprinkled multiplications so that adding a
   * button later means reaching for `ui.btn` and `ui.icon`, and it comes out
   * the right size on the wall without anybody remembering to think about it.
   */
  /**
   * The host's factor (the wallboard passes one) times THIS MACHINE's own
   * setting from app settings — per-machine, localStorage, never synced,
   * because the touchscreen's giant buttons must not arrive on every desk.
   */
  const markupPref = useMarkupScale();
  const ts = Math.max(1, Math.min(2.2, (touchScale || 1) * markupPref));
  const ui = useMemo(() => ({
    on: ts > 1.02,
    rail: Math.round(62 * ts),
    btn: Math.round(50 * ts),
    padY: Math.round(6 * ts),
    icon: Math.round(16 * ts),
    smallIcon: Math.round(14 * ts),
    label: +(8.5 * ts).toFixed(1),
    text: +(12 * ts).toFixed(1),
    gap: Math.round(4 * ts),
    /** Padding for the top-bar buttons, which are shaped by class not size. */
    barPad: `${Math.round(6 * ts)}px ${Math.round(9 * ts)}px`,
  }), [ts]);

  /**
   * An icon button a finger can actually hit.
   *
   * `p-1.5` around a 14px icon is a 26px target. The line everybody works to
   * is 32, and a header button is pressed while holding a phone one-handed, so
   * these go to 38 — bought with padding rather than a bigger icon, so the row
   * looks the same and only the box around it grows. The desk keeps its own
   * size to the pixel.
   */
  const iconBtn = compact
    ? 'rounded-lg flex items-center justify-center flex-shrink-0 min-w-[38px] min-h-[38px]'
    : 'p-1.5 rounded-lg';

  /**
   * A slider a finger can catch.
   *
   * `.ink-slider` sets the ELEMENT to 4px tall — the thumb hangs out of it — so
   * the box a tap has to land inside is four pixels, and the width control was
   * a matter of luck with a finger. Padding grows the element to 22 and the
   * coloured track is clipped back to the content box, so the bar looks
   * identical to the pixel and only the hit area changes. Tailwind's preflight
   * already puts everything in border-box, so the height is the outside.
   */
  const touchSlider: React.CSSProperties = compact
    ? { height: 22, paddingTop: 9, paddingBottom: 9, backgroundClip: 'content-box' }
    : {};

  /**
   * Read-only until somebody says who they are.
   *
   * The wallboard is the shared screen in the office, so "the office" is not an
   * answer to who marked a plan up. It stays inert until a name is chosen, and
   * from then on it behaves like any other machine.
   */
  const locked = readOnly || (askWho && !who);

  /** The pen shows the size it will draw at; the eraser shows what it will take. */
  const isEraser = tool === 'eraser' || tool === 'eraser-object';
  const showNib = !locked && (preset.freehand || isEraser);
  const nibPx = Math.max(4, width * ((liveRef.current?.width ?? 1000) / REF)
    / Math.max(0.05, window.devicePixelRatio || 1));
  const parentFolderId = driveFolderUrl ? extractFolderId(driveFolderUrl) : null;

  /** Every saved version of THIS plan, newest first. */
  const versions = useMemo(
    () => planAnnotations
      .filter(a => a.apartmentId === apartmentId && a.planFileId === planFileId)
      .sort((a, b) => b.version - a.version),
    [planAnnotations, apartmentId, planFileId],
  );
  const nextVersion = (versions[0]?.version ?? 0) + 1;
  /**
   * Which version's ink is ON THE SHEET right now — the green connector line
   * points from its rail button to the plan, so "what am I looking at" is
   * answered visually (the owner's two-connected-nodes ask). Null = a blank
   * sheet with no version begun.
   */
  const [linkedVersion, setLinkedVersion] = useState<number | null>(initialWork?.sketchVersion ?? null);
  /**
   * Versions whose Drive file turned out to be GONE — deleted by hand in
   * Drive. Their dot greys, because a green dot over a deleted file is a lie
   * (the owner deleted v1 and the dot stayed green).
   */
  const [deadFiles, setDeadFiles] = useState<Set<string>>(new Set());
  const versionsRef = useRef(versions);
  versionsRef.current = versions;
  /**
   * One honest look at what Drive really holds, when the studio opens: the
   * Annotated Plans listing is fetched once and any version whose file is not
   * in it goes grey. The CURRENT sketch's record is left alone — a file
   * stamped seconds ago can lag out of Drive's own listing, and marking it
   * dead would call a fresh save deleted.
   */
  useEffect(() => {
    if (!isUploadBackendConfigured() || !plansFolderId) return;
    let gone = false;
    (async () => {
      try {
        const { plans: inDrive } = await listPlansViaBackend(plansFolderId);
        if (gone) return;
        const have = new Set(inDrive.map(p => p.id));
        const dead = new Set<string>();
        for (const v of versionsRef.current) {
          if (v.driveFileId && v.id !== versionIdRef.current && !have.has(v.driveFileId)) {
            dead.add(v.driveFileId);
          }
        }
        setDeadFiles(prev =>
          prev.size === dead.size && [...dead].every(d => prev.has(d)) ? prev : dead);
      } catch { /* unreachable Drive proves nothing — the dots stand */ }
    })();
    return () => { gone = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansFolderId]);

  /**
   * The connector line: the OPEN version's rail button to the plan's left
   * edge, a fifth of the way down — two nodes joined, so which version the
   * sheet is showing is a picture rather than a highlight you have to notice.
   * Re-drawn (with its little grow animation, keyed on the version) whenever
   * the version changes; re-measured on a slow tick because the rail scrolls
   * and the sheet zooms, and one pair of rects a second is free.
   */
  const [vlink, setVlink] = useState<{ d: string; x2: number; y2: number } | null>(null);

  /**
   * The four ink tools live behind ONE rail tile (the owner's consolidation).
   * `inkTool` is the pen currently in the hand; pressing the tile when it is
   * already armed opens the PEN TRAY — four drawn pens, the chosen one lifted,
   * the Samsung Notes manner. Hotkeys (p/n/m/h) still pick directly and move
   * the tile with them.
   */
  const [inkTool, setInkTool] = useState<string>('pen');
  const [penTray, setPenTray] = useState<{ x: number; y: number; up: boolean } | null>(null);
  /** The shape in the Shapes tile's hand — line, arrow, box or circle. */
  const [shapeTool, setShapeTool] = useState<string>('line');
  const [shapeTray, setShapeTray] = useState<{ x: number; y: number; up: boolean } | null>(null);
  /**
   * Neat shapes — the Samsung Notes idea: while this is on, a freehand stroke
   * that plainly meant a shape (a line, a box, a circle, a triangle, a star,
   * a heart) is replaced on pen-lift by the clean version in the same ink.
   * Per machine, like every studio comfort setting.
   */
  const [shapeSnap, setShapeSnap] = useState<boolean>(() => {
    try { return localStorage.getItem('plan_shape_snap') !== '0'; } catch { return true; }
  });
  const toggleShapeSnap = useCallback(() => {
    setShapeSnap(v => {
      try { localStorage.setItem('plan_shape_snap', v ? '0' : '1'); } catch { /* private mode */ }
      return !v;
    });
  }, []);
  useEffect(() => {
    if (compact || linkedVersion == null) { setVlink(null); return; }
    const measure = () => {
      const root = rootRef.current;
      const btn = root?.querySelector('[data-version-active]');
      const sheet = pdfRef.current;
      if (!root || !btn || !sheet) { setVlink(null); return; }
      const rr = root.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      const sr = sheet.getBoundingClientRect();
      if (br.height < 4 || sr.width < 40) { setVlink(null); return; }
      // Rounded endpoints, so a sub-pixel re-measure cannot rewrite the path.
      const x1 = Math.round(br.right - rr.left - 4);
      const y1 = Math.round(br.top - rr.top + 8);                  // from the dot
      const x2 = Math.round(Math.max(x1 + 24, sr.left - rr.left)); // to the plan's edge
      const y2 = Math.round(sr.top - rr.top + sr.height * 0.2);    // 20% down the sheet
      const d = scribblePath(x1, y1, x2, y2, linkedVersion ?? 1);
      setVlink(prev => (prev && prev.d === d ? prev : { d, x2, y2 }));
    };
    measure();
    const iv = setInterval(measure, 1000);
    window.addEventListener('resize', measure);
    return () => { clearInterval(iv); window.removeEventListener('resize', measure); };
  }, [linkedVersion, compact, scale, page]);

  // ---- load the PDF ------------------------------------------------------
  useEffect(() => {
    let dead = false;
    setDoc(null); setLoadErr('');
    setGot({ bytes: 0, total: null });
    // Through the cache: a plan already downloaded in the background — or by
    // another tab — opens with no wait at all.
    fetchPlanCached(planFileId, (bytes, total) => { if (!dead) setGot({ bytes, total }); })
      .then(async buf => {
        /**
         * A picture is drawn as a one-page document.
         *
         * pdf.js is given PDFs; an image is decoded and wrapped in the same
         * shape — one page, a viewport, a render onto the canvas — so
         * everything downstream (the ink layers, the zoom, the versions, the
         * saving) works on a photograph without knowing it is one.
         */
        const bytes = new Uint8Array(buf);
        // The FILE says whether it is a picture, not a list it might not be
        // in: a plan chosen out of another folder never appears in `plans`, so
        // asking that list left the layer switches offered on a photograph.
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
        if (!dead) setLoadedIsImage(!isPdf);
        if (isPdf) return pdfjs.getDocument({ data: bytes }).promise as unknown as PdfDoc;
        const blob = new Blob([bytes]);
        const bmp = await createImageBitmap(blob);
        return imageAsDoc(bmp);
      })
      .then(d => { if (!dead) { drawnAt.current = null; setDoc(d as unknown as PdfDoc); setPage(0); } })
      .catch(e => { if (!dead) setLoadErr(e instanceof Error ? e.message : String(e)); });
    return () => { dead = true; };
  }, [planFileId]);

  // ---- render the page ---------------------------------------------------
  const renderPage = useCallback(async () => {
    if (!doc || !pdfRef.current) return;
    const p = await doc.getPage(page + 1);

    // The WHOLE page fits on first sight, not just its width. A construction
    // drawing at 100% is unusable on any screen, and fitting the width alone
    // still left an A0 sheet taller than the stage — so it opened with a scroll
    // bar and you could not see what you were about to mark up.
    const natVp = p.getViewport({ scale: 1 });
    setNat({ w: natVp.width, h: natVp.height });

    let s = raster;
    if (stageRef.current) {
      // The margin the stage keeps round the sheet — 16px a side at the desk,
      // 4px on a phone, where sixteen of them is four per cent of the screen
      // spent on nothing.
      const pad = compact ? 8 : 32;
      const availW = stageRef.current.clientWidth - pad;
      const availH = stageRef.current.clientHeight - pad;
      // The zoom-out floor is measured HERE, whether or not a fit was asked
      // for — the buttons and the pinch clamp against it and they need it
      // current after every resize, page turn and rotation.
      fitScaleRef.current = Math.max(0.05, Math.min(4,
        Math.min(availW / natVp.width, availH / natVp.height)));
      if (fitting) {
        s = Math.max(0.1, fitScaleRef.current);
        setScale(s); setRaster(s); setFitting(false);
      }
    }

    // Nothing to redraw if the page is already on screen at this resolution.
    // Without this, fitting on open renders the sheet twice — once from the fit
    // and once when `raster` catches up to the number the fit just chose.
    if (drawnAt.current && drawnAt.current.page === page
      && Math.abs(drawnAt.current.s - s) < 0.001) return;

    const vp = p.getViewport({ scale: s });
    setSheetWide(vp.width > vp.height * 1.1);
    /**
     * Always ABOVE the screen's own resolution, never merely equal to it.
     *
     * It used to take the device ratio as it found it, which on an ordinary
     * desktop monitor is 1 — so the sheet was drawn at exactly the pixels it
     * occupied and every look closer, every nudge of the zoom before the redraw
     * catches up, was a soft grey smear. Two is the floor now; the cap is an
     * AREA, because an A0 sheet at 400% times three is a canvas the browser
     * simply refuses to allocate, and a refused canvas is a blank plan.
     */
    const MAX_PIXELS = 32e6;
    const want = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
    const area = vp.width * vp.height;
    const dpr = Math.max(1, Math.min(want, Math.sqrt(MAX_PIXELS / Math.max(1, area))));
    const w = Math.round(vp.width), h = Math.round(vp.height);
    // The CSS size follows the LAYOUT scale, which may already have moved past
    // the one being drawn — that is the whole point of the split.
    const cssW = Math.round(natVp.width * scaleRef.current);
    const cssH = Math.round(natVp.height * scaleRef.current);

    /**
     * The live layer is drawn at a LOWER resolution than the plan.
     *
     * The plan and the committed ink want every pixel the screen can show — a
     * construction drawing is read by zooming into it. The live layer is the
     * stroke under your hand for the half-second before you lift it, and it is
     * thrown away and redrawn properly the moment you do. Carrying it at the
     * full device ratio means blitting a 15-megapixel canvas on every frame of
     * every stroke: measured at 36ms a frame on an A0 sheet, against 7ms at
     * this ratio. The CSS size is identical, so nothing moves and nothing
     * misaligns — the ink is very slightly softer while the pen is down.
     */
    const LIVE_DPR = Math.min(dpr, 1.5);

    /**
     * Drawn OFF-SCREEN, then put up in one go.
     *
     * Setting a canvas's width clears it, so resizing the visible one and then
     * waiting for pdf.js is a white flash the length of the render. The page is
     * drawn into a canvas nobody can see and blitted across when it is finished,
     * which is why the plan never blinks any more.
     */
    renderTask.current?.cancel();
    const off = document.createElement('canvas');
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const octx = off.getContext('2d')!;
    const task = p.render({
      canvasContext: octx,
      viewport: p.getViewport({ scale: s * dpr }),
      // Draw with whatever layers are switched on.
      ...(ocRef.current ? { optionalContentConfigPromise: Promise.resolve(ocRef.current) } : {}),
    });
    renderTask.current = task;
    try { await task.promise; } catch { return; /* superseded by a newer render */ }

    for (const c of [pdfRef.current, inkRef.current, liveRef.current]) {
      if (!c) continue;
      const k = c === liveRef.current ? LIVE_DPR : dpr;
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    // The tab can be closed — or swapped for another — while the render
    // above was awaited; the canvas is gone with it, and blitting into null
    // was a crash the tab churn of the + chooser made easy to hit.
    if (!pdfRef.current) return;
    const ctx = pdfRef.current.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(off, 0, 0);
    drawnAt.current = { page, s };
    redrawInk();
  }, [doc, page, raster, fitting, compact]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The zoom itself: pure layout, no drawing.
   *
   * The canvases keep whatever bitmap they have and are simply given a new CSS
   * size, so a zoom step costs one style write instead of a full re-render.
   * The scroll correction that keeps the point under the pointer still lives
   * with the size change, because it has to read the new scrollWidth.
   */
  useLayoutEffect(() => {
    if (!nat) return;
    const cssW = Math.round(nat.w * scale);
    const cssH = Math.round(nat.h * scale);
    for (const c of [pdfRef.current, inkRef.current, liveRef.current]) {
      if (!c) continue;
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    /**
     * A pinch that just ended leaves its gesture transform on the sheet
     * until THIS moment — a layout effect, so the transform comes off, the
     * new size goes on and the anchor scroll below all land before the
     * browser paints once. Cleared any earlier (in touchend), the screen
     * showed one frame of the old scale first: the blink at finger-lift.
     * It must come off BEFORE the rects below are measured, or the anchor
     * correction reads a transformed rect and scrolls to the wrong spot.
     */
    const wrap = sheetWrapRef.current;
    if (wrap && wrap.style.transform) { wrap.style.transform = ''; wrap.style.transformOrigin = ''; }
    const anchor = zoomAnchor.current;
    if (anchor && stageRef.current && pdfRef.current) {
      const el = stageRef.current;
      /**
       * The anchor is a fraction of the SHEET, so it is applied against the
       * sheet's own rect — measured fresh here, after the new CSS size above
       * has taken effect. Working in fractions of the scroller was wrong in
       * the commonest case: a fitted sheet is SMALLER than the stage and
       * flex-centred in it, so `scrollLeft + cx` was measuring blank stage,
       * and the first several zoom steps went to the middle instead of the
       * point under the mouse — "it doesn't zoom to where the mouse is".
       */
      const er = el.getBoundingClientRect();
      const sr = pdfRef.current.getBoundingClientRect();
      const offX = sr.left - er.left + el.scrollLeft;
      const offY = sr.top - er.top + el.scrollTop;
      el.scrollLeft = offX + anchor.fx * sr.width - anchor.cx;
      el.scrollTop = offY + anchor.fy * sr.height - anchor.cy;
      zoomAnchor.current = null;
    }
  }, [nat, scale]);

  useEffect(() => { void renderPage(); }, [renderPage]);

  /** The live `compact`, for the listeners below, which are registered once. */
  const compactRef = useRef(compact);
  compactRef.current = compact;

  // Re-fit when the STAGE changes shape — watched on the stage itself, not
  // the window. The window listener this replaces missed every resize that
  // happens without the window moving: the drawer's side pane narrowing when
  // the sheet's measured ratio lands, or when the modal's screen cap bites —
  // which left an already-fitted sheet wider than its pane, clipped at the
  // modal's edge (the owner's Fold screenshot). A window resize still lands
  // here too, because the stage resizes with it.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      // Damped: sub-3px wobble (scrollbars, the width transition settling)
      // must not throw away a zoom somebody chose.
      const turned = Math.abs(w - last.w) > 3;
      const grew = Math.abs(h - last.h) > 3;
      if (!turned && !grew) return;
      last = { w, h };
      /**
       * On a phone the height changes for reasons that are not a resize: the
       * keyboard sliding up under a note, and the address bar collapsing as
       * the plan is scrolled. Re-fitting on those throws away the zoom
       * somebody chose — mid-sentence, in the keyboard's case. A rotation
       * changes the WIDTH, and that is the one that genuinely needs a new fit.
       */
      if (compactRef.current && !turned) return;
      setFitting(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * The wheel ALWAYS zooms the plan, and it zooms towards the pointer.
   *
   * It used to need Ctrl held down and otherwise scrolled, which on a drawing
   * is the wrong default twice over: scrolling a plan is rarely what you want,
   * and a wall panel has no Ctrl key at all. To look somewhere else you zoom
   * out and back in over there, which is one gesture instead of two.
   *
   * React's onWheel prop is passive in several browsers, where preventDefault()
   * silently does nothing and the BROWSER zooms the whole page instead — which
   * on a full-screen editor throws the layout apart. Registering by hand with
   * `{ passive: false }` is the only way to claim the gesture, and it is the
   * same lesson the job board learned.
   */
  /**
   * Remember which SHEET point sits under (clientX, clientY), so the zoom that
   * follows can put it back there. A fraction of the sheet, never of the
   * scroller: a fitted sheet is centred in a bigger stage, and a scroller
   * fraction there points at blank padding rather than at the drawing.
   */
  const anchorZoomAt = useCallback((clientX: number, clientY: number) => {
    const el = stageRef.current, sheet = pdfRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = clientX - r.left, cy = clientY - r.top;
    const sr = sheet?.getBoundingClientRect();
    if (!sr || sr.width <= 0 || sr.height <= 0) return;
    zoomAnchor.current = {
      fx: Math.min(1, Math.max(0, (clientX - sr.left) / sr.width)),
      fy: Math.min(1, Math.max(0, (clientY - sr.top) / sr.height)),
      cx, cy,
    };
  }, []);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    anchorZoomAt(clientX, clientY);
    setFitting(false);
    setScale(z => Math.min(6, Math.max(zoomFloor(), Math.round(z * factor * 100) / 100)));
  }, [anchorZoomAt, zoomFloor]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    function wheel(e: WheelEvent) {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  /**
   * Two fingers pinch AND drag, on the touch panel and on a phone.
   *
   * The dragging half is what makes a phone usable at all. With a drawing tool
   * armed one finger draws, so the only way to look at another part of the
   * sheet was to switch to the Pan tool and switch back — twice per mark. Two
   * fingers is the gesture every map and every photo on the machine already
   * uses, and it costs nothing here: the plan lives in a scroller, so a drag
   * is the midpoint's travel subtracted from the scroll.
   *
   * The pan is applied BEFORE the zoom anchor is taken, because the anchor is
   * read out of the scroll position — taking it first would zoom towards where
   * the fingers were a frame ago.
   *
   * The second finger also CANCELS whatever stroke the first one had started —
   * otherwise a pinch leaves a stray mark across the plan from wherever the
   * first finger happened to land.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    /**
     * ABSOLUTE, anchored at the first-touch centre — and, since the owner's
     * "still a tiny bit jumpy", drawn as a TRANSFORM while the fingers are
     * down. The previous version set the real scale on every touchmove: each
     * frame re-laid-out three canvases and wrote integer scroll positions,
     * and the residual rounding was the last of the jitter. Now the gesture
     * touches no layout at all — the sheet wrapper carries
     * `translate(midpoint travel) scale(k)` about the grabbed sheet point,
     * one compositor-only style write per move — and the REAL scale and
     * scroll are committed once, on the last finger leaving. The raster
     * re-sharpens right after, as it does for every zoom.
     */
    let base: {
      dist: number; scale: number; fx: number; fy: number;
      mx: number; my: number;
    } | null = null;
    let lastMid = { x: 0, y: 0 };
    let lastWant = 1;

    const gap = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });
    /** Which sheet point sits under (clientX, clientY) right now. */
    const sheetFraction = (x: number, y: number) => {
      const sr = pdfRef.current?.getBoundingClientRect();
      if (!sr || sr.width <= 0 || sr.height <= 0) return null;
      return {
        fx: Math.min(1, Math.max(0, (x - sr.left) / sr.width)),
        fy: Math.min(1, Math.max(0, (y - sr.top) / sr.height)),
      };
    };
    /** Put the snapshot's sheet point under the fingers, on the live layout. */
    const applyAnchor = (fx: number, fy: number, cx: number, cy: number) => {
      const sheet = pdfRef.current;
      if (!sheet) return;
      const er = el!.getBoundingClientRect();
      const sr = sheet.getBoundingClientRect();
      const offX = sr.left - er.left + el!.scrollLeft;
      const offY = sr.top - er.top + el!.scrollTop;
      el!.scrollLeft = offX + fx * sr.width - cx;
      el!.scrollTop = offY + fy * sr.height - cy;
    };

    function start(e: TouchEvent) {
      if (e.touches.length !== 2) return;
      cancelStroke();
      const m = mid(e.touches);
      const f = sheetFraction(m.x, m.y);
      base = f ? {
        dist: gap(e.touches), scale: scaleRef.current, fx: f.fx, fy: f.fy,
        mx: m.x, my: m.y,
      } : null;
      lastMid = m;
      lastWant = scaleRef.current;
      setFitting(false);
    }
    function move(e: TouchEvent) {
      if (e.touches.length !== 2 || !base) return;
      e.preventDefault();
      const m = mid(e.touches);
      const d = gap(e.touches);
      const want = base.dist >= 8
        ? Math.min(6, Math.max(zoomFloor(), base.scale * (d / base.dist)))
        : base.scale;
      lastMid = m;
      lastWant = want;
      const w = sheetWrapRef.current;
      if (!w) return;
      // Scaling about the grabbed sheet point holds it at its layout spot;
      // the translate then carries it under the live midpoint. No layout, no
      // scroll, no React — one compositor write.
      w.style.transformOrigin = `${base.fx * 100}% ${base.fy * 100}%`;
      w.style.transform =
        `translate(${m.x - base.mx}px, ${m.y - base.my}px) scale(${want / base.scale})`;
    }
    function end(e: TouchEvent) {
      if (e.touches.length >= 2 || !base) return;
      const er = el!.getBoundingClientRect();
      const cx = lastMid.x - er.left, cy = lastMid.y - er.top;
      /**
       * Committed EXACTLY, not to a whole per-cent. Rounding to 1% moved a
       * 4000px sheet up to 20px the instant the fingers lifted — the last of
       * "still jumping a bit". Four decimals keeps floats tidy while staying
       * far below a pixel.
       */
      const exact = Math.round(lastWant * 1e4) / 1e4;
      if (exact !== scaleRef.current) {
        /**
         * The gesture's transform is deliberately LEFT ON here. Clearing it
         * now paints one frame at the old scale before the resize lands —
         * the visible blink at finger-lift. The layout effect that commits
         * the new size clears it in the same pre-paint breath, so the
         * gesture's last frame and the committed layout are one picture.
         */
        zoomAnchor.current = { fx: base.fx, fy: base.fy, cx, cy };
        setScale(exact);
      } else {
        // A pure two-finger PAN — no scale change, so the transform comes
        // off and the travel goes into the scroll in the same task: no
        // paint can slip between two synchronous writes.
        const w = sheetWrapRef.current;
        if (w) { w.style.transform = ''; w.style.transformOrigin = ''; }
        applyAnchor(base.fx, base.fy, cx, cy);
        zoomAnchor.current = null;
      }
      base = null;
    }

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The plan's OWN layers.
   *
   * A services drawing usually arrives with the architect's layers still in it,
   * and being able to switch the electrical off while marking up the ductwork is
   * the difference between a readable plan and a thicket. pdf.js exposes them
   * through the optional-content config — the same mechanism our own markup
   * layer uses.
   */
  useEffect(() => {
    if (!doc) { setLayers([]); return; }
    let dead = false;
    (async () => {
      try {
        const cfg = await (doc as unknown as { getOptionalContentConfig(): Promise<OcConfig> })
          .getOptionalContentConfig();
        // The order first, flattened; then every group the document declares,
        // in case the order is missing or names a subset. A plan that HAS
        // layers must never show none.
        const ids = flattenOrder(cfg.getOrder?.() ?? []);
        const all = cfg.getGroups?.() ?? {};
        for (const id of Object.keys(all)) if (!ids.includes(id)) ids.push(id);
        const rows = ids.map(id => ({
          id,
          name: cfg.getGroup?.(id)?.name ?? all[id]?.name ?? 'Layer',
          on: true,
        }));
        if (!dead) { ocRef.current = cfg; setLayers(rows); }
      } catch { if (!dead) setLayers([]); }
    })();
    return () => { dead = true; };
  }, [doc]);

  /**
   * Your marks, grouped into a layer per colour.
   *
   * Newest first, by when that colour was last used — the pass you are in the
   * middle of belongs at the top, and the numbering counts up from the oldest
   * so "layer 1" is where the markup started.
   */
  const [hiddenInk, setHiddenInk] = useState<Set<string>>(new Set());
  const inkLayers = useMemo(() => {
    const by = new Map<string, { colour: string; count: number; last: number }>();
    strokes.forEach((st, i) => {
      const key = (st.color ?? '#000').toLowerCase();
      const row = by.get(key) ?? { colour: key, count: 0, last: -1 };
      row.count += 1;
      row.last = Math.max(row.last, i);
      by.set(key, row);
    });
    return [...by.values()].sort((a, b) => b.last - a.last);
  }, [strokes]);

  /**
   * Every layer at once.
   *
   * A services drawing arrives with twenty of the architect's layers on it, and
   * the way somebody uses this is "off with the lot, then back on with the one
   * I need" — twenty presses to ask one question. `drawnAt` is cleared for the
   * same reason a single toggle clears it: what is drawn ON the page changed
   * even though the page and its resolution did not.
   */
  function setAllLayers(on: boolean) {
    const cfg = ocRef.current;
    if (!cfg) return;
    setLayers(prev => {
      const next = prev.map(l => ({ ...l, on }));
      for (const l of next) {
        try { cfg.setVisibility?.(l.id, on); } catch { /* older build */ }
      }
      return next;
    });
    drawnAt.current = null;
    setTimeout(() => void renderPage(), 0);
  }

  function toggleLayer(id: string) {
    const cfg = ocRef.current;
    if (!cfg) return;
    setLayers(prev => {
      const next = prev.map(l => (l.id === id ? { ...l, on: !l.on } : l));
      const row = next.find(l => l.id === id);
      try { cfg.setVisibility?.(id, !!row?.on); } catch { /* older build */ }
      return next;
    });
    /**
     * Invalidate what is painted, THEN re-render.
     *
     * `renderPage` skips a redraw when the page and the resolution are already
     * on screen — which is exactly the case here, so switching a layer changed
     * the config and drew nothing at all. The guard is right for zooming and
     * wrong for this: what is drawn ON the page has changed even though the
     * page and its resolution have not.
     */
    drawnAt.current = null;
    setTimeout(() => void renderPage(), 0);
  }

  // ---- painting ---------------------------------------------------------
  // The drawing rule itself lives in paintStroke.ts, next to its twin in
  // api/plan-annotate.js. Change one, change both.

  const redrawInk = useCallback(() => {
    const c = inkRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes) {
      if (s.page !== page) continue;
      // A colour switched off in the layers panel is not drawn. It is still
      // there — hiding a layer is a way of looking, not a way of deleting —
      // so it saves, prints and stamps exactly as before.
      if (hiddenInk.has((s.color ?? '#000').toLowerCase())) continue;
      // The balloon being typed into draws EMPTY: its words are in the text box
      // sitting on top of it, and drawing them here as well shows them twice,
      // half a pixel apart, which reads as a rendering fault.
      paintStroke(ctx, c, s.id === textDraft?.forId ? { ...s, text: '' } : s);
    }
  }, [strokes, page, hiddenInk, textDraft?.forId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { redrawInk(); }, [redrawInk]);

  // autoFocus alone loses this race: the note box mounts while the pointer that
  // opened it is still finishing its press, and the canvas takes focus back.
  useEffect(() => {
    if (!textDraft) return;
    const t = setTimeout(() => textRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [textDraft?.nx, textDraft?.ny]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The picked mark's outline and its two corner grips.
   *
   * Drawn on the live layer, which is cleared and redrawn constantly anyway, so
   * showing a selection costs nothing and never has to be erased by hand.
   */
  function drawPicked() {
    const c = liveRef.current;
    const s = strokes.find(x => x.id === picked);
    if (!c || !s || s.page !== page) return;
    const ctx = c.getContext('2d')!;
    const grips = gripsOf(s);
    if (!grips.length) return;

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(74,168,216,.9)';
    ctx.lineWidth = Math.max(1, c.width / 900);
    const x0 = Math.min(grips[0].x, grips[1].x) * c.width;
    const x1 = Math.max(grips[0].x, grips[1].x) * c.width;
    const y0 = Math.min(grips[0].y, grips[1].y) * c.height;
    const y1 = Math.max(grips[0].y, grips[1].y) * c.height;
    ctx.strokeRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
    ctx.setLineDash([]);

    for (const g of grips) {
      ctx.beginPath();
      ctx.arc(g.x * c.width, g.y * c.height, Math.max(5, c.width / 150), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = Math.max(1.5, c.width / 700);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Keep the selection drawn as it moves, and take it away when nothing is picked.
  useEffect(() => {
    if (tool !== 'move') return;
    clearLive();
    drawPicked();
  }); // no deps — it must follow every stroke and pick change

  /**
   * How far apart two live samples have to be to be worth keeping, in device
   * pixels. Below this they are indistinguishable on screen.
   */
  const LIVE_MIN_STEP_PX = 1.5;

  /**
   * Drawing a long stroke without the screen locking up.
   *
   * The rule that makes a mark correct — ONE path, filled ONCE, so it cannot
   * darken against itself — is also what made it slow: rebuilding an
   * ever-growing path on every frame is O(points) a frame and O(points²) over
   * a stroke. Measured on an A0 sheet at full resolution, a twenty-second
   * scribble reaches 4,000-odd points, where a single redraw costs 85-120ms.
   * That is the freeze, and it was my doing.
   *
   * The way to keep both: an offscreen buffer holding the stroke SO FAR, drawn
   * at full opacity, and only the NEW points added to it each frame. Overlap
   * inside the buffer is free — the same colour at full opacity painted twice
   * is the same colour — so the tail can safely re-cover its last point and
   * leave no seam. The buffer is then put on screen in one go, at the stroke's
   * real opacity and blend, which is the single composite the rule demands.
   *
   * Per frame that is O(new points), a handful, plus one image blit. The buffer
   * exists only while the pen is down and is released on lift, so a big plan
   * does not carry a fourth full-size canvas around for the rest of the session.
   */
  const liveBuf = useRef<HTMLCanvasElement | null>(null);
  const bufDrawn = useRef(0);
  const liveFrame = useRef(0);

  function startLiveBuffer() {
    const c = liveRef.current;
    if (!c) return;
    const b = liveBuf.current ?? document.createElement('canvas');
    if (b.width !== c.width || b.height !== c.height) { b.width = c.width; b.height = c.height; }
    else b.getContext('2d')!.clearRect(0, 0, b.width, b.height);
    liveBuf.current = b;
    bufDrawn.current = 0;
  }

  function releaseLiveBuffer() {
    const b = liveBuf.current;
    if (!b) return;
    // Zero it out rather than just dropping the reference: a canvas keeps its
    // backing store alive until it is resized, and on an A0 page that is a
    // hundred megabytes.
    b.width = 0; b.height = 0;
    liveBuf.current = null;
    bufDrawn.current = 0;
  }

  /** One redraw per animation frame, however many samples arrived. */
  const scheduleLiveDraw = useCallback(() => {
    if (liveFrame.current) return;
    liveFrame.current = requestAnimationFrame(() => {
      liveFrame.current = 0;
      const d = drawing.current;
      const c = liveRef.current;
      const b = liveBuf.current;
      if (!d || !c || !b || !b.width) return;

      // Add only what is new, starting one point back so the join is covered.
      const from = Math.max(0, bufDrawn.current - 1);
      if (d.pts.length - from >= 2) {
        const tail = d.pts.slice(from);
        const bctx = b.getContext('2d')!;
        paintStroke(bctx, b, {
          ...draftStrokeRef.current(tail, d.tool),
          // Opaque, and never multiply, INSIDE the buffer. The opacity and the
          // blend belong to the one composite that puts it on screen.
          opacity: 1,
          tool: (d.tool === 'highlighter' ? 'marker' : d.tool) as AnnTool,
        });
        bufDrawn.current = d.pts.length;
      }

      const ctx = c.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.globalAlpha = opacityRef.current;
      ctx.globalCompositeOperation = d.tool === 'highlighter' ? 'multiply' : 'source-over';
      ctx.drawImage(b, 0, 0);
      ctx.restore();
    });
  }, []);

  /** The frame callback is registered once, so live values come through refs. */
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  useEffect(() => () => {
    if (liveFrame.current) cancelAnimationFrame(liveFrame.current);
    releaseLiveBuffer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function clearLive() {
    if (liveFrame.current) { cancelAnimationFrame(liveFrame.current); liveFrame.current = 0; }
    releaseLiveBuffer();
    const c = liveRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
  }

  // ---- pointer -----------------------------------------------------------

  function norm(e: { clientX: number; clientY: number }) {
    const c = liveRef.current!;
    const r = c.getBoundingClientRect();
    return {
      nx: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      ny: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  /**
   * How near counts as "on it", for the tool that picks things up.
   *
   * The mark radii below are mouse radii: 1.2% of the page, which on a phone
   * showing a whole A3 sheet is four pixels. A fingertip covers forty. So with
   * a finger the move tool could not pick anything up at all and the corner
   * grips could not be grabbed — you were aiming at something you could not
   * see with something you could not aim. A touch therefore gets whichever is
   * larger, the mark's own radius or a finger's worth of the page; a mouse and
   * a pen are left exactly as they were, since they can aim.
   */
  const TAP_SLOP_PX = 20;
  function tapRadius(e: { pointerType?: string }, base: number): number {
    if (e.pointerType !== 'touch') return base;
    const c = liveRef.current;
    const cssW = c ? (parseFloat(c.style.width) || c.width || 1000) : 1000;
    return Math.max(base, TAP_SLOP_PX / Math.max(1, cssW));
  }

  /**
   * Is this point on this mark?
   *
   * The old eraser only compared against the mark's stored POINTS, which for a
   * freehand squiggle is every millimetre of it and for a straight line, an
   * arrow, a box or a circle is just the two corners. So lines could not be
   * rubbed out except by hitting one of their ends exactly, and a box was
   * erasable only at two opposite corners. Each kind is now tested as the shape
   * it actually is.
   */
  function hits(s: AnnStroke, nx: number, ny: number, r: number): boolean {
    const p = s.pts;
    if (p.length < 2) return false;
    const ax = p[0], ay = p[1];
    const zx = p[p.length - 3], zy = p[p.length - 2];

    if (s.tool === 'text') {
      // Its box hangs down-right of the anchor.
      const w = Math.max(0.05, (s.text ?? '').length * (s.fontSize ?? 16) * 0.5 / REF);
      const h = ((s.fontSize ?? 16) * 1.4) / REF;
      return nx > ax - r && nx < ax + w + r && ny > ay - r && ny < ay + h + r;
    }
    if (s.tool === 'rect' || s.tool === 'bubble') {
      const x0 = Math.min(ax, zx) - r, x1 = Math.max(ax, zx) + r;
      const y0 = Math.min(ay, zy) - r, y1 = Math.max(ay, zy) + r;
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) return false;
      if (s.tool === 'bubble') return true;              // filled, so anywhere inside
      const inx = Math.min(ax, zx) + r, inX = Math.max(ax, zx) - r;
      const iny = Math.min(ay, zy) + r, inY = Math.max(ay, zy) - r;
      return !(nx > inx && nx < inX && ny > iny && ny < inY);   // the outline only
    }
    if (s.tool === 'ellipse') {
      const cx = (ax + zx) / 2, cy = (ay + zy) / 2;
      const rx = Math.abs(zx - ax) / 2 || 1e-4, ry = Math.abs(zy - ay) / 2 || 1e-4;
      const d = Math.hypot((nx - cx) / rx, (ny - cy) / ry);
      return Math.abs(d - 1) < r / Math.min(rx, ry) + 0.12;
    }
    if (s.tool === 'line' || s.tool === 'arrow') return nearSegment(nx, ny, ax, ay, zx, zy) < r;

    // Freehand: near any segment of the path, not merely near a stored point —
    // a fast stroke's points can be far apart.
    for (let i = 0; i + 4 < p.length; i += 3) {
      if (nearSegment(nx, ny, p[i], p[i + 1], p[i + 3], p[i + 4]) < r) return true;
    }
    return Math.hypot(ax - nx, ay - ny) < r;
  }

  /**
   * Erase.
   *
   * Two tools, because the two jobs are genuinely different and doing both with
   * one is what made the old one frustrating:
   *
   *  - "Erase whole" takes the entire mark you touch. That is what you want for
   *    a box, an arrow, or a squiggle you have finished with.
   *  - "Eraser" takes only the part you pass over, like a real one. A freehand
   *    stroke is cut where you rub and the two halves stay, so you can clean up
   *    the end of a line without losing the line.
   *
   * A box, a circle, a balloon or a note has no meaningful half, so the normal
   * eraser takes those whole as well rather than pretending otherwise. A plain
   * line does split, since half a line is still a line — but an arrow does not,
   * because the half without the head is no longer an arrow.
   */
  const SPLITTABLE = new Set(['pen', 'pencil', 'marker', 'highlighter', 'line']);

  function eraseAt(nx: number, ny: number, whole: boolean) {
    const radius = (width / REF) * 0.55 + 0.004;

    if (whole) {
      let hit = false;
      for (const s of strokes) {
        if (s.page !== page || erased.current.has(s.id)) continue;
        if (hits(s, nx, ny, radius)) { erased.current.add(s.id); hit = true; }
      }
      if (hit) setStrokes(prev => prev.filter(s => !erased.current.has(s.id)));
      return;
    }

    let changed = false;
    const next: AnnStroke[] = [];
    for (const s of strokes) {
      if (s.page !== page || !hits(s, nx, ny, radius)) { next.push(s); continue; }
      if (!SPLITTABLE.has(s.tool)) { changed = true; continue; }        // taken whole

      // A straight line is only two stored points, so rubbing its middle would
      // do nothing visible. Walk it at the eraser's own resolution instead, and
      // the pieces that survive come back as lines.
      const src = s.tool === 'line' ? densify(s.pts, radius / 2) : s.pts;

      const runs: number[][] = [];
      let run: number[] = [];
      for (let i = 0; i + 2 < src.length; i += 3) {
        if (Math.hypot(src[i] - nx, src[i + 1] - ny) < radius) {
          if (run.length >= 6) runs.push(run);
          run = [];
        } else {
          run.push(src[i], src[i + 1], src[i + 2]);
        }
      }
      if (run.length >= 6) runs.push(run);

      changed = true;
      runs.forEach((pts, i) => next.push({
        ...s,
        // Freehand from here on: what is left of a rubbed line is a polyline,
        // and an arrow head or a snap would be wrong on it.
        tool: s.tool === 'line' ? 'pen' : s.tool,
        id: `${s.id}~${i}`,
        pts,
      }));
    }
    if (changed) setStrokes(next);
  }

  /** Add points along a two-point mark so it can be rubbed anywhere along it. */
  function densify(pts: number[], step: number): number[] {
    if (pts.length < 6) return pts;
    const out: number[] = [];
    for (let i = 0; i + 5 < pts.length; i += 3) {
      const [ax, ay, aw, bx, by] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4]];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1e-4, step)));
      for (let k = 0; k < n; k++) out.push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, aw);
    }
    out.push(pts[pts.length - 3], pts[pts.length - 2], pts[pts.length - 1]);
    return out;
  }

  /**
   * Where a balloon's words sit, as percentages of the plan.
   *
   * The balloon IS the text box now — you type inside it rather than into a
   * pop-up that appears somewhere else and then teleports its words into the
   * shape. That only works if the box is in EXACTLY the place the renderer will
   * draw the text, so both sides go through bubbleTextBox() and this converts
   * its answer into the percentages the overlay needs.
   *
   * The x and y fractions are measured against different dimensions, so the
   * padding has to be converted twice — using one for both is what would make
   * the box drift on a landscape sheet.
   */
  function bubbleBox(s: AnnStroke) {
    const c = liveRef.current;
    const aspect = c && c.height ? c.width / c.height : 1.414;
    const dpr = c ? c.width / Math.max(1, parseFloat(c.style.width) || c.width) : 1;
    const last = s.pts.length - 3;
    const x0 = Math.min(s.pts[0], s.pts[last]), x1 = Math.max(s.pts[0], s.pts[last]);
    const y0 = Math.min(s.pts[1], s.pts[last + 1]), y1 = Math.max(s.pts[1], s.pts[last + 1]);
    const baseX = Math.max(0.5, s.width) / REF;
    const baseY = baseX * aspect;
    const tail = Math.min(baseY * 8, (y1 - y0) * 0.32);
    const box = bubbleTextBox(x0, y0, x1 - x0, y1 - tail - y0, baseX);
    // bubbleTextBox pads both axes with the x-based figure; correct the y one.
    const padY = baseY * 4, padX = baseX * 4;
    return {
      left: box.x * 100,
      top: (y0 + padY) * 100,
      width: box.w * 100,
      height: Math.max(0.02, (y1 - tail - y0 - padY * 2)) * 100,
      /** CSS pixels, so the typed words are the size the drawn ones will be. */
      fontPx: Math.max(7, (s.fontSize ?? 15) * ((c?.width ?? REF) / REF)) / dpr,
      padX, padY,
    };
  }

  /**
   * The two corners of the picked mark, in normalised coordinates.
   *
   * Only marks stored as two points have corners; a freehand squiggle has
   * hundreds and dragging one of them would deform it rather than resize it.
   */
  const GRIPPABLE = new Set(['bubble', 'rect', 'ellipse', 'line', 'arrow']);
  function gripsOf(s: AnnStroke | undefined): { id: 'a' | 'z'; x: number; y: number }[] {
    if (!s || !GRIPPABLE.has(s.tool) || s.pts.length < 6) return [];
    const last = s.pts.length - 3;
    return [
      { id: 'a', x: s.pts[0], y: s.pts[1] },
      { id: 'z', x: s.pts[last], y: s.pts[last + 1] },
    ];
  }

  function handleAt(nx: number, ny: number, r = 0.014): 'a' | 'z' | null {
    const s = strokes.find(x => x.id === picked);
    for (const g of gripsOf(s)) {
      if (Math.hypot(g.x - nx, g.y - ny) < r) return g.id;
    }
    return null;
  }

  /** The mark under a point, topmost first — what the move tool picks up. */
  function markAt(nx: number, ny: number, r = 0.012): AnnStroke | null {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      if (s.page !== page) continue;
      if (hits(s, nx, ny, r)) return s;
    }
    return null;
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (locked || tool === 'pan') return;

    /**
     * The hand holding the pencil.
     *
     * Resting a palm on the glass is how people write, so it arrives on nearly
     * every stroke — and about half the time it lands FIRST, which is exactly
     * the case the old "ignore the second contact" rule could not cover: the
     * palm claimed the stroke and the nib was then turned away as the second
     * contact. A pen coming down now disowns a touch that began moments ago,
     * and a finger is ignored outright while a pen is in play.
     */
    notePointer(e.nativeEvent);
    lastPointerType.current = e.pointerType || 'mouse';
    if (isPalm(e.nativeEvent)) return;
    if (isPen(e.nativeEvent) && drawing.current && touchWasPalm()) {
      drawing.current = null;
      releaseLiveBuffer();
      clearLive();
    }

    const { nx: dnx, ny: dny } = norm(e);

    // The move tool picks something up rather than laying something down.
    if (tool === 'move') {
      // A corner of whatever is already picked resizes it. Checked before the
      // hit test, or grabbing a handle would simply select what is underneath.
      const grip = handleAt(dnx, dny, tapRadius(e, 0.014));
      if (grip) {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        const s = strokes.find(x => x.id === picked)!;
        moving.current = { id: s.id, nx: dnx, ny: dny, pts: [...s.pts], grip };
        return;
      }
      const hit = markAt(dnx, dny, tapRadius(e, 0.012));
      /**
       * A finger has no double-click.
       *
       * Retyping a balloon was a double-click, and two quick taps do not
       * reliably reach the page as one — the phone reserves the gesture for
       * zooming — so on a phone your own words could not be got back at. The
       * touch rule is the one the board already uses and the one every phone
       * uses: tap to pick it out, tap the picked one to open it. It has to be
       * read HERE, before the next line picks the mark, or the answer is
       * always yes and the first tap opens it, leaving no gesture that means
       * "I mean this one". A drag still moves it — see onUp.
       */
      const already = !!hit && picked === hit.id;
      setPicked(hit?.id ?? null);
      if (hit) {
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        moving.current = {
          id: hit.id, nx: dnx, ny: dny, pts: [...hit.pts],
          tapOpens: already && e.pointerType === 'touch' && hit.tool === 'bubble',
        };
      } else if (stageRef.current) {
        // Empty sheet under the hand: the drag pans. See stagePan.
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        stagePan.current = {
          x: e.clientX, y: e.clientY,
          sl: stageRef.current.scrollLeft, st: stageRef.current.scrollTop,
        };
      }
      return;
    }
    // A pen touching down should draw even if a palm lands too — ignore any
    // second contact once a pen stroke is running.
    if (drawing.current) return;
    const nx = dnx, ny = dny;

    if (tool === 'text') {
      setTextDraft({ nx, ny, value: '' });
      return;
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    e.preventDefault();

    if (isEraser) {
      erased.current = new Set();
      drawing.current = { pen: new PenStroke({ sensitivity: 0 }), pts: [], startedAt: Date.now() };
      eraseAt(nx, ny, tool === 'eraser-object');
      return;
    }

    // Flipping the pen over changes the tool, because that is what the pen is
    // for. See nibFlip().
    const drawWith = nibFlip(e.nativeEvent);
    const pre = toolById(drawWith);

    // A bare finger on a phone: its contact patch is the shape of the hand,
    // not the pressure of a nib. See PenOptions.finger.
    const pen = new PenStroke({
      sensitivity: pre.sensitivity * sens,
      finger: compact && e.pointerType === 'touch',
    });
    const s = pen.push(e.nativeEvent, performance.now());
    drawing.current = {
      pen, pts: [{ x: nx, y: ny, w: s.w }], startedAt: Date.now(), tool: drawWith,
    };
    if (pre.freehand) startLiveBuffer();
    setPenSource(pen.usedSource);
  }

  /**
   * The Samsung pen is double-ended: flip it and the highlighter comes up, flip
   * it back and you are on the pen again.
   *
   * The panel has no button and no pressure — the only thing it can tell us
   * about which end is down is the size of the contact patch, so NibWatch
   * learns the two sizes and reports which one this is.
   *
   * It only ever swaps between the INK tools. If you have deliberately picked
   * the arrow, or the eraser, or text, flipping the pen must not silently take
   * that away from you — and coming back from the fat nib returns you to the ink
   * tool you were actually using, not always to the pen.
   */
  function nibFlip(e: PointerEvent): string {
    if (locked || !INK_TOOLS.has(tool)) return tool;
    // The panel this is for is 75 or 86 inches across, so a phone-sized screen
    // is proof there is no dual-nib pen here — and a hand on its own produces
    // two contact sizes far enough apart to be read as a flip, which would
    // hand you the highlighter in the middle of a sentence.
    const nib = nibs.current.see(Math.max(e.width ?? 0, e.height ?? 0), { finger: compact });
    if (!nib) return tool;

    if (nib === 'fat' && tool !== FAT_NIB_TOOL) {
      thinNibTool.current = tool;
      setTool(FAT_NIB_TOOL);
      setWidth(toolById(FAT_NIB_TOOL).width);
      setOpacity(toolById(FAT_NIB_TOOL).opacity);
      if (!HIGHLIGHT_COLORS.includes(color)) setColor(HIGHLIGHT_COLORS[0]);
      return FAT_NIB_TOOL;
    }
    if (nib === 'thin' && tool === FAT_NIB_TOOL) {
      const back = thinNibTool.current;
      setTool(back);
      setWidth(toolById(back).width);
      setOpacity(toolById(back).opacity);
      if (HIGHLIGHT_COLORS.includes(color)) setColor(INK_COLORS[0]);
      return back;
    }
    return tool;
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    // A palm dragging across the glass must not extend the pen's stroke.
    notePointer(e.nativeEvent);
    lastPointerType.current = e.pointerType || 'mouse';
    if (isPalm(e.nativeEvent)) return;

    // The nib follows the pointer whatever else is happening, so the width is
    // chosen by looking at it rather than by drawing a test line. While ink is
    // actually flowing it is moved straight on the element — see nibElRef.
    if (showNib) {
      const ghost = nibElRef.current;
      if (ghost && drawing.current && !isEraser) {
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
      } else setNibAt({ x: e.clientX, y: e.clientY });
    }

    // A move-tool drag that began on empty sheet pans the view.
    const sp = stagePan.current;
    if (sp && stageRef.current) {
      e.preventDefault();
      stageRef.current.scrollLeft = sp.sl - (e.clientX - sp.x);
      stageRef.current.scrollTop = sp.st - (e.clientY - sp.y);
      return;
    }

    // Dragging something already drawn.
    const m = moving.current;
    if (m) {
      e.preventDefault();
      const { nx, ny } = norm(e);
      const dx = nx - m.nx, dy = ny - m.ny;
      m.moved = true;
      // A finger never holds perfectly still, so a tap arrives with a few
      // pixels of travel in it. Past this much it was meant as a drag, and the
      // second-tap-to-open rule stands down.
      if (Math.abs(dx) > 0.012 || Math.abs(dy) > 0.012) m.tapOpens = false;

      if (m.grip) {
        /**
         * Resizing a two-corner mark.
         *
         * A bubble, box, circle, line or arrow is stored as two points, so
         * changing its size is a matter of moving the corner you grabbed and
         * leaving the other one alone. Freehand has no corners to grab and is
         * only ever moved.
         */
        const p = [...m.pts];
        const last = p.length - 3;
        const [ix, iy] = m.grip === 'a' ? [0, 1] : [last, last + 1];
        p[ix] = m.pts[ix] + dx;
        p[iy] = m.pts[iy] + dy;
        setStrokes(prev => prev.map(s => (s.id === m.id ? { ...s, pts: p } : s)));
        return;
      }

      const moved = m.pts.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v));
      setStrokes(prev => prev.map(s => (s.id === m.id ? { ...s, pts: moved } : s)));
      return;
    }

    const d = drawing.current;
    if (!d) return;
    e.preventDefault();

    if (isEraser) {
      const { nx, ny } = norm(e);
      eraseAt(nx, ny, tool === 'eraser-object');
      return;
    }

    if (preset.freehand) {
      // Coalesced samples matter: a pen faster than the refresh rate otherwise
      // draws visibly faceted lines.
      /**
       * Keeping the live stroke both CORRECT and cheap.
       *
       * The whole stroke is redrawn through the same paintStroke() the finished
       * mark uses — drawing only the newest segment is what beaded the line and
       * darkened the highlighter, and it also meant what you saw while drawing
       * was not what you got when you let go.
       *
       * But a redraw is O(points), and doing one per coalesced sample is
       * O(points²). Measured on an A0 sheet: 3,000 points cost 43ms for a
       * SINGLE redraw, and drawing that stroke cost 1.5 seconds of redraw work
       * in total. That is the freeze. Two things bring it back, and neither
       * touches how the mark is drawn:
       *
       *  - **Decimate as we go.** A sample closer than a pixel and a half to the
       *    last one adds nothing you can see, so it is folded into it — keeping
       *    the LARGER width, so a pressure peak is never thrown away. A long
       *    scribble settles at a few hundred points instead of thousands.
       *  - **Redraw once per frame.** Coalesced events arrive in bursts of ten
       *    or more; drawing ten times before the screen updates is nine wasted
       *    redraws. One animation frame, one redraw.
       */
      const c = liveRef.current!;
      const stepX = LIVE_MIN_STEP_PX / Math.max(1, c.width);
      const stepY = LIVE_MIN_STEP_PX / Math.max(1, c.height);
      for (const raw of samplesOf(e.nativeEvent)) {
        const { nx, ny } = norm(raw);
        const s = d.pen.push(raw, performance.now());
        const last = d.pts[d.pts.length - 1];
        // Direction-shaped nibs (the calligraphy chisel) are applied HERE, at
        // capture, so the width rides the point into the record — screen,
        // print and stamped PDF then agree without knowing the rule.
        const w = last
          ? nibShape(d.tool ?? tool, s.w, (nx - last.x) * c.width, (ny - last.y) * c.height)
          : nibShape(d.tool ?? tool, s.w, 0, 0);
        if (last && Math.abs(nx - last.x) < stepX && Math.abs(ny - last.y) < stepY) {
          if (w > last.w) last.w = w;
          continue;
        }
        d.pts.push({ x: nx, y: ny, w });
      }
      scheduleLiveDraw();
      setPenSource(d.pen.usedSource);
    } else {
      let { nx, ny } = norm(e);
      const a = d.pts[0];
      if (e.shiftKey) {
        if (preset.snappable) {
          const c = liveRef.current!;
          const dx = (nx - a.x) * c.width, dy = (ny - a.y) * c.height;
          const step = Math.PI / 12;
          const ang = Math.round(Math.atan2(dy, dx) / step) * step;
          const len = Math.hypot(dx, dy);
          nx = a.x + (Math.cos(ang) * len) / c.width;
          ny = a.y + (Math.sin(ang) * len) / c.height;
        } else {
          const c = liveRef.current!;
          const side = Math.max(Math.abs(nx - a.x) * c.width, Math.abs(ny - a.y) * c.height);
          nx = a.x + Math.sign(nx - a.x) * (side / c.width);
          ny = a.y + Math.sign(ny - a.y) * (side / c.height);
        }
      }
      d.pts = [a, { x: nx, y: ny, w: 1 }];
      clearLive();
      paintStroke(liveRef.current!.getContext('2d')!, liveRef.current!, draftStroke(d.pts));
    }
  }

  /**
   * The frame callback is registered once, so it reads draftStroke through a
   * ref rather than closing over a stale tool, colour and width.
   */
  const draftStrokeRef = useRef<(pts: PenSample[], asTool?: string) => AnnStroke>(() => ({
    id: 'draft', page: 0, tool: 'pen', color: '#000', width: 1, opacity: 1, pts: [],
  }));

  function draftStroke(pts: PenSample[], asTool: string = tool): AnnStroke {
    return {
      id: 'draft', page, tool: asTool as AnnTool, color, width, opacity,
      pts: pts.flatMap(p => [p.x, p.y, p.w]),
    };
  }

  draftStrokeRef.current = draftStroke;

  /**
   * The browser took the gesture away.
   *
   * A pointercancel is not a lift: it means a second finger arrived, or the
   * system claimed the touch. Committing what had been drawn so far — which is
   * what routing this to onUp did — leaves a stray line across the plan from
   * wherever the first finger happened to land every time somebody pinches.
   */
  function onCancelDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    stagePan.current = null;
    try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* gone */ }
    // What had already landed in the marks stays — a cancel abandons the
    // stroke in the air, it is not an undo — so a drag or a rub that was
    // under way still counts as a change, or the autosave would not see it.
    if (moving.current?.moved || (drawing.current && isEraser)) { setRedo([]); setDirty(true); }
    erased.current = new Set();
    cancelStroke();
    setNibAt(null);
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (stagePan.current) {
      stagePan.current = null;
      try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* gone */ }
      return;
    }
    const m = moving.current;
    if (m) {
      moving.current = null;
      try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* gone */ }
      // A finger's second tap on the balloon it already picked opens the words
      // for retyping — the touch stand-in for the double-click.
      if (m.tapOpens) {
        const host = strokes.find(s => s.id === m.id);
        if (host) {
          setTextDraft({ nx: m.nx, ny: m.ny, value: host.text ?? '', forId: host.id });
          return;
        }
      }
      if (m.moved) { setRedo([]); setDirty(true); }
      return;
    }
    const d = drawing.current;
    drawing.current = null;
    try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    if (!d) return;

    if (isEraser) {
      // The partial eraser rewrites strokes rather than collecting ids, so it
      // marks itself dirty as it goes; the whole-mark one is counted here.
      setRedo([]); setDirty(true);
      erased.current = new Set();
      return;
    }

    // The tool the stroke STARTED with. Flipping the pen mid-air changes the
    // tool at pointerdown, and React has not necessarily re-rendered by the time
    // the first sample arrives — so the stroke carries its own answer.
    const drewWith = d.tool ?? tool;
    const pre = toolById(drewWith);

    const pts = pre.freehand ? simplify(d.pts, 0.0006) : d.pts;
    // A tap with a shape tool is a mis-click, not a zero-size box.
    if (!pre.freehand && pts.length > 1 && Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) < 0.004) {
      clearLive(); return;
    }
    if (!pts.length) { clearLive(); return; }

    let s: AnnStroke = {
      id: `S-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      page, tool: drewWith as AnnTool, color, width, opacity,
      pts: pts.flatMap(p => [
        Math.round(p.x * 1e4) / 1e4,
        Math.round(p.y * 1e4) / 1e4,
        Math.round(p.w * 100) / 100,
      ]),
    };

    /**
     * Neat shapes — while the toggle is on, a freehand ink stroke that
     * plainly meant a shape lands as the clean version, in the same ink. A
     * line, box or circle becomes the app's own first-class mark (so the
     * eraser, Move and the PDF stamp treat it as the shape it is); a
     * triangle, star, heart or tilted box has no tool of its own and lands
     * as a clean polyline in the pen that drew it. A highlighter only ever
     * snaps to a straight band — its other job is marking over things that
     * are not shapes. Nothing confident stays exactly as drawn.
     */
    if (shapeSnap && pre.freehand && INK_TOOL_IDS.includes(drewWith)) {
      const cv = liveRef.current;
      const aspect = cv && cv.height > 0 ? cv.width / cv.height : 1.4;
      const snap = recognizeShape(pts, aspect);
      if (snap && (!isHighlighterTool(drewWith) || snap.kind === 'line')) {
        const clean = snap.pts.flatMap(p => [
          Math.round(p.x * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4, 1,
        ]);
        s = isHighlighterTool(drewWith)
          ? { ...s, pts: clean }                             // a straight band
          : snap.as === 'poly'
            ? { ...s, pts: clean }                           // the pen's own ink, tidied
            : { ...s, tool: snap.as as AnnTool, pts: clean };
      }
    }
    setStrokes(prev => [...prev, s]);
    setRedo([]);
    setDirty(true);
    clearLive();

    // A balloon with nothing in it is not a balloon, so it goes straight into
    // typing — anchored to the box that was just drawn.
    if (drewWith === 'bubble') {
      const x0 = Math.min(pts[0].x, pts[pts.length - 1].x);
      const y0 = Math.min(pts[0].y, pts[pts.length - 1].y);
      setTextDraft({ nx: x0 + 0.008, ny: y0 + 0.01, value: '', forId: s.id });
    }
  }

  function commitText() {
    if (!textDraft) return;
    const v = textDraft.value.trim();
    const target = textDraft.forId;
    setTextDraft(null);
    if (target) {
      // The words belong to the balloon, not to a separate text mark, so
      // moving or erasing the balloon takes them with it.
      setStrokes(prev => prev.map(s => (s.id === target
        ? { ...s, text: v, bold, fontSize: s.fontSize ?? Math.max(9, width * 4 + 11) } : s)));
      setDirty(true);
      return;
    }
    if (!v) return;
    setStrokes(prev => [...prev, {
      id: `S-${Date.now().toString(36)}`,
      page, tool: 'text', color, width: 0, opacity, bold,
      fontSize: Math.max(8, width * 5 + 10),
      text: v,
      pts: [textDraft.nx, textDraft.ny, 1],
    }]);
    setRedo([]); setDirty(true);
  }

  /**
   * Saving you never have to think about.
   *
   * Three separate clocks, because the two destinations have completely
   * different costs:
   *
   *  - **Here, instantly.** The moment you lift the pen the version is written
   *    into the app's own data. That costs nothing and means the markup exists
   *    the instant it is drawn.
   *  - **Drive, once you stop.** Stamping a PDF and uploading it is a real piece
   *    of work on a real plan, so it waits until nothing has happened for a few
   *    seconds. Drawing forty marks makes one upload, not forty.
   *  - **The tab, if you leave early.** Between the two there is a window where
   *    the markup is safe here but not yet in Drive. Closing the tab in that
   *    window is the one way to lose it, so the browser is asked to stop you.
   */
  const DRIVE_IDLE_MS = 9_000;
  const [saveState, setSaveState] = useState<'clean' | 'local' | 'sending' | 'sent' | 'failed'>(
    initialWork?.saveState ?? 'clean');
  const idleTimer = useRef<number | undefined>(undefined);
  const versionIdRef = useRef<string | null>(initialWork?.versionId ?? null);
  const pushingRef = useRef(false);
  /**
   * The Drive file THIS SKETCH already made, so every later stamp UPDATES it
   * instead of filing another copy. The autosave pushes a few seconds after
   * each pause, and a file per push filled Annotated Plans with near-identical
   * "annotated version 2"s a minute apart — the exact folder spam the owner
   * asked to avoid. Drive keeps its own revision history of the one file, so
   * nothing that was pushed is ever lost. Cleared by startNewSketch — a new
   * sketch is a new file.
   */
  const stampedFileRef = useRef<string | null>(null);
  /**
   * Read through REFS inside the save callbacks, never as dependencies —
   * saving writes a planAnnotations record, so a callback depending on the
   * list re-arms the autosave effect that calls it: the documented
   * maximum-update-depth loop, one step removed.
   */
  const annotationsRef = useRef(planAnnotations);
  annotationsRef.current = planAnnotations;
  const myPinsRef = useRef(myPins);
  myPinsRef.current = myPins;
  /** What the last stamp said about the pins, so "already in Drive" is honest. */
  const pinSigRef = useRef<string | null>(null);
  /**
   * The last version SEALED by a Save press (the owner's model, 2026-09-01):
   * Save v1 LOCKS version 1 — the next mark begins version 2 by itself, in a
   * fresh Drive file, and the autosave tends THAT file until v2 is sealed in
   * turn. Kept in a ref so the "already in Drive" toast can name the sealed
   * version without claiming a new number by asking claimVersion().
   */
  const lastFiledRef = useRef<number | null>(null);
  /**
   * How many times this sketch's Drive file has been brought up to date —
   * the ".3" of "annotated version 1.3", so the office can see at a glance
   * how many pushes each version took. 0 on the first filing, +1 per update.
   */
  const subRef = useRef<number | null>(initialWork?.subVersion ?? null);
  const pinSig = useCallback(() =>
    myPinsRef.current.map(p => `${p.id}${p.resolvedAt ? 'r' : ''}`).join(','), []);
  /** The sketch's Drive file — this session's stamp first, a restored tab's record second. */
  const sketchDriveFile = useCallback(() =>
    stampedFileRef.current
      ?? (versionIdRef.current
        ? annotationsRef.current.find(v => v.id === versionIdRef.current)?.driveFileId ?? null
        : null), []);

  /** The strokes as the server wants them, minus our own ids. */
  const strokesForDrive = useCallback(
    () => strokes.map(({ id: _id, ...rest }) => rest),
    [strokes],
  );

  /**
   * The punch-list pins, as marks for the Drive copy. The pins live in the
   * app's own data and every device draws them from it — but the PDF filed in
   * Drive is what leaves the app (a printout, an email, an architect), and a
   * copy without the pins says the snags do not exist. Page 1's real aspect
   * keeps the discs round on a landscape sheet.
   */
  const pinsForDrive = useCallback(async () => {
    const pins = myPinsRef.current;
    if (!pins.length || !doc) return [];
    try {
      const p1 = await doc.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      return pinStamp(pins, vp.width / vp.height);
    } catch { return pinStamp(pins, Math.SQRT2); }
  }, [doc]);

  /**
   * The number this sketch will be filed as, claimed ONCE and then held.
   *
   * `nextVersion` is derived from the saved list, so the instant the working
   * sketch is kept, it counts one higher. Reading it inside the autosave meant
   * every save changed the very value the save depended on: keep → the list
   * grows → `nextVersion` moves → the callback is a new function → the effect
   * fires again → keep again, for ever. React gave up with "maximum update
   * depth exceeded" and took the whole app down with it, on the first mark.
   *
   * The number is claimed when the sketch first reaches the store and held
   * until the sketch is finished with, so nothing downstream of a save can
   * feed back into it. `nextVersion` is read through a ref for the same
   * reason — it must not be a dependency of anything that saves.
   */
  const sketchVersion = useRef<number | null>(initialWork?.sketchVersion ?? null);
  const nextVersionRef = useRef(nextVersion);
  nextVersionRef.current = nextVersion;
  /**
   * The number the Save button WEARS. Once this sketch has claimed a version,
   * the button keeps saying it — `nextVersion` grows the moment the sketch's
   * own record lands in the list, so the label used to drift one ahead of the
   * version the press would actually update ("Save v3" over a button that
   * updates v2), which read as a save that never happened.
   */
  const shownVersion = sketchVersion.current ?? nextVersion;

  // The wrapper stashes a tab away by reading this — written every render so
  // it is always current, at the cost of nothing (a ref assignment).
  if (workRef) {
    workRef.current = {
      strokes, redo, basedOn, dirty, saveState, page,
      // While a fit is still owed, the zoom is "not chosen yet" — a stash
      // taken in that window (StrictMode's mount/cleanup/mount does this)
      // must not freeze the pre-fit default as the tab's remembered zoom.
      scale: fitting ? null : scale,
      versionId: versionIdRef.current, sketchVersion: sketchVersion.current,
      subVersion: subRef.current,
    };
  }
  // The cloud on this tab, kept live while drawing.
  const unsavedNow = strokes.length > 0 && saveState !== 'sent';
  useEffect(() => { onUnsavedChange?.(unsavedNow); }, [unsavedNow, onUnsavedChange]);

  const claimVersion = useCallback(() => {
    if (sketchVersion.current == null) sketchVersion.current = nextVersionRef.current;
    return sketchVersion.current;
  }, []);

  /** Begin a fresh working sketch: new record, new number, new Drive file. */
  const startNewSketch = useCallback(() => {
    versionIdRef.current = null;
    sketchVersion.current = null;
    stampedFileRef.current = null;
    pinSigRef.current = null;
    subRef.current = null;
  }, []);

  /**
   * One version per sketch, updated in place — not one per mark.
   *
   * A version per mark would give a list of two hundred, of which only the last
   * is any use. This keeps the working sketch as a single record that grows,
   * and "Start a blank sketch" is what begins a new one.
   */
  const keepLocally = useCallback(() => {
    if (locked || !strokes.length) return;
    const id = versionIdRef.current
      ?? `PA-${planFileId.slice(0, 8)}-${claimVersion()}-${Date.now().toString(36)}`;
    versionIdRef.current = id;
    savePlanAnnotation({
      id, apartmentId, planFileId, planName,
      version: claimVersion(),
      strokes,
      pageCount: doc?.numPages ?? 1,
      createdAt: new Date().toISOString(),
      createdBy: who || authorName,
      basedOn,
    });
    setLinkedVersion(claimVersion());   // the sheet now carries this version
    setSaveState('local');
  }, [locked, strokes, planFileId, claimVersion, apartmentId, planName, doc, who, authorName, basedOn, savePlanAnnotation]);

  const pushToDrive = useCallback(async () => {
    if (pushingRef.current || locked || !strokes.length) return;
    // A tray sketch pushes NOWHERE until "where should this be saved?" has
    // been answered — the local keeps still run, so nothing is at risk.
    const destParent = chooseSaveFolder
      ? saveDestRef.current?.folderId ?? null
      : plansFolderId || parentFolderId;
    if (!backendReady || !destParent) return;   // nowhere to put it (yet)
    pushingRef.current = true;
    setSaveState('sending');
    try {
      const upd = sketchDriveFile();
      const sub = upd ? (subRef.current ?? 0) + 1 : 0;
      const out = await stampPlanToDrive({
        planFileId,
        parentFolderId: destParent,
        strokes: [...strokesForDrive(), ...await pinsForDrive()],
        version: claimVersion(),
        subVersion: sub,
        jobName: apartmentLabel,
        author: who || authorName,
        updateFileId: upd,
      });
      stampedFileRef.current = out.fileId;
      pinSigRef.current = pinSig();
      lastFiledRef.current = claimVersion();
      subRef.current = sub;
      if (versionIdRef.current) {
        updatePlanAnnotation(versionIdRef.current, {
          driveFileId: out.fileId, driveUrl: out.webViewLink, subVersion: sub,
        });
      }
      onSavedToDrive?.({ id: out.fileId, name: out.name, kind: 'annotated' });
      setSaveState('sent');
    } catch {
      setSaveState('failed');
    } finally {
      pushingRef.current = false;
    }
  }, [locked, strokes.length, backendReady, chooseSaveFolder, plansFolderId, parentFolderId,
      planFileId, strokesForDrive, pinsForDrive, sketchDriveFile, pinSig, claimVersion,
      apartmentLabel, who, authorName, updatePlanAnnotation, onSavedToDrive]);

  // Every change: keep it here now, and set the clock running for Drive.
  // A tray sketch with no chosen destination keeps LOCALLY only — arming the
  // countdown would promise a push that pushToDrive rightly refuses.
  useEffect(() => {
    if (!dirty || locked || !strokes.length) return;
    keepLocally();
    if (chooseSaveFolder && !saveDest) return;
    clearTimeout(idleTimer.current);
    setDriveIn(Math.round(DRIVE_IDLE_MS / 1000));
    idleTimer.current = window.setTimeout(() => { void pushToDrive(); }, DRIVE_IDLE_MS);
    return () => clearTimeout(idleTimer.current);
  }, [strokes, dirty, locked, keepLocally, pushToDrive, chooseSaveFolder, saveDest]);

  /**
   * The seconds still to go before Drive gets it.
   *
   * Shown as a number inside the arrow rather than described in words: the
   * question somebody actually has, standing over a plan they have just marked
   * up, is "how long until this is safe", and a count answers it without
   * anybody reading a sentence.
   */
  const [driveIn, setDriveIn] = useState(0);
  /** Reset asks first; closing before Drive has it asks too. */
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    if (saveState !== 'local' || driveIn <= 0) return;
    const t = window.setInterval(() => setDriveIn(n => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [saveState, driveIn]);

  /**
   * Leaving before Drive has it.
   *
   * The browser only lets a page ASK, and only when the user has interacted
   * with it — which after drawing on a plan they certainly have. It shows its
   * own wording, so the message here is for the browsers that still honour a
   * custom one.
   */
  useEffect(() => {
    if (saveState !== 'local' && saveState !== 'sending') return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = 'Your markup is saved here but has not reached Drive yet. '
        + 'Give it a few seconds.';
      return e.returnValue;
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  // ---- history -----------------------------------------------------------
  function undo() {
    setStrokes(prev => {
      if (!prev.length) return prev;
      setRedo(r => [...r, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
    setDirty(true);
  }
  function redoOne() {
    setRedo(prev => {
      if (!prev.length) return prev;
      setStrokes(s => [...s, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
    setDirty(true);
  }

  useEffect(() => {
    function key(e: KeyboardEvent) {
      const inField = (e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/);
      // Guard on the draft as well as the target: while a note is open every
      // letter belongs to it, and focus can be a frame behind the state.
      if (inField || textDraft) {
        if (e.key === 'Escape') setTextDraft(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault(); e.shiftKey ? redoOne() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoOne(); }
      /**
       * Ctrl/⌘+P while a plan is open prints THE PLAN, not the webpage.
       *
       * The browser's own print grabs the running app — dark chrome, the
       * drawer, the sheet clipped to its scroll box — which is what "printing
       * a plan prints the webpage" was. The habit of pressing Ctrl+P is fine;
       * it just has to land on the composited sheet the Print button builds.
       */
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setDlMode('print'); setDlMarkup(true); setDlStep('what');
      }
      /**
       * = / + zooms in, - / _ zooms out, 0 fits the page — with or without
       * Ctrl/⌘, so the hand that reaches for the browser's own zoom keys
       * zooms THE PLAN instead of the whole app (the Ctrl+P precedent).
       * Through the shared zoomStep door, so a key press and a button press
       * can never behave differently. A drawer PANE stands down while the
       * full studio is open over it — both mount this handler, and without
       * the guard one key moved two surfaces.
       */
      if (['=', '+', '-', '_', '0'].includes(e.key)) {
        if (embedded && document.querySelector('[data-plan-surface="studio"]')) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === '0') setFitting(true);
        else zoomStep(e.key === '-' || e.key === '_' ? -1 : 1, 0.2, 6);
        return;
      }
      // Escape backs out one step at a time. Closing the whole studio because a
      // panel happened to be open loses the sketch's context for no reason.
      //
      // Neither Escape nor the X asks "save or discard?" — being interrogated
      // every time you glance at a plan is the kind of prompt people learn to
      // dismiss without reading, and the markup is still here when you return.
      if (e.key === 'Escape') {
        // A question on top owns the key. Without this, one Escape dismissed
        // the question AND closed the studio behind it — so backing out of
        // "rub every mark off?" threw you out of the plan as well.
        if (confirmReset || confirmClose) { e.stopPropagation(); return; }
        let mine = true;
        if (textDraft) setTextDraft(null);
        else if (showPalette) setShowPalette(false);
        else if (showMore) setShowMore(false);
        else if (showLayers) setShowLayers(false);
        else if (dlStep) setDlStep(dlStep === 'what' ? null : 'what');
        else if (showPlans) setShowPlans(false);
        else if (picked) setPicked(null);
        else { mine = false; onClose(); }
        /**
         * One press backs out ONE thing — including out of the HOST.
         *
         * This runs in the capture phase and stops the key when it has taken
         * it, because the drawer that hosts the plan pane has its own Escape
         * on window, registered first. Without this, closing the download
         * sheet closed the whole apartment behind it in the same press.
         */
        if (mine) { e.stopPropagation(); e.stopImmediatePropagation(); }
      }
      if (!readOnly && !e.ctrlKey && !e.metaKey) {
        const map: Record<string, string> = {
          p: 'pen', n: 'pencil', m: 'marker', h: 'highlighter', e: 'eraser',
          l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text', v: 'pan',
          s: 'move', b: 'bubble', d: 'eraser-object',
        };
        if (map[e.key.toLowerCase()]) pick(map[e.key.toLowerCase()]);
      }
    }
    // Capture, so a panel of this plan's own gets the key before the host's
    // Escape does — see the note in the Escape branch.
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }); // no dep array — the handler closes over live state and is cheap to reattach

  function pick(id: string) {
    setTool(id);
    if (INK_TOOL_IDS.includes(id)) setInkTool(id);   // the tray's pen follows every pick
    if (SHAPE_TOOL_IDS.includes(id)) setShapeTool(id); // and the Shapes tile its shape
    const p = toolById(id);
    if (p.width) setWidth(p.width);
    setOpacity(p.opacity);
    if (isHighlighterTool(id) && !HIGHLIGHT_COLORS.includes(color)) setColor(HIGHLIGHT_COLORS[0]);
    if (!isHighlighterTool(id) && HIGHLIGHT_COLORS.includes(color)) setColor(INK_COLORS[0]);
  }

  // ---- versions ----------------------------------------------------------

  function loadVersion(v: PlanAnnotation, continueIt: boolean) {
    // Whatever happens next is a NEW sketch — carrying on from version 3 makes
    // version 4, it does not write back over 3.
    startNewSketch();
    setStrokes(v.strokes ?? []);
    setRedo([]);
    setBasedOn(continueIt ? v.version : undefined);
    // NOT dirty: looking at a version is looking. `dirty: true` here made the
    // autosave mint a fresh record — and push a fresh Drive file — for every
    // version somebody merely CLICKED THROUGH; the new sketch begins when a
    // real mark is made, which sets dirty by itself.
    setDirty(false);
    setPage(0);
    setLinkedVersion(v.version);   // the connector line follows the click
    onToast?.(continueIt
      ? `Carrying on from version ${v.version} — saving makes version ${nextVersion}`
      : `Showing version ${v.version}`);
  }

  function newSketch() {
    // Nothing is actually at risk: drawing keeps a version here as you go, so
    // the marks are already in the list on the left. The question is only
    // whether you meant to start again.
    if (strokes.length && !window.confirm('Start a fresh sketch? What is on the plan now stays in the version list.')) return;
    startNewSketch();
    setStrokes([]); setRedo([]); setBasedOn(undefined); setDirty(false);
    setLinkedVersion(null);   // a blank sheet is connected to nothing
  }

  /** Wipe just the sheet you are looking at, on a multi-page set. */
  function clearPage() {
    if (!strokes.some(s => s.page === page)) return;
    setStrokes(prev => prev.filter(s => s.page !== page));
    setRedo([]); setDirty(true);
  }

  async function save() {
    const havePins = myPinsRef.current.length > 0;
    if (!strokes.length && !havePins) { onToast?.('Nothing to save yet.', 'error'); return; }
    /**
     * The File Tray's studio: the first save ASKS WHERE the marked-up plan
     * belongs — the tray's own folder or a job's plans folder — and the save
     * re-fires the moment the dialog answers. Every later save (and the idle
     * autosave) files into the same chosen home.
     */
    if (chooseSaveFolder && !saveDestRef.current && strokes.length) {
      setAskWhere(true);
      return;
    }
    /**
     * Pins with no ink: that is the PUNCH LIST's business — the same one file
     * in Annotated Plans → Pins the background filer keeps, through the same
     * implementation, so the two paths can never drift apart.
     */
    if (!strokes.length) {
      if (!backendReady || !parentFolderId) {
        onToast?.('The pins are saved with the job on every device. Filing a PDF copy needs the job\'s Drive folder and upload key.', 'error');
        return;
      }
      setSaving(true);
      const res = await filePinsNow({
        apartmentId, planFileId, parentFolderId: plansFolderId || parentFolderId,
        jobName: apartmentLabel, author: who || authorName,
      });
      setSaving(false);
      onToast?.(res === 'filed' ? 'Punch list filed in Drive under “Annotated Plans → Pins”.'
        : res === 'current' ? 'The punch list in Drive is already up to date.'
        : res === 'empty' ? 'No pins on this plan yet.'
        : 'Drive would not take the punch list — it will retry after the next pin change.',
        res === 'failed' ? 'error' : undefined);
      return;
    }
    /**
     * Pressing Save on a sketch that is already filed used to re-upload the
     * same bytes and say nothing — which read as the button doing nothing at
     * all (the owner's exact report). Nothing new means saying so, not a
     * silent round trip.
     */
    // 'sent' is only reachable while the strokes as-drawn have gone up — any
    // later mark flips it back to 'local' — so it, plus an unchanged pin list,
    // IS "nothing new in Drive". (`dirty` is the wrong witness: the autosave
    // leaves it raised after a push.) But a Save press still means something
    // here: it SEALS the version the autosave has been tending, so the next
    // mark starts the one after (the owner's lock model). Only a press on an
    // already-sealed sketch is a true no-op, and it says so.
    if (saveState === 'sent' && pinSig() === pinSigRef.current) {
      if (sketchVersion.current != null) {
        const sealed = sketchVersion.current;
        lastFiledRef.current = sealed;
        startNewSketch();
        // startNewSketch clears the pin signature — restore it, or the very
        // next press re-stamps (and claims a version) instead of answering
        // "already locked". The same trap the upload path already pays.
        pinSigRef.current = pinSig();
        setBasedOn(sealed);
        onToast?.(`Version ${sealed} locked — it is already in Drive, and your next mark starts version ${sealed + 1}.`);
      } else {
        const v = lastFiledRef.current;
        onToast?.(v
          ? `Version ${v} is already locked in Drive — nothing new since.`
          : 'Already in Drive — nothing new since it was filed.');
      }
      return;
    }
    const destParent = chooseSaveFolder
      ? saveDestRef.current?.folderId ?? null
      : plansFolderId || parentFolderId;
    if (!backendReady || !destParent) {
      // Still worth keeping: the markup lives in the app and can be printed,
      // it just cannot be filed in Drive without the folder and the upload key.
      if (strokes.length) storeVersion();
      onToast?.(destParent
        ? 'Saved here. Drive filing is off until the upload key is set.'
        : 'Saved here. Set the job\'s Drive folder to file a PDF copy too.', 'error');
      return;
    }
    // Whether this sketch already has a file in Drive decides the wording:
    // "filed" the first time, "updated" after — the same version, same file.
    const upd = sketchDriveFile();
    const sub = upd ? (subRef.current ?? 0) + 1 : 0;
    setSaving(true);
    try {
      const out = await stampPlanToDrive({
        planFileId,
        // Inside the Engineered Plans folder when we know it — the markup of a
        // plan is a plan, and that is where the office goes looking. The job's
        // main folder is only the fallback. A tray sketch goes wherever the
        // ask-where dialog chose.
        parentFolderId: destParent,
        strokes: [
          ...strokes.map(({ id: _id, ...rest }) => rest), // ids are ours, not the PDF's
          ...await pinsForDrive(),                        // the punch list travels too
        ],
        version: claimVersion(),
        subVersion: sub,
        jobName: apartmentLabel,
        author: who || authorName,
        updateFileId: upd,
      });
      stampedFileRef.current = out.fileId;
      pinSigRef.current = pinSig();
      subRef.current = sub;
      const sealed = claimVersion();
      storeVersion(out.fileId, out.webViewLink);
      clearTimeout(idleTimer.current);
      setDriveIn(0);
      setSaveState('sent');
      onSavedToDrive?.({ id: out.fileId, name: out.name, kind: 'annotated' });
      // Save LOCKS the version (the owner's model): the record and its Drive
      // file are sealed as they stand, and the very next mark begins the
      // following version in a fresh file — no button needed to start it.
      lastFiledRef.current = sealed;
      startNewSketch();
      // startNewSketch clears the pin signature with the rest — put it back,
      // or a second Save press straight after the seal would re-stamp (and
      // claim a version) instead of answering "already locked".
      pinSigRef.current = pinSig();
      setBasedOn(sealed);
      onToast?.(`Version ${sealed} ${upd ? 'updated in Drive' : 'filed in Drive'} and locked — your next mark starts version ${sealed + 1}.`);
    } catch (err) {
      storeVersion();
      onToast?.(`Saved here, but Drive refused it: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  function storeVersion(driveFileId?: string, driveUrl?: string) {
    // The SAME record the autosave has been keeping, not a second copy of it.
    // Pressing Save used to mint a fresh id and a fresh number, so a sketch
    // that had already been kept once appeared twice in the version list.
    const id = versionIdRef.current
      ?? `PA-${planFileId.slice(0, 8)}-${claimVersion()}-${Date.now().toString(36)}`;
    versionIdRef.current = id;
    savePlanAnnotation({
      id,
      apartmentId, planFileId, planName,
      version: claimVersion(),
      strokes,
      pageCount: doc?.numPages ?? 1,
      createdAt: new Date().toISOString(),
      createdBy: who || authorName,
      basedOn,
      driveFileId, driveUrl,
      subVersion: subRef.current ?? undefined,
    });
    setDirty(false);
    setBasedOn(undefined);
  }

  // ---- print -------------------------------------------------------------

  /**
   * Print what is on screen, markup included.
   *
   * Every page is re-rendered offscreen with its ink composited on, so this is
   * exactly what you are looking at — and it works with no network and no
   * saving, which is what you want when someone is walking out to site.
   */
  /**
   * Which pages an export should cover.
   *
   * Rendering every page was fine on a two-page detail and catastrophic on a
   * real set: a 480-sheet A0 drawing rendered at scale 2 and inlined as JPEG is
   * tens of gigabytes of canvas and a hung tab. Above a handful of pages it
   * asks, and the page you are looking at is the default answer — which is what
   * somebody printing a plan almost always wants anyway.
   */
  const BULK_LIMIT = 12;
  function pagesToExport(): number[] | null {
    if (!doc) return null;
    if (doc.numPages <= BULK_LIMIT) return Array.from({ length: doc.numPages }, (_, i) => i);
    // Worded from the strings object like everything else — this was the
    // last hardcoded English left in the export paths.
    const all = window.confirm(
      `${s.dlPagesTitle}\n\n`
      + `${s.dlPagesAll}: ${doc.numPages}\n`
      + `${s.dlPagesThis}: ${page + 1}`,
    );
    return all ? Array.from({ length: doc.numPages }, (_, i) => i) : [page];
  }

  /**
   * Print asks the same first question the download does.
   *
   * "With the markings" means the SAME thing on paper as in a file — the ink
   * and the snag pins — or the two exports would disagree about what a
   * marking is. Pins go on the first printed page only, for the reason
   * `drawPins` documents: a pin belongs to the apartment, not to a page.
   */
  async function print(withMarkup: boolean, wanted: number[]) {
    if (!doc) return;
    onToast?.(s.dlPrintBuilding);
    const imgs: string[] = [];
    for (const i of wanted) {
      const p = await doc.getPage(i + 1);
      const vp = p.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      if (withMarkup) {
        for (const st of strokes) if (st.page === i) paintStroke(ctx, c, st);
        if (i === wanted[0]) drawPins(ctx, c.width, c.height, myPins);
      }
      imgs.push(c.toDataURL('image/jpeg', 0.92));
    }
    const w = window.open('', '_blank');
    if (!w) { onToast?.(s.dlPrintBlocked, 'error'); return; }
    const marks = withMarkup ? strokes.length + myPins.length : 0;
    w.document.write(`<!doctype html><title>${printEsc(planName || s.engineeringPlans)} — ${printEsc(apartmentLabel)}</title>
      <style>
        @page { margin: 8mm; }
        body { margin:0; font:12px Segoe UI,Helvetica,Arial,sans-serif; }
        .hd { padding:6px 2px 10px; color:#374151; display:flex; justify-content:space-between; }
        img { width:100%; display:block; page-break-after:always; }
        img:last-child { page-break-after:auto; }
      </style>
      <div class="hd"><b>${printEsc(apartmentLabel)} — ${printEsc(planName || s.engineeringPlans)}</b>
        <span>${s.dlMarksWord}: ${marks} · `
      + `${s.dlPagesWord}: ${wanted.length}/${doc.numPages} · `
      + `${new Date().toLocaleString()}</span></div>
      ${imgs.map(src => `<img src="${src}">`).join('')}`);
    w.document.close();
    w.focus();
    /**
     * Print once the pictures have actually decoded. A fixed 500ms was fine on
     * a two-page detail and a race on a real A0 set — Chrome captures the
     * preview with the images still blank, which reads as "it printed the
     * page, not the plan". The load event is the truth; the timeout is only
     * the backstop for a browser that never fires it on an about:blank child.
     */
    let fired = false;
    const fire = () => { if (fired) return; fired = true; try { w.focus(); w.print(); } catch { /* window closed */ } };
    if (w.document.readyState === 'complete') setTimeout(fire, 150);
    else w.addEventListener('load', () => setTimeout(fire, 150));
    setTimeout(fire, 2500);
  }

  // ---- download ----------------------------------------------------------

  /**
   * ONE download, asked in two plain questions.
   *
   * The old pair of buttons could not answer the question people actually
   * have. "PDF" only worked once a marked-up version had been SAVED to Drive
   * — on a plan nobody had marked up it did nothing but apologise, which is
   * why it read as broken everywhere — and "Pictures" always burnt the
   * drawings in whether you wanted them or not, while leaving the snag pins
   * out of the file completely.
   *
   * So the sheet asks what goes IN it first (the markings, or the clean
   * sheet), and only then what KIND of file. All four answers work from
   * bytes the browser already has: no Drive, no upload backend, nothing to
   * save first.
   *
   * The clean PDF is the original file byte for byte — not a re-render — so
   * it keeps its vector text and its own layers. Everything else is drawn
   * from the same canvas the screen uses, which is what makes a downloaded
   * markup look like the markup you were just looking at.
   */
  async function runDownload(withMarkup: boolean, asPdf: boolean, pages: number[]) {
    const base = safeFileName(`${apartmentLabel} — ${planName || s.engineeringPlans}`);
    try {
      onToast?.(s.dlWorking);

      // The untouched original: hand back exactly what Drive holds.
      if (!withMarkup && asPdf) {
        const buf = await fetchPlanCached(planFileId);
        const bytes = new Uint8Array(buf);
        const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
        if (isPdf) {
          saveBytes(bytes, `${base}.pdf`, 'application/pdf');
        } else {
          // A plan that is a photograph still has to come out as a PDF when
          // that is what was asked for.
          const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
          saveBytes(await imageBytesToPdf(bytes, isPng), `${base}.pdf`, 'application/pdf');
        }
        onToast?.(s.dlSaved);
        return;
      }

      if (!doc) return;
      const blobs: Blob[] = [];
      for (const i of pages) {
        const pg = await doc.getPage(i + 1);
        const probe = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: exportScale(probe.width, probe.height) });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await pg.render({
          canvasContext: ctx, viewport: vp,
          ...(ocRef.current ? { optionalContentConfigPromise: Promise.resolve(ocRef.current) } : {}),
        }).promise;
        if (withMarkup) {
          for (const st of strokes) if (st.page === i) paintStroke(ctx, c, st);
          // The pins are anchored to the sheet as a whole rather than to a
          // page, exactly as the overlay draws them, so they belong on the
          // first page of the export and nowhere else — repeating them on
          // every page would invent snags that do not exist.
          if (i === pages[0]) drawPins(ctx, c.width, c.height, myPins);
        }
        blobs.push(await canvasBlob(c));
      }

      if (asPdf) {
        saveBytes(await imagesToPdf(blobs), `${base}.pdf`, 'application/pdf');
      } else if (blobs.length === 1) {
        saveBytes(blobs[0], `${base}.png`, 'image/png');
      } else {
        await saveMany(blobs.map((blob, n) => ({
          blob, name: `${base} — ${n + 1}.png`,
        })));
      }
      onToast?.(s.dlSaved);
    } catch (err) {
      console.error('plan download failed', err);
      onToast?.(s.dlFailed, 'error');
    }
  }

  /** Every page, unless the set is big enough to be worth asking about. */
  function allPages(): number[] {
    return doc ? Array.from({ length: doc.numPages }, (_, i) => i) : [0];
  }

  /** Run whichever errand the sheet was opened for, over these pages. */
  function runChoice(markup: boolean, asPdf: boolean, pages: number[]) {
    setDlStep(null);
    if (dlMode === 'print') void print(markup, pages);
    else void runDownload(markup, asPdf, pages);
  }

  /** Answered "what goes in it": print goes now, a download asks the format. */
  function chooseWhat(markup: boolean) {
    setDlMarkup(markup);
    if (dlMode !== 'print') { setDlStep('format'); return; }
    if (doc && doc.numPages > BULK_LIMIT) { setDlStep('pages'); return; }
    runChoice(markup, dlPdf, allPages());
  }

  /** Answered "as what": run it now, or ask about the pages first. */
  function chooseFormat(asPdf: boolean) {
    setDlPdf(asPdf);
    if (doc && doc.numPages > BULK_LIMIT) { setDlStep('pages'); return; }
    runChoice(dlMarkup, asPdf, allPages());
  }


  // ---- UI ----------------------------------------------------------------

  /**
   * With a mark picked up, the toolbar edits IT.
   *
   * Otherwise the width, colour and see-through sliders only ever describe the
   * next thing you are about to draw, and changing your mind about something
   * already on the plan means rubbing it out and doing it again. This is what
   * makes "resize it and type in there in different sizes" true of a balloon
   * that already exists.
   */
  const pickedMark = tool === 'move' ? strokes.find(s => s.id === picked) : undefined;

  function editPicked(patch: Partial<AnnStroke>) {
    if (!pickedMark) return;
    setStrokes(prev => prev.map(s => (s.id === pickedMark.id ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  const palette = isHighlighterTool(tool) ? HIGHLIGHT_COLORS : INK_COLORS;
  const marksOnPage = strokes.filter(s => s.page === page).length;

  /**
   * The rail's buttons, written once and hung either down a side or across the
   * bottom.
   *
   * Which way round is decided by which dimension the screen has to spare, so
   * the same twenty buttons cannot drift apart between the two layouts — a
   * second copy of this list is how a tool ends up existing in portrait and
   * not in landscape.
   */
  const railBtn: React.CSSProperties = {
    width: ui.btn, paddingTop: ui.padY, paddingBottom: ui.padY, gap: 2, flexShrink: 0,
  };
  const railDivider = railRow
    ? <div className="w-px h-8 mx-1 flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,.16)' }} />
    : <div className="h-px w-8 my-1" style={{ backgroundColor: 'rgba(255,255,255,.16)' }} />;

  const railBody = (
    <>
      {TOOLS.map(t => {
        /**
         * Pen, pencil, marker and highlighter are ONE tile (the owner's
         * consolidation): it wears whichever pen is in the hand, a press arms
         * it, and a press while armed opens the pen tray. The three absorbed
         * tools render nothing of their own.
         */
        if (INK_TOOL_IDS.includes(t.id) && t.id !== 'pen') return null;
        if (t.id === 'pen') {
          const cur = toolById(inkTool);
          const InkIcon = ICONS[inkTool] ?? Pen;
          const armed = tool === inkTool;
          return (
            <button key="ink" data-ink-tile
              onClick={e => {
                if (armed) {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setPenTray(railRow
                    ? { x: r.left + r.width / 2, y: r.top - 8, up: true }
                    : { x: r.right + 10, y: r.top + r.height / 2, up: false });
                } else pick(inkTool);
              }}
              title={`${cur.label} — press again to open the pen tray (pen, pencil, marker, highlighter)`}
              className="rounded-xl flex flex-col items-center transition-colors"
              style={{
                ...railBtn,
                backgroundColor: armed ? ACCENT : 'transparent',
                color: armed ? '#fff' : 'rgba(255,255,255,.62)',
              }}>
              {/* Keyed so swapping pens plays the little rise, the Samsung manner. */}
              <span key={inkTool} className="pen-swap flex flex-col items-center" style={{ gap: 2 }}>
                <InkIcon size={ui.icon} />
                <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>{cur.label}</span>
              </span>
            </button>
          );
        }
        /**
         * Line, arrow, box and circle are ONE Shapes tile the same way — it
         * wears whichever shape is in the hand, a press arms it, a press
         * while armed opens the shape flyout. The bubble keeps its own tile,
         * by the owner's ruling.
         */
        if (SHAPE_TOOL_IDS.includes(t.id) && t.id !== 'line') return null;
        if (t.id === 'line') {
          const cur = toolById(shapeTool);
          const ShIcon = ICONS[shapeTool] ?? LineIcon;
          const armed = SHAPE_TOOL_IDS.includes(tool);
          return (
            <button key="shapes" data-shape-tile
              onClick={e => {
                if (armed) {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setShapeTray(railRow
                    ? { x: r.left + r.width / 2, y: r.top - 8, up: true }
                    : { x: r.right + 10, y: r.top + r.height / 2, up: false });
                } else pick(shapeTool);
              }}
              title={`${cur.label} — press again to pick a shape (line, arrow, box, circle)`}
              className="rounded-xl flex flex-col items-center transition-colors"
              style={{
                ...railBtn,
                backgroundColor: armed ? ACCENT : 'transparent',
                color: armed ? '#fff' : 'rgba(255,255,255,.62)',
              }}>
              <span key={shapeTool} className="pen-swap flex flex-col items-center" style={{ gap: 2 }}>
                <ShIcon size={ui.icon} />
                <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>{cur.label}</span>
              </span>
            </button>
          );
        }
        const Icon = ICONS[t.id] ?? Pen;
        const on = tool === t.id;
        return (
          <button key={t.id} onClick={() => pick(t.id)} title={`${t.label} — ${t.hint}`}
            className="rounded-xl flex flex-col items-center transition-colors"
            style={{
              ...railBtn,
              backgroundColor: on ? ACCENT : 'transparent',
              color: on ? '#fff' : 'rgba(255,255,255,.62)',
            }}>
            <Icon size={ui.icon} />
            <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>{t.label}</span>
          </button>
        );
      })}
      {railDivider}
      {/* "Pan", not "Move" — Move is the tool that picks marks up, and two
          buttons with the same word is a coin toss. */}
      <button onClick={() => pick('pan')} title="Pan — scroll around the plan without drawing"
        className="rounded-xl flex flex-col items-center"
        style={{ ...railBtn,
                 backgroundColor: tool === 'pan' ? ACCENT : 'transparent',
                 color: tool === 'pan' ? '#fff' : 'rgba(255,255,255,.62)' }}>
        <Hand size={ui.icon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>Pan</span>
      </button>
      <button onClick={undo} disabled={!strokes.length} title="Undo (Ctrl+Z)"
        className="rounded-xl flex flex-col items-center text-white/60 disabled:opacity-25 hover:bg-white/10"
        style={railBtn}>
        <Undo2 size={ui.smallIcon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>Undo</span>
      </button>
      <button onClick={redoOne} disabled={!redo.length} title="Redo (Ctrl+Shift+Z)"
        className="rounded-xl flex flex-col items-center text-white/60 disabled:opacity-25 hover:bg-white/10"
        style={railBtn}>
        <Redo2 size={ui.smallIcon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>Redo</span>
      </button>
      {/* Clear takes THIS PAGE. New starts a fresh sketch. They both used
          to call newSketch, so on a multi-page set there was no way to
          wipe one sheet, and two buttons did the same thing. */}
      <button onClick={clearPage} disabled={!strokes.some(s => s.page === page)}
        title="Rub out every mark on this page"
        className="rounded-xl flex flex-col items-center text-white/60 disabled:opacity-25 hover:bg-white/10"
        style={railBtn}>
        <Trash2 size={ui.smallIcon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>Clear</span>
      </button>

      {/* ── Saved versions, on the rail ──
          They were a 248px panel down the right-hand side, which is a
          quarter of the screen given to a list you look at twice a day.
          Newest nearest the top, because that is the one you want. */}
      {railDivider}

      <button onClick={newSketch} title="Start a fresh sketch on this plan"
        className="rounded-xl flex flex-col items-center text-white/70 hover:bg-white/10"
        style={railBtn}>
        <Plus size={ui.smallIcon} />
        <span className="font-semibold leading-none" style={{ fontSize: ui.label }}>New</span>
      </button>

      {versions.map(v => {
        const showing = linkedVersion === v.version;
        const gone = !!(v.driveFileId && deadFiles.has(v.driveFileId));
        return (
          <button
            key={v.id}
            data-version-btn={v.version}
            data-version-active={showing ? '1' : undefined}
            onClick={() => loadVersion(v, !readOnly)}
            title={`Version ${v.version}${typeof v.subVersion === 'number' ? `.${v.subVersion}` : ''} — `
              + `${v.createdBy || 'the office'}, ${new Date(v.createdAt).toLocaleString()}`
              + `${gone ? ' · its Drive file was deleted' : v.driveUrl ? ' · in Drive' : ' · not in Drive yet'}`}
            className="rounded-xl flex flex-col items-center gap-0.5 transition-colors relative"
            style={{
              width: ui.btn, paddingTop: ui.padY, paddingBottom: ui.padY, flexShrink: 0,
              backgroundColor: showing ? 'rgba(255,255,255,.12)' : 'transparent',
              color: 'rgba(255,255,255,.72)',
            }}
          >
            {/* v1.3 — the ".3" counts the in-place Drive updates. */}
            <span className="font-black leading-none" style={{ fontSize: ui.text * 0.92 }}>
              v{v.version}{typeof v.subVersion === 'number' ? `.${v.subVersion}` : ''}
            </span>
            <span className="text-[7.5px] leading-none opacity-70">
              {new Date(v.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
            {/* Green = its file is really in Drive; grey = never filed, or the
                file was deleted there (checked against the live folder). */}
            <span data-version-dot className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: v.driveUrl && !gone ? '#4ade80' : 'rgba(255,255,255,.28)' }} />
          </button>
        );
      })}
    </>
  );

  return (
    <div
      ref={rootRef}
      data-plan-surface={embedded ? 'pane' : 'studio'}
      className={embedded ? 'absolute inset-0 flex flex-col' : 'fixed inset-0 z-[150] flex flex-col'}
      // A white ground matters in FULL SCREEN too: the fullscreen element is
      // painted over black by the browser, and the embedded pane's white
      // otherwise only comes from the drawer behind it.
      style={{ backgroundColor: embedded ? '#ffffff' : NAVY_DEEP }}
    >
      {/* The pen tray, over everything, sealed to itself. */}
      {penTray && !locked && (
        <PenTray at={penTray} up={penTray.up} current={inkTool} color={color} width={width}
          opacity={opacity} ts={ts}
          onPick={id => pick(id)} onColor={c => setColor(c)} onWidth={w => setWidth(w)}
          onOpacity={o => setOpacity(o)}
          onClose={() => setPenTray(null)} />
      )}
      {shapeTray && !locked && (
        <ShapeTray at={shapeTray} up={shapeTray.up} current={shapeTool} ts={ts}
          onPick={id => pick(id)} onClose={() => setShapeTray(null)} />
      )}
      {/* The File Tray's "where should this be saved?" — the answered save
          re-fires straight away, reading the choice through its ref. */}
      {askWhere && !locked && (
        <SaveWhereDialog trayFolderId={plansFolderId} jobs={saveJobs}
          onClose={() => setAskWhere(false)}
          onPick={dest => {
            saveDestRef.current = dest;
            setSaveDest(dest);
            setAskWhere(false);
            onToast?.(`Filing into ${dest.label} — this sketch keeps saving there.`);
            void save();
          }} />
      )}
      {/* The version-to-plan connector — replayed (keyed) on every switch. */}
      {vlink && (
        <svg data-version-link key={linkedVersion ?? 'none'}
          className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 60 }}>
          <path d={vlink.d} pathLength={100} className="vlink-path" fill="none"
            stroke="#4ade80" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={vlink.x2} cy={vlink.y2} r={3.5} fill="#4ade80" className="vlink-dot" />
        </svg>
      )}
      {/* Header.
          The row is scaled as a whole with `zoom` rather than by re-sizing a
          dozen buttons one at a time: `zoom` grows the LAYOUT, so the hit boxes
          grow with the pixels — unlike a transform, which would leave every
          button catching taps where it used to be. It wraps rather than
          overflows, and at the desk size it is not applied at all, so nothing
          about the existing screen moves by a pixel. The tool rail is sized
          explicitly instead, because it also has to scroll.

          On a phone it must NOT wrap: eleven buttons at 390px make four rows,
          which is half the plan spent on chrome, and in landscape it is more
          than the plan. Everything that is not pressed while drawing moves
          into the ⋯ sheet instead, and what is left is one row. */}
      {/* The row scrolls sideways on a phone, and Close does not scroll with
          it. A multi-page plan adds a pager, and an unsaved one adds the Drive
          count: at 390px the arithmetic runs out and the last button in the
          row — Close — is pushed off the screen with no way to reach it. The
          two that must always be there are pinned to the right-hand edge and
          everything else runs under them. */}
      {/*
        One bar, wherever the host wants it.

        The drawer used to stack TWO bars over one sheet — its navy header with
        the folder picker and the file chips, and this one underneath with the
        file's name, the pin, Plans, Layers, Download and Print. Given a slot,
        the whole row is portalled into it and nothing is drawn here, so the
        controls sit at the LEFT-hand end of the host's own bar, ahead of the
        picker. Its background and padding go with it: it is joining a bar, not
        putting a second one inside the first.
      */}
      {(() => {
        /** Two slots given: the name goes up top, everything else underneath. */
        const twoRow = !!barInto && !!barInto2;
        /**
         * The tab strip lives in the bar's middle on a desk with a whole bar
         * to itself — boxed off by two upright lines, per the owner. A phone
         * has no middle, and the drawer's bars are portalled slots with no
         * room; both draw the strip on a slim row of its own instead (below,
         * outside this bar).
         */
        const stripInBar = !!tabStrip && !compact && !barInto;
        const stripSep = (
          <span aria-hidden className="w-px self-stretch flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,.24)', margin: '6px 5px' }} />
        );
        const head = (<>
          {!compact && <Layers size={16} className="text-[#4aa8d8] flex-shrink-0" />}
          <div className={compact ? 'min-w-0 flex-1' : 'min-w-0'}>
            <div className="text-[13px] font-bold text-white truncate">{planName || 'Plan'}</div>
            <div className="text-[10.5px] text-gray-400 truncate">
              {apartmentLabel}
              {basedOn ? ` · carrying on from v${basedOn}` : ''}
              {dirty ? ' · unsaved' : ''}
            </div>
          </div>
        </>);
        const rest = (<>

        {/*
          The host's own controls, IN the bar rather than floating over it.

          The punch-list Pin button used to sit at the pane's top-left corner,
          which is exactly where this bar draws the file's name — so the name
          was covered by a button, on every plan. It belongs beside the name,
          in the row, where it hides nothing.
        */}
        <span ref={barExtrasRef} className="flex items-center gap-1.5 flex-shrink-0" />

        {!compact && !twoRow && !stripInBar && <div className="flex-1" />}

        {/* The pager and the zoom live in the floating bar over the sheet
            when there is nothing to mark up — one set of controls, where Drive
            keeps them. Two pagers and two zooms in one window is a choice
            nobody should have to make. */}
        {doc && doc.numPages > 1 && !locked && (
          <div className="flex items-center gap-1 text-white/85 text-[12px] mr-1 flex-shrink-0">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className={`${iconBtn} hover:bg-white/10 disabled:opacity-30`}><ChevronLeft size={15} /></button>
            <span className="tabular-nums">{page + 1} / {doc.numPages}</span>
            <button onClick={() => setPage(p => Math.min(doc.numPages - 1, p + 1))} disabled={page >= doc.numPages - 1}
              className={`${iconBtn} hover:bg-white/10 disabled:opacity-30`}><ChevronRight size={15} /></button>
          </div>
        )}

        {/* Zoom, the plan chooser, the layers, downloading and printing all
            move into the ⋯ sheet on a phone — none of them is touched while a
            mark is being drawn, and a pinch does the zooming there anyway. */}
        {!compact && (<>
          {/* Only while marking up. Reading a plan, the zoom is in the floating
              bar over the sheet — one set of controls, where Drive keeps them. */}
          {!locked && (
            <div className="flex items-center gap-0.5 text-white/85 mr-1">
              <button onClick={() => zoomStep(-1, 0.2, 5)} disabled={atZoomFloor}
                title={atZoomFloor ? 'As small as it goes' : 'Zoom out'}
                className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30"><Minus size={14} /></button>
              <span className="text-[11px] tabular-nums w-11 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => zoomStep(1, 0.2, 5)} title="Zoom in"
                className="p-1.5 rounded-lg hover:bg-white/10"><Plus size={14} /></button>
              {/* REAL full screen — the fit button beside it used to wear this
                  icon while running the fit, which is the mislabel the owner
                  called out. Between zoom-in and fit, per his placement. */}
              <button data-plan-fullscreen onClick={toggleFull}
                title={isFull ? 'Exit full screen' : 'Full screen'}
                className="p-1.5 rounded-lg hover:bg-white/10">
                {isFull ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button data-plan-fit onClick={() => setFitting(true)} title="Fit the page"
                className="p-1.5 rounded-lg hover:bg-white/10"><Square size={12} /></button>
            </div>
          )}

          {/* Always offered, not only when there are two.
              The chooser is how you reach ANOTHER FOLDER, so hiding it when the
              plans folder happened to hold one file hid the way out of it. */}
          <button data-open-plans onClick={() => setShowPlans(true)}
            title="Choose a plan — or another folder in this job's Drive"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10">
            <ChevronsUpDown size={13} /> Plans
          </button>

          {/* The gap the owner drew: Plans belongs with the sheet you are
              choosing, the rest belongs at the far end. */}
          {twoRow && <div className="flex-1" />}

          <button onClick={() => setShowLayers(v => !v)}
            disabled={isImagePlan}
            title={isImagePlan
              ? 'A picture has no layers of its own'
              : "Show or hide the plan's own layers"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold ${
              showLayers ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10'}`}>
            <Layers2 size={13} /> Layers
            {layers.length > 0 && (
              <span className="text-[9.5px] font-bold px-1 rounded-full bg-white/20">{layers.length}</span>
            )}
          </button>

          <button data-plan-download onClick={() => { setDlMode('download'); setDlMarkup(true); setDlStep('what'); }} title={s.dlTitle}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10">
            <Download size={14} /> {s.downloadLabel}
          </button>

          <button data-plan-print onClick={() => { setDlMode('print'); setDlMarkup(true); setDlStep('what'); }}
            title={s.dlPrintTitle}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-white/90 hover:bg-white/10">
            <Printer size={14} /> {s.printPlanLabel}
          </button>
        </>)}

        {/* Where the work has got to.
            The saving is automatic now, which is only reassuring if you can see
            it happening — otherwise you are trusting something invisible with a
            drawing you just spent ten minutes on. Three honest states: kept on
            this machine, on its way to Drive, and safely in Drive. */}
        {/* Undo, redo and reset, up here where they are looked for.
            They were only on the tool rail, which is where you go to change
            what you are drawing with — not where you go to take something
            back. Reset asks first, because it is the one that cannot be
            undone by pressing it again. */}
        {!locked && (
          <span className="flex items-center gap-0.5 mr-1 flex-shrink-0">
            <button data-top-undo onClick={undo} disabled={!strokes.length} title="Undo (Ctrl+Z)"
              className={`${iconBtn} text-white/80 hover:bg-white/10 disabled:opacity-30`}>
              <Undo2 size={ui.smallIcon} />
            </button>
            <button data-top-redo onClick={redoOne} disabled={!redo.length} title="Redo (Ctrl+Shift+Z)"
              className={`${iconBtn} text-white/80 hover:bg-white/10 disabled:opacity-30`}>
              <Redo2 size={ui.smallIcon} />
            </button>
            {/* Reset is in the ⋯ sheet on a phone: it is the one button here
                that cannot be taken back by pressing it again, and it does not
                belong a thumb's width from Undo on a 390px row. */}
            {!compact && (
              <button data-top-reset onClick={() => setConfirmReset(true)} disabled={!strokes.length}
                title="Take every mark off this plan"
                className="p-1.5 rounded-lg text-white/80 hover:bg-red-500/25 disabled:opacity-30">
                <RotateCcw size={ui.smallIcon} />
              </button>
            )}
          </span>
        )}

        {!locked && saveState !== 'clean' && (
          <SaveTrip
            state={saveState}
            secondsLeft={driveIn}
            compact={compact}
            onSendNow={() => { clearTimeout(idleTimer.current); void pushToDrive(); }}
          />
        )}

        {!locked && (
          <button onClick={save} disabled={saving || (!strokes.length && !myPins.length)}
            title={'File this markup in Drive (Annotated Plans) and LOCK it as this version — '
              + 'your next mark starts the following version by itself. While a version is '
              + 'open, the chip beside this keeps its one Drive file up to date automatically.'}
            className={`flex items-center gap-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-40 flex-shrink-0 ${
              compact ? 'px-2.5 min-h-[38px]' : 'px-3 py-1.5'}`}
            style={{ backgroundColor: ACCENT }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {/* The word costs a fifth of a 390px row and says nothing the icon
                does not. The version number is the part you check. */}
            {saving ? (compact ? '' : 'Filing…') : compact ? `v${shownVersion}` : `Save v${shownVersion}`}
            {/* WHERE it goes, answered by the mark everybody knows — the
                owner's ask: "add a little Drive icon showing where it saves". */}
            {!saving && <DriveIcon size={12} />}
          </button>
        )}

        {/* The "Saved versions" toggle that stood here was DEAD — it flipped a
            state nothing read, a leftover from the removed right-hand versions
            panel. The versions live as the v1.0 / v2.0 tabs on the rail. */}
        {/* Looking at it should be one step away from marking it up — closing
            and reopening through a different button is friction for nothing. */}
        {readOnly && !askWho && onStartMarkup && !twoRow && (
          <button onClick={onStartMarkup}
            className={`flex items-center gap-1.5 rounded-lg text-[12px] font-bold text-white flex-shrink-0 ${
              compact ? 'px-2.5 min-h-[38px]' : 'px-3 py-1.5'}`}
            style={{ backgroundColor: ACCENT }}>
            <Pen size={13} /> {compact ? '' : 'Mark up'}
          </button>
        )}
        {askWho && who && (
          <button onClick={() => setWho('')} title="Not you? Hand over to somebody else"
            className={`flex items-center gap-1.5 rounded-lg text-[12px] font-semibold text-white/85 hover:bg-white/10 flex-shrink-0 ${
              compact ? `${iconBtn}` : 'px-2.5 py-1.5'}`}>
            <UserIcon size={13} /> {compact ? '' : who}
          </button>
        )}

        {/* The two that can never scroll away: everything else in this row is
            reachable from the ⋯ sheet, and Close is the way out. */}
        <span className={`flex items-center gap-1 flex-shrink-0 ${compact ? 'sticky right-0 pl-1' : ''}`}
          style={compact ? { backgroundColor: NAVY } : undefined}>
          {/* Everything that came out of this row, one press away. */}
          {compact && (
            <button data-plan-more onClick={() => setShowMore(true)} title="More"
              className={`${iconBtn} text-white/85 hover:bg-white/10`}>
              <MoreHorizontal size={18} />
            </button>
          )}

          {/* Closing before Drive has it asks. There is a window of a few seconds
              where the markup is safe on this machine but not yet filed, and
              walking away inside it is the one way to lose the drawing. */}
          {/*
            No X on an embedded pane.
            It is a pane inside the drawer, not a window — there is nothing for
            it to close, which is why pressing it appeared to do nothing. The
            drawer's own X closes the drawer, and the pane has a Hide button.
          */}
          {!embedded && (
            <button data-close-studio
              onClick={() => {
                const risky = !locked && strokes.length > 0
                  && (saveState === 'local' || saveState === 'failed');
                if (risky) setConfirmClose(true); else onClose();
              }}
              title="Close" className={`${iconBtn} text-white/70 hover:bg-white/10`}>
              <X size={17} />
            </button>
          )}
        </span>
        </>);

        if (twoRow) {
          return (<>
            {createPortal(head, barInto!)}
            {createPortal(rest, barInto2!)}
          </>);
        }
        const row = (
          <div className={barInto
            ? 'flex items-center gap-1.5 min-w-0 flex-wrap'
            : `flex items-center gap-2 py-2 flex-shrink-0 ${
              compact ? 'px-2 flex-nowrap overflow-x-auto' : 'px-3 flex-wrap'}`}
            style={barInto ? undefined : { backgroundColor: NAVY, ...(ui.on ? { zoom: ts } : {}) }}>
            {head}
            {stripInBar && (<>
              {stripSep}
              <div className="flex-1 min-w-0 self-stretch flex">{tabStrip}</div>
              {stripSep}
            </>)}
            {rest}
          </div>
        );
        return barInto ? createPortal(row, barInto) : row;
      })()}

      {/* The strip's own slim row, where the bar has no middle for it — the
          phone, and the drawer pane whose bars are portalled slots. */}
      {tabStrip && (compact || !!barInto) && (
        <div className="flex-shrink-0 flex items-center px-2"
          style={{ backgroundColor: NAVY, ...(ui.on ? { zoom: ts } : {}) }}>
          {tabStrip}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* Tool rail, down the side — the desk, and a phone held sideways,
            where height is the scarce dimension and width is not. */}
        {!locked && !railRow && (
          <div className="flex-shrink-0 flex flex-col items-center gap-1 py-2 overflow-y-auto board-rail"
            style={{ backgroundColor: NAVY, width: ui.rail }}>
            {railBody}
          </div>
        )}

        {/* Stage */}
        <div className="relative flex-1 min-w-0 flex flex-col">
          {!locked && (
            // The TOOL row scrolls sideways on a phone; this one wraps.
            // Scrolling is right for eleven buttons whose order you learn, and
            // wrong for three controls of which the last is a SLIDER: See-through
            // was cut in half at the screen edge, and you cannot drag a handle
            // you cannot see. Two lines cost 34px of a screen that had 800
            // spare below the sheet.
            <div className={`flex items-center gap-2 px-3 py-1.5 flex-shrink-0 gap-y-1.5 ${
              compact ? 'flex-wrap' : 'flex-wrap'}`}
              style={{ backgroundColor: 'rgba(255,255,255,.04)', ...(ui.on ? { zoom: ts } : {}) }}>
              {/* An eraser has no colour and no see-through: it is not ink.
                  Showing the controls implied it was, and setting one did
                  nothing. Width it does have — that is how much it takes. */}
              {!isEraser && (<>
                {/* Colour — one well, not a strip of swatches and the OS dialog. */}
                <button
                  onClick={e => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setShowPalette(v => !v);
                    // A phone gets the picker hung from the top-left instead of
                    // from the well: the panel is 292 wide and nearly as tall as
                    // a landscape screen, so anywhere else it is clipped.
                    setPaletteAt(compact ? { x: 8, y: 8 } : { x: r.left, y: r.bottom + 8 });
                  }}
                  title="Ink colour"
                  className={`flex items-center gap-1.5 pl-1 pr-2 rounded-full transition-colors flex-shrink-0 ${
                    compact ? 'min-h-[34px]' : 'py-1'}`}
                  style={{ backgroundColor: 'rgba(255,255,255,.08)' }}
                >
                  <span className={`rounded-full flex-shrink-0 ${compact ? 'w-[26px] h-[26px]' : 'w-[20px] h-[20px]'}`}
                    style={{ backgroundColor: color, border: '2px solid rgba(255,255,255,.55)' }} />
                  <span className="text-[10.5px] font-mono text-white/70">{color}</span>
                </button>

                {/* The tool's own shortlist, so the common ones stay one click
                    away. Not on a phone: a 17px swatch is half the smallest
                    target a finger can be asked to hit, and seven of them are
                    a third of the row. The same seven are the first shelf
                    inside the picker, at 28px, one press away. */}
                {!compact && (
                  <div className="flex items-center gap-1">
                    {palette.slice(0, 7).map(c => (
                      <button key={c} onClick={() => setColor(c)} title={c}
                        className="w-[17px] h-[17px] rounded-full transition-transform"
                        style={{
                          backgroundColor: c,
                          border: color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,.28)',
                          transform: color === c ? 'scale(1.2)' : undefined,
                        }} />
                    ))}
                  </div>
                )}

                <span className="w-px h-5 bg-white/10 flex-shrink-0" />
              </>)}

              <label className="flex items-center gap-1.5 text-[10.5px] text-white/70 flex-shrink-0">
                {pickedMark?.tool === 'bubble' ? 'Text size' : 'Width'}
                <input type="range" min={0.5} max={60} step={0.5}
                  value={pickedMark ? (pickedMark.tool === 'bubble'
                    ? (pickedMark.fontSize ?? 15) : pickedMark.width) : width}
                  onChange={e => {
                    const v = Number(e.target.value);
                    if (pickedMark) {
                      // On a balloon the slider is its TEXT size, which is the
                      // thing anyone wants to change about a balloon.
                      editPicked(pickedMark.tool === 'bubble' ? { fontSize: v } : { width: v });
                    } else setWidth(v);
                  }}
                  className="ink-slider w-[92px]"
                  style={{
                    ...fillPct(
                      pickedMark ? (pickedMark.tool === 'bubble'
                        ? (pickedMark.fontSize ?? 15) : pickedMark.width) : width, 0.5, 60),
                    ...touchSlider,
                  }} />
                <span className="tabular-nums w-6">
                  {pickedMark ? (pickedMark.tool === 'bubble'
                    ? (pickedMark.fontSize ?? 15) : pickedMark.width) : width}
                </span>
              </label>

              {/* Bold, for the note that has to be read from across the room.
                  Shown for the balloon and the plain note, which are the only
                  marks made of words. */}
              {(pickedMark?.tool === 'bubble' || pickedMark?.tool === 'text'
                || (!pickedMark && (tool === 'bubble' || tool === 'text'))) && (
                <button
                  onClick={() => (pickedMark ? editPicked({ bold: !pickedMark.bold }) : setBold(b => !b))}
                  title="Bold"
                  className={`rounded-lg text-[13px] font-black transition-colors flex-shrink-0 ${
                    compact ? 'w-[34px] h-[34px]' : 'w-[26px] h-[26px]'}`}
                  style={{
                    backgroundColor: (pickedMark ? pickedMark.bold : bold)
                      ? ACCENT : 'rgba(255,255,255,.08)',
                    color: '#fff',
                  }}
                >B</button>
              )}

              {!isEraser && (
                <label className="flex items-center gap-1.5 text-[10.5px] text-white/70 flex-shrink-0">
                  See-through
                  <input type="range" min={0.05} max={1} step={0.05}
                    value={pickedMark ? pickedMark.opacity : opacity}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (pickedMark) editPicked({ opacity: v }); else setOpacity(v);
                    }}
                    className="ink-slider w-[80px]"
                    style={{
                      ...fillPct(pickedMark ? pickedMark.opacity : opacity, 0.05, 1),
                      ...touchSlider,
                    }} />
                  <span className="tabular-nums w-7">
                    {Math.round((pickedMark ? pickedMark.opacity : opacity) * 100)}%
                  </span>
                </label>
              )}

              {/* Neat shapes — the Samsung Notes idea, as a plain on/off. On,
                  a freehand stroke that plainly meant a line, box, circle,
                  triangle, star or heart lands as the clean version in the
                  same ink; off, every stroke stays exactly as drawn. */}
              {!isEraser && (
                <button data-shape-snap
                  onClick={toggleShapeSnap}
                  title={shapeSnap
                    ? 'Neat shapes is ON — a drawn square becomes a straight square. Press to turn off.'
                    : 'Neat shapes is OFF — strokes stay exactly as drawn. Press to turn on.'}
                  className={`flex items-center gap-1.5 rounded-full flex-shrink-0 text-[10.5px] font-semibold transition-colors ${
                    compact ? 'min-h-[34px] px-2.5' : 'py-1 px-2.5'}`}
                  style={{
                    backgroundColor: shapeSnap ? ACCENT : 'rgba(255,255,255,.08)',
                    color: shapeSnap ? '#fff' : 'rgba(255,255,255,.6)',
                  }}>
                  <Shapes size={13} /> Neat shapes
                </button>
              )}

              {/* The pressure control is gone. The Samsung panel's pen has no
                  pressure sensor at all — it is infrared and passive — so the
                  slider was a control over a number that never moved. Width
                  still varies with the nib you are using, which is the signal
                  that screen actually gives. */}

              {/* The running commentary is the first thing to go on a phone:
                  it is the widest item in the row and the only one that is
                  not a control. */}
              {!compact && (<>
                <div className="flex-1" />
                <span className="text-[10px] text-white/40">
                  {pickedMark
                    ? 'editing the mark you picked · click empty space to let go'
                    : `${marksOnPage} mark${marksOnPage === 1 ? '' : 's'} on this page`}
                  {/* The old "· speed" meant nothing to anybody reading it. */}
                </span>
              </>)}
            </div>
          )}

          {/**
            * The viewer's controls, where Drive puts them.
            *
            * The office reads plans in Drive all day, so the muscle memory is
            * already bought and paid for: a floating bar at the bottom centre
            * carrying the page count and the zoom, over the sheet rather than
            * in a strip above it. Only when there is nothing to mark up —
            * the studio has its own rail and two toolbars of its own.
            */}
          {locked && doc && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5
                            rounded-full px-1.5 py-1 shadow-lg backdrop-blur"
              style={{ backgroundColor: 'rgba(32,33,36,.92)', color: '#e8eaed' }}>
              {doc.numPages > 1 && (<>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  title="Previous page"
                  className="px-2 py-1 rounded-full hover:bg-white/10 disabled:opacity-30">‹</button>
                <span className="px-1.5 text-[12px] font-semibold tabular-nums select-none">
                  {page + 1} / {doc.numPages}
                </span>
                <button onClick={() => setPage(p => Math.min(doc.numPages - 1, p + 1))}
                  disabled={page >= doc.numPages - 1} title="Next page"
                  className="px-2 py-1 rounded-full hover:bg-white/10 disabled:opacity-30">›</button>
                <span className="mx-1 w-px self-stretch bg-white/20" />
              </>)}
              <button onClick={() => zoomStep(-1, 0.15, 6)} disabled={atZoomFloor}
                title={atZoomFloor ? 'As small as it goes' : 'Zoom out'}
                className="px-2.5 py-1 rounded-full hover:bg-white/10 disabled:opacity-30">
                <Minus size={14} />
              </button>
              <button onClick={() => setFitting(true)} title="Fit the sheet to the window"
                className="px-2 py-1 rounded-full text-[12px] font-semibold tabular-nums hover:bg-white/10">
                {Math.round(scale * 100)}%
              </button>
              <button onClick={() => zoomStep(1, 0.15, 6)}
                title="Zoom in" className="px-2.5 py-1 rounded-full hover:bg-white/10">
                <Plus size={14} />
              </button>
              <button data-plan-fullscreen onClick={toggleFull}
                title={isFull ? 'Exit full screen' : 'Full screen'}
                className="px-2.5 py-1 rounded-full hover:bg-white/10">
                {isFull ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button data-plan-fit onClick={() => setFitting(true)} title="Fit to page"
                className="px-2.5 py-1 rounded-full hover:bg-white/10">
                <Square size={12} />
              </button>
            </div>
          )}

          {/* `pan-x pan-y`, never `auto` — see the live canvas below. A pinch
              that starts on the margin rather than on the sheet has to reach
              the same handler, or it zooms the page instead. */}
          <div ref={stageRef}
            /*
              Centred by AUTO MARGINS on the sheet, not by items-center on the
              stage. The visual rule is unchanged — a landscape sheet on an
              upright phone still lands mid-screen, where the space reads as
              margin rather than as something failing to load. But a
              flex-centred child that OVERFLOWS its scroller hangs out both
              sides and the left/top overhang cannot be scrolled to — which is
              what clamped the zoom's scroll correction and made zooming drift
              off the point under the mouse, and what made the left edge of a
              zoomed sheet unreachable. `m-auto` centres exactly the same while
              it fits and behaves like a normal scroll child once it does not.
            */
            className={`flex-1 min-h-0 overflow-auto flex ${
              compact ? 'p-1' : 'p-4'}`}
            style={{ touchAction: 'pan-x pan-y' }}>
            {loadErr ? (
              <div className="m-auto text-center text-gray-300 text-[13px] max-w-md">
                <p className="font-semibold mb-1">This plan would not open.</p>
                <p className="text-gray-500 text-[12px]">{loadErr}</p>
                <p className="text-gray-500 text-[12px] mt-2">
                  The markup studio needs the upload backend configured, and the service account
                  has to be able to see the file in Drive.
                </p>
              </div>
            ) : !doc ? (
              <div className="m-auto flex flex-col items-center gap-2 text-gray-400 text-[13px]">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" /> Opening the plan…
                </div>
                {got.bytes > 0 && (
                  <>
                    <div className="w-[220px] h-1 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'rgba(255,255,255,.14)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: got.total ? `${Math.min(100, (got.bytes / got.total) * 100)}%` : '35%',
                          backgroundColor: ACCENT,
                        }} />
                    </div>
                    <span className="text-[11px] text-gray-500 tabular-nums">
                      {(got.bytes / 1048576).toFixed(1)} MB
                      {got.total ? ` of ${(got.total / 1048576).toFixed(1)} MB` : ' so far'}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div ref={sheetWrapRef} className="relative shadow-2xl m-auto" style={{ backgroundColor: '#fff' }}>
                {/*
                  A wide sheet on an upright phone fits to width and comes out
                  about a third of the screen tall — big enough to see, too
                  small to mark up. Turning the phone genuinely fixes it: the
                  same sheet then fills the screen. So the empty space says so
                  once, quietly, instead of being empty.
                */}
                {compact && sheetWide && screen.orientation === 'portrait' && (
                  <div className="absolute left-0 right-0 top-full mt-3 flex justify-center pointer-events-none">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold"
                      style={{ backgroundColor: 'rgba(255,255,255,.08)', color: '#93a3b5' }}>
                      <RotateCw size={12} /> Turn the phone for a bigger drawing
                    </span>
                  </div>
                )}
                <canvas ref={pdfRef} className="block" />
                <canvas ref={inkRef} className="absolute inset-0 pointer-events-none" />
                <canvas
                  ref={liveRef}
                  className="absolute inset-0"
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onCancelDraw}
                  onPointerLeave={() => setNibAt(null)}
                  onContextMenu={e => {
                    // A long press with a finger is how the eraser is used; the
                    // browser reads it as "open this image in a new tab". A
                    // right click with a mouse is left alone.
                    if (lastPointerType.current === 'touch') e.preventDefault();
                  }}
                  onDoubleClick={e => {
                    // Double-click a balloon to retype it. It does NOT have to
                    // be picked first — needing two separate clicks to get at
                    // your own words is a rule nobody would guess.
                    if (locked || tool === 'pan') return;
                    const { nx, ny } = norm(e);
                    const hit = markAt(nx, ny);
                    if (hit?.tool !== 'bubble') return;
                    setPicked(hit.id);
                    setTextDraft({ nx, ny, value: hit.text ?? '', forId: hit.id });
                  }}
                  style={{
                    // The pen must not scroll the page while it draws, and the
                    // palm must not either — without this the Samsung screen
                    // pans instead of drawing.
                    //
                    // `pan-x pan-y` rather than `auto` when there is nothing to
                    // draw: one finger still scrolls the plan, but the BROWSER
                    // is told it may not pinch, which is what leaves the
                    // gesture free for the handler that zooms the plan. On
                    // `auto` a real touch panel starts its own page zoom the
                    // moment the second finger lands and sends a touchcancel,
                    // so on the wallboard — read-only, every gesture a finger —
                    // pinching zoomed the whole page instead of the drawing.
                    touchAction: locked || tool === 'pan' ? 'pan-x pan-y' : 'none',
                    // With a nib ghost on screen the cursor itself gets out of
                    // the way — two crosshairs is one too many.
                    cursor: locked || tool === 'pan' ? 'grab'
                      : tool === 'text' ? 'text'
                      : tool === 'move' ? (picked ? 'move' : 'grab')
                      : showNib ? 'none' : 'crosshair',
                    pointerEvents: locked || tool === 'pan' ? 'none' : 'auto',
                  }}
                />
                {textDraft && (() => {
                  /* Typing happens INSIDE the balloon. The box below is placed
                     over the balloon's own text area at the balloon's own type
                     size, with no border and no background, so what you type is
                     what is drawn — there is no pop-up any more. A plain note,
                     which has no shape around it, still gets a small framed box
                     so you can see where you are typing. */
                  const host = textDraft.forId
                    ? strokes.find(x => x.id === textDraft.forId) : undefined;
                  const inBubble = host?.tool === 'bubble';
                  const b = inBubble ? bubbleBox(host!) : null;
                  return (
                    <div
                      className="absolute z-10"
                      style={b ? {
                        left: `${b.left}%`, top: `${b.top}%`,
                        width: `${b.width}%`, height: `${b.height}%`,
                      } : { left: `${textDraft.nx * 100}%`, top: `${textDraft.ny * 100}%` }}
                    >
                      <textarea
                        ref={textRef} rows={b ? undefined : 2}
                        value={textDraft.value}
                        onChange={e => setTextDraft({ ...textDraft, value: e.target.value })}
                        onBlur={commitText}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); }
                          if (e.key === 'Escape') setTextDraft(null);
                        }}
                        placeholder={b ? '' : 'Note on the plan…'}
                        className={b
                          ? 'w-full h-full bg-transparent border-0 outline-none resize-none p-0 overflow-hidden'
                          : 'px-2 py-1 rounded-lg border-2 shadow-lg text-[13px] outline-none resize'}
                        style={b ? {
                          color: host!.color,
                          fontFamily: 'Segoe UI, Helvetica, Arial, sans-serif',
                          fontSize: `${b.fontPx}px`,
                          fontWeight: host!.bold ? 800 : 600,
                          lineHeight: LINE,
                        } : { borderColor: color, color, minWidth: 180 }}
                      />
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* The right-hand Versions panel is gone. It was a quarter of the
            screen given to a list; the versions live on the left rail now. */}
      </div>

      {/* The same rail, laid across the bottom, on a phone stood up.
          Down the side it would be a sixth of a 390px sheet, and it is the one
          piece of chrome a thumb reaches for constantly — so it goes where the
          thumb already is. It scrolls sideways rather than wrapping; the
          `board-rail` fade is deliberately not used, since its mask runs top to
          bottom and would fade a row's whole height away. */}
      {!locked && railRow && (
        <div className="flex-shrink-0 flex flex-row items-center gap-1 px-2 pt-1.5 overflow-x-auto"
          style={{
            backgroundColor: NAVY,
            paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
          }}>
          {railBody}
        </div>
      )}

      {/* The colour picker, drawn in the app rather than the operating system. */}
      {showPalette && !locked && (
        <InkPicker
          value={color}
          palette={palette}
          anchor={paletteAt}
          onChange={c => { setColor(c); rememberColor(c); }}
          onClose={() => setShowPalette(false)}
        />
      )}

      {/* The plan's own layers, so a services drawing can be read. */}
      {showLayers && (
        <>
          <div className="fixed inset-0 z-[158]" onClick={() => setShowLayers(false)} />
          {/* On a phone this hung 128px off the left-hand edge of the screen:
              `right: 268` was measured against a desk window and a panel that
              no longer exists. It is pinned to the right-hand edge instead, and
              given the height that is actually there rather than 60% of a
              landscape screen. */}
          <div className="fixed z-[159] rounded-2xl overflow-hidden"
            style={{
              ...(compact
                ? { right: 8, top: 54, width: 'min(280px, calc(100vw - 16px))',
                    maxHeight: 'calc(100vh - 68px)' }
                : { right: 268, top: 58, width: 250, maxHeight: '60vh' }),
              background: '#fff', boxShadow: '0 20px 48px -10px rgba(15,23,42,.4)',
            }}>
            <div className="px-3 py-2 text-[12px] font-bold text-white" style={{ backgroundColor: NAVY }}>
              Layers
            </div>
            <div className="p-2 overflow-y-auto"
              style={{ maxHeight: compact ? 'calc(100vh - 112px)' : '48vh' }}>
              {/* YOUR marks, one layer per colour, newest first.
                  Somebody marking a plan up works in passes — the red ones are
                  the problems, the green ones are the answers — so a colour is
                  already a layer in every way except being switchable. Ordered
                  by when each colour was last touched, so the pass you are in
                  the middle of is at the top. */}
              {inkLayers.length > 0 && (
                <>
                  <div className="px-2 pt-1 pb-1.5 text-[9.5px] font-extrabold tracking-wide text-gray-400">
                    YOUR MARKS
                  </div>
                  {inkLayers.map((l, i) => (
                    <button key={l.colour} data-ink-layer={l.colour}
                      onClick={() => setHiddenInk(h => {
                        const next = new Set(h);
                        if (next.has(l.colour)) next.delete(l.colour); else next.add(l.colour);
                        return next;
                      })}
                      className={`w-full flex items-center gap-2 px-2 rounded-lg hover:bg-gray-50 text-left ${
                        compact ? 'py-2.5' : 'py-1.5'}`}>
                      <span className="w-[15px] h-[15px] rounded flex items-center justify-center flex-shrink-0"
                        style={!hiddenInk.has(l.colour)
                          ? { backgroundColor: NAVY, color: '#fff' }
                          : { border: '1.5px solid #cbd5e1' }}>
                        {!hiddenInk.has(l.colour) && <Check size={10} />}
                      </span>
                      <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0 border border-black/10"
                        style={{ backgroundColor: l.colour }} />
                      <span className="text-[12px] text-gray-700 truncate flex-1">
                        Layer {inkLayers.length - i}
                      </span>
                      <span className="text-[10.5px] text-gray-400 tabular-nums">{l.count}</span>
                    </button>
                  ))}
                  {layers.length > 0 && (
                    <div className="px-2 pt-2.5 pb-1.5 text-[9.5px] font-extrabold tracking-wide text-gray-400">
                      ON THE PLAN
                    </div>
                  )}
                </>
              )}
              {layers.length === 0 && inkLayers.length === 0 && (
                <p className="px-2 py-3 text-[11.5px] text-gray-500 leading-snug">
                  This plan has no layers of its own — it was flattened when it was issued.
                  Your markup still saves as its own layer.
                </p>
              )}
              {layers.length > 1 && (() => {
                const allOn = layers.every(l => l.on);
                const noneOn = layers.every(l => !l.on);
                return (
                  <button
                    onClick={() => setAllLayers(!allOn)}
                    className={`w-full flex items-center gap-2 px-2 rounded-lg hover:bg-gray-50 text-left ${
                      compact ? 'py-2.5' : 'py-1.5'}`}
                    title={allOn ? 'Turn every layer off' : 'Turn every layer on'}
                  >
                    <span className="w-[15px] h-[15px] rounded flex items-center justify-center flex-shrink-0"
                      style={allOn
                        ? { backgroundColor: NAVY, color: '#fff' }
                        : noneOn
                          ? { border: '1.5px solid #cbd5e1' }
                          // Some on, some off — a dash, so it does not claim to
                          // be either.
                          : { border: `1.5px solid ${NAVY}`, color: NAVY }}>
                      {allOn ? <Check size={10} />
                        : noneOn ? null
                        : <span style={{ width: 7, height: 2, backgroundColor: NAVY, borderRadius: 1 }} />}
                    </span>
                    <span className="text-[12px] font-bold text-gray-700">
                      {allOn ? 'All layers' : noneOn ? 'No layers' : `${layers.filter(l => l.on).length} of ${layers.length}`}
                    </span>
                  </button>
                );
              })()}
              {layers.map(l => (
                <button key={l.id} onClick={() => toggleLayer(l.id)}
                  className={`w-full flex items-center gap-2 px-2 rounded-lg hover:bg-gray-50 text-left ${
                    compact ? 'py-2.5' : 'py-1.5'}`}>
                  <span className="w-[15px] h-[15px] rounded flex items-center justify-center flex-shrink-0"
                    style={l.on
                      ? { backgroundColor: NAVY, color: '#fff' }
                      : { border: '1.5px solid #cbd5e1' }}>
                    {l.on && <Check size={10} />}
                  </span>
                  <span className="text-[12px] text-gray-700 truncate">{l.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Everything the phone's header could not hold.
          Hung from the top-right corner rather than slid up from the bottom,
          because the same panel has to work on a screen 390px tall — a bottom
          sheet there is the whole screen, and it would cover the plan it is
          being used on. */}
      {showMore && (
        <>
          <div className="fixed inset-0 z-[158] bg-black/30" onClick={() => setShowMore(false)} />
          <div data-plan-more-sheet className="fixed z-[159] rounded-2xl overflow-hidden bg-white p-1.5"
            style={{
              top: 54, right: 8, width: 'min(300px, calc(100vw - 16px))',
              maxHeight: 'calc(100vh - 66px)', overflowY: 'auto',
              boxShadow: '0 24px 60px -12px rgba(15,23,42,.45)',
            }}>
            {/* Zoom, as one row. A pinch does this too, but a number you can
                read is how you get back to a known size. */}
            <div className="flex items-center gap-1 px-1 py-1">
              <button onClick={() => zoomStep(-1, 0.2, 5)} disabled={atZoomFloor}
                title={atZoomFloor ? 'As small as it goes' : 'Zoom out'}
                className="rounded-lg flex items-center justify-center min-w-[42px] min-h-[42px] disabled:opacity-40"
                style={{ backgroundColor: '#f1f5f9', color: '#334155' }}><Minus size={16} /></button>
              <span className="flex-1 text-center text-[13px] font-bold tabular-nums text-slate-700">
                {Math.round(scale * 100)}%
              </span>
              <button onClick={() => zoomStep(1, 0.2, 5)} title="Zoom in"
                className="rounded-lg flex items-center justify-center min-w-[42px] min-h-[42px]"
                style={{ backgroundColor: '#f1f5f9', color: '#334155' }}><Plus size={16} /></button>
              <button onClick={() => { toggleFull(); setShowMore(false); }}
                title={isFull ? 'Exit full screen' : 'Full screen'}
                className="rounded-lg flex items-center justify-center min-w-[42px] min-h-[42px]"
                style={{ backgroundColor: '#f1f5f9', color: '#334155' }}>
                {isFull ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button onClick={() => { setFitting(true); setShowMore(false); }} title="Fit the page"
                className="rounded-lg flex items-center justify-center min-w-[42px] min-h-[42px]"
                style={{ backgroundColor: '#f1f5f9', color: '#334155' }}><Square size={14} /></button>
            </div>

            <SheetRow icon={ChevronsUpDown} label="Plans"
              hint="This job's drawings, and the rest of its Drive"
              onClick={() => { setShowMore(false); setShowPlans(true); }} />
            <SheetRow icon={Layers2} label="Layers"
              disabled={isImagePlan}
              hint={isImagePlan ? 'A picture has no layers of its own'
                : layers.length ? `${layers.length} on this plan` : "The plan's own layers, and yours"}
              onClick={() => { setShowMore(false); setShowLayers(true); }} />
            <SheetRow icon={Download} label={s.downloadLabel}
              hint={s.dlTitle}
              onClick={() => { setShowMore(false); setDlMode('download'); setDlMarkup(true); setDlStep('what'); }} />
            <SheetRow icon={Printer} label={s.printPlanLabel}
              hint={s.dlPrintTitle}
              onClick={() => { setShowMore(false); setDlMode('print'); setDlMarkup(true); setDlStep('what'); }} />
            {askWho && who && (
              <SheetRow icon={UserIcon} label={who}
                hint="Not you? Hand over to somebody else"
                onClick={() => { setShowMore(false); setWho(''); }} />
            )}
            {!locked && (
              <SheetRow icon={RotateCcw} label="Take every mark off" danger
                disabled={!strokes.length}
                hint="Versions already filed are not touched"
                onClick={() => { setShowMore(false); setConfirmReset(true); }} />
            )}
          </div>
        </>
      )}

      {/*
        Download — two questions, in the order somebody actually thinks in.

        What goes IN the file first ("do you want my markings on it?"), then
        what KIND of file. A set too big to render whole asks one more. Every
        word comes from the strings object, so the sheet is Hebrew when the
        app is: this is the standing rule, and the old sheet broke it in five
        places.
      */}
      {dlStep && (
        <>
          <div className="fixed inset-0 z-[158] bg-black/35" onClick={() => setDlStep(null)} />
          <div data-plan-download-sheet
            className="fixed z-[159] rounded-2xl overflow-hidden bg-white"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(400px,92vw)',
                     boxShadow: '0 24px 60px -12px rgba(15,23,42,.45)' }}>
            <div className="px-4 py-2.5 text-[13px] font-bold text-white flex items-center gap-2"
              style={{ backgroundColor: NAVY }}>
              <span className="flex-1">{dlMode === 'print' ? s.dlPrintTitle : s.dlTitle}</span>
              <span className="text-[11px] font-semibold text-white/70">
                {dlStep === 'what' ? s.dlWhatStep : dlStep === 'format' ? s.dlFormatStep : s.dlPagesTitle}
              </span>
            </div>
            <div className="p-4 space-y-2">
              {dlStep === 'what' && (
                <>
                  <button data-dl-markup
                    onClick={() => chooseWhat(true)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-[#4aa8d8] transition-colors">
                    <div className="text-[13px] font-bold text-gray-900">{s.dlWithMarkup}</div>
                    <div className="text-[11px] text-gray-500">{s.dlWithMarkupHint}</div>
                  </button>
                  <button data-dl-clean
                    onClick={() => chooseWhat(false)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-[#4aa8d8] transition-colors">
                    <div className="text-[13px] font-bold text-gray-900">{s.dlClean}</div>
                    <div className="text-[11px] text-gray-500">{s.dlCleanHint}</div>
                  </button>
                </>
              )}

              {dlStep === 'format' && (
                <>
                  <button data-dl-pdf
                    onClick={() => chooseFormat(true)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-[#4aa8d8] transition-colors">
                    <div className="text-[13px] font-bold text-gray-900">{s.dlPdf}</div>
                    <div className="text-[11px] text-gray-500">{s.dlPdfHint}</div>
                  </button>
                  <button data-dl-images
                    onClick={() => chooseFormat(false)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-[#4aa8d8] transition-colors">
                    <div className="text-[13px] font-bold text-gray-900">{s.dlImages}</div>
                    <div className="text-[11px] text-gray-500">{s.dlImagesHint}</div>
                  </button>
                  <button data-dl-back onClick={() => setDlStep('what')}
                    className="w-full text-center px-3 py-2 rounded-xl text-[12px] font-semibold text-gray-500 hover:bg-gray-50">
                    {s.dlBack}
                  </button>
                </>
              )}

              {dlStep === 'pages' && (
                <>
                  <button data-dl-all
                    onClick={() => runChoice(dlMarkup, dlPdf, allPages())}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-[#4aa8d8] transition-colors">
                    <div className="text-[13px] font-bold text-gray-900">{s.dlPagesAll}</div>
                    <div className="text-[11px] text-gray-500">{doc?.numPages}</div>
                  </button>
                  <button data-dl-one
                    onClick={() => runChoice(dlMarkup, dlPdf, [page])}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-200 hover:border-[#4aa8d8] transition-colors">
                    <div className="text-[13px] font-bold text-gray-900">{s.dlPagesThis}</div>
                    <div className="text-[11px] text-gray-500">{page + 1}</div>
                  </button>
                  <button data-dl-back onClick={() => setDlStep(dlMode === 'print' ? 'what' : 'format')}
                    className="w-full text-center px-3 py-2 rounded-xl text-[12px] font-semibold text-gray-500 hover:bg-gray-50">
                    {s.dlBack}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Which plan — the originals, then the markups made from them. */}
      {/* Which plan, out of which folder. The chooser opens on Engineered
          Plans and can walk the rest of the job's Drive from there. */}
      {showPlans && (
        <PlanPicker
          driveLink={driveFolderUrl}
          plansFolderId={plansFolderId}
          plans={plans}
          current={planFileId}
          onPick={(p, _folder, stayOpen) => {
            onPickPlan?.(p);
            if (!stayOpen) setShowPlans(false);
          }}
          onOpenNewTab={onOpenPlanNewTab && (p => {
            onOpenPlanNewTab(p);
            setShowPlans(false);
          })}
          onClose={() => setShowPlans(false)}
        />
      )}

      {/* The wallboard asks who is drawing before it lets anyone draw. */}
      {askWho && !who && (
        <>
          <div className="fixed inset-0 z-[158] bg-black/55" />
          {/* A long list of names on a 390px-tall screen has to scroll rather
              than run off both ends of it. */}
          <div className="fixed z-[159] rounded-2xl bg-white"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px,92vw)',
                     maxHeight: '92vh', overflowY: 'auto',
                     boxShadow: '0 24px 60px -12px rgba(15,23,42,.5)' }}>
            <div className="px-4 py-3 text-white rounded-t-2xl" style={{ backgroundColor: NAVY }}>
              <div className="text-[14px] font-bold">Who is marking this up?</div>
              <div className="text-[11.5px] text-white/70 mt-0.5">
                This screen is shared, so the version is saved under your name.
              </div>
            </div>
            <div className="p-4 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
              {people.map(n => (
                <button key={n} onClick={() => setWho(n)}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 hover:border-[#4aa8d8] hover:text-[#1e3a5f] transition-colors">
                  {n}
                </button>
              ))}
              {people.length === 0 && (
                <p className="text-[12px] text-gray-500">
                  No users set up yet — add them in app settings.
                </p>
              )}
            </div>
            <div className="px-4 pb-4 flex items-center gap-2">
              <input
                placeholder="Or type a name"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (v) setWho(v);
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-[13px] outline-none focus:ring-2 focus:ring-[#1e3a5f]/25"
              />
              <button onClick={onClose}
                className="px-3 py-2 rounded-xl text-[12.5px] font-semibold text-gray-500 hover:text-gray-700">
                Just looking
              </button>
            </div>
          </div>
        </>
      )}

      {/* Reset: the one action pressing again cannot undo. */}
      {confirmReset && (
        <AskFirst
          title="Take every mark off this plan?"
          body={`${strokes.length} mark${strokes.length === 1 ? '' : 's'} will be rubbed out. `
            + 'Versions already filed are not touched — this is only what is on the plan now.'}
          confirm="Rub them all out"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            setStrokes([]);
            setRedo([]);
            setDirty(true);
          }}
        />
      )}

      {/* Leaving before Drive has it. */}
      {confirmClose && (
        <AskFirst
          title="Drive does not have this yet"
          body={driveIn > 0
            ? `It goes automatically in ${driveIn} second${driveIn === 1 ? '' : 's'}. It is already kept on this computer.`
            : 'It is kept on this computer, but the Drive copy has not gone yet.'}
          confirm="Send it now, then close"
          second="Close anyway"
          onCancel={() => setConfirmClose(false)}
          onSecond={() => { setConfirmClose(false); onClose(); }}
          onConfirm={async () => {
            setConfirmClose(false);
            clearTimeout(idleTimer.current);
            await pushToDrive();
            onClose();
          }}
        />
      )}

      {/* The nib, at the size it will actually draw. A crosshair tells you where
          but never how big, which is the thing you are choosing. */}
      {showNib && nibAt && !showPalette && (
        <span
          ref={nibElRef}
          className="nib-ghost"
          style={{
            left: nibAt.x, top: nibAt.y,
            width: nibPx, height: nibPx,
            border: isEraser ? '2px dashed rgba(255,255,255,.9)' : `2px solid ${color}`,
            backgroundColor: isEraser ? 'transparent' : `${color}22`,
          }}
        />
      )}
    </div>
  );
}

/**
 * One line in the phone's ⋯ sheet.
 *
 * A 44px row with the name in full and what it does underneath. The header
 * these came out of could say "Plans" and rely on a tooltip for the rest;
 * a phone has no hover, so the sentence has to be on the row.
 */
function SheetRow({ icon: Icon, label, hint, danger, disabled, onClick }: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left disabled:opacity-40 hover:bg-slate-50"
      style={{ color: danger ? '#b4342a' : NAVY, minHeight: 46 }}>
      <Icon size={17} />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-bold">{label}</span>
        {hint && <span className="block text-[11px] font-medium text-slate-500 truncate">{hint}</span>}
      </span>
    </button>
  );
}

/**
 * Where the markup has got to, as a journey rather than a sentence.
 *
 * A computer, an arrow with the seconds left inside it, and a Drive. When the
 * count runs out the arrow travels and only the Drive and a tick remain. It is
 * three symbols because the thing being reported is a position — here, on the
 * way, arrived — and a position reads faster as a picture than as the words
 * "Saved here" followed some seconds later by "Safe in Drive".
 *
 * The Drive is a BUTTON: pressing it sends the markup now rather than waiting
 * out the count, which is what somebody about to walk away from the panel
 * wants.
 */
function SaveTrip({ state, secondsLeft, compact, onSendNow }: {
  state: 'clean' | 'local' | 'sending' | 'sent' | 'failed';
  secondsLeft: number;
  /** A phone has no room for the journey — only for where it has got to. */
  compact?: boolean;
  onSendNow: () => void;
}) {
  const failed = state === 'failed';
  const flying = state === 'sending';

  /**
   * On a phone the computer and the arrow go and the Drive stays.
   *
   * Ninety pixels of picture is a quarter of a 390px row, and the row has a
   * pager and a Save button to fit in as well. What is left says the same
   * three things — kept here (grey), on its way (spinning), arrived (green
   * tick) — with the count on the corner, and it is still the button that
   * sends it now.
   */
  if (compact) {
    return (
      <span data-save-state={state} className="flex items-center flex-shrink-0 rounded-lg"
        style={{
          backgroundColor: state === 'sent' ? 'rgba(74,222,128,.14)'
            : failed ? 'rgba(239,68,68,.16)' : 'rgba(255,255,255,.08)',
          color: state === 'sent' ? '#86efac' : failed ? '#fca5a5' : 'rgba(255,255,255,.78)',
        }}
        title={failed
          ? 'Drive would not take it. Your marks are kept here — press to try again.'
          : state === 'sent' ? 'Filed in Drive'
          : 'Kept on this machine. Press to send it to Drive now.'}
      >
        <button data-save-now onClick={onSendNow}
          className="relative rounded-lg flex items-center justify-center min-w-[38px] min-h-[38px]">
          {failed ? <AlertTriangle size={16} /> : <HardDrive size={16} />}
          {state === 'sent' && (
            <Check size={11} className="absolute bottom-1 right-1" />
          )}
          {flying && (
            <Loader2 size={11} className="absolute bottom-1 right-1 animate-spin" />
          )}
          {!flying && !failed && state !== 'sent' && secondsLeft > 0 && (
            <span data-save-count
              className="absolute bottom-0.5 right-1 text-[9px] font-bold tabular-nums">
              {secondsLeft}
            </span>
          )}
        </button>
      </span>
    );
  }

  if (state === 'sent') {
    return (
      <span data-save-state="sent" title="Filed in Drive"
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg flex-shrink-0"
        style={{ backgroundColor: 'rgba(74,222,128,.14)', color: '#86efac' }}>
        <HardDrive size={15} />
        <Check size={12} />
      </span>
    );
  }

  return (
    <span
      data-save-state={state}
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg flex-shrink-0"
      style={{
        backgroundColor: failed ? 'rgba(239,68,68,.16)' : 'rgba(255,255,255,.08)',
        color: failed ? '#fca5a5' : 'rgba(255,255,255,.78)',
      }}
      title={failed
        ? 'Drive would not take it. Your marks are kept here — press the Drive to try again.'
        : 'Kept on this computer. Press the Drive to send it now.'}
    >
      <Monitor size={13} />
      {/* The count sits BESIDE the arrow, never over it — drawn on top of the
          glyph the two were unreadable together (the owner's exact report).
          minWidth keeps the row from breathing as the number counts down. */}
      <span className="flex items-center justify-center gap-1" style={{ minWidth: 34, height: 16 }}>
        <span className={flying ? 'save-fly' : ''} style={{ display: 'flex' }}>
          <ArrowRight size={13} />
        </span>
        {!flying && !failed && secondsLeft > 0 && (
          <span data-save-count className="text-[10px] font-bold tabular-nums leading-none">
            {secondsLeft}s
          </span>
        )}
      </span>
      <button
        data-save-now
        onClick={onSendNow}
        title="Send it to Drive now"
        className="rounded p-0.5 hover:bg-white/15 transition-colors"
      >
        {failed ? <AlertTriangle size={14} /> : <HardDrive size={14} />}
      </button>
    </span>
  );
}


/**
 * A question with a way out, in the studio's own colours.
 *
 * Used for the two things that cannot be taken back by doing them again:
 * rubbing every mark off, and walking away before Drive has the drawing.
 * `second` is the "do it without me" option — offered, never default.
 */
function AskFirst({ title, body, confirm, second, danger, onCancel, onConfirm, onSecond }: {
  title: string; body: string; confirm: string; second?: string; danger?: boolean;
  onCancel: () => void; onConfirm: () => void; onSecond?: () => void;
}) {
  /**
   * The question owns Escape, and nothing behind it hears the key.
   *
   * Capture phase and `stopImmediatePropagation`, because the studio AND the
   * job window behind it both close on Escape — so one press on the question
   * used to dismiss it, close the plan, and close the job, leaving you back on
   * the board wondering what you had pressed.
   */
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onCancel();
    }
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onCancel]);

  return (
    <>
      <div className="fixed inset-0 z-[160]" style={{ backgroundColor: 'rgba(9,14,22,.6)' }}
        onClick={onCancel} />
      <div data-ask-first
        className="fixed z-[161] rounded-2xl shadow-2xl overflow-hidden"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(420px, 92vw)', backgroundColor: '#fff',
        }}>
        <div className="px-5 py-3 font-bold text-[14px] text-white"
          style={{ backgroundColor: danger ? '#b4342a' : NAVY }}>
          {title}
        </div>
        <p className="px-5 py-4 text-[13px] text-slate-600 m-0 leading-snug">{body}</p>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <button onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12.5px] font-semibold text-gray-600">
            Cancel
          </button>
          {second && onSecond && (
            <button data-ask-second onClick={onSecond}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12.5px] font-semibold text-gray-600">
              {second}
            </button>
          )}
          <button data-ask-confirm onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold text-white"
            style={{ backgroundColor: danger ? '#b4342a' : ACCENT }}>
            {confirm}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * The studio/viewer with its TAB STRIP — the exported face.
 *
 * Every plan you open gets a browser-style tab; the strip is remembered on
 * this machine per job, so reopening brings the same tabs back. The EDITOR is
 * remounted per tab (`key`), and a tab's working state travels through
 * `initialWork` in and `workRef` out — stashed in a module-level map for the
 * session, and recoverable across a refresh through the autosaved
 * planAnnotations record each sketch already keeps.
 *
 * Closing a tab whose sketch has not reached Drive asks the one question —
 * "Your work isn't saved. Save to Google Drive?" — and Yes files it through
 * exactly the pipeline the Save button uses (same folder, same naming, same
 * version numbers). Nothing else about saving changes.
 */
type PlanHostProps = Omit<Parameters<typeof PlanEditor>[0],
  'tabStrip' | 'initialWork' | 'workRef' | 'onOpenPlanNewTab' | 'onUnsavedChange'>;

/** Session memory of every tab's work — survives host remounts, not reloads. */
const tabWorkMap = new Map<string, TabWork>();

export function PlanAnnotator(props: PlanHostProps) {
  const {
    planFileId, planName, apartmentId, apartmentLabel, authorName,
    plans = [], readOnly = false, embedded = false, plansFolderId, driveFolderUrl,
    onPickPlan, onToast,
  } = props;
  /**
   * The drawer's pane and the full studio SHARE the tab list, but not a
   * tab's working zoom — a zoom right for a 380px pane is wrong for a
   * full-screen studio, and vice versa. The session work map is therefore
   * scoped per surface, and only the studio writes zoom into the tab meta.
   */
  const surface = embedded ? 'pane' : 'studio';
  const planAnnotations = useStore(s => s.planAnnotations);
  const updatePlanAnnotation = useStore(s => s.updatePlanAnnotation);

  const storeKey = `plan_tabs_${apartmentId || planFileId}`;
  const [state, setState] = useState<{ tabs: PlanTab[]; activeId: string }>(() => {
    const s = loadTabState(storeKey);
    const existing = s.tabs.find(t => t.fileId === planFileId);
    if (existing) return { tabs: s.tabs, activeId: existing.id };
    const t = mintTab(planFileId, planName || 'Plan');
    return { tabs: [...s.tabs, t], activeId: t.id };
  });
  const { tabs, activeId } = state;
  const active = tabs.find(t => t.id === activeId) ?? tabs[0];

  const workRef = useRef<TabWork | null>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const tabsRef = useRef(state); tabsRef.current = state;
  const planNameRef = useRef(planName); planNameRef.current = planName;
  const planFileIdRef = useRef(planFileId); planFileIdRef.current = planFileId;
  const [activeUnsaved, setActiveUnsaved] = useState(false);
  const [ask, setAsk] = useState<{ tabId: string } | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  /** The + on the strip opens the file chooser — see newTabPlus. */
  const [plusOpen, setPlusOpen] = useState(false);
  /**
   * Markups saved WHILE the studio is open. The host's plan list is what it
   * fetched when it opened, so a version filed ten seconds ago is not on
   * it — these are folded in so the picker shows what was just saved.
   */
  const [savedExtras, setSavedExtras] = useState<PlanChoice[]>([]);
  const noteSaved = useCallback((p: PlanChoice) => {
    setSavedExtras(prev => (prev.some(x => x.id === p.id) ? prev : [p, ...prev]));
  }, []);
  const mergedPlans = useMemo(() => {
    const have = new Set(plans.map(x => x.id));
    const extra = savedExtras.filter(x => !have.has(x.id));
    return extra.length ? [...extra, ...plans] : plans;
  }, [plans, savedExtras]);

  const wkey = useCallback((t: PlanTab) => `${apartmentId}:${surface}:${t.id}:${t.fileId}`,
    [apartmentId, surface]);

  /**
   * Put the active tab's live work into the session map and return a patch
   * that carries its pointers (sketch record, page, zoom) onto the tab meta.
   * Called BEFORE any setState that changes which tab is active — never
   * inside an updater, which must stay pure.
   */
  const stashActive = useCallback((): ((tabs: PlanTab[]) => PlanTab[]) => {
    const w = workRef.current, act = activeRef.current;
    if (!w || !act) return t => t;
    // dirty stays behind: the marks are already kept locally, and re-arming
    // the Drive timer on every switch would stamp duplicate files.
    tabWorkMap.set(wkey(act), { ...w, dirty: false });
    // Only the STUDIO writes page and zoom into the shared tab meta — the
    // pane always fits on open, and its numbers are wrong for the studio.
    const patch = surface === 'studio'
      ? {
        versionId: w.versionId, sketchVersion: w.sketchVersion,
        basedOn: w.basedOn, page: w.page, scale: w.scale,
      }
      : { versionId: w.versionId, sketchVersion: w.sketchVersion, basedOn: w.basedOn };
    return ts => ts.map(t => (t.id === act.id ? { ...t, ...patch } : t));
  }, [wkey, surface]);
  const stashRef = useRef(stashActive); stashRef.current = stashActive;

  /** A refreshed browser recovers a tab's marks from its autosaved record. */
  const workFromRecord = useCallback((t: PlanTab): TabWork | undefined => {
    if (!t.versionId) return undefined;
    const rec = planAnnotations.find(a => a.id === t.versionId);
    if (!rec) return undefined;
    return {
      strokes: rec.strokes ?? [], redo: [], basedOn: t.basedOn, dirty: false,
      saveState: rec.driveUrl ? 'sent' : 'local',
      page: t.page ?? 0, scale: t.scale ?? null,
      versionId: rec.id, sketchVersion: rec.version ?? t.sketchVersion ?? null,
    };
  }, [planAnnotations]);

  const initialWork = useMemo<TabWork | undefined>(() => {
    if (!active) return undefined;
    // The pane never inherits a remembered zoom — it fits on open, always.
    const noZoom = (w: TabWork): TabWork => (embedded ? { ...w, scale: null } : w);
    const w = tabWorkMap.get(wkey(active));
    if (w) return noZoom(w);
    const fromRec = workFromRecord(active);
    if (fromRec) return noZoom(fromRec);
    if (active.page || active.scale != null) {
      return noZoom({
        strokes: [], redo: [], dirty: false, saveState: 'clean',
        page: active.page ?? 0, scale: active.scale ?? null,
        versionId: null, sketchVersion: null,
      });
    }
    return undefined;
  // Only the mounted tab's identity — the editor reads this once, at mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.fileId]);

  // The host drove planFileId (a chip, the drawer) — adopt it: an existing
  // tab on that file is activated, otherwise the active tab is retargeted,
  // which is exactly what pressing a picker row did before tabs existed.
  const prevProp = useRef(planFileId);
  useEffect(() => {
    if (prevProp.current === planFileId) return;
    prevProp.current = planFileId;
    const act = activeRef.current;
    if (act?.fileId === planFileId) return;
    const apply = stashRef.current();
    setState(s => {
      const ex = s.tabs.find(t => t.fileId === planFileId);
      if (ex) return { tabs: apply(s.tabs), activeId: ex.id };
      return {
        tabs: apply(s.tabs).map(t => (t.id === s.activeId
          ? {
            ...t, fileId: planFileId, name: planNameRef.current || t.name,
            versionId: null, sketchVersion: null, basedOn: undefined, page: 0, scale: null,
          }
          : t)),
        activeId: s.activeId,
      };
    });
  }, [planFileId]);

  // Remember the strip on this machine, and flush it when the page goes.
  useEffect(() => { saveTabState(storeKey, tabs, activeId); }, [storeKey, tabs, activeId]);
  useEffect(() => {
    const flush = () => {
      const apply = stashRef.current();
      const s = tabsRef.current;
      saveTabState(storeKey, apply(s.tabs), s.activeId);
    };
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); };
  }, [storeKey]);

  // The downloaded copies live only while a viewer is open — reference
  // counted, because the drawer pane and the studio can be open at once.
  useEffect(() => {
    acquirePlanCache();
    return () => releasePlanCache();
  }, []);
  // Download the job's OTHER plans in the background, one at a time.
  useEffect(() => {
    const others = mergedPlans.map(p => p.id).filter(id => id !== activeRef.current?.fileId);
    if (others.length) prefetchPlans(others);
  }, [mergedPlans]);

  const pickTab = useCallback((id: string) => {
    if (id === activeRef.current?.id) return;
    const apply = stashRef.current();
    setState(s => ({ tabs: apply(s.tabs), activeId: id }));
  }, []);

  const openInNewTab = useCallback((p: PlanChoice) => {
    const apply = stashRef.current();
    const t = mintTab(p.id, p.name, p.kind);
    setState(s => ({ tabs: [...apply(s.tabs), t], activeId: t.id }));
  }, []);

  /**
   * The + on the strip opens the FILE CHOOSER (the owner's ask: "upon
   * opening a new tab, I should see the file picker"). Whatever is picked
   * opens in a fresh tab; picking a file already open in another tab
   * deliberately makes a COPY — a clean sketch of the same sheet, named so
   * the strip tells the two apart. Opening is looking, never choosing: the
   * + never writes plansPdfLink, so the contractor's plan cannot change
   * because somebody opened a tab.
   */
  const newTabPlus = useCallback(() => { setPlusOpen(true); }, []);
  const plusPick = useCallback((p: PlanChoice) => {
    setPlusOpen(false);
    const apply = stashRef.current();
    const alreadyOpen = tabsRef.current.tabs.some(t => t.fileId === p.id);
    const t = mintTab(p.id, alreadyOpen ? `${p.name} · copy` : p.name, p.kind);
    setState(s => ({ tabs: [...apply(s.tabs), t], activeId: t.id }));
  }, []);

  const reallyClose = useCallback((id: string) => {
    const closingActive = activeRef.current?.id === id;
    const apply = closingActive ? (x: PlanTab[]) => x : stashRef.current();
    setState(s => {
      const idx = s.tabs.findIndex(t => t.id === id);
      let nextTabs = apply(s.tabs).filter(t => t.id !== id);
      let nextActive = s.activeId;
      if (!nextTabs.length) {
        const t = mintTab(planFileIdRef.current, planNameRef.current || 'Plan');
        nextTabs = [t]; nextActive = t.id;
      } else if (s.activeId === id) {
        nextActive = nextTabs[Math.max(0, idx - 1)]?.id ?? nextTabs[0].id;
      }
      return { tabs: nextTabs, activeId: nextActive };
    });
    for (const k of [...tabWorkMap.keys()]) {
      // Both surfaces' stashes for the closed tab go with it.
      if (k.startsWith(`${apartmentId}:`) && k.includes(`:${id}:`)) tabWorkMap.delete(k);
    }
  }, [apartmentId]);

  const liveWorkOf = useCallback((t: PlanTab): TabWork | undefined => {
    if (t.id === activeRef.current?.id) return workRef.current ?? undefined;
    return tabWorkMap.get(wkey(t)) ?? workFromRecord(t);
  }, [wkey, workFromRecord]);

  const closeTab = useCallback((id: string) => {
    const t = tabsRef.current.tabs.find(x => x.id === id);
    if (!t) return;
    const w = liveWorkOf(t);
    const unsaved = !readOnly && !!w && w.strokes.length > 0 && w.saveState !== 'sent';
    const canDrive = isUploadBackendConfigured()
      && !!(plansFolderId || (driveFolderUrl && extractFolderId(driveFolderUrl)));
    // No question when there is nothing to lose — or nowhere to send it: the
    // marks are autosaved on this machine and stand in the version list.
    if (unsaved && canDrive) { setAsk({ tabId: id }); return; }
    reallyClose(id);
  }, [liveWorkOf, readOnly, plansFolderId, driveFolderUrl, reallyClose]);

  const saveAskAndClose = useCallback(async () => {
    const id = ask?.tabId;
    const t = id ? tabsRef.current.tabs.find(x => x.id === id) : undefined;
    if (!t) { setAsk(null); return; }
    const w = liveWorkOf(t);
    if (!w || !w.strokes.length) { setAsk(null); reallyClose(t.id); return; }
    setAskBusy(true);
    try {
      const parent = plansFolderId || (driveFolderUrl ? extractFolderId(driveFolderUrl) : null);
      const version = w.sketchVersion
        ?? (Math.max(0, ...planAnnotations
          .filter(a => a.apartmentId === apartmentId && a.planFileId === t.fileId)
          .map(a => a.version)) + 1);
      const out = await stampPlanToDrive({
        planFileId: t.fileId,
        parentFolderId: parent!,
        strokes: w.strokes.map(({ id: _i, ...rest }) => rest),
        version,
        jobName: apartmentLabel,
        author: authorName,
        // The same one-file-per-version rule as the studio's own saves: if
        // this sketch's autosave already made a Drive file, bring THAT file
        // up to date rather than filing a second copy on the way out.
        updateFileId: w.versionId
          ? planAnnotations.find(a => a.id === w.versionId)?.driveFileId ?? null
          : null,
      });
      if (w.versionId) {
        updatePlanAnnotation(w.versionId, { driveFileId: out.fileId, driveUrl: out.webViewLink });
      }
      noteSaved({ id: out.fileId, name: out.name, kind: 'annotated' });
      onToast?.(`Version ${version} filed in Drive under “Annotated Plans”.`);
      setAsk(null);
      reallyClose(t.id);
    } catch {
      onToast?.('Drive would not take it — the tab stays open.', 'error');
    } finally {
      setAskBusy(false);
    }
  }, [ask, liveWorkOf, reallyClose, plansFolderId, driveFolderUrl, planAnnotations,
      apartmentId, apartmentLabel, authorName, updatePlanAnnotation, onToast, noteSaved]);

  const unsavedOf = useCallback((t: PlanTab): boolean => {
    if (readOnly) return false;
    if (t.id === activeId) return activeUnsaved;
    const w = tabWorkMap.get(wkey(t));
    if (w) return w.strokes.length > 0 && w.saveState !== 'sent';
    if (t.versionId) {
      const rec = planAnnotations.find(a => a.id === t.versionId);
      if (rec) return (rec.strokes?.length ?? 0) > 0 && !rec.driveUrl;
    }
    return false;
  }, [readOnly, activeId, activeUnsaved, wkey, planAnnotations]);

  /** Picks from the Plans chooser: a sketch gets ITS OWN tab; an original
   *  replaces the current tab (as pressing a row always did) and still goes
   *  through the host, which is what writes plansPdfLink for originals. */
  const handlePick = useCallback((p: PlanChoice) => {
    if (p.kind === 'annotated') { openInNewTab(p); return; }
    const apply = stashRef.current();
    setState(s => {
      const act = s.tabs.find(t => t.id === s.activeId);
      if (act?.fileId === p.id) return s;
      const ex = s.tabs.find(t => t.fileId === p.id);
      if (ex) return { tabs: apply(s.tabs), activeId: ex.id };
      return {
        tabs: apply(s.tabs).map(t => (t.id === s.activeId
          ? {
            ...t, fileId: p.id, name: p.name,
            versionId: null, sketchVersion: null, basedOn: undefined, page: 0, scale: null,
          }
          : t)),
        activeId: s.activeId,
      };
    });
    onPickPlan?.(p);
  }, [openInNewTab, onPickPlan]);

  if (!active) return null;

  return (<>
    <PlanEditor
      {...props}
      key={`${active.id}:${active.fileId}`}
      planFileId={active.fileId}
      planName={active.name || planName}
      /*
        The tab strip belongs to the markup STUDIO alone (owner's decision 2,
        sealed 2026-08-30): no preview draws it — not the drawer's side pane,
        not the phone's Plan tab, not the wallboard, not the worker's portal.
        `!readOnly && !embedded` is exactly that set. The tab STATE stays: a
        preview simply does not draw the strip, and its + and per-tab close
        do not exist there.
      */
      tabStrip={(!readOnly && !embedded) ? (
        <PlanTabsStrip
          tabs={tabs}
          activeId={active.id}
          showClouds={!readOnly}
          unsavedOf={unsavedOf}
          onPick={pickTab}
          onCloseTab={closeTab}
          onNewTab={newTabPlus}
        />
      ) : undefined}
      initialWork={initialWork}
      workRef={workRef}
      plans={mergedPlans}
      onSavedToDrive={noteSaved}
      onUnsavedChange={setActiveUnsaved}
      onPickPlan={handlePick}
      /* No strip means no visible tab to open into — the picker's
         open-in-new-tab rows exist only where the strip does. */
      onOpenPlanNewTab={(!readOnly && !embedded) ? openInNewTab : undefined}
    />

    {/* The + pressed: which file goes in the new tab? Every pick opens in a
        fresh tab; the same file again is a deliberate copy. */}
    {plusOpen && (
      <PlanPicker
        driveLink={driveFolderUrl}
        plansFolderId={plansFolderId ?? undefined}
        plans={mergedPlans}
        current={active.fileId}
        onPick={p => plusPick(p)}
        onClose={() => setPlusOpen(false)}
      />
    )}

    {/* The one question, only when closing would lose marks Drive never got. */}
    {ask && (<>
      <div className="fixed inset-0 z-[168]" style={{ backgroundColor: 'rgba(9,14,22,.5)' }}
        onClick={() => { if (!askBusy) setAsk(null); }} />
      <div data-tab-ask className="fixed z-[169] rounded-2xl overflow-hidden shadow-2xl"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                 width: 'min(320px, 92vw)', backgroundColor: '#fff' }}>
        <div className="px-5 pt-4">
          <div className="text-[14px] font-extrabold text-gray-900">Your work isn&rsquo;t saved.</div>
          <p className="text-[12.5px] text-gray-500 mt-1 mb-4">
            Save this sketch to Google Drive before closing the tab?
          </p>
        </div>
        <div className="flex gap-2 px-5 pb-4">
          <button data-tab-ask-save disabled={askBusy}
            onClick={() => { void saveAskAndClose(); }}
            className="flex-1 py-2 rounded-xl text-[12.5px] font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: NAVY }}>
            {askBusy ? 'Saving…' : 'Save to Drive'}
          </button>
          <button data-tab-ask-discard disabled={askBusy}
            onClick={() => { const id = ask.tabId; setAsk(null); reallyClose(id); }}
            className="flex-1 py-2 rounded-xl text-[12.5px] font-bold text-slate-600 disabled:opacity-60"
            style={{ backgroundColor: '#f1f5f9' }}>
            Close without saving
          </button>
        </div>
      </div>
    </>)}
  </>);
}
