import type { AutoMergeAssessment, AutoMergeRequest, DiffFile, RepositoryControls } from './authority.js';
import type {
  EvidenceRecord,
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

export interface ProcessRequest {
  command: string;
  args: string[];
  cwd?: string;
  environment?: Record<string, string>;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessPort {
  run(request: ProcessRequest): Promise<ProcessResult>;
}

export interface GitPort {
  diff(base: string, head: string): Promise<DiffFile[]>;
  prepareBranch(name: string): Promise<void>;
}

export interface GitHubPort {
  getRepositoryControls(): Promise<RepositoryControls>;
  requestAutoMerge(pullRequestNumber: number): Promise<void>;
  recordAssessment?(pullRequestNumber: number, assessment: AutoMergeAssessment): Promise<void>;
}

export interface SchedulerPort {
  wait(milliseconds: number): Promise<void>;
}

export interface ExternalDataPort {
  observe(now: Timestamp): Promise<EvidenceRecord[]>;
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

export interface AutoMergePort {
  evaluateAndRequest(pullRequestNumber: number, request: AutoMergeRequest): Promise<AutoMergeAssessment>;
}
