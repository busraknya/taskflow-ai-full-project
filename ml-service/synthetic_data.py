"""
Synthetic training rows for TECHNICAL validation of the training pipeline
only (hidden-signal recovery, rejection of noise and leakage). These rows
are not real task data and results on them are not evidence of real-world
prediction quality. Not included in the service image.
"""
from datetime import datetime, timedelta, timezone

import numpy as np

from main import FEATURE_NAMES

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def synthetic_rows(
    n_tasks: int = 800,
    seed: int = 0,
    signal: float = 1.0,
    days: int = 240,
    noise: bool = False,
    leak: bool = False,
    workspace_id: str = "ws-synthetic",
):
    """
    Each task gets latent drivers (postponements, overdue work, workload
    under a short lead time, priority); with `signal` > 0 they determine
    P(late) through a logistic link. With
    `noise` the label ignores all features. With `leak` one feature
    (comment_count) is a direct copy of the label: a planted leakage trap.
    """
    rng = np.random.default_rng(seed)
    observed_at = START + timedelta(days=days)
    rows = []
    for i in range(n_tasks):
        task_id = f"{workspace_id}-task-{i}"
        project_id = f"{workspace_id}-project-{i % 7}"
        created = START + timedelta(hours=float(rng.uniform(0, days * 24)))
        lead_days = float(rng.uniform(3, 30))
        deadline = created + timedelta(days=lead_days)
        if deadline > observed_at:
            continue  # outcome not observable yet: no labelled rows (as in the backend)
        priority = int(rng.integers(0, 4))
        workload = int(rng.poisson(4))
        overdue = int(rng.poisson(0.6))
        postpones = int(rng.poisson(0.5))
        # Mostly drivers the simple baseline does not see (postponements,
        # overdue work) plus a non-linear interaction (heavy workload with a
        # short lead time), so recovering the signal requires the candidate.
        crunch = float(workload >= 6 and lead_days < 10)
        z = -0.6 + signal * (
            1.0 * postpones + 0.8 * overdue + 1.5 * crunch + 0.1 * (workload - 4) - 0.2 * (priority - 1.5)
        )
        late = rng.random() < (0.35 if noise else 1 / (1 + np.exp(-z)))
        label = int(late)

        step = 2
        snapshots = max(1, min(12, int(lead_days // step)))
        for k in range(snapshots):
            as_of = created + timedelta(days=1 + k * step)
            if as_of >= deadline:
                break
            progress = k / max(1, snapshots - 1)
            status = "TODO" if progress < 0.3 else ("IN_PROGRESS" if progress < 0.8 else "IN_REVIEW")
            comments = int(rng.poisson(1 + 2 * progress))
            features = {
                "hours_to_deadline": (deadline - as_of).total_seconds() / 3600,
                "deadline_is_date_only": 1.0,
                "task_age_hours": (as_of - created).total_seconds() / 3600,
                "deadline_lead_hours": lead_days * 24,
                "status_todo": float(status == "TODO"),
                "status_in_progress": float(status == "IN_PROGRESS"),
                "status_in_review": float(status == "IN_REVIEW"),
                "hours_in_status": float(rng.uniform(1, 48)),
                "status_change_count": float(0 if status == "TODO" else (1 if status == "IN_PROGRESS" else 2)),
                "reopen_count": 0.0,
                "due_date_change_count": float(postpones),
                "postpone_count": float(postpones),
                "has_assignee": 1.0,
                "assignee_change_count": float(rng.poisson(0.3)),
                "assignee_open_tasks": float(workload),
                "assignee_overdue_tasks": float(overdue),
                "comment_count": float(label * 50 + rng.integers(0, 2)) if leak else float(comments),
                "comments_last_7d": float(min(comments, rng.poisson(1))),
                "events_last_7d": float(rng.poisson(3)),
                "hours_since_last_event": float(rng.uniform(0, 72)),
                "priority": float(priority),
            }
            assert list(features) == FEATURE_NAMES
            rows.append(
                {
                    "taskId": task_id,
                    "projectId": project_id,
                    "asOf": as_of.isoformat(),
                    "label": label,
                    "features": features,
                }
            )
    return rows
