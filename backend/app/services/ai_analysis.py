import json
import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from sqlalchemy.orm import Session

from app.models import Exception as ExceptionModel, ReconciliationRun

logger = logging.getLogger(__name__)

# Load backend/.env if present
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=True)

import time
from google.genai import types

# Valid Gemini model IDs for this API key (confirmed via live testing)
# Use models/ prefix — required for this key's API endpoint
PREFERRED_MODELS = [
    "models/gemini-3.6-flash",       # ✅ confirmed working — try first
    "models/gemini-3.5-flash",       # fallback (503 during high demand spikes)
    "models/gemini-3.7-flash",       # fallback (per quota dashboard)
    "models/gemini-3.5-flash-lite",  # lightest fallback — highest RPM limit (15/min)
]

MODEL_TIMEOUT_MS = 25000  # 25 seconds per model attempt
MAX_RETRIES = 1            # 1 retry per model before moving to next
RETRY_BACKOFF_BASE = 2.0  # exponential backoff base (seconds)


def get_gemini_client() -> genai.Client | None:
    """Configure and return the Gemini genai.Client if API key is present."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key.strip() in ("", "your_gemini_api_key_here", "PASTE_YOUR_KEY_HERE"):
        logger.warning("GEMINI_API_KEY missing or unconfigured.")
        return None

    try:
        return genai.Client(api_key=api_key.strip())
    except Exception as exc:
        logger.warning(f"Could not initialize genai.Client: {exc}")
        return None


def get_gemini_model():
    """Backward-compatible helper returning genai.Client if configured."""
    return get_gemini_client()


def generate_gemini_content(client: genai.Client, contents: Any) -> tuple[str, str]:
    """
    Generate content attempting preferred Gemini models with fallback, retry,
    and exponential backoff. Returns (response_text, model_id_used).
    """
    attempted_logs = []
    for model_name in PREFERRED_MODELS:
        for attempt in range(MAX_RETRIES + 1):
            start_time = time.perf_counter()
            if attempt > 0:
                delay = RETRY_BACKOFF_BASE ** attempt
                logger.info(f"[AI Chain] Retry {attempt}/{MAX_RETRIES} for '{model_name}' after {delay:.1f}s backoff...")
                time.sleep(delay)

            logger.info(f"[AI Chain] Attempting model '{model_name}' (timeout: {MODEL_TIMEOUT_MS}ms, attempt {attempt + 1})...")
            try:
                config = types.GenerateContentConfig(
                    http_options=types.HttpOptions(timeout=MODEL_TIMEOUT_MS)
                )
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config,
                )
                elapsed = time.perf_counter() - start_time
                if response and response.text:
                    logger.info(
                        f"[AI Chain] Model '{model_name}' SUCCEEDED in {elapsed:.2f}s (attempt {attempt + 1})."
                    )
                    return response.text, model_name
                else:
                    logger.warning(
                        f"[AI Chain] Model '{model_name}' returned empty response in {elapsed:.2f}s."
                    )
                    attempted_logs.append(f"{model_name}: empty ({elapsed:.2f}s)")
                    break  # empty response — try next model, no point retrying
            except Exception as exc:
                elapsed = time.perf_counter() - start_time
                err_summary = f"{type(exc).__name__}: {str(exc)[:120]}"
                is_rate_limit = "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc)
                is_transient = "504" in str(exc) or "503" in str(exc) or "DEADLINE" in str(exc) or "UNAVAILABLE" in str(exc)
                logger.warning(
                    f"[AI Chain] Model '{model_name}' FAILED in {elapsed:.2f}s ({err_summary})"
                    + (f", retrying..." if (is_transient or is_rate_limit) and attempt < MAX_RETRIES else ", trying next model...")
                )
                if (is_transient or is_rate_limit) and attempt < MAX_RETRIES:
                    attempted_logs.append(f"{model_name}: transient fail attempt {attempt + 1}")
                    continue  # retry same model
                else:
                    attempted_logs.append(f"{model_name}: failed in {elapsed:.2f}s ({err_summary})")
                    break  # move to next model

    total_attempts = ", ".join(attempted_logs)
    raise RuntimeError(f"All Gemini models exhausted without success: [{total_attempts}]")


def analyze_exceptions_for_run(db: Session, run_id: int) -> list[dict[str, Any]]:
    """
    Generate or retrieve cached AI analysis for all exceptions of a reconciliation run.
    """
    rows = (
        db.query(ExceptionModel)
        .filter(ExceptionModel.reconciliation_run_id == run_id)
        .order_by(ExceptionModel.id.asc())
        .all()
    )

    if not rows:
        return []

    # Check if all rows are already cached with real valid explanations
    all_cached = all(
        r.ai_explanation is not None
        and not r.ai_explanation.startswith("AI analysis unavailable")
        and not r.ai_explanation.startswith("No AI analysis available")
        for r in rows
    )
    if all_cached:
        logger.info(f"[CACHE HIT] Serving cached AI exception analysis for run {run_id} from SQLite.")
        return [_format_exception_analysis(r) for r in rows]

    # Prepare batch payload for uncached or previously failed exceptions
    uncached_rows = [
        r for r in rows
        if r.ai_explanation is None
        or r.ai_explanation.startswith("AI analysis unavailable")
        or r.ai_explanation.startswith("No AI analysis available")
    ]
    logger.info(f"[LIVE CALL] Initiating live Gemini analysis for run {run_id} ({len(uncached_rows)} uncached exceptions)...")

    client = get_gemini_client()
    if not client:
        logger.warning("Gemini client unavailable. Using fallback messages for uncached exceptions.")
        for r in uncached_rows:
            r.ai_explanation = "AI analysis unavailable: GEMINI_API_KEY missing or invalid."
            r.ai_root_cause = "Unable to reach Gemini AI service."
            r.ai_suggested_action = "Review exception manually or check GEMINI_API_KEY configuration."
        db.commit()
        return [_format_exception_analysis(r) for r in rows]

    # Chunk into groups of 5 — large enough to be efficient, small enough to avoid timeouts
    CHUNK_SIZE = 5
    for idx in range(0, len(uncached_rows), CHUNK_SIZE):
        chunk = uncached_rows[idx:idx + CHUNK_SIZE]
        batch_input = [
            {
                "exception_id": r.id,
                "type": r.exception_type,
                "severity": r.severity.value if hasattr(r.severity, "value") else str(r.severity),
                "payment_id": r.payment_id,
                "order_id": r.order_id,
                "description": r.description,
                "internal_amount": r.internal_amount,
                "bank_amount": r.bank_amount,
                "discrepancy_amount": r.discrepancy_amount,
                "exception_date": str(r.exception_date) if r.exception_date else None,
            }
            for r in chunk
        ]

        system_prompt = (
            "You are a expert finance operations analyst at a top payments company.\n"
            "You are analyzing financial reconciliation exception records.\n"
            "STRICT CONSTRAINTS:\n"
            "1. FORBIDDEN: Do NOT invent, assume, or hallucinate any numbers, dates, rates, or IDs.\n"
            "2. Use only the numeric values supplied in the JSON. If a value is not supplied, describe the issue without inventing a number.\n"
            "Task: For each exception item in the input array, produce a structured object with:\n"
            "  - 'exception_id': (integer matching the input item id)\n"
            "  - 'explanation': (a clear, one-sentence plain-English explanation)\n"
            "  - 'root_cause': (the likely technical or operational root cause)\n"
            "  - 'suggested_action': (a concrete suggested action for the finance team)\n\n"
            "Return a valid JSON array of objects, one per input exception, with no extra markdown code block wrappers if possible.\n"
            f"Input Exception Batch JSON:\n{json.dumps(batch_input)}"
        )

        try:
            raw_text, model_used = generate_gemini_content(client, system_prompt)
            text = raw_text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

            parsed_list = json.loads(text)
            analysis_map = {
                item["exception_id"]: item
                for item in parsed_list
                if isinstance(item, dict) and "exception_id" in item
            }

            for r in chunk:
                item = analysis_map.get(r.id)
                if item:
                    r.ai_explanation = item.get("explanation", "Discrepancy identified during reconciliation batch run.")
                    r.ai_root_cause = item.get("root_cause", "Operational data variance.")
                    r.ai_suggested_action = item.get("suggested_action", "Inspect transaction record and verify with processor.")
                else:
                    r.ai_explanation = "No AI analysis available for this transaction."
                    r.ai_root_cause = "Pending operational review."
                    r.ai_suggested_action = "Inspect transaction record manually."

            db.commit()
            logger.info(f"[LIVE CHUNK COMPLETE] Successfully generated and cached AI analysis for chunk of {len(chunk)} exceptions in run {run_id} using {model_used}.")

        except Exception as exc:
            logger.error(f"Gemini API chunk call failed for run {run_id}: {exc}")
            db.rollback()
            for r in chunk:
                r.ai_explanation = "AI analysis unavailable: Service timeout or rate limit exceeded."
                r.ai_root_cause = "Gemini API unavailable."
                r.ai_suggested_action = "Check API key quotas or retry request later."
            db.commit()

    return [_format_exception_analysis(r) for r in rows]


def _format_exception_analysis(r: ExceptionModel) -> dict[str, Any]:
    """Format Exception model row into analysis response payload."""
    return {
        "id": r.id,
        "payment_id": r.payment_id,
        "order_id": r.order_id,
        "exception_type": r.exception_type,
        "severity": r.severity.value if hasattr(r.severity, "value") else str(r.severity),
        "explanation": r.ai_explanation or "No AI analysis available for this transaction.",
        "root_cause": r.ai_root_cause or "Pending operational review.",
        "suggested_action": r.ai_suggested_action or "Inspect transaction record.",
    }
