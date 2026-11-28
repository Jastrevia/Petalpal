# Flower Recognition v1 — results

YOLO11n (COCO-pretrained, 2.6 M parameters) fine-tuned for 40 epochs on 1,366
Open Images photos; selected on 292 val photos; scored once on 294 held-out test
photos. Gates are the ones written in `README.md` before training.

## Verdict

| Gate | Rule | Result | |
|---|---|---|---|
| G1 product accuracy | test photo accuracy ≥ 0.80 | **0.738** (PyTorch), 0.745 (INT8) | **FAIL** |
| G2 INT8 parity | test mAP50 within 0.02, photo accuracy within 2 points of ONNX FP32 | mAP50 −0.016, photo accuracy +0.7 points | PASS |
| G3 on-device proxy | INT8 ≤ 5 MB and median ≤ 100 ms, 1 CPU thread, M2 laptop | 3.26 MB, 43.5 ms | PASS (laptop proxy only) |

**Not a production candidate.** The model is small and fast enough for a phone,
but it names the right flower in about three photos out of four, short of the
four-in-five target. Production is unchanged and nothing is connected to the app.

## Accuracy (test split, 294 photos)

| Model | mAP50 | mAP50-95 | Photo accuracy |
|---|---:|---:|---:|
| PyTorch FP32 (`best.pt`) | 0.403 | 0.323 | 0.738 |
| ONNX FP32 | 0.412 | 0.335 | 0.738 |
| ONNX INT8, FP32 head | 0.396 | 0.317 | 0.745 |
| ONNX INT8, whole graph | 0.000 | 0.000 | 0.000 |

PyTorch and ONNX FP32 reach the same photo accuracy; their mAP differs slightly
because PyTorch validation batches 4 images (letterbox padding differs) and ONNX
runs one at a time.

Per class, test split, ONNX FP32 → INT8 (FP32 head):

| Class | Test photos | AP50 | Photo accuracy |
|---|---:|---:|---:|
| rose | 54 | 0.386 → 0.364 | 0.852 → 0.833 |
| sunflower | 13 | 0.620 → 0.596 | 0.692 → 0.692 |
| lily | 50 | 0.460 → 0.442 | 0.800 → 0.820 |
| lavender | 42 | 0.221 → 0.217 | 0.833 → 0.833 |
| other_flower | 135 | 0.373 → 0.363 | 0.644 → 0.659 |

The three species with enough test photos (rose, lily, lavender) each reach 0.80
photo accuracy. The miss comes from `other_flower` (0.64), which is 46% of the test
set, and from sunflower, which has only 13 test photos (one photo = 7.7 points).
Lavender has the lowest AP50 because it grows in dense patches boxed as groups;
the model finds lavender in the photo but not each annotated box.

## Error analysis

PyTorch confusion on test (truth → prediction, count): the largest error is
`other_flower → rose` (22), then `other_flower → lavender` (10), `lily →
other_flower` (7), `other_flower → none` (7) and `lavender → other_flower` (6).

`other_flower` is a noisy class by construction: a generic Open Images "Flower" box
is only kept as `other_flower` when no species box overlaps it, but Open Images
draws species boxes only where annotators checked for that species. A contact sheet
of the `other_flower` test photos whose top prediction was rose (24 in a
single-image re-run) showed about 10 that look like roses by eye: rose gardens,
rose bushes, a rose wreath. This is an unblinded visual check by the experimenter,
not a relabelling, so the official numbers above are unchanged. Counting those 10
as correct would give about 0.77, still below the gate.

## Quantization

ONNX Runtime static QDQ quantization, per-channel INT8 weights, UInt8 activations,
MinMax calibration on 100 train-split photos.

- **Whole-graph INT8 collapses to zero.** YOLO's output tensor concatenates box
  coordinates (0–640 px) and class scores (0–1); one shared INT8 scale cannot hold
  both, so every score rounds to zero.
- **Keeping the 24-node detection head in FP32** (DFL box decode, sigmoid and final
  concat, after each branch's last convolution) restores accuracy. This variant was
  chosen on the val split before test was scored.

On val the same variant lost 0.028 mAP50 (0.481 → 0.453) with identical photo
accuracy (0.719); on test it lost 0.016. G2 is defined on test and passes there,
but the val drop shows the margin is thin.

## Size and speed

ONNX Runtime 1.32, CPU execution provider, one intra-op thread, 640 × 640 input,
model call only (no image decoding or NMS), 10 warm-ups then 100 test photos,
Apple M2 MacBook Air.

| Model | File | Median | P95 |
|---|---:|---:|---:|
| ONNX FP32 | 10.67 MB | 105.1 ms | 105.7 ms |
| ONNX INT8, FP32 head | 3.26 MB | 43.5 ms | 46.4 ms |

INT8 is 3.3× smaller and 2.4× faster. A laptop CPU is not a phone: a real
iPhone or Android measurement (Core ML or TFLite in the Expo app) is still needed.

## Reproducibility

- Training was run twice with the same seed and data. The first run's weights were
  lost when the machine restarted during evaluation (MPS evaluation at batch 16 ran
  out of memory on the 8 GB laptop; outputs were in a temporary folder). The rerun's
  per-epoch val metrics are identical to the first run's in every column except
  wall time; `training-history.csv` is the rerun. Evaluation now runs on CPU.
- The dataset was rebuilt from the same CSVs and reproduced `split-manifest.csv` and
  `dataset-summary.json` byte for byte.
- Training used MPS, batch 4 (batch 16 swapped heavily on 8 GB), best val epoch 40
  (mAP50 0.486, mAP50-95 0.391).

## What would move G1

1. Clean `other_flower`: keep a generic photo only where Open Images image-level
   labels mark rose, sunflower, lily and lavender as verified absent.
2. More sunflower and lily photos: stream-filter the Open Images train box file
   instead of using only val + test.
3. Product framing: show the top two guesses and let the owner pick, so the model
   suggests rather than decides, in line with how the Garden keeps the owner's own
   choices in charge.

## Files

- `split-manifest.csv`, `dataset-summary.json`: data selection and licences
- `training-history.csv`: per-epoch training and val metrics
- `metrics-pytorch-test.json`: PyTorch test metrics and confusion
- `quantization-val.json`, `quantization-test.json`: FP32 / INT8 metrics and benchmarks
- Weights, ONNX files and images are kept outside the repository.
