import asyncio
import logging
import secrets
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import settings
from application_adapter import to_mlink_response
from application_client import ApplicationApiClient, ApplicationApiError
from models import AnalysisRequest, AnalysisOutput, CustomerDataInput, MLinkAnalyzeRequest
from engine import analyze

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("mlink.main")

app = FastAPI(title=settings.app_name)


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.app_name}


def _verify_inbound_key(request: Request) -> None:
    """Require the backend-to-Agent secret when it is configured."""
    expected = settings.inbound_agent_api_key
    if not expected:
        return
    authorization = request.headers.get("authorization", "")
    received = authorization.removeprefix("Bearer ")
    if not received or not secrets.compare_digest(received, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Agent API key is invalid.",
        )


class Invocation(BaseModel):
    cif: str | None = None
    customer_data: dict | None = None
    message: str | None = None
    question: str | None = None


@app.post("/v1/agent/analyze")
async def application_analyze_endpoint(payload: MLinkAnalyzeRequest, request: Request):
    """Contract-first endpoint used exclusively by the M-Link API backend."""
    _verify_inbound_key(request)
    try:
        snapshot = await ApplicationApiClient().fetch_customer_snapshot(payload.customerId)
        # The analysis engine and OpenAI-compatible SDK are synchronous. Run
        # them off the ASGI event loop so health checks and other requests stay
        # responsive while a remote LLM is slow.
        response = await asyncio.to_thread(to_mlink_response, payload, snapshot)
        return response.model_dump()
    except ApplicationApiError:
        logger.exception("Application banking context could not be loaded")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Customer context could not be loaded.",
        )
    except Exception:
        logger.exception("Application Agent analysis failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Customer analysis could not be completed.",
        )


@app.post("/analyze")
async def analyze_endpoint(request: AnalysisRequest):
    try:
        result = analyze(request.customer_data)
        return result.model_dump()
    except Exception as e:
        logger.exception("Analysis endpoint error")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "cif": request.customer_data.cif,
                "data_gaps": [f"Lỗi hệ thống: {str(e)}"],
            },
        )


@app.post("/invocations")
async def invocations(payload: Invocation, request: Request):
    if payload.customer_data is not None:
        try:
            customer_input = CustomerDataInput(**payload.customer_data)
            result = analyze(customer_input)
            return {
                "status": "success",
                "result": result.model_dump(),
                "session_id": request.headers.get(
                    "X-GreenNode-AgentBase-Session-Id", ""
                ),
            }
        except Exception as e:
            logger.exception("Invocation parsing error")
            return {
                "status": "error",
                "message": f"Dữ liệu đầu vào không hợp lệ: {str(e)}",
                "session_id": request.headers.get(
                    "X-GreenNode-AgentBase-Session-Id", ""
                ),
            }

    message = payload.message or payload.question or ""
    if not message:
        return {
            "status": "error",
            "message": "Thiếu 'customer_data' hoặc 'message'",
            "session_id": request.headers.get(
                "X-GreenNode-AgentBase-Session-Id", ""
            ),
        }

    return {
        "status": "error",
        "message": (
            "M-Link là trợ lý phân tích hành vi khách hàng và gợi ý kịch bản tư vấn. "
            "Vui lòng gửi dữ liệu khách hàng qua trường 'customer_data' để phân tích."
        ),
        "session_id": request.headers.get(
            "X-GreenNode-AgentBase-Session-Id", ""
        ),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=False)
