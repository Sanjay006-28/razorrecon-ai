"""
Diagnostic: show exactly which payment_ids are flagged as DUPLICATE
and why, after running the full merge pipeline on real sample CSVs.
"""
import pandas as pd
from pathlib import Path
from app.services.reconciliation import (
    load_payments, load_settlements, load_bank_statement,
    merge_all, rule_duplicate_payments, classify, ExcType,
)

BASE = Path(__file__).parent / "sample_data"
payments    = load_payments(BASE / "payments.csv")
settlements = load_settlements(BASE / "settlements.csv")
bank        = load_bank_statement(BASE / "bank_statement.csv")

print(f"\nPayments rows  : {len(payments)}")
print(f"Settlements rows: {len(settlements)}")
print(f"Bank rows      : {len(bank)}")

merged = merge_all(payments, settlements, bank)
print(f"Merged rows    : {len(merged)}  ← should equal payments count unless bank join creates extras\n")

# Check if any payment_id appears more than once in merged (bank join artifact)
counts = merged["payment_id"].value_counts()
duped_pays = counts[counts > 1]
if not duped_pays.empty:
    print("=== payment_ids appearing >1 time in merged frame (bank join artifact) ===")
    for pid, n in duped_pays.items():
        print(f"  {pid}  →  {n} rows")
else:
    print("No bank-join-caused duplicates found.\n")

# Run the duplicate rule
dup_mask = rule_duplicate_payments(merged, window_secs=300)
print(f"\nDuplicate rule: {dup_mask.sum()} rows flagged (expected 6)\n")
print("=== Flagged rows ===")
print(merged.loc[dup_mask, ["payment_id", "order_id", "amount", "payment_date", "settlement_id"]].to_string())
