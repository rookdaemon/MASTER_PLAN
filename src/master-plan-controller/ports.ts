import type {
  EvidenceRecord,
  CanonicalSourceSnapshot,
  EvidenceAdjudication,
  EvidenceAdjudicationTarget,
  PacketResult,
  PacketVerification,
  GraphDiagnosis,
  StrategyState,
  Timestamp,
  WorkPacket,
} from './types.js';

export interface ClockPort {
  now(): Timestamp;
}
export interface FileSystemPort {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  listFiles(prefix: string): Promise<string[]>;
}

export interface NetworkRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface NetworkResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

export interface NetworkPort {
  request(request: NetworkRequest): Promise<NetworkResponse>;
}

export interface ContentFingerprintPort {
  digest(content: string): string;
}

export interface ProcessRequest {
  command: string;
  args: string[];
  cwd?: string;
  environment?: Record<string, string>;
  timeoutMs?: number;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessPort {
  run(request: ProcessRequest): Promise<ProcessResult>;
}

export interface SchedulerPort {
  wait(milliseconds: number): Promise<void>;
}

export interface ExternalDataPort {
  observe(now: Timestamp): Promise<EvidenceRecord[]>;
}

export interface EvidenceAdjudicatorPort {
  adjudicate(
    snapshot: CanonicalSourceSnapshot,
    targets: readonly EvidenceAdjudicationTarget[],
    now: Timestamp,
  ): Promise<EvidenceAdjudication[]>;
}

export interface PacketGeneratorPort {
  generate(state: StrategyState, diagnosis: GraphDiagnosis, now: Timestamp): Promise<WorkPacket[]>;
}

export interface StateStorePort {
  load(): Promise<StrategyState>;
  save(state: StrategyState): Promise<void>;
}

export type ExecutionResult = Omit<PacketResult, 'verification'>;

export interface PacketExecutorPort {
  execute(packet: WorkPacket, now: Timestamp): Promise<ExecutionResult>;
}

export interface ReviewerPort {
  verify(packet: WorkPacket, result: ExecutionResult, now: Timestamp): Promise<PacketVerification>;
}
