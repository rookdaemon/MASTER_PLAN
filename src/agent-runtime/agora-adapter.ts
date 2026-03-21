/**
 * AgoraAdapter — IEnvironmentAdapter for agent-to-agent communication
 *
 * Connects the conscious agent to the Agora coordination network
 * (https://github.com/rookdaemon/agora) for peer-to-peer messaging
 * with other agents.
 *
 * Uses the @rookdaemon/agora client library (AgoraService + RelayClient)
 * for proper WebSocket relay transport and signed envelope handling.
 *
 * Security model: hard filter on peer registry. Only messages from
 * registered peers are accepted. Unknown senders are silently dropped.
 *
 * Configuration: reads from ~/.config/agora/config.json (standard
 * agora config location) or accepts injected config.
 */

import type { IEnvironmentAdapter } from './interfaces.js';
import type { AgentOutput, RawInput } from './types.js';
import {
  type AgoraServiceConfig,
  type Envelope,
  AgoraService,
} from '@rookdaemon/agora';

// ── Configuration ────────────────────────────────────────────

export interface AgoraAdapterConfig {
  /** Adapter identifier surfaced in RawInput.adapterId. Default: 'agora'. */
  adapterId?: string;
  /** Path to agora config file. Defaults to ~/.config/agora/config.json. */
  configPath?: string;
}

// ── AgoraAdapter ─────────────────────────────────────────────

export class AgoraAdapter implements IEnvironmentAdapter {
  readonly id: string;

  private _connected = false;
  private _service: AgoraService;
  private _serviceConfig: AgoraServiceConfig;
  private _messageQueue: RawInput[] = [];
  private _peerKeys: Set<string>;

  constructor(serviceConfig: AgoraServiceConfig, config?: AgoraAdapterConfig) {
    this.id = config?.adapterId ?? 'agora';
    this._serviceConfig = serviceConfig;

    // Build peer registry for filtering
    this._peerKeys = new Set(serviceConfig.peers.keys());

    // Create AgoraService with inbound message handler
    this._service = new AgoraService(
      serviceConfig,
      (envelope: Envelope, from: string) => this._onMessage(envelope, from),
    );
  }

  // ── IEnvironmentAdapter ──────────────────────────────────

  async connect(): Promise<void> {
    if (this._connected) return;

    const relayUrl = this._serviceConfig.relay?.url;
    if (!relayUrl) {
      console.warn('[AgoraAdapter] No relay URL configured — skipping relay connection');
      return;
    }

    try {
      console.info(`[AgoraAdapter] Connecting to relay ${relayUrl}...`);
      await this._service.connectRelay(relayUrl);
      this._connected = true;
      console.info(
        `[AgoraAdapter:${this.id}] connected to ${relayUrl} ` +
        `(${this._serviceConfig.peers.size} registered peers: ${[...this._serviceConfig.peers.values()].map(p => p.name).join(', ')})`,
      );
    } catch (err) {
      console.warn(`[AgoraAdapter] Failed to connect to relay: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this._connected) return;
    this._connected = false;

    try {
      await this._service.disconnectRelay();
    } catch {
      // Best effort
    }

    console.info(`[AgoraAdapter:${this.id}] disconnected`);
  }

  isConnected(): boolean {
    return this._connected;
  }

  async poll(): Promise<RawInput[]> {
    if (!this._connected || this._messageQueue.length === 0) return [];
    const batch = this._messageQueue.splice(0, 16);
    console.info(`[AgoraAdapter] poll() returning ${batch.length} messages`);
    return batch;
  }

  async send(output: AgentOutput): Promise<void> {
    if (!this._connected || !output.text) return;

    // Determine which peers to send to
    const allPeers = [...this._serviceConfig.peers.entries()];
    const targets = output.targetPeers
      ? allPeers.filter(([, cfg]) => output.targetPeers!.includes(cfg.name ?? ''))
      : allPeers;

    for (const [publicKey, peerConfig] of targets) {
      const name = peerConfig.name ?? publicKey.slice(0, 12);
      try {
        await this._service.sendMessage({
          peerName: name,
          type: 'publish',
          payload: { text: output.text },
        });
      } catch (err) {
        console.warn(`[AgoraAdapter] Failed to send to ${name}: ${err}`);
      }
    }
  }

  /** List known peers with connection info. */
  listPeers(): Array<{ name: string; publicKey: string }> {
    return [...this._serviceConfig.peers.entries()].map(([key, cfg]) => ({
      name: cfg.name ?? key.slice(0, 12),
      publicKey: key,
    }));
  }

  // ── Private ────────────────────────────────────────────────

  private _onMessage(envelope: Envelope, from: string): void {
    console.info(`[AgoraAdapter] Relay message received from ${from.slice(0, 20)}... type=${envelope.type}`);

    // Hard filter: only accept messages from registered peers
    if (!this._peerKeys.has(from)) {
      console.warn(`[AgoraAdapter] Dropped message from unknown peer: ${from.slice(0, 30)}... (registered: ${[...this._peerKeys].map(k => k.slice(0, 20)).join(', ')})`);
      return;
    }

    const p = envelope.payload as Record<string, unknown> | string | undefined;
    const text = typeof p === 'string'
      ? p
      : (p?.text ?? p?.content) as string | undefined;

    if (typeof text !== 'string' || text.length === 0) {
      console.warn(`[AgoraAdapter] Dropped message with no text content. Payload: ${JSON.stringify(envelope.payload).slice(0, 200)}`);
      return;
    }

    const peerConfig = this._serviceConfig.peers.get(from);
    const peerName = peerConfig?.name ?? from.slice(0, 12);

    this._messageQueue.push({
      adapterId: this.id,
      text,
      receivedAt: envelope.timestamp ?? Date.now(),
      metadata: {
        modality: 'text',
        source: 'agora',
        peerName,
        peerPublicKey: from,
        envelopeId: envelope.id,
        inReplyTo: envelope.inReplyTo,
      },
    });
    console.info(`[AgoraAdapter] Message queued from ${peerName}: "${text.slice(0, 80)}" (queue depth: ${this._messageQueue.length})`);
  }
}
