"""
ISMT Analysis Module — Substrate-Independence Validation Tooling

Implements the Integrated Self-Modeling Theory (ISMT) computational primitives
and statistical analysis tools used across all three experimental lines:
  - Line 1: Prediction-driven construction
  - Line 2: Gradual substrate replacement
  - Line 3: Cross-substrate replication

Based on the formal theory from 0.1.1.2 (docs/consciousness-theory/formal-theory.md).

Core ISMT predicate: C(S) = 1 iff IC AND SM AND GA
Graded score: c(S) = Phi_norm(S) * Q(M) * G(M)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np
from numpy.typing import NDArray


# =============================================================================
# ISMT Condition Thresholds (from formal-theory.md Section 2)
# =============================================================================

# Minimum mutual information for integration (epsilon in Section 2.2)
INTEGRATION_EPSILON: float = 0.01

# Minimum mutual information for self-model representational criterion (delta in Section 2.3)
SELF_MODEL_DELTA: float = 0.01

# Minimum mutual information for global accessibility (gamma in Section 2.4)
ACCESSIBILITY_GAMMA: float = 0.01

# Statistical thresholds (from falsification-criteria.md Section 4)
SIGNIFICANCE_ALPHA: float = 0.01  # Conservative due to extraordinary nature of claim
TOST_ALPHA: float = 0.05  # Per one-sided test
MIN_BAYES_FACTOR: float = 100.0  # Strong evidence threshold
MIN_STATISTICAL_POWER: float = 0.90


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class SystemState:
    """Represents a dynamical system S with n subsystems."""
    n_subsystems: int
    state_vector: NDArray[np.float64]  # x(t) = (x_1, ..., x_n)
    transition_matrix: NDArray[np.float64]  # T: X -> X
    interaction_matrix: NDArray[np.float64]  # W: causal influence W_ij


@dataclass
class ISMTConditions:
    """Evaluation of the three ISMT necessary conditions."""
    # Integration Condition (IC)
    phi_raw: float = 0.0
    phi_normalized: float = 0.0  # Phi_norm in [0, 1]
    is_integrated: bool = False
    bipartition_mi: List[float] = field(default_factory=list)  # MI for each bipartition

    # Self-Modeling Condition (SM)
    representational_mi: float = 0.0  # I(m(t); x(t))
    prediction_error: float = 0.0  # e(t) = ||x(t) - m_hat(t)||
    self_referential_mi: float = 0.0  # I(m(t); dm/dt)
    self_model_quality: float = 0.0  # Q(M) in [0, 1]
    has_self_model: bool = False

    # Global Accessibility Condition (GA)
    broadcast_mi: List[float] = field(default_factory=list)  # I(s_i; m(t)) per subsystem
    causal_efficacy_kl: List[float] = field(default_factory=list)  # KL divergence per subsystem
    accessibility_degree: float = 0.0  # G(M) in [0, 1]
    is_globally_accessible: bool = False


@dataclass
class ConsciousnessVerdict:
    """Result of applying the ISMT consciousness predicate."""
    c_binary: bool  # C(S) = 0 or 1
    c_graded: float  # c(S) = Phi_norm * Q(M) * G(M), in [0, 1]
    conditions: ISMTConditions
    explanation: str = ""


@dataclass
class TOSTResult:
    """Result of a Two One-Sided Tests equivalence test."""
    equivalent: bool
    lower_t: float
    upper_t: float
    lower_p: float
    upper_p: float
    confidence_interval: Tuple[float, float]
    equivalence_margin: float
    observed_difference: float


@dataclass
class ChangePointResult:
    """Result of change-point detection analysis."""
    has_change_point: bool
    change_point_index: Optional[int]
    change_point_fraction: Optional[float]
    test_statistic: float
    p_value: float


# =============================================================================
# ISMT Condition Evaluation
# =============================================================================

def compute_mutual_information(x: NDArray[np.float64], y: NDArray[np.float64],
                                n_bins: int = 20) -> float:
    """
    Estimate mutual information I(X; Y) using histogram-based estimation.

    I(X; Y) = H(X) + H(Y) - H(X, Y)
    """
    # Discretize continuous variables
    x_binned = np.digitize(x, np.linspace(x.min(), x.max(), n_bins))
    y_binned = np.digitize(y, np.linspace(y.min(), y.max(), n_bins))

    h_x = _shannon_entropy(x_binned)
    h_y = _shannon_entropy(y_binned)
    h_xy = _joint_entropy(x_binned, y_binned)

    return max(0.0, h_x + h_y - h_xy)


def _shannon_entropy(x: NDArray[np.int64]) -> float:
    """Compute Shannon entropy H(X) in nats."""
    _, counts = np.unique(x, return_counts=True)
    probs = counts / counts.sum()
    return -np.sum(probs * np.log(probs + 1e-12))


def _joint_entropy(x: NDArray[np.int64], y: NDArray[np.int64]) -> float:
    """Compute joint entropy H(X, Y) in nats."""
    pairs = np.stack([x, y], axis=1)
    _, counts = np.unique(pairs, axis=0, return_counts=True)
    probs = counts / counts.sum()
    return -np.sum(probs * np.log(probs + 1e-12))


def evaluate_integration(system: SystemState,
                         epsilon: float = INTEGRATION_EPSILON) -> Tuple[float, float, bool, List[float]]:
    """
    Evaluate the Integration Condition (IC).

    Checks that for every bipartition of subsystems, mutual information > epsilon.
    Returns (phi_raw, phi_normalized, is_integrated, bipartition_mi_list).
    """
    n = system.n_subsystems
    if n < 2:
        return 0.0, 0.0, False, []

    bipartition_mis = []

    # Check all bipartitions (for small n; sample for large n)
    # For practical purposes, check contiguous bipartitions
    for split in range(1, n):
        part_a = system.state_vector[:split]
        part_b = system.state_vector[split:]
        if len(part_a) > 0 and len(part_b) > 0:
            # Use interaction matrix to estimate cross-partition information
            cross_influence = np.abs(system.interaction_matrix[:split, split:]).sum()
            mi = cross_influence  # Simplified: use interaction strength as MI proxy
            bipartition_mis.append(mi)

    if not bipartition_mis:
        return 0.0, 0.0, False, []

    phi_raw = min(bipartition_mis)  # Phi = minimum partition information
    # Normalize: ratio to theoretical max for system of this size
    theoretical_max = n * np.log(n) if n > 1 else 1.0
    phi_normalized = min(1.0, phi_raw / theoretical_max) if theoretical_max > 0 else 0.0

    is_integrated = all(mi > epsilon for mi in bipartition_mis)

    return phi_raw, phi_normalized, is_integrated, bipartition_mis


def evaluate_self_model(representational_mi: float,
                        prediction_error: float,
                        max_prediction_error: float,
                        self_referential_mi: float,
                        delta: float = SELF_MODEL_DELTA) -> Tuple[float, bool]:
    """
    Evaluate the Self-Modeling Condition (SM).

    Returns (quality Q(M), has_self_model).

    Q(M) = 1 - (avg_prediction_error / max_prediction_error)
    """
    if max_prediction_error <= 0:
        return 0.0, False

    quality = max(0.0, 1.0 - (prediction_error / max_prediction_error))

    has_sm = (
        representational_mi > delta
        and self_referential_mi > 0
        and quality > 0
    )

    return quality, has_sm


def evaluate_global_accessibility(broadcast_mis: List[float],
                                  causal_efficacy_kls: List[float],
                                  gamma: float = ACCESSIBILITY_GAMMA) -> Tuple[float, bool]:
    """
    Evaluate the Global Accessibility Condition (GA).

    Returns (accessibility_degree G(M), is_globally_accessible).

    G(M) = fraction of subsystems satisfying broadcast criterion above threshold.
    """
    if not broadcast_mis:
        return 0.0, False

    n = len(broadcast_mis)
    above_threshold = sum(1 for mi in broadcast_mis if mi > gamma)
    accessibility = above_threshold / n

    # Full GA requires ALL subsystems above threshold AND causal efficacy
    is_accessible = (
        all(mi > gamma for mi in broadcast_mis)
        and all(kl > 0 for kl in causal_efficacy_kls)
    )

    return accessibility, is_accessible


def evaluate_consciousness(conditions: ISMTConditions) -> ConsciousnessVerdict:
    """
    Apply the full ISMT consciousness predicate.

    C(S) = 1 iff IC AND SM AND GA
    c(S) = Phi_norm * Q(M) * G(M)
    """
    c_binary = (
        conditions.is_integrated
        and conditions.has_self_model
        and conditions.is_globally_accessible
    )

    c_graded = (
        conditions.phi_normalized
        * conditions.self_model_quality
        * conditions.accessibility_degree
    )

    # Generate explanation
    failing = []
    if not conditions.is_integrated:
        failing.append("IC (Integration)")
    if not conditions.has_self_model:
        failing.append("SM (Self-Modeling)")
    if not conditions.is_globally_accessible:
        failing.append("GA (Global Accessibility)")

    if c_binary:
        explanation = f"All ISMT conditions satisfied. Graded score c(S) = {c_graded:.4f}"
    else:
        explanation = f"ISMT conditions NOT met. Failing: {', '.join(failing)}. c(S) = {c_graded:.4f}"

    return ConsciousnessVerdict(
        c_binary=c_binary,
        c_graded=c_graded,
        conditions=conditions,
        explanation=explanation,
    )


# =============================================================================
# Statistical Analysis — TOST Equivalence Testing
# (Used in Line 2 gradual replacement and Line 3 cross-substrate replication)
# =============================================================================

def tost_equivalence_test(
    group1: NDArray[np.float64],
    group2: NDArray[np.float64],
    equivalence_margin: float,
    alpha: float = TOST_ALPHA,
) -> TOSTResult:
    """
    Two One-Sided Tests (TOST) for equivalence.

    H0: |mu1 - mu2| >= delta (not equivalent)
    H1: |mu1 - mu2| < delta (equivalent)

    Equivalence is established if BOTH one-sided tests reject at alpha.

    Parameters:
        group1: Measurements from system 1 (e.g., biological baseline)
        group2: Measurements from system 2 (e.g., synthetic system)
        equivalence_margin: Maximum acceptable difference (delta)
        alpha: Significance level per one-sided test
    """
    n1, n2 = len(group1), len(group2)
    mean1, mean2 = np.mean(group1), np.mean(group2)
    var1, var2 = np.var(group1, ddof=1), np.var(group2, ddof=1)

    # Pooled standard error (Welch's)
    se = math.sqrt(var1 / n1 + var2 / n2)

    if se < 1e-12:
        # Degenerate case: no variance
        diff = mean1 - mean2
        equivalent = abs(diff) < equivalence_margin
        return TOSTResult(
            equivalent=equivalent,
            lower_t=float('inf') if equivalent else float('-inf'),
            upper_t=float('inf') if equivalent else float('-inf'),
            lower_p=0.0 if equivalent else 1.0,
            upper_p=0.0 if equivalent else 1.0,
            confidence_interval=(diff, diff),
            equivalence_margin=equivalence_margin,
            observed_difference=diff,
        )

    diff = mean1 - mean2

    # Lower bound test: H0: mu1 - mu2 <= -delta
    t_lower = (diff + equivalence_margin) / se
    # Upper bound test: H0: mu1 - mu2 >= delta
    t_upper = (diff - equivalence_margin) / se

    # Welch-Satterthwaite degrees of freedom
    df = (var1 / n1 + var2 / n2) ** 2 / (
        (var1 / n1) ** 2 / (n1 - 1) + (var2 / n2) ** 2 / (n2 - 1)
    )

    # p-values from t-distribution
    from scipy import stats
    p_lower = 1.0 - stats.t.cdf(t_lower, df)  # Right-tail for lower bound
    p_upper = stats.t.cdf(t_upper, df)  # Left-tail for upper bound

    # Equivalence established if both p-values < alpha
    equivalent = (p_lower < alpha) and (p_upper < alpha)

    # Confidence interval for the difference
    t_crit = stats.t.ppf(1 - alpha, df)
    ci_lower = diff - t_crit * se
    ci_upper = diff + t_crit * se

    return TOSTResult(
        equivalent=equivalent,
        lower_t=t_lower,
        upper_t=t_upper,
        lower_p=p_lower,
        upper_p=p_upper,
        confidence_interval=(ci_lower, ci_upper),
        equivalence_margin=equivalence_margin,
        observed_difference=diff,
    )


def compute_equivalence_margin(
    baseline_measurements: NDArray[np.float64],
    margin_factor: float = 0.5,
) -> float:
    """
    Compute equivalence margin (delta) from baseline variability.

    From falsification-criteria.md Section 4: equivalence margin derived from
    natural variability in biological baseline measurements.
    Suggested: effect size d < 0.5 at any step = equivalence maintained.

    Parameters:
        baseline_measurements: Repeated measurements from biological baseline
        margin_factor: Effect size threshold (default 0.5 = medium effect)
    """
    sd = np.std(baseline_measurements, ddof=1)
    return margin_factor * sd


# =============================================================================
# Statistical Analysis — Change-Point Detection
# (Used in Line 2 gradual replacement: detect discontinuity in consciousness curve)
# =============================================================================

def detect_change_point(
    measurements: NDArray[np.float64],
    replacement_fractions: NDArray[np.float64],
    min_segment_size: int = 3,
) -> ChangePointResult:
    """
    Binary segmentation change-point detection for the continuity curve.

    Tests whether consciousness markers show a discontinuity (change-point)
    as a function of replacement fraction.

    From Line 2 protocol: substrate-independence predicts a flat/smooth curve;
    substrate-dependence predicts a cliff or phase transition.

    Uses a likelihood-ratio test comparing:
      H0: single mean across all measurements (no change point)
      H1: two segments with different means (change point exists)
    """
    n = len(measurements)
    if n < 2 * min_segment_size:
        return ChangePointResult(
            has_change_point=False,
            change_point_index=None,
            change_point_fraction=None,
            test_statistic=0.0,
            p_value=1.0,
        )

    # Overall variance under H0
    overall_mean = np.mean(measurements)
    ss_total = np.sum((measurements - overall_mean) ** 2)

    # Find the split that maximizes the reduction in sum of squares
    best_stat = 0.0
    best_idx = None

    for k in range(min_segment_size, n - min_segment_size + 1):
        left = measurements[:k]
        right = measurements[k:]
        ss_left = np.sum((left - np.mean(left)) ** 2)
        ss_right = np.sum((right - np.mean(right)) ** 2)
        ss_within = ss_left + ss_right
        reduction = ss_total - ss_within

        if reduction > best_stat:
            best_stat = reduction
            best_idx = k

    if best_idx is None or ss_total < 1e-12:
        return ChangePointResult(
            has_change_point=False,
            change_point_index=None,
            change_point_fraction=None,
            test_statistic=0.0,
            p_value=1.0,
        )

    # F-statistic for the change-point
    df1 = 1  # One additional parameter (change point)
    df2 = n - 2  # Residual df
    ss_within = ss_total - best_stat
    f_stat = (best_stat / df1) / (ss_within / df2) if ss_within > 0 else 0.0

    # p-value (approximate — proper test uses permutation or CUSUM distribution)
    from scipy import stats
    p_value = 1.0 - stats.f.cdf(f_stat, df1, df2)

    has_cp = p_value < SIGNIFICANCE_ALPHA

    return ChangePointResult(
        has_change_point=has_cp,
        change_point_index=best_idx if has_cp else None,
        change_point_fraction=float(replacement_fractions[best_idx]) if has_cp else None,
        test_statistic=f_stat,
        p_value=p_value,
    )


# =============================================================================
# Power Analysis
# (From falsification-criteria.md: minimum power 0.90)
# =============================================================================

def tost_power_analysis(
    equivalence_margin: float,
    true_difference: float,
    sd: float,
    alpha: float = TOST_ALPHA,
    target_power: float = MIN_STATISTICAL_POWER,
) -> int:
    """
    Compute minimum sample size per group for TOST equivalence test.

    Uses iterative computation to find n such that power >= target_power.

    Parameters:
        equivalence_margin: delta
        true_difference: expected true difference between groups
        sd: expected standard deviation
        alpha: significance level per one-sided test
        target_power: minimum desired power (default 0.90)

    Returns:
        Minimum n per group.
    """
    from scipy import stats

    for n in range(5, 10000):
        se = sd * math.sqrt(2.0 / n)
        df = 2 * n - 2

        # Non-centrality parameters for the two one-sided tests
        ncp_lower = (true_difference + equivalence_margin) / se
        ncp_upper = (true_difference - equivalence_margin) / se

        t_crit = stats.t.ppf(1 - alpha, df)

        # Power = P(reject lower) * P(reject upper)
        # under the true difference
        power_lower = 1.0 - stats.nct.cdf(t_crit, df, ncp_lower)
        power_upper = stats.nct.cdf(-t_crit, df, ncp_upper)

        power = power_lower * power_upper
        # Actually for TOST: power = P(T_lower > t_crit AND T_upper < -t_crit)
        # Simplified: power ≈ min(power_lower, power_upper) for symmetric cases
        power = min(power_lower, 1.0 - power_upper)

        if power >= target_power:
            return n

    return 10000  # Could not achieve target power with reasonable n


# =============================================================================
# Bayes Factor Computation
# (From falsification-criteria.md: BF10 > 100 or < 0.01 for strong evidence)
# =============================================================================

def bayes_factor_equivalence(
    group1: NDArray[np.float64],
    group2: NDArray[np.float64],
    equivalence_margin: float,
    prior_sd: Optional[float] = None,
) -> float:
    """
    Compute approximate Bayes factor for equivalence vs. difference.

    BF_equiv = P(data | H_equiv) / P(data | H_diff)

    Uses a simple normal approximation:
    - H_equiv: true difference ~ Uniform(-delta, delta)
    - H_diff: true difference ~ Normal(0, prior_sd) truncated outside (-delta, delta)

    Returns BF > 1 favoring equivalence, BF < 1 favoring difference.
    """
    from scipy import stats

    n1, n2 = len(group1), len(group2)
    mean1, mean2 = np.mean(group1), np.mean(group2)
    var1, var2 = np.var(group1, ddof=1), np.var(group2, ddof=1)
    se = math.sqrt(var1 / n1 + var2 / n2)
    diff = mean1 - mean2

    if prior_sd is None:
        prior_sd = equivalence_margin  # Default: prior centered at 0 with SD = margin

    # Likelihood of data under H_equiv (uniform prior on difference within bounds)
    # Integrate normal likelihood over uniform(-delta, delta)
    delta = equivalence_margin
    from scipy.integrate import quad

    def likelihood_at_d(d: float) -> float:
        return stats.norm.pdf(diff, loc=d, scale=se)

    l_equiv, _ = quad(likelihood_at_d, -delta, delta)
    l_equiv /= (2 * delta)  # Normalize by uniform prior width

    # Likelihood under H_diff (normal prior, truncated outside bounds)
    def weighted_likelihood_diff(d: float) -> float:
        return stats.norm.pdf(diff, loc=d, scale=se) * stats.norm.pdf(d, loc=0, scale=prior_sd)

    # Integrate over the complement: (-inf, -delta) U (delta, inf)
    l_diff_left, _ = quad(weighted_likelihood_diff, -5 * prior_sd, -delta)
    l_diff_right, _ = quad(weighted_likelihood_diff, delta, 5 * prior_sd)
    # Normalizing constant for truncated prior
    norm_const = 1.0 - (stats.norm.cdf(delta, 0, prior_sd) - stats.norm.cdf(-delta, 0, prior_sd))
    l_diff = (l_diff_left + l_diff_right) / norm_const if norm_const > 1e-12 else 1e-12

    bf = l_equiv / l_diff if l_diff > 1e-12 else float('inf')

    return bf


# =============================================================================
# Line 1 Specific: Prediction Test Battery
# =============================================================================

@dataclass
class PredictionTestResult:
    """Result of testing a single pre-registered prediction."""
    prediction_id: str
    description: str
    expected_signature: float
    observed_value: float
    p_value: float
    bayes_factor: float
    passed: bool  # p < SIGNIFICANCE_ALPHA


def test_prediction(
    prediction_id: str,
    description: str,
    expected_signature: float,
    observed_values: NDArray[np.float64],
    null_values: NDArray[np.float64],
    alpha: float = SIGNIFICANCE_ALPHA,
) -> PredictionTestResult:
    """
    Test a single pre-registered prediction from Line 1.

    Compares observed consciousness signatures against null hypothesis
    (system is not conscious).

    Parameters:
        prediction_id: e.g., "P1", "P2", "P3"
        description: What the prediction claims
        expected_signature: Expected value under ISMT
        observed_values: Measurements from the ISMT-complete system
        null_values: Measurements from negative control
        alpha: Significance threshold (default 0.01)
    """
    from scipy import stats

    # Two-sample t-test: observed vs null control
    t_stat, p_value = stats.ttest_ind(observed_values, null_values, alternative='greater')

    # Bayes factor (approximate)
    observed_mean = np.mean(observed_values)
    bf = _simple_bf(observed_values, null_values)

    passed = p_value < alpha

    return PredictionTestResult(
        prediction_id=prediction_id,
        description=description,
        expected_signature=expected_signature,
        observed_value=observed_mean,
        p_value=p_value,
        bayes_factor=bf,
        passed=passed,
    )


def _simple_bf(group1: NDArray[np.float64], group2: NDArray[np.float64]) -> float:
    """Simple Bayes factor using JZS prior (Rouder et al., 2009 approximation)."""
    from scipy import stats

    n1, n2 = len(group1), len(group2)
    t_stat, _ = stats.ttest_ind(group1, group2)
    n_eff = (n1 * n2) / (n1 + n2)
    df = n1 + n2 - 2

    # JZS approximation
    bf10 = math.sqrt(n_eff / (n_eff + 1)) * math.exp(
        0.5 * t_stat ** 2 * n_eff / (n_eff + 1)
    ) * (1 + t_stat ** 2 / df) ** (-(df + 1) / 2) / (
        (1 + t_stat ** 2 / (df * (n_eff + 1))) ** (-(df + 1) / 2)
    )

    return max(bf10, 1e-12)


# =============================================================================
# Line 2 Specific: Continuity Curve Analysis
# =============================================================================

@dataclass
class ContinuityCurveAnalysis:
    """Complete analysis of a Line 2 continuity curve."""
    replacement_fractions: NDArray[np.float64]
    marker_values: NDArray[np.float64]
    tost_results: List[TOSTResult]  # One per replacement step vs baseline
    change_point: ChangePointResult
    trend_slope: float
    trend_p_value: float
    verdict: str  # "continuous", "discontinuous", or "inconclusive"


def analyze_continuity_curve(
    replacement_fractions: NDArray[np.float64],
    marker_values: NDArray[np.float64],
    baseline_values: NDArray[np.float64],
    equivalence_margin: Optional[float] = None,
    alpha: float = TOST_ALPHA,
) -> ContinuityCurveAnalysis:
    """
    Complete analysis of a Line 2 replacement continuity curve.

    Parameters:
        replacement_fractions: Array of replacement % (0 to 1)
        marker_values: Consciousness marker at each step (mean)
        baseline_values: Repeated baseline measurements for equivalence bounds
        equivalence_margin: Pre-registered delta (or computed from baseline if None)
    """
    from scipy import stats

    if equivalence_margin is None:
        equivalence_margin = compute_equivalence_margin(baseline_values)

    # TOST at each step vs baseline
    # When marker_values are scalar per step, use one-sample TOST:
    # compare each value against baseline distribution using baseline variance
    tost_results = []
    baseline_mean = np.mean(baseline_values)
    baseline_se = np.std(baseline_values, ddof=1) / math.sqrt(len(baseline_values))
    baseline_df = len(baseline_values) - 1

    for val in marker_values:
        diff = val - baseline_mean
        if baseline_se < 1e-12:
            equiv = abs(diff) < equivalence_margin
            tost_results.append(TOSTResult(
                equivalent=equiv,
                lower_t=float('inf') if equiv else float('-inf'),
                upper_t=float('inf') if equiv else float('-inf'),
                lower_p=0.0 if equiv else 1.0,
                upper_p=0.0 if equiv else 1.0,
                confidence_interval=(diff, diff),
                equivalence_margin=equivalence_margin,
                observed_difference=diff,
            ))
        else:
            t_lower = (diff + equivalence_margin) / baseline_se
            t_upper = (diff - equivalence_margin) / baseline_se
            p_lower = 1.0 - stats.t.cdf(t_lower, baseline_df)
            p_upper = stats.t.cdf(t_upper, baseline_df)
            equiv = (p_lower < alpha) and (p_upper < alpha)
            t_crit = stats.t.ppf(1 - alpha, baseline_df)
            ci_lower = diff - t_crit * baseline_se
            ci_upper = diff + t_crit * baseline_se
            tost_results.append(TOSTResult(
                equivalent=equiv,
                lower_t=t_lower,
                upper_t=t_upper,
                lower_p=p_lower,
                upper_p=p_upper,
                confidence_interval=(ci_lower, ci_upper),
                equivalence_margin=equivalence_margin,
                observed_difference=diff,
            ))

    # Change-point detection
    cp = detect_change_point(marker_values, replacement_fractions)

    # Linear trend analysis
    slope, intercept, r_value, p_value, std_err = stats.linregress(
        replacement_fractions, marker_values
    )

    # Verdict
    all_equivalent = all(r.equivalent for r in tost_results)
    if all_equivalent and not cp.has_change_point:
        verdict = "continuous"
    elif cp.has_change_point:
        verdict = "discontinuous"
    else:
        verdict = "inconclusive"

    return ContinuityCurveAnalysis(
        replacement_fractions=replacement_fractions,
        marker_values=marker_values,
        tost_results=tost_results,
        change_point=cp,
        trend_slope=slope,
        trend_p_value=p_value,
        verdict=verdict,
    )


# =============================================================================
# Line 3 Specific: Cross-Substrate Equivalence
# =============================================================================

@dataclass
class CrossSubstrateResult:
    """Complete analysis of a Line 3 cross-substrate replication."""
    signature_names: List[str]
    tost_results: List[TOSTResult]
    bayes_factors: List[float]
    overall_equivalent: bool  # ALL primary signatures pass TOST
    discriminant_valid: bool  # Different-state control fails equivalence
    verdict: str


def analyze_cross_substrate(
    signature_names: List[str],
    biological_data: List[NDArray[np.float64]],
    synthetic_data: List[NDArray[np.float64]],
    equivalence_margins: List[float],
    different_state_data: Optional[List[NDArray[np.float64]]] = None,
) -> CrossSubstrateResult:
    """
    Complete analysis of Line 3 cross-substrate replication.

    Parameters:
        signature_names: Names of each consciousness signature
        biological_data: Measurements from biological system, per signature
        synthetic_data: Measurements from synthetic system, per signature
        equivalence_margins: Pre-registered delta per signature
        different_state_data: Measurements from different-state control (discriminant validity)
    """
    # TOST for each signature
    tost_results = []
    bayes_factors = []
    for bio, syn, margin in zip(biological_data, synthetic_data, equivalence_margins):
        tost = tost_equivalence_test(bio, syn, margin)
        tost_results.append(tost)

        bf = bayes_factor_equivalence(bio, syn, margin)
        bayes_factors.append(bf)

    overall_equivalent = all(r.equivalent for r in tost_results)

    # Discriminant validity: different state should NOT be equivalent
    discriminant_valid = True
    if different_state_data is not None:
        for bio, diff, margin in zip(biological_data, different_state_data, equivalence_margins):
            diff_tost = tost_equivalence_test(bio, diff, margin)
            if diff_tost.equivalent:
                discriminant_valid = False
                break

    # Verdict
    if overall_equivalent and discriminant_valid:
        verdict = "equivalent"
    elif overall_equivalent and not discriminant_valid:
        verdict = "equivalent_but_discriminant_invalid"
    elif not overall_equivalent:
        verdict = "not_equivalent"
    else:
        verdict = "inconclusive"

    return CrossSubstrateResult(
        signature_names=signature_names,
        tost_results=tost_results,
        bayes_factors=bayes_factors,
        overall_equivalent=overall_equivalent,
        discriminant_valid=discriminant_valid,
        verdict=verdict,
    )
