"""Export best.pt to ONNX FP32, quantize to static INT8, evaluate both, benchmark CPU.

INT8 uses ONNX Runtime static QDQ quantization, per-channel weights, calibrated on
train-split images only. Two variants: int8-full, and int8-fp32-head, which keeps
the detection head after each branch's last convolution (DFL decode, sigmoid,
concat) in FP32. Choose the variant on the val split, then report test once.
"""
import argparse
import json
import statistics
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static
from PIL import Image
from ultralytics import YOLO

from evaluate import evaluate_model

CALIBRATION_IMAGES = 100
BENCH_IMAGES = 100
WARMUP = 10


def letterbox(path, size=640):
    img = Image.open(path).convert("RGB")
    scale = size / max(img.size)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.BILINEAR)
    canvas = Image.new("RGB", (size, size), (114, 114, 114))
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
    return (np.asarray(canvas, dtype=np.float32) / 255.0).transpose(2, 0, 1)[None]


class Reader(CalibrationDataReader):
    """Loads one image at a time so calibration never holds every input in memory."""

    def __init__(self, paths, input_name):
        self.items = ({input_name: letterbox(p)} for p in paths)

    def get_next(self):
        return next(self.items, None)


def head_nodes(model_path):
    """Nodes from the first Concat that feeds the output onwards (DFL, sigmoid, concat)."""
    graph = onnx.load(str(model_path)).graph
    producers = {o: n for n in graph.node for o in n.output}
    head, stack = set(), [graph.output[0].name]
    while stack:
        node = producers.get(stack.pop())
        if node is None or node.name in head:
            continue
        if node.op_type == "Conv" and "dfl" not in node.name:  # stop at each branch's last conv
            continue
        head.add(node.name)
        stack.extend(node.input)
    return sorted(head)


def benchmark(model_path, paths):
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    opts.inter_op_num_threads = 1
    sess = ort.InferenceSession(str(model_path), opts, providers=["CPUExecutionProvider"])
    name = sess.get_inputs()[0].name
    inputs = [letterbox(p) for p in paths]
    for x in inputs[:WARMUP]:
        sess.run(None, {name: x})
    times = []
    for x in inputs:
        t0 = time.perf_counter()
        sess.run(None, {name: x})
        times.append((time.perf_counter() - t0) * 1000)
    times.sort()
    return {
        "median_ms": round(statistics.median(times), 2),
        "p95_ms": round(times[int(0.95 * len(times)) - 1], 2),
        "runs": len(times),
        "threads": 1,
        "size_mb": round(Path(model_path).stat().st_size / 1e6, 2),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, required=True)
    ap.add_argument("--run-dir", type=Path, required=True)
    ap.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1])
    ap.add_argument("--split", default="val")
    args = ap.parse_args()

    weights = args.run_dir / "train" / "weights"
    fp32 = weights / "best.onnx"
    if not fp32.exists():
        YOLO(str(weights / "best.pt")).export(format="onnx", imgsz=640, opset=17, simplify=True, dynamic=False)
    pre = weights / "best-pre.onnx"
    if not pre.exists():
        from onnxruntime.quantization.shape_inference import quant_pre_process
        quant_pre_process(str(fp32), str(pre))

    train_imgs = sorted((args.data_dir / "images" / "train").glob("*.jpg"))
    rng = np.random.default_rng(20261127)
    calib = [train_imgs[i] for i in rng.choice(len(train_imgs), CALIBRATION_IMAGES, replace=False)]
    input_name = ort.InferenceSession(str(pre), providers=["CPUExecutionProvider"]).get_inputs()[0].name

    variants = {"int8-full": [], "int8-fp32-head": head_nodes(pre)}
    paths = {"fp32": fp32}
    for name, exclude in variants.items():
        out = weights / f"best-{name}.onnx"
        if not out.exists():
            quantize_static(
                str(pre), str(out), Reader(calib, input_name),
                quant_format=QuantFormat.QDQ, per_channel=True,
                activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8,
                nodes_to_exclude=exclude,
                # reduce activation ranges every 7 images instead of storing all of them; ORT
                # raises "No data is collected" when the image count divides evenly (100 / 10)
                extra_options={"CalibMaxIntermediateOutputs": 7},
            )
        paths[name] = out

    manifest = args.output_dir / "split-manifest.csv"
    bench_imgs = sorted((args.data_dir / "images" / args.split).glob("*.jpg"))[:BENCH_IMAGES]
    report = {"split": args.split, "calibration_images": CALIBRATION_IMAGES,
              "head_nodes_kept_fp32": len(variants["int8-fp32-head"]), "models": {}}
    for name, path in paths.items():
        metrics = evaluate_model(path, args.data_dir, manifest, args.split, "cpu")
        metrics["benchmark"] = benchmark(path, bench_imgs)
        report["models"][name] = metrics
    out = args.output_dir / f"quantization-{args.split}.json"
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: {m: v[m] for m in ("mAP50", "photo_accuracy", "benchmark")}
                      for k, v in report["models"].items()}, indent=2))


if __name__ == "__main__":
    main()
