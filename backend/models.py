from database import db
import datetime
import os

class User(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    
    def setup_filesystem(self):
        """Creates the persistent directory structure for a new user."""
        base_path = os.path.join('data', self.id)
        
        # Define your specific subfolder tree
        folders = [
            'images/original',
            'images/normalized',
            'images/cropped',
            'annotations',
            'models',
            'trainingsets',
            'runs'
        ]
        
        for folder in folders:
            os.makedirs(os.path.join(base_path, folder), exist_ok=True)
        
        return base_path

    # Helper to get specific paths later
    def get_path(self, sub_type):
        return os.path.join(self.id, sub_type)

class ImageRecord(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    original_filename = db.Column(db.String(255))
    original_extension = db.Column(db.String(16))
    
    # Paths to the physical files
    original_path = db.Column(db.String(512)) # The original image
    normalized_path = db.Column(db.String(512)) # The normalized PNG (If original is PNG, paths will be the same)
    # cropped_path = db.Column(db.String(512))
    
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    width = db.Column(db.Integer)
    height = db.Column(db.Integer)
    # crop_width = db.Column(db.Integer)
    # crop_height = db.Column(db.Integer)

    p_low = db.Column(db.Integer)
    p_high = db.Column(db.Integer)

class Annotation(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=False)
    original_filename = db.Column(db.String(255))

    file_path = db.Column(db.String(512))
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    image_id = db.Column(db.String(36), db.ForeignKey('image_record.id'))
    weights_id = db.Column(db.String(36), db.ForeignKey('weights.id'))
    

class LabelSet(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    name = db.Column(db.String(100))
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=True)
    
    labels = db.Column(db.JSON, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "labels": self.labels # This is your JSON list ['neuron', 'glia']
        }

class Weights(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id'), nullable=True)
    name = db.Column(db.String(100))
    file_path = db.Column(db.String(512))

    label_set_id = db.Column(db.String(36), db.ForeignKey('label_set.id'))

    label_set = db.relationship('LabelSet', backref='weights')
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "label_set_id": self.label_set_id,
            'label_set': self.label_set.to_dict() if self.label_set else None
        }