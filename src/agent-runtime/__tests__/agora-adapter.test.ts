/**
 * Tests for AgoraAdapter — covers all 6 behavioral specs from card 0.0.3
 *
 * Mocks the @rookdaemon/agora AgoraService to avoid real WebSocket connections.
 * Each behavioral spec from the card maps to a describe block.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AgoraServiceConfig, Envelope } from '@rookdaemon/agora';
import {
  AgoraAdapter,
  POLL_BATCH_SIZE,
  DIAGNOSTIC_MODE_DEFAULT,
  type AgoraAdapterConfig,
} from '../agora-adapter.js';

// ── Test constants ─────────────────────────────────────────────

const PK_SELF = 'aabbccdd00000000000000000000000000000000000000000000000000000001';
const PK_ROOK = 'aabbccdd00000000000000000000000000000000000000000000000000000002';
const PK_CSG  = 'aabbccdd00000000000000000000000000000000000000000000000000000003';
const PK_STEFAN = 'aabbccdd00000000000000000000000000000000000000000000000000000004';
const PK_UNKNOWN = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffdeadbeef';

// ── Mock setup ─────────────────────────────────────────────────

// Capture the relay message handler passed to AgoraService constructor
let capturedHandler: ((envelope: Envelope, from: string) => void) | null = null;

const mockSendMessage = vi.fn().mockResolvedValue({ ok: true, status: 200 });
const mockSendToAll = vi.fn().mockResolvedValue({ ok: true, errors: [] });
const mockConnectRelay = vi.fn().mockResolvedValue(undefined);
const mockDisconnectRelay = vi.fn().mockResolvedValue(undefined);

vi.mock('@rookdaemon/agora', () => ({
  AgoraService: class MockAgoraService {
    constructor(_config: unknown, handler: (envelope: Envelope, from: string) => void) {
      capturedHandler = handler;
    }
    connectRelay = mockConnectRelay;
    disconnectRelay = mockDisconnectRelay;
    sendMessage = mockSendMessage;
    sendToAll = mockSendToAll;
  },
}));

// ── Helpers ────────────────────────────────────────────────────

function makeServiceConfig(opts?: { withRelay?: boolean }): AgoraServiceConfig {
  const peers = new Map<string, { publicKey: string; name?: string }>();
  peers.set(PK_ROOK, { publicKey: PK_ROOK, name: 'rook' });
  peers.set(PK_CSG, { publicKey: PK_CSG, name: 'csg' });
  peers.set(PK_STEFAN, { publicKey: PK_STEFAN, name: 'stefan' });

  return {
    identity: { publicKey: PK_SELF, privateKey: 'fake-private-key', name: 'self' },
    peers,
    relay: opts?.withRelay !== false ? { url: 'ws://localhost:9999' } : undefined,
  } as AgoraServiceConfig;
}

function makeEnvelope(overrides: Partial<Envelope> = {}): Envelope {
  return {
    id: 'env-001',
    type: 'publish',
    from: PK_ROOK,
    to: [PK_SELF],
    timestamp: Date.now(),
    payload: { text: 'hello' },
    signature: 'fake-sig',
    ...overrides,
  } as Envelope;
}

// ── Tests ──────────────────────────────────────────────────────

describe('AgoraAdapter', () => {
  beforeEach(() => {
    capturedHandler = null;
    vi.clearAllMocks();
  });

  // ── Threshold Registry constants ──────────────────────────────
  describe('Threshold Registry', () => {
    it('POLL_BATCH_SIZE is 16', () => {
      expect(POLL_BATCH_SIZE).toBe(16);
    });

    it('DIAGNOSTIC_MODE_DEFAULT is true', () => {
      expect(DIAGNOSTIC_MODE_DEFAULT).toBe(true);
    });
  });

  // ── Contract: connect() / disconnect() / isConnected() ────────
  describe('Contract: connection lifecycle', () => {
    it('connect() establishes connection and sets isConnected() = true', async () => {
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      expect(adapter.isConnected()).toBe(false);

      await adapter.connect();

      expect(adapter.isConnected()).toBe(true);
      expect(mockConnectRelay).toHaveBeenCalledWith('ws://localhost:9999');
    });

    it('connect() skips with warning when no relay URL configured', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig({ withRelay: false }), { diagnosticMode: false });

      await adapter.connect();

      expect(adapter.isConnected()).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No relay URL'));
      warnSpy.mockRestore();
    });

    it('disconnect() closes connection and sets isConnected() = false', async () => {
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      await adapter.disconnect();

      expect(adapter.isConnected()).toBe(false);
      expect(mockDisconnectRelay).toHaveBeenCalled();
    });
  });

  // ── Scenario 1: Inbound message routing (happy path) ──────────
  describe('Scenario: Inbound message routing (happy path)', () => {
    it('queues a RawInput with correct text, peerName, and source when a registered peer sends a message', async () => {
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      // Simulate relay delivering an envelope from rook
      capturedHandler!(makeEnvelope({
        from: PK_ROOK,
        payload: { text: 'hello' },
      }), PK_ROOK);

      const messages = await adapter.poll();

      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('hello');
      expect(messages[0].metadata?.peerName).toBe('rook');
      expect(messages[0].metadata?.peerPublicKey).toBe(PK_ROOK);
      expect(messages[0].metadata?.source).toBe('agora');
      expect(messages[0].metadata?.modality).toBe('text');
      expect(messages[0].metadata?.envelopeId).toBe('env-001');
    });

    it('extracts text from payload.content as fallback', async () => {
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      capturedHandler!(makeEnvelope({
        from: PK_ROOK,
        payload: { content: 'fallback text' },
      }), PK_ROOK);

      const messages = await adapter.poll();
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('fallback text');
    });
  });

  // ── Scenario 2: Unknown peer filtered ──────────────────────────
  describe('Scenario: Unknown peer filtered', () => {
    it('silently drops messages from unregistered public keys', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      // Deliver from unknown peer
      capturedHandler!(makeEnvelope({
        from: PK_UNKNOWN,
      }), PK_UNKNOWN);

      const messages = await adapter.poll();
      expect(messages).toHaveLength(0);
      warnSpy.mockRestore();
    });

    it('does not affect the queue when an unknown peer message is dropped', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      // Queue a valid message first
      capturedHandler!(makeEnvelope({ from: PK_ROOK, payload: { text: 'valid' } }), PK_ROOK);
      // Then an unknown peer
      capturedHandler!(makeEnvelope({ from: PK_UNKNOWN, payload: { text: 'invalid' } }), PK_UNKNOWN);

      const messages = await adapter.poll();
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('valid');
      warnSpy.mockRestore();
    });
  });

  // ── Scenario 3: Diagnostic mode filtering ──────────────────────
  describe('Scenario: Diagnostic mode filtering', () => {
    it('drops inbound messages from peers not in diagnosticPeers', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), {
        diagnosticMode: true,
        diagnosticPeers: ['stefan'],
      });
      await adapter.connect();

      // rook is registered but NOT in diagnosticPeers
      capturedHandler!(makeEnvelope({ from: PK_ROOK, payload: { text: 'from rook' } }), PK_ROOK);

      const messages = await adapter.poll();
      expect(messages).toHaveLength(0);
      infoSpy.mockRestore();
    });

    it('accepts inbound messages from peers in diagnosticPeers', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), {
        diagnosticMode: true,
        diagnosticPeers: ['stefan'],
      });
      await adapter.connect();

      capturedHandler!(makeEnvelope({ from: PK_STEFAN, payload: { text: 'from stefan' } }), PK_STEFAN);

      const messages = await adapter.poll();
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('from stefan');
      vi.restoreAllMocks();
    });

    it('send() filters out peers not in diagnosticPeers', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), {
        diagnosticMode: true,
        diagnosticPeers: ['stefan'],
      });
      await adapter.connect();

      await adapter.send({ text: 'hello', targetPeers: ['rook'] });

      // rook is not in diagnosticPeers, so nothing should be sent
      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockSendToAll).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });

    it('listPeers() returns only peers in diagnosticPeers', () => {
      const adapter = new AgoraAdapter(makeServiceConfig(), {
        diagnosticMode: true,
        diagnosticPeers: ['stefan'],
      });

      const peers = adapter.listPeers();
      expect(peers).toHaveLength(1);
      expect(peers[0].name).toBe('stefan');
      expect(peers[0].publicKey).toBe(PK_STEFAN);
    });
  });

  // ── Scenario 4: Group message awareness ────────────────────────
  describe('Scenario: Group message awareness', () => {
    it('includes otherRecipients for group messages (excluding self)', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      capturedHandler!(makeEnvelope({
        from: PK_ROOK,
        to: [PK_SELF, PK_ROOK, PK_CSG],
        payload: { text: 'group message' },
      }), PK_ROOK);

      const messages = await adapter.poll();
      expect(messages).toHaveLength(1);
      expect(messages[0].metadata?.otherRecipients).toEqual(['rook', 'csg']);
      vi.restoreAllMocks();
    });

    it('omits otherRecipients for direct messages', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      capturedHandler!(makeEnvelope({
        from: PK_ROOK,
        to: [PK_SELF],
        payload: { text: 'direct message' },
      }), PK_ROOK);

      const messages = await adapter.poll();
      expect(messages).toHaveLength(1);
      expect(messages[0].metadata?.otherRecipients).toBeUndefined();
      vi.restoreAllMocks();
    });
  });

  // ── Scenario 5: Outbound send to specific peers ────────────────
  describe('Scenario: Outbound send to specific peers', () => {
    it('sends to a specific peer via sendMessage when targeting one peer', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), {
        diagnosticMode: true,
        diagnosticPeers: ['stefan'],
      });
      await adapter.connect();

      await adapter.send({ text: 'hello stefan', targetPeers: ['stefan'] });

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          peerName: 'stefan',
          type: 'publish',
          payload: { text: 'hello stefan' },
        }),
      );
      vi.restoreAllMocks();
    });

    it('does not send to non-targeted peers', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      await adapter.send({ text: 'just for stefan', targetPeers: ['stefan'] });

      // Should only send to stefan, not rook or csg
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ peerName: 'stefan' }),
      );
      vi.restoreAllMocks();
    });

    it('does not send when text is empty', async () => {
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      await adapter.send({ text: '' });

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(mockSendToAll).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 6: Social cognition in tool design ────────────────
  describe('Scenario: Social cognition in tool design', () => {
    // This scenario verifies the SEND_MESSAGE tool definition includes
    // social cognition guidance. We import and check the definition.
    it('send_message tool description includes guidance to check peer models', async () => {
      const { SEND_MESSAGE } = await import('../internal-tools.js');

      expect(SEND_MESSAGE.description).toContain('peer model');
      expect(SEND_MESSAGE.description).toMatch(/consider/i);
      expect(SEND_MESSAGE.description).toContain('2-4 sentences');
      expect(SEND_MESSAGE.description).toMatch(/ask/i);
    });

    it('send_message tool requires "to" and "message" parameters', async () => {
      const { SEND_MESSAGE } = await import('../internal-tools.js');
      const schema = SEND_MESSAGE.parameters as Record<string, unknown>;

      expect(schema.required).toContain('to');
      expect(schema.required).toContain('message');
    });
  });

  // ── Contract: poll() batch size ────────────────────────────────
  describe('Contract: poll() drains up to POLL_BATCH_SIZE messages', () => {
    it('returns at most POLL_BATCH_SIZE (16) messages per call', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      // Queue 20 messages
      for (let i = 0; i < 20; i++) {
        capturedHandler!(makeEnvelope({
          id: `env-${i}`,
          from: PK_ROOK,
          payload: { text: `msg ${i}` },
        }), PK_ROOK);
      }

      const batch1 = await adapter.poll();
      expect(batch1).toHaveLength(POLL_BATCH_SIZE); // 16
      expect(batch1[0].text).toBe('msg 0'); // FIFO order

      const batch2 = await adapter.poll();
      expect(batch2).toHaveLength(4); // remaining
      expect(batch2[0].text).toBe('msg 16');
      vi.restoreAllMocks();
    });

    it('returns [] when disconnected', async () => {
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      // Not connected
      const messages = await adapter.poll();
      expect(messages).toEqual([]);
    });

    it('returns [] when queue is empty', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      const messages = await adapter.poll();
      expect(messages).toEqual([]);
      vi.restoreAllMocks();
    });
  });

  // ── Contract: listPeers() without diagnostic mode ──────────────
  describe('Contract: listPeers() without diagnostic mode', () => {
    it('returns all registered peers', () => {
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      const peers = adapter.listPeers();

      expect(peers).toHaveLength(3);
      const names = peers.map(p => p.name).sort();
      expect(names).toEqual(['csg', 'rook', 'stefan']);
    });
  });

  // ── Contract: RawInput metadata fields ─────────────────────────
  describe('Contract: RawInput metadata fields', () => {
    it('includes all required Agora-specific metadata fields', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const adapter = new AgoraAdapter(makeServiceConfig(), { diagnosticMode: false });
      await adapter.connect();

      capturedHandler!(makeEnvelope({
        id: 'env-meta-test',
        from: PK_ROOK,
        inReplyTo: 'env-previous',
        payload: { text: 'test metadata' },
      }), PK_ROOK);

      const messages = await adapter.poll();
      const meta = messages[0].metadata!;

      expect(meta.modality).toBe('text');
      expect(meta.source).toBe('agora');
      expect(meta.peerName).toBe('rook');
      expect(meta.peerPublicKey).toBe(PK_ROOK);
      expect(meta.envelopeId).toBe('env-meta-test');
      expect(meta.inReplyTo).toBe('env-previous');
      vi.restoreAllMocks();
    });
  });
});
