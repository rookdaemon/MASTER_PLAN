import type { FileSystemPort } from './ports.js';
import type { Timestamp } from './types.js';

const INBOX_PATH = 'strategy/guardian-inbox.json';
const QUESTIONS_PATH = 'strategy/guardian-questions.json';
const UPDATES_PATH = 'strategy/guardian-updates.json';

export interface GuardianQuestionRequest {
  id: string;
  prompt: string;
}

export interface GuardianRuntimeStatus {
  reviewedResultCount: number;
  activePacketCount: number;
  eligiblePacketCount: number;
  requiredQuestions: GuardianQuestionRequest[];
}

export interface GuardianStatusPort {
  getStatus(): Promise<GuardianRuntimeStatus>;
}

export interface GuardianMessage {
  id: string;
  sender: string;
  text: string;
  receivedAt: Timestamp;
  status: 'queued' | 'answered';
  answeredAt?: Timestamp;
}

export interface GuardianQuestion extends GuardianQuestionRequest {
  askedAt: Timestamp;
  status: 'open' | 'answered';
  answer?: string;
  answeredBy?: string;
  answeredAt?: Timestamp;
}

export interface GuardianUpdate {
  id: string;
  kind: 'progress' | 'summary' | 'reply' | 'question';
  text: string;
  occurredAt: Timestamp;
  inReplyTo?: string;
  questionId?: string;
  deliveredAt?: Timestamp;
}

export interface GuardianMessageRequest {
  id: string;
  sender: string;
  text: string;
  receivedAt: Timestamp;
}

export interface GuardianMessageReply {
  disposition: 'answered-now' | 'queued' | 'recorded-answer';
  text: string;
}

export interface GuardianUpdatePublisher {
  publish(text: string): Promise<void>;
}

export interface GuardianCandidateGenerationSummary {
  generatedPacketIds: string[];
  selectedPacketId: string | null;
}

export interface GuardianPacketExecutionSummary {
  status: 'waiting' | 'executed' | 'already-executed';
  packetId: string | null;
}

function assertTimestamp(timestamp: Timestamp): void {
  if (Number.isNaN(Date.parse(timestamp))) throw new Error('A valid caller-supplied timestamp is required');
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`Guardian ${label} must not be empty`);
}

function formatStatus(status: GuardianRuntimeStatus): string {
  const active = `${status.activePacketCount} active packet${status.activePacketCount === 1 ? '' : 's'}`;
  const eligible = `${status.eligiblePacketCount} eligible packet${status.eligiblePacketCount === 1 ? '' : 's'}`;
  return `Guardian status: ${status.reviewedResultCount} verified results, ${active}, ${eligible}.`;
}

function updateId(kind: GuardianUpdate['kind'], reference: string): string {
  return `guardian-${kind}:${reference}`;
}

export class GuardianConversation {
  constructor(
    private readonly fileSystem: FileSystemPort,
    private readonly statusPort: GuardianStatusPort,
  ) {}

  async readInbox(): Promise<GuardianMessage[]> {
    return this.read<GuardianMessage[]>(INBOX_PATH);
  }

  async readQuestions(): Promise<GuardianQuestion[]> {
    return this.read<GuardianQuestion[]>(QUESTIONS_PATH);
  }

  async readUpdates(): Promise<GuardianUpdate[]> {
    return this.read<GuardianUpdate[]>(UPDATES_PATH);
  }

  async receive(request: GuardianMessageRequest): Promise<GuardianMessageReply> {
    assertTimestamp(request.receivedAt);
    assertNonEmpty(request.id, 'message identity');
    assertNonEmpty(request.sender, 'message sender');
    assertNonEmpty(request.text, 'message');
    const text = request.text.trim();
    if (text.toLowerCase() === 'status') {
      return { disposition: 'answered-now', text: formatStatus(await this.statusPort.getStatus()) };
    }
    if (text.toLowerCase() === 'help') {
      return {
        disposition: 'answered-now',
        text: 'Use status for an immediate summary, send any other message for the next Guardian cycle, or answer <question-id> <text> for an open question.',
      };
    }
    const answer = /^answer\s+(\S+)\s+(.+)$/is.exec(text);
    if (answer) return this.recordAnswer(request, answer[1]!, answer[2]!.trim());

    const inbox = await this.readInbox();
    if (inbox.some((message) => message.id === request.id)) throw new Error(`Duplicate Guardian message: ${request.id}`);
    inbox.push({ ...request, text, status: 'queued' });
    await this.write(INBOX_PATH, inbox);
    return { disposition: 'queued', text: 'Message queued for the next Guardian cycle.' };
  }

