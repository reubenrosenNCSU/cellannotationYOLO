from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
# def seed_database(app):
#     with app.app_context():
#         from models import Weights, LabelSet

#         # Define default label sets
#         label_sets_data = [
#             {
#                 "id": "ls_madm",
#                 "name": "MADM Default Classes",
#                 "labels": ["neuron", "glia"]
#             },
#             {
#                 "id": "ls_sgn",
#                 "name": "SGN Default Classes",
#                 "labels": ["SGN"]
#             }
#         ]

#         for ls in label_sets_data:
#             if not LabelSet.query.get(ls["id"]):
#                 new_ls = LabelSet(
#                     id=ls["id"],
#                     name=ls["name"],
#                     labels=ls["labels"],
#                     user_id=None # Global
#                 )
#                 db.session.add(new_ls)
        
#         db.session.flush()

#         weights_data = [
#             {
#                 "id": "model_madm_default",
#                 "name": "MADM",
#                 "file_path": "snapshots/MADM_best_latest.pt",
#                 "label_set_id": "ls_madm"
#             },
#             {
#                 "id": "model_sgn_default",
#                 "name": "SGN",
#                 "file_path": "snapshots/SGN_best.pt",
#                 "label_set_id": "ls_sgn"
#             }
#         ]

#         for w in weights_data:
#             if not Weights.query.get(w["id"]):
#                 new_weight = Weights(
#                     id=w["id"],
#                     name=w["name"],
#                     file_path=w["file_path"],
#                     label_set_id=w["label_set_id"],
#                     user_id=None # Global
#                 )
#                 db.session.add(new_weight)

#         db.session.commit()
#         print("System defaults seeded successfully.")