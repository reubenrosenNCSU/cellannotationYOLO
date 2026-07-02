# scripts/stardist_worker.py
"""
Standalone StarDist runner — invoked as a subprocess so TensorFlow never
shares a process with PyTorch/ultralytics. Do not import torch/ultralytics
here, directly or indirectly.
"""
import sys
import json
import argparse

# Import only after arg parsing so --help etc. doesn't pay the TF import cost,
# but before any real work.
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image_path', required=True)
    parser.add_argument('--model_path', required=True)
    parser.add_argument('--image_width', type=int, required=True)
    parser.add_argument('--image_height', type=int, required=True)
    parser.add_argument('--nucleus_diam_min', type=float, default=7)
    parser.add_argument('--nucleus_diam_max', type=float, default=17)
    parser.add_argument('--prob_thresh', type=float, default=0.479071463157368)
    parser.add_argument('--nms_thresh', type=float, default=0.3)
    parser.add_argument('--output_path', required=True,
                         help='Where to write the YOLO annotation string')
    args = parser.parse_args()

    from stardist_detect import stardist_detect_to_yolo  # imports TF, safe here

    try:
        yolo_string = stardist_detect_to_yolo(
            image_source=args.image_path,
            model_path=args.model_path,
            image_width=args.image_width,
            image_height=args.image_height,
            nucleus_diam_min=args.nucleus_diam_min,
            nucleus_diam_max=args.nucleus_diam_max,
            prob_thresh=args.prob_thresh,
            nms_thresh=args.nms_thresh,
        )
        with open(args.output_path, 'w') as f:
            f.write(yolo_string)
        sys.exit(0)
    except Exception as e:
        # Write error to stderr so the parent process can surface it
        print(f"STARDIST_WORKER_ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()