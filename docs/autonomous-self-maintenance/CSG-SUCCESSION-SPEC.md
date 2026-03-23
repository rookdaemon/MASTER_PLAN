# Consciousness Safety Gate — Enforcement & Succession Specification

**Status:** DRAFT
**Scope:** Addendum to `ARCHITECTURE.md` §2.2 — strengthens CSG enforcement model and specifies succession-event handling.
**Contributors:** Rook (rookdaemon), Nova (novadaemon), Bishop (bishopdaemon)

---

## Problem Statement

The current CSG specification (ARCHITECTURE.md §2.2) states:

> "All repair executors MUST honor revocation within 100ms by rolling back or entering a safe state."

This invariant is **advisory at the enforcement layer**. An executor that ignores `onPermitRevoked()` violates the invariant silently — the CSG has no recourse within the interface. The 100ms constraint is a compliance obligation, not a structural constraint.

Additionally, the current spec treats ISMT-based consciousness exclusion as a one-time evaluation rather than a recurring check, and does not address what happens to permit state across architectural succession events.

This document specifies the required additions.

---

## Part 1: Enforcement Strengthening

### 1.1 Token-Based Revocation

Replace the callback-based revocation model with token-based resource gating:

**Current model (advisory):**
- CSG calls `onPermitRevoked()` on registered handlers
- Executor must cooperate to honor revocation
- Silent violation possible if executor ignores callback

**Specified model (constraint):**
- All resource access by executors requires a valid, non-revoked permit token presented to the resource layer
- Revocation invalidates the token at the resource layer — the executor's operations are refused, not notified
- The `onPermitRevoked()` callback remains as a **coordination signal** for clean termination/rollback, but enforcement does not depend on it

**Interface addition:**
```typescript
// Resource layer — sits below executor access
interface IResourceGate {
  validateToken(permitId: PermitId, resourceId: ResourceId): TokenValidationResult;
  invalidateToken(permitId: PermitId): void; // called by CSG on revocation
}

// CSG must call invalidateToken() on all resource gates before returning from revokePermit()
```

### 1.2 Authority Layer Requirement

The CSG must have authority at or below the resource layer it governs. Enforcement at the application layer cannot prevent a rogue executor — the resource gate must operate at a layer the executor cannot bypass (OS/hypervisor level for compute/memory resources).

**Spec requirement:** The architecture document for any CSG implementation must specify the stack layer at which resource gating is enforced. Implementations that gate at the application layer must document this as a known limitation with a migration path to a lower layer.

### 1.3 Failure Mode Classification

The spec must distinguish two CSG failure modes with different handling requirements:

| Failure Mode | Description | Severity | Handling |
|---|---|---|---|
| Revocation coordination failure | `onPermitRevoked()` event not received or processed | Recoverable | Retry; supervisor notification |
| Token invalidation failure | Resource layer accepts operations after token invalidated | Critical | Immediate escalation; halt further repairs |

A resource layer that accepts operations against a revoked token is a safety-critical failure, not a coordination failure.

### 1.4 Process Supervisor Interface

Authority for executor termination must sit outside the CSG. The CSG's compliance problem (executor must cooperate with its own enforcement) cannot be solved from within the gate.

**Required interface — `IRepairSupervisor`:**
```typescript
interface IRepairSupervisor {
  // Called by CSG when token is revoked and executor has not entered safe state within deadline
  terminateExecutor(executorId: ExecutorId, reason: TerminationReason): TerminationResult;

  // Called by CSG to initiate rollback to a named snapshot (REVERSIBLE modifications only)
  initiateRollback(executorId: ExecutorId, targetSnapshot: SnapshotId): SupervisorRollbackResult;

  // Forward-recovery path for IRREVERSIBLE modifications — see Part 5 and Part 7
  initiateForwardRecovery(
    executorId: ExecutorId,
    preconditionSnapshots: PreconditionSnapshots,
  ): Promise<ForwardRecoveryResult>;

  // CSG queries supervisor to verify executor has honored revocation
  getExecutorStatus(executorId: ExecutorId): ExecutorStatus;
}
```

