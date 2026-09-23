import asyncio
import logging
import secrets

from fastapi import Depends, FastAPI, HTTPException, Request, status

from application_adapter import to_mlink_response
from application_client import ApplicationApiClient, ApplicationApiError
from config import settings
from generator import generate_assistant_answer
from models import MLinkAnalyzeRequest, MLinkAssistantRequest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("mlink.main")

app = FastAPI(title=settings.app_name)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.app_name}


def _verify_inbound_key(request: Request) -> None:
    """Require the backend-to-Agent secret on every call."""
    expected = settings.inbound_agent_api_key
    if not expected:
        # The deployed endpoint is reachable from the public internet, so a missing
        # secret closes the door instead of opening it.
        logger.error("INBOUND_AGENT_API_KEY is not configured: refusing the request")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent API key is invalid."
        )
    authorization = request.headers.get("authorization", "")
    received = authorization.removeprefix("Bearer ")
    if not received or not secrets.compare_digest(received, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agent API key is invalid.")


# Guarding through a dependency rejects an unauthenticated caller before the body is
# validated, so a malformed request cannot probe the contract with 422 responses.
@app.post("/v1/agent/analyze", dependencies=[Depends(_verify_inbound_key)])
async def application_analyze_endpoint(payload: MLinkAnalyzeRequest):
    """Contract-first endpoint used exclusively by the M-Link API backend."""
    try:
        context = await ApplicationApiClient().fetch_customer_context(
            payload.customerId, period_from=payload.periodFrom, period_to=payload.periodTo
        )
        # The rule engine and OpenAI-compatible SDK are synchronous; keep the event loop free.
        response = await asyncio.to_thread(to_mlink_response, payload, context)
        # by_alias so MLinkPeriod serialises its `from` field under the contract's name.
        return response.model_dump(by_alias=True)
    except ApplicationApiError:
        logger.exception("Application banking context could not be loaded")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Customer context could not be loaded.")
    except Exception:
        logger.exception("Application Agent analysis failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Customer analysis could not be completed.")


@app.post("/v1/agent/assistant-answer", dependencies=[Depends(_verify_inbound_key)])
async def assistant_answer_endpoint(payload: MLinkAssistantRequest):
    """Phrases an already-looked-up fact (from the M-Link API) into a natural answer for the
    RM-facing floating assistant. Not an analysis run — no rule engine involved here."""
    try:
        answer = await asyncio.to_thread(generate_assistant_answer, payload.question, payload.facts)
        return {"answer": answer}
    except Exception:
        logger.exception("Assistant answer generation failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Assistant answer could not be generated.")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=False)
