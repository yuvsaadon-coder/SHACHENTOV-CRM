/* C2 terrain & threat client — offline, dependency-free canvas map. */
"use strict";

const $ = (s) => document.querySelector(s);
const api = async (path, body) => {
  const res = await fetch(path, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
};

// ------------------------------------------------------------------ state
const S = {
  sc: null, rows: 0, cols: 0,
  layers: [],            // {id, label, canvas, visible, opacity, legend, tag}
  raw: {},               // decoded arrays for inspection
  vectors: [],           // {id, kind, ...}
  marks: { observers: [], positions: [], enemyStarts: [], enemyObjective: null, friendly: [], pending: [] },
  tool: "inspect",
  view: { s: 1, tx: 0, ty: 0 },
};

const TOOL_HINTS = {
  inspect: "לחיצה על תא מציגה גובה, שיפוע, כיסוי ועבירות.",
  observer: "לחיצה מוסיפה עמדת תצפית. נצפות יחידה משתמשת בעמדה האחרונה; נצפות מצטברת בכולן.",
  los: "לחצו על שתי נקודות לחישוב קו ראייה (כולל עקמומיות ושבירה).",
  radio: "לחצו על שתי נקודות לחישוב קשר: אזור פרנל, עקיפה ותקציב קשר.",
  route: "לחצו מוצא ואז יעד: 3 צירים שונים מרחבית + פרוזדור תנועה.",
  friendly: "לחצו מוצא ואז יעד של כוחותינו (לציר ההתקדמות ולהערכת האיום).",
  position: "לחצו להוספת עמדות כוחותינו (צופות על נתיבי האויב, לשטחי השמדה).",
  enemy: "לחיצה = מוצא אויב; לחיצה ימנית (או Shift+לחיצה) = יעד האויב.",
};

// ------------------------------------------------------------------ colour
function lerp(a, b, t) { return a + (b - a) * t; }
function rampLUT(stops) { // stops: [[t, r, g, b, a], ...]
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, ...c0] = stops[k], [t1, ...c1] = stops[k + 1];
    const u = Math.min(1, Math.max(0, (t - t0) / ((t1 - t0) || 1)));
    for (let j = 0; j < 4; j++) lut[i * 4 + j] = lerp(c0[j], c1[j], u);
  }
  return lut;
}
const RAMPS = {
  hypso: rampLUT([[0, 74, 120, 80, 255], [0.35, 150, 160, 95, 255], [0.65, 175, 145, 100, 255], [1, 235, 225, 210, 255]]),
  visible: rampLUT([[0, 40, 220, 90, 160], [1, 40, 220, 90, 160]]),
  cumulative: rampLUT([[0, 60, 120, 255, 120], [0.5, 60, 230, 160, 170], [1, 255, 240, 80, 210]]),
  dead: rampLUT([[0, 40, 220, 90, 140], [0.05, 250, 230, 80, 170], [0.4, 240, 120, 40, 190], [1, 150, 20, 60, 210]]),
  prob: rampLUT([[0, 70, 70, 200, 60], [0.5, 230, 200, 60, 170], [1, 40, 220, 90, 200]]),
  threat: rampLUT([[0, 255, 220, 0, 0], [0.15, 255, 200, 0, 90], [0.5, 255, 110, 0, 170], [1, 220, 0, 30, 230]]),
  traffic: rampLUT([[0, 180, 60, 255, 60], [0.3, 220, 60, 220, 150], [1, 255, 40, 120, 230]]),
  kts: rampLUT([[0, 20, 40, 120, 0], [0.5, 40, 110, 220, 60], [0.8, 120, 200, 255, 150], [1, 255, 230, 90, 220]]),
  exposure: rampLUT([[0, 255, 140, 0, 0], [0.3, 255, 140, 0, 90], [1, 255, 40, 0, 190]]),
  speed: rampLUT([[0, 160, 30, 30, 180], [0.3, 230, 200, 60, 160], [1, 40, 200, 90, 160]]),
  rci: rampLUT([[0, 120, 60, 20, 180], [0.3, 220, 170, 60, 150], [1, 70, 160, 90, 140]]),
  slope: rampLUT([[0, 255, 255, 255, 0], [0.25, 255, 230, 120, 90], [0.5, 255, 150, 50, 160], [0.75, 230, 40, 40, 200], [1, 120, 0, 60, 220]]),
  dh: rampLUT([[0, 0, 0, 0, 0], [0.1, 60, 140, 60, 120], [1, 30, 70, 30, 220]]),
};
const LC_COLORS = { 10: [24, 110, 40], 20: [150, 160, 60], 30: [170, 200, 110], 40: [230, 200, 100], 50: [200, 60, 60], 60: [190, 180, 160], 80: [40, 110, 220] };
const MCOO_COLORS = { 0: [0, 0, 0, 0], 1: [240, 200, 40, 120], 2: [220, 30, 40, 170] };

