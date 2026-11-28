"""Evaluate a Flower Recognition v1 model (PyTorch .pt or ONNX) on one split.

Reports detection metrics (mAP50, mAP50-95, per-class AP50) and the product metric:
photo-level class accuracy, where the prediction is the class of the
highest-confidence detection at conf >= 0.25 and no detection counts as wrong.
"""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path

from ultralytics import YOLO

CLASSES = ["rose", "sunflower", "lily", "lavender", "other_flower"]
CONF = 0.25


def load_truth(manifest, split):
    with open(manifest, newline="") as f:
        return {r["image_id"]: r["primary_class"] for r in csv.DictReader(f) if r["split"] == split}


def evaluate_model(model_path, data_dir, manifest, split, device):
    model = YOLO(str(model_path), task="detect")
    val = model.val(
        data=str(data_dir / "data.yaml"), split=split, imgsz=640, batch=1 if str(model_path).endswith(".onnx") else 4,
        device=device, plots=False, verbose=False,
        project=str(Path(model_path).parent / "val"), name=split, exist_ok=True,
    )
    ap50 = {CLASSES[int(c)]: round(float(val.box.ap50[k]), 4) for k, c in enumerate(val.box.ap_class_index)}

    truth = load_truth(manifest, split)
    paths = [str(data_dir / "images" / split / f"{i}.jpg") for i in sorted(truth)]
    confusion = Counter()
    correct = 0
    for path, result in zip(paths, model.predict(paths, conf=CONF, imgsz=640, device=device, stream=True, verbose=False)):
        image_id = Path(path).stem
        boxes = result.boxes
        pred = CLASSES[int(boxes.cls[int(boxes.conf.argmax())])] if len(boxes) else "none"
        confusion[(truth[image_id], pred)] += 1
        correct += pred == truth[image_id]
    per_class = {}
    for cls in CLASSES:
        n = sum(v for (t, _), v in confusion.items() if t == cls)
        per_class[cls] = {"images": n, "accuracy": round(confusion[(cls, cls)] / n, 4) if n else None}
    return {
        "model": Path(model_path).name,
        "split": split,
        "mAP50": round(float(val.box.map50), 4),
        "mAP50_95": round(float(val.box.map), 4),
        "precision": round(float(val.box.mp), 4),
        "recall": round(float(val.box.mr), 4),
        "ap50_per_class": ap50,
        "photo_accuracy": round(correct / len(paths), 4),
        "photo_images": len(paths),
        "photo_per_class": per_class,
        "confusion": [[t, p, n] for (t, p), n in sorted(confusion.items())],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, required=True)
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1])
    ap.add_argument("--split", default="test")
    args = ap.parse_args()
    # CPU on purpose: evaluating on MPS right after training exhausted memory on an
    # 8 GB M2 and restarted the machine.
    device = "cpu"
    best = args.run_dir / "train" / "weights" / "best.pt"
    result = evaluate_model(best, args.data_dir, args.output_dir / "split-manifest.csv", args.split, device)
    out = args.output_dir / f"metrics-pytorch-{args.split}.json"
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
