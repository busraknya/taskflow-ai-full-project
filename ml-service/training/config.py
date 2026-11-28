from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class TrainingConfig:
    """
    Evaluation and promotion settings. Defaults are starting hypotheses, not
    proven requirements (see MODEL_CARD.md); every value is recorded in the
    training report.
    """

    # Temporal split
    test_days: int = 30
    calibration_fraction: float = 0.2
    # Minimum data for an evaluation to be meaningful at all. Workspace
    # readiness thresholds (Stage 4) are stricter and checked before training.
    min_tasks_per_split: int = 20
    min_minority_per_split: int = 5
    # Promotion gate
    min_pr_auc_gain: float = 0.02
    bootstrap_iterations: int = 1000
    confidence_level: float = 0.95
    max_ece: float = 0.15
    calibrated_ece: float = 0.05
    min_prediction_std: float = 0.02
    shuffled_label_tolerance: float = 0.05
    shuffled_label_runs: int = 10
    suspicious_pr_auc: float = 0.98
    suspicious_importance_share: float = 0.9
    # Model registry
    keep_models: int = 5

    def to_dict(self):
        return asdict(self)
