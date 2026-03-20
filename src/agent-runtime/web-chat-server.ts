/**
 * WebChatServer — Event-Driven HTTP Chat Server
 *
 * Replaces the polling-based WebChatAdapter with a fully event-driven
 * architecture:
 *
 *   POST /api/message
 *     → pipeline.processMessage(text, timestamp)
 *     → SSE broadcast to all connected clients
 *
 *   GET /api/events — SSE stream for agent responses
 *   GET /           — serves the chat HTML page
 *
 * No queues, no polling, no shared mutable state races. Each incoming
 * message is processed through the full conscious pipeline and the
 * result is pushed to clients immediately.
 *
 * Zero external dependencies — uses only Node built-in http module.
 */

import * as http from 'node:http';
import { CHAT_HTML } from './web-chat-html.js';
import type { PipelineResult } from './message-pipeline.js';

// ── Types ────────────────────────────────────────────────────

export interface WebChatServerConfig {
  /** TCP port. Use 0 for OS-assigned. Default: 1338. */
  port?: number;
}

/** Minimal interface for the pipeline — only processMessage is needed. */
export interface IMessageProcessor {
  processMessage(text: string, receivedAt: number): Promise<PipelineResult>;
}

// ── WebChatServer ────────────────────────────────────────────

export class WebChatServer {
  private _server: http.Server | null = null;
  private _sseClients: Set<http.ServerResponse> = new Set();
  private _port: number;
  private _actualPort = 0;
  private _running = false;

  constructor(
    private readonly _pipeline: IMessageProcessor,
    config: WebChatServerConfig = {},
  ) {
    this._port = config.port ?? 1338;
  }

  get port(): number {
    return this._actualPort;
  }

  async start(): Promise<void> {
    if (this._running) return;

    this._server = http.createServer((req, res) => this._handleRequest(req, res));

    await new Promise<void>((resolve, reject) => {
      this._server!.listen(this._port, '0.0.0.0', () => {
        const addr = this._server!.address();
        if (addr && typeof addr === 'object') {
          this._actualPort = addr.port;
        }
        resolve();
      });
      this._server!.on('error', reject);
    });

    this._running = true;
  }

  async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;

    for (const client of this._sseClients) {
      client.end();
    }
    this._sseClients.clear();

    await new Promise<void>((resolve) => {
      this._server!.close(() => resolve());
    });
    this._server = null;
    this._actualPort = 0;
  }

  // ── HTTP routing ───────────────────────────────────────────

  private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    if (method === 'GET' && url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(CHAT_HTML);
      return;
    }

    if (method === 'GET' && url === '/api/events') {
      this._handleSSE(req, res);
      return;
    }

    if (method === 'POST' && url === '/api/message') {
      this._handleMessage(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  // ── SSE ────────────────────────────────────────────────────

  private _handleSSE(_req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(':ok\n\n');
    this._sseClients.add(res);
    _req.on('close', () => {
      this._sseClients.delete(res);
    });
  }

  private _broadcast(text: string): void {
    const frame = `data: ${JSON.stringify({ text })}\n\n`;
    for (const client of this._sseClients) {
      client.write(frame);
    }
  }

  // ── Message handling (event-driven) ────────────────────────

  private _handleMessage(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
      if (body.length > 16384) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      // Parse and validate
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

      // Event-driven: invoke the pipeline directly, respond via SSE
      this._pipeline.processMessage(text, Date.now())
        .then((result) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));

          if (result.text !== null) {
            this._broadcast(result.text);
          }
        })
        .catch((_err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Error processing message' }));
        });
    });
  }
}
