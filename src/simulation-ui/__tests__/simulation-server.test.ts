/**
 * Tests for SimulationServer (simulation-ui/)
 *
 * Uses Node's built-in http.request to exercise the server routes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { SimulationServer } from '../simulation-server.js';
import { SimulationManager } from '../simulation-manager.js';

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function request(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: raw });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Test fixture ──────────────────────────────────────────────────────────────

let server: SimulationServer;
let baseUrl: string;

beforeEach(async () => {
  const mgr = new SimulationManager();
  server = new SimulationServer(mgr, { port: 0 }); // OS-assigned port
  await server.start();
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterEach(async () => {
  await server.stop();
});

// ── HTML page ─────────────────────────────────────────────────────────────────

describe('GET /', () => {
  it('returns 200 HTML', async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      http.get(`${baseUrl}/`, (r) => {
        let body = '';
        r.on('data', (c: Buffer) => (body += c.toString()));
        r.on('end', () => resolve({ status: r.statusCode ?? 0, body }));
      }).on('error', reject);
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain('<!DOCTYPE html>');
  });
});

// ── Scenarios ─────────────────────────────────────────────────────────────────

describe('GET /api/scenarios', () => {
  it('returns an array with village and colony', async () => {
    const { status, data } = await request('GET', `${baseUrl}/api/scenarios`);
    expect(status).toBe(200);
    const ids = (data as Array<{ id: string }>).map(s => s.id);
    expect(ids).toContain('village');
    expect(ids).toContain('colony');
  });
});

// ── Simulations CRUD ──────────────────────────────────────────────────────────

describe('POST /api/simulations', () => {
  it('creates a simulation and returns 201', async () => {
    const { status, data } = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'My Village',
      scenarioId: 'village',
    });
    expect(status).toBe(201);
    const d = data as { id: string; name: string; status: string };
    expect(typeof d.id).toBe('string');
    expect(d.name).toBe('My Village');
    expect(d.status).toBe('idle');
  });

  it('returns 400 for missing fields', async () => {
    const { status } = await request('POST', `${baseUrl}/api/simulations`, { name: 'X' });
    expect(status).toBe(400);
  });
});

describe('GET /api/simulations', () => {
  it('returns empty list initially', async () => {
    const { status, data } = await request('GET', `${baseUrl}/api/simulations`);
    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('lists created simulations', async () => {
    await request('POST', `${baseUrl}/api/simulations`, { name: 'A', scenarioId: 'village' });
    await request('POST', `${baseUrl}/api/simulations`, { name: 'B', scenarioId: 'colony' });
    const { data } = await request('GET', `${baseUrl}/api/simulations`);
    expect((data as unknown[]).length).toBe(2);
  });
});

describe('GET /api/simulations/:id', () => {
  it('returns simulation detail', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'Detail Test',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const { status, data } = await request('GET', `${baseUrl}/api/simulations/${id}`);
    expect(status).toBe(200);
    const d = data as { id: string; agents: unknown[] };
    expect(d.id).toBe(id);
    expect(Array.isArray(d.agents)).toBe(true);
    expect(d.agents.length).toBe(5); // village has 5 agents
  });

  it('returns 404 for unknown id', async () => {
    const { status } = await request('GET', `${baseUrl}/api/simulations/nope`);
    expect(status).toBe(404);
  });
});

describe('DELETE /api/simulations/:id', () => {
  it('deletes a simulation', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'Delete Me',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const { status } = await request('DELETE', `${baseUrl}/api/simulations/${id}`);
    expect(status).toBe(200);
    const { status: s2 } = await request('GET', `${baseUrl}/api/simulations/${id}`);
    expect(s2).toBe(404);
  });
});

// ── Simulation lifecycle ──────────────────────────────────────────────────────

describe('POST /api/simulations/:id/step', () => {
  it('advances the tick', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'Step Test',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const { status, data } = await request('POST', `${baseUrl}/api/simulations/${id}/step`);
    expect(status).toBe(200);
    const d = data as { ok: boolean; tick: number };
    expect(d.ok).toBe(true);
    expect(d.tick).toBe(1);
  });
});

describe('POST /api/simulations/:id/run and /pause', () => {
  it('run sets status to running and pause to idle', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'Run Test',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const run = await request('POST', `${baseUrl}/api/simulations/${id}/run`);
    expect((run.data as { status: string }).status).toBe('running');
    const pause = await request('POST', `${baseUrl}/api/simulations/${id}/pause`);
    expect((pause.data as { status: string }).status).toBe('idle');
  });
});

describe('POST /api/simulations/:id/stop', () => {
  it('stops the simulation', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'Stop Test',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const { status, data } = await request('POST', `${baseUrl}/api/simulations/${id}/stop`);
    expect(status).toBe(200);
    expect((data as { status: string }).status).toBe('stopped');
  });
});

// ── Parameter injection ───────────────────────────────────────────────────────

describe('POST /api/simulations/:id/inject', () => {
  it('injects an event', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'Inject Test',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const inj = await request('POST', `${baseUrl}/api/simulations/${id}/inject`, {
      description: 'A comet streaks across the sky.',
      locationId: 'town_square',
      valenceHint: 0.2,
      noveltyHint: 0.9,
    });
    expect(inj.status).toBe(200);
    expect((inj.data as { ok: boolean }).ok).toBe(true);

    // Step to confirm event is processed
    const step = await request('POST', `${baseUrl}/api/simulations/${id}/step`);
    const dump = (step.data as { dump: { recentEvents: Array<{ description: string }> } }).dump;
    const found = dump.recentEvents.some(e => e.description.includes('comet'));
    expect(found).toBe(true);
  });

  it('returns 400 for missing fields', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'I',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const { status } = await request('POST', `${baseUrl}/api/simulations/${id}/inject`, {
      description: 'only desc',
    });
    expect(status).toBe(400);
  });
});

// ── Agent routes ──────────────────────────────────────────────────────────────

describe('GET /api/simulations/:id/agents/:agentId', () => {
  it('returns agent detail with traits', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'Agent Test',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const { status, data } = await request(
      'GET',
      `${baseUrl}/api/simulations/${id}/agents/aldric`,
    );
    expect(status).toBe(200);
    const d = data as { agentId: string; traits: Record<string, number> };
    expect(d.agentId).toBe('aldric');
    expect(typeof d.traits).toBe('object');
    expect(typeof d.traits['openness']).toBe('number');
  });

  it('returns 404 for unknown agent', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'A',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const { status } = await request('GET', `${baseUrl}/api/simulations/${id}/agents/nobody`);
    expect(status).toBe(404);
  });
});

describe('POST /api/simulations/:id/agents/:agentId/trait', () => {
  it('updates a trait and returns ok', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'Trait Test',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const { status, data } = await request(
      'POST',
      `${baseUrl}/api/simulations/${id}/agents/aldric/trait`,
      { traitId: 'openness', value: 0.1 },
    );
    expect(status).toBe(200);
    expect((data as { ok: boolean }).ok).toBe(true);

    // Verify trait was updated
    const agent = await request('GET', `${baseUrl}/api/simulations/${id}/agents/aldric`);
    const d = agent.data as { traits: Record<string, number> };
    expect(d.traits['openness']).toBeCloseTo(0.1);
  });

  it('returns 400 for missing traitId', async () => {
    const created = await request('POST', `${baseUrl}/api/simulations`, {
      name: 'T',
      scenarioId: 'village',
    });
    const { id } = created.data as { id: string };
    const { status } = await request(
      'POST',
      `${baseUrl}/api/simulations/${id}/agents/aldric/trait`,
      { value: 0.5 },
    );
    expect(status).toBe(400);
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 404', async () => {
    const { status } = await request('GET', `${baseUrl}/api/nonexistent`);
    expect(status).toBe(404);
  });
});
