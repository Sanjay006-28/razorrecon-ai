import json
import logging
from typing import Any

from google.genai import types
from sqlalchemy.orm import Session

from app.models import Exception as ExceptionModel, ReconciliationRun
from app.services.ai_analysis import generate_gemini_content, get_gemini_client

logger = logging.getLogger(__name__)


def _json_default(value: Any) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _build_summary_payload(run: ReconciliationRun) -> dict[str, Any]:
    insights: Any = None
    if run.ai_insights:
        try:
            insights = json.loads(run.ai_insights)
        except json.JSONDecodeError:
            insights = run.ai_insights

    return {
        "run_id": run.id,
        "status": _enum_value(run.status),
        "run_name": run.run_name,
        "internal_file_name": run.internal_file_name,
        "bank_file_name": run.bank_file_name,
        "total_transactions": run.total_transactions or 0,
        "matched_count": run.matched_count or 0,
        "unmatched_count": run.unmatched_count or 0,
        "exception_count": run.exception_count or 0,
        "ai_summary": run.ai_summary,
        "ai_insights": insights,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None,
    }


def _build_exception_payload(row: ExceptionModel) -> dict[str, Any]:
    return {
        "id": row.id,
        "type": row.exception_type,
        "severity": _enum_value(row.severity),
        "description": row.description,
        "resolution": row.resolution,
        "payment_id": row.payment_id,
        "order_id": row.order_id,
        "exception_date": row.exception_date,
        "internal_amount": row.internal_amount,
        "bank_amount": row.bank_amount,
        "discrepancy_amount": row.discrepancy_amount,
        "is_resolved": bool(row.is_resolved),
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        "resolved_by": row.resolved_by,
        "ai_explanation": row.ai_explanation,
        "ai_root_cause": row.ai_root_cause,
        "ai_suggested_action": row.ai_suggested_action,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "transaction_id": row.transaction_id,
        "reconciliation_run_id": row.reconciliation_run_id,
    }


def build_system_prompt(summary_data: dict[str, Any], exceptions_data: list[dict[str, Any]]) -> str:
    summary_json = json.dumps(summary_data, default=_json_default, sort_keys=True)
    exceptions_json = json.dumps(exceptions_data, default=_json_default, sort_keys=True)
    return (
        "You are a finance operations assistant for RazorRecon AI, helping analyze a payment reconciliation run. "
        f"Here is the current run's data: {summary_json} and exceptions: {exceptions_json}. "
        "Answer questions concisely and accurately using ONLY this data. "
        "Cite specific payment_id or order_id when relevant. "
        "NEVER invent numbers, dates, or IDs not present in this data. "
        "If asked something the data can't answer, say so clearly instead of guessing."
    )


def _text_content(role: str, text: str) -> types.Content:
    return types.Content(role=role, parts=[types.Part.from_text(text=text)])


def get_chat_response(
    run_id: int,
    message: str,
    conversation_history: list[dict[str, str]],
    db: Session,
) -> str:
    """
    Generate a data-grounded chat response for one reconciliation run.
    """
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
    if not run:
        raise ValueError(f"Reconciliation run {run_id} not found")

    exceptions = (
        db.query(ExceptionModel)
        .filter(ExceptionModel.reconciliation_run_id == run_id)
        .order_by(ExceptionModel.id.asc())
        .all()
    )

    summary_data = _build_summary_payload(run)
    exceptions_data = [_build_exception_payload(row) for row in exceptions]
    system_prompt = build_system_prompt(summary_data, exceptions_data)

    client = get_gemini_client()
    if not client:
        raise RuntimeError("Gemini API not configured. Set GEMINI_API_KEY environment variable.")

    contents: list[types.Content] = []
    contents.append(_text_content("user", system_prompt))
    contents.append(_text_content(
        "model",
        "Understood. I will answer using only this reconciliation run data.",
    ))

    for turn in conversation_history or []:
        role = turn.get("role")
        content = turn.get("content")
        if not content:
            continue
        api_role = "model" if role == "assistant" else "user"
        contents.append(_text_content(api_role, content))

    contents.append(_text_content("user", message))

    try:
        response_text, model_used = generate_gemini_content(client, contents)
    except Exception as exc:
        raise RuntimeError(f"Gemini API failure: {exc}") from exc

    logger.info("Chat response generated for run %s using %s", run_id, model_used)
    return response_text.strip()
