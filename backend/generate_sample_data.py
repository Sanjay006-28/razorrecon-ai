"""
generate_sample_data.py
-----------------------
Generates realistic sample CSVs for testing the reconciliation engine.

Injected issues (tracked and printed at the end):
  - 5  payments  with NO matching settlement          → unmatched payments
  - 3  duplicate payment entries (same order_id/amount, close timestamps)
  - 4  settlements where settled_amount ≠ payment amount (fee/error)
  - 6  settlements delayed > T+2 SLA (3-10 days late)
  - 2  bank statement entries with NO matching settlement record
"""

import os
import random
import sys
from datetime import datetime, timedelta

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

import pandas as pd
from faker import Faker

# ── CLI arguments & reproducibility ──────────────────────────────────────────
import argparse

parser = argparse.ArgumentParser(description="Generate sample reconciliation CSVs.")
parser.add_argument("--seed", type=int, default=42, help="Random seed (default 42)")
parser.add_argument("--output", type=str, default=None, help="Output directory path")
args = parser.parse_args()

current_seed = args.seed
random.seed(current_seed)
fake = Faker("en_IN")
Faker.seed(current_seed)

if args.output:
    OUTPUT_DIR = os.path.abspath(args.output)
else:
    OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "sample_data")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── helpers ──────────────────────────────────────────────────────────────────
BASE_DATE = datetime(2024, 6, 1)

CURRENCIES   = ["INR"]
METHODS      = ["card", "upi", "netbanking", "wallet", "emi"]
PAY_STATUSES = ["captured", "captured", "captured", "failed", "refunded"]


def rand_date(start: datetime, spread_days: int = 30) -> datetime:
    """Random datetime within [start, start + spread_days]."""
    return start + timedelta(
        days=random.randint(0, spread_days),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
        seconds=random.randint(0, 59),
    )


def fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def new_payment_id() -> str:
    return f"pay_{fake.unique.bothify(text='??########').upper()}"


def new_order_id() -> str:
    return f"ord_{fake.unique.bothify(text='??########').upper()}"


def new_settlement_id() -> str:
    return f"setl_{fake.unique.bothify(text='??########').upper()}"


def new_utr() -> str:
    return fake.bothify(text="UTR####################")


def rand_amount() -> float:
    return round(random.uniform(100, 50_000), 2)


# ── tracking dicts for the summary report ────────────────────────────────────
issues = {
    "unmatched_payment_ids":     [],   # 5 payments → no settlement
    "duplicate_payment_ids":     [],   # 3 duplicates (pairs share order_id)
    "amount_mismatch_setl_ids":  [],   # 4 settlements with wrong amount
    "delayed_settlement_ids":    [],   # 6 settlements > T+2
    "ghost_bank_utrs":           [],   # 2 bank entries with no settlement
}

# ════════════════════════════════════════════════════════════════════════════
# 1. PAYMENTS  (target 60 rows)
# ════════════════════════════════════════════════════════════════════════════
payments = []

# --- 55 "normal" captured payments (will get settlements later) -------------
normal_payment_ids = []
for _ in range(55):
    pid   = new_payment_id()
    pdate = rand_date(BASE_DATE)
    normal_payment_ids.append(pid)
    payments.append({
        "payment_id":   pid,
        "order_id":     new_order_id(),
        "amount":       rand_amount(),
        "currency":     random.choice(CURRENCIES),
        "payment_date": fmt(pdate),
        "method":       random.choice(METHODS),
        "status":       "captured",
        "_pdate_obj":   pdate,          # internal – removed before saving
    })

# --- 5 UNMATCHED payments (no settlement will be created for these) ---------
unmatched_pids = []
for _ in range(5):
    pid   = new_payment_id()
    pdate = rand_date(BASE_DATE)
    unmatched_pids.append(pid)
    issues["unmatched_payment_ids"].append(pid)
    payments.append({
        "payment_id":   pid,
        "order_id":     new_order_id(),
        "amount":       rand_amount(),
        "currency":     random.choice(CURRENCIES),
        "payment_date": fmt(pdate),
        "method":       random.choice(METHODS),
        "status":       "captured",
        "_pdate_obj":   pdate,
    })

