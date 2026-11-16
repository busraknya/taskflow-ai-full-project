import pytest
from fastapi.testclient import TestClient

import main
from main import app

client = TestClient(app)


def test_health_reports_loaded_model():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.json()["model_loaded"] is True


def test_predict_returns_supported_risk_level_and_score():
    response = client.post(
        "/predict",
        json={
            "days_until_due": 1,
            "assignee_active_task_count": 5,
            "comment_count": 2,
            "priority": 3,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["risk_level"] in {"LOW", "MEDIUM", "HIGH"}
    assert 0 <= body["risk_score"] <= 1
    assert body["model_version"] == "v1"
    assert isinstance(body["factors"], list)


def test_predict_rejects_missing_required_feature():
    response = client.post(
        "/predict",
        json={
            "days_until_due": 1,
            "assignee_active_task_count": 5,
            "priority": 3,
        },
    )
    assert response.status_code == 422



def test_model_loader_fails_when_artifact_is_missing(monkeypatch, tmp_path):
    missing_model = tmp_path / "missing-model.joblib"
    monkeypatch.setattr(main, "MODEL_PATH", str(missing_model))

    with pytest.raises(RuntimeError, match="Train and validate a model explicitly"):
        main.load_model()
