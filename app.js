import { Simulation, scenarios, defaults, DT, clamp, distanceToWall } from './engine.js';

const $ = id => document.getElementById(id);
const canvas = $('world'), ctx = canvas.getContext('2d'), chart = $('flow-chart'), chartCtx = chart.getContext('2d');
let scenario = 'hall', settings = { ...defaults }, sim = new Simulation(scenario, settings);
let running = false, speed = 1, view = 'people', tool = 'inspect', accumulator = 0, lastFrame = 0, lastUI = 0;
let zoom = 1, panX = 0, panY = 0, scale = 1, originX = 0, originY = 0, cw = 0, ch = 0, dpr = 1;
let drawing = null, pointer = null, hovered = null, undoStack = [], savedRuns = [], toastTimer, lastSavedKey = '';
const saveKey = 'crowd-lab-runs-v1';
try { const stored = JSON.parse(localStorage.getItem(saveKey) || '[]'); if (Array.isArray(stored)) savedRuns = stored.filter(r => r && scenarios[r.scenario] && typeof r.time === 'number' && Array.isArray(r.walls) && Array.isArray(r.exits)).slice(-8); } catch { /* Storage is optional. */ }
const fmt = n => Math.round(n).toLocaleString('en-US');
const timeLabel = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const colors = ['#b7d6a5', '#bbd9ac', '#99b98e', '#d3dfb1', '#aecda1'];

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3300); }
function updateSettingsUI() {
  $('scenario').value = scenario;
  $('population').value = settings.count; $('panic').value = settings.panic; $('release').value = settings.release;
  $('exit-width').value = settings.width; $('friction').value = settings.friction; $('variation').value = settings.variation; $('casualties').checked = settings.casualties; $('seed').value = settings.seed;
  $('population-value').textContent = fmt(settings.count); $('panic-value').textContent = `${settings.panic}%`; $('exit-width-value').textContent = `${settings.width.toFixed(1)} m`;
  $('friction-value').textContent = `${settings.friction}%`; $('variation-value').textContent = `${settings.variation}%`;
  const venue = scenarios[scenario];
  $('dimensions').textContent = `${venue.w} × ${venue.h} m`;
  document.querySelectorAll('input[type=range]').forEach(input => input.style.setProperty('--fill', `${100 * (input.value - input.min) / (input.max - input.min)}%`));
}
function layout() { return { walls: structuredClone(sim.walls), exits: structuredClone(sim.exits), arrows: structuredClone(sim.arrows) }; }
function restart(keepLayout = true) {
  const retained = keepLayout ? layout() : null;
  running = false; accumulator = 0; hovered = null; $('inspection').hidden = true;
  sim = new Simulation(scenario, settings, retained); lastSavedKey = '';
  updateSettingsUI(); updateUI(); draw();
}
function checkpoint() { undoStack.push(layout()); if (undoStack.length > 40) undoStack.shift(); $('undo').disabled = false; }
function editLayout(mutator) { checkpoint(); mutator(); restart(); if (sim.trapped) toast(`${fmt(sim.trapped)} people have no route to an exit. Try opening the enclosure.`); }
function setTool(next) {
  tool = next; drawing = null;
  document.querySelectorAll('[data-tool]').forEach(b => { const active = b.dataset.tool === tool; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); });
  canvas.style.cursor = tool === 'inspect' ? 'grab' : 'crosshair';
  const hints = { inspect: '', wall: 'Drag to draw · Shift to snap · resets run', arrow: 'Drag toward destination · 85% follow · resets run', exit: 'Click room edge to add exit · resets run', erase: 'Click wall, arrow or exit to erase · resets run' };
  $('canvas-hint').textContent = hints[tool]; $('canvas-hint').hidden = !hints[tool]; draw();
}
function setRunning(next) {
  if (next && !sim.exits.length) { toast('Add an exit along the room’s edge first.'); return; }
  if (next && sim.complete) restart();
  running = next; accumulator = 0; updateUI();
}
function transform() {
  const compact = cw < 500;
  const base = Math.min((cw - (compact ? 48 : 150)) / sim.w, (ch - (compact ? 160 : 120)) / sim.h);
  scale = Math.max(2, base) * zoom;
  originX = (cw - sim.w * scale) / 2 + panX + (compact ? 0 : 13); originY = (ch - sim.h * scale) / 2 + panY;
}
function resize() {
  const rect = canvas.getBoundingClientRect(); cw = rect.width; ch = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  const cr = chart.getBoundingClientRect(); chart.width = Math.round(cr.width * dpr); chart.height = Math.round(cr.height * dpr);
  transform(); draw(); drawChart();
}
function worldPoint(event) { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left - originX) / scale, y: (event.clientY - rect.top - originY) / scale }; }
function clipped(p) { return { x: clamp(p.x, 0, sim.w), y: clamp(p.y, 0, sim.h) }; }
function snapped(p, shift) {
  p = clipped(p);
  if (shift && drawing) { const dx = p.x - drawing.start.x, dy = p.y - drawing.start.y, angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, distance = Math.hypot(dx, dy); p = clipped({ x: drawing.start.x + Math.cos(angle) * distance, y: drawing.start.y + Math.sin(angle) * distance }); }
  return p;
}
function nearEdge(p) {
  const edges = [{ side: 'left', d: Math.abs(p.x), at: p.y, len: sim.h }, { side: 'right', d: Math.abs(p.x - sim.w), at: p.y, len: sim.h }, { side: 'top', d: Math.abs(p.y), at: p.x, len: sim.w }, { side: 'bottom', d: Math.abs(p.y - sim.h), at: p.x, len: sim.w }].sort((a, b) => a.d - b.d);
  if (edges[0].d > Math.max(1, 20 / scale) || edges[0].at < 0 || edges[0].at > edges[0].len) return null;
  return { side: edges[0].side, at: clamp(edges[0].at, settings.width / 2 + .3, edges[0].len - settings.width / 2 - .3), width: settings.width };
}
function eraseAt(p) {
  let nearest = -1, arrowIndex = -1, d = Math.max(.6, 10 / scale);
  sim.walls.forEach((s, i) => { const distance = distanceToWall(p.x, p.y, s); if (distance < d) { d = distance; nearest = i; } });
  sim.arrows.forEach((s, i) => { const distance = distanceToWall(p.x, p.y, s); if (distance < d) { d = distance; arrowIndex = i; } });
  if (arrowIndex >= 0) { editLayout(() => sim.arrows.splice(arrowIndex, 1)); return; }
  if (nearest >= 0) { editLayout(() => sim.walls.splice(nearest, 1)); return; }
  const edge = nearEdge(p);
  if (edge) { const i = sim.exits.findIndex(e => e.side === edge.side && Math.abs(edge.at - e.at) < e.width / 2 + .4); if (i >= 0) { editLayout(() => sim.exits.splice(i, 1)); return; } }
  toast('Click a wall, arrow or exit.');
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  canvas.focus({ preventScroll: true }); const p = worldPoint(event); canvas.setPointerCapture(event.pointerId);
  if (tool === 'wall' || tool === 'arrow') {
    if (p.x < 0 || p.x > sim.w || p.y < 0 || p.y > sim.h) { toast('Start inside the venue.'); return; }
    setRunning(false); drawing = { start: clipped(p), end: clipped(p) };
  } else if (tool === 'exit') {
    const exit = nearEdge(p);
    if (!exit) toast('Place exits on the outer wall of the venue.');
    else if (sim.exits.some(e => e.side === exit.side && Math.abs(e.at - exit.at) < (e.width + exit.width) / 2 + .4)) toast('That exit would overlap an existing opening.');
    else if (sim.exits.length >= 12) toast('This sandbox supports up to 12 exits.');
    else editLayout(() => sim.exits.push(exit));
  } else if (tool === 'erase') eraseAt(p);
  else { pointer = { x: event.clientX, y: event.clientY, panX, panY }; canvas.style.cursor = 'grabbing'; }
  draw();
});
canvas.addEventListener('pointermove', event => {
  const p = worldPoint(event);
  if (drawing) { drawing.end = snapped(p, event.shiftKey); draw(); return; }
  if (pointer) { panX = pointer.panX + event.clientX - pointer.x; panY = pointer.panY + event.clientY - pointer.y; transform(); draw(); return; }
  hovered = null;
  if (tool === 'inspect') {
    let nearest = Math.max(.5, 9 / scale);
    for (const a of sim.agents) { if (a.state === 'exited') continue; const d = Math.hypot(a.x - p.x, a.y - p.y); if (d < nearest) { hovered = a; nearest = d; } }
  }
  if (hovered) {
    const state = hovered.state === 'moving' ? hovered.trapped ? 'No route to exit' : sim.time < hovered.start ? 'Waiting for release' : hovered.waiting ? 'Waiting for space' : hovered.arrow >= 0 ? 'Following exit arrow' : 'Moving to exit' : hovered.state === 'fallen' ? 'Fallen · illustrative' : 'Dead · illustrative';
    $('inspection').innerHTML = `<b>PERSON ${hovered.id + 1} · ${state}</b>Local density ${hovered.density.toFixed(1)} people / m²<br>Contact index ${Math.round(hovered.contact * 100)}% · Speed ${Math.hypot(hovered.vx, hovered.vy).toFixed(1)} m/s`;
    $('inspection').hidden = false;
  } else $('inspection').hidden = true;
  if (!running) draw();
});
canvas.addEventListener('pointerup', () => {
  if (drawing) {
    const { start, end } = drawing; drawing = null;
    if (Math.hypot(start.x - end.x, start.y - end.y) > .4) {
      if (tool === 'arrow') {
        if (sim.arrows.length >= 30) toast('30-arrow limit reached.');
        else if (Math.hypot(start.x - end.x, start.y - end.y) < 1) toast('Draw an arrow at least 1 m long.');
        else editLayout(() => sim.arrows.push({ ax: start.x, ay: start.y, bx: end.x, by: end.y }));
      }
      else if (sim.walls.length >= 80) toast('Wall limit reached. Erase a few segments before adding more.');
      else editLayout(() => sim.walls.push({ ax: start.x, ay: start.y, bx: end.x, by: end.y }));
    }
  }
  pointer = null; canvas.style.cursor = tool === 'inspect' ? 'grab' : 'crosshair'; draw();
});
canvas.addEventListener('pointercancel', () => { drawing = null; pointer = null; draw(); });
canvas.addEventListener('pointerleave', () => { hovered = null; $('inspection').hidden = true; });
function changeZoom(value) { zoom = clamp(value, .6, 3); transform(); $('zoom-fit').textContent = `${Math.round(zoom * 100)}%`; draw(); }
canvas.addEventListener('wheel', event => { event.preventDefault(); changeZoom(zoom * (event.deltaY > 0 ? .93 : 1.07)); }, { passive: false });
$('zoom-in').onclick = () => changeZoom(zoom * 1.2); $('zoom-out').onclick = () => changeZoom(zoom / 1.2);
$('zoom-fit').onclick = () => { panX = panY = 0; changeZoom(1); };
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('canvas-wrap').requestFullscreen(); } catch { toast('Fullscreen is unavailable in this browser. Use zoom to inspect the crowd.'); } };
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; document.querySelectorAll('[data-view]').forEach(tab => { tab.classList.toggle('active', tab === b); tab.setAttribute('aria-pressed', tab === b); }); $('legend-description').innerHTML = view === 'density' ? '<i class="legend-person"></i> Local density · 1 m radius' : '<i class="legend-person"></i> One circle = one person'; $('color-legend').firstElementChild.textContent = view === 'density' ? '0 people/m²' : 'Low contact'; $('color-legend').lastElementChild.textContent = view === 'density' ? '6+' : 'High'; draw(); });
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(tab => { tab.classList.toggle('active', tab === b); tab.setAttribute('aria-pressed', tab === b); }); });
$('play').onclick = () => setRunning(!running);
$('reset').onclick = () => restart();
$('undo').onclick = () => { const previous = undoStack.pop(); if (!previous) return; sim.walls = previous.walls; sim.exits = previous.exits; sim.arrows = previous.arrows || []; restart(); $('undo').disabled = !undoStack.length; };
$('clear-walls').onclick = () => { if (sim.walls.length) editLayout(() => sim.walls = []); };
$('scenario').onchange = () => { scenario = $('scenario').value; const v = scenarios[scenario]; settings = { ...settings, count: v.count, panic: v.panic, width: v.exits[0].width }; undoStack = []; $('undo').disabled = true; panX = panY = 0; zoom = 1; restart(false); changeZoom(1); };
for (const [id, key] of [['population', 'count'], ['panic', 'panic'], ['exit-width', 'width'], ['friction', 'friction'], ['variation', 'variation']]) {
  $(id).addEventListener('input', () => { settings[key] = Number($(id).value); updateSettingsUI(); });
  $(id).addEventListener('change', () => {
    if (key === 'width') { checkpoint(); sim.exits.forEach(e => e.width = settings.width); }
    restart();
  });
}
$('release').onchange = () => { settings.release = +$('release').value; restart(); };
$('casualties').onchange = () => { settings.casualties = $('casualties').checked; restart(); };
$('seed').onchange = () => { settings.seed = clamp(Math.round(Number($('seed').value) || 42), 1, 999999); restart(); };
const dialog = $('science-dialog');
$('science-open').onclick = () => dialog.showModal(); $('science-close').onclick = () => dialog.close();
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
document.addEventListener('keydown', event => {
  if (dialog.open || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'Escape') { drawing = null; pointer = null; setTool('inspect'); }
  if (event.code === 'Space') { event.preventDefault(); setRunning(!running); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $('undo').click(); return; }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const tools = { v: 'inspect', w: 'wall', a: 'arrow', e: 'exit', r: 'erase' }; if (tools[event.key.toLowerCase()]) setTool(tools[event.key.toLowerCase()]);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && running) { setRunning(false); toast('Paused while the tab was in the background.'); } });

