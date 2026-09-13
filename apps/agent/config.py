import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


def _get_bool(key: str, default: bool = False) -> bool:
    return os.getenv(key, str(default)).lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    app_name: str = "M-Link Agent"
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8081"))

    llm_api_key: str = os.getenv("LLM_API_KEY", "")
    llm_base_url: str = os.getenv(
        "LLM_BASE_URL", "https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1"
    )
    llm_model: str = os.getenv("LLM_MODEL", "z-ai/glm-4.6")

    llm_temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.3"))
    llm_enabled_for_content: bool = _get_bool("LLM_ENABLED_FOR_CONTENT", True)
    # Bound each external LLM attempt so the Application API's 30-second
    # request deadline always has time to receive a fallback response.
    llm_request_timeout_seconds: float = float(
        os.getenv("LLM_REQUEST_TIMEOUT_SECONDS", "6")
    )

    # Application integration. The Agent is the only component allowed to use
    # these credentials; the browser never sees them.
    application_api_base_url: str = os.getenv(
        "APPLICATION_API_BASE_URL", "http://localhost:4000"
    )
    application_internal_token: str = os.getenv("APPLICATION_INTERNAL_TOKEN", "")
    application_api_timeout_seconds: float = float(
        os.getenv("APPLICATION_API_TIMEOUT_SECONDS", "10")
    )
    inbound_agent_api_key: str = os.getenv("INBOUND_AGENT_API_KEY", "")


settings = Settings()
