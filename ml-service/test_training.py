import json
import os

import joblib
import numpy as np
import pytest
import sklearn
from fastapi.testclient import TestClient

import main
from synthetic_data import synthetic_rows
from training.cli import train
from training.config import TrainingConfig
from training.data import load_rows, temporal_split
from training.pipeline import train_workspace_model
from training.registry import ModelRegistry, RegistryError, new_model_id

WS = "ws-synthetic"
# Fewer bootstrap iterations keep the suite fast; the gate logic is the same.
FAST = TrainingConfig(bootstrap_iterations=300)


def run(rows, workspace=WS, champion=None, seed=0, config=FAST):
    return train_workspace_model(
        rows, workspace, main.FEATURE_NAMES, main.FEATURE_SPEC_VERSION,
        model_version=new_model_id(), config=config, champion=champion, seed=seed,
    )


def gates(report):
    return {g["name"]: g["passed"] for g in report["gates"]}


# Sizes follow the measured power of the gate: with ~140 test tasks a real
# moderate signal is promoted in about 2 of 10 seeds, with ~390 in 10 of 10
# (noise: 0 of 10 at every size). See MODEL_CARD.md.
@pytest.fixture(scope="module")
def signal_rows():
    return synthetic_rows(n_tasks=6000, seed=1, signal=1.0)


@pytest.fixture(scope="module")
def signal_result(signal_rows):
    return run(signal_rows)


# ---------- split ----------

def test_temporal_split_keeps_tasks_whole_and_labels_in_the_past(signal_rows):
    ds = load_rows(signal_rows, main.FEATURE_NAMES)
    split = temporal_split(ds, test_days=30, calibration_fraction=0.2)
    fit, cal, test = (set(s.task_ids) for s in (split.fit, split.calibration, split.test))
    assert not (fit & cal) and not (fit & test) and not (cal & test)
    assert split.fit.deadline.max() <= split.calibration.as_of.min()
    assert split.calibration.deadline.max() <= split.test.as_of.min()
    assert len(test) >= 20 and len(fit) >= 100


# ---------- gate behaviour on synthetic data (technical validation) ----------

def test_hidden_signal_is_learned_and_promoted(signal_result):
    report, bundle = signal_result
    assert report["decision"] == "promoted", report["gates"]
    assert all(gates(report).values())
    metrics = report["metrics"]
    assert metrics["hist_gradient_boosting"]["prAuc"] > metrics["base_rate"]["prAuc"] + 0.1
    assert report["comparison"]["vsBaseline"]["lower"] > 0
    assert 0 < report["thresholds"]["medium"] <= report["thresholds"]["high"] < 1
    assert bundle.workspace_id == WS and main.validate_model(bundle) is None
    # The planted drivers are among the most important features.
    top = list(report["featureImportance"])[:4]
    assert {"assignee_open_tasks", "postpone_count"} & set(top)


def test_labels_without_signal_are_rejected():
    report, bundle = run(synthetic_rows(n_tasks=4000, seed=2, noise=True))
    assert bundle is None and report["decision"] == "rejected"
    assert gates(report)["beats-baselines"] is False


def test_a_leaking_feature_is_rejected():
    report, bundle = run(synthetic_rows(n_tasks=2000, seed=3, leak=True))
    assert bundle is None
    assert gates(report)["no-suspicious-feature"] is False
    assert list(report["featureImportance"])[0] == "comment_count"


def test_too_little_data_is_rejected_without_training():
    report, bundle = run(synthetic_rows(n_tasks=40, seed=4))
    assert bundle is None
    assert report["reasons"][0].startswith("insufficient-data")
    assert report["gates"] == []


def test_invalid_rows_are_rejected():
    rows = synthetic_rows(n_tasks=50, seed=5)
    rows[0]["features"]["title_length"] = 3.0
    report, bundle = run(rows)
    assert bundle is None and report["reasons"][0].startswith("invalid-data")


def test_training_is_reproducible(signal_rows, signal_result):
    report_a, bundle_a = signal_result
    report_b, bundle_b = run(signal_rows)
    X = load_rows(signal_rows[:200], main.FEATURE_NAMES).X
    assert np.array_equal(bundle_a.predict_proba(X), bundle_b.predict_proba(X))
    assert report_a["metrics"] == report_b["metrics"]
    assert report_a["thresholds"] == report_b["thresholds"]


def test_a_new_model_must_beat_the_current_one(signal_rows, signal_result):
    _, champion = signal_result
    report, bundle = run(signal_rows, champion=champion, seed=1)
    assert bundle is None
    assert gates(report)["beats-current-model"] is False


