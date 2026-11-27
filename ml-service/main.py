import json
import logging
import math
import os
import threading
from typing import Dict, List, Tuple

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from training import runner
from training.config import TrainingConfig
from training.registry import ModelRegistry, RegistryError

logger = logging.getLogger("taskflow.ml")

app = FastAPI(title="TaskFlow AI Risk Service", version="2.0")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# The feature contract shared with the backend (see feature_spec.json).
with open(os.path.join(BASE_DIR, "feature_spec.json"), encoding="utf-8") as spec_file:
    FEATURE_SPEC = json.load(spec_file)
FEATURE_SPEC_VERSION: str = FEATURE_SPEC["version"]
FEATURE_NAMES: List[str] = [feature["name"] for feature in FEATURE_SPEC["features"]]

# No model is shipped with the product. Each workspace gets its own model only
# after training on its own history passes evaluation (see MODEL_CARD.md);
# until then the service reports MODEL_UNAVAILABLE instead of guessing.
MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(BASE_DIR, "models"))

MAX_BATCH_SIZE = 1000
MAX_TRAINING_ROWS = 500_000
# One training at a time keeps CPU and memory use on the customer's server low.
_training_lock = threading.Lock()


def validate_model(candidate):
    """
    A loadable model bundle exposes predict_proba (probability of missing the
    deadline as the last column), feature_spec_version, model_version,
    thresholds {"medium", "high"} chosen on held-out data, calibrated (bool)
    and workspace_id. Anything else is rejected.
    """
    required = (
        "predict_proba", "feature_spec_version", "model_version", "thresholds", "calibrated", "workspace_id",
    )
    missing = [name for name in required if not hasattr(candidate, name)]
    if missing:
        return f"model bundle is missing {', '.join(missing)}"
    if candidate.feature_spec_version != FEATURE_SPEC_VERSION:
        return (
            f"model expects feature spec {candidate.feature_spec_version}, "
            f"service provides {FEATURE_SPEC_VERSION}"
        )
    thresholds = candidate.thresholds
    if not (0 < thresholds.get("medium", -1) <= thresholds.get("high", -1) < 1):
        return "model thresholds are invalid"
    return None


registry = ModelRegistry(MODELS_DIR)
# workspaceId -> (modelId, bundle); refreshed when the active model changes,
# so a promotion or rollback takes effect without a restart.
_model_cache: Dict[str, Tuple[str, object]] = {}


def model_for(workspace_id: str):
    """The active, validated model of this workspace only, or None."""
    try:
        model_id = registry.active_id(workspace_id)
    except RegistryError:
        return None
    if model_id is None:
        _model_cache.pop(workspace_id, None)
        return None
    cached = _model_cache.get(workspace_id)
    if cached and cached[0] == model_id:
        return cached[1]
    try:
        bundle, _ = registry.load(workspace_id, model_id)
    except Exception as error:  # unreadable or incompatible artifact
        logger.warning("Model %s of workspace %s rejected: %s", model_id, workspace_id, error)
        return None
    problem = validate_model(bundle)
    if problem or bundle.workspace_id != workspace_id:
        logger.warning("Model %s of workspace %s rejected: %s", model_id, workspace_id, problem or "workspace mismatch")
        return None
    _model_cache[workspace_id] = (model_id, bundle)
    return bundle


class PredictItem(BaseModel):
    taskId: str = Field(min_length=1, max_length=64)
    features: Dict[str, float]


class PredictRequest(BaseModel):
    workspaceId: str = Field(min_length=1, max_length=64)
    featureSpecVersion: str
    features: Dict[str, float]


class BatchPredictRequest(BaseModel):
    workspaceId: str = Field(min_length=1, max_length=64)
    featureSpecVersion: str
    items: List[PredictItem] = Field(max_length=MAX_BATCH_SIZE)


def check_contract(version: str, rows: List[Dict[str, float]]) -> np.ndarray:
    if version != FEATURE_SPEC_VERSION:
        raise HTTPException(status_code=422, detail="FEATURE_SPEC_MISMATCH")
    expected = set(FEATURE_NAMES)
    matrix = []
    for row in rows:
        if set(row) != expected:
            raise HTTPException(status_code=422, detail="INVALID_FEATURES")
        values = [row[name] for name in FEATURE_NAMES]
        if not all(math.isfinite(value) for value in values):
            raise HTTPException(status_code=422, detail="INVALID_FEATURES")
        matrix.append(values)
    return np.array(matrix, dtype=float).reshape(len(matrix), len(FEATURE_NAMES))


