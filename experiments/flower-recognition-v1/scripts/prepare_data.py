"""Build the YOLO dataset for Flower Recognition v1 from Open Images V7 val + test.

Writes images (long side 640 px) and YOLO labels under --data-dir, plus
dataset-summary.json and split-manifest.csv (image IDs only) under --output-dir.
"""
import argparse
import csv
import io
import json
import random
import time
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

CLASSES = ["rose", "sunflower", "lily", "lavender", "other_flower"]
SPECIES = {"/m/06m11": 0, "/m/0ftb8": 1, "/m/0jqgx": 2, "/m/04gth": 3}
FLOWER = "/m/0c9ph5"
SEED = 20261127
GENERIC_SAMPLE = 700
SPLITS = (("train", 0.70), ("val", 0.15), ("test", 0.15))
S3 = "https://open-images-dataset.s3.amazonaws.com/{subset}/{image_id}.jpg"


def iou(a, b):
    ix = max(0.0, min(a[1], b[1]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[2], b[2]))
    inter = ix * iy
    union = (a[1] - a[0]) * (a[3] - a[2]) + (b[1] - b[0]) * (b[3] - b[2]) - inter
    return inter / union if union > 0 else 0.0


def read_boxes(oi_dir):
    """Return {image_id: {"subset": s, "species": [(cls, box)], "flower": [box]}}."""
    images = defaultdict(lambda: {"species": [], "flower": [], "depiction_dropped": 0})
    for subset in ("validation", "test"):
        with open(oi_dir / f"{subset}-annotations-bbox.csv", newline="") as f:
            for row in csv.DictReader(f):
                label = row["LabelName"]
                if label not in SPECIES and label != FLOWER:
                    continue
                entry = images[row["ImageID"]]
                entry["subset"] = subset
                if row["IsDepiction"] == "1":
                    entry["depiction_dropped"] += 1
                    continue
                box = tuple(float(row[k]) for k in ("XMin", "XMax", "YMin", "YMax"))
                if label in SPECIES:
                    entry["species"].append((SPECIES[label], box))
                else:
                    entry["flower"].append(box)
    return images


def to_labels(entry):
    """Species boxes, plus generic flower boxes that overlap no species box."""
    labels = list(entry["species"])
    for box in entry["flower"]:
        if all(iou(box, sbox) < 0.5 for _, sbox in entry["species"]):
            labels.append((4, box))
    return labels


def primary_class(labels):
    area = Counter()
    for cls, (x0, x1, y0, y1) in labels:
        area[cls] += (x1 - x0) * (y1 - y0)
    return area.most_common(1)[0][0]


def read_meta(oi_dir, wanted):
    meta = {}
    for subset in ("validation", "test"):
        with open(oi_dir / f"{subset}-images-with-rotation.csv", newline="") as f:
            for row in csv.DictReader(f):
                if row["ImageID"] in wanted:
                    rot = row["Rotation"].strip()
                    meta[row["ImageID"]] = {
                        "license": row["License"],
                        "rotation": int(float(rot)) if rot else 0,
                    }
    return meta


def fetch(job):
    image_id, subset, out_path = job
    if out_path.exists():
        return image_id, True
    for attempt in range(3):
        try:
            with urllib.request.urlopen(S3.format(subset=subset, image_id=image_id), timeout=30) as r:
                # Boxes are relative to the stored file, so the Rotation column is not
                # applied (checked visually on rotated images; rotating misaligns boxes).
                img = Image.open(io.BytesIO(r.read())).convert("RGB")
            img.thumbnail((640, 640))
            img.save(out_path, quality=90)
            return image_id, True
        except Exception:
            time.sleep(1 + attempt)
    return image_id, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--oi-dir", type=Path, required=True)
    ap.add_argument("--data-dir", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1])
    args = ap.parse_args()

    images = read_boxes(args.oi_dir)
    labelled = {}
    for image_id, entry in images.items():
        labels = to_labels(entry)
        if labels:
            labelled[image_id] = (entry["subset"], labels)

    rng = random.Random(SEED)
    species_ids = sorted(i for i, (_, l) in labelled.items() if any(c < 4 for c, _ in l))
    generic_ids = sorted(i for i, (_, l) in labelled.items() if all(c == 4 for c, _ in l))
    chosen = species_ids + rng.sample(generic_ids, GENERIC_SAMPLE)
    meta = read_meta(args.oi_dir, set(chosen))

    by_primary = defaultdict(list)
    for image_id in chosen:
        by_primary[primary_class(labelled[image_id][1])].append(image_id)
    split_of = {}
    for cls in sorted(by_primary):
        ids = by_primary[cls]
        rng.shuffle(ids)
        n_train = round(len(ids) * SPLITS[0][1])
        n_val = round(len(ids) * SPLITS[1][1])
        for k, image_id in enumerate(ids):
            split_of[image_id] = "train" if k < n_train else "val" if k < n_train + n_val else "test"

    for split, _ in SPLITS:
        (args.data_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (args.data_dir / "labels" / split).mkdir(parents=True, exist_ok=True)
    jobs = [
        (i, labelled[i][0], args.data_dir / "images" / split_of[i] / f"{i}.jpg")
        for i in chosen
    ]
    with ThreadPoolExecutor(16) as pool:
        ok = dict(pool.map(fetch, jobs))

    manifest, counts = [], defaultdict(Counter)
    for image_id in chosen:
        if not ok[image_id]:
            continue
        split = split_of[image_id]
        labels = labelled[image_id][1]
        lines = []
        for cls, (x0, x1, y0, y1) in labels:
            lines.append(f"{cls} {(x0 + x1) / 2:.6f} {(y0 + y1) / 2:.6f} {x1 - x0:.6f} {y1 - y0:.6f}")
            counts[split][f"boxes_{CLASSES[cls]}"] += 1
        (args.data_dir / "labels" / split / f"{image_id}.txt").write_text("\n".join(lines) + "\n")
        primary = CLASSES[primary_class(labels)]
        counts[split][f"images_primary_{primary}"] += 1
        counts[split]["images"] += 1
        manifest.append((image_id, labelled[image_id][0], split, primary))

    (args.data_dir / "data.yaml").write_text(
        f"path: {args.data_dir.resolve()}\ntrain: images/train\nval: images/val\ntest: images/test\n"
        + "names:\n" + "".join(f"  {k}: {n}\n" for k, n in enumerate(CLASSES))
    )
    with open(args.output_dir / "split-manifest.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["image_id", "open_images_subset", "split", "primary_class"])
        w.writerows(sorted(manifest, key=lambda r: (r[2], r[0])))
    licences = Counter(meta[i]["license"] for i, *_ in manifest)
    summary = {
        "seed": SEED,
        "classes": CLASSES,
        "source": "Open Images V7 validation + test boxes; depiction boxes dropped",
        "species_images_in_pool": len(species_ids),
        "generic_only_images_in_pool": len(generic_ids),
        "generic_only_sampled": GENERIC_SAMPLE,
        "download_failures": sum(1 for v in ok.values() if not v),
        "depiction_boxes_dropped": sum(images[i]["depiction_dropped"] for i in chosen),
        "images_with_rotation_metadata_not_applied": sum(1 for i in chosen if meta[i]["rotation"]),
        "image_licences": dict(licences),
        "splits": {s: dict(sorted(c.items())) for s, c in counts.items()},
    }
    (args.output_dir / "dataset-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
