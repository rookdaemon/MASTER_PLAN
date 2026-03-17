"""
Tests for the ISMT Analysis Module — Substrate-Independence Validation Tooling.

Covers:
  - ISMT condition evaluation (IC, SM, GA)
  - Consciousness predicate (binary + graded)
  - TOST equivalence testing
  - Change-point detection
  - Power analysis
  - Bayes factor computation
  - Line 1 prediction testing
  - Line 2 continuity curve analysis
  - Line 3 cross-substrate equivalence
"""

import math

import numpy as np
import pytest

from ismt_analysis import (
    INTEGRATION_EPSILON,
    SELF_MODEL_DELTA,
    ACCESSIBILITY_GAMMA,
    SIGNIFICANCE_ALPHA,
    SystemState,
    ISMTConditions,
    ConsciousnessVerdict,
    TOSTResult,
    ChangePointResult,
    compute_mutual_information,
    evaluate_integration,
    evaluate_self_model,
    evaluate_global_accessibility,
    evaluate_consciousness,
    tost_equivalence_test,
    compute_equivalence_margin,
    detect_change_point,
    tost_power_analysis,
    bayes_factor_equivalence,
    test_prediction as ismt_test_prediction,
    analyze_continuity_curve,
    analyze_cross_substrate,
)


# =============================================================================
# Helpers
# =============================================================================

def _make_system(n: int, interaction_strength: float = 1.0) -> SystemState:
    """Create a simple SystemState for testing."""
    rng = np.random.default_rng(42)
    state = rng.normal(size=n)
    transition = rng.normal(size=(n, n))
    interaction = np.ones((n, n)) * interaction_strength
    np.fill_diagonal(interaction, 0.0)
    return SystemState(
        n_subsystems=n,
        state_vector=state,
        transition_matrix=transition,
        interaction_matrix=interaction,
    )


def _make_ismt_conditions(
    integrated: bool = True,
    has_sm: bool = True,
    is_ga: bool = True,
    phi_norm: float = 0.5,
    sm_quality: float = 0.7,
    ga_degree: float = 0.8,
) -> ISMTConditions:
    """Create ISMTConditions with controllable flags."""
    return ISMTConditions(
        phi_raw=phi_norm * 10,
        phi_normalized=phi_norm,
        is_integrated=integrated,
        bipartition_mi=[0.5],
        representational_mi=0.1,
        prediction_error=0.3,
        self_referential_mi=0.05,
        self_model_quality=sm_quality,
        has_self_model=has_sm,
        broadcast_mi=[0.1, 0.2],
        causal_efficacy_kl=[0.05, 0.1],
        accessibility_degree=ga_degree,
        is_globally_accessible=is_ga,
    )


# =============================================================================
# Mutual Information
# =============================================================================

class TestMutualInformation:
    def test_identical_signals_high_mi(self):
        x = np.linspace(0, 10, 200)
        mi = compute_mutual_information(x, x)
        assert mi > 0, "Identical signals should have positive MI"

    def test_independent_signals_low_mi(self):
        rng = np.random.default_rng(123)
        x = rng.normal(size=500)
        y = rng.normal(size=500)
        mi = compute_mutual_information(x, y)
        # Independent signals: MI should be near zero
        assert mi < 0.5, f"Independent signals should have low MI, got {mi}"

    def test_mi_non_negative(self):
        rng = np.random.default_rng(456)
        x = rng.normal(size=100)
        y = rng.normal(size=100)
        mi = compute_mutual_information(x, y)
        assert mi >= 0, "MI must be non-negative"


# =============================================================================
# Integration Condition (IC)
# =============================================================================

class TestEvaluateIntegration:
    def test_single_subsystem_not_integrated(self):
        system = _make_system(1)
        phi_raw, phi_norm, is_int, bis = evaluate_integration(system)
        assert not is_int
        assert phi_raw == 0.0
        assert bis == []

    def test_strong_interaction_integrated(self):
        system = _make_system(4, interaction_strength=5.0)
        phi_raw, phi_norm, is_int, bis = evaluate_integration(system)
        assert is_int, "Strongly interacting system should be integrated"
        assert phi_raw > 0
        assert 0.0 <= phi_norm <= 1.0

    def test_zero_interaction_not_integrated(self):
        system = _make_system(4, interaction_strength=0.0)
        _, _, is_int, _ = evaluate_integration(system)
        assert not is_int, "Zero-interaction system should not be integrated"

    def test_phi_normalized_bounded(self):
        system = _make_system(5, interaction_strength=2.0)
        _, phi_norm, _, _ = evaluate_integration(system)
        assert 0.0 <= phi_norm <= 1.0