# --- 3 DUPLICATE payment entries -------------------------------------------
# Pick 3 existing payments and inject near-identical rows with a new payment_id
# but SAME order_id, SAME amount, timestamp ±1-3 minutes.
dup_source_indices = random.sample(range(len(normal_payment_ids)), 3)
for idx in dup_source_indices:
    original = payments[idx]
    dup_pid  = new_payment_id()
    issues["duplicate_payment_ids"].append(
        f"{original['payment_id']} ↔ {dup_pid}"
    )
    dup_date = datetime.strptime(original["payment_date"], "%Y-%m-%d %H:%M:%S") + timedelta(
        minutes=random.randint(1, 3)
    )
    payments.append({
        "payment_id":   dup_pid,
        "order_id":     original["order_id"],    # ← same order_id (duplicate signal)
        "amount":       original["amount"],       # ← same amount
        "currency":     original["currency"],
        "payment_date": fmt(dup_date),
        "method":       original["method"],
        "status":       "captured",
        "_pdate_obj":   dup_date,
    })

# Build final payments DataFrame (drop internal helper column)
df_payments = pd.DataFrame(payments)
df_payments = df_payments.drop(columns=["_pdate_obj"])
df_payments.to_csv(os.path.join(OUTPUT_DIR, "payments.csv"), index=False)


# ════════════════════════════════════════════════════════════════════════════
# 2. SETTLEMENTS  (target 55 rows)
# ════════════════════════════════════════════════════════════════════════════
settlements       = []
settlement_utrs   = []   # track UTRs used so bank_statement can reference them

# --- pick which 6 normal payments get DELAYED settlement --------------------
delayed_indices      = random.sample(range(55), 6)
delayed_set          = set(delayed_indices)

# --- pick which 4 of the remaining get AMOUNT MISMATCH ---------------------
remaining_indices    = [i for i in range(55) if i not in delayed_set]
mismatch_indices     = set(random.sample(remaining_indices, 4))

for i, row in enumerate(payments[:55]):   # only the 55 normal payments
    pay_amount = row["amount"]
    pay_date   = datetime.strptime(row["payment_date"], "%Y-%m-%d %H:%M:%S")

    # settlement date: normally T+2
    if i in delayed_set:
        delay_days = random.randint(3, 10)          # T+3 to T+10 → SLA breach
        sdate = pay_date + timedelta(days=2 + delay_days)
        sid   = new_settlement_id()
        issues["delayed_settlement_ids"].append(
            f"{sid} (payment {row['payment_id']}, delay +{2 + delay_days}d)"
        )
    else:
        sdate = pay_date + timedelta(days=2, hours=random.randint(0, 8))
        sid   = new_settlement_id()

    # settled amount: normally equal to payment amount
    if i in mismatch_indices:
        # small fee deducted (0.5% – 2%) or rounding error ±₹5
        fee   = round(pay_amount * random.uniform(0.005, 0.02), 2)
        settled = round(pay_amount - fee, 2)
        issues["amount_mismatch_setl_ids"].append(
            f"{sid} (expected {pay_amount}, got {settled}, diff {pay_amount - settled:.2f})"
        )
    else:
        settled = pay_amount

    utr = new_utr()
    settlement_utrs.append(utr)

    settlements.append({
        "settlement_id":   sid,
        "payment_id":      row["payment_id"],
        "settled_amount":  settled,
        "settlement_date": fmt(sdate),
        "utr_number":      utr,
    })

df_settlements = pd.DataFrame(settlements)
df_settlements.to_csv(os.path.join(OUTPUT_DIR, "settlements.csv"), index=False)


# ════════════════════════════════════════════════════════════════════════════
# 3. BANK STATEMENT  (target 58 rows)
# ════════════════════════════════════════════════════════════════════════════
bank_rows = []

# --- 56 entries that MATCH a real settlement UTR ---------------------------
# pick 56 of the 55 UTRs (can only use 55 at most) → use all 55 + 1 extra
sampled_utrs = settlement_utrs[:]          # all 55
random.shuffle(sampled_utrs)

