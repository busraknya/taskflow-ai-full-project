# TaskFlow Risk Model Card

## Current status

**No predictive model is shipped with TaskFlow AI.** The ML service starts without a model, reports `"model_loaded": false` from `GET /health`, and answers `POST /predict` and `POST /predict/batch` with `503 MODEL_UNAVAILABLE`. The backend stores no prediction in that case, and the web and Android apps show that a risk prediction is not available yet instead of a risk level.

The earlier demonstration model (version `v1`) was trained on six hand-authored synthetic examples. It produced results that contradicted basic expectations (for example, a task 30 days overdue was classified as LOW risk), so it has been removed together with its training script. Risk assessments it wrote in existing databases are no longer returned by the API.

## Prediction contract (feature spec `tf-risk-v1`)

- **Target:** probability that an open task is not DONE at the deadline known when the prediction is made. A date-only due date ends at midnight in the workspace time zone.
- **Features:** the 21 features listed in `feature_spec.json`, computed by the backend from the task's `TaskEvent` history using only events up to the prediction time. The same code produces training data and live inputs. No free text, raw user identifiers or post-completion information is used.
- **Not predicted:** tasks without a due date, overdue tasks, done or deleted tasks, and tasks created before `TaskEvent` existed (their history is incomplete).
- **Labels for training:** 1 if the task was not DONE at that deadline, 0 if it was. Later deadline changes do not change the label. Outcomes not yet observable, and tasks removed before their deadline, are not labelled.
- **Requests:** every request carries `workspaceId` and `featureSpecVersion`; a version mismatch or a missing or extra feature is rejected with `422`. A model bundle that declares another workspace is never used for a request.
- **Model bundle requirements:** `predict_proba`, `feature_spec_version`, `model_version`, `thresholds` (`medium`, `high`) chosen on held-out data, and `calibrated`. A probability is returned only when `calibrated` is true; otherwise only the level is returned. Incompatible bundles are rejected at startup.

## Training, evaluation and promotion (per workspace)

Training uses only one workspace's labelled rows and runs inside the installation. The backend builds the rows from that workspace's task history and calls `POST /train` once an owner or admin has enabled training and the workspace passes the readiness check. Only one training runs at a time. `python -m training.cli` offers the same steps for maintenance.

- **Split by time and by task:** the last 30 days are the test period. Training uses only tasks whose deadlines, and therefore labels, were all known before it; the latest part of that period is held out for calibration and threshold selection. No task appears in two sets. Each task has weight 1 however many daily snapshots it has.
- **Models:** baselines are the training base rate and a logistic regression on six features. The candidate is a shallow `HistGradientBoostingClassifier` with sigmoid (Platt) calibration fitted on the held-out calibration set. LOW/MEDIUM/HIGH thresholds are chosen on the calibration set, never on the test set.
- **Metrics on the test period:** PR-AUC, Brier score, ECE, and precision/recall at the HIGH threshold. Differences use a paired bootstrap that resamples whole tasks.
- **Promotion gate:** a candidate becomes active only if all of the following hold.
  - It beats the better baseline, and the current model, by at least 0.02 PR-AUC, with the lower bound of the 95% interval above 0.
  - Its Brier score is better than the base rate and its ECE is at most 0.15.
  - Its predictions are not degenerate.
  - The same pipeline trained on shuffled labels ranks no better than chance (mean ROC-AUC over 10 shuffles).
  - No single feature explains a near-perfect score (a leakage signal).

  Probabilities are reported only when test ECE is at most 0.05. All thresholds are configurable starting values and are recorded in each report.
- **Storage and rollback:** each workspace has its own directory under `MODELS_DIR` (`workspaces/<workspaceId>/`). It contains promoted models with their metadata (data window, metrics, gate results, configuration, library versions), a report for every training run including rejected ones, and an atomically updated active-model pointer. The last 5 promoted models are kept. `python -m training.cli rollback --workspace <id>` reactivates the previous one. A rejected candidate never replaces the active model.
- **Serving:** the service picks up a newly promoted or rolled-back model without a restart. It refuses a model whose metadata names another workspace, one trained with a different scikit-learn version, or one with an incompatible feature spec or invalid thresholds.

### What the synthetic validation shows (technical only)

Synthetic data with a planted signal, with pure noise, and with a planted leaking feature checks that the pipeline behaves correctly. It says nothing about accuracy on real tasks. Measured over 10 seeds each (labels in the noise case ignore all features):

- Noise was never promoted (0/10 at every data size tried). The planted leak was always rejected (10/10).
- A real, moderate signal was promoted in 2/10 runs with about 140 test-period tasks, 9/10 with about 270, and 10/10 with about 390. With few test tasks the confidence-interval requirement is deliberately conservative: a workspace needs a reasonably large recent period before a model can be activated.

## Planned approach

Risk models will be trained on each workspace's own task history, inside the customer's installation, only after a workspace administrator enables training and the workspace has enough usable history. A newly trained model becomes active only after it is evaluated on a later, unseen period and outperforms a simple baseline. Customer data is never sent to an external service and never mixed between workspaces.

The architecture and its implementation stages are documented in `analysis/product_workflows_requirements.md` (section "ML mimarisi").

## Rules until a validated model exists

- Do not display a risk level, percentage, or likelihood that was not produced by a validated model.
- Results measured on synthetic data only demonstrate that the software works; they are not evidence of real-world prediction quality.
- Do not use any risk output as the basis for task assignment, employee evaluation, performance management, or other consequential decisions.
- Any model added later must document data provenance, legal basis, feature definitions, label construction, evaluation protocol, metrics, calibration, limitations, and model version.
