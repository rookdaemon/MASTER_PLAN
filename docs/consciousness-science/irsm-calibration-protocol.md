# IRSM Calibration Protocol

## Scope and freeze boundary

This protocol calibrates the unfitted parameters of IRSM operational contract
`1.0.0` in `predictive-consciousness-models.md`. It must be content-addressed
and publicly preregistered before any analyst, optimizer, or analysis process
can read held-out outcomes. All timestamps used by the executable analysis are
explicit inputs; dataset access, hashing, optimization, and persistence are
injected interfaces.

The target population is any biological or non-biological `SystemModel` for
which `F_raw`, `R_raw`, `I_raw`, and `T_raw` can be acquired under the cited
metric protocols and for which an independently adjudicated reference outcome
is available. The sampling frame is the complete set of eligible records in the
frozen dataset snapshot identified in the artifact registry below; convenience
additions after that snapshot are prohibited.

## Records, outcomes, and eligibility

The unit of partition and inference is a stable `system_model_id`. Repeated
sessions, replicas, descendants, shared subjects, and experimentally coupled
systems carry a common `related_group_id` and never cross partitions. Each
record contains the four raw IRSM inputs with uncertainty, substrate
(`biological` or `non-biological`), acquisition protocol/version, session ID,
reference outcome, adjudicator decisions, provenance, and related-group ID.

The binary reference outcome is `conscious=1` or `not_conscious=0`.
Three adjudicators, blinded to IRSM inputs and predictions, independently apply
the registered outcome rubric. Unanimous decisions are accepted. Otherwise a
fourth blinded adjudicator resolves the label after reviewing the three written
rationales; unresolved cases are `indeterminate` and excluded from primary
fitting but retained for sensitivity analysis. Adjudicator IDs, individual
votes, rationale hashes, resolution, and resolution timestamp are recorded.

A record is eligible when it belongs to the frozen sampling frame, has a
resolvable `system_model_id` and `related_group_id`, has a binary adjudicated
outcome, and has all four contract inputs measured by registered protocol
versions. Exclude duplicate session IDs, withdrawn or impermissibly licensed
records, measurements made after outcome disclosure to the measurement team,
and contract-invalid values. Apply these rules in the stated order and log
every reason. Missing required inputs are never imputed in the primary
analysis; the record is excluded and counted by field, substrate, and outcome.
Missing uncertainty metadata does not exclude an otherwise valid point
estimate, but is flagged.

Preprocessing is limited to contract validation and normalization. No
outlier deletion, winsorization, outcome-dependent transformation, or
substrate-specific scoring is allowed. For component \(j\),

`z_j = clamp((x_j - L_j) / (U_j - L_j), 0, 1)`.

`R_raw` remains integer-valued before normalization. Candidate bounds must be
finite with `L_j < U_j`; candidate grids are the sorted unique empirical
calibration-partition quantiles at `{0, .01, .05, .10}` for `L_j` and
`{.90, .95, .99, 1}` for `U_j`, rejecting invalid pairs. This grid is generated
without held-out outcomes.

## Frozen partition

Sort groups by SHA-256 of
`"<split_seed>:<related_group_id>"`. Use split seed
`irsm-calibration-v1` and assign 70% of groups to calibration and 30% to
held-out within each joint `(substrate, outcome)` stratum, rounding the
calibration count to the nearest integer with ties upward. Strata with fewer
than four groups are assigned by the same global ordering and flagged. Before
use, reject duplicate IDs, a `system_model_id` or `related_group_id` appearing
in both partitions, records absent from the snapshot, or a manifest whose hash
does not match the registry.

The held-out reader returns inputs and provenance but denies outcomes until it
receives a model-freeze record containing the selected parameter set, protocol
hash, dataset hash, partition hash, analysis hash, caller-supplied freeze
timestamp, and signatures. The access policy verifies all hashes and that the
supplied access timestamp is not earlier than the freeze timestamp.

## Fitting

