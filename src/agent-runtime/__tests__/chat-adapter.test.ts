/**
 * ChatAdapter — Unit Tests (0.3.1.5.9)
 *
 * Verifies:
 *   - Initial state: isConnected() === false, id matches config
 *   - connect() (stdio mode): sets isConnected() to true
 *   - connect() is idempotent
 *   - disconnect() sets isConnected() to false
 *   - disconnect() is idempotent
 *   - poll() returns [] when disconnected
 *   - poll() returns [] when queue is empty
 *   - poll() returns RawInput items enqueued by stdin line events
 *   - poll() respects maxBatchSize
 *   - poll() ignores blank / whitespace-only lines
 *   - send() drops output (+ warns) when disconnected
 *   - send() writes "text\n" to process.stdout in stdio mode
 *   - stdin close event sets isConnected() to false
 *   - WebSocket mode: connect() resolves after onopen fires
 *   - WebSocket mode: plain text message pushed to queue
 *   - WebSocket mode: JSON-envelope message unwrapped and pushed
 *   - WebSocket mode: blank WS message is ignored
 *   - WebSocket mode: send() calls ws.send() with JSON envelope
 *   - WebSocket mode: WS close event sets isConnected() to false
 *   - WebSocket mode: connect() rejects if wsUrl is empty
 *   - WebSocket mode: connect() rejects on WS onerror
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── readline mock ─────────────────────────────────────────────────────────────
// We capture the mock rl instance so individual tests can trigger line / close.

type RlHandler = (arg?: unknown) => void;

interface MockRlInterface {
  on(event: string, handler: RlHandler): void;
  close(): void;
  prompt(): void;
  /** Test helper — fire an event on the interface. */
  _emit(event: string, arg?: unknown): void;
}

let mockRlInstance: MockRlInterface | null = null;
const mockRlClose = vi.fn();

vi.mock('node:readline', () => ({
  createInterface: vi.fn((): MockRlInterface => {
    const listeners: Map<string, RlHandler[]> = new Map();

    const rl: MockRlInterface = {
      on(event: string, handler: RlHandler) {
        const arr = listeners.get(event) ?? [];
        arr.push(handler);
        listeners.set(event, arr);
      },
      close: mockRlClose,
      prompt: vi.fn(),
      _emit(event: string, arg?: unknown) {
        (listeners.get(event) ?? []).forEach(fn => fn(arg));
      },
    };

    mockRlInstance = rl;
    return rl;
  }),
}));

// ── WebSocket mock ────────────────────────────────────────────────────────────
// Placed on globalThis so ChatAdapter's _resolveWebSocketClass() picks it up.

interface MockWsInstance {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((err: unknown) => void) | null;
  onclose: (() => void) | null;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

let lastWsInstance: MockWsInstance | null = null;

function createMockWebSocketClass(triggerBehaviour: 'open' | 'error' | 'none' = 'open') {
  return function MockWebSocket(this: MockWsInstance, _url: string) {
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.send = vi.fn();
    this.close = vi.fn();
    lastWsInstance = this;

    if (triggerBehaviour === 'open') {
      // Fire onopen on the next microtask, after the caller sets ws.onopen
      queueMicrotask(() => this.onopen?.());
    } else if (triggerBehaviour === 'error') {
      queueMicrotask(() => this.onerror?.(new Error('mock WS error')));
    }
    // 'none' — neither fires; useful for manual control in tests
  } as unknown as new (url: string) => MockWsInstance;
}

// ── Import under test (after mocks) ──────────────────────────────────────────
import { ChatAdapter } from '../chat-adapter.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatAdapter', () => {
  beforeEach(() => {
    mockRlInstance = null;
    lastWsInstance = null;
    mockRlClose.mockClear();
    // Remove any lingering global WS mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).WebSocket;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).WebSocket;
  });

  // ── Construction ────────────────────────────────────────────────────────────

  describe('construction', () => {
    it('defaults id to "chat"', () => {
      const adapter = new ChatAdapter();
      expect(adapter.id).toBe('chat');
    });

    it('uses configured adapterId', () => {
      const adapter = new ChatAdapter({ adapterId: 'my-chat' });
      expect(adapter.id).toBe('my-chat');
    });

    it('starts disconnected', () => {
      const adapter = new ChatAdapter();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  // ── STDIO mode ──────────────────────────────────────────────────────────────

  describe('stdio mode', () => {
    let adapter: ChatAdapter;

    beforeEach(() => {
      adapter = new ChatAdapter({ mode: 'stdio' });
    });

    afterEach(async () => {
      if (adapter.isConnected()) await adapter.disconnect();
    });

    // connect / disconnect

    it('connect() sets isConnected() to true', async () => {
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
    });

    it('connect() is idempotent', async () => {
      await adapter.connect();
      await adapter.connect(); // second call must not throw
      expect(adapter.isConnected()).toBe(true);
    });

    it('disconnect() sets isConnected() to false', async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it('disconnect() is idempotent', async () => {
      await adapter.connect();
      await adapter.disconnect();
      await adapter.disconnect(); // second call must not throw
      expect(adapter.isConnected()).toBe(false);
    });

    it('disconnect() closes the readline interface', async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(mockRlClose).toHaveBeenCalledOnce();
    });

    // poll()

    it('poll() returns [] when not connected', async () => {
      const result = await adapter.poll();
      expect(result).toEqual([]);
    });

    it('poll() returns [] when connected but queue is empty', async () => {
      await adapter.connect();
      const result = await adapter.poll();
      expect(result).toEqual([]);
    });

    it('poll() returns RawInput for each stdin line', async () => {
      await adapter.connect();
      mockRlInstance!._emit('line', 'hello world');

      const result = await adapter.poll();
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('hello world');
      expect(result[0].adapterId).toBe('chat');
      expect(typeof result[0].receivedAt).toBe('number');
    });

    it('poll() drains the queue on each call', async () => {
      await adapter.connect();
      mockRlInstance!._emit('line', 'first');
      mockRlInstance!._emit('line', 'second');

      const first = await adapter.poll();
      expect(first).toHaveLength(2);

      const second = await adapter.poll();
      expect(second).toHaveLength(0);
    });

    it('poll() ignores blank lines', async () => {
      await adapter.connect();
      mockRlInstance!._emit('line', '');
      mockRlInstance!._emit('line', '   ');
      mockRlInstance!._emit('line', '\t');

      const result = await adapter.poll();
      expect(result).toHaveLength(0);
    });

    it('poll() trims whitespace from input text', async () => {
      await adapter.connect();
      mockRlInstance!._emit('line', '  hello  ');

      const result = await adapter.poll();
      expect(result[0].text).toBe('hello');
    });

    it('poll() respects maxBatchSize', async () => {
      const smallAdapter = new ChatAdapter({ maxBatchSize: 2 });
      await smallAdapter.connect();

      mockRlInstance!._emit('line', 'a');
      mockRlInstance!._emit('line', 'b');
      mockRlInstance!._emit('line', 'c');

      const batch1 = await smallAdapter.poll();
      expect(batch1).toHaveLength(2);

      const batch2 = await smallAdapter.poll();
      expect(batch2).toHaveLength(1);

      await smallAdapter.disconnect();
    });

    // stdin close event

    it('stdin close event marks adapter as disconnected', async () => {
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      mockRlInstance!._emit('close');
      expect(adapter.isConnected()).toBe(false);
    });

    // send()

    it('send() writes text to process.stdout', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await adapter.connect();

      await adapter.send({ text: 'Hello, agent!' });
      expect(writeSpy).toHaveBeenCalledWith('Hello, agent!\n');

      writeSpy.mockRestore();
    });

    it('send() drops output and warns when disconnected', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await adapter.send({ text: 'lost message' });

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain('disconnected');

      warnSpy.mockRestore();
    });
  });

  // ── WebSocket mode ───────────────────────────────────────────────────────────

  describe('websocket mode', () => {
    beforeEach(() => {
      lastWsInstance = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).WebSocket = createMockWebSocketClass('open');
    });

    it('connect() resolves after onopen fires', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      await expect(adapter.connect()).resolves.toBeUndefined();
      expect(adapter.isConnected()).toBe(true);
      await adapter.disconnect();
    });

    it('connect() rejects if wsUrl is empty', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: '' });
      await expect(adapter.connect()).rejects.toThrow('wsUrl is required');
    });

