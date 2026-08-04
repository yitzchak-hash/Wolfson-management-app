import { LayoutBuilding, LayoutFloor, LayoutSlot, ProjectLayout, SlotKind } from './projectLayout';

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
export function buildImportPrompt(projectName: string): string {
  return `I need a building layout as JSON for a project called "${projectName}".

I will give you floor plans or a description. Read them and reply with ONLY a JSON
object — no explanation, no markdown fences.

Shape:

{
  "buildings": [
    {
      "id": "A1",
      "name": "Building A1",
      "floors": [
        {
          "label": "10",
          "slots": [
            { "kind": "apartment", "number": "37" },
            { "kind": "apartment", "number": "38" },
            { "kind": "stairwell" },
            { "kind": "apartment", "number": "39" },
            { "kind": "gap" }
          ]
        }
      ]
    }
  ]
}

Rules:
- "floors" must be listed TOP FLOOR FIRST, going down to the lowest.
- "label" is free text: "10", "Ground", "-1", "Lobby", "Roof".
- "slots" is one row, left to right, exactly as the apartments sit on that floor.
- "kind" is one of: "apartment", "gap", "stairwell".
  * "gap" = empty space where no apartment exists.
  * "stairwell" = the stair/lift core between apartments.
- A DUPLEX is one apartment across two floors. Put it on its LOWER floor with
  "duplex": true, and do NOT repeat it on the floor above — leave a "gap" there
  if the column would otherwise be empty.
- Give every apartment its real "number" if you can read it. If a number is
  unknown, omit "number" and I will fill it in.
- If a unit is wider than one apartment, add "width": 2 (or 3).

Reply with the JSON only.`;
}

export interface ParseResult {
  ok: boolean;
  layout?: ProjectLayout;
  errors: string[];
  warnings: string[];
  summary?: { buildings: number; floors: number; units: number; duplexes: number };
}

const KINDS: SlotKind[] = ['apartment', 'gap', 'stairwell'];

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
        if (!KINDS.includes(kind)) {
          warnings.push(`Unknown slot type "${String(s.kind)}" on floor ${label} of ${name} — treated as a gap.`);
          kind = 'gap';
        }
        const number = s.number != null ? String(s.number).trim() : undefined;
        if (kind === 'apartment') {
          units++;
          if (!number) warnings.push(`Apartment ${si + 1} on floor ${label} of ${name} has no number.`);
        }
        const duplex = s.duplex === true;
        if (duplex) duplexes++;
        const width = Number(s.width);
        return {
          kind,
          ...(number ? { number, pinned: true } : {}),
          ...(duplex ? { duplex: true } : {}),
          ...(Number.isFinite(width) && width > 1 ? { width } : {}),
        };
      });
      floors.push({ label, slots });
      floorCount++;
    });

    buildings.push({ id, name, displayOrder: bi + 1, floors });
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
