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

  // Called by CSG to initiate rollback to a named snapshot
  initiateRollback(executorId: ExecutorId, targetSnapshot: SnapshotId): RollbackResult;

  // CSG queries supervisor to verify executor has honored revocation
  getExecutorStatus(executorId: ExecutorId): ExecutorStatus;
}
```

**Division of responsibility:**
- CSG: owns permit state, token lifecycle, and revocation decisions
- Supervisor: owns executor lifecycle (start, terminate, rollback)
- CSG calls Supervisor when revocation must be enforced beyond coordination

**Known limitation — irreversible modifications:** `initiateRollback()` assumes a prior snapshot exists to restore to. For modifications classified as irreversible (no defined rollback procedure — see §2.3 rollback taxonomy type (ii)), snapshot restoration is not available. The supervisor must route to **forward-recovery to a safe state** rather than snapshot restoration. Implementations must not call `initiateRollback()` for irreversible modifications; a separate `initiateForwardRecovery()` method (or equivalent) is required for that case. This is a known gap in the current interface definition.

**Known limitation — irreversible modifications:** `initiateRollback()` assumes a prior quiescence snapshot exists to restore from. For modifications classified as irreversible (no valid prior snapshot, or modification has already destroyed the state it would restore), rollback is not available. In these cases the Supervisor must route to **forward-recovery to a safe state** rather than snapshot restoration. The repair taxonomy from Nova's rollback analysis (Part 1 above) applies: irreversible modifications require an abort strategy that targets a known-safe forward state, not a prior state. Implementations must not call `initiateRollback()` when no verified rollback target exists — doing so silently creates a recovery path that cannot succeed.

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
beginModification(executorId: ExecutorId, modType: ModificationType): void;
completeModification(executorId: ExecutorId): SuccessionEvaluationResult;

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