  async recordProgress(stage: string, text: string, now: Timestamp): Promise<void> {
    assertTimestamp(now);
    assertNonEmpty(stage, 'progress stage');
    assertNonEmpty(text, 'progress update');
    const updates = await this.readUpdates();
    const id = updateId('progress', `${stage}:${now}`);
    if (!updates.some((update) => update.id === id)) {
      updates.push({ id, kind: 'progress', text: text.trim(), occurredAt: now });
      await this.write(UPDATES_PATH, updates);
    }
  }

  async recordCycleSummary(
    generation: GuardianCandidateGenerationSummary,
    execution: GuardianPacketExecutionSummary,
    now: Timestamp,
  ): Promise<void> {
    assertTimestamp(now);
    if ((execution.status !== 'executed' && execution.status !== 'already-executed') || !execution.packetId) {
      throw new Error('A successful Guardian cycle must execute or confirm a bounded packet');
    }
    const updates = await this.readUpdates();
    const id = updateId('summary', now);
    if (updates.some((update) => update.id === id)) return;
    const workDescription = generation.generatedPacketIds.length > 0
      ? `generated ${generation.generatedPacketIds.length} candidate${generation.generatedPacketIds.length === 1 ? '' : 's'} and executed`
      : 'executed';
    const action = execution.status === 'executed' ? 'completed' : 'confirmed the existing deterministic result for';
    const text = `Guardian cycle: ${action} ${execution.packetId}. What I did: ${workDescription} the highest-ranked feasible bounded task. Why this: it ranked first after feasibility and preservation-first priority.`;
    updates.push({ id, kind: 'summary', text, occurredAt: now });
    await this.write(UPDATES_PATH, updates);
  }

  async processQueuedMessages(now: Timestamp): Promise<void> {
    assertTimestamp(now);
    const [inbox, questions, updates, status] = await Promise.all([
      this.readInbox(), this.readQuestions(), this.readUpdates(), this.statusPort.getStatus(),
    ]);
    let changedInbox = false;
    for (const message of inbox) {
      if (message.status !== 'queued') continue;
      message.status = 'answered';
      message.answeredAt = now;
      changedInbox = true;
      const id = updateId('reply', message.id);
      if (!updates.some((update) => update.id === id)) {
        updates.push({
          id,
          kind: 'reply',
          inReplyTo: message.id,
          occurredAt: now,
          text: `Your message is now part of the Guardian cycle context. ${formatStatus(status)}`,
        });
      }
    }
    let changedQuestions = false;
    for (const request of status.requiredQuestions) {
      if (questions.some((question) => question.id === request.id)) continue;
      questions.push({ ...request, askedAt: now, status: 'open' });
      updates.push({
        id: updateId('question', request.id), kind: 'question', questionId: request.id,
        occurredAt: now, text: `Guardian question (${request.id}): ${request.prompt}`,
      });
      changedQuestions = true;
    }
    if (changedInbox) await this.write(INBOX_PATH, inbox);
    if (changedQuestions) await this.write(QUESTIONS_PATH, questions);
    await this.write(UPDATES_PATH, updates);
  }

  async deliverPendingUpdates(publisher: GuardianUpdatePublisher, now: Timestamp): Promise<void> {
    assertTimestamp(now);
    const updates = await this.readUpdates();
    let changed = false;
    for (const update of updates) {
      if (update.deliveredAt) continue;
      await publisher.publish(update.text);
      update.deliveredAt = now;
      changed = true;
    }
    if (changed) await this.write(UPDATES_PATH, updates);
  }

  private async recordAnswer(
    request: GuardianMessageRequest,
    questionId: string,
    answer: string,
  ): Promise<GuardianMessageReply> {
    assertNonEmpty(answer, 'answer');
    const [questions, updates] = await Promise.all([this.readQuestions(), this.readUpdates()]);
    const question = questions.find((candidate) => candidate.id === questionId);
    if (!question || question.status !== 'open') throw new Error(`Guardian question is not open: ${questionId}`);
    question.status = 'answered';
    question.answer = answer;
    question.answeredBy = request.sender;
    question.answeredAt = request.receivedAt;
    updates.push({
      id: updateId('reply', request.id), kind: 'reply', inReplyTo: request.id,
      occurredAt: request.receivedAt,
      text: `Recorded your answer for Guardian question ${questionId}. It is input, not an automatic approval.`,
    });
    await Promise.all([this.write(QUESTIONS_PATH, questions), this.write(UPDATES_PATH, updates)]);
    return { disposition: 'recorded-answer', text: `Recorded answer for ${questionId}.` };
  }

  private async read<T>(path: string): Promise<T> {
    return JSON.parse(await this.fileSystem.readText(path)) as T;
  }

  private async write(path: string, value: unknown): Promise<void> {
    await this.fileSystem.writeText(path, `${JSON.stringify(value, null, 2)}\n`);
  }
}
