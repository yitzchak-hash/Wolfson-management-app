import { LayoutBuilding, LayoutFloor, LayoutSlot, ProjectLayout, SlotKind, newSlot, joinSlots } from './projectLayout';

/**
 * The AI round-trip.
 *
 *   1. buildImportPrompt() produces text to copy.
 *   2. The user pastes it into ChatGPT/Claude along with plans or a diagram.
 *   3. The AI returns JSON.
 *   4. parseLayoutJson() validates it and reports problems in plain language.
 *   5. The builder previews it before anything is written.
 *
 * Validation is deliberately forgiving about SHAPE and strict about MEANING: an
 * AI will vary key casing and wrap things in extra objects, but it must not
 * invent a slot kind or a non-numeric floor count.
 */
/**
 * The prompt handed to a fresh AI with no context whatsoever.
 *
 * Deliberately long. It is pasted into a brand-new conversation alongside a set
 * of plans, so it has to establish the whole job from nothing: what a floor
 * plan is in this context, what to look for, what to do about the many things
 * that are ambiguous on a real drawing, and what the answer must look like
 * exactly. A short prompt produced short, confident, wrong answers — the model
 * would guess at floor order, invent numbers, and silently drop the core.
 */
export function buildImportPrompt(projectName: string): string {
  return `You are reading architectural drawings and turning them into structured data.
I will give you floor plans, an elevation, a marketing brochure, a spreadsheet, a
photograph of a printed plan, or a written description — whatever I have. Your job
is to work out the LAYOUT OF EVERY FLOOR and reply with JSON only.

The project is called "${projectName}". It is a residential building — usually an
apartment tower — being fitted with air conditioning, so what matters to me is
which apartments exist on which floor and where they sit relative to each other.

════════════════════════════════════════════════
WHAT TO LOOK FOR
════════════════════════════════════════════════

1. HOW MANY BUILDINGS. A project may be one tower or several. Separate buildings
   usually have their own name or letter (A1, A2, B, North Tower). If everything
   is one tower, return one building.

2. THE FLOORS OF EACH BUILDING. Look for a floor schedule, a stacking diagram,
   an elevation, or repeated "TYPICAL FLOOR PLAN 3-14" notes. A note like
   "typical floors 3-14" means those twelve floors are IDENTICAL — expand them
   into twelve separate floors with the same arrangement, do not collapse them
   into one. Include the ground floor, any lobby, basement or parking levels and
   the roof ONLY if apartments exist on them.

3. THE APARTMENTS ON EACH FLOOR, IN ORDER. Read each floor left to right as the
   plan is drawn. I care about the ORDER and the COUNT more than exact geometry:
   four apartments across a floor become four slots in a row.

4. THE APARTMENT NUMBERS. These are usually printed inside each unit, sometimes
   as "Apt 37", "37", "3A" or "12-4". Use exactly what is printed. If a number
   is genuinely unreadable, leave it out rather than inventing one — I would far
   rather fill in a blank than discover a wrong number later.

5. GAPS. A position on the floor with no apartment — a void, a shaft, a terrace,
   the stair and lift core, a corridor that interrupts the row — is a "gap".
   Include it, because it keeps the apartments in the right positions relative
   to the floors above and below. Do not use gaps to pad every floor out to the
   same width; only include a gap where the row is genuinely interrupted.

6. DUPLEXES. A duplex, maisonette or two-storey penthouse is ONE home occupying
   TWO floors. On plans it shows as the same unit number appearing on two
   consecutive floors, or as an internal stair drawn inside the unit, or as a
   note like "duplex" / "two-level". Mark it on the LOWER of the two floors with
   "duplex": true, and leave a "gap" in that position on the floor above.

════════════════════════════════════════════════
THE ANSWER
════════════════════════════════════════════════

Reply with ONE JSON object and nothing else. No explanation before it, no
markdown fences, no trailing commentary.

{
  "buildings": [
    {
      "id": "A1",
      "name": "Building A1",
      "floors": [
        { "label": "16", "slots": [
            { "kind": "apartment", "number": "55" },
            { "kind": "gap" },
            { "kind": "apartment", "number": "56" }
        ] },
        { "label": "15", "slots": [
            { "kind": "apartment", "number": "53" },
            { "kind": "apartment", "number": "54", "duplex": true }
        ] },
        { "label": "14", "slots": [
            { "kind": "apartment", "number": "49" },
            { "kind": "apartment", "number": "50" },
            { "kind": "gap" },
            { "kind": "apartment", "number": "51" },
            { "kind": "apartment", "number": "52" }
        ] }
      ]
    }
  ]
}

FIELD BY FIELD
- "id"      short and unique: "A1", "B2", "North". No spaces.
- "name"    what people call it: "Building A1", "North Tower".
- "floors"  TOP FLOOR FIRST, descending to the lowest. This matters — I draw the
            building the way it stands, and a reversed list produces an
            upside-down building.
- "label"   free text exactly as the drawing names it: "16", "Ground", "-1",
            "Lobby", "Roof", "Mezzanine".
- "slots"   one floor's row, LEFT TO RIGHT as drawn.
- "kind"    "apartment" or "gap". Nothing else.
- "number"  the printed apartment number, as a string. Omit if unreadable.
- "duplex"  true only on the LOWER floor of a two-storey home.

════════════════════════════════════════════════
WHEN THE DRAWING IS UNCLEAR
════════════════════════════════════════════════

- Two plans contradict each other → follow the one that is dimensioned or
  titled as the construction set, not the marketing render.
- You cannot tell whether something is an apartment or a service room → look for
  a number. Numbered means apartment; unnumbered plant, store, shaft or riser
  means "gap".
- The floor count is unclear → count the storeys on the elevation and use that.
- A floor's arrangement is unreadable → still include the floor with the right
  NUMBER of slots and omit the numbers, rather than skipping the floor.
- You genuinely cannot read something → leave the field out. A blank I can fill
  in beats a confident guess I have to hunt down.

Read everything I give you, then reply with the JSON object only.`;
}

