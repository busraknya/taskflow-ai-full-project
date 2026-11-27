from fastapi.testclient import TestClient

import main
from main import app

client = TestClient(app)

FEATURES = {
    "days_until_due": 1,
    "assignee_active_task_count": 5,
    "comment_count": 2,
    "priority": 3,
}


class StubModel:
    """Stands in for a validated model; returns a fixed class index."""

    taskflow_model_version = "test-model"

    def __init__(self, class_index):
        self.class_index = class_index

    def predict(self, features):
        assert features.shape == (1, 4)
        return [self.class_index]


def test_no_model_artifact_is_shipped():
    assert main.model is None


def test_health_is_healthy_without_a_model():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "model_loaded": False}


def test_predict_reports_model_unavailable_without_a_model():
    response = client.post("/predict", json=FEATURES)
    assert response.status_code == 503
    assert response.json() == {"detail": "MODEL_UNAVAILABLE"}


def test_predict_rejects_missing_required_feature():
    incomplete = {k: v for k, v in FEATURES.items() if k != "comment_count"}
    response = client.post("/predict", json=incomplete)
    assert response.status_code == 422


def test_model_loader_returns_none_when_artifact_is_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "MODEL_PATH", str(tmp_path / "missing.joblib"))
    assert main.load_model() is None


def test_predict_uses_a_loaded_model_without_inventing_a_probability(monkeypatch):
    monkeypatch.setattr(main, "model", StubModel(2))
    response = client.post("/predict", json=FEATURES)
    assert response.status_code == 200
    assert response.json() == {
        "risk_level": "HIGH",
        "risk_score": None,
        "model_version": "test-model",
        "factors": [],
    }
    assert client.get("/health").json()["model_loaded"] is True


def test_predict_rejects_an_unknown_class_from_the_model(monkeypatch):
    monkeypatch.setattr(main, "model", StubModel(7))
    response = client.post("/predict", json=FEATURES)
    assert response.status_code == 503
