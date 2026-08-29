# RazorRecon AI

**An AI-powered finance controller that reconciles payments, settlements, and bank statements — catching mismatches, duplicates, and delays that manual reconciliation misses, with an AI assistant for finance operations teams.**

Built for the Razorpay Buildathon — Track 04: AI Finance Controller.

---

## The Problem

Every settlement cycle, finance teams manually cross-check thousands of payments against internal settlement records and bank credits. Mismatches, duplicates, unsettled payments, and SLA breaches hide inside that data — and finding them by hand is slow, error-prone, and doesn't scale.

The 2026 builder consensus this track is built around is simple: **verification capacity, not generation speed, is the bottleneck.** Anyone can generate a report. The hard part is verifying that 60+ transactions across three separate data sources actually agree with each other — and being honest about the ones that don't.

RazorRecon AI automates that verification loop end-to-end: upload three CSVs, get a match rate, a categorized exception list, and an AI assistant that can answer questions about what it found — all grounded in the real data, nothing invented.

---

## What It Does

1. **Upload** three CSVs — `payments.csv`, `settlements.csv`, `bank_statement.csv`
2. **Reconcile** automatically using a rule-based Pandas engine, cross-matching all three sources
3. **Detect** five categories of exceptions:
   - Payments with no matching settlement
   - Settlements with no matching bank credit
   - Duplicate charges (same order, same amount, close in time)
   - Amount mismatches (settled amount ≠ payment amount, beyond tolerance)
   - Delayed settlements (beyond a configurable SLA, default T+2)
4. **Report** a match rate, a full exception list with severity levels, and a financial breakdown that splits the total discrepancy into exactly what it's made of — genuine rate mismatches, still-pending settlements, and duplicate-charge exposure — rather than one opaque number
5. **Explain** every exception in plain English using Gemini, grounded strictly in the actual data (no invented numbers or IDs)
6. **Answer questions** through a Settlement Q&A chatbot — ask things like *"which exception has the highest amount impact?"* and get an answer citing real payment IDs and figures
7. **Export** a formatted Excel report (Summary, Exceptions, and Raw Reconciliation sheets) for the finance team
8. **Track history** across multiple reconciliation runs, with a match-rate trend chart over time

---

## Live Example (Sample Data)

On a 63-record sample batch, seeded reproducibly (`random.seed(42)`):

| Metric | Value |
|---|---|
| Match Rate | 68.3% |
| Total Records | 63 |
| Matched | 43 |
| Total Exceptions | 23 |
| Total Billed | ₹15,90,488.38 |
| Total Settled | ₹13,70,222.08 |
| Gross Discrepancy | ₹2,20,266.30 |
| — of which, Amount Mismatches | ₹1,659.62 |
| — of which, Unsettled Value | ₹1,56,084.25 |
| — of which, Duplicate Charges | ₹62,522.43 |
| Processing time | ~1–3 seconds |

Every exception in this run is independently verifiable — the sample data generator prints out exactly which anomalies it injected, and the reconciliation engine catches 100% of them.

---

## Architecture

```
React + Vite + TypeScript + Tailwind (frontend, port 5173)
        │  REST calls (axios)
        ▼
FastAPI backend (port 8001)
        │
        ├── /reconcile/upload      → validates & saves the 3 CSVs
        ├── /reconcile/run         → runs the Pandas engine, persists results
        ├── /reconcile/summary     → match rate, exception counts, financial split
        ├── /reconcile/exceptions  → paginated, filterable, searchable exception list
        ├── /reconcile/runs        → history of past runs
        ├── /reconcile/chat        → Gemini-powered Settlement Q&A
        ├── /reconcile/exceptions/{id}/ai-analysis → cached AI exception explanations
        ├── /reconcile/report      → downloadable Excel report
        └── /summary/trends        → match rate over time, for the trend chart

SQLite — stores runs, exceptions, and cached AI analysis (so results survive a refresh
and don't re-call the Gemini API on every page load)

Gemini API (google-genai SDK) — two features:
  (a) plain-English exception explanations, batched and cached
  (b) a Settlement Q&A chatbot, grounded in the full run's structured data
```