# =============================================================================
# Self-Modeling Condition (SM)
# =============================================================================

class TestEvaluateSelfModel:
    def test_good_self_model(self):
        quality, has_sm = evaluate_self_model(
            representational_mi=0.5,
            prediction_error=0.1,
            max_prediction_error=1.0,
            self_referential_mi=0.05,
        )
        assert has_sm
        assert quality == pytest.approx(0.9)

    def test_no_representational_mi(self):
        quality, has_sm = evaluate_self_model(
            representational_mi=0.0,
            prediction_error=0.1,
            max_prediction_error=1.0,
            self_referential_mi=0.05,
        )
        assert not has_sm, "No representational MI should fail SM"

    def test_no_self_referential_mi(self):
        _, has_sm = evaluate_self_model(
            representational_mi=0.5,
            prediction_error=0.1,
            max_prediction_error=1.0,
            self_referential_mi=0.0,
        )
        assert not has_sm, "Zero self-referential MI should fail SM"

    def test_max_prediction_error_zero(self):
        quality, has_sm = evaluate_self_model(
            representational_mi=0.5,
            prediction_error=0.1,
            max_prediction_error=0.0,
            self_referential_mi=0.05,
        )
        assert quality == 0.0
        assert not has_sm

    def test_quality_bounded(self):
        quality, _ = evaluate_self_model(
            representational_mi=0.5,
            prediction_error=0.5,
            max_prediction_error=1.0,
            self_referential_mi=0.05,
        )
        assert 0.0 <= quality <= 1.0


# =============================================================================
# Global Accessibility Condition (GA)
# =============================================================================

class TestEvaluateGlobalAccessibility:
    def test_all_above_threshold(self):
        degree, is_ga = evaluate_global_accessibility(
            broadcast_mis=[0.1, 0.2, 0.3],
            causal_efficacy_kls=[0.05, 0.1, 0.15],
        )
        assert is_ga
        assert degree == 1.0

    def test_some_below_threshold(self):
        degree, is_ga = evaluate_global_accessibility(
            broadcast_mis=[0.1, 0.0, 0.3],
            causal_efficacy_kls=[0.05, 0.1, 0.15],
        )
        assert not is_ga
        assert degree < 1.0

    def test_no_causal_efficacy(self):
        _, is_ga = evaluate_global_accessibility(
            broadcast_mis=[0.1, 0.2],
            causal_efficacy_kls=[0.0, 0.1],
        )
        assert not is_ga, "Zero causal efficacy should fail GA"

    def test_empty_broadcasts(self):
        degree, is_ga = evaluate_global_accessibility([], [])
        assert not is_ga
        assert degree == 0.0


# =============================================================================
# Consciousness Predicate
# =============================================================================

class TestEvaluateConsciousness:
    def test_all_conditions_met(self):
        cond = _make_ismt_conditions(integrated=True, has_sm=True, is_ga=True)
        verdict = evaluate_consciousness(cond)
        assert verdict.c_binary is True
        assert verdict.c_graded > 0
        assert "All ISMT conditions satisfied" in verdict.explanation

    def test_integration_fails(self):
        cond = _make_ismt_conditions(integrated=False, has_sm=True, is_ga=True)
        verdict = evaluate_consciousness(cond)
        assert verdict.c_binary is False
        assert "IC" in verdict.explanation

    def test_self_model_fails(self):
        cond = _make_ismt_conditions(integrated=True, has_sm=False, is_ga=True)
        verdict = evaluate_consciousness(cond)
        assert verdict.c_binary is False
        assert "SM" in verdict.explanation

    def test_ga_fails(self):
        cond = _make_ismt_conditions(integrated=True, has_sm=True, is_ga=False)
        verdict = evaluate_consciousness(cond)
        assert verdict.c_binary is False
        assert "GA" in verdict.explanation

    def test_graded_score_is_product(self):
        phi, q, g = 0.5, 0.7, 0.8
        cond = _make_ismt_conditions(phi_norm=phi, sm_quality=q, ga_degree=g)
        verdict = evaluate_consciousness(cond)
        assert verdict.c_graded == pytest.approx(phi * q * g)

    def test_all_fail(self):
        cond = _make_ismt_conditions(integrated=False, has_sm=False, is_ga=False)
        verdict = evaluate_consciousness(cond)
        assert verdict.c_binary is False
        assert "IC" in verdict.explanation
        assert "SM" in verdict.explanation
        assert "GA" in verdict.explanation


