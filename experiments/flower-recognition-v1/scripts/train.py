"""Fine-tune YOLO11n (COCO-pretrained) on the Flower Recognition v1 train split.

Model selection uses the val split only; the test split is never read here.
"""
import argparse
import os
from pathlib import Path

import torch
from ultralytics import YOLO

SEED = 20261127


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, required=True)
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch", type=int, default=4)  # batch 16 swapped heavily on an 8 GB M2
    args = ap.parse_args()

    args.run_dir.mkdir(parents=True, exist_ok=True)
    os.chdir(args.run_dir)  # starter weights download here, outside the repository
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = YOLO("yolo11n.pt")
    model.train(
        data=str(args.data_dir.resolve() / "data.yaml"),
        epochs=args.epochs,
        patience=15,
        imgsz=640,
        batch=args.batch,
        device=device,
        workers=2,
        seed=SEED,
        deterministic=True,
        project=str(args.run_dir.resolve()),
        name="train",
        exist_ok=True,
        plots=True,
    )


if __name__ == "__main__":
    main()
