"""Read-only client for the M-Link Application's internal banking APIs."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from config import settings


class ApplicationApiError(RuntimeError):
    pass


@dataclass
class BankingSnapshot:
    customer: dict
    accounts: list[dict]
    transactions: list[dict]
    cards: list[dict]
    deposits: list[dict]
    interactions: list[dict]


class ApplicationApiClient:
    def __init__(self) -> None:
        self.base_url = settings.application_api_base_url.rstrip("/")
        self.token = settings.application_internal_token

    async def fetch_customer_snapshot(self, customer_id: str) -> BankingSnapshot:
        if not self.token:
            raise ApplicationApiError("APPLICATION_INTERNAL_TOKEN is not configured")

        headers = {"Authorization": f"Bearer {self.token}"}
        timeout = httpx.Timeout(settings.application_api_timeout_seconds)
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url, headers=headers, timeout=timeout
            ) as client:
                paths = {
                    "customer": f"/internal/customers/{customer_id}",
                    "accounts": f"/internal/customers/{customer_id}/accounts",
                    "transactions": f"/internal/customers/{customer_id}/transactions?limit=100",
                    "cards": f"/internal/customers/{customer_id}/cards",
                    "deposits": f"/internal/customers/{customer_id}/deposits",
                    "interactions": f"/internal/customers/{customer_id}/interactions",
                }
                responses = await self._get_all(client, paths)
        except httpx.HTTPError as error:
            raise ApplicationApiError("Application internal API could not be reached") from error

        return BankingSnapshot(
            customer=responses["customer"],
            accounts=responses["accounts"],
            transactions=responses["transactions"].get("items", []),
            cards=responses["cards"],
            deposits=responses["deposits"],
            interactions=responses["interactions"],
        )

    async def _get_all(self, client: httpx.AsyncClient, paths: dict[str, str]) -> dict[str, object]:
        import asyncio

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
