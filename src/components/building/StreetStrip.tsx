/**
 * THE STREET under the building labels (owner, 2026-11-17: "I need a street view right under the B2 and B1 and the
 * standard plan bubble … really high-end"; of three designs he chose "Sunset boulevard"): a boulevard seen from
 * above in evening light — warm asphalt, a double centre line, a crossing in front of each building's entrance,
 * palms throwing shadows over the road, lamps with pools of light, parked cars.
 *
 * Drawn once as plain SVG — no pictures, no library. Two cars drive (on the right, as in Israel) only on a wide
 * screen with a mouse and only when the person has not asked for less motion (buildingView.css); on phones and
 * tablets everything stands still, so it costs nothing to keep on screen.
 *
 * `entrances`: where each building's door meets the street, as a share of the width (0..1), left to right.
 */
/**
 * Which projects have the street: W Residence (Wolfson) only — the one he approved on the placement page
 * (2026-11-17); he left Netiv unticked. A view given no plan draws Wolfson's.
 */
export const hasStreet = (plan?: { id: string }): boolean => !plan || plan.id === 'wolfson';

const W = 1400, H = 250, R0 = 40, R1 = 172, MID = (R0 + R1) / 2;
const C = {
  road0: '#3a3340', road1: '#2b2733', walk: '#d9c7b8', walkLine: '#bfa893', curb: '#f2e6da', line: '#ffd9a0', dash: '#fff3df',
  zebra: '#fff1dc', tree: ['#2f7d5b', '#3fa06f', '#1f5c44'], trunk: '#6b4a34', lamp: '#ffcf87', glow: '#ff9d5c', grass: '#7fae7a',
  cars: ['#ff5d73', '#2ec4b6', '#f4f1de', '#ffb703'],
};

function Car({ x, y, color, flip, className }: { x: number; y: number; color: string; flip?: boolean; className?: string }) {
  return (
    <g className={className}>
      <g transform={`translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`}>
        <rect x={-33} y={-11} width={70} height={30} rx={9} fill="#000" opacity={0.22} />
        <rect x={-35} y={-15} width={70} height={30} rx={9} fill={color} />
        <rect x={-35} y={-15} width={70} height={30} rx={9} fill="#fff" opacity={0.12} />
        <rect x={-14} y={-11} width={26} height={22} rx={5} fill="#0b1220" opacity={0.82} />
        <rect x={-9} y={-9} width={14} height={18} rx={3} fill={color} opacity={0.9} />
        <rect x={31} y={-12} width={4} height={6} rx={1} fill="#fff8d6" />
        <rect x={31} y={6} width={4} height={6} rx={1} fill="#fff8d6" />
        <rect x={-35} y={-12} width={3} height={6} rx={1} fill="#ff3b3b" />
        <rect x={-35} y={6} width={3} height={6} rx={1} fill="#ff3b3b" />
        <ellipse cx={62} cy={0} rx={34} ry={15} fill="url(#bvs-lamp)" opacity={0.55} />
      </g>
    </g>
  );
}

function Palm({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <ellipse cx={x + 22} cy={y - 30} rx={r * 1.5} ry={r * 0.9} fill="#000" opacity={0.14} />
      <g transform={`translate(${x} ${y})`}>
        <circle r={4} fill={C.trunk} />
        {Array.from({ length: 9 }, (_, i) => (
          <ellipse key={i} cx={r * 0.55} cy={0} rx={r * 0.62} ry={r * 0.2} fill={C.tree[i % 3]} transform={`rotate(${i * 40 + (x % 17)})`} opacity={0.96} />
        ))}
        <circle r={r * 0.22} fill={C.tree[1]} />
      </g>
    </>
  );
}