export interface ParseResult {
  ok: boolean;
  layout?: ProjectLayout;
  errors: string[];
  warnings: string[];
  summary?: { buildings: number; floors: number; units: number; duplexes: number };
}

// 'stairwell' is accepted from a model's reply and folded into 'gap' — an
// empty position is what it always meant, and the kind no longer exists.
const KINDS: SlotKind[] = ['apartment', 'gap'];

/** Strips markdown fences and stray prose, which models add despite instructions. */
function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first > 0 || (last >= 0 && last < s.length - 1)) s = s.slice(first, last + 1);
  return s;
}

export function parseLayoutJson(raw: string): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: unknown;
  try {
    data = JSON.parse(extractJson(raw));
  } catch {
    return { ok: false, errors: ["That doesn't look like valid JSON. Paste the whole reply, including the braces."], warnings };
  }

  const root = data as Record<string, unknown>;
  const rawBuildings = Array.isArray(root?.buildings) ? root.buildings
    : Array.isArray(root) ? root : null;
  if (!rawBuildings || rawBuildings.length === 0) {
    return { ok: false, errors: ['No buildings found. The JSON needs a "buildings" list.'], warnings };
  }

  const buildings: LayoutBuilding[] = [];
  let units = 0, duplexes = 0, floorCount = 0;

  rawBuildings.forEach((rb, bi) => {
    const b = rb as Record<string, unknown>;
    const id = String(b.id ?? b.name ?? `B${bi + 1}`).trim();
    const name = String(b.name ?? id).trim();
    const rawFloors = Array.isArray(b.floors) ? b.floors : [];
    if (rawFloors.length === 0) {
      errors.push(`Building "${name}" has no floors.`);
      return;
    }

    const floors: LayoutFloor[] = [];
    rawFloors.forEach((rf, fi) => {
      const f = rf as Record<string, unknown>;
      const label = String(f.label ?? f.name ?? f.floor ?? fi).trim();
      const rawSlots = Array.isArray(f.slots) ? f.slots : [];
      if (rawSlots.length === 0) {
        warnings.push(`Floor "${label}" in ${name} is empty.`);
      }
      const slots: LayoutSlot[] = rawSlots.map((rs, si) => {
        const s = rs as Record<string, unknown>;
        let kind = String(s.kind ?? 'apartment').toLowerCase() as SlotKind;
        if (String(kind) === 'stairwell') kind = 'gap';
        if (!KINDS.includes(kind)) {
          warnings.push(`Unknown slot type "${String(s.kind)}" on floor ${label} of ${name} — treated as a gap.`);
          kind = 'gap';
        }
        const number = s.number != null ? String(s.number).trim() : undefined;
        if (kind === 'apartment') {
          units++;
          if (!number) warnings.push(`Apartment ${si + 1} on floor ${label} of ${name} has no number.`);
        }
        // A duplex arrives as a flag on one slot; it becomes a real join to the
        // slot above once the whole building is parsed and positions are known.
        const wantsDuplex = s.duplex === true;
        if (wantsDuplex) duplexes++;
        return {
          ...newSlot(kind),
          ...(number ? { number, pinned: true } : {}),
          ...(wantsDuplex ? { __wantsDuplex: true } : {}),
        } as LayoutSlot;
      });
      floors.push({ label, slots });
      floorCount++;
    });

    const built: LayoutBuilding = { id, name, displayOrder: bi + 1, floors };
    // Turn the imported flags into real joins with the slot directly above.
    built.floors.forEach((floor, fi) => {
      floor.slots.forEach((slot, si) => {
        const wants = (slot as unknown as Record<string, unknown>).__wantsDuplex;
        delete (slot as unknown as Record<string, unknown>).__wantsDuplex;
        if (!wants || fi === 0) return;
        const above = built.floors[fi - 1]?.slots[si];
        if (!above || above.kind !== 'apartment' || above.joinUid) {
          warnings.push(`Duplex on floor ${floor.label} of ${name} has nothing free above it — left as a single apartment.`);
          return;
        }
        joinSlots(built, { f: fi, s: si }, { f: fi - 1, s: si }, 'duplex');
      });
    });
    buildings.push(built);
  });

  if (buildings.length === 0) {
    return { ok: false, errors: errors.length ? errors : ['No usable buildings in that JSON.'], warnings };
  }

  // Duplicate numbers are worth flagging, never fatal — real buildings have them.
  for (const b of buildings) {
    const seen = new Set<string>();
    for (const f of b.floors) {
      for (const s of f.slots) {
        if (s.kind !== 'apartment' || !s.number) continue;
        if (seen.has(s.number)) warnings.push(`${b.name} has more than one apartment ${s.number}.`);
        seen.add(s.number);
      }
    }
  }

  return {
    ok: errors.length === 0,
    layout: { buildings },
    errors,
    warnings,
    summary: { buildings: buildings.length, floors: floorCount, units, duplexes },
  };
}
