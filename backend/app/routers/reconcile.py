"""
app/routers/reconcile.py
------------------------
Endpoints:
  POST /api/v1/reconcile/upload          — upload 3 CSV files, validate columns
  POST /api/v1/reconcile/run             — run engine, persist results to SQLite
  GET  /api/v1/reconcile/summary/{run_id}   — match rate + financial totals
  GET  /api/v1/reconcile/exceptions/{run_id} — paginated exception list
"""

from __future__ import annotations

import io
import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Exception as ExceptionModel
from app.models import ExceptionSeverity, ReconciliationRun, ReconciliationStatus
from app.services.reconciliation import ReconciliationEngine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reconcile", tags=["Reconciliation"])

# ── Upload storage ────────────────────────────────────────────────────────────
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ── Required column sets per file type ───────────────────────────────────────
REQUIRED_COLUMNS: dict[str, set[str]] = {
    "payments": {
        "payment_id", "order_id", "amount",
        "payment_date", "method", "status",
    },
    "settlements": {
        "settlement_id", "payment_id",
        "settled_amount", "settlement_date", "utr_number",
    },
    "bank_statement": {
        "utr_number", "credited_amount", "credit_date",
    },
}

# ── Severity string → DB Enum ─────────────────────────────────────────────────
_SEV_MAP: dict[str, ExceptionSeverity] = {
    "critical": ExceptionSeverity.CRITICAL,
    "high":     ExceptionSeverity.HIGH,
    "medium":   ExceptionSeverity.MEDIUM,
    "low":      ExceptionSeverity.LOW,
    "info":     ExceptionSeverity.LOW,
}


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ─────────────────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    upload_id: str
    files: dict[str, str]           # file_key → original filename
    valid: bool
    message: str


class ReconcileRequest(BaseModel):
    upload_id: str
    run_name: Optional[str] = None
    sla_days: int = 2


class ReconcileResponse(BaseModel):
    run_id: int
    match_rate: float
    total_records: int
    matched: int
    unmatched: int
    exception_counts: dict[str, int]
    settlement_totals: dict
    unmatched_bank_credits: Optional[dict] = None
    status: str


class ExceptionOut(BaseModel):
    id: int
    type: str
    payment_id: Optional[str]
    order_id: Optional[str]
    exception_date: Optional[str]
    severity: str
    description: Optional[str]
    internal_amount: Optional[float]
    bank_amount: Optional[float]
    discrepancy_amount: Optional[float]
    is_resolved: bool
    ai_explanation: Optional[str] = None
    ai_root_cause: Optional[str] = None
    ai_suggested_action: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)



class SummaryResponse(BaseModel):
    run_id: int
    status: str
    match_rate: float
    total_transactions: int
    matched_count: int
    unmatched_count: int
    exception_count: int
    exception_counts: dict[str, int]
    settlement_totals: dict
    unmatched_bank_credits: Optional[dict] = None
    run_name: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]



class RunListItem(BaseModel):
    run_id: int
    run_name: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    status: str
    match_rate: float
    total_transactions: int
    exception_count: int


class RunListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    runs: list[RunListItem]


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    run_id: int
    message: str
    conversation_history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    response: str


# ── Amount columns that must be numeric per file type ────────────────────────
AMOUNT_COLUMNS: dict[str, list[str]] = {
    "payments":       ["amount"],
    "settlements":    ["settled_amount"],
    "bank_statement": ["credited_amount"],
}


