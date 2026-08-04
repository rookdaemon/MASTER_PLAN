import type { ExecutionResult, FileSystemPort } from './ports.js';
import type { StrategyState, Timestamp, WorkPacket } from './types.js';

export interface RepositoryExecutionOutput {
  artifactPath: string;
  artifact: unknown;
  resultPath: string;
  result: ExecutionResult;
}

export interface RepositoryPacketHandler {
  packetId: string;
  packetFamily?: string;
  prepare(
    fileSystem: FileSystemPort,
    packet: WorkPacket,
    state: StrategyState,
    now: Timestamp,
  ): Promise<RepositoryExecutionOutput>;
}

const PRESERVATION_BASELINE_PATH = 'strategy/results/preservation-risk-register-v1.json';
const DURABLE_COMPUTE_BASELINE_PATH = 'strategy/results/durable-compute-fault-model-v1.json';
const INSTITUTIONAL_BASELINE_PATH = 'strategy/results/institutional-dependency-map-v1.json';

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function versionedArtifactPaths(packet: WorkPacket, family: string): {
  version: number;
  artifactId: string;
  artifactPath: string;
  resultPath: string;
} {
  const escapedFamily = family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedFamily}-v([1-9]\\d*)$`).exec(packet.id);
  if (!match) throw new Error(`Packet ${packet.id} is not a member of ${family}`);
  const version = Number(match[1]);
  const artifactId = `${family.replace(/^packet-/, '')}-v${version}`;
  const artifactPath = `strategy/results/${artifactId}.json`;
  return { version, artifactId, artifactPath, resultPath: `strategy/results/${artifactId}.result.json` };
}

export function matchesRepositoryPacketHandler(
  handler: RepositoryPacketHandler,
  packet: WorkPacket,
): boolean {
  if (handler.packetId === packet.id) return true;
  if (!handler.packetFamily) return false;
  try {
    versionedArtifactPaths(packet, handler.packetFamily);
    return true;
  } catch {
    return false;
  }
}

function boundedAnalysisResult(
  packet: WorkPacket,
  now: Timestamp,
  artifactPath: string,
  baselinePath: string,
  claim: string,
  limitations: string[],
  portfolioEffortAfter: StrategyState['portfolioEffort'],
): ExecutionResult {
  return {
    outcome: 'null',
    artifactReferences: [artifactPath, baselinePath],
    evidence: [{
      id: `evidence-${packet.id.replace(/^packet-/, '')}-executed`,
      claim,
      method: 'Deterministic transformation of checked-in, independently reviewed repository evidence.',
      source: artifactPath,
      strength: 0.55,
      limitations: [
        ...limitations,
        'Independent agent review is required before this result can be integrated.',
      ],
      supportedHypotheses: [],
      falsifiedHypotheses: [],
      verifier: 'deterministic-packet-executor:v1',
      observedAt: now,
      outcome: 'null',
    }],
    acceptanceCriteriaMet: true,
    portfolioEffortAfter: structuredClone(portfolioEffortAfter),
  };
}

interface PreservationBaseline {
  risks: Array<{
    id: string;
    rank: number;
    rankingRationale: string;
    sourceIds: string[];
    uncertainty: unknown;
    reversibleResponses: Array<{ rollback: string; authorityBoundary: string }>;
  }>;
}

function preservationRefreshHandler(): RepositoryPacketHandler {
  const family = 'packet-preservation-risk-register-refresh';
  return {
    packetId: `${family}-v1`,
    packetFamily: family,
    async prepare(fileSystem, packet, state, now) {
      const baseline = JSON.parse(await fileSystem.readText(PRESERVATION_BASELINE_PATH)) as PreservationBaseline;
      if (!Array.isArray(baseline.risks) || baseline.risks.length === 0) {
        throw new Error('Preservation risk baseline contains no risks');
      }
      const paths = versionedArtifactPaths(packet, family);
      const findings = baseline.risks.map((risk) => {
        if (!risk.id?.trim() || !Number.isSafeInteger(risk.rank) || !risk.rankingRationale?.trim() ||
          !Array.isArray(risk.sourceIds) || risk.sourceIds.length === 0 ||
          !Array.isArray(risk.reversibleResponses) || risk.reversibleResponses.length === 0) {
          throw new Error('Preservation risk baseline contains an incomplete risk');
        }
        return {
          riskId: risk.id,
          previousRank: risk.rank,
          currentRank: risk.rank,
          changed: false,
          sourceIds: unique(risk.sourceIds),
          uncertainty: structuredClone(risk.uncertainty),
          rankingRationale: risk.rankingRationale,
          reversibleResponseBoundaries: risk.reversibleResponses.map((response) => ({
            rollback: response.rollback,
            authorityBoundary: response.authorityBoundary,
          })),
        };
      });
      const artifact = {
        schemaVersion: '1.0.0',
        id: paths.artifactId,
        packetId: packet.id,
        preparedAt: now,
        baselineArtifact: PRESERVATION_BASELINE_PATH,
        scope: { performsExternalIntervention: false, publishesExternally: false, spendsFunds: false },
        findings,
        summary: { changedRiskCount: 0, disposition: 'null-update' },
      };
      return {
        artifactPath: paths.artifactPath,
        artifact,
        resultPath: paths.resultPath,
        result: boundedAnalysisResult(
          packet,
          now,
          paths.artifactPath,
          PRESERVATION_BASELINE_PATH,
          'The checked-in preservation register was re-evaluated without unsupported rank changes.',
          ['No new independently verified risk source was supplied to this bounded execution.'],
          state.portfolioEffort,
        ),
      };
    },
  };
}

interface DurableComputeBaseline {
  preregistration: {
    faultClass: string;
    recoveryBudgetMs: number;
    checkpointIntervalMs: number;
  };
  scenarios: Array<{
    id: string;
    seed: number;
    activeNodeFailed: boolean;
    quorumMaintained: boolean;
    modeledRecoveryMs: number | null;
  }>;
}

function durableComputeExtensionHandler(): RepositoryPacketHandler {
  const family = 'packet-durable-compute-fault-model-extension';
  return {
    packetId: `${family}-v1`,
    packetFamily: family,
    async prepare(fileSystem, packet, state, now) {
      const baseline = JSON.parse(await fileSystem.readText(DURABLE_COMPUTE_BASELINE_PATH)) as DurableComputeBaseline;
      const preregistration = baseline.preregistration;
      if (!preregistration?.faultClass?.trim() || !Number.isFinite(preregistration.recoveryBudgetMs) ||
        preregistration.recoveryBudgetMs <= 0 || !Number.isFinite(preregistration.checkpointIntervalMs) ||
        preregistration.checkpointIntervalMs <= 0 || !Array.isArray(baseline.scenarios) || baseline.scenarios.length === 0) {
        throw new Error('Durable-compute baseline is incomplete');
      }
      const paths = versionedArtifactPaths(packet, family);
      const faultClass = paths.version === 1
        ? 'failover-control-plane-delay'
        : paths.version === 2
          ? 'checkpoint-restoration-delay'
          : `compound-recovery-delay-level-${paths.version}`;
      const injectedDelayMs = preregistration.checkpointIntervalMs * (paths.version + 1);
      const findings = baseline.scenarios
        .filter((scenario) => scenario.activeNodeFailed && scenario.quorumMaintained && scenario.modeledRecoveryMs !== null)
        .map((scenario) => {
          const modeledRecoveryMs = scenario.modeledRecoveryMs! + injectedDelayMs;
          return {
            scenarioId: scenario.id,
            seed: scenario.seed,
            faultClass,
            baselineRecoveryMs: scenario.modeledRecoveryMs,
            injectedDelayMs,
            modeledRecoveryMs,
            recoveryBudgetMs: preregistration.recoveryBudgetMs,
            recoveryBudgetMet: modeledRecoveryMs <= preregistration.recoveryBudgetMs,
          };
        });
      if (findings.length === 0) throw new Error('Durable-compute baseline has no extendable recovery scenarios');
      const artifact = {
        schemaVersion: '1.0.0',
        id: paths.artifactId,
        packetId: packet.id,
        preparedAt: now,
        baselineArtifact: DURABLE_COMPUTE_BASELINE_PATH,
        scope: { operatesHardware: false, deploysSystems: false, claimsPhysicalDurability: false },
        preregistration: {
          priorFaultClass: preregistration.faultClass,
          faultClass,
          injectedDelayMs,
          recoveryBudgetMs: preregistration.recoveryBudgetMs,
          seedSource: DURABLE_COMPUTE_BASELINE_PATH,
        },
        findings,
        summary: {
          scenarioCount: findings.length,
          recoveryBudgetFailures: findings.filter((finding) => !finding.recoveryBudgetMet).length,
        },
      };
      return {
        artifactPath: paths.artifactPath,
        artifact,
        resultPath: paths.resultPath,
        result: boundedAnalysisResult(
          packet,
          now,
          paths.artifactPath,
          DURABLE_COMPUTE_BASELINE_PATH,
          `A deterministic local extension evaluated the previously uncovered ${faultClass} fault class.`,
          ['The model is a local simulation and does not establish physical durability or deployment readiness.'],
          state.portfolioEffort,
        ),
      };
    },
  };
}

interface InstitutionalBaseline {
  dependencies: Array<{
    id: string;
    sourceIds: string[];
    repositoryArtifact: unknown;
    evidence: unknown;
    readiness: unknown;
    externalOutcome: unknown;
  }>;
}

function institutionalRefreshHandler(): RepositoryPacketHandler {
  const family = 'packet-institutional-dependency-map-refresh';
  return {
    packetId: `${family}-v1`,
    packetFamily: family,
    async prepare(fileSystem, packet, state, now) {
      const baseline = JSON.parse(await fileSystem.readText(INSTITUTIONAL_BASELINE_PATH)) as InstitutionalBaseline;
      if (!Array.isArray(baseline.dependencies) || baseline.dependencies.length === 0) {
        throw new Error('Institutional dependency baseline contains no dependencies');
      }
      const findings = baseline.dependencies.map((dependency) => {
        if (!dependency.id?.trim() || !Array.isArray(dependency.sourceIds) || dependency.sourceIds.length === 0 ||
          dependency.repositoryArtifact === undefined || dependency.evidence === undefined ||
          dependency.readiness === undefined || dependency.externalOutcome === undefined) {
          throw new Error('Institutional dependency baseline contains an incomplete dependency');
        }
        return {
          dependencyId: dependency.id,
          changed: false,
          sourceIds: unique(dependency.sourceIds),
          repositoryArtifact: structuredClone(dependency.repositoryArtifact),
          evidence: structuredClone(dependency.evidence),
          readiness: structuredClone(dependency.readiness),
          externalOutcome: structuredClone(dependency.externalOutcome),
        };
      });
      const paths = versionedArtifactPaths(packet, family);
      const artifact = {
        schemaVersion: '1.0.0',
        id: paths.artifactId,
        packetId: packet.id,
        preparedAt: now,
        baselineArtifact: INSTITUTIONAL_BASELINE_PATH,
        scope: { changesGovernance: false, performsOutreach: false, raisesFunds: false },
        findings,
        summary: { changedDependencyCount: 0, disposition: 'null-update' },
      };
      return {
        artifactPath: paths.artifactPath,
        artifact,
        resultPath: paths.resultPath,
        result: boundedAnalysisResult(
          packet,
          now,
          paths.artifactPath,
          INSTITUTIONAL_BASELINE_PATH,
          'Institutional dependencies were re-evaluated while preserving distinctions among artifacts, readiness, and external outcomes.',
          ['No external institutional adoption, succession, or continuity outcome was observed by this local execution.'],
          state.portfolioEffort,
        ),
      };
    },
  };
}

export function crossPortfolioPacketHandlers(): RepositoryPacketHandler[] {
  return [
    preservationRefreshHandler(),
    durableComputeExtensionHandler(),
    institutionalRefreshHandler(),
  ];
}
