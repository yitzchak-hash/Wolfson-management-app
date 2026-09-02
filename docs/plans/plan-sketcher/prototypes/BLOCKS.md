# The block catalog — what the master DWG turned out to be

Received 2026-09-02 (open follow-up #2 of the master plan): the owner's
"Blocks" Drive folder — `blocks.dwg` (16 MB), its DXF export (105 MB) and
`standard.zip`, a set of SHX fonts. **None of those files are in the repo**;
`render2.py` beside this file is the tool that reads them (run it in a folder
holding `blocks.dxf`, it writes `svg2/*.svg` + `index2.json`).

## The numbers
- `$INSUNITS = 5` → the drawing is in **centimetres**, real size.
- **326 block inserts** in model space, laid out as a printed catalog sheet
  under decoded headings (מפזרים · גרילים · פתחי שירות · מזגנים · מעבים …),
  each unit block with its brand heading above (מיצובישי / אלקטרה / הייסנס).
- The sheet exists **twice** (a left copy at x < −8000 and a right copy);
  the right copy is treated as canonical.
- Indoor units carry ATTRIB tags with the spec lines the plot's INDOOR UNIT
  cards print (BTU · CFM · size · watts). They ARE the spec-card data.

## Hebrew is keyboard-mapped (the decoder is the whole trick)
Every Hebrew string is stored as the LATIN keys that type it on an Israeli
keyboard, rendered through two SHX fonts (`atir.shx`, `gil.shx`) whose
glyphs are Hebrew letters. `heb()` in `render2.py` maps
`qwertyuiopasdfghjkl;zxcvbnm,./'` → `/'קראטוןםפשדגכעיחלךףזסבהנמצתץ.,`
and is applied ONLY to text whose style uses one of those two fonts.
Latin/digit runs inside such a string are stored **visually** (reversed)
only when the string reads like `11=H 33=L`; a run like `L=150` is already
logical and must not be flipped — the test is `\d+=[A-Za-z]`. Verified
against the brand names, the unit types and the attribute labels.

## Geometry traps paid for
- `virtual_entities()` on nested inserts throws mid-iteration on some
  blocks; `safe_iter` swallows per-entity failures instead of losing the
  block.
- A handful of blocks carry a **stray nested insert at ~107,000,000 cm**;
  the honest bounding box is the extents of the DIRECT children with any
  child wider than 15 m dropped (`firstlevel_box`), and shapes outside that
  box (+25 cm) are discarded. Two grille definitions still explode and are
  left out.
- Text inserted at 180° reads upside down when rendered literally; the
  renderer snaps 135°–225° to 0° with `text-anchor="end"`.
- ezdxf's drawing frontend drops virtual entities silently (see
  `render_direct.py`), so this is again a direct geometry → SVG walk.
- Output SVG convention: block-local, origin at the box's min corner, y
  flipped, **1 cm = 4 SVG units**, stroke 0.35 cm, hatches as half-opaque
  fills. That convention is what the Sitting 9 sketcher consumes.

## Categories as decoded (right copy)
Diffusers · Grilles · Service hatches · Indoor units (by brand) · Outdoor
units · Accessories (thermostat, switch, drain) · Spec cards (the plot's
INDOOR/OUTDOOR UNIT card blocks). The sketcher's shelf uses exactly these.

## Still open
- The SHX fonts themselves are not used for rendering (system Arial/Heebo
  stand in); glyph shapes differ slightly from the plot.
- `render_blocks.py` is the earlier pass kept for history; `render2.py`
  supersedes it.
