/**
 * WebChatServer — Tests (TDD)
 *
 * Event-driven HTTP server that:
 *   - Serves chat HTML on GET /
 *   - Accepts messages via POST /api/message → pipeline.processMessage() → SSE broadcast
 *   - Streams agent responses via GET /api/events (SSE)
 *
 * No polling, no queues — direct event-driven flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import { WebChatServer } from '../web-chat-server.js';
import type { WebChatServerConfig } from '../web-chat-server.js';
import type { PipelineResult } from '../message-pipeline.js';

// ── Helpers ──────────────────────────────────────────────────

function makeResult(text: string | null = 'Hello!'): PipelineResult {
  return {
    text,
    experientialState: {
      timestamp: 1000,
      phenomenalContent: { modalities: ['internal'], richness: 0.5, raw: null },
      intentionalContent: { target: 'current-situation', clarity: 0.7 },
      valence: 0.2,
      arousal: 0.4,
      unityIndex: 0.8,
      continuityToken: { id: 'ct-1', previousId: null, timestamp: 1000 },
    },
    intact: true,
  };
}

/** Minimal mock pipeline — just processMessage. */
function makeMockPipeline() {
  return {
    processMessage: vi.fn<(text: string, timestamp: number) => Promise<PipelineResult>>()
      .mockResolvedValue(makeResult('Mock response')),
  };
}

/** HTTP GET helper. */
function httpGet(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    }).on('error', reject);
  });
}

/** HTTP POST helper. */
function httpPost(url: string, data: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/** Connect SSE and collect events until `count` data events or timeout. */
function collectSSE(url: string, count: number, timeoutMs = 3000): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const events: string[] = [];
    const req = http.get(url, (res) => {
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        // Parse SSE frames
        const lines = buffer.split('\n');
        buffer = lines.pop()!; // keep incomplete line
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            events.push(line.slice(6));
            if (events.length >= count) {
              req.destroy();
              resolve(events);
            }
          }
        }
      });
      res.on('end', () => resolve(events));
    });
    req.on('error', (err) => {
      // Destroyed socket is expected when we got enough events
      if (events.length >= count) resolve(events);
      else reject(err);
    });
    setTimeout(() => { req.destroy(); resolve(events); }, timeoutMs);
  });
}

// ── Tests ────────────────────────────────────────────────────

describe('WebChatServer', () => {
  let server: WebChatServer;
  let pipeline: ReturnType<typeof makeMockPipeline>;
  let baseUrl: string;

  beforeEach(async () => {
    pipeline = makeMockPipeline();
    server = new WebChatServer(pipeline, { port: 0 }); // OS-assigned port
    await server.start();
    baseUrl = `http://localhost:${server.port}`;
  });

  afterEach(async () => {
    await server.stop();
  });

  // ── Lifecycle ─────────────────────────────────────────────

  it('starts and reports a port', () => {
    expect(server.port).toBeGreaterThan(0);
  });

  it('stops cleanly', async () => {
    await server.stop();
    // Second stop is a no-op
    await server.stop();
  });

  // ── GET / — Chat HTML ────────────────────────────────────

  it('serves HTML on GET /', async () => {
    const res = await httpGet(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Conscious Agent');
  });

  // ── GET /api/events — SSE ────────────────────────────────

  it('opens SSE connection on GET /api/events', async () => {
    const res = await new Promise<http.IncomingMessage>((resolve) => {
      http.get(`${baseUrl}/api/events`, resolve);
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    res.destroy();
  });

  // ── POST /api/message — Event-driven flow ────────────────

  it('returns 200 with ok:true on valid POST', async () => {
    const res = await httpPost(`${baseUrl}/api/message`, { text: 'hello' });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });

  it('invokes pipeline.processMessage with the text and a timestamp', async () => {
    await httpPost(`${baseUrl}/api/message`, { text: 'test input' });

    expect(pipeline.processMessage).toHaveBeenCalledTimes(1);
    const [text, timestamp] = pipeline.processMessage.mock.calls[0]!;
    expect(text).toBe('test input');
    expect(typeof timestamp).toBe('number');
    expect(timestamp).toBeGreaterThan(0);
  });

  it('broadcasts pipeline response via SSE', async () => {
    pipeline.processMessage.mockResolvedValue(makeResult('Agent says hi'));

    // Connect SSE first, then send message
    const ssePromise = collectSSE(`${baseUrl}/api/events`, 1, 3000);

    // Small delay to let SSE connect
    await new Promise(r => setTimeout(r, 100));

    await httpPost(`${baseUrl}/api/message`, { text: 'hello' });

    const events = await ssePromise;
    expect(events.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(events[0]!);
    expect(parsed.text).toBe('Agent says hi');
  });

  it('does not broadcast when pipeline returns null text', async () => {
    pipeline.processMessage.mockResolvedValue(makeResult(null));

    const ssePromise = collectSSE(`${baseUrl}/api/events`, 1, 500);
    await new Promise(r => setTimeout(r, 100));
    await httpPost(`${baseUrl}/api/message`, { text: 'hello' });

    const events = await ssePromise;
    expect(events.length).toBe(0);
  });

  // ── Input validation ──────────────────────────────────────

  it('rejects missing text field with 400', async () => {
    const res = await httpPost(`${baseUrl}/api/message`, { foo: 'bar' });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain('text');
  });

  it('rejects empty text with 400', async () => {
    const res = await httpPost(`${baseUrl}/api/message`, { text: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const parsed = new URL(`${baseUrl}/api/message`);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 10 },
      }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      });
      req.on('error', reject);
      req.write('not-json!!');
      req.end();
    });
    expect(res.status).toBe(400);
  });

  // ── 404 for unknown routes ────────────────────────────────

  it('returns 404 for unknown routes', async () => {
    const res = await httpGet(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });

  // ── Multiple SSE clients ──────────────────────────────────

  it('broadcasts to multiple SSE clients', async () => {
    pipeline.processMessage.mockResolvedValue(makeResult('broadcast!'));

    const sse1 = collectSSE(`${baseUrl}/api/events`, 1, 3000);
    const sse2 = collectSSE(`${baseUrl}/api/events`, 1, 3000);

    await new Promise(r => setTimeout(r, 150));
    await httpPost(`${baseUrl}/api/message`, { text: 'hello' });

    const [events1, events2] = await Promise.all([sse1, sse2]);
    expect(events1.length).toBeGreaterThanOrEqual(1);
    expect(events2.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(events1[0]!).text).toBe('broadcast!');
    expect(JSON.parse(events2[0]!).text).toBe('broadcast!');
  });

  // ── Pipeline error handling ───────────────────────────────

  it('returns 500 when pipeline throws', async () => {
    pipeline.processMessage.mockRejectedValue(new Error('Pipeline exploded'));

    const res = await httpPost(`${baseUrl}/api/message`, { text: 'hello' });
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body).error).toContain('processing');
  });
});