function b64(s) {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function decodeScalar(enc) { // -> Float32Array with NaN as nodata
  const q = b64(enc.data); const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] === 0 ? NaN : enc.min + (q[i] - 1) / 254 * (enc.max - enc.min);
  return out;
}
function canvasFrom(fn) {
  const cv = document.createElement("canvas"); cv.width = S.cols; cv.height = S.rows;
  const ctx = cv.getContext("2d"); const img = ctx.createImageData(S.cols, S.rows);
  fn(img.data); ctx.putImageData(img, 0, 0); return cv;
}
function scalarCanvas(enc, lut) {
  const q = b64(enc.data);
  return canvasFrom((d) => {
    for (let i = 0; i < q.length; i++) {
      if (q[i] === 0) continue;
      const k = Math.round((q[i] - 1) / 254 * 255) * 4;
      d[i * 4] = lut[k]; d[i * 4 + 1] = lut[k + 1]; d[i * 4 + 2] = lut[k + 2]; d[i * 4 + 3] = lut[k + 3];
    }
  });
}
function classCanvas(enc, colors) {
  const q = b64(enc.data);
  return canvasFrom((d) => {
    for (let i = 0; i < q.length; i++) {
      const c = colors[q[i]]; if (!c) continue;
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c.length > 3 ? c[3] : 255;
    }
  });
}
function lutCss(lut) {
  const stops = [];
  for (let i = 0; i <= 8; i++) { const k = Math.round(i / 8 * 255) * 4; stops.push(`rgba(${lut[k]},${lut[k + 1]},${lut[k + 2]},${Math.max(lut[k + 3] / 255, .15)})`); }
  return `linear-gradient(to left, ${stops.join(",")})`;
}

// ------------------------------------------------------------------ layers
function setLayer(id, label, canvas, opts = {}) {
  let L = S.layers.find((l) => l.id === id);
  if (!L) { L = { id, label, visible: opts.visible ?? true, opacity: opts.opacity ?? 1 }; S.layers.push(L); }
  Object.assign(L, { label, canvas, legend: opts.legend, tag: opts.tag });
  if (opts.visible !== undefined) L.visible = opts.visible;
  renderLayerList(); draw();
}
function renderLayerList() {
  const box = $("#layers"); box.innerHTML = "";
  [...S.layers].reverse().forEach((L) => {
    const row = document.createElement("div"); row.className = "layer";
    const tag = L.tag ? ` <span class="tag ${L.tag}">${L.tag === "prob" ? "הערכה" : "דטרמיניסטי"}</span>` : "";
    row.innerHTML = `<input type="checkbox" ${L.visible ? "checked" : ""}><span>${L.label}${tag}</span><input type="range" min="0" max="1" step="0.05" value="${L.opacity}">`;
    row.children[0].onchange = (e) => { L.visible = e.target.checked; draw(); };
    row.children[2].oninput = (e) => { L.opacity = +e.target.value; draw(); };
    box.appendChild(row);
  });
}
function renderLegend() {
  const vis = S.layers.filter((l) => l.visible && l.legend);
  const L = vis[vis.length - 1];
  const el = $("#legend");
  if (!L) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const lg = L.legend;
  if (lg.ramp) el.innerHTML = `<b>${L.label}</b><div class="ramp" style="background:${lutCss(lg.ramp)}"></div><div style="display:flex;justify-content:space-between"><span>${lg.lo}</span><span>${lg.hi}</span></div>`;
  else el.innerHTML = `<b>${L.label}</b>` + lg.items.map(([c, t]) => `<div class="item"><span class="sw" style="background:rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 255) / 255})"></span>${t}</div>`).join("");
}

// ------------------------------------------------------------------ map view
const cv = $("#map"); const ctx = cv.getContext("2d");
function resize() {
  const r = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr; draw();
}
function fit() {
  const r = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  const s = Math.min(r.width / S.cols, r.height / S.rows) * 0.96 * dpr;
  S.view = { s, tx: (r.width * dpr - S.cols * s) / 2, ty: (r.height * dpr - S.rows * s) / 2 };
}
function toCell(ev) {
  const r = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  const x = ((ev.clientX - r.left) * dpr - S.view.tx) / S.view.s;
  const y = ((ev.clientY - r.top) * dpr - S.view.ty) / S.view.s;
  return [Math.floor(y), Math.floor(x)];
}
const inGrid = ([r, c]) => r >= 0 && c >= 0 && r < S.rows && c < S.cols;