for utr in sampled_utrs:
    # find the matching settlement for the credit amount
    match = next(s for s in settlements if s["utr_number"] == utr)
    cdate = datetime.strptime(match["settlement_date"], "%Y-%m-%d %H:%M:%S") + timedelta(
        hours=random.randint(0, 4)
    )
    bank_rows.append({
        "utr_number":     utr,
        "credited_amount": match["settled_amount"],
        "credit_date":    fmt(cdate),
        "narration":      fake.sentence(nb_words=6),
    })

# --- 2 GHOST bank entries (UTR has no matching settlement) -----------------
for _ in range(2):
    ghost_utr = new_utr()
    issues["ghost_bank_utrs"].append(ghost_utr)
    ghost_date = rand_date(BASE_DATE)
    bank_rows.append({
        "utr_number":      ghost_utr,
        "credited_amount": rand_amount(),
        "credit_date":     fmt(ghost_date),
        "narration":       fake.sentence(nb_words=6),
    })

# --- 1 extra matched entry to hit 58 rows total (duplicate bank credit) ----
bonus_utr = random.choice(settlement_utrs)
bonus_match = next(s for s in settlements if s["utr_number"] == bonus_utr)
b_date = datetime.strptime(bonus_match["settlement_date"], "%Y-%m-%d %H:%M:%S") + timedelta(hours=6)
bank_rows.append({
    "utr_number":      bonus_utr,
    "credited_amount": bonus_match["settled_amount"],
    "credit_date":     fmt(b_date),
    "narration":       "DUPLICATE CREDIT ENTRY - " + fake.word(),
})

random.shuffle(bank_rows)
df_bank = pd.DataFrame(bank_rows)
df_bank.to_csv(os.path.join(OUTPUT_DIR, "bank_statement.csv"), index=False)


# ════════════════════════════════════════════════════════════════════════════
# SUMMARY REPORT
# ════════════════════════════════════════════════════════════════════════════
SEPARATOR = "=" * 70

print(f"\n{SEPARATOR}")
print("  SAMPLE DATA GENERATION COMPLETE")
print(SEPARATOR)
print(f"  > Output folder : {os.path.abspath(OUTPUT_DIR)}")
print(f"  payments.csv     : {len(df_payments)} rows")
print(f"  settlements.csv  : {len(df_settlements)} rows")
print(f"  bank_statement.csv: {len(df_bank)} rows")

print(f"\n{SEPARATOR}")
print("  INJECTED ISSUES — Expected Catches by Reconciliation Engine")
print(SEPARATOR)

print(f"\n🔴 [1] UNMATCHED PAYMENTS ({len(issues['unmatched_payment_ids'])}) — no settlement exists")
for pid in issues["unmatched_payment_ids"]:
    print(f"      • {pid}")

print(f"\n🟠 [2] DUPLICATE PAYMENT ENTRIES ({len(issues['duplicate_payment_ids'])}) — same order_id + amount")
for pair in issues["duplicate_payment_ids"]:
    print(f"      • {pair}")

print(f"\n🟡 [3] AMOUNT MISMATCHES ({len(issues['amount_mismatch_setl_ids'])}) — settled_amount ≠ payment amount")
for detail in issues["amount_mismatch_setl_ids"]:
    print(f"      • {detail}")

print(f"\n🔵 [4] DELAYED SETTLEMENTS ({len(issues['delayed_settlement_ids'])}) — beyond T+2 SLA")
for detail in issues["delayed_settlement_ids"]:
    print(f"      • {detail}")

print(f"\n🟣 [5] GHOST BANK ENTRIES ({len(issues['ghost_bank_utrs'])}) — credited with no matching settlement")
for utr in issues["ghost_bank_utrs"]:
    print(f"      • {utr}")

print(f"\n{SEPARATOR}")
total = (
    len(issues["unmatched_payment_ids"])
    + len(issues["duplicate_payment_ids"])
    + len(issues["amount_mismatch_setl_ids"])
    + len(issues["delayed_settlement_ids"])
    + len(issues["ghost_bank_utrs"])
)
print(f"  Total injected anomalies : {total}")
print(f"{SEPARATOR}\n")
