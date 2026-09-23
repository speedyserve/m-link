"""Read-only client for the M-Link Application's internal banking APIs."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import date

import httpx

from config import settings
from models import CustomerMetrics


class ApplicationApiError(RuntimeError):
    pass


@dataclass
class CustomerContext:
    """Everything the rule engine needs for one customer, as served by the Application."""

    customer: dict
    metrics: CustomerMetrics
    holdings: dict[str, bool]
    next_best_offers: dict[str, int | None]
    interactions: list[dict] = field(default_factory=list)
    deposits: list[dict] = field(default_factory=list)
    cards: list[dict] = field(default_factory=list)
    loans: list[dict] = field(default_factory=list)
    # Balances, flows and activity for the analysed window (GET .../period-summary).
    period_summary: dict | None = None


def window_days(period_from: str | None, period_to: str | None) -> int | None:
    """Inclusive length of the requested window, or None when no window was requested."""
    if not period_from or not period_to:
        return None
    try:
        return (date.fromisoformat(period_to[:10]) - date.fromisoformat(period_from[:10])).days + 1
    except ValueError:
        return None


class ApplicationApiClient:
    def __init__(self) -> None:
        self.base_url = settings.application_api_base_url.rstrip("/")
        self.token = settings.application_internal_token

    async def fetch_customer_context(
        self,
        customer_id: str,
        *,
        period_from: str | None = None,
        period_to: str | None = None,
    ) -> CustomerContext:
        """Loads the banking context. With a window, metrics are recomputed for that window and
        the period summary is fetched alongside them."""
        if not self.token:
            raise ApplicationApiError("APPLICATION_INTERNAL_TOKEN is not configured")

        headers = {"Authorization": f"Bearer {self.token}"}
        timeout = httpx.Timeout(settings.application_api_timeout_seconds)
        base = f"/internal/customers/{customer_id}"
        window = window_days(period_from, period_to)
        metrics_path = f"{base}/metrics"
        if period_to and window:
            metrics_path = f"{metrics_path}?asOf={period_to}&windowDays={window}"
        paths = {
            "customer": base,
            "metrics": metrics_path,
            "holdings": f"{base}/holdings",
            "next_best_offers": f"{base}/next-best-offers",
            "interactions": f"{base}/interactions",
            "deposits": f"{base}/deposits",
            "cards": f"{base}/cards",
            "loans": f"{base}/loans",
        }
        if period_from and period_to:
            paths["period_summary"] = f"{base}/period-summary?from={period_from}&to={period_to}"
        try:
            async with httpx.AsyncClient(base_url=self.base_url, headers=headers, timeout=timeout) as client:
                responses = await self._get_all(client, paths)
        except httpx.HTTPError as error:
            raise ApplicationApiError("Application internal API could not be reached") from error

        try:
            metrics = CustomerMetrics.model_validate(responses["metrics"])
        except Exception as error:  # pydantic.ValidationError
            raise ApplicationApiError("Application returned an invalid metrics payload") from error

        return CustomerContext(
            customer=responses["customer"],
            metrics=metrics,
            holdings={row["productCode"]: bool(row["held"]) for row in responses["holdings"]},
            next_best_offers={row["productCode"]: row.get("rank") for row in responses["next_best_offers"]},
            interactions=responses["interactions"],
            deposits=responses["deposits"],
            cards=responses["cards"],
            loans=responses["loans"],
            period_summary=responses.get("period_summary"),
        )

    async def _get_all(self, client: httpx.AsyncClient, paths: dict[str, str]) -> dict[str, object]:
        results = await asyncio.gather(*(client.get(path) for path in paths.values()))
        output: dict[str, object] = {}
        for key, response in zip(paths, results, strict=True):
            if response.status_code >= 400:
                raise ApplicationApiError(
                    f"Application internal API returned {response.status_code} for {key}"
                )
            try:
                output[key] = response.json()
            except ValueError as error:
                raise ApplicationApiError(
                    f"Application internal API returned invalid JSON for {key}"
                ) from error
        return output
