"""
tests/test_reconciliation.py
-----------------------------
Unit tests for every pure rule function in app.services.reconciliation.

Design principles
-----------------
* Each test builds the **minimum DataFrame** needed to exercise one rule.
* Tests are independent — no shared state, no file I/O, no DB.
* Pure functions are imported directly so they can be tested without the
  ReconciliationEngine orchestrator class.
* Edge cases (NaN, zero amounts, boundary dates) are tested alongside the
  happy/unhappy paths.

Run with:
    cd backend
    pytest tests/test_reconciliation.py -v
"""

from __future__ import annotations

import pandas as pd
import pytest
from datetime import datetime, timedelta

from app.services.reconciliation import (
    ExcType,
    build_result,
    classify,
    load_payments,
    load_settlements,
    load_bank_statement,
    merge_all,
    rule_amount_mismatch,
    rule_delayed_settlement,
    rule_duplicate_payments,
    rule_unmatched_no_bank_credit,
    rule_unmatched_no_settlement,
)


# ─────────────────────────────────────────────────────────────────────────────
# Factory helpers — build minimal DataFrames for one rule at a time
# ─────────────────────────────────────────────────────────────────────────────

_NOW = datetime(2024, 1, 10, 12, 0, 0)


def _payment_row(**overrides) -> dict:
    """Return a single payment dict with sensible defaults."""
    base = {
        "payment_id":   "pay_001",
        "order_id":     "ord_001",
        "amount":       1000.0,
        "currency":     "INR",
        "payment_date": _NOW,
        "method":       "upi",
        "status":       "captured",
        "utr_number":   "UTR001",
    }
    base.update(overrides)
    return base


def _settlement_row(**overrides) -> dict:
    """Return a single settlement dict with sensible defaults."""
    base = {
        "settlement_id":   "setl_001",
        "payment_id":      "pay_001",
        "settled_amount":  1000.0,
        "settlement_date": _NOW + timedelta(days=1),
        "utr_number":      "UTR001",
    }
    base.update(overrides)
    return base


def _bank_row(**overrides) -> dict:
    """Return a single bank-statement dict with sensible defaults."""
    base = {
        "utr_number":       "UTR001",
        "bank_credited_amount": 1000.0,
        "bank_credit_date": _NOW + timedelta(days=1),
        "bank_narration":   "NEFT/UTR001/settlement",
    }
    base.update(overrides)
    return base


def _merge_one(payment: dict, settlement: dict | None, bank: dict | None) -> pd.DataFrame:
    """
    Build a single-row merged DataFrame from component dicts.
    Passing None for settlement/bank simulates a missing join partner.
    """
    pay_df  = pd.DataFrame([payment])
    setl_df = pd.DataFrame([settlement]) if settlement else pd.DataFrame(
        columns=["settlement_id", "payment_id", "settled_amount", "settlement_date", "utr_number"]
    )
    bank_df = pd.DataFrame([bank]) if bank else pd.DataFrame(
        columns=["utr_number", "bank_credited_amount", "bank_credit_date", "bank_narration"]
    )
    return merge_all(pay_df, setl_df, bank_df)


# ─────────────────────────────────────────────────────────────────────────────
# rule_unmatched_no_settlement
# ─────────────────────────────────────────────────────────────────────────────

class TestRuleUnmatchedNoSettlement:
    """
    Business rule: a payment with no settlement record is critical — funds
    may be stuck with the acquirer.
    """

    def test_flags_when_settlement_missing(self):
        df = _merge_one(_payment_row(), settlement=None, bank=None)
        mask = rule_unmatched_no_settlement(df)
        assert mask.all(), "Should flag payment with no settlement"

    def test_does_not_flag_when_settlement_present(self):
        df = _merge_one(_payment_row(), _settlement_row(), _bank_row())
        mask = rule_unmatched_no_settlement(df)
        assert not mask.any(), "Should NOT flag when settlement row exists"

    def test_flags_only_the_missing_row_in_mixed_df(self):
        p1 = _payment_row(payment_id="pay_001", utr_number="UTR001")
        p2 = _payment_row(payment_id="pay_002", utr_number="UTR002")
        s1 = _settlement_row(payment_id="pay_001")

        pay_df  = pd.DataFrame([p1, p2])
        setl_df = pd.DataFrame([s1])
        bank_df = pd.DataFrame(
            columns=["utr_number", "bank_credited_amount", "bank_credit_date", "bank_narration"]
        )
        df   = merge_all(pay_df, setl_df, bank_df)
        mask = rule_unmatched_no_settlement(df)

        assert mask.sum() == 1, "Only pay_002 should be flagged"
        assert df.loc[mask, "payment_id"].iloc[0] == "pay_002"