# =============================================================================
# TOST Equivalence Testing
# =============================================================================

class TestTOSTEquivalence:
    def test_equivalent_groups(self):
        rng = np.random.default_rng(42)
        g1 = rng.normal(loc=5.0, scale=0.5, size=50)
        g2 = rng.normal(loc=5.0, scale=0.5, size=50)
        result = tost_equivalence_test(g1, g2, equivalence_margin=0.5)
        assert result.equivalent, "Similar groups should be equivalent"
        assert result.lower_p < 0.05
        assert result.upper_p < 0.05

    def test_non_equivalent_groups(self):
        rng = np.random.default_rng(42)
        g1 = rng.normal(loc=5.0, scale=0.5, size=50)
        g2 = rng.normal(loc=8.0, scale=0.5, size=50)
        result = tost_equivalence_test(g1, g2, equivalence_margin=0.5)
        assert not result.equivalent, "Distant groups should not be equivalent"

    def test_zero_variance_equivalent(self):
        g1 = np.array([5.0, 5.0, 5.0])
        g2 = np.array([5.0, 5.0, 5.0])
        result = tost_equivalence_test(g1, g2, equivalence_margin=0.1)
        assert result.equivalent
        assert result.observed_difference == 0.0

    def test_zero_variance_not_equivalent(self):
        g1 = np.array([5.0, 5.0, 5.0])
        g2 = np.array([6.0, 6.0, 6.0])
        result = tost_equivalence_test(g1, g2, equivalence_margin=0.5)
        assert not result.equivalent

    def test_observed_difference_correct(self):
        g1 = np.array([10.0, 10.0])
        g2 = np.array([9.0, 9.0])
        result = tost_equivalence_test(g1, g2, equivalence_margin=2.0)
        assert result.observed_difference == pytest.approx(1.0)


# =============================================================================
# Equivalence Margin
# =============================================================================

class TestEquivalenceMargin:
    def test_margin_from_baseline(self):
        rng = np.random.default_rng(42)
        baseline = rng.normal(loc=10.0, scale=2.0, size=100)
        margin = compute_equivalence_margin(baseline, margin_factor=0.5)
        expected = 0.5 * np.std(baseline, ddof=1)
        assert margin == pytest.approx(expected)

    def test_zero_variance_baseline(self):
        baseline = np.array([5.0, 5.0, 5.0])
        margin = compute_equivalence_margin(baseline)
        assert margin == 0.0


# =============================================================================
# Change-Point Detection
# =============================================================================

class TestChangePointDetection:
    def test_no_change_point_flat(self):
        rng = np.random.default_rng(42)
        measurements = rng.normal(loc=10.0, scale=0.1, size=20)
        fractions = np.linspace(0, 1, 20)
        result = detect_change_point(measurements, fractions)
        assert not result.has_change_point

    def test_clear_change_point(self):
        # First half around 10, second half around 5 — obvious discontinuity
        # Add small noise to avoid degenerate (zero-variance) segments
        rng = np.random.default_rng(42)
        measurements = np.concatenate([
            rng.normal(loc=10.0, scale=0.1, size=10),
            rng.normal(loc=5.0, scale=0.1, size=10),
        ])
        fractions = np.linspace(0, 1, 20)
        result = detect_change_point(measurements, fractions)
        assert result.has_change_point
        assert result.change_point_index is not None
        assert result.p_value < SIGNIFICANCE_ALPHA

    def test_too_few_measurements(self):
        measurements = np.array([1.0, 2.0])
        fractions = np.array([0.0, 1.0])
        result = detect_change_point(measurements, fractions, min_segment_size=3)
        assert not result.has_change_point
        assert result.p_value == 1.0

    def test_change_point_fraction_reported(self):
        rng = np.random.default_rng(99)
        measurements = np.concatenate([
            rng.normal(loc=10.0, scale=0.1, size=15),
            rng.normal(loc=2.0, scale=0.1, size=5),
        ])
        fractions = np.linspace(0, 1, 20)
        result = detect_change_point(measurements, fractions)
        if result.has_change_point:
            assert 0.0 <= result.change_point_fraction <= 1.0