def categorize(probability: float, thresholds: Dict[str, float]) -> str:
    if probability >= thresholds["high"]:
        return "HIGH"
    if probability >= thresholds["medium"]:
        return "MEDIUM"
    return "LOW"


def predict_rows(workspace_id: str, version: str, rows: List[Dict[str, float]]):
    matrix = check_contract(version, rows)
    active = model_for(workspace_id)
    if active is None:
        raise HTTPException(status_code=503, detail="MODEL_UNAVAILABLE")
    if len(rows) == 0:
        return active, []
    probabilities = np.asarray(active.predict_proba(matrix))[:, -1]
    results = []
    for probability in probabilities:
        p = float(probability)
        results.append(
            {
                "riskLevel": categorize(p, active.thresholds),
                # Shown only when the model passed calibration checks.
                "probability": p if active.calibrated else None,
            }
        )
    return active, results


@app.get("/health")
def health_check():
    # The service is healthy without a model; model availability is reported
    # separately so orchestration does not depend on a model existing.
    return {
        "status": "healthy",
        "model_loaded": registry.workspaces_with_active_model() > 0,
        "feature_spec_version": FEATURE_SPEC_VERSION,
    }


@app.post("/predict")
def predict(request: PredictRequest):
    active, results = predict_rows(request.workspaceId, request.featureSpecVersion, [request.features])
    return {"modelVersion": active.model_version, **results[0]}


@app.post("/predict/batch")
def predict_batch(request: BatchPredictRequest):
    active, results = predict_rows(
        request.workspaceId,
        request.featureSpecVersion,
        [item.features for item in request.items],
    )
    return {
        "modelVersion": active.model_version,
        "results": [
            {"taskId": item.taskId, **result} for item, result in zip(request.items, results)
        ],
    }


class TrainRequest(BaseModel):
    workspaceId: str = Field(min_length=1, max_length=64)
    featureSpecVersion: str
    rows: List[Dict] = Field(max_length=MAX_TRAINING_ROWS)
    seed: int = 0


class PruneRequest(BaseModel):
    keepWorkspaceIds: List[str]


def _workspace_or_404(workspace_id: str) -> None:
    try:
        registry.active_id(workspace_id)
    except RegistryError:
        raise HTTPException(status_code=404, detail="UNKNOWN_WORKSPACE")


@app.post("/train")
def train_model(request: TrainRequest):
    """
    Trains and evaluates a model for one workspace from rows the backend built
    from that workspace only. Promotes it only if it passes the gate.
    """
    if request.featureSpecVersion != FEATURE_SPEC_VERSION:
        raise HTTPException(status_code=422, detail="FEATURE_SPEC_MISMATCH")
    _workspace_or_404(request.workspaceId)
    if not _training_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="TRAINING_IN_PROGRESS")
    try:
        report = runner.train(
            registry, request.workspaceId, request.rows, FEATURE_NAMES, FEATURE_SPEC_VERSION,
            seed=request.seed, config=TrainingConfig(),
        )
    finally:
        _training_lock.release()
    return {"report": report, "activeModelVersion": registry.active_id(request.workspaceId)}


@app.get("/models/{workspace_id}")
def model_status(workspace_id: str):
    _workspace_or_404(workspace_id)
    active = registry.active_id(workspace_id)
    history = []
    for model_id in reversed(registry.history(workspace_id)):
        try:
            history.append(runner.model_summary(registry.metadata(workspace_id, model_id)))
        except (OSError, ValueError):
            continue
    return {"activeModelVersion": active, "models": history}


@app.post("/models/{workspace_id}/rollback")
def rollback_model(workspace_id: str):
    _workspace_or_404(workspace_id)
    try:
        active = registry.rollback(workspace_id)
    except RegistryError:
        raise HTTPException(status_code=409, detail="NO_EARLIER_MODEL")
    _model_cache.pop(workspace_id, None)
    return {"activeModelVersion": active}


@app.post("/models/{workspace_id}/deactivate")
def deactivate_model(workspace_id: str):
    _workspace_or_404(workspace_id)
    registry.deactivate(workspace_id)
    _model_cache.pop(workspace_id, None)
    return {"activeModelVersion": None}


@app.post("/models/prune")
def prune_models(request: PruneRequest):
    """Deletes the models of every workspace that no longer exists."""
    keep = set(request.keepWorkspaceIds)
    deleted = [w for w in registry.workspace_ids() if w not in keep]
    for workspace_id in deleted:
        registry.delete_workspace(workspace_id)
        _model_cache.pop(workspace_id, None)
    return {"deletedWorkspaceIds": deleted}
