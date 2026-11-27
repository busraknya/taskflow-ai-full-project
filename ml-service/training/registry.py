import json
import os
import re
import shutil
import tempfile
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import joblib
import sklearn

WORKSPACE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MODEL_ID = re.compile(r"^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$")


class RegistryError(Exception):
    pass


def new_model_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + os.urandom(4).hex()


def _write_json_atomic(path: str, data) -> None:
    directory = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".tmp-")
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, sort_keys=True)
    os.replace(tmp, path)


class ModelRegistry:
    """
    Models per workspace under <root>/workspaces/<workspaceId>/:
      <modelId>/model.joblib, <modelId>/metadata.json  promoted models
      active.json                                      {"active", "history"}
      reports/<modelId>.json                           every training report
    Model files are trusted local artifacts written by this service only.
    """

    def __init__(self, root: str):
        self.root = root

    # ---------- paths ----------

    def _workspace_dir(self, workspace_id: str) -> str:
        if not WORKSPACE_ID.match(workspace_id or ""):
            raise RegistryError("invalid workspace id")
        return os.path.join(self.root, "workspaces", workspace_id)

    def _model_dir(self, workspace_id: str, model_id: str) -> str:
        if not MODEL_ID.match(model_id or ""):
            raise RegistryError("invalid model id")
        return os.path.join(self._workspace_dir(workspace_id), model_id)

    def _pointer(self, workspace_id: str) -> Dict:
        path = os.path.join(self._workspace_dir(workspace_id), "active.json")
        if not os.path.isfile(path):
            return {"active": None, "history": []}
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)

    # ---------- writes ----------

    def save_report(self, workspace_id: str, report: Dict) -> None:
        reports = os.path.join(self._workspace_dir(workspace_id), "reports")
        os.makedirs(reports, exist_ok=True)
        _write_json_atomic(os.path.join(reports, f"{report['modelVersion']}.json"), report)

    def promote(self, workspace_id: str, bundle, report: Dict, keep: int) -> str:
        """Stores a promoted bundle and makes it the active model."""
        if bundle.workspace_id != workspace_id:
            raise RegistryError("bundle belongs to another workspace")
        model_id = bundle.model_version
        directory = self._model_dir(workspace_id, model_id)
        os.makedirs(directory, exist_ok=False)
        joblib.dump(bundle, os.path.join(directory, "model.joblib"))
        _write_json_atomic(os.path.join(directory, "metadata.json"), report)
        self.save_report(workspace_id, report)
        pointer = self._pointer(workspace_id)
        history = [m for m in pointer["history"] if m != model_id] + [model_id]
        _write_json_atomic(
            os.path.join(self._workspace_dir(workspace_id), "active.json"),
            {"active": model_id, "history": history},
        )
        self._prune(workspace_id, keep)
        return model_id

    def rollback(self, workspace_id: str) -> str:
        """Activates the previously promoted model that is still stored."""
        pointer = self._pointer(workspace_id)
        history = pointer["history"]
        if pointer["active"] not in history or history.index(pointer["active"]) == 0:
            raise RegistryError("no earlier model to roll back to")
        previous = history[history.index(pointer["active"]) - 1]
        _write_json_atomic(
            os.path.join(self._workspace_dir(workspace_id), "active.json"),
            {"active": previous, "history": history},
        )
        return previous

    def deactivate(self, workspace_id: str) -> None:
        pointer = self._pointer(workspace_id)
        _write_json_atomic(
            os.path.join(self._workspace_dir(workspace_id), "active.json"),
            {"active": None, "history": pointer["history"]},
        )

    def delete_workspace(self, workspace_id: str) -> None:
        shutil.rmtree(self._workspace_dir(workspace_id), ignore_errors=True)

    def _prune(self, workspace_id: str, keep: int) -> None:
        pointer = self._pointer(workspace_id)
        history = pointer["history"]
        removed, kept = history[:-keep], history[-keep:]
        for model_id in removed:
            shutil.rmtree(self._model_dir(workspace_id, model_id), ignore_errors=True)
        if removed:
            _write_json_atomic(
                os.path.join(self._workspace_dir(workspace_id), "active.json"),
                {"active": pointer["active"], "history": kept},
            )

    # ---------- reads ----------

    def active_id(self, workspace_id: str) -> Optional[str]:
        return self._pointer(workspace_id)["active"]

    def history(self, workspace_id: str) -> List[str]:
        return list(self._pointer(workspace_id)["history"])

    def load(self, workspace_id: str, model_id: str) -> Tuple[object, Dict]:
        directory = self._model_dir(workspace_id, model_id)
        bundle = joblib.load(os.path.join(directory, "model.joblib"))
        with open(os.path.join(directory, "metadata.json"), encoding="utf-8") as handle:
            metadata = json.load(handle)
        if getattr(bundle, "workspace_id", None) != workspace_id:
            raise RegistryError("model metadata names another workspace")
        if getattr(bundle, "sklearn_version", None) != sklearn.__version__:
            raise RegistryError(
                f"model trained with scikit-learn {getattr(bundle, 'sklearn_version', '?')}, "
                f"service runs {sklearn.__version__}"
            )
        return bundle, metadata

    def load_active(self, workspace_id: str):
        model_id = self.active_id(workspace_id)
        if model_id is None:
            return None, None
        return model_id, self.load(workspace_id, model_id)[0]

    def workspace_ids(self) -> List[str]:
        base = os.path.join(self.root, "workspaces")
        if not os.path.isdir(base):
            return []
        return sorted(w for w in os.listdir(base) if WORKSPACE_ID.match(w))

    def metadata(self, workspace_id: str, model_id: str) -> Dict:
        path = os.path.join(self._model_dir(workspace_id, model_id), "metadata.json")
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)

    def workspaces_with_active_model(self) -> int:
        base = os.path.join(self.root, "workspaces")
        if not os.path.isdir(base):
            return 0
        count = 0
        for workspace_id in os.listdir(base):
            if WORKSPACE_ID.match(workspace_id) and self.active_id(workspace_id):
                count += 1
        return count
