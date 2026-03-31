import { describe, it, expect, vi } from 'vitest';
import {
  InnerMonologueLogger,
  NoopInnerMonologueLogger,
  type MonologueDeps,
  type MonologueEntry,
  type MonologueListener,
} from '../inner-monologue.js';

function mockDeps(): { deps: MonologueDeps; getContent: () => string } {
  const state = { content: '' };
  const deps: MonologueDeps = {
    appendFileSync: (_p, data) => { state.content += data; },
    readFileSync: () => state.content,
    writeFileSync: (_p, data) => { state.content = data; },
    existsSync: () => true,
    mkdirSync: () => {},
  };
  return { deps, getContent: () => state.content };
}

// ── Behavioral Spec: Drive activation logged with formatting ─────────

describe('InnerMonologueLogger', () => {
  describe('Scenario: Drive activation logged with formatting', () => {
    it('writes formatted drive activation header with cycle number', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      logger.driveActivation(42, [
        { sourceDrive: 'curiosity', description: 'explore plan cards' },
      ]);
      const content = getContent();
      expect(content).toContain('DRIVE ACTIVATION');
      expect(content).toContain('Cycle 42');
      expect(content).toContain('═'); // box-drawing characters
    });

    it('lists activated drives with source and description', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      logger.driveActivation(42, [
        { sourceDrive: 'curiosity', description: 'explore plan cards' },
        { sourceDrive: 'self-preservation', description: 'check system health' },
      ]);
      const content = getContent();
      expect(content).toContain('[curiosity]');
      expect(content).toContain('explore plan cards');
      expect(content).toContain('[self-preservation]');
      expect(content).toContain('check system health');
    });

    it('emits drive_activation MonologueEntry to all listeners', () => {
      const { deps } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      const received: MonologueEntry[] = [];
      logger.addListener((entry) => received.push(entry));
      logger.driveActivation(42, [
        { sourceDrive: 'curiosity', description: 'explore plan cards' },
      ]);
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('drive_activation');
      expect(received[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
      expect(received[0].metadata).toMatchObject({ cycle: 42 });
    });
  });

  // ── Behavioral Spec: Tool call and result captured ───────────────

  describe('Scenario: Tool call and result captured', () => {
    it('logs tool name and input JSON via toolCall()', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      logger.toolCall('read_file', { path: 'plan/root.md' });
      const content = getContent();
      expect(content).toContain('TOOL CALL: read_file');
      expect(content).toContain('plan/root.md');
    });

    it('logs result text with success prefix via toolResult()', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      logger.toolResult('read_file', 'file contents here', false);
      const content = getContent();
      expect(content).toContain('✓ TOOL RESULT: read_file');
      expect(content).toContain('file contents here');
    });

    it('logs error result with error prefix', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      logger.toolResult('read_file', 'file not found', true);
      const content = getContent();
      expect(content).toContain('✗ TOOL ERROR: read_file');
      expect(content).toContain('file not found');
    });

    it('emits both tool_call and tool_result entries to listeners', () => {
      const { deps } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      const received: MonologueEntry[] = [];
      logger.addListener((entry) => received.push(entry));
      logger.toolCall('read_file', { path: 'plan/root.md' });
      logger.toolResult('read_file', 'file contents', false);
      expect(received).toHaveLength(2);
      expect(received[0].type).toBe('tool_call');
      expect(received[1].type).toBe('tool_result');
    });
  });

  // ── Behavioral Spec: FIFO eviction at capacity ────────────────────

  describe('Scenario: FIFO eviction at capacity', () => {
    it('trims to MAX_LINES (5000) when exceeded', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);

      // Pre-fill with 4990 lines
      const initial = Array.from({ length: 4990 }, (_, i) => `line-${i}`).join('\n') + '\n';
      deps.writeFileSync('test-monologue.txt', initial);
      // Overwrite the mock so readFileSync returns current content
      const state = { content: initial };
      deps.appendFileSync = (_p, data) => { state.content += data; };
      deps.readFileSync = () => state.content;
      deps.writeFileSync = (_p, data) => { state.content = data; };

      // driveActivation writes multiple lines (header + drives)
      // Need enough drives to produce >10 new line-elements so total exceeds 5000
      logger.driveActivation(1, [
        { sourceDrive: 'curiosity', description: 'explore' },
        { sourceDrive: 'social', description: 'check peers' },
        { sourceDrive: 'self-preservation', description: 'check health' },
        { sourceDrive: 'creativity', description: 'generate ideas' },
        { sourceDrive: 'duty', description: 'review tasks' },
        { sourceDrive: 'growth', description: 'learn new skills' },
        { sourceDrive: 'empathy', description: 'check on peers' },
      ]);

      const content = state.content;
      const lines = content.split('\n');
      // Should be capped at 5000 or fewer
      expect(lines.length).toBeLessThanOrEqual(5001); // 5000 lines + potential trailing newline
      // Oldest lines should be trimmed
      expect(content).not.toContain('line-0\n');
    });
  });

  // ── Behavioral Spec: Listener error isolation ──────────────────────

  describe('Scenario: Listener error isolation', () => {
    it('still writes to log file when a listener throws', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      logger.addListener(() => { throw new Error('listener failure'); });
      logger.assistantText('hello world');
      const content = getContent();
      expect(content).toContain('hello world');
    });

    it('delivers to other listeners when one throws', () => {
      const { deps } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      const received: MonologueEntry[] = [];
      logger.addListener(() => { throw new Error('bad listener'); });
      logger.addListener((entry) => received.push(entry));
      logger.assistantText('hello world');
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('assistant_text');
    });

    it('does not propagate exception to caller', () => {
      const { deps } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      logger.addListener(() => { throw new Error('boom'); });
      // Should not throw
      expect(() => logger.assistantText('safe')).not.toThrow();
    });
  });

  // ── Behavioral Spec: Summary includes model ID ─────────────────────

  describe('Scenario: Summary includes model ID', () => {
    it('includes iteration count, tokens, and model ID in summary line', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      logger.summary(3, 15000, 2000, 'claude-opus-4-6');
      const content = getContent();
      expect(content).toContain('3 iteration(s), 15000 prompt tokens, 2000 completion tokens [claude-opus-4-6]');
    });

    it('omits model ID suffix when not provided', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      logger.summary(1, 5000, 500);
      const content = getContent();
      expect(content).toContain('1 iteration(s), 5000 prompt tokens, 500 completion tokens');
      expect(content).not.toContain('[');
    });

    it('emits summary entry to listeners', () => {
      const { deps } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      const received: MonologueEntry[] = [];
      logger.addListener((entry) => received.push(entry));
      logger.summary(3, 15000, 2000, 'claude-opus-4-6');
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('summary');
      expect(received[0].content).toContain('[claude-opus-4-6]');
    });
  });

  // ── Contract: Listener management ──────────────────────────────────

  describe('Listener management', () => {
    it('addListener registers callback that receives entries', () => {
      const { deps } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      const received: MonologueEntry[] = [];
      logger.addListener((entry) => received.push(entry));
      logger.error('test');
      expect(received).toHaveLength(1);
    });

    it('removeListener stops delivery', () => {
      const { deps } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      const received: MonologueEntry[] = [];
      const listener: MonologueListener = (entry) => received.push(entry);
      logger.addListener(listener);
      logger.error('first');
      logger.removeListener(listener);
      logger.error('second');
      expect(received).toHaveLength(1);
      expect(received[0].content).toBe('first');
    });
  });

  // ── Contract: Entry timestamps use ISO 8601 ────────────────────────

  describe('Timestamp format', () => {
    it('all emitted entries use ISO 8601 timestamps', () => {
      const { deps } = mockDeps();
      const logger = new InnerMonologueLogger('test-monologue.txt', deps);
      const received: MonologueEntry[] = [];
      logger.addListener((entry) => received.push(entry));

      logger.systemPrompt('test');
      logger.userMessage('test');
      logger.assistantText('test');
      logger.toolCall('t', {});
      logger.toolResult('t', 'ok', false);
      logger.finalOutput('done');
      logger.summary(1, 100, 50);
      logger.error('err');

      for (const entry of received) {
        expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
    });
  });

  // ── Contract: _ensureDir creates parent directory on first write ────

  describe('Directory creation', () => {
    it('creates parent directory on first write only', () => {
      let mkdirCount = 0;
      const deps: MonologueDeps = {
        appendFileSync: () => {},
        readFileSync: () => '',
        writeFileSync: () => {},
        existsSync: () => false,
        mkdirSync: () => { mkdirCount++; },
      };
      const logger = new InnerMonologueLogger('/some/deep/path/monologue.txt', deps);
      logger.error('first write');
      logger.error('second write');
      // Should only create directory once (on first write)
      expect(mkdirCount).toBe(1);
    });
  });

  // ── Contract: log file path exposed ────────────────────────────────

  describe('logFile getter', () => {
    it('exposes the configured log file path', () => {
      const { deps } = mockDeps();
      const logger = new InnerMonologueLogger('/tmp/agent/inner-monologue.txt', deps);
      expect(logger.logFile).toBe('/tmp/agent/inner-monologue.txt');
    });
  });

  // ── All entry types ────────────────────────────────────────────────

  describe('All entry types write to log', () => {
    it('systemPrompt writes formatted block', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test.txt', deps);
      logger.systemPrompt('You are an agent.');
      expect(getContent()).toContain('SYSTEM PROMPT');
      expect(getContent()).toContain('You are an agent.');
    });

    it('userMessage writes formatted block', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test.txt', deps);
      logger.userMessage('Check the plan.');
      expect(getContent()).toContain('INTERNAL PROMPT');
      expect(getContent()).toContain('Check the plan.');
    });

    it('assistantText writes formatted block', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test.txt', deps);
      logger.assistantText('I will check the plan now.');
      expect(getContent()).toContain('LLM RESPONSE');
      expect(getContent()).toContain('I will check the plan now.');
    });

    it('finalOutput writes text or null message', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test.txt', deps);
      logger.finalOutput('result text');
      expect(getContent()).toContain('FINAL OUTPUT');
      expect(getContent()).toContain('result text');
    });

    it('finalOutput(null) writes internal reflection notice', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test.txt', deps);
      logger.finalOutput(null);
      expect(getContent()).toContain('internal reflection only');
    });

    it('error writes error message', () => {
      const { deps, getContent } = mockDeps();
      const logger = new InnerMonologueLogger('test.txt', deps);
      logger.error('something broke');
      expect(getContent()).toContain('ERROR: something broke');
    });
  });
});

// ── Contract: NoopInnerMonologueLogger produces no disk I/O ──────────

describe('NoopInnerMonologueLogger', () => {
  it('does not throw on any operation', () => {
    const logger = new NoopInnerMonologueLogger();
    logger.driveActivation(1, [{ sourceDrive: 'test', description: 'noop' }]);
    logger.systemPrompt('test');
    logger.userMessage('test');
    logger.assistantText('test');
    logger.toolCall('t', {});
    logger.toolResult('t', 'ok', false);
    logger.finalOutput('done');
    logger.summary(1, 100, 50);
    logger.error('err');
    // No assertions — must not throw
  });

  it('still supports listeners despite no file I/O', () => {
    const logger = new NoopInnerMonologueLogger();
    const received: MonologueEntry[] = [];
    logger.addListener((entry) => received.push(entry));
    logger.assistantText('hello');
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('assistant_text');
  });
});
