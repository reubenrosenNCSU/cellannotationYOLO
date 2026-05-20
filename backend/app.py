from werkzeug.utils import secure_filename  # ADD THIS AT TOP OF FILE
from flask import Flask, request, jsonify, send_from_directory, send_file, g
import os
from PIL import Image
import uuid
from flask_cors import CORS
import subprocess
import shutil
import h5py
from PIL import Image, ImageOps
import numpy as np
import zipfile
import io
import tempfile
import gc  # Garbage collector
import time  # For delays
from flask import session
from datetime import timedelta
from apscheduler.schedulers.background import BackgroundScheduler
import datetime
import atexit
from tensorflow.python.summary.summary_iterator import summary_iterator
import glob
import tensorflow as tf
from ultralytics import YOLO
from scripts.normalization import normalize_image
from scripts.sahi_detect import detect_to_yolo
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # Gets directory where app.py is
os.chdir(BASE_DIR)
from PIL import Image
import tifffile
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import or_
from sqlalchemy.orm.attributes import flag_modified
# Disable decompression bomb protection for large TIFF files
Image.MAX_IMAGE_PIXELS = None

data_folder = os.path.join(os.getcwd(), 'data')
app = Flask(__name__, static_folder=data_folder, static_url_path='/static')
CORS(app, supports_credentials=True)  # This will allow all domains to access your API

app.secret_key = 'test'  # Replace with a real secret key

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///biolab.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)  # Session expires after 24 hours

from database import db
from models import User, ImageRecord, Annotation, LabelSet, Weights

db.init_app(app)

@app.before_request
def ensure_user_session():
    if request.method == 'OPTIONS':
        return
    
    g.user = None
    user_id = session.get('user_id')
    if user_id:
        g.user = db.session.get(User, user_id)


def preprocess_image(image_path, upload_dir, detection_type, cell_diameter, p_low=None, p_high=None):
    """
    Standardizes any input image (TIFF/PNG/JPG) for the YOLO model.
    Returns: (path_to_detection_image, det_w, det_h, scaling_factor)
    """
    # 1. Generate unique IDs to prevent race conditions
    img_uuid = uuid.uuid4().hex[:8]
    base_name = os.path.splitext(os.path.basename(image_path))[0]

    # 2. Normalize (Detection-only copy)
    normalized_path = os.path.join(upload_dir, f"norm_{img_uuid}_{base_name}.png")
    normalize_image(image_path, normalized_path, p_low=p_low, p_high=p_high)

    # 3. Calculate Scaling
    target_diameter = 20.0 if detection_type == 'CD3' else 34.0
    scaling_factor = target_diameter / float(cell_diameter)
    
    with Image.open(normalized_path) as img:
        orig_w, orig_h = img.size
        
    if scaling_factor != 1.0:
        det_w = max(1, int(round(orig_w * scaling_factor)))
        det_h = max(1, int(round(orig_h * scaling_factor)))
        
        scaled_path = os.path.join(upload_dir, f"scaled_{img_uuid}_{base_name}.png")
        with Image.open(normalized_path) as img:
            scaled_img = img.resize((det_w, det_h), Image.Resampling.LANCZOS)
            scaled_img.save(scaled_path, format='PNG')
        
        # We can remove the intermediate normalized path to save space
        if os.path.exists(normalized_path): os.remove(normalized_path)
        return {
            "path": scaled_path,
            "det_w": det_w,
            "det_h": det_h,
            "scaling_factor": scaling_factor
        }
    
    return {
        "path": normalized_path,
        "det_w": orig_w,
        "det_h": orig_h,
        "scaling_factor": scaling_factor
    }


def detect_with_tiling(user_id, model_path, threshold=0.5): #Helper function for fine tuning testing on singular image
    """Tiling detection with normalization matching SGN/CD3 pipeline"""
    try:
        # Find uploaded image
        upload_dir = os.path.join('users', user_id, 'uploads')
        image_files = [f for f in os.listdir(upload_dir) 
                     if f.lower().endswith(('.tif', '.tiff', '.png', '.jpg', '.jpeg'))]
        if not image_files:
            return None, None, None, "No image found in uploads"
        
        image_path = os.path.join(upload_dir, image_files[0])
        
        # Create normalized version of FULL IMAGE
        normalized_path = os.path.join(upload_dir, 'normalized_temp.png')
        normalize_image(image_path, normalized_path)
        
        # Set up directories
        tiles_dir = os.path.join('users', user_id, 'images', 'tiles')
        output_txt_dir = os.path.join('users', user_id, 'images', 'tiles_output')
        merged_output_path = os.path.join('users', user_id, 'finaloutput', 'merged_detections.txt')
        
        os.makedirs(tiles_dir, exist_ok=True)
        os.makedirs(output_txt_dir, exist_ok=True)
        os.makedirs(os.path.dirname(merged_output_path), exist_ok=True)
        
        # Get original image dimensions
        with Image.open(image_path) as img:
            orig_width, orig_height = img.size
        
        # Split into tiles - using the same script as SGN/CD3
        subprocess.run([
            'python3', 'scripts/split_image.py',
            '--image', normalized_path,
            '--output', tiles_dir
        ], check=True)
        
        # Detect all tiles using GPU-efficient function
        detect_tiles_in_batch(tiles_dir, output_txt_dir, model_path, threshold)
        
        # Merge annotations - using the same script as SGN/CD3
        subprocess.run([
            'python3', 'scripts/merge_annotations.py',
            '--tiles', output_txt_dir,
            '--output', merged_output_path,
            '--image_width', str(orig_width),
            '--image_height', str(orig_height)
        ], check=True)
        
        # Read results
        with open(merged_output_path, 'r') as f:
            annotations = f.read()
        
        # Cleanup temporary files
        try:
            os.remove(normalized_path)
            shutil.rmtree(tiles_dir)
            shutil.rmtree(output_txt_dir)
        except:
            pass
        
        return annotations, orig_width, orig_height, None
        
    except Exception as e:
        # Cleanup on error
        try:
            os.remove(normalized_path)
            shutil.rmtree(tiles_dir, ignore_errors=True)
            shutil.rmtree(output_txt_dir, ignore_errors=True)
        except:
            pass
        return None, None, None, str(e)


def sanitize_box(x1, y1, x2, y2):
    """Ensure x1 <= x2 and y1 <= y2"""
    new_x1 = min(x1, x2)
    new_y1 = min(y1, y2)
    new_x2 = max(x1, x2)
    new_y2 = max(y1, y2)
    return new_x1, new_y1, new_x2, new_y2

def get_scalar_value(v):
    if hasattr(v, 'simple_value') and v.simple_value != 0.0:
        return v.simple_value
    elif hasattr(v, 'tensor'):
        try:
            t = tf.make_ndarray(v.tensor)
            return float(t)
        except Exception as e:
            print(f"[Error extracting tensor value for {v.tag}]: {e}")
            return None
    return None


@app.route('/cleanup', methods=['POST'])
def cleanup_files():
    try:
        user_id = session.get('user_id')
        if user_id:
            user_dir = os.path.join('users', user_id)
            if os.path.exists(user_dir):
                shutil.rmtree(user_dir)
                print(f"Cleaned up directory for user: {user_id}")
        return jsonify({'status': 'success'})
    except Exception as e:
        print(f"Cleanup error: {str(e)}")
        return jsonify({'status': 'error'}), 500



# Add these additional directories to clear
CLEANUP_DIRS = ['output', 'input', 'images']

# Create directories if they don't exist
def clear_folder(folder):
    for filename in os.listdir(folder):
        file_path = os.path.join(folder, filename)
        if os.path.isfile(file_path):
            os.remove(file_path)
        elif os.path.isdir(file_path):
            clear_folder(file_path)