def test_report_records_data_window_config_and_environment(signal_result):
    report, _ = signal_result
    assert report["data"]["testCutoff"] > report["data"]["calibrationCutoff"]
    assert report["config"]["min_pr_auc_gain"] == FAST.min_pr_auc_gain
    assert report["environment"]["sklearn"] == sklearn.__version__
    json.dumps(report)  # serialisable


# ---------- registry ----------

@pytest.fixture
def registry(tmp_path):
    return ModelRegistry(str(tmp_path))


def test_promotion_failure_and_rollback(registry, signal_rows):
    first = train(registry, WS, signal_rows, config=FAST)
    assert first["decision"] == "promoted"
    first_id = registry.active_id(WS)

    # A rejected candidate leaves the active model untouched.
    failed = train(registry, WS, synthetic_rows(n_tasks=4000, seed=2, noise=True), config=FAST)
    assert failed["decision"] == "rejected"
    assert registry.active_id(WS) == first_id
    reports = os.listdir(os.path.join(registry.root, "workspaces", WS, "reports"))
    assert len(reports) == 2

    # Promote a second model, then roll back to the first.
    _, bundle = run(signal_rows, seed=7)
    assert bundle is not None
    registry.promote(WS, bundle, {"modelVersion": bundle.model_version}, keep=5)
    assert registry.active_id(WS) == bundle.model_version
    assert registry.rollback(WS) == first_id
    assert registry.active_id(WS) == first_id
    with pytest.raises(RegistryError):
        registry.rollback(WS)


def test_registry_keeps_only_the_last_models(registry, signal_result):
    _, bundle = signal_result
    report = {"modelVersion": ""}
    ids = []
    for _ in range(4):
        bundle.model_version = new_model_id()
        report["modelVersion"] = bundle.model_version
        ids.append(registry.promote(WS, bundle, report, keep=2))
    assert registry.history(WS) == ids[-2:]
    stored = {d for d in os.listdir(os.path.join(registry.root, "workspaces", WS)) if d[0].isdigit()}
    assert stored == set(ids[-2:])


def test_registry_isolates_workspaces(registry, signal_result):
    _, bundle = signal_result
    bundle.model_version = new_model_id()
    with pytest.raises(RegistryError):
        registry.promote("ws-other", bundle, {"modelVersion": bundle.model_version}, keep=5)
    for bad in ("../etc", "a/b", "", "x" * 65):
        with pytest.raises(RegistryError):
            registry.active_id(bad)
    registry.promote(WS, bundle, {"modelVersion": bundle.model_version}, keep=5)
    assert registry.load_active("ws-other") == (None, None)
    # A model file copied into another workspace's directory is refused.
    src = os.path.join(registry.root, "workspaces", WS)
    dst = os.path.join(registry.root, "workspaces", "ws-other")
    import shutil
    shutil.copytree(src, dst)
    with pytest.raises(RegistryError):
        registry.load_active("ws-other")


def test_registry_refuses_models_from_another_sklearn_version(registry, signal_result):
    _, bundle = signal_result
    bundle.model_version = new_model_id()
    registry.promote(WS, bundle, {"modelVersion": bundle.model_version}, keep=5)
    path = os.path.join(registry.root, "workspaces", WS, bundle.model_version, "model.joblib")
    stored = joblib.load(path)
    stored.sklearn_version = "0.0.1"
    joblib.dump(stored, path)
    with pytest.raises(RegistryError):
        registry.load_active(WS)


# ---------- serving ----------

def test_service_serves_each_workspace_its_own_active_model(monkeypatch, tmp_path, signal_rows):
    registry = ModelRegistry(str(tmp_path))
    monkeypatch.setattr(main, "registry", registry)
    monkeypatch.setattr(main, "_model_cache", {})
    client = TestClient(main.app)
    features = {name: float(v) for name, v in signal_rows[0]["features"].items()}
    body = lambda ws: {"workspaceId": ws, "featureSpecVersion": main.FEATURE_SPEC_VERSION, "features": features}  # noqa: E731

    assert client.post("/predict", json=body(WS)).status_code == 503
    train(registry, WS, signal_rows, config=FAST)  # promoted without restarting the service
    response = client.post("/predict", json=body(WS))
    assert response.status_code == 200
    assert response.json()["modelVersion"] == registry.active_id(WS)
    assert response.json()["riskLevel"] in {"LOW", "MEDIUM", "HIGH"}
    assert client.post("/predict", json=body("ws-other")).status_code == 503
    assert client.get("/health").json()["model_loaded"] is True

    registry.deactivate(WS)
    assert client.post("/predict", json=body(WS)).status_code == 503


def test_cli_rollback_reports_errors_without_a_traceback(monkeypatch, tmp_path, capsys):
    import training.cli as cli

    monkeypatch.setattr(cli, "MODELS_DIR", str(tmp_path))
    assert cli.main(["rollback", "--workspace", WS]) == 1
    assert "no earlier model" in capsys.readouterr().err