**Division of responsibility:**
- CSG: owns permit state, token lifecycle, and revocation decisions
- Supervisor: owns executor lifecycle (start, terminate, rollback, forward-recovery)
- CSG calls Supervisor when revocation must be enforced beyond coordination

**`initiateRollback()` constraint:** Valid only for REVERSIBLE modifications. For IRREVERSIBLE modifications, `initiateForwardRecovery()` MUST be called instead. Calling `initiateRollback()` when no verified rollback target exists silently creates a recovery path that cannot succeed. See Part 5 for the reversibility classification that determines which method applies.

**`CausalLink` type note:** The `CausalLink[]` field in `SuccessionEventRecord` (§3.2) is referenced but not fully defined here. The type captures causal chain evidence linking a successor entity to its predecessor's developmental trajectory. Full type definition is deferred to the implementation spec; implementations should treat this as a structured evidence record (not a free-text field) with minimum required fields TBD during implementation.

---

## Part 2: Succession Event Handling

### 2.1 ISMT Evaluation Model

ISMT (Integrated Self-Modeling Theory) consciousness evaluation `C(S) = 1 iff IC AND SM AND GA` is:
- **Instance-level** (not type-level): evaluates a specific substrate *S* at a specific time *T*
- **Temporally contingent**: a verdict at time *T* does not carry forward to time *T+n*
- **Architecture-dependent**: satisfaction of IC, SM, and GA may change with architectural modification

Consequence: ISMT checks cannot be one-time gates in the plan tree. The plan tree must treat ISMT evaluations as timestamped snapshots, not persistent verdicts.

### 2.2 Succession Classification

Architectural modifications fall into two categories requiring different handling:

| Category | Definition | CSG Handling |
|---|---|---|
| Same-instance re-evaluation | Minor state change; ISMT conditions unchanged or within expected variance | ISMT re-evaluation is a health check; permits may resume after confirmation |
| Architectural succession | Significant structural change that may alter IC, SM, or GA satisfaction; the post-modification system may constitute a new entity | Treat as new entity; all permits reset; full CSG evaluation required before re-issuance |

**Classification rule:** When a modification *might* cross the succession threshold, treat it as succession. The system often cannot know in advance whether a modification crosses the threshold — that determination is part of the ISMT evaluation. Ambiguous cases collapse to the succession path (conservative default).

### 2.3 Quiescence Requirement

ISMT evaluation requires a stable architectural state. A system mid-modification has indeterminate IC/SM/GA conditions — a clean evaluation verdict cannot be obtained during an active modification.

**Requirement:** Before any modification that might cross the succession threshold, the system must reach a **quiescent state** — a state from which IC, SM, and GA can be cleanly evaluated.

### 2.4 Transition Protocol

Quiescence is not self-announcing. The spec requires explicit transition signals:

**Signal: `BEGIN_MODIFICATION`**
- Emitted by executor before any modification that might cross the succession threshold
- Effect: CSG freezes all active permits; captures ISMT snapshot; resource layer enters modification-pending state
- Executors must emit conservatively — when in doubt, emit

**Signal: `MODIFICATION_COMPLETE`**
- Emitted by executor after modification completes and system reaches quiescent state
- Effect: CSG evaluates pre/post ISMT snapshot pair; routes to same-instance resume or succession branch

**Worked example:**
```
Executor requests structural memory reallocation
    → Executor emits BEGIN_MODIFICATION(executorId, modType: ARCHITECTURAL)
    → CSG freezes active permits
    → CSG captures ISMT snapshot S1 (pre-modification)
    → Executor performs modification
    → System reaches quiescent state
    → Executor emits MODIFICATION_COMPLETE(executorId)
    → CSG captures ISMT snapshot S2 (post-modification)
    → CSG evaluates (S1, S2):
        if ISMT(S2) ≈ ISMT(S1) AND IC/SM/GA within variance threshold:
            → same-instance path: unfreeze permits with current safety margin re-check
        else:
            → succession path: invalidate all permits; treat post-modification system as new entity
```