def clear_uploaded_images():
    """Delete all files in the current user's upload folder"""
    user_id = session.get('user_id', 'default')  # Handle unauthenticated edge case
    user_upload_dir = os.path.join('users', user_id, 'uploads')
    for filename in os.listdir(user_upload_dir):
        file_path = os.path.join(user_upload_dir, filename)
        if os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                print(f"Error deleting {file_path}: {e}")
                

# *----------* User Endpoints *----------* #

@app.route("/api/hello")
def hello():
    return jsonify({"message": "Hello from Flask API"})

@app.route('/me', methods=['GET'])
def get_current_user():
    # If it's a completely new browser, establish the session cookie format
    if 'user_id' not in session:
        session.permanent = True
        session['user_id'] = str(uuid.uuid4())
    
    user_id = session['user_id']
    user = db.session.get(User, user_id)
    
    # If no user found, create new user
    if not user:
        try:
            user = User(id=user_id)
            db.session.add(user)
            user.setup_filesystem()
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": f"Failed to initialize session: {e}"}), 500

    return jsonify({
        "logged_in": user.username is not None,
        "user": {
            "id": user.id,
            "username": user.username
        }
    }), 200

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    
    if not username:
        return jsonify({"error": "Username is required"}), 400
        
    # Check if the username already exists in the system
    username_exists = User.query.filter_by(username=username).first()
    if username_exists:
        return jsonify({"error": "Username is already taken"}), 400
        
    # Get the temporary user record created by @app.before_request
    current_user_id = session.get('user_id')
    current_user = db.session.get(User, current_user_id)
    
    try:
        if current_user:
            if current_user.username:
                return jsonify({"message": "Already logged in"}), 200
            # Turn the temporary session into a permanent user account
            current_user.username = username
            db.session.commit()
            session['user_id'] = current_user_id
            session['username'] = username
            session['logged_in'] = True
            return jsonify({"message": "Registration successful! Session claimed."}), 201
        else:
            return jsonify({"error": "No active session found to register"}), 500
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    
    if not username:
        return jsonify({"error": "Username is required"}), 400
        
    # Look for the existing user
    existing_user = User.query.filter_by(username=username).first()
    if not existing_user:
        return jsonify({"error": "User not found"}), 404
        
    # Get the temporary session ID that was just generated for this visit
    current_user_id = session.get('user_id')
    
    # If they are somehow already logged in as this user, just return success
    if existing_user.id == current_user_id:
        return jsonify({"message": "Already logged in"}), 200
        
    # Discard and clean up the unneeded temporary session
    current_user = db.session.get(User, current_user_id)
    
    # Safety check: Only delete it if it's truly an unowned temporary session
    if current_user and current_user.username is None:
        # Delete temporary folder
        temp_user_path = os.path.join('data', current_user.get_path(''))
        print(temp_user_path)
        if os.path.exists(temp_user_path):
            try:
                shutil.rmtree(temp_user_path)
            except Exception as e:
                print(f"Error deleting temp folder {current_user_id}: {e}")
                
        # Delete temporary database row
        db.session.delete(current_user)
        db.session.commit()
        
    # Log user in by switching the session ID to their real account ID
    session['user_id'] = existing_user.id
    session['username'] = existing_user.username
    session['logged_in'] = True
    
    return jsonify({"message": "Login successful. Switched to existing session."}), 200

# *----------* Data Upload Endpoints *----------* #

