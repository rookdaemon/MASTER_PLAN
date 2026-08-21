import type { GuardianRuntimeStatus, GuardianStatusPort } from './guardian-conversation.js';
import { loadRepositoryStrategy } from './repository-strategy.js';
import type { FileSystemPort } from './ports.js';

/** Derives conversational status and exceptional human questions from current repository state. */
export class RepositoryGuardianStatus implements GuardianStatusPort {
  constructor(private readonly fileSystem: FileSystemPort) {}

  async getStatus(): Promise<GuardianRuntimeStatus> {
    const bundle = await loadRepositoryStrategy(this.fileSystem);
    return {
      reviewedResultCount: bundle.state.governance.reviewedResultCount,
      activePacketCount: bundle.state.packets.filter((packet) => packet.lifecycle === 'active').length,
      eligiblePacketCount: bundle.state.packets.filter((packet) => packet.lifecycle === 'eligible').length,
      requiredQuestions: bundle.state.escalations.map((escalation) => ({
        id: `human-decision:${escalation.id}`,
        prompt: `${escalation.decisionRequested.operation} for ${escalation.decisionRequested.scope}: ${escalation.decisionRequested.expectedOutput}`,
      })),
    };
  }
}
