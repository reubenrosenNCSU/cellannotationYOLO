"""
scripts/sahi_detect.py — Shared SAHI detection helper.

Used by all detection endpoints to replace the
split_image → detect_tiles_in_batch → merge_annotations pipeline.
"""

import math
import time
from PIL import Image
from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction


# Cache loaded models so repeated endpoint calls don't reload weights
_model_cache: dict = {}


def get_model(model_path: str, threshold: float, device: str = "cuda:0") -> AutoDetectionModel:
    """
    Returns a cached AutoDetectionModel for the given path + threshold.
    Reloads if threshold changes (confidence is baked into the model wrapper).
    """
    key = (model_path, threshold)
    if key not in _model_cache:
        _model_cache[key] = AutoDetectionModel.from_pretrained(
            model_type="ultralytics",
            model_path=model_path,
            confidence_threshold=threshold,
            device=device,
        )
    return _model_cache[key]


def run_detection(
    image_path: str,
    model_path: str,
    threshold: float = 0.5,
    slice_size: int = 640,
    overlap: float = 0.2,
    device: str = "cuda:0",
) -> list:
    """
    Runs SAHI sliced inference and returns a list of raw prediction objects.

    Args:
        image_path:  Path to the (preprocessed) image to run detection on.
        model_path:  Path to the YOLO .pt weights file.
        threshold:   Confidence threshold (0.0 – 1.0).
        slice_size:  Tile size in pixels (height and width).
        overlap:     Fractional overlap between tiles (e.g. 0.2 = 20%).
        device:      Torch device string — "cuda:0" or "cpu".

    Returns:
        List of sahi ObjectPrediction objects.
    """
    with Image.open(image_path) as img:
        img_w, img_h = img.size

    stride = int(slice_size * (1 - overlap))
    tiles_x = math.ceil(img_w / stride)
    tiles_y = math.ceil(img_h / stride)
    print(f"[SAHI] Image       : {img_w} x {img_h} px")
    print(f"[SAHI] Tile size   : {slice_size}px  Overlap: {int(overlap*100)}%  Stride: {stride}px")
    print(f"[SAHI] Tiles       : {tiles_x} x {tiles_y} = {tiles_x * tiles_y} total")
    print(f"[SAHI] Model       : {model_path}")
    print(f"[SAHI] Threshold   : {threshold}  Device: {device}")
    print(f"[SAHI] Running...")

    model = get_model(model_path, threshold, device)
    t0 = time.time()

    result = get_sliced_prediction(
        image=image_path,
        detection_model=model,
        slice_height=slice_size,
        slice_width=slice_size,
        overlap_height_ratio=overlap,
        overlap_width_ratio=overlap,
        perform_standard_pred=False,
        postprocess_type="NMM",
        postprocess_match_threshold=0.5,
        verbose=1,  # SAHI's own per-tile progress bar
    )

    elapsed = time.time() - t0
    n = len(result.object_prediction_list)
    print(f"[SAHI] Done        : {n} detections in {elapsed:.1f}s ({n/elapsed:.1f}/s)")

    return result.object_prediction_list


def predictions_to_yolo(predictions: list, image_width: int, image_height: int) -> str:
    """
    Converts SAHI predictions to a YOLO-format annotation string.

    Each line: <class_id> <x_center> <y_center> <width> <height>
    All values normalised to [0, 1] against the provided image dimensions.

    Args:
        predictions:   List returned by run_detection().
        image_width:   Width of the detection image in pixels.
        image_height:  Height of the detection image in pixels.

    Returns:
        Multiline string ready to write to a .txt file.
    """
    lines = []
    for obj in predictions:
        bbox = obj.bbox
        x_center = ((bbox.minx + bbox.maxx) / 2) / image_width
        y_center = ((bbox.miny + bbox.maxy) / 2) / image_height
        width    = (bbox.maxx - bbox.minx) / image_width
        height   = (bbox.maxy - bbox.miny) / image_height
        lines.append(
            f"{obj.category.id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}"
        )
    return "\n".join(lines)


def detect_to_yolo(
    image_path: str,
    model_path: str,
    image_width: int,
    image_height: int,
    threshold: float = 0.5,
    slice_size: int = 640,
    overlap: float = 0.2,
    device: str = "cuda:0",
) -> str:
    """
    Convenience wrapper — runs detection and returns a YOLO annotation string.
    This is what most endpoints will call directly.

    Args:
        image_path:    Path to the (preprocessed) image.
        model_path:    Path to the YOLO .pt weights file.
        image_width:   Detection image width (from preprocess_image det_w).
        image_height:  Detection image height (from preprocess_image det_h).
        threshold:     Confidence threshold.
        slice_size:    Tile size in pixels.
        overlap:       Tile overlap fraction.
        device:        Torch device string.

    Returns:
        YOLO-format annotation string.
    """
    predictions = run_detection(image_path, model_path, threshold, slice_size, overlap, device)
    return predictions_to_yolo(predictions, image_width, image_height)