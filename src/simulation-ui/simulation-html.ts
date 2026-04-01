/**
 * Simulation Control UI — HTML page served by SimulationServer.
 *
 * Single-page app with:
 *   - Simulation list sidebar (create/load/delete)
 *   - Live simulation view (tick controls, event log, world state)
 *   - NPC inspection panel (mood, drives, memory, trust)
 *   - Parameter injection panel (inject events, adjust traits)
 *   - Visualizations (relationship graph, mood timeline, drive heatmap)
 *
 * Communicates via:
 *   GET  /api/scenarios                     → load scenario list
 *   GET  /api/simulations                   → list simulations
 *   POST /api/simulations                   → create simulation
 *   DELETE /api/simulations/:id             → delete simulation
 *   GET  /api/simulations/:id               → get state
 *   POST /api/simulations/:id/step          → step one tick
 *   POST /api/simulations/:id/run           → start auto-run
 *   POST /api/simulations/:id/pause         → pause auto-run
 *   POST /api/simulations/:id/stop          → stop simulation
 *   GET  /api/simulations/:id/agents/:aid   → get NPC detail
 *   POST /api/simulations/:id/inject        → inject event
 *   POST /api/simulations/:id/agents/:aid/trait → set NPC trait
 *   GET  /api/simulations/:id/events        → SSE live updates
 */