def _validate_columns(content: bytes, file_key: str, original_name: str) -> pd.DataFrame:
    """
    Parse CSV bytes and run a full validation gauntlet.

    Checks (in order)
    -----------------
    1. File extension must be .csv
    2. File must not be empty (0 bytes)
    3. Content must parse as valid CSV (catch malformed quoting, bad delimiters)
    4. DataFrame must have at least 1 data row (headers-only is rejected)
    5. All required columns must be present
    6. Amount columns must contain numeric values (NaN from coercion = bad row)

    Returns
    -------
    pd.DataFrame

    Raises
    ------
    HTTPException 400 with a clear, file-specific error message.
    """
    # ── 1. Extension check ───────────────────────────────────────────────────
    if not original_name.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail=f"'{original_name}' is not a CSV file. Please upload a .csv file for the {file_key} slot.",
        )

    # ── 2. Empty file check ──────────────────────────────────────────────────
    if len(content.strip()) == 0:
        raise HTTPException(
            status_code=400,
            detail=f"'{original_name}' is empty (0 bytes). Please upload a valid CSV with data rows.",
        )

    # ── 3. Parse CSV ─────────────────────────────────────────────────────────
    try:
        df = pd.read_csv(io.BytesIO(content))
    except pd.errors.ParserError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"'{original_name}' is not a valid CSV — parsing failed: {exc}",
        )
    except pd.errors.EmptyDataError:
        raise HTTPException(
            status_code=400,
            detail=f"'{original_name}' has no columns or data. Please upload a valid CSV with headers and data rows.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read '{original_name}': {exc}",
        )

    # ── 4. Empty data rows check ─────────────────────────────────────────────
    df.columns = df.columns.str.strip()
    if len(df) == 0:
        raise HTTPException(
            status_code=400,
            detail=f"'{original_name}' has no data rows (headers only). Please add transaction data.",
        )

    # ── 5. Required columns ──────────────────────────────────────────────────
    actual   = set(df.columns.str.lower())
    required = REQUIRED_COLUMNS[file_key]
    missing  = required - actual

    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{original_name}' is missing required columns: {', '.join(sorted(missing))}. "
                f"Found columns: {', '.join(sorted(actual))}."
            ),
        )

    # ── 6. Numeric amount validation ─────────────────────────────────────────
    for col_name in AMOUNT_COLUMNS.get(file_key, []):
        # Find the actual column name (case-insensitive match)
        matched_col = [c for c in df.columns if c.lower() == col_name]
        if not matched_col:
            continue  # already caught by required-column check
        real_col = matched_col[0]
        coerced = pd.to_numeric(df[real_col], errors="coerce")
        bad_mask = coerced.isna() & df[real_col].notna()
        if bad_mask.any():
            first_bad_idx = bad_mask.idxmax()  # first True index
            first_bad_val = df[real_col].iloc[first_bad_idx]
            # pandas index is 0-based; CSV row = index + 2 (1 for header, 1 for 0-index)
            csv_row = int(first_bad_idx) + 2
            raise HTTPException(
                status_code=400,
                detail=(
                    f"'{original_name}' has a non-numeric value in column '{real_col}' "
                    f"at row {csv_row}: '{first_bad_val}'. All amounts must be numbers."
                ),
            )

    return df


def _save_upload(session_dir: Path, file_key: str, content: bytes, filename: str) -> Path:
    """Save raw bytes to `session_dir/<file_key>.csv` and return the path."""
    dest = session_dir / f"{file_key}.csv"
    dest.write_bytes(content)
    logger.debug("Saved %s → %s (%d bytes)", filename, dest, len(content))
    return dest


def _persist_exceptions(
    db: Session,
    exceptions: list[dict],
    run_id: int,
) -> None:
    """
    Bulk-insert exception dicts (output of ReconciliationEngine) into the DB.

    Each dict is mapped to an `Exception` ORM row.  Fields not present in the
    model are silently ignored.
    """
    records = []
    for exc in exceptions:
        sev_str = exc.get("severity", "medium")
        records.append(
            ExceptionModel(
                exception_type       = exc.get("type", "UNKNOWN"),
                severity             = _SEV_MAP.get(sev_str, ExceptionSeverity.MEDIUM),
                description          = exc.get("details") or exc.get("description"),
                payment_id           = exc.get("payment_id"),
                order_id             = exc.get("order_id"),
                exception_date       = exc.get("exception_date"),
                internal_amount      = exc.get("amount"),
                bank_amount          = exc.get("settled_amount"),
                discrepancy_amount   = exc.get("amount_impact"),
                is_resolved          = 0,
                reconciliation_run_id= run_id,
            )
        )
    db.bulk_save_objects(records)
    db.flush()


def _get_run_or_404(run_id: int, db: Session) -> ReconciliationRun:
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
    if run is None:
        raise HTTPException(status_code=404, detail=f"Reconciliation run {run_id} not found")
    return run


