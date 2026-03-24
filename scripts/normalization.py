# normalization.py - for frontend
import numpy as np
from PIL import Image
import tifffile

def normalize_image(input_path, output_path, low_percentile=1, high_percentile=99, 
                    p_low=None, p_high=None):
    """
    Normalize an image file. If p_low/p_high are provided, use those bounds
    instead of recomputing from the current image (ensures consistency across crops).
    """
    try:
        if input_path.lower().endswith(('.tif', '.tiff')):
            img_array = tifffile.imread(input_path)
        else:
            img = Image.open(input_path)
            img_array = np.array(img)

        if img_array.dtype == np.uint8:
            if len(img_array.shape) == 2:
                img_array = np.stack((img_array,) * 3, axis=-1)
            result = Image.fromarray(img_array)
        elif np.issubdtype(img_array.dtype, np.integer):
            # Use provided bounds, or compute from this image
            if p_low is None:
                p_low = np.percentile(img_array, low_percentile)
            if p_high is None:
                p_high = np.percentile(img_array, high_percentile)

            if p_high <= p_low:
                normalized = np.zeros_like(img_array, dtype=np.uint8)
            else:
                clipped = np.clip(img_array, p_low, p_high)
                normalized = ((clipped - p_low) * 255.0 / (p_high - p_low)).astype(np.uint8)

            if len(normalized.shape) == 2:
                normalized = np.stack((normalized,) * 3, axis=-1)
            result = Image.fromarray(normalized)
        else:
            img = Image.open(input_path)
            result = img.convert('RGB') if img.mode != 'RGB' else img

        result.save(output_path)
        return p_low, p_high  # Return bounds so caller can store them

    except Exception as e:
        print(f"Error normalizing image: {str(e)}")
        try:
            img = Image.open(input_path)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(output_path)
        except:
            pass
        return None, None