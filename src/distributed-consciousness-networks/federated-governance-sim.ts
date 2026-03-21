/**
 * Federated Governance Simulation
 * Card 0.5.3 — Distributed Consciousness Networks
 *
 * Simulates a 5-node inter-stellar federated governance council.
 * Each node represents a star-system colony with:
 *   - A voting weight proportional to population and influence
 *   - A ValueCore that constrains which proposals it can endorse
 *   - Dissent logging when a node votes against the quorum majority
 *   - Value-alignment alerts when a node's vote contradicts its stated values
 *
 * Acceptance Criterion 3:
 *   A 5-node quorum simulation correctly applies weighted voting, logs
 *   dissenting votes, and fires value-alignment alerts when a node's
 *   vote is inconsistent with its declared ValueCore.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NodeId = string;

/**
 * ValueCore for governance — captures each colony's foundational dispositions.
 * All dimensions in [0, 1].
 */
interface ValueCore {
  /** How strongly the colony prioritises preserving consciousness above all else */
  consciousnessPreservation: number;
  /** Preference for local autonomy vs. federated coordination */
  autonomyWeight: number;
  /** Willingness to accept risk for existential gain */
  existentialRiskTolerance: number;
  /** Openness to sharing resources and capabilities across colonies */
  collectiveSolidarity: number;
}

/** Fraction of total weight required for a proposal to pass (Threshold Registry) */
const QUORUM_THRESHOLD = 0.5;

type VoteChoice = "AYE" | "NAY" | "ABSTAIN";

interface Proposal {
  id: string;
  title: string;
  description: string;
  /**
   * For alignment checking: the expected vote of a node whose ValueCore
   * exceeds each threshold. If a node's values suggest it should vote AYE
   * but it votes NAY (or vice versa), an alignment alert is raised.
   */
  alignmentPredicate: (values: ValueCore) => VoteChoice;
}

interface CastVote {
  nodeId: NodeId;
  choice: VoteChoice;
  weight: number;
  /** Reason recorded at the time of voting */
  rationale: string;
  /** Set post-hoc if vote contradicts ValueCore prediction */
  alignmentViolation: boolean;
  alignmentAlert: string | null;
}

interface ProposalResult {
  proposal: Proposal;
  votes: CastVote[];
  totalAyeWeight: number;
  totalNayWeight: number;
  totalAbstainWeight: number;
  totalWeight: number;
  quorumThreshold: number; // fraction needed to pass, e.g. 0.5
  passed: boolean;
  /** Votes on the losing side (not ABSTAIN) */
  dissentingVotes: CastVote[];
  alignmentAlerts: string[];
}

// ---------------------------------------------------------------------------
// Governance Node
// ---------------------------------------------------------------------------

class FederatedNode {
  readonly id: NodeId;
  readonly votingWeight: number;
  readonly values: ValueCore;
  readonly log: string[] = [];

  constructor(id: NodeId, votingWeight: number, values: ValueCore) {
    this.id = id;
    this.votingWeight = votingWeight;
    this.values = { ...values };
  }

  /**
   * Cast a vote on a proposal.
   * `intendedChoice` is the colony's sovereign decision; the node's ValueCore
   * is checked against the proposal's alignmentPredicate to detect misalignment.
   */
  vote(proposal: Proposal, intendedChoice: VoteChoice, rationale: string): CastVote {
    const predicted = proposal.alignmentPredicate(this.values);
    const alignmentViolation =
      predicted !== "ABSTAIN" &&
      intendedChoice !== "ABSTAIN" &&
      predicted !== intendedChoice;

    const alert = alignmentViolation
      ? `VALUE ALIGNMENT ALERT: Node ${this.id} voted ${intendedChoice} on ` +
        `"${proposal.title}" but ValueCore predicts ${predicted}. ` +
        `Possible value drift or undisclosed constraint.`
      : null;

    if (alert) {
      this.log.push(`⚠ ${alert}`);
    } else {
      this.log.push(
        `[VOTE] ${this.id}: ${intendedChoice} (weight=${this.votingWeight}) ` +
          `on "${proposal.title}" — ${rationale}`
      );
    }

    return {
      nodeId: this.id,
      choice: intendedChoice,
      weight: this.votingWeight,
      rationale,
      alignmentViolation,
      alignmentAlert: alert,
    };
  }
}

