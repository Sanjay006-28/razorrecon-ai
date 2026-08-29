"""
app/services/reconciliation.py
-------------------------------
Reconciliation engine split into pure, independently-testable rule functions.

Architecture
------------
* Each rule lives as a module-level pure function: (DataFrame, params) → boolean mask.
* The ReconciliationEngine class is a thin orchestrator that calls the rules in
  the correct order and assembles the result dict.
* Pure functions have no side-effects and do not mutate their inputs, so they
  can be imported and unit-tested directly without constructing the engine.

Usage example
-------------
    from app.services.reconciliation import ReconciliationEngine

    engine = ReconciliationEngine(
        payments_path="sample_data/payments.csv",
        settlements_path="sample_data/settlements.csv",
        
        bank_statement_path="sample_data/bank_statement.csv",
    )
    result = engine.run()
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

class ExcType:
    MATCHED             = "MATCHED"
    UNMATCHED_NO_SETTLE = "UNMATCHED_NO_SETTLEMENT"
    UNMATCHED_NO_BANK   = "UNMATCHED_NO_BANK_CREDIT"
    DUPLICATE           = "DUPLICATE"
    AMOUNT_MISMATCH     = "AMOUNT_MISMATCH"
    DELAYED_SETTLEMENT  = "DELAYED_SETTLEMENT"
    DUPLICATE_BANK      = "DUPLICATE_BANK_CREDIT"


SEVERITY_MAP: dict[str, str] = {
    ExcType.MATCHED:             "info",
    ExcType.UNMATCHED_NO_SETTLE: "critical",
    ExcType.UNMATCHED_NO_BANK:   "high",
    ExcType.AMOUNT_MISMATCH:     "medium",
    ExcType.DUPLICATE:           "medium",
    ExcType.DELAYED_SETTLEMENT:  "low",
    ExcType.DUPLICATE_BANK:      "high",
}


# ─────────────────────────────────────────────────────────────────────────────
# I/O helpers  (pure functions, side-effect is disk read only)
# ─────────────────────────────────────────────────────────────────────────────

def load_payments(path: str | Path) -> pd.DataFrame:
    """
    Load and normalise the payments CSV.

    Expected columns: payment_id, order_id, amount, currency,
                      payment_date, method, status.

    * `payment_date` is parsed to datetime.
    * `amount` is coerced to float (bad values become NaN).
    * Column names are stripped of surrounding whitespace.
    """
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    df["payment_date"] = pd.to_datetime(df["payment_date"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    return df


def load_settlements(path: str | Path) -> pd.DataFrame:
    """
    Load and normalise the settlements CSV.

    Expected columns: settlement_id, payment_id, settled_amount,
                      settlement_date, utr_number.

    * `settlement_date` is parsed to datetime.
    * `settled_amount` is coerced to float.
    """
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    df["settlement_date"] = pd.to_datetime(df["settlement_date"], errors="coerce")
    df["settled_amount"] = pd.to_numeric(df["settled_amount"], errors="coerce")
    return df


def load_bank_statement(path: str | Path) -> pd.DataFrame:
    """
    Load and normalise the bank statement CSV.

    Expected columns: utr_number, credited_amount, credit_date, narration.

    * `credit_date` is parsed to datetime.
    * `credited_amount` is coerced to float.
    * Amount and date columns are renamed with a `bank_` prefix before the
      merge step to avoid ambiguity in the merged frame.
    """
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    df["credit_date"] = pd.to_datetime(df["credit_date"], errors="coerce")
    df["credited_amount"] = pd.to_numeric(df["credited_amount"], errors="coerce")
    return df.rename(
        columns={
            "credited_amount": "bank_credited_amount",
            "credit_date":     "bank_credit_date",
            "narration":       "bank_narration",
        }
    )


def merge_all(
    payments: pd.DataFrame,
    settlements: pd.DataFrame,
    bank: pd.DataFrame,
) -> pd.DataFrame:
    """
    Build the single wide reconciliation frame via two left-joins.
    Deduplicates bank by utr_number to preserve 1-to-1 payment mapping.
    """
    utr_col = "utr_number" if "utr_number" in bank.columns else "bank_utr_number"
    b_dedup = bank.drop_duplicates(subset=[utr_col], keep="first") if not bank.empty and utr_col in bank.columns else bank

    return (
        payments
        .merge(settlements, on="payment_id", how="left", suffixes=("", "_setl"))
        .merge(b_dedup,     on="utr_number",  how="left", suffixes=("", "_bank"))
    )



# ─────────────────────────────────────────────────────────────────────────────
# Pure classification rule functions
# Each function receives the merged DataFrame and returns a boolean mask
# (True = this row satisfies the rule).  They never mutate the input.
# ─────────────────────────────────────────────────────────────────────────────

def rule_unmatched_no_settlement(df: pd.DataFrame) -> pd.Series:
    """
    Rule: UNMATCHED_NO_SETTLEMENT
    ------------------------------
    Business logic
        A payment that has no corresponding settlement record is a critical
        exception.  This typically means the payment gateway captured money
        but the acquirer never confirmed settlement — funds may be stuck.

    Detection
        `settlement_id` is NaN after the left-join, meaning no settlement
        row with the same `payment_id` exists.

    Parameters
    ----------
    df : merged DataFrame (output of `merge_all`)

    Returns
    -------
    pd.Series[bool]
        True for rows where the payment has no settlement.
    """
    return df["settlement_id"].isna()


def rule_unmatched_no_bank_credit(df: pd.DataFrame) -> pd.Series:
    """
    Rule: UNMATCHED_NO_BANK_CREDIT
    """
    has_settlement  = df["settlement_id"].notna()
    bank_col = "bank_credited_amount" if "bank_credited_amount" in df.columns else ("credited_amount" if "credited_amount" in df.columns else None)
    if bank_col is None:
        has_bank_credit = pd.Series(False, index=df.index)
    else:
        has_bank_credit = df[bank_col].notna()
    return has_settlement & ~has_bank_credit



def rule_amount_mismatch(
    df: pd.DataFrame,
    tolerance_abs: float = 1.0,
    tolerance_pct: float = 0.005,
) -> pd.Series:
    """
    Rule: AMOUNT_MISMATCH
    ----------------------
    Business logic
        The settlement amount should equal the payment amount.  Small
        differences can arise from legitimate processing fees (e.g. 0.5–2 %).
        The rule applies a *tolerance band* to avoid false positives:

            tolerance = max(tolerance_abs, tolerance_pct × payment_amount)

        Typical values: tolerance_abs=₹1, tolerance_pct=0.5 %.
        Any discrepancy larger than the band is flagged.

    Detection
        |payment.amount - settlement.settled_amount| > tolerance

    Parameters
    ----------
    df             : merged DataFrame
    tolerance_abs  : minimum absolute tolerance in currency units (default 1)
    tolerance_pct  : relative tolerance as a fraction of the payment amount
                     (default 0.005 = 0.5 %)

    Returns
    -------
    pd.Series[bool]
        True for rows where the settled amount differs beyond tolerance.
    """
    has_settlement = df["settlement_id"].notna()
    if "settled_amount" not in df.columns:
        return pd.Series(False, index=df.index)

    tolerance = df["amount"].apply(
        lambda a: max(tolerance_abs, tolerance_pct * a) if pd.notna(a) else tolerance_abs
    )
    discrepancy = (df["amount"] - df["settled_amount"]).abs()
    return has_settlement & df["settled_amount"].notna() & (discrepancy > tolerance)


def rule_delayed_settlement(
    df: pd.DataFrame,
    sla_days: int = 2,
) -> pd.Series:
    """
    Rule: DELAYED_SETTLEMENT
    -------------------------
    Business logic
        Industry standard for payment settlement is T+2 (payment captured
        on day T, funds credited by day T+2).  Settlements beyond this SLA
        indicate processing delays and should be investigated.

        Severity is LOW because the money eventually arrived; it is an
        operational efficiency issue rather than a financial discrepancy.

    Detection
        (settlement_date − payment_date).days > sla_days

    Parameters
    ----------
    df       : merged DataFrame
    sla_days : acceptable settlement lag in calendar days (default 2)

    Returns
    -------
    pd.Series[bool]
        True for rows where settlement took longer than sla_days.

    Notes
    -----
    Rows without a settlement are excluded (those are caught by
    `rule_unmatched_no_settlement`).
    """
    has_settlement = df["settlement_id"].notna()
    if "settlement_date" not in df.columns or "payment_date" not in df.columns:
        return pd.Series(False, index=df.index)

    # Coerce to datetime first: after a left-join, missing settlement_date
    # arrives as NaN (object), which cannot be subtracted from datetime64.
    # pd.to_datetime(..., errors='coerce') converts NaN → NaT safely.
    settle_dt = pd.to_datetime(df["settlement_date"], errors="coerce", utc=False)
    pay_dt    = pd.to_datetime(df["payment_date"],    errors="coerce", utc=False)
    delay     = (settle_dt - pay_dt).dt.days
    return has_settlement & (delay > sla_days)


def rule_duplicate_payments(
    df: pd.DataFrame,
    window_secs: int = 300,
) -> pd.Series:
    """
    Rule: DUPLICATE
    ----------------
    Business logic
        A duplicate payment occurs when the same order is charged more than
        once, typically due to network retries, double-clicks, or integration
        bugs.  Duplicates are identified by grouping on (order_id, amount) and
        checking whether two payments in the same group fall within a short
        time window — indicating they were submitted in the same session rather
        than being intentional separate charges.

        Default window is 300 seconds (5 minutes).  Real-world retry logic
        can wait 1-3 minutes before retrying, so 60 seconds is too tight.
        5 minutes reliably catches manual double-submissions and automated
        retries while avoiding false-positives on genuinely separate charges.

    Detection
        1. Filter to `status == 'captured'` (only successful charges matter).
        2. Group rows by (order_id, amount).
        3. Within each group, sort by `payment_date` and compute the time
           delta between consecutive payments (seconds).
        4. If any consecutive pair is ≤ window_secs apart, flag BOTH payments
           in that pair as DUPLICATE.

    Parameters
    ----------
    df          : merged DataFrame
    window_secs : maximum seconds between two payments of the same amount
                  on the same order to be considered a duplicate (default 300
                  = 5 minutes, covers typical retry windows of 1-3 minutes)

    Returns
    -------
    pd.Series[bool]
        True for payment_ids that are part of a duplicate group.

    Notes
    -----
    * Only captured payments are considered — failed/refunded duplicates are
      not financial risk.
    * DUPLICATE takes highest classification priority: a duplicate row that
      also has no settlement (common, since processors reject duplicate charges)
      is labelled DUPLICATE, giving ops teams the specific reason rather than
      the generic UNMATCHED_NO_SETTLEMENT label.
    """
    dup_ids: set = set()

    if "order_id" not in df.columns or "payment_date" not in df.columns:
        return pd.Series(False, index=df.index)

    captured = df[
        df.get("status", pd.Series(dtype=str)).str.lower() == "captured"
    ].dropna(subset=["payment_date", "order_id", "amount"])

    # De-duplicate by payment_id before the groupby.
    # The bank join produces N rows per payment when a UTR appears N times in
    # bank_statement.csv (e.g. the generator's deliberate "bonus" duplicate
    # credit entry).  Without this, a single payment looks like a (order_id,
    # amount) group of size 2 with a 0-second gap → falsely flagged DUPLICATE.
    captured = captured.drop_duplicates(subset=["payment_id"])

    for _, group in captured.groupby(["order_id", "amount"], sort=False):
        if len(group) < 2:
            continue
        group_sorted = group.sort_values("payment_date")
        times        = group_sorted["payment_date"].tolist()
        pay_ids      = group_sorted["payment_id"].tolist()

        for i in range(1, len(times)):
            delta = (pd.Timestamp(times[i]) - pd.Timestamp(times[i - 1])).total_seconds()
            if abs(delta) <= window_secs:
                dup_ids.add(pay_ids[i])
                dup_ids.add(pay_ids[i - 1])

    return df["payment_id"].isin(dup_ids)


# ─────────────────────────────────────────────────────────────────────────────
# Classification orchestrator  (pure function — no I/O)
# ─────────────────────────────────────────────────────────────────────────────

def classify(
    df: pd.DataFrame,
    sla_days: int = 2,
    tolerance_abs: float = 1.0,
    tolerance_pct: float = 0.005,
    dup_window_secs: int = 60,
) -> pd.DataFrame:
    """
    Apply all rules to the merged DataFrame and annotate with `recon_status`.

    Priority order (highest severity wins when multiple rules match)
    ----------------------------------------------------------------
    1. DUPLICATE                — confirmed duplicate charge (most specific;
                                  applied last so it survives all overwrites)
    2. UNMATCHED_NO_SETTLEMENT  — no settlement at all
    3. UNMATCHED_NO_BANK_CREDIT — settlement exists but bank never credited
    4. AMOUNT_MISMATCH          — settled amount outside tolerance band
    5. DELAYED_SETTLEMENT       — settled > T+sla_days
    6. MATCHED                  — all checks pass (default)

    Why DUPLICATE ranks highest
    ---------------------------
    Duplicate payments typically have no settlement (the processor rejects the
    second charge), so a naive priority would classify them as
    UNMATCHED_NO_SETTLEMENT.  DUPLICATE is more specific and actionable —
    ops teams need to refund the duplicate, not chase a missing settlement.
    Applying DUPLICATE last ensures it is never overwritten.

    Parameters
    ----------
    df              : output of `merge_all`
    sla_days        : SLA threshold passed to `rule_delayed_settlement`
    tolerance_abs   : passed to `rule_amount_mismatch`
    tolerance_pct   : passed to `rule_amount_mismatch`
    dup_window_secs : passed to `rule_duplicate_payments`

    Returns
    -------
    pd.DataFrame
        Original frame with added columns:
        * `recon_status` : one of the ExcType constants
        * `delay_days`   : integer days between payment and settlement (or NaN)
    """
    out = df.copy()
    out["recon_status"] = ExcType.MATCHED  # optimistic default
    out["sla_days"] = sla_days


    # Compute delay_days once — used by both the DELAYED rule and result dict.
    # Coerce both columns to datetime so that NaN settlement_date (from a
    # left-join miss) becomes NaT instead of object, allowing safe subtraction.
    if {"payment_date", "settlement_date"}.issubset(out.columns):
        settle_dt = pd.to_datetime(out["settlement_date"], errors="coerce", utc=False)
        pay_dt    = pd.to_datetime(out["payment_date"],    errors="coerce", utc=False)
        out["delay_days"] = (settle_dt - pay_dt).dt.days
    else:
        out["delay_days"] = pd.NA

    # Apply rules from LOWEST to HIGHEST priority (later writes win).
    # DUPLICATE is applied LAST so it overwrites UNMATCHED_NO_SETTLEMENT
    # for rows that are confirmed duplicates (which naturally have no settlement).
    out.loc[rule_delayed_settlement(out, sla_days), "recon_status"] = (
        ExcType.DELAYED_SETTLEMENT
    )
    out.loc[rule_amount_mismatch(out, tolerance_abs, tolerance_pct), "recon_status"] = (
        ExcType.AMOUNT_MISMATCH
    )
    out.loc[rule_unmatched_no_bank_credit(out), "recon_status"] = (
        ExcType.UNMATCHED_NO_BANK
    )
    out.loc[rule_unmatched_no_settlement(out), "recon_status"] = (
        ExcType.UNMATCHED_NO_SETTLE
    )
    out.loc[rule_duplicate_payments(out, dup_window_secs), "recon_status"] = (
        ExcType.DUPLICATE
    )

    return out


# ─────────────────────────────────────────────────────────────────────────────
# Result builder  (pure function)
# ─────────────────────────────────────────────────────────────────────────────

def find_orphan_bank_credits(
    settlements: pd.DataFrame,
    bank: pd.DataFrame,
) -> list[dict[str, Any]]:
    """
    Identify bank statement rows whose utr_number does not exist in any settlement.

    Emits UNMATCHED_NO_BANK_CREDIT exceptions for standalone bank deposits that
    were received without an internal settlement record.
    """
    if bank.empty or ("utr_number" not in bank.columns and "bank_utr_number" not in bank.columns):
        return []

    utr_col = "utr_number" if "utr_number" in bank.columns else "bank_utr_number"

    settled_utrs = set()
    if not settlements.empty and "utr_number" in settlements.columns:
        settled_utrs = set(settlements["utr_number"].dropna().astype(str).str.strip())

    orphans: list[dict[str, Any]] = []

    for _, row in bank.iterrows():
        utr = row.get(utr_col)
        if pd.isna(utr) or str(utr).strip() not in settled_utrs:
            amount = row.get("bank_credited_amount") if "bank_credited_amount" in row else row.get("credited_amount")
            credit_date = row.get("bank_credit_date") if "bank_credit_date" in row else row.get("credit_date")
            narration = row.get("bank_narration") if "bank_narration" in row else row.get("narration", "")

            amount_val = _safe_float(amount)
            utr_str = _safe_str(utr)
            date_str = _safe_ts(credit_date)

            detail_msg = f"unidentified bank credit for UTR {utr_str}: ₹{amount_val} ({narration})" if narration else f"unidentified bank credit for UTR {utr_str}: ₹{amount_val}"

            orphans.append({
                "type": ExcType.UNMATCHED_NO_BANK,
                "payment_id": None,
                "order_id": None,
                "exception_date": date_str,
                "details": detail_msg,
                "description": detail_msg,
                "suggested_action": "trace unidentified bank credit — money received with no matching settlement record",
                "amount": amount_val,
                "amount_impact": amount_val,
                "severity": "high",
                "settlement_id": None,
                "utr_number": utr_str,
                "payment_date": None,
                "settlement_date": None,
                "delay_days": None,
                "settled_amount": amount_val,
                "bank_amount": amount_val,
                "internal_amount": None,
                "discrepancy_amount": amount_val,
            })

    return orphans


def find_duplicate_bank_credits(bank: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Identify duplicate bank statement entries for the same utr_number.

    Emits DUPLICATE_BANK_CREDIT exceptions for each extra credit beyond the first on a UTR.
    """
    if bank.empty or ("utr_number" not in bank.columns and "bank_utr_number" not in bank.columns):
        return []

    utr_col = "utr_number" if "utr_number" in bank.columns else "bank_utr_number"
    duplicates: list[dict[str, Any]] = []

    for utr, group in bank.groupby(utr_col, sort=False):
        if pd.isna(utr) or len(group) < 2:
            continue

        rows = group.to_dict("records")
        for extra_row in rows[1:]:
            amount = extra_row.get("bank_credited_amount") if "bank_credited_amount" in extra_row else extra_row.get("credited_amount")
            credit_date = extra_row.get("bank_credit_date") if "bank_credit_date" in extra_row else extra_row.get("credit_date")
            narration = extra_row.get("bank_narration") if "bank_narration" in extra_row else extra_row.get("narration", "")

            amount_val = _safe_float(amount)
            utr_str = _safe_str(utr)
            extra_date_str = _safe_ts(credit_date)

            detail_msg = f"duplicate bank credit entry for UTR {utr_str}: ₹{amount_val} ({narration})" if narration else f"duplicate bank credit entry for UTR {utr_str}: ₹{amount_val}"

            duplicates.append({
                "type": ExcType.DUPLICATE_BANK,
                "payment_id": None,
                "order_id": None,
                "exception_date": extra_date_str,
                "details": detail_msg,
                "description": detail_msg,
                "suggested_action": "verify double credit with bank — funds may need reversal",
                "amount": amount_val,
                "amount_impact": amount_val,
                "severity": "high",
                "settlement_id": None,
                "utr_number": utr_str,
                "payment_date": None,
                "settlement_date": None,
                "delay_days": None,
                "settled_amount": amount_val,
                "bank_amount": amount_val,
                "internal_amount": None,
                "discrepancy_amount": amount_val,
            })

    return duplicates


