import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
import joblib
import os

print("🤖 Training synthetic risk scoring model...")

# 1. Sentetik Veri Üretimi (Eğitim için)
# Özellikler (Features): 
# [days_until_due, assignee_active_task_count, comment_count, priority]
X_train = np.array([
    [1, 5, 2, 3],   # Acil, çok iş yükü, az yorum, yüksek öncelik -> HIGH Risk
    [10, 1, 0, 0],  # Uzun süre, az iş yükü, düşük öncelik -> LOW Risk
    [2, 4, 1, 2],   # Yakın tarih, orta iş yükü -> MEDIUM Risk
    [0, 6, 4, 3],   # Bugün bitiyor, çok iş yükü -> HIGH Risk
    [15, 0, 0, 0],  # Rahat -> LOW Risk
    [3, 3, 2, 2]    # Orta risk
])

# Etiketler (Labels): 0 = LOW, 1 = MEDIUM, 2 = HIGH
y_train = np.array([2, 0, 1, 2, 0, 1])

# 2. Model Eğitimi (Gradient Boosting Classifier)
model = GradientBoostingClassifier(n_estimators=50, random_state=42)
model.fit(X_train, y_train)

# 3. Model Artifact'ini Kaydetme (.joblib)
os.makedirs("models", exist_ok=True)
model_path = "models/risk_model_v1.joblib"
joblib.dump(model, model_path)

print(f"✅ Model successfully trained and saved to {model_path}")