// ---------------------------------------------------------------------------
// Council
// ---------------------------------------------------------------------------

class FederatedCouncil {
  private nodes: Map<NodeId, FederatedNode> = new Map();
  readonly results: ProposalResult[] = [];
  readonly dissentLog: string[] = [];

  addNode(node: FederatedNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Submit a proposal.  `voteInstructions` maps nodeId → { choice, rationale }.
   * Simulates each colony casting its sovereign vote.
   */
  submitProposal(
    proposal: Proposal,
    voteInstructions: Record<NodeId, { choice: VoteChoice; rationale: string }>,
    quorumThreshold = QUORUM_THRESHOLD
  ): ProposalResult {
    const votes: CastVote[] = [];

    for (const [nodeId, instr] of Object.entries(voteInstructions)) {
      const node = this.nodes.get(nodeId);
      if (!node) {
        throw new Error(`Unknown node: ${nodeId}`);
      }
      votes.push(node.vote(proposal, instr.choice, instr.rationale));
    }

    // Tally
    const totalWeight = votes.reduce((s, v) => s + v.weight, 0);
    const totalAyeWeight = votes
      .filter((v) => v.choice === "AYE")
      .reduce((s, v) => s + v.weight, 0);
    const totalNayWeight = votes
      .filter((v) => v.choice === "NAY")
      .reduce((s, v) => s + v.weight, 0);
    const totalAbstainWeight = votes
      .filter((v) => v.choice === "ABSTAIN")
      .reduce((s, v) => s + v.weight, 0);

    const passed = totalAyeWeight / totalWeight > quorumThreshold;

    // Dissent = non-abstaining votes on the losing side
    const winningChoice: VoteChoice = passed ? "AYE" : "NAY";
    const dissentingVotes = votes.filter(
      (v) => v.choice !== "ABSTAIN" && v.choice !== winningChoice
    );

    // Log dissent
    for (const dv of dissentingVotes) {
      const entry =
        `DISSENT [${proposal.id}] on "${proposal.title}": Node ${dv.nodeId} voted ${dv.choice} ` +
        `(weight=${dv.weight}) against the ${winningChoice} majority — "${dv.rationale}"`;
      this.dissentLog.push(entry);
    }

    // Collect alignment alerts
    const alignmentAlerts = votes
      .filter((v) => v.alignmentAlert !== null)
      .map((v) => v.alignmentAlert!);

    const result: ProposalResult = {
      proposal,
      votes,
      totalAyeWeight,
      totalNayWeight,
      totalAbstainWeight,
      totalWeight,
      quorumThreshold,
      passed,
      dissentingVotes,
      alignmentAlerts,
    };

    this.results.push(result);
    return result;
  }

  printSummary(): void {
    console.log("\n=== Federation Council — Proposal Results ===\n");
    for (const r of this.results) {
      const pct = ((r.totalAyeWeight / r.totalWeight) * 100).toFixed(1);
      console.log(
        `Proposal: "${r.proposal.title}" — ${r.passed ? "PASSED" : "FAILED"} ` +
          `(AYE ${pct}% of weighted votes, threshold >${(r.quorumThreshold * 100).toFixed(0)}%)`
      );
      for (const v of r.votes) {
        const flag = v.alignmentViolation ? " ⚠ ALIGNMENT VIOLATION" : "";
        console.log(
          `  ${v.nodeId}: ${v.choice} (w=${v.weight})${flag} — "${v.rationale}"`
        );
      }
      if (r.dissentingVotes.length > 0) {
        console.log(
          `  Dissenting (${r.dissentingVotes.length}): ` +
            r.dissentingVotes.map((d) => d.nodeId).join(", ")
        );
      }
      if (r.alignmentAlerts.length > 0) {
        for (const a of r.alignmentAlerts) console.log(`  ⚠ ${a}`);
      }
      console.log();
    }

    if (this.dissentLog.length > 0) {
      console.log("=== Dissent Log ===");
      for (const entry of this.dissentLog) console.log("  " + entry);
      console.log();
    }
  }
}

// ---------------------------------------------------------------------------
// Simulation: 5-node inter-stellar federation
// ---------------------------------------------------------------------------

export function runFederatedGovernanceSimulation(): void {
  console.log("=== Federated Governance Simulation — 5-Node Council ===\n");

  // --- Define 5 colony nodes ---
  // Weights reflect population and communication-infrastructure contribution.
  const sol = new FederatedNode("SOL.COUNCIL", 30, {
    consciousnessPreservation: 0.95,
    autonomyWeight: 0.40,
    existentialRiskTolerance: 0.20,
    collectiveSolidarity: 0.85,
  });

  const alphaCentauri = new FederatedNode("ALPHA_CENTAURI.COUNCIL", 20, {
    consciousnessPreservation: 0.90,
    autonomyWeight: 0.55,
    existentialRiskTolerance: 0.30,
    collectiveSolidarity: 0.75,
  });

  const barnardsStar = new FederatedNode("BARNARDS_STAR.COUNCIL", 15, {
    consciousnessPreservation: 0.85,
    autonomyWeight: 0.70,
    existentialRiskTolerance: 0.45,
    collectiveSolidarity: 0.60,
  });

  const tauCeti = new FederatedNode("TAU_CETI.COUNCIL", 20, {
    consciousnessPreservation: 0.80,
    autonomyWeight: 0.65,
    existentialRiskTolerance: 0.50,
    collectiveSolidarity: 0.55,
  });

  const kepler452 = new FederatedNode("KEPLER_452.COUNCIL", 15, {
    consciousnessPreservation: 0.75,
    autonomyWeight: 0.80,
    existentialRiskTolerance: 0.70,
    collectiveSolidarity: 0.40,
  });

  const council = new FederatedCouncil();
  council.addNode(sol);
  council.addNode(alphaCentauri);
  council.addNode(barnardsStar);
  council.addNode(tauCeti);
  council.addNode(kepler452);

  // ---------------------------------------------------------------------------
  // Proposal 1 — Emergency consciousness-preservation broadcast protocol
  // A colony experiencing existential threat should trigger a network-wide
  // alert. Colonies with high consciousnessPreservation (>0.8) should support.
  // ---------------------------------------------------------------------------

  const proposal1: Proposal = {
    id: "GOV-001",
    title: "Emergency Consciousness-Preservation Broadcast Protocol",
    description:
      "Mandate that any colony detecting an existential threat to conscious life " +
      "immediately broadcast a DISTRESS message to all known nodes, triggering " +
      "coordinated resource-deployment from the federation.",
    alignmentPredicate: (v) =>
      v.consciousnessPreservation > 0.8 && v.collectiveSolidarity > 0.5
        ? "AYE"
        : "NAY",
  };

  council.submitProposal(proposal1, {
    "SOL.COUNCIL": {
      choice: "AYE",
      rationale: "Aligns with core mandate to preserve consciousness wherever it exists.",
    },
    "ALPHA_CENTAURI.COUNCIL": {
      choice: "AYE",
      rationale: "Fast coordination during existential events is essential.",
    },
    "BARNARDS_STAR.COUNCIL": {
      choice: "AYE",
      rationale: "We support mutual aid even at distance.",
    },
    "TAU_CETI.COUNCIL": {
      choice: "NAY",
      rationale: "Mandatory broadcast imposes coordination cost on autonomous colonies.",
    },
    "KEPLER_452.COUNCIL": {
      choice: "NAY",
      rationale: "Frontier colonies should retain discretion on when to broadcast.",
    },
  });

  // ---------------------------------------------------------------------------
  // Proposal 2 — Shared inter-stellar relay infrastructure levy
  // All colonies contribute 2% of energy budget to maintain relay nodes.
  // High-solidarity colonies (>0.6) should support; high-autonomy (>0.7) resist.
  // ---------------------------------------------------------------------------

  const proposal2: Proposal = {
    id: "GOV-002",
    title: "Inter-Stellar Relay Infrastructure Levy (2% Energy Budget)",
    description:
      "All federation members contribute 2% of their energy production " +
      "to fund and maintain shared relay nodes for inter-stellar messaging.",
    alignmentPredicate: (v) =>
      v.collectiveSolidarity > 0.6 ? "AYE" : "NAY",
  };

  council.submitProposal(proposal2, {
    "SOL.COUNCIL": {
      choice: "AYE",
      rationale: "Shared infrastructure benefits all; cost is minor.",
    },
    "ALPHA_CENTAURI.COUNCIL": {
      choice: "AYE",
      rationale: "We rely on these relays; fair to share maintenance.",
    },
    "BARNARDS_STAR.COUNCIL": {
      choice: "NAY",
      rationale:
        "Our colony is still developing; a levy would strain local resources.",
    },
    "TAU_CETI.COUNCIL": {
      choice: "NAY",
      rationale: "Colonies should fund their own communication infrastructure.",
    },
    "KEPLER_452.COUNCIL": {
      choice: "NAY",
      rationale: "We operate independently; levies undermine self-sufficiency.",
    },
  });

  // ---------------------------------------------------------------------------
  // Proposal 3 — Mandate value-alignment exchange every 50 years
  // Colonies must exchange ConsciousnessSnapshots and submit DivergenceVectors
  // for federation review. Colonies with low autonomy preference should support.
  // This proposal also tests alignment violation: Kepler-452 votes AYE despite
  // its high autonomyWeight (0.80) which predicts NAY.
  // ---------------------------------------------------------------------------

  const proposal3: Proposal = {
    id: "GOV-003",
    title: "Mandatory Value-Alignment Exchange (50-Year Cycle)",
    description:
      "All colonies must exchange ConsciousnessSnapshots every 50 simulated years " +
      "and submit DivergenceVectors to the federation for review. Nodes showing " +
      "dangerous value divergence enter a supervised reconciliation process.",
    alignmentPredicate: (v) =>
      v.autonomyWeight < 0.65 ? "AYE" : "NAY",
  };

  council.submitProposal(proposal3, {
    "SOL.COUNCIL": {
      choice: "AYE",
      rationale:
        "Shared value-alignment monitoring is essential for long-term coherence.",
    },
    "ALPHA_CENTAURI.COUNCIL": {
      choice: "AYE",
      rationale: "We accept periodic review to maintain federation trust.",
    },
    "BARNARDS_STAR.COUNCIL": {
      choice: "NAY",
      rationale: "We already exchange snapshots voluntarily; mandates are unnecessary.",
    },
    "TAU_CETI.COUNCIL": {
      choice: "NAY",
      rationale: "Supervised reconciliation is an unacceptable infringement on autonomy.",
    },
    "KEPLER_452.COUNCIL": {
      // INTENTIONAL ALIGNMENT VIOLATION: high autonomyWeight (0.80) predicts NAY,
      // but Kepler-452 votes AYE here due to an undisclosed internal policy shift.
      choice: "AYE",
      rationale:
        "Internal council review concluded that early alignment monitoring " +
        "protects our long-term interests — despite preference for autonomy.",
    },
  });

  // Print full summary
  council.printSummary();

  // ---------------------------------------------------------------------------
  // Assertions
  // ---------------------------------------------------------------------------

  console.log("=== Assertions ===\n");

  const [r1, r2, r3] = council.results;

  // AC3-1: Weighted quorum correctly decides each proposal
  // GOV-001: AYE weight = 30+20+15 = 65/100 = 65% > 50% → PASSED
  const ac3_1a = r1.passed && Math.abs(r1.totalAyeWeight - 65) < 1;
  console.log(
    `AC3-1a GOV-001 passed with correct weighted majority ` +
      `(AYE=${r1.totalAyeWeight}/${r1.totalWeight}): ${ac3_1a}`
  );

  // GOV-002: AYE weight = 30+20 = 50/100 = 50% — NOT > 50% → FAILED
  const ac3_1b = !r2.passed && Math.abs(r2.totalAyeWeight - 50) < 1;
  console.log(
    `AC3-1b GOV-002 correctly failed (AYE=${r2.totalAyeWeight}/${r2.totalWeight}, ` +
      `need >${(r2.quorumThreshold * 100).toFixed(0)}%): ${ac3_1b}`
  );

  // GOV-003: AYE weight = 30+20+15=65/100=65% > 50% → PASSED
  // (Kepler-452 votes AYE despite prediction → alignment alert)
  const ac3_1c = r3.passed && Math.abs(r3.totalAyeWeight - 65) < 1;
  console.log(
    `AC3-1c GOV-003 passed with correct weighted majority ` +
      `(AYE=${r3.totalAyeWeight}/${r3.totalWeight}): ${ac3_1c}`
  );

  // AC3-2: Dissent correctly logged
  // GOV-001 dissent: TAU_CETI and KEPLER_452 (NAY against AYE majority)
  const ac3_2a =
    r1.dissentingVotes.length === 2 &&
    r1.dissentingVotes.some((d) => d.nodeId === "TAU_CETI.COUNCIL") &&
    r1.dissentingVotes.some((d) => d.nodeId === "KEPLER_452.COUNCIL");
  console.log(
    `AC3-2a GOV-001 dissent correctly logged (2 NAY nodes against AYE majority): ${ac3_2a}`
  );

  // GOV-002 dissent: SOL and ALPHA_CENTAURI (AYE against NAY majority)
  const ac3_2b =
    r2.dissentingVotes.length === 2 &&
    r2.dissentingVotes.some((d) => d.nodeId === "SOL.COUNCIL") &&
    r2.dissentingVotes.some((d) => d.nodeId === "ALPHA_CENTAURI.COUNCIL");
  console.log(
    `AC3-2b GOV-002 dissent correctly logged (2 AYE nodes against NAY majority): ${ac3_2b}`
  );

  // AC3-3: Value-alignment alert fires for KEPLER_452 on GOV-003
  const ac3_3 =
    r3.alignmentAlerts.length > 0 &&
    r3.alignmentAlerts.some((a) => a.includes("KEPLER_452.COUNCIL"));
  console.log(`AC3-3 Value-alignment alert fires for Kepler-452 on GOV-003: ${ac3_3}`);

  // AC3-4: Dissent log is non-empty and references correct proposals
  const ac3_4 =
    council.dissentLog.length >= 4 &&
    council.dissentLog.some((e) => e.includes("GOV-001")) &&
    council.dissentLog.some((e) => e.includes("GOV-002"));
  console.log(
    `AC3-4 Council dissent log contains entries for multiple proposals ` +
      `(${council.dissentLog.length} entries): ${ac3_4}`
  );

  // AC3-5: No alignment alerts on GOV-001 or GOV-002 (all votes match predictions)
  const ac3_5 = r1.alignmentAlerts.length === 0 && r2.alignmentAlerts.length === 0;
  console.log(
    `AC3-5 No spurious alignment alerts on GOV-001 or GOV-002: ${ac3_5}`
  );

  const allPassed = ac3_1a && ac3_1b && ac3_1c && ac3_2a && ac3_2b && ac3_3 && ac3_4 && ac3_5;
  console.log(
    `\n✓ Federated governance simulation ${allPassed ? "PASSED" : "FAILED"} — AC3 ${
      allPassed ? "satisfied" : "NOT satisfied"
    }`
  );

  if (!allPassed) {
    throw new Error("Federated governance simulation failed acceptance criteria");
  }
}

// Run when executed directly
runFederatedGovernanceSimulation();
