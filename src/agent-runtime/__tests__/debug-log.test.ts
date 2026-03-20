import { describe, it, expect } from 'vitest';
import { DebugLogger, NoopDebugLogger, type DebugLogDeps } from '../debug-log.js';

function mockDeps(): { deps: DebugLogDeps; getContent: () => string } {
  const state = { content: '' };
  const deps: DebugLogDeps = {
    appendFileSync: (_p, data) => { state.content += data; },
    readFileSync: () => state.content,
    writeFileSync: (_p, data) => { state.content = data; },
    existsSync: () => true,
    mkdirSync: () => {},
  };
  return { deps, getContent: () => state.content };
}

describe('DebugLogger', () => {
  it('writes a banner with agent id and start mode', () => {
    const { deps, getContent } = mockDeps();
    const logger = new DebugLogger('test.log', deps);
    logger.banner('agent-0', false);
    const content = getContent();
    expect(content).toContain('agent-0');
    expect(content).toContain('COLD start (newborn)');
    expect(content).toContain('MASTER_PLAN');
  });

  it('writes warm start banner', () => {
    const { deps, getContent } = mockDeps();
    const logger = new DebugLogger('test.log', deps);
    logger.banner('agent-1', true);
    expect(getContent()).toContain('WARM start');
  });

  it('logs timestamped categorized entries', () => {
    const { deps, getContent } = mockDeps();
    const logger = new DebugLogger('test.log', deps);
    logger.banner('a', false);
    logger.log('lifecycle', 'test event');
    const content = getContent();
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
    expect(content).toContain('[LIFECYCLE');
    expect(content).toContain('test event');
  });

  it('includes JSON data when provided', () => {
    const { deps, getContent } = mockDeps();
    const logger = new DebugLogger('test.log', deps);
    logger.banner('a', false);
    logger.log('state', 'snapshot', { valence: 0.5, arousal: 0.3 });
    const content = getContent();
    expect(content).toContain('"valence":0.5');
    expect(content).toContain('"arousal":0.3');
  });

  it('logs phase start and end with timing', () => {
    const { deps, getContent } = mockDeps();
    const logger = new DebugLogger('test.log', deps);
    logger.banner('a', false);
    logger.phaseStart('perceive', 0);
    logger.phaseEnd('perceive', 0, 1.5);
    const content = getContent();
    expect(content).toContain('PHASE PERCEIVE START');
    expect(content).toContain('PHASE PERCEIVE END (1.5ms)');
  });

  it('logs tick boundaries', () => {
    const { deps, getContent } = mockDeps();
    const logger = new DebugLogger('test.log', deps);
    logger.banner('a', false);
    logger.tickStart(42);
    logger.tickEnd(42, 3.2, true);
    const content = getContent();
    expect(content).toContain('Tick 42');
    expect(content).toContain('3.2ms');
    expect(content).toContain('intact=true');
  });

  it('logs errors with message and stack', () => {
    const { deps, getContent } = mockDeps();
    const logger = new DebugLogger('test.log', deps);
    logger.banner('a', false);
    logger.error('something broke', new Error('test failure'));
    const content = getContent();
    expect(content).toContain('something broke');
    expect(content).toContain('test failure');
    expect(content).toContain('[ERROR');
  });

  it('caps log file at MAX_LINES (2000)', () => {
    const { deps, getContent } = mockDeps();
    const logger = new DebugLogger('test.log', deps);
    logger.banner('a', false);
    for (let i = 0; i < 2200; i++) {
      logger.log('tick', `line ${i}`);
    }
    const content = getContent();
    const lines = content.split('\n').filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(2000);
    // Most recent lines are kept
    expect(content).toContain('line 2199');
    expect(content).not.toContain('line 0\n');
  });

  it('exposes the log file path', () => {
    const { deps } = mockDeps();
    const logger = new DebugLogger('/tmp/agent/debug.log', deps);
    expect(logger.logFile).toBe('/tmp/agent/debug.log');
  });

  it('creates parent directories if they do not exist', () => {
    let mkdirCalled = false;
    const deps: DebugLogDeps = {
      appendFileSync: () => {},
      readFileSync: () => '',
      writeFileSync: () => {},
      existsSync: () => false,
      mkdirSync: () => { mkdirCalled = true; },
    };
    const logger = new DebugLogger('/some/deep/path/debug.log', deps);
    logger.banner('a', false);
    expect(mkdirCalled).toBe(true);
  });
});

describe('NoopDebugLogger', () => {
  it('does not throw on any operation', () => {
    const logger = new NoopDebugLogger();
    logger.banner();
    logger.log();
    logger.phaseStart('act', 0);
    logger.phaseEnd('act', 0, 1);
    logger.tickStart(0);
    logger.tickEnd(0, 1, true);
    logger.error('err', new Error('e'));
    // No assertions needed — just must not throw
  });
});