# ─────────────────────────────────────────────────────────────────────────────
# POST /upload
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse, summary="Upload 3 CSV files")
async def upload_files(
    payments:      UploadFile = File(..., description="payments.csv"),
    settlements:   UploadFile = File(..., description="settlements.csv"),
    bank_statement: UploadFile = File(..., description="bank_statement.csv"),
):
    """
    Accept and validate three CSV files required for reconciliation.

    Validation
    ----------
    Each file is checked for the presence of required columns (case-insensitive).
    A 400 is returned immediately on the first file that fails validation,
    listing the missing column names so the client can show a meaningful error.

    Storage
    -------
    Files are saved to `uploads/<upload_id>/` keyed as
    `payments.csv`, `settlements.csv`, `bank_statement.csv`.
    The `upload_id` (UUID4) is returned to the client and passed to POST /run.

    Returns
    -------
    upload_id   : str  — opaque session token, pass to POST /run
    files       : dict — original filenames per slot
    valid       : bool — always True if no 400 was raised
    """
    upload_id   = str(uuid.uuid4())
    session_dir = UPLOAD_DIR / upload_id
    session_dir.mkdir(parents=True, exist_ok=True)

    file_map = {
        "payments":      payments,
        "settlements":   settlements,
        "bank_statement": bank_statement,
    }

    saved_names: dict[str, str] = {}

    for key, upload in file_map.items():
        content = await upload.read()
        _validate_columns(content, key, upload.filename or key)   # raises 400 on bad cols
        _save_upload(session_dir, key, content, upload.filename or key)
        saved_names[key] = upload.filename or f"{key}.csv"

    logger.info("Upload session %s created — files: %s", upload_id, saved_names)

    return UploadResponse(
        upload_id = upload_id,
        files     = saved_names,
        valid     = True,
        message   = "All files validated and saved. POST /reconcile/run to start.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /run
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/run", response_model=ReconcileResponse, summary="Run reconciliation")
def run_reconciliation(
    body: ReconcileRequest,
    db:   Session = Depends(get_db),
):
    """
    Execute the reconciliation engine on a previously uploaded file set.

    Flow
    ----
    1. Resolve file paths from `upload_id` — 404 if the session doesn't exist.
    2. Create a `ReconciliationRun` record with status=RUNNING.
    3. Call `ReconciliationEngine.run()` — all business logic is in the engine.
    4. Bulk-insert one `Exception` row per detected anomaly.
    5. Update the `ReconciliationRun` record with final stats and status=COMPLETED.
       If the engine raises, status is set to FAILED and the error is re-raised.
    6. Return the summary dict with the DB-assigned `run_id`.

    Parameters
    ----------
    upload_id : returned by POST /upload
    run_name  : optional human label
    sla_days  : settlement SLA in days (default 2 = T+2)
    """
    # ── Resolve upload session ─────────────────────────────────────────────
    session_dir = UPLOAD_DIR / body.upload_id
    if not session_dir.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Upload session '{body.upload_id}' not found. "
                   "Please upload files first via POST /reconcile/upload.",
        )

    payments_path    = session_dir / "payments.csv"
    settlements_path = session_dir / "settlements.csv"
    bank_path        = session_dir / "bank_statement.csv"

    for path in (payments_path, settlements_path, bank_path):
        if not path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"Missing file in upload session: {path.name}",
            )

    # ── Create DB run record ────────────────────────────────────────────────
    run = ReconciliationRun(
        run_name           = body.run_name or f"Run {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}",
        status             = ReconciliationStatus.RUNNING,
        internal_file_name = "payments.csv",
        bank_file_name     = "bank_statement.csv",
        started_at         = datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # ── Execute engine ──────────────────────────────────────────────────────
    try:
        engine = ReconciliationEngine(
            payments_path       = payments_path,
            settlements_path    = settlements_path,
            bank_statement_path = bank_path,
            sla_days            = body.sla_days,
        )
        result = engine.run()

    except Exception as exc:
        logger.exception("Reconciliation engine failed for run %d", run.id)
        run.status = ReconciliationStatus.FAILED
        db.commit()
        raise HTTPException(status_code=500, detail=f"Engine error: {exc}") from exc

    # ── Persist exceptions ──────────────────────────────────────────────────
    _persist_exceptions(db, result.get("exceptions", []), run.id)

    # ── Update run record ───────────────────────────────────────────────────
    run.status             = ReconciliationStatus.COMPLETED
    run.total_transactions = result["total_records"]
    run.matched_count      = result["matched"]
    run.unmatched_count    = result["unmatched"]
    run.exception_count    = len(result.get("exceptions", []))
    run.completed_at       = datetime.now(timezone.utc)
    # Store settlement totals + exception_counts as JSON for the summary endpoint
    run.ai_insights        = json.dumps({
        "settlement_totals":      result.get("settlement_totals", {}),
        "exception_counts":       result.get("exception_counts", {}),
        "unmatched_bank_credits": result.get("unmatched_bank_credits", {}),
        "match_rate":             result["match_rate"],
    })
    db.commit()

    logger.info(
        "Run %d complete — match_rate=%.2f%% exceptions=%d",
        run.id, result["match_rate"], run.exception_count,
    )

    return ReconcileResponse(
        run_id                = run.id,
        match_rate            = result["match_rate"],
        total_records         = result["total_records"],
        matched               = result["matched"],
        unmatched             = result["unmatched"],
        exception_counts      = result.get("exception_counts", {}),
        settlement_totals     = result.get("settlement_totals", {}),
        unmatched_bank_credits = result.get("unmatched_bank_credits", {}),
        status                = run.status.value,
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /chat
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Chat with Settlement Q&A Assistant",
    description="Ask questions about a reconciliation run. Uses Gemini AI with multi-turn conversation support.",
)
def chat_with_assistant(
    request: ChatRequest,
    db: Session = Depends(get_db),
):
    """
    Generate a chat response for a reconciliation run using Gemini AI.

    Requires a valid run_id. Supports multi-turn conversations via conversation_history.
    System prompt is automatically populated with the run's summary and exceptions data.

    Args:
        request: ChatRequest with run_id, message, and optional conversation_history

    Returns:
        ChatResponse with the assistant's response text

    Raises:
        404: If run_id not found
        500: If Gemini API fails or GEMINI_API_KEY not configured
    """
    from app.services.chat_assistant import get_chat_response

    try:
        # Convert ChatMessage objects to dicts for get_chat_response
        history = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]

        response_text = get_chat_response(
            run_id=request.run_id,
            message=request.message,
            conversation_history=history,
            db=db,
        )

        return ChatResponse(response=response_text)

    except ValueError as e:
        # Run not found
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"AI assistant unavailable: {e}")
    except Exception as e:
        logger.exception("Chat endpoint error")
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# GET /runs
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/runs", response_model=RunListResponse, summary="List all reconciliation runs")
def list_runs(
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(20, ge=1, le=100, description="Page size"),
    db: Session = Depends(get_db)
):
    """
    Return a paginated list of all ReconciliationRuns ordered by started_at descending.
    """
    total = db.query(ReconciliationRun).count()
    rows = (
        db.query(ReconciliationRun)
        .order_by(ReconciliationRun.started_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    runs = []
    for run in rows:
        match_rate = 0.0
        if run.ai_insights:
            try:
                insights = json.loads(run.ai_insights)
                match_rate = insights.get("match_rate", 0.0)
            except Exception:
                pass
                
        started_ts = run.started_at or run.created_at
        completed_ts = run.completed_at or run.created_at
        runs.append({
            "run_id": run.id,
            "run_name": run.run_name,
            "started_at": started_ts.isoformat() if started_ts else None,
            "completed_at": completed_ts.isoformat() if completed_ts else None,
            "status": run.status.value if hasattr(run.status, 'value') else run.status,
            "match_rate": match_rate,
            "total_transactions": run.total_transactions or 0,
            "exception_count": run.exception_count or 0,
        })


    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "runs": runs
    }


# ─────────────────────────────────────────────────────────────────────────────
# GET /summary/{run_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/summary/{run_id}", response_model=SummaryResponse, summary="Get run summary")
def get_summary(run_id: int, db: Session = Depends(get_db)):
    """
    Return aggregated statistics for a completed reconciliation run.

    Includes
    --------
    * match_rate, total/matched/unmatched counts
    * exception_counts broken down by type (e.g. AMOUNT_MISMATCH: 4)
    * settlement_totals: total payment amount, settled amount, discrepancy
    * unmatched_bank_credits: count & total amount of orphan bank credits
    * run metadata: name, timestamps, status
    """
    run = _get_run_or_404(run_id, db)

    # Parse cached insights JSON (written by POST /run)
    insights: dict = {}
    if run.ai_insights:
        try:
            insights = json.loads(run.ai_insights)
        except json.JSONDecodeError:
            pass

    # Fallback: recount exception types from DB if insights missing
    if not insights.get("exception_counts"):
        rows = (
            db.query(ExceptionModel.exception_type)
            .filter(ExceptionModel.reconciliation_run_id == run_id)
            .all()
        )
        exc_counts: dict[str, int] = {}
        for (t,) in rows:
            exc_counts[t] = exc_counts.get(t, 0) + 1
        insights["exception_counts"] = exc_counts

    settlement_totals = dict(insights.get("settlement_totals", {}))
    if (
        "amount_mismatches_total" not in settlement_totals
        or "unsettled_value_total" not in settlement_totals
        or "duplicate_charges_total" not in settlement_totals
    ):
        excs_for_run = (
            db.query(ExceptionModel)
            .filter(ExceptionModel.reconciliation_run_id == run_id)
            .all()
        )
        amt_mismatch_sum = sum(
            (e.discrepancy_amount or 0.0)
            for e in excs_for_run
            if e.exception_type == "AMOUNT_MISMATCH"
        )
        unsettled_sum = sum(
            (e.internal_amount or 0.0)
            for e in excs_for_run
            if e.exception_type == "UNMATCHED_NO_SETTLEMENT"
        )
        dup_sum = sum(
            (e.internal_amount or 0.0)
            for e in excs_for_run
            if e.exception_type == "DUPLICATE"
        )
        settlement_totals["amount_mismatches_total"] = round(amt_mismatch_sum, 2)
        settlement_totals["unsettled_value_total"] = round(unsettled_sum, 2)
        settlement_totals["duplicate_charges_total"] = round(dup_sum, 2)

    return SummaryResponse(
        run_id                = run.id,
        status                = run.status.value,
        match_rate            = insights.get("match_rate", 0.0),
        total_transactions    = run.total_transactions or 0,
        matched_count         = run.matched_count or 0,
        unmatched_count       = run.unmatched_count or 0,
        exception_count       = run.exception_count or 0,
        exception_counts      = insights.get("exception_counts", {}),
        settlement_totals     = settlement_totals,
        unmatched_bank_credits = insights.get("unmatched_bank_credits", {}),
        run_name              = run.run_name,
        started_at            = run.started_at.isoformat() if run.started_at else None,
        completed_at          = run.completed_at.isoformat() if run.completed_at else None,
    )



# ─────────────────────────────────────────────────────────────────────────────
# GET /exceptions/{run_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/exceptions/{run_id}",
    summary="Get paginated exceptions for a run",
)
def get_exceptions(
    run_id:   int,
    type:     Optional[str] = Query(None, description="Filter by exception type e.g. AMOUNT_MISMATCH"),
    severity: Optional[str] = Query(None, description="Filter by severity: low|medium|high|critical"),
    resolved: Optional[bool] = Query(None, description="Filter by resolved status"),
    skip:     int = Query(0,  ge=0,   description="Pagination offset"),
    limit:    int = Query(50, ge=1, le=500, description="Page size (max 500)"),
    db: Session = Depends(get_db),
):
    """
    Return a filtered, paginated list of exceptions for a reconciliation run.

    Filters
    -------
    type     : exact match on exception_type (e.g. `AMOUNT_MISMATCH`)
    severity : one of `low`, `medium`, `high`, `critical`
    resolved : `true` to show only resolved, `false` for open exceptions

    Pagination
    ----------
    Use `skip` + `limit`.  The response includes `total` so the client can
    render page numbers.

    Returns
    -------
    {
      "run_id":     int,
      "total":      int,
      "skip":       int,
      "limit":      int,
      "exceptions": [ { ...ExceptionOut fields... } ]
    }
    """
    # Validate run exists
    _get_run_or_404(run_id, db)

    query = db.query(ExceptionModel).filter(
        ExceptionModel.reconciliation_run_id == run_id
    )

    # ── Optional filters ───────────────────────────────────────────────────
    if type:
        query = query.filter(ExceptionModel.exception_type == type.upper())

    if severity:
        sev_val = severity.lower()
        try:
            sev_enum = ExceptionSeverity(sev_val)
            query = query.filter(ExceptionModel.severity == sev_enum)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid severity '{severity}'. Must be one of: low, medium, high, critical",
            )

    if resolved is not None:
        query = query.filter(ExceptionModel.is_resolved == (1 if resolved else 0))

    total = query.count()

    rows = (
        query
        .order_by(ExceptionModel.id)
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "run_id":     run_id,
        "total":      total,
        "skip":       skip,
        "limit":      limit,
        "exceptions": [
            {
                "id":                exc.id,
                "type":              exc.exception_type,
                "payment_id":        exc.payment_id,
                "order_id":          exc.order_id,
                "exception_date":    exc.exception_date,
                "severity":          exc.severity.value,
                "description":       exc.description,
                "internal_amount":   exc.internal_amount,
                "bank_amount":       exc.bank_amount,
                "discrepancy_amount": exc.discrepancy_amount,
                "is_resolved":       bool(exc.is_resolved),
                "reconciliation_run_id": exc.reconciliation_run_id,
            }
            for exc in rows
        ],
    }