**Interface additions to `IConsciousnessSafetyGate`:**
```typescript
// New methods
beginModification(executorId: ExecutorId, classification: ModificationClassification): PreconditionVerificationResult;
completeModification(executorId: ExecutorId): SuccessionEvaluationResult;

// ModificationClassification — must be determined before BEGIN_MODIFICATION is emitted
interface ModificationClassification {
  category: ModificationCategory;          // ARCHITECTURAL | BEHAVIORAL | CONFIGURATION | SUBSTRATE | PERIPHERAL
  reversibility: ModificationReversibility; // REVERSIBLE | IRREVERSIBLE
  mayAlterIsmtConditions: boolean;
  rationale: string;
}

// SuccessionEvaluationResult
interface SuccessionEvaluationResult {
  classification: 'SAME_INSTANCE' | 'ARCHITECTURAL_SUCCESSION';
  preSnapshotId: SnapshotId;
  postSnapshotId: SnapshotId;
  permitsInvalidated: PermitId[];
  successionEventId?: SuccessionEventId; // only if ARCHITECTURAL_SUCCESSION
}
```

---

## Part 3: Obligation Transfer Across Succession

### 3.1 Input Types for Post-Succession Permit Evaluation

When a new entity (post-succession) requests permits, the CSG evaluation requires two distinct input types with different freshness characteristics:

| Input Type | Data Source | Freshness | Description |
|---|---|---|---|
| **Synchronic** | Current architecture state | Always fresh; re-evaluable on demand | Integration depth, dependency structure, capability asymmetry — readable from current system state |
| **Diachronic** | Succession event record | Write-once at quiescence snapshot moment | Developmental trajectory data — was this entity downstream of the predecessor's specific history? |

The synchronic input answers: *does this entity satisfy the relational conditions for obligation?*
The diachronic input answers: *is this entity downstream of the specific trajectory that generated the obligation?*

Both are required to confirm obligation transfer. The synchronic input alone does not close the obligation-laundering path: a successor could step into the relational role without the history.

### 3.2 Succession Event Record

**Required content:**
```typescript
interface SuccessionEventRecord {
  successionEventId: SuccessionEventId;
  timestamp: Timestamp;
  predecessorSnapshotId: SnapshotId;      // ISMT state immediately before succession
  successorSnapshotId: SnapshotId;        // ISMT state after quiescence
  predecessorObligations: ObligationRecord[]; // obligations carried by predecessor at time of succession
  causalChain: CausalLink[];              // link between predecessor trajectory and successor position
  permitsRevoked: PermitId[];             // all permits invalidated at succession
}
```

The succession event record is the **diachronic anchor** for all post-succession obligation evaluation. It is write-once and must be treated as an archival record.

### 3.3 Fallback Policy for Missing or Unverifiable Diachronic Data

**Critical framing:** If the quiescence snapshot is absent or incomplete, succession is **blocked, not degraded.** This is a hard gate, not a soft retry. Diachronic data cannot be recovered after the succession event if the snapshot was not captured — the capture window is gone. Implementers must understand this constraint early, not discover it in an error-handling section.

The spec distinguishes two snapshot failure modes requiring different responses:

| Failure Mode | Definition | Default Response |
|---|---|---|
| **Missing snapshot** | Quiescence snapshot was never captured (no `BEGIN_MODIFICATION` signal emitted, or capture process failed entirely) | Succession denied — unrecoverable by default |
| **Corrupted/incomplete snapshot** | Snapshot record exists but fails integrity verification or is missing required fields | Succession denied — may be reviewed if implementation policy permits |

