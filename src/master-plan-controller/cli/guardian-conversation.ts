import { GuardianConversation } from '../guardian-conversation.js';
import { RepositoryGuardianStatus } from '../repository-guardian-status.js';
import { SlackWebhookPublisher } from '../slack-webhook.js';
import type { FileSystemPort, NetworkPort } from '../ports.js';

function usage(message: string): never {
  throw new Error(message);
}

function conversation(fileSystem: FileSystemPort): GuardianConversation {
  return new GuardianConversation(fileSystem, new RepositoryGuardianStatus(fileSystem));
}

export async function runGuardianConversationCli(
  fileSystem: FileSystemPort,
  network: NetworkPort,
  args: readonly string[],
  slackWebhookUrl?: string,
): Promise<string> {
  const [command, ...values] = args;
  const guardian = conversation(fileSystem);
  if (command === 'status') {
    if (values.length !== 0) usage('Usage: guardian status');
    return JSON.stringify(await guardian.receive({
      id: 'cli-status', sender: 'cli', text: 'status', receivedAt: '1970-01-01T00:00:00.000Z',
    }));
  }
  if (command === 'inbox') {
    const [receivedAt, sender, text] = values;
    if (!receivedAt || !sender || !text || values.length !== 3) {
      usage('Usage: guardian inbox <timestamp> <sender> <message>');
    }
    return JSON.stringify(await guardian.receive({
      id: `inbox:${sender}:${receivedAt}`, sender, text, receivedAt,
    }));
  }
  if (command === 'progress') {
    const [now, stage, text] = values;
    if (!now || !stage || !text || values.length !== 3) {
      usage('Usage: guardian progress <timestamp> <stage> <message>');
    }
    await guardian.recordProgress(stage, text, now);
    return 'Guardian progress recorded.';
  }
  if (command === 'communicate') {
    const [now] = values;
    if (!now || values.length !== 1) usage('Usage: guardian communicate <timestamp>');
    await guardian.processQueuedMessages(now);
    return 'Guardian messages processed.';
  }
  if (command === 'notify') {
    const [now] = values;
    if (!now || values.length !== 1) usage('Usage: guardian notify <timestamp>');
    if (!slackWebhookUrl) throw new Error('SLACK_WEBHOOK_URL is required to notify Slack');
    await guardian.deliverPendingUpdates(new SlackWebhookPublisher(network, slackWebhookUrl), now);
    return 'Guardian updates delivered to Slack.';
  }
  usage('Usage: guardian <status|inbox|progress|communicate|notify> ...');
}