A single FastAPI monolith and a single React app — no microservices, no Docker, no unnecessary infrastructure for a project at this scale.

---

## Key Design Decisions

**No vector RAG for the chatbot.** The dataset is ~60–100 records per run — small enough to pass the entire structured summary and exception list directly into the Gemini prompt on every call. Building embeddings and a vector store for a dataset this size would be over-engineering, not sophistication. This is a deliberate scoping decision.

**Exception rules resolve by priority, not by first-match.** When a single transaction could be flagged by more than one rule — for example, a duplicate payment that also has no settlement — the engine applies a fixed priority order (Duplicate > Unmatched-No-Settlement > Unmatched-No-Bank-Credit > Amount-Mismatch > Delayed-Settlement) so every exception gets exactly one, most-specific diagnosis instead of being double-counted or mislabeled.

**The financial discrepancy is split into three honest categories, not one number.** Billed minus Settled produces a gross discrepancy figure, but that figure is a mix of genuinely different situations: money that's simply pending settlement, money lost to duplicate charges, and money lost to real rate/calculation errors. Reporting these separately — and verifying, in code and in tests, that they sum exactly to the gross total — avoids the misleading framing of calling pending settlements "errors."

**AI outputs are grounded and cached, not trusted blindly.** Every AI-generated explanation and every chatbot answer is built strictly from the run's actual database records, with an explicit instruction to the model never to invent numbers, dates, or IDs. Results are cached in SQLite after the first call, so repeat views don't re-hit the API. This was independently verified multiple times during development — every specific number and payment ID a chatbot or explanation returned was cross-checked against the raw exception records and matched exactly.

**Reproducible test data.** The sample data generator uses a fixed random seed by default, so anyone who clones this repo and runs it gets identical output — including a printed summary of exactly which anomalies were injected, so the reconciliation engine's accuracy can be checked against known ground truth.

---

## Tech Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, Recharts
- **Backend:** FastAPI, SQLAlchemy, SQLite, Pandas
- **AI:** Google Gemini (`google-genai` SDK), with an automatic model-fallback chain
- **Reports:** openpyxl (Excel export)
- **Testing:** pytest (69 tests, covering every reconciliation rule, priority logic, API endpoint, and edge case — empty files, malformed CSVs, missing columns, non-numeric values)

---

## Setup Instructions

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt

# Add your Gemini API key
cp .env.example .env
# edit .env and add: GEMINI_API_KEY=your_key_here

uvicorn app.main:app --reload --port 8001
```
API docs available at `http://127.0.0.1:8001/docs`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App available at `http://localhost:5173`

### Generate sample data
```bash
cd backend
python generate_sample_data.py
```
This creates `payments.csv`, `settlements.csv`, and `bank_statement.csv` in `sample_data/`, with a printed summary of every anomaly injected — useful for verifying the reconciliation engine's accuracy yourself.

### Run tests
```bash
cd backend
python -m pytest tests/test_reconciliation.py -v
```

---

## What I'd Build Next

- Multi-currency reconciliation support
- Direct bank API integration instead of CSV upload, for real-time reconciliation
- ML-based anomaly scoring to complement the rule-based engine, for exceptions that don't fit a clean rule
- An approval/audit-trail workflow so flagged exceptions can be assigned and resolved by a team, not just viewed
- Configurable, per-merchant reconciliation rules instead of one global rule set

---

## Repository Structure

```
razorrecon-ai/
├── backend/
│   ├── app/
│   │   ├── models.py              # SQLAlchemy models
│   │   ├── database.py
│   │   ├── services/
│   │   │   ├── reconciliation.py  # the core reconciliation engine
│   │   │   ├── ai_analysis.py     # Gemini exception analysis
│   │   │   ├── chat_assistant.py  # Gemini Settlement Q&A
│   │   │   └── report_generator.py # Excel export
│   │   └── routers/
│   ├── tests/
│   │   └── test_reconciliation.py # 69 tests
│   └── generate_sample_data.py
├── frontend/
│   └── src/
│       ├── pages/                 # Dashboard, Upload, Exceptions, History, Chat, Reports
│       ├── components/
│       └── lib/api.ts
└── README.md
```