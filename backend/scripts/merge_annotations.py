# merge_annotations.py

import os
import argparse

def merge_annotations(tiles_dir, output_file, tile_size=512, image_width=None, image_height=None):
    with open(output_file, 'w') as out:
        for file in os.listdir(tiles_dir):
            if file.endswith('.txt') and file.startswith("tile_"):
                # Parse coordinates from filename
                parts = file.replace(".txt", "").split('_')
                if len(parts) != 3:
                    continue
                x_offset = int(parts[1])
                y_offset = int(parts[2])

                # Inside the loop for each line in the .txt file
                with open(os.path.join(tiles_dir, file)) as f:
                    # Calculate the ACTUAL size of this specific tile
                    current_tile_w = min(tile_size, image_width - x_offset)
                    current_tile_h = min(tile_size, image_height - y_offset)

                    for line in f:
                        parts = line.strip().split()
                        cls, cx, cy, w, h = map(float, parts)

                        # 1. Denormalize relative to the current tile size
                        absolute_x = (cx * current_tile_w) + x_offset
                        absolute_y = (cy * current_tile_h) + y_offset
                        absolute_w = w * current_tile_w
                        absolute_h = h * current_tile_h

                        # 2. Normalize relative to the full image
                        cx_final = absolute_x / image_width
                        cy_final = absolute_y / image_height
                        w_final = absolute_w / image_width
                        h_final = absolute_h / image_height

                        out.write(f"{int(cls)} {cx_final:.6f} {cy_final:.6f} {w_final:.6f} {h_final:.6f}\n")

    print(f"Saved merged annotations to {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--tiles', required=True, help='Directory containing YOLO .txt files for tiles')
    parser.add_argument('--output', required=True, help='Path to output merged annotation file')
    parser.add_argument('--image_width', type=int, help='Original image width (optional)')
    parser.add_argument('--image_height', type=int, help='Original image height (optional)')
    args = parser.parse_args()

    merge_annotations(args.tiles, args.output, image_width=args.image_width, image_height=args.image_height)