# ─────────────────────────────────────────────────────────────────────────────
# DELETE /runs/{run_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/runs/{run_id}", summary="Delete a reconciliation run")
def delete_run(
    run_id: int,
    db: Session = Depends(get_db),
):
    """Delete a single run and all its associated exceptions."""
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    db.query(ExceptionModel).filter(ExceptionModel.reconciliation_run_id == run_id).delete(synchronize_session=False)
    db.delete(run)
    db.commit()
    
    return {"message": f"Deleted run {run_id}", "run_id": run_id}

# ─────────────────────────────────────────────────────────────────────────────
# DELETE /runs
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/runs", summary="Delete all reconciliation runs")
def delete_all_runs(
    confirm: bool = False,
    db: Session = Depends(get_db),
):
    """Delete all runs and exceptions (requires confirm=true query parameter)."""
    if not confirm:
        raise HTTPException(status_code=400, detail="Must pass confirm=true to delete all runs")
        
    count = db.query(ReconciliationRun).count()
    db.query(ExceptionModel).delete(synchronize_session=False)
    db.query(ReconciliationRun).delete(synchronize_session=False)
    db.commit()
    
    return {"message": "All runs deleted", "count": count}


# ─────────────────────────────────────────────────────────────────────────────
# GET /exceptions/{run_id}/ai-analysis
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/exceptions/{run_id}/ai-analysis", summary="Get single-pass AI analysis for all exceptions in a run")
def get_ai_analysis(
    run_id: int,
    db: Session = Depends(get_db),
):
    """
    Generate or retrieve cached single-pass AI analysis for all exceptions of a reconciliation run.
    """
    from app.services.ai_analysis import analyze_exceptions_for_run
    return analyze_exceptions_for_run(db, run_id)


# ─────────────────────────────────────────────────────────────────────────────
# GET /report/{run_id}  — downloadable Excel report
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/report/{run_id}", summary="Download Excel reconciliation report")
def download_report(
    run_id: int,
    db: Session = Depends(get_db),
):
    """
    Generate and download a formatted .xlsx reconciliation report.

    Includes three sheets: Summary, Exceptions, and Raw Reconciliation.
    """
    from app.services.report_generator import generate_excel_report

    try:
        output = generate_excel_report(run_id, db)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    filename = f"reconciliation_report_run_{run_id}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
