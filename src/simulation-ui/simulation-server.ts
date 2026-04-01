/**
 * SimulationServer — HTTP server for the Simulation Control UI
 *
 * Routes:
 *   GET  /                                          → HTML UI page
 *   GET  /api/scenarios                             → list available scenarios
 *   GET  /api/simulations                           → list all simulations
 *   POST /api/simulations                           → create simulation
 *   GET  /api/simulations/:id                       → get sim state + history
 *   DELETE /api/simulations/:id                     → delete simulation
 *   POST /api/simulations/:id/step                  → step one tick
 *   POST /api/simulations/:id/run                   → start auto-run
 *   POST /api/simulations/:id/pause                 → pause auto-run
 *   POST /api/simulations/:id/stop                  → stop simulation
 *   GET  /api/simulations/:id/agents/:agentId       → get NPC detail
 *   POST /api/simulations/:id/inject                → inject external event
 *   POST /api/simulations/:id/agents/:agentId/trait → set NPC trait
 *   GET  /api/simulations/:id/events                → SSE stream
 *
 * Zero external dependencies — uses only Node built-in http module.
 */

import * as http from 'node:http';
import { SIMULATION_HTML } from './simulation-html.js';
import type { SimulationManager } from './simulation-manager.js';
import type { SimulationStateDump } from '../simulation/types.js';

// ── Config ───────────────────────────────────────────────────────────────────

export interface SimulationServerConfig {
  /** TCP port. Use 0 for OS-assigned. Default: 1339. */
  port?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Match /api/simulations/:id and return id, or null. */
function matchSimId(url: string): string | null {
  const m = url.match(/^\/api\/simulations\/([^/]+)(?:\/|$)/);
  return m ? m[1]! : null;
}

/** Match /api/simulations/:id/agents/:agentId and return both ids, or null. */
function matchSimAndAgent(url: string): { simId: string; agentId: string } | null {
  const m = url.match(/^\/api\/simulations\/([^/]+)\/agents\/([^/]+)(?:\/|$)/);
  return m ? { simId: m[1]!, agentId: m[2]! } : null;
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > 65_536) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseBody<T = Record<string, unknown>>(raw: string): T {
  return JSON.parse(raw) as T;
}

// ── SimulationServer ─────────────────────────────────────────────────────────

export class SimulationServer {
  private _server: http.Server | null = null;
  private _running = false;
  private _actualPort = 0;
  private readonly _port: number;
  private readonly _sseClients = new Map<string, Set<http.ServerResponse>>();

  constructor(
    private readonly _manager: SimulationManager,
    config: SimulationServerConfig = {},
  ) {
    this._port = config.port ?? 1339;
  }

  get port(): number {
    return this._actualPort;
  }

  async start(): Promise<void> {
    if (this._running) return;
    this._server = http.createServer((req, res) =>
      void this._handleRequest(req, res).catch((err) => {
        if (!res.headersSent) {
          json(res, 500, { error: String(err) });
        }
      }),
    );
    await new Promise<void>((resolve, reject) => {
      this._server!.listen(this._port, '0.0.0.0', () => {
        const addr = this._server!.address();
        if (addr && typeof addr === 'object') this._actualPort = addr.port;
        resolve();
      });
      this._server!.on('error', reject);
    });
    this._running = true;
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    for (const clients of this._sseClients.values()) {
      for (const res of clients) res.end();
      clients.clear();
    }
    this._sseClients.clear();
    await new Promise<void>((resolve) => this._server!.close(() => resolve()));
    this._server = null;
    this._actualPort = 0;
  }

  // ── Router ───────────────────────────────────────────────────────────────

  private async _handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const method = req.method ?? 'GET';
    const url = (req.url ?? '/').split('?')[0]!;

    // Serve HTML UI
    if (method === 'GET' && url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SIMULATION_HTML);
      return;
    }

    // OPTIONS (CORS pre-flight)
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    // GET /api/scenarios
    if (method === 'GET' && url === '/api/scenarios') {
      json(res, 200, this._manager.getScenarios());
      return;
    }

    // GET /api/simulations
    if (method === 'GET' && url === '/api/simulations') {
      json(res, 200, this._manager.list());
      return;
    }