def build_result(
    classified: pd.DataFrame,
    sla_days: int,
    settlements: pd.DataFrame | None = None,
    bank: pd.DataFrame | None = None,
) -> dict[str, Any]:
    """
    Convert the classified DataFrame into the final result dict.

    Parameters
    ----------
    classified : output of `classify`
    sla_days   : echoed back into the result for traceability
    settlements: optional settlements DataFrame for orphan bank check
    bank       : optional bank statement DataFrame for orphan bank check

    Returns
    -------
    dict with keys:
        match_rate            : float  — percentage of MATCHED rows
        total_records         : int
        matched               : int
        unmatched             : int
        exception_counts      : dict[str, int] — count per exception type
        exceptions            : list[dict]     — structured list of exceptions
        unmatched_bank_credits: dict           — count & sum of orphan bank credits
        settlement_totals     : dict           — financial summary
        sla_days_used         : int
        run_at                : ISO-8601 UTC timestamp string
    """
    total   = len(classified)
    matched = int((classified["recon_status"] == ExcType.MATCHED).sum())
    match_rate = round((matched / total * 100) if total > 0 else 0.0, 2)

    exceptions = _build_exceptions(classified)

    orphan_exceptions: list[dict[str, Any]] = []
    duplicate_bank_exceptions: list[dict[str, Any]] = []
    if settlements is not None and bank is not None:
        orphan_exceptions = find_orphan_bank_credits(settlements, bank)
        duplicate_bank_exceptions = find_duplicate_bank_credits(bank)

    all_exceptions = exceptions + orphan_exceptions + duplicate_bank_exceptions


    exc_counts: dict[str, int] = {}
    for e in all_exceptions:
        exc_counts[e["type"]] = exc_counts.get(e["type"], 0) + 1

    unmatched_bank_credits = {
        "count": len(orphan_exceptions),
        "total_amount": round(sum((e["amount"] or 0.0) for e in orphan_exceptions), 2),
    }

    settled_rows = classified[classified["settled_amount"].notna()] if "settled_amount" in classified.columns else classified.iloc[0:0]
    total_payment  = round(float(classified["amount"].sum()), 2)
    total_settled  = round(float(settled_rows["settled_amount"].sum()), 2) if len(settled_rows) > 0 else 0.0
    total_discrepancy = round(
        float((classified["amount"] - classified.get("settled_amount", pd.Series(0.0, index=classified.index)).fillna(0)).abs().sum()),
        2,
    )

    amount_mismatches_total = round(
        sum(
            (e.get("amount_impact") or e.get("discrepancy_amount") or 0.0)
            for e in all_exceptions
            if e.get("type") == ExcType.AMOUNT_MISMATCH or e.get("type") == "AMOUNT_MISMATCH"
        ),
        2,
    )
    unsettled_value_total = round(
        sum(
            (e.get("amount") or e.get("internal_amount") or 0.0)
            for e in all_exceptions
            if e.get("type") == ExcType.UNMATCHED_NO_SETTLE or e.get("type") == "UNMATCHED_NO_SETTLEMENT"
        ),
        2,
    )
    duplicate_charges_total = round(
        sum(
            (e.get("amount_impact") or e.get("discrepancy_amount") or 0.0)
            for e in all_exceptions
            if e.get("type") == ExcType.DUPLICATE or e.get("type") == "DUPLICATE"
        ),
        2,
    )

    return {
        "match_rate":            match_rate,
        "total_records":         total,
        "matched":               matched,
        "unmatched":             total - matched,
        "exception_counts":      exc_counts,
        "exceptions":            all_exceptions,
        "unmatched_bank_credits": unmatched_bank_credits,
        "settlement_totals": {
            "total_payment_amount":    total_payment,
            "total_settled_amount":    total_settled,
            "total_discrepancy":       total_discrepancy,
            "amount_mismatches_total": amount_mismatches_total,
            "unsettled_value_total":   unsettled_value_total,
            "duplicate_charges_total": duplicate_charges_total,
            "currency":                "INR",
        },
        "sla_days_used": sla_days,
        "run_at":        datetime.now(timezone.utc).isoformat(),
    }


