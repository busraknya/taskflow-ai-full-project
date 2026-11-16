import os
import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="TaskFlow AI Risk Service", version="1.0")

# Mutlak yol (Absolute Path) kullanarak dosya karmaşasını önleyelim
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "risk_model_v1.joblib")

def load_model():
    if not os.path.isfile(MODEL_PATH):
        raise RuntimeError(
            f"Model artifact not found at {MODEL_PATH}. "
            "Train and validate a model explicitly before starting the service."
        )

    print(f"📂 Loading model from {MODEL_PATH}...")
    return joblib.load(MODEL_PATH)

model = load_model()

class TaskFeatures(BaseModel):
    days_until_due: float
    assignee_active_task_count: int
    comment_count: int
    priority: int

@app.get("/health")
def health_check():
    return {"status": "healthy", "model_loaded": model is not None}

@app.post("/predict")
def predict_risk(data: TaskFeatures):
    if model is None:
        raise HTTPException(status_code=503, detail="MODEL_UNAVAILABLE")
    
    features = np.array([[
        data.days_until_due,
        data.assignee_active_task_count,
        data.comment_count,
        data.priority
    ]])
    
    pred_idx = model.predict(features)[0]
    mapping = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    risk_level = mapping.get(pred_idx, "LOW")
    
    factors = []
    if data.days_until_due <= 2:
        factors.append({"feature": "days_until_due", "explanation": f"Due in {data.days_until_due} days"})
    if data.assignee_active_task_count >= 4:
        factors.append({"feature": "assignee_active_task_count", "explanation": f"Assignee has {data.assignee_active_task_count} active tasks"})

    return {
        "risk_level": risk_level,
        "risk_score": 0.85 if risk_level == "HIGH" else (0.5 if risk_level == "MEDIUM" else 0.2),
        "model_version": "v1",
        "factors": factors
    }