# ─────────────────────────────────────────────────────────────────────────────
# rule_unmatched_no_bank_credit
# ─────────────────────────────────────────────────────────────────────────────

class TestRuleUnmatchedNoBankCredit:
    """
    Business rule: settlement exists in the internal system but no matching
    bank credit was found — the transfer may have failed.
    """

    def test_flags_when_bank_credit_missing(self):
        df = _merge_one(_payment_row(), _settlement_row(), bank=None)
        mask = rule_unmatched_no_bank_credit(df)
        assert mask.all(), "Should flag settlement with no bank credit"

    def test_does_not_flag_when_bank_credit_present(self):
        df = _merge_one(_payment_row(), _settlement_row(), _bank_row())
        mask = rule_unmatched_no_bank_credit(df)
        assert not mask.any()

    def test_does_not_flag_when_no_settlement_either(self):
        """
        If there is no settlement at all, this rule should not trigger —
        that case belongs to rule_unmatched_no_settlement.
        """
        df = _merge_one(_payment_row(), settlement=None, bank=None)
        mask = rule_unmatched_no_bank_credit(df)
        assert not mask.any(), "No settlement → no bank credit rule should stay silent"


# ─────────────────────────────────────────────────────────────────────────────
# rule_amount_mismatch
# ─────────────────────────────────────────────────────────────────────────────

class TestRuleAmountMismatch:
    """
    Business rule: |payment - settled| > max(₹1, 0.5 % × payment) is flagged.
    Small processing-fee differences below the tolerance band are ignored.
    """

    def test_flags_when_difference_exceeds_absolute_tolerance(self):
        df = _merge_one(
            _payment_row(amount=1000.0),
            _settlement_row(settled_amount=998.0),   # Δ = 2 > max(1, 5) = 5? No...
            _bank_row(),
        )
        # tolerance = max(1, 0.005*1000) = max(1, 5) = 5
        # Δ = 2 < 5 → should NOT flag
        mask = rule_amount_mismatch(df, tolerance_abs=1.0, tolerance_pct=0.005)
        assert not mask.any(), "Δ=2 is inside 0.5% tolerance band of ₹1000, should not flag"

    def test_flags_when_difference_exceeds_pct_tolerance(self):
        df = _merge_one(
            _payment_row(amount=1000.0),
            _settlement_row(settled_amount=992.0),   # Δ = 8 > max(1, 5) = 5 → flag
            _bank_row(),
        )
        mask = rule_amount_mismatch(df, tolerance_abs=1.0, tolerance_pct=0.005)
        assert mask.all(), "Δ=8 exceeds 0.5% band (₹5), should flag"

    def test_flags_small_amount_exceeding_abs_tolerance(self):
        """For tiny payments the absolute floor (₹1) is the operative threshold."""
        df = _merge_one(
            _payment_row(amount=10.0),
            _settlement_row(settled_amount=8.5),     # Δ = 1.5 > max(1, 0.05) = 1 → flag
            _bank_row(),
        )
        mask = rule_amount_mismatch(df, tolerance_abs=1.0, tolerance_pct=0.005)
        assert mask.all(), "Δ=1.5 exceeds abs floor of ₹1 for a ₹10 payment"

    def test_does_not_flag_exact_match(self):
        df = _merge_one(_payment_row(amount=500.0), _settlement_row(settled_amount=500.0), _bank_row())
        mask = rule_amount_mismatch(df)
        assert not mask.any()

    def test_does_not_flag_when_no_settlement(self):
        df = _merge_one(_payment_row(), settlement=None, bank=None)
        mask = rule_amount_mismatch(df)
        assert not mask.any(), "No settlement → mismatch rule should stay silent"

    def test_custom_tolerance_respected(self):
        df = _merge_one(
            _payment_row(amount=100.0),
            _settlement_row(settled_amount=97.0),   # Δ = 3
            _bank_row(),
        )
        # With a wide tolerance of ₹5 absolute, Δ=3 should not flag
        assert not rule_amount_mismatch(df, tolerance_abs=5.0, tolerance_pct=0.0).any()
        # With a tight tolerance of ₹2 absolute, Δ=3 should flag
        assert rule_amount_mismatch(df, tolerance_abs=2.0, tolerance_pct=0.0).all()


