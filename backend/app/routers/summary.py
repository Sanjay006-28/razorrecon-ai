from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/summary", tags=["Summary"])


@router.get("/overview", summary="Get overall reconciliation statistics")
async def get_overview_summary(db: Session = Depends(get_db)):
    """
    Return aggregated statistics across all reconciliation runs.
    Placeholder — full implementation coming soon.
    """
    return {
        "total_runs": 0,
        "total_transactions": 0,
        "total_matched": 0,
        "total_unmatched": 0,
        "total_exceptions": 0,
        "match_rate_percent": 0.0,
    }


@router.get("/run/{run_id}", summary="Get summary for a specific run")
async def get_run_summary(run_id: int, db: Session = Depends(get_db)):
    """
    Return a detailed summary with AI insights for a single reconciliation run.
    Placeholder — full implementation coming soon.
    """
    return {
        "run_id": run_id,
        "summary": "placeholder — not yet implemented",
        "ai_insights": None,
    }


@router.get("/exceptions/breakdown", summary="Exception type breakdown")
async def get_exception_breakdown(db: Session = Depends(get_db)):
    """
    Return a count breakdown of exceptions grouped by type and severity.
    Placeholder — full implementation coming soon.
    """
    return {"by_type": {}, "by_severity": {}}


@router.get("/trends", summary="Reconciliation trends over time")
async def get_reconciliation_trends(
    days: int = 30,
    db: Session = Depends(get_db),
):
    """
    Return time-series data for match rates and exception counts.
    Placeholder — full implementation coming soon.
    """
    return {"days": days, "data_points": []}
