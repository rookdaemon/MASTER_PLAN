import { describe, expect, it } from 'vitest';
import {
  GuardianConversation,
  type GuardianStatusPort,
} from '../guardian-conversation.js';
import { SlackWebhookPublisher } from '../slack-webhook.js';
import { InMemoryFileSystem, InMemoryNetwork } from '../testing/in-memory-adapters.js';

const NOW = '2026-08-21T10:00:00.000Z';
const LATER = '2026-08-21T10:01:00.000Z';

const status: GuardianStatusPort = {
  async getStatus() {
    return {
      reviewedResultCount: 2,
      activePacketCount: 0,
      eligiblePacketCount: 1,
      requiredQuestions: [{
        id: 'human-decision:escalation-7',
        prompt: 'Record the bounded legal-consent decision for packet-7.',
      }],
    };
  },
};

function conversation(): GuardianConversation {
  return new GuardianConversation(new InMemoryFileSystem({
    'strategy/guardian-inbox.json': '[]\n',
    'strategy/guardian-questions.json': '[]\n',
    'strategy/guardian-updates.json': '[]\n',
  }), status);
}

describe('GuardianConversation', () => {
  it('answers a status request immediately without queueing it', async () => {
    const guardian = conversation();

    await expect(guardian.receive({
      id: 'slack-status-1', sender: 'U123', text: 'status', receivedAt: NOW,
    })).resolves.toMatchObject({
      disposition: 'answered-now',
      text: expect.stringMatching(/2 verified results.*1 eligible packet/i),
    });
    await expect(guardian.readInbox()).resolves.toEqual([]);
  });

  it('queues a message, answers it on the next cycle, and records one explanatory cycle summary', async () => {
    const guardian = conversation();

    await expect(guardian.receive({
      id: 'slack-message-1', sender: 'U123', text: 'Focus the next report on preservation risks.', receivedAt: NOW,
    })).resolves.toMatchObject({ disposition: 'queued' });
    await guardian.recordCycleSummary({
      generatedPacketIds: ['packet-preservation-mitigation-tabletop-run-1'],
      selectedPacketId: 'packet-preservation-mitigation-tabletop-run-1',
    }, {
      status: 'executed', packetId: 'packet-preservation-mitigation-tabletop-run-1',
    }, NOW);
    await guardian.processQueuedMessages(LATER);

    await expect(guardian.readInbox()).resolves.toMatchObject([{
      id: 'slack-message-1', status: 'answered', answeredAt: LATER,
    }]);
    await expect(guardian.readUpdates()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'summary',
        text: expect.stringMatching(/executed packet-preservation-mitigation-tabletop-run-1.*highest-ranked eligible bounded packet/i),
      }),
      expect.objectContaining({ kind: 'reply', inReplyTo: 'slack-message-1', occurredAt: LATER }),
      expect.objectContaining({ kind: 'question', questionId: 'human-decision:escalation-7' }),
    ]));
  });

  it('records a human answer to an open Guardian question without inventing an approval', async () => {
    const guardian = conversation();
    await guardian.processQueuedMessages(NOW);

    await expect(guardian.receive({
      id: 'slack-answer-1', sender: 'U123',
      text: 'answer human-decision:escalation-7 Consent artifact is attached.', receivedAt: LATER,
    })).resolves.toMatchObject({ disposition: 'recorded-answer' });
    await expect(guardian.readQuestions()).resolves.toMatchObject([{
      id: 'human-decision:escalation-7', status: 'answered', answeredBy: 'U123', answeredAt: LATER,
      answer: 'Consent artifact is attached.',
    }]);
  });

  it('delivers every undelivered update through an injected Slack webhook transport', async () => {
    const fileSystem = new InMemoryFileSystem({
      'strategy/guardian-inbox.json': '[]\n',
      'strategy/guardian-questions.json': '[]\n',
      'strategy/guardian-updates.json': JSON.stringify([{
        id: 'guardian-update-1', kind: 'summary', text: 'Cycle complete.', occurredAt: NOW,
      }]),
    });
    const network = new InMemoryNetwork({
      'POST https://hooks.slack.test/guardian': { status: 200, body: 'ok' },
    });
    const guardian = new GuardianConversation(fileSystem, status);

    await guardian.deliverPendingUpdates(
      new SlackWebhookPublisher(network, 'https://hooks.slack.test/guardian'), LATER,
    );

    expect(network.requests).toEqual([expect.objectContaining({ body: JSON.stringify({ text: 'Cycle complete.' }) })]);
    await expect(guardian.readUpdates()).resolves.toMatchObject([{ deliveredAt: LATER }]);
  });
});