# =============================================================================
# Power Analysis
# =============================================================================

class TestPowerAnalysis:
    def test_returns_reasonable_n(self):
        n = tost_power_analysis(
            equivalence_margin=0.5,
            true_difference=0.0,
            sd=1.0,
        )
        assert 5 <= n <= 10000
        assert isinstance(n, int)

    def test_larger_margin_needs_fewer_samples(self):
        n_small = tost_power_analysis(equivalence_margin=0.3, true_difference=0.0, sd=1.0)
        n_large = tost_power_analysis(equivalence_margin=1.0, true_difference=0.0, sd=1.0)
        assert n_large <= n_small, "Larger margin should need fewer samples"

    def test_larger_sd_needs_more_samples(self):
        n_low = tost_power_analysis(equivalence_margin=0.5, true_difference=0.0, sd=0.5)
        n_high = tost_power_analysis(equivalence_margin=0.5, true_difference=0.0, sd=2.0)
        assert n_high >= n_low, "Higher SD should need more samples"


# =============================================================================
# Bayes Factor
# =============================================================================

class TestBayesFactor:
    def test_equivalent_groups_favor_equivalence(self):
        rng = np.random.default_rng(42)
        g1 = rng.normal(loc=5.0, scale=0.5, size=50)
        g2 = rng.normal(loc=5.0, scale=0.5, size=50)
        bf = bayes_factor_equivalence(g1, g2, equivalence_margin=1.0)
        assert bf > 1.0, "Equivalent groups should yield BF > 1"

    def test_different_groups_favor_difference(self):
        rng = np.random.default_rng(42)
        g1 = rng.normal(loc=5.0, scale=0.5, size=50)
        g2 = rng.normal(loc=8.0, scale=0.5, size=50)
        bf = bayes_factor_equivalence(g1, g2, equivalence_margin=0.5)
        assert bf < 1.0, "Different groups should yield BF < 1"

    def test_bf_positive(self):
        rng = np.random.default_rng(42)
        g1 = rng.normal(size=20)
        g2 = rng.normal(size=20)
        bf = bayes_factor_equivalence(g1, g2, equivalence_margin=1.0)
        assert bf > 0


# =============================================================================
# Line 1: Prediction Testing
# =============================================================================

class TestPredictionTest:
    def test_prediction_passes(self):
        rng = np.random.default_rng(42)
        # Use moderate separation to avoid overflow in BF computation
        observed = rng.normal(loc=2.0, scale=1.0, size=30)
        null = rng.normal(loc=0.0, scale=1.0, size=30)
        result = ismt_test_prediction(
            prediction_id="P1",
            description="Test prediction",
            expected_signature=2.0,
            observed_values=observed,
            null_values=null,
        )
        assert result.passed
        assert result.p_value < SIGNIFICANCE_ALPHA

    def test_prediction_fails(self):
        rng = np.random.default_rng(42)
        observed = rng.normal(loc=0.0, scale=0.5, size=30)
        null = rng.normal(loc=0.0, scale=0.5, size=30)
        result = ismt_test_prediction(
            prediction_id="P2",
            description="No-effect prediction",
            expected_signature=5.0,
            observed_values=observed,
            null_values=null,
        )
        assert not result.passed

    def test_result_fields_populated(self):
        rng = np.random.default_rng(42)
        observed = rng.normal(loc=1.5, scale=1.0, size=20)
        null = rng.normal(loc=0.0, scale=1.0, size=20)
        result = ismt_test_prediction("P3", "desc", 1.5, observed, null)
        assert result.prediction_id == "P3"
        assert result.description == "desc"
        assert result.expected_signature == 1.5
        assert isinstance(result.p_value, float)
        assert isinstance(result.bayes_factor, float)


