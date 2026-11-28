"""
Command line training for one workspace (the backend normally triggers
training through POST /train):
  python -m training.cli train --workspace <id> --rows rows.jsonl
  python -m training.cli rollback --workspace <id>
Rows are JSON lines produced by the backend's buildTrainingRows.
"""
import argparse
import json
import sys

from main import FEATURE_NAMES, FEATURE_SPEC_VERSION, MODELS_DIR
from .config import TrainingConfig
from .registry import ModelRegistry, RegistryError
from . import runner


def train(registry: ModelRegistry, workspace_id: str, rows, seed: int = 0, config=TrainingConfig()):
    return runner.train(registry, workspace_id, rows, FEATURE_NAMES, FEATURE_SPEC_VERSION, seed, config)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="training.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    t = sub.add_parser("train")
    t.add_argument("--workspace", required=True)
    t.add_argument("--rows", required=True)
    t.add_argument("--seed", type=int, default=0)
    r = sub.add_parser("rollback")
    r.add_argument("--workspace", required=True)
    args = parser.parse_args(argv)
    registry = ModelRegistry(MODELS_DIR)

    if args.command == "rollback":
        try:
            print(json.dumps({"active": registry.rollback(args.workspace)}))
        except RegistryError as error:
            print(json.dumps({"error": str(error)}), file=sys.stderr)
            return 1
        return 0
    with open(args.rows, encoding="utf-8") as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    report = train(registry, args.workspace, rows, seed=args.seed)
    print(json.dumps(report, indent=2))
    return 0 if report["decision"] == "promoted" else 2


if __name__ == "__main__":
    sys.exit(main())