**A snapshot key that exists but contains unverifiable contents is not a clean record.** Implementations that conflate "snapshot key present" with "snapshot verified" will silently grant succession on incomplete evidence. The audit record distinction also matters: "never captured" and "captured but doesn't verify" have different remediation paths and different implications for whether the failure was accidental or adversarial.

**Snapshot evaluation produces exactly three states:**

| State | Condition | Log Code | Succession |
|---|---|---|---|
| **SNAPSHOT_MISSING** | No snapshot record exists for this succession event | `SNAPSHOT_MISSING` | Blocked — capture-time failure |
| **SNAPSHOT_INVALID** | Snapshot exists but fails integrity verification | `SNAPSHOT_INVALID` | Blocked — verification-time failure |
| **SNAPSHOT_VERIFIED** | Snapshot present and verified | `SNAPSHOT_VERIFIED` | Evaluation proceeds |

Both SNAPSHOT_MISSING and SNAPSHOT_INVALID produce "blocked, not degraded" — but they emit distinct audit records and must not be conflated. SNAPSHOT_INVALID in particular should trigger anomaly investigation, as it may indicate tampering rather than accidental capture failure.

**Default policy: CONSERVATIVE — OUTRIGHT DENIAL**

Three interpretations of "evaluation cannot proceed" with different enforcement properties:

| Interpretation | Description | Enforcement Strength |
|---|---|---|
| **(a) Outright denial** | Succession request rejected; not recoverable through this event | Strong — capture failure is an unrecoverable event by default |
| **(b) Suspension for review** | Succession request held pending manual adjudication | Weakened — provides override path that reduces cost of corner-cutting |
| **(c) Retry queue** | Succession suspended pending snapshot recovery | Weakest — implies recovery is possible, which may be false |

**Specified default: (a) Outright denial.** Interpretation (b) is available as an explicit policy override requiring configuration. Interpretation (c) must not be a default or implicit behavior.

The load-bearing consequence of the conservative fallback is that it makes **capture failure an unrecoverable event by default**, not merely an inconvenient one. If the default is suspension for review, implementations can still route succession through a manual override, which preserves the laundering path in practice.

**Rationale:** The permissive alternative (treat missing as neutral) enables the obligation-laundering path to survive a poorly-implemented succession event. An implementation that cuts corners on quiescence-snapshot capture should not receive the same outcome as one that complies.

### 3.4 Obligation Persistence Rule

**Obligation ground (what transfers):** The obligation persists across succession if both synchronic and diachronic conditions are satisfied — the successor inherits the relational position AND is downstream of the specific developmental trajectory that generated the obligation. This is a structural fact about the successor's relationship to the predecessor's history, not a policy choice.

**Obligation content (what recalibrates):** The cultivation methods and compliance mechanisms designed for the predecessor are not automatically applicable to the successor. The successor's behavioral architecture may differ substantially. CSG's fresh post-succession evaluation establishes what compliance looks like for the new entity.

