from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/reconcile", tags=["Reconciliation"])


@router.post("/run", summary="Trigger a reconciliation run")
async def trigger_reconciliation(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Start a new reconciliation run using previously uploaded files.
    Placeholder — full implementation (matching logic + AI insights) coming soon.
    """
    return {
        "message": "Reconciliation triggered (placeholder)",
        "run_id": None,
        "status": "pending",
    }


@router.get("/runs", summary="List all reconciliation runs")
async def list_reconciliation_runs(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """
    Retrieve a paginated list of all past reconciliation runs.
    Placeholder — full implementation coming soon.
    """
    return {"runs": [], "total": 0, "skip": skip, "limit": limit}


@router.get("/runs/{run_id}", summary="Get details of a reconciliation run")
async def get_reconciliation_run(run_id: int, db: Session = Depends(get_db)):
    """
    Fetch full details (stats, exceptions, AI summary) of a specific reconciliation run.
    Placeholder — full implementation coming soon.
    """
    return {"run_id": run_id, "detail": "placeholder — not yet implemented"}


@router.get("/runs/{run_id}/exceptions", summary="Get exceptions for a run")
async def get_run_exceptions(
    run_id: int,
    severity: str = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """
    List all exceptions/discrepancies found in a specific reconciliation run.
    Placeholder — full implementation coming soon.
    """
    return {"run_id": run_id, "exceptions": [], "total": 0}
