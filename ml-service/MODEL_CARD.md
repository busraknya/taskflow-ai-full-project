# TaskFlow Risk Model Card

## Current status

**No predictive model is shipped with TaskFlow AI.** The ML service starts without a model, reports `"model_loaded": false` from `GET /health`, and answers `POST /predict` with `503 MODEL_UNAVAILABLE`. The backend stores no risk assessment in that case, and the web and Android apps show that a risk prediction is not available yet instead of a risk level.

The earlier demonstration model (version `v1`) was trained on six hand-authored synthetic examples. It produced results that contradicted basic expectations (for example, a task 30 days overdue was classified as LOW risk), so it has been removed together with its training script. Risk assessments it wrote in existing databases are no longer returned by the API.

## Planned approach

Risk models will be trained on each workspace's own task history, inside the customer's installation, only after a workspace administrator enables training and the workspace has enough usable history. A newly trained model becomes active only after it is evaluated on a later, unseen period and outperforms a simple baseline. Customer data is never sent to an external service and never mixed between workspaces.

The architecture and its implementation stages are documented in `analysis/product_workflows_requirements.md` (section "ML mimarisi").

## Rules until a validated model exists

- Do not display a risk level, percentage, or likelihood that was not produced by a validated model.
- Results measured on synthetic data only demonstrate that the software works; they are not evidence of real-world prediction quality.
- Do not use any risk output as the basis for task assignment, employee evaluation, performance management, or other consequential decisions.
- Any model added later must document data provenance, legal basis, feature definitions, label construction, evaluation protocol, metrics, calibration, limitations, and model version.
