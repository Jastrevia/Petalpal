# Flower Recognition v1 — YOLO11n photo-to-garden feasibility

Independent experiment. It tests whether a small on-device detector could power a
future Garden feature: the owner photographs a real flower, and a matching flower
grows in their Garden. Nothing here is connected to the app, the backend or any
user data, and no production behaviour changes.

## Product question

1. Can a nano-size detector name the flower in an everyday photo often enough that
   the Garden would plant the right flower?
2. Can the model be made small and fast enough to run on the phone, so the photo
   never has to leave the device?

## Classes

Open Images V7 has boxed classes for four flower species plus a generic flower:

| id | class | Open Images label |
|---:|---|---|
| 0 | rose | Rose `/m/06m11` |
| 1 | sunflower | Common sunflower `/m/0ftb8` |
| 2 | lily | Lily `/m/0jqgx` |
| 3 | lavender | Lavender (Plant) `/m/04gth` |
| 4 | other_flower | Flower `/m/0c9ph5`, only where no species box overlaps it (IoU < 0.5) |

`other_flower` maps to a generic bloom in the product idea; the four species would
each map to their own Garden flower. Mapping species to Garden art is a later design
task and is not decided here.

## Data

- Source pool: the human-verified Open Images V7 **validation and test** splits only
  (the 2.3 GB train box file does not fit this machine). Every species image in the
  pool is used, plus a fixed random sample of generic-flower-only images.
- Split by image, stratified by each image's primary class (largest total box area),
  70 / 15 / 15 train / val / test, seed 20261127. The test split is touched once, for
  the final evaluation below.
- Images are resized so the long side is 640 px and stored outside the repository.
  Only image IDs, split membership and per-image licence counts are committed.

## Pre-registered gates (written before training)

| Gate | Pass rule |
|---|---|
| G1 product accuracy | Photo-level class accuracy ≥ 0.80 on the held-out test split. The prediction is the class of the highest-confidence detection at conf ≥ 0.25; no detection counts as wrong. The truth is the image's primary class. |
| G2 INT8 parity | ONNX INT8 keeps test mAP50 within 0.02 and photo-level accuracy within 2 points of ONNX FP32. |
| G3 on-device proxy | INT8 model file ≤ 5 MB and median single-thread CPU latency ≤ 100 ms at 640 px on the development laptop (Apple M2). This is a laptop proxy, not a phone measurement. |

A model that fails any gate is not a production candidate. Even if all pass, the
items under "Before any product use" still block integration.

## Run

Python 3.12; versions in `requirements.txt`.

```bash
python scripts/prepare_data.py --oi-dir <open-images-csv-dir> --data-dir <dataset-dir>
python scripts/train.py --data-dir <dataset-dir> --run-dir <run-dir>
python scripts/evaluate.py --data-dir <dataset-dir> --run-dir <run-dir> --output-dir .
python scripts/quantize_benchmark.py --data-dir <dataset-dir> --run-dir <run-dir> --output-dir . --split val
python scripts/quantize_benchmark.py --data-dir <dataset-dir> --run-dir <run-dir> --output-dir . --split test
```

Keep `<dataset-dir>` and `<run-dir>` in a folder that survives restarts, not `/tmp`.
On an 8 GB machine, train at batch 4 (the default) and let evaluation run on CPU.
Results and the gate verdict are in [RESULTS.md](RESULTS.md).

`<open-images-csv-dir>` holds `validation-annotations-bbox.csv`,
`test-annotations-bbox.csv`, `validation-images-with-rotation.csv` and
`test-images-with-rotation.csv` from the official Open Images download page.

## Rights and licences

- Open Images annotations: CC BY 4.0 (Google). Images: listed by Open Images as
  CC BY 2.0 Flickr photos; `prepare_data.py` records the licence URL of every image it
  uses and the counts are in `dataset-summary.json`. Per-image attribution would be
  required before any image is shown or redistributed.
- Ultralytics YOLO11 code and weights: AGPL-3.0. Fine for this internal experiment.
  Shipping the model in the app would need an Ultralytics Enterprise licence or a
  switch to a permissively licensed detector.
- No PetalPal user content is used anywhere in this experiment.

## Before any product use

Not done here, and each needs its own decision: detector licence, Garden art for each
class, camera permission and privacy copy, on-device runtime in the Expo app, a real
phone benchmark, and an evaluation on photos that look like what owners would take.
