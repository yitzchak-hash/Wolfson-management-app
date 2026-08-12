import type React from 'react';

/**
 * Board surfaces.
 *
 * Each theme changes the paper, the node body, the border treatment, the note
 * and the title together — a real design each, not a colour tint. The current
 * look is `default` and stays the default.
 *
 * A theme never overrides a job's STAGE colour: that is data, and it must read
 * identically on every surface. Themes control everything around it.
 */
export interface BoardTheme {
  id: string;
  name: string;
  /** Canvas background shorthand + optional pattern layers. */
  surface: React.CSSProperties;
  /** Node body (the stage colour still supplies the border). */
  node: React.CSSProperties;
  /** Sticky note. */
  note: React.CSSProperties;
  /** Pinned title / section heading. */
  title: React.CSSProperties;
  /** True when the surface is dark, so text flips to light. */
  dark?: boolean;
  /**
   * The frame a bin window is drawn in.
   *
   * A bin holding cork-board jobs should look like a piece of that cork board,
   * with the timber surround a real one has — not a plain white dialog with the
   * texture pasted inside it. Themes without a physical frame leave this unset
   * and get a plain surround.
   */
  frame?: React.CSSProperties;
}

/**
 * The RULE for a repeating surface, kept alongside the CSS.
 *
 * The pattern used to be painted inside the zoomed world, so at 25% a 22px dot
 * grid landed 5px apart and turned to mush, and further out it disappeared
 * altogether — the board stopped looking like a board exactly when you most
 * needed to know where you were. Keeping the rule (rather than only the CSS it
 * produced) means the pattern can be regenerated at whatever spacing suits the
 * current zoom, which is what every serious node editor does.
 */
export type SurfaceTile =
  | { kind: 'dots'; colour: string; size: number }
  | { kind: 'grid'; major: string; minor: string; m: number; n: number };

/** Surfaces carry their rule on the side; textures without one are unchanged. */
export interface TiledSurface extends React.CSSProperties {
  tile?: SurfaceTile;
}

const dots = (c: string, size = 22): TiledSurface => ({
  backgroundImage: `radial-gradient(circle, ${c} 1px, transparent 1px)`,
  backgroundSize: `${size}px ${size}px`,
  tile: { kind: 'dots', colour: c, size },
});

const grid = (major: string, minor: string, m = 70, n = 14): TiledSurface => ({
  backgroundImage:
    `linear-gradient(${major} 1px, transparent 1px),linear-gradient(90deg, ${major} 1px, transparent 1px),` +
    `linear-gradient(${minor} 1px, transparent 1px),linear-gradient(90deg, ${minor} 1px, transparent 1px)`,
  backgroundSize: `${m}px ${m}px, ${m}px ${m}px, ${n}px ${n}px, ${n}px ${n}px`,
  tile: { kind: 'grid', major, minor, m, n },
});

/**
 * The surface as it should be painted on SCREEN at this zoom.
 *
 * The spacing is stepped by powers of two until it lands in a comfortable band
 * — so zooming out makes the squares smaller and smaller and then, rather than
 * vanishing, they step up to the next size and start again. The board is
 * always legibly a board, at 10% or at 300%.
 *
 * `pan` shifts the pattern so it travels with the world. CSS repeats it, so no
 * modulo is needed here: a background position of −4000px paints identically
 * to one of −4000 mod size.
 */
const COMFY_MIN = 13;   // below this, dots merge and lines turn to fog
const COMFY_MAX = 60;   // above this, the field reads as stripes rather than paper