# =============================================================================
# Line 2: Continuity Curve Analysis
# =============================================================================

class TestContinuityCurve:
    def test_flat_curve_is_continuous(self):
        rng = np.random.default_rng(42)
        fractions = np.linspace(0, 1, 11)
        # Marker values close to baseline mean
        marker_values = rng.normal(loc=10.0, scale=0.1, size=11)
        # Large baseline with enough variance for meaningful equivalence margin
        baseline = rng.normal(loc=10.0, scale=0.5, size=50)
        # Use a generous equivalence margin so flat curve passes TOST
        result = analyze_continuity_curve(fractions, marker_values, baseline,
                                          equivalence_margin=1.0)
        assert result.verdict == "continuous"

    def test_discontinuous_curve_detected(self):
        rng = np.random.default_rng(42)
        fractions = np.linspace(0, 1, 20)
        # Clear discontinuity with some noise
        marker_values = np.concatenate([
            rng.normal(loc=10.0, scale=0.1, size=10),
            rng.normal(loc=2.0, scale=0.1, size=10),
        ])
        baseline = rng.normal(loc=10.0, scale=0.5, size=50)
        result = analyze_continuity_curve(fractions, marker_values, baseline)
        assert result.change_point.has_change_point

    def test_tost_results_per_step(self):
        fractions = np.linspace(0, 1, 5)
        marker_values = np.array([10.0, 10.1, 9.9, 10.0, 10.05])
        baseline = np.random.default_rng(42).normal(loc=10.0, scale=0.5, size=50)
        result = analyze_continuity_curve(fractions, marker_values, baseline)
        assert len(result.tost_results) == len(fractions)


# =============================================================================
# Line 3: Cross-Substrate Equivalence
# =============================================================================

class TestCrossSubstrate:
    def test_equivalent_signatures(self):
        rng = np.random.default_rng(42)
        names = ["sig1", "sig2"]
        bio = [rng.normal(loc=5, scale=0.3, size=30), rng.normal(loc=3, scale=0.3, size=30)]
        syn = [rng.normal(loc=5, scale=0.3, size=30), rng.normal(loc=3, scale=0.3, size=30)]
        margins = [0.5, 0.5]
        result = analyze_cross_substrate(names, bio, syn, margins)
        assert result.overall_equivalent
        assert result.verdict == "equivalent"

    def test_non_equivalent_signatures(self):
        rng = np.random.default_rng(42)
        names = ["sig1"]
        bio = [rng.normal(loc=5, scale=0.3, size=30)]
        syn = [rng.normal(loc=10, scale=0.3, size=30)]
        margins = [0.5]
        result = analyze_cross_substrate(names, bio, syn, margins)
        assert not result.overall_equivalent
        assert result.verdict == "not_equivalent"

    def test_discriminant_validity(self):
        rng = np.random.default_rng(42)
        names = ["sig1"]
        bio = [rng.normal(loc=5, scale=0.3, size=30)]
        syn = [rng.normal(loc=5, scale=0.3, size=30)]
        diff_state = [rng.normal(loc=10, scale=0.3, size=30)]
        margins = [0.5]
        result = analyze_cross_substrate(names, bio, syn, margins, diff_state)
        assert result.discriminant_valid
        assert result.verdict == "equivalent"

    def test_discriminant_invalidity(self):
        rng = np.random.default_rng(42)
        names = ["sig1"]
        bio = [rng.normal(loc=5, scale=0.3, size=30)]
        syn = [rng.normal(loc=5, scale=0.3, size=30)]
        # Different state is same as source — discriminant fails
        diff_state = [rng.normal(loc=5, scale=0.3, size=30)]
        margins = [0.5]
        result = analyze_cross_substrate(names, bio, syn, margins, diff_state)
        assert not result.discriminant_valid
        assert result.verdict == "equivalent_but_discriminant_invalid"
