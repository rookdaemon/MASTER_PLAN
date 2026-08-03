import type {
  AutoMergeAssessment,
  DiffFile,
  RepositoryControls,
} from '../authority.js';
import type {
  ClockPort,
  ExecutionResult,
  ExternalDataPort,
  FileSystemPort,
  GitHubPort,
  GitPort,
  NetworkPort,
  NetworkRequest,
  NetworkResponse,
  PacketExecutorPort,
  ProcessPort,
  ProcessRequest,
  ProcessResult,
  ReviewerPort,
  SchedulerPort,
  StateStorePort,
} from '../ports.js';
import type {
  EvidenceRecord,
  PacketVerification,
  StrategyState,
  Timestamp,
  WorkPacket,
} from '../types.js';

export class InMemoryClock implements ClockPort {
  constructor(private current: Timestamp) {}

  now(): Timestamp {
    return this.current;
  }

  set(now: Timestamp): void {
    this.current = now;
  }
}

export class InMemoryFileSystem implements FileSystemPort {
  private readonly files: Map<string, string>;

  constructor(initial: Record<string, string> = {}) {
    this.files = new Map(Object.entries(initial));
  }

  async readText(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return content;
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async listFiles(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((path) => path.startsWith(prefix)).sort();
  }
}

export class InMemoryNetwork implements NetworkPort {
  readonly requests: NetworkRequest[] = [];

  constructor(private readonly responses: Record<string, NetworkResponse> = {}) {}

  async request(request: NetworkRequest): Promise<NetworkResponse> {
    this.requests.push(structuredClone(request));
    const response = this.responses[`${request.method} ${request.url}`];
    if (!response) throw new Error(`No in-memory response for ${request.method} ${request.url}`);
    return structuredClone(response);
  }
}

export class InMemoryProcess implements ProcessPort {
  readonly requests: ProcessRequest[] = [];

  constructor(private readonly results: ProcessResult[] = []) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(structuredClone(request));
    const result = this.results.shift();
    if (!result) throw new Error('No in-memory process result queued');
    return structuredClone(result);
  }
}

export class InMemoryGit implements GitPort {
  readonly preparedBranches: string[] = [];

  constructor(private readonly changedFiles: DiffFile[] = []) {}

  async diff(_base: string, _head: string): Promise<DiffFile[]> {
    return structuredClone(this.changedFiles);
  }

  async prepareBranch(name: string): Promise<void> {
    this.preparedBranches.push(name);
  }
}

export class InMemoryGitHub implements GitHubPort {
  readonly autoMergeRequests: number[] = [];
  readonly assessments: Array<{ pullRequestNumber: number; assessment: AutoMergeAssessment }> = [];

  constructor(private readonly controls: RepositoryControls) {}

  async getRepositoryControls(): Promise<RepositoryControls> {
    return structuredClone(this.controls);
  }

  async requestAutoMerge(pullRequestNumber: number): Promise<void> {
    this.autoMergeRequests.push(pullRequestNumber);
  }

  async recordAssessment(pullRequestNumber: number, assessment: AutoMergeAssessment): Promise<void> {
    this.assessments.push({ pullRequestNumber, assessment: structuredClone(assessment) });
  }
}

export class InMemoryScheduler implements SchedulerPort {
  readonly waits: number[] = [];

  async wait(milliseconds: number): Promise<void> {
    this.waits.push(milliseconds);
  }
}

export class InMemoryExternalData implements ExternalDataPort {
  readonly observationTimes: Timestamp[] = [];

  constructor(private readonly batches: EvidenceRecord[][] = []) {}

  async observe(now: Timestamp): Promise<EvidenceRecord[]> {
    this.observationTimes.push(now);
    return structuredClone(this.batches.shift() ?? []);
  }
}

export class InMemoryStateStore implements StateStorePort {
  readonly savedStates: StrategyState[] = [];
  private current: StrategyState;

  constructor(initial: StrategyState) {
    this.current = structuredClone(initial);
  }

  async load(): Promise<StrategyState> {
    return structuredClone(this.current);
  }

  async save(state: StrategyState): Promise<void> {
    this.current = structuredClone(state);
    this.savedStates.push(structuredClone(state));
  }
}

export class InMemoryPacketExecutor implements PacketExecutorPort {
  readonly requests: Array<{ packet: WorkPacket; now: Timestamp }> = [];

  constructor(private readonly outcomes: Array<ExecutionResult | Error> = []) {}

  async execute(packet: WorkPacket, now: Timestamp): Promise<ExecutionResult> {
    this.requests.push({ packet: structuredClone(packet), now });
    const outcome = this.outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    if (!outcome) throw new Error('No in-memory execution result queued');
    return structuredClone(outcome);
  }
}

export class InMemoryReviewer implements ReviewerPort {
  readonly requests: Array<{ packet: WorkPacket; result: ExecutionResult; now: Timestamp }> = [];

  constructor(private readonly verifications: PacketVerification[] = []) {}

  async verify(packet: WorkPacket, result: ExecutionResult, now: Timestamp): Promise<PacketVerification> {
    this.requests.push({ packet: structuredClone(packet), result: structuredClone(result), now });
    const verification = this.verifications.shift();
    if (!verification) throw new Error('No in-memory verification queued');
    return structuredClone(verification);
  }
}
