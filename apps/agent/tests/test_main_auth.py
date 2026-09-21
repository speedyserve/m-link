"""The analyze endpoint is public on AgentBase, so its guard is covered here."""

import pytest
from fastapi.testclient import TestClient

import main

VALID_BODY = {
    "customerId": "08100822",
    "objective": "prepare_rm_brief",
    "requestedBy": "RM001",
    "locale": "vi",
    "periodFrom": "2026-06-21",
    "periodTo": "2026-09-18",
}


@pytest.fixture(name="client")
def client_fixture():
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def restore_key():
    original = main.settings.inbound_agent_api_key
    yield
    main.settings.inbound_agent_api_key = original


def test_health_needs_no_key(client):
    """AgentBase probes /health unauthenticated; anything but 200 blocks the deploy."""
    main.settings.inbound_agent_api_key = ""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.parametrize("body", [VALID_BODY, {}], ids=["valid-body", "malformed-body"])
def test_missing_key_refuses_every_request(client, body):
    """An unset secret closes the endpoint instead of disabling authentication."""
    main.settings.inbound_agent_api_key = ""
    assert client.post("/v1/agent/analyze", json=body).status_code == 401


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer wrong"}, {"Authorization": "Bearer "}],
    ids=["no-header", "wrong-token", "empty-token"],
)
def test_bad_credentials_are_rejected(client, headers):
    main.settings.inbound_agent_api_key = "secret-abc"
    assert client.post("/v1/agent/analyze", headers=headers, json=VALID_BODY).status_code == 401


def test_scheme_prefix_is_optional(client):
    """The guard compares the secret itself, so a bare token also passes.

    Only the M-Link API calls this endpoint and it always sends `Bearer <key>`; this
    records the leniency rather than endorsing it.
    """
    main.settings.inbound_agent_api_key = "secret-abc"
    response = client.post(
        "/v1/agent/analyze", headers={"Authorization": "secret-abc"}, json=VALID_BODY
    )
    assert response.status_code != 401


def test_guard_runs_before_body_validation(client):
    """Without the key, a malformed body must not reveal the contract through a 422."""
    main.settings.inbound_agent_api_key = "secret-abc"
    assert client.post("/v1/agent/analyze", json={}).status_code == 401
    authorised = client.post(
        "/v1/agent/analyze", headers={"Authorization": "Bearer secret-abc"}, json={}
    )
    assert authorised.status_code == 422
