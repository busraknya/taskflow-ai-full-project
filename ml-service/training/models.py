from typing import Dict, List, Optional

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

# Required simple baseline: a few features with a linear model.
BASELINE_LR_FEATURES = [
    "hours_to_deadline",
    "status_todo",
    "status_in_progress",
    "status_in_review",
    "priority",
    "assignee_open_tasks",
]

EPSILON = 1e-6


class BaseRateModel:
    """Predicts the training positive rate for every task."""

    name = "base_rate"

    def fit(self, X, y, sample_weight):
        self.rate_ = float(np.average(y, weights=sample_weight))
        return self

    def raw(self, X):
        return np.full(len(X), self.rate_)


class BaselineLogisticRegression:
    name = "baseline_logistic_regression"

    def __init__(self, feature_names: List[str]):
        self.columns = [feature_names.index(f) for f in BASELINE_LR_FEATURES]

    def fit(self, X, y, sample_weight):
        self.model_ = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
        self.model_.fit(X[:, self.columns], y, logisticregression__sample_weight=sample_weight)
        return self

    def raw(self, X):
        return self.model_.predict_proba(X[:, self.columns])[:, 1]


class GradientBoostingCandidate:
    """Primary candidate; shallow trees and large leaves for small data."""

    name = "hist_gradient_boosting"

    def __init__(self, seed: int):
        self.seed = seed

    def fit(self, X, y, sample_weight):
        self.model_ = HistGradientBoostingClassifier(
            max_depth=3,
            learning_rate=0.05,
            max_iter=200,
            min_samples_leaf=20,
            l2_regularization=1.0,
            early_stopping=False,
            random_state=self.seed,
        )
        self.model_.fit(X, y, sample_weight=sample_weight)
        return self

    def raw(self, X):
        return self.model_.predict_proba(X)[:, 1]


class PlattCalibrator:
    """Sigmoid calibration fitted on held-out data (robust on small sets)."""

    def fit(self, raw, y, sample_weight):
        self.model_ = LogisticRegression(C=1e4, max_iter=1000)
        self.model_.fit(_logit(raw).reshape(-1, 1), y, sample_weight=sample_weight)
        return self

    def transform(self, raw):
        return self.model_.predict_proba(_logit(raw).reshape(-1, 1))[:, 1]


def _logit(p):
    p = np.clip(np.asarray(p, dtype=float), EPSILON, 1 - EPSILON)
    return np.log(p / (1 - p))


class ModelBundle:
    """
    What the ML service loads: a fitted estimator plus calibration, the
    feature contract it was trained on, the owning workspace and the
    thresholds chosen on held-out data. See main.validate_model.
    """

    def __init__(
        self,
        estimator,
        calibrator: Optional[PlattCalibrator],
        feature_names: List[str],
        feature_spec_version: str,
        model_version: str,
        workspace_id: str,
        thresholds: Dict[str, float],
        calibrated: bool,
    ):
        self.estimator = estimator
        self.calibrator = calibrator
        self.feature_names = list(feature_names)
        self.feature_spec_version = feature_spec_version
        self.model_version = model_version
        self.workspace_id = workspace_id
        self.thresholds = dict(thresholds)
        self.calibrated = bool(calibrated)
        self.sklearn_version = sklearn.__version__

    def predict_proba(self, X):
        raw = self.estimator.raw(np.asarray(X, dtype=float))
        p = self.calibrator.transform(raw) if self.calibrator else raw
        return np.column_stack([1 - p, p])