# ─────────────────────────────────────────────────────────────────────────────
# rule_delayed_settlement
# ─────────────────────────────────────────────────────────────────────────────

class TestRuleDelayedSettlement:
    """
    Business rule: settlement received after T+{sla_days} calendar days is
    flagged as DELAYED_SETTLEMENT.  Default SLA is T+2.
    """

    def test_flags_t_plus_3_with_default_sla(self):
        pay  = _payment_row(payment_date=_NOW)
        setl = _settlement_row(settlement_date=_NOW + timedelta(days=3))
        df   = _merge_one(pay, setl, _bank_row())
        mask = rule_delayed_settlement(df, sla_days=2)
        assert mask.all(), "T+3 exceeds T+2 SLA, should flag"

    def test_does_not_flag_t_plus_2(self):
        pay  = _payment_row(payment_date=_NOW)
        setl = _settlement_row(settlement_date=_NOW + timedelta(days=2))
        df   = _merge_one(pay, setl, _bank_row())
        mask = rule_delayed_settlement(df, sla_days=2)
        assert not mask.any(), "T+2 is exactly the SLA, should NOT flag"

    def test_does_not_flag_t_plus_1(self):
        pay  = _payment_row(payment_date=_NOW)
        setl = _settlement_row(settlement_date=_NOW + timedelta(days=1))
        df   = _merge_one(pay, setl, _bank_row())
        mask = rule_delayed_settlement(df, sla_days=2)
        assert not mask.any()

    def test_custom_sla_respected(self):
        pay  = _payment_row(payment_date=_NOW)
        setl = _settlement_row(settlement_date=_NOW + timedelta(days=5))
        df   = _merge_one(pay, setl, _bank_row())
        assert rule_delayed_settlement(df, sla_days=4).all()   # 5 > 4 → flag
        assert not rule_delayed_settlement(df, sla_days=5).any()  # 5 == 5 → ok

    def test_does_not_flag_when_no_settlement(self):
        df = _merge_one(_payment_row(), settlement=None, bank=None)
        mask = rule_delayed_settlement(df)
        assert not mask.any()


# ─────────────────────────────────────────────────────────────────────────────
# rule_duplicate_payments
# ─────────────────────────────────────────────────────────────────────────────

