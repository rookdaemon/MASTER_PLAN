import { assessAutoMerge } from './authority.js';
import type { AutoMergeAssessment, AutoMergeRequest } from './authority.js';
import type { GitHubPort } from './ports.js';

export class AutoMergeService {
  constructor(private readonly github: GitHubPort) {}

  async evaluateAndRequest(
    pullRequestNumber: number,
    request: AutoMergeRequest,
  ): Promise<AutoMergeAssessment> {
    const controls = await this.github.getRepositoryControls();
    const assessment = assessAutoMerge(request, controls);
    await this.github.recordAssessment?.(pullRequestNumber, assessment);
    if (assessment.allowed) await this.github.requestAutoMerge(pullRequestNumber);
    return assessment;
  }
}
