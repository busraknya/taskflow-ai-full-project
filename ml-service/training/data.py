import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Sequence

import numpy as np


class InvalidTrainingData(ValueError):
    pass


@dataclass
class Dataset:
    X: np.ndarray
    y: np.ndarray
    task_ids: np.ndarray
    project_ids: np.ndarray
    as_of: np.ndarray  # POSIX seconds
    deadline: np.ndarray  # POSIX seconds
    feature_names: List[str]

    def __len__(self):
        return len(self.y)

    def subset(self, mask: np.ndarray) -> "Dataset":
        return Dataset(
            self.X[mask],
            self.y[mask],
            self.task_ids[mask],
            self.project_ids[mask],
            self.as_of[mask],
            self.deadline[mask],
            self.feature_names,
        )

    def task_weights(self) -> np.ndarray:
        """Each task counts once, however many daily snapshots it has."""
        _, inverse, counts = np.unique(self.task_ids, return_inverse=True, return_counts=True)
        return 1.0 / counts[inverse]


def parse_time(value: str) -> float:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise InvalidTrainingData(f"timestamp without time zone: {value}")
    return parsed.timestamp()


def load_rows(rows: Sequence[Dict], feature_names: List[str]) -> Dataset:
    """
    Rows produced by the backend's buildTrainingRows: taskId, projectId,
    asOf (ISO 8601), label (0/1) and features (exactly the contracted names).
    """
    if not rows:
        raise InvalidTrainingData("no training rows")
    expected = set(feature_names)
    X, y, tasks, projects, as_of, deadline = [], [], [], [], [], []
    for row in rows:
        features = row.get("features") or {}
        if set(features) != expected:
            raise InvalidTrainingData("row features do not match the feature spec")
        values = [float(features[name]) for name in feature_names]
        if not all(math.isfinite(v) for v in values):
            raise InvalidTrainingData("non-finite feature value")
        if row.get("label") not in (0, 1):
            raise InvalidTrainingData("label must be 0 or 1")
        t = parse_time(row["asOf"])
        X.append(values)
        y.append(int(row["label"]))
        tasks.append(str(row["taskId"]))
        projects.append(str(row["projectId"]))
        as_of.append(t)
        deadline.append(t + features["hours_to_deadline"] * 3600.0)
    return Dataset(
        np.asarray(X, dtype=float),
        np.asarray(y, dtype=int),
        np.asarray(tasks),
        np.asarray(projects),
        np.asarray(as_of, dtype=float),
        np.asarray(deadline, dtype=float),
        list(feature_names),
    )


@dataclass
class TemporalSplit:
    fit: Dataset
    calibration: Dataset
    test: Dataset
    summary: Dict


def _task_bounds(ds: Dataset):
    first, last_deadline = {}, {}
    for task, t, d in zip(ds.task_ids, ds.as_of, ds.deadline):
        first[task] = min(first.get(task, t), t)
        last_deadline[task] = max(last_deadline.get(task, d), d)
    return first, last_deadline


def temporal_split(ds: Dataset, test_days: int, calibration_fraction: float) -> TemporalSplit:
    """
    Expanding-window split by task. Test: tasks first seen in the last
    `test_days`. Training: tasks whose every deadline, and so every label,
    was known before the test period. The latest part of the training period
    is held out for calibration and threshold selection under the same rule.
    Tasks that straddle a boundary are dropped, so no task is in two sets and
    no training label depends on the future.
    """
    first, last_deadline = _task_bounds(ds)
    end = float(ds.as_of.max())
    test_cutoff = end - test_days * 86400.0
    test_tasks = {t for t, f in first.items() if f >= test_cutoff}
    pool = sorted(
        (t for t, d in last_deadline.items() if d <= test_cutoff and t not in test_tasks),
        key=lambda t: first[t],
    )
    if pool:
        index = min(len(pool) - 1, int(len(pool) * (1 - calibration_fraction)))
        calibration_cutoff = first[pool[index]]
    else:
        calibration_cutoff = test_cutoff
    calibration_tasks = {t for t in pool if first[t] >= calibration_cutoff}
    fit_tasks = {t for t in pool if last_deadline[t] <= calibration_cutoff}

    def mask(tasks):
        return np.isin(ds.task_ids, list(tasks)) if tasks else np.zeros(len(ds), dtype=bool)

    used = fit_tasks | calibration_tasks | test_tasks
    iso = lambda t: datetime.fromtimestamp(t, tz=timezone.utc).isoformat()  # noqa: E731
    summary = {
        "tasks": len(first),
        "fitTasks": len(fit_tasks),
        "calibrationTasks": len(calibration_tasks),
        "testTasks": len(test_tasks),
        "droppedTasks": len(first) - len(used),
        "dataStart": iso(float(ds.as_of.min())),
        "dataEnd": iso(end),
        "calibrationCutoff": iso(calibration_cutoff),
        "testCutoff": iso(test_cutoff),
    }
    return TemporalSplit(
        ds.subset(mask(fit_tasks)),
        ds.subset(mask(calibration_tasks)),
        ds.subset(mask(test_tasks)),
        summary,
    )


def class_counts(ds: Dataset) -> Dict[str, float]:
    """
    Class balance in task units: each task has weight 1 spread over its
    snapshots. (Snapshots of one task can differ in label when its deadline
    changed between them.)
    """
    w = ds.task_weights()
    positive = float((w * ds.y).sum())
    total = float(w.sum())
    return {"tasks": round(total), "positive": round(positive, 2), "negative": round(total - positive, 2)}
