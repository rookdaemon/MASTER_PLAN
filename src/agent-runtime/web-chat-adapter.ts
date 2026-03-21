/**
 * Web Chat Adapter — Agent Runtime
 *
 * IEnvironmentAdapter backed by a minimal HTTP server:
 *
 *   GET  /              → serves the chat HTML page
 *   POST /api/message   → accepts { text: string } from the browser
 *   GET  /api/events    → SSE stream that pushes agent responses to the browser
 *
 * Zero external dependencies — uses only Node built-in modules (http).
 *
 * Environment abstractions (per Claude.md):
 *   - IHttpServer wraps server lifecycle (injectable, mockable)
 *   - All timestamps passed as parameters where testability matters
 */

import * as http from 'node:http';
import type { IEnvironmentAdapter } from './interfaces.js';
import type { AgentOutput, RawInput } from './types.js';
import { CHAT_HTML } from './web-chat-html.js';

// ── Config ────────────────────────────────────────────────────

export interface WebChatAdapterConfig {
  /** TCP port to listen on. Use 0 for an OS-assigned free port. Default: 1338. */
  port?: number;
  /** Adapter identifier surfaced in RawInput.adapterId. Default: 'web-chat'. */
  adapterId?: string;
  /** Maximum inputs returned per poll(). Default: 32. */
  maxBatchSize?: number;
}

// ── WebChatAdapter ────────────────────────────────────────────

export class WebChatAdapter implements IEnvironmentAdapter {
  readonly id: string;

  private _connected = false;
  private _inputQueue: RawInput[] = [];
  private _maxBatchSize: number;
  private _server: http.Server | null = null;
  private _sseClients: Set<http.ServerResponse> = new Set();
  private _requestedPort: number;
  private _actualPort = 0;

  constructor(config: WebChatAdapterConfig = {}) {
    this.id = config.adapterId ?? 'web-chat';
    this._requestedPort = config.port ?? 1338;
    this._maxBatchSize = config.maxBatchSize ?? 32;
  }

  /** The actual port the server is listening on (0 until connected). */
  get port(): number {
    return this._actualPort;
  }

  // ── IEnvironmentAdapter ──────────────────────────────────

  async connect(): Promise<void> {
    if (this._connected) return;

    this._server = http.createServer((req, res) => this._handleRequest(req, res));

    await new Promise<void>((resolve, reject) => {
      this._server!.listen(this._requestedPort, () => {
        const addr = this._server!.address();
        if (addr && typeof addr === 'object') {
          this._actualPort = addr.port;
        }
        resolve();
      });
      this._server!.on('error', reject);
    });

    this._connected = true;
    console.info(`[WebChatAdapter:${this.id}] listening on http://localhost:${this._actualPort}`);
  }

  async disconnect(): Promise<void> {
    if (!this._connected) return;
    this._connected = false;

    // Close all SSE connections
    for (const client of this._sseClients) {
      client.end();
    }
    this._sseClients.clear();

    // Close HTTP server
    await new Promise<void>((resolve) => {
      this._server!.close(() => resolve());
    });
    this._server = null;
    this._actualPort = 0;

    console.info(`[WebChatAdapter:${this.id}] disconnected`);
  }

  isConnected(): boolean {
    return this._connected;
  }

  async poll(): Promise<RawInput[]> {
    if (!this._connected || this._inputQueue.length === 0) return [];
    const batch = this._inputQueue.splice(0, this._maxBatchSize);
    return batch;
  }

  async send(output: AgentOutput): Promise<void> {
    if (!this._connected) return;

    const event = `data: ${JSON.stringify({ type: 'chat', text: output.text, payload: output.payload })}\n\n`;

    for (const client of this._sseClients) {
      client.write(event);
    }
  }

  /** Broadcast a monologue entry to all connected SSE clients. */
  broadcastMonologue(entry: { type: string; content: string; timestamp: string; metadata?: Record<string, unknown> }): void {
    if (!this._connected) return;
    const frame = `data: ${JSON.stringify({ type: 'monologue', entry })}\n\n`;
    for (const client of this._sseClients) {
      client.write(frame);
    }
  }

  // ── HTTP handler ─────────────────────────────────────────

  private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // GET / — serve chat HTML
    if (method === 'GET' && url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(CHAT_HTML);
      return;
    }

    // GET /api/events — SSE stream
    if (method === 'GET' && url === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(':ok\n\n');
      this._sseClients.add(res);
      req.on('close', () => {
        this._sseClients.delete(res);
      });
      return;
    }

    // POST /api/message — receive user input
    if (method === 'POST' && url === '/api/message') {
      this._handlePostMessage(req, res);
      return;
    }

    // Everything else — 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private _handlePostMessage(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
      // Guard against oversized payloads (16 KB max)
      if (body.length > 16384) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      if (
        typeof parsed !== 'object' || parsed === null ||
        typeof (parsed as Record<string, unknown>)['text'] !== 'string'
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "text" field' }));
        return;
      }

      const text = ((parsed as Record<string, unknown>)['text'] as string).trim();
      if (text.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Empty message' }));
        return;
      }

      this._inputQueue.push({
        adapterId: this.id,
        text,
        receivedAt: Date.now(),
        metadata: { modality: 'text', peerName: 'web' },
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  }
}
