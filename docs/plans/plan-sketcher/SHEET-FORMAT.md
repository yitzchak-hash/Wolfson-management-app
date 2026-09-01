# The TzviAir sheet format (picks 29–30) — recorded from the owner's PDF

Received 2026-09-01: a 2-page plot of one real job (Floor 5, Kenig Park) —
page 1 the AC plan (תוכנית מיזוג), page 2 the lighting plan (תוכנית תאורה).
**The PDF itself is NOT in the repo** — it carries a real family's name,
phone and address. This spec + `sheet-frame.html` (placeholder data) are the
durable record; sample exact colors/dimensions from a fresh PDF at B9 if
finer fidelity is needed.

## Provenance facts

- Plotted from **AutoCAD LT 2024** (`pdfplot16.hdi`), Layout1, landscape.
- Fonts embedded: **ArialMT** + **Malgun Gothic Semilight** (CID TrueType,
  Identity-H) — the whole sheet is set in these two.
- **77 OCG layers survive into the PDF** — real CAD layers (`1- geves all`,
  `1-meters mizug`, `לייעוץ מיזוג|wall`, `…|door`, `…|text`, per-consultation
  groups). The B4/B5 readers get the full layer structure from the plot.
- The drawing area carries a large diagonal TzviAir watermark.

## The RIGHT-SIDE COLUMN (the thing pick 29 copies exactly), top → bottom

Each block is a bordered row; labels small grey, values large. English
labels left-aligned LTR; Hebrew labels/values RTL.

1. **Family Name:** — value in very large type (the biggest text on the column)
2. **Contact Info:** — phone number
3. **Address:** — Hebrew street + number (RTL)
4. **Floor:** — e.g. "Floor 5"
5. **Project Name/ City:** — e.g. project name
6. **סוג תוכנית:** — plan type, big bold RTL (תוכנית מיזוג / תוכנית תאורה)
7. **שרטוט:** — draughtsperson's first name
8. **תאריך:** — date DD/MM/YYYY
9. **גירסה:** — version (v9, v12 — per plan type, independent counters)
10. **Penthouse:** yes ☐ no ☐ checkboxes
11. **קבלן פרטי:** — two checkboxes (כ / פ)
12. **☐ Proposal / לעיון** and **☐ Approved / לביצוע** — status checkboxes
13. English rights paragraph (small): "All rights reserved to the designer.
    Do not determine sizes by measuring the plan. The installer/contractor
    must check the entire plan before the installation, and let the designer
    know of any mistake or discrepancy."
14. Hebrew rights paragraph (small, RTL): "כל הזכויות שמורות למתכנן. אין
    לקבוע גדלים לפי מדידה בתכנית. על המבצע לבדוק את כל התכניות לפני הביצוע
    ולהודיע למתכנן על כל טעות או אי התאמה."
15. **גובה הנמכה:** color key — ‑10 light green · ‑30 yellow · ‑35 darker
    yellow/khaki · ‑40 pink (these colors also fill the ceiling areas on the
    drawing itself)
16. **חישוב גבס: N מ"ר** — the gypsum total, computed from the plan
17. Office block 1: **Beit Shemesh · 02-628-8282 · 9 Nachal Kidron RBSA**
18. Office block 2: **Tel Aviv · 03-720-8000 · Azrielli Sarona Tower ·
    121 Derech Menachem Begin**
19. **TzviAir logo** + "Air Conditioning · Engineering, Design and
    Installation" + Hebrew line "תכנון התקנה ושירות מערכות מיזוג אוויר"

## The LEFT COLUMN

- A vertical strip of small real product photos (grille, service hatch,
  spot, outdoor unit…), captioned, ending "התמונות להמחשה בלבד".
- **מקרא** (legend) box: נקודת ניקוז (H=30 מהתקרה) · שקע הזנה 1x10A (H=30) ·
  פאקט · אוויר חוזר (hatch swatch) · פתח שירות (X-box) · פתח שירות פלסטיק ·
  טרמוסטט (H=140 מהרצפה) · בקר ראשי + הזנה [B] (H=140) · ספוט תאורה שקועה.
  The lighting page's legend adds תאורת צילינדר (red dot) and a yellow key
  box for emergency/shabbat lighting marks.

## The BOTTOM STRIP

- AC page: a row of **INDOOR UNIT tables** — blue-framed boxes, one per
  model: model (E-SLD 63) · BTU · CFM · dims (w/d/h) · watts · "Number:"
  followed by the unit-letter chips (A1 A2 A4 …) that match the tags drawn
  on the plan.
- Lighting page: totals line — "סך הכל פסי לד: N מטר · סך הכל קרניזים: N מטר".

## Notes for B9

- The unit tables + the חישוב גבס line are exactly what pick 30's "the sheet
  IS the numbers page" means — the export fills them from the placed blocks
  and gvs shapes.
- Version counters are per plan type, not per file.
- On-plan annotation callouts (yellow alert boxes, leader-line labels like
  "גריל אספקה קירי מדגם AS · L=150 H=10") are part of the drawing, not the
  frame.
- `sheet-frame.html` beside this file is the frame rebuilt as real HTML with
  placeholder data — the seed of the export template.
