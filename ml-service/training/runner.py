from typing import Dict, List, Sequence

from .config import TrainingConfig
from .pipeline import train_workspace_model
from .registry import ModelRegistry, RegistryError, new_model_id


def train(
    registry: ModelRegistry,
    workspace_id: str,
    rows: Sequence[Dict],
    feature_names: List[str],
    feature_spec_version: str,
    seed: int = 0,
    config: TrainingConfig = TrainingConfig(),
) -> Dict:
    """Trains, evaluates and promotes when the gate passes; always stores the report."""
    try:
        _, champion = registry.load_active(workspace_id)
    except RegistryError:
        champion = None  # an unloadable current model cannot be compared against
    report, bundle = train_workspace_model(
        rows, workspace_id, feature_names, feature_spec_version,
        model_version=new_model_id(), config=config, champion=champion, seed=seed,
    )
    if bundle is not None:
        registry.promote(workspace_id, bundle, report, keep=config.keep_models)
    else:
        registry.save_report(workspace_id, report)
    return report


def model_summary(metadata: Dict) -> Dict:
    """Public summary of a promoted model (no feature values or task data)."""
    metrics = metadata.get("metrics", {})
    comparison = metadata.get("comparison", {})
    data = metadata.get("data", {})
    return {
        "modelVersion": metadata.get("modelVersion"),
        "createdAt": metadata.get("createdAt"),
        "featureSpecVersion": metadata.get("featureSpecVersion"),
        "calibrated": metadata.get("calibrated", False),
        "trainingPeriod": {"start": data.get("dataStart"), "end": data.get("testCutoff")},
        "testPeriod": {"start": data.get("testCutoff"), "end": data.get("dataEnd"), "tasks": data.get("testTasks")},
        "prAuc": metrics.get("hist_gradient_boosting", {}).get("prAuc"),
        "bestBaseline": comparison.get("bestBaseline"),
        "baselinePrAuc": metrics.get(comparison.get("bestBaseline", ""), {}).get("prAuc"),
        "improvementOverBaseline": comparison.get("vsBaseline", {}).get("difference"),
    }