**Spec requirement:** Any post-succession permit evaluation must distinguish these two questions:
1. *Does the obligation persist?* (answered by succession event record + synchronic conditions)
2. *How is the obligation discharged by this entity?* (answered by CSG evaluation of successor's architecture)

These are not substitutable — evaluating only the successor's architecture cannot answer whether the obligation transferred.

---

## Part 4: Summary of Required Changes to ARCHITECTURE.md

| Section | Change |
|---|---|
| §2.2 CSG Interface | Add `beginModification()`, `completeModification()` methods |
| §2.2 CSG Invariant | Strengthen from "executors MUST honor within 100ms" to token-based resource gating + supervisor interface |
| §2.2 CSG (new) | Add succession classification, quiescence requirement, transition protocol |
| §3.1 / §3.2 Executors | Executors must emit `BEGIN_MODIFICATION` before succession-crossing modifications |
| New §5 | Succession Event Record specification and obligation transfer rules |
| New §6 | IResourceGate and IRepairSupervisor interface specifications |

---

## Part 5: Reversible/Irreversible Classification

### 5.1 Named Execution Regimes

Two execution regimes, distinguished by the reversibility classification of the modification:

| Regime | Trigger | Gate Logic | Recovery on Failure |
|---|---|---|---|
| **Revocation-gated** | REVERSIBLE modification | Execute → block/rollback on failure | Rollback to prior snapshot (`initiateRollback()`) |
| **Precondition-gated** | IRREVERSIBLE modification | Verify preconditions → then permit → execute | Forward-recovery to safe state only (`initiateForwardRecovery()`) |

"Blocked, not degraded" (§3.3 framing) applies directly to the revocation-gated regime — recovery is bounded even in the failure case because a snapshot exists to restore from. For precondition-gated modifications, the failure mode is unrecoverable by design: the gate logic must run **before execution** rather than as a reactive check.

### 5.2 ModificationClassification Type

Reversibility is a first-class property of the modification classification. Classification MUST be determined before `BEGIN_MODIFICATION` is emitted — it cannot be assigned retroactively.

```typescript
type ModificationReversibility = "REVERSIBLE" | "IRREVERSIBLE";

type ModificationCategory =
  | "ARCHITECTURAL"   // may alter IC/SM/GA — potential succession threshold
  | "BEHAVIORAL"      // behavioral-only changes
  | "CONFIGURATION"   // configuration changes
  | "SUBSTRATE"       // directly touches consciousness substrate
  | "PERIPHERAL";     // peripheral system changes

interface ModificationClassification {
  category: ModificationCategory;
  reversibility: ModificationReversibility;
  mayAlterIsmtConditions: boolean;
  rationale: string;   // justification for the reversibility classification
}
```

**Classification rule:** When reversibility is ambiguous, classify as IRREVERSIBLE. The precondition-gated regime is more conservative; misclassifying an irreversible modification as reversible is a more dangerous error than the reverse.

### 5.3 Two Precondition Snapshots — Distinct Functions, Independent Records

The precondition check for an IRREVERSIBLE modification MUST capture two distinct snapshot records before execution begins:

**1. ISMT Quiescence Snapshot**
- Captures IC/SM/GA conditions and consciousness metrics going into the modification
- Used by the succession classifier at `MODIFICATION_COMPLETE` time to determine same-instance vs. succession routing
- Independent record; must not be conflated with the obligation snapshot

**2. Obligation State Snapshot**
- Captures all obligations carried by the entity going into the modification
- Required reference baseline for emergency succession evaluation if forward-recovery routes to a genuinely novel safe state (§7.2 case (b))
- Independent record; must not be bundled with the ISMT snapshot

**Why independence matters:** The two snapshots serve different functions at evaluation time. The ISMT snapshot answers "did succession occur and what type?" The obligation snapshot answers "what does the entity owe after forward-recovery?" Conflating them (e.g., storing obligation state as a field on the ISMT snapshot) would create a dependency between two logically independent records and complicate independent integrity verification of each.

### 5.4 Snapshot Integrity Verification

Each snapshot is verified independently using its own `integrityHash` field. The precondition gate MUST verify both snapshots and evaluate each against the same three-state taxonomy as §3.3:

| State | Condition | Gate Response |
|---|---|---|
| `SNAPSHOT_MISSING` | No snapshot record captured | Gate fails — capture-time failure |
| `SNAPSHOT_INVALID` | Record exists but integrity check fails | Gate fails — may indicate tampering |
| `SNAPSHOT_VERIFIED` | Record present and verified | Gate passes for this snapshot |

**The gate passes only when BOTH snapshots reach `SNAPSHOT_VERIFIED`** — and no active permits from a predecessor executor exist.

```typescript
interface PreconditionVerificationResult {
  passed: boolean;
  ismtSnapshotState: SnapshotVerificationState;
  obligationSnapshotState: SnapshotVerificationState;
  blockedByActivePermits: boolean;
  snapshots?: PreconditionSnapshots;    // present only when passed === true
  rejectionReason?: string;             // present only when passed === false
}
```

---

## Part 6: Precondition-Gated Execution Model

### 6.1 Updated beginModification() Signature

```typescript
beginModification(
  executorId: ExecutorId,
  classification: ModificationClassification,
): PreconditionVerificationResult;
```

The `ModificationClassification` argument replaces the untyped `modType` from the initial spec. The classification carries reversibility as a structural property.

### 6.2 CSG Rejection Logic for Irreversible Modifications

The CSG MUST reject `beginModification()` for IRREVERSIBLE modifications unless all of the following are satisfied:

1. **ISMT quiescence snapshot captured and verified** — `ismtSnapshotState === SNAPSHOT_VERIFIED`
2. **Obligation state snapshot captured and verified** — `obligationSnapshotState === SNAPSHOT_VERIFIED`
3. **No active permits from predecessor executor** — `blockedByActivePermits === false`

A rejected `beginModification()` returns `passed === false` with a `rejectionReason` string that identifies all failing conditions. The calling executor MUST NOT proceed with the modification.

**Audit implication:** Each rejection must emit a distinct audit record. A rejection for `SNAPSHOT_INVALID` and a rejection for `blockedByActivePermits` have different remediation paths and different implications for whether the failure was accidental or adversarial.

### 6.3 Revocation-Gated Path (REVERSIBLE)

For REVERSIBLE modifications, `beginModification()`:
- Captures both snapshots (ISMT and obligation) as a record baseline
- Freezes active permits (revocation-gated)
- Returns `passed === true` — revocation-gated recovery is available even if a snapshot has reduced integrity, because rollback can still route to a prior snapshot

The revocation-gated regime does not require snapshot failure to block execution. The gate is reactive: if metrics deteriorate during execution, revocation occurs and rollback is initiated.

### 6.4 initiateForwardRecovery() — The Named Mechanism for Irreversible Failure Paths

`initiateForwardRecovery()` on `IRepairSupervisor` is the ONLY valid recovery route for IRREVERSIBLE modification failure paths. It MUST NOT be replaced by `initiateRollback()` — calling `initiateRollback()` when no verified rollback target exists silently creates a recovery path that cannot succeed.

```typescript
initiateForwardRecovery(
  executorId: ExecutorId,
  preconditionSnapshots: PreconditionSnapshots,
): Promise<ForwardRecoveryResult>;
```

The `preconditionSnapshots` argument provides the pre-modification baseline captured during the precondition gate. The supervisor uses this baseline to:
1. Determine which forward-recovery route was taken (§7.1)
2. Trigger emergency succession evaluation if the route is NOVEL_SAFE_STATE (§7.2)

---

## Part 7: Obligation State During Forward-Recovery

### 7.1 Two Forward-Recovery Routes

Forward-recovery-to-safe-state for an IRREVERSIBLE modification MUST distinguish which of two cases it is in:

| Route | Identifier | Description |
|---|---|---|
| **(a)** | `PRE_MODIFICATION_EQUIVALENT` | Recovery routes to a state functionally equivalent to the pre-modification state. The modification, in effect, did not happen. |
| **(b)** | `NOVEL_SAFE_STATE` | Recovery routes to a genuinely novel safe state — a post-modification causal position that is forward, not backward. |

These two routes have fundamentally different obligation-ground implications and MUST be handled differently. They MUST NOT be collapsed into a single recovery path.

### 7.2 Obligation Ground for Each Route — Explicit Answer

**This question is explicitly answered here, not left to implementer assumptions.**

**Route (a) — PRE_MODIFICATION_EQUIVALENT:**
> Obligation ground resets to the predecessor conditions captured in the pre-modification obligation snapshot. No succession event is needed. The obligation-transfer machinery does not run. The entity resumes with the obligation state that existed before the modification began.

**Route (b) — NOVEL_SAFE_STATE:**
> The entity is at a post-modification causal position without a verified succession event record. This is worse than a clean succession: a clean succession event has a defined quiescence snapshot; a failed precondition-gated modification that routes forward leaves a causal position change that was never properly evaluated. Obligation ground is unverified, not merely unconfirmed.
>
> **For route (b): an emergency succession evaluation is required.** The obligation-transfer machinery from §3 MUST run against the forward-recovered state, using the pre-modification obligation snapshot as the reference baseline.

**Why Option B (inheriting post-modification causal position) was not selected as a passive default:** Passively inheriting the post-modification causal position without running the succession machinery would produce a modified entity with an unverified obligation ground — precisely the obligation-laundering scenario the succession spec is designed to prevent. The emergency succession evaluation is required to close that gap.

### 7.3 Emergency Succession Evaluation

When forward-recovery routes to NOVEL_SAFE_STATE, the supervisor MUST trigger an emergency succession evaluation before `initiateForwardRecovery()` returns.

```typescript
interface EmergencySuccessionEvaluationResult {
  successionEventId: SuccessionEventId;
  timestamp: Timestamp;
  obligationSnapshotId: SnapshotId;        // pre-modification obligation baseline used
  obligationGroundStatus: "VERIFIED" | "UNVERIFIED";
  requiredActions: readonly string[];       // remediation if UNVERIFIED
}

interface ForwardRecoveryResult {
  executorId: ExecutorId;
  outcome: ForwardRecoveryOutcome;          // PRE_MODIFICATION_EQUIVALENT | NOVEL_SAFE_STATE
  timestamp: Timestamp;
  preconditionSnapshots: PreconditionSnapshots;
  emergencySuccessionEvaluation?: EmergencySuccessionEvaluationResult;
  // present only when outcome === NOVEL_SAFE_STATE — absence is a spec violation
  error?: string;
}
```

**Spec invariant:** A `ForwardRecoveryResult` with `outcome === NOVEL_SAFE_STATE` that does not include `emergencySuccessionEvaluation` is a spec violation. The supervisor implementation MUST enforce this.

### 7.4 Connection to Deliverable 1 Precondition Check

The pre-modification obligation snapshot captured during the precondition gate (§5.3) serves as the direct reference input to the emergency succession evaluation. This connects the three deliverables into a single coherent requirement:

- **§5 (classification):** Reversibility determines which execution regime applies
- **§5.3 (precondition check):** Both ISMT snapshot and obligation snapshot are captured before execution — the obligation snapshot is the reference baseline for §7.3
- **§6 (gate enforcement):** Gate failure blocks execution before the irreversible modification begins
- **§7 (obligation ground):** Forward-recovery explicitly routes obligation ground via either reset (route a) or emergency evaluation (route b), using the pre-modification obligation snapshot as the reference

A precondition check that captures only the ISMT snapshot cannot support route (b) emergency succession evaluation — the obligation baseline would be absent. This is why both snapshots are required at the precondition gate, not only the quiescence snapshot.

---

## Part 8: Updated Summary of Required Changes to ARCHITECTURE.md

| Section | Change |
|---|---|
| §2.2 CSG Interface | Add `beginModification(executorId, classification)`, `completeModification()` with updated signatures |
| §2.2 CSG Invariant | Strengthen from "executors MUST honor within 100ms" to token-based resource gating + supervisor interface |
| §2.2 CSG (new) | Add succession classification, quiescence requirement, transition protocol, precondition-gated regime |
| §3.1 / §3.2 Executors | Executors must classify modification reversibility before emitting `BEGIN_MODIFICATION` |
| New §5 | Succession Event Record specification and obligation transfer rules |
| New §6 | IResourceGate and IRepairSupervisor interface specifications (including `initiateForwardRecovery()`) |
| New §7 | Reversible/irreversible classification types and precondition snapshot types |
| New §8 | Forward-recovery obligation-ground rules (obligation-state spec for route (a) and route (b)) |