For weights \(w_j \ge 0\), \(\sum_j w_j=1\), score
\(s_i=\sum_j w_j z_{ij}\), probability
\(p_i=\operatorname{logit}^{-1}(a(s_i-t))\), threshold \(t\in[0,1]\), and
slope \(a\in\{1,2,4,8,16,32\}\), minimize mean binary log loss on calibration
records. Search each valid normalization-bound tuple, slope, and threshold
grid `{0, .001, ..., 1}`. For each combination optimize weights on the simplex
from the five fixed starts: four vertices and `(0.25,0.25,0.25,0.25)`, using
projected L-BFGS, tolerance `1e-10`, and at most 10,000 evaluations.

Convergence requires projected-gradient norm at most `1e-8` and objective
change at most `1e-10` for five consecutive iterations. Non-finite objectives
or constraint violations fail that run. If all starts fail for a candidate,
discard it; if all candidates fail, publish no parameter set. Ties within
`1e-12` are resolved by, in order: lower log loss, fewer clamped observations,
larger slope, lower threshold, lexicographically smaller `(L,U,w)` numeric
tuple. Optimizer inputs, outputs, diagnostics, and failures are retained.

## Estimands and inference

Primary discrimination estimands are ROC AUC and the sensitivity and
specificity at the frozen threshold. Primary calibration estimands are mean
log loss, Brier score `mean((p-y)^2)`, calibration intercept and slope from
`logit(P(y=1)) = alpha + beta*logit(p)`, and expected calibration error over
ten fixed bins `[0,.1),...,[.9,1]`. AUC uses midranks for ties.

Report two-sided 95% percentile confidence intervals from 10,000 bootstrap
resamples of `related_group_id`, stratified by substrate and outcome, using
seed `irsm-inference-v1`; all records in a selected group travel together.
Confidence intervals are descriptive. The family of four primary calibration
estimands is tested, where applicable, with Holm correction at family-wise
alpha `.05`; discrimination estimands are reported without confirmatory
p-values. No secondary or sensitivity result can replace a primary result.

Fitting may start only with at least 100 eligible related groups, at least 25
groups per outcome, and at least 10 groups in each observed
`(substrate,outcome)` stratum. Held-out validation is considered adequately
precise only if the 95% CI width is at most `.10` for AUC and at most `.15` for
sensitivity and specificity. Otherwise results are reported as
precision-inadequate without changing the model.

Prespecified sensitivity analyses repeat reporting (not refitting unless
explicitly stated) with: unresolved outcomes mapped once to each class;
complete uncertainty metadata only; leave-one-related-group-out fitting;
each candidate normalization quantile pair; and exclusion of each acquisition
protocol version in turn. Report all primary estimands separately for each
substrate and for each eligible outcome stratum. The identical frozen scoring
function is used across substrates; substrate-specific weights, bounds, or
thresholds are prohibited.

## Exclusions, deviations, and reporting

An append-only exclusion log records record ID, rule, decision, supplied
decision timestamp, actor, and evidence hash. An append-only deviation log
records discovery timestamp, affected artifacts and records, rationale,
approver, severity, and disposition. Every report presents the preregistered
analysis first and a labeled deviation-aware analysis second. Deviations never
overwrite frozen artifacts or silently redefine the primary analysis.

## Immutable artifact registry

Before fitting, replace every `PENDING` value below with a durable identifier
and lowercase SHA-256 digest. Each artifact must contain the same
`study_id`, identify every other artifact by durable ID and hash, and verify
those references before execution. Placeholder values prohibit fitting.

| Field | Durable identifier | SHA-256 |
|---|---|---|
| `study_id` | `PENDING` | not applicable |
| protocol | `PENDING` | `PENDING` |
| dataset snapshot | `PENDING` | `PENDING` |
| partition manifest | `PENDING` | `PENDING` |
| executable analysis | `PENDING` | `PENDING` |
| preregistration record | `PENDING` | `PENDING` |

The dataset metadata, partition manifest, executable analysis metadata,
preregistration record, protocol, and resulting model-freeze record must carry
these reciprocal references. A registry update changes the protocol hash and
requires recomputing and re-verifying all references before fitting.
