# scripts/run_train.py
import argparse
import os
from ultralytics import YOLO

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data',     required=True)
    parser.add_argument('--weights',  required=True)
    parser.add_argument('--epochs',   type=int, required=True)
    parser.add_argument('--project',  required=True)
    parser.add_argument('--name',     required=True)
    args = parser.parse_args()

    model = YOLO(args.weights)
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=640,
        batch=4,
        project=os.path.abspath(args.project),
        name=args.name,
        save=True,
        workers=0,
        amp=False,
        cache=False,
        plots=False,
        exist_ok=True,
        task='detect',   
    )

if __name__ == '__main__':
    main()