function draw() {
  if (!S.sc) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(S.view.s, 0, 0, S.view.s, S.view.tx, S.view.ty);
  ctx.imageSmoothingEnabled = S.view.s < 2;
  for (const L of S.layers) {
    if (!L.visible || !L.canvas) continue;
    ctx.globalAlpha = L.opacity; ctx.drawImage(L.canvas, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#7fbf8a55"; ctx.lineWidth = 1 / S.view.s; ctx.strokeRect(0, 0, S.cols, S.rows);
  drawGrid();
  for (const v of S.vectors) drawVector(v);
  drawMarks();
  renderLegend();
}
function drawGrid() { // 1 km grid lines
  const step = Math.round(1000 / S.sc.cell_size); if (step * S.view.s < 25) return;
  ctx.strokeStyle = "#ffffff18"; ctx.lineWidth = 1 / S.view.s; ctx.beginPath();
  for (let c = 0; c <= S.cols; c += step) { ctx.moveTo(c, 0); ctx.lineTo(c, S.rows); }
  for (let r = 0; r <= S.rows; r += step) { ctx.moveTo(0, r); ctx.lineTo(S.cols, r); }
  ctx.stroke();
}
const px = (n) => n / S.view.s * (window.devicePixelRatio || 1);
function polyline(cells, color, width, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = px(width); ctx.setLineDash(dash ? dash.map(px) : []);
  ctx.lineJoin = "round"; ctx.beginPath();
  cells.forEach(([r, c], i) => (i ? ctx.lineTo(c + .5, r + .5) : ctx.moveTo(c + .5, r + .5)));
  ctx.stroke(); ctx.setLineDash([]);
}
function label(text, [r, c], color = "#fff") {
  ctx.font = `${px(12)}px sans-serif`; ctx.textAlign = "center";
  ctx.lineWidth = px(3); ctx.strokeStyle = "#000c"; ctx.strokeText(text, c + .5, r - px(9));
  ctx.fillStyle = color; ctx.fillText(text, c + .5, r - px(9));
}
function symbol(kind, [r, c], color) { // simplified 2525: friendly = rectangle, hostile = diamond
  const x = c + .5, y = r + .5, h = px(7);
  ctx.lineWidth = px(2); ctx.strokeStyle = "#000"; ctx.fillStyle = color; ctx.beginPath();
  if (kind === "hostile") { ctx.moveTo(x, y - h); ctx.lineTo(x + h, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h, y); ctx.closePath(); }
  else if (kind === "friendly") ctx.rect(x - h * 1.3, y - h * .8, h * 2.6, h * 1.6);
  else if (kind === "star") { for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? h * .45 : h; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); } ctx.closePath(); }
  else ctx.arc(x, y, h * .7, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
}
function drawVector(v) {
  if (v.kind === "line") { polyline(v.cells, v.color, v.width || 3, v.dash); if (v.label) label(v.label, v.cells[Math.floor(v.cells.length / 2)], v.color); }
  if (v.kind === "point") { symbol(v.symbol, v.cell, v.color); if (v.label) label(v.label, v.cell, v.color); }
}
function drawMarks() {
  const m = S.marks;
  m.observers.forEach((p, i) => { symbol("circle", p, "#3ee07a"); label(`ת${i + 1}`, p, "#3ee07a"); });
  m.positions.forEach((p, i) => { symbol("friendly", p, "#4a90e2"); label(`ע${i + 1}`, p, "#9cc6ff"); });
  m.friendly.forEach((p, i) => { symbol("friendly", p, "#4a90e2"); label(i ? "יעד" : "מוצא", p, "#9cc6ff"); });
  m.enemyStarts.forEach((p) => symbol("hostile", p, "#e04848"));
  if (m.enemyObjective) { symbol("hostile", m.enemyObjective, "#ff9a9a"); label("יעד אויב", m.enemyObjective, "#ff9a9a"); }
  m.pending.forEach((p) => symbol("circle", p, "#ffd34d"));
}

// pan / zoom / click
let drag = null;
cv.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  drag = { x: e.clientX, y: e.clientY, tx: S.view.tx, ty: S.view.ty, moved: false, shift: e.shiftKey };
});
window.addEventListener("mouseup", (e) => {
  if (drag && !drag.moved && e.target === cv) onClick(toCell(e), { alt: drag.shift || e.shiftKey });
  drag = null;
});
cv.addEventListener("contextmenu", (e) => { // right click = alternate action (enemy objective)
  e.preventDefault(); onClick(toCell(e), { alt: true });
});
cv.addEventListener("mousemove", (e) => {
  const dpr = window.devicePixelRatio || 1;
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved) { S.view.tx = drag.tx + dx * dpr; S.view.ty = drag.ty + dy * dpr; draw(); }
  }
  const cell = toCell(e);
  if (S.sc && inGrid(cell)) {
    const i = cell[0] * S.cols + cell[1];
    const x = S.sc.origin[0] + (cell[1] + .5) * S.sc.cell_size, y = S.sc.origin[1] - (cell[0] + .5) * S.sc.cell_size;
    $("#cursor").textContent = `E ${x.toFixed(0)}  N ${y.toFixed(0)}  |  r${cell[0]} c${cell[1]}  |  ${S.raw.elev[i].toFixed(0)} m`;
  }
});
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  const mx = (e.clientX - r.left) * dpr, my = (e.clientY - r.top) * dpr;
  const f = Math.exp(-e.deltaY * 0.0015);
  S.view.tx = mx - (mx - S.view.tx) * f; S.view.ty = my - (my - S.view.ty) * f; S.view.s *= f; draw();
}, { passive: false });
window.addEventListener("resize", resize);

