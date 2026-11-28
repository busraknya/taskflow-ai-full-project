import os

import joblib
import pytest
import sklearn
from fastapi.testclient import TestClient

import main
from main import app
from training.registry import ModelRegistry, new_model_id

client = TestClient(app)

FEATURES = {name: 1.0 for name in main.FEATURE_NAMES}
VERSION = main.FEATURE_SPEC_VERSION


class StubModel:
    """Test double for a validated model bundle; not a real model."""

    feature_spec_version = VERSION
    thresholds = {"medium": 0.3, "high": 0.6}
    sklearn_version = sklearn.__version__

    def __init__(self, probabilities, calibrated=True, workspace_id="ws-1"):
        self.probabilities = list(probabilities)
        self.calibrated = calibrated
        self.workspace_id = workspace_id
        self.model_version = new_model_id()

    def predict_proba(self, matrix):
        assert matrix.shape[1] == len(main.FEATURE_NAMES)
        return [[1 - p, p] for p in self.probabilities[: matrix.shape[0]]]


@pytest.fixture(autouse=True)
def isolated_registry(monkeypatch, tmp_path):
    registry = ModelRegistry(str(tmp_path))
    monkeypatch.setattr(main, "registry", registry)
    monkeypatch.setattr(main, "_model_cache", {})
    return registry


def activate(registry, bundle, workspace="ws-1"):
    registry.promote(workspace, bundle, {"modelVersion": bundle.model_version}, keep=5)
    return bundle


def single(features=None, version=VERSION, workspace="ws-1"):
    return client.post(
        "/predict",
        json={"workspaceId": workspace, "featureSpecVersion": version, "features": features or FEATURES},
    )


def batch(items, version=VERSION, workspace="ws-1"):
    return client.post(
        "/predict/batch",
        json={"workspaceId": workspace, "featureSpecVersion": version, "items": items},
    )


def test_no_model_is_shipped_with_the_image():
    shipped = os.path.join(main.BASE_DIR, "models", "workspaces")
    assert not os.path.isdir(shipped) or os.listdir(shipped) == []


def test_health_is_healthy_without_a_model():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "model_loaded": False,
        "feature_spec_version": VERSION,
    }


def test_predict_reports_model_unavailable_without_a_model():
    assert single().status_code == 503
    assert single().json() == {"detail": "MODEL_UNAVAILABLE"}
    response = batch([{"taskId": "t1", "features": FEATURES}])
    assert response.status_code == 503


def test_contract_is_checked_before_model_availability():
    assert single(version="tf-risk-v0").json() == {"detail": "FEATURE_SPEC_MISMATCH"}
    missing = {k: v for k, v in FEATURES.items() if k != "priority"}
    assert single(features=missing).json() == {"detail": "INVALID_FEATURES"}
    extra = {**FEATURES, "title_length": 3.0}
    assert single(features=extra).json() == {"detail": "INVALID_FEATURES"}


def test_batch_size_is_limited():
    items = [{"taskId": f"t{i}", "features": FEATURES} for i in range(main.MAX_BATCH_SIZE + 1)]
    assert batch(items).status_code == 422


def test_an_incompatible_active_model_is_not_used(isolated_registry):
    stale = StubModel([0.5])
    stale.feature_spec_version = "tf-risk-v0"
    activate(isolated_registry, stale)
    assert single().status_code == 503

    bad_thresholds = StubModel([0.5])
    bad_thresholds.thresholds = {"medium": 0.8, "high": 0.2}
    activate(isolated_registry, bad_thresholds)
    assert single().status_code == 503


def test_an_unreadable_model_file_is_not_used(isolated_registry):
    bundle = activate(isolated_registry, StubModel([0.5]))
    path = os.path.join(isolated_registry.root, "workspaces", "ws-1", bundle.model_version, "model.joblib")
    joblib.dump({"not": "a model"}, path)
    assert single().status_code == 503


def test_batch_uses_model_thresholds_and_keeps_task_ids(isolated_registry):
    bundle = activate(isolated_registry, StubModel([0.1, 0.45, 0.9]))
    response = batch([{"taskId": t, "features": FEATURES} for t in ("a", "b", "c")])
    assert response.status_code == 200
    assert response.json() == {
        "modelVersion": bundle.model_version,
        "results": [
            {"taskId": "a", "riskLevel": "LOW", "probability": 0.1},
            {"taskId": "b", "riskLevel": "MEDIUM", "probability": 0.45},
            {"taskId": "c", "riskLevel": "HIGH", "probability": 0.9},
        ],
    }
    assert client.get("/health").json()["model_loaded"] is True


def test_uncalibrated_model_never_returns_a_probability(isolated_registry):
    bundle = activate(isolated_registry, StubModel([0.9], calibrated=False))
    assert single().json() == {"modelVersion": bundle.model_version, "riskLevel": "HIGH", "probability": None}


def test_a_model_for_another_workspace_is_never_used(isolated_registry):
    activate(isolated_registry, StubModel([0.9], workspace_id="ws-1"))
    assert single(workspace="ws-1").status_code == 200
    response = single(workspace="ws-2")
    assert response.status_code == 503
    assert response.json() == {"detail": "MODEL_UNAVAILABLE"}


def test_unsafe_workspace_ids_are_not_resolved_to_paths():
    assert single(workspace="../ws-1").status_code == 503
