from flask import Flask
from flask_cors import CORS
import os
import logging

# Optional dotenv
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("⚠️ python-dotenv not installed")

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

app = Flask(__name__)

# CORS config - Allow all origins for development (restrict in production)
# In production, set FRONTEND_URL environment variable
frontend_url = os.getenv("FRONTEND_URL", None)
if frontend_url:
    # Production: specific origin
    CORS(app, resources={
        r"/api/*": {
            "origins": [frontend_url],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Accept"],
            "supports_credentials": False
        }
    })
else:
    # Development: allow all localhost origins
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",  # Allow all origins in development
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "Accept"],
            "supports_credentials": False
        }
    })

# Import routes
from routes.audio import audio_bp
from routes.analyze import analyze_bp
from routes.pdf import pdf_bp

# Register blueprints
app.register_blueprint(audio_bp, url_prefix="/api/audio")
app.register_blueprint(analyze_bp, url_prefix="/api")
app.register_blueprint(pdf_bp, url_prefix="/api")

@app.route("/api/health", methods=["GET"])
def health_check():
    return {"status": "ok", "message": "Backend running"}, 200

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    logging.info(f"🚀 Server running on port {port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