// ------------------------------------------------------------------ status / results
function status(text, cls = "") { const el = $("#status"); el.textContent = text; el.className = "status " + cls; }
async function busy(text, fn) {
  status(text + "…", "busy"); document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try { await fn(); } catch (err) { status("שגיאה: " + err.message, "err"); console.error(err); return; }
  finally { document.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
}
function card(title, html, tag) {
  const el = document.createElement("div"); el.className = "card";
  const t = tag ? ` <span class="tag ${tag}">${tag === "prob" ? "הערכה הסתברותית" : "דטרמיניסטי"}</span>` : "";
  el.innerHTML = `<h3>${title}${t}</h3>${html}`;
  $("#results").prepend(el);
}
const pct = (x) => (100 * x).toFixed(0) + "%";

// ------------------------------------------------------------------ marks & tools
function saveMarks() {
  const { pending, ...rest } = S.marks;
  api("/api/overlays", { key: "marks", value: rest }).catch(() => {});
}
function setTool(t) {
  S.tool = t; S.marks.pending = [];
  document.querySelectorAll("#tools button").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
  $("#tool-hint").textContent = TOOL_HINTS[t]; draw();
}
document.querySelectorAll("#tools button").forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
$("#clear-marks").onclick = () => {
  S.marks = { observers: [], positions: [], enemyStarts: [], enemyObjective: null, friendly: [], pending: [] };
  S.vectors = []; saveMarks(); draw();
};

const P = () => ({
  vehicle: $("#p-vehicle").value, evehicle: $("#p-evehicle").value,
  oh: +$("#p-oh").value, th: +$("#p-th").value, range: +$("#p-range").value,
  rain: +$("#p-rain").value, freq: +$("#p-freq").value, tau: +$("#p-tau").value,
});

function onClick(cell, ev) {
  if (!inGrid(cell)) return;
  const m = S.marks;
  switch (S.tool) {
    case "inspect": return inspect(cell);
    case "observer": m.observers.push(cell); break;
    case "position": m.positions.push(cell); break;
    case "friendly": if (m.friendly.length >= 2) m.friendly = []; m.friendly.push(cell); break;
    case "enemy": if (ev.alt) m.enemyObjective = cell; else m.enemyStarts.push(cell); break;
    case "los": case "radio": case "route":
      m.pending.push(cell);
      if (m.pending.length === 2) {
        const [a, b] = m.pending; m.pending = [];
        ({ los: runLos, radio: runRadio, route: runRoute })[S.tool](a, b);
      }
      draw(); return;
  }
  saveMarks(); draw();
}

function inspect(cell) {
  const i = cell[0] * S.cols + cell[1];
  const lc = S.raw.landcover[i];
  let html = `<table>
    <tr><td>תא</td><td>r${cell[0]} c${cell[1]}</td></tr>
    <tr><td>גובה קרקע</td><td>${S.raw.elev[i].toFixed(1)} מ'</td></tr>
    <tr><td>שיפוע</td><td>${isNaN(S.raw.slope[i]) ? "0" : S.raw.slope[i].toFixed(1)}%</td></tr>
    <tr><td>גובה מכשול (DSM-DTM)</td><td>${(S.raw.dh[i] || 0).toFixed(1)} מ'</td></tr>
    <tr><td>כיסוי קרקע</td><td>${S.sc.landcover_names[lc] || lc}</td></tr>`;
  if (S.raw.mcoo) {
    const names = ["GO – לא מוגבל", "SLOW – מוגבל", "NO GO – מוגבל מאוד"];
    const prov = S.raw.provenance[i]; const why = Object.entries(S.raw.provNames).filter(([k]) => prov & +k).map(([, v]) => v).join(", ");
    html += `<tr><td>MCOO (${S.raw.mcooVehicle})</td><td>${names[S.raw.mcoo[i]]}${why ? " · " + why : ""}</td></tr>`;
  }
  card("בדיקת תא", html + "</table>");
}

// ------------------------------------------------------------------ profile chart
function showProfile(title, prof, opts = {}) {
  $("#profile").classList.remove("hidden"); $("#profile-title").textContent = title;
  const c = $("#profile-canvas"); const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  c.width = r.width * dpr; c.height = r.height * dpr; const g = c.getContext("2d"); g.scale(dpr, dpr);
  const W = r.width, H = r.height, pad = 36;
  const d = prof.distance, all = [...prof.surface, ...prof.los, ...(prof.ground || []), ...(prof.fresnel_06 || [])];
  const lo = Math.min(...all) - 5, hi = Math.max(...all) + 5, D = d[d.length - 1] || 1;
  const X = (x) => W - pad - (x / D) * (W - 2 * pad), Y = (y) => H - 18 - (y - lo) / (hi - lo) * (H - 30);
  g.fillStyle = "#0b0f0d"; g.fillRect(0, 0, W, H);
  const area = (arr, fill) => { g.beginPath(); g.moveTo(X(d[0]), H); arr.forEach((z, i) => g.lineTo(X(d[i]), Y(z))); g.lineTo(X(D), H); g.closePath(); g.fillStyle = fill; g.fill(); };
  area(prof.surface, "#2e5a35"); if (prof.ground) area(prof.ground, "#6b5a3c");
  const line = (arr, color, dash) => { g.beginPath(); g.setLineDash(dash || []); g.strokeStyle = color; g.lineWidth = 2; arr.forEach((z, i) => (i ? g.lineTo(X(d[i]), Y(z)) : g.moveTo(X(d[i]), Y(z)))); g.stroke(); g.setLineDash([]); };
  if (prof.fresnel_06) line(prof.fresnel_06, "#ffd34d", [6, 4]);
  line(prof.los, opts.ok ? "#3ee07a" : "#ff5a5a");
  g.fillStyle = "#8fa198"; g.font = "11px sans-serif";
  g.fillText(`${hi.toFixed(0)} מ'`, 4, 14); g.fillText(`${lo.toFixed(0)} מ'`, 4, H - 20);
  g.fillText(`${(D / 1000).toFixed(2)} ק"מ`, 8, H - 4);
  const leg = opts.fresnel ? "ירוק/אדום = קו ישיר · צהוב מקווקו = 0.6 רדיוס פרנל · ירוק כהה = DSM" : "ירוק כהה = DSM (מבנים/צומח) · חום = DTM";
  g.fillText(leg, W / 2 - 160, 14);
}
$("#profile-close").onclick = () => $("#profile").classList.add("hidden");

// ------------------------------------------------------------------ analyses
async function runLos(a, b) {
  await busy("מחשב קו ראייה", async () => {
    const p = P(); const r = await api("/api/los", { a, b, h1: p.oh, h2: p.th });
    S.vectors = S.vectors.filter((v) => v.id !== "los");
    S.vectors.push({ id: "los", kind: "line", cells: [a, b], color: r.visible ? "#3ee07a" : "#ff5a5a", width: 2, dash: r.visible ? null : [6, 4] });
    showProfile(`קו ראייה: ${r.visible ? "יש" : "אין"} · ${(r.distance_m / 1000).toFixed(2)} ק"מ · מרווח מינימלי ${r.min_clearance_m.toFixed(1)} מ'`, r.profile, { ok: r.visible });
    status(r.visible ? "יש קו ראייה" : "אין קו ראייה"); draw();
  });
}
async function runRadio(a, b) {
  await busy("מחשב קשר", async () => {
    const p = P(); const r = await api("/api/radio", { a, b, h1: Math.max(p.oh, 2), h2: Math.max(p.th, 2), freq_mhz: p.freq });
    const st = { clear: "פנוי (≥0.6 פרנל)", fresnel_obstructed: "חסימת פרנל חלקית", blocked: "חסום (עקיפה)" }[r.status];
    S.vectors = S.vectors.filter((v) => v.id !== "radio");
    S.vectors.push({ id: "radio", kind: "line", cells: [a, b], color: r.link_ok ? "#5ab0ff" : "#ff5a5a", width: 2, dash: [3, 3] });
    showProfile(`קשר ${r.frequency_mhz} MHz: ${st} · אובדן ${r.path_loss_db} dB · מרווח ${r.link_margin_db} dB`, r.profile, { ok: r.status === "clear", fresnel: true });
    card("ניתוח קשר (RF LOS)", `<table>
      <tr><td>מצב</td><td>${st}</td></tr><tr><td>מרחק</td><td>${(r.distance_m / 1000).toFixed(2)} ק"מ</td></tr>
      <tr><td>יחס מרווח פרנל מינ'</td><td>${r.min_fresnel_clearance_ratio}</td></tr>
      <tr><td>FSPL / עקיפה</td><td>${r.fspl_db} / ${r.diffraction_loss_db} dB</td></tr>
      <tr><td>רמת קליטה</td><td>${r.rx_level_dbm} dBm (${r.link_ok ? "קשר תקין" : "אין קשר"})</td></tr></table>
      <div class="muted">סינון הנדסי (Knife-edge ITU-R P.526), לא תחליף ל-ITM.</div>`, "det");
    status("קשר: " + st); draw();
  });
}
const ROUTE_COLORS = ["#4ad6ff", "#b48cff", "#ffb84d", "#7cff7c", "#ff7ce0"];
async function runRoute(a, b) {
  await busy("מחשב צירים", async () => {
    const p = P(); const r = await api("/api/route", { start: a, goal: b, vehicle: p.vehicle, precip_mm_72h: p.rain, k: 3 });
    S.vectors = S.vectors.filter((v) => !String(v.id).startsWith("route"));
    r.routes.forEach((rt, i) => S.vectors.push({ id: "route" + i, kind: "line", cells: rt.cells, color: ROUTE_COLORS[i], width: i ? 2.5 : 4, label: rt.name }));
    S.vectors.push({ id: "route-a", kind: "point", symbol: "friendly", cell: a, color: "#4a90e2" });
    S.vectors.push({ id: "route-b", kind: "point", symbol: "star", cell: b, color: "#ffd34d" });
    setLayer("corridor", "פרוזדור תנועה (±10%)", classCanvas(r.corridor, { 1: [80, 210, 255, 70] }), { legend: { items: [[[80, 210, 255, 120], "תאים בטווח 10% מהעלות המינימלית"]] }, tag: "det" });
    card("צירי תנועה – " + $("#p-vehicle").selectedOptions[0].text,
      `<table><tr><th>ציר</th><th>זמן</th><th>אורך</th><th>שיפוע מרבי</th><th>מוגבל</th></tr>` +
      r.routes.map((x, i) => `<tr><td style="color:${ROUTE_COLORS[i]}">${x.name}</td><td>${x.time_min} ד'</td><td>${x.length_km} ק"מ</td><td>${x.max_slope_pct}%</td><td>${pct(x.slow_fraction)}</td></tr>`).join("") +
      `</table><div class="muted">חושב ב-${r.elapsed_s} ש'. צירים חלופיים נאלצים להתרחק 150 מ' מקודמיהם.</div>`, "det");
    status("צירים מוכנים"); draw();
  });
}

$("#a-mcoo").onclick = () => busy("מחשב MCOO", async () => {
  const p = P(); const r = await api("/api/mobility", { vehicle: p.vehicle, precip_mm_72h: p.rain });
  S.raw.mcoo = b64(r.mcoo.data); S.raw.provenance = b64(r.provenance.data); S.raw.provNames = r.provenance_names; S.raw.mcooVehicle = r.vehicle.name;
  setLayer("mcoo", "MCOO – " + r.vehicle.name, classCanvas(r.mcoo, MCOO_COLORS), {
    legend: { items: [[MCOO_COLORS[1], "Restricted – SLOW GO"], [MCOO_COLORS[2], "Severely Restricted – NO GO"], [[0, 0, 0, 0], "Unrestricted – GO (שקוף)"]] }, tag: "det",
  });
  setLayer("speed", "מהירות שטח [קמ\"ש]", scalarCanvas(r.speed, RAMPS.speed), { visible: false, legend: { ramp: RAMPS.speed, lo: "0", hi: r.speed.max.toFixed(0) }, tag: "det" });
  setLayer("rci", "חוזק קרקע RCI", scalarCanvas(r.rci, RAMPS.rci), { visible: false, legend: { ramp: RAMPS.rci, lo: "0", hi: "300" }, tag: "det" });
  const v = r.vehicle;
  card("MCOO – " + v.name, `<table>
    <tr><td>GO / SLOW / NO GO</td><td>${pct(r.fractions.go)} / ${pct(r.fractions.slow)} / ${pct(r.fractions.nogo)}</td></tr>
    <tr><td>שיפוע SLOW / NO GO</td><td>${v.slope_slow_pct}% / ${v.slope_nogo_pct}%</td></tr>
    <tr><td>Mobility Index (WES)</td><td>${v.mi ?? "—"}</td></tr>
    <tr><td>VCI₁ / VCI₅₀</td><td>${v.vci1.toFixed(1)} / ${v.vci50.toFixed(1)}</td></tr></table>
    <div class="muted">לחצו "בדיקה" על תא כדי לראות למה סווג (provenance).</div>`, "det");
  status("MCOO מוכן");
});

document.querySelectorAll(".split button").forEach((btn) => (btn.onclick = () => {
  const mode = btn.dataset.mode; const p = P(); const obs = S.marks.observers;
  if (!obs.length) { status("הוסיפו עמדת תצפית (כלי 👁)", "err"); setTool("observer"); return; }
  const observers = mode === "cumulative" ? obs : [obs[obs.length - 1]];
  busy("מחשב נצפות", async () => {
    const r = await api("/api/viewshed", { observers, observer_height: p.oh, target_height: p.th, max_range_m: p.range, mode, runs: 20 });
    const cfg = {
      binary: ["נצפות (שטח גלוי)", RAMPS.visible, "", ""],
      cumulative: ["נצפות מצטברת (מס' צופים)", RAMPS.cumulative, "1", String(observers.length)],
      dead_ground: ["עומק שטח מת [מ' לגובה הנדרש]", RAMPS.dead, "0 (גלוי)", "≥30"],
      probability: ["P(נראה) תחת שגיאת DEM", RAMPS.prob, "0", "1"],
    }[mode];
    setLayer("vs", cfg[0], scalarCanvas(r.layer, cfg[1]), { legend: mode === "binary" ? { items: [[[40, 220, 90, 160], "נראה מהעמדה"]] } : { ramp: cfg[1], lo: cfg[2], hi: cfg[3] }, tag: mode === "probability" ? "prob" : "det" });
    const st = Object.entries(r.stats).map(([k, v]) => `<tr><td>${k}</td><td>${k === "elapsed_s" ? v + " ש'" : pct(v)}</td></tr>`).join("");
    card(cfg[0], `<table>${st}</table>`, mode === "probability" ? "prob" : "det");
    status(`${cfg[0]} – ${r.stats.elapsed_s} ש'`);
  });
}));

$("#a-threat").onclick = () => {
  const m = S.marks; const p = P();
  if (m.friendly.length < 2) { status("סמנו מוצא ויעד לכוחותינו (🟦)", "err"); setTool("friendly"); return; }
  if (!m.enemyObjective) { status("סמנו יעד אויב: כלי 🟥 + לחיצה ימנית", "err"); setTool("enemy"); return; }
  busy("מריץ הערכת איום (ECOA/FCOA)", async () => {
    const r = await api("/api/threat", {
      friendly_start: m.friendly[0], friendly_goal: m.friendly[1], friendly_vehicle: p.vehicle,
      enemy_starts: m.enemyStarts.length ? m.enemyStarts : [m.friendly[1]], enemy_objective: m.enemyObjective,
      enemy_vehicle: p.evehicle, friendly_positions: m.positions, tau: p.tau, precip_mm_72h: p.rain,
    });
    setLayer("kts", "ציון שטח שולט (KTS)", scalarCanvas(r.kts, RAMPS.kts), { visible: false, legend: { ramp: RAMPS.kts, lo: "0", hi: "1" }, tag: "prob" });
    setLayer("exposure", "חשיפה לעמדות נ\"ט משוערות", scalarCanvas(r.exposure, RAMPS.exposure), { visible: false, legend: { ramp: RAMPS.exposure, lo: "0", hi: "1" }, tag: "prob" });
    setLayer("traffic", "צפיפות נתיבי אויב (Softmax)", scalarCanvas(r.enemy_traffic, RAMPS.traffic), { legend: { ramp: RAMPS.traffic, lo: "נמוך", hi: "גבוה" }, tag: "prob" });
    setLayer("at", "סבירות עמדת נ\"ט / מארב", scalarCanvas(r.at_probability, RAMPS.threat), { legend: { ramp: RAMPS.threat, lo: "0", hi: "1" }, tag: "prob" });
    setLayer("ea", "מועמדי שטח השמדה", classCanvas(r.ea_mask, { 1: [255, 60, 60, 200] }), { legend: { items: [[[255, 60, 60, 200], "פרוזדור אויב ∩ נצפה ∩ צוואר בקבוק"]] }, tag: "prob" });
    S.vectors = S.vectors.filter((v) => !String(v.id).startsWith("t-"));
    S.vectors.push({ id: "t-axis", kind: "line", cells: r.axis.cells, color: "#9cc6ff", width: 2, dash: [4, 4] });
    const fc = ["#4ad6ff", "#7cff7c"];
    r.fcoa.forEach((f, i) => S.vectors.push({ id: "t-f" + i, kind: "line", cells: f.cells, color: fc[i], width: 3.5, label: f.name }));
    r.at_peaks.slice(0, 8).forEach((pk, i) => S.vectors.push({ id: "t-p" + i, kind: "point", symbol: "hostile", cell: pk.cell, color: "#ff7a1a", label: `נ"ט ${(pk.p * 100).toFixed(0)}%` }));
    r.kts_peaks.slice(0, 4).forEach((pk, i) => S.vectors.push({ id: "t-k" + i, kind: "point", symbol: "star", cell: pk.cell, color: "#ffd34d", label: `שולט ${i + 1}` }));
    r.engagement_areas.slice(0, 5).forEach((ea) => S.vectors.push({ id: "t-ea" + ea.id, kind: "point", symbol: "circle", cell: ea.centroid, color: "#ff3c3c", label: `EA${ea.id}` }));
    card("השוואת דרכי פעולה (FCOA)", `<table><tr><th>חלופה</th><th>זמן</th><th>אורך</th><th>חשיפה ממוצעת</th><th>% ציר חשוף</th></tr>` +
      r.fcoa.map((f, i) => `<tr><td style="color:${fc[i]}">${f.name}</td><td>${f.time_min} ד'</td><td>${f.length_km} ק"מ</td><td>${pct(f.exposure.mean)}</td><td>${pct(f.exposure.exposed_fraction)}</td></tr>`).join("") +
      `</table><div class="muted">מטריצת השוואה – לא "המלצה אחת". החשיפה מחושבת מול ${Math.min(10, r.at_peaks.length)} עמדות הנ"ט הסבירות ביותר.</div>`, "prob");
    card("מועמדי שטחי השמדה (EA)", r.engagement_areas.length ?
      `<table><tr><th>#</th><th>שטח</th><th>צופים</th><th>תנועת אויב</th></tr>` + r.engagement_areas.slice(0, 8).map((e) => `<tr><td>EA${e.id}</td><td>${(e.area_m2 / 1000).toFixed(1)} דונם</td><td>${e.observers}</td><td>${pct(e.traffic)}</td></tr>`).join("") + "</table><div class='muted'>הצעת מיקום לבחינת המטה – ללא תכנון אש.</div>"
      : "<div class='muted'>לא נמצאו – הוסיפו עמדות כוחותינו (◼) הצופות על נתיב האויב.</div>", "prob");
    card("משקלות המודל (שקיפות)", `<div class="muted">AT logit = ${Object.entries(r.at_weights).map(([k, v]) => `${v}·${k}`).join(" + ")}<br>KTS = ${Object.entries(r.kts_weights).map(([k, v]) => `${v}·${k}`).join(" + ")}</div>`, "prob");
    status(`הערכת איום הושלמה ב-${r.elapsed_s} ש' – ${r.label}`); draw();
  });
};

$("#a-change").onclick = () => busy("מריץ זיהוי שינויים", async () => {
  const r = await api("/api/change/demo", {});
  const put = (id, fn) => { const c = $(id); c.width = r.cols; c.height = r.rows; const g = c.getContext("2d"); const img = g.createImageData(r.cols, r.rows); fn(img.data); g.putImageData(img, 0, 0); return g; };
  const rgb = (s) => (d) => { const q = b64(s); for (let i = 0; i < r.rows * r.cols; i++) { d[i * 4] = q[i * 3]; d[i * 4 + 1] = q[i * 3 + 1]; d[i * 4 + 2] = q[i * 3 + 2]; d[i * 4 + 3] = 255; } };
  put("#cd-t1", rgb(r.t1)); put("#cd-t2", rgb(r.t2));
  const pv = decodeScalar(r.p);
  const g = put("#cd-p", (d) => { for (let i = 0; i < pv.length; i++) { const v = pv[i] || 0; d[i * 4] = 255 * v; d[i * 4 + 1] = 40; d[i * 4 + 2] = 60 * (1 - v); d[i * 4 + 3] = 255; } });
  g.strokeStyle = "#ffd34d"; r.changes.forEach((c) => { const [r0, c0, r1, c1] = c.bbox; g.strokeRect(c0 - 1.5, r0 - 1.5, c1 - c0 + 3, r1 - r0 + 3); });
  $("#cd-list").innerHTML = `נמצאו ${r.changes.length} שינויים (אחרי ניכוי ירוק עונתי במחצית המערבית): ` + r.changes.map((c) => `#${c.id}: ${c.area_m2} מ"ר, p̄=${c.p_mean}`).join(" · ") +
    `<br>בפריסה מבצעית: מודל ChangeFormer/BIT מיוצא ל-ONNX נטען דרך <code>OnnxChangeModel</code> באותו ממשק.`;
  $("#modal").classList.remove("hidden"); status("זיהוי שינויים הושלם");
});
$("#modal-close").onclick = () => $("#modal").classList.add("hidden");

// ------------------------------------------------------------------ scenario
function loadScenario(sc) {
  S.sc = sc; S.rows = sc.rows; S.cols = sc.cols; S.layers = []; S.vectors = [];
  const shade = decodeScalar(sc.layers.hillshade), elev = decodeScalar(sc.layers.elevation);
  S.raw = { elev, slope: decodeScalar(sc.layers.slope), landcover: b64(sc.layers.landcover.data), dh: decodeScalar(sc.layers.dh) };
  const lo = sc.layers.elevation.min, hi = sc.layers.elevation.max;
  const base = canvasFrom((d) => {
    for (let i = 0; i < elev.length; i++) {
      const k = Math.round((elev[i] - lo) / (hi - lo || 1) * 255) * 4, s = 0.35 + 0.65 * (shade[i] || 0);
      d[i * 4] = RAMPS.hypso[k] * s; d[i * 4 + 1] = RAMPS.hypso[k + 1] * s; d[i * 4 + 2] = RAMPS.hypso[k + 2] * s; d[i * 4 + 3] = 255;
    }
  });
  setLayer("base", "תבליט + גבהים (DSM)", base, { legend: { ramp: RAMPS.hypso, lo: lo.toFixed(0) + " מ'", hi: hi.toFixed(0) + " מ'" } });
  setLayer("lc", "כיסוי קרקע (WorldCover)", classCanvas(sc.layers.landcover, LC_COLORS), {
    visible: false, opacity: 0.6, legend: { items: Object.entries(sc.landcover_names).map(([k, v]) => [LC_COLORS[k], v]) },
  });
  setLayer("slope", "שיפוע [%]", scalarCanvas(sc.layers.slope, RAMPS.slope), { visible: false, legend: { ramp: RAMPS.slope, lo: "0%", hi: "≥60%" }, tag: "det" });
  setLayer("dh", "גובה מבנים/צומח (ΔH)", scalarCanvas(sc.layers.dh, RAMPS.dh), { visible: false, legend: { ramp: RAMPS.dh, lo: "0", hi: "20 מ'" } });
  setLayer("roads", "דרכים (OSM)", classCanvas(sc.layers.roads, { 1: [235, 225, 205, 170] }), { legend: null });
  const opts = sc.vehicles.map((v) => `<option value="${v.key}">${v.name}</option>`).join("");
  $("#p-vehicle").innerHTML = opts; $("#p-evehicle").innerHTML = opts;
  $("#p-vehicle").value = "mbt"; $("#p-evehicle").value = "apc";
  $("#scenario-info").innerHTML = `${sc.name} · ${sc.rows}×${sc.cols} תאים · ${sc.cell_size} מ' · ${(sc.rows * sc.cell_size / 1000).toFixed(1)}×${(sc.cols * sc.cell_size / 1000).toFixed(1)} ק"מ<br>${sc.crs} · RMSE אנכי ${sc.vertical_rmse} מ'`;
  $("#limits").innerHTML = sc.limitations.map((t) => `<li>${t}</li>`).join("");
  $("#results").innerHTML = "";
  fit(); resize();
}
$("#sc-new").onclick = () => busy("מייצר גזרה", async () => {
  loadScenario(await api("/api/scenario", { size: +$("#sc-size").value, seed: +$("#sc-seed").value }));
  status("גזרה חדשה נטענה");
});

(async function init() {
  setTool("inspect");
  try {
    loadScenario(await api("/api/scenario"));
    const ov = await api("/api/overlays");
    if (ov.items.marks) Object.assign(S.marks, ov.items.marks, { pending: [] });
    draw(); status("מוכן · עבודה מקומית (Offline)");
  } catch (e) { status("שגיאה בטעינה: " + e.message, "err"); }
})();
