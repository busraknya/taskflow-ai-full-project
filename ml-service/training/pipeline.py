import platform
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import sklearn
from sklearn.metrics import roc_auc_score

from .config import TrainingConfig
from .data import InvalidTrainingData, class_counts, load_rows, temporal_split
from .evaluate import (
    metrics,
    paired_bootstrap,
    permutation_importance,
    pr_auc,
    precision_recall_at,
    select_thresholds,
)
from .models import (
    BaseRateModel,
    BaselineLogisticRegression,
    GradientBoostingCandidate,
    ModelBundle,
    PlattCalibrator,
)


def _gate(name: str, passed: bool, detail: str) -> Dict:
    return {"name": name, "passed": bool(passed), "detail": detail}


def _rejected(report: Dict, reason: str) -> Tuple[Dict, None]:
    report["decision"] = "rejected"
    report["reasons"].append(reason)
    return report, None


def train_workspace_model(
    rows: Sequence[Dict],
    workspace_id: str,
    feature_names: List[str],
    feature_spec_version: str,
    model_version: str,
    config: TrainingConfig = TrainingConfig(),
    champion: Optional[ModelBundle] = None,
    seed: int = 0,
) -> Tuple[Dict, Optional[ModelBundle]]:
    """
    Trains a candidate on one workspace's rows, evaluates it on a later,
    unseen period and applies the promotion gate. Returns the report and the
    bundle (None when rejected). Never mixes workspaces: `rows` must come from
    `workspace_id` only, which the caller guarantees.
    """
    report: Dict = {
        "workspaceId": workspace_id,
        "modelVersion": model_version,
        "featureSpecVersion": feature_spec_version,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "seed": seed,
        "config": config.to_dict(),
        "environment": {
            "python": platform.python_version(),
            "sklearn": sklearn.__version__,
            "numpy": np.__version__,
        },
        "championVersion": getattr(champion, "model_version", None),
        "reasons": [],
        "gates": [],
    }
    try:
        dataset = load_rows(rows, feature_names)
    except InvalidTrainingData as error:
        return _rejected(report, f"invalid-data: {error}")

    split = temporal_split(dataset, config.test_days, config.calibration_fraction)
    report["data"] = {
        **split.summary,
        "rows": len(dataset),
        "fitClasses": class_counts(split.fit),
        "calibrationClasses": class_counts(split.calibration),
        "testClasses": class_counts(split.test),
    }
    for part in ("fit", "calibration", "test"):
        counts = report["data"][f"{part}Classes"]
        if counts["tasks"] < config.min_tasks_per_split or min(
            counts["positive"], counts["negative"]
        ) < config.min_minority_per_split:
            return _rejected(report, f"insufficient-data: {part} split {counts}")

    fit, cal, test = split.fit, split.calibration, split.test
    w_fit, w_cal, w_test = fit.task_weights(), cal.task_weights(), test.task_weights()

    # Baselines and candidate, each calibrated on the held-out calibration set.
    base_rate = BaseRateModel().fit(fit.X, fit.y, w_fit)
    baseline_lr = BaselineLogisticRegression(feature_names).fit(fit.X, fit.y, w_fit)
    candidate = GradientBoostingCandidate(seed).fit(fit.X, fit.y, w_fit)
    calibrators = {
        m.name: PlattCalibrator().fit(m.raw(cal.X), cal.y, w_cal) for m in (baseline_lr, candidate)
    }

    def predict(model, X):
        raw = model.raw(X)
        calibrator = calibrators.get(model.name)
        return calibrator.transform(raw) if calibrator else raw

    thresholds = select_thresholds(cal.y, predict(candidate, cal.X), w_cal)

    predictions = {m.name: predict(m, test.X) for m in (base_rate, baseline_lr, candidate)}
    report["metrics"] = {name: metrics(test.y, p, w_test) for name, p in predictions.items()}
    p_candidate = predictions[candidate.name]
    m_candidate = report["metrics"][candidate.name]
    report["thresholds"] = thresholds
    report["atHighThreshold"] = precision_recall_at(test.y, p_candidate, w_test, thresholds["high"])

    def compare(p_other, offset: int) -> Dict:
        return paired_bootstrap(
            test.y, w_test, test.task_ids, p_candidate, p_other, pr_auc,
            config.bootstrap_iterations, config.confidence_level, seed + offset,
        )

    # Gate 1: beats every baseline (and the current model) by a margin, with
    # the confidence interval of the difference above zero.
    best_baseline = max(
        (base_rate.name, baseline_lr.name), key=lambda n: report["metrics"][n]["prAuc"]
    )
    vs_baseline = compare(predictions[best_baseline], 1)
    report["comparison"] = {"bestBaseline": best_baseline, "vsBaseline": vs_baseline}
    report["gates"].append(
        _gate(
            "beats-baselines",
            vs_baseline["difference"] >= config.min_pr_auc_gain and vs_baseline["lower"] > 0,
            f"PR-AUC gain over {best_baseline} {vs_baseline['difference']:.4f} "
            f"(CI {vs_baseline['lower']:.4f}..{vs_baseline['upper']:.4f}); "
            f"required >= {config.min_pr_auc_gain} with lower bound > 0",
        )
    )
    if champion is not None and champion.feature_spec_version == feature_spec_version:
        p_champion = champion.predict_proba(test.X)[:, 1]
        report["metrics"]["champion"] = metrics(test.y, p_champion, w_test)
        vs_champion = compare(p_champion, 2)
        report["comparison"]["vsChampion"] = vs_champion
        report["gates"].append(
            _gate(
                "beats-current-model",
                vs_champion["difference"] >= config.min_pr_auc_gain and vs_champion["lower"] > 0,
                f"PR-AUC gain over {champion.model_version} {vs_champion['difference']:.4f} "
                f"(CI {vs_champion['lower']:.4f}..{vs_champion['upper']:.4f})",
            )
        )

    # Gate 2: probabilities are useful and within calibration tolerance.
    brier_base = report["metrics"][base_rate.name]["brier"]
    report["gates"].append(
        _gate(
            "calibration",
            m_candidate["brier"] < brier_base and m_candidate["ece"] <= config.max_ece,
            f"Brier {m_candidate['brier']:.4f} vs base rate {brier_base:.4f}; "
            f"ECE {m_candidate['ece']:.4f} (max {config.max_ece})",
        )
    )

    # Gate 3: not degenerate.
    flagged = report["atHighThreshold"]["flaggedShare"]
    report["gates"].append(
        _gate(
            "non-degenerate",
            m_candidate["predictionStd"] >= config.min_prediction_std and 0.0 < flagged < 1.0,
            f"prediction std {m_candidate['predictionStd']:.4f}; HIGH share {flagged:.3f}",
        )
    )

    # Gate 4: with shuffled labels the same pipeline must not rank test tasks
    # better than chance; otherwise it learns something other than the labels
    # (leakage through the pipeline). ROC-AUC is used because its chance
    # level (0.5) does not depend on the positive rate; the tolerance grows
    # with the measured spread across shuffles, which is large on small
    # test sets.
    tasks, inverse = np.unique(fit.task_ids, return_inverse=True)
    task_label = np.zeros(len(tasks), dtype=int)
    np.maximum.at(task_label, inverse, fit.y)
    shuffled_aucs = []
    for k in range(config.shuffled_label_runs):
        rng = np.random.default_rng(seed + 100 + k)
        shuffled_y = rng.permutation(task_label)[inverse]
        shuffled = GradientBoostingCandidate(seed).fit(fit.X, shuffled_y, w_fit)
        shuffled_aucs.append(float(roc_auc_score(test.y, shuffled.raw(test.X), sample_weight=w_test)))
    mean_auc = float(np.mean(shuffled_aucs))
    standard_error = float(np.std(shuffled_aucs, ddof=1) / np.sqrt(len(shuffled_aucs)))
    tolerance = max(config.shuffled_label_tolerance, 3 * standard_error)
    report["shuffledLabelAuc"] = [round(v, 4) for v in shuffled_aucs]
    report["gates"].append(
        _gate(
            "shuffled-labels",
            mean_auc <= 0.5 + tolerance,
            f"mean ROC-AUC over {len(shuffled_aucs)} label shuffles {mean_auc:.4f} "
            f"(chance 0.5, tolerance {tolerance:.4f})",
        )
    )

    # Gate 5: a near-perfect score driven by one feature suggests leakage.
    drops = permutation_importance(
        lambda X: predict(candidate, X), test.X, test.y, w_test, feature_names, seed + 4
    )
    positive = {k: v for k, v in drops.items() if v > 0}
    top = max(positive, key=positive.get) if positive else None
    share = positive[top] / sum(positive.values()) if top else 0.0
    report["featureImportance"] = dict(sorted(drops.items(), key=lambda kv: -kv[1]))
    suspicious = m_candidate["prAuc"] >= config.suspicious_pr_auc and share >= config.suspicious_importance_share
    report["gates"].append(
        _gate(
            "no-suspicious-feature",
            not suspicious,
            f"top feature {top} share {share:.2f}; PR-AUC {m_candidate['prAuc']:.4f}",
        )
    )

    calibrated = m_candidate["ece"] <= config.calibrated_ece
    report["calibrated"] = calibrated
    failed = [g["name"] for g in report["gates"] if not g["passed"]]
    if failed:
        report["decision"] = "rejected"
        report["reasons"].extend(f"gate-failed: {name}" for name in failed)
        return report, None

    report["decision"] = "promoted"
    bundle = ModelBundle(
        estimator=candidate,
        calibrator=calibrators[candidate.name],
        feature_names=feature_names,
        feature_spec_version=feature_spec_version,
        model_version=model_version,
        workspace_id=workspace_id,
        thresholds=thresholds,
        calibrated=calibrated,
    )
    return report, bundle
