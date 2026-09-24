import os
import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="TaskFlow AI Risk Service", version="1.0")

# Mutlak yol (Absolute Path) kullanarak dosya karmaşasını önleyelim
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "risk_model_v1.joblib")

def load_or_train_model():
    os.makedirs(MODEL_DIR, exist_ok=True)
    if not os.path.exists(MODEL_PATH):
        print("⚠️ Model not found. Training on the fly...")
        X_train = np.array([[1, 5, 2, 3], [10, 1, 0, 0], [2, 4, 1, 2], [0, 6, 4, 3], [15, 0, 0, 0], [3, 3, 2, 2]])
        y_train = np.array([2, 0, 1, 2, 0, 1])
        m = GradientBoostingClassifier(n_estimators=50, random_state=42)
        m.fit(X_train, y_train)
        joblib.dump(m, MODEL_PATH)
        print(f"✅ Model saved to {MODEL_PATH}")
    
    print(f"📂 Loading model from {MODEL_PATH}...")
    return joblib.load(MODEL_PATH)

model = load_or_train_model()

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