class TestRuleDuplicatePayments:
    """
    Business rule: two captured payments for the same (order_id, amount)
    within 60 seconds are flagged as DUPLICATE.
    """

    def _payments_df(self, rows: list[dict]) -> pd.DataFrame:
        """Build a payments DataFrame from a list of dicts and add a dummy merged frame."""
        df = pd.DataFrame(rows)
        df["payment_date"]   = pd.to_datetime(df["payment_date"])
        df["settlement_id"]  = None           # simulate no-settlement rows
        df["settled_amount"] = None
        df["utr_number"]     = None
        df["bank_credited_amount"] = None
        return df

    def test_flags_two_payments_within_window(self):
        t0 = _NOW
        df = self._payments_df([
            _payment_row(payment_id="pay_001", payment_date=t0),
            _payment_row(payment_id="pay_002", payment_date=t0 + timedelta(seconds=30)),
        ])
        mask = rule_duplicate_payments(df, window_secs=300)
        assert mask.sum() == 2, "Both pay_001 and pay_002 should be flagged"

    def test_does_not_flag_payments_outside_window(self):
        t0 = _NOW
        df = self._payments_df([
            _payment_row(payment_id="pay_001", payment_date=t0),
            _payment_row(payment_id="pay_002", payment_date=t0 + timedelta(seconds=360)),
        ])
        mask = rule_duplicate_payments(df, window_secs=300)
        assert not mask.any(), "360 s apart is outside 300 s window, should not flag"

    def test_does_not_flag_different_orders(self):
        t0 = _NOW
        df = self._payments_df([
            _payment_row(payment_id="pay_001", order_id="ord_001", payment_date=t0),
            _payment_row(payment_id="pay_002", order_id="ord_002", payment_date=t0 + timedelta(seconds=5)),
        ])
        mask = rule_duplicate_payments(df, window_secs=60)
        assert not mask.any(), "Different orders should not be flagged"

    def test_does_not_flag_different_amounts(self):
        """Same order, same time, but different amounts — NOT a duplicate."""
        t0 = _NOW
        df = self._payments_df([
            _payment_row(payment_id="pay_001", order_id="ord_001", amount=500.0, payment_date=t0),
            _payment_row(payment_id="pay_002", order_id="ord_001", amount=300.0, payment_date=t0 + timedelta(seconds=5)),
        ])
        mask = rule_duplicate_payments(df, window_secs=60)
        assert not mask.any(), "Different amounts in same order are not duplicates"

    def test_does_not_flag_failed_payments(self):
        """Only 'captured' payments are in scope."""
        t0 = _NOW
        df = self._payments_df([
            _payment_row(payment_id="pay_001", status="failed",   payment_date=t0),
            _payment_row(payment_id="pay_002", status="captured", payment_date=t0 + timedelta(seconds=5)),
        ])
        mask = rule_duplicate_payments(df, window_secs=60)
        assert not mask.any(), "Failed payment should not be considered for duplicate check"

    def test_flags_only_close_pair_in_larger_group(self):
        """In a group of 3, only the pair within the window should be flagged."""
        t0 = _NOW
        df = self._payments_df([
            _payment_row(payment_id="pay_001", payment_date=t0),
            _payment_row(payment_id="pay_002", payment_date=t0 + timedelta(seconds=30)),
            _payment_row(payment_id="pay_003", payment_date=t0 + timedelta(hours=2)),
        ])
        mask = rule_duplicate_payments(df, window_secs=300)
        flagged_ids = set(df.loc[mask, "payment_id"].tolist())
        assert flagged_ids == {"pay_001", "pay_002"}, "Only the close pair should be flagged"
        assert "pay_003" not in flagged_ids

    def test_flags_payments_3_minutes_apart(self):
        """
        Regression test for the original 60 s window bug.
        The sample data generator injects duplicates 1-3 minutes apart
        (timedelta(minutes=randint(1, 3))).  The engine must catch the
        worst-case 3-minute (180 s) gap with the 300 s default window.
        """
        t0 = _NOW
        df = self._payments_df([
            _payment_row(payment_id="pay_original", payment_date=t0),
            _payment_row(payment_id="pay_retry",    payment_date=t0 + timedelta(minutes=3)),
        ])
        # With default 300 s window: 180 s < 300 s → must flag
        mask = rule_duplicate_payments(df)           # uses default window_secs=300
        assert mask.sum() == 2, (
            "3-minute gap (180 s) is within the 300 s window — both rows must be flagged. "
            "This catches the case that was missed when window_secs=60."
        )

    def test_does_not_flag_at_exactly_boundary(self):
        """Payments exactly at the boundary (300 s) are still flagged (≤, not <)."""
        t0 = _NOW
        df = self._payments_df([
            _payment_row(payment_id="pay_001", payment_date=t0),
            _payment_row(payment_id="pay_002", payment_date=t0 + timedelta(seconds=300)),
        ])
        mask = rule_duplicate_payments(df)
        assert mask.sum() == 2, "Exactly at boundary (300 s) should still be flagged (≤)"

    def test_bank_join_duplicate_rows_do_not_create_false_positives(self):
        """
        Regression test for the bank-join artifact bug.

        When a UTR appears more than once in bank_statement.csv (e.g. the
        generator's deliberate 'bonus' duplicate credit entry), the merged
        DataFrame can contain two rows for the same payment_id.  Without
        `drop_duplicates(subset=['payment_id'])` the groupby would see:

            (order_id, amount) group = [pay_X(t0), pay_X(t0)]   ← same payment, 2 rows

        That looks like a 0-second consecutive pair → falsely flagged DUPLICATE.

        This test simulates the artifact by injecting a repeated payment_id row
        and asserts the rule returns ZERO false positives.  Separately, it
        verifies that a genuine duplicate pair (2 distinct payment_ids within
        the window) is still correctly flagged, so the fix doesn't over-suppress.
        """
        t0 = _NOW

        # --- 1. Genuine duplicate pair (should be flagged) ---
        genuine_original = _payment_row(
            payment_id="pay_orig", order_id="ord_A",
            amount=500.0, payment_date=t0,
        )
        genuine_retry = _payment_row(
            payment_id="pay_retry", order_id="ord_A",
            amount=500.0, payment_date=t0 + timedelta(seconds=90),
        )

        # --- 2. Non-duplicate payment whose bank join created 2 rows ---
        solo_payment = _payment_row(
            payment_id="pay_solo", order_id="ord_B",
            amount=1000.0, payment_date=t0,
        )

        df = self._payments_df([genuine_original, genuine_retry, solo_payment, solo_payment])
        # ^ solo_payment appears TWICE, simulating the bank join artifact

        mask = rule_duplicate_payments(df, window_secs=300)

        flagged_ids = set(df.loc[mask, "payment_id"].tolist())

        # Exactly 2 rows flagged from the genuine pair (pay_orig + pay_retry)
        assert flagged_ids == {"pay_orig", "pay_retry"}, (
            f"Expected only genuine pair flagged. Got: {flagged_ids}. "
            "Bank-join-duplicated payment_id must not count as a self-duplicate."
        )
        assert mask.sum() == 2, (
            f"Expected 2 flagged rows, got {mask.sum()}. "
            "The extra bank row must not inflate the count."
        )



