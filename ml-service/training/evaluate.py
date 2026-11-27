from typing import Callable, Dict

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss


def expected_calibration_error(y, p, w, bins: int = 10) -> float:
    edges = np.linspace(0, 1, bins + 1)
    index = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    total = w.sum()
    error = 0.0
    for b in range(bins):
        m = index == b
        if not m.any():
            continue
        weight = w[m].sum()
        error += weight / total * abs(np.average(y[m], weights=w[m]) - np.average(p[m], weights=w[m]))
    return float(error)


def metrics(y, p, w) -> Dict[str, float]:
    return {
        "prAuc": float(average_precision_score(y, p, sample_weight=w)),
        "brier": float(brier_score_loss(y, p, sample_weight=w)),
        "ece": expected_calibration_error(y, p, w),
        "positiveRate": float(np.average(y, weights=w)),
        "predictionStd": float(np.sqrt(np.cov(p, aweights=w))) if len(p) > 1 else 0.0,
    }


def precision_recall_at(y, p, w, threshold: float) -> Dict[str, float]:
    predicted = p >= threshold
    tp = float(w[predicted & (y == 1)].sum())
    fp = float(w[predicted & (y == 0)].sum())
    fn = float(w[~predicted & (y == 1)].sum())
    return {
        "threshold": threshold,
        "precision": tp / (tp + fp) if tp + fp else 0.0,
        "recall": tp / (tp + fn) if tp + fn else 0.0,
        "flaggedShare": float(w[predicted].sum() / w.sum()),
    }


def select_thresholds(y, p, w) -> Dict[str, float]:
    """
    On held-out (calibration) data: HIGH at the F1-maximising threshold,
    MEDIUM at the observed positive rate (above-average risk), capped at HIGH.
    """
    best_f1, high = -1.0, 0.5
    for t in np.unique(np.round(p, 4)):
        r = precision_recall_at(y, p, w, float(t))
        if r["precision"] + r["recall"] == 0:
            continue
        f1 = 2 * r["precision"] * r["recall"] / (r["precision"] + r["recall"])
        if f1 > best_f1:
            best_f1, high = f1, float(t)
    high = float(np.clip(high, 0.01, 0.99))
    medium = float(np.clip(min(np.average(y, weights=w), high), 0.005, high))
    return {"medium": round(medium, 4), "high": round(high, 4)}


def paired_bootstrap(
    y, w, groups, p_a, p_b, metric: Callable, iterations: int, confidence: float, seed: int
) -> Dict[str, float]:
    """
    Difference metric(a) - metric(b) on the same rows, resampling whole tasks
    so correlated snapshots of one task move together.
    """
    rng = np.random.default_rng(seed)
    unique, inverse = np.unique(groups, return_inverse=True)
    rows_of = [np.flatnonzero(inverse == g) for g in range(len(unique))]
    diffs = []
    for _ in range(iterations):
        picked = rng.integers(0, len(unique), len(unique))
        idx = np.concatenate([rows_of[g] for g in picked])
        if y[idx].min() == y[idx].max():
            continue
        diffs.append(metric(y[idx], p_a[idx], w[idx]) - metric(y[idx], p_b[idx], w[idx]))
    alpha = (1 - confidence) / 2
    diffs = np.asarray(diffs)
    return {
        "difference": float(metric(y, p_a, w) - metric(y, p_b, w)),
        "lower": float(np.quantile(diffs, alpha)) if len(diffs) else float("nan"),
        "upper": float(np.quantile(diffs, 1 - alpha)) if len(diffs) else float("nan"),
        "iterations": int(len(diffs)),
    }


def pr_auc(y, p, w) -> float:
    return float(average_precision_score(y, p, sample_weight=w))


def permutation_importance(predict: Callable, X, y, w, feature_names, seed: int, repeats: int = 3):
    """Mean PR-AUC drop when each feature is shuffled, on test data."""
    rng = np.random.default_rng(seed)
    base = pr_auc(y, predict(X), w)
    drops = {}
    for j, name in enumerate(feature_names):
        total = 0.0
        for _ in range(repeats):
            Xp = X.copy()
            Xp[:, j] = rng.permutation(Xp[:, j])
            total += base - pr_auc(y, predict(Xp), w)
        drops[name] = total / repeats
    return drops