export function surfaceAtZoom(
  surface: TiledSurface,
  zoom: number,
  pan: { x: number; y: number },
): React.CSSProperties {
  const tile = surface.tile;
  const { tile: _drop, backgroundColor: _bg, ...rest } = surface;
  if (!tile || !Number.isFinite(zoom) || zoom <= 0) return rest;

  /** Multiply or divide by two until one tile is a comfortable size on screen. */
  const step = (base: number) => {
    let n = base * zoom;
    if (n <= 0) return base;
    while (n < COMFY_MIN) n *= 2;
    while (n > COMFY_MAX) n /= 2;
    return n;
  };

  if (tile.kind === 'dots') {
    const s = step(tile.size);
    return {
      backgroundImage: `radial-gradient(circle, ${tile.colour} 1px, transparent 1px)`,
      backgroundSize: `${s}px ${s}px`,
      backgroundPosition: `${pan.x}px ${pan.y}px`,
    };
  }

  // The two scales are stepped TOGETHER, from the minor one, so the major
  // lines stay a whole number of minor squares apart however far out you are.
  const ratio = Math.max(2, Math.round(tile.m / tile.n));
  const minor = step(tile.n);
  const major = minor * ratio;
  return {
    backgroundImage:
      `linear-gradient(${tile.major} 1px, transparent 1px),linear-gradient(90deg, ${tile.major} 1px, transparent 1px),` +
      `linear-gradient(${tile.minor} 1px, transparent 1px),linear-gradient(90deg, ${tile.minor} 1px, transparent 1px)`,
    backgroundSize: `${major}px ${major}px, ${major}px ${major}px, ${minor}px ${minor}px, ${minor}px ${minor}px`,
    backgroundPosition:
      `${pan.x}px ${pan.y}px, ${pan.x}px ${pan.y}px, ${pan.x}px ${pan.y}px, ${pan.x}px ${pan.y}px`,
  };
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'default', name: 'Default',
    surface: { backgroundColor: '#ffffff', ...dots('rgba(120,140,170,.28)') },
    node: { backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 2px 6px rgba(15,23,42,.11)' },
    note: { backgroundColor: '#fef3c7', borderRadius: '8px', color: '#78350f', boxShadow: '0 2px 5px rgba(15,23,42,.12)' },
    title: { color: '#0f172a', fontWeight: 800 },
  },
  {
    id: 'blueprint-light', name: 'Light blueprint',
    surface: { backgroundColor: '#f7fbff', ...grid('rgba(37,99,235,.16)', 'rgba(37,99,235,.07)') },
    node: { backgroundColor: '#ffffff', borderRadius: '3px', boxShadow: '2px 2px 0 rgba(37,99,235,.16)' },
    note: { backgroundColor: 'rgba(219,234,254,.85)', border: '1px dashed #60a5fa', borderRadius: '2px', color: '#1e40af', fontFamily: 'ui-monospace, monospace' },
    title: { color: '#1d4ed8', fontFamily: 'ui-monospace, monospace', letterSpacing: '.09em', fontWeight: 800 },
  },
  {
    id: 'blueprint-dark', name: 'Dark blueprint',
    surface: { backgroundColor: '#0e3a5c', ...grid('rgba(255,255,255,.10)', 'rgba(255,255,255,.04)') },
    node: { backgroundColor: 'rgba(6,30,50,.88)', borderRadius: '6px', color: '#dbeafe' },
    note: { backgroundColor: 'rgba(191,219,254,.13)', border: '1px dashed #7dd3fc', borderRadius: '3px', color: '#e0f2fe' },
    title: { color: '#bfdbfe', fontFamily: 'ui-monospace, monospace', letterSpacing: '.09em', fontWeight: 800 },
    dark: true,
  },
  {
    id: 'cork', name: 'Cork board',
    surface: {
      backgroundColor: '#b98a52',
      boxShadow: 'inset 0 0 40px rgba(70,40,12,.45)',
      backgroundImage: [
        'radial-gradient(ellipse 3px 2px at 12% 22%, rgba(96,56,20,.42), transparent)',
        'radial-gradient(ellipse 2px 3px at 38% 61%, rgba(140,96,48,.40), transparent)',
        'radial-gradient(ellipse 4px 2px at 63% 18%, rgba(84,48,16,.36), transparent)',
        'radial-gradient(ellipse 2px 2px at 82% 74%, rgba(150,104,54,.42), transparent)',
        'radial-gradient(ellipse 3px 3px at 27% 88%, rgba(92,52,18,.34), transparent)',
        'radial-gradient(ellipse 2px 3px at 54% 40%, rgba(158,112,60,.34), transparent)',
      ].join(','),
      backgroundSize: '47px 41px,63px 57px,39px 44px,71px 66px,53px 49px,44px 38px',
    },
    node: { backgroundColor: '#fffdf5', borderRadius: '4px', boxShadow: '0 5px 11px rgba(50,26,6,.40)' },
    note: { backgroundColor: '#fde68a', borderRadius: '2px', color: '#5b3d05', boxShadow: '0 5px 11px rgba(50,26,6,.36)' },
    title: { color: '#402711', fontFamily: 'Georgia, serif', fontWeight: 800 },
    // Stained timber with a bevel, the way a real cork board is surrounded.
    frame: {
      padding: '14px',
      background: 'linear-gradient(150deg,#8a5a2b,#6f4520 42%,#7d5027 60%,#5c3617)',
      boxShadow: 'inset 0 1px 0 rgba(255,225,180,.35), inset 0 -2px 3px rgba(0,0,0,.45), 0 18px 44px rgba(0,0,0,.45)',
      borderRadius: '10px',
    },
  },
  {
    id: 'whiteboard', name: 'Whiteboard',
    surface: {
      backgroundColor: '#fbfcfd',
      backgroundImage: 'linear-gradient(rgba(15,23,42,.04) 1px, transparent 1px),linear-gradient(90deg, rgba(15,23,42,.04) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    },
    node: { backgroundColor: '#ffffff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(15,23,42,.10)' },
    note: { backgroundColor: '#fef9c3', borderRadius: '6px', color: '#713f12' },
    title: { color: '#1e40af', fontFamily: "'Comic Sans MS','Segoe Print',cursive", fontWeight: 800 },
    // The aluminium trim a whiteboard is edged with.
    frame: {
      padding: '11px',
      background: 'linear-gradient(160deg,#dfe4ea,#b9c0ca 45%,#cfd6de)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), 0 16px 40px rgba(15,23,42,.28)',
      borderRadius: '8px',
    },
  },
  {
    id: 'dark-studio', name: 'Dark studio',
    surface: { backgroundColor: '#0b0f19', ...dots('rgba(148,163,184,.13)') },
    node: { backgroundColor: '#151b2b', borderRadius: '10px', color: '#e5e7eb' },
    note: { backgroundColor: '#1c2438', border: '1px solid #334155', borderLeft: '3px solid #a78bfa', borderRadius: '6px', color: '#cbd5e1' },
    title: { color: '#f1f5f9', fontWeight: 800 },
    dark: true,
  },
  {
    id: 'site-plan', name: 'Site plan',
    surface: {
      backgroundColor: '#f4efe3',
      backgroundImage: 'linear-gradient(rgba(120,90,50,.12) 1px, transparent 1px),linear-gradient(90deg, rgba(120,90,50,.12) 1px, transparent 1px)',
      backgroundSize: '30px 30px',
    },
    node: { backgroundColor: '#fffdf7', borderRadius: '2px', boxShadow: '2px 2px 0 rgba(120,90,50,.16)' },
    note: { backgroundColor: '#fdf6e3', border: '1px solid #b9a887', borderRadius: '2px', color: '#5b4a2c', fontFamily: 'ui-monospace, monospace' },
    title: { color: '#5b4a2c', fontFamily: 'ui-monospace, monospace', letterSpacing: '.13em', fontWeight: 800 },
  },
  {
    id: 'engineering-pad', name: 'Engineering pad',
    surface: { backgroundColor: '#eff6ee', ...grid('rgba(34,120,60,.20)', 'rgba(34,120,60,.08)', 56, 11) },
    node: { backgroundColor: '#ffffff', borderRadius: '2px', boxShadow: '1px 1px 0 rgba(20,83,45,.20)' },
    note: { backgroundColor: '#ffffff', border: '1px solid #86b986', borderRadius: '2px', color: '#166534', fontFamily: 'ui-monospace, monospace' },
    title: { color: '#166534', fontFamily: 'ui-monospace, monospace', fontWeight: 800 },
  },
  {
    id: 'chalkboard', name: 'Chalkboard',
    surface: {
      backgroundColor: '#2b3a35',
      backgroundImage: 'radial-gradient(circle at 25% 35%, rgba(255,255,255,.05) 1px, transparent 2px),radial-gradient(circle at 70% 65%, rgba(255,255,255,.04) 1px, transparent 2px)',
      backgroundSize: '40px 40px, 55px 55px',
    },
    node: { backgroundColor: 'rgba(255,255,255,.06)', borderRadius: '8px', color: '#e7ece9' },
    note: { backgroundColor: 'rgba(253,246,227,.09)', border: '1px dashed #d6d3d1', borderRadius: '3px', color: '#fdf6e3', fontFamily: "'Comic Sans MS','Segoe Print',cursive" },
    title: { color: '#fdf6e3', fontFamily: "'Comic Sans MS','Segoe Print',cursive", fontWeight: 800 },
    dark: true,
  },
  {
    id: 'kraft', name: 'Kraft workshop',
    surface: {
      backgroundColor: '#c8a97e',
      backgroundImage: 'repeating-linear-gradient(96deg, rgba(120,84,44,.07) 0 2px, transparent 2px 5px),repeating-linear-gradient(4deg, rgba(150,110,62,.07) 0 2px, transparent 2px 6px)',
    },
    node: { backgroundColor: '#f6ead6', borderRadius: '2px', boxShadow: '2px 3px 0 rgba(70,46,18,.22)' },
    note: { backgroundColor: '#fffdf0', border: '1px solid #a9865a', borderRadius: '1px', color: '#4a3418', boxShadow: '2px 3px 0 rgba(70,46,18,.20)' },
    title: { color: '#4a3418', fontFamily: 'ui-monospace, monospace', letterSpacing: '.11em', textTransform: 'uppercase', fontWeight: 800 },
  },
  {
    id: 'steel', name: 'Steel shop',
    surface: {
      background: 'linear-gradient(180deg,#3f4650,#2b313a)',
      backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 1px, transparent 1px 3px)',
    },
    node: { background: 'linear-gradient(180deg,#4b525d,#39404a)', borderRadius: '3px', color: '#e8eaed', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14)' },
    note: { backgroundColor: '#2f353e', border: '1px solid #5b6470', borderLeft: '3px solid #facc15', borderRadius: '2px', color: '#e5e7eb', fontFamily: 'ui-monospace, monospace' },
    title: { color: '#f9fafb', fontFamily: 'ui-monospace, monospace', letterSpacing: '.10em', fontWeight: 800 },
    dark: true,
  },
  {
    id: 'linen', name: 'Linen pinboard',
    surface: {
      backgroundColor: '#9aa3ad',
      boxShadow: 'inset 0 0 46px rgba(40,50,62,.30)',
      backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,.045) 0 1px, transparent 1px 3px),repeating-linear-gradient(90deg, rgba(0,0,0,.035) 0 1px, transparent 1px 3px)',
    },
    node: { backgroundColor: '#ffffff', borderRadius: '5px', boxShadow: '0 4px 10px rgba(30,38,48,.30)' },
    note: { backgroundColor: '#fff9d6', borderRadius: '3px', color: '#4a4218', boxShadow: '0 4px 10px rgba(30,38,48,.26)' },
    title: { color: '#1f2937', fontWeight: 800, letterSpacing: '.01em' },
  },
  {
    id: 'manila', name: 'Manila files',
    surface: {
      backgroundColor: '#d9c39a',
      backgroundImage: 'repeating-linear-gradient(0deg, rgba(120,95,55,.05) 0 1px, transparent 1px 4px)',
    },
    // The folder tab is drawn by the tile; the body carries the crease.
    node: {
      backgroundColor: '#f7ecd2', borderRadius: '3px 8px 3px 3px',
      boxShadow: '2px 3px 0 rgba(90,70,36,.20)',
      backgroundImage: 'linear-gradient(90deg, transparent 47%, rgba(150,120,70,.16) 47.4%, transparent 48%)',
    },
    note: { backgroundColor: '#fffaf0', border: '1px solid #b59b6c', borderRadius: '1px', color: '#4a3a1c', fontFamily: 'ui-monospace, monospace' },
    title: { color: '#4a3a1c', fontFamily: 'ui-monospace, monospace', letterSpacing: '.08em', fontWeight: 800 },
  },
];

export function getBoardTheme(id: string | undefined): BoardTheme {
  return BOARD_THEMES.find(t => t.id === id) ?? BOARD_THEMES[0];
}
