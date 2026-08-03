import { describe, expect, it } from 'vitest';
import { CycleRunner } from '../runner.js';
import type { ExternalDataPort } from '../ports.js';
import {
  InMemoryExternalData,
  InMemoryPacketExecutor,
  InMemoryReviewer,
  InMemoryStateStore,
} from '../testing/in-memory-adapters.js';
import { CONFIG, makeEvidence, makeNode, makePacket, makeState, NOW, RESULT_PORTFOLIO_EFFORT } from './fixtures.js';

function makeRunner(
  store: InMemoryStateStore,
  executor = new InMemoryPacketExecutor(),
  reviewer = new InMemoryReviewer(),
  externalData: ExternalDataPort = new InMemoryExternalData(),
): CycleRunner {
  return new CycleRunner({ store, executor, reviewer, externalData }, CONFIG);
}

describe('CycleRunner end-to-end with injected ports', () => {
  it('runs shadow mode without executing the selected packet', async () => {
    const store = new InMemoryStateStore(makeState());
    const executor = new InMemoryPacketExecutor();
    const result = await makeRunner(store, executor).runCycle(NOW);

    expect(result.status).toBe('proposed');
    expect(result.selectedPacketId).toBe('packet-1');
    expect(executor.requests).toHaveLength(0);
    expect((await store.load()).governance.mode).toBe('shadow');
  });

  it('executes and verifies one supervised packet', async () => {
    const state = makeState({ governance: { mode: 'supervised', shadowCyclesReviewed: 20, supervisedResultsReviewed: 0, safeAutoMergeEnabled: false } });
    const store = new InMemoryStateStore(state);
    const executor = new InMemoryPacketExecutor([
      {
        outcome: 'positive',
        artifactReferences: ['artifact://experiment-1'],
        evidence: [makeEvidence()],
        acceptanceCriteriaMet: true,
        portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      },
    ]);
    const reviewer = new InMemoryReviewer([{ status: 'passed', verifier: 'reviewer', reviewedAt: NOW }]);

    const result = await makeRunner(store, executor, reviewer).runCycle(NOW);

    expect(result.status).toBe('verified');
    expect(executor.requests).toHaveLength(1);
    expect(reviewer.requests).toHaveLength(1);
    expect((await store.load()).packets[0].lifecycle).toBe('verified');
    expect((await store.load()).governance.supervisedResultsReviewed).toBe(1);
  });

  it('integrates a reviewed null result without manufacturing success', async () => {
    const store = new InMemoryStateStore(makeState({
      governance: { mode: 'supervised', shadowCyclesReviewed: 20, supervisedResultsReviewed: 0, safeAutoMergeEnabled: false },
    }));
    const executor = new InMemoryPacketExecutor([
      {
        outcome: 'null',
        artifactReferences: ['artifact://null'],
        evidence: [makeEvidence({ outcome: 'null', source: 'artifact://null' })],
        acceptanceCriteriaMet: true,
        portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      },
    ]);
    const result = await makeRunner(store, executor, new InMemoryReviewer([
      { status: 'passed', verifier: 'reviewer', reviewedAt: NOW },
    ])).runCycle(NOW);

    expect(result.status).toBe('verified');
    expect((await store.load()).evidence[0].outcome).toBe('null');
  });

  it('blocks failed verification rather than treating artifact creation as verification', async () => {
    const packet = makePacket({ retrySignature: 'implementation-v1' });
    const store = new InMemoryStateStore(makeState({
      packets: [packet],
      governance: { mode: 'supervised', shadowCyclesReviewed: 20, supervisedResultsReviewed: 0, safeAutoMergeEnabled: false },
    }));
    const executor = new InMemoryPacketExecutor([
      {
        outcome: 'positive',
        artifactReferences: ['artifact://failed-review'],
        evidence: [makeEvidence({ outcome: 'negative' })],
        acceptanceCriteriaMet: true,
        portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      },
    ]);
    const reviewer = new InMemoryReviewer([{ status: 'failed', verifier: 'reviewer', reviewedAt: NOW }]);

    const result = await makeRunner(store, executor, reviewer).runCycle(NOW);
    expect(result.status).toBe('blocked');
    expect((await store.load()).packets[0].lifecycle).toBe('blocked');
    expect((await store.load()).governance.supervisedResultsReviewed).toBe(0);
  });

  it('does not count a stale or self review toward supervised rollout', async () => {
    for (const verification of [
      { status: 'passed' as const, verifier: 'owner', reviewedAt: NOW },
      { status: 'passed' as const, verifier: 'reviewer', reviewedAt: '2026-08-03T09:00:00.000Z' },
    ]) {
      const packet = makePacket({ owner: 'owner' });
      const store = new InMemoryStateStore(makeState({
        packets: [packet],
        governance: { mode: 'supervised', shadowCyclesReviewed: 20, supervisedResultsReviewed: 0, safeAutoMergeEnabled: false },
      }));
      const executor = new InMemoryPacketExecutor([{
        outcome: 'positive', artifactReferences: ['artifact://result'], evidence: [makeEvidence()],
        acceptanceCriteriaMet: true, portfolioEffortAfter: RESULT_PORTFOLIO_EFFORT,
      }]);
      await makeRunner(store, executor, new InMemoryReviewer([verification])).runCycle(NOW);
      expect((await store.load()).governance.supervisedResultsReviewed).toBe(0);
    }
  });

  it('leaves an interrupted packet active, then recovers it as blocked without an identical retry', async () => {
    const store = new InMemoryStateStore(makeState({
      governance: { mode: 'supervised', shadowCyclesReviewed: 20, supervisedResultsReviewed: 0, safeAutoMergeEnabled: false },
    }));
    const executor = new InMemoryPacketExecutor([new Error('simulated process crash')]);
    const runner = makeRunner(store, executor);

    expect((await runner.runCycle(NOW)).status).toBe('crashed');
    expect((await store.load()).activePacketId).toBe('packet-1');

    const recoveryTime = '2026-08-03T12:01:00.000Z';
    expect((await runner.runCycle(recoveryTime)).status).toBe('recovered');
    const recovered = await store.load();
    expect(recovered.activePacketId).toBeNull();
    expect(recovered.packets[0].lifecycle).toBe('blocked');
    expect(recovered.auditEvents.at(-1)).toMatchObject({ type: 'crash-recovered', occurredAt: recoveryTime });
    expect(executor.requests).toHaveLength(1);
  });

  it('waits when the only evidence satisfying a gate is stale', async () => {
    const oldEvidence = makeEvidence({ id: 'old', observedAt: '2025-01-01T00:00:00.000Z' });
    const node = makeNode({
      evidenceReferences: ['old'],
      activationGates: [{ type: 'fresh-evidence', minimumStrength: 0.5, maxAgeMs: 30 * 86_400_000 }],
    });
    const store = new InMemoryStateStore(makeState({ nodes: [node], evidence: [oldEvidence] }));
    const result = await makeRunner(store).runCycle(NOW);
    expect(result.status).toBe('waiting');
    expect(result.rejections[0].reasons.join(' ')).toMatch(/fresh evidence/i);
  });

  it('integrates externally observed evidence before diagnosing the frontier', async () => {
    const externalData = new InMemoryExternalData([[makeEvidence({ id: 'external' })]]);
    const store = new InMemoryStateStore(makeState());
    await makeRunner(store, undefined, undefined, externalData).runCycle(NOW);
    expect((await store.load()).evidence.map((evidence) => evidence.id)).toContain('external');
    expect(externalData.observationTimes).toEqual([NOW]);
  });

  it('does not execute work requiring explicit authorization while approval is pending', async () => {
    const packet = makePacket({ authorityClass: 'explicit-authorization' });
    const store = new InMemoryStateStore(makeState({
      packets: [packet],
      governance: { mode: 'supervised', shadowCyclesReviewed: 20, supervisedResultsReviewed: 0, safeAutoMergeEnabled: false },
    }));
    const executor = new InMemoryPacketExecutor();
    const result = await makeRunner(store, executor).runCycle(NOW);
    expect(result.status).toBe('waiting');
    expect(result.rejections[0].reasons.join(' ')).toMatch(/authorization|approval/i);
    expect(executor.requests).toHaveLength(0);
  });

  it('rejects a concurrent cycle so only one packet can execute or write at a time', async () => {
    let releaseFirst!: (value: []) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let observations = 0;
    const externalData = {
      observe: async () => {
        observations += 1;
        if (observations === 1) {
          markStarted();
          return new Promise<[]>((resolve) => { releaseFirst = resolve; });
        }
        return [];
      },
    };
    const runner = makeRunner(new InMemoryStateStore(makeState()), undefined, undefined, externalData);
    const first = runner.runCycle(NOW);
    await started;
    await expect(runner.runCycle('2026-08-03T12:00:01.000Z')).rejects.toThrow(/already running/i);
    releaseFirst([]);
    await expect(first).resolves.toMatchObject({ status: 'proposed' });
  });
});
