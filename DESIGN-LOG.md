# DESIGN-LOG — Outrider (dada-lite, total redesign)

## Plan
- **Brief:** total, professional redesign of the extreme-sports weather site (was a single-file dashboard: emoji icons, one generic 0–100 "readiness" score, four sports with fixed labels).
- **Mode:** Adaptive (MAYA): people deciding whether to leave the house, often on a phone.
- **Seed:** stance `Envisioning Information (Edward Tufte)`; rules `Grid Systems in Graphic Design (Josef Müller-Brockmann)`, `WCAG 2.2 Contrast and Perceivability (W3C)`; breaker `Learning from Las Vegas (Venturi, Scott Brown, Izenour)` read as "make the sign the building": the answer (a window) is the architecture of the page; counterpoint `Interaction of Color (Josef Albers)` via `wcag -.->|contrast floor constrains| albers`.
- **Tooling:** in-app browser (render, DOM measurement, interaction tests), Node (contrast maths, syntax), one sub-agent panel. No graph tooling.
- **Bound:** panel rounds capped at 2 per run.
- **Premortem (old site):** the 0–100 score blended unlike things (a kite wants wind a paddler fears); "LIVE ESTIMATES" labels without rules; emoji as icons; the hourly data was fetched but never shown.

## Moves
- **M1** BREAK. The window finder: a 6 sports × 48 hours heatmap, each hour graded go / marginal / no-go / dark by written rules, the longest go run bracketed and echoed in a "Best window" banner and in the hero. Replaces the single score. Anchors: Tufte (small multiples), Las Vegas (the sign is the building). Rejected: a per-sport score ring (hides *when*); a calendar list of windows (loses the shape of the day).
- **M2** KEEP. Rules in one `SPORTS` array drive the grid, the best window, the week cards and the Method table, so the published rules can't drift from the colours.
- **M3** KEEP. Charts (wind & gusts with the sport's limits, temperature, rain), hover/keyboard readout with the hour's grade and reasons.
- **M4** KEEP. Identity: night slate, rescue orange, safety-scale colours, Archivo at width 62 for display, JetBrains Mono for numbers, procedural topographic contours, drawn SVG weather icons instead of emoji, a wind dial with speed and gust arcs.
- **M5** ADAPT (bug found while building). Times from the API are the *place's* local time without an offset; `new Date()` would shift them into the viewer's zone. All times are now read from the strings, and "now" is computed from `utc_offset_seconds`.
- **M6** ADAPT (layout, measured). Phone readouts collapsed to one column: the phone media query sat *before* the base `.readouts` rule and lost at equal specificity (computed `grid-template-columns` was one track). Moved after the base rules → `86.5px 86.5px`.

## Measurements
| Check | Result |
|---|---|
| Contrast | text/bg 16.97, dim/bg 8.03, dim/panel 7.44, faint/panel **4.42 → 5.46** (`#6F8291` → `#7F92A1`), orange/bg 6.68, button text on orange 6.92, go/marg/no-go text on bg 9.07/10.20/5.44 |
| Colour-only scale | go vs marginal luminance contrast **1.12**: indistinguishable without hue. Fix: marginal hatched, no-go darker `#C0392B` (2.60 vs go, 2.92 vs marginal) with a × glyph; legend matches |
| Overflow | 375 px: scrollWidth 375 (grid and rules table scroll inside their own boxes); desktop: none |
| Interaction | sport click → limits "paragliding 12/18"; ArrowDown moves selection and focus; unit toggle converts (19 mph → 31 km/h, 28 → 45); unknown place → "No place called “Zzqxv”…" and old data kept; chart ArrowRight moves the readout; no console errors |

## Panel R1 (one sub-agent, five seats)
| Seat | Verdict | Resolution |
|---|---|---|
| Usability (Krug) | OBJECT | ADAPT: week cards follow the selected sport and show that day's go window ("8a–7p go"). Clickable days extending the grid: deferred (48 h of hourly grading is the product's claim). |
| Inclusion (Mace) | OBJECT | ADAPT: non-colour channel (hatch, ×, luminance) — already measured and applied before the report landed; charts focusable with ←/→/Home/End driving the same readout. Reduced motion: global rule already stops ping and dial transition. |
| Evidence (Tufte) | OBJECT | ADAPT: removed the opacity fade on unselected rows (colour now means one thing); selection is the orange rule and bold name. Direct curve labels: declined, the key sits on the chart head. |
| Evidence (Cairo) | OBJECT | ADAPT: limit lines carry their kind ("marginal 20", "no-go 30"), amber dashed vs red solid, kite shows all four bounds. Method table in metric: OVERRULE with label — the lede now says the rules are written in °F and mph. |
| Provocateur (Shklovsky) | OBJECT | ADAPT: best window echoed in the hero ("Next window · Kite & windsurf Fri 4p–6p"); contours crowd as the current wind rises (ring gap 58 − 1.1 × wind, capped at 30 mph). |
Andon: none.

## Stop check (bounded)
- 1 panel round + inline re-render. Full-DADA S2/S3 not run.
- Open: real-device test; the deployed URL (`weather-for-extreme-sports.vercel.app`) is assumed until the owner deploys.
