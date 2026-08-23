from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("/internal", summary="Upload internal transaction file")
async def upload_internal_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload an internal transactions CSV/Excel file for reconciliation.
    Placeholder — full implementation coming soon.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    return {
        "message": "Internal file received (placeholder)",
        "filename": file.filename,
        "content_type": file.content_type,
    }


@router.post("/bank", summary="Upload bank statement file")
async def upload_bank_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload a bank statement CSV/Excel file for reconciliation.
    Placeholder — full implementation coming soon.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    return {
        "message": "Bank file received (placeholder)",
        "filename": file.filename,
        "content_type": file.content_type,
    }


@router.get("/status/{run_id}", summary="Get upload/processing status")
async def get_upload_status(run_id: int, db: Session = Depends(get_db)):
    """
    Check the processing status of an uploaded file set by reconciliation run ID.
    Placeholder — full implementation coming soon.
    """
    return {"run_id": run_id, "status": "placeholder — not yet implemented"}
