# TaskFlow Risk Model Card — v1

## Intended use

This model is an experimental demonstration of task-delay risk classification inside TaskFlow. It is not validated for operational, financial, staffing, or contractual decisions. A risk label must not be presented as a calibrated probability of delay.

## Model

- Algorithm: scikit-learn `GradientBoostingClassifier`
- Estimators: 50
- Random seed: 42
- Input features, in order:
  1. `days_until_due`
  2. `assignee_active_task_count`
  3. `comment_count`
  4. `priority`
- Output classes: `LOW`, `MEDIUM`, `HIGH`
- Artifact: `models/risk_model_v1.joblib`

## Training data and limitations

Version 1 is trained on exactly six hand-authored synthetic examples in `train.py`. They are illustrative examples, not observations of real task outcomes. There is no representative holdout set, cross-validation, measured accuracy, calibration analysis, fairness analysis, or drift evaluation.

The service currently maps the predicted class to fixed display values (0.2, 0.5, 0.85). These values are **not** probabilities and must not be described as confidence or likelihood percentages. The explanatory factors returned by the API are simple threshold-based hints and are not a complete explanation of the classifier.

## Operational requirements

- The service loads the committed model artifact and fails at startup if it is missing.
- Training is an explicit offline step: run `python train.py` from `ml-service/` only when intentionally creating the current demonstration artifact.
- Do not replace the artifact with a model trained on production data without documenting data provenance, consent/legal basis, feature definitions, label construction, evaluation protocol, metrics, calibration, limitations, and model version.
- Do not use this model as the sole basis for task assignment, employee evaluation, performance management, or other consequential decisions.

## Before production claims

A production-grade model requires representative, permissioned historical task data with an outcome label (for example, overdue vs. completed on time), a leakage-safe time-based validation split, baseline comparison, class-wise precision/recall/F1, ROC-AUC or PR-AUC where appropriate, calibration assessment, subgroup/error analysis, monitoring, and a documented retraining process.

**Current status: EXPERIMENTAL — not validated for production prediction.**
