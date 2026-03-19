/**
 * Chat Adapter — Agent Runtime and Event Loop (0.3.1.5.9)
 *
 * Concrete IEnvironmentAdapter that connects the agent to text-based I/O:
 *
 *   Mode 1 — STDIO (default):  reads lines from stdin, writes to stdout.
 *   Mode 2 — WebSocket:        connects to a WebSocket URL; each message is
 *                               a JSON envelope `{ "text": "..." }`.
 *
 * The adapter is non-blocking:  poll() drains the internal queue and returns
 * immediately with whatever inputs have arrived.  Callers should not block on
 * poll() returning [] — the agent loop simply produces an idle tick.
 *
 * Thread / async safety:
 *   All mutations to _inputQueue go through the same event loop turn, so there
 *   is no data-race risk in a single-threaded Node.js process.
 */

import * as readline from 'node:readline';
import type { IEnvironmentAdapter } from './interfaces.js';
import type { AgentOutput, RawInput } from './types.js';

// ── ChatAdapterConfig ─────────────────────────────────────────

export interface ChatAdapterConfig {
  /**
   * Connection mode.
   *   'stdio'     — read from process.stdin, write to process.stdout (default)
   *   'websocket' — connect to wsUrl
   */
  mode?: 'stdio' | 'websocket';

  /** WebSocket URL (required when mode === 'websocket'). */
  wsUrl?: string;

  /**
   * Maximum number of inputs to return per poll() call (prevents runaway
   * memory usage when messages arrive faster than ticks).
   * Default: 32.
   */
  maxBatchSize?: number;

  /**
   * Adapter identifier — surfaced in RawInput.adapterId.
   * Default: 'chat'.
   */
  adapterId?: string;
}

// ── ChatAdapter ───────────────────────────────────────────────

export class ChatAdapter implements IEnvironmentAdapter {
  readonly id: string;

  private _connected = false;
  private _inputQueue: RawInput[] = [];
  private _maxBatchSize: number;

  // STDIO handles
  private _rl: readline.Interface | null = null;

  // WebSocket handle (typed loosely to avoid hard WS dependency at
  // module-load time; the import is dynamic when mode === 'websocket')
  private _ws: WebSocketLike | null = null;

  private readonly _config: Required<ChatAdapterConfig>;

  constructor(config: ChatAdapterConfig = {}) {
    this._config = {
      mode: config.mode ?? 'stdio',
      wsUrl: config.wsUrl ?? '',
      maxBatchSize: config.maxBatchSize ?? 32,
      adapterId: config.adapterId ?? 'chat',
    };
    this.id = this._config.adapterId;
    this._maxBatchSize = this._config.maxBatchSize;
  }

  // ── IEnvironmentAdapter ──────────────────────────────────────

  async connect(): Promise<void> {
    if (this._connected) return;

    if (this._config.mode === 'websocket') {
      await this._connectWebSocket();
    } else {
      this._connectStdio();
    }

    this._connected = true;
    console.info(`[ChatAdapter:${this.id}] connected (mode=${this._config.mode})`);
  }

  async disconnect(): Promise<void> {
    if (!this._connected) return;
    this._connected = false;

    if (this._rl) {
      this._rl.close();
      this._rl = null;
    }

    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }

    console.info(`[ChatAdapter:${this.id}] disconnected`);
  }

  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Non-blocking drain of the input queue.
   * Returns up to maxBatchSize inputs; never awaits new input.
   */
  async poll(): Promise<RawInput[]> {
    if (!this._connected || this._inputQueue.length === 0) return [];

    const batch = this._inputQueue.splice(0, this._maxBatchSize);
    return batch;
  }

  async send(output: AgentOutput): Promise<void> {
    if (!this._connected) {
      console.warn(`[ChatAdapter:${this.id}] send() called while disconnected — dropping output`);
      return;
    }

    if (this._config.mode === 'websocket' && this._ws) {
      const envelope = JSON.stringify({ text: output.text, ...(output.payload ?? {}) });
      this._ws.send(envelope);
    } else {
      // STDIO mode: write to stdout with a trailing newline
      process.stdout.write(output.text + '\n');
      // Re-show prompt after output
      this._rl?.prompt();
    }
  }

  // ── Private helpers ──────────────────────────────────────────

  private _connectStdio(): void {
    this._rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // echo input to stderr (stdout reserved for agent output)
      terminal: process.stdin.isTTY ?? false,
      prompt: '> ',
    });

    if (process.stdin.isTTY) {
      this._rl.prompt();
    }

    this._rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        if (process.stdin.isTTY) this._rl?.prompt();
        return;
      }

      this._inputQueue.push({
        adapterId: this.id,
        text: trimmed,
        receivedAt: Date.now(),
      });
    });

    this._rl.on('close', () => {
      console.info(`[ChatAdapter:${this.id}] stdin closed`);
      this._connected = false;
    });

    this._rl.on('error', (err: Error) => {
      console.error(`[ChatAdapter:${this.id}] readline error:`, err);
    });
  }

  private async _connectWebSocket(): Promise<void> {
    if (!this._config.wsUrl) {
      throw new Error(`[ChatAdapter:${this.id}] wsUrl is required for websocket mode`);
    }

    // Dynamically resolve a WebSocket implementation.
    // Node 22+ ships a global WebSocket; older Node needs the 'ws' package.
    const WsClass = await _resolveWebSocketClass();

    await new Promise<void>((resolve, reject) => {
      const ws = new WsClass(this._config.wsUrl) as WebSocketLike;

      ws.onopen = () => {
        this._ws = ws;
        resolve();
      };

      ws.onerror = (err: unknown) => {
        reject(new Error(`[ChatAdapter:${this.id}] WebSocket connection error: ${String(err)}`));
      };

      ws.onmessage = (event: MessageEvent) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        let text = raw;

        // Try to unwrap a JSON envelope `{ "text": "..." }`
        try {
          const parsed: unknown = JSON.parse(raw);
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'text' in parsed &&
            typeof (parsed as Record<string, unknown>)['text'] === 'string'
          ) {
            text = (parsed as Record<string, unknown>)['text'] as string;
          }
        } catch {
          // Not JSON — treat raw string as text
        }

        if (text.trim().length > 0) {
          this._inputQueue.push({
            adapterId: this.id,
            text: text.trim(),
            receivedAt: Date.now(),
          });
        }
      };

      ws.onclose = () => {
        console.info(`[ChatAdapter:${this.id}] WebSocket closed`);
        this._connected = false;
        this._ws = null;
      };
    });
  }
}

// ── Minimal WebSocket-like interface ──────────────────────────
// Lets us accept either the native global WebSocket (Node 22+) or the
// ws package without importing either at the type level.

interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((err: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

interface MessageEvent {
  data: unknown;
}

// ── WebSocket class resolver ───────────────────────────────────

/**
 * Returns a WebSocket constructor, preferring the Node 22+ global and falling
 * back to the 'ws' npm package if available.
 */
async function _resolveWebSocketClass(): Promise<new (url: string) => WebSocketLike> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (typeof g['WebSocket'] === 'function') {
    // Node 22+ global or browser
    return g['WebSocket'] as new (url: string) => WebSocketLike;
  }

  // Try the 'ws' package (optional peer dependency)
  try {
    // Dynamic import so the module compiles without 'ws' installed
    const ws = await import('ws');
    return (ws.default ?? ws) as unknown as new (url: string) => WebSocketLike;
  } catch {
    throw new Error(
      'No WebSocket implementation found. ' +
      'Run `npm install ws` or use Node 22+ which includes a global WebSocket.',
    );
  }
}