def _build_exceptions(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Convert every non-MATCHED row into a structured exception entry.

    Each exception dict contains enough context for the UI to display a
    meaningful card and for the AI chat to answer natural-language questions
    about the results.
    """
    exceptions: list[dict[str, Any]] = []

    for _, row in df[df["recon_status"] != ExcType.MATCHED].iterrows():
        exc_type = row["recon_status"]
        amount   = row.get("amount")
        settled  = row.get("settled_amount")

        exceptions.append({
            "type":            exc_type,
            # ── Structured identity fields (first-class, never embed in strings) ──
            "payment_id":      _safe_str(row.get("payment_id")),
            "order_id":        _safe_str(row.get("order_id")),
            "exception_date":  _exception_date(row, exc_type),
            # ── Human-readable summary (may reference IDs as text) ──
            "details":         _exception_detail(row, exc_type),
            # ── Financial fields ──
            "amount":          _safe_float(amount),
            "amount_impact":   _amount_impact(row, exc_type),
            "severity":        SEVERITY_MAP.get(exc_type, "medium"),
            # ── Settlement / bank context ──
            "settlement_id":   _safe_str(row.get("settlement_id")),
            "utr_number":      _safe_str(row.get("utr_number")),
            "payment_date":    _safe_ts(row.get("payment_date")),
            "settlement_date": _safe_ts(row.get("settlement_date")),
            "delay_days":      _safe_int(row.get("delay_days")),
            "settled_amount":  _safe_float(settled),
        })

    return exceptions


def _exception_date(row: pd.Series, exc_type: str) -> str | None:
    """
    Return the single most relevant ISO-8601 timestamp for this exception.

    Rationale per type
    ------------------
    UNMATCHED_NO_SETTLEMENT  → payment_date   (no settlement exists; pin to when money left)
    DUPLICATE                → payment_date   (earliest charge date is the reference point)
    AMOUNT_MISMATCH          → settlement_date (mismatch is discovered at settlement time)
    UNMATCHED_NO_BANK_CREDIT → settlement_date (settlement was created; bank didn't credit)
    DELAYED_SETTLEMENT       → settlement_date (the late arrival date is what matters)
    """
    _USE_PAYMENT_DATE = {ExcType.UNMATCHED_NO_SETTLE, ExcType.DUPLICATE}
    if exc_type in _USE_PAYMENT_DATE:
        return _safe_ts(row.get("payment_date"))
    return _safe_ts(row.get("settlement_date"))


def _exception_detail(row: pd.Series, exc_type: str) -> str:
    """Return a human-readable one-liner describing the specific anomaly."""
    amount  = row.get("amount", 0)
    settled = row.get("settled_amount")

    messages = {
        ExcType.UNMATCHED_NO_SETTLE: (
            f"payment {row.get('payment_id')} (₹{amount}) has no settlement record"
        ),
        ExcType.UNMATCHED_NO_BANK: (
            f"settlement {row.get('settlement_id')} exists but no bank credit "
            f"found for UTR {row.get('utr_number')}"
        ),
        ExcType.AMOUNT_MISMATCH: (
            f"payment ₹{amount} ≠ settled ₹{settled} "
            f"(Δ ₹{round(abs(float(amount or 0) - float(settled or 0)), 2)})"
        ),
        ExcType.DELAYED_SETTLEMENT: (
            f"settled T+{_safe_int(row.get('delay_days'))} days "
            f"(SLA T+{row.get('sla_days', 2)})"
        ),
        ExcType.DUPLICATE: (
            f"duplicate charge on order {row.get('order_id')} "
            f"amount ₹{amount}"
        ),
    }
    return messages.get(exc_type, "")


def _amount_impact(row: pd.Series, exc_type: str) -> float | None:
    """Return the financial impact of the exception in currency units."""
    amount  = row.get("amount")
    settled = row.get("settled_amount")

    # All exception types: calculate |amount - settled_amount| as financial impact
    # If settled_amount is None or NaN, treat as 0.0
    if pd.notna(amount):
        settled_val = float(settled) if pd.notna(settled) else 0.0
        return round(abs(float(amount) - settled_val), 2)
    
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Thin orchestrator class
# ─────────────────────────────────────────────────────────────────────────────

class ReconciliationEngine:
    """
    Thin orchestrator that wires together load → merge → classify → build_result.

    All business logic lives in the pure functions above so they can be unit-
    tested independently.  The class only manages file paths and default params.
    """

    def __init__(
        self,
        payments_path: str | Path,
        settlements_path: str | Path,
        bank_statement_path: str | Path,
        sla_days: int = 2,
        tolerance_abs: float = 1.0,
        tolerance_pct: float = 0.005,
        dup_window_secs: int = 300,
    ) -> None:
        self.payments_path    = Path(payments_path)
        self.settlements_path = Path(settlements_path)
        self.bank_path        = Path(bank_statement_path)
        self.sla_days         = sla_days
        self.tolerance_abs    = tolerance_abs
        self.tolerance_pct    = tolerance_pct
        self.dup_window_secs  = dup_window_secs

    def run(self) -> dict[str, Any]:
        """
        Execute the full reconciliation pipeline.

        Returns
        -------
        dict
            See `build_result` for the full schema.
        """
        logger.info("ReconciliationEngine.run() started")

        payments    = load_payments(self.payments_path)
        settlements = load_settlements(self.settlements_path)
        bank        = load_bank_statement(self.bank_path)

        merged     = merge_all(payments, settlements, bank)
        classified = classify(
            merged,
            sla_days=self.sla_days,
            tolerance_abs=self.tolerance_abs,
            tolerance_pct=self.tolerance_pct,
            dup_window_secs=self.dup_window_secs,
        )
        result = build_result(classified, sla_days=self.sla_days, settlements=settlements, bank=bank)

        logger.info(
            "Reconciliation done — match_rate=%.2f%% total=%d exceptions=%d",
            result["match_rate"], result["total_records"], len(result["exceptions"]),
        )
        return result



# ─────────────────────────────────────────────────────────────────────────────
# Small utility helpers (pure, no side-effects)
# ─────────────────────────────────────────────────────────────────────────────

def _safe_float(val: Any) -> float | None:
    try:
        v = float(val)
        return None if pd.isna(v) else round(v, 2)
    except (TypeError, ValueError):
        return None


def _safe_int(val: Any) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _safe_str(val: Any) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    return str(val)


def _safe_ts(val: Any) -> str | None:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return pd.Timestamp(val).isoformat()
    except Exception:
        return None
