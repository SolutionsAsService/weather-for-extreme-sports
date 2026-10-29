# Outrider

**Find your weather window.** A live forecast for outdoor and extreme sports: the next 48 hours, six sports, every hour graded *go*, *marginal* or *no-go*, with the best window called out.

- **Window finder**: a 6 × 48 heatmap (mountain biking, climbing, paragliding, kite & windsurf, paddling, trail running). Pick a row to see its best contiguous window and its limits on the charts.
- **Charts**: wind & gusts with the selected sport's limits, temperature and feels-like, rain probability; move across any chart to read an hour.
- **Week**: seven days with the sport that has the most go hours each day.
- **Daylight**: sunrise, golden hour, sunset and the sun's position.
- **Method**: every rule the grid uses, generated from the same code, so the table can't drift from the colours.

Data: [Open-Meteo](https://open-meteo.com/) forecast and geocoding APIs (no key, CC BY 4.0). No accounts or tracking; the last place, unit and sport are kept in `localStorage`.

## Structure

```
site/          the deployable site (static; no build)
  index.html   page
  styles.css   all styles
  app.js       fetch, grading rules, grid, charts, week, daylight
  404.html
  favicon.svg
index.html     redirect to site/
vercel.json    root deploy config (outputDirectory: site)
DESIGN-LOG.md  DADA design record
```

## Run locally

```bash
python -m http.server 4318 --directory site
```

## Deploy

Ready for Vercel as-is: framework none, no install or build step. The root `vercel.json` serves `site/`; `site/vercel.json` covers a Root Directory set to `site`.

## Changing a rule

Rules live in the `SPORTS` array in `site/app.js` (mph, °F, %). The Method table is generated from it. If you change a wind threshold, update `LIMITS` for the chart's dashed lines too.

© 2026 SolutionsAsService
