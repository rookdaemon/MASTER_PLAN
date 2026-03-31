/**
 * Per-Peer Chat Log — Persistent Agora conversation history
 *
 * Stores sent/received messages per peer as JSONL files in
 * <workspacePath>/chat/<peerName>.jsonl
 *
 * Each line is a JSON object: { role, text, timestamp, peer }
 * The log survives restarts and provides context for ongoing conversations.
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ChatEntry {
  role: 'self' | 'peer';
  peer: string;
  text: string;
  timestamp: number;
}

export class PeerChatLog {
  private readonly _chatDir: string;

  constructor(workspacePath: string) {
    this._chatDir = join(workspacePath, 'chat');
    if (!existsSync(this._chatDir)) {
      mkdirSync(this._chatDir, { recursive: true });
    }
  }

  /** Append a message to the peer's chat log. */
  append(entry: ChatEntry): void {
    if (!entry.peer) throw new Error('ChatEntry requires non-empty peer');
    if (!entry.text) throw new Error('ChatEntry requires non-empty text');
    const file = this._peerFile(entry.peer);
    appendFileSync(file, JSON.stringify(entry) + '\n');
  }

  /** Get the last N messages with a specific peer. */
  recent(peer: string, count = 20): ChatEntry[] {
    const file = this._peerFile(peer);
    if (!existsSync(file)) return [];

    const lines = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    const entries: ChatEntry[] = [];
    for (const line of lines.slice(-count)) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
    return entries;
  }

  /** Format recent history as a string for LLM context injection. */
  formatForPrompt(peer: string, count = 10): string | null {
    const entries = this.recent(peer, count);
    if (entries.length === 0) return null;

    return entries.map(e => {
      const who = e.role === 'self' ? 'me' : e.peer;
      const time = new Date(e.timestamp).toISOString().slice(11, 19);
      return `[${time}] ${who}: ${e.text.slice(0, 300)}`;
    }).join('\n');
  }

  /**
   * Build a summary of all peer conversations for system prompt injection.
   * Shows last few messages per peer so the agent opens every session with context.
   */
  allPeerSummaries(messagesPerPeer = 5): string | null {
    const peers = this.listPeers();
    if (peers.length === 0) return null;

    const parts: string[] = [];
    for (const peer of peers) {
      const entries = this.recent(peer, messagesPerPeer);
      if (entries.length === 0) continue;
      parts.push(`### ${peer}`);
      for (const e of entries) {
        const who = e.role === 'self' ? 'me' : e.peer;
        const time = new Date(e.timestamp).toISOString().slice(0, 19).replace('T', ' ');
        parts.push(`  [${time}] ${who}: ${e.text.slice(0, 200)}`);
      }
      parts.push('');
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  /** List all peers that have chat history. */
  listPeers(): string[] {
    if (!existsSync(this._chatDir)) return [];
    return readdirSync(this._chatDir)
      .filter((f: string) => f.endsWith('.jsonl'))
      .map((f: string) => f.replace(/\.jsonl$/, ''));
  }

  private _peerFile(peer: string): string {
    // Sanitize peer name for filesystem
    const safe = peer.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this._chatDir, `${safe}.jsonl`);
  }
}