    it('connect() rejects when WS fires onerror', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).WebSocket = createMockWebSocketClass('error');
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://bad' });
      await expect(adapter.connect()).rejects.toThrow();
    });

    it('plain text WS message is pushed to poll queue', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      await adapter.connect();

      lastWsInstance!.onmessage!({ data: 'plain text message' });

      const result = await adapter.poll();
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('plain text message');

      await adapter.disconnect();
    });

    it('JSON-envelope message is unwrapped', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      await adapter.connect();

      const envelope = JSON.stringify({ text: 'wrapped text', extra: 42 });
      lastWsInstance!.onmessage!({ data: envelope });

      const result = await adapter.poll();
      expect(result[0].text).toBe('wrapped text');

      await adapter.disconnect();
    });

    it('JSON without "text" field falls back to raw string', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      await adapter.connect();

      const msg = JSON.stringify({ other: 'field' });
      lastWsInstance!.onmessage!({ data: msg });

      const result = await adapter.poll();
      expect(result[0].text).toBe(msg.trim());

      await adapter.disconnect();
    });

    it('blank WS message is ignored', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      await adapter.connect();

      lastWsInstance!.onmessage!({ data: '   ' });

      const result = await adapter.poll();
      expect(result).toHaveLength(0);

      await adapter.disconnect();
    });

    it('send() passes JSON envelope to ws.send()', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      await adapter.connect();

      await adapter.send({ text: 'response', payload: { key: 'val' } });

      expect(lastWsInstance!.send).toHaveBeenCalledOnce();
      const sentStr = lastWsInstance!.send.mock.calls[0][0] as string;
      const parsed = JSON.parse(sentStr) as Record<string, unknown>;
      expect(parsed['text']).toBe('response');
      expect(parsed['key']).toBe('val');

      await adapter.disconnect();
    });

    it('send() with no payload sends only text', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      await adapter.connect();

      await adapter.send({ text: 'hi' });

      const sentStr = lastWsInstance!.send.mock.calls[0][0] as string;
      const parsed = JSON.parse(sentStr) as Record<string, unknown>;
      expect(parsed).toEqual({ text: 'hi' });

      await adapter.disconnect();
    });

    it('WS close event marks adapter as disconnected', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      lastWsInstance!.onclose!();
      expect(adapter.isConnected()).toBe(false);
    });

    it('disconnect() calls ws.close()', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      await adapter.connect();
      await adapter.disconnect();

      expect(lastWsInstance!.close).toHaveBeenCalledOnce();
    });

    it('poll() returns [] when not connected (websocket mode)', async () => {
      const adapter = new ChatAdapter({ mode: 'websocket', wsUrl: 'ws://test' });
      expect(await adapter.poll()).toEqual([]);
    });
  });
});
