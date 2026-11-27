import os
import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="TaskFlow AI Risk Service", version="1.0")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# No model is shipped with the product. A model is only loaded when one has
# been trained and validated (see MODEL_CARD.md); until then the service runs
# without a model and reports MODEL_UNAVAILABLE instead of guessing.
MODEL_PATH = os.environ.get(
    "RISK_MODEL_PATH", os.path.join(BASE_DIR, "models", "risk_model.joblib")
)


def load_model():
    if not os.path.isfile(MODEL_PATH):
        print("No risk model artifact found; predictions are unavailable.")
        return None

    print(f"Loading model from {MODEL_PATH}...")
    return joblib.load(MODEL_PATH)


model = load_model()


class TaskFeatures(BaseModel):
    days_until_due: float
    assignee_active_task_count: int
    comment_count: int
    priority: int


@app.get("/health")
def health_check():
    # The service is healthy without a model; model availability is reported
    # separately so orchestration does not depend on a model existing.
    return {"status": "healthy", "model_loaded": model is not None}


@app.post("/predict")
def predict_risk(data: TaskFeatures):
    if model is None:
        raise HTTPException(status_code=503, detail="MODEL_UNAVAILABLE")

    features = np.array([[
        data.days_until_due,
        data.assignee_active_task_count,
        data.comment_count,
        data.priority,
    ]])

    pred_idx = model.predict(features)[0]
    mapping = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    risk_level = mapping.get(int(pred_idx))
    if risk_level is None:
        raise HTTPException(status_code=503, detail="MODEL_UNAVAILABLE")

    return {
        "risk_level": risk_level,
        "risk_score": None,  # Not a calibrated probability; intentionally unavailable.
        "model_version": getattr(model, "taskflow_model_version", "unversioned"),
        "factors": [],
    }
