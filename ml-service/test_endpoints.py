import pytest
from fastapi.testclient import TestClient

import main
from synthetic_data import synthetic_rows
from training.registry import ModelRegistry

client = TestClient(main.app)
WS = "ws-endpoints"


@pytest.fixture(autouse=True)
def isolated_registry(monkeypatch, tmp_path):
    registry = ModelRegistry(str(tmp_path))
    monkeypatch.setattr(main, "registry", registry)
    monkeypatch.setattr(main, "_model_cache", {})
    return registry


@pytest.fixture(scope="module")
def rows():
    return synthetic_rows(n_tasks=6000, seed=1, signal=1.0, workspace_id=WS)


def train(rows, workspace=WS, version=None):
    return client.post(
        "/train",
        json={"workspaceId": workspace, "featureSpecVersion": version or main.FEATURE_SPEC_VERSION, "rows": rows},
    )


def test_train_promotes_and_reports(rows):
    response = train(rows)
    assert response.status_code == 200
    body = response.json()
    assert body["report"]["decision"] == "promoted"
    assert body["activeModelVersion"] == body["report"]["modelVersion"]

    status = client.get(f"/models/{WS}").json()
    assert status["activeModelVersion"] == body["activeModelVersion"]
    [summary] = status["models"]
    assert summary["improvementOverBaseline"] > 0
    assert summary["testPeriod"]["tasks"] > 0
    # The summary exposes no task identifiers or feature values.
    assert "task" not in str(summary).lower().replace("tasks", "")


def test_rejected_training_keeps_no_model():
    response = train(synthetic_rows(n_tasks=4000, seed=2, noise=True, workspace_id=WS))
    assert response.status_code == 200
    assert response.json()["report"]["decision"] == "rejected"
    assert response.json()["activeModelVersion"] is None
    assert client.get(f"/models/{WS}").json() == {"activeModelVersion": None, "models": []}


def test_train_validates_contract_and_workspace(rows):
    assert train(rows[:10], version="tf-risk-v0").json() == {"detail": "FEATURE_SPEC_MISMATCH"}
    assert train(rows[:10], workspace="../x").status_code == 404


def test_only_one_training_runs_at_a_time(rows):
    assert main._training_lock.acquire(blocking=False)
    try:
        response = train(rows[:10])
        assert response.status_code == 409
        assert response.json() == {"detail": "TRAINING_IN_PROGRESS"}
    finally:
        main._training_lock.release()


def test_deactivate_rollback_and_prune(rows, isolated_registry):
    first = train(rows).json()["activeModelVersion"]
    assert client.post(f"/models/{WS}/rollback").json() == {"detail": "NO_EARLIER_MODEL"}
    assert client.post(f"/models/{WS}/deactivate").json() == {"activeModelVersion": None}
    body = {"workspaceId": WS, "featureSpecVersion": main.FEATURE_SPEC_VERSION, "features": rows[0]["features"]}
    assert client.post("/predict", json=body).status_code == 503

    pruned = client.post("/models/prune", json={"keepWorkspaceIds": ["another"]}).json()
    assert pruned == {"deletedWorkspaceIds": [WS]}
    assert isolated_registry.history(WS) == []
    assert first  # the model existed before pruning
