import pytest
from fastapi.testclient import TestClient

from server.app import app


@pytest.fixture(scope="module")
def client():
    c = TestClient(app)
    assert c.post("/api/scenario", json={"size": 120, "seed": 3}).status_code == 200
    return c


def test_health_and_scenario(client):
    assert client.get("/api/health").json()["ok"]
    sc = client.get("/api/scenario").json()
    assert sc["rows"] == 120 and "hillshade" in sc["layers"] and sc["limitations"]


def test_viewshed_modes(client):
    for mode in ("binary", "cumulative", "dead_ground", "probability"):
        r = client.post("/api/viewshed", json={"observers": [[60, 60], [20, 20]], "mode": mode, "runs": 3, "max_range_m": 800})
        assert r.status_code == 200, r.text
        assert r.json()["layer"]["data"]


def test_bad_input_rejected(client):
    assert client.post("/api/viewshed", json={"observers": [[999, 1]]}).status_code == 400
    assert client.post("/api/viewshed", json={"observers": []}).status_code == 400
    assert client.post("/api/radio", json={"a": [5, 5], "b": [5, 5]}).status_code == 400


def test_mobility_route_radio(client):
    assert client.post("/api/mobility", json={"vehicle": "foot"}).status_code == 200
    r = client.post("/api/route", json={"start": [110, 10], "goal": [10, 110], "k": 2}).json()
    assert len(r["routes"]) == 2 and r["corridor"]["data"]
    assert client.post("/api/radio", json={"a": [10, 10], "b": [100, 100]}).json()["status"] in ("clear", "fresnel_obstructed", "blocked")


def test_threat_pipeline(client):
    r = client.post("/api/threat", json={
        "friendly_start": [110, 10], "friendly_goal": [10, 110],
        "enemy_starts": [[5, 115]], "enemy_objective": [115, 5],
        "friendly_positions": [[60, 40]],
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert {f["name"] for f in d["fcoa"]} and d["label"]
    assert d["fcoa"][-1]["exposure"]["mean"] <= d["fcoa"][0]["exposure"]["mean"] + 1e-9


def test_overlay_sync_roundtrip(client):
    client.post("/api/overlays", json={"key": "k1", "value": {"a": 1}})
    blob = client.post("/api/sync/delta", json={}).content
    assert client.post("/api/sync/merge", content=blob).json()["changed"] == 0  # idempotent
    assert client.get("/api/overlays").json()["items"]["k1"] == {"a": 1}