function pressureColor(value) { return value < .18 ? '#bbd7a3' : value < .35 ? '#d4d394' : value < .55 ? '#e4c373' : value < .73 ? '#e9a264' : value < .88 ? '#e37b58' : '#df5552'; }
function drawArrow(s, preview = false) {
  const angle = Math.atan2(s.by - s.ay, s.bx - s.ax), head = Math.min(.8, Math.hypot(s.bx - s.ax, s.by - s.ay) * .3);
  ctx.save(); ctx.strokeStyle = preview ? '#c2fff6' : '#73cfcd'; ctx.lineWidth = preview ? .16 : .22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.moveTo(s.bx - Math.cos(angle - .6) * head, s.by - Math.sin(angle - .6) * head); ctx.lineTo(s.bx, s.by); ctx.lineTo(s.bx - Math.cos(angle + .6) * head, s.by - Math.sin(angle + .6) * head); ctx.stroke();
  ctx.fillStyle = '#73cfcd'; ctx.beginPath(); ctx.arc(s.ax, s.ay, .2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function draw() {
  if (!cw || !ch) return;
  transform(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch); ctx.fillStyle = '#192722'; ctx.fillRect(0, 0, cw, ch);
  ctx.save(); ctx.translate(originX, originY); ctx.scale(scale, scale);
  ctx.fillStyle = '#203028'; ctx.fillRect(0, 0, sim.w, sim.h);
  // Quiet drafting grid, with a five-meter rhythm.
  ctx.lineWidth = .5 / scale; ctx.strokeStyle = '#41563b30'; ctx.beginPath();
  for (let x = 0; x <= sim.w; x += 1) { ctx.moveTo(x, 0); ctx.lineTo(x, sim.h); }
  for (let y = 0; y <= sim.h; y += 1) { ctx.moveTo(0, y); ctx.lineTo(sim.w, y); } ctx.stroke();
  ctx.strokeStyle = '#63775026'; ctx.lineWidth = .6 / scale; ctx.beginPath();
  for (let x = 0; x <= sim.w; x += 5) { ctx.moveTo(x, 0); ctx.lineTo(x, sim.h); }
  for (let y = 0; y <= sim.h; y += 5) { ctx.moveTo(0, y); ctx.lineTo(sim.w, y); } ctx.stroke();
  const excluded = scenarios[scenario].excluded;
  if (excluded && sim.walls.length >= 4) { ctx.fillStyle = '#192922'; ctx.fillRect(excluded.x, excluded.y, excluded.w, excluded.h); ctx.strokeStyle = '#52664444'; ctx.lineWidth = .06; ctx.strokeRect(excluded.x + 1, excluded.y + 1, excluded.w - 2, excluded.h - 2); ctx.beginPath(); ctx.arc(excluded.x + excluded.w / 2, excluded.y + excluded.h / 2, 3, 0, Math.PI * 2); ctx.moveTo(excluded.x + excluded.w / 2, excluded.y + 1); ctx.lineTo(excluded.x + excluded.w / 2, excluded.y + excluded.h - 1); ctx.stroke(); }
  // Decorative dashed apron makes door direction legible without motion.
  sim.exits.forEach(e => {
    ctx.save(); const horizontal = e.side === 'top' || e.side === 'bottom'; const x = horizontal ? e.at : e.side === 'left' ? 0 : sim.w, y = horizontal ? e.side === 'top' ? 0 : sim.h : e.at;
    ctx.translate(x, y); const angle = e.side === 'right' ? 0 : e.side === 'bottom' ? Math.PI / 2 : e.side === 'left' ? Math.PI : -Math.PI / 2; ctx.rotate(angle);
    ctx.fillStyle = '#b5df7720'; ctx.fillRect(-1.1, -e.width / 2, 2.6, e.width); ctx.strokeStyle = '#a3c88050'; ctx.setLineDash([.2, .25]); ctx.lineWidth = .04; ctx.strokeRect(-1.1, -e.width / 2, 2.6, e.width); ctx.setLineDash([]);
    ctx.strokeStyle = '#bfe995'; ctx.lineWidth = .13; ctx.beginPath(); ctx.moveTo(1.7, 0); ctx.lineTo(2.5, 0); ctx.moveTo(2.15, -.3); ctx.lineTo(2.5, 0); ctx.lineTo(2.15, .3); ctx.stroke(); ctx.restore();
  });
  if (view !== 'people') {
    // Grid aggregate: bounded work even at stadium population.
    const heat = new Map();
    for (const a of sim.agents) { if (a.state === 'exited') continue; const v = view === 'density' ? a.density / 6 : a.contact; if (v < .2) continue; const x = Math.floor(a.x), y = Math.floor(a.y), key = x + y * 1000, prior = heat.get(key); if (!prior || prior.v < v) heat.set(key, { x, y, v }); }
    heat.forEach(({ x, y, v }) => { ctx.globalAlpha = .07 + Math.min(v, 1) * .16; ctx.fillStyle = pressureColor(v); ctx.fillRect(x, y, 1, 1); }); ctx.globalAlpha = 1;
  }
  for (const a of sim.agents) {
    if (a.state === 'exited') continue;
    if (a.x * scale + originX < -10 || a.x * scale + originX > cw + 10 || a.y * scale + originY < -10 || a.y * scale + originY > ch + 10) continue;
    if (a.state === 'dead') { ctx.strokeStyle = '#d66861'; ctx.lineWidth = .08; ctx.beginPath(); ctx.moveTo(a.x - .17, a.y - .17); ctx.lineTo(a.x + .17, a.y + .17); ctx.moveTo(a.x + .17, a.y - .17); ctx.lineTo(a.x - .17, a.y + .17); ctx.stroke(); continue; }
    const value = view === 'density' ? a.density / 6 : a.contact;
    ctx.fillStyle = a.state === 'fallen' ? '#e4985d' : view === 'people' && value < .18 ? colors[Math.floor(a.hue * colors.length)] : pressureColor(value);
    ctx.globalAlpha = sim.time < a.start && sim.time > 0 ? .32 : a.waiting ? .55 : .9;
    ctx.beginPath(); ctx.arc(a.x, a.y, a.radius * .83, 0, Math.PI * 2); ctx.fill();
    if (a.state === 'fallen') { ctx.strokeStyle = '#fbd7a8'; ctx.lineWidth = .045; ctx.beginPath(); ctx.arc(a.x, a.y, a.radius + .08, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const wall of sim.solids) {
    ctx.strokeStyle = '#0e1b15'; ctx.lineWidth = .32; ctx.beginPath(); ctx.moveTo(wall.ax, wall.ay); ctx.lineTo(wall.bx, wall.by); ctx.stroke();
    ctx.strokeStyle = '#96a97d'; ctx.lineWidth = .13; ctx.stroke();
  }
  for (const wall of sim.walls) { ctx.fillStyle = '#c6d5aa'; ctx.beginPath(); ctx.arc(wall.ax, wall.ay, .15, 0, Math.PI * 2); ctx.arc(wall.bx, wall.by, .15, 0, Math.PI * 2); ctx.fill(); }
  for (const arrow of sim.arrows) drawArrow(arrow);
  if (hovered && hovered.state !== 'exited') { ctx.strokeStyle = '#e6f6cb'; ctx.lineWidth = .08; ctx.beginPath(); ctx.arc(hovered.x, hovered.y, .45, 0, Math.PI * 2); ctx.stroke(); }
  if (drawing) {
    if (tool === 'arrow') drawArrow({ ax: drawing.start.x, ay: drawing.start.y, bx: drawing.end.x, by: drawing.end.y }, true);
    else {
    ctx.strokeStyle = '#e5fdb6'; ctx.lineWidth = .15; ctx.setLineDash([.3, .2]); ctx.beginPath(); ctx.moveTo(drawing.start.x, drawing.start.y); ctx.lineTo(drawing.end.x, drawing.end.y); ctx.stroke(); ctx.setLineDash([]);
    }
    const l = Math.hypot(drawing.end.x - drawing.start.x, drawing.end.y - drawing.start.y);
    ctx.font = `${11 / scale}px "DM Sans",sans-serif`; ctx.fillStyle = '#e3f6c7'; ctx.textAlign = 'center'; ctx.fillText(`${l.toFixed(1)} m`, (drawing.start.x + drawing.end.x) / 2, (drawing.start.y + drawing.end.y) / 2 - .65);
  }
  ctx.restore();
  sim.exits.forEach((e, i) => {
    const horizontal = e.side === 'top' || e.side === 'bottom', x = originX + (horizontal ? e.at : e.side === 'left' ? -3.3 : sim.w + 3.3) * scale, y = originY + (horizontal ? e.side === 'top' ? -2.3 : sim.h + 2.7 : e.at) * scale;
    ctx.fillStyle = '#b3cc98'; ctx.font = '7px "DM Sans",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${String.fromCharCode(65 + i)}`, x, y - 3); ctx.fillStyle = '#798f69'; ctx.font = '7px "DM Sans",sans-serif'; ctx.fillText(`${e.width.toFixed(1)}m`, x, y + 8);
  });
  const scaleMeters = zoom > 1.8 ? 2 : 5; document.querySelector('.canvas-scale span').style.width = `${scaleMeters * scale}px`; $('scale-label').textContent = `${scaleMeters} m`;
}
function drawChart() {
  const width = chart.width / dpr, height = chart.height / dpr;
  chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0); chartCtx.clearRect(0, 0, width, height);
  chartCtx.strokeStyle = '#dce2d170'; chartCtx.lineWidth = 1; chartCtx.setLineDash([3, 4]);
  for (let y = 15; y < height; y += 25) { chartCtx.beginPath(); chartCtx.moveTo(0, y); chartCtx.lineTo(width, y); chartCtx.stroke(); } chartCtx.setLineDash([]);
  const history = sim.history, maxTime = Math.max(60, sim.time), maxFlow = Math.max(5, ...history.map(s => s.flow));
  $('chart-end').textContent = `${Math.ceil(maxTime)}s`;
  if (history.length < 2) return;
  const y = v => height - 4 - v / maxFlow * (height - 15), x = t => t / maxTime * width;
  chartCtx.beginPath(); chartCtx.moveTo(0, height); history.forEach(p => chartCtx.lineTo(x(p.time), y(p.flow))); chartCtx.lineTo(x(history.at(-1).time), height); chartCtx.closePath();
  const gradient = chartCtx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, '#a9c18655'); gradient.addColorStop(1, '#a9c18600'); chartCtx.fillStyle = gradient; chartCtx.fill();
  chartCtx.beginPath(); chartCtx.moveTo(0, height - 4); history.forEach(p => chartCtx.lineTo(x(p.time), y(p.flow))); chartCtx.strokeStyle = '#8aa764'; chartCtx.lineWidth = 1.6; chartCtx.stroke();
}
function updateUI() {
  const state = sim.complete ? 'COMPLETE' : running ? 'RUNNING' : sim.time > 0 ? 'PAUSED' : 'READY';
  $('status-text').textContent = state; document.querySelector('.canvas-status').classList.toggle('running', running);
  $('play-icon').textContent = running ? 'Ⅱ' : '▶'; $('play-label').textContent = running ? 'Pause' : sim.complete ? 'Restart' : sim.time > 0 ? 'Resume' : 'Start';
  $('sim-time').textContent = timeLabel(sim.time); $('evacuated').textContent = fmt(sim.evacuated); $('total-count').textContent = `/ ${fmt(sim.initialCount)}`;
  $('flow').textContent = (sim.flow || 0).toFixed(1); $('density').textContent = sim.peakDensity.toFixed(1); $('fallen').textContent = fmt(sim.fallen); $('dead').textContent = fmt(sim.dead);
  $('evacuation-progress').style.width = `${sim.evacuated / sim.initialCount * 100}%`;
  $('exit-info').textContent = `${sim.exits.length} exit${sim.exits.length === 1 ? '' : 's'}`;
  $('route-warning').hidden = !sim.trapped;
  $('route-warning').textContent = sim.trapped ? `${fmt(sim.trapped)} people have no route to an exit.` : '';
  $('save-run').disabled = sim.time < 1;
  drawChart();
}
function renderRuns() {
  $('runs-section').hidden = !savedRuns.length; $('runs-body').replaceChildren();
  savedRuns.forEach((run, i) => {
    const tr = document.createElement('tr');
    const cells = [`${String(i + 1).padStart(2, '0')} / ${scenarios[run.scenario].name}`, timeLabel(run.time), `${fmt(run.evacuated)} / ${fmt(run.total)}`, `${Math.round(run.peakContact * 100)}%`, `${run.fallen} / ${run.dead}`];
    cells.forEach((text, n) => { const td = document.createElement('td'); td.textContent = text; if (n === 0) { const small = document.createElement('small'); small.textContent = `Panic ${run.settings.panic}% · ${run.walls.length} walls · ${run.arrows?.length || 0} arrows · seed ${run.settings.seed}`; td.append(small); } tr.append(td); });
    const td = document.createElement('td'), button = document.createElement('button'); button.textContent = 'Restore ↗'; button.setAttribute('aria-label', `Restore layout and settings for run ${i + 1}`);
    button.onclick = () => { scenario = run.scenario; settings = { ...defaults, ...run.settings }; sim.walls = structuredClone(run.walls); sim.exits = structuredClone(run.exits); sim.arrows = structuredClone(run.arrows || []); undoStack = []; $('undo').disabled = true; panX = panY = 0; zoom = 1; restart(); changeZoom(1); toast('Restored.'); }; td.append(button); tr.append(td); $('runs-body').append(tr);
  });
}
$('save-run').onclick = () => {
  if (sim.time < 1) { toast('Run the simulation for at least a second first.'); return; }
  const key = `${sim.scenario}-${sim.tick}-${sim.evacuated}-${sim.walls.length}-${sim.arrows.length}`;
  if (key === lastSavedKey) { toast('This snapshot is already saved.'); return; }
  savedRuns.push(sim.snapshot()); savedRuns = savedRuns.slice(-8); lastSavedKey = key;
  try { localStorage.setItem(saveKey, JSON.stringify(savedRuns)); toast('Run saved. Compare it below.'); } catch { toast('Saved for this session. Browser storage is unavailable.'); }
  renderRuns();
};
$('export-runs').onclick = () => {
  const blob = new Blob([JSON.stringify({ model: 'crowd-lab-1.1', note: 'Qualitative uncalibrated model. Contact and casualty values are not real-world risk estimates.', runs: savedRuns }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'crowd-lab-experiments.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function frame(now) {
  const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 0; lastFrame = now;
  if (running) {
    accumulator += elapsed * speed;
    let steps = 0;
    while (accumulator >= DT && steps < 16) { sim.step(); accumulator -= DT; steps++; if (sim.complete) { running = false; accumulator = 0; sim.measure(); toast('Run complete. Save it to compare your next layout.'); break; } }
    // Cap backlog rather than enlarging the physics step on slower devices.
    accumulator = Math.min(accumulator, DT * 16); draw();
    if (now - lastUI > 200 || !running) { updateUI(); lastUI = now; }
  }
  requestAnimationFrame(frame);
}
new ResizeObserver(resize).observe($('canvas-wrap')); new ResizeObserver(() => { const r = chart.getBoundingClientRect(); chart.width = Math.round(r.width * dpr); chart.height = Math.round(r.height * dpr); drawChart(); }).observe(chart);
updateSettingsUI(); updateUI(); renderRuns(); resize(); requestAnimationFrame(frame);
