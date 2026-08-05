import { AnnTool } from '../../types';

/**
 * The markup kit.
 *
 * Each tool is a preset — a starting width, opacity and behaviour — not a
 * separate code path. Everything downstream (the on-screen ink, the PDF
 * stamper, the print sheet) reads the same three numbers, so a tool added here
 * appears everywhere without anything else changing.
 */
export interface ToolPreset {
  id: AnnTool | 'eraser' | 'pan';
  label: string;
  /** Base width against a 1000-unit-wide reference page. */
  width: number;
  opacity: number;
  /** Freehand tools sample continuously; the rest are drag-from-A-to-B. */
  freehand: boolean;
  /** How strongly pen pressure / nib size moves the width. */
  sensitivity: number;
  /** Straight-line tools snap to 15° when shift is held. */
  snappable?: boolean;
  hint: string;
}

export const TOOLS: ToolPreset[] = [
  {
    id: 'pen', label: 'Pen', width: 3, opacity: 1, freehand: true, sensitivity: 1,
    hint: 'Follows pen pressure — or nib size on the Samsung screen',
  },
  {
    id: 'pencil', label: 'Pencil', width: 1.8, opacity: 0.72, freehand: true, sensitivity: 1.35,
    hint: 'Light and thin, for working things out',
  },
  {
    id: 'marker', label: 'Marker', width: 9, opacity: 0.95, freehand: true, sensitivity: 0.45,
    hint: 'Thick and even, for marking up on site',
  },
  {
    id: 'highlighter', label: 'Highlighter', width: 26, opacity: 0.38, freehand: true, sensitivity: 0,
    hint: 'Multiplies, so the linework underneath stays crisp',
  },
  {
    id: 'line', label: 'Line', width: 3, opacity: 1, freehand: false, sensitivity: 0, snappable: true,
    hint: 'Hold Shift to snap to 15°',
  },
  {
    id: 'arrow', label: 'Arrow', width: 3, opacity: 1, freehand: false, sensitivity: 0, snappable: true,
    hint: 'Points at what you mean',
  },
  {
    id: 'rect', label: 'Box', width: 2.5, opacity: 1, freehand: false, sensitivity: 0,
    hint: 'Hold Shift for a square',
  },
  {
    id: 'ellipse', label: 'Circle', width: 2.5, opacity: 1, freehand: false, sensitivity: 0,
    hint: 'Hold Shift for a circle',
  },
  {
    id: 'text', label: 'Text', width: 0, opacity: 1, freehand: false, sensitivity: 0,
    hint: 'Click where the note goes',
  },
  {
    id: 'eraser', label: 'Eraser', width: 18, opacity: 1, freehand: true, sensitivity: 0,
    hint: 'Removes whole marks, not pixels — nothing on the plan itself can be rubbed out',
  },
];

export const toolById = (id: string) => TOOLS.find(t => t.id === id) ?? TOOLS[0];

/**
 * Ink colours.
 *
 * Weighted toward what actually gets used on a services drawing: red for
 * "wrong", green for "done", blue for a note, plus the highlighter shades.
 */
export const INK_COLORS = [
  '#dc2626', '#ea580c', '#f59e0b', '#16a34a', '#0d9488',
  '#2563eb', '#7c3aed', '#db2777', '#111827', '#6b7280', '#ffffff',
];

export const HIGHLIGHT_COLORS = [
  '#fde047', '#86efac', '#7dd3fc', '#fda4af', '#d8b4fe', '#fdba74',
];

/** Recently used custom colours, so a matched job colour is one click away. */
const RECENT_KEY = 'plan_ink_recent';

export function recentColors(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 8) : [];
  } catch { return []; }
}

export function rememberColor(hex: string) {
  try {
    const next = [hex, ...recentColors().filter(c => c !== hex)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode — a lost colour history is not worth an error */ }
}