@app.route('/upload', methods=['POST'])
def upload_file():
    if not g.user:
        return jsonify({"error": "No active session"}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        image_dir = g.user.get_path('images')

        # 1. Save Original
        full_filename = file.filename
        original_name = os.path.splitext(full_filename)[0]
        ext = os.path.splitext(full_filename)[1].lower()
        unique_id = str(uuid.uuid4())

        original_filename = f"{unique_id}_orig{ext}"
        original_path = os.path.join(image_dir, 'original', original_filename)
        original_save_path = os.path.join('data', original_path)
        file.save(original_save_path)

        # 2. Get Dimensions (Using PIL)
        with Image.open(original_save_path) as img:
            w, h = img.size

        # 3. Generate Normalized Preview
        normalized_filename = f"{unique_id}_norm.png"
        normalized_path = os.path.join(image_dir, 'normalized', normalized_filename)
        
        # Normalize image for training/display
        normalized_save_path = os.path.join('data', normalized_path)
        p_low, p_high = normalize_image(original_save_path, normalized_save_path)

        # 4. Create the Database Record
        new_image_record = ImageRecord(
            id=unique_id,
            user_id=g.user.id,
            original_filename=original_name,
            original_extension=ext,
            original_path=original_path,
            normalized_path=normalized_path,
            width=w,
            height=h,
            p_low=int(p_low) if p_low is not None else None,
            p_high=int(p_high) if p_high is not None else None
        )
        
        db.session.add(new_image_record)
        db.session.commit()

        # 5. Respond to React
        return jsonify({
            'image_id': unique_id,
            'converted_url': f'/static/{normalized_path}',
            'dimensions': [w, h],
            'p_low': p_low,
            'p_high': p_high
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

import random

@app.route('/upload-custom-model', methods=['POST'])
def upload_custom_model():
    if not g.user:
        return jsonify({"error": "No active session"}), 401

    try:
        model_file = request.files.get('model')
        model_name = request.form.get('name')
        model_type = request.form.get('type')
        
        if not model_file or not model_name:
            return jsonify({'error': 'Missing model file or name'}), 400
        
        model_dir = g.user.get_path('models')
        unique_id = str(uuid.uuid4())
        file_ext = os.path.splitext(model_file.filename)[1]
        model_filename = f'{unique_id}{file_ext}'
        full_path = os.path.join('data', model_dir, model_filename)
        model_file.save(full_path)

        target_label_set_id = None

        if model_type == 'MADM':
            target_model = Weights.query.filter_by(is_default=True, name='MADM').first()
            if target_model:
                target_label_set_id = target_model.label_set_id
            else:
                return jsonify({'error': f"MADM class labels not found"}), 500
        elif model_type == 'SGN':
            target_model = Weights.query.filter_by(is_default=True, name='SGN').first()
            if target_model:
                target_label_set_id = target_model.label_set_id
            else:
                return jsonify({'error': f"SGN class labels not found"}), 500
        else:
            try:
                # Get class names from custom model
                temp_model = YOLO(full_path)
                class_names = list(temp_model.names.values())
                formatted_labels = []
                for name in class_names:
                    random_color = f"#{random.randint(0, 0xFFFFFF):06x}"
                    formatted_labels.append({
                        "name": name,
                        "color": random_color
                    })
                # Create new label set for the model
                new_ls_id = str(uuid.uuid4())
                new_ls = LabelSet(
                    id=new_ls_id,
                    user_id=g.user.id,
                    labels=formatted_labels
                )
                db.session.add(new_ls)
                target_label_set_id = new_ls_id
            except Exception as e:
                return jsonify({'error': f"Could not parse YOLO classes: {str(e)}"}), 400
        new_weights = Weights(
            id=unique_id,
            user_id=g.user.id,
            name=model_name,
            file_path=full_path,
            label_set_id=target_label_set_id
        )

        db.session.add(new_weights)
        db.session.commit()

        # label_set = db.session.get(LabelSet, target_label_set_id)

        return jsonify({
            'message': 'Model uploaded successfully',
            'weights': new_weights.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        os.remove(full_path)
        print(f"Error uploading model: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/save-annotations', methods=['POST']) #TODO: Finish this!!!
def save_annotations():
    if not g.user:
        return jsonify({"error": "No active session"}), 401
    full_path = ''
    try:
        data = request.get_json()
        image_id = data['image_id']
        weights = data['model']
        annotations = data['annotations']
        annotation_dir = g.user.get_path('annotations')

        existing_annotation = Annotation.query.filter_by(
            image_id=image_id, 
            weights_id=weights['id'], 
            user_id=g.user.id
        ).first()

        if existing_annotation:
            unique_id = existing_annotation.id
            full_path = existing_annotation.file_path
            existing_annotation.annotations = list(annotations)
            existing_annotation.count = len(annotations)
            
            flag_modified(existing_annotation, "annotations")
        else:
            unique_id = str(uuid.uuid4())
            annotation_filename = f'{unique_id}.txt'
            full_path = os.path.join('data', annotation_dir, annotation_filename)
            
            new_annotation = Annotation(
                id=unique_id,
                user_id=g.user.id,
                file_path=full_path,
                image_id=image_id,
                weights_id=weights['id'],
                annotations=annotations,
                count=len(annotations)
            )
            db.session.add(new_annotation)

        db.session.commit()

        yolo_lines = []
        for ann in annotations:
            line = "{0} {1:.6f} {2:.6f} {3:.6f} {4:.6f}".format(
                ann['class'],
                ann['x'],
                ann['y'],
                ann['w'],
                ann['h']
            )
            yolo_lines.append(line)
        
        # Save annotation file
        with open(full_path, 'w') as f:
            f.write("\n".join(yolo_lines))

        return jsonify({'message': 'Success'}), 200

    except Exception as e:
        db.session.rollback()
        if os.path.exists(full_path):
            os.remove(full_path)
        print(f"Error saving annotations: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/save-color', methods=['POST'])
def save_color():
    if not g.user:
        return jsonify({"error": "No active session"}), 401
    
    data = request.get_json()
    if not data or 'model_id' not in data or 'index' not in data or 'color' not in data:
        return jsonify({"error": "Missing required fields"}), 400

    model_id = data['model_id']
    class_index = int(data['index'])
    new_color = data['color']

    try:
        # Find the model that belongs to this user
        model = Weights.query.filter_by(id=model_id, user_id=g.user.id).first()
        if not model or not model.label_set:
            return jsonify({"error": "Model or label set not found"}), 404

        # Access and mutate the JSON array property
        labels_copy = list(model.label_set.labels)
        
        if class_index < 0 or class_index >= len(labels_copy):
            return jsonify({"error": "Class index out of bounds"}), 400

        labels_copy[class_index]['color'] = new_color
        model.label_set.labels = labels_copy

        flag_modified(model.label_set, "labels")

        db.session.commit()
        return jsonify({"success": True, "message": "Color updated successfully"}), 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating label color: {e}")
        return jsonify({"error": "Internal server error"}), 500


# *----------* Data Download Endpoints *----------* #
    
@app.route('/export-annotations', methods=['POST'])
def export_annotations():
    if not g.user:
        return jsonify({"error": "No active session"}), 401

    try:
        # Get both CSV data and current image name from request
        data = request.json
        yolo_data = data['yolo_data']
        original_filename = data['original_filename']
        annotations_only = data.get('annotations_only', False)
        base_name = os.path.splitext(original_filename)[0]

        if annotations_only:
            txt_buffer = io.BytesIO(yolo_data.encode('utf-8'))
            txt_buffer.seek(0)
            return send_file(
                txt_buffer,
                mimetype='text/plain',
                as_attachment=True,
                download_name=f'{base_name}.txt'
            )

        user_upload_dir = os.path.join('users', g.user.id, 'uploads')

        # Get current TIFF path
        tiff_path = os.path.join(user_upload_dir, original_filename)
        if not os.path.exists(tiff_path):
            return jsonify({'error': 'Current TIFF file not found'}), 404

        # Create in-memory ZIP file
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            txt_filename = f"{base_name}.txt"
            zipf.writestr(txt_filename, yolo_data)
            zipf.write(tiff_path, os.path.basename(tiff_path))

        zip_buffer.seek(0)

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f'{base_name}_export.zip'
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/upload-cropped', methods=['POST'])
def upload_cropped_file():
    temp_crop_path = None
    try:
        # Get crop coordinates and original filename
        image_id = request.form['image_id']
        x = int(float(request.form['x']))
        y = int(float(request.form['y']))
        width = int(float(request.form['width']))
        height = int(float(request.form['height']))

        image_record = db.session.get(ImageRecord, image_id)
        if not image_record:
            return jsonify({'error': 'Image record not found'}), 404

        original_path = os.path.join('data', image_record.original_path)
        temp_crop_path = os.path.join(os.path.dirname(original_path), f"temp_{image_id}.tiff")

        # Load original image, crop, and overwrite
        img = tifffile.imread(original_path)
        padded_img = np.zeros_like(img)
        padded_img[y:y+height, x:x+width] = img[y:y+height, x:x+width]
        tifffile.imwrite(temp_crop_path, padded_img)

        # Create and normalize png conversion of cropped image
        output_path = os.path.join('data', image_record.normalized_path)
        p_low = image_record.p_low
        p_high = image_record.p_high
        normalize_image(temp_crop_path, output_path, p_low=p_low, p_high=p_high)

        existing_annotations = Annotation.query.filter_by(image_id=image_id).all()

        for annotation in existing_annotations:
            filtered = [
                ann for ann in annotation.annotations
                if (x <= ann['x'] <= x + width and
                    y <= ann['y'] <= y + height)
            ]

            annotation.annotations = filtered
            annotation.count = len(filtered)
            flag_modified(annotation, "annotations")

            # Overwrite physical annotation file
            yolo_lines = []
            for ann in filtered:
                yolo_lines.append("{0} {1:.6f} {2:.6f} {3:.6f} {4:.6f}".format(
                    ann['class'], ann['x'], ann['y'], ann['w'], ann['h']
                ))
            with open(annotation.file_path, 'w') as f:
                f.write("\n".join(yolo_lines))
        
        db.session.commit()
        
        return jsonify({
            'converted_url': f'/static/{image_record.normalized_path}',
            'original_name': image_record.original_filename
        })

    except Exception as e:
        db.session.rollback()
        print(f"Error in upload-cropped: {str(e)}")
        return jsonify({'error': f"Server error: {str(e)}"}), 500
    
    finally:
        if temp_crop_path and os.path.exists(temp_crop_path):
            os.remove(temp_crop_path)


# *----------* Data Retrieval Endpoints *----------* #

@app.route('/user-images', methods=['GET'])
def get_user_images():
    if not g.user:
        return jsonify({"error": "No active session"}), 401
    
    images = ImageRecord.query.filter_by(user_id=g.user.id).all()

    image_list = [
        {
            'id': img.id,
            'url': f"/static/{img.normalized_path}",
            'name': f'{img.original_filename}{img.original_extension}',
            'dimensions': [img.width, img.height],
            'p_low': img.p_low,
            'p_high': img.p_high
        } 
        for img in images
    ]

    return jsonify(image_list)

@app.route('/user-weights', methods=['GET'])
def get_user_weights():
    if not g.user:
        return jsonify({"error": "No active session"}), 401
    
    weights = Weights.query.filter(
        or_(Weights.user_id == g.user.id, Weights.user_id == None)
    ).all()

    return jsonify([wts.to_dict() for wts in weights])


@app.route('/load-annotations', methods=['POST'])
def load_annotations():
    if not g.user:
        return jsonify({"error": "No active session"}), 401
    
    data = request.get_json()
    if not data or 'image_id' not in data:
        return jsonify({"error": "Missing image_id in request body"}), 400

    image_id = data['image_id']
    annotations = Annotation.query.filter_by(
        user_id=g.user.id, 
        image_id=image_id
    ).all()

    results = []
    for ann in annotations:
        results.append({
            "weights_id": ann.weights_id,
            "annotations": ann.annotations,  # SQLAlchemy parses JSON columns automatically
            "count": ann.count
        })

    return jsonify({"annotations": results}), 200


# *----------* Data Removal Endpoints *----------* #

@app.route('/delete-image', methods=['DELETE'])
def delete_image():
    if not g.user:
        return jsonify({"error": "No active session"}), 401
    
    data = request.get_json()
    if not data or 'image_id' not in data:
        return jsonify({"error": "Missing image_id in request body"}), 400
    
    image_id = data['image_id']
    
    try:
        # Fetch  image and verify ownership
        image = ImageRecord.query.filter_by(id=image_id, user_id=g.user.id).first()
        if not image:
            return jsonify({"error": "Image not found or unauthorized"}), 404
        
        # Set paths for cleanup
        original_path = os.path.join('data', image.original_path)
        norm_path = os.path.join('data', image.normalized_path)
        annotation_paths = [ann.file_path for ann in image.annotations if ann.file_path]
        
        # Update database
        db.session.delete(image)
        db.session.commit()

        # Execute cleanup
        if os.path.exists(original_path):
            os.remove(original_path)

        if os.path.exists(norm_path):
            os.remove(norm_path)
        
        for ann_path in annotation_paths:
            if os.path.exists(ann_path):
                os.remove(ann_path)
        
        return jsonify({
            "success": True, 
            "message": "Image record successfully deleted"
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"CRITICAL: Failed to execute deletion routine for image {image_id}: {e}")
        return jsonify({"error": "Internal server error occurred during deletion structural sweep"}), 500

@app.route('/preview-tiff', methods=['POST']) #TODO: Remove
def preview_tiff():
    tmp_in_path = None
    tmp_out_path = None
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({'error': 'No file provided'}), 400

        with tempfile.NamedTemporaryFile(suffix='.tiff', delete=False) as tmp_in:
            file.save(tmp_in.name)
            tmp_in_path = tmp_in.name

        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_out:
            tmp_out_path = tmp_out.name

        normalize_image(tmp_in_path, tmp_out_path)

        with open(tmp_out_path, 'rb') as f:
            buf = io.BytesIO(f.read())

        return send_file(buf, mimetype='image/png')

    except Exception as e:
        return jsonify({'error': str(e)}), 500

    finally:
        if tmp_in_path and os.path.exists(tmp_in_path):
            os.remove(tmp_in_path)
        if tmp_out_path and os.path.exists(tmp_out_path):
            os.remove(tmp_out_path)


from scripts.detect_tiles import detect_tiles_in_batch


@app.route('/converted/<filename>') #TODO: Remove
def serve_converted(filename):
    user_id = session['user_id']
    converted_dir = os.path.join('users', user_id, 'converted')
    return send_from_directory(converted_dir, filename)

@app.route('/tile/<filename>/<int:tx>/<int:ty>/<int:tile_size>') #TODO: Update
def serve_tile(filename, tx, ty, tile_size):
    user_id = session['user_id']
    filename = secure_filename(filename)
    path = os.path.join('users', user_id, 'converted', filename)
    if not os.path.exists(path):
        return jsonify({'error': 'File not found'}), 404
    x = tx * tile_size
    y = ty * tile_size
    with Image.open(path) as img:
        w, h = img.size
        if x >= w or y >= h:
            return jsonify({'error': 'Tile out of bounds'}), 400
        tile = img.crop((x, y, min(x + tile_size, w), min(y + tile_size, h)))
    buf = io.BytesIO()
    tile.save(buf, 'PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

@app.route('/save-training-data', methods=['POST']) #TODO: Update
def save_training_data():
    user_id = session['user_id']
    try:
        # Generate unique ID
        unique_id = str(uuid.uuid4())

        img_filename = f"{unique_id}.png"
        lbl_filename = f"{unique_id}.txt"
        final_img_path = os.path.join('users', user_id, 'images', img_filename)
        final_lbl_path = os.path.join('users', user_id, 'snapshots', lbl_filename)
        
        # Get parameters from JSON
        data = request.get_json()
        original_filename = data['original_filename']
        annotations = data['annotations']
        
        # Path setup
        user_upload_dir = os.path.join('users', user_id, 'uploads')
        saved_data_dir = os.path.join('users', user_id, 'saved_data')
        saved_annotations_dir = os.path.join('users', user_id, 'saved_annotations')
        thumbnail_dir = os.path.join('users', user_id, 'thumbnails')

        os.makedirs(thumbnail_dir, exist_ok=True)

        # Copy ORIGINAL image (not the scaled version)
        original_path = os.path.join(user_upload_dir, original_filename)
        dest_filename = f"{unique_id}_{original_filename}"
        dest_path = os.path.join(saved_data_dir, dest_filename)
        
        # Always use the original file, never the scaled version
        if not os.path.exists(original_path):
            return jsonify({'error': 'Original image file not found'}), 404
        
        shutil.copy2(original_path, dest_path)

        thumbnail_filename = f"thumb_{unique_id}.jpg"
        thumbnail_path = os.path.join(thumbnail_dir, thumbnail_filename)
        normalize_image(original_path, thumbnail_path)
        
        # Class mapping
        CLASS_MAP = {
            'neuron': 0,
            'glia':   1,
            'SGN':    0,  # only used when training SGN model separately
            'CD3':    0,  # only used when training CD3 model separately
        }
                
        # Create YOLO annotations with consistent formatting (already in original coordinates)
        yolo_lines = []
        for ann in annotations:
            class_id = CLASS_MAP.get(ann['class_name'], 0)
            line = "{0} {1:.6f} {2:.6f} {3:.6f} {4:.6f}".format(
                class_id,
                float(ann['x_center']),
                float(ann['y_center']),
                float(ann['width_norm']),
                float(ann['height_norm'])
            )
            yolo_lines.append(line)
        
        # Save annotation file
        os.makedirs(saved_annotations_dir, exist_ok=True)
        annotation_filename = f"{unique_id}.txt"
        with open(os.path.join(saved_annotations_dir, annotation_filename), 'w') as f:
            f.write("\n".join(yolo_lines))
        
        print(f"Saved training data: {dest_filename} with {len(yolo_lines)} annotations in original coordinates")
        
        return jsonify({
            'message': 'Training data saved with original image and coordinates',
            'image_file': dest_filename,
            'thumbnail_file': thumbnail_filename,
            'annotation_file': annotation_filename,
            'annotation_count': len(yolo_lines)
        })
        
    except Exception as e:
        print(f"Error saving training data: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/get-all-training-data', methods=['GET'])  #TODO: Update/Move
def get_all_training_data():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    saved_annotations_dir = os.path.join('users', user_id, 'saved_annotations')
    # Use a helper to find images (since filenames have unique IDs)
    saved_data_dir = os.path.join('users', user_id, 'saved_data')
    
    results = []
    
    if os.path.exists(saved_annotations_dir):
        # Loop through text files in the annotation folder
        for ann_file in os.listdir(saved_annotations_dir):
            if ann_file.endswith('.txt'):
                unique_id = ann_file.replace('.txt', '')
                
                # Find the matching image (starts with the same unique_id)
                image_file = "Unknown"
                if os.path.exists(saved_data_dir):
                    for f in os.listdir(saved_data_dir):
                        if f.startswith(unique_id):
                            image_file = f
                            break
                
                results.append({
                    'imageName': image_file,
                    'annotationName': ann_file,
                    'thumbnailUrl': f"/api/preview/thumb_{unique_id}.jpg",
                    # Add any extra info if you want to parse the txt file for counts
                })
                
    return jsonify(results)
    

@app.route('/clear-training-data', methods=['POST'])  #TODO: Update
def clear_training_data():
    user_id = session['user_id']
    saved_data_dir = os.path.join('users', user_id, 'saved_data')
    saved_annotations_dir = os.path.join('users', user_id, 'saved_annotations')
    yolo_dataset_dir = os.path.join('users', user_id, 'yolo_dataset')  # New directory to clear
    thumbnail_dir = os.path.join('users', user_id, 'thumbnails')

    try:
        # Clear saved data
        clear_folder(saved_data_dir)
        
        # Clear saved annotations
        clear_folder(saved_annotations_dir)

        # Clear thumbnails
        clear_folder(thumbnail_dir)
        
        # Clear YOLO dataset if it exists
        if os.path.exists(yolo_dataset_dir):
            shutil.rmtree(yolo_dataset_dir, ignore_errors=True)
            print(f"Cleared YOLO dataset directory for user: {user_id}")
        
        return jsonify({'message': 'Training data cleared successfully'})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

import os

@app.route('/delete-training-data/<unique_id>', methods=['DELETE'])  #TODO: Update
def delete_training_data(unique_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        # Define the directories
        saved_data_dir = os.path.join('users', user_id, 'saved_data')
        saved_annotations_dir = os.path.join('users', user_id, 'saved_annotations')
        thumbnail_dir = os.path.join('users', user_id, 'thumbnails')

        # 1. Delete Annotation File (The easiest to find)
        annotation_count = 0
        ann_path = os.path.join(saved_annotations_dir, f"{unique_id}.txt")
        if os.path.exists(ann_path):
            with open(ann_path, 'r') as f:
                # Count only lines that aren't just whitespace
                lines = f.readlines()
                annotation_count = len([line for line in lines if line.strip()])
            
            # Now delete the file after counting
            os.remove(ann_path)

        # 2. Delete Thumbnail
        thumb_path = os.path.join(thumbnail_dir, f"thumb_{unique_id}.jpg")
        if os.path.exists(thumb_path):
            os.remove(thumb_path)

        # 3. Delete Original Image
        # Since the original image has the unique_id prepended (unique_id_filename.tif)
        # we look for the file that starts with the unique_id
        if os.path.exists(saved_data_dir):
            for filename in os.listdir(saved_data_dir):
                if filename.startswith(unique_id):
                    os.remove(os.path.join(saved_data_dir, filename))
                    break

        return jsonify({
            'message': f'Entry {unique_id} deleted successfully',
            'deleted_annotations': annotation_count
        }), 200

    except Exception as e:
        print(f"Error deleting data: {e}")
        return jsonify({'error': str(e)}), 500
    

@app.route('/download-training-data', methods=['GET'])  #TODO: Update
def download_training_data():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    # Define paths
    saved_data_dir = os.path.join('users', user_id, 'saved_data')
    saved_annotations_dir = os.path.join('users', user_id, 'saved_annotations')

    # Create an in-memory byte stream for the ZIP
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # 1. Add All Images
        if os.path.exists(saved_data_dir):
            for root, dirs, files in os.walk(saved_data_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    # Store images in an 'images/' folder inside the zip
                    zf.write(file_path, arcname=os.path.join('images', file))

        # 2. Add All Annotations
        if os.path.exists(saved_annotations_dir):
            for root, dirs, files in os.walk(saved_annotations_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    # Store txt files in a 'labels/' folder inside the zip
                    zf.write(file_path, arcname=os.path.join('labels', file))

    # Seek to the start of the stream so it can be read
    zip_buffer.seek(0)
    
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f'yolo_dataset_{user_id}.zip'
    )

@app.route('/detect-madm', methods=['POST'])  #TODO: Update
def detect_madm():
    user_id = session['user_id']
    threshold = float(request.json.get('threshold', 0.5))
    cell_diameter = float(request.json.get('cell_diameter', 34))
    upload_dir = os.path.join('users', user_id, 'uploads')
    merged_output_path = os.path.join('users', user_id, 'finaloutput', 'merged_madm.txt')
    os.makedirs(os.path.dirname(merged_output_path), exist_ok=True)

    try:
        files = [f for f in os.listdir(upload_dir) if f.lower().endswith(('.tif', '.tiff', '.png', '.jpg', '.jpeg'))]
        if not files:
            return jsonify({'error': 'No image found. Upload an image first.'}), 400

        image_path = os.path.join(upload_dir, files[0])
        model_path = 'snapshots/MADM_best_latest.pt'

        prep_data = preprocess_image(image_path, upload_dir, 'MADM', cell_diameter,
                                     p_low=session.get('norm_p_low'), p_high=session.get('norm_p_high'))

        with Image.open(image_path) as img:
            image_width, image_height = img.size

        final_annotation = detect_to_yolo(
            image_path=prep_data['path'],
            model_path=model_path,
            image_width=prep_data['det_w'],
            image_height=prep_data['det_h'],
            threshold=threshold,
        )

        with open(merged_output_path, 'w') as f:
            f.write(final_annotation)

        if os.path.exists(prep_data['path']):
            os.remove(prep_data['path'])

        return jsonify({
            "annotations": final_annotation,
            "image_width": image_width,
            "image_height": image_height
        })

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(error_details) # Check your terminal for this!
        return jsonify({'error': str(e), 'traceback': error_details}), 500


@app.route('/detect-sgn', methods=['POST']) #TODO: Update
def detect_sgn():
    user_id = session['user_id']
    threshold = float(request.json.get('threshold', 0.5))
    cell_diameter = float(request.json.get('cell_diameter', 34))
    upload_dir = os.path.join('users', user_id, 'uploads')
    merged_output_path = os.path.join('users', user_id, 'finaloutput', 'merged_sgn.txt')
    os.makedirs(os.path.dirname(merged_output_path), exist_ok=True)

    try:
        files = [f for f in os.listdir(upload_dir) if f.lower().endswith(('.tif', '.tiff', '.png', '.jpg', '.jpeg'))]
        if not files:
            return jsonify({'error': 'No image found. Upload an image first.'}), 400

        image_path = os.path.join(upload_dir, files[0])
        model_path = 'snapshots/SGN_best.pt'

        prep_data = preprocess_image(image_path, upload_dir, 'SGN', cell_diameter,
                                     p_low=session.get('norm_p_low'), p_high=session.get('norm_p_high'))

        with Image.open(image_path) as img:
            image_width, image_height = img.size

        final_annotation = detect_to_yolo(
            image_path=prep_data['path'],
            model_path=model_path,
            image_width=prep_data['det_w'],
            image_height=prep_data['det_h'],
            threshold=threshold,
        )

        with open(merged_output_path, 'w') as f:
            f.write(final_annotation)
        
        if os.path.exists(prep_data['path']):
            os.remove(prep_data['path'])

        return jsonify({
            "annotations": final_annotation,
            "image_width": image_width,
            "image_height": image_height
        })

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(error_details) # Check your terminal for this!
        return jsonify({'error': str(e), 'traceback': error_details}), 500


@app.route('/detect-cd3', methods=['POST']) #TODO: Update
def detect_cd3():
    user_id = session['user_id']
    threshold = float(request.json.get('threshold', 0.5))
    cell_diameter = float(request.json.get('cell_diameter', 34))
    upload_dir = os.path.join('users', user_id, 'uploads')
    merged_output_path = os.path.join('users', user_id, 'finaloutput', 'merged_cd3.txt')
    os.makedirs(os.path.dirname(merged_output_path), exist_ok=True)

    try:
        files = [f for f in os.listdir(upload_dir) if f.lower().endswith(('.tif', '.tiff', '.png', '.jpg', '.jpeg'))]
        if not files:
            return jsonify({'error': 'No image found. Upload an image first.'}), 400

        image_path = os.path.join(upload_dir, files[0])

        prep_data = preprocess_image(image_path, upload_dir, 'CD3', cell_diameter,
                                     p_low=session.get('norm_p_low'), p_high=session.get('norm_p_high'))

        with Image.open(image_path) as img:
            image_width, image_height = img.size

        final_annotation = detect_to_yolo(
            image_path=prep_data['path'],
            model_path=model_path,
            image_width=prep_data['det_w'],
            image_height=prep_data['det_h'],
            threshold=threshold,
        )

        with open(merged_output_path, 'w') as f:
            f.write(final_annotation)

        return jsonify({
            "annotations": final_annotation,
            "image_width": image_width,
            "image_height": image_height
        })

    except Exception as e:
        return jsonify({'error': f'CD3 detection failed: {str(e)}'}), 500


@app.route('/train-saved', methods=['POST']) #TODO: Update
def train_saved_data():
    import shutil
    import time
    import os
    from PIL import Image
    from ultralytics import YOLO
    from scripts.normalization import normalize_image
    import subprocess

    user_id       = session['user_id']
    snapshot_dir  = os.path.join('users', user_id, 'snapshots')
    yolo_base     = os.path.join('users', user_id, 'yolo_dataset')
    img_dir       = os.path.join(yolo_base, 'images')
    lbl_dir       = os.path.join(yolo_base, 'labels')

    try:
        # --- 1. Parse inputs ---
        num_images = int(request.form.get('num_images', '0'))
        model_type = request.form.get('model_type', 'SGN')
        epochs     = int(request.form.get('epochs', '20'))

        print(f"[DEBUG] Inputs → num_images={num_images}, model_type={model_type}, epochs={epochs}")

        # --- 2. Prep dataset dirs ---
        shutil.rmtree(yolo_base, ignore_errors=True)
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(lbl_dir, exist_ok=True)
        

        # --- 3. Copy SAVED DATA (uploaded manually) ---
        # --- 3. COPY SAVED DATA (uploaded images + annotations) ---
        print("[DEBUG] Copying saved training data...")

        saved_data_dir = os.path.join('users', user_id, 'saved_data')
        saved_annot_dir = os.path.join('users', user_id, 'saved_annotations')

        saved_imgs = [
            f for f in os.listdir(saved_data_dir)
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.tif', '.tiff'))
        ]

        print(f"[DEBUG] Found {len(saved_imgs)} saved images")

        for fname in saved_imgs:
            src_img = os.path.join(saved_data_dir, fname)
            dst_img = os.path.join(img_dir, fname)

            # Normalize to RGB
            try:
                if fname.lower().endswith(('.tif', '.tiff')):
                    temp_path = os.path.join(img_dir, f"temp_{fname}.png")
                    normalize_image(src_img, temp_path)
                    with Image.open(temp_path) as im:
                        if im.mode != 'RGB':
                            im = im.convert('RGB')
                        im.save(dst_img)
                    os.remove(temp_path)
                else:
                    with Image.open(src_img) as im:
                        if im.mode != 'RGB':
                            im = im.convert('RGB')
                        im.save(dst_img)
                print(f"[DEBUG] Copied image: {fname}")
            except Exception as e:
                print(f"[ERROR] Failed to copy image {fname}: {e}")
                continue

            # Copy corresponding annotation
            # Get the unique_id from the filename (format is "{unique_id}_{original_name}")
            unique_id = fname.split('_')[0]
            src_lbl = os.path.join(saved_annot_dir, f"{unique_id}.txt")
            dst_lbl = os.path.join(lbl_dir, os.path.splitext(fname)[0] + '.txt')

            if os.path.exists(src_lbl):
                shutil.copy2(src_lbl, dst_lbl)
                print(f"[DEBUG] Copied label: {src_lbl} to {dst_lbl}")
            else:
                print(f"[WARNING] Label missing for {fname} (expected {src_lbl})")


        # --- 4. Copy optional pre-train images + labels ---
        # Copy optional pre-train images + labels ---
        pre_dir = 'pre_train_MADM' if model_type == 'MADM' else 'pre_train_SGN' if model_type == 'SGN' else 'pre_train_CD3'
        labels_sub = os.path.join(pre_dir, 'yolo_labels')  # Changed from 'yolo_labels' to 'labels'
        print(f"[DEBUG] Using pre-train dir: {pre_dir}")

        all_imgs = sorted([
            f for f in os.listdir(pre_dir)
            if f.lower().endswith(('.png','.jpg','.jpeg','.tif','.tiff'))
        ])
        selected = all_imgs[:num_images]
        print(f"[DEBUG] Copying {len(selected)} pre-train images")

        for fname in selected:
            src_img = os.path.join(pre_dir, fname)
            dst_img = os.path.join(img_dir, fname)

            try:
                if fname.lower().endswith(('.tif', '.tiff')):
                    temp_path = os.path.join(img_dir, f"temp_{fname}.png")
                    normalize_image(src_img, temp_path)
                    with Image.open(temp_path) as im:
                        if im.mode != 'RGB':
                            im = im.convert('RGB')
                        im.save(dst_img)
                    os.remove(temp_path)
                else:
                    with Image.open(src_img) as im:
                        if im.mode != 'RGB':
                            im = im.convert('RGB')
                        im.save(dst_img)
                print(f"[DEBUG] Copied and normalized image {fname}")
            except Exception as e:
                print(f"[ERROR] image copy {fname}: {e}")
                continue  # Skip to next image if current one fails

            # Handle label copying more robustly
            base = os.path.splitext(fname)[0] + '.txt'
            
            # Check multiple possible label locations
            possible_label_locations = [
                os.path.join(labels_sub, base),  # Primary location
                os.path.join(pre_dir, base),     # Alternative location
                os.path.join(pre_dir, 'labels', base)  # Another common location
            ]
            
            label_copied = False
            for src_lbl in possible_label_locations:
                if os.path.exists(src_lbl):
                    dst_lbl = os.path.join(lbl_dir, base)
                    shutil.copy2(src_lbl, dst_lbl)
                    print(f"[DEBUG] Copied label from {src_lbl} to {dst_lbl}")
                    label_copied = True
                    break
            
            if not label_copied:
                print(f"[WARNING] Could not find label for {fname} in any of these locations:")
                for loc in possible_label_locations:
                    print(f"  - {loc}")

        # --- 5. Write data.yaml ---
               # --- 5. Write data.yaml ---
        if model_type == 'SGN':
            class_names = ["SGN"]
        elif model_type == 'CD3':
            # Hard-code CD3 at index 7 (with dummies at 0–6)
            class_names = [f"dummy{i}" for i in range(7)] + ["CD3"]
        elif model_type == 'MADM':
            class_names = ["neuron", "glia"]
        else:
            # Fallback for any unexpected model type
            return jsonify({'error': f'Unsupported model type for training: {model_type}'}), 400

        # Simplified and more robust nc calculation
        nc = len(class_names)
        
        yaml_path = os.path.join(yolo_base, 'data.yaml')
        with open(yaml_path, 'w') as f:
            f.write(f"path: {os.path.abspath(yolo_base)}\n")
            f.write("train: images\nval: images\n")
            f.write(f"nc: {nc}\n")
            f.write(f"names: {class_names}\n")

        print(f"[DEBUG] data.yaml written with nc={nc}, names={class_names}")

        # --- 6. Train model ---
        weights = 'snapshots/SGN_best.pt' if model_type == 'SGN' else 'snapshots/cd3_v3.pt' if model_type == 'CD3' else 'snapshots/MADM_best_latest.pt'
        run_name = f"run_{int(time.time())}"
        print(f"[DEBUG] Starting YOLO train, weights={weights}, run name={run_name}")
        import subprocess, sys

        train_cmd = [
            sys.executable, 'scripts/run_train.py',
            '--data',    yaml_path,
            '--weights', weights,
            '--epochs',  str(epochs),
            '--project', snapshot_dir,
            '--name',    run_name,
        ]

        print(f"[DEBUG] Launching training subprocess: {' '.join(train_cmd)}")
        result = subprocess.run(train_cmd, check=True, capture_output=False)

        best = os.path.join(snapshot_dir, run_name, 'weights', 'best.pt')
        time.sleep(3)

        if not os.path.exists(best):
            return jsonify({'error': 'best.pt not found after training'}), 500

        final = os.path.join(snapshot_dir, f"{model_type}_finetuned.pt")
        shutil.copy2(best, final)
        print(f"[DEBUG] Copied final model to {final}")

        # --- 7. Check sample count ---
        valid_samples = [
            f for f in os.listdir(img_dir)
            if os.path.exists(os.path.join(lbl_dir, os.path.splitext(f)[0] + '.txt'))
        ]
        if len(valid_samples) < 5:
            msg = f"Not enough data for K-Fold (need 5, got {len(valid_samples)})"
            print(f"[WARNING] {msg}")
            return jsonify({
                'model_url': f"/{final}",
                'kfold_results': msg
            })

        # --- 8. Run K-Fold ---
        kfold_dir = os.path.join(snapshot_dir, run_name, 'kfold')
        os.makedirs(kfold_dir, exist_ok=True)

        cmd = [
            sys.executable, 'scripts/kfold_train.py',  # ← inherits the correct env
            '--image_dir', img_dir,
            '--label_dir', lbl_dir,
            '--weights', best,
            '--epochs', str(epochs),
            '--output_dir', kfold_dir,
            '--nc', str(nc),
            '--names'
        ] + class_names

        print(f"[DEBUG] Running 5-fold validation...")
        subprocess.run(cmd, check=True)

        # --- 9. Read kfold_results.txt ---
        kfold_result_path = os.path.join(kfold_dir, 'kfold_results.txt')
        kfold_text = ""
        if os.path.exists(kfold_result_path):
            with open(kfold_result_path, 'r') as f:
                kfold_text = f.read()

        return jsonify({
            'model_url': f"/snapshots/{model_type}_finetuned.pt",
            'kfold_results': kfold_text
        })

    except Exception as e:
        print(f"[ERROR] /train-saved exception: {e}")
        return jsonify({'error': str(e)}), 500


    
@app.route('/detect-custom', methods=['POST']) #TODO: Update
def detect_custom():
    user_id = session['user_id']
    upload_dir = os.path.join('users', user_id, 'uploads')
    
    threshold = float(request.form.get('threshold', 0.5))
    cell_diameter = float(request.form.get('cell_diameter', 34))
    model_type = request.form.get('model_type', 'SGN')

    try:
        pt_file = request.files['pt_file']
        model_path = os.path.join('users', user_id, 'uploads', secure_filename(pt_file.filename))
        pt_file.save(model_path)
        
        files = [f for f in os.listdir(upload_dir) if f.lower().endswith(('.tif', '.tiff', '.png', '.jpg', '.jpeg'))]
        if not files:
            return jsonify({'error': 'No image found in uploads.'}), 400
        image_path = os.path.join(upload_dir, files[0])

        prep_data = preprocess_image(image_path, upload_dir, model_type, cell_diameter,
                                     p_low=session.get('norm_p_low'), p_high=session.get('norm_p_high'))

        with Image.open(image_path) as img:
            orig_w, orig_h = img.size
        
        annotations = detect_to_yolo(
            image_path=prep_data['path'],
            model_path=model_path,
            image_width=orig_w,
            image_height=orig_h,
            threshold=threshold
        )

        # Cleanup: Remove model and temporary normalized PNG
        for path in [model_path, prep_data['path']]:
            if os.path.exists(path):
                os.remove(path)

        return jsonify({
            "annotations": annotations,
            "image_width": orig_w,
            "image_height": orig_h
        })

    except Exception as e:
        return jsonify({'error': f"SAHI Detection failed: {str(e)}"}), 500

@app.route('/scale-image', methods=['POST']) #TODO: Remove
def scale_image():
    user_id = session['user_id']
    upload_dir = os.path.join('users', user_id, 'uploads')
    converted_dir = os.path.join('users', user_id, 'converted')
    try:
        diameter = float(request.form['diameter'])
        target_diameter = float(request.form.get('target_diameter', 34))
        original_filename = request.form['original_filename']
        
        # Always use the ORIGINAL image file, not a scaled version
        original_path = os.path.join(upload_dir, original_filename)
        if not os.path.exists(original_path):
            return jsonify({'error': 'Original image not found'}), 400

        with Image.open(original_path) as img:
            # Get ORIGINAL dimensions from the actual file
            original_width, original_height = img.size
            
            # Calculate scaling factor based on ORIGINAL dimensions
            scaling_factor = target_diameter / diameter
            
            # Calculate new dimensions
            new_width = int(original_width * scaling_factor)
            new_height = int(original_height * scaling_factor)
            
            # Create scaled version (don't overwrite original)
            base_name = os.path.splitext(original_filename)[0]
            scaled_filename = f"{base_name}_scaled.tiff"
            scaled_path = os.path.join(upload_dir, scaled_filename)
            
            resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            resized_img.save(scaled_path, format='TIFF', compression='tiff_deflate')
            
            # Create normalized preview from SCALED image
            unique_id = str(uuid.uuid4())
            output_filename = f"{unique_id}.png"
            output_path = os.path.join(converted_dir, output_filename)
            normalize_image(scaled_path, output_path)

            # Store scaling info in session
            session['current_scaling_factor'] = scaling_factor
            session['current_scaled_filename'] = scaled_filename
            session['original_dimensions'] = (original_width, original_height)
            session['current_dimensions'] = (new_width, new_height)

            return jsonify({
                'converted_url': f'/converted/{output_filename}',
                'scaling_factor': scaling_factor,
                'new_width': new_width,
                'new_height': new_height,
                'scaled_filename': scaled_filename
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route('/detect-finetuned', methods=['POST']) #TODO: Update
def detect_finetuned():
    user_id = session['user_id']
    try:
        model_type = request.json.get('model_type', 'SGN')
        threshold = float(request.json.get('threshold', 0.5))
        cell_diameter = float(request.json.get('cell_diameter', 34))

        model_path = os.path.join('users', user_id, 'snapshots', f'{model_type}_finetuned.pt')
        if not os.path.exists(model_path):
            return jsonify({'error': f'No fine-tuned {model_type} model found. Train one first.'}), 400

        upload_dir = os.path.join('users', user_id, 'uploads')
        files = [f for f in os.listdir(upload_dir) if f.lower().endswith(('.tif', '.tiff', '.png', '.jpg', '.jpeg'))]
        if not files:
            return jsonify({'error': 'No image found. Upload an image first.'}), 400

        image_path = os.path.join(upload_dir, files[0])

        prep_data = preprocess_image(image_path, upload_dir, model_type, cell_diameter,
                                     p_low=session.get('norm_p_low'), p_high=session.get('norm_p_high'))

        with Image.open(image_path) as img:
            image_width, image_height = img.size

        final_annotation = detect_to_yolo(
            image_path=prep_data['path'],
            model_path=model_path,
            image_width=prep_data['det_w'],
            image_height=prep_data['det_h'],
            threshold=threshold,
        )

        if os.path.exists(prep_data['path']):
            os.remove(prep_data['path'])

        return jsonify({
            "annotations": final_annotation,
            "image_width": image_width,
            "image_height": image_height
        })

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(error_details)
        return jsonify({'error': str(e), 'traceback': error_details}), 500


@app.route('/batch-detect', methods=['POST']) #TODO: Update
def batch_detect():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'No active user session'}), 400

    upload_dir = os.path.join('users', user_id, 'uploads')
    final_dir = os.path.join('users', user_id, 'finaloutput')

    try:
        # 1) Save uploaded files into a temp per-user directory
        batch_dir = os.path.join('users', user_id, 'batch_temp')
        os.makedirs(batch_dir, exist_ok=True)
        # clear existing files
        clear_folder(batch_dir)

        uploaded_files = request.files.getlist('images')
        if not uploaded_files:
            return jsonify({'error': 'No images uploaded for batch.'}), 400

        for f in uploaded_files:
            fname = secure_filename(f.filename)
            if not fname:
                continue
            f.save(os.path.join(batch_dir, fname))

        # 2) Read form params
        detection_type = request.form.get('detection_type', 'SGN')
        threshold = float(request.form.get('threshold', 0.5))
        cell_diameter = float(request.form.get('cell_diameter', 34))
        custom_model_file = request.files.get('custom_model')

        model_path = None
        if detection_type == 'custom' and custom_model_file:
            cp = os.path.join(batch_dir, 'custom_model.pt')
            custom_model_file.save(cp)
            model_path = cp

        # 3) Process images one-by-one and collect results
        results = []
        model_map = {
            'SGN': 'snapshots/SGN_best.pt',
            'MADM': 'snapshots/MADM_best_latest.pt',
            'CD3': 'snapshots/cd3_v3.pt'
        }
        active_model = model_path or model_map.get(detection_type)

        for fname in sorted(os.listdir(batch_dir)):
            if fname == 'custom_model.pt':
                continue
            input_path = os.path.join(batch_dir, fname)
            if not os.path.isfile(input_path):
                continue
            if not fname.lower().endswith(('.tif', '.tiff', '.png', '.jpg', '.jpeg')):
                continue

            try:
                # 1. Preprocess: handles 16-bit to 8-bit normalization and physical scaling
                prep_data = preprocess_image(input_path, upload_dir, detection_type, cell_diameter)
                
                # 2. SAHI Detection: replaces the split/detect/merge subprocesses
                final_annotation = detect_to_yolo(
                    image_path=prep_data['path'],
                    model_path=active_model,
                    image_width=prep_data['det_w'],
                    image_height=prep_data['det_h'],
                    threshold=threshold
                )

                # 3. Create the final "Safe" TIFF (Scaled but NOT normalized)
                base_name = os.path.splitext(fname)[0]
                out_uuid = uuid.uuid4().hex[:8]
                out_base = f"{base_name}_scaled_{int(cell_diameter)}_{out_uuid}"
                
                final_img_path = os.path.join(final_dir, out_base + ".png")
                final_txt_path = os.path.join(final_dir, out_base + ".txt")

                import shutil
                if os.path.exists(prep_data['path']):
                    shutil.move(prep_data['path'], final_img_path)

                with open(final_txt_path, 'w') as f:
                    f.write(final_annotation)

                # Clean up the temporary normalized detection PNG
                if os.path.exists(prep_data['path']):
                    os.remove(prep_data['path'])

                results.append({
                    'success': True,
                    'original_filename': fname,
                    'tiff_path': final_img_path,
                    'txt_path': final_txt_path,
                    'det_width': prep_data['det_w'],
                    'det_height': prep_data['det_h']
                })

            except Exception as e:
                results.append({
                    'success': False,
                    'original_filename': fname,
                    'error': str(e)
                })
            # res = batch_process_image_yolo(user_id, input_path, detection_type, threshold, model_path=model_path, cell_diameter=cell_diameter)
            # # add original filename for diagnostics
            # res['original_filename'] = fname
            # results.append(res)

        # 4) Build ZIP with exact pairs: tiff + matching .txt (or an error file for failures)
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for res in results:
                orig = res.get('original_filename', 'unknown')
                if not res.get('success'):
                    err_name = os.path.splitext(orig)[0] + '_ERROR.txt'
                    zf.writestr(err_name, res.get('error', 'processing error'))
                    continue

                tiff_path = res.get('tiff_path')
                txt_path = res.get('txt_path')

                # defensive existence checks
                if tiff_path and os.path.exists(tiff_path):
                    zf.write(tiff_path, os.path.basename(tiff_path))
                else:
                    # include a small note if the TIFF is missing
                    zf.writestr(os.path.splitext(orig)[0] + '_MISSING_TIFF.txt', f"Missing TIFF for {orig}")

                if txt_path and os.path.exists(txt_path):
                    zf.write(txt_path, os.path.basename(txt_path))
                else:
                    zf.writestr(os.path.splitext(orig)[0] + '_MISSING_TXT.txt', f"Missing TXT for {orig}")

        zip_buffer.seek(0)

        # 5) Cleanup temp upload folder (keep finaloutput intact)
        try:
            shutil.rmtree(batch_dir, ignore_errors=True)
        except Exception:
            pass

        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name='batch_results.zip'
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500

    


@app.route('/snapshots/<path:filename>') #TODO: Remove
def serve_snapshot(filename):
    user_id = session['user_id']
    snapshot_dir = os.path.join('users', user_id, 'snapshots')
    return send_from_directory(snapshot_dir, filename)

@app.route('/api/preview/<filename>') #TODO: Remove
def serve_thumbnail(filename):
    user_id = session['user_id']
    
    directory = os.path.join('users', str(user_id), 'thumbnails')
    
    print(f"Looking for thumbnail in: {directory}/{filename}") # Debug print
    
    return send_from_directory(directory, filename)

@app.route('/api/images/<filename>') #TODO: Remove
def serve_original_image(filename):
    user_id = session.get('user_id')
    directory = os.path.join('users', user_id, 'saved_data')
    return send_from_directory(directory, filename)

@app.route('/api/annotations/<filename>') #TODO: Remove
def serve_annotation_file(filename):
    user_id = session.get('user_id')
    directory = os.path.join('users', user_id, 'saved_annotations')
    return send_from_directory(directory, filename)


from flask import jsonify, session
from tensorflow.python.summary.summary_iterator import summary_iterator
import os
import glob

@app.route('/events-data', methods=['GET']) #TODO: Update
def events_data():
    user_id = session.get('user_id')
    base_path = os.path.join('users', user_id, 'snapshots')
    run_directories = glob.glob(os.path.join(base_path, 'run_*'))
    if not run_directories:
        return jsonify({'error': f'No runs found for current session'}), 404
    run_directories.sort()
    log_dir = run_directories[-1]

    if not os.path.exists(log_dir):
        return jsonify({'error': f'Log dir not found: {log_dir}'}), 404

    # Find all event files directly in train/
    event_files = glob.glob(os.path.join(log_dir, 'events.out.tfevents.*'))
    # Only pick files older than 5 seconds (to avoid reading during flush)
    now = time.time()
    event_files = [f for f in event_files if now - os.path.getmtime(f) > 5]
    if not event_files:
        return jsonify({'error': 'No event files found in train/'}), 404

    # Pick the newest one
    event_files.sort(key=os.path.getmtime, reverse=True)
    latest = event_files[0]
    print(f"[events-data] ✅ Reading from: {latest}")

    scalars = {}
    for e in summary_iterator(latest):
        if not e.summary:
            continue
        for v in e.summary.value:
            val = get_scalar_value(v)
            if val is not None:
                print(f"✅ Tag: {v.tag}, value: {val}")
                scalars.setdefault(v.tag, []).append({
                    'step': e.step,
                    'wall_time': e.wall_time,
                    'value': val
                })


    if not scalars:
        return jsonify({'error': 'No scalar values found'}), 404

    return jsonify(scalars)




def delete_expired_sessions(): #TODO: Update
    now = datetime.datetime.utcnow()  # Use UTC time
    users_dir = 'users'
    for user_id in os.listdir(users_dir):
        user_path = os.path.join(users_dir, user_id)
        if os.path.isdir(user_path):
            try:
                mod_time = datetime.datetime.utcfromtimestamp(os.path.getmtime(user_path))
                if (now - mod_time).total_seconds() > 86400:
                    shutil.rmtree(user_path)
                    print(f"Cleaned expired session: {user_id}")
            except Exception as e:
                print(f"Error cleaning {user_id}: {str(e)}")
# Initialize scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(func=delete_expired_sessions, trigger="interval", hours=24)
scheduler.start()

# Shut down the scheduler when exiting the app
atexit.register(lambda: scheduler.shutdown())


if __name__ == '__main__':
    print('starting application')
    with app.app_context():
        db.create_all()
        #seed_database(app)
        print("Database initialized")
    app.run(host='0.0.0.0', port=5002, debug=True)