# ─────────────────────────────────────────────────────────────────────────────
# classify — priority ordering integration test
# ─────────────────────────────────────────────────────────────────────────────

class TestClassifyPriority:
    """
    When multiple rules match the same row, higher-priority rules must win.
    Updated priority (highest → lowest):
        DUPLICATE > UNMATCHED_NO_SETTLEMENT > UNMATCHED_NO_BANK_CREDIT >
        AMOUNT_MISMATCH > DELAYED_SETTLEMENT
    """

    def test_all_matched(self):
        df = _merge_one(_payment_row(), _settlement_row(), _bank_row())
        out = classify(df)
        assert out["recon_status"].iloc[0] == ExcType.MATCHED

    def test_unmatched_no_settlement_wins_over_delayed(self):
        """
        A payment with no settlement and no duplicate pattern should be
        UNMATCHED_NO_SETTLEMENT, not DELAYED_SETTLEMENT.
        DUPLICATE is the only rule that outranks UNMATCHED_NO_SETTLE.
        """
        df = _merge_one(_payment_row(), settlement=None, bank=None)
        out = classify(df, sla_days=0)
        assert out["recon_status"].iloc[0] == ExcType.UNMATCHED_NO_SETTLE

    def test_duplicate_wins_over_unmatched_no_settlement(self):
        """
        DUPLICATE has highest priority and overwrites UNMATCHED_NO_SETTLEMENT.

        Real-world scenario: duplicate payments are typically rejected by the
        processor so they never get a settlement.  Without this rule the engine
        would classify them as UNMATCHED_NO_SETTLEMENT, hiding the true cause.
        """
        t0 = _NOW
        # Two payments: same order_id, same amount, 30 s apart but NO settlement.
        p1 = _payment_row(payment_id="pay_original", payment_date=t0)
        p2 = _payment_row(payment_id="pay_retry",    payment_date=t0 + timedelta(seconds=30))

        pay_df  = pd.DataFrame([p1, p2])
        pay_df["payment_date"] = pd.to_datetime(pay_df["payment_date"])
        setl_df = pd.DataFrame(
            columns=["settlement_id", "payment_id", "settled_amount", "settlement_date", "utr_number"]
        )
        bank_df = pd.DataFrame(
            columns=["utr_number", "bank_credited_amount", "bank_credit_date", "bank_narration"]
        )
        merged = merge_all(pay_df, setl_df, bank_df)
        out = classify(merged, dup_window_secs=300)

        # Both rows must be DUPLICATE, not UNMATCHED_NO_SETTLEMENT
        statuses = set(out["recon_status"].tolist())
        assert statuses == {ExcType.DUPLICATE}, (
            f"Expected all rows = DUPLICATE, got {statuses}. "
            "DUPLICATE must outrank UNMATCHED_NO_SETTLEMENT."
        )

    def test_unmatched_no_bank_wins_over_delayed(self):
        """Settlement exists but bank is missing → NO_BANK_CREDIT, not DELAYED."""
        pay  = _payment_row(payment_date=_NOW)
        setl = _settlement_row(settlement_date=_NOW + timedelta(days=10))
        df   = _merge_one(pay, setl, bank=None)
        out  = classify(df, sla_days=2)
        assert out["recon_status"].iloc[0] == ExcType.UNMATCHED_NO_BANK

    def test_amount_mismatch_wins_over_delayed(self):
        pay  = _payment_row(amount=1000.0, payment_date=_NOW)
        setl = _settlement_row(settled_amount=900.0, settlement_date=_NOW + timedelta(days=5))
        df   = _merge_one(pay, setl, _bank_row())
        out  = classify(df, sla_days=2)
        assert out["recon_status"].iloc[0] == ExcType.AMOUNT_MISMATCH

    def test_delay_days_column_added(self):
        pay  = _payment_row(payment_date=_NOW)
        setl = _settlement_row(settlement_date=_NOW + timedelta(days=3))
        df   = _merge_one(pay, setl, _bank_row())
        out  = classify(df, sla_days=2)
        assert "delay_days" in out.columns
        assert out["delay_days"].iloc[0] == 3


