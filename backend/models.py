from database import db
import datetime
import os
import uuid

class User(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    username = db.Column(db.String, unique=True, nullable=True)

    images = db.relationship('ImageRecord', cascade='all, delete-orphan', backref='user')
    annotations = db.relationship('Annotation', cascade='all, delete-orphan', backref='user')
    label_sets = db.relationship('LabelSet', cascade='all, delete-orphan', backref='user')
    weights = db.relationship('Weights', cascade='all, delete-orphan', backref='user')
    
    def setup_filesystem(self):
        '''Creates the persistent directory structure for a new user.'''
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

        default_models = [
            {
                'weights_name': 'MADM',
                'filepath': 'snapshots/MADM_best_latest.pt',
                'labels': [
                    {'name': 'neuron', 'color': '#60A5FA'}, 
                    {'name': 'glia', 'color': '#F59E0B'}
                ]
            },
            {
                'weights_name': 'SGN',
                'filepath': 'snapshots/SGN_best.pt',
                'labels': [{'name': 'SGN', 'color': '#CA00BC'}]
            }
        ]

        for entry in default_models:
            lsid = str(uuid.uuid4())
            new_label_set = LabelSet(
                id=lsid,
                user_id=self.id,
                labels=entry['labels']
            )
            new_weights = Weights(
                id=str(uuid.uuid4()),
                user_id=self.id,
                name=entry['weights_name'],
                file_path=entry['filepath'],
                is_default=True,
                label_set_id=lsid
            )
            db.session.add(new_label_set)
            db.session.add(new_weights)

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f'Error initializing default models: {e}')
        
        return base_path

    # Helper to get specific paths later
    def get_path(self, sub_type):
        return os.path.join(self.id, sub_type)



class ImageRecord(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    original_filename = db.Column(db.String(255))
    original_extension = db.Column(db.String(16))
    
    # Paths to the physical files
    original_path = db.Column(db.String(512)) # Original image
    normalized_path = db.Column(db.String(512)) # Normalized PNG
    # cropped_path = db.Column(db.String(512))
    
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    width = db.Column(db.Integer)
    height = db.Column(db.Integer)
    # crop_width = db.Column(db.Integer)
    # crop_height = db.Column(db.Integer)

    p_low = db.Column(db.Integer)
    p_high = db.Column(db.Integer)

    annotations = db.relationship('Annotation', cascade='all, delete-orphan', backref='image_record')



class Annotation(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)

    file_path = db.Column(db.String(512))
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    image_id = db.Column(db.String(36), db.ForeignKey('image_record.id', ondelete='CASCADE'))
    weights_id = db.Column(db.String(36), db.ForeignKey('weights.id'), nullable=False)
    
    annotations = db.Column(db.JSON, nullable=False)
    count = db.Column(db.Integer, default=0)
    threshold = db.Column(db.Float)
    cell_diameter = db.Column(db.Integer)



class LabelSet(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    labels = db.Column(db.JSON, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'labels': self.labels
        }



class Weights(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('user.id', ondelete='CASCADE'), nullable=True)
    name = db.Column(db.String(100))
    file_path = db.Column(db.String(512))
    is_default = db.Column(db.Boolean, default=False)

    label_set_id = db.Column(db.String(36), db.ForeignKey('label_set.id'), nullable=False)

    label_set = db.relationship('LabelSet', backref='weight_parent',)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'label_set': self.label_set.to_dict() if self.label_set else None
        }