export default function StreetStrip({ entrances }: { entrances: number[] }) {
  const xs = entrances.map(e => Math.round(e * W));
  const clear = (x: number, gap: number) => xs.every(c => Math.abs(c - x) > gap);
  const first = xs[0] ?? W / 2;
  return (
    <div className="bv-street" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="bvs-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.road0} /><stop offset="1" stopColor={C.road1} /></linearGradient>
          <linearGradient id="bvs-wash" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff7a59" stopOpacity={0.3} /><stop offset="0.5" stopColor="#ffb36b" stopOpacity={0.21} /><stop offset="1" stopColor="#c558a8" stopOpacity={0.3} />
          </linearGradient>
          <radialGradient id="bvs-glow"><stop offset="0" stopColor={C.glow} stopOpacity={0.75} /><stop offset="1" stopColor={C.glow} stopOpacity={0} /></radialGradient>
          <radialGradient id="bvs-lamp"><stop offset="0" stopColor={C.lamp} stopOpacity={0.9} /><stop offset="1" stopColor={C.lamp} stopOpacity={0} /></radialGradient>
          <linearGradient id="bvs-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.grass} stopOpacity={0.9} /><stop offset="1" stopColor={C.grass} stopOpacity={0} /></linearGradient>
        </defs>
        {/* far sidewalk, road, evening wash */}
        <rect x={0} y={0} width={W} height={R0} fill={C.walk} />
        {Array.from({ length: 31 }, (_, i) => <line key={i} x1={i * 46} y1={0} x2={i * 46} y2={R0 - 6} stroke={C.walkLine} strokeWidth={1} />)}
        <rect x={0} y={R0 - 6} width={W} height={6} fill={C.curb} />
        <rect x={0} y={R0} width={W} height={R1 - R0} fill="url(#bvs-road)" />
        <rect x={0} y={R0} width={W} height={R1 - R0} fill="url(#bvs-wash)" />
        {[R0 + 26, R0 + 44, R1 - 44, R1 - 26].map(y => <rect key={y} x={0} y={y - 3} width={W} height={6} fill="#000" opacity={0.07} />)}
        {/* edge lines and the double centre line */}
        <rect x={0} y={R0 + 5} width={W} height={2.5} fill={C.dash} opacity={0.85} />
        <rect x={0} y={R1 - 7.5} width={W} height={2.5} fill={C.dash} opacity={0.85} />
        <rect x={0} y={MID - 4} width={W} height={2.2} fill={C.line} />
        <rect x={0} y={MID + 2} width={W} height={2.2} fill={C.line} />
        {/* a crossing in front of each building, and the path from it to the door */}
        {xs.map(cx => (
          <g key={cx}>
            <rect x={cx - 62} y={R0} width={124} height={R1 - R0} fill={C.road1} opacity={0.55} />
            {Array.from({ length: 8 }, (_, i) => <rect key={i} x={cx - 52} y={R0 + 8 + i * 15} width={104} height={8} rx={1.5} fill={C.zebra} opacity={0.92} />)}
            <rect x={cx - 74} y={R0 + 6} width={5} height={R1 - R0 - 12} fill={C.dash} opacity={0.9} />
            <rect x={cx + 69} y={R0 + 6} width={5} height={R1 - R0 - 12} fill={C.dash} opacity={0.9} />
          </g>
        ))}
        {[[190, R0 + 34], [720, R1 - 34], [1260, R0 + 36]].map(([x, y]) => (
          <g key={x}><circle cx={x} cy={y} r={9} fill="#000" opacity={0.28} /><circle cx={x} cy={y} r={6} fill="none" stroke="#fff" strokeOpacity={0.18} /></g>
        ))}
        {/* near sidewalk, curb, verge */}
        <rect x={0} y={R1} width={W} height={34} fill={C.walk} />
        <rect x={0} y={R1} width={W} height={6} fill={C.curb} />
        {Array.from({ length: 31 }, (_, i) => <line key={i} x1={i * 46} y1={R1 + 6} x2={i * 46} y2={R1 + 34} stroke={C.walkLine} strokeWidth={1} />)}
        <rect x={0} y={R1 + 34} width={W} height={H - R1 - 34} fill="url(#bvs-fade)" />
        {xs.map(cx => <rect key={cx} x={cx - 30} y={R1 + 34} width={60} height={H - R1 - 34} fill={C.walk} opacity={0.9} />)}
        {/* cars: two parked for everybody; two driving, or standing in their lanes where nothing moves */}
        <Car x={first + 210} y={R1 - 18} color={C.cars[2]} />
        <Car x={first + 470} y={R0 + 18} color={C.cars[3]} flip />
        <g className="bv-street-still">
          <Car x={first + 150} y={R1 - 33} color={C.cars[0]} />
          <Car x={first - 150} y={R0 + 33} color={C.cars[1]} flip />
        </g>
        <g className="bv-street-moving">
          <Car x={0} y={R1 - 33} color={C.cars[0]} className="bv-street-drive" />
          <Car x={0} y={R0 + 33} color={C.cars[1]} flip className="bv-street-drive bv-street-back" />
        </g>
        {[70, 215, 500, 650, 800, 905, 1195, 1330].filter(x => clear(x, 80)).map(x => <Palm key={x} x={x} y={R1 + 20} r={26} />)}
        {[130, 600, 1120].map(x => <Palm key={x} x={x} y={14} r={20} />)}
        {[130, 280, 420, 560, 840, 980, 1120, 1270].filter(x => clear(x, 65)).map(x => (
          <g key={x}>
            <ellipse cx={x} cy={R1 - 22} rx={86} ry={50} fill="url(#bvs-glow)" opacity={0.8} />
            <rect x={x - 1.5} y={R1 - 22} width={3} height={30} fill="#1b2230" />
            <circle cx={x} cy={R1 - 22} r={5} fill={C.lamp} />
            <circle cx={x} cy={R1 + 9} r={4} fill="#1b2230" />
          </g>
        ))}
      </svg>
    </div>
  );
}
