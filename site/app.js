// Outrider — live Open-Meteo forecast, graded hour by hour for six sports.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORE = "outrider:v2";
  const HOURS = 48;
  const SVGNS = "http://www.w3.org/2000/svg";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = { metric: false, sport: "mtb", data: null, place: null, hours: [], cursor: null };
  try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch (_) {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ metric: state.metric, sport: state.sport, lastQ: state.lastQ })); } catch (_) {} };

  // ---------- units (all maths in mph and °F; display converts) ----------
  const kmh2mph = (k) => k * 0.621371;
  const c2f = (c) => c * 9 / 5 + 32;
  const T = (f) => (state.metric ? Math.round((f - 32) * 5 / 9) : Math.round(f));
  const W = (mph) => (state.metric ? Math.round(mph / 0.621371) : Math.round(mph));
  const tU = () => (state.metric ? "°C" : "°F");
  const wU = () => (state.metric ? "km/h" : "mph");
  const deg = (f) => `${T(f)}°`;

  // ---------- weather codes → words + icon ----------
  const CODES = {
    0: ["Clear", "clear"], 1: ["Mostly clear", "clear"], 2: ["Partly cloudy", "part"], 3: ["Overcast", "cloud"],
    45: ["Fog", "fog"], 48: ["Freezing fog", "fog"], 51: ["Light drizzle", "rain"], 53: ["Drizzle", "rain"], 55: ["Heavy drizzle", "rain"],
    56: ["Freezing drizzle", "rain"], 57: ["Freezing drizzle", "rain"], 61: ["Light rain", "rain"], 63: ["Rain", "rain"], 65: ["Heavy rain", "rain"],
    66: ["Freezing rain", "rain"], 67: ["Freezing rain", "rain"], 71: ["Light snow", "snow"], 73: ["Snow", "snow"], 75: ["Heavy snow", "snow"],
    77: ["Snow grains", "snow"], 80: ["Showers", "rain"], 81: ["Showers", "rain"], 82: ["Violent showers", "rain"], 85: ["Snow showers", "snow"],
    86: ["Heavy snow showers", "snow"], 95: ["Thunderstorm", "storm"], 96: ["Thunderstorm, hail", "storm"], 99: ["Thunderstorm, hail", "storm"]
  };
  const code = (c) => CODES[c] || ["Variable", "part"];
  const STORM = new Set([95, 96, 99]);
  const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);

  function icon(kind, night) {
    const sun = night
      ? `<path class="sun-c" d="M30 9a13 13 0 1 0 13 17A10 10 0 0 1 30 9Z"/>`
      : `<circle class="sun-c" cx="24" cy="22" r="8"/><path class="sun-c" d="M24 6v4M24 34v4M8 22h4M36 22h4M12.7 10.7l2.8 2.8M32.5 30.5l2.8 2.8M12.7 33.3l2.8-2.8M32.5 13.5l2.8-2.8"/>`;
    const cloud = (y = 0) => `<path d="M14 ${38 + y}h22a8 8 0 0 0 0-16 11 11 0 0 0-21-2 7 7 0 0 0-1 18Z"/>`;
    const body = {
      clear: sun,
      part: `<g transform="translate(-6 -6) scale(.8)">${sun}</g>${cloud(2)}`,
      cloud: cloud(0),
      fog: `${cloud(-6)}<path d="M8 38h32M12 43h24"/>`,
      rain: `${cloud(-6)}<path class="drop" d="M17 38l-2 5M25 38l-2 5M33 38l-2 5"/>`,
      snow: `${cloud(-6)}<path class="flake" d="M17 40v4M15 42h4M27 40v4M25 42h4M35 39v4M33 41h4"/>`,
      storm: `${cloud(-6)}<path class="bolt" d="M25 34l-4 7h6l-4 7"/>`
    }[kind];
    return `<svg class="wx" viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
  }

  // ---------- sports and their rules (mph, °F, %) ----------
  // Each rule: [test(h), words]. No-go wins over marginal; anything else is go.
  const SPORTS = [
    { id: "mtb", name: "Mountain bike", glyph: "M4 18a3 3 0 1 0 6 0 3 3 0 0 0-6 0M14 18a3 3 0 1 0 6 0 3 3 0 0 0-6 0M7 18l4-8h5l3 8M11 10l-1-3H8M16 10l-2 8",
      nogo: [[(h) => h.storm, "thunderstorm"], [(h) => h.pop >= 70, "rain chance ≥ 70%"], [(h) => h.wind >= 30, "wind ≥ 30 mph"], [(h) => h.feel < 15 || h.feel > 100, "feels < 15°F or > 100°F"]],
      marg: [[(h) => h.wet || h.pop >= 40, "rain or chance ≥ 40%"], [(h) => h.wind >= 20 || h.gust >= 30, "wind ≥ 20 or gusts ≥ 30 mph"], [(h) => h.feel < 32 || h.feel > 90, "feels < 32°F or > 90°F"]] },
    { id: "climb", name: "Climbing", glyph: "M7 21l3-7 4 2 2-6 3 1M10 14l-2-4 3-4M14 6a1.6 1.6 0 1 0 0-.1",
      nogo: [[(h) => h.storm, "thunderstorm"], [(h) => h.precip >= 0.2 || h.pop >= 60, "wet rock (rain ≥ 0.2 mm or chance ≥ 60%)"], [(h) => h.wind >= 30, "wind ≥ 30 mph"]],
      marg: [[(h) => h.pop >= 30, "rain chance ≥ 30%"], [(h) => h.wind >= 20, "wind ≥ 20 mph"], [(h) => h.temp < 40 || h.temp > 88, "air < 40°F or > 88°F"], [(h) => h.rh >= 85, "humidity ≥ 85%"]] },
    { id: "para", name: "Paragliding", glyph: "M3 9c4-5 14-5 18 0M3 9l9 9 9-9M12 18v3",
      nogo: [[(h) => h.storm, "thunderstorm"], [(h) => h.pop >= 40 || h.wet, "rain or chance ≥ 40%"], [(h) => h.wind >= 18, "wind ≥ 18 mph"], [(h) => h.gust >= 25, "gusts ≥ 25 mph"], [(h) => h.gust - h.wind >= 12, "gust spread ≥ 12 mph"]],
      marg: [[(h) => h.wind >= 12, "wind ≥ 12 mph"], [(h) => h.gust >= 18, "gusts ≥ 18 mph"], [(h) => h.gust - h.wind >= 8, "gust spread ≥ 8 mph"], [(h) => h.vis < 5000, "visibility < 5 km"]] },
    { id: "kite", name: "Kite & windsurf", glyph: "M5 3l8 4-3 8-5-12ZM10 15c1 3 4 5 9 6M3 21c3-1 5-1 8 0s5 1 8 0",
      nogo: [[(h) => h.storm, "thunderstorm"], [(h) => h.wind < 10, "wind < 10 mph (too light)"], [(h) => h.wind >= 35 || h.gust >= 42, "wind ≥ 35 or gusts ≥ 42 mph"]],
      marg: [[(h) => h.wind < 15, "wind 10–15 mph"], [(h) => h.wind >= 28, "wind ≥ 28 mph"], [(h) => h.gust - h.wind >= 12, "gust spread ≥ 12 mph"], [(h) => h.temp < 50, "air < 50°F"]] },
    { id: "paddle", name: "Paddling", glyph: "M3 15c3 2 15 2 18 0M6 6l12 12M5 5l2-1 1 2-2 1ZM17 17l2 1-1 2-2-1Z",
      nogo: [[(h) => h.storm, "thunderstorm"], [(h) => h.wind >= 18, "wind ≥ 18 mph"], [(h) => h.gust >= 25, "gusts ≥ 25 mph"]],
      marg: [[(h) => h.wind >= 10, "wind ≥ 10 mph"], [(h) => h.gust >= 18, "gusts ≥ 18 mph"], [(h) => h.pop >= 50, "rain chance ≥ 50%"], [(h) => h.temp < 50, "air < 50°F"], [(h) => h.vis < 2000, "visibility < 2 km"]] },
    { id: "run", name: "Trail run", glyph: "M13 4a1.6 1.6 0 1 0 0 .1M8 21l3-6 3 2v4M11 15l1-5 4 3h3M12 10l-4 1-2 3",
      nogo: [[(h) => h.storm, "thunderstorm"], [(h) => h.feel >= 100 || h.feel <= 0, "feels ≥ 100°F or ≤ 0°F"]],
      marg: [[(h) => h.feel >= 85 || h.feel <= 25, "feels ≥ 85°F or ≤ 25°F"], [(h) => h.pop >= 60, "rain chance ≥ 60%"], [(h) => h.wind >= 25, "wind ≥ 25 mph"], [(h) => h.uv >= 8, "UV ≥ 8"]] }
  ];
  const sportById = (id) => SPORTS.find((s) => s.id === id) || SPORTS[0];

  // wind limits per sport (mph) drawn on the chart; they mirror the wind rules above
  const LIMITS = {
    mtb: [["marginal", 20], ["no-go", 30]], climb: [["marginal", 20], ["no-go", 30]], para: [["marginal", 12], ["no-go", 18]],
    kite: [["no-go below", 10], ["marginal below", 15], ["marginal", 28], ["no-go", 35]], paddle: [["marginal", 10], ["no-go", 18]], run: [["marginal", 25]]
  };

  function grade(sport, h) {
    if (!h.day) return { c: "d", why: ["dark"] };
    const no = sport.nogo.filter(([t]) => t(h)).map(([, w]) => w);
    if (no.length) return { c: "n", why: no };
    const mg = sport.marg.filter(([t]) => t(h)).map(([, w]) => w);
    if (mg.length) return { c: "m", why: mg };
    return { c: "g", why: [] };
  }

  // ---------- time: the API speaks the place's local time ("2026-10-29T17:00") ----------
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = (s) => { const [d, t = "00:00"] = s.split("T"); const [y, m, dd] = d.split("-").map(Number); const [hh, mm] = t.split(":").map(Number); return { y, m, d: dd, hh, mm }; };
  const dow = (s) => { const p = parts(s); return DOW[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; };
  const hr12 = (hh) => `${hh % 12 || 12}${hh < 12 ? "a" : "p"}`;
  const clock = (s) => { const p = parts(s); return `${p.hh % 12 || 12}:${String(p.mm).padStart(2, "0")} ${p.hh < 12 ? "AM" : "PM"}`; };
  const localNowISO = (offsetSec) => new Date(Date.now() + offsetSec * 1000).toISOString().slice(0, 16);
  const minutes = (s) => { const p = parts(s); return p.hh * 60 + p.mm; };

  // ---------- fetch ----------
  async function geocode(q) {
    const [name, ...rest] = q.split(",").map((s) => s.trim()).filter(Boolean);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("Place search is down for a moment. Try again shortly.");
    const j = await r.json();
    if (!j.results || !j.results.length) throw new Error(`No place called “${name}”. Try a nearby town.`);
    const hint = rest.join(" ").toLowerCase();
    const scored = j.results.map((p, i) => {
      const hay = [p.admin1, p.admin2, p.country, p.country_code].filter(Boolean).join(" ").toLowerCase();
      return { p, s: (hint && hint.split(/\s+/).every((w) => hay.includes(w)) ? 1000 : 0) + (p.population || 0) / 1e6 - i };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored[0].p;
  }

  async function forecast(lat, lon) {
    const params = new URLSearchParams({
      latitude: lat, longitude: lon, timezone: "auto", forecast_days: "7",
      wind_speed_unit: "mph", temperature_unit: "fahrenheit",
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
      hourly: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility,is_day,cloud_cover",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max"
    });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!r.ok) throw new Error("The forecast service didn’t answer. Try again in a minute.");
    return r.json();
  }

  function setBusy(on, msg) {
    $("now").setAttribute("aria-busy", String(on));
    $("refresh").classList.toggle("spin", on);
    $("status").textContent = msg;
  }

  async function load(q, coords) {
    $("err").textContent = "";
    setBusy(true, "Updating");
    try {
      const place = coords || (await geocode(q));
      const data = await forecast(place.latitude, place.longitude);
      state.place = place; state.data = data;
      if (!coords) { state.lastQ = q; save(); }
      build();
      setBusy(false, "Live forecast");
      $("status").previousElementSibling?.classList.remove("off");
    } catch (e) {
      $("err").textContent = e.message || "Couldn’t load the forecast. Check your connection.";
      setBusy(false, "Offline");
      document.querySelector(".live")?.classList.add("off");
    }
  }

  // ---------- build the model ----------
  function build() {
    const d = state.data, H = d.hourly;
    const nowISO = localNowISO(d.utc_offset_seconds);
    let start = H.time.findIndex((t) => t > nowISO);
    start = Math.max(0, start - 1);
    state.hours = [];
    for (let i = start; i < Math.min(H.time.length, start + HOURS); i++) {
      const code0 = H.weather_code[i];
      state.hours.push({
        t: H.time[i], temp: H.temperature_2m[i], feel: H.apparent_temperature[i], rh: H.relative_humidity_2m[i],
        pop: H.precipitation_probability[i] ?? 0, precip: H.precipitation[i] ?? 0, code: code0,
        wind: H.wind_speed_10m[i], gust: H.wind_gusts_10m[i], dir: H.wind_direction_10m[i],
        uv: H.uv_index[i] ?? 0, vis: H.visibility[i] ?? 99999, day: H.is_day[i] === 1, cloud: H.cloud_cover[i],
        storm: STORM.has(code0), wet: WET.has(code0)
      });
    }
    renderAll();
  }

  function renderAll() {
    if (!state.data) return;
    renderNow(); renderGrid(); renderBest(); renderCharts(); renderWeek(); renderSun(); topo(state.data.current.wind_speed_10m);
  }

  // ---------- now ----------
  function placeName(p) {
    if (!p.name) return "Your location";
    return [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : null, p.country_code || p.country].filter(Boolean).join(", ");
  }
  function renderNow() {
    const d = state.data, c = d.current, h0 = state.hours[0] || {};
    $("now-place").textContent = placeName(state.place);
    const elev = d.elevation != null ? ` · ${state.metric ? Math.round(d.elevation) + " m" : Math.round(d.elevation * 3.28084).toLocaleString() + " ft"}` : "";
    $("now-meta").textContent = `${dow(c.time)} ${clock(c.time)} local${elev}`;
    $("now-icon").innerHTML = icon(code(c.weather_code)[1], !c.is_day);
    $("t").textContent = T(c.temperature_2m); $("t-unit").textContent = tU();
    $("cond").textContent = code(c.weather_code)[0];
    $("feels").textContent = deg(c.apparent_temperature);
    $("hi").textContent = deg(d.daily.temperature_2m_max[0]); $("lo").textContent = deg(d.daily.temperature_2m_min[0]);
    $("wind").textContent = W(c.wind_speed_10m); $("wind-u").textContent = wU();
    $("wind-dir").textContent = `from ${compass(c.wind_direction_10m)} · ${Math.round(c.wind_direction_10m)}°`;
    $("gust").textContent = `${W(c.wind_gusts_10m)} ${wU()}`;
    $("pop").textContent = `${h0.pop ?? "--"}%`;
    $("rh").textContent = `${c.relative_humidity_2m}%`;
    $("uv").textContent = (h0.uv ?? 0).toFixed(1);
    $("vis").textContent = h0.vis != null ? (state.metric ? `${(h0.vis / 1000).toFixed(h0.vis < 10000 ? 1 : 0)} km` : `${(h0.vis / 1609.34).toFixed(h0.vis < 16000 ? 1 : 0)} mi`) : "--";
    $("cloud").textContent = `${c.cloud_cover}%`;
    drawDial(c.wind_direction_10m, c.wind_speed_10m, c.wind_gusts_10m);
    document.title = `${T(c.temperature_2m)}${tU()} ${state.place.name || ""} — Outrider`;
  }
  const compass = (d) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(d / 22.5) % 16];

  function drawDial(dir, wind, gust) {
    const s = $("dial"), max = 40;
    const arc = (v, r) => { const a = Math.min(1, v / max) * 2 * Math.PI - Math.PI / 2; const x = 60 + r * Math.cos(a), y = 60 + r * Math.sin(a); return `M60 ${60 - r} A${r} ${r} 0 ${v / max > .5 ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}`; };
    let ticks = "";
    for (let i = 0; i < 36; i++) { const a = i * 10 * Math.PI / 180, r1 = i % 9 === 0 ? 40 : 44; ticks += `<line x1="${60 + r1 * Math.sin(a)}" y1="${60 - r1 * Math.cos(a)}" x2="${60 + 47 * Math.sin(a)}" y2="${60 - 47 * Math.cos(a)}" stroke="rgba(196,216,230,${i % 9 === 0 ? .6 : .22})" stroke-width="1"/>`; }
    s.innerHTML = `
      <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(196,216,230,.1)" stroke-width="5"/>
      <path d="${arc(Math.max(gust, .01), 56)}" fill="none" stroke="var(--gust)" stroke-width="5" stroke-linecap="round" opacity=".7"/>
      <path d="${arc(Math.max(wind, .01), 56)}" fill="none" stroke="var(--wind)" stroke-width="5" stroke-linecap="round"/>
      ${ticks}
      <text x="60" y="30" text-anchor="middle" fill="#9AABB8" font-size="9" font-family="JetBrains Mono, monospace">N</text>
      <g style="transform: rotate(${dir + 180}deg); transform-origin: 60px 60px; transition: transform .8s cubic-bezier(.2,.8,.2,1)">
        <path d="M60 38 L66 62 L60 57 L54 62 Z" fill="var(--orange)"/>
        <line x1="60" y1="57" x2="60" y2="82" stroke="var(--orange)" stroke-width="2" stroke-linecap="round"/>
      </g>
      <circle cx="60" cy="60" r="3" fill="#EEF3F6"/>`;
  }

  // ---------- the window grid ----------
  function renderGrid() {
    const g = $("grid"), hrs = state.hours;
    let html = `<div class="g-corner" style="grid-row:1 / span 2"></div>`;
    hrs.forEach((h, i) => {
      const p = parts(h.t);
      if (i === 0 || p.hh === 0) {
        const span = Math.min(i === 0 ? 24 - p.hh : 24, hrs.length - i);
        html += `<div class="g-day" style="grid-column:${i + 2} / span ${span}">${i === 0 ? "Today" : `${dow(h.t)} ${MON[p.m - 1]} ${p.d}`}</div>`;
      }
      html += `<div class="g-hour" style="grid-column:${i + 2}">${p.hh % 3 === 0 ? hr12(p.hh) : ""}</div>`;
    });
    SPORTS.forEach((s, r) => {
      const row = r + 3, sel = s.id === state.sport;
      html += `<div class="g-row${sel ? " sel" : ""}" data-sport="${s.id}">`;
      html += `<button class="g-name" type="button" role="radio" aria-checked="${sel}" tabindex="${sel ? 0 : -1}" data-sport="${s.id}" style="grid-row:${row}">
        <svg viewBox="0 0 24 24" class="wx" aria-hidden="true"><path d="${s.glyph}"/></svg>${s.name}<span class="sr-only">: ${summary(s)}</span></button>`;
      hrs.forEach((h, i) => {
        const gr = grade(s, h), p = parts(h.t);
        html += `<div class="g-cell c-${gr.c}${p.hh === 0 && i ? " daystart" : ""}" style="grid-row:${row};grid-column:${i + 2}" data-i="${i}" title="${s.name} ${dow(h.t)} ${hr12(p.hh)}: ${label(gr.c)}${gr.why.length && gr.c !== "d" ? " — " + gr.why.join(", ") : ""}"></div>`;
      });
      html += `</div>`;
    });
    g.innerHTML = html;
    markBest();
  }
  const label = (c) => ({ g: "go", m: "marginal", n: "no-go", d: "dark" })[c];
  function summary(s) {
    const n = { g: 0, m: 0, n: 0 };
    state.hours.forEach((h) => { const c = grade(s, h).c; if (n[c] != null) n[c]++; });
    const b = bestWindow(s);
    return `${n.g} go hours, ${n.m} marginal, ${n.n} no-go${b ? `; best ${windowText(b)}` : ""}`;
  }

  function bestWindow(s) {
    // longest run of go hours; if none, longest run of marginal-or-better
    const run = (ok) => {
      let best = null, cur = null;
      state.hours.forEach((h, i) => {
        if (ok(grade(s, h).c)) { cur = cur ? { a: cur.a, b: i } : { a: i, b: i }; if (!best || cur.b - cur.a > best.b - best.a) best = { ...cur }; }
        else cur = null;
      });
      return best;
    };
    const g = run((c) => c === "g");
    if (g) return { ...g, kind: "g" };
    const m = run((c) => c === "g" || c === "m");
    return m ? { ...m, kind: "m" } : null;
  }
  function windowText(b) {
    const a = state.hours[b.a], z = state.hours[b.b], len = b.b - b.a + 1;
    const end = parts(z.t).hh + 1;
    return `${dow(a.t)} ${hr12(parts(a.t).hh)}–${hr12(end % 24)} (${len} h)`;
  }

  function markBest() {
    const s = sportById(state.sport), b = bestWindow(s);
    if (!b) return;
    document.querySelectorAll(`.g-row[data-sport="${s.id}"] .g-cell`).forEach((el) => {
      const i = Number(el.dataset.i);
      if (i >= b.a && i <= b.b) el.classList.add("best-mark");
    });
  }

  function renderBest() {
    const s = sportById(state.sport), b = bestWindow(s);
    $("best-name").textContent = s.name;
    const t = $("best-time"), why = $("best-why");
    if (!b) {
      t.textContent = "No usable window in the next 48 hours."; t.classList.add("none");
      $("next").innerHTML = `<span>Next window</span> <b>${s.name}</b> none in 48 h <i aria-hidden="true">&darr;</i>`;
      const reasons = new Map();
      state.hours.filter((h) => h.day).forEach((h) => grade(s, h).why.forEach((w) => reasons.set(w, (reasons.get(w) || 0) + 1)));
      const top = [...reasons.entries()].sort((a, c) => c[1] - a[1]).slice(0, 2).map(([w]) => w);
      why.textContent = top.length ? `Mostly: ${top.join("; ")}.` : "It’s dark for most of the window.";
      return;
    }
    t.classList.remove("none");
    $("next").innerHTML = `<span>Next window</span> <b>${s.name}</b> ${windowText(b)}${b.kind === "m" ? " (marginal)" : ""} <i aria-hidden="true">&darr;</i>`;
    const hrs = state.hours.slice(b.a, b.b + 1);
    const wMax = Math.max(...hrs.map((h) => h.wind)), gMax = Math.max(...hrs.map((h) => h.gust));
    const tMin = Math.min(...hrs.map((h) => h.temp)), tMax = Math.max(...hrs.map((h) => h.temp));
    const pMax = Math.max(...hrs.map((h) => h.pop));
    t.textContent = `${windowText(b)}${b.kind === "m" ? " — marginal at best" : ""}`;
    why.textContent = `Wind to ${W(wMax)} ${wU()}, gusts to ${W(gMax)}, ${T(tMin)}–${T(tMax)}${tU()}, rain chance ≤ ${pMax}%.`;
  }

  function selectSport(id, focus) {
    state.sport = id; save();
    document.querySelectorAll(".g-row").forEach((r) => r.classList.toggle("sel", r.dataset.sport === id));
    document.querySelectorAll(".g-name").forEach((b) => { const on = b.dataset.sport === id; b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    document.querySelectorAll(".best-mark").forEach((el) => el.classList.remove("best-mark"));
    markBest(); renderBest(); renderCharts(); renderWeek();
  }

  $("grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sport]");
    if (b) selectSport(b.dataset.sport);
  });
  $("grid").addEventListener("keydown", (e) => {
    if (!e.target.classList.contains("g-name")) return;
    const i = SPORTS.findIndex((s) => s.id === state.sport);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    selectSport(SPORTS[(i + step + SPORTS.length) % SPORTS.length].id, true);
  });

  // ---------- charts ----------
  function chart(svg, opts) {
    const box = svg.getBoundingClientRect();
    const w = Math.max(280, Math.round(box.width)), h = Math.round(box.height) || 200;
    const pad = { l: 34, r: 10, t: 24, b: 22 };
    const hrs = state.hours, n = hrs.length;
    const x = (i) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - opts.min) / (opts.max - opts.min)) * (h - pad.t - pad.b);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    let out = "";
    // night bands
    let a = null;
    hrs.forEach((hh, i) => {
      if (!hh.day && a == null) a = i;
      if ((hh.day || i === n - 1) && a != null) { out += `<rect class="night" x="${x(Math.max(0, a - .5))}" y="${pad.t}" width="${x(Math.min(n - 1, i - .5)) - x(Math.max(0, a - .5))}" height="${h - pad.t - pad.b}"/>`; a = null; }
    });
    // grid + y labels
    opts.ticks.forEach((v) => { out += `<line class="gridline" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.l - 6}" y="${y(v) + 3}" text-anchor="end">${opts.fmt(v)}</text>`; });
    // x labels
    hrs.forEach((hh, i) => {
      const p = parts(hh.t);
      if (p.hh === 0 && i) out += `<line class="gridline" x1="${x(i)}" x2="${x(i)}" y1="${pad.t}" y2="${h - pad.b}"/><text class="axis day" x="${x(i) + 4}" y="${pad.t - 8}">${dow(hh.t)}</text>`;
      if (p.hh % 6 === 0) out += `<text class="axis" x="${x(i)}" y="${h - 6}" text-anchor="middle">${hr12(p.hh)}</text>`;
    });
    out += opts.draw(x, y, w, h, pad);
    out += `<g class="cur"></g>`;
    svg.innerHTML = out;
    svg._geo = { x, y, n, pad, w, h, opts };
  }
  const path = (pts) => pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join("");

  function renderCharts() {
    const hrs = state.hours;
    if (!hrs.length) return;
    const s = sportById(state.sport);
    const wFix = (v) => (state.metric ? v / 0.621371 : v);
    const wMax = Math.max(20, ...hrs.map((h) => h.gust), ...(LIMITS[s.id] || []).map(([, v]) => v)) * 1.1;
    const step = wMax > 60 ? 20 : 10;
    chart($("c-wind"), {
      min: 0, max: wMax, ticks: range(0, wMax, step), fmt: (v) => Math.round(wFix(v)),
      draw: (x, y, w, h, pad) => {
        const g = hrs.map((hh, i) => [x(i), y(hh.gust)]);
        let o = `<path class="a-gust" d="${path(g)}L${x(hrs.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z"/>`;
        o += `<path class="l-wind" d="${path(hrs.map((hh, i) => [x(i), y(hh.wind)]))}"/>`;
        (LIMITS[s.id] || []).forEach(([k, v]) => { const no = k.startsWith("no-go"); o += `<line class="lim ${no ? "lim-n" : "lim-m"}" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="lim-t ${no ? "lim-n" : "lim-m"}" x="${w - pad.r - 2}" y="${y(v) - 4}" text-anchor="end">${k} ${W(v)}</text>`; });
        return o;
      }
    });
    const tv = hrs.flatMap((h) => [h.temp, h.feel]);
    const tMin = Math.floor((Math.min(...tv) - 4) / 10) * 10, tMax = Math.ceil((Math.max(...tv) + 4) / 10) * 10;
    chart($("c-temp"), {
      min: tMin, max: tMax, ticks: range(tMin, tMax, tMax - tMin > 40 ? 20 : 10), fmt: (v) => `${T(v)}°`,
      draw: (x, y) => `<path class="l-feel" d="${path(hrs.map((hh, i) => [x(i), y(hh.feel)]))}"/><path class="l-temp" d="${path(hrs.map((hh, i) => [x(i), y(hh.temp)]))}"/>`
    });
    chart($("c-pop"), {
      min: 0, max: 100, ticks: [0, 50, 100], fmt: (v) => `${v}%`,
      draw: (x, y) => { const bw = Math.max(2, (x(1) - x(0)) * .7); return hrs.map((hh, i) => hh.pop ? `<rect class="b-pop" x="${x(i) - bw / 2}" y="${y(hh.pop)}" width="${bw}" height="${y(0) - y(hh.pop)}" rx="1"/>` : "").join(""); }
    });
    $("charts-lede").textContent = `Lines are the ${s.name.toLowerCase()} wind limits: amber dashed for marginal, red for no-go. Move across a chart, or focus it and use the arrow keys, to read any hour.`;
    if (state.cursor != null) cursor(state.cursor);
  }
  const range = (a, b, st) => { const r = []; for (let v = a; v <= b + 1e-9; v += st) r.push(v); return r; };

  function cursor(i) {
    state.cursor = i;
    const h = state.hours[i];
    if (!h) return;
    ["c-wind", "c-temp", "c-pop"].forEach((id) => {
      const svg = $(id), g = svg._geo; if (!g) return;
      const cx = g.x(i);
      let dots = "";
      if (id === "c-wind") dots = `<circle class="dot" cx="${cx}" cy="${g.y(h.gust)}" r="4" fill="var(--gust)"/><circle class="dot" cx="${cx}" cy="${g.y(h.wind)}" r="4.5" fill="var(--wind)"/>`;
      if (id === "c-temp") dots = `<circle class="dot" cx="${cx}" cy="${g.y(h.feel)}" r="4" fill="var(--feel)"/><circle class="dot" cx="${cx}" cy="${g.y(h.temp)}" r="4.5" fill="var(--temp)"/>`;
      if (id === "c-pop") dots = `<circle class="dot" cx="${cx}" cy="${g.y(h.pop)}" r="4.5" fill="var(--pop)"/>`;
      svg.querySelector(".cur").innerHTML = `<line class="cursor" x1="${cx}" x2="${cx}" y1="${g.pad.t}" y2="${g.h - g.pad.b}"/>${dots}`;
    });
    const gr = grade(sportById(state.sport), h);
    $("readout").innerHTML = `<b>${dow(h.t)} ${hr12(parts(h.t).hh)}</b> · wind ${W(h.wind)} gust ${W(h.gust)} ${wU()} from ${compass(h.dir)} · ${T(h.temp)}${tU()} (feels ${T(h.feel)}) · rain ${h.pop}% · <b>${sportById(state.sport).name}: ${label(gr.c)}</b>${gr.why.length && gr.c !== "d" ? ` — ${gr.why.join(", ")}` : ""}`;
  }
  ["c-wind", "c-temp", "c-pop"].forEach((id) => {
    const svg = $(id);
    const move = (e) => {
      const g = svg._geo; if (!g) return;
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (g.w / r.width);
      const i = Math.round(((px - g.pad.l) / (g.w - g.pad.l - g.pad.r)) * (g.n - 1));
      cursor(Math.max(0, Math.min(g.n - 1, i)));
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerdown", move);
    svg.tabIndex = 0;
    svg.addEventListener("keydown", (e) => {
      const st = { ArrowRight: 1, ArrowLeft: -1, End: 99, Home: -99 }[e.key];
      if (!st || !svg._geo) return;
      e.preventDefault();
      cursor(Math.max(0, Math.min(svg._geo.n - 1, (state.cursor ?? -1) + st)));
    });
    svg.addEventListener("focus", () => { if (state.cursor == null) cursor(0); });
  });

  // ---------- week ----------
  function renderWeek() {
    const d = state.data.daily, H = state.data.hourly;
    $("days").innerHTML = d.time.map((t, i) => {
      // best sport that day: most go hours in daylight
      const hrs = [];
      H.time.forEach((ht, j) => {
        if (!ht.startsWith(t)) return;
        const c = H.weather_code[j];
        hrs.push({ hh: parts(ht).hh, temp: H.temperature_2m[j], feel: H.apparent_temperature[j], rh: H.relative_humidity_2m[j], pop: H.precipitation_probability[j] ?? 0, precip: H.precipitation[j] ?? 0,
          wind: H.wind_speed_10m[j], gust: H.wind_gusts_10m[j], uv: H.uv_index[j] ?? 0, vis: H.visibility[j] ?? 99999, day: H.is_day[j] === 1, storm: STORM.has(c), wet: WET.has(c) });
      });
      const sel = sportById(state.sport);
      let best = null, cur = null;
      hrs.forEach((h, j) => {
        if (grade(sel, h).c === "g") { cur = cur ? { a: cur.a, b: j } : { a: j, b: j }; if (!best || cur.b - cur.a > best.b - best.a) best = { ...cur }; } else cur = null;
      });
      const top = best ? `${hr12(hrs[best.a].hh)}–${hr12((hrs[best.b].hh + 1) % 24)} go` : "No go hours";
      const [words, kind] = code(d.weather_code[i]);
      return `<li class="day${i === 0 ? " today" : ""}">
        <p class="day-name">${i === 0 ? "Today" : `${dow(t)} ${parts(t).d}`}</p>
        <div class="day-icon">${icon(kind, false)}</div>
        <p class="day-t">${T(d.temperature_2m_max[i])}° <span>${T(d.temperature_2m_min[i])}°</span></p>
        <p class="day-meta">${words}<br>Wind ${W(d.wind_speed_10m_max[i])} / ${W(d.wind_gusts_10m_max[i])} ${wU()}<br>Rain ${d.precipitation_probability_max[i] ?? 0}%</p>
        <p class="day-top"><b>${sel.name}</b>${top}</p>
      </li>`;
    }).join("");
  }

  // ---------- sun ----------
  function renderSun() {
    const d = state.data.daily, rise = d.sunrise[0], set = d.sunset[0];
    const r = minutes(rise), s = minutes(set), now = minutes(state.data.current.time);
    const gold = s - 60;
    $("sunrise").textContent = clock(rise);
    $("sunset").textContent = clock(set);
    const gh = Math.floor(gold / 60), gm = gold % 60;
    $("golden").textContent = `${gh % 12 || 12}:${String(gm).padStart(2, "0")} ${gh < 12 ? "AM" : "PM"}`;
    const len = d.daylight_duration[0] / 3600;
    $("daylen").textContent = `${Math.floor(len)} h ${Math.round((len % 1) * 60)} m`;
    const X = (m) => 40 + ((m - r) / (s - r)) * 520;
    const Y = (m) => 190 - Math.sin(Math.PI * Math.min(1, Math.max(0, (m - r) / (s - r)))) * 150;
    const pts = (a, b) => { const o = []; for (let m = a; m <= b; m += 6) o.push([X(m), Y(m)]); o.push([X(b), Y(b)]); return path(o); };
    const up = now > r && now < s;
    const nowC = Math.min(s, Math.max(r, now));
    $("sun-arc").innerHTML = `
      <line class="horizon" x1="10" x2="590" y1="190" y2="190"/>
      <path class="arc" d="${pts(r, s)}"/>
      <path class="gold" d="${pts(gold, s)}"/>
      ${up ? `<path class="arc-done" d="${pts(r, nowC)}"/><circle class="sun-glow" cx="${X(nowC)}" cy="${Y(nowC)}" r="18"/><circle class="sun-dot" cx="${X(nowC)}" cy="${Y(nowC)}" r="8"/>` : ""}
      <text x="40" y="212" text-anchor="middle">${clock(rise)}</text>
      <text x="560" y="212" text-anchor="middle">${clock(set)}</text>
      ${up ? "" : `<text x="300" y="120" text-anchor="middle">The sun is down</text>`}`;
  }

  // ---------- method table (from the same rules the grid uses) ----------
  document.querySelector("#rules tbody").innerHTML = SPORTS.map((s) =>
    `<tr><th scope="row">${s.name}</th><td>${s.nogo.map(([, w]) => w).join("; ")}</td><td>${s.marg.map(([, w]) => w).join("; ")}</td></tr>`).join("");

  // ---------- topo background: the contours crowd together as the wind rises ----------
  function topo(windMph = 8) {
    const svg = $("topo"), W0 = 1600, H0 = 900;
    const gap = 58 - Math.min(30, windMph) * 1.1;
    svg.setAttribute("viewBox", `0 0 ${W0} ${H0}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    const peaks = [[1180, 300, 1], [420, 760, .7]];
    let out = "";
    peaks.forEach(([cx, cy, k], pi) => {
      for (let ring = 1; ring <= 16; ring++) {
        const base = ring * gap * k, pts = [];
        for (let a = 0; a <= 360; a += 4) {
          const t = a * Math.PI / 180;
          const wob = 1 + .16 * Math.sin(3 * t + ring * .35 + pi) + .09 * Math.sin(5 * t - ring * .2) + .05 * Math.sin(9 * t + ring);
          pts.push([cx + Math.cos(t) * base * wob * 1.25, cy + Math.sin(t) * base * wob * .8]);
        }
        out += `<path class="${ring % 5 === 0 ? "idx" : ""}" d="${path(pts)}Z"/>`;
      }
    });
    svg.innerHTML = out;
  }
  topo();

  // ---------- controls ----------
  $("search").addEventListener("submit", (e) => { e.preventDefault(); const q = $("q").value.trim(); if (q) load(q); });
  document.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
    $("q").value = b.dataset.q;
    document.querySelectorAll("[data-q]").forEach((o) => o.setAttribute("aria-current", String(o === b)));
    load(b.dataset.q);
  }));
  $("refresh").addEventListener("click", () => {
    if (state.place && state.place.latitude != null) load(null, state.place); else load($("q").value.trim() || "Moab");
  });
  $("locate").addEventListener("click", () => {
    if (!navigator.geolocation) { $("err").textContent = "This browser can’t share its location."; return; }
    setBusy(true, "Locating");
    navigator.geolocation.getCurrentPosition(
      (p) => load(null, { latitude: +p.coords.latitude.toFixed(3), longitude: +p.coords.longitude.toFixed(3), name: "" }),
      () => { setBusy(false, "Live forecast"); $("err").textContent = "Location wasn’t shared. Search for a place instead."; },
      { timeout: 10000, maximumAge: 600000 }
    );
  });
  const unitBtn = $("unit");
  const paintUnit = () => { unitBtn.textContent = state.metric ? "°C · km/h" : "°F · mph"; unitBtn.setAttribute("aria-pressed", String(state.metric)); };
  unitBtn.addEventListener("click", () => { state.metric = !state.metric; save(); paintUnit(); renderAll(); });
  paintUnit();

  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(renderCharts, 150); });

  const first = state.lastQ || "Moab";
  $("q").value = first;
  load(first);
})();