export const SIMULATION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simulation Control UI</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0a0a0f;
  --bg2: #0e0e16;
  --bg3: #141420;
  --bg4: #1a1a2e;
  --border: #1e1e2e;
  --text: #c8c8d0;
  --text2: #8888aa;
  --accent: #8888cc;
  --green: #4ade80;
  --red: #f87171;
  --yellow: #fbbf24;
  --blue: #60a5fa;
  --purple: #a78bfa;
  --orange: #fb923c;
  --cyan: #22d3ee;
}
body {
  font-family: 'SF Mono','Fira Code','Cascadia Code',monospace;
  background: var(--bg);
  color: var(--text);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 12px;
}
/* ── Header ── */
header {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
header h1 { font-size: 13px; font-weight: 600; color: var(--accent); }
#status-badge {
  font-size: 10px; padding: 2px 8px; border-radius: 10px;
  background: #1a3a1a; color: var(--green);
}
/* ── Layout ── */
.layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}
/* ── Sidebar ── */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sidebar-header {
  padding: 10px 12px 6px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text2);
  letter-spacing: 1px;
  text-transform: uppercase;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.btn-icon {
  background: none; border: none; cursor: pointer;
  color: var(--accent); font-size: 16px; padding: 0 2px;
}
.btn-icon:hover { color: var(--green); }
#sim-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.sim-item {
  padding: 6px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  border-left: 3px solid transparent;
}
.sim-item:hover { background: var(--bg3); }
.sim-item.active { border-left-color: var(--accent); background: var(--bg3); }
.sim-item .sim-name { flex: 1; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sim-item .sim-meta { font-size: 9px; color: var(--text2); }
.sim-status { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.sim-status.idle { background: var(--text2); }
.sim-status.running { background: var(--green); animation: pulse 1s infinite; }
.sim-status.stopped { background: var(--red); }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.btn-del { background:none;border:none;cursor:pointer;color:var(--text2);font-size:12px;padding:0;opacity:0;transition:opacity 0.1s; }
.sim-item:hover .btn-del { opacity:1; }
.btn-del:hover { color:var(--red); }
/* ── Create panel ── */
#create-panel {
  padding: 10px;
  border-top: 1px solid var(--border);
  background: var(--bg2);
}
#create-panel h3 { font-size: 10px; color: var(--text2); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.form-row { margin-bottom: 6px; }
.form-row label { display: block; font-size: 9px; color: var(--text2); margin-bottom: 2px; }
.form-row input, .form-row select {
  width: 100%; background: var(--bg3); border: 1px solid var(--border);
  color: var(--text); padding: 4px 6px; font-size: 11px; font-family: inherit; border-radius: 3px;
}
.form-row input:focus, .form-row select:focus { outline: none; border-color: var(--accent); }
.btn {
  background: var(--bg4); border: 1px solid var(--accent); color: var(--accent);
  padding: 4px 10px; cursor: pointer; font-size: 11px; font-family: inherit; border-radius: 3px;
  white-space: nowrap;
}
.btn:hover { background: var(--accent); color: var(--bg); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.primary { background: var(--accent); color: var(--bg); }
.btn.primary:hover { background: #aaaaee; }
.btn.danger { border-color: var(--red); color: var(--red); }
.btn.danger:hover { background: var(--red); color: var(--bg); }
.btn.success { border-color: var(--green); color: var(--green); }
.btn.success:hover { background: var(--green); color: var(--bg); }
/* ── Main panel ── */
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* ── Toolbar ── */
#toolbar {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
#sim-title { font-size: 13px; font-weight: 600; color: var(--text); margin-right: 8px; }
#tick-display { font-size: 11px; color: var(--text2); margin-left: auto; }
/* ── Content area ── */
.content {
  flex: 1;
  display: flex;
  overflow: hidden;
}
/* ── Center panels ── */
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--border);
}
/* ── World state ── */
#world-panel {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}
.panel-title {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
  color: var(--text2); margin-bottom: 8px; padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
/* Agent cards grid */
#agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}
.agent-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.agent-card:hover { border-color: var(--accent); }
.agent-card.selected { border-color: var(--accent); background: var(--bg4); }
.agent-card .agent-name { font-weight: 600; font-size: 11px; color: var(--text); margin-bottom: 4px; }
.agent-card .agent-loc { font-size: 9px; color: var(--text2); margin-bottom: 4px; }
.mood-bar { display: flex; gap: 4px; align-items: center; margin-bottom: 2px; }
.mood-bar .label { font-size: 9px; color: var(--text2); width: 14px; flex-shrink: 0; }
.bar-track { flex: 1; height: 4px; background: var(--bg); border-radius: 2px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.bar-valence { background: linear-gradient(to right, var(--red), var(--green)); }
.bar-arousal { background: var(--blue); }
.drive-chips { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 4px; }
.drive-chip { font-size: 8px; padding: 1px 4px; border-radius: 8px; background: var(--bg4); color: var(--text2); }
.drive-chip.curiosity { background: #2a1f00; color: var(--yellow); }
.drive-chip.social { background: #002a1f; color: var(--green); }
.drive-chip.boredom { background: #1a1a2e; color: var(--blue); }
.drive-chip.mastery { background: #1a0a2e; color: var(--purple); }
.drive-chip.existential { background: #2e0a1a; color: var(--red); }
.drive-chip.homeostatic { background: #002e2e; color: var(--cyan); }
/* ── Event log ── */
#event-log-panel {
  height: 180px;
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#event-log {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px;
  font-size: 11px;
  line-height: 1.5;
}
.event-entry {
  padding: 1px 0;
  color: var(--text2);
}
.event-entry .tick-tag { color: var(--accent); font-size: 9px; margin-right: 4px; }
.event-entry .actor { color: var(--yellow); }
.event-entry.injected { color: var(--orange); border-left: 2px solid var(--orange); padding-left: 6px; }
/* ── Right panel ── */
.right {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* ── NPC inspection panel ── */
#npc-panel {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  border-bottom: 1px solid var(--border);
}
.npc-section { margin-bottom: 12px; }
.npc-section .section-title {
  font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
  color: var(--text2); margin-bottom: 6px;
}
/* Radar chart (Big Five) */
#personality-radar {
  width: 100%;
  height: 120px;
}
/* Trait sliders */
.trait-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.trait-row .trait-name { font-size: 9px; color: var(--text2); width: 80px; flex-shrink: 0; }
.trait-row input[type=range] {
  flex: 1; -webkit-appearance: none; appearance: none;
  height: 3px; background: var(--border); border-radius: 2px; cursor: pointer;
}
.trait-row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 10px; height: 10px;
  border-radius: 50%; background: var(--accent); cursor: pointer;
}
.trait-row .trait-val { font-size: 9px; color: var(--text); width: 26px; text-align: right; }
/* Memory list */
.memory-item { font-size: 10px; color: var(--text2); padding: 2px 0; border-bottom: 1px solid var(--border); line-height: 1.4; }
/* Trust bars */
.trust-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.trust-row .trust-name { font-size: 9px; color: var(--text2); width: 70px; flex-shrink: 0; }
.trust-bar { flex: 1; height: 4px; background: var(--bg); border-radius: 2px; overflow: hidden; }
.trust-fill { height: 100%; background: var(--blue); border-radius: 2px; transition: width 0.3s; }
.trust-val { font-size: 9px; color: var(--text); width: 26px; text-align: right; }
/* Mood display */
.mood-display { display: flex; gap: 12px; margin-bottom: 8px; }
.mood-metric { text-align: center; }
.mood-metric .val { font-size: 20px; font-weight: 700; }
.mood-metric .label { font-size: 9px; color: var(--text2); }
.valence-pos { color: var(--green); }
.valence-neg { color: var(--red); }
.valence-neu { color: var(--text2); }
/* Mini mood timeline SVG */
#mood-timeline { width: 100%; height: 50px; margin-bottom: 4px; }
/* ── Inject / parameters panel ── */
#inject-panel {
  padding: 10px;
  border-top: 1px solid var(--border);
  max-height: 200px;
  overflow-y: auto;
  flex-shrink: 0;
}
.inject-row { display: flex; gap: 4px; margin-bottom: 6px; }
.inject-row input, .inject-row select {
  flex: 1; background: var(--bg3); border: 1px solid var(--border);
  color: var(--text); padding: 3px 6px; font-size: 10px; font-family: inherit; border-radius: 3px;
}
.inject-row input:focus, .inject-row select:focus { outline: none; border-color: var(--accent); }
/* ── Visualization tab area ── */
#viz-panel {
  height: 200px;
  flex-shrink: 0;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tab {
  padding: 4px 10px; font-size: 9px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer;
  color: var(--text2); border-bottom: 2px solid transparent;
  background: none; border-top: none; border-left: none; border-right: none;
  font-family: inherit;
}
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-content { flex: 1; overflow: hidden; position: relative; }
.tab-pane { display: none; width: 100%; height: 100%; overflow: hidden; }
.tab-pane.active { display: block; }
#graph-canvas, #heatmap-canvas { width: 100%; height: 100%; }
/* ── Empty state ── */
#empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text2);
  font-size: 12px;
  text-align: center;
  padding: 20px;
}
/* ── Scrollbars ── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--text2); }
/* ── Tooltip ── */
.tooltip {
  position: fixed; background: var(--bg2); border: 1px solid var(--border);
  padding: 4px 8px; font-size: 10px; color: var(--text); border-radius: 3px;
  pointer-events: none; z-index: 100; white-space: nowrap;
}
</style>
</head>
<body>
<header>
  <h1>🌍 Simulation Control</h1>
  <span id="status-badge">idle</span>
</header>

<div class="layout">
  <!-- ── Sidebar: sim list + create ── -->
  <aside class="sidebar">
    <div class="sidebar-header">
      Simulations
      <button class="btn-icon" id="btn-refresh-list" title="Refresh list">↻</button>
    </div>
    <div id="sim-list"></div>

    <div id="create-panel">
      <h3>New Simulation</h3>
      <div class="form-row">
        <label>Name</label>
        <input type="text" id="new-name" value="My Simulation" maxlength="40">
      </div>
      <div class="form-row">
        <label>Scenario</label>
        <select id="new-scenario"></select>
      </div>
      <div class="form-row">
        <label>Max Ticks</label>
        <input type="number" id="new-max-ticks" value="100" min="1" max="5000">
      </div>
      <button class="btn primary" id="btn-create" style="width:100%">＋ Create</button>
    </div>
  </aside>

  <!-- ── Main area ── -->
  <main class="main">

    <!-- ── Toolbar ── -->
    <div id="toolbar">
      <span id="sim-title" style="color:var(--text2)">Select a simulation</span>
      <button class="btn success" id="btn-run" disabled>▶ Run</button>
      <button class="btn" id="btn-step" disabled>→ Step</button>
      <button class="btn" id="btn-pause" disabled>⏸ Pause</button>
      <button class="btn danger" id="btn-stop" disabled>■ Stop</button>
      <span id="tick-display"></span>
    </div>

    <div class="content">
      <!-- ── Center ── -->
      <div class="center">

        <!-- Empty state / world panel -->
        <div id="empty-state">Select or create a simulation to begin</div>

        <div id="world-panel" style="display:none">
          <div class="panel-title">World State</div>
          <div id="agents-grid"></div>
        </div>

        <!-- Event log -->
        <div id="event-log-panel" style="display:none">
          <div class="panel-title" style="padding:6px 10px 4px;border-bottom:1px solid var(--border)">Event Log</div>
          <div id="event-log"></div>
        </div>

        <!-- Visualization tabs -->
        <div id="viz-panel" style="display:none">
          <div class="tab-bar">
            <button class="tab active" data-tab="graph">Relationship Graph</button>
            <button class="tab" data-tab="mood">Mood Timeline</button>
            <button class="tab" data-tab="heatmap">Drive Heatmap</button>
          </div>
          <div class="tab-content">
            <div class="tab-pane active" id="tab-graph">
              <svg id="graph-canvas"></svg>
            </div>
            <div class="tab-pane" id="tab-mood">
              <canvas id="mood-canvas"></canvas>
            </div>
            <div class="tab-pane" id="tab-heatmap">
              <canvas id="heatmap-canvas"></canvas>
            </div>
          </div>
        </div>

      </div>

      <!-- ── Right panel: NPC + Inject ── -->
      <div class="right">

        <div id="npc-panel">
          <div class="panel-title">NPC Inspector</div>
          <div id="npc-detail"><p style="color:var(--text2);font-size:10px">Click an NPC card to inspect</p></div>
        </div>

        <div id="inject-panel">
          <div class="panel-title" style="margin-bottom:6px">Inject Event</div>
          <div class="inject-row">
            <input type="text" id="inject-desc" placeholder="Event description…" style="flex:2">
          </div>
          <div class="inject-row">
            <select id="inject-loc" style="flex:2"><option value="">— location —</option></select>
            <button class="btn" id="btn-inject" disabled style="flex-shrink:0">Inject</button>
          </div>
          <div class="inject-row" style="gap:8px;align-items:center">
            <label style="font-size:9px;color:var(--text2)">Valence</label>
            <input type="range" id="inject-valence" min="-100" max="100" value="0" style="flex:1">
            <span id="inject-valence-val" style="font-size:9px;color:var(--text);width:24px">0.0</span>
            <label style="font-size:9px;color:var(--text2)">Novelty</label>
            <input type="range" id="inject-novelty" min="0" max="100" value="80" style="flex:1">
            <span id="inject-novelty-val" style="font-size:9px;color:var(--text);width:24px">0.8</span>
          </div>
        </div>

      </div>
    </div>
  </main>
</div>

<script>
'use strict';
/* ────────────────────────────────────────────────────────────────────────────
   State
   ──────────────────────────────────────────────────────────────────────────── */
const state = {
  simulations: [],
  activeSim: null,        // { id, name, status, currentTick, … }
  activeSimDetail: null,  // full detail from GET /api/simulations/:id
  selectedAgent: null,    // agentId string
  eventSource: null,      // EventSource for SSE
  eventLog: [],           // { tick, text, injected }
  moodHistory: {},        // agentId → [{ tick, valence, arousal }]
  scenarios: [],
};

/* ────────────────────────────────────────────────────────────────────────────
   API helpers
   ──────────────────────────────────────────────────────────────────────────── */
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ────────────────────────────────────────────────────────────────────────────
   Init
   ──────────────────────────────────────────────────────────────────────────── */
async function init() {
  try {
    state.scenarios = await api('GET', '/api/scenarios');
    const sel = document.getElementById('new-scenario');
    for (const s of state.scenarios) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name + ' (' + s.defaultAgentCount + ' agents)';
      sel.appendChild(opt);
    }
  } catch(e) { console.error('Failed to load scenarios', e); }
  await refreshSimList();
}

/* ────────────────────────────────────────────────────────────────────────────
   Simulation list
   ──────────────────────────────────────────────────────────────────────────── */
async function refreshSimList() {
  try {
    state.simulations = await api('GET', '/api/simulations');
    renderSimList();
  } catch(e) { console.error('Failed to load simulations', e); }
}

function renderSimList() {
  const el = document.getElementById('sim-list');
  el.innerHTML = '';
  if (state.simulations.length === 0) {
    el.innerHTML = '<p style="padding:10px 12px;font-size:10px;color:var(--text2)">No simulations yet</p>';
    return;
  }
  for (const sim of state.simulations) {
    const div = document.createElement('div');
    div.className = 'sim-item' + (state.activeSim?.id === sim.id ? ' active' : '');
    div.dataset.id = sim.id;
    const dot = document.createElement('span');
    dot.className = 'sim-status ' + sim.status;
    const nameEl = document.createElement('span');
    nameEl.className = 'sim-name';
    nameEl.title = sim.name;
    nameEl.textContent = sim.name;
    const meta = document.createElement('span');
    meta.className = 'sim-meta';
    meta.textContent = sim.currentTick + '/' + (sim.maxTicks ?? '∞');
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del';
    delBtn.title = 'Delete';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSim(sim.id); });
    div.appendChild(dot);
    div.appendChild(nameEl);
    div.appendChild(meta);
    div.appendChild(delBtn);
    div.addEventListener('click', () => selectSim(sim.id));
    el.appendChild(div);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Create simulation
   ──────────────────────────────────────────────────────────────────────────── */
document.getElementById('btn-create').addEventListener('click', async () => {
  const name = document.getElementById('new-name').value.trim() || 'Simulation';
  const scenarioId = document.getElementById('new-scenario').value;
  const maxTicks = parseInt(document.getElementById('new-max-ticks').value, 10) || 100;
  try {
    const rec = await api('POST', '/api/simulations', { name, scenarioId, maxTicks });
    await refreshSimList();
    selectSim(rec.id);
  } catch(e) { alert('Create failed: ' + e.message); }
});

document.getElementById('btn-refresh-list').addEventListener('click', refreshSimList);

/* ────────────────────────────────────────────────────────────────────────────
   Delete simulation
   ──────────────────────────────────────────────────────────────────────────── */
async function deleteSim(id) {
  if (!confirm('Delete this simulation?')) return;
  await api('DELETE', '/api/simulations/' + id);
  if (state.activeSim?.id === id) {
    disconnectSSE();
    state.activeSim = null;
    state.activeSimDetail = null;
    state.selectedAgent = null;
    showEmptyState();
  }
  await refreshSimList();
}

/* ────────────────────────────────────────────────────────────────────────────
   Select / load simulation
   ──────────────────────────────────────────────────────────────────────────── */
async function selectSim(id) {
  if (state.activeSim?.id === id) return;
  disconnectSSE();
  state.activeSim = state.simulations.find(s => s.id === id) || null;
  state.selectedAgent = null;
  state.eventLog = [];
  state.moodHistory = {};
  if (!state.activeSim) return;

  await loadSimDetail(id);
  connectSSE(id);
  renderSimList();
  updateToolbar();
}

async function loadSimDetail(id) {
  try {
    state.activeSimDetail = await api('GET', '/api/simulations/' + id);
    state.activeSim = {
      id: state.activeSimDetail.id,
      name: state.activeSimDetail.name,
      status: state.activeSimDetail.status,
      currentTick: state.activeSimDetail.currentTick,
      maxTicks: state.activeSimDetail.maxTicks,
    };

    // Seed mood history from recentHistory
    if (state.activeSimDetail.recentHistory) {
      for (const dump of state.activeSimDetail.recentHistory) {
        for (const a of dump.agents) {
          if (!state.moodHistory[a.agentId]) state.moodHistory[a.agentId] = [];
          state.moodHistory[a.agentId].push({ tick: dump.tick, valence: a.mood.valence, arousal: a.mood.arousal });
        }
      }
    }

    showSimView();
    renderAgents();
    updateInjectLocations();
    renderViz();
  } catch(e) { console.error('loadSimDetail failed', e); }
}

/* ────────────────────────────────────────────────────────────────────────────
   Show / hide panels
   ──────────────────────────────────────────────────────────────────────────── */
function showEmptyState() {
  document.getElementById('empty-state').style.display = 'flex';
  document.getElementById('world-panel').style.display = 'none';
  document.getElementById('event-log-panel').style.display = 'none';
  document.getElementById('viz-panel').style.display = 'none';
  document.getElementById('sim-title').style.color = 'var(--text2)';
  document.getElementById('sim-title').textContent = 'Select a simulation';
  document.getElementById('tick-display').textContent = '';
  setToolbarDisabled(true);
  document.getElementById('btn-inject').disabled = true;
}

function showSimView() {
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('world-panel').style.display = 'block';
  document.getElementById('event-log-panel').style.display = 'flex';
  document.getElementById('viz-panel').style.display = 'flex';
  document.getElementById('sim-title').style.color = 'var(--text)';
  document.getElementById('sim-title').textContent = state.activeSim?.name || '';
  document.getElementById('btn-inject').disabled = (state.activeSim?.status === 'stopped');
  updateToolbar();
}

function setToolbarDisabled(disabled) {
  ['btn-run','btn-step','btn-pause','btn-stop'].forEach(id => {
    document.getElementById(id).disabled = disabled;
  });
}

function updateToolbar() {
  if (!state.activeSim) { setToolbarDisabled(true); return; }
  const s = state.activeSim.status;
  const stopped = s === 'stopped';
  const running = s === 'running';
  const idle = s === 'idle';
  document.getElementById('btn-run').disabled = running || stopped;
  document.getElementById('btn-step').disabled = running || stopped;
  document.getElementById('btn-pause').disabled = !running;
  document.getElementById('btn-stop').disabled = stopped;
  document.getElementById('btn-inject').disabled = stopped;
  const t = state.activeSim.currentTick;
  const max = state.activeSim.maxTicks;
  document.getElementById('tick-display').textContent =
    'Tick ' + t + (max ? ' / ' + max : '') + '  ·  ' + s;

  // Update status badge
  const badge = document.getElementById('status-badge');
  badge.textContent = s;
  badge.style.background = running ? '#1a3a1a' : stopped ? '#3a1a1a' : '#1a1a2e';
  badge.style.color = running ? 'var(--green)' : stopped ? 'var(--red)' : 'var(--text2)';
}

/* ────────────────────────────────────────────────────────────────────────────
   Toolbar controls
   ──────────────────────────────────────────────────────────────────────────── */
document.getElementById('btn-step').addEventListener('click', async () => {
  if (!state.activeSim) return;
  try {
    const res = await api('POST', '/api/simulations/' + state.activeSim.id + '/step');
    onTick(res.dump);
  } catch(e) { alert(e.message); }
});

document.getElementById('btn-run').addEventListener('click', async () => {
  if (!state.activeSim) return;
  try {
    await api('POST', '/api/simulations/' + state.activeSim.id + '/run');
    state.activeSim.status = 'running';
    updateToolbar();
  } catch(e) { alert(e.message); }
});

document.getElementById('btn-pause').addEventListener('click', async () => {
  if (!state.activeSim) return;
  await api('POST', '/api/simulations/' + state.activeSim.id + '/pause');
  state.activeSim.status = 'idle';
  updateToolbar();
});

document.getElementById('btn-stop').addEventListener('click', async () => {
  if (!state.activeSim) return;
  if (!confirm('Stop this simulation? This cannot be undone.')) return;
  await api('POST', '/api/simulations/' + state.activeSim.id + '/stop');
  state.activeSim.status = 'stopped';
  updateToolbar();
});

/* ────────────────────────────────────────────────────────────────────────────
   SSE connection
   ──────────────────────────────────────────────────────────────────────────── */
function connectSSE(id) {
  disconnectSSE();
  const es = new EventSource('/api/simulations/' + id + '/events');
  state.eventSource = es;
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'tick') {
      onTick(msg.dump);
    } else if (msg.type === 'status') {
      if (state.activeSim) {
        state.activeSim.status = msg.status;
        state.activeSim.currentTick = msg.tick;
        updateToolbar();
        renderSimList();
      }
    }
  };
  es.onerror = () => {
    // SSE closed — simulation may have ended
  };
}

function disconnectSSE() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   On tick: update state and render
   ──────────────────────────────────────────────────────────────────────────── */
function onTick(dump) {
  if (!dump) return;
  if (state.activeSim) {
    state.activeSim.currentTick = dump.tick;
    updateToolbar();
  }

  // Update mood history
  for (const a of dump.agents) {
    if (!state.moodHistory[a.agentId]) state.moodHistory[a.agentId] = [];
    const h = state.moodHistory[a.agentId];
    h.push({ tick: dump.tick, valence: a.mood.valence, arousal: a.mood.arousal });
    if (h.length > 100) h.splice(0, h.length - 100);
  }

  // Append events to log
  for (const ev of dump.recentEvents) {
    const isInjected = ev.actorId === 'world';
    state.eventLog.push({ tick: ev.tick, text: ev.description, injected: isInjected });
  }
  if (state.eventLog.length > 500) state.eventLog.splice(0, state.eventLog.length - 500);

  // Update active sim detail agents
  if (state.activeSimDetail) {
    state.activeSimDetail.agents = dump.agents;
    state.activeSimDetail.latestDump = dump;
  }

  renderAgents();
  renderEventLog();
  renderViz();

  // Refresh selected agent panel if open
  if (state.selectedAgent) {
    const agentDump = dump.agents.find(a => a.agentId === state.selectedAgent);
    if (agentDump) renderNpcPanel(agentDump, null);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Agents grid
   ──────────────────────────────────────────────────────────────────────────── */
function renderAgents() {
  if (!state.activeSimDetail) return;
  const grid = document.getElementById('agents-grid');
  const agents = state.activeSimDetail.agents || [];
  grid.innerHTML = '';
  for (const a of agents) {
    const card = document.createElement('div');
    card.className = 'agent-card' + (state.selectedAgent === a.agentId ? ' selected' : '');
    card.dataset.agentId = a.agentId;

    const v = a.mood.valence;
    const ar = a.mood.arousal;
    const vClass = v > 0.1 ? 'valence-pos' : v < -0.1 ? 'valence-neg' : 'valence-neu';
    const vPct = Math.round(((v + 1) / 2) * 100);
    const arPct = Math.round(ar * 100);

    card.innerHTML = \`
      <div class="agent-name">\${esc(a.name)}</div>
      <div class="agent-loc">📍 \${esc(a.location)}</div>
      <div class="mood-bar">
        <span class="label \${vClass}">V</span>
        <div class="bar-track"><div class="bar-fill bar-valence" style="width:\${vPct}%"></div></div>
        <span style="font-size:9px;color:var(--text2);width:26px;text-align:right">\${v.toFixed(2)}</span>
      </div>
      <div class="mood-bar">
        <span class="label" style="color:var(--blue)">A</span>
        <div class="bar-track"><div class="bar-fill bar-arousal" style="width:\${arPct}%"></div></div>
        <span style="font-size:9px;color:var(--text2);width:26px;text-align:right">\${ar.toFixed(2)}</span>
      </div>
      <div class="drive-chips">
        \${a.topDrives.slice(0,3).map(d => \`<span class="drive-chip \${d.drive}">\${d.drive.slice(0,4)} \${(d.strength*100).toFixed(0)}%</span>\`).join('')}
      </div>
    \`;
    card.addEventListener('click', () => openNpc(a.agentId));
    grid.appendChild(card);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   NPC Inspector
   ──────────────────────────────────────────────────────────────────────────── */
async function openNpc(agentId) {
  state.selectedAgent = agentId;
  renderAgents(); // update selected state
  if (!state.activeSim) return;

  try {
    const detail = await api('GET', '/api/simulations/' + state.activeSim.id + '/agents/' + agentId);
    renderNpcPanelFull(detail);
  } catch(e) { console.error('Failed to load NPC', e); }
}

function renderNpcPanel(agentDump, _traits) {
  // Lightweight update from tick data (no traits)
  const el = document.getElementById('npc-detail');
  const v = agentDump.mood.valence;
  const ar = agentDump.mood.arousal;
  const vClass = v > 0.1 ? 'valence-pos' : v < -0.1 ? 'valence-neg' : 'valence-neu';

  const topDrives = (agentDump.topDrives || []).slice(0, 5);

  el.querySelector('.npc-name-header') && (el.querySelector('.npc-name-header').textContent = agentDump.name);
  const moodEl = el.querySelector('.mood-vals');
  if (moodEl) {
    moodEl.innerHTML = \`<span class="\${vClass}" style="font-size:18px;font-weight:700">\${v.toFixed(2)}</span>
    <span style="font-size:11px;color:var(--text2)"> v </span>
    <span style="font-size:18px;font-weight:700;color:var(--blue)">\${ar.toFixed(2)}</span>
    <span style="font-size:11px;color:var(--text2)"> a</span>\`;
  }
  renderMoodTimeline(agentDump.agentId);
  renderDriveBars(topDrives, el.querySelector('.drives-container'));
}

function renderNpcPanelFull(detail) {
  const el = document.getElementById('npc-detail');
  const v = detail.mood.valence;
  const ar = detail.mood.arousal;
  const vClass = v > 0.1 ? 'valence-pos' : v < -0.1 ? 'valence-neg' : 'valence-neu';
  const topDrives = (detail.topDrives || []).slice(0, 5);
  const memories = (detail.recentMemories || []).slice(0, 5);
  const trust = (detail.socialTrust || []).slice(0, 6);
  const traits = detail.traits || {};

  let html = \`
    <div class="npc-section">
      <div class="npc-name-header" style="font-size:13px;font-weight:700;margin-bottom:6px">\${esc(detail.name)}</div>
      <div class="mood-vals" style="margin-bottom:8px">
        <span class="\${vClass}" style="font-size:18px;font-weight:700">\${v.toFixed(2)}</span>
        <span style="font-size:11px;color:var(--text2)"> v </span>
        <span style="font-size:18px;font-weight:700;color:var(--blue)">\${ar.toFixed(2)}</span>
        <span style="font-size:11px;color:var(--text2)"> a</span>
      </div>
      <div class="mood-timeline-container">
        <svg id="mood-timeline" viewBox="0 0 260 50" preserveAspectRatio="none"></svg>
      </div>
    </div>
  \`;

  // Drives
  html += '<div class="npc-section"><div class="section-title">Active Drives</div><div class="drives-container">';
  for (const d of topDrives) {
    const pct = Math.round(d.strength * 100);
    html += \`<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <span class="drive-chip \${d.drive}" style="width:70px;text-align:center">\${d.drive}</span>
      <div class="bar-track" style="flex:1"><div class="bar-fill" style="width:\${pct}%;background:var(--accent)"></div></div>
      <span style="font-size:9px;width:28px;text-align:right">\${pct}%</span>
    </div>\`;
  }
  html += '</div></div>';

  // Personality traits (sliders)
  html += '<div class="npc-section"><div class="section-title">Personality</div>';
  const traitOrder = ['openness','deliberateness','warmth','assertiveness','volatility','humor','risk-appetite'];
  for (const tid of traitOrder) {
    if (traits[tid] === undefined) continue;
    const val = traits[tid];
    html += \`<div class="trait-row" data-agent="\${esc(detail.agentId)}" data-trait="\${esc(tid)}">
      <span class="trait-name">\${esc(tid.replace('-',' '))}</span>
      <input type="range" min="0" max="100" value="\${Math.round(val*100)}"
        data-agent="\${esc(detail.agentId)}" data-trait="\${esc(tid)}">
      <span class="trait-val">\${val.toFixed(2)}</span>
    </div>\`;
  }
  html += '</div>';

  // Memory
  if (memories.length) {
    html += '<div class="npc-section"><div class="section-title">Recent Memories</div>';
    for (const m of memories) html += \`<div class="memory-item">\${esc(m)}</div>\`;
    html += '</div>';
  }

  // Trust
  if (trust.length) {
    html += '<div class="npc-section"><div class="section-title">Social Trust</div>';
    for (const t of trust) {
      const pct = Math.round(((t.score + 1) / 2) * 100);
      html += \`<div class="trust-row">
        <span class="trust-name">\${esc(t.entityId)}</span>
        <div class="trust-bar"><div class="trust-fill" style="width:\${pct}%"></div></div>
        <span class="trust-val">\${t.score.toFixed(2)}</span>
      </div>\`;
    }
    html += '</div>';
  }

  el.innerHTML = html;

  renderMoodTimeline(detail.agentId);

  // Attach slider listeners
  el.querySelectorAll('input[type=range][data-trait]').forEach(input => {
    input.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) / 100;
      const valEl = e.target.closest('.trait-row')?.querySelector('.trait-val');
      if (valEl) valEl.textContent = val.toFixed(2);
    });
    input.addEventListener('change', async (e) => {
      const traitId = e.target.dataset.trait;
      const agentId = e.target.dataset.agent;
      const value = parseInt(e.target.value, 10) / 100;
      const simId = state.activeSim?.id;
      if (!simId) return;
      try {
        await api('POST', \`/api/simulations/\${simId}/agents/\${agentId}/trait\`, { traitId, value });
      } catch(err) { console.error('Trait update failed', err); }
    });
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Event log
   ──────────────────────────────────────────────────────────────────────────── */
function renderEventLog() {
  const el = document.getElementById('event-log');
  // Only render last 30 events
  const recent = state.eventLog.slice(-30);
  el.innerHTML = '';
  for (const ev of recent) {
    const div = document.createElement('div');
    div.className = 'event-entry' + (ev.injected ? ' injected' : '');
    div.innerHTML = \`<span class="tick-tag">[t\${ev.tick}]</span>\${esc(ev.text)}\`;
    el.appendChild(div);
  }
  el.scrollTop = el.scrollHeight;
}

/* ────────────────────────────────────────────────────────────────────────────
   Event injection
   ──────────────────────────────────────────────────────────────────────────── */
function updateInjectLocations() {
  const sel = document.getElementById('inject-loc');
  sel.innerHTML = '<option value="">— select location —</option>';
  const locs = state.activeSimDetail?.locations || [];
  for (const loc of locs) {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = loc.name;
    sel.appendChild(opt);
  }
}

document.getElementById('inject-valence').addEventListener('input', function() {
  document.getElementById('inject-valence-val').textContent = (parseInt(this.value)/100).toFixed(1);
});
document.getElementById('inject-novelty').addEventListener('input', function() {
  document.getElementById('inject-novelty-val').textContent = (parseInt(this.value)/100).toFixed(1);
});

document.getElementById('btn-inject').addEventListener('click', async () => {
  const desc = document.getElementById('inject-desc').value.trim();
  const locationId = document.getElementById('inject-loc').value;
  const valenceHint = parseInt(document.getElementById('inject-valence').value) / 100;
  const noveltyHint = parseInt(document.getElementById('inject-novelty').value) / 100;
  if (!desc) { alert('Enter an event description'); return; }
  if (!locationId) { alert('Select a location'); return; }
  if (!state.activeSim) return;
  try {
    await api('POST', '/api/simulations/' + state.activeSim.id + '/inject', {
      description: desc, locationId, valenceHint, noveltyHint
    });
    document.getElementById('inject-desc').value = '';
    state.eventLog.push({ tick: state.activeSim.currentTick, text: '⚡ Injected: ' + desc, injected: true });
    renderEventLog();
  } catch(e) { alert(e.message); }
});

/* ────────────────────────────────────────────────────────────────────────────
   Visualizations
   ──────────────────────────────────────────────────────────────────────────── */
// Tab switching
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('tab-' + this.dataset.tab).classList.add('active');
    renderViz();
  });
});

function renderViz() {
  const activeTab = document.querySelector('.tab.active')?.dataset.tab;
  if (activeTab === 'graph') renderRelationshipGraph();
  else if (activeTab === 'mood') renderMoodTimelines();
  else if (activeTab === 'heatmap') renderDriveHeatmap();
}

/* ── Relationship graph (SVG) ── */
function renderRelationshipGraph() {
  const svg = document.getElementById('graph-canvas');
  if (!svg || !state.activeSimDetail) { if (svg) svg.innerHTML=''; return; }
  const agents = state.activeSimDetail.agents || [];
  const W = svg.clientWidth || 400;
  const H = svg.clientHeight || 160;
  svg.setAttribute('viewBox', \`0 0 \${W} \${H}\`);

  const n = agents.length;
  if (n === 0) { svg.innerHTML = ''; return; }

  // Position agents in a circle
  const cx = W/2, cy = H/2, r = Math.min(W, H) * 0.35;
  const positions = agents.map((_, i) => ({
    x: cx + r * Math.cos((i / n) * 2 * Math.PI - Math.PI/2),
    y: cy + r * Math.sin((i / n) * 2 * Math.PI - Math.PI/2),
  }));

  let html = '';

  // Edges (trust relationships)
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    for (const t of (a.socialTrust || [])) {
      const j = agents.findIndex(x => x.agentId === t.entityId);
      if (j < 0 || j <= i) continue;
      const score = t.score; // -1..1
      const alpha = Math.abs(score) * 0.6 + 0.1;
      const color = score >= 0 ? '74,222,128' : '248,113,113';
      const strokeW = 0.5 + Math.abs(score) * 2;
      html += \`<line x1="\${positions[i].x}" y1="\${positions[i].y}"
        x2="\${positions[j].x}" y2="\${positions[j].y}"
        stroke="rgba(\${color},\${alpha})" stroke-width="\${strokeW}"/>\`;
    }
  }

  // Nodes
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const pos = positions[i];
    const v = a.mood.valence;
    const nodeColor = v > 0.1 ? '#4ade80' : v < -0.1 ? '#f87171' : '#8888cc';
    const selected = state.selectedAgent === a.agentId;
    html += \`<circle cx="\${pos.x}" cy="\${pos.y}" r="\${selected?10:7}"
      fill="\${nodeColor}" fill-opacity="0.85" stroke="\${selected?'#fff':'none'}" stroke-width="1.5"
      style="cursor:pointer" data-agent="\${a.agentId}"/>\`;
    html += \`<text x="\${pos.x}" y="\${pos.y + (selected?18:15)}"
      text-anchor="middle" font-size="\${selected?9:8}" fill="#c8c8d0">\${esc(a.name.split(' ')[0])}</text>\`;
  }

  svg.innerHTML = html;

  // Click handler on nodes
  svg.querySelectorAll('circle[data-agent]').forEach(el => {
    el.addEventListener('click', () => openNpc(el.dataset.agent));
  });
}

/* ── Mood timeline (canvas) ── */
function renderMoodTimelines() {
  const canvas = document.getElementById('mood-canvas');
  if (!canvas) return;
  const parent = canvas.parentElement;
  canvas.width = parent.clientWidth || 400;
  canvas.height = parent.clientHeight || 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const agents = state.activeSimDetail?.agents || [];
  if (!agents.length) return;

  const W = canvas.width, H = canvas.height;
  const colors = ['#4ade80','#60a5fa','#fbbf24','#a78bfa','#fb923c','#22d3ee'];
  const padding = { top: 20, bottom: 20, left: 30, right: 10 };

  // Axes
  ctx.strokeStyle = '#1e1e2e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, H - padding.bottom);
  ctx.lineTo(W - padding.right, H - padding.bottom);
  ctx.stroke();

  // Zero line
  const zeroY = padding.top + (H - padding.top - padding.bottom) / 2;
  ctx.strokeStyle = '#2a2a3a';
  ctx.setLineDash([3,3]);
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(W - padding.right, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Plot valence for each agent
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const hist = state.moodHistory[a.agentId] || [];
    if (hist.length < 2) continue;

    const last60 = hist.slice(-60);
    const maxTick = last60[last60.length-1].tick;
    const minTick = last60[0].tick;
    const tickRange = Math.max(1, maxTick - minTick);
    const drawW = W - padding.left - padding.right;
    const drawH = H - padding.top - padding.bottom;

    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let j = 0; j < last60.length; j++) {
      const pt = last60[j];
      const x = padding.left + ((pt.tick - minTick) / tickRange) * drawW;
      const y = padding.top + (1 - (pt.valence + 1) / 2) * drawH;
      j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Legend
  ctx.font = '8px monospace';
  for (let i = 0; i < Math.min(agents.length, colors.length); i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(padding.left + i * 60, 4, 8, 8);
    ctx.fillStyle = '#c8c8d0';
    ctx.fillText(agents[i].name.split(' ')[0], padding.left + i * 60 + 12, 12);
  }

  // Y axis labels
  ctx.fillStyle = '#505060';
  ctx.font = '8px monospace';
  ctx.fillText('+1', 2, padding.top + 3);
  ctx.fillText('0', 4, zeroY + 3);
  ctx.fillText('-1', 2, H - padding.bottom + 3);
}

/* ── Drive heatmap (canvas) ── */
function renderDriveHeatmap() {
  const canvas = document.getElementById('heatmap-canvas');
  if (!canvas) return;
  const parent = canvas.parentElement;
  canvas.width = parent.clientWidth || 400;
  canvas.height = parent.clientHeight || 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const agents = state.activeSimDetail?.agents || [];
  const driveNames = ['curiosity','social','boredom','mastery','existential','homeostatic'];
  if (!agents.length) return;

  const W = canvas.width, H = canvas.height;
  const leftPad = 70, topPad = 20, rightPad = 10, bottomPad = 20;
  const drawW = W - leftPad - rightPad;
  const drawH = H - topPad - bottomPad;
  const cellH = drawH / agents.length;
  const cellW = drawW / driveNames.length;

  ctx.font = '9px monospace';

  // Column headers (drives)
  ctx.fillStyle = '#8888aa';
  for (let j = 0; j < driveNames.length; j++) {
    const x = leftPad + j * cellW + cellW / 2;
    ctx.save();
    ctx.translate(x, topPad - 4);
    ctx.fillText(driveNames[j].slice(0,4), -10, 0);
    ctx.restore();
  }

  // Rows (agents)
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    ctx.fillStyle = '#8888aa';
    ctx.fillText(a.name.split(' ')[0], 0, topPad + i * cellH + cellH / 2 + 3);

    for (let j = 0; j < driveNames.length; j++) {
      const driveEntry = a.topDrives.find(d => d.drive === driveNames[j]);
      const strength = driveEntry ? driveEntry.strength : 0;
      const alpha = strength;
      const x = leftPad + j * cellW + 1;
      const y = topPad + i * cellH + 1;
      ctx.fillStyle = \`rgba(136, 136, 204, \${alpha})\`;
      ctx.fillRect(x, y, cellW - 2, cellH - 2);
      if (strength > 0.3) {
        ctx.fillStyle = '#ffffff';
        ctx.fillText((strength * 100).toFixed(0) + '%', x + 2, y + cellH / 2 + 3);
      }
    }
  }
}

/* ── Mini mood timeline in NPC panel ── */
function renderMoodTimeline(agentId) {
  const svg = document.getElementById('mood-timeline');
  if (!svg) return;
  const hist = (state.moodHistory[agentId] || []).slice(-40);
  if (hist.length < 2) { svg.innerHTML = ''; return; }

  const W = 260, H = 50, pad = 4;
  const maxTick = hist[hist.length-1].tick;
  const minTick = hist[0].tick;
  const range = Math.max(1, maxTick - minTick);
  const drawW = W - 2*pad, drawH = H - 2*pad;

  let valPath = '', arPath = '';
  for (let i = 0; i < hist.length; i++) {
    const pt = hist[i];
    const x = pad + ((pt.tick - minTick) / range) * drawW;
    const yV = pad + (1 - (pt.valence + 1) / 2) * drawH;
    const yA = pad + (1 - pt.arousal) * drawH;
    valPath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yV.toFixed(1) + ' ';
    arPath  += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yA.toFixed(1) + ' ';
  }

  svg.innerHTML = \`
    <line x1="\${pad}" y1="\${pad + drawH/2}" x2="\${W-pad}" y2="\${pad + drawH/2}"
      stroke="#1e1e2e" stroke-width="0.5" stroke-dasharray="2,2"/>
    <path d="\${valPath}" stroke="#4ade80" stroke-width="1.5" fill="none" opacity="0.8"/>
    <path d="\${arPath}" stroke="#60a5fa" stroke-width="1" fill="none" opacity="0.6"/>
    <text x="\${pad}" y="\${H-1}" font-size="7" fill="#505060">valence</text>
    <text x="50" y="\${H-1}" font-size="7" fill="#60a5fa">arousal</text>
  \`;
}

/* ── Drive bars helper ── */
function renderDriveBars(drives, container) {
  if (!container) return;
  container.innerHTML = '';
  for (const d of drives) {
    const pct = Math.round(d.strength * 100);
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:3px';
    div.innerHTML = \`<span class="drive-chip \${d.drive}" style="width:70px;text-align:center">\${d.drive}</span>
      <div class="bar-track" style="flex:1"><div class="bar-fill" style="width:\${pct}%;background:var(--accent)"></div></div>
      <span style="font-size:9px;width:28px;text-align:right">\${pct}%</span>\`;
    container.appendChild(div);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Utilities
   ──────────────────────────────────────────────────────────────────────────── */
function esc(s) {
  if (typeof s !== 'string') s = String(s ?? '');
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ────────────────────────────────────────────────────────────────────────────
   Boot
   ──────────────────────────────────────────────────────────────────────────── */
init();
</script>
</body>
</html>
`;