    // POST /api/simulations
    if (method === 'POST' && url === '/api/simulations') {
      const raw = await readBody(req);
      const body = parseBody<{ name?: unknown; scenarioId?: unknown; maxTicks?: unknown }>(raw);
      if (typeof body.name !== 'string' || typeof body.scenarioId !== 'string') {
        json(res, 400, { error: 'name and scenarioId are required' });
        return;
      }
      const rec = this._manager.create({
        name: body.name,
        scenarioId: body.scenarioId as 'village' | 'colony',
        maxTicks: typeof body.maxTicks === 'number' ? body.maxTicks : undefined,
      });
      json(res, 201, this._simSummary(rec.id));
      return;
    }

    // Routes with :id
    const simId = matchSimId(url);
    if (simId) {
      await this._handleSimRoute(method, url, simId, req, res);
      return;
    }

    json(res, 404, { error: 'Not found' });
  }

  private async _handleSimRoute(
    method: string,
    url: string,
    simId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const rec = this._manager.get(simId);
    if (!rec) {
      json(res, 404, { error: `Simulation "${simId}" not found` });
      return;
    }

    // GET /api/simulations/:id
    if (method === 'GET' && url === `/api/simulations/${simId}`) {
      json(res, 200, this._simDetail(simId));
      return;
    }

    // DELETE /api/simulations/:id
    if (method === 'DELETE' && url === `/api/simulations/${simId}`) {
      this._manager.delete(simId);
      json(res, 200, { ok: true });
      return;
    }

    // POST /api/simulations/:id/step
    if (method === 'POST' && url === `/api/simulations/${simId}/step`) {
      try {
        const dump = this._manager.step(simId);
        this._broadcastTick(simId, dump);
        json(res, 200, { ok: true, tick: dump.tick, dump });
      } catch (err) {
        json(res, 409, { error: String(err) });
      }
      return;
    }

    // POST /api/simulations/:id/run
    if (method === 'POST' && url === `/api/simulations/${simId}/run`) {
      try {
        this._manager.startAutoRun(simId);
        // Wire SSE broadcast to the auto-run ticks (attach listener once if needed)
        this._ensureAutoRunListener(simId);
        json(res, 200, { ok: true, status: 'running' });
      } catch (err) {
        json(res, 409, { error: String(err) });
      }
      return;
    }

    // POST /api/simulations/:id/pause
    if (method === 'POST' && url === `/api/simulations/${simId}/pause`) {
      this._manager.pause(simId);
      json(res, 200, { ok: true, status: 'idle' });
      return;
    }

    // POST /api/simulations/:id/stop
    if (method === 'POST' && url === `/api/simulations/${simId}/stop`) {
      this._manager.stop(simId);
      json(res, 200, { ok: true, status: 'stopped', tick: rec.loop.currentTick });
      return;
    }

    // GET /api/simulations/:id/events  (SSE)
    if (method === 'GET' && url === `/api/simulations/${simId}/events`) {
      this._handleSSE(simId, req, res);
      return;
    }

    // POST /api/simulations/:id/inject
    if (method === 'POST' && url === `/api/simulations/${simId}/inject`) {
      const raw = await readBody(req);
      const body = parseBody<{
        description?: unknown;
        locationId?: unknown;
        valenceHint?: unknown;
        noveltyHint?: unknown;
      }>(raw);
      if (typeof body.description !== 'string' || typeof body.locationId !== 'string') {
        json(res, 400, { error: 'description and locationId are required' });
        return;
      }
      try {
        this._manager.injectEvent(simId, {
          description: body.description,
          locationId: body.locationId,
          valenceHint: typeof body.valenceHint === 'number' ? body.valenceHint : 0,
          noveltyHint: typeof body.noveltyHint === 'number' ? body.noveltyHint : 0.8,
        });
        json(res, 200, { ok: true });
      } catch (err) {
        json(res, 409, { error: String(err) });
      }
      return;
    }

    // Routes with agent sub-path
    const agentMatch = matchSimAndAgent(url);
    if (agentMatch && agentMatch.simId === simId) {
      await this._handleAgentRoute(method, url, simId, agentMatch.agentId, req, res);
      return;
    }

    json(res, 404, { error: 'Not found' });
  }

  private async _handleAgentRoute(
    method: string,
    url: string,
    simId: string,
    agentId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    // GET /api/simulations/:id/agents/:agentId
    if (method === 'GET' && url === `/api/simulations/${simId}/agents/${agentId}`) {
      const rec = this._manager.get(simId)!;
      const agent = rec.loop.world.getAgent(agentId);
      if (!agent) {
        json(res, 404, { error: `Agent "${agentId}" not found` });
        return;
      }
      json(res, 200, this._agentDetail(simId, agentId));
      return;
    }

    // POST /api/simulations/:id/agents/:agentId/trait
    if (method === 'POST' && url === `/api/simulations/${simId}/agents/${agentId}/trait`) {
      const raw = await readBody(req);
      const body = parseBody<{ traitId?: unknown; value?: unknown }>(raw);
      if (typeof body.traitId !== 'string' || typeof body.value !== 'number') {
        json(res, 400, { error: 'traitId (string) and value (number) are required' });
        return;
      }
      try {
        this._manager.setAgentTrait(simId, agentId, body.traitId, body.value);
        json(res, 200, { ok: true });
      } catch (err) {
        json(res, 409, { error: String(err) });
      }
      return;
    }

    json(res, 404, { error: 'Not found' });
  }

  // ── SSE ──────────────────────────────────────────────────────────────────

  private _handleSSE(
    simId: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':ok\n\n');

    if (!this._sseClients.has(simId)) {
      this._sseClients.set(simId, new Set());
    }
    const clients = this._sseClients.get(simId)!;
    clients.add(res);

    req.on('close', () => {
      clients.delete(res);
    });
  }

  private _broadcastTick(simId: string, dump: SimulationStateDump): void {
    const clients = this._sseClients.get(simId);
    if (!clients || clients.size === 0) return;
    const frame = `data: ${JSON.stringify({ type: 'tick', dump })}\n\n`;
    for (const client of clients) {
      client.write(frame);
    }
  }

  private _broadcastStatus(simId: string, status: string): void {
    const clients = this._sseClients.get(simId);
    if (!clients || clients.size === 0) return;
    const rec = this._manager.get(simId);
    const frame = `data: ${JSON.stringify({ type: 'status', status, tick: rec?.loop.currentTick ?? 0 })}\n\n`;
    for (const client of clients) {
      client.write(frame);
    }
  }

  /** Attach a one-time SSE broadcast listener to a simulation for auto-run ticks. */
  private _autoRunListeners = new Set<string>();

  private _ensureAutoRunListener(simId: string): void {
    if (this._autoRunListeners.has(simId)) return;
    this._autoRunListeners.add(simId);

    this._manager.addListener(simId, (dump) => {
      const rec = this._manager.get(simId);
      this._broadcastTick(simId, dump);
      if (rec && rec.status === 'stopped') {
        this._broadcastStatus(simId, 'stopped');
      }
    });
  }

  // ── View helpers ──────────────────────────────────────────────────────────

  private _simSummary(simId: string): unknown {
    const list = this._manager.list();
    return list.find((s) => s.id === simId) ?? null;
  }

  private _simDetail(simId: string): unknown {
    const rec = this._manager.get(simId);
    if (!rec) return null;

    const summary = this._simSummary(simId);
    const latestDump = rec.history[rec.history.length - 1] ?? null;
    const agents = rec.loop.world.getAgents().map((a) => a.toStateDump());
    const locations = rec.loop.world.getLocations();

    return {
      ...summary,
      latestDump,
      agents,
      locations,
      recentHistory: rec.history.slice(-20),
    };
  }

  private _agentDetail(simId: string, agentId: string): unknown {
    const rec = this._manager.get(simId);
    if (!rec) return null;
    const agent = rec.loop.world.getAgent(agentId);
    if (!agent) return null;

    const dump = agent.toStateDump();
    const profile = agent.getPersonality().getTraitProfile();
    const traits: Record<string, number> = {};
    for (const [id, dim] of profile.traits) {
      traits[id] = dim.value;
    }

    // Mood timeline from history
    const moodTimeline = rec.history.map((h) => {
      const agentSnap = h.agents.find((a) => a.agentId === agentId);
      return agentSnap
        ? { tick: h.tick, valence: agentSnap.mood.valence, arousal: agentSnap.mood.arousal }
        : null;
    }).filter(Boolean);

    // Drive history from history
    const driveHistory = rec.history.map((h) => {
      const agentSnap = h.agents.find((a) => a.agentId === agentId);
      return agentSnap ? { tick: h.tick, drives: agentSnap.topDrives } : null;
    }).filter(Boolean);

    return {
      ...dump,
      traits,
      moodTimeline,
      driveHistory,
    };
  }
}