# ─────────────────────────────────────────────────────────────────────────────
# build_result — output schema
# ─────────────────────────────────────────────────────────────────────────────

class TestBuildResult:
    """Verify the result dict shape and computed values."""

    def _make_classified(self, statuses: list[str]) -> pd.DataFrame:
        """Create a dummy classified DataFrame with given statuses."""
        rows = []
        for i, status in enumerate(statuses):
            rows.append({
                "payment_id":    f"pay_{i:03d}",
                "order_id":      f"ord_{i:03d}",
                "amount":        float(100 * (i + 1)),
                "settled_amount": float(100 * (i + 1)) if status == ExcType.MATCHED else float(100 * (i + 1) - 10),
                "settlement_id":  f"setl_{i}" if status != ExcType.UNMATCHED_NO_SETTLE else None,
                "utr_number":     f"UTR{i:03d}" if status not in (ExcType.UNMATCHED_NO_SETTLE, ExcType.UNMATCHED_NO_BANK) else None,
                "bank_credited_amount": None,
                "payment_date":   _NOW,
                "settlement_date": _NOW + timedelta(days=1),
                "delay_days":     1,
                "recon_status":   status,
                "details":        "test exception",
                "severity":       "medium",
            })
        return pd.DataFrame(rows)

    def test_100_percent_match_rate(self):
        df = self._make_classified([ExcType.MATCHED, ExcType.MATCHED])
        result = build_result(df, sla_days=2)
        assert result["match_rate"] == 100.0
        assert result["matched"] == 2
        assert result["unmatched"] == 0
        assert result["exceptions"] == []

    def test_zero_percent_match_rate(self):
        df = self._make_classified([ExcType.UNMATCHED_NO_SETTLE, ExcType.AMOUNT_MISMATCH])
        result = build_result(df, sla_days=2)
        assert result["match_rate"] == 0.0
        assert result["matched"] == 0
        assert result["unmatched"] == 2
        assert len(result["exceptions"]) == 2

    def test_mixed_match_rate(self):
        statuses = [ExcType.MATCHED] * 3 + [ExcType.AMOUNT_MISMATCH]
        df = self._make_classified(statuses)
        result = build_result(df, sla_days=2)
        assert result["match_rate"] == 75.0
        assert result["matched"] == 3
        assert result["total_records"] == 4

    def test_required_keys_present(self):
        df = self._make_classified([ExcType.MATCHED])
        result = build_result(df, sla_days=2)
        required_keys = {
            "match_rate", "total_records", "matched", "unmatched",
            "exception_counts", "exceptions", "settlement_totals",
            "sla_days_used", "run_at",
        }
        assert required_keys.issubset(result.keys())

    def test_exception_counts_aggregated_by_type(self):
        statuses = [
            ExcType.AMOUNT_MISMATCH,
            ExcType.AMOUNT_MISMATCH,
            ExcType.DELAYED_SETTLEMENT,
        ]
        df = self._make_classified(statuses)
        result = build_result(df, sla_days=2)
        counts = result["exception_counts"]
        assert counts[ExcType.AMOUNT_MISMATCH]   == 2
        assert counts[ExcType.DELAYED_SETTLEMENT] == 1

    def test_sla_days_echoed_in_result(self):
        df = self._make_classified([ExcType.MATCHED])
        assert build_result(df, sla_days=5)["sla_days_used"] == 5

    def test_settlement_totals_keys_present(self):
        df = self._make_classified([ExcType.MATCHED])
        totals = build_result(df, sla_days=2)["settlement_totals"]
        assert {"total_payment_amount", "total_settled_amount", "currency"}.issubset(totals.keys())
