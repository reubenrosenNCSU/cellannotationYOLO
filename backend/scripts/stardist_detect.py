import os
import numpy as np
from PIL import Image
from stardist.models import StarDist2D
from skimage.measure import regionprops
from csbdeep.utils import normalize

_model_cache: dict = {}

def get_model(model_path: str) -> StarDist2D:
    """
    Returns a cached StarDist2D model for the given path.
    """
    if model_path not in _model_cache:
        basedir = os.path.dirname(model_path)
        name = os.path.basename(model_path)
        _model_cache[model_path] = StarDist2D(None, name=name, basedir=basedir)
    return _model_cache[model_path]


def run_detection(
    image_source,
    model_path: str,
    prob_thresh: float = 0.479071463157368,
    nms_thresh: float = 0.3,
    n_tiles: tuple = (2, 2),
    norm_low: float = 1,
    norm_high: float = 99.8,
) -> list:
    """
    Runs StarDist prediction and returns a list of regionprops objects.
    """
    if isinstance(image_source, Image.Image):
        sd_img = np.array(image_source)
    else:
        sd_img = np.array(Image.open(image_source))

    sd_img = normalize(sd_img, norm_low, norm_high)

    model = get_model(model_path)
    labels, details = model.predict_instances(
        sd_img,
        axes='YX',
        n_tiles=n_tiles,
        prob_thresh=prob_thresh,
        nms_thresh=nms_thresh,
    )
    return labels


def filter_labels(labels, min_diam: float = 7, max_diam: float = 17):
    """
    Filters labels by equivalent diameter to remove false positives.
    """
    new_labels = np.zeros_like(labels)
    current_id = 1
    for prop in regionprops(labels):
        if min_diam <= prop.equivalent_diameter <= max_diam:
            new_labels[labels == prop.label] = current_id
            current_id += 1
    return new_labels


def predictions_to_yolo(labels, image_width: int, image_height: int) -> str:
    """
    Converts StarDist labels to YOLO-format annotation string,
    matching the output format of sahi_detect.predictions_to_yolo().
    """
    lines = []
    for prop in regionprops(labels):
        min_r, min_c, max_r, max_c = prop.bbox
        x_center = ((min_c + max_c) / 2) / image_width
        y_center = ((min_r + max_r) / 2) / image_height
        width    = (max_c - min_c) / image_width
        height   = (max_r - min_r) / image_height
        lines.append(
            f"0 {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f} 1.0000"
        )
    return "\n".join(lines)


def detect_to_yolo(
    image_source,
    model_path: str,
    image_width: int,
    image_height: int,
    prob_thresh: float = 0.479071463157368,
    nms_thresh: float = 0.3,
    n_tiles: tuple = (2, 2),
    nucleus_diam_min: float = 7,
    nucleus_diam_max: float = 17,
    norm_low: float = 1,
    norm_high: float = 99.8,
) -> str:
    """
    Convenience wrapper — runs detection and returns a YOLO annotation string.
    Drop-in equivalent of sahi_detect.detect_to_yolo().
    """
    labels = run_detection(image_source, model_path, prob_thresh, nms_thresh, n_tiles, norm_low, norm_high)
    filtered = filter_labels(labels, nucleus_diam_min, nucleus_diam_max)
    return predictions_to_yolo(filtered, image_width, image_height)