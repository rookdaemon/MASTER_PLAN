import type { NetworkPort } from './ports.js';
import type { GuardianUpdatePublisher } from './guardian-conversation.js';

/** Posts Guardian updates to a configured Slack incoming-webhook URL. */
export class SlackWebhookPublisher implements GuardianUpdatePublisher {
  constructor(
    private readonly network: NetworkPort,
    private readonly webhookUrl: string,
  ) {}

  async publish(text: string): Promise<void> {
    if (!this.webhookUrl.trim()) throw new Error('Slack webhook URL is required');
    const response = await this.network.request({
      method: 'POST',
      url: this.webhookUrl,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Slack webhook rejected Guardian update with HTTP ${response.status}`);
    }
  }
}
