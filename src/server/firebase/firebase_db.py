import firebase_admin
from firebase_admin import credentials
from google.cloud import firestore
import os

# Path to your service account JSON file
cred_path = os.path.join(os.path.dirname(__file__), "firebase-key.json")


# Check if Firebase is already initialized to avoid errors during reloads
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    app = firebase_admin.initialize_app(cred)
else:
    app = firebase_admin.get_app()

# Get the Firestore client for the specific database 'rythmicfolio'
db = firestore.Client(
    project=app.project_id,
    credentials=app.credential.get_credential(),
    database='rythmicfolio'
)


print(f"Connected to Firestore DB: {db._database} in project {db.project}")
