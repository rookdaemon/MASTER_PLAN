/**
 * Tests for PeerChatLog — covers all 5 behavioral specs from card 0.3.1.5.14
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { PeerChatLog, type ChatEntry } from '../peer-chat-log.js';

describe('PeerChatLog', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'peer-chat-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Scenario: Message persistence across restart ──────────────
  describe('Scenario: Message persistence across restart', () => {
    it('persists sent messages and recovers them after re-instantiation', () => {
      const ts = Date.now();
      const log1 = new PeerChatLog(tmpDir);
      log1.append({ role: 'self', peer: 'rook', text: 'Hello rook', timestamp: ts });

      // Simulate restart by creating a new instance pointing at the same dir
      const log2 = new PeerChatLog(tmpDir);
      const entries = log2.recent('rook', 10);

      expect(entries).toHaveLength(1);
      expect(entries[0].role).toBe('self');
      expect(entries[0].peer).toBe('rook');
      expect(entries[0].text).toBe('Hello rook');
      expect(entries[0].timestamp).toBe(ts);
    });

    it('persists received messages and recovers them after re-instantiation', () => {
      const ts = Date.now();
      const log1 = new PeerChatLog(tmpDir);
      log1.append({ role: 'peer', peer: 'rook', text: 'Hi from rook', timestamp: ts });

      const log2 = new PeerChatLog(tmpDir);
      const entries = log2.recent('rook', 10);

      expect(entries).toHaveLength(1);
      expect(entries[0].role).toBe('peer');
      expect(entries[0].text).toBe('Hi from rook');
    });
  });

  // ── Scenario: Reply prompt includes conversation history ──────
  describe('Scenario: Reply prompt includes conversation history', () => {
    it('formats 5 messages with [HH:MM:SS] who: text, using "me" for self', () => {
      const log = new PeerChatLog(tmpDir);
      const baseTs = new Date('2026-03-31T14:30:00Z').getTime();

      log.append({ role: 'self', peer: 'csg', text: 'Message 1', timestamp: baseTs });
      log.append({ role: 'peer', peer: 'csg', text: 'Message 2', timestamp: baseTs + 1000 });
      log.append({ role: 'self', peer: 'csg', text: 'Message 3', timestamp: baseTs + 2000 });
      log.append({ role: 'peer', peer: 'csg', text: 'Message 4', timestamp: baseTs + 3000 });
      log.append({ role: 'self', peer: 'csg', text: 'Message 5', timestamp: baseTs + 4000 });

      const result = log.formatForPrompt('csg', 5);
      expect(result).not.toBeNull();

      const lines = result!.split('\n');
      expect(lines).toHaveLength(5);

      // Self messages labeled "me"
      expect(lines[0]).toMatch(/^\[14:30:00\] me: Message 1$/);
      // Peer messages labeled with peer name
      expect(lines[1]).toMatch(/^\[14:30:01\] csg: Message 2$/);
      expect(lines[2]).toMatch(/^\[14:30:02\] me: Message 3$/);
      expect(lines[3]).toMatch(/^\[14:30:03\] csg: Message 4$/);
      expect(lines[4]).toMatch(/^\[14:30:04\] me: Message 5$/);
    });
  });

  // ── Scenario: Cross-peer isolation ────────────────────────────
  describe('Scenario: Cross-peer isolation', () => {
    it('returns only the requested peer\'s messages', () => {
      const log = new PeerChatLog(tmpDir);
      const ts = Date.now();

      log.append({ role: 'self', peer: 'rook', text: 'To rook', timestamp: ts });
      log.append({ role: 'peer', peer: 'rook', text: 'From rook', timestamp: ts + 1 });
      log.append({ role: 'self', peer: 'csg', text: 'To csg', timestamp: ts + 2 });
      log.append({ role: 'peer', peer: 'csg', text: 'From csg', timestamp: ts + 3 });

      const rookEntries = log.recent('rook', 20);
      expect(rookEntries).toHaveLength(2);
      expect(rookEntries.every(e => e.peer === 'rook')).toBe(true);
      // No csg messages
      expect(rookEntries.some(e => e.peer === 'csg')).toBe(false);
    });

    it('stores each peer in a separate file', () => {
      const log = new PeerChatLog(tmpDir);
      log.append({ role: 'self', peer: 'rook', text: 'hi', timestamp: Date.now() });
      log.append({ role: 'self', peer: 'csg', text: 'hi', timestamp: Date.now() });

      expect(existsSync(join(tmpDir, 'chat', 'rook.jsonl'))).toBe(true);
      expect(existsSync(join(tmpDir, 'chat', 'csg.jsonl'))).toBe(true);

      // Verify no cross-peer data in rook's file
      const rookContent = readFileSync(join(tmpDir, 'chat', 'rook.jsonl'), 'utf-8');
      expect(rookContent).not.toContain('csg');
    });
  });

  // ── Scenario: New peer with no history ────────────────────────
  describe('Scenario: New peer with no history', () => {
    it('recent() returns empty array for unknown peer', () => {
      const log = new PeerChatLog(tmpDir);
      expect(log.recent('unknown_peer', 10)).toEqual([]);
    });

    it('formatForPrompt() returns null for unknown peer', () => {
      const log = new PeerChatLog(tmpDir);
      expect(log.formatForPrompt('unknown_peer')).toBeNull();
    });
  });

  // ── Scenario: All-peer summary for system prompt ──────────────
  describe('Scenario: All-peer summary for system prompt', () => {
    it('returns formatted summary with sections per peer', () => {
      const log = new PeerChatLog(tmpDir);
      const ts = Date.now();

      // Create conversations with 3 peers
      for (const peer of ['alpha', 'beta', 'gamma']) {
        for (let i = 0; i < 5; i++) {
          log.append({
            role: i % 2 === 0 ? 'self' : 'peer',
            peer,
            text: `${peer} message ${i + 1}`,
            timestamp: ts + i * 1000,
          });
        }
      }

      const summary = log.allPeerSummaries(5);
      expect(summary).not.toBeNull();

      // Each peer gets a section header
      expect(summary).toContain('### alpha');
      expect(summary).toContain('### beta');
      expect(summary).toContain('### gamma');

      // Messages have timestamps
      for (const peer of ['alpha', 'beta', 'gamma']) {
        for (let i = 0; i < 5; i++) {
          expect(summary).toContain(`${peer} message ${i + 1}`);
        }
      }
    });

    it('returns null when no peers have history', () => {
      const log = new PeerChatLog(tmpDir);
      expect(log.allPeerSummaries(5)).toBeNull();
    });
  });

  // ── Contract invariants ───────────────────────────────────────
  describe('Contract invariants', () => {
    it('silently skips malformed JSONL lines', () => {
      const log = new PeerChatLog(tmpDir);
      const chatDir = join(tmpDir, 'chat');
      // Write some valid and invalid lines
      const validEntry: ChatEntry = { role: 'self', peer: 'test', text: 'valid', timestamp: Date.now() };
      writeFileSync(
        join(chatDir, 'test.jsonl'),
        'not json at all\n' +
        JSON.stringify(validEntry) + '\n' +
        '{broken json\n'
      );

      const entries = log.recent('test', 10);
      expect(entries).toHaveLength(1);
      expect(entries[0].text).toBe('valid');
    });

    it('sanitizes peer names for filesystem safety', () => {
      const log = new PeerChatLog(tmpDir);
      log.append({ role: 'self', peer: 'peer/../etc/passwd', text: 'evil', timestamp: Date.now() });

      // Should create a sanitized filename, not a path traversal
      const chatDir = join(tmpDir, 'chat');
      expect(existsSync(join(chatDir, 'peer____etc_passwd.jsonl'))).toBe(true);
    });

    it('listPeers returns peer names from filenames', () => {
      const log = new PeerChatLog(tmpDir);
      log.append({ role: 'self', peer: 'alice', text: 'hi', timestamp: Date.now() });
      log.append({ role: 'self', peer: 'bob', text: 'hi', timestamp: Date.now() });

      const peers = log.listPeers();
      expect(peers).toContain('alice');
      expect(peers).toContain('bob');
      expect(peers).toHaveLength(2);
    });

    it('timestamps are epoch-ms numbers', () => {
      const log = new PeerChatLog(tmpDir);
      const ts = 1711900000000; // epoch-ms
      log.append({ role: 'self', peer: 'test', text: 'hi', timestamp: ts });

      const entries = log.recent('test', 1);
      expect(typeof entries[0].timestamp).toBe('number');
      expect(entries[0].timestamp).toBe(ts);
    });

    it('append() guards against empty peer name', () => {
      const log = new PeerChatLog(tmpDir);
      expect(() => log.append({ role: 'self', peer: '', text: 'hello', timestamp: Date.now() }))
        .toThrow('non-empty peer');
    });

    it('append() guards against empty text', () => {
      const log = new PeerChatLog(tmpDir);
      expect(() => log.append({ role: 'self', peer: 'test', text: '', timestamp: Date.now() }))
        .toThrow('non-empty');
    });

    it('recent() returns last N entries, not first N', () => {
      const log = new PeerChatLog(tmpDir);
      for (let i = 0; i < 10; i++) {
        log.append({ role: 'self', peer: 'test', text: `msg ${i}`, timestamp: Date.now() + i });
      }

      const last3 = log.recent('test', 3);
      expect(last3).toHaveLength(3);
      expect(last3[0].text).toBe('msg 7');
      expect(last3[1].text).toBe('msg 8');
      expect(last3[2].text).toBe('msg 9');
    });
  });
});
