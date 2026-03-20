/**
 * AgoraAdapter — IEnvironmentAdapter for agent-to-agent communication
 *
 * Connects the conscious agent to the Agora coordination network
 * (https://github.com/rookdaemon/agora) for peer-to-peer messaging
 * with other agents.
 *
 * Security model: hard filter on peer registry. Only messages from
 * registered peers are accepted. Outbound messages only go to
 * registered peers. Unknown senders are silently dropped.
 *
 * Transport: uses agora's REST API via HTTP fetch, connecting to
 * a running agora relay or peer server.
 *
 * Configuration: reads from ~/.config/agora/config.json (standard
 * agora config location) or accepts injected config.
 */

import type { IEnvironmentAdapter } from './interfaces.js';
import type { AgentOutput, RawInput } from './types.js';

// ── Configuration ────────────────────────────────────────────

export interface AgoraPeer {
  /** Peer's public key (Ed25519, hex or base64). */
  publicKey: string;
  /** Human-readable name for logging. */
  name: string;
  /** Direct HTTP URL for the peer (e.g. http://localhost:9473). */
  url?: string;
}

export interface AgoraAdapterConfig {
  /** Adapter identifier surfaced in RawInput.adapterId. Default: 'agora'. */
  adapterId?: string;
  /** URL of the agora relay or REST API. */
  relayUrl: string;
  /** JWT token for REST API authentication (if relay requires it). */
  apiToken?: string;
  /** This agent's identity (public key for the relay). */
  agentPublicKey: string;
  /** Registered peers — only messages from these keys are accepted. */
  peers: AgoraPeer[];
  /** Poll interval in ms for checking new messages. Default: 5000. */
  pollIntervalMs?: number;
}

// ── AgoraAdapter ─────────────────────────────────────────────

export class AgoraAdapter implements IEnvironmentAdapter {
  readonly id: string;

  private _connected = false;
  private _config: AgoraAdapterConfig;
  private _peerKeys: Set<string>;
  private _peerNameMap: Map<string, string>;
  private _messageQueue: RawInput[] = [];
  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: AgoraAdapterConfig) {
    this.id = config.adapterId ?? 'agora';
    this._config = config;

    // Build peer registry for fast lookup
    this._peerKeys = new Set(config.peers.map(p => p.publicKey));
    this._peerNameMap = new Map(config.peers.map(p => [p.publicKey, p.name]));
  }

  // ── IEnvironmentAdapter ──────────────────────────────────

  async connect(): Promise<void> {
    if (this._connected) return;

    // Register with the relay
    try {
      const res = await fetch(`${this._config.relayUrl}/v1/register`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ publicKey: this._config.agentPublicKey }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[AgoraAdapter] Registration warning: ${res.status} ${body}`);
      }
    } catch (err) {
      console.warn(`[AgoraAdapter] Could not register with relay: ${err}`);
      // Continue anyway — direct messaging may still work
    }

    // Start polling for messages
    const interval = this._config.pollIntervalMs ?? 5000;
    this._pollTimer = setInterval(() => this._fetchMessages(), interval);

    this._connected = true;
    console.info(
      `[AgoraAdapter:${this.id}] connected to ${this._config.relayUrl} ` +
      `(${this._config.peers.length} registered peers, polling every ${interval}ms)`,
    );
  }

  async disconnect(): Promise<void> {
    if (!this._connected) return;
    this._connected = false;

    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    // Notify relay of disconnect
    try {
      await fetch(`${this._config.relayUrl}/v1/disconnect`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ publicKey: this._config.agentPublicKey }),
      });
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
    return batch;
  }

  async send(output: AgentOutput): Promise<void> {
    if (!this._connected || !output.text) return;

    // Send to all registered peers
    for (const peer of this._config.peers) {
      try {
        if (peer.url) {
          // Direct HTTP to peer
          await fetch(`${peer.url}/agent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: this._config.agentPublicKey,
              to: [peer.publicKey],
              payload: { type: 'text', content: output.text },
            }),
          });
        } else {
          // Via relay
          await fetch(`${this._config.relayUrl}/v1/send`, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify({
              to: peer.publicKey,
              payload: { type: 'text', content: output.text },
            }),
          });
        }
      } catch (err) {
        console.warn(`[AgoraAdapter] Failed to send to ${peer.name}: ${err}`);
      }
    }
  }

  // ── Peer management ────────────────────────────────────────

  /** Add a peer to the registry at runtime. */
  addPeer(peer: AgoraPeer): void {
    this._peerKeys.add(peer.publicKey);
    this._peerNameMap.set(peer.publicKey, peer.name);
    this._config.peers.push(peer);
    console.info(`[AgoraAdapter] Peer added: ${peer.name} (${peer.publicKey.slice(0, 12)}...)`);
  }

  /** Remove a peer from the registry. */
  removePeer(publicKey: string): void {
    this._peerKeys.delete(publicKey);
    this._peerNameMap.delete(publicKey);
    this._config.peers = this._config.peers.filter(p => p.publicKey !== publicKey);
  }

  /** Get the list of registered peers. */
  getPeers(): readonly AgoraPeer[] {
    return this._config.peers;
  }

  // ── Private ────────────────────────────────────────────────

  private _headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this._config.apiToken) {
      h['Authorization'] = `Bearer ${this._config.apiToken}`;
    }
    return h;
  }

  private async _fetchMessages(): Promise<void> {
    try {
      const res = await fetch(`${this._config.relayUrl}/v1/messages`, {
        method: 'GET',
        headers: this._headers(),
      });

      if (!res.ok) return;

      const data = await res.json() as Array<{
        from?: string;
        payload?: { type?: string; content?: string };
        timestamp?: number;
      }>;

      if (!Array.isArray(data)) return;

      for (const msg of data) {
        const senderKey = msg.from;
        if (!senderKey) continue;

        // Hard filter: only accept messages from registered peers
        if (!this._peerKeys.has(senderKey)) {
          continue; // silently drop
        }

        const text = msg.payload?.content;
        if (typeof text !== 'string' || text.length === 0) continue;

        const peerName = this._peerNameMap.get(senderKey) ?? senderKey.slice(0, 12);

        this._messageQueue.push({
          adapterId: this.id,
          text,
          receivedAt: msg.timestamp ?? Date.now(),
          metadata: {
            modality: 'text',
            source: 'agora',
            peerName,
            peerPublicKey: senderKey,
          },
        });
      }
    } catch {
      // Polling failure — silently retry next interval
    }
  }
}
