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

const PRESERVATION_BASELINE_PATH = 'strategy/findings/preservation-risks.json';
const DURABLE_COMPUTE_BASELINE_PATH = 'strategy/findings/durable-compute.json';
const INSTITUTIONAL_BASELINE_PATH = 'strategy/findings/institutional-continuity.json';

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function recurringArtifactPaths(packet: WorkPacket, family: string): {
  runNumber: number;
  artifactId: string;
  artifactPath: string;
  resultPath: string;
} {
  if (packet.seriesId !== family || !Number.isSafeInteger(packet.runNumber) || packet.runNumber! < 1 ||
      packet.id !== `${family}-run-${packet.runNumber}`) {
    throw new Error(`Packet ${packet.id} is not an explicitly numbered member of ${family}`);
  }
  const runNumber = packet.runNumber!;
  const artifactId = `${family.replace(/^packet-/, '')}-run-${runNumber}`;
  const artifactPath = `strategy/results/${artifactId}.json`;
  return { runNumber, artifactId, artifactPath, resultPath: `strategy/results/${artifactId}.result.json` };
}

export function matchesRepositoryPacketHandler(
  handler: RepositoryPacketHandler,
  packet: WorkPacket,
): boolean {
  if (handler.packetId === packet.id) return true;
  if (!handler.packetFamily) return false;
  try {
    recurringArtifactPaths(packet, handler.packetFamily);
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
    title: string;
    rankingRationale: string;
    sourceIds: string[];
    uncertainty: unknown;
    leadingIndicators: Array<{ indicator: string; directionOfConcern: string; updateCadence: string }>;
    reversibleResponses: Array<{
      action: string; trigger: string; rollback: string; authorityBoundary: string;
    }>;
  }>;
}

function preservationMitigationTabletopHandler(): RepositoryPacketHandler {
  const family = 'packet-preservation-mitigation-tabletop';
  return {
    packetId: `${family}-run-1`,
    packetFamily: family,
    async prepare(fileSystem, packet, state, now) {
      const baseline = JSON.parse(await fileSystem.readText(PRESERVATION_BASELINE_PATH)) as PreservationBaseline;
      const risks = [...baseline.risks].sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id));
      if (risks.length === 0) throw new Error('Preservation risk baseline contains no risks');
      const paths = recurringArtifactPaths(packet, family);
      const risk = risks[(paths.runNumber - 1) % risks.length];
      const indicator = risk.leadingIndicators?.[0];
      const response = risk.reversibleResponses?.[0];
      if (!risk.id?.trim() || !risk.title?.trim() || !Number.isSafeInteger(risk.rank) || !indicator?.indicator?.trim() ||
        !indicator.directionOfConcern?.trim() || !indicator.updateCadence?.trim() || !response?.action?.trim() ||
        !response.trigger?.trim() || !response.rollback?.trim() || !response.authorityBoundary?.trim()) {
        throw new Error('Preservation risk baseline cannot support a bounded tabletop');
      }
      const finding = {
        riskId: risk.id,
        rank: risk.rank,
        scenario: `Observe whether ${indicator.indicator} moves in the direction of concern: ${indicator.directionOfConcern}`,
        observationCadence: indicator.updateCadence,
        measurableTrigger: response.trigger,
        boundedResponse: response.action,
        rollback: response.rollback,
        authorityBoundary: response.authorityBoundary,
        disposition: 'requires-external-observation',
      };
      const artifact = {
        schemaVersion: '1.0.0',
        id: paths.artifactId,
        packetId: packet.id,
        preparedAt: now,
        baselineArtifact: PRESERVATION_BASELINE_PATH,
        scope: { performsExternalIntervention: false, publishesExternally: false, spendsFunds: false },
        selection: { ordering: 'ascending-risk-rank', runIndex: paths.runNumber - 1 },
        findings: [finding],
        summary: {
          testedRiskCount: 1,
          realWorldRiskReductionClaimed: false,
          metricMeasurementProduced: false,
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
          PRESERVATION_BASELINE_PATH,
          `A deterministic tabletop specified a measurable trigger and reversible response for ranked risk ${risk.id}.`,
          [
            'The tabletop is a repository artifact and does not establish real-world risk reduction.',
            'The contracted metric remains unchanged until qualifying external outcome evidence is independently reviewed.',
          ],
          state.portfolioEffort,
        ),
      };
    },
  };
}

function preservationRefreshHandler(): RepositoryPacketHandler {
  const family = 'packet-preservation-risk-register-refresh';
  return {
    packetId: `${family}-run-1`,
    packetFamily: family,
    async prepare(fileSystem, packet, state, now) {
      const baseline = JSON.parse(await fileSystem.readText(PRESERVATION_BASELINE_PATH)) as PreservationBaseline;
      if (!Array.isArray(baseline.risks) || baseline.risks.length === 0) {
        throw new Error('Preservation risk baseline contains no risks');
      }
      const paths = recurringArtifactPaths(packet, family);
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
    packetId: `${family}-run-1`,
    packetFamily: family,
    async prepare(fileSystem, packet, state, now) {
      const baseline = JSON.parse(await fileSystem.readText(DURABLE_COMPUTE_BASELINE_PATH)) as DurableComputeBaseline;
      const preregistration = baseline.preregistration;
      if (!preregistration?.faultClass?.trim() || !Number.isFinite(preregistration.recoveryBudgetMs) ||
        preregistration.recoveryBudgetMs <= 0 || !Number.isFinite(preregistration.checkpointIntervalMs) ||
        preregistration.checkpointIntervalMs <= 0 || !Array.isArray(baseline.scenarios) || baseline.scenarios.length === 0) {
        throw new Error('Durable-compute baseline is incomplete');
      }
      const paths = recurringArtifactPaths(packet, family);
      const faultClass = paths.runNumber === 1
        ? 'failover-control-plane-delay'
        : paths.runNumber === 2
          ? 'checkpoint-restoration-delay'
          : `compound-recovery-delay-level-${paths.runNumber}`;
      const injectedDelayMs = preregistration.checkpointIntervalMs * (paths.runNumber + 1);
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
    packetId: `${family}-run-1`,
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
      const paths = recurringArtifactPaths(packet, family);
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
    preservationMitigationTabletopHandler(),
    preservationRefreshHandler(),
    durableComputeExtensionHandler(),
    institutionalRefreshHandler(),
  ];
}
